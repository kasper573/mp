use std::collections::{HashMap, HashSet};

use egui::Ui;
use game::core::content::Content;
use game::core::script::VariableType;
use serde_json::{Map, Value};

use crate::project::{Project, ProjectFiles, row_file};
use crate::schema::{self, SchemaKind, SchemaShapes, SchemaVariant};
use crate::ui::{browser, theme, widgets};
use crate::usages::ContentUsages;
use crate::views::model::busts;
use crate::views::script::nodes::NodeCatalogue;
use crate::{audio, condition, picker, spans, thumbs, value};

pub struct FormCx<'a> {
    pub root: &'a Value,
    pub content: Option<Content>,
    pub catalogue: &'a NodeCatalogue,
    pub files: &'a ProjectFiles,
    pub usages: &'a ContentUsages,
    pub shapes: &'a SchemaShapes,
    pub state: &'a mut FormState,
    pub actions: &'a mut Vec<FormAction>,
    pub speaker: Option<String>,
    pub owner_table: Option<String>,
    pub owner_key: Option<String>,
    pub holes: Option<FormHoles>,
    pub autofocus: bool,
}

impl<'a> FormCx<'a> {
    pub fn new(
        project: &'a Project,
        root: &'a Value,
        shapes: &'a SchemaShapes,
        state: &'a mut FormState,
        actions: &'a mut Vec<FormAction>,
    ) -> FormCx<'a> {
        FormCx {
            root,
            content: project.content.clone(),
            catalogue: &project.catalogue,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state,
            actions,
            speaker: None,
            owner_table: None,
            owner_key: None,
            holes: None,
            autofocus: false,
        }
    }

    pub fn owned_by(mut self, table: &str, key: Option<&str>) -> FormCx<'a> {
        self.owner_table = Some(table.to_owned());
        self.owner_key = key.map(str::to_owned);
        self
    }
}

#[derive(Default)]
pub struct FormHoles {
    pub filled: Vec<(String, String)>,
    pub open: Vec<(String, VariableType)>,
    pub variables: Vec<(String, VariableType)>,
    pub requests: Vec<HoleRequest>,
}

pub enum HoleRequest {
    Make { field: String, kind: VariableType },
    Use { field: String, name: String },
    Fix { field: String, name: String },
}

#[derive(Default)]
pub struct FormState {
    pub errors: HashMap<String, String>,
    pub folded: HashSet<String>,
    pub unfolded: HashSet<String>,
    pub status: Vec<String>,
    pub thumbnails: thumbs::Thumbnails,
    pub audio: audio::WaveformCache,
}

pub enum FormAction {
    OpenRow { table: String, key: String },
    OpenScript { pointer: String },
    MakeShared { pointer: String },
    MakeInline { script: String },
    PickPlace { path: String },
    NewRow { table: String, path: String },
    RowAction(browser::BrowserAction),
}

#[derive(Default)]
pub struct FormChange(pub Option<String>);

impl FormChange {
    pub fn at(path: &str) -> FormChange {
        FormChange(Some(path.to_owned()))
    }

    pub fn is_some(&self) -> bool {
        self.0.is_some()
    }
}

impl std::ops::BitOrAssign for FormChange {
    fn bitor_assign(&mut self, other: FormChange) {
        if self.0.is_none() {
            self.0 = other.0;
        }
    }
}

const LABEL_WIDTH: f32 = 124.0;

// The column is allocated at its full width whatever the label's length, so every value beside it
// starts on the same line.
pub fn label_column(ui: &mut Ui) -> Ui {
    let (rect, _) = ui.allocate_exact_size(
        egui::vec2(LABEL_WIDTH, ui.spacing().interact_size.y),
        egui::Sense::hover(),
    );
    ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    )
}

pub fn value(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    let filled = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.filled.iter().find(|(field, _)| field == path))
        .map(|(_, name)| name.clone());
    if let Some(name) = filled {
        hole_chip(ui, cx, path, &name);
        return FormChange::default();
    }
    let open = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.open.iter().find(|(field, _)| field == path))
        .map(|(_, kind)| *kind);
    let Some(kind) = open else {
        return plain(ui, cx, schema, value, path);
    };
    let mut changed = FormChange::default();
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Min), |ui| {
        hole_menu(ui, cx, path, kind);
        ui.with_layout(egui::Layout::top_down(egui::Align::Min), |ui| {
            ui.set_min_width(ui.available_width());
            changed = plain(ui, cx, schema, value, path);
        });
    });
    changed
}

fn variable_chip(ui: &mut Ui, name: &str) -> egui::Response {
    egui::Frame::new()
        .fill(theme::VARIABLE_FILL)
        .stroke(egui::Stroke::new(1.0, theme::VARIABLE))
        .corner_radius(10.0)
        .inner_margin(egui::Margin::symmetric(8, 2))
        .show(ui, |ui| {
            ui.label(
                egui::RichText::new(format!("◇ {name}"))
                    .monospace()
                    .size(12.5)
                    .color(theme::VARIABLE),
            );
        })
        .response
        .interact(egui::Sense::click())
}

