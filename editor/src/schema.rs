use std::collections::BTreeMap;

use engine::core::content::fixture::FixtureLock;
use engine::core::content::load::{ContentShapes, TableShape};
use engine::core::content::locate;
use engine::core::script::VariableType;
use serde_json::{Map, Value, json};

use engine::systems::registry;
use engine::systems::script::Place;

pub struct SchemaShapes {
    pub tables: BTreeMap<String, TableShape>,
    pub order: Vec<String>,
    pub settings: Value,
}

pub fn shapes() -> ContentShapes {
    let settings = schemars::generate::SchemaSettings::draft2020_12()
        .with(|settings| settings.inline_subschemas = true);
    registry().shapes(&settings)
}

impl SchemaShapes {
    pub fn load() -> SchemaShapes {
        let shapes = shapes();
        SchemaShapes {
            order: shapes
                .tables
                .iter()
                .map(|table| table.table.clone())
                .collect(),
            tables: shapes
                .tables
                .into_iter()
                .map(|table| (table.table.clone(), table))
                .collect(),
            settings: shapes.settings.unwrap_or_default(),
        }
    }

    pub fn table(&self, name: &str) -> Option<&TableShape> {
        self.tables.get(name)
    }

    pub fn shape_of(&self, name: &str) -> &Value {
        static NULL: Value = Value::Null;
        self.tables.get(name).map_or(&NULL, |table| &table.shape)
    }

    pub fn is_fixture(&self, table: &str, key: &str) -> bool {
        self.tables
            .get(table)
            .is_some_and(|shape| shape.fixtures.iter().any(|fixture| fixture == key))
    }

    pub fn is_closed(&self, table: &str) -> bool {
        self.tables.get(table).is_some_and(|shape| shape.closed)
    }

    pub fn locks(&self, table: &str, key: &str) -> &[FixtureLock] {
        self.tables
            .get(table)
            .and_then(|shape| shape.locks.get(key))
            .map_or(&[], Vec::as_slice)
    }

    pub fn modules_of(&self, table: &str) -> Option<&Value> {
        let shape = &self.tables.get(table)?.shape;
        let items = shape.get("properties")?.get("modules")?.get("items")?;
        Some(items)
    }

    pub fn module_variants(&self, table: &str) -> Vec<SchemaVariant<'_>> {
        let Some(shape) = self.tables.get(table).map(|table| &table.shape) else {
            return Vec::new();
        };
        match self.modules_of(table).map(|items| kind(shape, items)) {
            Some(SchemaKind::Union(variants)) => variants,
            _ => Vec::new(),
        }
    }
}

pub enum SchemaKind<'a> {
    Object,
    Array(&'a Value),
    Map(&'a Value),
    Union(Vec<SchemaVariant<'a>>),
    Choice(Vec<&'a Value>),
    Enum(Vec<String>),
    Const(&'a Value),
    Text,
    Integer,
    Number,
    Boolean,
    Null,
    Any,
}

pub struct SchemaVariant<'a> {
    pub field: String,
    pub tag: String,
    pub schema: &'a Value,
}

pub fn resolve<'a>(root: &'a Value, schema: &'a Value) -> &'a Value {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str)
        && let Some(path) = reference.strip_prefix("#/")
    {
        let mut at = root;
        for part in path.split('/') {
            at = match at.get(part) {
                Some(next) => next,
                None => return schema,
            };
        }
        return at;
    }
    schema
}

pub fn at_pointer<'a>(
    root: &'a Value,
    schema: &'a Value,
    value: &Value,
    pointer: &str,
) -> Option<&'a Value> {
    let mut schema = settle(root, schema, value);
    let mut value = value;
    for segment in pointer.split('/').skip(1) {
        let segment = locate::unescape(segment);
        let field = match kind(root, schema) {
            SchemaKind::Object => schema.get("properties")?.get(&segment)?,
            SchemaKind::Map(values) => values,
            SchemaKind::Array(items) => items,
            _ => return None,
        };
        value = match value {
            Value::Object(fields) => fields.get(&segment)?,
            Value::Array(items) => items.get(segment.parse::<usize>().ok()?)?,
            _ => return None,
        };
        schema = settle(root, field, value);
    }
    Some(schema)
}

