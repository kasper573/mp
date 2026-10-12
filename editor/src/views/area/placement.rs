use std::collections::{BTreeMap, HashMap, HashSet};

use egui::{RichText, Stroke as EStroke, Ui, Vec2};
use game::core::content::Content;
use game::core::math::{Pos, Rect, Size};
use game::core::script::VariableType;
use game::core::tiling::Tiles;
use game::systems::area::{self, AreaModuleKind, Flip};
use serde_json::Value;

use super::blueprint::open_make_blueprint;
use super::holes::{fill_holes, value_kind};
use super::modules;
use super::stamp::place_json;
use super::{Frame, InPlace, shapes};
use crate::app::{Dialog, Editor, PickRowDialog, PickRowThen};
use crate::forms::FormCx;
use crate::project::{Edit, Selection, row_file};
use crate::tabs::Tab;
use crate::ui::widgets;
use crate::value::RowValue;

pub fn placement_bounds(content: Content, area_id: area::Id) -> HashMap<usize, Rect<Tiles>> {
    let mut out: HashMap<usize, Rect<Tiles>> = HashMap::new();
    for placed in area::placed(&content, area_id) {
        if placed.chain.is_empty() {
            continue;
        }
        let Ok(json) = crate::value::json(&placed.module) else {
            continue;
        };
        let Some(bounds) = shapes::bounds(&json, None) else {
            continue;
        };
        out.entry(placed.origin)
            .and_modify(|known| *known = shapes::rect_union(*known, bounds))
            .or_insert(bounds);
    }
    out
}

pub fn first_area_using(editor: &Editor, blueprint: &str) -> Option<String> {
    let project = editor.project.as_ref()?;
    project
        .usages
        .of_row("blueprint", blueprint)
        .iter()
        .find_map(|usage| {
            crate::project::row_of(&usage.file)
                .filter(|(table, _)| *table == "area")
                .map(|(_, key)| key.to_owned())
        })
}

pub fn placement_count(content: Content, blueprint: &str) -> String {
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(blueprint) else {
        return String::new();
    };
    let mut direct = 0;
    let mut areas = HashSet::new();
    let mut nested = 0;
    for area_id in content.ids::<area::AreaDef>() {
        for placement in area::placements(&content, area_id) {
            if placement.blueprint != id {
                continue;
            }
            if placement.chain.len() <= 1 {
                direct += 1;
                areas.insert(area_id.index());
            } else {
                nested += 1;
            }
        }
    }
    let mut text = match areas.len() {
        0 => "Placed nowhere yet.".to_owned(),
        1 => {
            let name = areas
                .iter()
                .next()
                .and_then(|index| {
                    content
                        .ids::<area::AreaDef>()
                        .into_iter()
                        .find(|id| id.index() == *index)
                })
                .map(|id| id.get(&content).name.clone())
                .unwrap_or_default();
            format!(
                "Placed {direct} time{}, all in {name}.",
                widgets::plural(direct)
            )
        }
        count => format!("Placed {direct} times in {count} areas."),
    };
    if nested > 0 {
        text.push_str(&format!(" {nested} more sit inside other blueprints."));
    }
    text
}

pub enum Extra {
    OpenBlueprint(String),
    RemoveAll,
    MakeBlueprint,
    GoTo(String, Pos<Tiles>),
}

pub fn act(editor: &mut Editor, extra: Extra, area_key: &str, indices: &[usize]) {
    match extra {
        Extra::OpenBlueprint(key) => {
            editor.select(Selection::row("blueprint", &key));
            editor.open_tab(Tab::Blueprint { key });
        }
        Extra::RemoveAll => {
            let Some(mut row) = editor.row_value("area", area_key) else {
                return;
            };
            let mut sorted = indices.to_vec();
            sorted.sort_unstable();
            for index in sorted.iter().rev() {
                row["modules"].as_array_mut().map(|m| m.remove(*index));
            }
            let mut edit = Edit::new(format!("Remove {} modules from {area_key}", indices.len()));
            edit.write_json(row_file("area", area_key), &row);
            if editor.apply(edit) {
                editor.selection.parts.clear();
            }
        }
        Extra::MakeBlueprint => {
            open_make_blueprint(editor, area_key, indices.to_vec());
        }
        Extra::GoTo(area, at) => {
            super::open_area_at(editor, &area, Some(at), None);
        }
    }
}