fn hole_chip(ui: &mut Ui, cx: &mut FormCx, path: &str, name: &str) {
    let kind = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.variables.iter().find(|(n, _)| n == name))
        .map(|(_, kind)| *kind);
    ui.horizontal(|ui| {
        let chip = variable_chip(ui, name)
            .on_hover_text("Filled by the variable at each placement; click to change");
        ui.label(theme::muted(kind.map_or("", VariableType::name)).size(12.5));
        egui::Popup::from_toggle_button_response(&chip)
            .id(ui.id().with(("hole", path)))
            .show(|ui| {
                let fitting: Vec<String> = cx
                    .holes
                    .as_ref()
                    .map(|holes| {
                        holes
                            .variables
                            .iter()
                            .filter(|(other, k)| other != name && Some(*k) == kind)
                            .map(|(other, _)| other.clone())
                            .collect()
                    })
                    .unwrap_or_default();
                for other in fitting {
                    if ui.button(format!("Use variable {other}")).clicked() {
                        request(
                            cx,
                            HoleRequest::Use {
                                field: path.to_owned(),
                                name: other,
                            },
                        );
                        ui.close();
                    }
                }
                if ui
                    .button("Use a fixed value")
                    .on_hover_text("The same for every placement")
                    .clicked()
                {
                    request(
                        cx,
                        HoleRequest::Fix {
                            field: path.to_owned(),
                            name: name.to_owned(),
                        },
                    );
                    ui.close();
                }
            });
    });
}

fn hole_menu(ui: &mut Ui, cx: &mut FormCx, path: &str, kind: VariableType) {
    let button = ui
        .add(egui::Button::new(theme::muted("◇")).frame(false))
        .on_hover_text("Make this field a variable, or fill it from one");
    egui::Popup::from_toggle_button_response(&button)
        .id(ui.id().with(("hole", path)))
        .width(260.0)
        .show(|ui| {
            ui.label(
                theme::faint(format!("{} · {}", field_name(path), kind.name()))
                    .monospace()
                    .size(11.5),
            );
            if ui
                .button("Make variable")
                .on_hover_text(
                    "A new one of this type, without a default; every placement keeps its value",
                )
                .clicked()
            {
                request(
                    cx,
                    HoleRequest::Make {
                        field: path.to_owned(),
                        kind,
                    },
                );
                ui.close();
            }
            let fitting: Vec<String> = cx
                .holes
                .as_ref()
                .map(|holes| {
                    holes
                        .variables
                        .iter()
                        .filter(|(_, k)| *k == kind)
                        .map(|(name, _)| name.clone())
                        .collect()
                })
                .unwrap_or_default();
            if fitting.is_empty() {
                ui.add_enabled_ui(false, |ui| {
                    let _ = ui.button(format!("Use variable · no {} variable yet", kind.name()));
                });
            }
            for name in fitting {
                if ui.button(format!("Use variable {name}")).clicked() {
                    request(
                        cx,
                        HoleRequest::Use {
                            field: path.to_owned(),
                            name,
                        },
                    );
                    ui.close();
                }
            }
        });
}

fn request(cx: &mut FormCx, request: HoleRequest) {
    if let Some(holes) = cx.holes.as_mut() {
        holes.requests.push(request);
    }
}

fn field_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn plain(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    let schema = schema::resolve(cx.root, schema);
    if path.ends_with("/chance") && matches!(schema::kind(cx.root, schema), SchemaKind::Choice(_)) {
        return chance(ui, value, path);
    }
    if let Some(marker) = schema::marker(schema) {
        match marker {
            "x-table" => {
                return reference(ui, cx, schema, value, path);
            }
            "x-asset" => return asset(ui, cx, value, path),
            "x-place" => return place(ui, cx, schema, value, path),
            "x-color" => return color(ui, value, path),
            "x-face" => return face(ui, cx, value, path),
            "x-span" => return spans::edit(ui, cx, value, path),
            "x-condition" => return condition::edit(ui, cx, schema, value, path),
            _ => {}
        }
    }
    match schema::kind(cx.root, schema) {
        SchemaKind::Const(constant) => {
            if value != constant {
                *value = constant.clone();
            }
            ui.label(constant.as_str().unwrap_or_default());
            FormChange::default()
        }
        SchemaKind::Enum(options) => enum_combo(ui, &options, value, path),
        SchemaKind::Union(variants) => union(ui, cx, &variants, value, path),
        SchemaKind::Choice(alternatives) => choice(ui, cx, &alternatives, value, path),
        SchemaKind::Object => match geometry_of(cx.root, schema) {
            Some(kind) => geometry(ui, cx, kind, value, path),
            None => object(ui, cx, schema, value, path),
        },
        SchemaKind::Array(items) => array(ui, cx, items, value, path),
        SchemaKind::Map(values) => map(ui, cx, values, value, path),
        SchemaKind::Text => text(ui, cx, value, path),
        SchemaKind::Integer => number(ui, cx, schema, value, path, true),
        SchemaKind::Number => number(ui, cx, schema, value, path, false),
        SchemaKind::Boolean => boolean(ui, value, path),
        SchemaKind::Null => {
            ui.label("—");
            FormChange::default()
        }
        SchemaKind::Any => raw_json(ui, cx, value, path),
    }
}

