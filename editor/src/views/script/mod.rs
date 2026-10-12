pub mod graph;
pub mod inspect;
pub mod nodes;
pub mod outline;
pub mod palette;
pub mod panel;
pub mod run;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use egui::{Key, Modifiers, RichText, Ui};
use egui_snarl::ui::get_selected_nodes;
use game::core::script::OwnerKind;
use serde_json::{Map, Value};

use crate::app::{ConfirmAction, ConfirmDialog, Dialog, Editor};
use crate::project::{Edit, Selection, row_file};
use crate::tabs::Tab;
use crate::ui::theme;
use graph::{Graph, GraphAction, Layout};
use nodes::Catalogue;

/// Whose script a view shows: a script row, or the script module at `pointer` in a row.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum ScriptOwner {
    Shared {
        key: String,
    },
    Inline {
        table: String,
        key: String,
        pointer: String,
    },
}

impl ScriptOwner {
    pub fn inline(table: &str, key: &str, pointer: &str) -> ScriptOwner {
        ScriptOwner::Inline {
            table: table.to_owned(),
            key: key.to_owned(),
            pointer: pointer.to_owned(),
        }
    }

    pub fn title(&self) -> String {
        match self {
            ScriptOwner::Shared { key } => format!("script/{key}"),
            ScriptOwner::Inline {
                table,
                key,
                pointer,
            } => match object_index(pointer) {
                Some(object) => format!("{table}/{key} › object {object} › script"),
                None => format!("{table}/{key} › script"),
            },
        }
    }

    pub fn row(&self) -> Option<(String, String)> {
        match self {
            ScriptOwner::Shared { key } => Some(("script".to_owned(), key.clone())),
            ScriptOwner::Inline { table, key, .. } => Some((table.clone(), key.clone())),
        }
    }

    pub fn table(&self) -> &str {
        match self {
            ScriptOwner::Shared { .. } => "script",
            ScriptOwner::Inline { table, .. } => table,
        }
    }

    pub fn key(&self) -> &str {
        match self {
            ScriptOwner::Shared { key } | ScriptOwner::Inline { key, .. } => key,
        }
    }

    pub fn file(&self) -> String {
        row_file(self.table(), self.key())
    }

    pub fn pointer(&self) -> &str {
        match self {
            ScriptOwner::Shared { .. } => "",
            ScriptOwner::Inline { pointer, .. } => pointer,
        }
    }

    pub fn slug(&self) -> String {
        match self {
            ScriptOwner::Shared { key } => format!("script-{key}"),
            ScriptOwner::Inline {
                table,
                key,
                pointer,
            } => format!("{table}-{key}{}", pointer.replace('/', "-")),
        }
    }

    pub fn renamed(&self, table: &str, key: &str, new_key: &str) -> Option<ScriptOwner> {
        match self {
            ScriptOwner::Shared { key: k } if table == "script" && k == key => {
                Some(ScriptOwner::Shared {
                    key: new_key.to_owned(),
                })
            }
            ScriptOwner::Inline {
                table: t,
                key: k,
                pointer,
            } if t == table && k == key => Some(ScriptOwner::Inline {
                table: t.clone(),
                key: new_key.to_owned(),
                pointer: pointer.clone(),
            }),
            _ => None,
        }
    }

    pub fn is_row(&self, table: &str, key: &str) -> bool {
        self.table() == table && self.key() == key
    }
}

fn object_index(pointer: &str) -> Option<usize> {
    let rest = pointer.strip_prefix("/modules/")?;
    let (module, tail) = rest.split_once('/')?;
    tail.starts_with("scripts/")
        .then(|| module.parse().ok())
        .flatten()
}

/// A script as its file holds it: the row, the script object inside it and the owner kind it
/// compiles for.
#[derive(Clone)]
pub struct Doc {
    pub owner: ScriptOwner,
    pub file: String,
    pub row: Value,
    pub script: Value,
    pub kind: OwnerKind,
}

impl Doc {
    pub fn load(editor: &Editor, owner: &ScriptOwner) -> Option<Doc> {
        let row = editor.row_value(owner.table(), owner.key())?;
        let script = match owner {
            ScriptOwner::Shared { .. } => row.clone(),
            ScriptOwner::Inline { pointer, .. } => row.pointer(pointer)?.clone(),
        };
        if !script.is_object() || !script["nodes"].is_object() {
            return None;
        }
        let kind = match owner {
            ScriptOwner::Shared { .. } => {
                nodes::owner_kind_named(script["owner"].as_str().unwrap_or("any"))
            }
            ScriptOwner::Inline { table, pointer, .. } => nodes::owner_kind_of(table, pointer),
        };
        Some(Doc {
            owner: owner.clone(),
            file: owner.file(),
            row,
            script,
            kind,
        })
    }

    pub fn nodes(&self) -> &Map<String, Value> {
        self.script["nodes"].as_object().expect("a nodes map")
    }

    pub fn is_shared(&self) -> bool {
        matches!(self.owner, ScriptOwner::Shared { .. })
    }

