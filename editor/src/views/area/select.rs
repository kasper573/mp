use std::collections::HashSet;

use egui::{Pos2, Ui};
use game::core::math::{Pos, Rect};
use game::core::tiling::{TilePos, Tiles};
use serde_json::Value;

use super::modules::{append_modules, write_modules};
use super::{Corner, Drag, Frame, PasteGhost, Tool, pins, shapes};
use super::{holes, pick, placement};
use crate::app::Editor;
use crate::project::Selection;

pub(super) fn selected_indices(editor: &Editor, area_key: &str) -> Vec<usize> {
    let mut indices: Vec<usize> = super::selected_parts(editor, area_key)
        .iter()
        .filter_map(|part| part.strip_prefix("/modules/")?.parse().ok())
        .collect();
    indices.sort_unstable();
    indices
}

pub(super) fn select_input(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    frame: &Frame,
    modifiers: egui::Modifiers,
) {
    let response = frame.response;
    let Some(tile) = frame.pointer_tile else {
        if response.drag_stopped() {
            finish_select_drag(editor, view_key, frame, modifiers);
        }
        return;
    };
    if modifiers.alt && response.clicked() {
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .listener = Some(tile);
        pick::listen(editor, frame, tile);
        return;
    }
    if let Some(ghost) = editor.views.area.views[view_key].paste.clone() {
        if response.clicked() || ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            finish_paste(editor, view_key, frame, ghost, tile);
        }
        return;
    }
    let selected = selected_indices(editor, &frame.area_key);
    let editing = editor.views.area.views[view_key]
        .in_place
        .last()
        .map(|p| p.module);
    if response.drag_started_by(egui::PointerButton::Primary) {
        let on_handle = selected
            .iter()
            .find_map(|&index| handle_at(frame, index, frame.pointer?));
        let hit = frame
            .hit(tile)
            .filter(|hit| editing.is_none_or(|e| e == *hit));
        let pin = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default());
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some((index, corner, start)) = on_handle {
            view.drag = Some(Drag::Resize {
                part: format!("/modules/{index}"),
                corner,
                start,
            });
        } else if let Some(pin) = pin {
            view.drag = Some(match pin {
                pins::PinHit::Spawn => Drag::Spawn,
                pins::PinHit::Place { file, pointer } => Drag::Pin { file, pointer },
            });
        } else if let Some(hit) = hit {
            if !selected.contains(&hit) {
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![frame.area_key.clone()],
                    parts: vec![format!("/modules/{hit}")],
                };
            }
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .drag = Some(Drag::Move {
                from: tile,
                moved: false,
            });
        } else {
            view.drag = Some(Drag::Box { from: tile });
        }
        return;
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some(Drag::Move { from, moved }) = &mut view.drag
            && (tile.x - from.x).abs() + (tile.y - from.y).abs() > 0.25
        {
            *moved = true;
        }
        return;
    }
    if response.drag_stopped() {
        finish_select_drag(editor, view_key, frame, modifiers);
        return;
    }
    if response.double_clicked()
        && let Some(hit) = frame.hit(tile)
    {
        if frame.modules[hit]["type"] == "blueprint" {
            placement::edit_in_place(editor, view_key, frame, hit);
        } else {
            editor.panels.right = crate::app::RightTab::Inspector;
        }
        return;
    }
    if response.clicked() {
        if let Some(pin) = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default()) {
            pins::open_pin(editor, pin);
            return;
        }
        let hit = frame
            .hit(tile)
            .filter(|hit| editing.is_none_or(|e| e == *hit));
        match hit {
            Some(index) => {
                let part = format!("/modules/{index}");
                let mut parts: Vec<String> = if modifiers.shift || modifiers.ctrl {
                    editor.selection.parts.clone()
                } else {
                    Vec::new()
                };
                if editor.selection.table != "area"
                    || editor.selection.keys != vec![frame.area_key.clone()]
                {
                    parts.clear();
                }
                if modifiers.ctrl && parts.contains(&part) {
                    parts.retain(|p| *p != part);
                } else if !parts.contains(&part) {
                    parts.push(part);
                }
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![frame.area_key.clone()],
                    parts,
                };
            }
            None => {
                if !modifiers.shift && !modifiers.ctrl {
                    editor.selection = Selection {
                        table: "area".to_owned(),
                        keys: vec![frame.area_key.clone()],
                        parts: Vec::new(),
                    };
                }
            }
        }
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .cursor_cell = Some(tile.cell());
    }
}

pub(super) fn handle_at(
    frame: &Frame,
    index: usize,
    pointer: Pos2,
) -> Option<(usize, Corner, Rect<Tiles>)> {
    let module = frame.modules.get(index)?;
    if !shapes::has_size(module) {
        return None;
    }
    let bounds = frame.module_bounds(index)?;
    let rect = frame.canvas.rect(bounds);
    let corners = [
        (Corner::TopLeft, rect.min),
        (Corner::TopRight, Pos2::new(rect.max.x, rect.min.y)),
        (Corner::BottomLeft, Pos2::new(rect.min.x, rect.max.y)),
        (Corner::BottomRight, rect.max),
    ];
    corners
        .into_iter()
        .find(|(_, at)| (*at - pointer).length() <= 7.0)
        .map(|(corner, _)| (index, corner, bounds))
}