pub fn object(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    object_without(ui, cx, schema, value, path, &[])
}

pub fn object_without(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
    hidden: &[&str],
) -> FormChange {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let required = schema::required(schema);
    let mut changed = FormChange::default();
    for (name, field) in schema::properties(schema) {
        if schema::tag_of(schema).is_some_and(|(tag, _)| tag == *name)
            || hidden.contains(&name.as_str())
        {
            continue;
        }
        let field_path = format!("{path}/{name}");
        let present = value.get(name).is_some_and(|v| !v.is_null());
        let optional = !required.contains(&name.as_str()) || schema::is_optional(field);
        let resolved = schema::resolve(cx.root, field);
        let nested = present
            && schema::marker(resolved).is_none()
            && matches!(schema::kind(cx.root, resolved), SchemaKind::Object)
            && geometry_of(cx.root, resolved).is_none();
        let list_of_objects = present
            && match schema::kind(cx.root, resolved) {
                SchemaKind::Array(items) => matches!(
                    schema::kind(cx.root, schema::resolve(cx.root, items)),
                    SchemaKind::Object
                ),
                _ => false,
            };
        if list_of_objects {
            ui.horizontal(|ui| {
                ui.label(theme::muted(name).monospace().size(13.0));
                if optional
                    && ui
                        .add(
                            egui::Label::new(theme::faint("✕").size(11.0))
                                .sense(egui::Sense::click()),
                        )
                        .on_hover_text(format!("Unset {name}"))
                        .clicked()
                {
                    value.as_object_mut().expect("object").remove(name);
                    changed = FormChange::at(&field_path);
                }
            });
            if let Some(child) = value.get_mut(name) {
                changed |= self::value(ui, cx, field, child, &field_path);
            }
            continue;
        }
        if nested {
            ui.horizontal(|ui| {
                widgets::section(ui, name);
                if optional
                    && ui
                        .small_button("×")
                        .on_hover_text(format!("Unset {name}"))
                        .clicked()
                {
                    value.as_object_mut().expect("object").remove(name);
                    changed = FormChange::at(&field_path);
                }
            });
            if let Some(child) = value.get_mut(name) {
                changed |= object(ui, cx, field, child, &field_path);
            }
            continue;
        }
        ui.horizontal(|ui| {
            let mut label_ui = label_column(ui);
            {
                let ui = &mut label_ui;
                if optional && !present {
                    if ui
                        .add(
                            egui::Label::new(
                                theme::faint(format!("+ {name}")).monospace().size(13.0),
                            )
                            .sense(egui::Sense::click()),
                        )
                        .on_hover_text(format!("Set {name}"))
                        .clicked()
                    {
                        let fresh = schema::template(cx.root, field);
                        value
                            .as_object_mut()
                            .expect("object")
                            .insert(name.clone(), fresh);
                        changed = FormChange::at(&field_path);
                    }
                    return;
                }
                if optional {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add(
                                egui::Label::new(theme::faint("✕").size(11.0))
                                    .sense(egui::Sense::click()),
                            )
                            .on_hover_text(format!("Unset {name}"))
                            .clicked()
                        {
                            value.as_object_mut().expect("object").remove(name);
                            changed = FormChange::at(&field_path);
                        }
                        ui.add(
                            egui::Label::new(theme::muted(name).monospace().size(13.0)).truncate(),
                        );
                    });
                } else {
                    ui.add(egui::Label::new(theme::muted(name).monospace().size(13.0)).truncate());
                }
            }
            if let Some(child) = value.get_mut(name).filter(|_| present) {
                ui.vertical(|ui| {
                    ui.set_min_width(ui.available_width());
                    changed |= self::value(ui, cx, field, child, &field_path);
                });
            } else {
                ui.label(theme::faint("—"));
            }
        });
    }
    changed
}