    /// The row with `script` written back where it came from.
    pub fn row_with(&self, script: Value) -> Value {
        match &self.owner {
            ScriptOwner::Shared { .. } => script,
            ScriptOwner::Inline { pointer, .. } => {
                let mut row = self.row.clone();
                if let Some(slot) = row.pointer_mut(pointer) {
                    *slot = script;
                }
                row
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Panel {
    #[default]
    MayDo,
    UsedBy,
    Run,
    History,
}

impl Panel {
    pub const ALL: [Panel; 4] = [Panel::MayDo, Panel::UsedBy, Panel::Run, Panel::History];

    pub fn title(self) -> &'static str {
        match self {
            Panel::MayDo => "May do",
            Panel::UsedBy => "Used by",
            Panel::Run => "Run",
            Panel::History => "History",
        }
    }
}

pub struct ViewState {
    pub graph: Option<Graph>,
    pub layout: Layout,
    pub layout_loaded: bool,
    pub layout_dirty: bool,
    pub panel: Panel,
    pub panel_open: bool,
    pub selected: Vec<String>,
    pub marked: Vec<String>,
    pub palette: Option<palette::Palette>,
    pub rename: Option<(String, String)>,
    pub link_by_name: Option<(String, String)>,
    pub outline_focus: Option<String>,
    pub folded: HashSet<String>,
    pub snarl_id: egui::Id,
    pub to_global: Option<egui::emath::TSTransform>,
    pub rects: HashMap<String, egui::Rect>,
}

impl ViewState {
    fn new(owner: &ScriptOwner) -> ViewState {
        ViewState {
            graph: None,
            layout: Layout::default(),
            layout_loaded: false,
            layout_dirty: false,
            panel: Panel::MayDo,
            panel_open: true,
            selected: Vec::new(),
            marked: Vec::new(),
            palette: None,
            rename: None,
            link_by_name: None,
            outline_focus: None,
            folded: HashSet::new(),
            snarl_id: egui::Id::new(("script-graph", owner.slug())),
            to_global: None,
            rects: HashMap::new(),
        }
    }
}

/// The keys a script tab answers, taken before any widget can claim them.
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
    /// Consumes the keys from this frame's input; called before the widgets are drawn.
    pub fn take(ctx: &egui::Context) -> ScriptKeys {
        ctx.input_mut(|i| ScriptKeys {
            fire: i.consume_key(Modifiers::NONE, Key::F8),
            tab: i.consume_key(Modifiers::NONE, Key::Tab),
            outline: i.consume_key(Modifiers::NONE, Key::O),
            delete: i.consume_key(Modifiers::NONE, Key::Delete)
                | i.consume_key(Modifiers::NONE, Key::Backspace),
            rename: i.consume_key(Modifiers::NONE, Key::F2),
            duplicate: i.consume_key(Modifiers::COMMAND, Key::D),
            enter: i.consume_key(Modifiers::NONE, Key::Enter),
            ctrl_enter: i.consume_key(Modifiers::COMMAND, Key::Enter),
            link: i.consume_key(Modifiers::COMMAND, Key::L),
            up: i.consume_key(Modifiers::NONE, Key::ArrowUp),
            down: i.consume_key(Modifiers::NONE, Key::ArrowDown),
            left: i.consume_key(Modifiers::NONE, Key::ArrowLeft),
            right: i.consume_key(Modifiers::NONE, Key::ArrowRight),
        })
    }
}

#[derive(Default)]
pub struct ScriptViews {
    pub views: HashMap<ScriptOwner, ViewState>,
    pub keys: ScriptKeys,
    pub shown_rect: Option<egui::Rect>,
    pub catalogue: Option<Catalogue>,
    pub catalogue_for: u64,
    pub run: Option<run::Run>,
    pub setups: HashMap<ScriptOwner, run::Setup>,
    pub focus: Option<ScriptOwner>,
    pub fire: Option<ScriptOwner>,
    pub pending: Option<(ScriptOwner, Pending)>,
    pub callout: Option<Callout>,
    pub generation: u64,
}

/// A step a scene asked for before the script tab had drawn, taken on its first frame.
pub enum Pending {
    MakeShared,
    MakeInline,
    Connect {
        from: String,
        field: String,
        to: String,
    },
}

/// The last refused edit, called out on the canvas by the node it touched until the next edit.
pub struct Callout {
    pub owner: ScriptOwner,
    pub node: String,
    pub to: Option<String>,
    pub rule: String,
    pub text: String,
    pub since: std::time::Instant,
}

impl Callout {
    pub fn live(&self, owner: &ScriptOwner) -> bool {
        self.owner == *owner && self.since.elapsed().as_secs_f32() < 12.0
    }
}

impl ScriptViews {
    pub fn content_changed(&mut self) {
        self.generation += 1;
    }

    pub fn close(&mut self) {
        self.views.clear();
        self.run = None;
        self.focus = None;
        self.catalogue = None;
    }
}

/// The catalogue for the current content, built once per content.
pub fn catalogue(editor: &mut Editor) -> &Catalogue {
    let (generation, content) = editor
        .project
        .as_ref()
        .map(|project| (project.generation, project.content))
        .unwrap_or((0, None));
    let shapes = editor.shapes.clone();
    let views = &mut editor.views.script;
    if views.catalogue.is_none() || views.catalogue_for != generation {
        let root = shapes
            .table("script")
            .map(|shape| shape.shape.clone())
            .unwrap_or(Value::Null);
        views.catalogue = Some(Catalogue::build(&root, content));
        views.catalogue_for = generation;
    }
    views.catalogue.as_ref().expect("built above")
}

pub fn show(editor: &mut Editor, ui: &mut Ui, owner: &ScriptOwner) {
    let Some(doc) = Doc::load(editor, owner) else {
        ui.label(RichText::new(format!("{} is gone", owner.title())).weak());
        return;
    };
    editor.views.script.focus = Some(owner.clone());
    editor.views.script.shown_rect = Some(ui.max_rect());
    if let Some((_, pending)) = editor
        .views
        .script
        .pending
        .take_if(|(pending, _)| pending == owner)
    {
        match pending {
            Pending::MakeShared => inspect::make_shared_dialog(editor, &doc),
            Pending::MakeInline => inspect::make_inline_dialog(editor, &doc),
            Pending::Connect { from, field, to } => {
                act_now(editor, &doc, GraphAction::Connect { from, field, to })
            }
        }
    }
    if ui.input(|i| i.pointer.any_pressed())
        && ui.rect_contains_pointer(ui.max_rect())
        && let Some(path) = editor.dock.find_tab(&Tab::Script(owner.clone()))
    {
        editor.dock.main_surface_mut().set_focused_node(path.node);
    }
    let _ = catalogue(editor);
    let generation = editor.views.script.generation;
    let layout_file = layout_file(editor, owner);
    {
        let view = editor
            .views
            .script
            .views
            .entry(owner.clone())
            .or_insert_with(|| ViewState::new(owner));
        if !view.layout_loaded {
            view.layout = layout_file
                .as_ref()
                .and_then(|file| std::fs::read_to_string(file).ok())
                .and_then(|text| serde_json::from_str(&text).ok())
                .unwrap_or_default();
            view.layout_loaded = true;
        }
    }
    let mut actions = Vec::new();
    keys(editor, ui, &doc, &mut actions);
    status(editor, &doc);
    egui::CentralPanel::default()
        .frame(egui::Frame::NONE)
        .show(ui, |ui| {
            let outline = editor.views.script.views[owner].layout.outline;
            if outline {
                outline::show(editor, ui, &doc, &mut actions);
            } else {
                canvas(editor, ui, &doc, &mut actions);
            }
        });
    palette::show(editor, ui, &doc, &mut actions);
    rename_dialog(editor, ui, &doc);
    link_dialog(editor, ui, &doc);
    for action in actions {
        act(editor, &doc, action, generation);
    }
    editor.views.script.keys = ScriptKeys::default();
    save_layout(editor, owner, layout_file);
}

/// The bottom panel of a script tab: what the script may do, who uses it, or a run of it.
pub fn bottom(editor: &mut Editor, ui: &mut Ui, owner: &ScriptOwner, tab: crate::app::BottomTab) {
    let Some(doc) = Doc::load(editor, owner) else {
        return;
    };
    let panel = match tab {
        crate::app::BottomTab::UsedBy => Panel::UsedBy,
        crate::app::BottomTab::Run => Panel::Run,
        _ => Panel::MayDo,
    };
    panel::show(editor, ui, &doc, panel);
}

fn canvas(editor: &mut Editor, ui: &mut Ui, doc: &Doc, actions: &mut Vec<GraphAction>) {
    let generation = editor.views.script.generation;
    let owner = doc.owner.clone();
    let lit: HashSet<String> = editor
        .views
        .script
        .run
        .as_ref()
        .filter(|run| run.doc_owner == owner)
        .map(|run| run.visited.iter().cloned().collect())
        .unwrap_or_default();
    let current: Option<String> = editor
        .views
        .script
        .run
        .as_ref()
        .filter(|run| run.doc_owner == owner)
        .and_then(|run| run.visited.last().cloned());
    let selected_before;
    let snarl_id;
    {
        let views = &mut editor.views.script;
        let catalogue = views.catalogue.as_ref().expect("catalogue");
        let view = views.views.get_mut(&owner).expect("view");
        if view
            .graph
            .as_ref()
            .is_none_or(|graph| graph.built != generation)
        {
            graph::place_missing(doc, catalogue, &mut view.layout);
            view.graph = Some(graph::build(doc, catalogue, &view.layout, generation));
        }
        let selection = &editor.selection;
        if selection.table == owner.table()
            && selection.keys == [owner.key()]
            && is_node_selection(selection)
        {
            let mut names: Vec<String> = selection
                .parts
                .iter()
                .filter_map(|part| part.strip_prefix("node:"))
                .map(str::to_owned)
                .collect();
            names.sort();
            if names != view.selected {
                view.selected = names;
            }
        }
        selected_before = view.selected.clone();
        snarl_id = view.snarl_id;
    }
    let faces = faces(editor, ui.ctx(), doc);
    let (positions, to_global, mut taken, rects) = {
        let views = &mut editor.views.script;
        let drafts = &mut editor.form.drafts;
        let catalogue = views.catalogue.as_ref().expect("catalogue");
        let view = views.views.get_mut(&owner).expect("view");
        let graph = view.graph.as_mut().expect("graph");
        let chosen: HashSet<String> = selected_before.iter().cloned().collect();
        let mut viewer = graph::Viewer::new(
            doc,
            catalogue,
            &lit,
            current.as_deref(),
            &chosen,
            &faces,
            drafts,
        );
        if view.to_global.is_none() {
            let mut bounds = egui::Rect::NOTHING;
            for at in view.layout.nodes.values() {
                bounds = bounds.union(egui::Rect::from_min_size(
                    egui::pos2(at[0], at[1]),
                    egui::vec2(graph::CARD + 20.0, 120.0),
                ));
            }
            if bounds.is_finite() {
                viewer.fit = Some((bounds, ui.max_rect()));
            }
        }
        graph::widget(snarl_id).show(&mut graph.snarl, &mut viewer, ui);
        (
            graph::positions(graph),
            viewer.to_global,
            std::mem::take(&mut viewer.actions),
            std::mem::take(&mut viewer.rects),
        )
    };
    header_chip(editor, ui, doc);
    if let Some(view) = editor.views.script.views.get_mut(&owner) {
        view.rects = rects;
    }
    run::conversation_box(editor, ui, doc);
    let mut clicked: Vec<(String, bool)> = Vec::new();
    taken.retain(|action| match action {
        GraphAction::Select { name, extend } => {
            clicked.push((name.clone(), *extend));
            false
        }
        _ => true,
    });
    actions.append(&mut taken);
    let selected: Vec<String> = {
        let view = editor.views.script.views.get_mut(&owner).expect("view");
        let graph = view.graph.as_ref().expect("graph");
        let ids = get_selected_nodes(snarl_id, ui.ctx());
        let mut marked: Vec<String> = ids
            .iter()
            .filter_map(|id| graph.snarl.get_node(*id).map(|node| node.name.clone()))
            .collect();
        marked.sort();
        if view.layout.nodes != positions {
            view.layout.nodes = positions;
            view.layout_dirty = true;
        }
        view.to_global = Some(to_global);
        let mut names = if marked != view.marked {
            view.marked = marked.clone();
            marked
        } else {
            selected_before.clone()
        };
        for (name, extend) in clicked {
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
    callout(editor, ui, &owner);
    if selected != selected_before {
        let view = editor.views.script.views.get_mut(&owner).expect("view");
        view.selected = selected.clone();
        if !selected.is_empty() {
            select_nodes(editor, doc, &selected);
        }
    }
}

/// The bust of every npc line in the script, cropped to a square, for the cards.
fn faces(editor: &mut Editor, ctx: &egui::Context, doc: &Doc) -> graph::Faces {
    let mut faces = graph::Faces::new();
    let Some(project) = editor.project.as_ref() else {
        return faces;
    };
    let files = &project.files;
    let thumbnails = &mut editor.form.thumbnails;
    for node in doc.nodes().values() {
        for line in node["lines"].as_array().into_iter().flatten() {
            let by = &line["by"];
            if by["type"] != "npc" {
                continue;
            }
            let Some(npc) = by["npc"].as_str() else {
                continue;
            };
            let face = by["face"].as_str().map(str::to_owned);
            let key = (npc.to_owned(), face.clone());
            if faces.contains_key(&key) {
                continue;
            }
            let Some(file) = nodes::bust_file(files, npc, face.as_deref()) else {
                continue;
            };
            let Some(thumb) = thumbnails.image(ctx, files, &file) else {
                continue;
            };
            let [w, h] = [thumb.size[0] as f32, thumb.size[1] as f32];
            let uv = if h >= w {
                egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, w / h))
            } else {
                let margin = (1.0 - h / w) / 2.0;
                egui::Rect::from_min_max(egui::pos2(margin, 0.0), egui::pos2(1.0 - margin, 1.0))
            };
            faces.insert(key, (thumb.texture.id(), uv));
        }
    }
    faces
}

/// "npc/mara · inline script · 7 nodes" in the canvas corner.
fn header_chip(editor: &Editor, ui: &Ui, doc: &Doc) {
    let text = match editor
        .views
        .script
        .run
        .as_ref()
        .filter(|run| run.doc_owner == doc.owner)
    {
        Some(_) => format!(
            "{} · running with a pretend subject",
            owner_label(editor, doc)
        ),
        None => chip_title(editor, doc),
    };
    let painter = ui.painter();
    let galley =
        painter.layout_no_wrap(text, egui::FontId::monospace(12.5), crate::ui::theme::TEXT);
    let at = ui.max_rect().min + egui::vec2(16.0, 12.0);
    let rect = egui::Rect::from_min_size(at, galley.size() + egui::vec2(16.0, 8.0));
    painter.rect_filled(
        rect,
        4.0,
        egui::Color32::from_rgba_unmultiplied(12, 12, 16, 220),
    );
    painter.galley(
        rect.min + egui::vec2(8.0, 4.0),
        galley,
        crate::ui::theme::TEXT,
    );
}

/// "npc/mara" or "area/island · object tide_chest": the owner as the chips name it.
pub fn owner_label(editor: &Editor, doc: &Doc) -> String {
    match &doc.owner {
        ScriptOwner::Shared { key } => format!("script/{key}"),
        ScriptOwner::Inline {
            table,
            key,
            pointer,
        } => match object_index(pointer) {
            Some(index) => {
                let name = editor
                    .row_value(table, key)
                    .and_then(|row| row["modules"][index]["name"].as_str().map(str::to_owned))
                    .unwrap_or_else(|| format!("object {index}"));
                format!("{table}/{key} · object {name}")
            }
            None => format!("{table}/{key}"),
        },
    }
}

/// "npc/mara · inline script · 7 nodes" or "script/warp · owner object · 2 nodes".
pub fn chip_title(editor: &Editor, doc: &Doc) -> String {
    let count = doc.nodes().len();
    let nodes = format!("{count} node{}", if count == 1 { "" } else { "s" });
    match &doc.owner {
        ScriptOwner::Shared { key } => {
            let mut text = format!("script/{key} · owner {} · {nodes}", doc.kind.name());
            if editor.shapes.is_fixture("script", key) {
                text.push_str(" · from New Game");
            }
            text
        }
        ScriptOwner::Inline { .. } => {
            format!("{} · inline script · {nodes}", owner_label(editor, doc))
        }
    }
}

/// What the status bar says under a script: where we are, and the one hint that fits the moment.
fn status(editor: &mut Editor, doc: &Doc) {
    let owner = doc.owner.clone();
    let view = editor.views.script.views.get(&owner);
    let outline = view.is_some_and(|view| view.layout.outline);
    let palette = view.is_some_and(|view| view.palette.is_some());
    let selected = view.map(|view| view.selected.clone()).unwrap_or_default();
    let run = editor
        .views
        .script
        .run
        .as_ref()
        .filter(|run| run.doc_owner == owner);
    let what = if doc.is_shared() {
        "shared script".to_owned()
    } else {
        "inline script".to_owned()
    };
    let head = match selected.as_slice() {
        [one] if !outline && !palette => format!(
            "{} › {one}",
            owner_label(editor, doc).split(" · ").next().unwrap_or("")
        ),
        _ => format!(
            "{} › {what}{}",
            owner_label(editor, doc).split(" · ").next().unwrap_or(""),
            if outline {
                " · outline"
            } else if palette {
                " · palette"
            } else {
                ""
            }
        ),
    };
    let refused = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(&owner))
        .map(|callout| callout.rule.clone());
    let hint = if let Some(rule) = refused {
        format!("refused · {rule}  nothing changed")
    } else if let Some(run) = run {
        let waiting = run
            .visited
            .last()
            .map(|node| format!("waiting at {node}"))
            .unwrap_or_else(|| "ended".to_owned());
        format!("Run · 1 flow · {waiting}   1 – 9 pick a choice · Esc stops")
    } else if palette {
        "↑↓ choose · → opens a system · Enter places it".to_owned()
    } else if outline {
        "O switches to the canvas, keeping the selection".to_owned()
    } else {
        match selected.as_slice() {
            [one] => match doc.nodes().get(one).map(nodes::kind) {
                Some("dialogue") => {
                    "Enter adds a line · Ctrl Enter a choice · select text to style it".to_owned()
                }
                Some("if") => {
                    "each slot takes one type · the same builder edits every condition".to_owned()
                }
                Some("remember") | Some("forget") => "two arrows may lead into one node".to_owned(),
                Some("repeat") | Some("wait") | Some("random") => {
                    "a loop may come back only through a node that pauses".to_owned()
                }
                Some("run") => "calls nest 8 deep and never loop back".to_owned(),
                Some("on") => "a flow starts here; its cause is the subject".to_owned(),
                _ => "an output without an arrow ends the flow".to_owned(),
            },
            [] => "Tab opens the palette · drag from a dot to link · Del removes".to_owned(),
            many => format!(
                "{} nodes · drag moves them together · Del removes them",
                many.len()
            ),
        }
    };
    editor.status.left.push(head);
    editor.status.left.push(hint);
}

/// The first free spot to the right of `from`, walking down past nodes already there.
fn beside(view: &ViewState, from: &str) -> egui::Pos2 {
    let Some(origin) = view.layout.nodes.get(from) else {
        return egui::Pos2::new(40.0, 40.0);
    };
    let mut pos = egui::Pos2::new(origin[0] + 280.0, origin[1]);
    while view
        .layout
        .nodes
        .values()
        .any(|p| (p[0] - pos.x).abs() < 200.0 && (p[1] - pos.y).abs() < 60.0)
    {
        pos.y += 130.0;
    }
    pos
}

/// The last refusal, drawn by the node it touched: the rule as a title, the sentence under it,
/// and the arrow that was refused as a dashed line.
fn callout(editor: &mut Editor, ui: &mut Ui, owner: &ScriptOwner) {
    let Some(callout) = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(owner))
    else {
        return;
    };
    let Some(view) = editor.views.script.views.get(owner) else {
        return;
    };
    let Some(to_global) = view.to_global else {
        return;
    };
    let Some(anchor) = view.rects.get(&callout.node).map(|rect| to_global * *rect) else {
        return;
    };
    let painter = ui
        .ctx()
        .layer_painter(egui::LayerId::new(
            egui::Order::Foreground,
            ui.id().with("callout"),
        ))
        .with_clip_rect(ui.max_rect());
    if let Some(target) = callout
        .to
        .as_ref()
        .and_then(|to| view.rects.get(to))
        .map(|rect| to_global * *rect)
    {
        let from = anchor.right_center();
        let to = target.left_center();
        let lift = egui::vec2(0.0, -(24.0 + (from.x - to.x).abs() * 0.06).min(80.0));
        let curve = egui::epaint::CubicBezierShape::from_points_stroke(
            [
                from,
                from + lift + egui::vec2(60.0, 0.0),
                to + lift - egui::vec2(60.0, 0.0),
                to,
            ],
            false,
            egui::Color32::TRANSPARENT,
            egui::Stroke::NONE,
        );
        let points: Vec<egui::Pos2> = curve.flatten(Some(0.5));
        painter.add(egui::Shape::dashed_line(
            &points,
            egui::Stroke::new(1.5, theme::DANGER),
            6.0,
            5.0,
        ));
        painter.rect_stroke(
            target,
            6.0,
            egui::Stroke::new(1.5, theme::DANGER),
            egui::StrokeKind::Outside,
        );
    }
    painter.rect_stroke(
        anchor,
        6.0,
        egui::Stroke::new(1.5, theme::DANGER),
        egui::StrokeKind::Outside,
    );
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
    let size = egui::vec2(
        width + pad * 2.0,
        title.size().y + body.size().y + pad * 2.0 + 4.0,
    );
    let mut top_left = anchor.left_bottom() + egui::vec2(0.0, 10.0);
    top_left.x = top_left
        .x
        .min(ui.max_rect().right() - size.x - 8.0)
        .max(ui.max_rect().left() + 8.0);
    if top_left.y + size.y > ui.max_rect().bottom() - 8.0 {
        top_left.y = anchor.top() - size.y - 10.0;
    }
    let rect = egui::Rect::from_min_size(top_left, size);
    painter.rect(
        rect,
        6.0,
        egui::Color32::from_rgb(34, 24, 28),
        egui::Stroke::new(1.0, theme::DANGER),
        egui::StrokeKind::Inside,
    );
    let title_height = title.size().y;
    painter.galley(rect.min + egui::vec2(pad, pad), title, theme::DANGER);
    painter.galley(
        rect.min + egui::vec2(pad, pad + title_height + 4.0),
        body,
        theme::TEXT,
    );
}

