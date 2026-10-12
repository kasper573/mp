pub mod files;
pub mod history;
pub mod journal;
pub mod lock;
pub mod save;
pub mod watch;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use game::core::content::{Content, LoadError, LoadReport};

pub use files::{Bytes, Change, Files, hash, json_bytes, row_file, row_of};
pub use history::{History, Selection, Step};

use crate::schema::Shapes;
use crate::usages::Usages;

#[derive(Clone, Debug, Default)]
pub struct Edit {
    pub label: String,
    pub changes: Vec<Change>,
    pub merge: bool,
}

impl Edit {
    pub fn new(label: impl Into<String>) -> Edit {
        Edit {
            label: label.into(),
            changes: Vec::new(),
            merge: false,
        }
    }

    pub fn merging(mut self) -> Edit {
        self.merge = true;
        self
    }

    pub fn write(&mut self, file: impl Into<String>, bytes: Bytes) -> &mut Edit {
        let file = file.into();
        self.changes.retain(|change| change.file != file);
        self.changes.push(Change {
            file,
            bytes: Some(bytes),
        });
        self
    }

    pub fn write_json(&mut self, file: impl Into<String>, value: &serde_json::Value) -> &mut Edit {
        self.write(file, json_bytes(value))
    }

    pub fn remove(&mut self, file: impl Into<String>) -> &mut Edit {
        let file = file.into();
        self.changes.retain(|change| change.file != file);
        self.changes.push(Change { file, bytes: None });
        self
    }