fn union(
    ui: &mut Ui,
    cx: &mut FormCx,
    variants: &[SchemaVariant],
    value: &mut Value,
    path: &str,
) -> FormChange {
    let mut changed = FormChange::default();
    if let Some(name) = value.get("var").and_then(Value::as_str).map(str::to_owned)
        && value.as_object().is_some_and(|map| map.len() == 1)
    {
        ui.horizontal(|ui| {
            variable_chip(ui, &name);
            let kinds: Vec<String> = variants
                .iter()
                .map(|variant| schema::title(&variant.tag).to_lowercase())
                .collect();
            ui.label(theme::muted(format!("variable · {}", kinds.join(" or "))).size(12.5));
        });
        return changed;
    }
    let current = schema::variant_of(variants, value).map(|variant| variant.tag.clone());
    let field = variants
        .first()
        .map(|variant| variant.field.clone())
        .unwrap_or_else(|| "type".to_owned());
    let mut picked = current.clone();
    widgets::combo_box(ui.id().with(path).with("variant"))
        .selected_text(
            current
                .as_deref()
                .map(schema::title)
                .unwrap_or_else(|| "pick…".to_owned()),
        )
        .show_ui(ui, |ui| {
            for variant in variants {
                ui.selectable_value(
                    &mut picked,
                    Some(variant.tag.clone()),
                    schema::title(&variant.tag),
                );
            }
        });
    if picked != current
        && let Some(tag) = &picked
        && let Some(variant) = variants.iter().find(|variant| variant.tag == *tag)
    {
        let mut fresh = schema::variant_template(cx.root, variant);
        if let (Some(fresh), Some(old)) = (fresh.as_object_mut(), value.as_object()) {
            for (name, old_value) in old {
                if name != &field && fresh.contains_key(name) {
                    fresh.insert(name.clone(), old_value.clone());
                }
            }
        }
        *value = fresh;
        changed = FormChange::at(path);
    }
    if let Some(variant) = schema::variant_of(variants, value) {
        let schema = variant.schema;
        if let Some(kind) = geometry_of(cx.root, schema) {
            changed |= geometry(ui, cx, kind, value, path);
        } else if schema::properties(schema).len() > 1 {
            changed |= object(ui, cx, schema, value, path);
        }
    }
    changed
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum FieldGeometry {
    Pos,
    Rect,
}

pub fn geometry_of(root: &Value, schema: &Value) -> Option<FieldGeometry> {
    let schema = schema::resolve(root, schema);
    let tag = schema::tag_of(schema).map(|(tag, _)| tag);
    let mut names: Vec<&str> = schema::properties(schema)
        .iter()
        .filter(|(name, _)| tag.as_deref() != Some(name.as_str()))
        .filter(|(_, field)| {
            matches!(
                schema::kind(root, schema::resolve(root, field)),
                SchemaKind::Number | SchemaKind::Integer
            )
        })
        .map(|(name, _)| name.as_str())
        .collect();
    names.sort_unstable();
    let count = schema::properties(schema).len() - usize::from(tag.is_some());
    match names.as_slice() {
        ["x", "y"] if count == 2 => Some(FieldGeometry::Pos),
        ["h", "w", "x", "y"] if count == 4 => Some(FieldGeometry::Rect),
        _ => None,
    }
}

fn geometry(
    ui: &mut Ui,
    cx: &mut FormCx,
    kind: FieldGeometry,
    value: &mut Value,
    path: &str,
) -> FormChange {
    let id = ui.id().with(path).with("geometry");
    let number = |name: &str| {
        value[name]
            .as_f64()
            .map(|number| number.to_string())
            .unwrap_or_else(|| "0".to_owned())
    };
    let current = match kind {
        FieldGeometry::Pos => format!("{}, {}", number("x"), number("y")),
        FieldGeometry::Rect => format!(
            "{}, {} · {} × {}",
            number("x"),
            number("y"),
            number("w"),
            number("h")
        ),
    };
    let mut draft = draft_or(ui, id, current.clone());
    let response = boxed_input(ui, Some("tiles"), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .desired_width(f32::INFINITY),
        )
    });
    if response.changed() {
        set_draft(ui, id, &draft.clone());
    }
    let mut changed = FormChange::default();
    if committed(ui, &response) {
        clear_draft(ui, id);
        let numbers: Vec<f64> = draft
            .split(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
            .filter(|part| !part.is_empty())
            .filter_map(|part| part.parse().ok())
            .collect();
        let names: &[&str] = match kind {
            FieldGeometry::Pos => &["x", "y"],
            FieldGeometry::Rect => &["x", "y", "w", "h"],
        };
        if numbers.len() == names.len() {
            for (name, number) in names.iter().zip(numbers) {
                if value[*name].as_f64() != Some(number) {
                    value[*name] = Value::from(number);
                    changed = FormChange::at(path);
                }
            }
            cx.state.errors.remove(path);
        } else {
            cx.state.errors.insert(
                path.to_owned(),
                format!("{} numbers, like {current}", names.len()),
            );
        }
    }
    error_line(ui, cx, path);
    changed
}

fn choice(
    ui: &mut Ui,
    cx: &mut FormCx,
    alternatives: &[&Value],
    value: &mut Value,
    path: &str,
) -> FormChange {
    let mut changed = FormChange::default();
    let names: Vec<String> = alternatives
        .iter()
        .map(|alternative| describe(alternative))
        .collect();
    if let Some(name) = value.get("var").and_then(Value::as_str).map(str::to_owned)
        && value.as_object().is_some_and(|map| map.len() == 1)
    {
        let kinds: Vec<String> = names
            .iter()
            .filter(|n| n.as_str() != "Var")
            .map(|n| n.to_lowercase())
            .collect();
        let mut back = false;
        ui.horizontal(|ui| {
            let response = variable_chip(ui, &name)
                .on_hover_text("A hole each owner fills; click for a fixed value");
            if response.clicked() {
                back = true;
            }
            ui.label(theme::muted(format!("variable · {}", kinds.join(" or "))).size(12.5));
        });
        if back
            && let Some(first) = alternatives
                .iter()
                .find(|alternative| describe(alternative) != "Var")
        {
            *value = schema::template(cx.root, first);
            changed = FormChange::at(path);
        }
        return changed;
    }
    let current = alternatives
        .iter()
        .position(|alternative| fits(cx.root, alternative, value));
    let mut picked = current;
    if alternatives.len() > 1 {
        widgets::combo_box(ui.id().with(path).with("choice"))
            .selected_text(current.map(|at| names[at].as_str()).unwrap_or("pick…"))
            .show_ui(ui, |ui| {
                for (at, name) in names.iter().enumerate() {
                    ui.selectable_value(&mut picked, Some(at), name);
                }
            });
    }
    if picked != current
        && let Some(at) = picked
    {
        *value = schema::template(cx.root, alternatives[at]);
        changed = FormChange::at(path);
    }
    if let Some(at) = picked {
        let schema = alternatives[at];
        if schema::type_names(schema) != vec!["null"] {
            changed |= self::value(ui, cx, schema, value, &format!("{path}~{at}"));
        }
    }
    changed
}

