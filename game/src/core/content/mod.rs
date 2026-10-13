pub mod check;
pub mod fixture;
pub mod id;
pub mod key;
pub mod load;
pub mod locate;
pub mod media;
pub mod report;
pub mod serial;
pub mod store;
pub mod sync;
pub mod table;
pub mod version;

pub use check::RowCheck;
pub use fixture::Fixture;
pub use id::{ContentId, ContentScope, UnknownRow, with_content};
pub use key::{KeyBuf, key_of};
pub use load::{
    ContentFolder, ContentRegistry, FileHashes, FileWriter, FilesystemFolder, FolderEntry,
    LoadStep, Loading, MemoryFolder, Reference, Settings, load, pointer_of, valid_key, write,
};
pub use report::{ErrorPlace, LoadError, LoadReport};
pub use table::{AnyTable, Content, ContentBuilder, ContentRow, ModuleRule, ModuleSet, Table};
pub use version::ContentVersion;

pub const GAME_FILE: &str = "game.json";

pub fn row_file(table: &str, key: &str) -> String {
    format!("{}.json", row_folder(table, key))
}

pub fn row_folder(table: &str, key: &str) -> String {
    format!("tables/{table}/{key}")
}

pub fn asset_file(path: &str) -> String {
    format!("assets/{path}")
}

pub fn named<Row: ContentRow>(
    world: &bevy_ecs::world::World,
    key: &str,
) -> Result<ContentId<Row>, String> {
    world
        .resource::<Content>()
        .by_key::<Row>(key)
        .ok_or_else(|| format!("`{key}` is not a known {}", Row::TABLE))
}
