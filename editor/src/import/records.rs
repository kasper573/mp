use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::app::Editor;
use crate::project::watch::FolderWatcher;
use crate::user::UserFolder;
use crate::views::model::ModelStrip;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ImportRecord {
    pub export: PathBuf,
    #[serde(default)]
    pub files: Vec<PathBuf>,
    pub table: String,
    pub key: String,
    #[serde(default)]
    pub mapping: serde_json::Value,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub hash: String,
    #[serde(default)]
    pub strips: BTreeMap<String, Vec<u32>>,
    #[serde(default)]
    pub part: String,
}

impl ImportRecord {
    pub fn of_files(files: &[PathBuf], table: &str, key: &str) -> ImportRecord {
        let (size, hash) = fingerprint(files);
        ImportRecord {
            export: super::model::primary_file(files),
            files: files.to_vec(),
            table: table.to_owned(),
            key: key.to_owned(),
            mapping: serde_json::Value::Null,
            size,
            hash,
            strips: BTreeMap::new(),
            part: String::new(),
        }
    }

    pub fn files(&self) -> Vec<PathBuf> {
        if self.files.is_empty() {
            vec![self.export.clone()]
        } else {
            self.files.clone()
        }
    }

    pub fn missing(&self) -> bool {
        self.files().iter().any(|file| !file.exists())
    }

    pub fn changed(&self) -> Option<bool> {
        if self.missing() {
            return None;
        }
        let (size, hash) = fingerprint(&self.files());
        Some(size != self.size || hash != self.hash)
    }

    pub fn names(&self) -> String {
        let files = self.files();
        match files.as_slice() {
            [image, json] if json.extension().is_some_and(|ext| ext == "json") => {
                format!("{} and .json", super::formats::name(image))
            }
            [one] => super::formats::name(one),
            many => format!("{} files", many.len()),
        }
    }
}

pub fn fingerprint(files: &[PathBuf]) -> (u64, String) {
    let mut hasher = blake3::Hasher::new();
    let mut size = 0;
    for file in files {
        if let Ok(bytes) = std::fs::read(file) {
            size += bytes.len() as u64;
            hasher.update(&bytes);
        }
    }
    (size, hasher.finalize().to_hex()[..16].to_owned())
}

pub const RETRIES: u32 = 3;

#[derive(Clone, Debug)]
pub struct DueReimport {
    pub table: String,
    pub key: String,
    pub part: String,
    pub at: Instant,
    pub tries: u32,
    pub while_closed: bool,
}

#[derive(Default)]
pub struct ImportRecords {
    pub records: Vec<ImportRecord>,
    file: Option<PathBuf>,
    watchers: HashMap<PathBuf, FolderWatcher>,
    pub due: Vec<DueReimport>,
    pub unreadable: Option<String>,
}

impl ImportRecords {
    pub fn load(user: &UserFolder, folder: &Path) -> ImportRecords {
        let file = user
            .imports_dir()
            .join(format!("{}.json", UserFolder::folder_key(folder)));
        let (records, unreadable): (Vec<ImportRecord>, Option<String>) = match std::fs::read(&file)
        {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(records) => (records, None),
                Err(error) => (Vec::new(), Some(format!("{}: {error}", file.display()))),
            },
            Err(_) => (Vec::new(), None),
        };
        let due = records
            .iter()
            .filter(|record| record.changed() == Some(true))
            .map(|record| DueReimport {
                table: record.table.clone(),
                key: record.key.clone(),
                part: record.part.clone(),
                at: Instant::now(),
                tries: 0,
                while_closed: true,
            })
            .collect();
        let mut imports = ImportRecords {
            records,
            file: unreadable.is_none().then_some(file),
            watchers: HashMap::new(),
            due,
            unreadable,
        };
        imports.watch();
        imports
    }

    pub fn record_for(&self, table: &str, key: &str) -> Option<&ImportRecord> {
        self.record_with(table, key, "")
    }

    pub fn record_with(&self, table: &str, key: &str, part: &str) -> Option<&ImportRecord> {
        self.records
            .iter()
            .rev()
            .find(|record| record.table == table && record.key == key && record.part == part)
    }

    pub fn forget(&mut self, table: &str, key: &str) {
        self.records
            .retain(|seen| !(seen.table == table && seen.key == key));
        self.save();
    }

    pub fn remember(&mut self, record: ImportRecord) {
        self.records.retain(|seen| {
            !(seen.table == record.table && seen.key == record.key && seen.part == record.part)
        });
        self.records.push(record);
        self.save();
        self.watch();
    }

    fn save(&self) {
        if let Some(file) = &self.file
            && let Some(parent) = file.parent()
            && std::fs::create_dir_all(parent).is_ok()
            && let Ok(bytes) = serde_json::to_vec_pretty(&self.records)
        {
            let _ = std::fs::write(file, bytes);
        }
    }

    fn watch(&mut self) {
        let dirs: Vec<PathBuf> = self
            .records
            .iter()
            .flat_map(|record| record.files())
            .filter_map(|file| file.parent().map(Path::to_path_buf))
            .collect();
        for dir in dirs {
            if !self.watchers.contains_key(&dir) && dir.is_dir() {
                self.watchers.insert(dir.clone(), FolderWatcher::on(&dir));
            }
        }
    }

    pub fn poll(&mut self) -> Vec<DueReimport> {
        let mut touched: Vec<PathBuf> = Vec::new();
        for (dir, watcher) in &mut self.watchers {
            match watcher.poll() {
                Some(Some(paths)) => {
                    touched.extend(paths.into_iter().map(|path| dir.join(path)));
                }
                Some(None) => touched.push(dir.clone()),
                None => {}
            }
        }
        for record in &self.records {
            let files = record.files();
            let hit = touched.iter().any(|path| {
                files
                    .iter()
                    .any(|file| file == path || file.parent() == Some(path.as_path()))
            });
            if hit
                && record.changed() == Some(true)
                && !self.due.iter().any(|due| {
                    due.table == record.table && due.key == record.key && due.part == record.part
                })
            {
                self.due.push(DueReimport {
                    table: record.table.clone(),
                    key: record.key.clone(),
                    part: record.part.clone(),
                    at: Instant::now(),
                    tries: 0,
                    while_closed: false,
                });
            }
        }
        let now = Instant::now();
        let (ready, waiting): (Vec<DueReimport>, Vec<DueReimport>) =
            self.due.drain(..).partition(|due| due.at <= now);
        self.due = waiting;
        ready
    }

    pub fn retry(&mut self, due: DueReimport) -> bool {
        if due.tries + 1 >= RETRIES {
            return false;
        }
        self.due.push(DueReimport {
            at: Instant::now() + Duration::from_millis(500),
            tries: due.tries + 1,
            ..due
        });
        true
    }
}

pub fn recorded_lengths(editor: &Editor, key: &str, strip: ModelStrip) -> Option<Vec<u32>> {
    editor
        .imports
        .record_for("model", key)?
        .strips
        .get(&strip.record_key())
        .cloned()
}
