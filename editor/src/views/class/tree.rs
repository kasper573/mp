use std::collections::{BTreeMap, BTreeSet};

use egui::{Color32, Key, Modifiers, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use engine::systems::class::NODE_EXTENT;
use serde::Deserialize;
use serde_json::{Map, Value};

use super::{TABLE, node_of, select_node, write};
use crate::app::Editor;
use crate::forms::FormCx;
use crate::project::{ProjectFiles, row_file};
use crate::ui::{inspector, theme, widgets};
use crate::{picker, thumbs};

pub const NODE_RADIUS: f32 = 24.0;
const ICON: f32 = 28.0;
const GRID: f32 = 20.0;
const MARGIN: f32 = 80.0;
const ARROW_HEAD: f32 = 7.0;
const GHOST_OFFSET: Vec2 = Vec2::new(-150.0, -40.0);
const FIRST_SPOT: Point = Point { x: 80.0, y: 60.0 };
const SPOT_STEP: Vec2 = Vec2::new(80.0, 140.0);
const SPOTS_PER_ROW: u32 = 8;

/// A node of a class tree as the canvas reads it from the row.
#[derive(Clone, Deserialize)]
pub struct Node {
    pub skill: String,
    #[serde(default)]
    pub requires: Vec<Requirement>,
    pub at: Point,
}

#[derive(Clone, Copy, Deserialize, Default, PartialEq, Debug)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Requirement {
    Skill {
        node: String,
        #[serde(default = "first_rank")]
        rank: u8,
    },
    Level {
        level: u32,
    },
    Condition {
        #[serde(default)]
        condition: Value,
    },
}

pub type Nodes = BTreeMap<String, Node>;

/// A node picked up off the canvas, drawn under the pointer until it is let go of.
pub struct NodeDrag {
    pub node: String,
    offset: Vec2,
    at: Point,
}

/// The payload of a node drag, which the node inspector takes as a skill requirement.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CarriedNode(pub String);

pub fn nodes_of(row: &Value) -> Nodes {
    row["tree"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(key, node)| {
            serde_json::from_value(node.clone())
                .ok()
                .map(|node| (key.clone(), node))
        })
        .collect()
}

/// Whether making `node` require `named` would close a loop: `named` already needs `node`.
pub fn would_cycle(nodes: &Nodes, node: &str, named: &str) -> bool {
    let mut stack = vec![named.to_owned()];
    let mut seen = BTreeSet::new();
    while let Some(key) = stack.pop() {
        if key == node {
            return true;
        }
        let Some(next) = nodes.get(&key) else {
            continue;
        };
        for requirement in &next.requires {
            if let Requirement::Skill { node: further, .. } = requirement
                && seen.insert(further.clone())
            {
                stack.push(further.clone());
            }
        }
    }
    false
}

pub fn skill_ranks(files: &ProjectFiles, skill: &str) -> u8 {
    files
        .json(&row_file("skill", skill))
        .and_then(|row| row["levels"].as_array().map(Vec::len))
        .unwrap_or(1)
        .max(1) as u8
}

pub fn skill_cost(files: &ProjectFiles, skill: &str) -> u32 {
    files
        .json(&row_file("skill", skill))
        .and_then(|row| {
            row["levels"].as_array().map(|levels| {
                levels
                    .iter()
                    .map(|level| level["cost"].as_u64().unwrap_or(0) as u32)
                    .sum()
            })
        })
        .unwrap_or(0)
}

pub fn granted_points(row: &Value) -> u32 {
    row["levels"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|level| level["skill_points"].as_u64().unwrap_or(0) as u32)
        .sum()
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(mut row) = editor.row_value(TABLE, key) else {
        return;
    };
    let nodes = nodes_of(&row);
    let mut changed: Option<&str> = None;
    toolbar(editor, ui, key, &mut row, &nodes, &mut changed);
    ui.add_space(4.0);
    if changed.is_none() {
        canvas(editor, ui, key, &mut row, &nodes, &mut changed);
    }
    if let Some(label) = changed {
        write(editor, key, label, &row);
    }
}