    pub fn is_empty(&self) -> bool {
        self.changes.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Refusal {
    pub file: String,
    pub pointer: String,
    pub rule: &'static str,
    pub found: String,
    pub expected: String,
    pub nearest: Option<String>,
    pub errors: usize,
}

impl Refusal {
    pub fn of(report: &LoadReport) -> Refusal {
        let errors = report.errors.len();
        let first = report.errors.first().cloned().unwrap_or(LoadError {
            file: String::new(),
            at: game::core::content::ErrorPlace::WholeFile,
            rule: "not loaded",
            found: String::new(),
            expected: "a folder that loads".to_owned(),
            nearest: None,
        });
        let pointer = match &first.at {
            game::core::content::ErrorPlace::Json { pointer, .. } => pointer.clone(),
            _ => String::new(),
        };
        Refusal {
            file: first.file,
            pointer,
            rule: first.rule,
            found: first.found,
            expected: first.expected,
            nearest: first.nearest,
            errors,
        }
    }

    pub fn sentence(&self) -> String {
        let mut text = format!("{}: {}; expected {}", self.rule, self.found, self.expected);
        if let Some(nearest) = &self.nearest {
            text.push_str(&format!(" (nearest {nearest})"));
        }
        if self.errors > 1 {
            text.push_str(&format!(" · {} errors in all", self.errors));
        }
        text
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Viewpoint {
    pub selection: Selection,
    pub camera: Option<(String, [f32; 3])>,
}

pub struct Applied {
    pub viewpoint: Viewpoint,
    pub label: String,
}

pub struct Project {
    pub root: PathBuf,
    pub files: Files,
    pub disk: BTreeMap<String, String>,
    pub content: Option<Content>,
    pub report: Option<LoadReport>,
    pub history: History,
    pub saved_at: Option<usize>,
    pub usages: Usages,
    pub shapes: Arc<Shapes>,
    pub read_only: Option<String>,
    pub last_load: Option<std::time::Duration>,
    pub last_usages: Option<std::time::Duration>,
    pub generation: u64,
    pub outside_rewrote: usize,
}

impl Project {
    pub fn open(root: &Path, shapes: Arc<Shapes>) -> Result<Project, String> {
        if !root.join("game.json").is_file() {
            return Err("No game.json in this folder".to_owned());
        }
        save::clean_leftovers(root);
        let files = Files::read_dir(root).map_err(|error| error.to_string())?;
        let disk = files
            .map
            .iter()
            .map(|(path, bytes)| (path.clone(), hash(bytes)))
            .collect();
        let mut project = Project {
            root: root.to_path_buf(),
            files,
            disk,
            content: None,
            report: None,
            history: History::default(),
            saved_at: Some(0),
            usages: Usages::default(),
            shapes,
            read_only: None,
            last_load: None,
            last_usages: None,
            generation: 0,
            outside_rewrote: 0,
        };
        project.reload();
        Ok(project)
    }

    pub fn name(&self) -> String {
        self.files
            .json("game.json")
            .and_then(|game| game["name"].as_str().map(str::to_owned))
            .unwrap_or_else(|| {
                self.root
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default()
            })
    }

    pub fn loads(&self) -> bool {
        self.report.is_none() && self.content.is_some()
    }

    pub fn reload(&mut self) {
        match load(&self.files, &self.root.display().to_string()) {
            Ok((content, took)) => {
                self.last_load = Some(took);
                self.report = None;
                self.swap(content);
            }
            Err(report) => self.report = Some(report),
        }
    }

    pub fn apply(&mut self, edit: Edit, viewpoint: Viewpoint) -> Result<(), Box<Refusal>> {
        if let Some(reason) = &self.read_only {
            return Err(Box::new(Refusal {
                file: String::new(),
                pointer: String::new(),
                rule: "read-only",
                found: reason.clone(),
                expected: "a folder this editor may write".to_owned(),
                nearest: None,
                errors: 1,
            }));
        }
        let changes: Vec<Change> = edit
            .changes
            .into_iter()
            .filter(
                |change| match (&change.bytes, self.files.get(&change.file)) {
                    (Some(new), Some(old)) => new[..] != old[..],
                    (None, None) => false,
                    _ => true,
                },
            )
            .collect();
        if changes.is_empty() {
            return Ok(());
        }
        let next = self.files.with(&changes);
        let (content, took) = load(&next, &self.root.display().to_string())
            .map_err(|report| Box::new(Refusal::of(&report)))?;
        let before: Vec<Change> = changes
            .iter()
            .map(|change| Change {
                file: change.file.clone(),
                bytes: self.files.get(&change.file).cloned(),
            })
            .collect();
        self.files = next;
        self.last_load = Some(took);
        self.report = None;
        self.swap(content);
        if !(edit.merge && self.history.merge_into_last(&edit.label, changes.clone())) {
            self.history.push(Step {
                label: edit.label,
                before,
                after: changes,
                selection: viewpoint.selection,
                camera: viewpoint.camera,
                at: SystemTime::now(),
            });
        }
        Ok(())
    }

    pub fn undo(&mut self) -> Result<Option<Applied>, Box<Refusal>> {
        let Some(step) = self.history.undo_step() else {
            return Ok(None);
        };
        let viewpoint = Viewpoint {
            selection: step.selection.clone(),
            camera: step.camera.clone(),
        };
        let label = step.label.clone();
        let changes = step.before.clone();
        self.restore(&changes)?;
        self.history.undone();
        Ok(Some(Applied { viewpoint, label }))
    }

    pub fn redo(&mut self) -> Result<Option<Applied>, Box<Refusal>> {
        let Some(step) = self.history.redo_step() else {
            return Ok(None);
        };
        let viewpoint = Viewpoint {
            selection: step.selection.clone(),
            camera: step.camera.clone(),
        };
        let label = step.label.clone();
        let changes = step.after.clone();
        self.restore(&changes)?;
        self.history.redone();
        Ok(Some(Applied { viewpoint, label }))
    }

    pub fn jump(&mut self, index: usize) -> Result<Option<Applied>, Box<Refusal>> {
        let mut last = None;
        while self.history.applied() > index {
            match self.undo()? {
                Some(applied) => last = Some(applied),
                None => break,
            }
        }
        while self.history.applied() < index {
            match self.redo()? {
                Some(applied) => last = Some(applied),
                None => break,
            }
        }
        Ok(last)
    }

    fn restore(&mut self, changes: &[Change]) -> Result<(), Box<Refusal>> {
        let next = self.files.with(changes);
        let (content, took) = load(&next, &self.root.display().to_string())
            .map_err(|report| Box::new(Refusal::of(&report)))?;
        self.files = next;
        self.last_load = Some(took);
        self.report = None;
        self.swap(content);
        Ok(())
    }

    pub fn unsaved(&self) -> Vec<String> {
        let mut paths: Vec<String> = self
            .files
            .map
            .iter()
            .filter(|(path, bytes)| self.disk.get(*path) != Some(&hash(bytes)))
            .map(|(path, _)| path.clone())
            .collect();
        paths.extend(
            self.disk
                .keys()
                .filter(|path| !self.files.map.contains_key(*path))
                .cloned(),
        );
        paths.sort();
        paths
    }

    pub fn is_unsaved(&self, path: &str) -> bool {
        match self.files.get(path) {
            Some(bytes) => self.disk.get(path) != Some(&hash(bytes)),
            None => self.disk.contains_key(path),
        }
    }

    pub fn save(&mut self) -> Result<save::SaveOutcome, save::SaveError> {
        let outcome = save::save(&self.root, &self.files, &mut self.disk);
        if outcome.is_ok() {
            self.saved_at = Some(self.history.applied());
        }
        outcome
    }

    pub fn outside_changes(&mut self, paths: Option<Vec<String>>) -> OutsideChanges {
        let mut taken = Vec::new();
        let mut conflicts = Vec::new();
        let candidates: Vec<String> = match paths {
            Some(paths) => paths,
            None => Files::read_dir(&self.root)
                .map(|files| {
                    let mut all: Vec<String> = files.map.keys().cloned().collect();
                    all.extend(self.disk.keys().cloned());
                    all.sort();
                    all.dedup();
                    all
                })
                .unwrap_or_default(),
        };
        for path in candidates {
            let on_disk = std::fs::read(self.root.join(&path)).ok().map(Bytes::from);
            let disk_hash = on_disk.as_ref().map(|bytes| hash(bytes));
            if disk_hash == self.disk.get(&path).cloned() {
                continue;
            }
            let edited_here = self.is_unsaved(&path);
            match disk_hash {
                Some(hash) => self.disk.insert(path.clone(), hash),
                None => self.disk.remove(&path),
            };
            if edited_here {
                conflicts.push(Conflict {
                    file: path,
                    disk: on_disk,
                });
            } else {
                match on_disk {
                    Some(bytes) => self.files.map.insert(path.clone(), bytes),
                    None => self.files.map.remove(&path),
                };
                taken.push(path);
            }
        }
        if !taken.is_empty() {
            self.history.clear();
            self.reload();
            self.outside_rewrote = match self.report {
                Some(_) => taken.len(),
                None => 0,
            };
        }
        OutsideChanges { taken, conflicts }
    }

    pub fn take_disk(&mut self, conflict: &Conflict) {
        match &conflict.disk {
            Some(bytes) => self.files.map.insert(conflict.file.clone(), bytes.clone()),
            None => self.files.map.remove(&conflict.file),
        };
        self.history.clear();
        self.saved_at = Some(0);
        self.reload();
    }

    fn swap(&mut self, content: Content) {
        if let Some(old) = self.content.take() {
            game::systems::script::condition::forget_compiled();
            // SAFETY: the editor reads rows from the current content only within a frame and keeps
            // no `&'static` across a swap; worlds built on this content are dropped before it.
            unsafe { old.release() };
        }
        let started = Instant::now();
        self.usages = Usages::build(&content, &self.files);
        self.last_usages = Some(started.elapsed());
        self.content = Some(content);
        self.generation += 1;
    }
}

pub struct OutsideChanges {
    pub taken: Vec<String>,
    pub conflicts: Vec<Conflict>,
}

#[derive(Clone)]
pub struct Conflict {
    pub file: String,
    pub disk: Option<Bytes>,
}

pub fn load(files: &Files, name: &str) -> Result<(Content, std::time::Duration), LoadReport> {
    let started = Instant::now();
    let folder = Arc::new(files.folder(name));
    game::systems::load_content(folder, "the folder did not load")
        .map(|content| (content, started.elapsed()))
}
