pub mod files;
pub mod history;
pub mod journal;
pub mod lock;
pub mod save;
pub mod watch;

pub use files::{
    FileBytes, FileChange, GAME_FILE, ProjectFiles, hash, json_bytes, row_file, row_of, text_bytes,
};
pub use history::{EditHistory, EditStep, RowSelection};

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use game::core::content::ErrorPlace::{Json, WholeFile};
use game::core::content::{Content, LoadError, LoadReport};
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems;
use game::systems::script::condition;

use crate::schema::SchemaShapes;
use crate::usages::ContentUsages;
use crate::value;

#[derive(Clone, Debug, Default)]
pub struct ContentEdit {
    pub label: String,
    pub changes: Vec<FileChange>,
    pub merge: bool,
}

impl ContentEdit {
    pub fn new(label: impl Into<String>) -> ContentEdit {
        ContentEdit {
            label: label.into(),
            changes: Vec::new(),
            merge: false,
        }
    }

    pub fn merging(mut self) -> ContentEdit {
        self.merge = true;
        self
    }

    pub fn write(&mut self, file: impl Into<String>, bytes: FileBytes) -> &mut ContentEdit {
        let file = file.into();
        self.changes.retain(|change| change.file != file);
        self.changes.push(FileChange {
            file,
            bytes: Some(bytes),
        });
        self
    }

    pub fn write_json(
        &mut self,
        file: impl Into<String>,
        value: &serde_json::Value,
    ) -> &mut ContentEdit {
        self.write(file, json_bytes(value))
    }

    pub fn write_row<T: serde::Serialize>(
        &mut self,
        file: impl Into<String>,
        row: &T,
    ) -> &mut ContentEdit {
        self.write_json(file, &value::json(row).unwrap_or_default())
    }

    pub fn remove(&mut self, file: impl Into<String>) -> &mut ContentEdit {
        let file = file.into();
        self.changes.retain(|change| change.file != file);
        self.changes.push(FileChange { file, bytes: None });
        self
    }

