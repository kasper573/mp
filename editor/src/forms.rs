use std::collections::{HashMap, HashSet};

use egui::{Color32, Ui};
use game::core::content::Content;
use serde_json::{Map, Value};

use crate::project::Files;
use crate::schema::{self, Kind, Shapes, Variant};
use crate::usages::Usages;

pub struct FormCx<'a> {
    pub root: &'a Value,
    pub content: Option<Content>,
    pub files: &'a Files,
    pub usages: &'a Usages,
    pub shapes: &'a Shapes,
    pub state: &'a mut FormState,
    pub actions: &'a mut Vec<FormAction>,
    pub speaker: Option<String>,
    pub owner_table: Option<String>,
    pub owner_key: Option<String>,
    pub holes: Option<Holes>,
}

impl<'a> FormCx<'a> {
    pub fn new(
        project: &'a crate::project::Project,
        root: &'a Value,
        shapes: &'a Shapes,
        state: &'a mut FormState,
        actions: &'a mut Vec<FormAction>,
    ) -> FormCx<'a> {
        FormCx {
            root,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state,
            actions,
            speaker: None,
            owner_table: None,
            owner_key: None,
            holes: None,
        }
    }
}

#[derive(Default)]
pub struct Holes {
    pub filled: Vec<(String, String)>,
    pub open: Vec<(String, String)>,
    pub variables: Vec<(String, String)>,
    pub requests: Vec<HoleRequest>,
}

pub enum HoleRequest {
    Make { field: String, kind: String },
    Use { field: String, name: String },
    Fix { field: String, name: String },
}

#[derive(Default)]
pub struct FormState {
    pub drafts: HashMap<egui::Id, String>,
    pub errors: HashMap<String, String>,
    pub folded: HashSet<String>,
    pub unfolded: HashSet<String>,
    pub status: Vec<String>,
    pub thumbnails: crate::thumbs::Thumbnails,
}

pub enum FormAction {
    OpenRow { table: String, key: String },
    OpenScript { pointer: String },
    PickPlace { path: String },
    NewRow { table: String, path: String },
    RowAction(crate::ui::browser::Action),
}

#[derive(Default)]
pub struct Changed(pub Option<String>);

impl Changed {
    pub fn at(path: &str) -> Changed {
        Changed(Some(path.to_owned()))
    }

    pub fn or(self, other: Changed) -> Changed {
        Changed(self.0.or(other.0))
    }

    pub fn is_some(&self) -> bool {
        self.0.is_some()
    }
}

pub const LABEL_WIDTH: f32 = 124.0;

pub fn value(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> Changed {
    let filled = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.filled.iter().find(|(field, _)| field == path))
        .map(|(_, name)| name.clone());
    if let Some(name) = filled {
        hole_chip(ui, cx, path, &name);
        return Changed::default();
    }
    let open = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.open.iter().find(|(field, _)| field == path))
        .map(|(_, kind)| kind.clone());
    let Some(kind) = open else {
        return plain(ui, cx, schema, value, path);
    };
    let mut changed = Changed::default();
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Min), |ui| {
        hole_menu(ui, cx, path, &kind);
        ui.with_layout(egui::Layout::top_down(egui::Align::Min), |ui| {
            ui.set_min_width(ui.available_width());
            changed = plain(ui, cx, schema, value, path);
        });
    });
    changed
}

