pub mod files;
pub mod history;
pub mod journal;
pub mod lock;
pub mod save;
pub mod watch;

pub use files::{FileBytes, FileChange, ProjectFiles, hash, json_bytes, text_bytes};
pub use history::{EditHistory, EditStep, RowSelection};

use std::collections::{BTreeMap, BTreeSet};
use std::ops::Bound;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{self, TryRecvError};
use std::time::{Duration, Instant, SystemTime};

use engine::core::content::ErrorPlace::WholeFile;
use engine::core::content::{
    Content, ContentFile, ContentProblem, LoadError, LoadReport, MISSING_FILE, SETTINGS_FILE,
    table_of,
};
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems;
use engine::systems::script::ScriptDef;

use self::watch::FolderChange;
use crate::app::ChannelInbox;
use crate::schema::SchemaShapes;
use crate::unused::UnusedContent;
use crate::usages::ContentUsages;
use crate::value;
use crate::views::script::nodes::NodeCatalogue;

#[derive(Clone, Debug, Default)]
pub struct ContentEdit {
    pub label: String,
    pub changes: Vec<FileChange>,
    pub merge: bool,
    /// The label of the last step this edit joins, taking its own label, when that step is still
    /// the last one made.
    pub amends: Option<String>,
}

impl ContentEdit {
    pub fn new(label: impl Into<String>) -> ContentEdit {
        ContentEdit {
            label: label.into(),
            changes: Vec::new(),
            merge: false,
            amends: None,
        }
    }

    pub fn merging(mut self) -> ContentEdit {
        self.merge = true;
        self
    }

    pub fn amending(mut self, step: &str) -> ContentEdit {
        self.amends = Some(step.to_owned());
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
        let mut json = self.pending_json(files, file)?;
        update(&mut json)?;
        self.write_json(file, &json);
        Some(())
    }

    /// The file as it stands once this edit is applied, or `None` when the edit removes it.
    pub fn pending_json(&self, files: &ProjectFiles, file: &str) -> Option<serde_json::Value> {
        match self.changes.iter().find(|change| change.file == file) {
            Some(FileChange {
                bytes: Some(bytes), ..
            }) => serde_json::from_slice(bytes).ok(),
            Some(FileChange { bytes: None, .. }) => None,
            None => files.json_owned(file),
        }
    }

    /// The file's bytes once this edit is applied, or `None` when it has none by then.
    pub fn pending_bytes(&self, files: &ProjectFiles, file: &str) -> Option<FileBytes> {
        match self.changes.iter().find(|change| change.file == file) {
            Some(change) => change.bytes.clone(),
            None => files.get(file).cloned(),
        }
    }

