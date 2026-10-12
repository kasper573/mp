use std::collections::{BTreeMap, HashSet};
use std::str::FromStr;

use game::core::script::VariableType;
use game::systems::area::AreaModuleKind;
use game::systems::area::blueprint::{self, hole_name};
use serde_json::Value;

use crate::value::RowValue;

pub fn fill_holes(
    value: &mut Value,
    values: &Value,
    variables: &BTreeMap<String, game::systems::script::Variable>,
) -> usize {
    let mut filled = 0;
    if let Some(name) = hole_name(value) {
        let replacement = values.get(name).cloned().or_else(|| {
            variables
                .get(name)
                .and_then(|v| v.default.as_ref())
                .and_then(|d| crate::value::json(d).ok())
        });
        if let Some(replacement) = replacement {
            *value = replacement;
            filled += 1;
        }
        return filled;
    }
    match value {
        Value::Object(map) => {
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

pub struct MadeVariable {
    pub name: String,
    pub kind: VariableType,
    pub kept: Value,
}

pub enum HoleOp {
    Make {
        part: usize,
        field: String,
        kind: VariableType,
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

pub fn hole_op(part: usize, base: &str, request: crate::forms::HoleRequest) -> HoleOp {
    use crate::forms::HoleRequest as R;
    let relative = |field: String| field.strip_prefix(base).map(str::to_owned).unwrap_or(field);
    match request {
        R::Make { field, kind } => HoleOp::Make {
            part,
            field: relative(field),
            kind,
        },
        R::Use { field, name } => HoleOp::Use {
            part,
            field: relative(field),
            name,
        },
        R::Fix { field, name } => HoleOp::Fix {
            part,
            field: relative(field),
            name,
        },
    }
}

pub fn apply_hole_op(row: &mut Value, op: HoleOp) -> Option<MadeVariable> {
    match op {
        HoleOp::Make { part, field, kind } => {
            let taken: HashSet<String> = row["variables"]
                .as_object()
                .map(|v| v.keys().cloned().collect())
                .unwrap_or_default();
            let base = field.rsplit('/').next().unwrap_or("value").to_owned();
            let name = suffixed(&base, &taken);
            let table = match kind {
                VariableType::Row => row_table_of(&row["parts"][part], &field),
                _ => None,
            };
            let variable = game::systems::script::Variable {
                ty: kind,
                table,
                default: None,
            };
            if !row["variables"].is_object() {
                row["variables"] = Value::Object(Default::default());
            }
            row["variables"][&name] = serde_json::to_value(&variable).unwrap_or_default();
            let kept = row["parts"][part].pointer(&field).cloned();
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = hole(&name);
            }
            Some(MadeVariable {
                name,
                kind,
                kept: kept.unwrap_or(Value::Null),
            })
        }
        HoleOp::Use { part, field, name } => {
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = hole(&name);
            }
            None
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
                blueprint::holes(p, &mut still);
            }
            for m in row["modules"].as_array().into_iter().flatten() {
                blueprint::holes(m, &mut still);
            }
            if !still.contains(&name)
                && let Some(variables) = row["variables"].as_object_mut()
            {
                variables.remove(&name);
            }
            None
        }
    }
}

fn hole(name: &str) -> Value {
    serde_json::json!({ "var": name })
}

pub(super) fn fixed_template(variable: &Value) -> Value {
    match VariableType::from_str(variable.kind()) {
        Ok(VariableType::Integer) => Value::from(0),
        Ok(VariableType::Number) => Value::from(0.0),
        Ok(VariableType::Boolean) => Value::Bool(false),
        Ok(VariableType::Place) => serde_json::json!({ "area": "", "x": 0.0, "y": 0.0 }),
        Ok(VariableType::Condition) => crate::condition::empty_object(),
        _ => Value::String(String::new()),
    }
}

pub(super) fn row_table_of(part: &Value, field: &str) -> Option<String> {
    let last = field.rsplit('/').next()?;
    match (part.module_kind()?, last) {
        (AreaModuleKind::Population | AreaModuleKind::Resident, "npc") => Some("npc".to_owned()),
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

pub struct HoleSite {
    pub pointer: String,
    pub name: String,
}

pub fn holes_in(value: &Value, pointer: &str) -> Vec<HoleSite> {
    let mut out = Vec::new();
    if let Some(name) = hole_name(value) {
        out.push(HoleSite {
            pointer: pointer.to_owned(),
            name: name.to_owned(),
        });
        return out;
    }
    match value {
        Value::Object(map) => {
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
    if let Some(name) = hole_name(value) {
        *value = Value::String(format!("◇ {name}"));
        return;
    }
    match value {
        Value::Object(map) => {
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
        (part @ Value::Object(_), Value::Object(edited)) if hole_name(part).is_none() => {
            let Value::Object(map) = part else {
                return;
            };
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

pub struct HoleableField {
    pub pointer: String,
    pub kind: VariableType,
}

pub fn holeable_fields(part: &Value) -> Vec<HoleableField> {
    let mut out = Vec::new();
    let mut push = |pointer: String, kind: VariableType| out.push(HoleableField { pointer, kind });
    match part.module_kind() {
        Some(AreaModuleKind::Object) => {
            push("/name".to_owned(), VariableType::Name);
            push("/label".to_owned(), VariableType::Text);
            push("/shown".to_owned(), VariableType::Condition);
            for (index, script) in part["scripts"].as_array().into_iter().flatten().enumerate() {
                for (name, value) in script["values"].as_object().into_iter().flatten() {
                    push(format!("/scripts/{index}/values/{name}"), value_kind(value));
                }
            }
        }
        Some(AreaModuleKind::Soundscape) => {
            push("/emit".to_owned(), VariableType::Number);
            let channels = part["channels"].as_array().map_or(0, Vec::len);
            for index in 0..channels {
                push(format!("/channels/{index}/channel"), VariableType::Integer);
                push(format!("/channels/{index}/file"), VariableType::Audio);
                push(format!("/channels/{index}/volume"), VariableType::Number);
                push(format!("/channels/{index}/pan"), VariableType::Number);
            }
        }
        Some(AreaModuleKind::Population) => {
            push("/npc".to_owned(), VariableType::Row);
            push("/count".to_owned(), VariableType::Integer);
        }
        Some(AreaModuleKind::Resident) => {
            push("/npc".to_owned(), VariableType::Row);
            push("/shown".to_owned(), VariableType::Condition);
        }
        Some(AreaModuleKind::Blueprint) => {
            for (name, value) in part["values"].as_object().into_iter().flatten() {
                push(format!("/values/{name}"), value_kind(value));
            }
        }
        _ => {}
    }
    out.retain(|field| {
        part.pointer(&field.pointer)
            .is_some_and(|v| hole_name(v).is_none())
    });
    out
}

pub(super) fn value_kind(value: &Value) -> VariableType {
    match value {
        Value::Number(n) if n.is_i64() => VariableType::Integer,
        Value::Number(_) => VariableType::Number,
        Value::Bool(_) => VariableType::Boolean,
        Value::Object(o) if o.contains_key("area") => VariableType::Place,
        Value::Object(_) => VariableType::Condition,
        _ => VariableType::Text,
    }
}
