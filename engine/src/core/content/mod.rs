pub mod check;
pub mod fixture;
pub mod id;
pub mod key;
pub mod load;
pub mod locate;
pub mod media;
pub mod owner;
pub mod report;
pub mod serial;
pub mod store;
pub mod sync;
pub mod table;
pub mod version;

pub use check::RowCheck;
pub use fixture::Fixture;
pub use id::{ContentId, ContentScope, ScopeReader, with_content};
pub use key::key_of;
pub use load::{
    BesideFile, BesideName, ContentFolder, ContentRegistry, FileHashes, FileWriter,
    FilesystemFolder, FolderEntry, LoadStep, Loading, MemoryFolder, Reference, Settings, load,
    pointer_of, valid_key, write,
};
pub use owner::{ContentOwners, OWNER_FIELD, RowName};
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

/// The row whose folder holds `file`, or whose file it is.
pub fn row_holding(file: &str) -> Option<(&str, &str)> {
    row_of(file).or_else(|| beside_parts(file).map(|(table, key, _)| (table, key)))
}

/// The table, key and name of a file directly in a row's folder.
pub(crate) fn beside_parts(file: &str) -> Option<(&str, &str, &str)> {
    let (table, rest) = file
        .strip_prefix(TABLES_DIR)?
        .strip_prefix('/')?
        .split_once('/')?;
    let (key, name) = rest.split_once('/')?;
    (!name.contains('/')).then_some((table, key, name))
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
