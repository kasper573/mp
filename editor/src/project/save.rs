use std::io::Write;
use std::path::Path;
use std::time::Duration;

use super::files::{Bytes, Files, hash};

pub struct SaveOutcome {
    pub written: Vec<String>,
    pub removed: Vec<String>,
}

pub struct SaveError {
    pub file: String,
    pub reason: String,
    pub done: SaveOutcome,
}

/// Writes every file whose bytes differ from `disk`: new files, then changed ones, then removals,
/// each through a temp file and a rename so an interrupted save leaves a folder that loads.
pub fn save(
    root: &Path,
    files: &Files,
    disk: &mut std::collections::BTreeMap<String, String>,
) -> Result<SaveOutcome, SaveError> {
    let mut done = SaveOutcome {
        written: Vec::new(),
        removed: Vec::new(),
    };
    let mut new_files = Vec::new();
    let mut changed = Vec::new();
    for (path, bytes) in &files.map {
        match disk.get(path) {
            None => new_files.push((path, bytes)),
            Some(known) if *known != hash(bytes) => changed.push((path, bytes)),
            _ => {}
        }
    }
    let removals: Vec<String> = disk
        .keys()
        .filter(|path| !files.map.contains_key(*path))
        .cloned()
        .collect();
    for (path, bytes) in new_files.into_iter().chain(changed) {
        if let Err(reason) = write_atomic(root, path, bytes) {
            return Err(SaveError {
                file: path.clone(),
                reason,
                done,
            });
        }
        disk.insert(path.clone(), hash(bytes));
        done.written.push(path.clone());
    }
    for path in removals {
        match std::fs::remove_file(root.join(&path)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(SaveError {
                    file: path,
                    reason: error.to_string(),
                    done,
                });
            }
        }
        disk.remove(&path);
        done.removed.push(path);
    }
    Ok(done)
}

pub fn clean_leftovers(root: &Path) {
    fn walk(dir: &Path) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                walk(&path);
            } else if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.') && name.ends_with(".tmp"))
            {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    walk(root);
}

fn write_atomic(root: &Path, file: &str, bytes: &Bytes) -> Result<(), String> {
    let path = root.join(file);
    let parent = path.parent().ok_or("no parent folder")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("no file name")?;
    let temp = parent.join(format!(".{name}.tmp"));
    let written = (|| {
        let mut out = std::fs::File::create(&temp)?;
        out.write_all(bytes)?;
        out.sync_all()
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(error.to_string());
    }
    let mut last = None;
    for attempt in 0..3 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(50));
        }
        match std::fs::rename(&temp, &path) {
            Ok(()) => return Ok(()),
            Err(error) => last = Some(error),
        }
    }
    let _ = std::fs::remove_file(&temp);
    Err(last.map_or_else(|| "rename failed".to_owned(), |error| error.to_string()))
}
