use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use game::core::content::MemoryFolder;

pub type Bytes = Arc<[u8]>;

#[derive(Clone, Default)]
pub struct Files {
    map: BTreeMap<String, Stored>,
}

#[derive(Clone)]
struct Stored {
    bytes: Bytes,
    hash: String,
    json: OnceLock<Option<Arc<serde_json::Value>>>,
}

impl Files {
    pub fn read_dir(root: &Path) -> io::Result<Files> {
        let mut files = Files::default();
        walk(root, root, &mut files)?;
        Ok(files)
    }

    pub fn get(&self, path: &str) -> Option<&Bytes> {
        self.map.get(path).map(|stored| &stored.bytes)
    }

    pub fn hash_of(&self, path: &str) -> Option<&str> {
        self.map.get(path).map(|stored| stored.hash.as_str())
    }

    pub fn contains(&self, path: &str) -> bool {
        self.map.contains_key(path)
    }

    pub fn insert(&mut self, path: String, bytes: Bytes) {
        let hash = hash(&bytes);
        self.map.insert(
            path,
            Stored {
                bytes,
                hash,
                json: OnceLock::new(),
            },
        );
    }

    pub fn remove(&mut self, path: &str) {
        self.map.remove(path);
    }

    pub fn paths(&self) -> impl Iterator<Item = &String> {
        self.map.keys()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &Bytes)> {
        self.map.iter().map(|(path, stored)| (path, &stored.bytes))
    }

    pub fn hashes(&self) -> BTreeMap<String, String> {
        self.map
            .iter()
            .map(|(path, stored)| (path.clone(), stored.hash.clone()))
            .collect()
    }

    pub fn text(&self, path: &str) -> Option<String> {
        String::from_utf8(self.get(path)?.to_vec()).ok()
    }

    pub fn json(&self, path: &str) -> Option<Arc<serde_json::Value>> {
        let stored = self.map.get(path)?;
        stored
            .json
            .get_or_init(|| serde_json::from_slice(&stored.bytes).ok().map(Arc::new))
            .clone()
    }

    pub fn json_owned(&self, path: &str) -> Option<serde_json::Value> {
        self.json(path).map(|value| (*value).clone())
    }

    pub fn folder(&self, name: &str) -> MemoryFolder {
        MemoryFolder {
            name: name.to_owned(),
            files: self
                .map
                .iter()
                .map(|(path, stored)| (path.clone(), stored.bytes.clone()))
                .collect(),
        }
    }

    pub fn with(&self, changes: &[Change]) -> Files {
        let mut files = self.clone();
        for change in changes {
            match &change.bytes {
                Some(bytes) => files.insert(change.file.clone(), bytes.clone()),
                None => files.remove(&change.file),
            }
        }
        files
    }

    pub fn paths_under(&self, prefix: &str) -> impl Iterator<Item = &String> {
        self.map
            .range::<str, _>((
                std::ops::Bound::Included(prefix),
                std::ops::Bound::Unbounded,
            ))
            .map(|(path, _)| path)
            .take_while(move |path| path.starts_with(prefix))
    }
}

pub fn hash(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

pub fn json_bytes(value: &serde_json::Value) -> Bytes {
    let mut bytes = serde_json::to_vec_pretty(value).expect("json");
    bytes.push(b'\n');
    Bytes::from(bytes)
}

pub const GAME_FILE: &str = "game.json";

pub fn row_file(table: &str, key: &str) -> String {
    format!("tables/{table}/{key}.json")
}

pub fn row_of(file: &str) -> Option<(&str, &str)> {
    let rest = file.strip_prefix("tables/")?;
    let (table, name) = rest.split_once('/')?;
    let key = name.strip_suffix(".json")?;
    (!key.contains('/')).then_some((table, key))
}

#[derive(Clone, Debug)]
pub struct Change {
    pub file: String,
    pub bytes: Option<Bytes>,
}

impl PartialEq for Change {
    fn eq(&self, other: &Change) -> bool {
        self.file == other.file
            && match (&self.bytes, &other.bytes) {
                (Some(a), Some(b)) => a[..] == b[..],
                (None, None) => true,
                _ => false,
            }
    }
}

fn walk(root: &Path, dir: &Path, into: &mut Files) -> io::Result<()> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    entries.sort();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_owned();
        if name.starts_with('.') || name.ends_with(".tmp") {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, into)?;
        } else if let Ok(relative) = path.strip_prefix(root) {
            let relative = relative
                .components()
                .map(|part| part.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            into.insert(relative, Bytes::from(std::fs::read(&path)?));
        }
    }
    Ok(())
}
