use std::collections::{BTreeMap, HashMap, HashSet};

use egui::{Color32, Pos2, Rect as ERect, RichText, Stroke as EStroke, Ui, Vec2};
use game::core::content::Content;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, TilePos, TileSize, Tiles};
use game::systems::area::{self, Flip};
use serde_json::Value;

use super::{Frame, InPlace, shapes, tools};
use crate::app::{Dialog, Editor, PickRowDialog, PickRowThen};
use crate::forms::FormCx;
use crate::project::{Edit, Selection, row_file};
use crate::tabs::Tab;

/// The union of every flattened part of each placement, by the placement's module index.
pub fn placement_bounds(content: Content, area_id: area::Id) -> HashMap<usize, Rect<Tiles>> {
    let mut out: HashMap<usize, Rect<Tiles>> = HashMap::new();
    for placed in area::placed(&content, area_id) {
        if placed.chain.is_empty() {
            continue;
        }
        let Ok(json) = serde_json::to_value(&placed.module) else {
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

/// `14 placements in 6 areas, plus 3 inside other blueprints`.
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
                if direct == 1 { "" } else { "s" }
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

/// A placement's values: each variable with its type's picker, defaults muted until set.
pub fn placement_card(
    ui: &mut Ui,
    cx: &mut FormCx,
    content: Option<Content>,
    module: &mut Value,
    path: &str,
    _extras: &mut Vec<Extra>,
) -> bool {
    if module["type"] != "blueprint" {
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
            let own = module["values"].get(name).cloned();
            let default = variable
                .default
                .as_ref()
                .and_then(|d| serde_json::to_value(d).ok());
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

/// One variable's value edited with its type's picker.
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

fn short_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Object(o) if o.contains_key("area") => format!(
            "{} {}, {}",
            value["area"].as_str().unwrap_or(""),
            value["x"],
            value["y"]
        ),
        other => {
            let text = other.to_string();
            if text.len() > 40 {
                format!("{}…", &text[..40])
            } else {
                text
            }
        }
    }
}

/// The places an object's own scripts warp to, read from its values and inline nodes.
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

/// Several selected modules: placements of one blueprint edit their values together; otherwise
/// the counts by type.
pub fn shared_values(ui: &mut Ui, cx: &mut FormCx, row: &mut Value, indices: &[usize]) -> bool {
    let kinds: Vec<String> = indices
        .iter()
        .map(|&i| row["modules"][i]["type"].as_str().unwrap_or("").to_owned())
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
                            .and_then(|d| serde_json::to_value(d).ok())
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

/// The parts of a blueprint opened in place, mapped into the area so they draw and hit like modules.
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
        let nested = (module["type"] == "blueprint")
            .then(|| module["blueprint"].as_str().unwrap_or("").to_owned());
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

fn nested_bounds(content: Content, blueprint: &str, placement: &Value) -> Option<Rect<Tiles>> {
    let at = shapes::pos_of(&placement["at"])?;
    let scenery = super::scene::parts_scenery(content, blueprint, at, &placement["values"]);
    let mut bounds: Option<Rect<Tiles>> = None;
    for s in scenery {
        let json = serde_json::to_value(&s).ok()?;
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

/// Replaces `{ "var": name }` holes with the placement's value or the variable's default.
pub fn fill_holes(
    value: &mut Value,
    values: &Value,
    variables: &BTreeMap<String, game::systems::script::Variable>,
) -> usize {
    let mut filled = 0;
    match value {
        Value::Object(map) => {
            if map.len() == 1
                && let Some(Value::String(name)) = map.get("var")
            {
                let name = name.clone();
                let replacement = values.get(&name).cloned().or_else(|| {
                    variables
                        .get(&name)
                        .and_then(|v| v.default.as_ref())
                        .and_then(|d| serde_json::to_value(d).ok())
                });
                if let Some(replacement) = replacement {
                    *value = replacement;
                    filled += 1;
                }
                return filled;
            }
            for v in map.values_mut() {
                filled += fill_holes(v, values, variables);
            }
        }
        Value::Array(items) => {
            for item in items {
                filled += fill_holes(item, values, variables);
            }
        }
        _ => {}
    }
    filled
}

/// Moves a part from blueprint space to the area, as the loader does: mirrored about the origin,
/// then offset.
pub fn place_json(module: &mut Value, at: Pos<Tiles>, flip: Flip) {
    let point = |x: f32, y: f32| {
        let p = flip.apply(Pos::new(x, y));
        (at.x + p.x, at.y + p.y)
    };
    let rect = |r: &Value| -> Value {
        let (Some(x), Some(y), Some(w), Some(h)) = (
            r["x"].as_f64(),
            r["y"].as_f64(),
            r["w"].as_f64(),
            r["h"].as_f64(),
        ) else {
            return r.clone();
        };
        let placed = area::blueprint::place_rect(
            Rect::new(Pos::new(x as f32, y as f32), Size::new(w as f32, h as f32)),
            at,
            flip,
        );
        let mut out = r.clone();
        out["x"] = shapes::round(placed.origin.x);
        out["y"] = shapes::round(placed.origin.y);
        out
    };
    match module["type"].as_str() {
        Some("object") => {
            if module["shape"]["type"] == "point" {
                let (x, y) = point(
                    module["shape"]["x"].as_f64().unwrap_or(0.0) as f32,
                    module["shape"]["y"].as_f64().unwrap_or(0.0) as f32,
                );
                module["shape"]["x"] = shapes::round(x);
                module["shape"]["y"] = shapes::round(y);
            } else {
                module["shape"] = rect(&module["shape"]);
            }
        }
        Some("safe_zone") => module["rect"] = rect(&module["rect"]),
        Some("soundscape") => module["shape"] = rect(&module["shape"]),
        Some("population") => {
            if module["roams"].is_object() {
                module["roams"] = rect(&module["roams"]);
            }
        }
        Some("scenery") | Some("resident") | Some("blueprint") => {
            let (x, y) = point(
                module["at"]["x"].as_f64().unwrap_or(0.0) as f32,
                module["at"]["y"].as_f64().unwrap_or(0.0) as f32,
            );
            module["at"]["x"] = shapes::round(x);
            module["at"]["y"] = shapes::round(y);
            if module["type"] != "resident" {
                let own = Flip::parse(module["flip"].as_str().unwrap_or(""))
                    .unwrap_or(Flip::None)
                    .compose(flip);
                if own.is_none() {
                    module.as_object_mut().map(|m| m.remove("flip"));
                } else {
                    module["flip"] = Value::String(own.csv().to_owned());
                }
            }
        }
        _ => {}
    }
}

pub fn start_in_place(editor: &mut Editor, view_key: &str, area_key: &str, index: usize) {
    let Some(row) = editor.row_value("area", area_key) else {
        return;
    };
    let module = &row["modules"][index];
    if module["type"] != "blueprint" {
        return;
    }
    let Some(at) = shapes::pos_of(&module["at"]) else {
        return;
    };
    let flip = Flip::parse(module["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
    let blueprint = module["blueprint"].as_str().unwrap_or("").to_owned();
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

/// Opens a nested placement one level deeper, keeping the breadcrumb.
pub fn enter_nested(editor: &mut Editor, view_key: &str, part: &PartView) {
    let Some(nested) = &part.nested else {
        return;
    };
    let Some(at) = shapes::pos_of(&part.module["at"]) else {
        return;
    };
    let flip = Flip::parse(part.module["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
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

/// Pointer input while a blueprint is open in place: parts select, drag and open deeper.
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
    let selected = selected_part_indices(editor, &place.blueprint);
    for part in parts_in_place(frame, place) {
        let Some(bounds) = part.bounds else {
            continue;
        };
        let kind = part.module["type"].as_str().unwrap_or("");
        let is_selected = selected.contains(&part.part);
        let color = super::module_color(kind);
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

/// Moves parts in blueprint space by the area-space delta, mirrored back through the placement's flip.
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

/// The inspector for selected parts of a blueprint: the part's card with ◇ on hole-able fields.
pub enum HoleOp {
    Make {
        part: usize,
        field: String,
        kind: String,
    },
    Use {
        part: usize,
        field: String,
        name: String,
    },
    Fix {
        part: usize,
        field: String,
        name: String,
    },
}

pub fn apply_hole_op(row: &mut Value, op: HoleOp, blueprint: &str) {
    match op {
        HoleOp::Make { part, field, kind } => {
            let taken: HashSet<String> = row["variables"]
                .as_object()
                .map(|v| v.keys().cloned().collect())
                .unwrap_or_default();
            let base = field.rsplit('/').next().unwrap_or("value").to_owned();
            let name = suffixed_from(&base, &taken);
            let (ty, table) = match kind.as_str() {
                "row" => ("row", row_table_of(&row["parts"][part], &field)),
                other => (other, None),
            };
            let mut variable = serde_json::json!({ "type": ty });
            if let Some(table) = table {
                variable["table"] = Value::String(table);
            }
            if !row["variables"].is_object() {
                row["variables"] = Value::Object(Default::default());
            }
            row["variables"][&name] = variable;
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = serde_json::json!({ "var": name });
            }
            let _ = blueprint;
        }
        HoleOp::Use { part, field, name } => {
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = serde_json::json!({ "var": name });
            }
        }
        HoleOp::Fix { part, field, name } => {
            let default = row["variables"][&name]["default"].clone();
            let fixed = if default.is_null() {
                fixed_template(&row["variables"][&name])
            } else {
                default
            };
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = fixed;
            }
            let mut still = Vec::new();
            for p in row["parts"].as_array().into_iter().flatten() {
                area::blueprint::holes(p, &mut still);
            }
            for m in row["modules"].as_array().into_iter().flatten() {
                area::blueprint::holes(m, &mut still);
            }
            if !still.contains(&name) {
                row["variables"].as_object_mut().map(|v| v.remove(&name));
            }
        }
    }
}

fn fixed_template(variable: &Value) -> Value {
    match variable["type"].as_str() {
        Some("integer") => Value::from(0),
        Some("number") => Value::from(0.0),
        Some("boolean") => Value::Bool(false),
        Some("place") => serde_json::json!({ "area": "", "x": 0.0, "y": 0.0 }),
        Some("condition") => crate::condition::empty_object(),
        _ => Value::String(String::new()),
    }
}

fn row_table_of(part: &Value, field: &str) -> Option<String> {
    let last = field.rsplit('/').next()?;
    match (part["type"].as_str()?, last) {
        ("population" | "resident", "npc") => Some("npc".to_owned()),
        (_, "script") => Some("script".to_owned()),
        (_, "item") => Some("item".to_owned()),
        (_, "quest") => Some("quest".to_owned()),
        (_, "shop") => Some("shop".to_owned()),
        (_, "memory") => Some("memory".to_owned()),
        (_, "notification") => Some("notification".to_owned()),
        _ => None,
    }
}

pub fn suffixed(name: &str, taken: &HashSet<String>) -> String {
    suffixed_from(name, taken)
}

/// `name`, or the lowest `name_2`, `name_3` not taken.
pub fn suffixed_from(name: &str, taken: &HashSet<String>) -> String {
    if !taken.iter().any(|t| t.eq_ignore_ascii_case(name)) {
        return name.to_owned();
    }
    let base = match name.rfind('_') {
        Some(cut) if name[cut + 1..].chars().all(|c| c.is_ascii_digit()) && cut > 0 => &name[..cut],
        _ => name,
    };
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|candidate| !taken.iter().any(|t| t.eq_ignore_ascii_case(candidate)))
        .expect("a free name")
}

/// Every hole in a part as (pointer, variable).
pub fn holes_in(value: &Value, pointer: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    match value {
        Value::Object(map) => {
            if map.len() == 1
                && let Some(Value::String(name)) = map.get("var")
            {
                out.push((pointer.to_owned(), name.clone()));
                return out;
            }
            for (key, v) in map {
                out.extend(holes_in(
                    v,
                    &format!("{pointer}/{}", game::core::content::locate::escape(key)),
                ));
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                out.extend(holes_in(item, &format!("{pointer}/{index}")));
            }
        }
        _ => {}
    }
    out
}

pub fn strip_holes(value: &mut Value) {
    match value {
        Value::Object(map) => {
            if map.len() == 1 && map.get("var").is_some_and(Value::is_string) {
                *value = Value::String(format!("◇ {}", map["var"].as_str().unwrap_or("")));
                return;
            }
            for v in map.values_mut() {
                strip_holes(v);
            }
        }
        Value::Array(items) => {
            for item in items {
                strip_holes(item);
            }
        }
        _ => {}
    }
}

pub fn merge_keeping_holes(part: &mut Value, plain: &Value) {
    match (part, plain) {
        (Value::Object(map), Value::Object(edited)) => {
            if map.len() == 1 && map.get("var").is_some_and(Value::is_string) {
                return;
            }
            let keys: Vec<String> = map.keys().cloned().collect();
            for key in keys {
                match edited.get(&key) {
                    Some(value) => merge_keeping_holes(&mut map[&key], value),
                    None => {
                        map.remove(&key);
                    }
                }
            }
            for (key, value) in edited {
                if !map.contains_key(key) {
                    map.insert(key.clone(), value.clone());
                }
            }
        }
        (Value::Array(items), Value::Array(edited)) if items.len() == edited.len() => {
            for (item, value) in items.iter_mut().zip(edited) {
                merge_keeping_holes(item, value);
            }
        }
        (part, plain) => {
            if let Value::String(text) = plain
                && text.starts_with("◇ ")
            {
                return;
            }
            *part = plain.clone();
        }
    }
}

/// Fields of a part a variable may fill, with the variable type each takes.
pub fn holeable_fields(part: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let kind = part["type"].as_str().unwrap_or("");
    match kind {
        "object" => {
            out.push(("/name".to_owned(), "name".to_owned()));
            out.push(("/label".to_owned(), "text".to_owned()));
            out.push(("/shown".to_owned(), "condition".to_owned()));
            for (index, script) in part["scripts"].as_array().into_iter().flatten().enumerate() {
                for (name, value) in script["values"].as_object().into_iter().flatten() {
                    out.push((format!("/scripts/{index}/values/{name}"), value_kind(value)));
                }
            }
        }
        "soundscape" => {
            out.push(("/emit".to_owned(), "number".to_owned()));
            for (index, channel) in part["channels"]
                .as_array()
                .into_iter()
                .flatten()
                .enumerate()
            {
                let _ = channel;
                out.push((format!("/channels/{index}/channel"), "integer".to_owned()));
                out.push((format!("/channels/{index}/file"), "audio".to_owned()));
                out.push((format!("/channels/{index}/volume"), "number".to_owned()));
                out.push((format!("/channels/{index}/pan"), "number".to_owned()));
            }
        }
        "population" => {
            out.push(("/npc".to_owned(), "row".to_owned()));
            out.push(("/count".to_owned(), "integer".to_owned()));
        }
        "resident" => {
            out.push(("/npc".to_owned(), "row".to_owned()));
            out.push(("/shown".to_owned(), "condition".to_owned()));
        }
        "blueprint" => {
            for (name, value) in part["values"].as_object().into_iter().flatten() {
                out.push((format!("/values/{name}"), value_kind(value)));
            }
        }
        _ => {}
    }
    out.retain(|(pointer, _)| {
        part.pointer(pointer)
            .is_some_and(|v| !(v.is_object() && v.get("var").is_some()))
    });
    out
}

fn value_kind(value: &Value) -> String {
    match value {
        Value::Number(n) if n.is_i64() => "integer",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        Value::Object(o) if o.contains_key("area") => "place",
        Value::Object(_) => "condition",
        _ => "text",
    }
    .to_owned()
}

/// The stamp tool's panel: blueprints used here first, then all, and the stroke's settings.
/// The bottom BLUEPRINTS: search, this area's blueprints or every one, each a thumbnail with how
/// often it is placed here. Picking one arms the stamp tool.
pub fn stamp_panel(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    area_id: area::Id,
) {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for placement in area::placements(&content, area_id) {
        if placement.chain.len() <= 1 {
            *counts
                .entry(placement.blueprint.key(&content).to_owned())
                .or_default() += 1;
        }
    }
    let all: Vec<String> = content
        .table::<area::blueprint::BlueprintDef>()
        .keys()
        .to_vec();
    let (everywhere, needle) = {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.scope(|ui| {
                ui.set_width(220.0);
                crate::ui::widgets::search_box(
                    ui,
                    &mut view.blueprint_search,
                    "Search blueprints",
                    None,
                );
            });
            ui.add_space(8.0);
            for (value, label) in [
                (false, "in this area".to_owned()),
                (true, format!("everywhere · {}", all.len())),
            ] {
                let on = view.blueprint_everywhere == value;
                if crate::ui::widgets::chip_coloured(
                    ui,
                    &label,
                    if on {
                        crate::ui::theme::ACCENT_SOFT
                    } else {
                        crate::ui::theme::RAISED
                    },
                    if on {
                        crate::ui::theme::SELECTION
                    } else {
                        crate::ui::theme::TEXT
                    },
                )
                .clicked()
                {
                    view.blueprint_everywhere = value;
                }
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(crate::ui::theme::muted("one blueprint at a time").size(12.0));
            });
        });
        (
            view.blueprint_everywhere,
            view.blueprint_search.to_lowercase(),
        )
    };
    let mut listed: Vec<(String, usize)> = all
        .iter()
        .filter(|k| needle.is_empty() || k.to_lowercase().contains(&needle))
        .map(|k| (k.clone(), counts.get(k).copied().unwrap_or(0)))
        .filter(|(_, count)| everywhere || *count > 0)
        .collect();
    listed.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    ui.add_space(6.0);
    let card = Vec2::new(72.0, 80.0);
    let gap = 8.0;
    let fit = ((ui.available_width() + gap) / (card.x + gap))
        .floor()
        .max(1.0) as usize;
    let shown = if listed.len() > fit {
        fit - 1
    } else {
        listed.len()
    };
    let mut picked: Option<String> = None;
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = gap;
        for (key, count) in listed.iter().take(shown) {
            let selected = editor.views.area.views[view_key].stamp.as_deref() == Some(key);
            if blueprint_card(editor, ui, content, key, *count, selected, card).clicked() {
                picked = Some(key.clone());
            }
        }
        if listed.len() > shown {
            let (rect, _) = ui.allocate_exact_size(card, egui::Sense::hover());
            ui.painter().rect_stroke(
                rect,
                4.0,
                EStroke::new(1.0, crate::ui::theme::BORDER),
                egui::StrokeKind::Inside,
            );
            let text = format!(
                "{} more{}",
                listed.len() - shown,
                if everywhere { "" } else { " here" }
            );
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                text,
                egui::FontId::proportional(12.0),
                crate::ui::theme::MUTED,
            );
        }
    });
    if let Some(key) = picked {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        view.tool = super::Tool::Stamp;
        view.stamp = Some(key.clone());
        let stored = editor
            .settings
            .stamps
            .get(&key)
            .cloned()
            .unwrap_or_default();
        view.stamp_values = Value::Object(stored.values.into_iter().collect());
    }
}

/// One blueprint as a card: its scenery drawn from the tilesets, and how many copies sit here.
fn blueprint_card(
    editor: &mut Editor,
    ui: &mut Ui,
    content: Content,
    key: &str,
    count: usize,
    selected: bool,
    card: Vec2,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(card, egui::Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, crate::ui::theme::RAISED);
    let stroke = if selected {
        EStroke::new(2.0, crate::ui::theme::ACCENT)
    } else {
        EStroke::new(1.0, crate::ui::theme::BORDER)
    };
    painter.rect_stroke(rect, 4.0, stroke, egui::StrokeKind::Inside);
    let art = ERect::from_min_size(
        rect.min + Vec2::new(6.0, 6.0),
        Vec2::new(card.x - 12.0, card.x - 12.0),
    );
    draw_blueprint_art(editor, ui, content, key, art);
    if count > 0 {
        painter.text(
            Pos2::new(rect.center().x, rect.max.y - 10.0),
            egui::Align2::CENTER_CENTER,
            format!("×{count}"),
            egui::FontId::monospace(11.0),
            crate::ui::theme::MUTED,
        );
    }
    response.on_hover_text(key)
}

/// The blueprint's scenery fitted into `into`, tile by tile from the tileset images.
pub fn draw_blueprint_art(
    editor: &mut Editor,
    ui: &mut Ui,
    content: Content,
    key: &str,
    into: ERect,
) {
    let sceneries = super::scene::parts_scenery(
        content,
        key,
        Pos::new(0.0, 0.0),
        &Value::Object(Default::default()),
    );
    if sceneries.is_empty() {
        ui.painter_at(into).text(
            into.center(),
            egui::Align2::CENTER_CENTER,
            "no art",
            egui::FontId::proportional(11.0),
            crate::ui::theme::FAINT,
        );
        return;
    }
    let mut min = Pos::<Tiles>::new(f32::MAX, f32::MAX);
    let mut max = Pos::<Tiles>::new(f32::MIN, f32::MIN);
    for scenery in &sceneries {
        let height = scenery.tiles.len() as f32;
        let width = scenery.tiles.iter().map(Vec::len).max().unwrap_or(0) as f32;
        min = Pos::new(min.x.min(scenery.at.x), min.y.min(scenery.at.y));
        max = Pos::new(
            max.x.max(scenery.at.x + width),
            max.y.max(scenery.at.y + height),
        );
    }
    let span = (max.x - min.x).max(max.y - min.y).max(1.0);
    let scale = (into.width() / span).min(into.height() / span);
    let origin =
        into.center() - Vec2::new((max.x - min.x) * scale / 2.0, (max.y - min.y) * scale / 2.0);
    let ctx = ui.ctx().clone();
    let painter = ui.painter_at(into);
    for scenery in &sceneries {
        let def = scenery.tileset.get(&content);
        let image = def.image.as_str().to_owned();
        let Some(project) = editor.project.as_ref() else {
            return;
        };
        let Some(thumb) = editor.form.thumbnails.image(&ctx, &project.files, &image) else {
            continue;
        };
        let grid = def.grid(thumb.size[0] as u32, thumb.size[1] as u32);
        for (row, tiles) in scenery.tiles.iter().enumerate() {
            for (column, tile) in tiles.iter().enumerate() {
                let Some(tile) = tile else {
                    continue;
                };
                let region = grid.region(tile.tile);
                let mut uv = crate::thumbs::uv(
                    thumb.size,
                    region.min().x,
                    region.min().y,
                    region.size.width,
                    region.size.height,
                );
                let flip = Flip::of(
                    tile.flip.horizontal() != scenery.flip.horizontal(),
                    tile.flip.vertical() != scenery.flip.vertical(),
                );
                if flip.horizontal() {
                    uv = ERect::from_min_max(
                        Pos2::new(uv.max.x, uv.min.y),
                        Pos2::new(uv.min.x, uv.max.y),
                    );
                }
                if flip.vertical() {
                    uv = ERect::from_min_max(
                        Pos2::new(uv.min.x, uv.max.y),
                        Pos2::new(uv.max.x, uv.min.y),
                    );
                }
                let x = scenery.at.x + column as f32 - min.x;
                let y = scenery.at.y + row as f32 - min.y;
                let cell = ERect::from_min_size(
                    origin + Vec2::new(x * scale, y * scale),
                    Vec2::splat(scale + 0.5),
                );
                painter.image(thumb.texture.id(), cell, uv, Color32::WHITE);
            }
        }
    }
}

pub fn flip_stamp(editor: &mut Editor, view_key: &str, horizontal: bool) {
    let Some(stamp) = editor.views.area.views[view_key].stamp.clone() else {
        return;
    };
    let settings = editor.settings.stamps.entry(stamp).or_default();
    if horizontal {
        settings.flip_x = !settings.flip_x;
    } else {
        settings.flip_y = !settings.flip_y;
    }
    editor.save_settings();
}

fn stamp_flip(editor: &Editor, stamp: &str) -> Flip {
    let settings = editor
        .settings
        .stamps
        .get(stamp)
        .cloned()
        .unwrap_or_default();
    Flip::of(settings.flip_x, settings.flip_y)
}

/// The footprint of one copy: its flattened scenery and shapes at the origin.
pub fn stamp_footprint(
    editor: &Editor,
    content: Content,
    stamp: &str,
    values: &Value,
) -> Size<Tiles> {
    let flip = stamp_flip(editor, stamp);
    let placement = serde_json::json!({ "type": "blueprint", "blueprint": stamp, "at": { "x": 0.0, "y": 0.0 }, "flip": flip.csv(), "values": values });
    let Ok(module) =
        game::core::content::with_content(game::core::content::ContentScope::of(&content), || {
            serde_json::from_value::<area::AreaModule>(placement)
        })
        .0
    else {
        return Size::splat(1.0);
    };
    let mut errors = Vec::new();
    let flattening = area::blueprint::flatten(&content, &[module], &mut errors);
    let mut bounds: Option<Rect<Tiles>> = None;
    for placed in flattening.modules {
        if let Ok(json) = serde_json::to_value(&placed.module)
            && let Some(b) = shapes::bounds(&json, None)
        {
            bounds = Some(bounds.map_or(b, |known| shapes::rect_union(known, b)));
        }
    }
    bounds.map_or(Size::splat(1.0), |b| {
        Size::new(b.size.width.max(1.0), b.size.height.max(1.0))
    })
}

pub fn stamp_input(editor: &mut Editor, ui: &mut Ui, view_key: &str, frame: &Frame) {
    let response = frame.response;
    let Some(stamp) = editor.views.area.views[view_key].stamp.clone() else {
        return;
    };
    let alt = ui.input(|i| i.modifiers.alt);
    let Some(tile) = frame.pointer_tile.or_else(|| {
        response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p))
    }) else {
        return;
    };
    let at = if alt {
        tools::snap_sixteenth(tile)
    } else {
        tile.snap()
    };
    let values = editor.views.area.views[view_key].stamp_values.clone();
    let footprint = stamp_footprint(editor, frame.content, &stamp, &values);
    let spacing = editor
        .settings
        .stamps
        .get(&stamp)
        .and_then(|s| s.spacing)
        .map(|s| s as f32);
    let step = spacing.unwrap_or(footprint.width.max(footprint.height).max(1.0));
    if response.drag_started_by(egui::PointerButton::Primary) || response.clicked() {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        view.drag = Some(super::Drag::Stamp {
            placed: vec![at],
            last: at,
        });
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some(super::Drag::Stamp { placed, last }) = &mut view.drag
            && last.distance(at).0 >= step
        {
            placed.push(at);
            *last = at;
        }
    }
    if response.drag_stopped_by(egui::PointerButton::Primary) || response.clicked() {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        let Some(super::Drag::Stamp { placed, .. }) = view.drag.take() else {
            return;
        };
        place_stamps(editor, frame, &stamp, &values, placed);
    }
}

/// Writes a stroke of placements as one step; copies the folder refuses are retried one by one so
/// the rest land, crossed out and counted.
fn place_stamps(
    editor: &mut Editor,
    frame: &Frame,
    stamp: &str,
    values: &Value,
    placed: Vec<Pos<Tiles>>,
) {
    let content = frame.content;
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(stamp) else {
        return;
    };
    let def = id.get(&content);
    let flip = stamp_flip(editor, stamp);
    let mut taken: HashSet<String> = object_names(content, frame.area_id);
    let mut modules = Vec::new();
    for at in &placed {
        let mut own = values.clone();
        for (name, variable) in &def.variables {
            if variable.ty == game::core::script::VariableType::Name {
                let base = own
                    .get(name)
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                    .or_else(|| {
                        variable
                            .default
                            .as_ref()
                            .and_then(|d| serde_json::to_value(d).ok())
                            .and_then(|v| v.as_str().map(str::to_owned))
                    })
                    .unwrap_or_else(|| name.clone());
                let fresh = suffixed_from(&base, &taken);
                taken.insert(fresh.clone());
                own[name] = Value::String(fresh);
            }
        }
        let mut module = serde_json::json!({ "type": "blueprint", "blueprint": stamp, "at": { "x": at.x, "y": at.y } });
        if !flip.is_none() {
            module["flip"] = Value::String(flip.csv().to_owned());
        }
        if own.as_object().is_some_and(|o| !o.is_empty()) {
            module["values"] = own;
        }
        modules.push(module);
    }
    let count = modules.len();
    let label = if count == 1 {
        format!("Place {stamp} in {}", frame.area_key)
    } else {
        format!("Place {count} × {stamp} in {}", frame.area_key)
    };
    let Some(row) = editor.row_value("area", &frame.area_key) else {
        return;
    };
    let mut attempt = row.clone();
    if let Some(m) = attempt["modules"].as_array_mut() {
        m.extend(modules.iter().cloned());
    }
    let mut edit = Edit::new(label.clone());
    edit.write_json(row_file("area", &frame.area_key), &attempt);
    let project = editor.project.as_mut().expect("project");
    let viewpoint = crate::project::Viewpoint {
        selection: editor.selection.clone(),
        camera: editor.views.camera_state(),
    };
    match project.apply(edit, viewpoint.clone()) {
        Ok(()) => {
            editor.views.content_changed();
            editor.form.errors.clear();
            let start = row["modules"].as_array().map_or(0, Vec::len);
            editor.selection = Selection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts: (start..start + count)
                    .map(|i| format!("/modules/{i}"))
                    .collect(),
            };
            let view = editor
                .views
                .area
                .views
                .get_mut(&format!("area:{}", frame.area_key));
            if let Some(view) = view {
                view.skipped = None;
            }
        }
        Err(first) => {
            let mut kept = Vec::new();
            let mut skipped = 0;
            let mut reason = first.sentence();
            let mut working = row.clone();
            for module in modules {
                let mut next = working.clone();
                if let Some(m) = next["modules"].as_array_mut() {
                    m.push(module.clone());
                }
                let probe = crate::project::Files::with(
                    &project.files,
                    &[crate::project::Change {
                        file: row_file("area", &frame.area_key),
                        bytes: Some(crate::project::json_bytes(&next)),
                    }],
                );
                match crate::project::load(&probe, &project.root.display().to_string()) {
                    Ok((content, _)) => {
                        unsafe { content.release() };
                        kept.push(module);
                        working = next;
                    }
                    Err(report) => {
                        skipped += 1;
                        if kept.is_empty() {
                            reason = crate::project::Refusal::of(&report).sentence();
                        }
                    }
                }
            }
            if !kept.is_empty() {
                let mut edit = Edit::new(format!("{label} ({skipped} skipped)"));
                edit.write_json(row_file("area", &frame.area_key), &working);
                if project.apply(edit, viewpoint).is_ok() {
                    editor.views.content_changed();
                }
            }
            let text = format!("{skipped} of {count} skipped: {reason}");
            editor.toast(text.clone());
            if let Some(view) = editor
                .views
                .area
                .views
                .get_mut(&format!("area:{}", frame.area_key))
            {
                view.skipped = Some(text);
            }
        }
    }
}

