use std::path::{Path, PathBuf};

use crate::value::RowValue;
use include_dir::{Dir, include_dir};

static TEMPLATES: Dir = include_dir!("$CARGO_MANIFEST_DIR/templates");

pub struct Template {
    pub key: String,
    pub name: String,
    pub areas: Vec<String>,
    pub files: usize,
    pub spawn: String,
    pub tables: Vec<(String, Vec<String>)>,
}

pub fn list() -> Vec<Template> {
    let mut templates: Vec<Template> = TEMPLATES
        .dirs()
        .map(|dir| {
            let key = dir
                .path()
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            let name = dir
                .get_file(dir.path().join("game.json"))
                .and_then(|file| serde_json::from_slice::<serde_json::Value>(file.contents()).ok())
                .and_then(|game| game["name"].as_str().map(str::to_owned))
                .unwrap_or_else(|| key.clone());
            let areas = dir
                .get_dir(dir.path().join("tables/area"))
                .map(|areas| {
                    areas
                        .files()
                        .filter_map(|file| {
                            let name = file.path().file_name()?.to_str()?;
                            name.strip_suffix(".json").map(str::to_owned)
                        })
                        .collect()
                })
                .unwrap_or_default();
            let game = dir
                .get_file(dir.path().join("game.json"))
                .and_then(|file| serde_json::from_slice::<serde_json::Value>(file.contents()).ok())
                .unwrap_or_default();
            let spawn = format!(
                "{} · {}, {}",
                game["spawn"].text_or("area", "?"),
                game["spawn"]["x"].as_f64().unwrap_or_default(),
                game["spawn"]["y"].as_f64().unwrap_or_default()
            );
            let tables = dir
                .get_dir(dir.path().join("tables"))
                .map(|tables| {
                    tables
                        .dirs()
                        .map(|table| {
                            let table_name = table
                                .path()
                                .file_name()
                                .map(|n| n.to_string_lossy().into_owned())
                                .unwrap_or_default();
                            let keys: Vec<String> = table
                                .files()
                                .filter_map(|file| {
                                    file.path()
                                        .file_name()?
                                        .to_str()?
                                        .strip_suffix(".json")
                                        .map(str::to_owned)
                                })
                                .collect();
                            (table_name, keys)
                        })
                        .collect()
                })
                .unwrap_or_default();
            Template {
                key,
                name,
                areas,
                files: count_files(dir),
                spawn,
                tables,
            }
        })
        .collect();
    templates.sort_by(|a, b| {
        (a.key != "new_game")
            .cmp(&(b.key != "new_game"))
            .then(a.key.cmp(&b.key))
    });
    templates
}

pub fn new_game(template: &str, name: &str, folder: &Path) -> Result<(), String> {
    let dir = TEMPLATES
        .get_dir(template)
        .ok_or_else(|| format!("no built-in template {template}"))?;
    ensure_empty(folder)?;
    let staging = staging_dir(folder);
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let result = (|| {
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
        write_name(&staging, name)?;
        move_into_place(&staging, folder)
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

pub fn new_game_from(source: &Path, name: &str, folder: &Path) -> Result<(), String> {
    if !source.join("game.json").is_file() {
        return Err(format!("No game.json in {}", source.display()));
    }
    ensure_empty(folder)?;
    let staging = staging_dir(folder);
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let result = (|| {
        std::fs::copy(source.join("game.json"), staging.join("game.json"))
            .map_err(|error| error.to_string())?;
        for part in ["tables", "assets"] {
            let from = source.join(part);
            if from.is_dir() {
                copy_dir(&from, &staging.join(part))?;
            }
        }
        write_name(&staging, name)?;
        move_into_place(&staging, folder)
    })();
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
    let path = folder.join("game.json");
    let text = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut game: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| error.to_string())?;
    game["name"] = serde_json::Value::String(name.to_owned());
    let mut text = serde_json::to_string_pretty(&game).map_err(|error| error.to_string())?;
    text.push('\n');
    std::fs::write(&path, text).map_err(|error| error.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
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

fn count_files(dir: &Dir) -> usize {
    all_files(dir).len()
}
