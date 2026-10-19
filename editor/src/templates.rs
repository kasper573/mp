use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use engine::core::content::{GAME_FILE, row_of};
use include_dir::{Dir, include_dir};
use walkdir::WalkDir;

use crate::value::RowValue;

static TEMPLATES: Dir = include_dir!("$CARGO_MANIFEST_DIR/templates");

pub struct GameTemplate {
    pub key: String,
    pub name: String,
    pub initial_spawn: String,
    /// The keys of the rows it holds, by table.
    pub rows: BTreeMap<String, Vec<String>>,
}

impl GameTemplate {
    pub fn rows_in(&self, table: &str) -> usize {
        self.rows.get(table).map_or(0, Vec::len)
    }
}

pub fn list() -> Vec<GameTemplate> {
    let mut templates: Vec<GameTemplate> = TEMPLATES
        .dirs()
        .map(|dir| {
            let key = dir.path().to_string_lossy().into_owned();
            let game = dir
                .get_file(dir.path().join(GAME_FILE))
                .and_then(|file| serde_json::from_slice::<serde_json::Value>(file.contents()).ok())
                .unwrap_or_default();
            let mut rows: BTreeMap<String, Vec<String>> = BTreeMap::new();
            for file in all_files(dir) {
                let path = file.path().strip_prefix(dir.path()).unwrap_or(file.path());
                if let Some((table, row)) = path.to_str().and_then(row_of) {
                    rows.entry(table.to_owned())
                        .or_default()
                        .push(row.to_owned());
                }
            }
            GameTemplate {
                name: game["name"]
                    .as_str()
                    .map_or_else(|| key.clone(), str::to_owned),
                initial_spawn: format!(
                    "{} · {}, {}",
                    game["initial_spawn"].text_or("area", "?"),
                    game["initial_spawn"]["x"].as_f64().unwrap_or_default(),
                    game["initial_spawn"]["y"].as_f64().unwrap_or_default()
                ),
                key,
                rows,
            }
        })
        .collect();
    templates.sort_by(|a, b| a.key.cmp(&b.key));
    templates
}

pub fn new_game(template: &str, name: &str, folder: &Path) -> Result<(), String> {
    let dir = TEMPLATES
        .get_dir(template)
        .ok_or_else(|| format!("no built-in template {template}"))?;
    stage(folder, name, |staging| {
        for file in all_files(dir) {
            let relative = file
                .path()
                .strip_prefix(dir.path())
                .map_err(|e| e.to_string())?;
            let target = staging.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            std::fs::write(&target, file.contents()).map_err(|error| error.to_string())?;
        }
        Ok(())
    })
}

pub fn new_game_from(source: &Path, name: &str, folder: &Path) -> Result<(), String> {
    if !source.join(GAME_FILE).is_file() {
        return Err(format!("No {GAME_FILE} in {}", source.display()));
    }
    stage(folder, name, |staging| {
        std::fs::copy(source.join(GAME_FILE), staging.join(GAME_FILE))
            .map_err(|error| error.to_string())?;
        for part in ["tables", "assets"] {
            let from = source.join(part);
            if from.is_dir() {
                copy_dir(&from, &staging.join(part))?;
            }
        }
        Ok(())
    })
}

fn stage(
    folder: &Path,
    name: &str,
    fill: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    ensure_empty(folder)?;
    let staging = staging_dir(folder);
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let result = fill(&staging)
        .and_then(|()| write_name(&staging, name))
        .and_then(|()| move_into_place(&staging, folder));
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

fn ensure_empty(folder: &Path) -> Result<(), String> {
    if folder.exists() {
        if !folder.is_dir() {
            return Err(format!("{} is not a folder", folder.display()));
        }
        let mut entries = std::fs::read_dir(folder).map_err(|error| error.to_string())?;
        if entries.next().is_some() {
            return Err(format!("{} is not empty", folder.display()));
        }
    }
    Ok(())
}

fn staging_dir(folder: &Path) -> PathBuf {
    let name = folder
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "game".to_owned());
    folder
        .parent()
        .unwrap_or(folder)
        .join(format!(".{name}.new-game"))
}

fn move_into_place(staging: &Path, folder: &Path) -> Result<(), String> {
    if folder.exists() {
        std::fs::remove_dir(folder).map_err(|error| error.to_string())?;
    }
    std::fs::rename(staging, folder).map_err(|error| error.to_string())
}

fn write_name(folder: &Path, name: &str) -> Result<(), String> {
    let path = folder.join(GAME_FILE);
    let text = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut game: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| error.to_string())?;
    game["name"] = serde_json::Value::String(name.to_owned());
    let mut text = serde_json::to_string_pretty(&game).map_err(|error| error.to_string())?;
    text.push('\n');
    std::fs::write(&path, text).map_err(|error| error.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    for entry in WalkDir::new(from) {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = to.join(
            entry
                .path()
                .strip_prefix(from)
                .expect("a walked entry lies under its root"),
        );
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(target).map_err(|error| error.to_string())?;
        } else {
            std::fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn all_files<'a>(dir: &'a Dir<'a>) -> Vec<&'a include_dir::File<'a>> {
    let mut files: Vec<&include_dir::File> = dir.files().collect();
    for sub in dir.dirs() {
        files.extend(all_files(sub));
    }
    files
}