    pub fn is_empty(&self) -> bool {
        self.changes.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditRefusal {
    pub file: String,
    pub pointer: String,
    pub rule: &'static str,
    pub found: String,
    pub expected: String,
    pub nearest: Option<String>,
    pub errors: usize,
}

impl EditRefusal {
    pub fn of(report: &LoadReport) -> EditRefusal {
        let errors = report.errors.len();
        let first = report.errors.first().cloned().unwrap_or(LoadError {
            file: String::new(),
            at: WholeFile,
            rule: "not loaded",
            found: String::new(),
            expected: "a folder that loads".to_owned(),
            nearest: None,
        });
        let pointer = match &first.at {
            Json { pointer, .. } => pointer.clone(),
            _ => String::new(),
        };
        EditRefusal {
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
pub struct EditViewpoint {
    pub selection: RowSelection,
    pub camera: Option<AreaCameraState>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AreaCameraState {
    pub area: String,
    pub center: Pos<Tiles>,
    pub zoom: f32,
}

pub struct AppliedStep {
    pub viewpoint: EditViewpoint,
    pub label: String,
}

pub struct Project {
    pub root: PathBuf,
    pub files: ProjectFiles,
    pub disk: BTreeMap<String, String>,
    unsaved: Vec<String>,
    pub content: Option<Content>,
    retired: Vec<Content>,
    pub report: Option<LoadReport>,
    pub history: EditHistory,
    pub saved_at: Option<usize>,
    pub usages: ContentUsages,
    pub shapes: Arc<SchemaShapes>,
    pub read_only: Option<String>,
    pub last_load: Option<Duration>,
    pub last_usages: Option<Duration>,
    pub generation: u64,
    pub outside_rewrote: usize,
}

impl Project {
    pub fn open(root: &Path, shapes: Arc<SchemaShapes>) -> Result<Project, String> {
        if !root.join(GAME_FILE).is_file() {
            return Err(format!("No {GAME_FILE} in this folder"));
        }
        save::clean_leftovers(root);
        let files = ProjectFiles::read_dir(root).map_err(|error| error.to_string())?;
        let disk = files.hashes();
        let mut project = Project {
            root: root.to_path_buf(),
            files,
            disk,
            unsaved: Vec::new(),
            content: None,
            retired: Vec::new(),
            report: None,
            history: EditHistory::default(),
            saved_at: Some(0),
            usages: ContentUsages::default(),
            shapes,
            read_only: None,
            last_load: None,
            last_usages: None,
            generation: 0,
            outside_rewrote: 0,
        };
        project.refresh_unsaved();
        project.reload();
        Ok(project)
    }

    pub fn name(&self) -> String {
        self.files
            .json(GAME_FILE)
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

    pub fn apply(
        &mut self,
        edit: ContentEdit,
        viewpoint: EditViewpoint,
    ) -> Result<(), Box<EditRefusal>> {
        if let Some(reason) = &self.read_only {
            return Err(Box::new(EditRefusal {
                file: String::new(),
                pointer: String::new(),
                rule: "read-only",
                found: reason.clone(),
                expected: "a folder this editor may write".to_owned(),
                nearest: None,
                errors: 1,
            }));
        }
        let changes: Vec<FileChange> = edit
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
        let before: Vec<FileChange> = changes
            .iter()
            .map(|change| FileChange {
                file: change.file.clone(),
                bytes: self.files.get(&change.file).cloned(),
            })
            .collect();
        let next = self.files.with(&changes);
        self.adopt(next)?;
        if !(edit.merge && self.history.merge_into_last(&edit.label, changes.clone())) {
            self.history.push(EditStep {
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

    pub fn undo(&mut self) -> Result<Option<AppliedStep>, Box<EditRefusal>> {
        let Some(step) = self.history.undo_step() else {
            return Ok(None);
        };
        let viewpoint = EditViewpoint {
            selection: step.selection.clone(),
            camera: step.camera.clone(),
        };
        let label = step.label.clone();
        let changes = step.before.clone();
        self.restore(&changes)?;
        self.history.undone();
        Ok(Some(AppliedStep { viewpoint, label }))
    }

    pub fn redo(&mut self) -> Result<Option<AppliedStep>, Box<EditRefusal>> {
        let Some(step) = self.history.redo_step() else {
            return Ok(None);
        };
        let viewpoint = EditViewpoint {
            selection: step.selection.clone(),
            camera: step.camera.clone(),
        };
        let label = step.label.clone();
        let changes = step.after.clone();
        self.restore(&changes)?;
        self.history.redone();
        Ok(Some(AppliedStep { viewpoint, label }))
    }

    pub fn jump(&mut self, index: usize) -> Result<Option<AppliedStep>, Box<EditRefusal>> {
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

    fn restore(&mut self, changes: &[FileChange]) -> Result<(), Box<EditRefusal>> {
        let next = self.files.with(changes);
        self.adopt(next)
    }

    pub fn check(&self, edit: &ContentEdit) -> Result<(), Box<EditRefusal>> {
        let next = self.files.with(&edit.changes);
        let (content, _) = load(&next, &self.root.display().to_string())
            .map_err(|report| Box::new(EditRefusal::of(&report)))?;
        // SAFETY: the content was loaded only to check the edit and nothing was taken out of it.
        unsafe { content.release() };
        Ok(())
    }

    fn adopt(&mut self, next: ProjectFiles) -> Result<(), Box<EditRefusal>> {
        let (content, took) = load(&next, &self.root.display().to_string())
            .map_err(|report| Box::new(EditRefusal::of(&report)))?;
        self.files = next;
        self.refresh_unsaved();
        self.last_load = Some(took);
        self.report = None;
        self.swap(content);
        Ok(())
    }

    pub fn unsaved(&self) -> &[String] {
        &self.unsaved
    }

    pub fn is_unsaved(&self, path: &str) -> bool {
        self.unsaved
            .binary_search_by(|p| p.as_str().cmp(path))
            .is_ok()
    }

    fn refresh_unsaved(&mut self) {
        let mut paths: Vec<String> = self
            .files
            .paths()
            .filter(|path| self.files.hash_of(path) != self.disk.get(*path).map(String::as_str))
            .cloned()
            .collect();
        paths.extend(
            self.disk
                .keys()
                .filter(|path| self.files.get(path).is_none())
                .cloned(),
        );
        paths.sort();
        self.unsaved = paths;
    }

    pub fn save(&mut self) -> Result<save::SaveOutcome, save::SaveError> {
        let outcome = save::save(&self.root, &self.files, &mut self.disk);
        self.refresh_unsaved();
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
            None => ProjectFiles::read_dir(&self.root)
                .map(|files| {
                    let mut all: Vec<String> = files.paths().cloned().collect();
                    all.extend(self.disk.keys().cloned());
                    all.sort();
                    all.dedup();
                    all
                })
                .unwrap_or_default(),
        };
        for path in candidates {
            let on_disk = std::fs::read(self.root.join(&path))
                .ok()
                .map(FileBytes::from);
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
                conflicts.push(FileConflict {
                    file: path,
                    disk: on_disk,
                });
            } else {
                match on_disk {
                    Some(bytes) => self.files.insert(path.clone(), bytes),
                    None => self.files.remove(&path),
                }
                taken.push(path);
            }
        }
        self.refresh_unsaved();
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

    pub fn take_disk(&mut self, conflict: &FileConflict) {
        match &conflict.disk {
            Some(bytes) => self.files.insert(conflict.file.clone(), bytes.clone()),
            None => self.files.remove(&conflict.file),
        }
        self.refresh_unsaved();
        self.history.clear();
        self.saved_at = Some(0);
        self.reload();
    }

    pub fn has_retired(&self) -> bool {
        !self.retired.is_empty()
    }

    pub fn release_retired(&mut self) {
        for content in self.retired.drain(..) {
            // SAFETY: content retires mid-frame, while that frame may still read it, and is only
            // released by `Editor::release_retired` at the start of a later frame, when no
            // frame-local handle survives and after the views dropped the worlds built on it.
            unsafe { content.release() };
        }
    }

    fn swap(&mut self, content: Content) {
        if let Some(old) = self.content.take() {
            condition::forget_compiled();
            self.retired.push(old);
        }
        let started = Instant::now();
        self.usages = ContentUsages::build(&content, &self.files);
        self.last_usages = Some(started.elapsed());
        self.content = Some(content);
        self.generation += 1;
    }
}

pub struct OutsideChanges {
    pub taken: Vec<String>,
    pub conflicts: Vec<FileConflict>,
}

#[derive(Clone)]
pub struct FileConflict {
    pub file: String,
    pub disk: Option<FileBytes>,
}

pub fn load(files: &ProjectFiles, name: &str) -> Result<(Content, Duration), LoadReport> {
    let started = Instant::now();
    let folder = Arc::new(files.folder(name));
    systems::load_content(folder, "the folder did not load")
        .map(|content| (content, started.elapsed()))
}