pub fn remove_node(row: &mut Value, node: &str) {
    let Some(tree) = row["tree"].as_object_mut() else {
        return;
    };
    tree.remove(node);
    for other in tree.values_mut() {
        if let Some(requires) = other["requires"].as_array_mut() {
            requires.retain(|requirement| {
                !(requirement["type"] == "skill" && requirement["node"] == node)
            });
            if requires.is_empty() {
                other.as_object_mut().expect("object").remove("requires");
            }
        }
    }
}

fn toolbar(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &mut Value,
    nodes: &Nodes,
    changed: &mut Option<&'static str>,
) {
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(TABLE);
    let mut actions = Vec::new();
    let mut snap = editor.views.class.snaps();
    let mut picked = String::new();
    {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx =
            FormCx::new(project, root, shapes, form, &mut actions).owned_by(TABLE, Some(key));
        ui.horizontal(|ui| {
            ui.checkbox(&mut snap, "snap to grid")
                .on_hover_text("A dragged node lands on the grid under the pointer");
            ui.add_space(12.0);
            ui.label(theme::muted("add node").size(12.5));
            ui.scope(|ui| {
                ui.set_width(220.0);
                picker::row(ui, &mut cx, "skill", &mut picked, "/tree/new/skill");
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let granted = granted_points(row);
                let cost: u32 = nodes
                    .values()
                    .map(|node| skill_cost(cx.files, &node.skill))
                    .sum();
                let line = format!(
                    "levels grant {granted} point{} · the tree costs {cost}",
                    widgets::plural(granted)
                );
                if granted > cost && cost > 0 {
                    ui.label(theme::warn(format!(
                        "{line} · every node can be maxed with {} to spare",
                        granted - cost
                    )));
                } else if granted == 0 && cost > 0 {
                    ui.label(theme::warn(format!("{line} · no level grants a point")));
                } else {
                    ui.label(theme::muted(line).size(12.5));
                }
            });
        });
    }
    editor.views.class.snap = Some(snap);
    if !picked.is_empty() {
        let node = fresh_key(nodes, &picked);
        let at = free_spot(nodes);
        if !row["tree"].is_object() {
            row["tree"] = Value::Object(Map::new());
        }
        row["tree"][&node] = serde_json::json!({ "skill": picked, "at": { "x": at.x, "y": at.y } });
        *changed = Some("Add node");
        select_node(editor, key, Some(&node));
    }
    for action in actions {
        inspector::act(editor, action, TABLE, key);
    }
}