fn describe(schema: &Value) -> String {
    if let Some(marker) = schema::marker(schema) {
        return schema::title(marker.trim_start_matches("x-"));
    }
    if let Some((_, tag)) = schema::tag_of(schema) {
        return schema::title(&tag);
    }
    if schema.get("oneOf").is_some() || schema.get("anyOf").is_some() {
        return "expression".to_owned();
    }
    let types = schema::type_names(schema);
    match types.iter().find(|name| **name != "null") {
        Some(name) => schema::title(name),
        None => "value".to_owned(),
    }
}

pub fn fits(root: &Value, schema: &Value, value: &Value) -> bool {
    let schema = schema::resolve(root, schema);
    if let Some(constant) = schema.get("const") {
        return constant == value;
    }
    if let Some(options) = schema.get("enum").and_then(Value::as_array) {
        return options.contains(value);
    }
    if let Some(alternatives) = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
    {
        return alternatives
            .iter()
            .any(|alternative| fits(root, alternative, value));
    }
    let types = schema::type_names(schema);
    if types.is_empty() {
        return true;
    }
    types.iter().any(|name| match *name {
        "null" => value.is_null(),
        "boolean" => value.is_boolean(),
        "integer" => value.is_i64() || value.is_u64(),
        "number" => value.is_number(),
        "string" => value.is_string(),
        "array" => value.is_array(),
        "object" => {
            value.is_object()
                && schema::required(schema)
                    .iter()
                    .all(|name| value.get(name).is_some())
                && schema
                    .get("properties")
                    .and_then(Value::as_object)
                    .is_none_or(|properties| {
                        properties
                            .iter()
                            .filter(|(name, _)| value.get(*name).is_some())
                            .all(|(name, field)| fits(root, field, &value[name]))
                    })
        }
        _ => true,
    })
}

fn array(ui: &mut Ui, cx: &mut FormCx, items: &Value, value: &mut Value, path: &str) -> FormChange {
    if !value.is_array() {
        *value = Value::Array(Vec::new());
    }
    let mut changed = FormChange::default();
    let item_schema = schema::resolve(cx.root, items);
    if schema::marker(item_schema) == Some("x-span") {
        return spans::line_field(ui, cx, value, path);
    }
    if let Some(options) = item_schema.get("enum").and_then(Value::as_array) {
        let list = value.as_array_mut().expect("array");
        ui.horizontal_wrapped(|ui| {
            for option in options {
                let text = option.as_str().unwrap_or("");
                let on = list.contains(option);
                if widgets::toggle_chip(ui, text, on).clicked() {
                    if on {
                        list.retain(|held| held != option);
                    } else {
                        list.push(option.clone());
                    }
                    changed = FormChange::at(path);
                }
            }
        });
        return changed;
    }
    let inline = schema::marker(item_schema).is_none()
        && matches!(schema::kind(cx.root, item_schema), SchemaKind::Object)
        && schema::properties(item_schema).len() <= 4
        && schema::properties(item_schema).iter().all(|(_, field)| {
            !matches!(
                schema::kind(cx.root, schema::resolve(cx.root, field)),
                SchemaKind::Array(_) | SchemaKind::Object | SchemaKind::Map(_)
            )
        });
    ui.vertical(|ui| {
        let list = value.as_array_mut().expect("array");
        let mut remove = None;
        let mut swap = None;
        let count = list.len();
        for (index, item) in list.iter_mut().enumerate() {
            let item_path = format!("{path}/{index}");
            ui.horizontal(|ui| {
                let response = ui
                    .add(egui::Label::new(theme::faint("×")).sense(egui::Sense::click()))
                    .on_hover_text("Remove");
                if response.clicked() {
                    remove = Some(index);
                }
                response.context_menu(|ui| {
                    if index > 0 && ui.button("Move up").clicked() {
                        swap = Some((index, index - 1));
                        ui.close();
                    }
                    if index + 1 < count && ui.button("Move down").clicked() {
                        swap = Some((index, index + 1));
                        ui.close();
                    }
                });
                if inline {
                    if !item.is_object() {
                        *item = Value::Object(Map::new());
                    }
                    let properties = schema::properties(item_schema);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        for (name, field) in properties.iter().rev() {
                            let field_path = format!("{item_path}/{name}");
                            let present = item.get(*name).is_some_and(|v| !v.is_null());
                            let resolved = schema::resolve(cx.root, field);
                            let is_reference = schema::marker(resolved) == Some("x-table");
                            if is_reference {
                                let child = item
                                    .as_object_mut()
                                    .expect("object")
                                    .entry((*name).clone())
                                    .or_insert(Value::String(String::new()));
                                ui.allocate_ui_with_layout(
                                    egui::vec2(
                                        ui.available_width().max(120.0),
                                        ui.spacing().interact_size.y,
                                    ),
                                    egui::Layout::left_to_right(egui::Align::Center),
                                    |ui| {
                                        changed |= self::value(ui, cx, field, child, &field_path);
                                    },
                                );
                            } else {
                                let mut draft = if present {
                                    item[*name].clone()
                                } else if (*name) == "chance" {
                                    Value::Null
                                } else {
                                    schema::template(cx.root, field)
                                };
                                ui.allocate_ui_with_layout(
                                    egui::vec2(64.0, ui.spacing().interact_size.y),
                                    egui::Layout::left_to_right(egui::Align::Center),
                                    |ui| {
                                        if !present {
                                            ui.style_mut().visuals.override_text_color =
                                                Some(theme::MUTED);
                                        }
                                        let edited =
                                            self::value(ui, cx, field, &mut draft, &field_path);
                                        if edited.is_some() {
                                            item.as_object_mut()
                                                .expect("object")
                                                .insert((*name).clone(), draft);
                                            changed |= edited;
                                        }
                                    },
                                )
                                .response
                                .on_hover_text(if present {
                                    name.to_string()
                                } else {
                                    format!("{name} · not set, the default")
                                });
                            }
                        }
                    });
                } else {
                    ui.vertical(|ui| {
                        changed |= self::value(ui, cx, items, item, &item_path);
                    });
                }
            });
        }
        if let Some(index) = remove {
            list.remove(index);
            changed = FormChange::at(path);
        }
        if let Some((a, b)) = swap {
            list.swap(a, b);
            changed = FormChange::at(path);
        }
        let singular = path
            .rsplit('/')
            .next()
            .map(|name| name.strip_suffix('s').unwrap_or(name).to_owned())
            .filter(|name| !name.is_empty() && name.parse::<usize>().is_err())
            .unwrap_or_else(|| "entry".to_owned());
        if ui.button(format!("+ {singular}")).clicked() {
            list.push(schema::template(cx.root, items));
            changed = FormChange::at(path);
        }
    });
    changed
}