    /// Writes every name of the `table` row `from` as `to` in a file beside a row that names rows.
    pub fn rename_beside(
        &mut self,
        files: &ProjectFiles,
        file: &str,
        table: &str,
        from: &str,
        to: &str,
    ) -> Option<()> {
        let bytes = self.pending_bytes(files, file)?;
        let text = std::str::from_utf8(&bytes).ok()?;
        let renamed = systems::registry().rename_beside(file, text, table, from, to)?;
        self.write(file.to_owned(), text_bytes(renamed));
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
        EditRefusal {
            pointer: first.at.pointer().to_owned(),
            file: first.file,
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

    pub fn place(&self) -> String {
        problem_place(&self.file, &self.pointer)
    }
}

/// Where in the folder a problem is: its file, and the JSON pointer within it when it has one.
pub fn problem_place(file: &str, pointer: &str) -> String {
    if pointer.is_empty() {
        file.to_owned()
    } else {
        format!("{file} at {pointer}")
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct EditViewpoint {
    pub selection: RowSelection,
    pub camera: Option<AreaCameraState>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AreaCameraState {
    /// The area or blueprint bundle the camera looks at.
    pub bundle: String,
    pub center: Pos<Tiles>,
    pub zoom: f32,
}

pub struct AppliedStep {
    pub viewpoint: EditViewpoint,
    pub label: String,
}

impl AppliedStep {
    fn of(step: &EditStep) -> AppliedStep {
        AppliedStep {
            viewpoint: EditViewpoint {
                selection: step.selection.clone(),
                camera: step.camera.clone(),
            },
            label: step.label.clone(),
        }
    }
}

pub struct Project {
    pub root: PathBuf,
    pub files: ProjectFiles,
    pub disk: BTreeMap<String, String>,
    pub content: Option<Content>,
    pub report: Option<LoadReport>,
    pub history: EditHistory,
    pub usages: ContentUsages,
    pub unused: UnusedContent,
    pub shapes: Arc<SchemaShapes>,
    pub read_only: Option<String>,
    pub last_load: Option<Duration>,
    pub last_usages: Option<Duration>,
    pub generation: u64,
    pub outside_rewrote: usize,
    /// The paths references name that were moved away on disk, while the folder doesn't load.
    pub moved_outside: Vec<MovedOutside>,
    pub catalogue: NodeCatalogue,
    loading: Option<Loading>,
    stale: bool,
}

// An edit is adopted at once and its content loaded on a thread, so the interface never waits on
// a load. Files that turn out not to load are kept as they are, with the load's report beside
// the last content that did load, so a half-finished row can be worked on until it loads again.
struct Loading {
    receiver: ChannelInbox<Result<Loaded, LoadReport>>,
}

struct Loaded {
    content: Content,
    usages: ContentUsages,
    unused: UnusedContent,
    took: Duration,
    usages_took: Duration,
}

/// The problems a load found in one file, by JSON pointer (an empty pointer for the file as a
/// whole).
pub fn errors_in(report: &LoadReport, file: &str) -> Vec<(String, String)> {
    report
        .errors
        .iter()
        .filter(|error| error.file == file)
        .map(|error| (error.at.pointer().to_owned(), error.problem.to_string()))
        .collect()
}

impl Project {
    pub fn open(root: &Path, shapes: Arc<SchemaShapes>) -> Result<Project, String> {
        if !root.join(SETTINGS_FILE).is_file() {
            return Err(format!("No {SETTINGS_FILE} in this folder"));
        }
        save::clean_leftovers(root);
        let files = ProjectFiles::read_dir(root).map_err(|error| error.to_string())?;
        let disk = files.hashes();
        let catalogue = NodeCatalogue::build(shapes.shape_of(ScriptDef::TABLE));
        let mut project = Project {
            root: root.to_path_buf(),
            loading: None,
            stale: false,
            files,
            disk,
            content: None,
            report: None,
            history: EditHistory::default(),
            usages: ContentUsages::default(),
            unused: UnusedContent::default(),
            shapes,
            read_only: None,
            last_load: None,
            last_usages: None,
            generation: 0,
            outside_rewrote: 0,
            moved_outside: Vec::new(),
            catalogue,
        };
        project.reload();
        Ok(project)
    }

    pub fn loads(&self) -> bool {
        self.report.is_none() && self.content.is_some()
    }

    /// Whether the files as read from disk stopped loading, as opposed to an edit made here, for
    /// more than files moved away from what names them, which the editor can point there.
    pub fn broken_on_disk(&self) -> bool {
        self.report.is_some() && self.outside_rewrote > 0 && !self.moves_explain_report()
    }

    /// Whether every problem of the load is a reference to a file moved away on disk.
    fn moves_explain_report(&self) -> bool {
        let Some(report) = &self.report else {
            return false;
        };
        let naming: BTreeSet<&str> = self
            .moved_outside
            .iter()
            .flat_map(|step| {
                self.usages
                    .of_content(&step.from)
                    .iter()
                    .chain(self.usages.of_media(&step.from))
            })
            .map(|usage| usage.file.as_str())
            .collect();
        !naming.is_empty()
            && report.errors.iter().all(|error| {
                error.problem.rule == MISSING_FILE && naming.contains(error.file.as_str())
            })
    }

    /// Loads the files as they stand, waiting for it: for opening a folder and taking in what
    /// changed on disk, when there is nothing to show yet anyway.
    pub fn reload(&mut self) {
        self.loading = None;
        self.stale = false;
        match load(&self.files, &self.root.display().to_string()) {
            Ok((content, took)) => {
                let loaded = Loaded::build(content, &self.files, took);
                self.report = None;
                self.install(loaded);
            }
            Err(report) => self.report = Some(report),
        }
    }

    /// Whether an adopted edit's content is still loading.
    pub fn loading(&self) -> bool {
        self.loading.is_some()
    }

    /// Takes in a load that finished, saying whether one did. Content that loaded is swapped in;
    /// a report on files that did not is kept, unless newer files are already waiting to be
    /// loaded, which then get their own say.
    pub fn poll(&mut self) -> bool {
        let Some(loading) = self.loading.as_ref() else {
            return false;
        };
        let outcome = match loading.receiver.try_recv() {
            Ok(outcome) => outcome,
            Err(TryRecvError::Empty) => return false,
            Err(TryRecvError::Disconnected) => {
                self.loading = None;
                return false;
            }
        };
        self.loading = None;
        self.take(outcome);
        true
    }

    /// Waits out every pending load, so what is saved or asked of the content is what loaded.
    pub fn settle(&mut self) {
        while self.loading.is_some() {
            let outcome = self
                .loading
                .take()
                .and_then(|loading| loading.receiver.recv());
            if let Some(outcome) = outcome {
                self.take(outcome);
            }
        }
    }

    fn take(&mut self, outcome: Result<Loaded, LoadReport>) {
        match outcome {
            Ok(loaded) => {
                self.report = None;
                self.install(loaded);
            }
            Err(_) if self.stale => {}
            Err(report) => self.report = Some(report),
        }
        if std::mem::take(&mut self.stale) {
            self.begin_load();
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
        let amended = edit.amends.as_deref().is_some_and(|step| {
            self.history
                .amend_last(step, &edit.label, changes.clone(), &before)
        });
        let merged =
            amended || (edit.merge && self.history.merge_into_last(&edit.label, changes.clone()));
        if !merged {
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

    pub fn undo(&mut self) -> Option<AppliedStep> {
        let step = self.history.undo_step()?;
        let (applied, changes) = (AppliedStep::of(step), step.before.clone());
        self.restore(&changes);
        self.history.undone();
        Some(applied)
    }

    pub fn redo(&mut self) -> Option<AppliedStep> {
        let step = self.history.redo_step()?;
        let (applied, changes) = (AppliedStep::of(step), step.after.clone());
        self.restore(&changes);
        self.history.redone();
        Some(applied)
    }

    pub fn jump(&mut self, index: usize) -> Option<AppliedStep> {
        let mut last = None;
        while self.history.applied() > index {
            let Some(applied) = self.undo() else {
                break;
            };
            last = Some(applied);
        }
        while self.history.applied() < index {
            let Some(applied) = self.redo() else {
                break;
            };
            last = Some(applied);
        }
        last
    }

    fn restore(&mut self, changes: &[FileChange]) {
        let next = self.files.with(changes);
        self.adopt(next);
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
        let (sender, receiver) = mpsc::channel();
        self.loading = Some(Loading {
            receiver: ChannelInbox::new(receiver),
        });
        std::thread::spawn(move || {
            let outcome =
                load(&files, &name).map(|(content, took)| Loaded::build(content, &files, took));
            let _ = sender.send(outcome);
        });
    }

    fn install(&mut self, loaded: Loaded) {
        self.moved_outside.clear();
        self.last_load = Some(loaded.took);
        self.last_usages = Some(loaded.usages_took);
        self.usages = loaded.usages;
        self.unused = loaded.unused;
        self.content = Some(loaded.content);
        self.generation += 1;
    }

    pub fn unsaved(&self) -> Vec<String> {
        self.files
            .entries()
            .chain(self.disk.keys())
            .filter(|path| self.is_unsaved(path))
            .cloned()
            .collect::<BTreeSet<String>>()
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

    pub fn outside_changes(&mut self, change: FolderChange) -> OutsideChanges {
        let mut taken = Vec::new();
        let mut conflicts = Vec::new();
        let candidates: Vec<String> = match change {
            FolderChange::Files(paths) => self.held_by(paths),
            FolderChange::Unknown => ProjectFiles::read_dir(&self.root)
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
            let on_disk = read_entry(&self.root, &path);
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
            self.reload_after_outside(taken.len());
        }
        OutsideChanges { taken, conflicts }
    }

    /// Every file and kept folder a change to `paths` may touch: each path itself and, for a
    /// folder or a bundle, everything it holds on disk and held before.
    fn held_by(&self, paths: Vec<String>) -> Vec<String> {
        let mut held: BTreeSet<String> = BTreeSet::new();
        for path in paths {
            let inside = files::folder_entry(&path);
            held.extend(self.files.paths_under(&inside).cloned());
            held.extend(
                self.disk
                    .range::<str, _>((Bound::Included(inside.as_str()), Bound::Unbounded))
                    .map(|(entry, _)| entry)
                    .take_while(|entry| entry.starts_with(&inside))
                    .cloned(),
            );
            let on_disk = self.root.join(&path);
            if on_disk.is_dir() {
                let walked = files::content_files(&on_disk).unwrap_or_default();
                held.extend(walked.into_iter().map(|file| format!("{inside}{file}")));
                if files::empty_folder(&on_disk).unwrap_or(false) {
                    held.insert(inside);
                }
            } else {
                held.insert(path);
            }
        }
        held.into_iter().collect()
    }

    pub fn take_disk(&mut self, conflict: &FileConflict) {
        match &conflict.disk {
            Some(bytes) => self.files.insert(conflict.file.clone(), bytes.clone()),
            None => self.files.remove(&conflict.file),
        }
        self.reload_after_outside(1);
    }

    /// Files rewritten from outside start the history over and are loaded again; if that load
    /// fails, the count says how many files the failure came in with.
    fn reload_after_outside(&mut self, rewrote: usize) {
        self.history.reset();
        self.reload();
        self.outside_rewrote = if self.report.is_some() { rewrote } else { 0 };
        self.moved_outside = match self.report {
            Some(_) => moved_outside(&self.usages, &self.files),
            None => Vec::new(),
        };
    }
}

impl Loaded {
    fn build(content: Content, files: &ProjectFiles, took: Duration) -> Loaded {
        let started = Instant::now();
        let usages = ContentUsages::build(&content, files);
        let unused = UnusedContent::find(files, &usages);
        Loaded {
            content,
            usages,
            unused,
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

/// A path the folder's references name that is gone from disk, and the one file of the same
/// name and type now found elsewhere in the folder.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MovedOutside {
    pub from: String,
    pub to: String,
    pub references: usize,
}

/// Every path named at the last load that is gone now, with where a file of its name and type is.
fn moved_outside(usages: &ContentUsages, files: &ProjectFiles) -> Vec<MovedOutside> {
    let index = files.index();
    let name = |path: &str| path.rsplit('/').next().unwrap_or(path).to_owned();
    let found = |from: &str, candidates: Vec<&str>| {
        let mut same = candidates
            .into_iter()
            .filter(|path| name(path) == name(from));
        match (same.next(), same.next()) {
            (Some(only), None) => Some(only.to_owned()),
            _ => None,
        }
    };
    let content = usages.content().filter_map(|(from, uses)| {
        let table = table_of(from)?;
        if index.is_content(from) {
            return None;
        }
        let to = found(from, index.paths_of(table).collect())?;
        Some(MovedOutside {
            from: from.to_owned(),
            to,
            references: uses.len(),
        })
    });
    let media = usages.media().filter_map(|(from, uses)| {
        if index.media.contains(from) {
            return None;
        }
        let to = found(from, index.media.iter().map(String::as_str).collect())?;
        Some(MovedOutside {
            from: from.to_owned(),
            to,
            references: uses.len(),
        })
    });
    let mut moved: Vec<MovedOutside> = content.chain(media).collect();
    moved.sort_by(|a, b| a.from.cmp(&b.from));
    moved
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

/// What is at `entry` on disk: a file's bytes, or nothing for a kept folder that stays empty.
fn read_entry(root: &Path, entry: &str) -> Option<FileBytes> {
    if files::is_folder(entry) {
        let folder = root.join(entry);
        return files::empty_folder(&folder)
            .unwrap_or(false)
            .then(|| FileBytes::from([]));
    }
    std::fs::read(root.join(entry)).ok().map(FileBytes::from)
}

pub fn load(files: &ProjectFiles, name: &str) -> Result<(Content, Duration), LoadReport> {
    let started = Instant::now();
    let folder = Arc::new(files.folder(name));
    systems::load_content(folder, "the folder did not load")
        .map(|content| (content, started.elapsed()))
}
