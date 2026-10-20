use std::collections::HashSet;

use egui::{Pos2, Ui};
use engine::core::content::{ContentFile, table_of};
use engine::core::math::{Offset, Pos, Rect};
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::area::AreaModuleKind;
use engine::systems::area::blueprint::BlueprintDef;
use serde_json::Value;

use super::placement::{self, AreaPlacement, PartView};
use super::{
    AreaDrag, AreaFrame, AreaSnapshot, AreaTool, AreaViewState, PasteGhost, ResizeCorner, nodes,
    pick, pins, shapes,
};
use crate::app::{Clipboard, Editor};
use crate::keymap::EditorKey;
use crate::project::RowSelection;
use crate::rows;
use crate::value::RowValue;

/// The selected modules of the scene of `bundle`, in tree order.
pub(super) fn selected_nodes(editor: &Editor, frame: &AreaSnapshot) -> Vec<String> {
    let selected = super::selected_parts(editor, &frame.area_key);
    frame
        .modules
        .iter()
        .filter(|module| selected.contains(&module.pointer))
        .map(|module| module.pointer.clone())
        .collect()
}

pub(super) fn select_input(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    frame: &AreaFrame,
    modifiers: egui::Modifiers,
) {
    let scope = match frame.in_place.last() {
        Some(place) => SelectScope::Blueprint {
            place,
            parts: placement::parts_in_place(frame, place),
        },
        None => SelectScope::Area,
    };
    let response = frame.response;
    let Some(tile) = scope.tile(frame) else {
        if response.drag_stopped() {
            finish_select_drag(editor, view_key, &scope, frame, modifiers);
        }
        return;
    };
    if scope.is_area() {
        if EditorKey::Listen.held_among(modifiers) && response.clicked() {
            editor.views.area.view_mut(view_key).listener = Some(tile);
            pick::listen(editor, frame, tile);
            return;
        }
        if let Some(ghost) = editor.views.area.view(view_key).paste.clone() {
            if response.clicked() || ui.input(|i| EditorKey::Confirm.pressed(i)) {
                finish_paste(editor, view_key, frame, ghost, tile);
            }
            return;
        }
    }
    let hit = scope.hit(frame, tile);
    if response.drag_started_by(egui::PointerButton::Primary) {
        start_select_drag(editor, view_key, frame, &scope, tile, hit);
        return;
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        track_move(editor.views.area.view_mut(view_key), tile);
        return;
    }
    if response.drag_stopped() {
        finish_select_drag(editor, view_key, &scope, frame, modifiers);
        return;
    }
    if response.double_clicked() && scope.double_click(editor, view_key, frame, hit.clone()) {
        return;
    }
    if response.clicked() {
        if scope.is_area()
            && let Some(pin) = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default())
        {
            pins::open_pin(editor, pin);
            return;
        }
        match hit {
            Some(node) => {
                let parts = toggled(
                    editor,
                    scope.table(frame),
                    scope.key(frame),
                    node,
                    modifiers,
                );
                editor.selection = RowSelection::parts(scope.table(frame), scope.key(frame), parts);
            }
            None if !EditorKey::ExtendSelection.held_among(modifiers)
                && !EditorKey::ToggleSelection.held_among(modifiers) =>
            {
                scope.clear_selection(editor, frame)
            }
            None => {}
        }
        if scope.is_area() {
            editor.views.area.view_mut(view_key).cursor_cell = Some(tile.cell());
        }
    }
}

enum SelectScope<'a> {
    Area,
    Blueprint {
        place: &'a AreaPlacement,
        parts: Vec<PartView>,
    },
}