/// Puts the nodes in the editor's selection so the inspector shows them.
pub fn select_nodes(editor: &mut Editor, doc: &Doc, names: &[String]) {
    editor.views.script.focus = Some(doc.owner.clone());
    editor.select(Selection {
        table: doc.owner.table().to_owned(),
        keys: vec![doc.owner.key().to_owned()],
        parts: names.iter().map(|name| format!("node:{name}")).collect(),
    });
    if let Some(view) = editor.views.script.views.get_mut(&doc.owner) {
        view.selected = names.to_vec();
    }
}

pub fn is_node_selection(selection: &Selection) -> bool {
    !selection.parts.is_empty()
        && selection
            .parts
            .iter()
            .all(|part| part.starts_with("node:") || part.starts_with("choice:"))
}

fn keys(editor: &mut Editor, ui: &mut Ui, doc: &Doc, actions: &mut Vec<GraphAction>) {
    let owner = doc.owner.clone();
    let keys = editor.views.script.keys;
    let outline_mode = editor
        .views
        .script
        .views
        .get(&owner)
        .is_some_and(|view| view.layout.outline);
    let view = editor.views.script.views.get_mut(&owner).expect("view");
    if view.palette.is_some() || view.rename.is_some() || view.link_by_name.is_some() {
        return;
    }
    if keys.fire {
        editor.panels.bottom = crate::app::BottomTab::Run;
        editor.views.script.fire = Some(owner.clone());
        return;
    }
    let view = editor.views.script.views.get_mut(&owner).expect("view");
    let ScriptKeys {
        tab,
        outline: o,
        delete: del,
        rename: f2,
        duplicate: dup,
        enter,
        ctrl_enter,
        link: ctrl_l,
        ..
    } = keys;
    if outline_mode {
        if o {
            view.layout.outline = false;
            view.layout_dirty = true;
        }
        return;
    }
    let selected = view.selected.clone();
    let first = selected.first().cloned();
    if o {
        view.layout.outline = !view.layout.outline;
        view.layout_dirty = true;
    }
    if tab {
        let link = first.as_ref().and_then(|name| {
            let node = doc.nodes().get(name)?;
            let catalogue = editor.views.script.catalogue.as_ref()?;
            nodes::ports(node, catalogue)
                .into_iter()
                .find(|port| port.target.is_none())
                .map(|port| (name.clone(), port.field))
        });
        let beside_node = first
            .as_ref()
            .and_then(|name| view.rects.get(name))
            .zip(view.to_global)
            .map(|(rect, to_global)| to_global * rect.right_top() + egui::vec2(16.0, 0.0));
        actions.push(GraphAction::Palette {
            at: beside_node
                .or_else(|| ui.input(|i| i.pointer.hover_pos()))
                .unwrap_or_else(|| ui.max_rect().center()),
            place: None,
            link,
        });
    }
    if del {
        for name in &selected {
            actions.push(GraphAction::Delete(name.clone()));
        }
    }
    if f2 && let Some(name) = &first {
        actions.push(GraphAction::Rename(name.clone()));
    }
    if dup {
        for name in &selected {
            actions.push(GraphAction::Duplicate(name.clone()));
        }
    }
    if let Some(name) = &first
        && doc
            .nodes()
            .get(name)
            .is_some_and(|node| nodes::kind(node) == "dialogue")
    {
        if ctrl_enter {
            actions.push(GraphAction::AddChoice(name.clone()));
        } else if enter {
            actions.push(GraphAction::AddLine(name.clone()));
        }
    }
    if ctrl_l && let Some(name) = &first {
        let view = editor.views.script.views.get_mut(&owner).expect("view");
        view.link_by_name = Some((name.clone(), String::new()));
    }
}

