use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};

use super::files::{FileBytes, FileChange};
use crate::user::UserFolder;

pub const EVERY: Duration = Duration::from_secs(3);

pub struct RecoveryJournal {
    file: PathBuf,
    last: Option<Instant>,
}

#[derive(Serialize, Deserialize)]
pub struct RecoveryJournalData {
    pub build: String,
    pub content_version: String,
    pub folder: PathBuf,
    pub written: u64,
    pub files: Vec<RecoveryJournalFile>,
}

#[derive(Serialize, Deserialize)]
pub struct RecoveryJournalFile {
    pub path: String,
    pub base: Option<String>,
    pub bytes: Option<String>,
}

impl RecoveryJournal {
    pub fn for_folder(user: &UserFolder, folder: &Path) -> RecoveryJournal {
        let _ = std::fs::create_dir_all(user.journal_dir());
        RecoveryJournal {
            file: file_for(user, folder),
            last: None,
        }
    }

    pub fn due(&self) -> bool {
        self.last.is_none_or(|last| last.elapsed() >= EVERY)
    }

    pub fn write(&mut self, data: &RecoveryJournalData) {
        self.last = Some(Instant::now());
        if let Ok(text) = serde_json::to_string(data) {
            let temp = self.file.with_extension("json.tmp");
            if std::fs::write(&temp, text).is_ok() {
                let _ = std::fs::rename(&temp, &self.file);
            }
        }
    }

    pub fn clear(&mut self) {
        self.last = Some(Instant::now());
        let _ = std::fs::remove_file(&self.file);
    }

    pub fn recover(user: &UserFolder, folder: &Path) -> Option<RecoveryJournalData> {
        let text = std::fs::read_to_string(file_for(user, folder)).ok()?;
        serde_json::from_str(&text).ok()
    }

    pub fn set_aside(user: &UserFolder, folder: &Path) {
        let file = file_for(user, folder);
        let _ = std::fs::rename(&file, file.with_extension("json.old"));
    }
}

impl RecoveryJournalFile {
    pub fn of(path: &str, base: Option<&str>, bytes: Option<&FileBytes>) -> RecoveryJournalFile {
        RecoveryJournalFile {
            path: path.to_owned(),
            base: base.map(str::to_owned),
            bytes: bytes.map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes)),
        }
    }

    pub fn change(&self) -> FileChange {
        FileChange {
            file: self.path.clone(),
            bytes: self.bytes.as_ref().and_then(|text| {
                base64::engine::general_purpose::STANDARD
                    .decode(text)
                    .ok()
                    .map(FileBytes::from)
            }),
        }
    }
}

fn file_for(user: &UserFolder, folder: &Path) -> PathBuf {
    user.journal_dir()
        .join(format!("{}.json", UserFolder::folder_key(folder)))
}
