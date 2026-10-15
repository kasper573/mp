use std::collections::{BTreeMap, HashSet};

use game::core::content::locate;
use game::core::script::VariableType;
use game::systems::area::blueprint::{self, hole_name};
use game::systems::script::Variable;
use serde_json::Value;

use super::placement;
use crate::forms::HoleRequest;
use crate::schema::{self, SchemaKind, SchemaShapes};
use crate::{rows, value};

pub fn fill_holes(
    value: &mut Value,
    values: &Value,
    variables: &BTreeMap<String, Variable>,
) -> usize {
    let mut filled = 0;
    if let Some(name) = hole_name(value) {
        let replacement = values.get(name).cloned().or_else(|| {
            variables
                .get(name)
                .and_then(|v| v.default.as_ref())
                .and_then(|d| value::json(d).ok())
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

pub struct HoleOp {
    pub part: usize,
    pub request: HoleRequest,
}

pub fn hole_op(part: usize, base: &str, mut request: HoleRequest) -> HoleOp {
    let field = match &mut request {
        HoleRequest::Make { field, .. }
        | HoleRequest::Use { field, .. }
        | HoleRequest::Fix { field, .. } => field,
    };
    if let Some(relative) = field.strip_prefix(base) {
        *field = relative.to_owned();
    }
    HoleOp { part, request }
}

pub fn apply_hole_op(shapes: &SchemaShapes, row: &mut Value, op: HoleOp) -> Option<MadeVariable> {
    let HoleOp { part, request } = op;
    match request {
        HoleRequest::Make { field, kind } => {
            let taken: HashSet<String> = row["variables"]
                .as_object()
                .map(|v| v.keys().cloned().collect())
                .unwrap_or_default();
            let base = field.rsplit('/').next().unwrap_or("value").to_owned();
            let name = rows::free_name(&base, &taken);
            let table = match kind {
                VariableType::Row => holeable_fields(shapes, &row["parts"][part])
                    .into_iter()
                    .find(|holeable| holeable.pointer == field)
                    .and_then(|holeable| holeable.table),
                _ => None,
            };
            let variable = Variable {
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
        HoleRequest::Use { field, name } => {
            if let Some(slot) = row["parts"][part].pointer_mut(&field) {
                *slot = hole(&name);
            }
            None
        }
        HoleRequest::Fix { field, name } => {
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

fn fixed_template(variable: &Value) -> Value {
    serde_json::from_value::<Variable>(variable.clone())
        .map(|variable| placement::variable_template(&variable))
        .unwrap_or_else(|_| Value::String(String::new()))
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
                out.extend(holes_in(v, &format!("{pointer}/{}", locate::escape(key))));
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

pub struct HoleableField {
    pub pointer: String,
    pub kind: VariableType,
    pub table: Option<String>,
}

pub fn holeable_fields(shapes: &SchemaShapes, part: &Value) -> Vec<HoleableField> {
    let root = shapes.shape_of("area");
    let variants = shapes.module_variants("area");
    let Some(variant) = schema::variant_of(&variants, part) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    collect_holeable(root, variant.schema, part, "", &mut out);
    out.retain(|field| {
        part.pointer(&field.pointer)
            .is_some_and(|v| hole_name(v).is_none())
    });
    out
}

fn collect_holeable(
    root: &Value,
    schema: &Value,
    value: &Value,
    pointer: &str,
    out: &mut Vec<HoleableField>,
) {
    let schema = schema::resolve(root, schema);
    let kind = match schema::marker(schema) {
        Some("x-name") => Some(VariableType::Name),
        Some("x-condition") => Some(VariableType::Condition),
        Some("x-place") => Some(VariableType::Place),
        Some("x-table") => Some(VariableType::Row),
        Some("x-asset") => (schema["x-asset"] == "audio").then_some(VariableType::Audio),
        Some(_) => return,
        None => match schema::kind(root, schema) {
            SchemaKind::Text => Some(VariableType::Text),
            SchemaKind::Integer => Some(VariableType::Integer),
            SchemaKind::Number => Some(VariableType::Number),
            SchemaKind::Boolean => Some(VariableType::Boolean),
            SchemaKind::Choice(_) | SchemaKind::Any => Some(value_kind(value)),
            SchemaKind::Object => {
                for (name, field) in schema::properties(schema) {
                    if let Some(child) = value.get(name) {
                        collect_holeable(root, field, child, &format!("{pointer}/{name}"), out);
                    }
                }
                return;
            }
            SchemaKind::Array(items) => {
                for (index, child) in value.as_array().into_iter().flatten().enumerate() {
                    collect_holeable(root, items, child, &format!("{pointer}/{index}"), out);
                }
                return;
            }
            SchemaKind::Map(values) => {
                for (name, child) in value.as_object().into_iter().flatten() {
                    collect_holeable(root, values, child, &format!("{pointer}/{name}"), out);
                }
                return;
            }
            _ => None,
        },
    };
    if let Some(kind) = kind
        && !pointer.is_empty()
    {
        out.push(HoleableField {
            pointer: pointer.to_owned(),
            kind,
            table: schema::table_of(schema).map(str::to_owned),
        });
    }
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
