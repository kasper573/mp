use std::collections::{BTreeMap, HashMap, HashSet};

use design_tokens::controls;
use design_tokens::glyph::{self, Mark};
use egui::{RichText, Stroke as EStroke, Ui, Vec2};
use engine::core::content::{Content, ContentRow, row_file, row_of};
use engine::core::math::{Pos, Rect};
use engine::core::script::VariableType;
use engine::core::tiling::Tiles;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::{self, AreaDef, AreaId, AreaModuleKind, Flip};
use engine::systems::script::Variable;
use serde_json::Value;

use super::holes::value_kind;
use super::inspect::Followups;
use super::stamp::placed_part;
use super::{AreaFrame, AreaSnapshot, modules, shapes};
use crate::app::{Editor, ModalDialog, PickRowDialog, PickRowThen};
use crate::forms::{self, FormCx};
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::schema;
use crate::ui::{theme, widgets};
use crate::value::{self, RowValue};

pub fn placement_bounds(content: &Content, area_id: AreaId) -> HashMap<usize, Rect<Tiles>> {
    let mut out: HashMap<usize, Rect<Tiles>> = HashMap::new();
    for placed in area::placed(content, area_id) {
        if placed.chain.is_empty() {
            continue;
        }
        let Ok(json) = value::json(&placed.module) else {
            continue;
        };
        let Some(bounds) = shapes::bounds(&json, None) else {
            continue;
        };
        out.entry(placed.origin)
            .and_modify(|known| *known = known.union(&bounds))
            .or_insert(bounds);
    }
    out
}

pub fn first_area_using(editor: &Editor, blueprint: &str) -> Option<String> {
    let project = editor.project.as_ref()?;
    project
        .usages
        .of_row(BlueprintDef::TABLE, blueprint)
        .iter()
        .find_map(|usage| {
            row_of(&usage.file)
                .filter(|(table, _)| *table == AreaDef::TABLE)
                .map(|(_, key)| key.to_owned())
        })
}

pub fn placement_count(content: &Content, blueprint: &str) -> String {
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(blueprint) else {
        return String::new();
    };
    let mut direct = 0;
    let mut areas: Vec<AreaId> = Vec::new();
    let mut nested = 0;
    for area_id in content.ids::<area::AreaDef>() {
        for placement in area::placements(content, area_id) {
            if placement.blueprint != id {
                continue;
            }
            if placement.chain.len() <= 1 {
                direct += 1;
                if !areas.contains(&area_id) {
                    areas.push(area_id);
                }
            } else {
                nested += 1;
            }
        }
    }
    let mut text = match areas.as_slice() {
        [] => "Placed nowhere yet.".to_owned(),
        [only] => {
            let name = only.get(content).name.clone();
            format!(
                "Placed {direct} time{}, all in {name}.",
                widgets::plural(direct)
            )
        }
        many => format!("Placed {direct} times in {} areas.", many.len()),
    };
    if nested > 0 {
        text.push_str(&format!(" {nested} more sit inside other blueprints."));
    }
    text
}