fn chance(ui: &mut Ui, value: &mut Value, path: &str) -> FormChange {
    let id = ui.id().with(path).with("chance");
    let current = value
        .as_f64()
        .map(|number| number.to_string())
        .unwrap_or_default();
    let mut draft = draft_or(ui, id, current.clone());
    let response = boxed_input(ui, Some("%"), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .hint_text(theme::muted("always"))
                .desired_width(f32::INFINITY),
        )
    });
    if response.changed() {
        set_draft(ui, id, &draft.clone());
    }
    if committed(ui, &response) {
        clear_draft(ui, id);
        if draft.trim() != current.trim() {
            *value = match draft.trim().parse::<f64>() {
                Ok(number) => Value::from(number),
                Err(_) => Value::Null,
            };
            return FormChange::at(path);
        }
    }
    FormChange::default()
}

fn map(ui: &mut Ui, cx: &mut FormCx, values: &Value, value: &mut Value, path: &str) -> FormChange {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let mut changed = FormChange::default();
    ui.vertical(|ui| {
        let entries = value.as_object_mut().expect("object");
        let mut remove = None;
        let mut rename = None;
        for (key, item) in entries.iter_mut() {
            let item_path = format!("{path}/{key}");
            ui.horizontal(|ui| {
                if ui.small_button("×").clicked() {
                    remove = Some(key.clone());
                }
                let id = ui.id().with(&item_path).with("key");
                let mut draft = draft_or(ui, id, key.clone());
                let response = ui.add(egui::TextEdit::singleline(&mut draft).desired_width(110.0));
                if response.changed() {
                    set_draft(ui, id, &draft.clone());
                }
                if committed(ui, &response) {
                    clear_draft(ui, id);
                    if draft != *key && !draft.is_empty() {
                        rename = Some((key.clone(), draft));
                    }
                }
                ui.vertical(|ui| {
                    changed |= self::value(ui, cx, values, item, &item_path);
                });
            });
        }
        if let Some(key) = remove {
            entries.remove(&key);
            changed = FormChange::at(path);
        }
        if let Some((from, to)) = rename
            && let Some(item) = entries.remove(&from)
        {
            entries.insert(to, item);
            changed = FormChange::at(path);
        }
        ui.horizontal(|ui| {
            let id = ui.id().with(path).with("new-key");
            let mut draft = draft_of(ui, id).unwrap_or_default();
            let response = ui.add(
                egui::TextEdit::singleline(&mut draft)
                    .hint_text("new key")
                    .desired_width(110.0),
            );
            if response.changed() {
                set_draft(ui, id, &draft.clone());
            }
            let add = ui.small_button("+ add").clicked()
                || (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)));
            if add && !draft.is_empty() && !entries.contains_key(&draft) {
                entries.insert(draft, schema::template(cx.root, values));
                clear_draft(ui, id);
                changed = FormChange::at(path);
            }
        });
    });
    changed
}