pub fn placement_card(
    ui: &mut Ui,
    cx: &mut FormCx,
    content: Option<Content>,
    module: &mut Value,
    path: &str,
    _extras: &mut Vec<Extra>,
) -> bool {
    if !module.is_module(AreaModuleKind::Blueprint) {
        return false;
    }
    let Some(content) = content else {
        return false;
    };
    let Some(blueprint) = module["blueprint"].as_str().map(str::to_owned) else {
        return false;
    };
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(&blueprint) else {
        return false;
    };
    let def = id.get(&content);
    if def.variables.is_empty() {
        crate::ui::widgets::kv_text(ui, "values", "none: no variables");
        return false;
    }
    let mut changed = false;
    if !module["values"].is_object() {
        module["values"] = Value::Object(Default::default());
    }
    for (name, variable) in &def.variables {
        crate::ui::widgets::kv(ui, name, |ui| {
            ui.vertical(|ui| {
                ui.set_min_width(ui.available_width());
                let own = module["values"].get(name).cloned();
                let default = variable
                    .default
                    .as_ref()
                    .and_then(|d| crate::value::json(d).ok());
                let value_path = format!("{path}/values/{name}");
                match own {
                    Some(mut value) => {
                        if variable_field(ui, cx, variable, &mut value, &value_path) {
                            module["values"][name] = value;
                            changed = true;
                        }
                        if default.is_some()
                            && ui
                                .small_button("✕")
                                .on_hover_text("Back to the blueprint's default")
                                .clicked()
                        {
                            module["values"].as_object_mut().map(|m| m.remove(name));
                            changed = true;
                        }
                    }
                    None => {
                        let shown = match &default {
                            Some(default) => short_value(default),
                            None => "missing".to_owned(),
                        };
                        let response = ui
                            .add(
                                egui::Label::new(crate::ui::theme::muted(shown))
                                    .sense(egui::Sense::click()),
                            )
                            .on_hover_text("Click to set this copy's own value");
                        if response.clicked() {
                            module["values"][name] = default
                                .clone()
                                .unwrap_or_else(|| variable_template(variable));
                            changed = true;
                        }
                    }
                }
            });
        });
    }
    changed
}

pub fn variable_template(variable: &game::systems::script::Variable) -> Value {
    use game::core::script::VariableType as T;
    match variable.ty {
        T::Integer => Value::from(0),
        T::Number => Value::from(0.0),
        T::Boolean => Value::Bool(false),
        T::Text | T::Name | T::Row | T::Audio => Value::String(String::new()),
        T::Place => serde_json::json!({ "area": "", "x": 0.0, "y": 0.0 }),
        T::Condition => crate::condition::empty_object(),
    }
}

pub fn variable_field(
    ui: &mut Ui,
    cx: &mut FormCx,
    variable: &game::systems::script::Variable,
    value: &mut Value,
    path: &str,
) -> bool {
    use game::core::script::VariableType as T;
    let schema = match variable.ty {
        T::Integer => serde_json::json!({ "type": "integer" }),
        T::Number => serde_json::json!({ "type": "number" }),
        T::Boolean => serde_json::json!({ "type": "boolean" }),
        T::Text | T::Name => serde_json::json!({ "type": "string" }),
        T::Row => {
            serde_json::json!({ "type": "string", "x-table": variable.table.clone().unwrap_or_default() })
        }
        T::Audio => serde_json::json!({ "type": "string", "x-asset": "audio" }),
        T::Place => {
            serde_json::json!({ "type": "object", "x-place": true, "properties": { "area": { "type": "string", "x-table": "area" }, "x": { "type": "number" }, "y": { "type": "number" } }, "required": ["area", "x", "y"] })
        }
        T::Condition => serde_json::json!({ "x-condition": true }),
    };
    crate::forms::value(ui, cx, &schema, value, path).is_some()
}

