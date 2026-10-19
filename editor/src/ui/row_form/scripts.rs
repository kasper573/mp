use std::str::FromStr;

use egui::{Align, Layout, Ui};
use engine::core::content::{ContentRow, row_file};
use engine::core::script::VariableType;
use engine::systems::npc::NpcDef;
use engine::systems::script::{RiftScripts, ScriptDef, ScriptModule};
use serde_json::Value;

use super::{theme, widgets};
use crate::forms::{self, FormAction, FormChange, FormCx};
use crate::value::RowValue;
use crate::views::model::busts;
use crate::views::script::panel;
use crate::{condition, schema};

pub fn script_cards(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    holder: &mut Value,
    field: &str,
    path: &str,
) -> FormChange {
    let item_schema = cx
        .shapes
        .module_variants(table)
        .into_iter()
        .find(|variant| variant.tag == holder.kind())
        .map(|variant| schema::resolve(cx.root, &variant.schema["properties"][field]["items"]))
        .unwrap_or(&Value::Null);
    if !holder[field].is_array() {
        holder[field] = Value::Array(Vec::new());
    }
    let mut changed = FormChange::default();
    let count = holder[field].as_array().map_or(0, Vec::len);
    let mut remove = None;
    let mut duplicate = None;
    for index in 0..count {
        let module_path = format!("{path}/{field}/{index}");
        let module = &mut holder[field][index];
        widgets::card_frame(true).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label(theme::strong(ScriptModule::TAG).monospace());
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.menu_button(theme::faint("…"), |ui| {
                        if ui.button("Duplicate").clicked() {
                            duplicate = Some(index);
                            ui.close();
                        }
                        if ui.button("Remove").clicked() {
                            remove = Some(index);
                            ui.close();
                        }
                    });
                });
            });
            ui.add_space(4.0);
            changed |= script_module_body(ui, cx, table, item_schema, module, &module_path);
        });
        ui.add_space(2.0);
    }
    if design_tokens::controls::button(ui, "+ Add script").clicked() {
        let template = schema::template(cx.root, item_schema);
        holder[field]
            .as_array_mut()
            .expect("scripts")
            .push(template);
        changed = FormChange::at(&format!("{path}/{field}"));
    }
    let list = holder[field].as_array_mut().expect("scripts");
    if let Some(index) = remove {
        list.remove(index);
        changed = FormChange::at(&format!("{path}/{field}"));
    }
    if let Some(index) = duplicate {
        let copy = list[index].clone();
        list.insert(index + 1, copy);
        changed = FormChange::at(&format!("{path}/{field}"));
    }
    changed
}

/// The fields of a module naming a script row: which script, the values for its variables, and
/// what the script may do for the row running it.
pub(super) fn script_module_body(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    module_schema: &Value,
    module: &mut Value,
    path: &str,
) -> FormChange {
    let mut changed = forms::object_without(ui, cx, module_schema, module, path, &["values"]);
    changed |= script_values(ui, cx, module, path);
    script_extras(ui, cx, table, module, path);
    changed
}

fn script_extras(ui: &mut Ui, cx: &mut FormCx, table: &str, module: &Value, path: &str) {
    let Some(pointer) = path.find("/modules/").map(|at| path[at..].to_owned()) else {
        return;
    };
    let key = cx.speaker.clone();
    if let (Some(content), Some(row_key)) =
        (cx.content.clone(), key.as_deref().or(cx.row_key.as_deref()))
        && content.has_built::<RiftScripts>()
        && let Some(bound) = panel::owner_row(&content, table, row_key, &pointer)
    {
        let may = content.built::<RiftScripts>().may_do(bound.row);
        let answers: Vec<&str> = may.answers.iter().map(|kind| kind.name()).collect();
        widgets::kv_text(
            ui,
            "answers",
            if answers.is_empty() {
                "nothing".to_owned()
            } else {
                answers.join(" · ")
            },
        );
        let mut lines: Vec<String> = may
            .reaches
            .iter()
            .map(|reach| panel::describe_reach(&content, reach))
            .collect();
        lines.sort();
        lines.dedup();
        if !may.dialogue.is_empty() {
            lines.push(format!("speaks {}", may.dialogue.join(", ")));
        }
        if !may.calls.is_empty() {
            lines.push(format!("runs {}", may.calls.join(", ")));
        }
        widgets::kv(ui, "may do", |ui| {
            ui.add(
                egui::Label::new(if lines.is_empty() {
                    theme::faint("nothing yet")
                } else {
                    theme::muted(lines.join(" · "))
                })
                .wrap(),
            );
        });
    }
    if let Some(script) = module["script"].as_str().filter(|key| !key.is_empty()) {
        ui.add_space(4.0);
        if ui.button("→ Open script").clicked() {
            cx.actions.push(FormAction::OpenRow {
                table: ScriptDef::TABLE.to_owned(),
                key: script.to_owned(),
            });
        }
    }
}