pub fn text(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let id = ui.id().with(path).with("text");
    let current = value.as_str().unwrap_or_default().to_owned();
    let mut draft = draft_or(ui, id, current.clone());
    let multiline = current.len() > 60 || current.contains('\n');
    let response = boxed_input(ui, None, |ui| {
        if multiline {
            ui.add(
                egui::TextEdit::multiline(&mut draft)
                    .frame(egui::Frame::NONE)
                    .desired_rows(2)
                    .desired_width(f32::INFINITY),
            )
        } else {
            ui.add(
                egui::TextEdit::singleline(&mut draft)
                    .frame(egui::Frame::NONE)
                    .desired_width(f32::INFINITY),
            )
        }
    });
    if response.changed() {
        set_draft(ui, id, &draft.clone());
    }
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) && response.has_focus() {
        clear_draft(ui, id);
        cx.state.errors.remove(path);
        return FormChange::default();
    }
    let mut changed = FormChange::default();
    if committed(ui, &response) {
        clear_draft(ui, id);
        if draft != current {
            *value = Value::String(draft);
            changed = FormChange::at(path);
        }
    }
    error_line(ui, cx, path);
    changed
}

pub fn number(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
    integer: bool,
) -> FormChange {
    let id = ui.id().with(path).with("number");
    let current = value
        .as_f64()
        .map(|number| number.to_string())
        .unwrap_or_default();
    let mut draft = draft_or(ui, id, current.clone());
    let unit = schema["x-unit"].as_str().map(str::to_owned);
    let response = boxed_input(ui, unit.as_deref(), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .desired_width(f32::INFINITY),
        )
    });
    if std::mem::take(&mut cx.autofocus) {
        response.request_focus();
    }
    if response.changed() {
        set_draft(ui, id, &draft.clone());
    }
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) && response.has_focus() {
        clear_draft(ui, id);
        cx.state.errors.remove(path);
        return FormChange::default();
    }
    let mut changed = FormChange::default();
    if committed(ui, &response) {
        clear_draft(ui, id);
        if draft.trim() != current {
            match draft.trim().parse::<f64>() {
                Ok(parsed) => {
                    let min = schema::minimum(schema);
                    let max = schema::maximum(schema);
                    if min.is_some_and(|min| parsed < min) || max.is_some_and(|max| parsed > max) {
                        cx.state.errors.insert(
                            path.to_owned(),
                            match (min, max) {
                                (Some(min), Some(max)) => {
                                    format!("{} to {} only", min, max)
                                }
                                (Some(min), None) => format!("at least {}", min),
                                (None, Some(max)) => format!("at most {}", max),
                                (None, None) => String::new(),
                            },
                        );
                    } else {
                        cx.state.errors.remove(path);
                        *value = if integer {
                            Value::from(parsed.round() as i64)
                        } else {
                            Value::from(parsed)
                        };
                        changed = FormChange::at(path);
                    }
                }
                Err(_) => {
                    cx.state
                        .errors
                        .insert(path.to_owned(), format!("not a number: {}", draft.trim()));
                }
            }
        }
    }
    error_line(ui, cx, path);
    changed
}

pub fn tiles(value: f32) -> String {
    ((value as f64 * 1000.0).round() / 1000.0).to_string()
}

pub fn boxed_input(
    ui: &mut Ui,
    unit: Option<&str>,
    input: impl FnOnce(&mut Ui) -> egui::Response,
) -> egui::Response {
    let focused_id = ui.ctx().memory(|m| m.focused());
    let frame = egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(8, 3));
    let mut inner = None;
    let outer = frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            if let Some(unit) = unit {
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(theme::faint(unit).size(12.0));
                    inner = Some(input(ui));
                });
            } else {
                inner = Some(input(ui));
            }
        });
    });
    let response = inner.expect("the input was drawn");
    if focused_id == Some(response.id) || response.has_focus() {
        ui.painter().rect_stroke(
            outer.response.rect,
            4.0,
            egui::Stroke::new(1.0, theme::ACCENT),
            egui::StrokeKind::Inside,
        );
    }
    response
}

fn boolean(ui: &mut Ui, value: &mut Value, path: &str) -> FormChange {
    let mut on = value.as_bool().unwrap_or(false);
    if ui.checkbox(&mut on, "").changed() {
        *value = Value::Bool(on);
        return FormChange::at(path);
    }
    FormChange::default()
}

fn enum_combo(ui: &mut Ui, options: &[String], value: &mut Value, path: &str) -> FormChange {
    let current = value.as_str().unwrap_or_default().to_owned();
    let mut picked = current.clone();
    widgets::combo_box(ui.id().with(path).with("enum"))
        .selected_text(schema::title(&current))
        .show_ui(ui, |ui| {
            for option in options {
                ui.selectable_value(&mut picked, option.clone(), schema::title(option));
            }
        });
    if picked != current {
        *value = Value::String(picked);
        return FormChange::at(path);
    }
    FormChange::default()
}

