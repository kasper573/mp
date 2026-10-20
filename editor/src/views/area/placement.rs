use std::collections::{BTreeMap, HashMap, HashSet};

use design_tokens::controls;
use design_tokens::glyph::{self, Mark};
use egui::{RichText, Stroke as EStroke, Ui, Vec2};
use engine::core::content::{Content, ContentFile, name_of, table_of};
use engine::core::math::{Pos, Rect};
use engine::core::script::VariableType;
use engine::core::tiling::Tiles;
use engine::systems::area::blueprint::{BlueprintDef, BlueprintId, Flattened, PlacedBlueprint};
use engine::systems::area::scene::{NODE_FIELDS, module_json, scene_file};
use engine::systems::area::{self, AreaDef, AreaId, AreaModuleKind, Flip};
use engine::systems::script::Variable;
use serde_json::Value;

use super::grid::GridDraft;
use super::holes::value_kind;
use super::inspect::Followups;
use super::stamp::placed_part;
use super::{AreaFrame, AreaSnapshot, nodes, shapes};
use crate::app::{Editor, ModalDialog, PickRowDialog, PickRowThen};
use crate::forms::{self, FormCx};
use crate::keymap::EditorKey;
use crate::project::ProjectFiles;
use crate::project::RowSelection;
use crate::project::files::content_of;
use crate::tabs::file_title;
use crate::ui::{theme, widgets};
use crate::value::{self, RowValue};
use crate::{scene_graph, schema};

/// What each placement of a scene covers on the map, by its node's pointer: the modules it brings,
/// placed.
pub fn placement_bounds(placed: &[Flattened]) -> HashMap<String, Rect<Tiles>> {
    let mut out: HashMap<String, Rect<Tiles>> = HashMap::new();
    for placed in placed {
        if placed.chain.is_empty() {
            continue;
        }
        let Ok(json) = value::json(&placed.module) else {
            continue;
        };
        let Some(bounds) = shapes::bounds(&json, None) else {
            continue;
        };
        out.entry(placed.origin.clone())
            .and_modify(|known| *known = known.union(&bounds))
            .or_insert(bounds);
    }
    out
}

pub fn first_area_using(editor: &Editor, blueprint: &str) -> Option<String> {
    let project = editor.project.as_ref()?;
    project
        .usages
        .of_content(blueprint)
        .iter()
        .find_map(|usage| {
            content_of(&usage.file)
                .filter(|(table, _)| *table == AreaDef::TABLE)
                .map(|(_, key)| key.to_owned())
        })
}

/// Where a blueprint is placed: straight into areas, and how many more times inside other
/// blueprints.
pub struct BlueprintPlacements<'a> {
    pub direct: Vec<(AreaId, &'a PlacedBlueprint)>,
    pub nested: usize,
}

pub fn placements_of(content: &Content, blueprint: BlueprintId) -> BlueprintPlacements<'_> {
    let mut placements = BlueprintPlacements {
        direct: Vec::new(),
        nested: 0,
    };
    for area_id in content.ids::<AreaDef>() {
        for placement in area::placements(content, area_id) {
            if placement.blueprint != blueprint {
                continue;
            }
            if placement.chain.len() <= 1 {
                placements.direct.push((area_id, placement));
            } else {
                placements.nested += 1;
            }
        }
    }
    placements
}

