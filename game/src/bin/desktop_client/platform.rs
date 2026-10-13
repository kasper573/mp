use std::collections::BTreeMap;
use std::future::Future;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc::{Receiver, Sender, TryRecvError, channel};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, SystemTime};

use bevy::window::Window;
use game::core::content::store::ContentStore;
use game::core::platform::{FetchFailure, LocalFuture, Platform, ServerSocket};
use game::core::time::{LocalClock, Seconds, UnixMillis};
use tungstenite::Message;
use tungstenite::stream::MaybeTlsStream;

use crate::store::FileStore;

const SETTINGS: &str = "settings.json";
const CACHE: &str = "cache";

pub struct DesktopPlatform {
    profile: PathBuf,
    agent: ureq::Agent,
}

impl DesktopPlatform {
    pub fn new(profile: PathBuf) -> DesktopPlatform {
        // TLS against the OS trust store, so a locally trusted CA works like any public one; a
        // refused status is a reply to read, not a transport failure.
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(30)))
            .http_status_as_error(false)
            .tls_config(
                ureq::tls::TlsConfig::builder()
                    .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                    .build(),
            )
            .build();
        DesktopPlatform {
            profile,
            agent: ureq::Agent::new_with_config(config),
        }
    }

    fn settings(&self) -> BTreeMap<String, String> {
        std::fs::read_to_string(self.profile.join(SETTINGS))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }
}

impl Platform for DesktopPlatform {
    fn load(&self, key: &str) -> Option<String> {
        self.settings().remove(key)
    }

    fn save(&self, key: &str, value: &str) {
        let mut settings = self.settings();
        settings.insert(key.to_owned(), value.to_owned());
        let text = serde_json::to_string_pretty(&settings).expect("settings serialize");
        if std::fs::create_dir_all(&self.profile).is_ok()
            && let Err(error) = std::fs::write(self.profile.join(SETTINGS), text)
        {
            eprintln!("settings not saved: {error}");
        }
    }

    fn sync_window(&self, _window: &mut Window) {}

    fn get(&self, url: String) -> LocalFuture<Result<Vec<u8>, FetchFailure>> {
        let agent = self.agent.clone();
        offload(move || {
            let mut response = agent
                .get(&url)
                .call()
                .map_err(|error| FetchFailure::Transport(error.to_string()))?;
            refused(&mut response)?;
            response
                .body_mut()
                .with_config()
                .limit(u64::MAX)
                .read_to_vec()
                .map_err(|error| FetchFailure::Transport(error.to_string()))
        })
    }

    fn post(
        &self,
        url: String,
        authorization: String,
        body: String,
    ) -> LocalFuture<Result<String, FetchFailure>> {
        let agent = self.agent.clone();
        offload(move || {
            let mut response = agent
                .post(&url)
                .header("Authorization", &authorization)
                .header("Content-Type", "application/json")
                .send(body)
                .map_err(|error| FetchFailure::Transport(error.to_string()))?;
            refused(&mut response)?;
            response
                .body_mut()
                .read_to_string()
                .map_err(|error| FetchFailure::Transport(error.to_string()))
        })
    }

    fn content_store(&self) -> Box<dyn ContentStore> {
        Box::new(FileStore::new(self.profile.join(CACHE)))
    }

    fn connect(&self, url: &str) -> Box<dyn ServerSocket> {
        Box::new(ThreadSocket::open(url))
    }

    fn local_clock(&self) -> LocalClock {
        let since_epoch = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default();
        LocalClock {
            now: UnixMillis(since_epoch.as_millis() as u64),
            utc_offset: Seconds(chrono::Local::now().offset().local_minus_utc() as f32),
        }
    }

    fn announce(&self, status: &str) {
        eprintln!("{status}");
    }

    fn relaunch(&self, build: &str) -> bool {
        eprintln!("the server runs build {build}; start a matching desktop-client");
        false
    }
}

fn refused(response: &mut ureq::http::Response<ureq::Body>) -> Result<(), FetchFailure> {
    if response.status().is_success() {
        return Ok(());
    }
    Err(FetchFailure::Status {
        status: response.status().as_u16(),
        body: response.body_mut().read_to_string().unwrap_or_default(),
    })
}