fn hole_chip(ui: &mut Ui, cx: &mut FormCx, path: &str, name: &str) {
    let ink = Color32::from_rgb(176, 140, 230);
    let kind = cx
        .holes
        .as_ref()
        .and_then(|holes| holes.variables.iter().find(|(n, _)| n == name))
        .map(|(_, kind)| kind.clone())
        .unwrap_or_default();
    ui.horizontal(|ui| {
        let chip = egui::Frame::new()
            .fill(Color32::from_rgba_unmultiplied(176, 140, 230, 30))
            .stroke(egui::Stroke::new(1.0, ink))
            .corner_radius(10.0)
            .inner_margin(egui::Margin::symmetric(8, 2))
            .show(ui, |ui| {
                ui.label(
                    egui::RichText::new(format!("◇ {name}"))
                        .monospace()
                        .size(12.5)
                        .color(ink),
                );
            })
            .response
            .interact(egui::Sense::click())
            .on_hover_text("Filled by the variable at each placement; click to change");
        ui.label(crate::ui::theme::muted(&kind).size(12.5));
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
                            .filter(|(other, k)| other != name && *k == kind)
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

fn hole_menu(ui: &mut Ui, cx: &mut FormCx, path: &str, kind: &str) {
    let button = ui
        .add(egui::Button::new(crate::ui::theme::muted("◇")).frame(false))
        .on_hover_text("Make this field a variable, or fill it from one");
    egui::Popup::from_toggle_button_response(&button)
        .id(ui.id().with(("hole", path)))
        .width(260.0)
        .show(|ui| {
            ui.label(
                crate::ui::theme::faint(format!("{} · {kind}", field_name(path)))
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
                        kind: kind.to_owned(),
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
                        .filter(|(_, k)| k == kind)
                        .map(|(name, _)| name.clone())
                        .collect()
                })
                .unwrap_or_default();
            if fitting.is_empty() {
                ui.add_enabled_ui(false, |ui| {
                    let _ = ui.button(format!("Use variable · no {kind} variable yet"));
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

fn plain(ui: &mut Ui, cx: &mut FormCx, schema: &Value, value: &mut Value, path: &str) -> Changed {
    let schema = schema::resolve(cx.root, schema);
    if path.ends_with("/chance") && matches!(schema::kind(cx.root, schema), Kind::Choice(_)) {
        return chance(ui, cx, value, path);
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
            "x-span" => return crate::spans::edit(ui, cx, schema, value, path),
            "x-condition" => return crate::condition::edit(ui, cx, schema, value, path),
            _ => {}
        }
    }
    match schema::kind(cx.root, schema) {
        Kind::Const(constant) => {
            if value != constant {
                *value = constant.clone();
            }
            ui.label(constant.as_str().unwrap_or_default());
            Changed::default()
        }
        Kind::Enum(options) => enum_combo(ui, &options, value, path),
        Kind::Union(variants) => union(ui, cx, &variants, value, path),
        Kind::Choice(alternatives) => choice(ui, cx, &alternatives, value, path),
        Kind::Object => match geometry_of(cx.root, schema) {
            Some(kind) => geometry(ui, cx, kind, value, path),
            None => object(ui, cx, schema, value, path),
        },
        Kind::Array(items) => array(ui, cx, items, value, path),
        Kind::Map(values) => map(ui, cx, values, value, path),
        Kind::Text => text(ui, cx, value, path),
        Kind::Integer => number(ui, cx, schema, value, path, true),
        Kind::Number => number(ui, cx, schema, value, path, false),
        Kind::Boolean => boolean(ui, value, path),
        Kind::Null => {
            ui.label("—");
            Changed::default()
        }
        Kind::Any => raw_json(ui, cx, value, path),
    }
}

pub fn object(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> Changed {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let required = schema::required(schema);
    let mut changed = Changed::default();
    for (name, field) in schema::properties(schema) {
        if schema::tag_of(schema).is_some_and(|(tag, _)| tag == *name) {
            continue;
        }
        let field_path = format!("{path}/{name}");
        let present = value.get(name).is_some_and(|v| !v.is_null());
        let optional = !required.contains(&name.as_str()) || schema::is_optional(field);
        let resolved = schema::resolve(cx.root, field);
        let nested = present
            && schema::marker(resolved).is_none()
            && matches!(schema::kind(cx.root, resolved), Kind::Object)
            && geometry_of(cx.root, resolved).is_none();
        let list_of_objects = present
            && match schema::kind(cx.root, resolved) {
                Kind::Array(items) => matches!(
                    schema::kind(cx.root, schema::resolve(cx.root, items)),
                    Kind::Object
                ),
                _ => false,
            };
        if list_of_objects {
            ui.horizontal(|ui| {
                ui.label(crate::ui::theme::muted(name).monospace().size(13.0));
                if optional
                    && ui
                        .add(
                            egui::Label::new(crate::ui::theme::faint("✕").size(11.0))
                                .sense(egui::Sense::click()),
                        )
                        .on_hover_text(format!("Unset {name}"))
                        .clicked()
                {
                    value.as_object_mut().expect("object").remove(name);
                    changed = Changed::at(&field_path);
                }
            });
            if let Some(child) = value.get_mut(name) {
                changed =
                    std::mem::take(&mut changed).or(self::value(ui, cx, field, child, &field_path));
            }
            continue;
        }
        if nested {
            ui.horizontal(|ui| {
                crate::ui::widgets::section(ui, name);
                if optional
                    && ui
                        .small_button("×")
                        .on_hover_text(format!("Unset {name}"))
                        .clicked()
                {
                    value.as_object_mut().expect("object").remove(name);
                    changed = Changed::at(&field_path);
                }
            });
            if value.get(name).is_some() {
                let child = value.get_mut(name).expect("present");
                changed =
                    std::mem::take(&mut changed).or(object(ui, cx, field, child, &field_path));
            }
            continue;
        }
        let row_id = ui.id().with(&field_path).with("row");
        let hovered = ui
            .ctx()
            .data(|d| d.get_temp::<egui::Rect>(row_id))
            .is_some_and(|rect| ui.rect_contains_pointer(rect));
        let row = ui.horizontal(|ui| {
            ui.allocate_ui_with_layout(
                egui::vec2(LABEL_WIDTH, ui.spacing().interact_size.y),
                egui::Layout::left_to_right(egui::Align::Center),
                |ui| {
                    if optional && !present {
                        if ui
                            .add(
                                egui::Label::new(
                                    crate::ui::theme::faint(format!("+ {name}"))
                                        .monospace()
                                        .size(13.0),
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
                            changed = Changed::at(&field_path);
                        }
                        return;
                    }
                    ui.add(
                        egui::Label::new(crate::ui::theme::muted(name).monospace().size(13.0))
                            .truncate(),
                    );
                    if optional && hovered {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui
                                .add(
                                    egui::Label::new(crate::ui::theme::faint("✕").size(11.0))
                                        .sense(egui::Sense::click()),
                                )
                                .on_hover_text(format!("Unset {name}"))
                                .clicked()
                            {
                                value.as_object_mut().expect("object").remove(name);
                                changed = Changed::at(&field_path);
                            }
                        });
                    }
                },
            );
            if present {
                let child = value.get_mut(name).expect("present");
                ui.vertical(|ui| {
                    ui.set_min_width(ui.available_width());
                    changed = std::mem::take(&mut changed).or(self::value(
                        ui,
                        cx,
                        field,
                        child,
                        &field_path,
                    ));
                });
            } else {
                ui.label(crate::ui::theme::faint("—"));
            }
        });
        ui.ctx()
            .data_mut(|d| d.insert_temp(row_id, row.response.rect));
    }
    changed
}

fn union(
    ui: &mut Ui,
    cx: &mut FormCx,
    variants: &[Variant],
    value: &mut Value,
    path: &str,
) -> Changed {
    let mut changed = Changed::default();
    if let Some(name) = value.get("var").and_then(Value::as_str).map(str::to_owned)
        && value.as_object().is_some_and(|map| map.len() == 1)
    {
        ui.horizontal(|ui| {
            let fill = Color32::from_rgba_unmultiplied(176, 140, 230, 30);
            egui::Frame::new()
                .fill(fill)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(176, 140, 230)))
                .corner_radius(10.0)
                .inner_margin(egui::Margin::symmetric(8, 2))
                .show(ui, |ui| {
                    ui.label(
                        egui::RichText::new(format!("◇ {name}"))
                            .monospace()
                            .size(12.5)
                            .color(Color32::from_rgb(176, 140, 230)),
                    );
                });
            let kinds: Vec<String> = variants
                .iter()
                .map(|variant| schema::title(&variant.tag).to_lowercase())
                .collect();
            ui.label(
                crate::ui::theme::muted(format!("variable · {}", kinds.join(" or "))).size(12.5),
            );
        });
        return changed;
    }
    let current = schema::variant_of(variants, value).map(|variant| variant.tag.clone());
    let field = variants
        .first()
        .map(|variant| variant.field.clone())
        .unwrap_or_else(|| "type".to_owned());
    let mut picked = current.clone();
    egui::ComboBox::from_id_salt(ui.id().with(path).with("variant"))
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
        changed = Changed::at(path);
    }
    if let Some(variant) = schema::variant_of(variants, value) {
        let schema = variant.schema;
        if let Some(kind) = geometry_of(cx.root, schema) {
            changed = changed.or(geometry(ui, cx, kind, value, path));
        } else if schema::properties(schema).len() > 1 {
            changed = changed.or(object(ui, cx, schema, value, path));
        }
    }
    changed
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Geometry {
    Pos,
    Rect,
}

pub fn geometry_of(root: &Value, schema: &Value) -> Option<Geometry> {
    let schema = schema::resolve(root, schema);
    let tag = schema::tag_of(schema).map(|(tag, _)| tag);
    let mut names: Vec<&str> = schema::properties(schema)
        .iter()
        .filter(|(name, _)| tag.as_deref() != Some(name.as_str()))
        .filter(|(_, field)| {
            matches!(
                schema::kind(root, schema::resolve(root, field)),
                Kind::Number | Kind::Integer
            )
        })
        .map(|(name, _)| name.as_str())
        .collect();
    names.sort_unstable();
    let count = schema::properties(schema).len() - usize::from(tag.is_some());
    match names.as_slice() {
        ["x", "y"] if count == 2 => Some(Geometry::Pos),
        ["h", "w", "x", "y"] if count == 4 => Some(Geometry::Rect),
        _ => None,
    }
}

fn geometry(
    ui: &mut Ui,
    cx: &mut FormCx,
    kind: Geometry,
    value: &mut Value,
    path: &str,
) -> Changed {
    let id = ui.id().with(path).with("geometry");
    let number = |name: &str| {
        value[name]
            .as_f64()
            .map(trim_number)
            .unwrap_or_else(|| "0".to_owned())
    };
    let current = match kind {
        Geometry::Pos => format!("{}, {}", number("x"), number("y")),
        Geometry::Rect => format!(
            "{}, {} · {} × {}",
            number("x"),
            number("y"),
            number("w"),
            number("h")
        ),
    };
    let mut draft = cx
        .state
        .drafts
        .get(&id)
        .cloned()
        .unwrap_or_else(|| current.clone());
    let response = boxed_input(ui, Some("tiles"), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .desired_width(f32::INFINITY),
        )
    });
    if response.changed() {
        cx.state.drafts.insert(id, draft.clone());
    }
    let mut changed = Changed::default();
    if committed(ui, &response) {
        cx.state.drafts.remove(&id);
        let numbers: Vec<f64> = draft
            .split(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
            .filter(|part| !part.is_empty())
            .filter_map(|part| part.parse().ok())
            .collect();
        let names: &[&str] = match kind {
            Geometry::Pos => &["x", "y"],
            Geometry::Rect => &["x", "y", "w", "h"],
        };
        if numbers.len() == names.len() {
            for (name, number) in names.iter().zip(numbers) {
                if value[*name].as_f64() != Some(number) {
                    value[*name] = Value::from(number);
                    changed = Changed::at(path);
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
) -> Changed {
    let mut changed = Changed::default();
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
            let fill = Color32::from_rgba_unmultiplied(176, 140, 230, 30);
            let response = egui::Frame::new()
                .fill(fill)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(176, 140, 230)))
                .corner_radius(10.0)
                .inner_margin(egui::Margin::symmetric(8, 2))
                .show(ui, |ui| {
                    ui.label(
                        egui::RichText::new(format!("◇ {name}"))
                            .monospace()
                            .size(12.5)
                            .color(Color32::from_rgb(176, 140, 230)),
                    );
                })
                .response
                .interact(egui::Sense::click())
                .on_hover_text("A hole each owner fills; click for a fixed value");
            if response.clicked() {
                back = true;
            }
            ui.label(
                crate::ui::theme::muted(format!("variable · {}", kinds.join(" or "))).size(12.5),
            );
        });
        if back
            && let Some(first) = alternatives
                .iter()
                .find(|alternative| describe(alternative) != "Var")
        {
            *value = schema::template(cx.root, first);
            changed = Changed::at(path);
        }
        return changed;
    }
    let current = alternatives
        .iter()
        .position(|alternative| fits(cx.root, alternative, value));
    let mut picked = current;
    if alternatives.len() > 1 {
        egui::ComboBox::from_id_salt(ui.id().with(path).with("choice"))
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
        changed = Changed::at(path);
    }
    if let Some(at) = picked {
        let schema = alternatives[at];
        if schema::type_names(schema) != vec!["null"] {
            changed = changed.or(self::value(ui, cx, schema, value, &format!("{path}~{at}")));
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

fn array(ui: &mut Ui, cx: &mut FormCx, items: &Value, value: &mut Value, path: &str) -> Changed {
    if !value.is_array() {
        *value = Value::Array(Vec::new());
    }
    let mut changed = Changed::default();
    let item_schema = schema::resolve(cx.root, items);
    if schema::marker(item_schema) == Some("x-span") {
        return crate::spans::line_field(ui, cx, value, path);
    }
    if let Some(options) = item_schema.get("enum").and_then(Value::as_array) {
        let list = value.as_array_mut().expect("array");
        ui.horizontal_wrapped(|ui| {
            for option in options {
                let text = option.as_str().unwrap_or("");
                let on = list.contains(option);
                let (fill, ink) = if on {
                    (crate::ui::theme::ACCENT_SOFT, crate::ui::theme::TEXT)
                } else {
                    (crate::ui::theme::RAISED, crate::ui::theme::MUTED)
                };
                if crate::ui::widgets::chip_coloured(ui, text, fill, ink).clicked() {
                    if on {
                        list.retain(|held| held != option);
                    } else {
                        list.push(option.clone());
                    }
                    changed = Changed::at(path);
                }
            }
        });
        return changed;
    }
    let inline = schema::marker(item_schema).is_none()
        && matches!(schema::kind(cx.root, item_schema), Kind::Object)
        && schema::properties(item_schema).len() <= 4
        && schema::properties(item_schema).iter().all(|(_, field)| {
            !matches!(
                schema::kind(cx.root, schema::resolve(cx.root, field)),
                Kind::Array(_) | Kind::Object | Kind::Map(_)
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
                    .add(egui::Label::new(crate::ui::theme::faint("×")).sense(egui::Sense::click()))
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
                                        changed = std::mem::take(&mut changed).or(self::value(
                                            ui,
                                            cx,
                                            field,
                                            child,
                                            &field_path,
                                        ));
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
                                                Some(crate::ui::theme::MUTED);
                                        }
                                        let edited =
                                            self::value(ui, cx, field, &mut draft, &field_path);
                                        if edited.is_some() {
                                            item.as_object_mut()
                                                .expect("object")
                                                .insert((*name).clone(), draft);
                                            changed = std::mem::take(&mut changed).or(edited);
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
                        changed = std::mem::take(&mut changed)
                            .or(self::value(ui, cx, items, item, &item_path));
                    });
                }
            });
        }
        if let Some(index) = remove {
            list.remove(index);
            changed = Changed::at(path);
        }
        if let Some((a, b)) = swap {
            list.swap(a, b);
            changed = Changed::at(path);
        }
        let singular = path
            .rsplit('/')
            .next()
            .map(|name| name.strip_suffix('s').unwrap_or(name).to_owned())
            .filter(|name| !name.is_empty() && name.parse::<usize>().is_err())
            .unwrap_or_else(|| "entry".to_owned());
        if ui.button(format!("+ {singular}")).clicked() {
            list.push(schema::template(cx.root, items));
            changed = Changed::at(path);
        }
    });
    changed
}

fn chance(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> Changed {
    let id = ui.id().with(path).with("chance");
    let current = value.as_f64().map(trim_number).unwrap_or_default();
    let mut draft = cx
        .state
        .drafts
        .get(&id)
        .cloned()
        .unwrap_or_else(|| current.clone());
    let response = boxed_input(ui, Some("%"), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .hint_text(crate::ui::theme::muted("always"))
                .desired_width(f32::INFINITY),
        )
    });
    if response.changed() {
        cx.state.drafts.insert(id, draft.clone());
    }
    if committed(ui, &response) {
        cx.state.drafts.remove(&id);
        if draft.trim() != current.trim() {
            *value = match draft.trim().parse::<f64>() {
                Ok(number) => Value::from(number),
                Err(_) => Value::Null,
            };
            return Changed::at(path);
        }
    }
    Changed::default()
}

