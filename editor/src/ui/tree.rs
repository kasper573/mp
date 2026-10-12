use std::collections::{BTreeMap, HashSet};

use egui::{Align, Layout, Modifiers, Sense, Ui};

use super::theme;

pub struct TreeNode {
    pub id: String,
    pub label: String,
    pub icon: TreeIcon,
    pub children: Option<Vec<TreeNode>>,
    pub selected: bool,
    pub unsaved: bool,
    pub locked: bool,
    pub adds: bool,
    pub table: bool,
}

pub enum TreeIcon {
    None,
    Glyph(&'static str),
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
}

#[derive(Default)]
pub struct TreeOutput {
    pub clicked: Option<(String, Modifiers)>,
    pub double_clicked: Option<String>,
    pub add: Option<String>,
    pub open_table: Option<String>,
}

pub type LeafMenu<'a> = dyn FnMut(&mut Ui, &TreeNode) + 'a;
pub type Thumbs<'a> = dyn FnMut(&egui::Context, &str) -> Option<IconImage> + 'a;

#[derive(Default)]
pub struct Hooks<'a, 'b> {
    pub menu: Option<&'a mut LeafMenu<'b>>,
    pub thumbs: Option<&'a mut Thumbs<'b>>,
}

impl TreeNode {
    pub fn leaf(id: impl Into<String>, label: impl Into<String>) -> TreeNode {
        TreeNode {
            id: id.into(),
            label: label.into(),
            icon: TreeIcon::None,
            children: None,
            selected: false,
            unsaved: false,
            locked: false,
            adds: false,
            table: false,
        }
    }

    pub fn folder(
        id: impl Into<String>,
        label: impl Into<String>,
        children: Vec<TreeNode>,
    ) -> TreeNode {
        TreeNode {
            children: Some(children),
            ..TreeNode::leaf(id, label)
        }
    }
}

pub fn from_paths<'a>(
    paths: impl IntoIterator<Item = &'a str>,
    leaf: &mut dyn FnMut(&str) -> Option<TreeNode>,
    folder: &mut dyn FnMut(&mut TreeNode),
) -> Vec<TreeNode> {
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

pub fn show(
    ui: &mut Ui,
    state: &mut TreeState,
    nodes: &[TreeNode],
    open_all: bool,
    mut hooks: Hooks<'_, '_>,
) -> TreeOutput {
    let mut out = TreeOutput::default();
    let mut toggle: Vec<String> = Vec::new();
    for node in nodes {
        node_line(
            ui,
            state,
            node,
            0,
            open_all,
            &mut out,
            &mut toggle,
            &mut hooks,
        );
    }
    for id in toggle {
        if !state.open.remove(&id) {
            state.open.insert(id);
        }
    }
    out
}

const LINE: f32 = 22.0;
const INDENT: f32 = 14.0;
const BUTTON: f32 = 18.0;

#[allow(clippy::too_many_arguments)]
fn node_line(
    ui: &mut Ui,
    state: &TreeState,
    node: &TreeNode,
    depth: usize,
    open_all: bool,
    out: &mut TreeOutput,
    toggle: &mut Vec<String>,
    hooks: &mut Hooks<'_, '_>,
) {
    let full = ui.available_rect_before_wrap();
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), LINE), Sense::click());
    let visible = ui.clip_rect().intersects(rect);
    if node.selected {
        ui.painter().rect_filled(rect, 3.0, theme::ACCENT_SOFT);
    } else if response.hovered() {
        ui.painter().rect_filled(
            rect,
            3.0,
            egui::Color32::from_rgba_unmultiplied(255, 255, 255, 8),
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
            let open = open_all || state.open.contains(&node.id);
            folder_line(&mut child, node, open, out);
            if response.clicked() {
                toggle.push(node.id.clone());
            }
            if node.adds || node.table {
                response.context_menu(|ui| folder_menu(ui, node, out));
            }
            if open {
                for child in children {
                    node_line(ui, state, child, depth + 1, open_all, out, toggle, hooks);
                }
            }
        }
        None => {
            if visible {
                leaf_line(&mut child, node, &mut hooks.thumbs);
            }
            if node.unsaved {
                ui.painter().circle_filled(
                    egui::pos2(rect.max.x - 10.0, rect.center().y),
                    3.5,
                    theme::WARN,
                );
            }
            if response.clicked() {
                out.clicked = Some((node.id.clone(), ui.input(|i| i.modifiers)));
            }
            if response.double_clicked() {
                out.double_clicked = Some(node.id.clone());
            }
            if let Some(menu) = hooks.menu.as_deref_mut() {
                response.context_menu(|ui| menu(ui, node));
            }
        }
    }
}

fn folder_line(ui: &mut Ui, node: &TreeNode, open: bool, out: &mut TreeOutput) {
    ui.add(
        egui::Label::new(theme::muted(if open { "▾" } else { "▸" }).size(11.0)).selectable(false),
    );
    let label = ui.add(
        egui::Label::new(theme::mono(&node.label).color(if node.locked {
            theme::MUTED
        } else {
            theme::CODE
        }))
        .selectable(false),
    );
    if node.locked {
        label.on_hover_text("Fixtures: the engine names these rows, so none can be added");
    }
    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        ui.add_space(4.0);
        ui.spacing_mut().item_spacing.x = 4.0;
        if node.adds && line_button(ui, "+", &format!("New {}", node.label)).clicked() {
            out.add = Some(node.id.clone());
        }
        if node.table && line_button(ui, "▦", "Open table").clicked() {
            out.open_table = Some(node.id.clone());
        }
    });
}

fn folder_menu(ui: &mut Ui, node: &TreeNode, out: &mut TreeOutput) {
    if node.adds && ui.button(format!("New {}…", node.label)).clicked() {
        out.add = Some(node.id.clone());
        ui.close();
    }
    if node.table && ui.button("Open table").clicked() {
        out.open_table = Some(node.id.clone());
        ui.close();
    }
}

fn line_button(ui: &mut Ui, glyph: &str, tip: &str) -> egui::Response {
    ui.spacing_mut().button_padding = egui::vec2(0.0, 0.0);
    ui.add(
        egui::Button::new(egui::RichText::new(glyph).size(13.0).color(theme::TEXT))
            .fill(theme::RAISED)
            .stroke(egui::Stroke::new(1.0, theme::BORDER))
            .corner_radius(3.0)
            .min_size(egui::vec2(BUTTON, BUTTON)),
    )
    .on_hover_text(tip)
}

fn leaf_line(ui: &mut Ui, node: &TreeNode, thumbs: &mut Option<&mut Thumbs<'_>>) {
    let colour = if node.selected {
        theme::TEXT
    } else {
        theme::CODE
    };
    ui.add_space(14.0);
    let image = match &node.icon {
        TreeIcon::None => None,
        TreeIcon::Glyph(glyph) => {
            ui.add(egui::Label::new(theme::muted(*glyph)).selectable(false));
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
    ui.add(egui::Label::new(theme::mono(&node.label).size(13.0).color(colour)).selectable(false));
}

#[derive(Default)]
struct Dir {
    dirs: BTreeMap<String, Dir>,
    files: Vec<String>,
}

impl Dir {
    fn into_nodes(
        self,
        prefix: &str,
        leaf: &mut dyn FnMut(&str) -> Option<TreeNode>,
        folder: &mut dyn FnMut(&mut TreeNode),
    ) -> Vec<TreeNode> {
        let mut nodes: Vec<TreeNode> = self
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