pub(super) fn short_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Object(o) if o.contains_key("area") => {
            format!("{} {}, {}", value.text("area"), value["x"], value["y"])
        }
        other => {
            let text = other.to_string();
            if text.chars().count() > 40 {
                format!("{}…", text.chars().take(40).collect::<String>())
            } else {
                text
            }
        }
    }
}

pub fn warp_destinations(module: &Value) -> Vec<(String, Pos<Tiles>)> {
    let mut out = Vec::new();
    let mut walk = |value: &Value| {
        if let Some(area) = value["area"].as_str()
            && let (Some(x), Some(y)) = (value["x"].as_f64(), value["y"].as_f64())
        {
            out.push((area.to_owned(), Pos::new(x as f32, y as f32)));
        }
    };
    fn visit(value: &Value, walk: &mut dyn FnMut(&Value)) {
        match value {
            Value::Object(map) => {
                if map.contains_key("area") && map.contains_key("x") && map.contains_key("y") {
                    walk(value);
                }
                for v in map.values() {
                    visit(v, walk);
                }
            }
            Value::Array(items) => {
                for item in items {
                    visit(item, walk);
                }
            }
            _ => {}
        }
    }
    visit(&module["scripts"], &mut walk);
    out
}

pub fn shared_values(ui: &mut Ui, cx: &mut FormCx, row: &mut Value, indices: &[usize]) -> bool {
    let kinds: Vec<String> = indices
        .iter()
        .map(|&i| row["modules"][i].kind().to_owned())
        .collect();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for kind in &kinds {
        *counts.entry(kind.clone()).or_default() += 1;
    }
    for (kind, count) in &counts {
        ui.label(format!("{count} × {}", crate::schema::title(kind)));
    }
    let same_blueprint = kinds.iter().all(|k| k == "blueprint")
        && indices
            .iter()
            .map(|&i| {
                row["modules"][i]["blueprint"]
                    .as_str()
                    .unwrap_or("")
                    .to_owned()
            })
            .collect::<HashSet<_>>()
            .len()
            == 1;
    if !same_blueprint {
        return false;
    }
    let Some(content) = cx.content else {
        return false;
    };
    let blueprint = row["modules"][indices[0]]["blueprint"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(&blueprint) else {
        return false;
    };
    let def = id.get(&content);
    ui.label(RichText::new("Shared values").strong());
    let mut changed = false;
    for (name, variable) in &def.variables {
        let values: Vec<Value> = indices
            .iter()
            .map(|&i| {
                row["modules"][i]["values"]
                    .get(name)
                    .cloned()
                    .unwrap_or(Value::Null)
            })
            .collect();
        let distinct: HashSet<String> = values.iter().map(Value::to_string).collect();
        ui.horizontal(|ui| {
            ui.label(name);
            if distinct.len() == 1 {
                let mut value = values[0].clone();
                if value.is_null() {
                    ui.label(RichText::new("default").weak());
                    if ui.small_button("Set all").clicked() {
                        let template = variable
                            .default
                            .as_ref()
                            .and_then(|d| crate::value::json(d).ok())
                            .unwrap_or_else(|| variable_template(variable));
                        for &i in indices {
                            row["modules"][i]["values"][name] = template.clone();
                        }
                        changed = true;
                    }
                } else if variable_field(ui, cx, variable, &mut value, &format!("/shared/{name}")) {
                    for &i in indices {
                        row["modules"][i]["values"][name] = value.clone();
                    }
                    changed = true;
                }
            } else {
                ui.label(RichText::new(format!("{} values", distinct.len())).weak());
            }
        });
    }
    changed
}

pub struct PartView {
    pub part: usize,
    pub module: Value,
    pub bounds: Option<Rect<Tiles>>,
    pub nested: Option<String>,
}

pub fn parts_in_place(frame: &Frame, place: &InPlace) -> Vec<PartView> {
    let content = frame.content;
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(&place.blueprint) else {
        return Vec::new();
    };
    let def = id.get(&content);
    let mut out = Vec::new();
    for (index, part) in def.parts.iter().enumerate() {
        let mut module = part.clone();
        let filled = fill_holes(&mut module, &place.values, &def.variables);
        let _ = filled;
        place_json(&mut module, place.at, place.flip);
        let nested = (module.is_module(AreaModuleKind::Blueprint))
            .then(|| module.text("blueprint").to_owned());
        let bounds = match &nested {
            Some(nested_key) => nested_bounds(content, nested_key, &module),
            None => shapes::bounds(&module, None),
        };
        out.push(PartView {
            part: index,
            module,
            bounds,
            nested,
        });
    }
    out
}

pub(super) fn nested_bounds(
    content: Content,
    blueprint: &str,
    placement: &Value,
) -> Option<Rect<Tiles>> {
    let at = shapes::pos_of(&placement["at"])?;
    let scenery = super::scene::parts_scenery(content, blueprint, at, &placement["values"]);
    let mut bounds: Option<Rect<Tiles>> = None;
    for s in scenery {
        let json = crate::value::json(&s).ok()?;
        if let Some(b) = shapes::bounds(&json, None) {
            bounds = Some(bounds.map_or(b, |known| shapes::rect_union(known, b)));
        }
    }
    bounds.or_else(|| {
        Some(Rect::new(
            at - game::core::math::Offset::new(0.5, 0.5),
            Size::splat(1.0),
        ))
    })
}

pub fn start_in_place(editor: &mut Editor, view_key: &str, area_key: &str, index: usize) {
    let Some(row) = editor.row_value("area", area_key) else {
        return;
    };
    let module = &row["modules"][index];
    if !module.is_module(AreaModuleKind::Blueprint) {
        return;
    }
    let Some(at) = shapes::pos_of(&module["at"]) else {
        return;
    };
    let flip = Flip::parse(module.text("flip")).unwrap_or(Flip::None);
    let blueprint = module.text("blueprint").to_owned();
    let view = editor.views.area.view_mut(view_key, area_key);
    view.in_place = vec![InPlace {
        blueprint: blueprint.clone(),
        module: index,
        at,
        flip,
        values: module["values"].clone(),
    }];
    view.tool = super::Tool::Select;
    editor.selection = Selection {
        table: "blueprint".to_owned(),
        keys: vec![blueprint],
        parts: Vec::new(),
    };
}

pub fn edit_in_place(editor: &mut Editor, view_key: &str, frame: &Frame, index: usize) {
    start_in_place(editor, view_key, &frame.area_key, index);
}

pub fn enter_nested(editor: &mut Editor, view_key: &str, part: &PartView) {
    let Some(nested) = &part.nested else {
        return;
    };
    let Some(at) = shapes::pos_of(&part.module["at"]) else {
        return;
    };
    let flip = Flip::parse(part.module.text("flip")).unwrap_or(Flip::None);
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let module = view.in_place.last().map_or(0, |p| p.module);
    view.in_place.push(InPlace {
        blueprint: nested.clone(),
        module,
        at,
        flip,
        values: part.module["values"].clone(),
    });
    editor.selection = Selection {
        table: "blueprint".to_owned(),
        keys: vec![nested.clone()],
        parts: Vec::new(),
    };
}

pub fn selected_part_indices(editor: &Editor, blueprint: &str) -> Vec<usize> {
    if editor.selection.table != "blueprint"
        || !editor.selection.keys.iter().any(|k| k == blueprint)
    {
        return Vec::new();
    }
    let mut out: Vec<usize> = editor
        .selection
        .parts
        .iter()
        .filter_map(|part| part.strip_prefix("/parts/")?.parse().ok())
        .collect();
    out.sort_unstable();
    out
}

pub fn select_input_in_place(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    place: &InPlace,
    modifiers: egui::Modifiers,
) {
    let response = frame.response;
    let parts = parts_in_place(frame, place);
    let Some(tile) = frame.pointer_tile.or_else(|| {
        response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p))
    }) else {
        return;
    };
    let hit = parts
        .iter()
        .filter(|part| part.bounds.is_some_and(|b| b.contains(tile)))
        .min_by(|a, b| {
            a.bounds
                .map_or(0.0, |b| b.area())
                .total_cmp(&b.bounds.map_or(0.0, |b| b.area()))
        })
        .map(|part| part.part);
    let selected = selected_part_indices(editor, &place.blueprint);
    if response.drag_started_by(egui::PointerButton::Primary) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        match hit {
            Some(index) => {
                if !selected.contains(&index) {
                    editor.selection = Selection {
                        table: "blueprint".to_owned(),
                        keys: vec![place.blueprint.clone()],
                        parts: vec![format!("/parts/{index}")],
                    };
                }
                editor
                    .views
                    .area
                    .views
                    .get_mut(view_key)
                    .expect("view")
                    .drag = Some(super::Drag::Move {
                    from: tile,
                    moved: false,
                });
            }
            None => view.drag = Some(super::Drag::Box { from: tile }),
        }
        return;
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some(super::Drag::Move { from, moved }) = &mut view.drag
            && (tile.x - from.x).abs() + (tile.y - from.y).abs() > 0.25
        {
            *moved = true;
        }
        return;
    }
    if response.drag_stopped() {
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
        match drag {
            super::Drag::Box { from } => {
                let rect = Rect::from_points([from, tile]);
                let mut picked: Vec<String> = if modifiers.shift {
                    editor.selection.parts.clone()
                } else {
                    Vec::new()
                };
                for part in &parts {
                    if part.bounds.is_some_and(|b| rect.contains_rect(&b)) {
                        let name = format!("/parts/{}", part.part);
                        if !picked.contains(&name) {
                            picked.push(name);
                        }
                    }
                }
                editor.selection = Selection {
                    table: "blueprint".to_owned(),
                    keys: vec![place.blueprint.clone()],
                    parts: picked,
                };
            }
            super::Drag::Move { from, moved: true } => {
                let (dx, dy) = if modifiers.alt {
                    (
                        ((tile.x - from.x) * 16.0).round() / 16.0,
                        ((tile.y - from.y) * 16.0).round() / 16.0,
                    )
                } else {
                    ((tile.x - from.x).round(), (tile.y - from.y).round())
                };
                if dx != 0.0 || dy != 0.0 {
                    let indices = selected_part_indices(editor, &place.blueprint);
                    move_parts_in_place(editor, frame, place, &indices, dx, dy);
                }
            }
            _ => {}
        }
        return;
    }
    if response.double_clicked()
        && let Some(index) = hit
        && let Some(part) = parts.iter().find(|p| p.part == index)
        && part.nested.is_some()
    {
        enter_nested(editor, view_key, part);
        return;
    }
    if response.clicked() {
        match hit {
            Some(index) => {
                let name = format!("/parts/{index}");
                let mut picked: Vec<String> = if modifiers.shift || modifiers.ctrl {
                    editor.selection.parts.clone()
                } else {
                    Vec::new()
                };
                if modifiers.ctrl && picked.contains(&name) {
                    picked.retain(|p| *p != name);
                } else if !picked.contains(&name) {
                    picked.push(name);
                }
                editor.selection = Selection {
                    table: "blueprint".to_owned(),
                    keys: vec![place.blueprint.clone()],
                    parts: picked,
                };
            }
            None => {
                if !modifiers.shift && !modifiers.ctrl {
                    editor.selection.parts.clear();
                }
            }
        }
    }
}