fn map(ui: &mut Ui, cx: &mut FormCx, values: &Value, value: &mut Value, path: &str) -> Changed {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let mut changed = Changed::default();
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
                let mut draft = cx
                    .state
                    .drafts
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| key.clone());
                let response = ui.add(egui::TextEdit::singleline(&mut draft).desired_width(110.0));
                if response.changed() {
                    cx.state.drafts.insert(id, draft.clone());
                }
                if committed(ui, &response) {
                    cx.state.drafts.remove(&id);
                    if draft != *key && !draft.is_empty() {
                        rename = Some((key.clone(), draft));
                    }
                }
                ui.vertical(|ui| {
                    changed = std::mem::take(&mut changed)
                        .or(self::value(ui, cx, values, item, &item_path));
                });
            });
        }
        if let Some(key) = remove {
            entries.remove(&key);
            changed = Changed::at(path);
        }
        if let Some((from, to)) = rename
            && let Some(item) = entries.remove(&from)
        {
            entries.insert(to, item);
            changed = Changed::at(path);
        }
        ui.horizontal(|ui| {
            let id = ui.id().with(path).with("new-key");
            let mut draft = cx.state.drafts.get(&id).cloned().unwrap_or_default();
            let response = ui.add(
                egui::TextEdit::singleline(&mut draft)
                    .hint_text("new key")
                    .desired_width(110.0),
            );
            if response.changed() {
                cx.state.drafts.insert(id, draft.clone());
            }
            let add = ui.small_button("+ add").clicked()
                || (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)));
            if add && !draft.is_empty() && !entries.contains_key(&draft) {
                entries.insert(draft, schema::template(cx.root, values));
                cx.state.drafts.remove(&id);
                changed = Changed::at(path);
            }
        });
    });
    changed
}

