use std::collections::HashSet;

use egui::{Pos2, Ui};
use game::core::math::{Offset, Pos, Rect};
use game::core::tiling::{TilePos, Tiles};
use game::systems::area::AreaModuleKind;
use serde_json::Value;

use super::modules::{append_modules, write_modules};
use super::{AreaDrag, AreaFrame, AreaTool, AreaViewState, PasteGhost, ResizeCorner, pins, shapes};
use super::{pick, placement};
use crate::app::{Clipboard, Editor, RightTab};
use crate::project::RowSelection;
use crate::rows;
use crate::value::RowValue;

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
    frame: &AreaFrame,
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
        editor.views.area.view_mut(view_key).listener = Some(tile);
        pick::listen(editor, frame, tile);
        return;
    }
    if let Some(ghost) = editor.views.area.view(view_key).paste.clone() {
        if response.clicked() || ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            finish_paste(editor, view_key, frame, ghost, tile);
        }
        return;
    }
    let selected = selected_indices(editor, &frame.area_key);
    let editing = editor
        .views
        .area
        .view(view_key)
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
        let view = editor.views.area.view_mut(view_key);
        if let Some((index, corner, start)) = on_handle {
            view.drag = Some(AreaDrag::Resize {
                part: format!("/modules/{index}"),
                corner,
                start,
            });
        } else if let Some(pin) = pin {
            view.drag = Some(match pin {
                pins::PinHit::InitialSpawn => AreaDrag::InitialSpawn,
                pins::PinHit::Place { file, pointer } => AreaDrag::Pin { file, pointer },
            });
        } else if let Some(hit) = hit {
            if !selected.contains(&hit) {
                editor.selection =
                    RowSelection::parts("area", &frame.area_key, vec![format!("/modules/{hit}")]);
            }
            editor.views.area.view_mut(view_key).drag = Some(AreaDrag::Move {
                from: tile,
                moved: false,
            });
        } else {
            view.drag = Some(AreaDrag::Box { from: tile });
        }
        return;
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        track_move(editor.views.area.view_mut(view_key), tile);
        return;
    }
    if response.drag_stopped() {
        finish_select_drag(editor, view_key, frame, modifiers);
        return;
    }
    if response.double_clicked()
        && let Some(hit) = frame.hit(tile)
    {
        if frame.modules[hit].is_module(AreaModuleKind::Blueprint) {
            placement::edit_in_place(editor, view_key, frame, hit);
        } else {
            editor.panels.right = RightTab::Inspector;
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
                let parts = toggled(
                    editor,
                    "area",
                    &frame.area_key,
                    format!("/modules/{index}"),
                    modifiers,
                );
                editor.selection = RowSelection::parts("area", &frame.area_key, parts);
            }
            None => {
                if !modifiers.shift && !modifiers.ctrl {
                    editor.selection = RowSelection::row("area", &frame.area_key);
                }
            }
        }
        editor.views.area.view_mut(view_key).cursor_cell = Some(tile.cell());
    }
}

pub(super) fn track_move(view: &mut AreaViewState, tile: Pos<Tiles>) {
    if let Some(AreaDrag::Move { from, moved }) = &mut view.drag
        && (tile.x - from.x).abs() + (tile.y - from.y).abs() > 0.25
    {
        *moved = true;
    }
}

pub(super) fn toggled(
    editor: &Editor,
    table: &str,
    key: &str,
    part: String,
    modifiers: egui::Modifiers,
) -> Vec<String> {
    let mut parts = kept_parts(editor, table, key, modifiers.shift || modifiers.ctrl);
    if modifiers.ctrl && parts.contains(&part) {
        parts.retain(|p| *p != part);
    } else if !parts.contains(&part) {
        parts.push(part);
    }
    parts
}

pub(super) fn boxed(
    editor: &Editor,
    table: &str,
    key: &str,
    hits: impl Iterator<Item = String>,
    modifiers: egui::Modifiers,
) -> Vec<String> {
    let mut parts = kept_parts(editor, table, key, modifiers.shift);
    for part in hits {
        if !parts.contains(&part) {
            parts.push(part);
        }
    }
    parts
}

fn kept_parts(editor: &Editor, table: &str, key: &str, keep: bool) -> Vec<String> {
    let same = editor.selection.table == table && editor.selection.keys.as_slice() == [key];
    if keep && same {
        editor.selection.parts.clone()
    } else {
        Vec::new()
    }
}

pub(super) fn handle_at(
    frame: &AreaFrame,
    index: usize,
    pointer: Pos2,
) -> Option<(usize, ResizeCorner, Rect<Tiles>)> {
    let module = frame.modules.get(index)?;
    if !shapes::has_size(module) {
        return None;
    }
    let bounds = frame.module_bounds(index)?;
    let rect = frame.canvas.rect(bounds);
    let corners = [
        (ResizeCorner::TopLeft, rect.min),
        (ResizeCorner::TopRight, Pos2::new(rect.max.x, rect.min.y)),
        (ResizeCorner::BottomLeft, Pos2::new(rect.min.x, rect.max.y)),
        (ResizeCorner::BottomRight, rect.max),
    ];
    corners
        .into_iter()
        .find(|(_, at)| (*at - pointer).length() <= 7.0)
        .map(|(corner, _)| (index, corner, bounds))
}

