use std::collections::{BTreeMap, HashSet};

use design_tokens::face::Face;
use design_tokens::glyph::{self, Mark};
use design_tokens::{controls, face, ink};
use egui::{Align, Event, Layout, Modifiers, RichText, Sense, Ui};

use super::theme;
use crate::keymap::EditorKey;
use crate::picker::{self, Dragged};

pub struct TreeNode<A> {
    pub id: String,
    pub label: String,
    pub style: TreeStyle,
    pub icon: TreeIcon,
    pub children: Option<Vec<TreeNode<A>>>,
    /// For a folder: whether a line inside is selected, shown while it is folded.
    pub selected: bool,
    /// For a folder: whether a line inside is unsaved, shown while it is folded.
    pub unsaved: bool,
    pub count: Option<String>,
    pub note: Option<String>,
    /// What assistive tech reads for the line, when more than its label.
    pub spoken: Option<String>,
    /// For a folder: what its menu offers.
    pub actions: Vec<TreeAction<A>>,
    /// What the pointer carries away when the leaf is dragged.
    pub drag: Option<Dragged>,
    /// For a folder: the table whose rows may be dropped into it, onto it or onto a row inside.
    pub drops: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TreeStyle {
    Plain,
    Mono,
    Heading,
}

pub struct TreeAction<A> {
    pub label: String,
    pub action: A,
}

pub enum TreeIcon {
    None,
    Mark(Mark),
    Thumb(String),
}

#[derive(Clone, Copy)]
pub struct IconImage {
    pub texture: egui::TextureId,
    pub uv: egui::Rect,
    pub size: egui::Vec2,
}

#[derive(Default)]
pub struct TreeState {
    pub open: HashSet<String>,
    /// The line the keys move and act on.
    pub cursor: Option<String>,
    /// A line to scroll into view the next time it is drawn.
    pub reveal: Option<String>,
    typed: String,
    typed_at: f64,
}

pub struct TreeOutput<A> {
    pub clicked: Option<(String, Modifiers)>,
    pub double_clicked: Option<String>,
    pub action: Option<(String, A)>,
    /// Folders folded or unfolded this frame.
    pub toggled: Vec<String>,
    /// A folder Enter was pressed on.
    pub entered: Option<String>,
    /// A row dropped into a folder, with the folder's id.
    pub dropped: Option<(String, Dragged)>,
}

impl<A> Default for TreeOutput<A> {
    fn default() -> Self {
        TreeOutput {
            clicked: None,
            double_clicked: None,
            action: None,
            toggled: Vec::new(),
            entered: None,
            dropped: None,
        }
    }
}

pub type TreeLeafMenu<'a> = dyn FnMut(&mut Ui, &str) + 'a;
pub type TreeThumbs<'a> = dyn FnMut(&egui::Context, &str) -> Option<IconImage> + 'a;

#[derive(Default)]
pub struct TreeHooks<'a, 'b> {
    pub menu: Option<&'a mut TreeLeafMenu<'b>>,
    pub thumbs: Option<&'a mut TreeThumbs<'b>>,
}

impl<A> TreeNode<A> {
    pub fn leaf(id: impl Into<String>, label: impl Into<String>) -> TreeNode<A> {
        TreeNode {
            id: id.into(),
            label: label.into(),
            style: TreeStyle::Mono,
            icon: TreeIcon::None,
            children: None,
            selected: false,
            unsaved: false,
            count: None,
            note: None,
            spoken: None,
            actions: Vec::new(),
            drag: None,
            drops: None,
        }
    }

    pub fn folder(
        id: impl Into<String>,
        label: impl Into<String>,
        children: Vec<TreeNode<A>>,
    ) -> TreeNode<A> {
        TreeNode {
            children: Some(children),
            style: TreeStyle::Plain,
            ..TreeNode::leaf(id, label)
        }
    }
}

pub fn from_paths<'a, A>(
    paths: impl IntoIterator<Item = &'a str>,
    leaf: &mut dyn FnMut(&str) -> Option<TreeNode<A>>,
    folder: &mut dyn FnMut(&mut TreeNode<A>),
) -> Vec<TreeNode<A>> {
    let mut root = Dir::default();
    for path in paths {
        let mut dir = &mut root;
        let mut parts = path.split('/').peekable();
        while let Some(part) = parts.next() {
            if parts.peek().is_none() {
                dir.files.push(path.to_owned());
            } else {
                dir = dir.dirs.entry(part.to_owned()).or_default();
            }
        }
    }
    root.into_nodes("", leaf, folder)
}