impl SelectScope<'_> {
    fn is_area(&self) -> bool {
        matches!(self, SelectScope::Area)
    }

    fn tile(&self, frame: &AreaFrame) -> Option<Pos<Tiles>> {
        match self {
            SelectScope::Area => frame.pointer_tile,
            SelectScope::Blueprint { .. } => frame.drag_tile(),
        }
    }

    fn table<'a>(&'a self, frame: &'a AreaFrame) -> &'a str {
        table_of(self.key(frame)).unwrap_or_default()
    }

    fn key<'a>(&'a self, frame: &'a AreaFrame) -> &'a str {
        match self {
            SelectScope::Area => &frame.area_key,
            SelectScope::Blueprint { place, .. } => &place.blueprint,
        }
    }

    fn selected(&self, editor: &Editor, frame: &AreaFrame) -> Vec<String> {
        match self {
            SelectScope::Area => selected_nodes(editor, frame),
            SelectScope::Blueprint { place, .. } => {
                placement::selected_in_place(editor, &place.blueprint)
            }
        }
    }

    fn hit(&self, frame: &AreaFrame, tile: Pos<Tiles>) -> Option<String> {
        match self {
            SelectScope::Area => frame.hit(tile),
            SelectScope::Blueprint { parts, .. } => parts
                .iter()
                .filter(|part| part.bounds.is_some_and(|b| b.contains(tile)))
                .min_by(|a, b| {
                    a.bounds
                        .map_or(0.0, |b| b.area())
                        .total_cmp(&b.bounds.map_or(0.0, |b| b.area()))
                })
                .map(|part| part.part.clone()),
        }
    }

    fn contained(&self, frame: &AreaFrame, rect: Rect<Tiles>) -> Vec<String> {
        match self {
            SelectScope::Area => frame
                .modules
                .iter()
                .filter(|module| {
                    super::is_selectable(&module.json)
                        && frame
                            .module_bounds(&module.pointer)
                            .is_some_and(|bounds| rect.contains_rect(&bounds))
                })
                .map(|module| module.pointer.clone())
                .collect(),
            SelectScope::Blueprint { parts, .. } => parts
                .iter()
                .filter(|part| part.bounds.is_some_and(|b| rect.contains_rect(&b)))
                .map(|part| part.part.clone())
                .collect(),
        }
    }

    fn move_selected(&self, editor: &mut Editor, frame: &AreaFrame, dx: f32, dy: f32) {
        match self {
            SelectScope::Area => move_selection(editor, frame, dx, dy),
            SelectScope::Blueprint { place, .. } => {
                let parts = self.selected(editor, frame);
                if !parts.is_empty() {
                    placement::move_parts_in_place(editor, frame, place, &parts, dx, dy);
                }
            }
        }
    }

    fn clear_selection(&self, editor: &mut Editor, frame: &AreaFrame) {
        match self {
            SelectScope::Area => {
                editor.selection = RowSelection::row(self.table(frame), &frame.area_key)
            }
            SelectScope::Blueprint { .. } => editor.selection.parts.clear(),
        }
    }

    fn double_click(
        &self,
        editor: &mut Editor,
        view_key: &str,
        frame: &AreaFrame,
        hit: Option<String>,
    ) -> bool {
        match (self, hit) {
            (SelectScope::Area, Some(node)) => {
                if frame
                    .module(&node)
                    .is_some_and(|module| module.is_module(AreaModuleKind::Blueprint))
                {
                    placement::edit_in_place(editor, view_key, frame, &node);
                }
                true
            }
            (SelectScope::Blueprint { parts, .. }, Some(node)) => {
                let nested = parts
                    .iter()
                    .find(|part| part.part == node)
                    .and_then(|part| part.nested.as_deref());
                match nested {
                    Some(blueprint) => {
                        placement::enter_nested(editor, view_key, &node, blueprint);
                        true
                    }
                    None => false,
                }
            }
            _ => false,
        }
    }
}

fn start_select_drag(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    scope: &SelectScope,
    tile: Pos<Tiles>,
    hit: Option<String>,
) {
    if scope.is_area() {
        let on_handle = frame.pointer.and_then(|pointer| {
            scope
                .selected(editor, frame)
                .into_iter()
                .find_map(|node| handle_at(frame, &node, pointer))
        });
        if let Some((part, corner, start)) = on_handle {
            set_drag(
                editor,
                view_key,
                AreaDrag::Resize {
                    part,
                    corner,
                    start,
                },
            );
            return;
        }
        if let Some(pin) = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default()) {
            set_drag(
                editor,
                view_key,
                match pin {
                    pins::PinHit::InitialSpawn => AreaDrag::InitialSpawn,
                    pins::PinHit::Place { file, pointer } => AreaDrag::Pin { file, pointer },
                },
            );
            return;
        }
    }
    match hit {
        Some(node) => {
            if !scope.selected(editor, frame).contains(&node) {
                editor.selection =
                    RowSelection::parts(scope.table(frame), scope.key(frame), vec![node]);
            }
            set_drag(
                editor,
                view_key,
                AreaDrag::Move {
                    from: tile,
                    moved: false,
                },
            );
        }
        None => set_drag(editor, view_key, AreaDrag::Box { from: tile }),
    }
}