pub(super) fn finish_select_drag(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    modifiers: egui::Modifiers,
) {
    let Some(drag) = editor.views.area.view_mut(view_key).drag.take() else {
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
        AreaDrag::Box { from } => {
            let rect = Rect::from_points([from, tile]);
            let editing = editor
                .views
                .area
                .view(view_key)
                .in_place
                .last()
                .map(|p| p.module);
            let hits = (0..frame.modules.len()).filter(|&index| {
                if editing.is_some_and(|e| e != index) {
                    return false;
                }
                if frame.modules[index].is_module(AreaModuleKind::Population)
                    && frame.modules[index]["roams"].is_null()
                {
                    return false;
                }
                frame
                    .module_bounds(index)
                    .is_some_and(|bounds| rect.contains_rect(&bounds))
            });
            let parts = boxed(
                editor,
                "area",
                &frame.area_key,
                hits.map(|index| format!("/modules/{index}")),
                modifiers,
            );
            editor.selection = RowSelection::parts("area", &frame.area_key, parts);
        }
        AreaDrag::Move { from, moved } => {
            if !moved {
                return;
            }
            let (dx, dy) = snapped_delta(from, tile, modifiers.alt);
            if dx == 0.0 && dy == 0.0 {
                return;
            }
            move_selection(editor, view_key, frame, dx, dy);
        }
        AreaDrag::Resize {
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
            let (min, max) = (start.min(), start.max());
            let edge = snap_to(tile + Offset::new(0.5, 0.5), modifiers.alt) - Offset::new(0.5, 0.5);
            let (new_min, new_max) = match corner {
                ResizeCorner::TopLeft => (edge, max),
                ResizeCorner::TopRight => (Pos::new(min.x, edge.y), Pos::new(edge.x, max.y)),
                ResizeCorner::BottomLeft => (Pos::new(edge.x, min.y), Pos::new(max.x, edge.y)),
                ResizeCorner::BottomRight => (min, edge),
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
        AreaDrag::Pin { file, pointer } => {
            let at = snap_to(tile, modifiers.alt);
            pins::move_pin(editor, frame, &file, &pointer, at);
        }
        AreaDrag::InitialSpawn => {
            let at = snap_to(tile, modifiers.alt);
            pins::set_spawn(editor, &frame.area_key, at);
        }
        _ => {}
    }
}

pub fn snap_to(p: Pos<Tiles>, fine: bool) -> Pos<Tiles> {
    if fine {
        Pos::new(sixteenth(p.x), sixteenth(p.y))
    } else {
        p.snap()
    }
}

pub(super) fn snapped_delta(from: Pos<Tiles>, to: Pos<Tiles>, fine: bool) -> (f32, f32) {
    let (dx, dy) = (to.x - from.x, to.y - from.y);
    if fine {
        (sixteenth(dx), sixteenth(dy))
    } else {
        (dx.round(), dy.round())
    }
}

fn sixteenth(v: f32) -> f32 {
    (v * 16.0).round() / 16.0
}

pub fn move_selection(editor: &mut Editor, view_key: &str, frame: &AreaFrame, dx: f32, dy: f32) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    if let Some(place) = editor.views.area.view(view_key).in_place.last().cloned() {
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

pub fn copy_selection(editor: &mut Editor, frame: &AreaFrame) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let origin = indices
        .iter()
        .filter_map(|&i| frame.module_bounds(i))
        .reduce(|a, b| a.union(&b))
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
    editor.clipboard = Some(Clipboard {
        table: "area".to_owned(),
        from: frame.area_key.clone(),
        modules,
        origin: Some(origin),
    });
    editor.toast(format!("Copied {} modules", indices.len()));
}

pub fn start_paste(editor: &mut Editor, view_key: &str) {
    let Some(clip) = editor.clipboard.clone() else {
        editor.toast("Nothing copied");
        return;
    };
    let view = editor.views.area.view_mut(view_key);
    view.tool = AreaTool::Select;
    view.paste = Some(PasteGhost {
        modules: clip.modules,
        at: None,
    });
}

pub fn paste_in_place(editor: &mut Editor, frame: &AreaFrame) {
    let Some(clip) = editor.clipboard.clone() else {
        return;
    };
    let origin = clip.origin.unwrap_or(Pos::new(0.0, 0.0));
    paste_at(editor, frame, clip.modules, origin);
}

pub(super) fn finish_paste(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    ghost: PasteGhost,
    tile: Pos<Tiles>,
) {
    editor.views.area.view_mut(view_key).paste = None;
    paste_at(editor, frame, ghost.modules, paste_anchor(tile));
}

pub(super) fn paste_anchor(tile: Pos<Tiles>) -> Pos<Tiles> {
    Pos::new(tile.x.round() - 0.5, tile.y.round() - 0.5)
}

pub(super) fn paste_at(
    editor: &mut Editor,
    frame: &AreaFrame,
    modules: Vec<Value>,
    at: Pos<Tiles>,
) {
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
            let fresh = rows::free_name(&name, &names);
            names.insert(fresh.clone());
            module["name"] = Value::String(fresh);
        }
        placed.push(module);
    }
    let count = placed.len();
    append_modules(
        editor,
        &frame.area_key,
        placed,
        &format!("Paste {count} modules into {}", frame.area_key),
    );
}

pub fn duplicate_selection(editor: &mut Editor, frame: &AreaFrame) {
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
                let fresh = rows::free_name(&name, &taken);
                taken.insert(fresh.clone());
                module["name"] = Value::String(fresh);
            }
            module
        })
        .collect();
    let count = copies.len();
    append_modules(
        editor,
        &frame.area_key,
        copies,
        &format!("Duplicate {count} modules in {}", frame.area_key),
    );
}

pub fn delete_selection(editor: &mut Editor, frame: &AreaFrame) {
    if editor.selection.table == "blueprint"
        && let Some(place) = editor
            .views
            .area
            .views
            .get(&super::area_view_key(&frame.area_key))
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