fn canvas(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &mut Value,
    nodes: &Nodes,
    changed: &mut Option<&'static str>,
) {
    let selected = node_of(&editor.selection)
        .filter(|_| editor.selection.keys.first().is_some_and(|k| k == key))
        .map(str::to_owned);
    let snap = editor.views.class.snaps();
    let extent = nodes.values().fold(Vec2::ZERO, |most, node| {
        most.max(Vec2::new(node.at.x, node.at.y))
    });
    let wanted = extent + Vec2::splat(MARGIN * 2.0);
    let mut released: Option<(String, Point)> = None;
    let mut clicked: Option<Option<String>> = None;
    let mut removed: Option<String> = None;
    let mut started: Option<NodeDrag> = None;
    let mut hovering_canvas = false;
    egui::ScrollArea::both()
        .id_salt(("class-tree", key))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let size = wanted.max(ui.available_size());
            let (rect, background) = ui.allocate_exact_size(size, Sense::click());
            hovering_canvas = ui.rect_contains_pointer(rect);
            let origin = rect.min + Vec2::splat(MARGIN);
            let to_screen = |at: Point| origin + Vec2::new(at.x, at.y);
            let painter = ui.painter_at(rect);
            painter.rect_filled(rect, 0.0, theme::CANVAS);
            dots(&painter, rect, origin);
            if background.clicked() {
                clicked = Some(None);
            }
            let dragging = editor.views.class.drag.as_ref();
            let placed = |node: &str| -> Option<Point> {
                match dragging {
                    Some(drag) if drag.node == node => Some(drag.at),
                    _ => nodes.get(node).map(|node| node.at),
                }
            };
            let cycles = cycles(nodes);
            for (to, node) in nodes {
                for (index, requirement) in node.requires.iter().enumerate() {
                    let Requirement::Skill { node: from, .. } = requirement else {
                        continue;
                    };
                    let head = to_screen(placed(to).unwrap_or(node.at));
                    match placed(from) {
                        Some(at) => {
                            let on_cycle =
                                cycles.contains(to.as_str()) && cycles.contains(from.as_str());
                            let colour = if on_cycle {
                                theme::DANGER
                            } else {
                                theme::MUTED
                            };
                            arrow(&painter, to_screen(at), head, colour, false);
                        }
                        None => {
                            let ghost = head + GHOST_OFFSET + Vec2::new(0.0, index as f32 * 30.0);
                            dashed_circle(
                                &painter,
                                ghost,
                                NODE_RADIUS * 0.6,
                                Stroke::new(1.0, theme::DANGER),
                            );
                            painter.text(
                                ghost + Vec2::new(0.0, NODE_RADIUS * 0.6 + 4.0),
                                egui::Align2::CENTER_TOP,
                                format!("{from}?"),
                                egui::FontId::monospace(10.5),
                                theme::DANGER,
                            );
                            arrow(&painter, ghost, head, theme::DANGER, true);
                        }
                    }
                }
            }
            let overlapping: BTreeSet<&str> = nodes
                .iter()
                .flat_map(|(a, node)| {
                    nodes.iter().filter_map(move |(b, other)| {
                        (a != b && overlaps(node.at, other.at)).then_some(a.as_str())
                    })
                })
                .collect();
            let files = editor.project.as_ref().map(|project| &project.files);
            for (node_key, node) in nodes {
                let at = placed(node_key).unwrap_or(node.at);
                let center = to_screen(at);
                let node_rect = Rect::from_center_size(center, Vec2::splat(NODE_RADIUS * 2.0));
                let response = ui.interact(
                    node_rect,
                    ui.id().with(("node", node_key)),
                    Sense::click_and_drag(),
                );
                let look = NodeLook {
                    selected: selected.as_deref() == Some(node_key),
                    hovered: response.hovered(),
                    overlapping: overlapping.contains(node_key.as_str()),
                    lifted: dragging.is_some_and(|drag| drag.node == *node_key),
                };
                let icon = files.and_then(|files| {
                    let skill = files.json(&row_file("skill", &node.skill))?;
                    let path = skill["icon"].as_str()?.to_owned();
                    let mut budget = u32::MAX;
                    editor
                        .form
                        .thumbnails
                        .icon(ui.ctx(), files, &path, &mut budget)
                });
                draw_node(&painter, center, look, icon.as_ref());
                let name = files
                    .and_then(|files| files.json(&row_file("skill", &node.skill)))
                    .and_then(|skill| skill["name"].as_str().map(str::to_owned))
                    .unwrap_or_else(|| node.skill.clone());
                painter.text(
                    center + Vec2::new(0.0, NODE_RADIUS + 4.0),
                    egui::Align2::CENTER_TOP,
                    &name,
                    egui::FontId::proportional(11.5),
                    if look.selected {
                        theme::TEXT
                    } else {
                        theme::MUTED
                    },
                );
                if look.lifted && snap {
                    dashed_circle(
                        &painter,
                        to_screen(snapped(at)),
                        NODE_RADIUS,
                        Stroke::new(1.0, theme::ACCENT),
                    );
                }
                let response = response.on_hover_ui(|ui| {
                    ui.label(theme::strong(&name));
                    ui.label(
                        theme::muted(format!("node {node_key} · skill/{}", node.skill)).size(12.0),
                    );
                    for requirement in &node.requires {
                        ui.label(theme::muted(describe(requirement, nodes, files)).size(12.0));
                    }
                    ui.label(
                        theme::faint("drag to move · drop on the inspector's list to require it")
                            .size(11.5),
                    );
                });
                response.context_menu(|ui| {
                    if ui.button("Remove node").clicked() {
                        removed = Some(node_key.clone());
                        ui.close();
                    }
                });
                if response.clicked() {
                    clicked = Some(Some(node_key.clone()));
                }
                if response.drag_started()
                    && let Some(pointer) = response.interact_pointer_pos()
                {
                    started = Some(NodeDrag {
                        node: node_key.clone(),
                        offset: pointer - center,
                        at,
                    });
                    egui::DragAndDrop::set_payload(ui.ctx(), CarriedNode(node_key.clone()));
                }
            }
            if let Some(drag) = editor.views.class.drag.as_mut() {
                let pointer =
                    ui.input(|input| (input.pointer.latest_pos(), input.pointer.any_released()));
                if let Some(at) = pointer.0 {
                    let canvas_at = at - drag.offset - origin.to_vec2();
                    drag.at = Point {
                        x: canvas_at.x.max(0.0),
                        y: canvas_at.y.max(0.0),
                    };
                }
                if pointer.1 {
                    let inside = pointer.0.is_some_and(|at| rect.contains(at));
                    if inside {
                        let at = if snap { snapped(drag.at) } else { drag.at };
                        released = Some((drag.node.clone(), at));
                    }
                }
            }
        });
    if let Some(drag) = started {
        editor.views.class.drag = Some(drag);
    }
    if ui.input(|input| input.pointer.any_released()) {
        editor.views.class.drag = None;
    }
    if let Some((node, at)) = released {
        let blocked = nodes
            .iter()
            .any(|(other, placed)| *other != node && overlaps(at, placed.at));
        if blocked {
            editor.toast("Nodes can't overlap");
        } else if nodes.get(&node).is_some_and(|node| node.at != at) {
            row["tree"][&node]["at"] = serde_json::json!({ "x": at.x, "y": at.y });
            *changed = Some("Move node");
        }
    }
    if let Some(node) = clicked {
        select_node(editor, key, node.as_deref());
    }
    if hovering_canvas
        && let Some(node) = selected.clone()
        && ui.input_mut(|input| input.consume_key(Modifiers::NONE, Key::Delete))
    {
        removed = Some(node);
    }
    if let Some(node) = removed {
        remove_node(row, &node);
        *changed = Some("Remove node");
        select_node(editor, key, None);
    }
    editor.status.left.push(format!("class {key} › tree"));
    editor.status.left.push(
        "click a node to inspect it · drag to move · right-click or Delete removes it".to_owned(),
    );
}