pub fn settle<'a>(root: &'a Value, schema: &'a Value, value: &Value) -> &'a Value {
    let schema = resolve(root, schema);
    match kind(root, schema) {
        SchemaKind::Union(variants) => variants
            .into_iter()
            .find(|variant| {
                value.get(&variant.field).and_then(Value::as_str) == Some(variant.tag.as_str())
            })
            .map_or(schema, |variant| variant.schema),
        SchemaKind::Choice(alternatives) => alternatives
            .into_iter()
            .find(|alternative| fits(root, alternative, value))
            .map_or(schema, |alternative| resolve(root, alternative)),
        _ => schema,
    }
}

/// What an optional schema holds when it holds something: the one alternative beside null, its
/// own nesting left whole.
pub fn non_null<'a>(root: &'a Value, schema: &'a Value) -> &'a Value {
    let schema = resolve(root, schema);
    let Some(alternatives) = schema
        .get("anyOf")
        .or_else(|| schema.get("oneOf"))
        .and_then(Value::as_array)
    else {
        return schema;
    };
    let mut taken = alternatives
        .iter()
        .filter(|alternative| type_names(resolve(root, alternative)) != ["null"]);
    match (taken.next(), taken.next()) {
        (Some(only), None) if alternatives.len() > 1 => resolve(root, only),
        _ => schema,
    }
}

pub fn number_shorthand(root: &Value, field: &Value, number: f64) -> Option<String> {
    if non_null(root, field)["x-unit"] == "%" {
        Some(format!("{number}%"))
    } else if field.get("x-count").is_some() {
        Some(format!("× {number}"))
    } else {
        None
    }
}

pub fn blank_meaning<'a>(schema: &'a Value, value: &Value) -> Vec<&'a str> {
    properties(schema)
        .into_iter()
        .filter(|(name, _)| value.get(name.as_str()).is_none_or(Value::is_null))
        .filter_map(|(_, field)| field.get("x-blank").and_then(Value::as_str))
        .collect()
}

pub fn kind<'a>(root: &'a Value, schema: &'a Value) -> SchemaKind<'a> {
    let schema = resolve(root, schema);
    if let Some(value) = schema.get("const") {
        return SchemaKind::Const(value);
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        return SchemaKind::Enum(
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect(),
        );
    }
    let alternatives = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array);
    if let Some(alternatives) = alternatives {
        let mut variants = Vec::new();
        let mut plain = Vec::new();
        for alternative in alternatives {
            collect_variants(root, alternative, &mut variants, &mut plain);
        }
        if !variants.is_empty() && plain.is_empty() {
            return SchemaKind::Union(variants);
        }
        if variants.is_empty() {
            return SchemaKind::Choice(plain);
        }
        let mut all = plain;
        all.extend(variants.into_iter().map(|variant| variant.schema));
        return SchemaKind::Choice(all);
    }
    let types = type_names(schema);
    let base = types.iter().find(|name| **name != "null").copied();
    match base {
        Some("object") => {
            if schema.get("properties").is_some() {
                SchemaKind::Object
            } else if let Some(values) = schema.get("additionalProperties")
                && values.is_object()
            {
                SchemaKind::Map(values)
            } else if let Some(patterns) =
                schema.get("patternProperties").and_then(Value::as_object)
                && let Some((_, values)) = patterns.iter().next()
            {
                SchemaKind::Map(values)
            } else {
                SchemaKind::Object
            }
        }
        Some("array") => SchemaKind::Array(schema.get("items").unwrap_or(&Value::Null)),
        Some("string") => SchemaKind::Text,
        Some("integer") => SchemaKind::Integer,
        Some("number") => SchemaKind::Number,
        Some("boolean") => SchemaKind::Boolean,
        Some("null") => SchemaKind::Null,
        _ => SchemaKind::Any,
    }
}

