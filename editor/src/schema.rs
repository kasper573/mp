use std::collections::BTreeMap;

use serde_json::{Map, Value};

/// Every table's row shape as the engine declares it, read once per build.
pub struct Shapes {
    pub tables: BTreeMap<String, TableShape>,
    pub order: Vec<String>,
    pub settings: Value,
}

pub struct TableShape {
    pub shape: Value,
    pub fixtures: Vec<String>,
    pub folders: bool,
}

impl Shapes {
    pub fn new() -> Shapes {
        let settings = schemars::generate::SchemaSettings::draft2020_12()
            .with(|settings| settings.inline_subschemas = true);
        let shapes = game::systems::registry().shapes(&settings);
        let mut tables = BTreeMap::new();
        let mut order = Vec::new();
        for table in shapes["tables"].as_array().into_iter().flatten() {
            let name = table["table"].as_str().unwrap_or_default().to_owned();
            order.push(name.clone());
            tables.insert(
                name,
                TableShape {
                    shape: table["shape"].clone(),
                    fixtures: table["fixtures"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|key| key.as_str().map(str::to_owned))
                        .collect(),
                    folders: table["folders"].as_bool().unwrap_or(false),
                },
            );
        }
        Shapes {
            tables,
            order,
            settings: shapes["settings"].clone(),
        }
    }

    pub fn table(&self, name: &str) -> Option<&TableShape> {
        self.tables.get(name)
    }

    pub fn is_fixture(&self, table: &str, key: &str) -> bool {
        self.tables
            .get(table)
            .is_some_and(|shape| shape.fixtures.iter().any(|fixture| fixture == key))
    }

    pub fn has_fixtures(&self, table: &str) -> bool {
        self.tables
            .get(table)
            .is_some_and(|shape| !shape.fixtures.is_empty())
    }

    /// The schema of one module of `table`'s rows, when the table has modules.
    pub fn modules_of(&self, table: &str) -> Option<&Value> {
        let shape = &self.tables.get(table)?.shape;
        let items = shape.get("properties")?.get("modules")?.get("items")?;
        Some(items)
    }
}

/// What a schema node describes, for a form to pick its widget.
pub enum Kind<'a> {
    Object,
    Array(&'a Value),
    Map(&'a Value),
    Union(Vec<Variant<'a>>),
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

/// One tagged variant of a union: its tag field, tag value and object schema.
pub struct Variant<'a> {
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

pub fn kind<'a>(root: &'a Value, schema: &'a Value) -> Kind<'a> {
    let schema = resolve(root, schema);
    if let Some(value) = schema.get("const") {
        return Kind::Const(value);
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        return Kind::Enum(
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
            return Kind::Union(variants);
        }
        if variants.is_empty() {
            return Kind::Choice(plain);
        }
        let mut all = plain;
        all.extend(variants.into_iter().map(|variant| variant.schema));
        return Kind::Choice(all);
    }
    let types = type_names(schema);
    let base = types.iter().find(|name| **name != "null").copied();
    match base {
        Some("object") => {
            if schema.get("properties").is_some() {
                Kind::Object
            } else if let Some(values) = schema.get("additionalProperties")
                && values.is_object()
            {
                Kind::Map(values)
            } else if let Some(patterns) =
                schema.get("patternProperties").and_then(Value::as_object)
                && let Some((_, values)) = patterns.iter().next()
            {
                Kind::Map(values)
            } else {
                Kind::Object
            }
        }
        Some("array") => Kind::Array(schema.get("items").unwrap_or(&Value::Null)),
        Some("string") => Kind::Text,
        Some("integer") => Kind::Integer,
        Some("number") => Kind::Number,
        Some("boolean") => Kind::Boolean,
        Some("null") => Kind::Null,
        _ => Kind::Any,
    }
}

fn collect_variants<'a>(
    root: &'a Value,
    schema: &'a Value,
    variants: &mut Vec<Variant<'a>>,
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
        variants.push(Variant { field, tag, schema });
    } else {
        plain.push(schema);
    }
}

/// The constant tag of a tagged union member: `type` for modules, kinds and nodes, `event` for
/// the on node's event.
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

pub fn required(schema: &Value) -> Vec<&str> {
    schema
        .get("required")
        .and_then(Value::as_array)
        .map(|names| names.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default()
}

pub fn marker(schema: &Value) -> Option<&str> {
    schema
        .as_object()?
        .keys()
        .find(|key| key.starts_with("x-"))
        .map(String::as_str)
}

/// The alternative of a fill that names a variable instead of holding a value.
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

/// A starting value for a schema: every required field filled, references left blank to pick.
pub fn template(root: &Value, schema: &Value) -> Value {
    if let Some(default) = schema.get("default") {
        return default.clone();
    }
    let schema = resolve(root, schema);
    match kind(root, schema) {
        Kind::Const(value) => value.clone(),
        Kind::Enum(values) => Value::String(values.first().cloned().unwrap_or_default()),
        Kind::Union(variants) => variants
            .first()
            .map(|variant| variant_template(root, variant))
            .unwrap_or(Value::Null),
        Kind::Choice(alternatives) => alternatives
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
        Kind::Object => {
            let required = required(schema);
            let mut object = Map::new();
            for (name, field) in properties(schema) {
                if required.contains(&name.as_str()) {
                    object.insert(name.clone(), template(root, field));
                }
            }
            Value::Object(object)
        }
        Kind::Array(items) => {
            let least = schema["minItems"].as_u64().unwrap_or(0);
            Value::Array((0..least).map(|_| template(root, items)).collect())
        }
        Kind::Map(_) => Value::Object(Map::new()),
        Kind::Text => Value::String(String::new()),
        Kind::Integer => Value::from(minimum(schema).unwrap_or(0.0) as i64),
        Kind::Number => Value::from(minimum(schema).unwrap_or(0.0)),
        Kind::Boolean => Value::Bool(false),
        Kind::Null | Kind::Any => Value::Null,
    }
}

pub fn variant_template(root: &Value, variant: &Variant) -> Value {
    let mut value = template(root, variant.schema);
    if let Some(object) = value.as_object_mut() {
        object.insert(variant.field.clone(), Value::String(variant.tag.clone()));
    }
    value
}

/// The variant a tagged value is of.
pub fn variant_of<'a>(variants: &'a [Variant<'a>], value: &Value) -> Option<&'a Variant<'a>> {
    variants.iter().find(|variant| {
        value
            .get(&variant.field)
            .and_then(Value::as_str)
            .is_some_and(|tag| tag == variant.tag)
    })
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