pub fn placement_card(
    ui: &mut Ui,
    cx: &mut FormCx,
    content: Option<&Content>,
    module: &mut Value,
    path: &str,
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
    let def = id.get(content);
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
                let default = variable.default.as_ref().and_then(|d| value::json(d).ok());
                let value_path = format!("{path}/values/{name}");
                match own {
                    Some(mut value) => {
                        if variable_field(ui, cx, variable, &mut value, &value_path) {
                            module["values"][name] = value;
                            changed = true;
                        }
                        if default.is_some()
                            && glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove")
                                .on_hover_text("Back to the blueprint's default")
                                .clicked()
                        {
                            module["values"].remove_field(name);
                            changed = true;
                        }
                    }
                    None => {
                        let shown = match &default {
                            Some(default) => short_value(default),
                            None => "missing".to_owned(),
                        };
                        let response = ui
                            .add(egui::Label::new(theme::muted(shown)).sense(egui::Sense::click()))
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

pub fn variable_template(variable: &Variable) -> Value {
    use engine::core::script::VariableType as T;
    match variable.ty {
        T::Integer => Value::from(0),
        T::Number => Value::from(0.0),
        T::Boolean => Value::Bool(false),
        T::Text | T::Name | T::Row | T::Audio => Value::String(String::new()),
        T::Place => serde_json::json!({ "area": "", "x": 0.0, "y": 0.0 }),
        T::Condition => value::empty_object(),
    }
}

pub fn variable_field(
    ui: &mut Ui,
    cx: &mut FormCx,
    variable: &Variable,
    value: &mut Value,
    path: &str,
) -> bool {
    let schema = schema::variable_schema(variable.ty, variable.table.as_deref());
    forms::value(ui, cx, &schema, value, path).is_some()
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
    let mut places = Vec::new();
    collect_places(&module["scripts"], &mut places);
    places
        .into_iter()
        .filter_map(|place| {
            let area = place["area"].as_str()?;
            let (x, y) = (place["x"].as_f64()?, place["y"].as_f64()?);
            Some((area.to_owned(), Pos::new(x as f32, y as f32)))
        })
        .collect()
}

/// Points every place the scripts name at `to`, so a copy of a warp's scripts leads there instead.
pub fn redirect_places(value: &mut Value, to: &Value) {
    match value {
        Value::Object(map) if is_place(map) => *value = to.clone(),
        Value::Object(map) => map
            .values_mut()
            .for_each(|field| redirect_places(field, to)),
        Value::Array(items) => items.iter_mut().for_each(|item| redirect_places(item, to)),
        _ => {}
    }
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
        ui.label(format!("{count} × {}", schema::title(kind)));
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
    let Some(content) = cx.content.clone() else {
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
                            .and_then(|d| value::json(d).ok())
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

#[derive(Clone, Debug)]
pub struct Placement {
    pub module: usize,
    pub blueprint: String,
    pub at: Pos<Tiles>,
    pub flip: Flip,
    pub values: Value,
}

pub fn resolve_in_place(
    content: &Content,
    modules: &[Value],
    path: &[usize],
) -> Option<Vec<Placement>> {
    let (&top, parts) = path.split_first()?;
    let module = modules.get(top)?;
    if !module.is_module(AreaModuleKind::Blueprint) {
        return None;
    }
    let mut chain = vec![placement_of(top, module)?];
    for &part in parts {
        let current = chain.last()?;
        let id = content.by_key::<area::blueprint::BlueprintDef>(&current.blueprint)?;
        let def = id.get(content);
        let placed = placed_part(
            content,
            def.parts.get(part)?,
            &current.values,
            &def.variables,
            current.at,
            current.flip,
        )?;
        if !placed.is_module(AreaModuleKind::Blueprint) {
            return None;
        }
        chain.push(placement_of(top, &placed)?);
    }
    Some(chain)
}

fn placement_of(module: usize, json: &Value) -> Option<Placement> {
    Some(Placement {
        module,
        blueprint: json.text("blueprint").to_owned(),
        at: shapes::pos_of(&json["at"])?,
        flip: serde_json::from_value(json["flip"].clone()).unwrap_or_default(),
        values: json["values"].clone(),
    })
}

pub struct PartView {
    pub part: usize,
    pub module: Value,
    pub bounds: Option<Rect<Tiles>>,
    pub nested: Option<String>,
}

pub fn parts_in_place(frame: &AreaFrame, place: &Placement) -> Vec<PartView> {
    let content = frame.content.clone();
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(&place.blueprint) else {
        return Vec::new();
    };
    let def = id.get(&content);
    let mut out = Vec::new();
    for (index, part) in def.parts.iter().enumerate() {
        let Some(module) = placed_part(
            &content,
            part,
            &place.values,
            &def.variables,
            place.at,
            place.flip,
        ) else {
            continue;
        };
        let nested = (module.is_module(AreaModuleKind::Blueprint))
            .then(|| module.text("blueprint").to_owned());
        let bounds = match &nested {
            Some(nested_key) => nested_bounds(&content, nested_key, &module),
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
    content: &Content,
    blueprint: &str,
    placement: &Value,
) -> Option<Rect<Tiles>> {
    let at = shapes::pos_of(&placement["at"])?;
    let scenery = super::scene::parts_scenery(content, blueprint, at, &placement["values"]);
    Some(super::scene::scenery_extent(&scenery).unwrap_or_else(|| shapes::cell_rect(at)))
}

pub fn start_in_place(editor: &mut Editor, view_key: &str, area_key: &str, index: usize) {
    let Some(row) = editor.row_value(AreaDef::TABLE, area_key) else {
        return;
    };
    let module = &row["modules"][index];
    if !module.is_module(AreaModuleKind::Blueprint) {
        return;
    }
    let blueprint = module.text("blueprint").to_owned();
    let view = editor.views.area.ensure_view(view_key, area_key);
    view.in_place = vec![index];
    view.set_tool(super::AreaTool::Select);
    editor.selection = RowSelection::row(BlueprintDef::TABLE, &blueprint);
}

pub fn edit_in_place(editor: &mut Editor, view_key: &str, frame: &AreaFrame, index: usize) {
    start_in_place(editor, view_key, &frame.area_key, index);
}

pub fn enter_nested(editor: &mut Editor, view_key: &str, part: usize, blueprint: &str) {
    editor.views.area.view_mut(view_key).in_place.push(part);
    editor.selection = RowSelection::row(BlueprintDef::TABLE, blueprint);
}

pub fn selected_part_indices(editor: &Editor, blueprint: &str) -> Vec<usize> {
    if editor.selection.table != BlueprintDef::TABLE
        || !editor.selection.keys.iter().any(|k| k == blueprint)
    {
        return Vec::new();
    }
    let mut out: Vec<usize> = editor
        .selection
        .parts
        .iter()
        .filter_map(|part| super::blueprint_part_index(part))
        .collect();
    out.sort_unstable();
    out
}

pub fn overlay_in_place(
    editor: &Editor,
    painter: &egui::Painter,
    frame: &AreaFrame,
    place: &Placement,
) {
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
        let full = canvas.screen;
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
    frame: &AreaFrame,
    place: &Placement,
    indices: &[usize],
    dx: f32,
    dy: f32,
) {
    let Some(mut row) = editor.row_value(BlueprintDef::TABLE, &place.blueprint) else {
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
    let count = placement_count(&frame.content, &place.blueprint);
    let mut edit = ContentEdit::new(format!(
        "Move {} parts of {} · {count}",
        indices.len(),
        place.blueprint
    ));
    edit.write_json(row_file(BlueprintDef::TABLE, &place.blueprint), &row);
    editor.apply(edit);
}

pub fn delete_parts_in_place(editor: &mut Editor, frame: &AreaSnapshot, place: &Placement) {
    let indices = selected_part_indices(editor, &place.blueprint);
    if indices.is_empty() {
        return;
    }
    let Some(mut row) = editor.row_value(BlueprintDef::TABLE, &place.blueprint) else {
        return;
    };
    if let Some(parts) = row["parts"].as_array_mut() {
        super::remove_indices(parts, &indices);
    }
    let count = placement_count(&frame.content, &place.blueprint);
    let mut edit = ContentEdit::new(format!(
        "Remove {} parts of {} · {count}",
        indices.len(),
        place.blueprint
    ));
    edit.write_json(row_file(BlueprintDef::TABLE, &place.blueprint), &row);
    if editor.apply(edit) {
        editor.selection.parts.clear();
    }
}

pub fn unpacked(content: &Content, module: &Value) -> Option<Vec<Value>> {
    let id = content.by_key::<area::blueprint::BlueprintDef>(module["blueprint"].as_str()?)?;
    let def = id.get(content);
    let at = shapes::pos_of(&module["at"])?;
    let flip = serde_json::from_value(module["flip"].clone()).unwrap_or_default();
    def.parts
        .iter()
        .map(|part| placed_part(content, part, &module["values"], &def.variables, at, flip))
        .collect()
}

pub fn retarget(module: &mut Value, key: &str, variables: &BTreeMap<String, Variable>) -> usize {
    module["blueprint"] = Value::String(key.to_owned());
    let Some(values) = module["values"].as_object_mut() else {
        return 0;
    };
    let stale: Vec<String> = values
        .iter()
        .filter(|(name, value)| {
            !variables
                .get(*name)
                .is_some_and(|v| value_carries(v, value))
        })
        .map(|(name, _)| name.clone())
        .collect();
    for name in &stale {
        values.remove(name);
    }
    stale.len()
}

fn value_carries(variable: &Variable, value: &Value) -> bool {
    let kind = value_kind(value);
    kind == variable.ty
        || (kind == VariableType::Integer && variable.ty == VariableType::Number)
        || matches!(
            variable.ty,
            VariableType::Name | VariableType::Row | VariableType::Audio
        ) && value.is_string()
}

pub fn unpack(editor: &mut Editor, frame: &AreaSnapshot, index: usize) {
    let mut count = 0;
    let applied = modules::change_modules(editor, &frame.area_key, |modules| {
        let module = modules.get(index)?;
        let key = module["blueprint"].as_str().unwrap_or("the blueprint");
        let label = format!("Unpack {key} in {}", frame.area_key);
        let unpacked = unpacked(&frame.content, module)?;
        if unpacked.is_empty() {
            return None;
        }
        count = unpacked.len();
        modules.splice(index..=index, unpacked);
        Some(label)
    });
    if applied {
        editor.selection.parts = (index..index + count).map(super::module_part).collect();
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReplaceScope {
    Here,
    ThisArea,
    Everywhere,
}

pub fn replace_dialog(editor: &mut Editor, frame: &AreaSnapshot, index: usize) {
    editor.dialogs.push(ModalDialog::PickRow(PickRowDialog {
        title: format!(
            "Replace {} with",
            frame.modules[index]["blueprint"]
                .as_str()
                .unwrap_or("the blueprint")
        ),
        table: BlueprintDef::TABLE.to_owned(),
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
    let Some(content) = editor.project.as_ref().and_then(|p| p.content.clone()) else {
        return;
    };
    let Some(row) = editor.row_value(AreaDef::TABLE, area_key) else {
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
    let mut edit = ContentEdit::new(format!("Replace {old} with {replacement}"));
    let mut dropped = 0;
    let mut swapped = 0;
    for area in areas {
        let Some(mut row) = editor.row_value(AreaDef::TABLE, &area) else {
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
            dropped += retarget(module, replacement, &new_def.variables);
            swapped += 1;
            changed = true;
        }
        if changed {
            edit.write_json(row_file(AreaDef::TABLE, &area), &row);
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
    out: &mut Followups,
    index: usize,
) {
    let Some(key) = module["blueprint"].as_str().map(str::to_owned) else {
        return;
    };
    ui.add_space(4.0);
    if let Some(content) = cx.content.clone() {
        widgets::hint(ui, &placement_count(&content, &key));
    }
    ui.horizontal_wrapped(|ui| {
        if controls::marked(ui, Mark::Grid, "Edit blueprint").clicked() {
            out.actions
                .push(super::AreaAction::OpenBlueprint(key.clone()));
        }
        if ui.button("Unpack into scenery").clicked() {
            out.actions.push(super::AreaAction::Unpack(index));
        }
        if ui.button("Replace with…").clicked() {
            out.actions.push(super::AreaAction::Replace(index));
        }
    });
    widgets::key_hint_text(ui, EditorKey::Confirm, "edits the blueprint in place");
}

fn collect_places<'a>(value: &'a Value, places: &mut Vec<&'a Value>) {
    match value {
        Value::Object(map) if is_place(map) => places.push(value),
        Value::Object(map) => map.values().for_each(|field| collect_places(field, places)),
        Value::Array(items) => items.iter().for_each(|item| collect_places(item, places)),
        _ => {}
    }
}

fn is_place(map: &serde_json::Map<String, Value>) -> bool {
    ["area", "x", "y"]
        .iter()
        .all(|field| map.contains_key(*field))
}