pub(super) fn finish_select_drag(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    modifiers: egui::Modifiers,
) {
    let Some(drag) = editor
        .views
        .area
        .views
        .get_mut(view_key)
        .expect("view")
        .drag
        .take()
    else {
        return;
    };
    let Some(tile) = frame.pointer_tile.or_else(|| {
        frame
            .response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p))
    }) else {
        return;
    };
    match drag {
        Drag::Box { from } => {
            let rect = Rect::from_points([from, tile]);
            let editing = editor.views.area.views[view_key]
                .in_place
                .last()
                .map(|p| p.module);
            let mut parts: Vec<String> = if modifiers.shift {
                editor.selection.parts.clone()
            } else {
                Vec::new()
            };
            for index in 0..frame.modules.len() {
                if editing.is_some_and(|e| e != index) {
                    continue;
                }
                if frame.modules[index]["type"] == "population"
                    && frame.modules[index]["roams"].is_null()
                {
                    continue;
                }
                if let Some(bounds) = frame.module_bounds(index)
                    && rect.contains_rect(&bounds)
                {
                    let part = format!("/modules/{index}");
                    if !parts.contains(&part) {
                        parts.push(part);
                    }
                }
            }
            editor.selection = Selection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts,
            };
        }
        Drag::Move { from, moved } => {
            if !moved {
                return;
            }
            let (dx, dy) = snapped_delta(from, tile, modifiers.alt);
            if dx == 0.0 && dy == 0.0 {
                return;
            }
            move_selection(editor, view_key, frame, dx, dy);
        }
        Drag::Resize {
            part,
            corner,
            start,
        } => {
            let Some(index) = part
                .strip_prefix("/modules/")
                .and_then(|i| i.parse::<usize>().ok())
            else {
                return;
            };
            let snap = |v: f32| {
                if modifiers.alt {
                    (v * 16.0).round() / 16.0
                } else {
                    v.round()
                }
            };
            let (min, max) = (start.min(), start.max());
            let (new_min, new_max) = match corner {
                Corner::TopLeft => (
                    Pos::new(snap(tile.x + 0.5) - 0.5, snap(tile.y + 0.5) - 0.5),
                    max,
                ),
                Corner::TopRight => (
                    Pos::new(min.x, snap(tile.y + 0.5) - 0.5),
                    Pos::new(snap(tile.x + 0.5) - 0.5, max.y),
                ),
                Corner::BottomLeft => (
                    Pos::new(snap(tile.x + 0.5) - 0.5, min.y),
                    Pos::new(max.x, snap(tile.y + 0.5) - 0.5),
                ),
                Corner::BottomRight => (
                    min,
                    Pos::new(snap(tile.x + 0.5) - 0.5, snap(tile.y + 0.5) - 0.5),
                ),
            };
            let w = (new_max.x - new_min.x).max(1.0);
            let h = (new_max.y - new_min.y).max(1.0);
            let mut modules = frame.modules.clone();
            let module = &mut modules[index];
            shapes::shift(module, new_min.x - min.x, new_min.y - min.y);
            shapes::resize(module, w, h);
            let label = format!("Resize {} in {}", shapes::label(module), frame.area_key);
            write_modules(editor, &frame.area_key, modules, &label);
        }
        Drag::Pin { file, pointer } => {
            let at = if modifiers.alt {
                snap_sixteenth(tile)
            } else {
                tile.snap()
            };
            pins::move_pin(editor, frame, &file, &pointer, at);
        }
        Drag::Spawn => {
            let at = if modifiers.alt {
                snap_sixteenth(tile)
            } else {
                tile.snap()
            };
            pins::set_spawn(editor, frame, at);
        }
        _ => {}
    }
}

pub fn snap_sixteenth(p: Pos<Tiles>) -> Pos<Tiles> {
    Pos::new((p.x * 16.0).round() / 16.0, (p.y * 16.0).round() / 16.0)
}

pub(super) fn snapped_delta(from: Pos<Tiles>, to: Pos<Tiles>, fine: bool) -> (f32, f32) {
    let (dx, dy) = (to.x - from.x, to.y - from.y);
    if fine {
        ((dx * 16.0).round() / 16.0, (dy * 16.0).round() / 16.0)
    } else {
        (dx.round(), dy.round())
    }
}

pub fn move_selection(editor: &mut Editor, view_key: &str, frame: &Frame, dx: f32, dy: f32) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    if let Some(place) = editor.views.area.views[view_key].in_place.last().cloned() {
        placement::move_parts_in_place(editor, frame, &place, &indices, dx, dy);
        return;
    }
    let mut modules = frame.modules.clone();
    for &index in &indices {
        shapes::shift(&mut modules[index], dx, dy);
    }
    let label = if indices.len() == 1 {
        format!(
            "Move {} in {}",
            shapes::label(&modules[indices[0]]),
            frame.area_key
        )
    } else {
        format!("Move {} modules in {}", indices.len(), frame.area_key)
    };
    write_modules(editor, &frame.area_key, modules, &label);
}