pub fn overlay_in_place(editor: &Editor, painter: &egui::Painter, frame: &Frame, place: &InPlace) {
    let canvas = frame.canvas;
    let parts = parts_in_place(frame, place);
    let extent = parts
        .iter()
        .filter_map(|part| part.bounds)
        .reduce(|a, b| a.union(&b))
        .or_else(|| frame.module_bounds(place.module));
    if let Some(bounds) = extent {
        let shade = egui::Color32::from_rgba_unmultiplied(0, 0, 0, 150);
        let lit = canvas.rect(bounds);
        let full = canvas.rect;
        for dark in [
            egui::Rect::from_min_max(full.min, egui::pos2(full.max.x, lit.min.y)),
            egui::Rect::from_min_max(egui::pos2(full.min.x, lit.max.y), full.max),
            egui::Rect::from_min_max(
                egui::pos2(full.min.x, lit.min.y),
                egui::pos2(lit.min.x, lit.max.y),
            ),
            egui::Rect::from_min_max(
                egui::pos2(lit.max.x, lit.min.y),
                egui::pos2(full.max.x, lit.max.y),
            ),
        ] {
            painter.rect_filled(dark, 0.0, shade);
        }
    }
    let selected = selected_part_indices(editor, &place.blueprint);
    for part in parts {
        let Some(bounds) = part.bounds else {
            continue;
        };
        let is_selected = selected.contains(&part.part);
        let color = super::overlays::module_color(part.module.module_kind());
        let width = if is_selected { 2.0 } else { 1.0 };
        painter.rect_stroke(
            canvas.rect(bounds),
            0.0,
            EStroke::new(width, color),
            egui::StrokeKind::Inside,
        );
        let text = match &part.nested {
            Some(nested) => format!("{nested} (double-click to open)"),
            None => shapes::label(&part.module),
        };
        painter.text(
            canvas.rect(bounds).min + Vec2::new(2.0, 1.0),
            egui::Align2::LEFT_TOP,
            text,
            egui::FontId::proportional(11.0),
            color,
        );
    }
}