pub fn object_names(content: Content, area_id: area::Id) -> HashSet<String> {
    area::objects(area::placed(&content, area_id))
        .filter_map(|(_, object)| object.name.clone())
        .collect()
}

pub fn stamp_overlay(editor: &mut Editor, painter: &egui::Painter, view_key: &str, frame: &Frame) {
    let canvas = frame.canvas;
    let view = &editor.views.area.views[view_key];
    let Some(stamp) = view.stamp.clone() else {
        return;
    };
    let alt = painter.ctx().input(|i| i.modifiers.alt);
    let values = view.stamp_values.clone();
    let footprint = stamp_footprint(editor, frame.content, &stamp, &values);
    let color = Color32::from_rgb(90, 220, 220);
    let draw_ghost = |at: Pos<Tiles>| {
        let rect = Rect::new(Pos::new(at.x - 0.5, at.y - 0.5), footprint);
        painter.rect_stroke(
            canvas.rect(rect),
            0.0,
            EStroke::new(1.5, color),
            egui::StrokeKind::Inside,
        );
        painter.circle_filled(canvas.to_screen(at), 3.0, color);
    };
    if let Some(super::Drag::Stamp { placed, .. }) = &view.drag {
        for at in placed {
            draw_ghost(*at);
        }
    }
    if let Some(tile) = frame.pointer_tile {
        let at = if alt {
            tools::snap_sixteenth(tile)
        } else {
            tile.snap()
        };
        draw_ghost(at);
        painter.text(
            canvas.to_screen(at) + Vec2::new(8.0, 8.0),
            egui::Align2::LEFT_TOP,
            &stamp,
            egui::FontId::proportional(11.0),
            color,
        );
    }
}

