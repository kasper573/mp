use std::collections::{BTreeMap, HashSet};

use crate::value::RowValue;
use game::systems::area::{self};
use serde_json::Value;

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
                        .and_then(|d| crate::value::json(d).ok())
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

pub struct MadeVariable {
    pub name: String,
    pub kind: String,
    pub kept: Value,
}

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

pub fn apply_hole_op(row: &mut Value, op: HoleOp, blueprint: &str) -> Option<MadeVariable> {
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
            let kept = row["parts"][part].pointer(&field).cloned();
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = serde_json::json!({ "var": name });
            }
            let _ = blueprint;
            Some(MadeVariable {
                name,
                kind,
                kept: kept.unwrap_or(Value::Null),
            })
        }
        HoleOp::Use { part, field, name } => {
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = serde_json::json!({ "var": name });
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
                area::blueprint::holes(p, &mut still);
            }
            for m in row["modules"].as_array().into_iter().flatten() {
                area::blueprint::holes(m, &mut still);
            }
            if !still.contains(&name) {
                row["variables"].as_object_mut().map(|v| v.remove(&name));
            }
            None
        }
    }
}

pub(super) fn fixed_template(variable: &Value) -> Value {
    match variable.kind() {
        "integer" => Value::from(0),
        "number" => Value::from(0.0),
        "boolean" => Value::Bool(false),
        "place" => serde_json::json!({ "area": "", "x": 0.0, "y": 0.0 }),
        "condition" => crate::condition::empty_object(),
        _ => Value::String(String::new()),
    }
}

pub(super) fn row_table_of(part: &Value, field: &str) -> Option<String> {
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
                *value = Value::String(format!("◇ {}", map.text("var")));
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

pub fn holeable_fields(part: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let kind = part.kind();
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

pub(super) fn value_kind(value: &Value) -> String {
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