pub fn move_parts_in_place(
    editor: &mut Editor,
    frame: &Frame,
    place: &InPlace,
    indices: &[usize],
    dx: f32,
    dy: f32,
) {
    let Some(mut row) = editor.row_value("blueprint", &place.blueprint) else {
        return;
    };
    let (bx, by) = (
        if place.flip.horizontal() { -dx } else { dx },
        if place.flip.vertical() { -dy } else { dy },
    );
    for &index in indices {
        if let Some(part) = row["parts"].get_mut(index) {
            shapes::shift(part, bx, by);
        }
    }
    let count = placement_count(frame.content, &place.blueprint);
    let mut edit = Edit::new(format!(
        "Move {} parts of {} · {count}",
        indices.len(),
        place.blueprint
    ));
    edit.write_json(row_file("blueprint", &place.blueprint), &row);
    editor.apply(edit);
}

pub fn delete_parts_in_place(editor: &mut Editor, frame: &Frame, place: &InPlace) {
    let indices = selected_part_indices(editor, &place.blueprint);
    if indices.is_empty() {
        return;
    }
    let Some(mut row) = editor.row_value("blueprint", &place.blueprint) else {
        return;
    };
    for index in indices.iter().rev() {
        row["parts"].as_array_mut().map(|p| p.remove(*index));
    }
    let count = placement_count(frame.content, &place.blueprint);
    let mut edit = Edit::new(format!(
        "Remove {} parts of {} · {count}",
        indices.len(),
        place.blueprint
    ));
    edit.write_json(row_file("blueprint", &place.blueprint), &row);
    if editor.apply(edit) {
        editor.selection.parts.clear();
    }
}

