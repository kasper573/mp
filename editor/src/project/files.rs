use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::io;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use engine::core::content::{MemoryFolder, row_of, table_folder};
use walkdir::WalkDir;

pub type FileBytes = Arc<[u8]>;

#[derive(Clone, Default)]
pub struct ProjectFiles {
    map: BTreeMap<String, Stored>,
}

#[derive(Clone)]
struct Stored {
    bytes: FileBytes,
    hash: String,
    json: OnceLock<Option<Arc<serde_json::Value>>>,
}

impl ProjectFiles {
    pub fn read_dir(root: &Path) -> io::Result<ProjectFiles> {
        let mut files = ProjectFiles::default();
        let entries = WalkDir::new(root)
            .min_depth(1)
            .follow_links(true)
            .into_iter()
            .filter_entry(|entry| !hidden(entry.file_name()));
        for entry in entries {
            let entry = entry?;
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(root)
                .expect("a walked file lies under its root")
                .components()
                .map(|part| part.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            files.insert(relative, FileBytes::from(std::fs::read(entry.path())?));
        }
        Ok(files)
    }

    pub fn get(&self, path: &str) -> Option<&FileBytes> {
        self.map.get(path).map(|stored| &stored.bytes)
    }

    pub fn hash_of(&self, path: &str) -> Option<&str> {
        self.map.get(path).map(|stored| stored.hash.as_str())
    }

    pub fn contains(&self, path: &str) -> bool {
        self.map.contains_key(path)
    }

    pub fn insert(&mut self, path: String, bytes: FileBytes) {
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

    pub fn iter(&self) -> impl Iterator<Item = (&String, &FileBytes)> {
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

    pub fn with(&self, changes: &[FileChange]) -> ProjectFiles {
        let mut files = self.clone();
        for change in changes {
            match &change.bytes {
                Some(bytes) => files.insert(change.file.clone(), bytes.clone()),
                None => files.remove(&change.file),
            }
        }
        files
    }

    pub fn keys_of(&self, table: &str) -> impl Iterator<Item = &str> {
        let prefix = format!("{}/", table_folder(table));
        self.map
            .range::<str, _>((
                std::ops::Bound::Included(prefix.as_str()),
                std::ops::Bound::Unbounded,
            ))
            .map(|(path, _)| path.as_str())
            .take_while(move |path| path.starts_with(&prefix))
            .filter_map(|path| row_of(path).map(|(_, key)| key))
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

pub fn json_bytes(value: &serde_json::Value) -> FileBytes {
    let mut bytes = serde_json::to_vec_pretty(value).expect("json");
    bytes.push(b'\n');
    FileBytes::from(bytes)
}

pub fn text_bytes(text: String) -> FileBytes {
    FileBytes::from(text.into_bytes())
}

#[derive(Clone, Debug)]
pub struct FileChange {
    pub file: String,
    pub bytes: Option<FileBytes>,
}

impl PartialEq for FileChange {
    fn eq(&self, other: &FileChange) -> bool {
        self.file == other.file
            && match (&self.bytes, &other.bytes) {
                (Some(a), Some(b)) => a[..] == b[..],
                (None, None) => true,
                _ => false,
            }
    }
}

fn hidden(name: &OsStr) -> bool {
    name.to_str()
        .is_some_and(|name| name.starts_with('.') || name.ends_with(".tmp"))
}