pub fn text(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> Changed {
    let id = ui.id().with(path).with("text");
    let current = value.as_str().unwrap_or_default().to_owned();
    let mut draft = cx
        .state
        .drafts
        .get(&id)
        .cloned()
        .unwrap_or_else(|| current.clone());
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
        cx.state.drafts.insert(id, draft.clone());
    }
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) && response.has_focus() {
        cx.state.drafts.remove(&id);
        cx.state.errors.remove(path);
        return Changed::default();
    }
    let mut changed = Changed::default();
    if committed(ui, &response) {
        cx.state.drafts.remove(&id);
        if draft != current {
            *value = Value::String(draft);
            changed = Changed::at(path);
        }
    }
    error_line(ui, cx, path);
    changed
}

fn number(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
    integer: bool,
) -> Changed {
    let id = ui.id().with(path).with("number");
    let current = value.as_f64().map(trim_number).unwrap_or_default();
    let mut draft = cx
        .state
        .drafts
        .get(&id)
        .cloned()
        .unwrap_or_else(|| current.clone());
    let unit = schema["x-unit"].as_str().map(str::to_owned);
    let response = boxed_input(ui, unit.as_deref(), |ui| {
        ui.add(
            egui::TextEdit::singleline(&mut draft)
                .frame(egui::Frame::NONE)
                .font(egui::TextStyle::Monospace)
                .desired_width(f32::INFINITY),
        )
    });
    if response.changed() {
        cx.state.drafts.insert(id, draft.clone());
    }
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) && response.has_focus() {
        cx.state.drafts.remove(&id);
        cx.state.errors.remove(path);
        return Changed::default();
    }
    let mut changed = Changed::default();
    if committed(ui, &response) {
        cx.state.drafts.remove(&id);
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
                                    format!("{} to {} only", trim_number(min), trim_number(max))
                                }
                                (Some(min), None) => format!("at least {}", trim_number(min)),
                                (None, Some(max)) => format!("at most {}", trim_number(max)),
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
                        changed = Changed::at(path);
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
    trim_number((value as f64 * 1000.0).round() / 1000.0)
}