/// A row dropped from the browser: the module types whose main reference takes its table.
pub fn drop_row(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    table: &str,
    key: &str,
    tile: Pos<Tiles>,
) {
    let candidates: Vec<(String, String)> = tools::module_variants(editor)
        .into_iter()
        .filter_map(|(tag, _)| {
            let field = main_reference(editor, &tag)?;
            (field.1 == table).then_some((tag, field.0))
        })
        .collect();
    if candidates.is_empty() {
        editor.toast(format!("No area module takes a {table} row"));
        return;
    }
    if candidates.len() == 1 {
        let (kind, field) = &candidates[0];
        add_with_row(editor, view_key, frame, kind, field, key, tile);
        return;
    }
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    view.drop_menu = Some(super::DropMenu {
        table: table.to_owned(),
        key: key.to_owned(),
        at: tile,
        screen: frame.pointer.unwrap_or(frame.canvas.rect.center()),
        candidates,
    });
}

/// The field of a module type that names a row, with its table.
pub fn main_reference(editor: &Editor, kind: &str) -> Option<(String, String)> {
    let items = editor.shapes.modules_of("area")?;
    let root = &editor.shapes.table("area")?.shape;
    let crate::schema::Kind::Union(variants) = crate::schema::kind(root, items) else {
        return None;
    };
    let variant = variants.iter().find(|v| v.tag == kind)?;
    for (name, field) in crate::schema::properties(crate::schema::resolve(root, variant.schema)) {
        let field = crate::schema::resolve(root, field);
        if let Some(table) = crate::schema::table_of(field) {
            return Some((name.clone(), table.to_owned()));
        }
    }
    None
}

