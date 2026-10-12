use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use bevy::prelude::*;
use bevy_egui::{EguiContext, EguiPlugin, EguiPrimaryContextPass, PrimaryEguiContext};
use egui_dock::DockState;
use serde_json::Value;

use crate::forms::FormState;
use crate::project::journal::{Journal, JournalData, JournalFile};
use crate::project::lock::Lock;
use crate::project::watch::Watcher;
use crate::project::{Conflict, Edit, Project, Refusal, Selection, Viewpoint};
use crate::schema::Shapes;
use crate::tabs::Tab;
use crate::user::{Settings, UserFolder};

#[derive(Clone, Debug, Default)]
pub struct Launch {
    pub folder: Option<PathBuf>,
    pub scene: Option<String>,
    pub user: Option<PathBuf>,
}

pub struct EditorPlugin {
    pub launch: Launch,
}

impl Plugin for EditorPlugin {
    fn build(&self, app: &mut App) {
        let user = match &self.launch.user {
            Some(root) => UserFolder::at(root.clone()),
            None => UserFolder::locate(),
        };
        let settings = user.load_settings();
        let mut editor = Editor::new(user, settings);
        editor.scene = self.launch.scene.clone();
        if let Some(folder) = &self.launch.folder {
            editor.open_folder(folder);
        }
        app.add_plugins((EguiPlugin::default(), bevy_tilemap::TilemapPlugin))
            .insert_resource(editor)
            .add_systems(Startup, setup_camera)
            .add_systems(EguiPrimaryContextPass, editor_ui)
            .add_systems(Update, background);
    }
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((Camera2d, PrimaryEguiContext, crate::views::EditorCamera));
}

#[derive(Resource)]
pub struct Editor {
    pub user: UserFolder,
    pub settings: Settings,
    pub shapes: Arc<Shapes>,
    pub project: Option<Project>,
    pub lock: Option<Lock>,
    pub watcher: Option<Watcher>,
    pub journal: Option<Journal>,
    pub dock: DockState<Tab>,
    pub panels: Panels,
    pub status: StatusBar,
    pub last_refusal: Option<Refusal>,
    pub history_focus: Option<usize>,
    pub themed: bool,
    pub selection: Selection,
    pub form: FormState,
    pub output: Output,
    pub dialogs: Vec<Dialog>,
    pub toast: Option<(String, Instant)>,
    pub start: StartScreen,
    pub open_tabs: Vec<Tab>,
    pub scene: Option<String>,
    pub clipboard: Option<Value>,
    pub views: crate::views::Views,
    pub play: crate::play::Play,
    pub imports: crate::import::Imports,
    pub jobs: crate::import::Jobs,
    pub pick: Option<PickRequest>,
    pub quit: bool,
    pub frame: u64,
}

#[derive(Default)]
pub struct Output {
    pub lines: Vec<OutputLine>,
}

#[derive(Clone)]
pub struct OutputLine {
    pub tag: &'static str,
    pub text: String,
}

pub const OUTPUT_KEPT: usize = 20_000;

impl Output {
    pub fn say(&mut self, tag: &'static str, text: impl Into<String>) {
        let text = text.into();
        eprintln!("[{tag}] {text}");
        self.lines.push(OutputLine { tag, text });
        if self.lines.len() > OUTPUT_KEPT {
            let drop = self.lines.len() - OUTPUT_KEPT;
            self.lines.drain(..drop);
        }
    }