pub fn trim_number(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

pub fn boxed_input(
    ui: &mut Ui,
    unit: Option<&str>,
    input: impl FnOnce(&mut Ui) -> egui::Response,
) -> egui::Response {
    let focused_id = ui.ctx().memory(|m| m.focused());
    let frame = egui::Frame::new()
        .fill(crate::ui::theme::INPUT)
        .stroke(egui::Stroke::new(1.0, crate::ui::theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(8, 3));
    let mut inner = None;
    let outer = frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            if let Some(unit) = unit {
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(crate::ui::theme::faint(unit).size(12.0));
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
            egui::Stroke::new(1.0, crate::ui::theme::ACCENT),
            egui::StrokeKind::Inside,
        );
    }
    response
}

fn boolean(ui: &mut Ui, value: &mut Value, path: &str) -> Changed {
    let mut on = value.as_bool().unwrap_or(false);
    if ui.checkbox(&mut on, "").changed() {
        *value = Value::Bool(on);
        return Changed::at(path);
    }
    Changed::default()
}

fn enum_combo(ui: &mut Ui, options: &[String], value: &mut Value, path: &str) -> Changed {
    let current = value.as_str().unwrap_or_default().to_owned();
    let mut picked = current.clone();
    egui::ComboBox::from_id_salt(ui.id().with(path).with("enum"))
        .selected_text(schema::title(&current))
        .show_ui(ui, |ui| {
            for option in options {
                ui.selectable_value(&mut picked, option.clone(), schema::title(option));
            }
        });
    if picked != current {
        *value = Value::String(picked);
        return Changed::at(path);
    }
    Changed::default()
}

fn color(ui: &mut Ui, value: &mut Value, path: &str) -> Changed {
    let bytes: Vec<u8> = value
        .as_array()
        .map(|list| {
            list.iter()
                .map(|v| v.as_u64().unwrap_or(255) as u8)
                .collect()
        })
        .unwrap_or_else(|| vec![255, 255, 255, 255]);
    let mut rgba = [
        bytes.first().copied().unwrap_or(255),
        bytes.get(1).copied().unwrap_or(255),
        bytes.get(2).copied().unwrap_or(255),
        bytes.get(3).copied().unwrap_or(255),
    ];
    let mut changed = Changed::default();
    ui.horizontal(|ui| {
        let response = ui.color_edit_button_srgba_unmultiplied(&mut rgba);
        if response.changed() {
            *value = Value::Array(rgba.iter().map(|byte| Value::from(*byte)).collect());
            changed = Changed::at(path);
        }
        egui::Frame::new()
            .fill(crate::ui::theme::INPUT)
            .stroke(egui::Stroke::new(1.0, crate::ui::theme::BORDER))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(8, 3))
            .show(ui, |ui| {
                ui.label(
                    crate::ui::theme::mono(format!(
                        "{}, {}, {}, {}",
                        rgba[0], rgba[1], rgba[2], rgba[3]
                    ))
                    .size(13.0),
                );
            });
    });
    changed
}