fn color(ui: &mut Ui, value: &mut Value, path: &str) -> FormChange {
    let mut rgba = value::rgba(value);
    let mut changed = FormChange::default();
    ui.horizontal(|ui| {
        let response = ui.color_edit_button_srgba_unmultiplied(&mut rgba);
        if response.changed() {
            *value = Value::Array(rgba.iter().map(|byte| Value::from(*byte)).collect());
            changed = FormChange::at(path);
        }
        egui::Frame::new()
            .fill(theme::INPUT)
            .stroke(egui::Stroke::new(1.0, theme::BORDER))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(8, 3))
            .show(ui, |ui| {
                ui.label(
                    theme::mono(format!(
                        "{}, {}, {}, {}",
                        rgba[0], rgba[1], rgba[2], rgba[3]
                    ))
                    .size(13.0),
                );
            });
    });
    changed
}

pub fn raw_json(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let id = ui.id().with(path).with("json");
    let current = serde_json::to_string(value).unwrap_or_default();
    let mut draft = draft_or(ui, id, current.clone());
    let response = ui.add(
        egui::TextEdit::singleline(&mut draft)
            .desired_width(f32::INFINITY)
            .font(egui::TextStyle::Monospace),
    );
    if response.changed() {
        set_draft(ui, id, &draft.clone());
    }
    if committed(ui, &response) {
        clear_draft(ui, id);
        if draft != current {
            match serde_json::from_str::<Value>(&draft) {
                Ok(parsed) => {
                    *value = parsed;
                    return FormChange::at(path);
                }
                Err(error) => {
                    cx.state.errors.insert(path.to_owned(), error.to_string());
                }
            }
        }
    }
    error_line(ui, cx, path);
    FormChange::default()
}

pub fn reference(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    let table = schema::table_of(schema).unwrap_or_default().to_owned();
    let mut key = value.as_str().unwrap_or_default().to_owned();
    let changed = picker::row(ui, cx, &table, &mut key, path);
    if changed {
        *value = Value::String(key);
        return FormChange::at(path);
    }
    FormChange::default()
}

fn asset(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let mut file = value.as_str().unwrap_or_default().to_owned();
    if picker::asset(ui, cx, &mut file, path) {
        *value = Value::String(file);
        return FormChange::at(path);
    }
    FormChange::default()
}

fn face(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let mut faces: Vec<String> = busts::generic().map(str::to_owned).collect();
    if let Some(speaker) = &cx.speaker
        && let Some(npc) = cx.files.json(&row_file("npc", speaker))
        && let Some(model) = npc["model"].as_str()
        && let Some(model) = cx.files.json(&row_file("model", model))
    {
        for module in model["modules"].as_array().into_iter().flatten() {
            if module["type"] == "bust" {
                for own in module["own"].as_array().into_iter().flatten() {
                    if let Some(name) = own["name"].as_str() {
                        faces.push(name.to_owned());
                    }
                }
            }
        }
    }
    enum_combo(ui, &faces, value, path)
}

fn place(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    if !value.is_object() {
        *value = schema::template(cx.root, schema);
    }
    let mut changed = FormChange::default();
    let mut area = value["area"].as_str().unwrap_or_default().to_owned();
    if picker::row(ui, cx, "area", &mut area, &format!("{path}/area")) {
        value["area"] = Value::String(area);
        changed = FormChange::at(path);
    }
    ui.horizontal(|ui| {
        ui.add_sized(
            egui::vec2(28.0, ui.spacing().interact_size.y),
            egui::Label::new(theme::muted("at").monospace().size(13.0)),
        );
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui
                .button("⌖ pick")
                .on_hover_text("Pick the place on its area")
                .clicked()
            {
                cx.actions.push(FormAction::PickPlace {
                    path: path.to_owned(),
                });
            }
            changed |= geometry(ui, cx, FieldGeometry::Pos, value, path);
        });
    });
    changed
}

pub fn drafted(
    ui: &mut Ui,
    id: egui::Id,
    current: &str,
    input: impl FnOnce(&mut Ui, &mut String) -> egui::Response,
) -> Option<String> {
    let mut draft = draft_or(ui, id, current.to_owned());
    let response = input(ui, &mut draft);
    if committed(ui, &response) {
        clear_draft(ui, id);
        return (draft != current).then_some(draft);
    }
    if response.has_focus() {
        set_draft(ui, id, &draft);
    } else {
        clear_draft(ui, id);
    }
    None
}

pub fn draft_of(ui: &Ui, id: egui::Id) -> Option<String> {
    ui.ctx().data(|d| d.get_temp::<String>(id))
}

pub fn draft_or(ui: &Ui, id: egui::Id, current: String) -> String {
    draft_of(ui, id).unwrap_or(current)
}

pub fn set_draft(ui: &Ui, id: egui::Id, text: &str) {
    ui.ctx().data_mut(|d| d.insert_temp(id, text.to_owned()));
}

pub fn take_draft(ui: &Ui, id: egui::Id) -> Option<String> {
    ui.ctx().data_mut(|d| d.remove_temp::<String>(id))
}

pub fn clear_draft(ui: &Ui, id: egui::Id) {
    take_draft(ui, id);
}

pub fn committed(ui: &Ui, response: &egui::Response) -> bool {
    response.lost_focus() && !ui.input(|i| i.key_pressed(egui::Key::Escape))
}

pub fn error_line(ui: &mut Ui, cx: &FormCx, path: &str) {
    if let Some(error) = cx.state.errors.get(path) {
        ui.colored_label(theme::DANGER, error);
    }
}
