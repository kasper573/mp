pub mod assert;
pub mod collections;
pub mod function_composition;
pub mod random;
pub mod short_id;
pub mod types;
pub mod uuid;

// Re-export commonly used items
pub use assert::{assert, assert_unwrap};
pub use collections::{utils as collection_utils, RecordExt};
pub use function_composition::{compose, Pipe};
pub use random::Rng;
pub use short_id::{generate_short_id, generate_short_id_with_length};
pub use types::{EntityRecord, HasId, Id, JsonSerializable, Result, Timestamp};
pub use uuid::{generate_uuid, uuid_from_string};

// Re-export external crates that are commonly used
pub use anyhow;
pub use serde;
pub use serde_json;