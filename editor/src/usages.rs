use std::collections::HashMap;

use engine::core::content::id::LeafKind;
use engine::core::content::{
    Content, ContentRow, GAME_FILE, OWNER_FIELD, Reference, asset_of, row_file,
};
use engine::core::vfx::{VfxShaderDef, shader_file};
use engine::systems::registry;
use rayon::prelude::*;

use crate::project::ProjectFiles;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContentUsage {
    pub file: String,
    pub pointer: String,
    pub known: bool,
}

impl ContentUsage {
    /// Whether the use is a local row's owner line, naming the row that holds it.
    pub fn is_owner_line(&self) -> bool {
        self.pointer.strip_prefix('/') == Some(OWNER_FIELD)
    }
}

#[derive(Default)]
pub struct ContentUsages {
    rows: HashMap<(String, String), Vec<ContentUsage>>,
    assets: HashMap<String, Vec<ContentUsage>>,
    by_file: HashMap<String, Vec<Reference>>,
}

impl ContentUsages {
    pub fn build(content: &Content, files: &ProjectFiles) -> ContentUsages {
        let registry = registry();
        let texts: Vec<(&String, String)> = files
            .iter()
            .filter(|(path, _)| path.as_str() == GAME_FILE || path.ends_with(".json"))
            .filter_map(|(path, bytes)| Some((path, String::from_utf8(bytes.to_vec()).ok()?)))
            .collect();
        let parsed: Vec<(String, Vec<Reference>)> = texts
            .par_iter()
            .map(|(path, text)| ((*path).clone(), registry.references(content, path, text)))
            .collect();
        let mut usages = ContentUsages::default();
        for (file, references) in parsed {
            for reference in &references {
                let usage = ContentUsage {
                    file: file.clone(),
                    pointer: reference.pointer.clone(),
                    known: reference.known,
                };
                match reference.kind {
                    LeafKind::Row(table) => usages
                        .rows
                        .entry((table.to_owned(), reference.value.clone()))
                        .or_default()
                        .push(usage),
                    LeafKind::Asset => usages
                        .assets
                        .entry(reference.value.clone())
                        .or_default()
                        .push(usage),
                }
            }
            usages.by_file.insert(file, references);
        }
        for (row, owner) in files.owners().iter() {
            usages
                .rows
                .entry((owner.table.clone(), owner.key.clone()))
                .or_default()
                .push(ContentUsage {
                    file: row_file(&row.table, &row.key),
                    pointer: format!("/{OWNER_FIELD}"),
                    known: files.contains(&row_file(&owner.table, &owner.key)),
                });
        }
        for key in files.keys_of(VfxShaderDef::TABLE) {
            usages
                .assets
                .entry(asset_of(&shader_file(key)).to_owned())
                .or_default()
                .push(ContentUsage {
                    file: row_file(VfxShaderDef::TABLE, key),
                    pointer: String::new(),
                    known: true,
                });
        }
        usages
    }

    pub fn of_row(&self, table: &str, key: &str) -> &[ContentUsage] {
        self.rows
            .get(&(table.to_owned(), key.to_owned()))
            .map_or(&[], Vec::as_slice)
    }

    pub fn of_asset(&self, path: &str) -> &[ContentUsage] {
        self.assets.get(path).map_or(&[], Vec::as_slice)
    }

    pub fn in_file(&self, file: &str) -> &[Reference] {
        self.by_file.get(file).map_or(&[], Vec::as_slice)
    }

    pub fn files_naming(&self, table: &str, key: &str) -> Vec<(String, Vec<String>)> {
        let mut by_file: Vec<(String, Vec<String>)> = Vec::new();
        for usage in self.of_row(table, key) {
            match by_file.iter_mut().find(|(file, _)| *file == usage.file) {
                Some((_, pointers)) => pointers.push(usage.pointer.clone()),
                None => by_file.push((usage.file.clone(), vec![usage.pointer.clone()])),
            }
        }
        by_file
    }
}