/// Draws the tree. With `keys`, the arrows, Home, End, Enter and typed letters move through and
/// act on its lines: the caller passes it while the tree is what the keyboard is meant for.
pub fn show<A: Clone>(
    ui: &mut Ui,
    state: &mut TreeState,
    nodes: &[TreeNode<A>],
    open_all: bool,
    keys: bool,
    mut hooks: TreeHooks<'_, '_>,
) -> TreeOutput<A> {
    let mut out = TreeOutput::default();
    if keys && !ui.ctx().text_edit_focused() {
        let lines = visible_lines(nodes, state, open_all);
        navigate(ui, state, &lines, &mut out);
    }
    let mut walk = Walk {
        state,
        open_all,
        out,
        toggle: Vec::new(),
        hooks: &mut hooks,
    };
    for node in nodes {
        node_line(ui, &mut walk, node, 0, None);
    }
    let Walk {
        mut out, toggle, ..
    } = walk;
    for id in toggle {
        toggle_open(state, &id, &mut out);
    }
    out
}

const LINE: f32 = 26.0;
const INDENT: f32 = 14.0;
const TYPING_PAUSE: f64 = 0.8;

struct Line<'n> {
    id: &'n str,
    label: &'n str,
    parent: Option<&'n str>,
    folder: bool,
    open: bool,
}

fn visible_lines<'n, A>(
    nodes: &'n [TreeNode<A>],
    state: &TreeState,
    open_all: bool,
) -> Vec<Line<'n>> {
    fn walk<'n, A>(
        nodes: &'n [TreeNode<A>],
        parent: Option<&'n str>,
        state: &TreeState,
        open_all: bool,
        lines: &mut Vec<Line<'n>>,
    ) {
        for node in nodes {
            let open = open_all || state.open.contains(&node.id);
            lines.push(Line {
                id: &node.id,
                label: &node.label,
                parent,
                folder: node.children.is_some(),
                open,
            });
            if let (Some(children), true) = (&node.children, open) {
                walk(children, Some(&node.id), state, open_all, lines);
            }
        }
    }
    let mut lines = Vec::new();
    walk(nodes, None, state, open_all, &mut lines);
    lines
}

