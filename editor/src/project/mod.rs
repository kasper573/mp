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
use std::sync::mpsc::{self, TryRecvError};
use std::time::{Duration, Instant, SystemTime};

use engine::core::content::ErrorPlace::{Json, WholeFile};
use engine::core::content::{Content, ContentProblem, LoadError, LoadReport};
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems;

use crate::app::ChannelInbox;
use crate::schema::SchemaShapes;
use crate::usages::ContentUsages;
use crate::value;
use crate::views::script::nodes::NodeCatalogue;

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

    pub fn update_json(
        &mut self,
        files: &ProjectFiles,
        file: &str,
        update: impl FnOnce(&mut serde_json::Value) -> Option<()>,
    ) -> Option<()> {
        let mut json = match self.changes.iter().find(|change| change.file == file) {
            Some(FileChange {
                bytes: Some(bytes), ..
            }) => serde_json::from_slice(bytes).ok()?,
            Some(FileChange { bytes: None, .. }) => return None,
            None => files.json_owned(file)?,
        };
        update(&mut json)?;
        self.write_json(file, &json);
        Some(())
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
    pub problem: ContentProblem,
    pub errors: usize,
}

impl EditRefusal {
    pub fn of(report: &LoadReport) -> EditRefusal {
        let errors = report.errors.len();
        let first = report.errors.first().cloned().unwrap_or(LoadError {
            file: String::new(),
            at: WholeFile,
            problem: ContentProblem::new("not loaded", "", "a folder that loads"),
        });
        let pointer = match &first.at {
            Json { pointer, .. } => pointer.clone(),
            _ => String::new(),
        };
        EditRefusal {
            file: first.file,
            pointer,
            problem: first.problem,
            errors,
        }
    }

