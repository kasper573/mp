pub mod auth;
pub mod transport;

use serde::{Deserialize, Serialize};

/// The most one replication message carries; larger updates are split across several.
pub const MAX_MESSAGE_BYTES: usize = 1200;

#[derive(Serialize, Deserialize)]
pub struct SessionRequest {
    pub build: String,
    pub rows: String,
}