fn navigate<A>(ui: &Ui, state: &mut TreeState, lines: &[Line], out: &mut TreeOutput<A>) {
    if lines.is_empty() {
        return;
    }
    let at = state
        .cursor
        .as_deref()
        .and_then(|cursor| lines.iter().position(|line| line.id == cursor));
    let (arrow, first, last, enter, typed, now) = ui.input_mut(|i| {
        let typed: String = i
            .events
            .iter()
            .filter_map(|event| match event {
                Event::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect();
        (
            EditorKey::Move.take_arrow(i),
            EditorKey::FirstLine.consume(i),
            EditorKey::LastLine.consume(i),
            EditorKey::Confirm.consume(i),
            typed,
            i.time,
        )
    });
    let mut moved_to = None;
    match (arrow, at) {
        (Some([0, step]), Some(at)) => {
            moved_to = Some((at as i32 + step).clamp(0, lines.len() as i32 - 1) as usize);
        }
        (Some([0, _]), None) => moved_to = Some(0),
        (Some([1, 0]), Some(at)) if lines[at].folder => {
            if lines[at].open {
                moved_to = (at + 1 < lines.len() && lines[at + 1].parent == Some(lines[at].id))
                    .then_some(at + 1);
            } else {
                toggle_open(state, lines[at].id, out);
            }
        }
        (Some([-1, 0]), Some(at)) => {
            if lines[at].folder && lines[at].open {
                toggle_open(state, lines[at].id, out);
            } else if let Some(parent) = lines[at].parent {
                moved_to = lines.iter().position(|line| line.id == parent);
            }
        }
        _ => {}
    }
    if first {
        moved_to = Some(0);
    }
    if last {
        moved_to = Some(lines.len() - 1);
    }
    if !typed.trim().is_empty() {
        if now - state.typed_at > TYPING_PAUSE {
            state.typed.clear();
        }
        state.typed.push_str(&typed.to_lowercase());
        state.typed_at = now;
        let from = at.map_or(0, |at| {
            if state.typed.len() == typed.len() {
                at + 1
            } else {
                at
            }
        });
        moved_to = (0..lines.len())
            .map(|step| (from + step) % lines.len())
            .find(|index| lines[*index].label.to_lowercase().starts_with(&state.typed))
            .or(moved_to);
    }
    if let Some(index) = moved_to {
        state.cursor = Some(lines[index].id.to_owned());
        state.reveal = state.cursor.clone();
    }
    if enter && let Some(at) = at {
        let line = &lines[at];
        if line.folder {
            out.entered = Some(line.id.to_owned());
        } else {
            out.clicked = Some((line.id.to_owned(), Modifiers::NONE));
        }
    }
}

fn toggle_open<A>(state: &mut TreeState, id: &str, out: &mut TreeOutput<A>) {
    if !state.open.remove(id) {
        state.open.insert(id.to_owned());
    }
    out.toggled.push(id.to_owned());
}

struct Walk<'a, 'b, 'c, A> {
    state: &'a mut TreeState,
    open_all: bool,
    out: TreeOutput<A>,
    toggle: Vec<String>,
    hooks: &'a mut TreeHooks<'b, 'c>,
}

/// One line of the tree and, for an open folder, the lines inside it. `into` is the folder a row
/// dropped on a leaf line goes into.
fn node_line<A: Clone>(
    ui: &mut Ui,
    walk: &mut Walk<'_, '_, '_, A>,
    node: &TreeNode<A>,
    depth: usize,
    into: Option<&TreeNode<A>>,
) {
    let full = ui.available_rect_before_wrap();
    let sense = if node.drag.is_some() {
        Sense::click_and_drag()
    } else {
        Sense::click()
    };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), LINE), sense);
    let visible = ui.clip_rect().intersects(rect);
    let at_cursor = walk.state.cursor.as_deref() == Some(node.id.as_str());
    if walk.state.reveal.as_deref() == Some(node.id.as_str()) {
        response.scroll_to_me(None);
        walk.state.reveal = None;
    }
    let open = walk.open_all || walk.state.open.contains(&node.id);
    let folded = node.children.is_some() && !open;
    ui.painter().add(controls::row_marks(
        rect,
        response.hovered() || at_cursor,
        node.selected && node.children.is_none(),
    ));
    if folded && node.selected {
        ui.painter().rect_filled(
            egui::Rect::from_min_size(rect.min, egui::vec2(3.0, rect.height())),
            0.0,
            theme::ACCENT,
        );
    }
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(Layout::left_to_right(Align::Center)),
    );
    child.add_space(6.0 + INDENT * depth as f32);
    match &node.children {
        Some(children) => {
            response.widget_info(|| {
                egui::WidgetInfo::labeled(
                    egui::WidgetType::CollapsingHeader,
                    true,
                    spoken_folder(node, open),
                )
            });
            folder_line(&mut child, node, open);
            if response.clicked() {
                walk.state.cursor = Some(node.id.clone());
                walk.toggle.push(node.id.clone());
            }
            if !node.actions.is_empty() {
                response.context_menu(|ui| folder_menu(ui, node, &mut walk.out));
            }
            take_drop(ui, &response, rect, node, &mut walk.out);
            if open {
                let into = node.drops.is_some().then_some(node);
                for child in children {
                    node_line(ui, walk, child, depth + 1, into);
                }
            }
        }
        None => {
            response.widget_info(|| {
                egui::WidgetInfo::selected(
                    egui::WidgetType::SelectableLabel,
                    true,
                    node.selected,
                    node.spoken.as_deref().unwrap_or(&node.label),
                )
            });
            if visible {
                leaf_line(&mut child, node, &mut walk.hooks.thumbs);
            }
            if node.unsaved {
                unsaved_dot(ui, rect);
            }
            if response.clicked() {
                walk.state.cursor = Some(node.id.clone());
                walk.out.clicked = Some((node.id.clone(), ui.input(|i| i.modifiers)));
            }
            if response.double_clicked() {
                walk.out.double_clicked = Some(node.id.clone());
            }
            if let Some(menu) = walk.hooks.menu.as_deref_mut() {
                response.context_menu(|ui| menu(ui, &node.id));
            }
            if let Some(dragged) = &node.drag {
                picker::carry(ui, &response, dragged);
            }
            if let Some(folder) = into {
                take_drop(ui, &response, rect, folder, &mut walk.out);
            }
        }
    }
}

/// Takes a row of the folder's table dropped on `response`, marking the line while one hovers.
fn take_drop<A>(
    ui: &Ui,
    response: &egui::Response,
    rect: egui::Rect,
    folder: &TreeNode<A>,
    out: &mut TreeOutput<A>,
) {
    let Some(table) = &folder.drops else {
        return;
    };
    let fits = |dragged: &Dragged| matches!(dragged, Dragged::Row { table: of, .. } if of == table);
    if response
        .dnd_hover_payload::<Dragged>()
        .is_some_and(|dragged| fits(&dragged))
    {
        ui.painter().rect_stroke(
            rect.shrink(1.0),
            3.0,
            egui::Stroke::new(1.5, theme::ACCENT),
            egui::StrokeKind::Inside,
        );
    }
    if let Some(dragged) = response.dnd_release_payload::<Dragged>()
        && fits(&dragged)
    {
        out.dropped = Some((folder.id.clone(), (*dragged).clone()));
    }
}