    pub fn sentence(&self) -> String {
        let mut text = self.problem.to_string();
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
    pub content: Option<Content>,
    pub report: Option<LoadReport>,
    pub history: EditHistory,
    pub usages: ContentUsages,
    pub shapes: Arc<SchemaShapes>,
    pub read_only: Option<String>,
    pub last_load: Option<Duration>,
    pub last_usages: Option<Duration>,
    pub generation: u64,
    pub outside_rewrote: usize,
    pub catalogue: NodeCatalogue,
    loading: Option<Loading>,
    stale: bool,
    good: ProjectFiles,
    good_applied: usize,
}

// An edit is adopted at once and its content loaded on a thread, so the interface never waits on
// a load; the files the current content came from are kept to fall back on when later ones turn
// out not to load.
struct Loading {
    receiver: ChannelInbox<Result<Loaded, LoadReport>>,
    applied: usize,
}

struct Loaded {
    content: Content,
    usages: ContentUsages,
    catalogue: NodeCatalogue,
    files: ProjectFiles,
    took: Duration,
    usages_took: Duration,
}

/// An edit that was adopted and then refused once its content was loaded: the files are back to
/// the last that loaded, and this says which step went and why.
pub struct LateRefusal {
    pub label: String,
    pub refusal: Box<EditRefusal>,
}

impl Project {
    pub fn open(root: &Path, shapes: Arc<SchemaShapes>) -> Result<Project, String> {
        if !root.join(GAME_FILE).is_file() {
            return Err(format!("No {GAME_FILE} in this folder"));
        }
        save::clean_leftovers(root);
        let files = ProjectFiles::read_dir(root).map_err(|error| error.to_string())?;
        let disk = files.hashes();
        let catalogue = NodeCatalogue::build(shapes.shape_of("script"), None);
        let mut project = Project {
            root: root.to_path_buf(),
            good: files.clone(),
            good_applied: 0,
            loading: None,
            stale: false,
            files,
            disk,
            content: None,
            report: None,
            history: EditHistory::default(),
            usages: ContentUsages::default(),
            shapes,
            read_only: None,
            last_load: None,
            last_usages: None,
            generation: 0,
            outside_rewrote: 0,
            catalogue,
        };
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

    /// Loads the files as they stand, waiting for it: for opening a folder and taking in what
    /// changed on disk, when there is nothing to show yet anyway.
    pub fn reload(&mut self) {
        self.loading = None;
        self.stale = false;
        match load(&self.files, &self.root.display().to_string()) {
            Ok((content, took)) => {
                let loaded = Loaded::build(content, &self.files, &self.shapes, took);
                self.report = None;
                self.install(loaded, self.history.applied());
            }
            Err(report) => self.report = Some(report),
        }
    }

    /// Whether an adopted edit's content is still loading.
    pub fn loading(&self) -> bool {
        self.loading.is_some()
    }

    /// Takes in a load that finished. Content that loaded is swapped in; files that did not are
    /// rolled back to the last that did, unless newer files are already waiting to be loaded,
    /// which then get their own say.
    pub fn poll(&mut self) -> Option<LateRefusal> {
        let loading = self.loading.as_ref()?;
        let outcome = match loading.receiver.try_recv() {
            Ok(outcome) => outcome,
            Err(TryRecvError::Empty) => return None,
            Err(TryRecvError::Disconnected) => {
                self.loading = None;
                return None;
            }
        };
        let applied = loading.applied;
        self.loading = None;
        self.take(outcome, applied)
    }

    /// Waits out every pending load, so what is saved or asked of the content is what loaded.
    pub fn settle(&mut self) -> Vec<LateRefusal> {
        let mut late = Vec::new();
        while let Some(loading) = &self.loading {
            let applied = loading.applied;
            let outcome = loading.receiver.recv();
            self.loading = None;
            if let Some(outcome) = outcome {
                late.extend(self.take(outcome, applied));
            }
        }
        late
    }

    fn take(&mut self, outcome: Result<Loaded, LoadReport>, applied: usize) -> Option<LateRefusal> {
        let late = match outcome {
            Ok(loaded) => {
                self.report = None;
                self.install(loaded, applied);
                None
            }
            Err(_) if self.stale => None,
            Err(report) => {
                let label = self
                    .history
                    .steps()
                    .get(self.good_applied)
                    .map(|step| step.label.clone())
                    .unwrap_or_default();
                self.files = self.good.clone();
                self.history.rewind(self.good_applied);
                Some(LateRefusal {
                    label,
                    refusal: Box::new(EditRefusal::of(&report)),
                })
            }
        };
        if std::mem::take(&mut self.stale) {
            self.begin_load();
        }
        late
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
                problem: ContentProblem::new(
                    "read-only",
                    reason.clone(),
                    "a folder this editor may write",
                ),
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
        self.adopt(next);
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
        self.adopt(next);
        Ok(())
    }

    pub fn check(&self, edit: &ContentEdit) -> Result<(), Box<EditRefusal>> {
        let next = self.files.with(&edit.changes);
        load(&next, &self.root.display().to_string())
            .map_err(|report| Box::new(EditRefusal::of(&report)))?;
        Ok(())
    }

    fn adopt(&mut self, next: ProjectFiles) {
        self.files = next;
        self.begin_load();
    }

    fn begin_load(&mut self) {
        if self.loading.is_some() {
            self.stale = true;
            return;
        }
        let files = self.files.clone();
        let name = self.root.display().to_string();
        let shapes = self.shapes.clone();
        let (sender, receiver) = mpsc::channel();
        self.loading = Some(Loading {
            receiver: ChannelInbox::new(receiver),
            applied: self.history.applied(),
        });
        std::thread::spawn(move || {
            let outcome = load(&files, &name)
                .map(|(content, took)| Loaded::build(content, &files, &shapes, took));
            let _ = sender.send(outcome);
        });
    }

    fn install(&mut self, loaded: Loaded, applied: usize) {
        self.last_load = Some(loaded.took);
        self.last_usages = Some(loaded.usages_took);
        self.usages = loaded.usages;
        self.catalogue = loaded.catalogue;
        self.content = Some(loaded.content);
        self.good = loaded.files;
        self.good_applied = applied;
        self.generation += 1;
    }

    pub fn unsaved(&self) -> Vec<String> {
        self.files
            .paths()
            .chain(self.disk.keys())
            .filter(|path| self.is_unsaved(path))
            .cloned()
            .collect::<std::collections::BTreeSet<String>>()
            .into_iter()
            .collect()
    }

    pub fn is_unsaved(&self, path: &str) -> bool {
        self.files.hash_of(path) != self.disk.get(path).map(String::as_str)
    }

    pub fn save(&mut self) -> Result<save::SaveOutcome, save::SaveError> {
        let outcome = save::save(&self.root, &self.files, &mut self.disk);
        if outcome.is_ok() {
            self.history.mark_saved();
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
        if !taken.is_empty() {
            self.history.reset();
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
        self.history.reset();
        self.reload();
    }
}

impl Loaded {
    fn build(
        content: Content,
        files: &ProjectFiles,
        shapes: &SchemaShapes,
        took: Duration,
    ) -> Loaded {
        let started = Instant::now();
        let usages = ContentUsages::build(&content, files);
        let catalogue = NodeCatalogue::build(shapes.shape_of("script"), Some(&content));
        Loaded {
            content,
            usages,
            catalogue,
            files: files.clone(),
            took,
            usages_took: started.elapsed(),
        }
    }
}

static NO_CATALOGUE: NodeCatalogue = NodeCatalogue {
    entries: Vec::new(),
    events: Vec::new(),
};

pub fn catalogue_of(project: Option<&Project>) -> &NodeCatalogue {
    project.map_or(&NO_CATALOGUE, |project| &project.catalogue)
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