pub fn copy_selection(editor: &mut Editor, frame: &Frame) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let origin = indices
        .iter()
        .filter_map(|&i| frame.module_bounds(i))
        .reduce(shapes::rect_union)
        .map(|r| r.min())
        .unwrap_or(Pos::new(0.0, 0.0));
    let modules: Vec<Value> = indices
        .iter()
        .map(|&i| {
            let mut module = frame.modules[i].clone();
            shapes::shift(&mut module, -origin.x, -origin.y);
            module
        })
        .collect();
    editor.clipboard = Some(
        serde_json::json!({ "rift": "modules", "table": "area", "from": frame.area_key, "modules": modules, "origin": { "x": origin.x, "y": origin.y } }),
    );
    editor.toast(format!("Copied {} modules", indices.len()));
}

pub fn start_paste(editor: &mut Editor, view_key: &str) {
    let Some(clip) = editor.clipboard.clone() else {
        editor.toast("Nothing copied");
        return;
    };
    if clip["rift"] != "modules" {
        editor.toast("The clipboard holds no modules");
        return;
    }
    let modules: Vec<Value> = clip["modules"].as_array().cloned().unwrap_or_default();
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    view.tool = Tool::Select;
    view.paste = Some(PasteGhost { modules, at: None });
}

pub fn paste_in_place(editor: &mut Editor, frame: &Frame) {
    let Some(clip) = editor.clipboard.clone() else {
        return;
    };
    if clip["rift"] != "modules" {
        return;
    }
    let origin = shapes::pos_of(&clip["origin"]).unwrap_or(Pos::new(0.0, 0.0));
    let modules: Vec<Value> = clip["modules"].as_array().cloned().unwrap_or_default();
    paste_at(editor, frame, modules, origin);
}

pub(super) fn finish_paste(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    ghost: PasteGhost,
    tile: Pos<Tiles>,
) {
    editor
        .views
        .area
        .views
        .get_mut(view_key)
        .expect("view")
        .paste = None;
    let at = Pos::new(tile.x.round() - 0.5, tile.y.round() - 0.5);
    paste_at(editor, frame, ghost.modules, at);
}

pub(super) fn paste_at(editor: &mut Editor, frame: &Frame, modules: Vec<Value>, at: Pos<Tiles>) {
    let taken: HashSet<String> = frame
        .modules
        .iter()
        .filter_map(|m| m["name"].as_str().map(str::to_owned))
        .collect();
    let mut placed = Vec::new();
    let mut names = taken.clone();
    for mut module in modules {
        shapes::shift(&mut module, at.x, at.y);
        if let Some(name) = module["name"].as_str().map(str::to_owned)
            && names.contains(&name)
        {
            let fresh = holes::suffixed(&name, &names);
            names.insert(fresh.clone());
            module["name"] = Value::String(fresh);
        }
        placed.push(module);
    }
    let count = placed.len();
    append_modules(
        editor,
        frame,
        placed,
        &format!("Paste {count} modules into {}", frame.area_key),
    );
}

pub fn duplicate_selection(editor: &mut Editor, frame: &Frame) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let names: HashSet<String> = frame
        .modules
        .iter()
        .filter_map(|m| m["name"].as_str().map(str::to_owned))
        .collect();
    let mut taken = names.clone();
    let copies: Vec<Value> = indices
        .iter()
        .map(|&i| {
            let mut module = frame.modules[i].clone();
            shapes::shift(&mut module, 1.0, 1.0);
            if let Some(name) = module["name"].as_str().map(str::to_owned) {
                let fresh = holes::suffixed(&name, &taken);
                taken.insert(fresh.clone());
                module["name"] = Value::String(fresh);
            }
            module
        })
        .collect();
    let count = copies.len();
    append_modules(
        editor,
        frame,
        copies,
        &format!("Duplicate {count} modules in {}", frame.area_key),
    );
}

pub fn delete_selection(editor: &mut Editor, frame: &Frame) {
    if editor.selection.table == "blueprint"
        && let Some(place) = editor
            .views
            .area
            .views
            .get(&format!("area:{}", frame.area_key))
            .and_then(|v| v.in_place.last().cloned())
    {
        placement::delete_parts_in_place(editor, frame, &place);
        return;
    }
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let mut modules = frame.modules.clone();
    for &index in indices.iter().rev() {
        modules.remove(index);
    }
    let label = if indices.len() == 1 {
        format!(
            "Remove {} from {}",
            shapes::label(&frame.modules[indices[0]]),
            frame.area_key
        )
    } else {
        format!("Remove {} modules from {}", indices.len(), frame.area_key)
    };
    if write_modules(editor, &frame.area_key, modules, &label) {
        editor.selection.parts.clear();
    }
}
