use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use game::core::content::MemoryFolder;

pub type Bytes = Arc<[u8]>;

#[derive(Clone, Default)]
pub struct Files {
    pub map: BTreeMap<String, Bytes>,
}

impl Files {
    pub fn read_dir(root: &Path) -> io::Result<Files> {
        let mut files = Files::default();
        walk(root, root, &mut files.map)?;
        Ok(files)
    }

    pub fn get(&self, path: &str) -> Option<&Bytes> {
        self.map.get(path)
    }

    pub fn text(&self, path: &str) -> Option<String> {
        String::from_utf8(self.map.get(path)?.to_vec()).ok()
    }

    pub fn json(&self, path: &str) -> Option<serde_json::Value> {
        serde_json::from_slice(self.map.get(path)?).ok()
    }

    pub fn folder(&self, name: &str) -> MemoryFolder {
        MemoryFolder {
            name: name.to_owned(),
            files: self.map.clone(),
        }
    }

    pub fn with(&self, changes: &[Change]) -> Files {
        let mut files = self.clone();
        for change in changes {
            match &change.bytes {
                Some(bytes) => {
                    files.map.insert(change.file.clone(), bytes.clone());
                }
                None => {
                    files.map.remove(&change.file);
                }
            }
        }
        files
    }

    pub fn paths_under(&self, prefix: &str) -> impl Iterator<Item = &String> {
        self.map.keys().filter(move |path| path.starts_with(prefix))
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

fn walk(root: &Path, dir: &Path, into: &mut BTreeMap<String, Bytes>) -> io::Result<()> {
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