pub fn add_with_row(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    kind: &str,
    field: &str,
    key: &str,
    tile: Pos<Tiles>,
) {
    let Some((_, mut module)) = tools::module_variants(editor)
        .into_iter()
        .find(|(tag, _)| tag == kind)
    else {
        return;
    };
    module[field] = Value::String(key.to_owned());
    let cell = tile.cell();
    let (x, y) = (cell.x as f32, cell.y as f32);
    match kind {
        "population" => {
            module["roams"] = serde_json::json!({ "x": x - 2.0, "y": y - 2.0, "w": 4.0, "h": 4.0 });
            module["count"] = serde_json::json!(1);
        }
        "resident" => module["at"] = serde_json::json!({ "x": x, "y": y }),
        "blueprint" => {
            module["at"] = serde_json::json!({ "x": x, "y": y });
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .stamp = Some(key.to_owned());
        }
        "scenery" => module["at"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5 }),
        _ => {}
    }
    let label = shapes::label(&module);
    tools::append_modules(
        editor,
        frame,
        vec![module],
        &format!("Add {label} to {}", frame.area_key),
    );
}

pub fn pick_then_add(
    editor: &mut Editor,
    _view_key: &str,
    frame: &Frame,
    module: Value,
    table: &str,
    field: &str,
) {
    editor.dialogs.push(Dialog::PickRow(PickRowDialog {
        title: format!(
            "Pick a {table} for the new {}",
            crate::schema::title(module["type"].as_str().unwrap_or("module"))
        ),
        table: table.to_owned(),
        search: String::new(),
        picked: None,
        options: Vec::new(),
        then: PickRowThen::AddModule {
            area: frame.area_key.clone(),
            module,
            field: field.to_owned(),
        },
    }));
}