pub fn act_now(editor: &mut Editor, doc: &Doc, action: GraphAction) {
    let generation = editor.views.script.generation;
    act(editor, doc, action, generation);
}

fn act(editor: &mut Editor, doc: &Doc, action: GraphAction, generation: u64) {
    let owner = doc.owner.clone();
    match action {
        GraphAction::Connect { from, field, to } => {
            let mut script = doc.script.clone();
            if let Some(node) = script["nodes"].get_mut(&from) {
                nodes::set_arrow(node, &field, Some(&to));
            }
            if !write(
                editor,
                doc,
                script,
                format!("Link {from} to {to} in {}", owner.title()),
            ) && let Some(callout) = editor.views.script.callout.as_mut()
            {
                callout.node = from;
                callout.to = Some(to);
            }
        }
        GraphAction::Disconnect { from, field } => {
            let mut script = doc.script.clone();
            if let Some(node) = script["nodes"].get_mut(&from) {
                nodes::set_arrow(node, &field, None);
            }
            write(
                editor,
                doc,
                script,
                format!("Unlink {from} in {}", owner.title()),
            );
        }
        GraphAction::DropInputs(to) => {
            let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
            let mut script = doc.script.clone();
            let arrows = nodes::arrows_into(doc.nodes(), &to, catalogue);
            for (from, field) in arrows {
                if let Some(node) = script["nodes"].get_mut(&from) {
                    nodes::set_arrow(node, &field, None);
                }
            }
            write(
                editor,
                doc,
                script,
                format!("Unlink arrows into {to} in {}", owner.title()),
            );
        }
        GraphAction::Delete(name) => delete_nodes(editor, doc, vec![name]),
        GraphAction::Rename(name) => {
            if let Some(view) = editor.views.script.views.get_mut(&owner) {
                view.rename = Some((name.clone(), name));
            }
        }
        GraphAction::Duplicate(name) => {
            let Some(node) = doc.nodes().get(&name).cloned() else {
                return;
            };
            let mut script = doc.script.clone();
            let fresh = nodes::free_name(doc.nodes(), &name);
            let mut copy = node;
            let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
            let ports = nodes::ports(&copy, catalogue);
            let Some(free) = ports.iter().find(|port| port.target.is_none()) else {
                editor.toast(format!("{name} has no free output to lead to its copy"));
                return;
            };
            let field = free.field.clone();
            for port in &ports {
                nodes::set_arrow(&mut copy, &port.field, None);
            }
            script["nodes"][&fresh] = copy;
            if let Some(source) = script["nodes"].get_mut(&name) {
                nodes::set_arrow(source, &field, Some(&fresh));
            }
            if let Some(view) = editor.views.script.views.get_mut(&owner) {
                let at = beside(view, &name);
                view.layout.nodes.insert(fresh.clone(), [at.x, at.y]);
                view.layout_dirty = true;
            }
            if write(
                editor,
                doc,
                script,
                format!("Duplicate {name} in {}", owner.title()),
            ) {
                select_nodes(editor, doc, &[fresh]);
            }
        }
        GraphAction::Palette { at, place, link } => {
            if let Some(view) = editor.views.script.views.get_mut(&owner) {
                view.palette = Some(palette::Palette::new(Some(at), place, link));
            }
        }
        GraphAction::Select { name, extend } => {
            let mut names = if extend {
                editor
                    .views
                    .script
                    .views
                    .get(&owner)
                    .map(|view| view.selected.clone())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            if !names.contains(&name) {
                names.push(name);
            }
            select_nodes(editor, doc, &names);
        }
        GraphAction::AddLine(name) => {
            let mut script = doc.script.clone();
            let speaker = default_speaker(doc);
            if let Some(lines) = script["nodes"][&name]["lines"].as_array_mut() {
                lines.push(serde_json::json!({ "by": speaker, "text": [""] }));
            }
            write(
                editor,
                doc,
                script,
                format!("Add a line to {name} in {}", owner.title()),
            );
        }
        GraphAction::EditLine { name, index, text } => {
            let mut script = doc.script.clone();
            script["nodes"][&name]["lines"][index]["text"] = text;
            write(
                editor,
                doc,
                script,
                format!("Edit line {} of {name} · {}", index + 1, owner.title()),
            );
        }
        GraphAction::AddChoice(name) => {
            let mut script = doc.script.clone();
            let node = &mut script["nodes"][&name];
            if node.get("choices").is_none_or(Value::is_null) {
                node["choices"] = Value::Array(Vec::new());
            }
            node.as_object_mut().map(|map| map.remove("next"));
            if let Some(choices) = node["choices"].as_array_mut() {
                choices.push(serde_json::json!({ "label": ["…"] }));
            }
            write(
                editor,
                doc,
                script,
                format!("Add a choice to {name} in {}", owner.title()),
            );
        }
    }
    let _ = generation;
}

/// The speaker a new line starts with: the owning npc, the object, else the narrator.
pub fn default_speaker(doc: &Doc) -> Value {
    match (doc.kind, &doc.owner) {
        (OwnerKind::Npc, ScriptOwner::Inline { key, .. }) => {
            serde_json::json!({ "type": "npc", "npc": key })
        }
        (OwnerKind::Object, _) => serde_json::json!({ "type": "object" }),
        _ => serde_json::json!({ "type": "narrator" }),
    }
}

/// Removes nodes and the arrows into them; nodes left unreachable are offered for deletion too.
pub fn delete_nodes(editor: &mut Editor, doc: &Doc, names: Vec<String>) {
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let mut script = doc.script.clone();
    let nodes_map = script["nodes"].as_object_mut().expect("nodes");
    for name in &names {
        nodes_map.remove(name);
        let arrows = nodes::arrows_into(nodes_map, name, catalogue);
        for (from, field) in arrows {
            if let Some(node) = nodes_map.get_mut(&from) {
                nodes::set_arrow(node, &field, None);
            }
        }
    }
    let reachable = nodes::reachable(nodes_map, catalogue);
    let stranded: Vec<String> = nodes_map
        .keys()
        .filter(|name| {
            !reachable.contains(*name)
                && nodes_map
                    .get(*name)
                    .is_some_and(|node| nodes::kind(node) != "on")
        })
        .cloned()
        .collect();
    let were_reachable = nodes::reachable(doc.nodes(), catalogue);
    let newly_stranded: Vec<String> = stranded
        .into_iter()
        .filter(|name| were_reachable.contains(name))
        .collect();
    if !newly_stranded.is_empty() {
        editor.dialogs.push(Dialog::Confirm(ConfirmDialog {
            title: format!("Delete {}?", names.join(", ")),
            body: format!(
                "No flow would reach {} afterwards. Delete those too, or link them elsewhere first.",
                newly_stranded.join(", ")
            ),
            label: format!("Delete {} nodes", names.len() + newly_stranded.len()),
            compare: None,
            action: ConfirmAction::DeleteScriptNodes {
                owner: doc.owner.clone(),
                names: names.iter().chain(newly_stranded.iter()).cloned().collect(),
            },
        }));
        return;
    }
    let label = if names.len() == 1 {
        format!("Delete {} in {}", names[0], doc.owner.title())
    } else {
        format!("Delete {} nodes in {}", names.len(), doc.owner.title())
    };
    if write(editor, doc, script, label) {
        select_nodes(editor, doc, &[]);
    }
}

pub fn delete_nodes_now(editor: &mut Editor, owner: &ScriptOwner, names: Vec<String>) {
    let Some(doc) = Doc::load(editor, owner) else {
        return;
    };
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let mut script = doc.script.clone();
    let nodes_map = script["nodes"].as_object_mut().expect("nodes");
    for name in &names {
        nodes_map.remove(name);
        let arrows = nodes::arrows_into(nodes_map, name, catalogue);
        for (from, field) in arrows {
            if let Some(node) = nodes_map.get_mut(&from) {
                nodes::set_arrow(node, &field, None);
            }
        }
    }
    if write(
        editor,
        &doc,
        script,
        format!("Delete {} nodes in {}", names.len(), owner.title()),
    ) {
        select_nodes(editor, &doc, &[]);
    }
}

/// Adds a node of `kind` at a canvas spot, linked from `link` when given.
pub fn add_node(
    editor: &mut Editor,
    doc: &Doc,
    kind: &str,
    at: Option<egui::Pos2>,
    link: Option<(String, String)>,
) {
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let Some(mut node) = nodes::template(&root, kind) else {
        editor.toast(format!("No node kind {kind}"));
        return;
    };
    if kind == "dialogue" {
        node["lines"] = serde_json::json!([{ "by": default_speaker(doc), "text": [""] }]);
    }
    if let (Some(schema), Some(project)) = (nodes::node_schema(&root), editor.project.as_ref()) {
        nodes::fill_references(&root, schema, &mut node, &project.files);
    }
    if kind == "on"
        && let Some(catalogue) = editor.views.script.catalogue.as_ref()
    {
        let used: HashSet<&str> = doc.nodes().values().filter_map(nodes::event_of).collect();
        if let Some((event, _)) = catalogue.events.iter().find(|(event, _)| {
            catalogue.event_refusal(event, doc.kind).is_none() && !used.contains(event.as_str())
        }) {
            node = nodes::template_event(&root, event).unwrap_or(node);
        }
    }
    let base = if kind == "dialogue" {
        doc.owner.key().to_owned()
    } else {
        kind.to_owned()
    };
    let name = nodes::free_name(doc.nodes(), &base);
    let mut script = doc.script.clone();
    script["nodes"][&name] = node;
    if let Some((from, field)) = &link
        && let Some(source) = script["nodes"].get_mut(from)
    {
        nodes::set_arrow(source, field, Some(&name));
    }
    let owner = doc.owner.clone();
    if let Some(view) = editor.views.script.views.get_mut(&owner) {
        let graph_pos = match (at, view.to_global) {
            (Some(at), Some(to_global)) => to_global.inverse() * at,
            (Some(at), None) => at,
            (None, _) => link
                .as_ref()
                .map_or(egui::Pos2::new(40.0, 40.0), |(from, _)| beside(view, from)),
        };
        view.layout
            .nodes
            .insert(name.clone(), [graph_pos.x, graph_pos.y]);
        view.layout_dirty = true;
    }
    let label = match &link {
        Some((from, _)) => format!("Add {kind} after {from} in {}", owner.title()),
        None => format!("Add {kind} to {}", owner.title()),
    };
    if write(editor, doc, script, label) {
        select_nodes(editor, doc, &[name]);
    }
}

/// Writes the script into its row and applies the edit; a refusal is told and nothing changes.
pub fn write(editor: &mut Editor, doc: &Doc, script: Value, label: String) -> bool {
    let row = doc.row_with(script);
    let mut edit = Edit::new(label);
    edit.write_json(doc.file.clone(), &row);
    let written = editor.apply(edit);
    editor.views.script.callout = (!written)
        .then_some(editor.last_refusal.as_ref())
        .flatten()
        .map(|refusal| {
            let named = refusal
                .pointer
                .split_once("/nodes/")
                .map(|(_, rest)| rest.split('/').next().unwrap_or("").to_owned())
                .filter(|name| doc.nodes().contains_key(name));
            let selected = editor
                .views
                .script
                .views
                .get(&doc.owner)
                .and_then(|view| view.selected.first().cloned());
            Callout {
                owner: doc.owner.clone(),
                node: named.or(selected).unwrap_or_default(),
                to: None,
                rule: refusal.rule.replace('_', " "),
                text: format!("{}; expected {}.", refusal.found, refusal.expected),
                since: std::time::Instant::now(),
            }
        });
    written
}

fn rename_dialog(editor: &mut Editor, ui: &Ui, doc: &Doc) {
    let owner = doc.owner.clone();
    let Some((old, mut draft)) = editor
        .views
        .script
        .views
        .get(&owner)
        .and_then(|view| view.rename.clone())
    else {
        return;
    };
    let mut outcome: Option<Option<String>> = None;
    egui::Window::new("Rename node")
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .show(ui.ctx(), |ui| {
            ui.label(format!("{old} becomes:"));
            let output = egui::TextEdit::singleline(&mut draft).show(ui);
            if !output.response.has_focus() {
                output.response.request_focus();
                let mut state = output.state;
                state
                    .cursor
                    .set_char_range(Some(egui::text::CCursorRange::two(
                        egui::text::CCursor::new(0),
                        egui::text::CCursor::new(draft.chars().count()),
                    )));
                state.store(ui.ctx(), output.response.id);
            }
            let taken = draft != old && doc.nodes().contains_key(&draft);
            if taken {
                ui.colored_label(egui::Color32::from_rgb(220, 80, 80), "that name is taken");
            }
            let ok = !draft.trim().is_empty()
                && !taken
                && draft.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
            ui.horizontal(|ui| {
                if ui.add_enabled(ok, egui::Button::new("Rename")).clicked()
                    || (ok && ui.input(|i| i.key_pressed(Key::Enter)))
                {
                    outcome = Some(Some(draft.clone()));
                }
                if ui.button("Cancel").clicked() || ui.input(|i| i.key_pressed(Key::Escape)) {
                    outcome = Some(None);
                }
            });
        });
    let view = editor.views.script.views.get_mut(&owner).expect("view");
    match outcome {
        None => view.rename = Some((old, draft)),
        Some(None) => view.rename = None,
        Some(Some(new)) => {
            view.rename = None;
            if new != old {
                rename_node(editor, doc, &old, &new);
            }
        }
    }
}

pub fn rename_node(editor: &mut Editor, doc: &Doc, old: &str, new: &str) {
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let mut script = doc.script.clone();
    if let Some(map) = script["nodes"].as_object_mut() {
        nodes::rename(map, old, new, catalogue);
    }
    let owner = doc.owner.clone();
    if let Some(view) = editor.views.script.views.get_mut(&owner)
        && let Some(at) = view.layout.nodes.remove(old)
    {
        view.layout.nodes.insert(new.to_owned(), at);
        view.layout_dirty = true;
    }
    if write(
        editor,
        doc,
        script,
        format!("Rename {old} to {new} in {}", owner.title()),
    ) {
        select_nodes(editor, doc, &[new.to_owned()]);
    }
}

fn link_dialog(editor: &mut Editor, ui: &Ui, doc: &Doc) {
    let owner = doc.owner.clone();
    let Some((from, mut search)) = editor
        .views
        .script
        .views
        .get(&owner)
        .and_then(|view| view.link_by_name.clone())
    else {
        return;
    };
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let ports = doc
        .nodes()
        .get(&from)
        .map(|node| nodes::ports(node, catalogue))
        .unwrap_or_default();
    let mut outcome: Option<Option<(String, String)>> = None;
    egui::Window::new(format!("Link {from} to…"))
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .show(ui.ctx(), |ui| {
            let response = ui.text_edit_singleline(&mut search);
            response.request_focus();
            let needle = search.to_lowercase();
            let field_id = ui.id().with("port");
            let mut port_index: usize = ui.ctx().data(|d| d.get_temp(field_id)).unwrap_or(0);
            if ports.len() > 1 {
                egui::ComboBox::from_id_salt(field_id)
                    .selected_text(
                        ports
                            .get(port_index)
                            .map(|p| p.label.clone())
                            .unwrap_or_default(),
                    )
                    .show_ui(ui, |ui| {
                        for (index, port) in ports.iter().enumerate() {
                            ui.selectable_value(&mut port_index, index, &port.label);
                        }
                    });
                ui.ctx().data_mut(|d| d.insert_temp(field_id, port_index));
            }
            let matches: Vec<&String> = doc
                .nodes()
                .keys()
                .filter(|name| *name != &from && name.to_lowercase().contains(&needle))
                .collect();
            egui::ScrollArea::vertical()
                .max_height(240.0)
                .show(ui, |ui| {
                    for name in &matches {
                        if ui.selectable_label(false, *name).clicked()
                            && let Some(port) = ports.get(port_index)
                        {
                            outcome = Some(Some(((*name).clone(), port.field.clone())));
                        }
                    }
                });
            if ui.input(|i| i.key_pressed(Key::Enter))
                && let Some(name) = matches.first()
                && let Some(port) = ports.get(port_index)
            {
                outcome = Some(Some(((*name).clone(), port.field.clone())));
            }
            if ui.input(|i| i.key_pressed(Key::Escape)) {
                outcome = Some(None);
            }
        });
    let view = editor.views.script.views.get_mut(&owner).expect("view");
    match outcome {
        None => view.link_by_name = Some((from, search)),
        Some(None) => view.link_by_name = None,
        Some(Some((to, field))) => {
            view.link_by_name = None;
            act(editor, doc, GraphAction::Connect { from, field, to }, 0);
        }
    }
}

fn layout_file(editor: &Editor, owner: &ScriptOwner) -> Option<PathBuf> {
    let project = editor.project.as_ref()?;
    let folder = crate::user::UserFolder::folder_key(&project.root);
    Some(
        editor
            .user
            .layouts_dir()
            .join(folder)
            .join(format!("{}.json", owner.slug())),
    )
}

fn save_layout(editor: &mut Editor, owner: &ScriptOwner, file: Option<PathBuf>) {
    let Some(file) = file else {
        return;
    };
    let dragging = editor.views.script.views.get(owner).is_some_and(|_| false);
    let Some(view) = editor.views.script.views.get_mut(owner) else {
        return;
    };
    if !view.layout_dirty || dragging {
        return;
    }
    view.layout_dirty = false;
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(&view.layout) {
        let _ = std::fs::write(file, text + "\n");
    }
}

pub fn open_inline(editor: &mut Editor, table: &str, key: &str, pointer: &str) {
    let owner = ScriptOwner::inline(table, key, pointer);
    editor.open_tab(Tab::Script(owner));
}

/// Opens the script module at `pointer` when it is inline, else the row holding it.
pub fn open_inline_or_row(editor: &mut Editor, table: &str, key: &str, pointer: &str) {
    let inline = editor
        .row_value(table, key)
        .and_then(|row| row.pointer(pointer).cloned())
        .is_some_and(|module| module["type"] == "inline_script");
    if inline {
        open_inline(editor, table, key, pointer);
    } else {
        editor.open_tab(Tab::for_row(table, key));
    }
}

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    inspect::show(editor, ui, selection);
}

/// A script row in the inspector: the same card the script tab shows for it.
pub fn inspect_row(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let owner = ScriptOwner::Shared {
        key: key.to_owned(),
    };
    let Some(doc) = Doc::load(editor, &owner) else {
        ui.label(RichText::new(format!("script/{key} is gone")).weak());
        return;
    };
    let _ = catalogue(editor);
    let open = !editor
        .dock
        .iter_all_tabs()
        .any(|(_, tab)| *tab == Tab::Script(owner.clone()));
    egui::ScrollArea::vertical()
        .id_salt(("script-row", key))
        .show(ui, |ui| {
            if open {
                ui.horizontal(|ui| {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Open the script").clicked() {
                            editor.open_tab(Tab::Script(owner.clone()));
                        }
                    });
                });
            }
            inspect::script_inspector(editor, ui, &doc);
        });
}
