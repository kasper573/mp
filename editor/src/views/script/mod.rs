pub mod graph;
pub mod inspect;
pub mod nodes;
pub mod outline;
pub mod palette;
pub mod panel;
pub mod run;

use std::collections::{HashMap, HashSet};
use std::time::Instant;

use egui::emath::TSTransform;
use egui::{Pos2, Rect, RichText, Stroke, Ui, vec2};
use egui_snarl::ui::get_selected_nodes;
use engine::core::content::{ContentRow, OWNER_FIELD, RowName, row_file};
use engine::core::script::RunnerKindDef;
use engine::systems::npc::NpcDef;
use engine::systems::script::{RunnerKind, ScriptDef};
use graph::{FaceImage, NodePaletteOpen, ScriptGraph, ScriptGraphAction, ScriptGraphLayout};
use nodes::{LineSpeaker, NodeCatalogue};
use serde_json::{Map, Value};

use crate::app::{BottomTab, ConfirmAction, ConfirmDialog, Editor, ModalDialog};
use crate::forms::{FormAction, FormCx};
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, Project, RowSelection, catalogue_of};
use crate::tabs::{DockRequest, EditorTab};
use crate::thumbs;
use crate::ui::{dialogs, sidebar, theme, widgets};
use crate::user::UserFolder;
use crate::value::RowValue;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ScriptPath {
    Module(usize),
    ObjectScript { object: usize, script: usize },
}

impl ScriptPath {
    pub fn parse(pointer: &str) -> Option<ScriptPath> {
        let rest = pointer.strip_prefix("/modules/")?;
        let mut parts = rest.split('/');
        let module = parts.next()?.parse().ok()?;
        if parts.next() != Some("scripts") {
            return Some(ScriptPath::Module(module));
        }
        let script = parts.next()?.parse().ok()?;
        Some(ScriptPath::ObjectScript {
            object: module,
            script,
        })
    }

    pub fn pointer(self) -> String {
        match self {
            ScriptPath::Module(module) => format!("/modules/{module}"),
            ScriptPath::ObjectScript { object, script } => {
                format!("/modules/{object}/scripts/{script}")
            }
        }
    }

    pub fn object(self) -> Option<usize> {
        match self {
            ScriptPath::Module(_) => None,
            ScriptPath::ObjectScript { object, .. } => Some(object),
        }
    }

    pub fn module(self) -> usize {
        match self {
            ScriptPath::Module(module) | ScriptPath::ObjectScript { object: module, .. } => module,
        }
    }
}

pub struct ScriptRef {
    pub module: Option<ScriptPath>,
    pub node: Option<String>,
}