fn set_drag(editor: &mut Editor, view_key: &str, drag: AreaDrag) {
    editor.views.area.view_mut(view_key).set_drag(drag);
}

pub(super) fn track_move(view: &mut AreaViewState, tile: Pos<Tiles>) {
    if let Some(AreaDrag::Move { from, moved }) = view.drag_mut()
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
    let toggle = EditorKey::ToggleSelection.held_among(modifiers);
    let extend = EditorKey::ExtendSelection.held_among(modifiers);
    let mut parts = kept_parts(editor, table, key, extend || toggle);
    if toggle && parts.contains(&part) {
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
    let mut parts = kept_parts(
        editor,
        table,
        key,
        EditorKey::ExtendSelection.held_among(modifiers),
    );
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
    node: &str,
    pointer: Pos2,
) -> Option<(String, ResizeCorner, Rect<Tiles>)> {
    let module = frame.module(node)?;
    if !shapes::has_size(module) {
        return None;
    }
    let bounds = frame.module_bounds(node)?;
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
        .map(|(corner, _)| (node.to_owned(), corner, bounds))
}

fn finish_select_drag(
    editor: &mut Editor,
    view_key: &str,
    scope: &SelectScope,
    frame: &AreaFrame,
    modifiers: egui::Modifiers,
) {
    let Some(drag) = editor.views.area.view_mut(view_key).take_drag() else {
        return;
    };
    let Some(tile) = frame.drag_tile() else {
        return;
    };
    match drag {
        AreaDrag::Box { from } => {
            let rect = Rect::from_points([from, tile]);
            let hits = scope.contained(frame, rect);
            let parts = boxed(
                editor,
                scope.table(frame),
                scope.key(frame),
                hits.into_iter(),
                modifiers,
            );
            editor.selection = RowSelection::parts(scope.table(frame), scope.key(frame), parts);
        }
        AreaDrag::Move { from, moved } => {
            if !moved {
                return;
            }
            let (dx, dy) = snapped_delta(from, tile, EditorKey::Unsnapped.held_among(modifiers));
            if dx == 0.0 && dy == 0.0 {
                return;
            }
            scope.move_selected(editor, frame, dx, dy);
        }
        AreaDrag::Resize {
            part,
            corner,
            start,
        } => {
            let (min, max) = (start.min(), start.max());
            let edge = snap_to(
                tile + Offset::new(0.5, 0.5),
                EditorKey::Unsnapped.held_among(modifiers),
            ) - Offset::new(0.5, 0.5);
            let (new_min, new_max) = match corner {
                ResizeCorner::TopLeft => (edge, max),
                ResizeCorner::TopRight => (Pos::new(min.x, edge.y), Pos::new(edge.x, max.y)),
                ResizeCorner::BottomLeft => (Pos::new(edge.x, min.y), Pos::new(max.x, edge.y)),
                ResizeCorner::BottomRight => (min, edge),
            };
            let w = (new_max.x - new_min.x).max(1.0);
            let h = (new_max.y - new_min.y).max(1.0);
            nodes::change_scene(editor, &frame.area_key, |scene| {
                let module = scene.pointer_mut(&part)?;
                shapes::shift(module, new_min.x - min.x, new_min.y - min.y);
                shapes::resize(module, w, h);
                Some(format!("Resize {}", shapes::label(module)))
            });
        }
        AreaDrag::Pin { file, pointer } => {
            let at = snap_to(tile, EditorKey::Unsnapped.held_among(modifiers));
            pins::move_pin(editor, frame, &file, &pointer, at);
        }
        AreaDrag::InitialSpawn => {
            let at = snap_to(tile, EditorKey::Unsnapped.held_among(modifiers));
            pins::set_spawn(editor, &frame.area_key, at);
        }
        AreaDrag::Stamp { .. } => {}
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

pub fn move_selection(editor: &mut Editor, frame: &AreaFrame, dx: f32, dy: f32) {
    if let Some(place) = frame.in_place.last().cloned() {
        let parts = placement::selected_in_place(editor, &place.blueprint);
        if !parts.is_empty() {
            placement::move_parts_in_place(editor, frame, &place, &parts, dx, dy);
        }
        return;
    }
    let moved = selected_nodes(editor, frame);
    if moved.is_empty() {
        return;
    }
    nodes::change_scene(editor, &frame.area_key, |scene| {
        for node in &moved {
            shapes::shift(scene.pointer_mut(node)?, dx, dy);
        }
        Some(match moved.as_slice() {
            [one] => format!("Move {}", shapes::label(scene.pointer(one)?)),
            many => format!("Move {} modules", many.len()),
        })
    });
}

pub fn copy_selection(editor: &mut Editor, frame: &AreaSnapshot) {
    let copied = selected_nodes(editor, frame);
    if copied.is_empty() {
        return;
    }
    let origin = copied
        .iter()
        .filter_map(|node| frame.module_bounds(node))
        .reduce(|a, b| a.union(&b))
        .map(|r| r.min())
        .unwrap_or(Pos::new(0.0, 0.0));
    let modules: Vec<Value> = copied
        .iter()
        .filter_map(|node| frame.module(node))
        .map(|module| {
            let mut module = module.clone();
            shapes::shift(&mut module, -origin.x, -origin.y);
            module
        })
        .collect();
    editor.clipboard = Some(Clipboard {
        from: frame.area_key.clone(),
        modules,
        origin: Some(origin),
    });
    editor.toast(format!("Copied {} modules", copied.len()));
}

pub fn start_paste(editor: &mut Editor, view_key: &str) {
    let Some(clip) = editor.clipboard.clone() else {
        editor.toast("Nothing copied");
        return;
    };
    let view = editor.views.area.view_mut(view_key);
    view.set_tool(AreaTool::Select);
    view.paste = Some(PasteGhost {
        modules: clip.modules,
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

pub(super) fn paste_at(editor: &mut Editor, frame: &AreaFrame, pasted: Vec<Value>, at: Pos<Tiles>) {
    let mut names = object_names(frame);
    let mut placed = Vec::new();
    for mut module in pasted {
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
    nodes::add(
        editor,
        &frame.area_key,
        placed,
        &format!("Paste {count} modules"),
    );
}

/// Copies the selected modules right beside themselves, one tile down and right.
pub fn duplicate_selection(editor: &mut Editor, frame: &AreaSnapshot) {
    let copied = selected_nodes(editor, frame);
    if copied.is_empty() {
        return;
    }
    let mut taken = object_names(frame);
    let mut made = Vec::new();
    let applied = nodes::change_scene(editor, &frame.area_key, |scene| {
        made = nodes::duplicate(scene, &copied, |module| {
            let mut module = module.clone();
            shapes::shift(&mut module, 1.0, 1.0);
            if let Some(name) = module["name"].as_str().map(str::to_owned) {
                let fresh = rows::free_name(&name, &taken);
                taken.insert(fresh.clone());
                module["name"] = Value::String(fresh);
            }
            module
        });
        Some(format!("Duplicate {} modules", copied.len()))
    });
    if applied {
        nodes::select(editor, &frame.area_key, made);
    }
}

pub fn delete_selection(editor: &mut Editor, frame: &AreaSnapshot) {
    if editor.selection.table == BlueprintDef::TABLE
        && let Some(place) = frame.in_place.last().cloned()
    {
        placement::delete_parts_in_place(editor, frame, &place);
        return;
    }
    let removed = selected_nodes(editor, frame);
    if removed.is_empty() {
        return;
    }
    let applied = nodes::change_scene(editor, &frame.area_key, |scene| {
        let label = match removed.as_slice() {
            [one] => format!("Remove {}", shapes::label(scene.pointer(one)?)),
            many => format!("Remove {} modules", many.len()),
        };
        nodes::remove(scene, &removed);
        Some(label)
    });
    if applied {
        editor.selection.parts.clear();
    }
}

fn object_names(frame: &AreaSnapshot) -> HashSet<String> {
    frame
        .modules
        .iter()
        .filter_map(|module| module.json["name"].as_str().map(str::to_owned))
        .collect()
}