pub(super) fn script_summary(module: &Value) -> String {
    let mut parts = vec![module.text_or("script", "?").to_owned()];
    for (name, value) in module["values"].as_object().into_iter().flatten() {
        parts.push(format!(
            "{name} {}",
            value
                .as_str()
                .map(str::to_owned)
                .or_else(|| value.as_f64().map(|number| number.to_string()))
                .unwrap_or_else(|| value.to_string())
        ));
    }
    parts.join(" · ")
}

pub(super) fn script_values(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &mut Value,
    path: &str,
) -> FormChange {
    let Some(script) = module["script"].as_str().map(str::to_owned) else {
        return FormChange::default();
    };
    let Some(row) = cx.files.json(&row_file(ScriptDef::TABLE, &script)) else {
        return FormChange::default();
    };
    let Some(variables) = row["variables"].as_object() else {
        return FormChange::default();
    };
    if variables.is_empty() {
        return FormChange::default();
    }
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for (name, variable) in variables {
        let ty = VariableType::from_str(variable.kind_or("text")).unwrap_or(VariableType::Text);
        let kind = schema::variable_schema(ty, variable["table"].as_str());
        properties.insert(name.clone(), kind);
        if variable.get("default").is_none() {
            required.push(Value::String(name.clone()));
        }
    }
    let schema =
        serde_json::json!({ "type": "object", "properties": properties, "required": required });
    if !module["values"].is_object() {
        module["values"] = Value::Object(serde_json::Map::new());
    }
    forms::object(
        ui,
        cx,
        &schema,
        &mut module["values"],
        &format!("{path}/values"),
    )
}

pub(super) fn speaker_of(table: &str, key: &str) -> Option<String> {
    (table == NpcDef::TABLE).then(|| key.to_owned())
}

pub fn summary_of(root: &Value, module: &Value) -> String {
    let Some(object) = module.as_object() else {
        return String::new();
    };
    let shape = module_shape(root, module);
    let mut parts = Vec::new();
    if object.get("type").and_then(Value::as_str) == Some("bust") {
        let own = object
            .get("own")
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        return format!("{} expressions", busts::generic().count() + own);
    }
    for (name, field) in object {
        if name == "type" {
            continue;
        }
        match field {
            Value::String(text) => parts.push(text.clone()),
            Value::Number(number) => {
                let number = number.as_f64().unwrap_or(0.0);
                parts.push(
                    schema::number_shorthand(root, &shape["properties"][name], number)
                        .unwrap_or_else(|| format!("{name} {number}")),
                );
            }
            Value::Array(items) => parts.push(format!("{} {name}", items.len())),
            Value::Object(nodes) if name == "nodes" => parts.push(format!("{} nodes", nodes.len())),
            Value::Object(fields) if fields.contains_key("type") => {
                parts.push(condition::summary(field))
            }
            _ => {}
        }
        if parts.len() >= 3 {
            break;
        }
    }
    parts.join(" · ")
}

pub fn module_lines(root: &Value, module: &Value) -> String {
    let shape = module_shape(root, module);
    let mut lines: Vec<String> = Vec::new();
    for (name, field) in module.as_object().into_iter().flatten() {
        if name == "type" {
            continue;
        }
        let field_shape = &shape["properties"][name];
        match field {
            Value::Array(items) => {
                let item_shape =
                    schema::resolve(root, &schema::non_null(root, field_shape)["items"]);
                for item in items {
                    match item.as_object() {
                        Some(_) => lines.push(entry_cells(root, item_shape, item).join("  ")),
                        None => lines.push(item.to_string()),
                    }
                }
            }
            Value::Object(_) => lines.push(format!("{name} …")),
            other => lines.push(format!("{name} {}", cell(root, field_shape, other))),
        }
    }
    lines.join("\n")
}

fn module_shape<'a>(root: &'a Value, module: &Value) -> &'a Value {
    schema::settle(root, &root["properties"]["modules"]["items"], module)
}

fn entry_cells(root: &Value, shape: &Value, entry: &Value) -> Vec<String> {
    let fields = schema::properties(schema::settle(root, shape, entry));
    if fields.is_empty() {
        return entry
            .as_object()
            .into_iter()
            .flatten()
            .map(|(_, value)| cell(root, &Value::Null, value))
            .collect();
    }
    fields
        .into_iter()
        .filter_map(|(name, field)| match entry.get(name.as_str()) {
            Some(value) if !value.is_null() => Some(cell(root, field, value)),
            _ if field.get("x-count").is_some() => field
                .get("default")
                .map(|default| cell(root, field, default)),
            _ => field
                .get("x-blank")
                .and_then(Value::as_str)
                .map(str::to_owned),
        })
        .collect()
}

fn cell(root: &Value, field: &Value, value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => {
            let number = number.as_f64().unwrap_or(0.0);
            if schema::non_null(root, field)["x-unit"] == "%" {
                format!("{number}%")
            } else {
                number.to_string()
            }
        }
        other => other.to_string(),
    }
}
