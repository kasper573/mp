use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;

use engine::systems::account::Identity;
use futures_util::{SinkExt, StreamExt};
use renet2::RenetServer;
use serde::Deserialize;
use tokio::net::{TcpListener, TcpStream};
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;

use crate::Sessions;

/// renet2's core has no connection timeout, so we keep WebSocket connections honest at the transport
/// layer: ping every `PING_INTERVAL`, and reap a connection that sends nothing (not even a pong) for
/// `IDLE_TIMEOUT`. Without this an unclean drop — a backgrounded mobile tab, a lock screen, a network
/// switch that never sends a TCP FIN — would leave a zombie connection (and its character) forever, so
/// a reconnect would re-attach to the stale character instead of spawning fresh.
const PING_INTERVAL: Duration = Duration::from_secs(5);
const IDLE_TIMEOUT: Duration = Duration::from_secs(15);

/// Drives renet2's transport-agnostic core directly over plain WebSockets, with no netcode layer,
/// so no connection cap but `max_clients`, a soft resource limit. TLS is terminated by the reverse
/// proxy and the user is already authenticated by the ticket, so netcode's encryption and
/// anti-spoof challenge would add nothing here.
///
/// Each renet packet is one binary WebSocket frame; renet still owns channels and reliability. The
/// accept loop and per-connection reader/writer tasks run on the shared tokio runtime and reach the
/// single-threaded game loop only through these channels, so the loop never blocks on IO.
pub struct WsTransport {
    local_addr: SocketAddr,
    events: mpsc::UnboundedReceiver<Event>,
    senders: HashMap<u64, mpsc::UnboundedSender<Vec<u8>>>,
    identities: HashMap<u64, Identity>,
    max_clients: usize,
}

enum Event {
    Connected {
        client: u64,
        identity: Identity,
        out: mpsc::UnboundedSender<Vec<u8>>,
    },
    Packet {
        client: u64,
        data: Vec<u8>,
    },
    Disconnected {
        client: u64,
    },
}

impl WsTransport {
    pub fn bind(
        addr: SocketAddr,
        sessions: Sessions,
        max_clients: usize,
        runtime: Handle,
    ) -> WsTransport {
        let listener = runtime
            .block_on(TcpListener::bind(addr))
            .unwrap_or_else(|error| panic!("cannot bind websocket {addr}: {error}"));
        let local_addr = listener.local_addr().expect("bound websocket address");
        let (events_tx, events) = mpsc::unbounded_channel();
        runtime.spawn(accept(listener, sessions, events_tx));
        WsTransport {
            local_addr,
            events,
            senders: HashMap::new(),
            identities: HashMap::new(),
            max_clients,
        }
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Applies every connect, packet, and disconnect that arrived since the last tick to the renet
    /// server. renet has no internal timeout, so a closed socket (the `Disconnected` event) is the
    /// sole liveness signal — it must reach `remove_connection` or the connection lingers forever.
    pub fn update(&mut self, server: &mut RenetServer) {
        while let Ok(event) = self.events.try_recv() {
            match event {
                Event::Connected {
                    client,
                    identity,
                    out,
                } => {
                    if self.senders.len() >= self.max_clients {
                        continue; // server full: dropping `out` closes the writer task's socket
                    }
                    self.senders.insert(client, out);
                    self.identities.insert(client, identity);
                    server.add_connection(client, true);
                }
                Event::Packet { client, data } => {
                    let _ = server.process_packet_from(&data, client);
                }
                Event::Disconnected { client } => {
                    self.senders.remove(&client);
                    self.identities.remove(&client);
                    server.remove_connection(client);
                }
            }
        }
    }

    pub fn take_identity(&mut self, client: u64) -> Option<Identity> {
        self.identities.remove(&client)
    }

    pub fn send(&mut self, server: &mut RenetServer) {
        for client in server.clients_id() {
            let Some(out) = self.senders.get(&client) else {
                continue;
            };
            if let Ok(packets) = server.get_packets_to_send(client) {
                for packet in packets {
                    if out.send(packet.clone()).is_err() {
                        break; // writer task gone; the reader will report the disconnect
                    }
                }
            }
        }
    }
}

async fn accept(listener: TcpListener, sessions: Sessions, events: mpsc::UnboundedSender<Event>) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        tokio::spawn(serve(stream, sessions.clone(), events.clone()));
    }
}

// The handshake callback's `Result<Response, ErrorResponse>` is tungstenite's signature; its `Err`
// variant is a whole HTTP response, so it cannot be shrunk here.
#[allow(clippy::result_large_err)]
async fn serve(stream: TcpStream, sessions: Sessions, events: mpsc::UnboundedSender<Event>) {
    if stream.set_nodelay(true).is_err() {
        return;
    }
    // Claim the single-use ticket inside the handshake callback, so two sockets bearing the same
    // ticket can never both become a connection (the second `take` returns `None` and is rejected).
    let mut claimed: Option<(u64, Identity)> = None;
    let handshake = accept_hdr_async(
        stream,
        |request: &Request, response: Response| match ticket(request)
            .and_then(|id| sessions.take(id).map(|identity| (id, identity)))
        {
            Some(pair) => {
                claimed = Some(pair);
                Ok(response)
            }
            None => Err(Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .body(Some("invalid or expired ticket".to_owned()))
                .expect("reject response")),
        },
    )
    .await;
    let (Ok(ws), Some((client, identity))) = (handshake, claimed) else {
        return;
    };

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    if events
        .send(Event::Connected {
            client,
            identity,
            out: out_tx,
        })
        .is_err()
    {
        return;
    }

    let (mut sink, mut incoming) = ws.split();
    tokio::spawn(async move {
        let mut ping = tokio::time::interval(PING_INTERVAL);
        ping.tick().await; // the first tick fires immediately; skip it
        loop {
            let outcome = tokio::select! {
                data = out_rx.recv() => match data {
                    Some(data) => sink.send(Message::Binary(data.into())).await,
                    None => break, // transport dropped the sender on disconnect
                },
                _ = ping.tick() => sink.send(Message::Ping(Vec::new().into())).await,
            };
            if outcome.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    loop {
        match tokio::time::timeout(IDLE_TIMEOUT, incoming.next()).await {
            Ok(Some(Ok(Message::Binary(data)))) => {
                if events
                    .send(Event::Packet {
                        client,
                        data: data.to_vec(),
                    })
                    .is_err()
                {
                    break;
                }
            }
            // A pong (or any other frame) is proof of life; only its arrival matters, not its payload.
            Ok(Some(Ok(_))) => {}
            // Clean close, socket error, end of stream, or no frame within the idle timeout: all dead.
            Ok(Some(Err(_))) | Ok(None) | Err(_) => break,
        }
    }
    let _ = events.send(Event::Disconnected { client });
}

fn ticket(request: &Request) -> Option<u64> {
    serde_urlencoded::from_str::<TicketQuery>(request.uri().query()?)
        .ok()
        .map(|query| query.ticket)
}

#[derive(Deserialize)]
struct TicketQuery {
    ticket: u64,
}
