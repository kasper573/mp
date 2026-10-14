use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use bevy::prelude::*;

use crate::core::content::store::ContentStore;
use crate::core::time::LocalClock;

pub type LocalFuture<T> = Pin<Box<dyn Future<Output = T>>>;

#[derive(Resource)]
pub struct StartParams {
    pub access_token: Option<String>,
    pub game_server_url: String,
    pub game_server_ws_url: String,
}

/// Carries opaque renet packets with no netcode layer, so frames are buffered and drained each tick.
pub trait ServerSocket: 'static {
    fn recv(&self) -> Option<Vec<u8>>;
    fn send(&self, packet: &[u8]);
    fn is_open(&self) -> bool;
    fn is_closed(&self) -> bool;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FetchFailure {
    Status { status: u16, body: String },
    Transport(String),
}

impl std::fmt::Display for FetchFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            FetchFailure::Status { status, body } if body.is_empty() => write!(f, "HTTP {status}"),
            FetchFailure::Status { status, body } => write!(f, "HTTP {status}: {body}"),
            FetchFailure::Transport(reason) => f.write_str(reason),
        }
    }
}

pub trait Platform: Send + Sync + 'static {
    fn load(&self, key: &str) -> Option<String>;
    fn save(&self, key: &str, value: &str);
    fn sync_window(&self, window: &mut Window);
    fn get(&self, url: String) -> LocalFuture<Result<Vec<u8>, FetchFailure>>;
    fn post(
        &self,
        url: String,
        authorization: String,
        body: String,
    ) -> LocalFuture<Result<String, FetchFailure>>;
    fn content_store(&self) -> Box<dyn ContentStore>;
    fn connect(&self, url: &str) -> Box<dyn ServerSocket>;
    fn local_clock(&self) -> LocalClock;
    fn announce(&self, status: &str);
    /// Restarts the client on the server's `build`, or says what the player has to do instead.
    fn relaunch(&self, build: &str) -> Result<(), String>;
}

#[derive(Resource, Clone)]
pub struct ClientPlatform(pub Arc<dyn Platform>);

/// Ends the process once whoever started it closes its stdin, so a child that outlives a crashed
/// parent stops instead of lingering.
pub fn exit_when_stdin_closes() {
    std::thread::spawn(|| {
        let mut sink = Vec::new();
        let _ = std::io::Read::read_to_end(&mut std::io::stdin().lock(), &mut sink);
        std::process::exit(0);
    });
}