pub fn unpacked(content: Content, module: &Value) -> Vec<Value> {
    let Some(key) = module["blueprint"].as_str() else {
        return Vec::new();
    };
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(key) else {
        return Vec::new();
    };
    let def = id.get(&content);
    let Some(at) = shapes::pos_of(&module["at"]) else {
        return Vec::new();
    };
    let flip = Flip::parse(module.text("flip")).unwrap_or(Flip::None);
    def.parts
        .iter()
        .map(|part| {
            let mut json = part.clone();
            fill_holes(&mut json, &module["values"], &def.variables);
            place_json(&mut json, at, flip);
            json
        })
        .collect()
}

pub fn unpack(editor: &mut Editor, frame: &Frame, index: usize) {
    let module = &frame.modules[index];
    let key = module["blueprint"]
        .as_str()
        .unwrap_or("the blueprint")
        .to_owned();
    let unpacked = unpacked(frame.content, module);
    if unpacked.is_empty() {
        return;
    }
    let mut modules = frame.modules.clone();
    modules.remove(index);
    let count = unpacked.len();
    for (offset, json) in unpacked.into_iter().enumerate() {
        modules.insert(index + offset, json);
    }
    if modules::write_modules(
        editor,
        &frame.area_key,
        modules,
        &format!("Unpack {key} in {}", frame.area_key),
    ) {
        editor.selection.parts = (index..index + count)
            .map(|i| format!("/modules/{i}"))
            .collect();
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReplaceScope {
    Here,
    ThisArea,
    Everywhere,
}

pub fn replace_dialog(editor: &mut Editor, frame: &Frame, index: usize) {
    editor.dialogs.push(Dialog::PickRow(PickRowDialog {
        title: format!(
            "Replace {} with",
            frame.modules[index]["blueprint"]
                .as_str()
                .unwrap_or("the blueprint")
        ),
        table: "blueprint".to_owned(),
        search: String::new(),
        picked: None,
        options: Vec::new(),
        then: PickRowThen::ReplaceBlueprint {
            area: frame.area_key.clone(),
            index,
            scope: ReplaceScope::Here,
        },
    }));
}

pub fn replace_with(
    editor: &mut Editor,
    area_key: &str,
    index: usize,
    replacement: &str,
    scope: ReplaceScope,
) {
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let Some(row) = editor.row_value("area", area_key) else {
        return;
    };
    let old = row["modules"][index]["blueprint"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let Some(new_id) = content.by_key::<area::blueprint::BlueprintDef>(replacement) else {
        return;
    };
    let new_def = new_id.get(&content);
    let areas: Vec<String> = match scope {
        ReplaceScope::Here | ReplaceScope::ThisArea => vec![area_key.to_owned()],
        ReplaceScope::Everywhere => content.table::<area::AreaDef>().keys().to_vec(),
    };
    let mut edit = Edit::new(format!("Replace {old} with {replacement}"));
    let mut dropped = 0;
    let mut swapped = 0;
    for area in areas {
        let Some(mut row) = editor.row_value("area", &area) else {
            continue;
        };
        let mut changed = false;
        for (i, module) in row["modules"]
            .as_array_mut()
            .into_iter()
            .flatten()
            .enumerate()
        {
            if !module.is_module(AreaModuleKind::Blueprint)
                || module["blueprint"].as_str() != Some(old.as_str())
            {
                continue;
            }
            if scope == ReplaceScope::Here && (area != area_key || i != index) {
                continue;
            }
            module["blueprint"] = Value::String(replacement.to_owned());
            if let Some(values) = module["values"].as_object_mut() {
                let keys: Vec<String> = values.keys().cloned().collect();
                for key in keys {
                    let keep = new_def.variables.get(&key).is_some_and(|v| {
                        let kind = value_kind(&values[&key]);
                        kind == v.ty
                            || (kind == VariableType::Integer && v.ty == VariableType::Number)
                            || matches!(
                                v.ty,
                                VariableType::Name | VariableType::Row | VariableType::Audio
                            ) && values[&key].is_string()
                    });
                    if !keep {
                        values.remove(&key);
                        dropped += 1;
                    }
                }
            }
            swapped += 1;
            changed = true;
        }
        if changed {
            edit.write_json(row_file("area", &area), &row);
        }
    }
    if editor.apply(edit) {
        editor.toast(format!(
            "Replaced {swapped} placements; {dropped} values didn't carry"
        ));
    }
}

pub(super) fn placement_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &Value,
    extras: &mut Vec<Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let Some(key) = module["blueprint"].as_str().map(str::to_owned) else {
        return;
    };
    ui.add_space(4.0);
    if let Some(content) = cx.content {
        widgets::hint(ui, &placement_count(content, &key));
    }
    ui.horizontal_wrapped(|ui| {
        if ui.button("▣ Edit blueprint").clicked() {
            extras.push(Extra::OpenBlueprint(key.clone()));
        }
        if ui.button("Unpack into scenery").clicked() {
            deferred.push(super::Deferred::Unpack(index));
        }
        if ui.button("Replace with…").clicked() {
            deferred.push(super::Deferred::Replace(index));
        }
    });
    widgets::key_hint_text(ui, "Enter", "edits the blueprint in place");
}
