use std::collections::HashMap;

use game::core::content::id::LeafKind;
use game::core::content::{Content, Reference};
use rayon::prelude::*;

use crate::project::Files;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Usage {
    pub file: String,
    pub pointer: String,
    pub known: bool,
}

#[derive(Default)]
pub struct Usages {
    rows: HashMap<(String, String), Vec<Usage>>,
    assets: HashMap<String, Vec<Usage>>,
    by_file: HashMap<String, Vec<Reference>>,
}

impl Usages {
    pub fn build(content: &Content, files: &Files) -> Usages {
        let registry = game::systems::registry();
        let texts: Vec<(&String, String)> = files
            .iter()
            .filter(|(path, _)| path.as_str() == "game.json" || path.ends_with(".json"))
            .filter_map(|(path, bytes)| Some((path, String::from_utf8(bytes.to_vec()).ok()?)))
            .collect();
        let parsed: Vec<(String, Vec<Reference>)> = texts
            .par_iter()
            .map(|(path, text)| ((*path).clone(), registry.references(content, path, text)))
            .collect();
        let mut usages = Usages::default();
        for (file, references) in parsed {
            for reference in &references {
                let usage = Usage {
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
        usages
    }

    pub fn of_row(&self, table: &str, key: &str) -> &[Usage] {
        self.rows
            .get(&(table.to_owned(), key.to_owned()))
            .map_or(&[], Vec::as_slice)
    }

    pub fn of_asset(&self, path: &str) -> &[Usage] {
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