fn collect_variants<'a>(
    root: &'a Value,
    schema: &'a Value,
    variants: &mut Vec<SchemaVariant<'a>>,
    plain: &mut Vec<&'a Value>,
) {
    let schema = resolve(root, schema);
    if let Some(nested) = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
        && schema.get("properties").is_none()
    {
        for alternative in nested {
            collect_variants(root, alternative, variants, plain);
        }
        return;
    }
    if let Some((field, tag)) = tag_of(schema) {
        variants.push(SchemaVariant { field, tag, schema });
    } else {
        plain.push(schema);
    }
}

pub fn tag_of(schema: &Value) -> Option<(String, String)> {
    let properties = schema.get("properties")?.as_object()?;
    for field in ["type", "event"] {
        if let Some(tag) = properties.get(field).and_then(|p| p.get("const")?.as_str()) {
            return Some((field.to_owned(), tag.to_owned()));
        }
    }
    None
}

pub fn is_optional(schema: &Value) -> bool {
    type_names(schema).contains(&"null")
        || schema
            .get("anyOf")
            .and_then(Value::as_array)
            .is_some_and(|alternatives| {
                alternatives
                    .iter()
                    .any(|alternative| type_names(alternative) == vec!["null"])
            })
}

pub fn fits(root: &Value, schema: &Value, value: &Value) -> bool {
    let schema = resolve(root, schema);
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
    let types = type_names(schema);
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
                && required(schema)
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

pub fn type_names(schema: &Value) -> Vec<&str> {
    match schema.get("type") {
        Some(Value::String(name)) => vec![name.as_str()],
        Some(Value::Array(names)) => names.iter().filter_map(Value::as_str).collect(),
        _ => Vec::new(),
    }
}

pub fn properties(schema: &Value) -> Vec<(&String, &Value)> {
    schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|properties| properties.iter().collect())
        .unwrap_or_default()
}

pub fn number_paths(root: &Value) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    number_paths_in(root, root, &mut Vec::new(), &mut out, 0);
    out.sort();
    out.dedup();
    out
}

pub fn required(schema: &Value) -> Vec<&str> {
    schema
        .get("required")
        .and_then(Value::as_array)
        .map(|names| names.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default()
}

pub fn description(schema: &Value) -> Option<&str> {
    schema.get("description")?.as_str()
}

/// The game system a node belongs to, as its definition declares it.
pub fn system_of(schema: &Value) -> Option<&str> {
    schema.get("x-system")?.as_str()
}

pub fn marker(schema: &Value) -> Option<&str> {
    schema
        .as_object()?
        .keys()
        .find(|key| key.starts_with("x-"))
        .map(String::as_str)
}

pub fn is_var_fill(schema: &Value) -> bool {
    schema
        .get("properties")
        .and_then(Value::as_object)
        .is_some_and(|properties| properties.len() == 1 && properties.contains_key("var"))
}

pub fn table_of(schema: &Value) -> Option<&str> {
    schema.get("x-table").and_then(Value::as_str)
}

pub fn minimum(schema: &Value) -> Option<f64> {
    schema.get("minimum").and_then(Value::as_f64)
}

pub fn maximum(schema: &Value) -> Option<f64> {
    schema.get("maximum").and_then(Value::as_f64)
}

pub fn template(root: &Value, schema: &Value) -> Value {
    if let Some(default) = schema.get("default") {
        return default.clone();
    }
    let schema = resolve(root, schema);
    match kind(root, schema) {
        SchemaKind::Const(value) => value.clone(),
        SchemaKind::Enum(values) => Value::String(values.first().cloned().unwrap_or_default()),
        SchemaKind::Union(variants) => variants
            .first()
            .map(|variant| variant_template(root, variant))
            .unwrap_or(Value::Null),
        SchemaKind::Choice(alternatives) => alternatives
            .iter()
            .find(|alternative| {
                !type_names(alternative).contains(&"null") && !is_var_fill(alternative)
            })
            .or_else(|| {
                alternatives
                    .iter()
                    .find(|alternative| !type_names(alternative).contains(&"null"))
            })
            .map(|alternative| template(root, alternative))
            .unwrap_or(Value::Null),
        SchemaKind::Object => {
            let required = required(schema);
            let mut object = Map::new();
            for (name, field) in properties(schema) {
                if required.contains(&name.as_str()) {
                    object.insert(name.clone(), template(root, field));
                }
            }
            Value::Object(object)
        }
        SchemaKind::Array(items) => {
            let least = schema["minItems"].as_u64().unwrap_or(0);
            Value::Array((0..least).map(|_| template(root, items)).collect())
        }
        SchemaKind::Map(_) => Value::Object(Map::new()),
        SchemaKind::Text => Value::String(String::new()),
        SchemaKind::Integer => Value::from(minimum(schema).unwrap_or(0.0) as i64),
        SchemaKind::Number => Value::from(minimum(schema).unwrap_or(0.0)),
        SchemaKind::Boolean => Value::Bool(false),
        SchemaKind::Null | SchemaKind::Any => Value::Null,
    }
}

pub fn variant_template(root: &Value, variant: &SchemaVariant) -> Value {
    let mut value = template(root, variant.schema);
    if let Some(object) = value.as_object_mut() {
        object.insert(variant.field.clone(), Value::String(variant.tag.clone()));
    }
    value
}

pub fn variant_of<'a>(
    variants: &'a [SchemaVariant<'a>],
    value: &Value,
) -> Option<&'a SchemaVariant<'a>> {
    variants.iter().find(|variant| {
        value
            .get(&variant.field)
            .and_then(Value::as_str)
            .is_some_and(|tag| tag == variant.tag)
    })
}