#[derive(Clone, Copy)]
struct NodeLook {
    selected: bool,
    hovered: bool,
    overlapping: bool,
    lifted: bool,
}

fn draw_node(
    painter: &egui::Painter,
    center: Pos2,
    look: NodeLook,
    icon: Option<&thumbs::Thumbnail>,
) {
    let stroke = if look.overlapping {
        Stroke::new(2.0, theme::DANGER)
    } else if look.selected {
        Stroke::new(2.5, theme::ACCENT)
    } else {
        Stroke::new(1.5, theme::BORDER)
    };
    let fill = if look.lifted {
        theme::ACCENT_SOFT
    } else {
        theme::RAISED
    };
    painter.circle_filled(center, NODE_RADIUS, fill);
    painter.circle_stroke(center, NODE_RADIUS, stroke);
    if look.hovered {
        painter.circle_stroke(
            center,
            NODE_RADIUS + 2.0,
            Stroke::new(1.0, design_tokens::color::HOVER_LINE),
        );
    }
    match icon {
        Some(icon) => {
            painter.image(
                icon.texture.id(),
                Rect::from_center_size(center, Vec2::splat(ICON)),
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
        }
        None => {
            painter.text(
                center,
                egui::Align2::CENTER_CENTER,
                "?",
                egui::FontId::proportional(16.0),
                theme::MUTED,
            );
        }
    }
}

fn describe(requirement: &Requirement, nodes: &Nodes, files: Option<&ProjectFiles>) -> String {
    match requirement {
        Requirement::Skill { node, rank } => {
            let name = nodes
                .get(node)
                .and_then(|node| files?.json(&row_file("skill", &node.skill)))
                .and_then(|skill| skill["name"].as_str().map(str::to_owned))
                .unwrap_or_else(|| node.clone());
            format!("needs {name} rank {rank}")
        }
        Requirement::Level { level } => format!("needs level {level}"),
        Requirement::Condition { .. } => "needs a condition".to_owned(),
    }
}

fn cycles(nodes: &Nodes) -> BTreeSet<&str> {
    let mut on_cycle = BTreeSet::new();
    for start in nodes.keys() {
        let mut stack = vec![start.as_str()];
        let mut seen = BTreeSet::new();
        while let Some(key) = stack.pop() {
            let Some(node) = nodes.get(key) else {
                continue;
            };
            for requirement in &node.requires {
                if let Requirement::Skill { node: next, .. } = requirement {
                    if next == start {
                        on_cycle.insert(start.as_str());
                    } else if seen.insert(next.as_str()) {
                        stack.push(next.as_str());
                    }
                }
            }
        }
    }
    on_cycle
}

fn overlaps(a: Point, b: Point) -> bool {
    (a.x - b.x).abs() < NODE_EXTENT && (a.y - b.y).abs() < NODE_EXTENT
}

fn snapped(at: Point) -> Point {
    Point {
        x: (at.x / GRID).round() * GRID,
        y: (at.y / GRID).round() * GRID,
    }
}

fn free_spot(nodes: &Nodes) -> Point {
    (0..)
        .map(|index| Point {
            x: FIRST_SPOT.x + (index % SPOTS_PER_ROW) as f32 * SPOT_STEP.x,
            y: FIRST_SPOT.y + (index / SPOTS_PER_ROW) as f32 * SPOT_STEP.y,
        })
        .find(|spot| !nodes.values().any(|node| overlaps(*spot, node.at)))
        .unwrap_or(FIRST_SPOT)
}

fn fresh_key(nodes: &Nodes, skill: &str) -> String {
    if !nodes.contains_key(skill) {
        return skill.to_owned();
    }
    (2..)
        .map(|n| format!("{skill}_{n}"))
        .find(|key| !nodes.contains_key(key))
        .expect("an unused key")
}

fn dots(painter: &egui::Painter, rect: Rect, origin: Pos2) {
    let colour = Color32::from_rgba_unmultiplied(255, 255, 255, 14);
    let mut x = origin.x - ((origin.x - rect.min.x) / GRID).floor() * GRID;
    while x <= rect.max.x {
        let mut y = origin.y - ((origin.y - rect.min.y) / GRID).floor() * GRID;
        while y <= rect.max.y {
            painter.circle_filled(Pos2::new(x, y), 1.0, colour);
            y += GRID;
        }
        x += GRID;
    }
}

fn arrow(painter: &egui::Painter, from: Pos2, to: Pos2, colour: Color32, dashed: bool) {
    let delta = to - from;
    let length = delta.length();
    if length <= NODE_RADIUS * 2.0 {
        return;
    }
    let dir = delta / length;
    let start = from + dir * (NODE_RADIUS + 4.0);
    let end = to - dir * (NODE_RADIUS + 6.0);
    let stroke = Stroke::new(2.0, colour);
    if dashed {
        painter.add(egui::Shape::dashed_line(&[start, end], stroke, 6.0, 4.0));
    } else {
        painter.line_segment([start, end], stroke);
    }
    let side = Vec2::new(-dir.y, dir.x);
    let tip = end + dir * ARROW_HEAD;
    painter.add(egui::Shape::convex_polygon(
        vec![
            tip,
            end - dir * 2.0 + side * ARROW_HEAD * 0.6,
            end - dir * 2.0 - side * ARROW_HEAD * 0.6,
        ],
        colour,
        Stroke::NONE,
    ));
}

fn dashed_circle(painter: &egui::Painter, center: Pos2, radius: f32, stroke: Stroke) {
    let points: Vec<Pos2> = (0..=48)
        .map(|step| {
            let angle = std::f32::consts::TAU * step as f32 / 48.0;
            center + Vec2::new(angle.cos(), angle.sin()) * radius
        })
        .collect();
    painter.add(egui::Shape::dashed_line(&points, stroke, 4.0, 3.0));
}

fn first_rank() -> u8 {
    1
}