/// Finishes a pick-row dialog: what to create and where.
pub fn picked_row(editor: &mut Editor, then: PickRowThen, picked: &str) {
    match then {
        PickRowThen::AddModule {
            area,
            mut module,
            field,
        } => {
            module[field] = Value::String(picked.to_owned());
            let Some(mut row) = editor.row_value("area", &area) else {
                return;
            };
            let label = shapes::label(&module);
            let start = row["modules"].as_array().map_or(0, Vec::len);
            if let Some(m) = row["modules"].as_array_mut() {
                m.push(module);
            }
            let mut edit = Edit::new(format!("Add {label} to {area}"));
            edit.write_json(row_file("area", &area), &row);
            if editor.apply(edit) {
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![area],
                    parts: vec![format!("/modules/{start}")],
                };
            }
        }
        PickRowThen::ReplaceBlueprint { area, index, scope } => {
            replace_with(editor, &area, index, picked, scope)
        }
        PickRowThen::ReturnDoorTarget { .. } => {}
    }
}

/// Alt-click: what a player standing here hears, measured at authored volume.
pub fn listen(editor: &mut Editor, frame: &Frame, tile: Pos<Tiles>) {
    crate::views::sound::listen(editor, frame.content, frame.area_id, tile);
}

pub fn open_make_blueprint(editor: &mut Editor, area_key: &str, indices: Vec<usize>) {
    let Some(row) = editor.row_value("area", area_key) else {
        return;
    };
    let modules: Vec<Value> = indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    if modules.is_empty()
        || modules.iter().any(|m| {
            matches!(
                m["type"].as_str(),
                Some("shared_script") | Some("inline_script")
            )
        })
    {
        editor.toast("A blueprint takes any selection but area scripts");
        return;
    }
    let (Some(project), Some(content)) = (
        editor.project.as_ref(),
        editor.project.as_ref().and_then(|p| p.content),
    ) else {
        return;
    };
    let name = crate::rows::free_key(&project.files, "blueprint", "new_blueprint");
    let matches = matching_groups(content, area_key, &modules, &indices);
    editor
        .dialogs
        .push(Dialog::MakeBlueprint(MakeBlueprintDialog {
            area: area_key.to_owned(),
            indices,
            name,
            matches,
            take_matches: true,
            error: None,
        }));
}

pub fn make_blueprint_from_selection(editor: &mut Editor, frame: &Frame) {
    let mut indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| p.strip_prefix("/modules/")?.parse().ok())
        .collect();
    indices.sort_unstable();
    open_make_blueprint(editor, &frame.area_key, indices);
}

pub struct MakeBlueprintDialog {
    pub area: String,
    pub indices: Vec<usize>,
    pub name: String,
    pub matches: Vec<MatchGroup>,
    pub take_matches: bool,
    pub error: Option<String>,
}

/// Another arrangement of the same parts elsewhere: an area, its module indices, origin and flip.
#[derive(Clone, Debug)]
pub struct MatchGroup {
    pub area: String,
    pub indices: Vec<usize>,
    pub origin: Pos<Tiles>,
    pub flip: Flip,
}

/// Groups of modules in every area equal to the selection once moved to its origin, as is or flipped.
fn matching_groups(
    content: Content,
    own_area: &str,
    modules: &[Value],
    own_indices: &[usize],
) -> Vec<MatchGroup> {
    let Some(origin) = selection_origin(modules) else {
        return Vec::new();
    };
    let mut relative: Vec<Value> = modules.to_vec();
    for module in &mut relative {
        shapes::shift(module, -origin.x, -origin.y);
    }
    let signature = |modules: &[Value]| -> Vec<String> {
        let mut texts: Vec<String> = modules.iter().map(|m| canonical(m).to_string()).collect();
        texts.sort();
        texts
    };
    let wanted = signature(&relative);
    let mut out = Vec::new();
    for area_id in content.ids::<area::AreaDef>() {
        let key = area_id.key(&content);
        let Ok(row) = serde_json::to_value(area_id.get(&content)) else {
            continue;
        };
        let all: Vec<Value> = row["modules"].as_array().cloned().unwrap_or_default();
        let anchors: Vec<usize> = all
            .iter()
            .enumerate()
            .filter(|(index, m)| {
                m["type"] == modules[0]["type"] && !(key == own_area && own_indices.contains(index))
            })
            .map(|(index, _)| index)
            .collect();
        for anchor in anchors {
            let Some(anchor_bounds) = shapes::bounds(&all[anchor], None) else {
                continue;
            };
            let Some(first_bounds) = shapes::bounds(&modules[0], None) else {
                continue;
            };
            let candidate_origin = Pos::new(
                anchor_bounds.min().x - (first_bounds.min().x - origin.x),
                anchor_bounds.min().y - (first_bounds.min().y - origin.y),
            );
            let mut group: Vec<usize> = Vec::new();
            let mut ok = true;
            for wanted_module in &relative {
                let mut target = wanted_module.clone();
                shapes::shift(&mut target, candidate_origin.x, candidate_origin.y);
                let target = canonical(&target);
                match all.iter().enumerate().find(|(index, m)| {
                    !(group.contains(index) || (key == own_area && own_indices.contains(index)))
                        && canonical(m) == target
                }) {
                    Some((index, _)) => group.push(index),
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok
                && signature(
                    &group
                        .iter()
                        .map(|&i| {
                            let mut m = all[i].clone();
                            shapes::shift(&mut m, -candidate_origin.x, -candidate_origin.y);
                            m
                        })
                        .collect::<Vec<_>>(),
                ) == wanted
            {
                group.sort_unstable();
                if !out
                    .iter()
                    .any(|g: &MatchGroup| g.area == key && g.indices == group)
                {
                    out.push(MatchGroup {
                        area: key.to_owned(),
                        indices: group,
                        origin: candidate_origin,
                        flip: Flip::None,
                    });
                }
            }
        }
    }
    out
}

fn canonical(module: &Value) -> Value {
    let mut out = module.clone();
    if let Some(map) = out.as_object_mut() {
        map.remove("name");
    }
    out
}

pub fn selection_origin(modules: &[Value]) -> Option<Pos<Tiles>> {
    modules
        .iter()
        .filter_map(|m| shapes::bounds(m, None))
        .reduce(shapes::rect_union)
        .map(|r| r.min())
}

pub fn make_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: MakeBlueprintDialog,
) -> Option<MakeBlueprintDialog> {
    use crate::ui::{theme, widgets};
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let row = editor
        .row_value("area", &dialog.area)
        .unwrap_or(Value::Null);
    let modules: Vec<Value> = dialog
        .indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    let origin = selection_origin(&modules);
    let holds = {
        let mut counts: Vec<(String, usize)> = Vec::new();
        for module in &modules {
            let name = match module["type"].as_str() {
                Some("blueprint") => module["blueprint"]
                    .as_str()
                    .unwrap_or("blueprint")
                    .to_owned(),
                Some("scenery") => {
                    format!("scenery · {}", module["tileset"].as_str().unwrap_or(""))
                }
                _ => shapes::label(module),
            };
            match counts.iter_mut().find(|(n, _)| *n == name) {
                Some((_, count)) => *count += 1,
                None => counts.push((name, 1)),
            }
        }
        counts
            .into_iter()
            .map(|(name, count)| {
                if count > 1 {
                    format!("{name} × {count}")
                } else {
                    name
                }
            })
            .collect::<Vec<_>>()
            .join(" · ")
    };
    let placements = 1 + if dialog.take_matches {
        dialog.matches.len()
    } else {
        0
    };
    crate::ui::dialogs::card(ctx, "make-blueprint", 560.0, |ui| {
        ui.horizontal(|ui| {
            ui.label(RichText::new("▣").color(theme::WARN).size(16.0));
            ui.label(
                RichText::new(format!(
                    "Make blueprint from {} placement{}",
                    modules.len(),
                    if modules.len() == 1 { "" } else { "s" }
                ))
                .strong()
                .size(18.0),
            );
        });
        widgets::key_hint(ui, "Ctrl Alt B");
        ui.add_space(8.0);
        widgets::kv(ui, "name", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut dialog.name)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(f32::INFINITY),
                )
            });
            if ui
                .ctx()
                .data(|d| d.get_temp::<bool>(ui.id().with("focused")))
                .is_none()
            {
                response.request_focus();
                ui.ctx()
                    .data_mut(|d| d.insert_temp(ui.id().with("focused"), true));
            }
        });
        widgets::kv(ui, "holds", |ui| {
            ui.add(egui::Label::new(theme::mono(&holds).size(13.0)).wrap());
        });
        ui.add_space(4.0);
        if let Some(origin) = origin {
            ui.label(theme::muted(format!("The selection becomes one placement at {}, {}. Nothing looks or plays differently.", crate::forms::tiles(origin.x), crate::forms::tiles(origin.y))).size(13.0));
        }
        if !dialog.matches.is_empty() {
            ui.add_space(8.0);
            let mut areas: Vec<&str> = dialog.matches.iter().map(|m| m.area.as_str()).collect();
            areas.sort_unstable();
            areas.dedup();
            let where_ = if areas.len() == 1 {
                format!("on {}", areas[0])
            } else {
                format!("in {} areas", areas.len())
            };
            let mut spots: Vec<String> = dialog
                .matches
                .iter()
                .take(6)
                .map(|m| {
                    format!(
                        "{}, {}",
                        crate::forms::tiles(m.origin.x),
                        crate::forms::tiles(m.origin.y)
                    )
                })
                .collect();
            if dialog.matches.len() > 6 {
                spots.push(format!("… {} more", dialog.matches.len() - 6));
            }
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    widgets::toggle(ui, &mut dialog.take_matches);
                    ui.vertical(|ui| {
                        ui.label(theme::strong(format!(
                            "{} identical arrangement{} {where_}",
                            dialog.matches.len(),
                            if dialog.matches.len() == 1 { "" } else { "s" }
                        )));
                        ui.label(
                            theme::muted(format!("at {}. Replace them too.", spots.join(" · ")))
                                .size(12.5),
                        );
                    });
                });
                ui.add_space(4.0);
                ui.label(
                    theme::faint("Matched by their parts; anything else there stays.").size(12.0),
                );
            });
        }
        ui.add_space(8.0);
        ui.label(theme::muted("Everything selected but ground tiles goes in, objects with their scripts. Names and values stay fixed until made variables.").size(12.5));
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(
                ui,
                &format!(
                    "Make blueprint · {placements} placement{}",
                    if placements == 1 { "" } else { "s" }
                ),
            )
            .clicked()
                || enter
            {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || escape {
                outcome = Some(false);
            }
        });
    });
    match outcome {
        Some(true) => match make_blueprint(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(dialog)
            }
        },
        Some(false) => None,
        None => Some(dialog),
    }
}