pub fn placement_count(content: &Content, blueprint: &str) -> String {
    let Some(id) = content.by_path::<BlueprintDef>(blueprint) else {
        return String::new();
    };
    let BlueprintPlacements { direct, nested } = placements_of(content, id);
    let mut areas: Vec<AreaId> = direct.iter().map(|(area, _)| *area).collect();
    areas.dedup();
    let direct = direct.len();
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
    let Some(id) = content.by_path::<BlueprintDef>(&blueprint) else {
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
    match variable.ty {
        VariableType::Condition => value::empty_object(),
        ty => {
            let schema = schema::variable_schema(ty, variable.table.as_deref());
            schema::template(&schema, &schema)
        }
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

/// The values every selected placement gives, edited for all of them at once when they place the
/// same blueprint.
pub fn shared_values(ui: &mut Ui, cx: &mut FormCx, scene: &mut Value, nodes: &[String]) -> bool {
    let module = |scene: &Value, node: &str| scene.pointer(node).cloned().unwrap_or(Value::Null);
    let kinds: Vec<String> = nodes
        .iter()
        .map(|node| module(scene, node).kind().to_owned())
        .collect();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for kind in &kinds {
        *counts.entry(kind.clone()).or_default() += 1;
    }
    for (kind, count) in &counts {
        ui.label(format!("{count} × {}", schema::title(kind)));
    }
    let blueprints: HashSet<String> = nodes
        .iter()
        .map(|node| module(scene, node).text("blueprint").to_owned())
        .collect();
    if !kinds.iter().all(|k| k == "blueprint") || blueprints.len() != 1 {
        return false;
    }
    let Some(content) = cx.content.clone() else {
        return false;
    };
    let blueprint = blueprints.into_iter().next().unwrap_or_default();
    let Some(id) = content.by_path::<BlueprintDef>(&blueprint) else {
        return false;
    };
    let def = id.get(&content);
    ui.label(RichText::new("Shared values").strong());
    let mut changed = false;
    let set_all = |scene: &mut Value, name: &str, value: &Value| {
        for node in nodes {
            if let Some(module) = scene.pointer_mut(node) {
                module["values"][name] = value.clone();
            }
        }
    };
    for (name, variable) in &def.variables {
        let values: Vec<Value> = nodes
            .iter()
            .map(|node| {
                module(scene, node)["values"]
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
                        set_all(scene, name, &template);
                        changed = true;
                    }
                } else if variable_field(ui, cx, variable, &mut value, &format!("/shared/{name}")) {
                    set_all(scene, name, &value);
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
pub struct AreaPlacement {
    /// The placement's node in the scene that places it: the area's, or the blueprint's of the
    /// placement before it.
    pub node: String,
    pub blueprint: String,
    pub at: Pos<Tiles>,
    pub flip: Flip,
    pub values: Value,
    /// The blueprint's scene as the editor holds it.
    pub scene: Value,
}

/// The placements edited in place along `path`, each named by its node's pointer in the scene of
/// the one before; as many as still resolve.
pub fn resolve_in_place(
    editor: &Editor,
    content: &Content,
    scene: &Value,
    path: &[String],
) -> Option<Vec<AreaPlacement>> {
    let Some((top, nested)) = path.split_first() else {
        return Some(Vec::new());
    };
    let module = scene.pointer(top)?;
    if !module.is_module(AreaModuleKind::Blueprint) {
        return None;
    }
    let mut chain = vec![placement_of(editor, top, module)?];
    for node in nested {
        let Some(next) = chain
            .last()
            .and_then(|current| nested_place(editor, content, current, node))
        else {
            break;
        };
        chain.push(next);
    }
    Some(chain)
}

/// The placement at `node` in the scene of the blueprint `current` places, placed as it lands.
fn nested_place(
    editor: &Editor,
    content: &Content,
    current: &AreaPlacement,
    node: &str,
) -> Option<AreaPlacement> {
    let id = content.by_path::<BlueprintDef>(&current.blueprint)?;
    let def = id.get(content);
    let (_, part) = scene_graph::scene_modules(&def.scene.nodes)
        .into_iter()
        .find(|(pointer, _)| pointer == node)?;
    let placed = placed_part(
        content,
        &part,
        &current.values,
        &def.variables,
        current.at,
        current.flip,
    )?;
    if !placed.is_module(AreaModuleKind::Blueprint) {
        return None;
    }
    placement_of(editor, node, &placed)
}

fn placement_of(editor: &Editor, node: &str, json: &Value) -> Option<AreaPlacement> {
    let blueprint = json.text("blueprint").to_owned();
    Some(AreaPlacement {
        node: node.to_owned(),
        scene: nodes::scene_of(editor, &blueprint),
        blueprint,
        at: shapes::pos_of(&json["at"])?,
        flip: serde_json::from_value(json["flip"].clone()).unwrap_or_default(),
        values: json["values"].clone(),
    })
}

pub struct PartView {
    pub part: String,
    pub module: Value,
    pub bounds: Option<Rect<Tiles>>,
    pub nested: Option<String>,
    pub locked: bool,
}

pub fn parts_in_place(frame: &AreaFrame, place: &AreaPlacement) -> Vec<PartView> {
    let content = frame.content.clone();
    let Some(id) = content.by_path::<BlueprintDef>(&place.blueprint) else {
        return Vec::new();
    };
    let def = id.get(&content);
    let row = super::scene_tree::place_row(frame);
    let mut out = Vec::new();
    for (pointer, part) in scene_graph::scene_modules(&def.scene.nodes) {
        let flags = frame.flags.row(&format!("{row}/in{pointer}"));
        if flags.hidden.on() {
            continue;
        }
        let Some(module) = placed_part(
            &content,
            &part,
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
            part: pointer,
            module,
            bounds,
            nested,
            locked: flags.locked.on(),
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

pub fn start_in_place(editor: &mut Editor, view_key: &str, area_key: &str, node: &str) {
    let scene = nodes::scene_of(editor, area_key);
    let Some(module) = scene.pointer(node) else {
        return;
    };
    if !module.is_module(AreaModuleKind::Blueprint) {
        return;
    }
    let blueprint = module.text("blueprint").to_owned();
    let view = editor.views.area.view_mut(view_key);
    view.in_place = vec![node.to_owned()];
    view.set_tool(super::AreaTool::Select);
    editor.selection = RowSelection::row(BlueprintDef::TABLE, &blueprint);
}

pub fn edit_in_place(editor: &mut Editor, view_key: &str, frame: &AreaFrame, node: &str) {
    start_in_place(editor, view_key, &frame.bundle, node);
}

pub fn enter_nested(editor: &mut Editor, view_key: &str, part: &str, blueprint: &str) {
    editor
        .views
        .area
        .view_mut(view_key)
        .in_place
        .push(part.to_owned());
    editor.selection = RowSelection::row(BlueprintDef::TABLE, blueprint);
}

/// The nodes of `blueprint` selected while it is edited in place.
pub fn selected_in_place(editor: &Editor, blueprint: &str) -> Vec<String> {
    if editor.selection.table != BlueprintDef::TABLE
        || !editor.selection.keys.iter().any(|k| k == blueprint)
    {
        return Vec::new();
    }
    editor.selection.parts.clone()
}

pub fn overlay_in_place(
    editor: &Editor,
    painter: &egui::Painter,
    frame: &AreaFrame,
    place: &AreaPlacement,
) {
    let canvas = frame.canvas;
    let parts = parts_in_place(frame, place);
    let extent = parts
        .iter()
        .filter_map(|part| part.bounds)
        .reduce(|a, b| a.union(&b))
        .or_else(|| frame.module_bounds(&place.node));
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
    let selected = selected_in_place(editor, &place.blueprint);
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
    place: &AreaPlacement,
    parts: &[String],
    dx: f32,
    dy: f32,
) {
    let (bx, by) = (
        if place.flip.horizontal() { -dx } else { dx },
        if place.flip.vertical() { -dy } else { dy },
    );
    let count = placement_count(&frame.content, &place.blueprint);
    nodes::change_scene(editor, &place.blueprint, |scene| {
        for part in parts {
            shapes::shift(scene.pointer_mut(part)?, bx, by);
        }
        Some(format!(
            "Move {} parts of {} · {count}",
            parts.len(),
            place.blueprint
        ))
    });
}

/// The blueprint a placement places, as nodes of the scene it is placed in: its folders and
/// labels as they are, its modules with holes filled and positions placed. Ground layers stay
/// behind, since their cells are stamped into the layers of the same name instead.
pub fn unpacked(content: &Content, placement: &Value) -> Option<Vec<Value>> {
    let id = content.by_path::<BlueprintDef>(placement["blueprint"].as_str()?)?;
    let def = id.get(content);
    let at = shapes::pos_of(&placement["at"])?;
    let flip = serde_json::from_value(placement["flip"].clone()).unwrap_or_default();
    let scene = serde_json::to_value(&def.scene.nodes).ok()?;
    let place = |node: &Value| -> Option<Value> {
        let module = module_json(node);
        let mut placed = placed_part(
            content,
            &module,
            &placement["values"],
            &def.variables,
            at,
            flip,
        )?;
        for field in NODE_FIELDS {
            if let Some(value) = node.get(field) {
                placed[field] = value.clone();
            }
        }
        Some(placed)
    };
    fn unpack(nodes: &Value, place: &dyn Fn(&Value) -> Option<Value>) -> Option<Vec<Value>> {
        let mut out = Vec::new();
        for node in nodes.as_array().into_iter().flatten() {
            if nodes::is_layer(node) {
                continue;
            }
            if nodes::is_folder(node) {
                let mut folder = node.clone();
                folder["children"] = Value::Array(unpack(&node["children"], place)?);
                out.push(folder);
            } else {
                out.push(place(node)?);
            }
        }
        Some(out)
    }
    unpack(&scene, &place)
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

/// Replaces a placement with a folder of the same label holding what it places, and paints what it
/// painted into the area's own layers, as one step.
pub fn unpack(editor: &mut Editor, frame: &AreaSnapshot, node: &str) {
    let content = frame.content.clone();
    let bundle = frame.bundle.clone();
    let Some(mut edit) = nodes::scene_edit(editor, &bundle, |scene| {
        let placement = scene.pointer(node)?.clone();
        if !placement.is_module(AreaModuleKind::Blueprint) {
            return None;
        }
        let blueprint = placement.text("blueprint").to_owned();
        let label = placement["label"]
            .as_str()
            .map_or_else(|| name_of(&blueprint).to_owned(), str::to_owned);
        let children = unpacked(&content, &placement)?;
        *scene.pointer_mut(node)? = serde_json::json!({
            "type": "folder",
            "label": label,
            "children": children,
        });
        Some(format!("Unpack {label} into a folder"))
    }) else {
        return;
    };
    let module = frame.module(node).cloned().unwrap_or(Value::Null);
    let at = shapes::pos_of(&module["at"]).unwrap_or(Pos::new(0.0, 0.0));
    let flip: Flip = serde_json::from_value(module["flip"].clone()).unwrap_or_default();
    let mut missing = Vec::new();
    if let Some(placed) = GridDraft::own(&content, module.text("blueprint"))
        && let Some(mut own) = GridDraft::own(&content, &bundle)
    {
        missing = own.stamp(&placed, at, flip);
        own.write_into(&mut edit);
    }
    if editor.apply(edit) {
        nodes::select(editor, &bundle, vec![node.to_owned()]);
        let mut said = "Unpacked into a folder; Ctrl Z puts the placement back".to_owned();
        if !missing.is_empty() {
            said.push_str(&format!(
                ". Its cells in {} had no layer here to land in",
                missing.join(", ")
            ));
        }
        editor.toast(said);
    }
}

pub fn replace_dialog(editor: &mut Editor, frame: &AreaSnapshot, node: &str) {
    editor.dialogs.push(ModalDialog::PickRow(PickRowDialog {
        title: format!(
            "Replace {} with",
            frame
                .module(node)
                .and_then(|module| module["blueprint"].as_str())
                .unwrap_or("the blueprint")
        ),
        table: BlueprintDef::TABLE.to_owned(),
        search: String::new(),
        picked: None,
        options: Vec::new(),
        then: PickRowThen::ReplaceBlueprint {
            area: frame.bundle.clone(),
            node: node.to_owned(),
        },
    }));
}

pub fn replace_with(editor: &mut Editor, bundle: &str, node: &str, replacement: &str) {
    let Some(content) = editor.project.as_ref().and_then(|p| p.content.clone()) else {
        return;
    };
    let Some(new_id) = content.by_path::<BlueprintDef>(replacement) else {
        return;
    };
    let mut replaced = None;
    let applied = nodes::change_scene(editor, bundle, |scene| {
        let module = scene.pointer_mut(node)?;
        if !module.is_module(AreaModuleKind::Blueprint) {
            return None;
        }
        let old = module.text("blueprint").to_owned();
        let dropped = retarget(module, replacement, &new_id.get(&content).variables);
        let label = format!("Replace {old} with {replacement}");
        replaced = Some((old, dropped));
        Some(label)
    });
    if applied && let Some((old, dropped)) = replaced {
        editor.toast(format!(
            "Replaced {old} with {replacement}; {dropped} value{} didn't carry",
            widgets::plural(dropped)
        ));
    }
}

pub(super) fn placement_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &Value,
    out: &mut Followups,
    node: &str,
) {
    let Some(key) = module["blueprint"].as_str().map(str::to_owned) else {
        return;
    };
    ui.add_space(4.0);
    if let Some(content) = cx.content.clone() {
        widgets::hint(ui, &placement_count(&content, &key));
        if let Some(said) = painted(&content, &key) {
            widgets::hint(ui, &said);
        }
    }
    ui.horizontal_wrapped(|ui| {
        if controls::marked(ui, Mark::Grid, "Edit blueprint").clicked() {
            out.actions
                .push(super::AreaAction::OpenBlueprint(key.clone()));
        }
        if ui.button("Unpack into a folder").clicked() {
            out.actions.push(super::AreaAction::Unpack(node.to_owned()));
        }
        if ui.button("Replace with…").clicked() {
            out.actions
                .push(super::AreaAction::Replace(node.to_owned()));
        }
    });
    widgets::key_hint_text(ui, EditorKey::Confirm, "edits the blueprint in place");
}

/// Why placing the blueprint `blueprint` into `bundle` is refused, when it would end up inside
/// itself: the chain of what holds what.
pub fn holds_itself(files: &ProjectFiles, bundle: &str, blueprint: &str) -> Option<String> {
    if table_of(bundle) != Some(BlueprintDef::TABLE) {
        return None;
    }
    let chain = chain_to(files, blueprint, bundle, &mut HashSet::new())?;
    let names: Vec<&str> = std::iter::once(bundle)
        .chain(chain.iter().map(String::as_str))
        .map(file_title)
        .collect();
    Some(format!("would hold itself: {}", names.join(" › ")))
}

/// The blueprints from `from` down to `target` through placements, both ends included.
fn chain_to(
    files: &ProjectFiles,
    from: &str,
    target: &str,
    seen: &mut HashSet<String>,
) -> Option<Vec<String>> {
    if from == target {
        return Some(vec![from.to_owned()]);
    }
    if !seen.insert(from.to_owned()) {
        return None;
    }
    let scene = files.json_owned(&scene_file(from))?;
    nodes::modules(&scene)
        .iter()
        .filter(|module| module.json.is_module(AreaModuleKind::Blueprint))
        .find_map(|module| {
            let mut chain = chain_to(files, module.json.text("blueprint"), target, seen)?;
            chain.insert(0, from.to_owned());
            Some(chain)
        })
}

/// What placing the blueprint `key` paints into the scene it's placed in, when it paints at all.
fn painted(content: &Content, key: &str) -> Option<String> {
    let draft = GridDraft::own(content, key)?;
    let layers: Vec<&str> = draft
        .ground
        .iter()
        .filter(|layer| layer.cells.iter().any(Option::is_some))
        .map(|layer| layer.name.as_str())
        .collect();
    let forced = draft.walk.iter().filter(|cell| cell.is_some()).count();
    let layers = match layers.as_slice() {
        [] => None,
        [one] => Some(format!("paints {one} into the layer of the same name")),
        [first @ .., last] => Some(format!(
            "paints {} and {last} into the layers of the same name",
            first.join(", ")
        )),
    };
    let forced =
        (forced > 0).then(|| format!("forces {forced} walk cell{}", widgets::plural(forced)));
    let said: Vec<String> = [layers, forced].into_iter().flatten().collect();
    (!said.is_empty()).then(|| {
        let mut said = said.join(" and ");
        said[..1].make_ascii_uppercase();
        said
    })
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
