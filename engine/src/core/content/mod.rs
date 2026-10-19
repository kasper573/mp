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
pub use key::key_of;
pub use load::{
    ContentFolder, ContentRegistry, FileHashes, FileWriter, FilesystemFolder, FolderEntry,
    LoadStep, Loading, MemoryFolder, Reference, Settings, load, pointer_of, valid_key, write,
};
pub use report::{ContentProblem, ErrorPlace, LoadError, LoadReport};
pub use table::{AnyTable, Content, ContentBuilder, ContentRow, ModuleRule, ModuleSet, Table};
pub use version::ContentVersion;

pub const GAME_FILE: &str = "game.json";
pub const TABLES_DIR: &str = "tables";
pub const ASSETS_DIR: &str = "assets";

pub fn table_folder(table: &str) -> String {
    format!("{TABLES_DIR}/{table}")
}

pub fn row_folder(table: &str, key: &str) -> String {
    format!("{}/{key}", table_folder(table))
}

pub fn row_file(table: &str, key: &str) -> String {
    format!("{}.json", row_folder(table, key))
}

/// The table and key of the row `file` holds, if it is a row file.
pub fn row_of(file: &str) -> Option<(&str, &str)> {
    let (table, name) = file
        .strip_prefix(TABLES_DIR)?
        .strip_prefix('/')?
        .split_once('/')?;
    let key = name
        .strip_suffix(".json")
        .filter(|key| !key.contains('/'))?;
    Some((table, key))
}

pub fn asset_file(path: &str) -> String {
    format!("{ASSETS_DIR}/{path}")
}

pub fn is_asset_file(file: &str) -> bool {
    file.strip_prefix(ASSETS_DIR)
        .is_some_and(|rest| rest.starts_with('/'))
}

pub fn asset_of(file: &str) -> &str {
    file.strip_prefix(ASSETS_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(file)
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
