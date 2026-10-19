use std::collections::{BTreeMap, BTreeSet, VecDeque};

use engine::core::assets::AssetKind;
use engine::core::content::{
    ASSETS_DIR, GAME_FILE, RowName, asset_file, asset_of, row_file, row_holding,
};
use engine::systems::registry;

use crate::project::{ContentEdit, Project, ProjectFiles};
use crate::rows::{companion_file, folder_files};
use crate::usages::ContentUsages;

/// What nothing the game uses reaches. The game uses its fixtures, which code names, the rows its
/// settings name, every row of a table picked from as a whole, and whatever those name, at any
/// depth. Every other row and media file is unused.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct UnusedContent {
    rows: BTreeMap<RowName, UnusedRow>,
    assets: BTreeSet<String>,
}

/// One thing found unused, as picked in the dialog that deletes them.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum UnusedItem {
    Row(RowName),
    Asset(String),
}

/// Why a row is unused: nothing names it, or only rows that are unused themselves do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UnusedRow {
    Unnamed,
    NamedByUnused(Vec<RowName>),
}

impl UnusedContent {
    pub fn find(files: &ProjectFiles, usages: &ContentUsages) -> UnusedContent {
        let registry = registry();
        let mut names: BTreeMap<RowName, BTreeSet<RowName>> = BTreeMap::new();
        let mut named_by: BTreeMap<RowName, BTreeSet<RowName>> = BTreeMap::new();
        let mut roots: Vec<RowName> = Vec::new();
        let mut used_assets: BTreeSet<&str> = BTreeSet::new();
        for (row, uses) in usages.rows() {
            for usage in uses.iter().filter(|usage| !usage.is_owner_line()) {
                match reader(&usage.file) {
                    Some(reader) => {
                        names.entry(reader.clone()).or_default().insert(row.clone());
                        named_by.entry(row.clone()).or_default().insert(reader);
                    }
                    None => roots.push(row.clone()),
                }
            }
        }
        let mut asset_readers: BTreeMap<RowName, Vec<&str>> = BTreeMap::new();
        for (path, uses) in usages.assets() {
            for usage in uses {
                match reader(&usage.file) {
                    Some(reader) => asset_readers.entry(reader).or_default().push(path),
                    None => {
                        used_assets.insert(path);
                    }
                }
            }
        }
        let every_row: Vec<RowName> = registry
            .table_names()
            .into_iter()
            .flat_map(|table| {
                files
                    .keys_of(table)
                    .map(move |key| RowName::new(table, key))
            })
            .collect();
        roots.extend(
            every_row
                .iter()
                .filter(|row| registry.is_fixture(row) || registry.picked_from_table(&row.table))
                .cloned(),
        );
        let mut used: BTreeSet<RowName> = BTreeSet::new();
        let mut pending: VecDeque<RowName> = roots.into();
        while let Some(row) = pending.pop_front() {
            if !used.insert(row.clone()) {
                continue;
            }
            used_assets.extend(asset_readers.get(&row).into_iter().flatten());
            pending.extend(names.get(&row).into_iter().flatten().cloned());
        }
        let rows = every_row
            .into_iter()
            .filter(|row| !used.contains(row))
            .map(|row| {
                let why = match named_by.get(&row) {
                    Some(readers) if !readers.is_empty() => {
                        UnusedRow::NamedByUnused(readers.iter().cloned().collect())
                    }
                    _ => UnusedRow::Unnamed,
                };
                (row, why)
            })
            .collect();
        let assets = files
            .paths_under(&format!("{ASSETS_DIR}/"))
            .map(|path| asset_of(path))
            .filter(|path| AssetKind::of(path).is_some())
            .filter(|path| !named_within(path, &used_assets))
            .map(str::to_owned)
            .collect();
        UnusedContent { rows, assets }
    }

    pub fn row(&self, table: &str, key: &str) -> Option<&UnusedRow> {
        self.rows.get(&RowName::new(table, key))
    }

    pub fn rows(&self) -> impl Iterator<Item = (&RowName, &UnusedRow)> {
        self.rows.iter()
    }

    /// Whether the media file at `path`, under the assets folder, is unused.
    pub fn has_asset(&self, path: &str) -> bool {
        self.assets.contains(path)
    }

    pub fn assets(&self) -> impl Iterator<Item = &str> {
        self.assets.iter().map(String::as_str)
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty() && self.assets.is_empty()
    }
}

/// What deleting unused content takes: the rows picked, the rows local to them, and the files.
pub struct UnusedDeletion {
    pub edit: ContentEdit,
    pub rows: Vec<RowName>,
    pub along: Vec<RowName>,
    pub assets: usize,
}

/// Deletes `rows`, with the rows local to them and the files beside them, and the media `assets`,
/// in one edit. Refused when something left behind still names one of them.
pub fn delete(
    project: &Project,
    rows: &[RowName],
    assets: &[String],
) -> Result<UnusedDeletion, String> {
    let owners = project.files.owners();
    let mut along: Vec<RowName> = Vec::new();
    for row in rows {
        for local in owners.held_within(row) {
            if !rows.contains(&local) && !along.contains(&local) {
                along.push(local);
            }
        }
    }
    let gone: BTreeSet<&RowName> = rows.iter().chain(&along).collect();
    let left_naming = |uses: &[crate::usages::ContentUsage]| {
        uses.iter()
            .filter(|usage| !usage.is_owner_line())
            .find_map(|usage| match reader(&usage.file) {
                Some(reader) if gone.contains(&reader) => None,
                Some(reader) => Some(reader.to_string()),
                None => Some("the game's settings".to_owned()),
            })
    };
    for row in &gone {
        if let Some(reader) = left_naming(project.usages.of_row(&row.table, &row.key)) {
            return Err(format!(
                "{reader} still names {row}: tick it too, or keep {row}"
            ));
        }
    }
    for asset in assets {
        if let Some(reader) = left_naming(project.usages.of_asset(asset)) {
            return Err(format!(
                "{reader} still names {asset}: tick it too, or keep the file"
            ));
        }
    }
    let mut label = format!(
        "Delete {} unused row{}",
        rows.len(),
        if rows.len() == 1 { "" } else { "s" }
    );
    if !along.is_empty() {
        label.push_str(&format!(" with {} local", along.len()));
    }
    if !assets.is_empty() {
        label.push_str(&format!(
            " and {} file{}",
            assets.len(),
            if assets.len() == 1 { "" } else { "s" }
        ));
    }
    let mut edit = ContentEdit::new(label);
    for row in &gone {
        edit.remove(row_file(&row.table, &row.key));
        if let Some(file) = companion_file(&row.table, &row.key)
            && project.files.contains(&file)
        {
            edit.remove(file);
        }
        for file in folder_files(project, &row.table, &row.key) {
            edit.remove(file);
        }
    }
    for asset in assets {
        edit.remove(asset_file(asset));
    }
    Ok(UnusedDeletion {
        edit,
        rows: rows.to_vec(),
        along,
        assets: assets.len(),
    })
}

/// The row whose file or folder names something; `None` for the game's settings.
fn reader(file: &str) -> Option<RowName> {
    if file == GAME_FILE {
        return None;
    }
    row_holding(file).map(|(table, key)| RowName::new(table, key))
}

/// Whether the file at `path` is named, itself or through a folder holding it.
fn named_within(path: &str, named: &BTreeSet<&str>) -> bool {
    let mut at = path;
    loop {
        if named.contains(at) {
            return true;
        }
        match at.rsplit_once('/') {
            Some((folder, _)) => at = folder,
            None => return false,
        }
    }
}