    pub fn text(&self) -> String {
        self.lines
            .iter()
            .map(|line| format!("[{}] {}", line.tag, line.text))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[derive(Default)]
pub struct Panels {
    pub left: LeftTab,
    pub right: RightTab,
    pub bottom: BottomTab,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LeftTab {
    #[default]
    Content,
    Assets,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RightTab {
    #[default]
    Inspector,
    UsedBy,
    Preview,
    Conflicts,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BottomTab {
    #[default]
    History,
    Output,
    Palette,
    Blueprints,
    MayDo,
    UsedBy,
    Run,
    Timeline,
    Sheet,
    Sounds,
    Surfaces,
    Mixes,
    Listen,
}

impl BottomTab {
    pub fn title(self) -> &'static str {
        match self {
            BottomTab::History => "History",
            BottomTab::Output => "Output",
            BottomTab::Palette => "Palette",
            BottomTab::Blueprints => "Blueprints",
            BottomTab::MayDo => "May do",
            BottomTab::UsedBy => "Used by",
            BottomTab::Run => "Run",
            BottomTab::Timeline => "Timeline",
            BottomTab::Sheet => "Sheet",
            BottomTab::Sounds => "Sounds",
            BottomTab::Surfaces => "Surfaces",
            BottomTab::Mixes => "Mixes",
            BottomTab::Listen => "Listen",
        }
    }
}

#[derive(Default)]
pub struct StatusBar {
    pub left: Vec<String>,
    pub right: Vec<String>,
}

#[derive(Default)]
pub struct StartScreen {
    pub failed: Option<(PathBuf, String)>,
    pub report: Option<(PathBuf, String)>,
    pub watch: Option<Watcher>,
    pub recover: Option<(PathBuf, JournalData)>,
}

#[derive(Clone, Debug)]
pub struct PickRequest {
    pub what: PickWhat,
    pub area: Option<String>,
}

#[derive(Clone, Debug)]
pub enum PickWhat {
    Place { file: String, pointer: String },
}

pub enum Dialog {
    NewGame(NewGameDialog),
    NewRow(NewRowDialog),
    Confirm(ConfirmDialog),
    Conflicts(Vec<Conflict>),
    Error(String, String),
    Rename(RenameDialog),
    Delete(DeleteDialog),
    Close(CloseDialog),
    Binaries,
    Keys,
    MakeBlueprint(crate::views::area::MakeBlueprintDialog),
    Resize(crate::views::area::ResizeDialog),
    DeleteBlueprint(crate::views::area::DeleteBlueprintDialog),
    Arrange(crate::views::world::ArrangeDialog),
    Import(Box<crate::import::ImportDialog>),
    PickRow(PickRowDialog),
    MakeShared(crate::views::script::inspect::MakeSharedDialog),
    MakeInline(crate::views::script::inspect::MakeInlineDialog),
}

pub struct PickRowDialog {
    pub title: String,
    pub table: String,
    pub search: String,
    pub picked: Option<String>,
    pub options: Vec<String>,
    pub then: PickRowThen,
}

pub enum PickRowThen {
    AddModule {
        area: String,
        module: Value,
        field: String,
    },
    ReplaceBlueprint {
        area: String,
        index: usize,
        scope: crate::views::area::placement::ReplaceScope,
    },
    ReturnDoorTarget {
        area: String,
    },
}

pub struct NewGameDialog {
    pub source: NewGameSource,
    pub name: String,
    pub folder: String,
    pub folder_touched: bool,
    pub error: Option<String>,
}

pub enum NewGameSource {
    Template(String),
    Copy(PathBuf),
}

pub struct NewRowDialog {
    pub table: String,
    pub key: String,
    pub value: Value,
    pub error: Option<String>,
    pub into: Option<(String, String)>,
}

pub struct ConfirmDialog {
    pub title: String,
    pub body: String,
    pub label: String,
    pub compare: Option<Compare>,
    pub action: ConfirmAction,
}

pub struct Compare {
    pub left_title: String,
    pub left: String,
    pub right_title: String,
    pub right: String,
}

pub enum ConfirmAction {
    ReplaceModule {
        table: String,
        key: String,
        index: usize,
        module: Value,
    },
    RemoveLayer {
        area: String,
        layer: String,
    },
    DeleteScriptNodes {
        owner: crate::views::script::ScriptOwner,
        names: Vec<String>,
    },
    RestartPlay {
        start: Option<game::systems::script::Place>,
    },
}

pub struct RenameDialog {
    pub target: RenameTarget,
    pub draft: String,
    pub error: Option<String>,
}

pub enum RenameTarget {
    Row { table: String, key: String },
    Layer { area: String, layer: String },
}

impl RenameTarget {
    pub fn name(&self) -> &str {
        match self {
            RenameTarget::Row { key, .. } => key,
            RenameTarget::Layer { layer, .. } => layer,
        }
    }
}

pub struct DeleteDialog {
    pub table: String,
    pub keys: Vec<String>,
    pub groups: Vec<crate::rows::UsageGroup>,
    pub error: Option<String>,
}

pub struct CloseDialog {
    pub then: CloseThen,
}

#[derive(Clone)]
pub enum CloseThen {
    Quit,
    Close,
    Open(PathBuf),
}

impl Editor {
    pub fn new(user: UserFolder, settings: Settings) -> Editor {
        Editor {
            user,
            settings,
            shapes: Arc::new(Shapes::new()),
            project: None,
            lock: None,
            watcher: None,
            journal: None,
            dock: DockState::new(Vec::new()),
            panels: Panels::default(),
            status: StatusBar::default(),
            last_refusal: None,
            history_focus: None,
            themed: false,
            selection: Selection::default(),
            form: FormState::default(),
            output: Output::default(),
            dialogs: Vec::new(),
            toast: None,
            start: StartScreen::default(),
            open_tabs: Vec::new(),
            scene: None,
            clipboard: None,
            views: crate::views::Views::default(),
            play: crate::play::Play::default(),
            imports: crate::import::Imports::default(),
            jobs: crate::import::Jobs::default(),
            pick: None,
            quit: false,
            frame: 0,
        }
    }

    pub fn say(&mut self, text: impl Into<String>) {
        self.output.say("editor", text);
    }

    pub fn toast(&mut self, text: impl Into<String>) {
        let text = text.into();
        self.output.say("editor", text.clone());
        self.toast = Some((text, Instant::now()));
    }

    pub fn save_settings(&self) {
        self.user.save_settings(&self.settings);
    }

    pub fn open_folder(&mut self, folder: &Path) {
        let folder = folder.to_path_buf();
        if let Some(data) = Journal::recover(&self.user, &folder)
            && !data.files.is_empty()
            && self.start.recover.is_none()
        {
            self.start.recover = Some((folder, data));
            return;
        }
        self.open_now(&folder, Vec::new());
    }

    pub fn open_now(&mut self, folder: &Path, recovered: Vec<JournalFile>) {
        self.close_project();
        match Project::open(folder, self.shapes.clone()) {
            Ok(project) if project.report.is_some() && recovered.is_empty() => {
                let report = project
                    .report
                    .as_ref()
                    .map(|report| report.to_string())
                    .unwrap_or_default();
                self.output.say(
                    "editor",
                    format!(
                        "{} did not load: {} errors",
                        folder.display(),
                        project.report.as_ref().map_or(0, |r| r.errors.len())
                    ),
                );
                self.settings.remember(folder);
                self.save_settings();
                self.start.failed = None;
                self.start.report = Some((folder.to_path_buf(), report));
                self.start.watch = Some(Watcher::on(folder));
            }
            Ok(mut project) => {
                let lock = match Lock::take(&self.user, folder) {
                    Ok(lock) => Some(lock),
                    Err(reason) => {
                        project.read_only = Some(reason.clone());
                        self.output.say("editor", format!("Read-only: {reason}"));
                        None
                    }
                };
                if !recovered.is_empty() {
                    let mut edit = Edit::new("Recover unsaved rows from the journal");
                    for file in &recovered {
                        let change = file.change();
                        match change.bytes {
                            Some(bytes) => edit.write(change.file, bytes),
                            None => edit.remove(change.file),
                        };
                    }
                    if let Err(refusal) = project.apply(edit, Viewpoint::default()) {
                        self.output.say(
                            "editor",
                            format!("The journal did not apply: {}", refusal.sentence()),
                        );
                    } else {
                        self.output.say(
                            "editor",
                            format!("Recovered {} unsaved rows", recovered.len()),
                        );
                    }
                }
                match (&project.report, project.last_load) {
                    (Some(report), _) => {
                        self.output.say(
                            "editor",
                            format!(
                                "{} did not load: {} errors",
                                folder.display(),
                                report.errors.len()
                            ),
                        );
                    }
                    (None, Some(took)) => {
                        let usages = project.last_usages.map_or(0, |d| d.as_millis());
                        self.output.say(
                            "editor",
                            format!(
                                "Opened {} in {} ms (load) + {usages} ms (usages)",
                                folder.display(),
                                took.as_millis()
                            ),
                        );
                    }
                    _ => {}
                }
                self.settings.remember(folder);
                self.save_settings();
                self.lock = lock;
                self.watcher = Some(Watcher::on(folder));
                self.journal = Some(Journal::for_folder(&self.user, folder));
                self.project = Some(project);
                self.dock = DockState::new(Vec::new());
                self.panels = Panels::default();
                self.selection = Selection::default();
                self.form = FormState::default();
                self.views = crate::views::Views::default();
                self.imports = crate::import::Imports::load(&self.user, folder);
                if let Some(problem) = self.imports.unreadable.clone() {
                    self.toast(format!(
                        "Import records are unreadable and will not be saved: {problem}"
                    ));
                }
                self.start.failed = None;
                self.start.report = None;
                self.start.watch = None;
                if let Some(scene) = self.scene.take() {
                    crate::scenes::open(self, &scene);
                }
            }
            Err(reason) => {
                self.start.failed = Some((folder.to_path_buf(), reason.clone()));
                self.output.say("editor", reason);
            }
        }
    }

    pub fn close_project(&mut self) {
        if let Some(mut play) = self.play.running.take() {
            play.stop();
        }
        self.views.close(&mut self.project);
        if let Some(journal) = &mut self.journal {
            journal.clear();
        }
        self.journal = None;
        self.watcher = None;
        self.lock = None;
        if let Some(project) = self.project.take() {
            drop(project);
        }
        self.dock = DockState::new(Vec::new());
        self.panels = Panels::default();
    }

    pub fn apply(&mut self, edit: Edit) -> bool {
        let viewpoint = Viewpoint {
            selection: self.selection.clone(),
            camera: self.views.camera_state(),
        };
        let label = edit.label.clone();
        let outcome = match &mut self.project {
            Some(project) => project.apply(edit, viewpoint),
            None => return false,
        };
        match outcome {
            Ok(()) => {
                self.form.errors.clear();
                self.views.content_changed();
                true
            }
            Err(refusal) => {
                self.refused(&label, &refusal);
                false
            }
        }
    }

    pub fn refused(&mut self, label: &str, refusal: &Refusal) {
        let text = format!("{label}: refused · {}", refusal.sentence());
        self.toast(text);
        self.last_refusal = Some(refusal.clone());
        if !refusal.pointer.is_empty() {
            self.form
                .errors
                .insert(refusal.pointer.clone(), refusal.sentence());
        }
    }

    pub fn undo(&mut self) {
        let Some(project) = &mut self.project else {
            return;
        };
        match project.undo() {
            Ok(Some(applied)) => {
                self.selection = applied.viewpoint.selection;
                self.views.restore_camera(applied.viewpoint.camera);
                self.views.content_changed();
                self.toast(format!("Undid {}", applied.label));
            }
            Ok(None) => {}
            Err(refusal) => self.refused("Undo", &refusal),
        }
    }

    pub fn redo(&mut self) {
        let Some(project) = &mut self.project else {
            return;
        };
        match project.redo() {
            Ok(Some(applied)) => {
                self.selection = applied.viewpoint.selection;
                self.views.restore_camera(applied.viewpoint.camera);
                self.views.content_changed();
                self.toast(format!("Redid {}", applied.label));
            }
            Ok(None) => {}
            Err(refusal) => self.refused("Redo", &refusal),
        }
    }

    pub fn save(&mut self) -> bool {
        let Some(project) = &mut self.project else {
            return false;
        };
        if project.read_only.is_some() {
            self.toast("Read-only: nothing saved");
            return false;
        }
        match project.save() {
            Ok(outcome) => {
                let count = outcome.written.len() + outcome.removed.len();
                if let Some(journal) = &mut self.journal {
                    journal.clear();
                }
                self.toast(format!("Saved {count} files"));
                true
            }
            Err(error) => {
                let text = format!(
                    "Save stopped at {}: {} ({} written before it)",
                    error.file,
                    error.reason,
                    error.done.written.len()
                );
                self.toast(text);
                false
            }
        }
    }

    pub fn open_tab(&mut self, tab: Tab) {
        self.open_tabs.push(tab);
    }

    pub fn select(&mut self, selection: Selection) {
        self.selection = selection;
    }

    pub fn has_unsaved(&self) -> bool {
        self.project
            .as_ref()
            .is_some_and(|project| !project.unsaved().is_empty())
    }

    pub fn row(&self, table: &str, key: &str) -> Option<std::sync::Arc<Value>> {
        self.project
            .as_ref()?
            .files
            .json(&crate::project::row_file(table, key))
    }

    pub fn row_value(&self, table: &str, key: &str) -> Option<Value> {
        self.row(table, key).map(|row| (*row).clone())
    }

    pub fn registry(&self) -> &'static game::core::content::ContentRegistry {
        static REGISTRY: std::sync::OnceLock<game::core::content::ContentRegistry> =
            std::sync::OnceLock::new();
        REGISTRY.get_or_init(game::systems::registry)
    }

    fn poll_outside(&mut self) {
        if self.project.is_none()
            && let Some(watch) = &mut self.start.watch
            && watch.poll().is_some()
            && let Some((folder, _)) = self.start.report.clone()
        {
            self.open_now(&folder, Vec::new());
            return;
        }
        let Some(watcher) = &mut self.watcher else {
            return;
        };
        let Some(changed) = watcher.poll() else {
            return;
        };
        let Some(project) = &mut self.project else {
            return;
        };
        let outcome = project.outside_changes(changed);
        if !outcome.taken.is_empty() {
            let loads = project.loads();
            let text = match loads {
                true => format!(
                    "↻ {} rows changed on disk and were reloaded",
                    outcome.taken.len()
                ),
                false => format!(
                    "{} files changed on disk and the folder no longer loads: read-only until it does",
                    outcome.taken.len()
                ),
            };
            self.toast(text);
            self.views.content_changed();
        }
        if !outcome.conflicts.is_empty() {
            self.dialogs.push(Dialog::Conflicts(outcome.conflicts));
        }
    }

    fn tick_journal(&mut self) {
        let Some(project) = &self.project else {
            return;
        };
        let Some(journal) = &mut self.journal else {
            return;
        };
        if !journal.due() {
            return;
        }
        let unsaved = project.unsaved();
        if unsaved.is_empty() {
            journal.clear();
            return;
        }
        let data = JournalData {
            build: game::core::content::version::build().to_owned(),
            content_version: game::systems::registry().version().0,
            folder: project.root.clone(),
            written: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            files: unsaved
                .iter()
                .map(|path| {
                    JournalFile::of(
                        path,
                        project.disk.get(path).map(String::as_str),
                        project.files.get(path),
                    )
                })
                .collect(),
        };
        journal.write(&data);
    }
}

fn editor_ui(world: &mut World) {
    let ctx = {
        let mut contexts = world.query_filtered::<&mut EguiContext, With<PrimaryEguiContext>>();
        let Ok(mut context) = contexts.single_mut(world) else {
            return;
        };
        context.get_mut().clone()
    };
    world.resource_scope(|world, mut editor: Mut<Editor>| {
        editor.frame += 1;
        crate::ui::show(&mut editor, &ctx, world);
    });
    if world.resource::<Editor>().quit {
        world.write_message(bevy::app::AppExit::Success);
    }
}

fn background(world: &mut World) {
    world.resource_scope(|world, mut editor: Mut<Editor>| {
        editor.poll_outside();
        editor.tick_journal();
        crate::play::poll(&mut editor);
        crate::import::poll(&mut editor);
        crate::views::sync(&mut editor, world);
    });
}

pub type RowKeys = HashMap<String, Vec<String>>;