impl ScriptRef {
    pub fn parse(pointer: &str) -> ScriptRef {
        ScriptRef {
            module: ScriptPath::parse(pointer),
            node: pointer
                .split_once("/nodes/")
                .and_then(|(_, rest)| rest.split('/').next())
                .map(str::to_owned),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ScriptRow {
    pub key: String,
}

impl ScriptRow {
    pub fn new(key: impl Into<String>) -> ScriptRow {
        ScriptRow { key: key.into() }
    }

    pub fn title(&self) -> String {
        format!("{}/{}", ScriptDef::TABLE, self.key)
    }

    pub fn row(&self) -> (String, String) {
        (ScriptDef::TABLE.to_owned(), self.key.clone())
    }

    pub fn file(&self) -> String {
        row_file(ScriptDef::TABLE, &self.key)
    }

    pub fn slug(&self) -> String {
        format!("script-{}", self.key)
    }

    pub fn renamed(&self, table: &str, key: &str, new_key: &str) -> Option<ScriptRow> {
        self.is_row(table, key).then(|| ScriptRow::new(new_key))
    }

    pub fn is_row(&self, table: &str, key: &str) -> bool {
        table == ScriptDef::TABLE && self.key == key
    }
}

#[derive(Clone)]
pub struct ScriptDoc {
    pub at: ScriptRow,
    pub file: String,
    pub script: Value,
    pub kind: RunnerKind,
}

impl ScriptDoc {
    pub fn load(editor: &Editor, at: &ScriptRow) -> Option<ScriptDoc> {
        let script = editor.row_value(ScriptDef::TABLE, &at.key)?;
        if !script.is_object() || !script["nodes"].is_object() {
            return None;
        }
        Some(ScriptDoc {
            at: at.clone(),
            file: at.file(),
            kind: script.text("runs_on").parse().unwrap_or(RunnerKind::Any),
            script,
        })
    }

    pub fn nodes(&self) -> &Map<String, Value> {
        self.script["nodes"].as_object().expect("a nodes map")
    }

    pub fn owner(&self) -> Option<RowName> {
        serde_json::from_value(self.script[OWNER_FIELD].clone()).ok()
    }

    pub fn default_speaker(&self) -> LineSpeaker {
        match (self.kind, self.owner()) {
            (RunnerKind::Npc, Some(owner)) if owner.table == NpcDef::TABLE => LineSpeaker::Npc {
                npc: owner.key,
                face: None,
            },
            (RunnerKind::Object, _) => LineSpeaker::Object,
            _ => LineSpeaker::Narrator,
        }
    }

    pub fn form_cx<'a>(
        &self,
        editor: &'a mut Editor,
        root: &'a Value,
        actions: &'a mut Vec<FormAction>,
    ) -> FormCx<'a> {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx =
            FormCx::new(project, root, shapes, form, actions).editing(ScriptDef::TABLE, None);
        cx.speaker = self.default_speaker().npc().map(str::to_owned);
        cx
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScriptPanel {
    MayDo,
    UsedBy,
    Run,
}

#[derive(Default)]
pub struct ScriptViewState {
    pub graph: ScriptGraph,
    pub outline: bool,
    pub layout_dirty: bool,
    pub selected: Vec<String>,
    pub marked: Vec<String>,
    pub palette: Option<palette::NodePalette>,
    pub outline_focus: Option<String>,
    pub folded: HashSet<String>,
    pub to_global: Option<TSTransform>,
    pub rects: HashMap<String, Rect>,
}

impl ScriptViewState {
    pub fn opened(layout: ScriptGraphLayout) -> ScriptViewState {
        ScriptViewState {
            graph: ScriptGraph::new(&layout),
            outline: layout.outline,
            ..Default::default()
        }
    }

    pub fn toggle_outline(&mut self) {
        self.outline = !self.outline;
        self.layout_dirty = true;
    }

    pub fn place_node(&mut self, name: &str, at: Pos2) {
        self.graph.place(name, at);
        self.layout_dirty = true;
    }

    pub fn rename_node(&mut self, old: &str, new: &str) {
        self.graph.rename(old, new);
        self.layout_dirty = true;
    }
}

fn snarl_id(at: &ScriptRow) -> egui::Id {
    egui::Id::new(("script-graph", at.slug()))
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ScriptKeys {
    pub fire: bool,
    pub tab: bool,
    pub outline: bool,
    pub delete: bool,
    pub rename: bool,
    pub duplicate: bool,
    pub enter: bool,
    pub ctrl_enter: bool,
    pub link: bool,
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
}

impl ScriptKeys {
    pub fn take(ctx: &egui::Context) -> ScriptKeys {
        ctx.input_mut(|i| {
            let arrow = EditorKey::Move.take_arrow(i);
            ScriptKeys {
                fire: EditorKey::RunScript.consume(i),
                tab: EditorKey::Palette.consume(i),
                outline: EditorKey::Outline.consume(i),
                delete: EditorKey::Delete.consume(i),
                rename: EditorKey::Rename.consume(i),
                duplicate: EditorKey::Duplicate.consume(i),
                enter: EditorKey::Confirm.consume(i),
                ctrl_enter: EditorKey::AddChoice.consume(i),
                link: EditorKey::Link.consume(i),
                up: arrow == Some([0, -1]),
                down: arrow == Some([0, 1]),
                left: arrow == Some([-1, 0]),
                right: arrow == Some([1, 0]),
            }
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ScriptSessionId(u64);

struct ScriptSession {
    id: ScriptSessionId,
    at: ScriptRow,
}

#[derive(Default)]
pub struct ScriptViews {
    sessions: Vec<ScriptSession>,
    views: HashMap<ScriptSessionId, ScriptViewState>,
    pub keys: ScriptKeys,
    pub shown_rect: Option<Rect>,
    pub run: Option<run::ScriptRun>,
    setups: HashMap<ScriptSessionId, run::RunSetup>,
    fire: Option<ScriptSessionId>,
    pending: Option<(ScriptSessionId, PendingScriptAction)>,
    pub callout: Option<ScriptCallout>,
}

impl ScriptViews {
    pub fn session(&mut self, at: &ScriptRow) -> ScriptSessionId {
        if let Some(id) = self.find(at) {
            return id;
        }
        let id = ScriptSessionId(self.sessions.len() as u64);
        self.sessions.push(ScriptSession { id, at: at.clone() });
        id
    }

    pub fn find(&self, at: &ScriptRow) -> Option<ScriptSessionId> {
        self.sessions
            .iter()
            .find(|session| session.at == *at)
            .map(|session| session.id)
    }

    pub fn relocate(&mut self, from: &ScriptRow, to: ScriptRow) {
        if let Some(session) = self.sessions.iter_mut().find(|session| session.at == *from) {
            session.at = to.clone();
        }
        if let Some(callout) = self.callout.as_mut().filter(|callout| callout.at == *from) {
            callout.at = to;
        }
    }

    pub fn view(&self, at: &ScriptRow) -> Option<&ScriptViewState> {
        self.views.get(&self.find(at)?)
    }

    pub fn view_mut(
        &mut self,
        at: &ScriptRow,
        user: &UserFolder,
        project: Option<&Project>,
    ) -> &mut ScriptViewState {
        let id = self.session(at);
        self.views.entry(id).or_insert_with(|| {
            let layout = project
                .map(|project| user.load_layout(&project.root, &at.slug()))
                .unwrap_or_default();
            ScriptViewState::opened(layout)
        })
    }

    pub fn run_of(&self, at: &ScriptRow) -> Option<&run::ScriptRun> {
        let id = self.find(at)?;
        self.run.as_ref().filter(|run| run.doc == id)
    }

    pub fn run_of_mut(&mut self, at: &ScriptRow) -> Option<&mut run::ScriptRun> {
        let id = self.find(at)?;
        self.run.as_mut().filter(|run| run.doc == id)
    }

    pub fn existing_view_mut(&mut self, at: &ScriptRow) -> Option<&mut ScriptViewState> {
        let id = self.find(at)?;
        self.views.get_mut(&id)
    }

    pub fn setup_of(&self, at: &ScriptRow) -> run::RunSetup {
        self.find(at)
            .and_then(|id| self.setups.get(&id))
            .cloned()
            .unwrap_or_default()
    }

    pub fn set_setup(&mut self, at: &ScriptRow, setup: run::RunSetup) {
        let id = self.session(at);
        self.setups.insert(id, setup);
    }

    pub fn fire(&mut self, at: &ScriptRow) {
        self.fire = Some(self.session(at));
    }

    pub fn take_fire(&mut self, at: &ScriptRow) -> bool {
        let fired = self.fire.take();
        fired.is_some() && fired == self.find(at)
    }

    pub fn set_pending(&mut self, at: &ScriptRow, action: PendingScriptAction) {
        let id = self.session(at);
        self.pending = Some((id, action));
    }

    pub fn take_pending(&mut self, at: &ScriptRow) -> Option<PendingScriptAction> {
        let id = self.find(at)?;
        self.pending
            .take_if(|(pending, _)| *pending == id)
            .map(|(_, action)| action)
    }

    pub fn close(&mut self) {
        self.sessions.clear();
        self.views.clear();
        self.setups.clear();
        self.run = None;
        self.fire = None;
        self.pending = None;
    }
}

pub enum PendingScriptAction {
    Connect {
        from: String,
        field: String,
        to: String,
    },
}

pub struct ScriptCallout {
    pub at: ScriptRow,
    pub node: String,
    pub to: Option<String>,
    pub rule: String,
    pub text: String,
    pub since: Instant,
}

impl ScriptCallout {
    pub fn live(&self, at: &ScriptRow) -> bool {
        self.at == *at && self.since.elapsed().as_secs_f32() < 12.0
    }
}

pub struct RenameNodeDialog {
    pub at: ScriptRow,
    pub old: String,
    pub draft: String,
}

pub struct LinkNodeDialog {
    pub at: ScriptRow,
    pub from: String,
    pub search: String,
    pub port: usize,
}

fn content_generation(editor: &Editor) -> u64 {
    editor
        .project
        .as_ref()
        .map_or(0, |project| project.generation)
}

fn sync_graph(editor: &mut Editor, doc: &ScriptDoc) {
    let generation = content_generation(editor);
    let Editor {
        user,
        project,
        views,
        ..
    } = editor;
    views
        .script
        .view_mut(&doc.at, user, project.as_ref())
        .graph
        .sync(doc, catalogue_of(project.as_ref()), generation);
}

pub fn sync_with_content(editor: &mut Editor) {
    let generation = content_generation(editor);
    let views = &mut editor.views.script;
    if views
        .run
        .as_ref()
        .is_some_and(|run| run.generation != generation)
    {
        views.run = None;
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, at: &ScriptRow) {
    let Some(doc) = ScriptDoc::load(editor, at) else {
        ui.label(RichText::new(format!("{} is gone", at.title())).weak());
        return;
    };
    editor.views.script.shown_rect = Some(ui.max_rect());
    if let Some(pending) = editor.views.script.take_pending(at) {
        match pending {
            PendingScriptAction::Connect { from, field, to } => {
                act(editor, &doc, ScriptGraphAction::Connect { from, field, to })
            }
        }
    }
    if ui.input(|i| i.pointer.any_pressed()) && ui.rect_contains_pointer(ui.max_rect()) {
        editor
            .dock_requests
            .push(DockRequest::Focus(EditorTab::Script(at.clone())));
    }
    sync_with_content(editor);
    sync_graph(editor, &doc);
    let mut actions = Vec::new();
    keys(editor, ui, &doc, &mut actions);
    status(editor, &doc);
    sidebar::row(ui, "script", |ui| inspect::script_row(editor, ui, &doc));
    let (table, key) = at.row();
    let selection = if editor.selection.table == table
        && editor.selection.keys.first().is_some_and(|k| *k == key)
    {
        editor.selection.clone()
    } else {
        RowSelection::row(&table, &key)
    };
    sidebar::inspector(ui, "script", |ui| {
        inspect::show(editor, ui, &doc, &selection)
    });
    egui::CentralPanel::default()
        .frame(egui::Frame::NONE)
        .show(ui, |ui| {
            if editor
                .views
                .script
                .view_mut(at, &editor.user, editor.project.as_ref())
                .outline
            {
                outline::show(editor, ui, &doc, &mut actions);
            } else {
                canvas(editor, ui, &doc, &mut actions);
            }
        });
    palette::show(editor, ui, &doc);
    for action in actions {
        act(editor, &doc, action);
    }
    editor.views.script.keys = ScriptKeys::default();
    save_layout(editor, ui, at);
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, at: &ScriptRow, tab: BottomTab) {
    let Some(doc) = ScriptDoc::load(editor, at) else {
        return;
    };
    sync_with_content(editor);
    let panel = match tab {
        BottomTab::UsedBy => ScriptPanel::UsedBy,
        BottomTab::Run => ScriptPanel::Run,
        _ => ScriptPanel::MayDo,
    };
    panel::show(editor, ui, &doc, panel);
}

fn canvas(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, actions: &mut Vec<ScriptGraphAction>) {
    let at = doc.at.clone();
    let (lit, current): (HashSet<String>, Option<String>) = editor
        .views
        .script
        .run_of(&at)
        .map(|run| {
            (
                run.visited.iter().cloned().collect(),
                run.visited.last().cloned(),
            )
        })
        .unwrap_or_default();
    let selected_before = {
        let views = &mut editor.views.script;
        let view = views.view_mut(&at, &editor.user, editor.project.as_ref());
        let selection = &editor.selection;
        if selection.table == ScriptDef::TABLE
            && selection.keys == [at.key.as_str()]
            && is_node_selection(selection)
        {
            let mut names: Vec<String> = selection
                .parts
                .iter()
                .filter_map(|part| part.strip_prefix("node:"))
                .map(str::to_owned)
                .collect();
            names.sort();
            view.selected = names;
        }
        view.selected.clone()
    };
    let faces = faces(editor, ui.ctx(), doc);
    let id = snarl_id(&at);
    let (dragged, to_global, mut taken, clicked, rects) = {
        let views = &mut editor.views.script;
        let catalogue = catalogue_of(editor.project.as_ref());
        let view = views.view_mut(&at, &editor.user, editor.project.as_ref());
        let chosen: HashSet<String> = selected_before.iter().cloned().collect();
        let mut viewer = graph::ScriptGraphViewer {
            doc,
            catalogue,
            ports: graph::ports_of(doc, catalogue),
            lit: &lit,
            current: current.as_deref(),
            selected: &chosen,
            faces: &faces,
            actions: Vec::new(),
            clicks: Vec::new(),
            to_global: TSTransform::IDENTITY,
            rects: HashMap::new(),
            fit: None,
        };
        if view.to_global.is_none() {
            let mut bounds = Rect::NOTHING;
            for at in view.graph.positions().values() {
                bounds = bounds.union(Rect::from_min_size(*at, vec2(graph::CARD + 20.0, 120.0)));
            }
            if bounds.is_finite() {
                viewer.fit = Some((bounds, ui.max_rect()));
            }
        }
        let graph = &mut view.graph;
        let before = graph.node_spots();
        graph::widget(id).show(&mut graph.snarl, &mut viewer, ui);
        let dragged = graph.node_spots() != before;
        (
            dragged,
            viewer.to_global,
            viewer.actions,
            viewer.clicks,
            viewer.rects,
        )
    };
    header_chip(editor, ui, doc);
    editor
        .views
        .script
        .view_mut(&at, &editor.user, editor.project.as_ref())
        .rects = rects;
    run::conversation_box(editor, ui, doc);
    actions.append(&mut taken);
    let selected: Vec<String> = {
        let view = editor
            .views
            .script
            .view_mut(&at, &editor.user, editor.project.as_ref());
        let graph = &view.graph;
        let mut marked: Vec<String> = get_selected_nodes(id, ui.ctx())
            .iter()
            .filter_map(|id| graph.snarl.get_node(*id).map(|node| node.name.clone()))
            .collect();
        marked.sort();
        if dragged {
            view.layout_dirty = true;
        }
        view.to_global = Some(to_global);
        let mut names = if marked != view.marked {
            view.marked = marked.clone();
            marked
        } else {
            selected_before.clone()
        };
        for graph::NodeClick { name, extend } in clicked {
            if !extend {
                names.clear();
            }
            if !names.contains(&name) {
                names.push(name);
            }
            names.sort();
        }
        names
    };
    callout(editor, ui, &at);
    if selected != selected_before {
        editor
            .views
            .script
            .view_mut(&at, &editor.user, editor.project.as_ref())
            .selected = selected.clone();
        if !selected.is_empty() {
            select_nodes(editor, doc, &selected);
        }
    }
}

fn faces(editor: &mut Editor, ctx: &egui::Context, doc: &ScriptDoc) -> graph::SpeakerFaces {
    let mut faces = graph::SpeakerFaces::new();
    let Some(project) = editor.project.as_ref() else {
        return faces;
    };
    let thumbnails = &mut editor.form.thumbnails;
    for node in doc.nodes().values() {
        for line in node["lines"].as_array().into_iter().flatten() {
            let Some(speaker) = LineSpeaker::of(&line["by"]) else {
                continue;
            };
            if faces.contains_key(&speaker) {
                continue;
            }
            let Some(file) = nodes::bust_file(project.content.as_ref(), &speaker) else {
                continue;
            };
            let Some(thumb) = thumbnails.image(ctx, &project.files, &file) else {
                continue;
            };
            faces.insert(
                speaker,
                FaceImage {
                    texture: thumb.texture.id(),
                    uv: thumbs::square_uv(thumb.size),
                },
            );
        }
    }
    faces
}

fn header_chip(editor: &Editor, ui: &Ui, doc: &ScriptDoc) {
    let text = match editor.views.script.run_of(&doc.at) {
        Some(_) => format!("{} · running with a pretend subject", doc.at.title()),
        None => chip_title(editor, doc),
    };
    widgets::floating_chip(
        ui.painter(),
        ui.max_rect().min + vec2(16.0, 12.0),
        egui::Align2::LEFT_TOP,
        &text,
        theme::OVERLAY,
        theme::TEXT,
        12.5,
    );
}

pub fn chip_title(editor: &Editor, doc: &ScriptDoc) -> String {
    let count = doc.nodes().len();
    let mut text = format!(
        "{} · runs on {} · {count} node{}",
        doc.at.title(),
        doc.kind.name(),
        widgets::plural(count)
    );
    if let Some(owner) = doc.owner() {
        text.push_str(&format!(" · local to {owner}"));
    }
    if editor.shapes.is_fixture(ScriptDef::TABLE, &doc.at.key) {
        text.push_str(" · from New Game");
    }
    text
}

fn status(editor: &mut Editor, doc: &ScriptDoc) {
    let at = doc.at.clone();
    let view = editor.views.script.view(&at);
    let outline = view.is_some_and(|view| view.outline);
    let palette = view.is_some_and(|view| view.palette.is_some());
    let selected = view.map(|view| view.selected.clone()).unwrap_or_default();
    let head = match selected.as_slice() {
        [one] if !outline && !palette => format!("{} › {one}", at.title()),
        _ => {
            let mode = if outline {
                " · outline"
            } else if palette {
                " · palette"
            } else {
                ""
            };
            format!("{} › script{mode}", at.title())
        }
    };
    let refused = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(&at))
        .map(|callout| callout.rule.clone());
    let hint = if let Some(rule) = refused {
        format!("refused · {rule}  nothing changed")
    } else if let Some(run) = editor.views.script.run_of(&at) {
        let waiting = run
            .visited
            .last()
            .map(|node| format!("waiting at {node}"))
            .unwrap_or_else(|| "ended".to_owned());
        format!(
            "Run · 1 flow · {waiting}   {} pick a choice · {} stops",
            EditorKey::Pick.name(),
            EditorKey::Cancel.name()
        )
    } else if palette {
        format!(
            "{} choose · {} opens a system · {} places it",
            EditorKey::Move.name(),
            EditorKey::Move.name(),
            EditorKey::Confirm.name()
        )
    } else if outline {
        format!(
            "{} switches to the canvas, keeping the selection",
            EditorKey::Outline.name()
        )
    } else {
        match selected.as_slice() {
            [one] => doc.nodes().get(one).map_or_else(String::new, nodes::hint),
            [] => format!(
                "{} opens the palette · drag from a dot to link · {} removes",
                EditorKey::Palette.name(),
                EditorKey::Delete.name()
            ),
            many => format!(
                "{} nodes · drag moves them together · {} removes them",
                many.len(),
                EditorKey::Delete.name()
            ),
        }
    };
    editor.status.left.push(head);
    editor.status.left.push(hint);
}

fn beside(graph: &ScriptGraph, from: &str) -> Pos2 {
    let placed = graph.positions();
    let Some(origin) = placed.get(from) else {
        return Pos2::new(40.0, 40.0);
    };
    let mut pos = Pos2::new(origin.x + 280.0, origin.y);
    while placed
        .values()
        .any(|p| (p.x - pos.x).abs() < 200.0 && (p.y - pos.y).abs() < 60.0)
    {
        pos.y += 130.0;
    }
    pos
}

fn callout(editor: &mut Editor, ui: &mut Ui, at: &ScriptRow) {
    let Some(callout) = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(at))
    else {
        return;
    };
    let Some(view) = editor.views.script.view(at) else {
        return;
    };
    let Some(to_global) = view.to_global else {
        return;
    };
    let on_screen = |name: &str| view.rects.get(name).map(|rect| to_global * *rect);
    let Some(anchor) = on_screen(&callout.node) else {
        return;
    };
    let painter = ui
        .ctx()
        .layer_painter(egui::LayerId::new(
            egui::Order::Foreground,
            ui.id().with("callout"),
        ))
        .with_clip_rect(ui.max_rect());
    let stroke = Stroke::new(1.5, theme::DANGER);
    if let Some(target) = callout.to.as_deref().and_then(on_screen) {
        callout_arrow(&painter, anchor.right_center(), target.left_center());
        painter.rect_stroke(target, 6.0, stroke, egui::StrokeKind::Outside);
    }
    painter.rect_stroke(anchor, 6.0, stroke, egui::StrokeKind::Outside);
    callout_card(ui, &painter, anchor, callout);
}

fn callout_arrow(painter: &egui::Painter, from: Pos2, to: Pos2) {
    let lift = vec2(0.0, -(24.0 + (from.x - to.x).abs() * 0.06).min(80.0));
    let curve = egui::epaint::CubicBezierShape::from_points_stroke(
        [
            from,
            from + lift + vec2(60.0, 0.0),
            to + lift - vec2(60.0, 0.0),
            to,
        ],
        false,
        egui::Color32::TRANSPARENT,
        Stroke::NONE,
    );
    let points: Vec<Pos2> = curve.flatten(Some(0.5));
    painter.add(egui::Shape::dashed_line(
        &points,
        Stroke::new(1.5, theme::DANGER),
        6.0,
        5.0,
    ));
}

fn callout_card(ui: &Ui, painter: &egui::Painter, anchor: Rect, callout: &ScriptCallout) {
    let width = 300.0;
    let title = ui.fonts_mut(|fonts| {
        fonts.layout(
            callout.rule.clone(),
            egui::FontId::proportional(13.5),
            theme::DANGER,
            width,
        )
    });
    let body = ui.fonts_mut(|fonts| {
        fonts.layout(
            callout.text.clone(),
            egui::FontId::proportional(12.5),
            theme::TEXT,
            width,
        )
    });
    let pad = 10.0;
    let size = vec2(
        width + pad * 2.0,
        title.size().y + body.size().y + pad * 2.0 + 4.0,
    );
    let mut top_left = anchor.left_bottom() + vec2(0.0, 10.0);
    top_left.x = top_left
        .x
        .min(ui.max_rect().right() - size.x - 8.0)
        .max(ui.max_rect().left() + 8.0);
    if top_left.y + size.y > ui.max_rect().bottom() - 8.0 {
        top_left.y = anchor.top() - size.y - 10.0;
    }
    let rect = Rect::from_min_size(top_left, size);
    design_tokens::slip::paint(painter, rect);
    painter.rect_stroke(
        rect,
        0.0,
        Stroke::new(1.0, theme::DANGER),
        egui::StrokeKind::Inside,
    );
    let title_height = title.size().y;
    painter.galley(rect.min + vec2(pad, pad), title, theme::DANGER);
    painter.galley(
        rect.min + vec2(pad, pad + title_height + 4.0),
        body,
        theme::TEXT,
    );
}

pub fn select_nodes(editor: &mut Editor, doc: &ScriptDoc, names: &[String]) {
    editor.select(RowSelection::parts(
        ScriptDef::TABLE,
        &doc.at.key,
        names.iter().map(|name| format!("node:{name}")).collect(),
    ));
    editor
        .views
        .script
        .view_mut(&doc.at, &editor.user, editor.project.as_ref())
        .selected = names.to_vec();
}

pub fn is_node_selection(selection: &RowSelection) -> bool {
    !selection.parts.is_empty()
        && selection
            .parts
            .iter()
            .all(|part| part.starts_with("node:") || part.starts_with("choice:"))
}

fn keys(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, actions: &mut Vec<ScriptGraphAction>) {
    let at = doc.at.clone();
    let keys = editor.views.script.keys;
    if editor
        .views
        .script
        .view_mut(&at, &editor.user, editor.project.as_ref())
        .palette
        .is_some()
    {
        return;
    }
    if keys.fire {
        editor.panels.bottom = BottomTab::Run;
        editor.views.script.fire(&at);
        return;
    }
    let views = &mut editor.views.script;
    let catalogue = catalogue_of(editor.project.as_ref());
    let view = views.view_mut(&at, &editor.user, editor.project.as_ref());
    let in_outline = view.outline;
    if keys.outline {
        view.toggle_outline();
    }
    if in_outline {
        return;
    }
    let selected = view.selected.clone();
    let first = selected.first().cloned();
    if keys.tab {
        let link = first
            .as_ref()
            .and_then(|name| free_port_link(doc, catalogue, name));
        let beside_node = first
            .as_ref()
            .and_then(|name| view.rects.get(name))
            .zip(view.to_global)
            .map(|(rect, to_global)| to_global * rect.right_top() + vec2(16.0, 0.0));
        actions.push(ScriptGraphAction::Palette(NodePaletteOpen {
            at: beside_node
                .or_else(|| ui.input(|i| i.pointer.hover_pos()))
                .unwrap_or_else(|| ui.max_rect().center()),
            placed: false,
            link,
        }));
    }
    if keys.delete {
        for name in &selected {
            actions.push(ScriptGraphAction::Delete(name.clone()));
        }
    }
    if keys.rename
        && let Some(name) = &first
    {
        actions.push(ScriptGraphAction::Rename(name.clone()));
    }
    if keys.duplicate {
        for name in &selected {
            actions.push(ScriptGraphAction::Duplicate(name.clone()));
        }
    }
    if let Some(name) = &first
        && doc.nodes().get(name).is_some_and(nodes::is_dialogue)
    {
        if keys.ctrl_enter {
            actions.push(ScriptGraphAction::AddChoice(name.clone()));
        } else if keys.enter {
            actions.push(ScriptGraphAction::AddLine(name.clone()));
        }
    }
    if keys.link
        && let Some(name) = first
    {
        link_by_name(editor, &at, name);
    }
}

pub fn free_port_link(
    doc: &ScriptDoc,
    catalogue: &NodeCatalogue,
    name: &str,
) -> Option<(String, String)> {
    let node = doc.nodes().get(name)?;
    nodes::ports(node, catalogue)
        .into_iter()
        .find(|port| port.target.is_none())
        .map(|port| (name.to_owned(), port.field))
}

pub fn link_by_name(editor: &mut Editor, at: &ScriptRow, from: String) {
    editor.dialogs.push(ModalDialog::LinkNode(LinkNodeDialog {
        at: at.clone(),
        from,
        search: String::new(),
        port: 0,
    }));
}

pub fn act(editor: &mut Editor, doc: &ScriptDoc, action: ScriptGraphAction) {
    let at = doc.at.clone();
    match action {
        ScriptGraphAction::Connect { from, field, to } => {
            let mut script = doc.script.clone();
            if let Some(node) = script["nodes"].get_mut(&from) {
                nodes::set_arrow(node, &field, Some(&to));
            }
            let label = format!("Link {from} to {to} in {}", at.title());
            if !write(editor, doc, script, label)
                && let Some(callout) = editor.views.script.callout.as_mut()
            {
                callout.node = from;
                callout.to = Some(to);
            }
        }
        ScriptGraphAction::Disconnect { from, field } => {
            let mut script = doc.script.clone();
            if let Some(node) = script["nodes"].get_mut(&from) {
                nodes::set_arrow(node, &field, None);
            }
            let label = format!("Unlink {from} in {}", at.title());
            write(editor, doc, script, label);
        }
        ScriptGraphAction::DropInputs(to) => {
            let mut script = doc.script.clone();
            if let Some(map) = script["nodes"].as_object_mut() {
                nodes::unlink(map, &to, catalogue_of(editor.project.as_ref()));
            }
            let label = format!("Unlink arrows into {to} in {}", at.title());
            write(editor, doc, script, label);
        }
        ScriptGraphAction::Delete(name) => delete_nodes(editor, doc, vec![name]),
        ScriptGraphAction::Rename(name) => {
            editor
                .dialogs
                .push(ModalDialog::RenameNode(RenameNodeDialog {
                    at,
                    old: name.clone(),
                    draft: name,
                }));
        }
        ScriptGraphAction::Duplicate(name) => duplicate(editor, doc, &name),
        ScriptGraphAction::Palette(open) => {
            editor
                .views
                .script
                .view_mut(&at, &editor.user, editor.project.as_ref())
                .palette = Some(palette::NodePalette::new(open));
        }
        ScriptGraphAction::AddLine(name) => {
            let mut script = doc.script.clone();
            if let Some(lines) = script["nodes"][&name]["lines"].as_array_mut() {
                lines.push(doc.default_speaker().blank_line());
            }
            let label = format!("Add a line to {name} in {}", at.title());
            write(editor, doc, script, label);
        }
        ScriptGraphAction::EditLine { name, index, text } => {
            let mut script = doc.script.clone();
            script["nodes"][&name]["lines"][index]["text"] = text;
            let label = format!("Edit line {} of {name} · {}", index + 1, at.title());
            write(editor, doc, script, label);
        }
        ScriptGraphAction::AddChoice(name) => {
            let mut script = doc.script.clone();
            add_choice(&mut script["nodes"][&name]);
            let label = format!("Add a choice to {name} in {}", at.title());
            write(editor, doc, script, label);
        }
    }
}

pub fn add_choice(node: &mut Value) {
    if node.get("choices").is_none_or(Value::is_null) {
        node["choices"] = Value::Array(Vec::new());
    }
    node.remove_field("next");
    if let Some(choices) = node["choices"].as_array_mut() {
        choices.push(serde_json::json!({ "label": ["…"] }));
    }
}

fn duplicate(editor: &mut Editor, doc: &ScriptDoc, name: &str) {
    let at = doc.at.clone();
    let Some(mut copy) = doc.nodes().get(name).cloned() else {
        return;
    };
    let ports = nodes::ports(&copy, catalogue_of(editor.project.as_ref()));
    let Some(free) = ports.iter().find(|port| port.target.is_none()) else {
        editor.toast(format!("{name} has no free output to lead to its copy"));
        return;
    };
    let field = free.field.clone();
    for port in &ports {
        nodes::set_arrow(&mut copy, &port.field, None);
    }
    let fresh = nodes::free_name(doc.nodes(), name);
    let mut script = doc.script.clone();
    if let Some(map) = script["nodes"].as_object_mut() {
        nodes::insert_sorted(map, &fresh, copy);
        if let Some(source) = map.get_mut(name) {
            nodes::set_arrow(source, &field, Some(&fresh));
        }
    }
    let label = format!("Duplicate {name} in {}", at.title());
    if write(editor, doc, script, label) {
        let view = editor
            .views
            .script
            .view_mut(&at, &editor.user, editor.project.as_ref());
        let at = beside(&view.graph, name);
        view.place_node(&fresh, at);
        select_nodes(editor, doc, &[fresh]);
    }
}

fn remove_nodes(doc: &ScriptDoc, names: &[String], catalogue: &NodeCatalogue) -> Value {
    let mut script = doc.script.clone();
    if let Some(map) = script["nodes"].as_object_mut() {
        for name in names {
            map.remove(name);
            nodes::unlink(map, name, catalogue);
        }
    }
    script
}

pub fn delete_nodes(editor: &mut Editor, doc: &ScriptDoc, names: Vec<String>) {
    let catalogue = catalogue_of(editor.project.as_ref());
    let script = remove_nodes(doc, &names, catalogue);
    let remaining = script["nodes"].as_object().expect("a nodes map");
    let reachable = nodes::reachable(remaining, catalogue);
    let were_reachable = nodes::reachable(doc.nodes(), catalogue);
    let newly_stranded: Vec<String> = remaining
        .iter()
        .filter(|(name, node)| {
            !nodes::is_event(node) && !reachable.contains(*name) && were_reachable.contains(*name)
        })
        .map(|(name, _)| name.clone())
        .collect();
    if !newly_stranded.is_empty() {
        editor.dialogs.push(ModalDialog::Confirm(ConfirmDialog {
            title: format!("Delete {}?", names.join(", ")),
            body: format!(
                "No flow would reach {} afterwards. Delete those too, or link them elsewhere first.",
                newly_stranded.join(", ")
            ),
            label: format!("Delete {} nodes", names.len() + newly_stranded.len()),
            compare: None,
            action: ConfirmAction::DeleteScriptNodes {
                script: doc.at.clone(),
                names: names.iter().chain(newly_stranded.iter()).cloned().collect(),
            },
        }));
        return;
    }
    let label = match names.as_slice() {
        [one] => format!("Delete {one} in {}", doc.at.title()),
        many => format!("Delete {} nodes in {}", many.len(), doc.at.title()),
    };
    if write(editor, doc, script, label) {
        select_nodes(editor, doc, &[]);
    }
}

pub fn delete_nodes_now(editor: &mut Editor, at: &ScriptRow, names: Vec<String>) {
    let Some(doc) = ScriptDoc::load(editor, at) else {
        return;
    };
    let script = remove_nodes(&doc, &names, catalogue_of(editor.project.as_ref()));
    let label = format!("Delete {} nodes in {}", names.len(), at.title());
    if write(editor, &doc, script, label) {
        select_nodes(editor, &doc, &[]);
    }
}

pub fn add_node(
    editor: &mut Editor,
    doc: &ScriptDoc,
    kind: &str,
    at: Option<Pos2>,
    link: Option<(String, String)>,
) {
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(ScriptDef::TABLE);
    let Some(mut node) = nodes::template(root, kind) else {
        editor.toast(format!("No node kind {kind}"));
        return;
    };
    if nodes::is_dialogue(&node) {
        node["lines"] = serde_json::json!([doc.default_speaker().blank_line()]);
    }
    if let (Some(schema), Some(project)) = (nodes::node_schema(root), editor.project.as_ref()) {
        nodes::fill_references(root, schema, &mut node, &project.files);
    }
    if nodes::is_event(&node) {
        let catalogue = catalogue_of(editor.project.as_ref());
        let used: HashSet<&str> = doc.nodes().values().filter_map(nodes::event_of).collect();
        if let Some((event, _)) = catalogue.events.iter().find(|(event, _)| {
            catalogue.event_refusal(event, doc.kind).is_none() && !used.contains(event.as_str())
        }) {
            node = nodes::template_event(root, event).unwrap_or(node);
        }
    }
    let base = if nodes::is_dialogue(&node) {
        &doc.at.key
    } else {
        kind
    };
    let name = nodes::free_name(doc.nodes(), base);
    let mut script = doc.script.clone();
    if let Some(map) = script["nodes"].as_object_mut() {
        nodes::insert_sorted(map, &name, node);
        if let Some((from, field)) = &link
            && let Some(source) = map.get_mut(from)
        {
            nodes::set_arrow(source, field, Some(&name));
        }
    }
    let script_row = doc.at.clone();
    let label = match &link {
        Some((from, _)) => format!("Add {kind} after {from} in {}", script_row.title()),
        None => format!("Add {kind} to {}", script_row.title()),
    };
    if write(editor, doc, script, label) {
        let view = editor
            .views
            .script
            .view_mut(&script_row, &editor.user, editor.project.as_ref());
        let graph_pos = match (at, view.to_global) {
            (Some(at), Some(to_global)) => to_global.inverse() * at,
            (Some(at), None) => at,
            (None, _) => link
                .as_ref()
                .map_or(Pos2::new(40.0, 40.0), |(from, _)| beside(&view.graph, from)),
        };
        view.place_node(&name, graph_pos);
        select_nodes(editor, doc, &[name]);
    }
}

pub fn write(editor: &mut Editor, doc: &ScriptDoc, script: Value, label: String) -> bool {
    let mut edit = ContentEdit::new(label);
    edit.write_json(doc.file.clone(), &script);
    let written = editor.apply(edit);
    editor.views.script.callout = (!written)
        .then_some(editor.last_refusal.as_ref())
        .flatten()
        .map(|refusal| {
            let named = ScriptRef::parse(&refusal.pointer)
                .node
                .filter(|name| doc.nodes().contains_key(name));
            let selected = editor
                .views
                .script
                .view(&doc.at)
                .and_then(|view| view.selected.first().cloned());
            ScriptCallout {
                at: doc.at.clone(),
                node: named.or(selected).unwrap_or_default(),
                to: None,
                rule: refusal.problem.rule.replace('_', " "),
                text: format!(
                    "{}; expected {}.",
                    refusal.problem.found, refusal.problem.expected
                ),
                since: Instant::now(),
            }
        });
    written
}

pub fn rename_node_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: RenameNodeDialog,
) -> Option<RenameNodeDialog> {
    let doc = ScriptDoc::load(editor, &dialog.at)?;
    let mut outcome: Option<Option<String>> = None;
    dialogs::card(ctx, "rename-node", 360.0, |ui| {
        let pressed = dialogs::keys(ui);
        ui.label(RichText::new("Rename node").strong().size(18.0));
        ui.add_space(6.0);
        ui.label(theme::muted(format!("{} becomes:", dialog.old)).size(13.5));
        let output = egui::TextEdit::singleline(&mut dialog.draft)
            .font(egui::TextStyle::Monospace)
            .desired_width(f32::INFINITY)
            .show(ui);
        if !output.response.has_focus() {
            output.response.request_focus();
            let mut state = output.state;
            state
                .cursor
                .set_char_range(Some(egui::text::CCursorRange::two(
                    egui::text::CCursor::new(0),
                    egui::text::CCursor::new(dialog.draft.chars().count()),
                )));
            state.store(ui.ctx(), output.response.id);
        }
        let taken = dialog.draft != dialog.old && doc.nodes().contains_key(&dialog.draft);
        if taken {
            ui.colored_label(theme::DANGER, "that name is taken");
        }
        let ok = !dialog.draft.trim().is_empty()
            && !taken
            && dialog
                .draft
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_');
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if ui.add_enabled(ok, egui::Button::new("Rename")).clicked() || (ok && pressed.enter) {
                outcome = Some(Some(dialog.draft.clone()));
            }
            if ui.button("Cancel").clicked() || pressed.escape {
                outcome = Some(None);
            }
        });
    });
    match outcome {
        None => Some(dialog),
        Some(None) => None,
        Some(Some(new)) => {
            if new != dialog.old {
                rename_node(editor, &doc, &dialog.old, &new);
            }
            None
        }
    }
}

pub fn rename_node(editor: &mut Editor, doc: &ScriptDoc, old: &str, new: &str) {
    let mut script = doc.script.clone();
    if let Some(map) = script["nodes"].as_object_mut() {
        nodes::rename(map, old, new, catalogue_of(editor.project.as_ref()));
    }
    let at = doc.at.clone();
    let label = format!("Rename {old} to {new} in {}", at.title());
    if write(editor, doc, script, label) {
        editor
            .views
            .script
            .view_mut(&at, &editor.user, editor.project.as_ref())
            .rename_node(old, new);
        select_nodes(editor, doc, &[new.to_owned()]);
    }
}

pub fn link_node_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: LinkNodeDialog,
) -> Option<LinkNodeDialog> {
    let doc = ScriptDoc::load(editor, &dialog.at)?;
    let ports = doc
        .nodes()
        .get(&dialog.from)
        .map(|node| nodes::ports(node, catalogue_of(editor.project.as_ref())))
        .unwrap_or_default();
    let mut outcome: Option<Option<String>> = None;
    dialogs::card(ctx, "link-node", 360.0, |ui| {
        let pressed = dialogs::keys(ui);
        ui.label(
            RichText::new(format!("Link {} to…", dialog.from))
                .strong()
                .size(18.0),
        );
        ui.add_space(6.0);
        let response = widgets::search_box(ui, &mut dialog.search, "node name", None);
        widgets::default_focus(ui, &response);
        let needle = dialog.search.to_lowercase();
        if ports.len() > 1 {
            widgets::combo("link-port")
                .selected_text(
                    ports
                        .get(dialog.port)
                        .map(|p| p.label.clone())
                        .unwrap_or_default(),
                )
                .show_ui(ui, |ui| {
                    for (index, port) in ports.iter().enumerate() {
                        ui.selectable_value(&mut dialog.port, index, &port.label);
                    }
                });
        }
        let matches: Vec<&String> = doc
            .nodes()
            .keys()
            .filter(|name| *name != &dialog.from && name.to_lowercase().contains(&needle))
            .collect();
        egui::ScrollArea::vertical()
            .max_height(240.0)
            .show(ui, |ui| {
                for name in &matches {
                    if ui.selectable_label(false, *name).clicked() {
                        outcome = Some(Some((*name).clone()));
                    }
                }
            });
        if pressed.enter
            && let Some(name) = matches.first()
        {
            outcome = Some(Some((*name).clone()));
        }
        if pressed.escape {
            outcome = Some(None);
        }
    });
    match outcome {
        None => Some(dialog),
        Some(None) => None,
        Some(Some(to)) => {
            if let Some(port) = ports.get(dialog.port) {
                let action = ScriptGraphAction::Connect {
                    from: dialog.from,
                    field: port.field.clone(),
                    to,
                };
                act(editor, &doc, action);
            }
            None
        }
    }
}

fn save_layout(editor: &mut Editor, ui: &Ui, at: &ScriptRow) {
    if ui.input(|input| input.pointer.any_down()) {
        return;
    }
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let Some(view) = editor.views.script.existing_view_mut(at) else {
        return;
    };
    if !view.layout_dirty {
        return;
    }
    view.layout_dirty = false;
    let layout = ScriptGraphLayout::of(&view.graph, view.outline);
    if let Err(error) = editor.user.save_layout(&project.root, &at.slug(), &layout) {
        editor.toast(format!("The graph layout was not saved: {error}"));
    }
}