fn make_blueprint(editor: &mut Editor, dialog: &MakeBlueprintDialog) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder")?;
    let key = dialog.name.trim().to_owned();
    if let Some(problem) = crate::rows::key_problem(&project.files, "blueprint", &key) {
        return Err(problem);
    }
    let row = project
        .files
        .json(&row_file("area", &dialog.area))
        .ok_or("the area is gone")?;
    let modules: Vec<Value> = dialog
        .indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    let origin = selection_origin(&modules).ok_or("the selection has no place")?;
    let mut parts = modules.clone();
    for part in &mut parts {
        shapes::shift(part, -origin.x, -origin.y);
    }
    let blueprint = serde_json::json!({ "parts": parts });
    let mut edit = Edit::new(format!(
        "Make blueprint {key} from {} modules of {}",
        modules.len(),
        dialog.area
    ));
    edit.write_json(row_file("blueprint", &key), &blueprint);
    let mut groups: Vec<MatchGroup> = vec![MatchGroup {
        area: dialog.area.clone(),
        indices: dialog.indices.clone(),
        origin,
        flip: Flip::None,
    }];
    if dialog.take_matches {
        groups.extend(dialog.matches.iter().cloned());
    }
    let mut by_area: BTreeMap<String, Vec<MatchGroup>> = BTreeMap::new();
    for group in groups {
        by_area.entry(group.area.clone()).or_default().push(group);
    }
    let mut first_placement: Option<usize> = None;
    for (area, groups) in by_area {
        let mut row = project
            .files
            .json(&row_file("area", &area))
            .ok_or("an area is gone")?;
        let mut list: Vec<Value> = row["modules"].as_array().cloned().unwrap_or_default();
        let mut remove: Vec<usize> = groups
            .iter()
            .flat_map(|g| g.indices.iter().copied())
            .collect();
        remove.sort_unstable();
        remove.dedup();
        for group in &groups {
            let mut placement = serde_json::json!({ "type": "blueprint", "blueprint": key, "at": { "x": group.origin.x, "y": group.origin.y } });
            if !group.flip.is_none() {
                placement["flip"] = Value::String(group.flip.csv().to_owned());
            }
            let at = group.indices.iter().copied().min().unwrap_or(list.len());
            list.insert(at, placement);
            for index in &mut remove {
                if *index >= at {
                    *index += 1;
                }
            }
            if area == dialog.area && first_placement.is_none() {
                first_placement = Some(at);
            }
        }
        for index in remove.iter().rev() {
            list.remove(*index);
        }
        if let Some(first) = first_placement
            && area == dialog.area
        {
            let before = remove.iter().filter(|&&r| r < first).count();
            first_placement = Some(first - before);
        }
        row["modules"] = Value::Array(list);
        edit.write_json(row_file("area", &area), &row);
    }
    if !editor.apply(edit) {
        return Err("refused; see the output".to_owned());
    }
    editor.selection = Selection {
        table: "area".to_owned(),
        keys: vec![dialog.area.clone()],
        parts: first_placement
            .map(|i| format!("/modules/{i}"))
            .into_iter()
            .collect(),
    };
    editor.toast(format!("Made blueprint {key}"));
    Ok(())
}

