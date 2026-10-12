use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Never inside a content folder.
#[derive(Clone, Debug)]
pub struct UserFolder {
    root: PathBuf,
}

impl UserFolder {
    pub fn at(root: PathBuf) -> UserFolder {
        UserFolder { root }
    }

    pub fn locate() -> UserFolder {
        let base = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
        UserFolder::at(base.join("rift-editor"))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn settings_file(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn journal_dir(&self) -> PathBuf {
        self.root.join("journal")
    }

    pub fn imports_dir(&self) -> PathBuf {
        self.root.join("imports")
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }

    pub fn locks_dir(&self) -> PathBuf {
        self.root.join("locks")
    }

    pub fn layouts_dir(&self) -> PathBuf {
        self.root.join("layouts")
    }

    pub fn profiles_dir(&self) -> PathBuf {
        self.root.join("profiles")
    }

    pub fn load_settings(&self) -> Settings {
        std::fs::read_to_string(self.settings_file())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save_settings(&self, settings: &Settings) {
        let _ = std::fs::create_dir_all(&self.root);
        if let Ok(text) = serde_json::to_string_pretty(settings) {
            let _ = std::fs::write(self.settings_file(), text + "\n");
        }
    }

    pub fn folder_key(folder: &Path) -> String {
        blake3::hash(folder.to_string_lossy().as_bytes()).to_hex()[..16].to_owned()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub recent: Vec<PathBuf>,
    pub recent_at: BTreeMap<String, u64>,
    pub binaries: Option<PathBuf>,
    pub brush: BrushSettings,
    pub stamps: BTreeMap<String, StampSettings>,
    pub cameras: BTreeMap<String, CameraSettings>,
    pub listeners: BTreeMap<String, [f32; 2]>,
    pub views: BTreeMap<String, SpreadsheetView>,
    pub last_play: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct BrushSettings {
    pub size: u32,
    pub random: bool,
    pub flip_x: bool,
    pub flip_y: bool,
}

impl Default for BrushSettings {
    fn default() -> BrushSettings {
        BrushSettings {
            size: 1,
            random: false,
            flip_x: false,
            flip_y: false,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct StampSettings {
    pub flip_x: bool,
    pub flip_y: bool,
    pub spacing: Option<u32>,
    pub values: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct CameraSettings {
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
}

impl Default for CameraSettings {
    fn default() -> CameraSettings {
        CameraSettings {
            x: 0.0,
            y: 0.0,
            zoom: 2.0,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct SpreadsheetView {
    pub columns: Vec<String>,
    pub sort: Option<(String, bool)>,
    pub filter: String,
}

impl Settings {
    pub fn remember(&mut self, folder: &Path) {
        self.recent.retain(|known| known != folder);
        self.recent.insert(0, folder.to_path_buf());
        self.recent.truncate(12);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.recent_at.insert(folder.display().to_string(), now);
        self.recent_at.retain(|path, _| {
            self.recent
                .iter()
                .any(|known| known.display().to_string() == *path)
        });
    }

    pub fn forget(&mut self, folder: &Path) {
        self.recent.retain(|known| known != folder);
        self.recent_at.remove(&folder.display().to_string());
    }

    pub fn opened_ago(&self, folder: &Path) -> String {
        let Some(at) = self.recent_at.get(&folder.display().to_string()) else {
            return String::new();
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let days = now.saturating_sub(*at) / 86_400;
        match days {
            0 => "today".to_owned(),
            1 => "yesterday".to_owned(),
            2..=6 => format!("{days} days ago"),
            7..=13 => "last week".to_owned(),
            14..=30 => format!("{} weeks ago", days / 7),
            _ => format!("{} months ago", days / 30),
        }
    }
}
