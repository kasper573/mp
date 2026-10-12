use std::collections::{BTreeMap, HashSet};

use egui::{Align, Layout, Modifiers, Sense, Ui};

use super::theme;
use crate::ui::browser::RowDrag;

pub struct TreeNode {
    pub id: String,
    pub label: String,
    pub icon: TreeIcon,
    pub children: Option<Vec<TreeNode>>,
    pub selected: bool,
    pub unsaved: bool,
    pub locked: bool,
    pub adds: bool,
    pub drag: Option<RowDrag>,
}

pub enum TreeIcon {
    None,
    Glyph(&'static str),
    Image {
        texture: egui::TextureId,
        uv: egui::Rect,
        size: egui::Vec2,
    },
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
}

pub type LeafMenu<'a> = dyn FnMut(&mut Ui, &TreeNode) + 'a;

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
            drag: None,
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
    mut menu: Option<&mut LeafMenu<'_>>,
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
            &mut menu,
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

#[allow(clippy::too_many_arguments)]
fn node_line(
    ui: &mut Ui,
    state: &TreeState,
    node: &TreeNode,
    depth: usize,
    open_all: bool,
    out: &mut TreeOutput,
    toggle: &mut Vec<String>,
    menu: &mut Option<&mut LeafMenu<'_>>,
) {
    let full = ui.available_rect_before_wrap();
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), LINE), Sense::click());
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
            folder_line(&mut child, node, children, open, out);
            if response.clicked() {
                toggle.push(node.id.clone());
            }
            if open {
                for child in children {
                    node_line(ui, state, child, depth + 1, open_all, out, toggle, menu);
                }
            }
        }
        None => {
            leaf_line(&mut child, node);
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
            if let Some(menu) = menu.as_deref_mut() {
                response.context_menu(|ui| menu(ui, node));
            }
        }
    }
}

fn folder_line(
    ui: &mut Ui,
    node: &TreeNode,
    children: &[TreeNode],
    open: bool,
    out: &mut TreeOutput,
) {
    ui.add(
        egui::Label::new(theme::muted(if open { "▾" } else { "▸" }).size(11.0)).selectable(false),
    );
    ui.add(
        egui::Label::new(
            theme::mono(format!(
                "{}{}",
                if node.locked { "🔒 " } else { "" },
                node.label
            ))
            .color(theme::CODE),
        )
        .selectable(false),
    );
    let leaves = children.iter().filter(|c| c.children.is_none()).count();
    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        ui.add_space(6.0);
        if leaves > 0 {
            ui.add(
                egui::Label::new(theme::muted(leaves.to_string()).monospace().size(12.0))
                    .selectable(false),
            );
        }
        if open
            && node.adds
            && ui
                .add(egui::Label::new(theme::faint("+")).sense(Sense::click()))
                .on_hover_text(format!("New {}", node.label))
                .clicked()
        {
            out.add = Some(node.id.clone());
        }
    });
}

fn leaf_line(ui: &mut Ui, node: &TreeNode) {
    let colour = if node.selected {
        theme::TEXT
    } else {
        theme::CODE
    };
    let draw = |ui: &mut Ui| {
        ui.add_space(14.0);
        match &node.icon {
            TreeIcon::None => {}
            TreeIcon::Glyph(glyph) => {
                ui.add(egui::Label::new(theme::muted(*glyph)).selectable(false));
            }
            TreeIcon::Image { texture, uv, size } => {
                ui.add(egui::Image::from_texture((*texture, *size)).uv(*uv));
                ui.add_space(2.0);
            }
        }
        ui.add(
            egui::Label::new(theme::mono(&node.label).size(13.0).color(colour)).selectable(false),
        );
    };
    match &node.drag {
        Some(drag) => {
            ui.dnd_drag_source(egui::Id::new(("drag", &node.id)), drag.clone(), draw);
        }
        None => draw(ui),
    }
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