pub fn variable_schema(ty: VariableType, table: Option<&str>) -> Value {
    match ty {
        VariableType::Integer => json!({ "type": "integer" }),
        VariableType::Number => json!({ "type": "number" }),
        VariableType::Boolean => json!({ "type": "boolean" }),
        VariableType::Text | VariableType::Name => json!({ "type": "string" }),
        VariableType::Row => json!({ "type": "string", "x-table": table.unwrap_or_default() }),
        VariableType::Audio => json!({ "type": "string", "x-asset": "audio" }),
        VariableType::Place => {
            let schema = schemars::generate::SchemaSettings::draft2020_12()
                .with(|settings| settings.inline_subschemas = true)
                .into_generator()
                .into_root_schema_for::<Place>();
            serde_json::to_value(schema).expect("a schema is json")
        }
        VariableType::Condition => json!({ "x-condition": true }),
    }
}

pub fn title(name: &str) -> String {
    let mut out = String::new();
    for (index, part) in name.split('_').enumerate() {
        if index > 0 {
            out.push(' ');
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            if index == 0 {
                out.extend(first.to_uppercase());
            } else {
                out.push(first);
            }
            out.push_str(chars.as_str());
        }
    }
    out
}

const NUMBER_DEPTH: usize = 5;

fn number_paths_in(
    root: &Value,
    schema: &Value,
    path: &mut Vec<String>,
    out: &mut Vec<Vec<String>>,
    depth: usize,
) {
    if depth > NUMBER_DEPTH {
        return;
    }
    let schema = resolve(root, schema);
    if type_names(schema)
        .iter()
        .any(|name| matches!(*name, "number" | "integer"))
    {
        out.push(path.clone());
        return;
    }
    if let Some(items) = schema.get("items") {
        number_paths_in(root, items, path, out, depth + 1);
    }
    for (name, field) in properties(schema) {
        if name == "modules" || name == "type" {
            continue;
        }
        path.push(name.clone());
        number_paths_in(root, field, path, out, depth + 1);
        path.pop();
    }
    for variant in ["oneOf", "anyOf"]
        .iter()
        .filter_map(|key| schema.get(*key))
        .filter_map(Value::as_array)
        .flatten()
    {
        let variant = resolve(root, variant);
        match tag_of(variant) {
            Some((_, tag)) => {
                path.push(tag);
                number_paths_in(root, variant, path, out, depth + 1);
                path.pop();
            }
            None => number_paths_in(root, variant, path, out, depth + 1),
        }
    }
    if let Some(modules) = schema
        .get("properties")
        .and_then(|properties| properties.get("modules"))
    {
        number_paths_in(root, modules, path, out, depth + 1);
    }
}