pub fn raw_json(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> Changed {
    let id = ui.id().with(path).with("json");
    let current = serde_json::to_string(value).unwrap_or_default();
    let mut draft = cx
        .state
        .drafts
        .get(&id)
        .cloned()
        .unwrap_or_else(|| current.clone());
    let response = ui.add(
        egui::TextEdit::singleline(&mut draft)
            .desired_width(f32::INFINITY)
            .font(egui::TextStyle::Monospace),
    );
    if response.changed() {
        cx.state.drafts.insert(id, draft.clone());
    }
    if committed(ui, &response) {
        cx.state.drafts.remove(&id);
        if draft != current {
            match serde_json::from_str::<Value>(&draft) {
                Ok(parsed) => {
                    *value = parsed;
                    return Changed::at(path);
                }
                Err(error) => {
                    cx.state.errors.insert(path.to_owned(), error.to_string());
                }
            }
        }
    }
    error_line(ui, cx, path);
    Changed::default()
}

pub fn reference(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> Changed {
    let table = schema::table_of(schema).unwrap_or_default().to_owned();
    let mut key = value.as_str().unwrap_or_default().to_owned();
    let changed = crate::picker::row(ui, cx, &table, &mut key, path);
    if changed {
        *value = Value::String(key);
        return Changed::at(path);
    }
    Changed::default()
}

fn asset(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> Changed {
    let mut file = value.as_str().unwrap_or_default().to_owned();
    if crate::picker::asset(ui, cx, &mut file, path) {
        *value = Value::String(file);
        return Changed::at(path);
    }
    Changed::default()
}

fn face(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> Changed {
    let mut faces: Vec<String> = ["neutral", "happy", "sad", "angry", "surprised", "thinking"]
        .iter()
        .map(|face| (*face).to_owned())
        .collect();
    if let Some(speaker) = &cx.speaker
        && let Some(npc) = cx.files.json(&crate::project::row_file("npc", speaker))
        && let Some(model) = npc["model"].as_str()
        && let Some(model) = cx.files.json(&crate::project::row_file("model", model))
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

fn place(ui: &mut Ui, cx: &mut FormCx, schema: &Value, value: &mut Value, path: &str) -> Changed {
    if !value.is_object() {
        *value = schema::template(cx.root, schema);
    }
    let mut changed = Changed::default();
    let mut area = value["area"].as_str().unwrap_or_default().to_owned();
    if crate::picker::row(ui, cx, "area", &mut area, &format!("{path}/area")) {
        value["area"] = Value::String(area);
        changed = Changed::at(path);
    }
    ui.horizontal(|ui| {
        ui.add_sized(
            egui::vec2(28.0, ui.spacing().interact_size.y),
            egui::Label::new(crate::ui::theme::muted("at").monospace().size(13.0)),
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
            changed = std::mem::take(&mut changed).or(geometry(ui, cx, Geometry::Pos, value, path));
        });
    });
    changed
}

pub fn committed(ui: &Ui, response: &egui::Response) -> bool {
    response.lost_focus() && !ui.input(|i| i.key_pressed(egui::Key::Escape))
}

pub fn error_line(ui: &mut Ui, cx: &FormCx, path: &str) {
    if let Some(error) = cx.state.errors.get(path) {
        ui.colored_label(Color32::from_rgb(220, 80, 80), error);
    }
}