fn spoken_folder<A>(node: &TreeNode<A>, open: bool) -> String {
    let mut parts = vec![node.label.clone()];
    if node.style == TreeStyle::Heading {
        parts.push("category".to_owned());
    }
    parts.push(if open { "expanded" } else { "folded" }.to_owned());
    if let Some(count) = &node.count {
        parts.push(format!("{count} rows"));
    }
    parts.join(", ")
}

fn unsaved_dot(ui: &Ui, rect: egui::Rect) {
    ui.painter().circle_filled(
        egui::pos2(rect.max.x - 10.0, rect.center().y),
        3.5,
        theme::WARN,
    );
}

fn folder_line<A>(ui: &mut Ui, node: &TreeNode<A>, open: bool) {
    glyph::show(
        ui,
        if open {
            Mark::ChevronDown
        } else {
            Mark::ChevronRight
        },
        11.0,
        theme::FAINT,
    );
    let label = ui.label(match node.style {
        TreeStyle::Heading => RichText::new(&node.label)
            .font(Face::SmallCapsBold.id(13.0))
            .color(ink::RUBRIC),
        TreeStyle::Mono => theme::mono(&node.label).size(13.0).color(theme::TEXT),
        TreeStyle::Plain => face::body(&node.label).color(if node.note.is_some() {
            theme::MUTED
        } else {
            theme::TEXT
        }),
    });
    if let Some(note) = &node.note {
        label.on_hover_text(note);
    }
    let rule_from = ui.cursor().min.x + 6.0;
    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        ui.add_space(4.0);
        ui.spacing_mut().item_spacing.x = 4.0;
        if let Some(count) = &node.count {
            ui.label(theme::faint(count).size(12.5));
        }
        if !open && node.unsaved {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(8.0, 8.0), Sense::hover());
            ui.painter().circle_filled(rect.center(), 3.5, theme::WARN);
        }
        if node.style == TreeStyle::Heading {
            let y = ui.max_rect().center().y;
            let rule_to = ui.cursor().max.x - 6.0;
            if rule_to > rule_from {
                ui.painter().hline(
                    rule_from..=rule_to,
                    y,
                    egui::Stroke::new(1.0, theme::alpha(ink::RUBRIC, 110)),
                );
            }
        }
    });
}

fn folder_menu<A: Clone>(ui: &mut Ui, node: &TreeNode<A>, out: &mut TreeOutput<A>) {
    for action in &node.actions {
        if ui.button(&action.label).clicked() {
            out.action = Some((node.id.clone(), action.action.clone()));
            ui.close();
        }
    }
}

fn leaf_line<A>(ui: &mut Ui, node: &TreeNode<A>, thumbs: &mut Option<&mut TreeThumbs<'_>>) {
    let color = if node.selected {
        theme::TEXT
    } else {
        theme::CODE
    };
    ui.add_space(14.0);
    let image = match &node.icon {
        TreeIcon::None => None,
        TreeIcon::Mark(mark) => {
            glyph::show(ui, *mark, 13.0, theme::MUTED);
            None
        }
        TreeIcon::Thumb(path) => thumbs
            .as_deref_mut()
            .and_then(|thumbs| thumbs(&ui.ctx().clone(), path)),
    };
    if let Some(image) = image {
        ui.add(egui::Image::from_texture((image.texture, image.size)).uv(image.uv));
        ui.add_space(2.0);
    } else if matches!(node.icon, TreeIcon::Thumb(_)) {
        ui.add_space(18.0);
    }
    ui.label(theme::mono(&node.label).size(13.0).color(color));
    if let Some(note) = &node.note {
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.add_space(20.0);
            ui.label(theme::faint(note).size(12.0));
        });
    }
}

#[derive(Default)]
struct Dir {
    dirs: BTreeMap<String, Dir>,
    files: Vec<String>,
}

impl Dir {
    fn into_nodes<A>(
        self,
        prefix: &str,
        leaf: &mut dyn FnMut(&str) -> Option<TreeNode<A>>,
        folder: &mut dyn FnMut(&mut TreeNode<A>),
    ) -> Vec<TreeNode<A>> {
        let mut nodes: Vec<TreeNode<A>> = self
            .dirs
            .into_iter()
            .map(|(name, dir)| {
                let id = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{prefix}/{name}")
                };
                let children = dir.into_nodes(&id, leaf, folder);
                let mut node = TreeNode::folder(id, name, children);
                folder(&mut node);
                node
            })
            .collect();
        nodes.extend(self.files.iter().filter_map(|path| leaf(path)));
        nodes
    }
}