/// Unpacks a placement one level into plain modules, holes filled.
/// A placement's parts as modules of their own, values filled and placed where the copy stood.
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
    let flip = Flip::parse(module["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
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
    if tools::write_modules(
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

/// Swaps the blueprint of placements, keeping position and flip; values carry by name and type.
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
            if module["type"] != "blueprint" || module["blueprint"].as_str() != Some(old.as_str()) {
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
                        value_kind(&values[&key]) == v.ty.name()
                            || matches!(
                                v.ty,
                                game::core::script::VariableType::Name
                                    | game::core::script::VariableType::Row
                                    | game::core::script::VariableType::Audio
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

/// Ctrl G: the selected scenery and painted tiles of one tileset become one scenery.
pub fn join_scenery(editor: &mut Editor, view_key: &str, frame: &Frame) {
    let indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| p.strip_prefix("/modules/")?.parse().ok())
        .collect();
    let sceneries: Vec<&Value> = indices
        .iter()
        .filter_map(|&i| frame.modules.get(i))
        .filter(|m| m["type"] == "scenery")
        .collect();
    if sceneries.len() < 2 {
        editor.toast("Select two or more sceneries of one tileset to join (Ctrl G)");
        let _ = view_key;
        return;
    }
    let tileset = sceneries[0]["tileset"].as_str().unwrap_or("").to_owned();
    if sceneries
        .iter()
        .any(|s| s["tileset"].as_str() != Some(tileset.as_str()))
    {
        editor.toast("Joined sceneries share one tileset");
        return;
    }
    let bounds = sceneries
        .iter()
        .filter_map(|s| shapes::scenery_rect(s))
        .reduce(shapes::rect_union)
        .expect("bounds");
    let width = bounds.size.width.ceil() as usize;
    let height = bounds.size.height.ceil() as usize;
    let mut tiles: Vec<Vec<Value>> = vec![vec![Value::Null; width]; height];
    let mut blocks: Vec<Value> = Vec::new();
    for scenery in &sceneries {
        let Some(rect) = shapes::scenery_rect(scenery) else {
            continue;
        };
        let flip = Flip::parse(scenery["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
        let rows = scenery["tiles"].as_array().cloned().unwrap_or_default();
        let h = rows.len();
        for (r, row) in rows.iter().enumerate() {
            let w = row.as_array().map_or(0, Vec::len);
            for (c, tile) in row.as_array().into_iter().flatten().enumerate() {
                if tile.is_null() {
                    continue;
                }
                let (cc, rr) = (
                    if flip.horizontal() { w - 1 - c } else { c },
                    if flip.vertical() { h - 1 - r } else { r },
                );
                let x = (rect.min().x - bounds.min().x).round() as usize + cc;
                let y = (rect.min().y - bounds.min().y).round() as usize + rr;
                if y < height && x < width {
                    let mut placed = tile.clone();
                    if !flip.is_none() {
                        let own = Flip::parse(tile["flip"].as_str().unwrap_or(""))
                            .unwrap_or(Flip::None)
                            .compose(flip);
                        let number = tile.as_u64().or_else(|| tile["tile"].as_u64()).unwrap_or(0);
                        placed = if own.is_none() {
                            Value::from(number)
                        } else {
                            serde_json::json!({ "tile": number, "flip": own.csv() })
                        };
                    }
                    tiles[y][x] = placed;
                }
            }
        }
        for block in scenery["blocks"].as_array().into_iter().flatten() {
            let (Some(bx), Some(by)) = (block[0].as_i64(), block[1].as_i64()) else {
                continue;
            };
            let center = Pos::new(bx as f32 + 0.5, by as f32 + 0.5);
            let at = shapes::pos_of(&scenery["at"]).unwrap_or(Pos::new(0.0, 0.0));
            let abs = at + flip.apply(center).to_vector();
            blocks.push(serde_json::json!([
                (abs.x - bounds.min().x).floor() as i32,
                (abs.y - bounds.min().y).floor() as i32
            ]));
        }
    }
    let mut joined = serde_json::json!({ "type": "scenery", "at": { "x": bounds.min().x, "y": bounds.min().y }, "tileset": tileset, "tiles": tiles });
    if let Some(sort) = sceneries
        .iter()
        .filter_map(|s| s["sort"].as_f64())
        .reduce(f64::max)
    {
        joined["sort"] = serde_json::json!(sort);
    }
    if !blocks.is_empty() {
        joined["blocks"] = Value::Array(blocks);
    }
    let mut modules = frame.modules.clone();
    let mut sorted = indices.clone();
    sorted.sort_unstable();
    for i in sorted.iter().rev() {
        if frame.modules[*i]["type"] == "scenery" {
            modules.remove(*i);
        }
    }
    let at = sorted[0].min(modules.len());
    modules.insert(at, joined);
    if tools::write_modules(
        editor,
        &frame.area_key,
        modules,
        &format!("Join {} sceneries in {}", sceneries.len(), frame.area_key),
    ) {
        editor.selection.parts = vec![format!("/modules/{at}")];
    }
}

/// Split: a scenery's tiles go back to the active ground layer where its cells are free.
pub fn split_scenery(editor: &mut Editor, frame: &Frame, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let tileset = module["tileset"].as_str().unwrap_or("").to_owned();
    let flip = Flip::parse(module["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
    let grids = frame.area().grids;
    let mut draft = super::grid::GridDraft::of(&frame.area_key, grids);
    let layer = editor
        .views
        .area
        .views
        .get(&format!("area:{}", frame.area_key))
        .map_or(0, |v| v.layer);
    let rows = module["tiles"].as_array().cloned().unwrap_or_default();
    let h = rows.len();
    let mut placed = 0;
    let mut kept: Vec<Vec<Value>> = rows
        .iter()
        .map(|r| r.as_array().cloned().unwrap_or_default())
        .collect();
    for (r, row) in rows.iter().enumerate() {
        let w = row.as_array().map_or(0, Vec::len);
        for (c, tile) in row.as_array().into_iter().flatten().enumerate() {
            if tile.is_null() {
                continue;
            }
            let (cc, rr) = (
                if flip.horizontal() { w - 1 - c } else { c },
                if flip.vertical() { h - 1 - r } else { r },
            );
            let cell = Pos::<Tiles>::new(
                rect.min().x + cc as f32 + 0.5,
                rect.min().y + rr as f32 + 0.5,
            )
            .cell();
            if draft.get(layer, cell).is_some() || cell.index(draft.size).is_none() {
                continue;
            }
            let number = tile.as_u64().or_else(|| tile["tile"].as_u64()).unwrap_or(0) as u32;
            let own = Flip::parse(tile["flip"].as_str().unwrap_or(""))
                .unwrap_or(Flip::None)
                .compose(flip);
            let entry = draft.intern(&tileset, number, own);
            draft.set(layer, cell, Some(entry));
            kept[r][c] = Value::Null;
            placed += 1;
        }
    }
    if placed == 0 {
        editor.toast("No free cell under the scenery on the active layer");
        return;
    }
    let mut modules = frame.modules.clone();
    let all_gone = kept.iter().all(|row| row.iter().all(Value::is_null));
    if all_gone {
        modules.remove(index);
    } else {
        modules[index]["tiles"] = Value::Array(kept.into_iter().map(Value::Array).collect());
    }
    let Some(mut row) = editor.row_value("area", &frame.area_key) else {
        return;
    };
    row["modules"] = Value::Array(modules);
    let mut edit = Edit::new(format!(
        "Split scenery into {placed} tiles in {}",
        frame.area_key
    ));
    edit.write_json(row_file("area", &frame.area_key), &row);
    draft.write_into(&mut edit);
    if editor.apply(edit) && all_gone {
        editor.selection.parts.clear();
    }
}

pub fn return_door(editor: &mut Editor, frame: &Frame, index: usize) {
    return_door_from(editor, &frame.area_key, &frame.modules, index);
}

/// Draws the way back: an object with script/warp leading here, on the nearest walkable cell
/// outside the destination door.
pub fn return_door_from(editor: &mut Editor, area_key: &str, modules: &[Value], index: usize) {
    let index = if index == usize::MAX {
        editor
            .selection
            .parts
            .first()
            .and_then(|p| p.strip_prefix("/modules/")?.parse().ok())
            .unwrap_or(0)
    } else {
        index
    };
    let Some(module) = modules.get(index) else {
        return;
    };
    let Some((target_area, target_at)) = warp_destinations(module).into_iter().next() else {
        editor.toast("The object has no warp to return from");
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let Some(here_id) = content.by_key::<area::AreaDef>(area_key) else {
        return;
    };
    let Some(there_id) = content.by_key::<area::AreaDef>(&target_area) else {
        return;
    };
    let here = area::load(&content, here_id);
    let there = area::load(&content, there_id);
    let Some(door_bounds) = shapes::bounds(module, None) else {
        return;
    };
    let back_to = here
        .grid
        .nodes()
        .iter()
        .filter(|cell| !door_bounds.contains(**cell))
        .min_by(|a, b| {
            a.distance(door_bounds.center())
                .0
                .total_cmp(&b.distance(door_bounds.center()).0)
        })
        .copied();
    let Some(back_to) = back_to else {
        editor.toast("No walkable cell outside the door to come back to");
        return;
    };
    let Some(_) = there.grid.nearest_walkable(target_at) else {
        editor.toast("The destination has no walkable cell");
        return;
    };
    let mut names = object_names(content, there_id);
    let name = suffixed_from(
        &format!("{}_back", module["name"].as_str().unwrap_or("door")),
        &names,
    );
    names.insert(name.clone());
    let cell = target_at.cell();
    let door = serde_json::json!({
        "type": "object",
        "name": name,
        "shape": { "type": "point", "x": cell.x as f32, "y": cell.y as f32 },
        "scripts": [{ "type": "shared_script", "script": "warp", "values": { "to": { "area": area_key, "x": back_to.x, "y": back_to.y } } }]
    });
    let Some(mut there_row) = editor.row_value("area", &target_area) else {
        return;
    };
    if let Some(m) = there_row["modules"].as_array_mut() {
        m.push(door);
    }
    let mut edit = Edit::new(format!("Return door from {target_area} to {area_key}"));
    edit.write_json(row_file("area", &target_area), &there_row);
    if editor.apply(edit) {
        editor.toast(format!(
            "Added a door back in {target_area} at {}, {}",
            cell.x, cell.y
        ));
    }
}

pub fn resize_area(editor: &mut Editor, dialog: &tools::ResizeDialog) -> Result<(), String> {
    let content = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .ok_or("the folder does not load")?;
    let id = content
        .by_key::<area::AreaDef>(&dialog.area)
        .ok_or("the area is gone")?;
    let area = area::load(&content, id);
    let old = area.size.grid();
    let new = game::core::tiling::GridSize::new(dialog.width, dialog.height);
    let shift_for = |anchor: i8, old: u32, new: u32| -> i32 {
        match anchor {
            -1 => 0,
            0 => (new as i32 - old as i32) / 2,
            _ => new as i32 - old as i32,
        }
    };
    let shift = (
        shift_for(dialog.anchor.0, old.width, new.width),
        shift_for(dialog.anchor.1, old.height, new.height),
    );
    let draft = super::grid::GridDraft::of(&dialog.area, area.grids);
    let (resized, clipped) = draft.resized(new, shift);
    let mut row = editor
        .row_value("area", &dialog.area)
        .ok_or("the area is gone")?;
    row["map"]["size"]["width"] = Value::from(dialog.width);
    row["map"]["size"]["height"] = Value::from(dialog.height);
    let (dx, dy) = (shift.0 as f32, shift.1 as f32);
    let bounds = Rect::new(
        Pos::new(-0.5, -0.5),
        Size::new(dialog.width as f32, dialog.height as f32),
    );
    let mut outside = Vec::new();
    for (index, module) in row["modules"]
        .as_array_mut()
        .into_iter()
        .flatten()
        .enumerate()
    {
        shapes::shift(module, dx, dy);
        if let Some(b) = shapes::bounds(module, None)
            && !bounds.contains_rect(&b)
        {
            match module["type"].as_str() {
                Some("safe_zone") | Some("soundscape") | Some("population") => {}
                _ => outside.push(format!("module {index} ({})", shapes::label(module))),
            }
        }
    }
    if !outside.is_empty() {
        return Err(format!(
            "{} left outside the map: {}",
            outside.len(),
            outside.join(", ")
        ));
    }
    let mut edit = Edit::new(format!(
        "Resize {} to {} × {} ({clipped} cells clipped)",
        dialog.area, dialog.width, dialog.height
    ));
    edit.write_json(row_file("area", &dialog.area), &row);
    resized.write_all_into(&mut edit);
    if dx != 0.0 || dy != 0.0 {
        let project = editor.project.as_ref().ok_or("no folder")?;
        for usage in project.usages.of_row("area", &dialog.area) {
            let Some(parent) = usage.pointer.strip_suffix("/area") else {
                continue;
            };
            let mut json = if usage.file == row_file("area", &dialog.area) {
                row.clone()
            } else {
                project.files.json(&usage.file).ok_or("a file is gone")?
            };
            let Some(place) = json.pointer_mut(parent) else {
                continue;
            };
            let (Some(x), Some(y)) = (place["x"].as_f64(), place["y"].as_f64()) else {
                continue;
            };
            place["x"] = serde_json::json!(x as f32 + dx);
            place["y"] = serde_json::json!(y as f32 + dy);
            if usage.file == row_file("area", &dialog.area) {
                row = json.clone();
                edit.write_json(usage.file.clone(), &row);
            } else {
                edit.write_json(usage.file.clone(), &json);
            }
        }
    }
    if editor.apply(edit) {
        Ok(())
    } else {
        Err("refused; see the output".to_owned())
    }
}

pub struct DeleteBlueprintDialog {
    pub blueprint: String,
    pub users: Vec<BlueprintUser>,
    pub error: Option<String>,
}

/// One place a blueprint is used: an area's placement or another blueprint's part, with its choice.
#[derive(Clone, Debug)]
pub struct BlueprintUser {
    pub file: String,
    pub pointer: String,
    pub label: String,
    pub choice: BlueprintChoice,
}

#[derive(Clone, Debug, PartialEq)]
pub enum BlueprintChoice {
    Unpack,
    Replace(String),
    Remove,
}

pub fn delete_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: DeleteBlueprintDialog,
) -> Option<DeleteBlueprintDialog> {
    let mut outcome = None;
    let others: Vec<String> = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .map(|c| {
            c.table::<area::blueprint::BlueprintDef>()
                .keys()
                .iter()
                .filter(|k| **k != dialog.blueprint)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    egui::Window::new(format!("Delete blueprint {}", dialog.blueprint))
        .collapsible(false)
        .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
        .show(ctx, |ui| {
            if dialog.users.is_empty() {
                ui.label("Nothing places it.");
            } else {
                ui.label(format!("{} placements. Each: unpack into scenery and modules, replace with another blueprint, or remove.", dialog.users.len()));
            }
            egui::ScrollArea::vertical().max_height(320.0).show(ui, |ui| {
                for (index, user) in dialog.users.iter_mut().enumerate() {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(&user.label).monospace().small());
                        ui.radio_value(&mut user.choice, BlueprintChoice::Unpack, "Unpack");
                        ui.radio_value(&mut user.choice, BlueprintChoice::Remove, "Remove");
                        let mut picked = match &user.choice {
                            BlueprintChoice::Replace(k) => k.clone(),
                            _ => String::new(),
                        };
                        egui::ComboBox::from_id_salt(("replace", index))
                            .selected_text(if picked.is_empty() { "Replace with…".to_owned() } else { picked.clone() })
                            .show_ui(ui, |ui| {
                                for other in &others {
                                    if ui.selectable_label(picked == *other, other).clicked() {
                                        picked = other.clone();
                                    }
                                }
                            });
                        if !picked.is_empty() {
                            user.choice = BlueprintChoice::Replace(picked);
                        }
                    });
                }
            });
            if let Some(error) = &dialog.error {
                ui.colored_label(Color32::from_rgb(220, 80, 80), error);
            }
            ui.horizontal(|ui| {
                if ui.button("Delete").clicked() {
                    outcome = Some(true);
                }
                if ui.button("Cancel").clicked() {
                    outcome = Some(false);
                }
            });
        });
    match outcome {
        Some(true) => match delete_blueprint(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(dialog)
            }
        },
        Some(false) => None,
        None => Some(dialog),
    }
}

fn delete_blueprint(editor: &mut Editor, dialog: &DeleteBlueprintDialog) -> Result<(), String> {
    let content = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .ok_or("the folder does not load")?;
    let id = content
        .by_key::<area::blueprint::BlueprintDef>(&dialog.blueprint)
        .ok_or("the blueprint is gone")?;
    let def = id.get(&content);
    let project = editor.project.as_ref().ok_or("no folder")?;
    let mut files: BTreeMap<String, Value> = BTreeMap::new();
    let mut by_file: BTreeMap<String, Vec<&BlueprintUser>> = BTreeMap::new();
    for user in &dialog.users {
        by_file.entry(user.file.clone()).or_default().push(user);
    }
    for (file, users) in by_file {
        let mut json = project.files.json(&file).ok_or("a file is gone")?;
        let mut users = users;
        users.sort_by(|a, b| b.pointer.cmp(&a.pointer));
        for user in users {
            let (parent, index) = {
                let cut = user.pointer.rfind('/').ok_or("a bad pointer")?;
                (
                    user.pointer[..cut].to_owned(),
                    user.pointer[cut + 1..]
                        .parse::<usize>()
                        .map_err(|_| "a bad pointer")?,
                )
            };
            let list = json
                .pointer_mut(&parent)
                .and_then(Value::as_array_mut)
                .ok_or("a bad pointer")?;
            match &user.choice {
                BlueprintChoice::Remove => {
                    list.remove(index);
                }
                BlueprintChoice::Replace(other) => {
                    list[index]["blueprint"] = Value::String(other.clone());
                }
                BlueprintChoice::Unpack => {
                    let placement = list.remove(index);
                    let at = shapes::pos_of(&placement["at"]).unwrap_or(Pos::new(0.0, 0.0));
                    let flip =
                        Flip::parse(placement["flip"].as_str().unwrap_or("")).unwrap_or(Flip::None);
                    for (offset, part) in def.parts.iter().enumerate() {
                        let mut part = part.clone();
                        fill_holes(&mut part, &placement["values"], &def.variables);
                        place_json(&mut part, at, flip);
                        list.insert(index + offset, part);
                    }
                }
            }
        }
        files.insert(file, json);
    }
    let mut edit = Edit::new(format!(
        "Delete blueprint {} ({} placements resolved)",
        dialog.blueprint,
        dialog.users.len()
    ));
    for (file, json) in files {
        edit.write_json(file, &json);
    }
    edit.remove(row_file("blueprint", &dialog.blueprint));
    if !editor.apply(edit) {
        return Err("refused; see the output".to_owned());
    }
    crate::rows::close_tabs(editor, "blueprint", &dialog.blueprint);
    Ok(())
}