fn offload<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> LocalFuture<T> {
    let shared: Arc<Mutex<Offloaded<T>>> = Arc::default();
    std::thread::spawn({
        let shared = shared.clone();
        move || {
            let result = work();
            let mut slot = shared.lock().expect("offload lock");
            slot.result = Some(result);
            if let Some(waker) = slot.waker.take() {
                waker.wake();
            }
        }
    });
    Box::pin(OffloadFuture(shared))
}

struct Offloaded<T> {
    result: Option<T>,
    waker: Option<Waker>,
}

impl<T> Default for Offloaded<T> {
    fn default() -> Offloaded<T> {
        Offloaded {
            result: None,
            waker: None,
        }
    }
}

struct OffloadFuture<T>(Arc<Mutex<Offloaded<T>>>);

impl<T> Future for OffloadFuture<T> {
    type Output = T;

    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<T> {
        let mut slot = self.0.lock().expect("offload lock");
        match slot.result.take() {
            Some(result) => Poll::Ready(result),
            None => {
                slot.waker = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
}

const CONNECTING: u8 = 0;
const OPEN: u8 = 1;
const CLOSED: u8 = 2;

struct ThreadSocket {
    incoming: Mutex<Receiver<Vec<u8>>>,
    outgoing: Sender<Vec<u8>>,
    state: Arc<AtomicU8>,
}

impl ThreadSocket {
    fn open(url: &str) -> ThreadSocket {
        let (incoming_tx, incoming) = channel();
        let (outgoing, outgoing_rx) = channel();
        let state = Arc::new(AtomicU8::new(CONNECTING));
        std::thread::spawn({
            let state = state.clone();
            let url = url.to_owned();
            move || drive(&url, &state, &incoming_tx, &outgoing_rx)
        });
        ThreadSocket {
            incoming: Mutex::new(incoming),
            outgoing,
            state,
        }
    }
}

impl ServerSocket for ThreadSocket {
    fn recv(&self) -> Option<Vec<u8>> {
        self.incoming.lock().expect("socket lock").try_recv().ok()
    }

    fn send(&self, packet: &[u8]) {
        if self.state.load(Ordering::Relaxed) == OPEN {
            let _ = self.outgoing.send(packet.to_vec());
        }
    }

    fn is_open(&self) -> bool {
        self.state.load(Ordering::Relaxed) == OPEN
    }

    fn is_closed(&self) -> bool {
        self.state.load(Ordering::Relaxed) == CLOSED
    }
}

fn drive(url: &str, state: &AtomicU8, incoming: &Sender<Vec<u8>>, outgoing: &Receiver<Vec<u8>>) {
    let Ok((mut ws, _)) = tungstenite::connect(url).map_err(|error| eprintln!("{url}: {error}"))
    else {
        state.store(CLOSED, Ordering::Relaxed);
        return;
    };
    let nonblocking = match ws.get_ref() {
        MaybeTlsStream::Plain(tcp) => tcp.set_nonblocking(true),
        MaybeTlsStream::Rustls(stream) => stream.sock.set_nonblocking(true),
        _ => Ok(()),
    };
    if nonblocking.is_err() {
        state.store(CLOSED, Ordering::Relaxed);
        return;
    }
    state.store(OPEN, Ordering::Relaxed);
    let closed = || state.store(CLOSED, Ordering::Relaxed);
    loop {
        loop {
            match outgoing.try_recv() {
                Ok(packet) => match ws.send(Message::Binary(packet.into())) {
                    Ok(()) => {}
                    Err(tungstenite::Error::Io(error)) if error.kind() == ErrorKind::WouldBlock => {
                    }
                    Err(_) => return closed(),
                },
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return closed(),
            }
        }
        let _ = ws.flush();
        match ws.read() {
            Ok(Message::Binary(data)) => {
                if incoming.send(data.to_vec()).is_err() {
                    return closed();
                }
            }
            Ok(Message::Close(_)) => return closed(),
            Ok(_) => {}
            Err(tungstenite::Error::Io(error)) if error.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(1));
            }
            Err(_) => return closed(),
        }
    }
}
