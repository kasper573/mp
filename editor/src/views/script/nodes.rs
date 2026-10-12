use std::collections::{BTreeMap, HashSet, VecDeque};

use game::core::content::{Content, ContentScope, with_content};
use game::core::script::{EffectDef, EventDef, OwnerKind};
use serde_json::{Map, Value};

use crate::schema::{self, Variant};

/// One output of a node: its label, where its arrow is written inside the node, and the node it
/// points at.
#[derive(Clone, Debug, PartialEq)]
pub struct Port {
    pub label: String,
    pub field: String,
    pub target: Option<String>,
}

/// One kind of node the palette offers: where it comes from, what it does, who may use it, and
/// the outputs it leaves by.
#[derive(Clone, Debug)]
pub struct Entry {
    pub kind: String,
    pub system: &'static str,
    pub blurb: &'static str,
    pub owners: Vec<OwnerKind>,
    pub outputs: Vec<String>,
    pub fields: Vec<(String, Option<String>)>,
    pub pauses: bool,
}

/// Every node kind and event the engine declares, read from the shapes and the engine's own
/// definitions once per content.
pub struct Catalogue {
    pub entries: Vec<Entry>,
    pub events: Vec<(String, Vec<OwnerKind>)>,
}

impl Catalogue {
    pub fn build(root: &Value, content: Option<Content>) -> Catalogue {
        let mut entries = Vec::new();
        for (kind, blurb) in FLOW_BLURBS {
            entries.push(Entry {
                kind: (*kind).to_owned(),
                system: if kind == "dialogue" {
                    "dialogue"
                } else {
                    "flow"
                },
                blurb,
                owners: Vec::new(),
                outputs: flow_outputs(kind),
                fields: Vec::new(),
                pauses: matches!(kind, "wait" | "dialogue"),
            });
        }
        let scope = content.map(|content| ContentScope::of(&content));
        for variant in variants(root) {
            if FLOW_BLURBS
                .iter()
                .any(|(kind, _)| *kind == variant.tag.as_str())
            {
                continue;
            }
            let outputs: Vec<String> = schema::properties(variant.schema)
                .into_iter()
                .filter(|(name, field)| *name != "type" && is_arrow(field))
                .map(|(name, _)| name.clone())
                .collect();
            let fields: Vec<(String, Option<String>)> = schema::properties(variant.schema)
                .into_iter()
                .filter(|(name, field)| *name != "type" && !is_arrow(field))
                .map(|(name, field)| {
                    (
                        name.clone(),
                        schema::table_of(schema::resolve(root, field)).map(str::to_owned),
                    )
                })
                .collect();
            let template = schema::variant_template(root, &variant);
            let (owners, pauses) = match &scope {
                Some(scope) => {
                    let (parsed, _) = with_content(scope.clone(), || {
                        serde_json::from_value::<game::systems::script::Node>(template)
                    });
                    match parsed {
                        Ok(game::core::script::Node::Effect(effect)) => {
                            (effect.owners().to_vec(), effect.pauses())
                        }
                        _ => (Vec::new(), false),
                    }
                }
                None => (Vec::new(), false),
            };
            let (system, blurb) = EFFECT_BLURBS
                .iter()
                .find(|(kind, _, _)| *kind == variant.tag)
                .map_or(("other", ""), |(_, system, blurb)| (*system, *blurb));
            entries.push(Entry {
                kind: variant.tag.clone(),
                system,
                blurb,
                owners,
                outputs,
                fields,
                pauses,
            });
        }
        let mut events = Vec::new();
        for variant in event_variants(root) {
            let mut template = schema::variant_template(root, &variant);
            template["type"] = Value::String("on".to_owned());
            let owners = match &scope {
                Some(scope) => {
                    let (parsed, _) = with_content(scope.clone(), || {
                        serde_json::from_value::<game::systems::script::Node>(template)
                    });
                    match parsed {
                        Ok(game::core::script::Node::On { event, .. }) => event.owners().to_vec(),
                        _ => Vec::new(),
                    }
                }
                None => Vec::new(),
            };
            events.push((variant.tag.clone(), owners));
        }
        Catalogue { entries, events }
    }

    pub fn entry(&self, kind: &str) -> Option<&Entry> {
        self.entries.iter().find(|entry| entry.kind == kind)
    }

    /// Why this owner kind may not use the node kind, if it may not.
    pub fn refusal(&self, kind: &str, owner: OwnerKind) -> Option<String> {
        let entry = self.entry(kind)?;
        allowed(&entry.owners, owner)
    }

    pub fn event_refusal(&self, event: &str, owner: OwnerKind) -> Option<String> {
        let (_, owners) = self.events.iter().find(|(name, _)| name == event)?;
        allowed(owners, owner)
    }
}

fn allowed(owners: &[OwnerKind], owner: OwnerKind) -> Option<String> {
    if owners.is_empty()
        || owner == OwnerKind::Any
        || owners.contains(&owner)
        || owners.contains(&OwnerKind::Any)
    {
        return None;
    }
    let names: Vec<&str> = owners.iter().map(|kind| kind.name()).collect();
    Some(format!(
        "not for {} owners: only {}",
        owner.name(),
        names.join(", ")
    ))
}

pub fn kind(node: &Value) -> &str {
    node["type"].as_str().unwrap_or("")
}

pub fn has_input(node: &Value) -> bool {
    kind(node) != "on"
}

/// The outputs a node leaves by, in the order they are written.
pub fn ports(node: &Value, catalogue: &Catalogue) -> Vec<Port> {
    let arrow = |field: &str| -> Port {
        Port {
            label: field.to_owned(),
            field: format!("/{field}"),
            target: node[field].as_str().map(str::to_owned),
        }
    };
    match kind(node) {
        "on" | "wait" | "set" | "run" => vec![arrow("next")],
        "if" => vec![arrow("yes"), arrow("no")],
        "repeat" => vec![arrow("each"), arrow("then")],
        "return" => Vec::new(),
        "random" => {
            let weights = node["weights"].as_array().cloned().unwrap_or_default();
            let outputs = node["outputs"].as_array().cloned().unwrap_or_default();
            (0..weights.len().max(outputs.len()))
                .map(|index| Port {
                    label: weights
                        .get(index)
                        .and_then(Value::as_u64)
                        .map_or_else(|| format!("{}", index + 1), |w| w.to_string()),
                    field: format!("/outputs/{index}"),
                    target: outputs
                        .get(index)
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                })
                .collect()
        }
        "dialogue" => {
            let choices = node["choices"].as_array().cloned().unwrap_or_default();
            let mut ports: Vec<Port> = choices
                .iter()
                .enumerate()
                .map(|(index, choice)| Port {
                    label: clip(&plain_text(&choice["label"]), 22),
                    field: format!("/choices/{index}/to"),
                    target: choice["to"].as_str().map(str::to_owned),
                })
                .collect();
            if choices.is_empty() {
                ports.push(arrow("next"));
            }
            ports.push(arrow("left"));
            ports
        }
        other => catalogue
            .entry(other)
            .map(|entry| entry.outputs.iter().map(|name| arrow(name)).collect())
            .unwrap_or_default(),
    }
}

/// Writes or clears the arrow at `field` (a pointer inside the node).
pub fn set_arrow(node: &mut Value, field: &str, target: Option<&str>) {
    let (parent, last) = match field.rfind('/') {
        Some(at) => (&field[..at], &field[at + 1..]),
        None => ("", field),
    };
    let Some(holder) = (if parent.is_empty() {
        Some(&mut *node)
    } else {
        node.pointer_mut(parent)
    }) else {
        return;
    };
    match holder {
        Value::Object(map) => match target {
            Some(target) => {
                map.insert(last.to_owned(), Value::String(target.to_owned()));
            }
            None => {
                map.remove(last);
            }
        },
        Value::Array(list) => {
            if let Ok(index) = last.parse::<usize>() {
                while list.len() <= index {
                    list.push(Value::Null);
                }
                list[index] = target.map_or(Value::Null, |t| Value::String(t.to_owned()));
            }
        }
        _ => {}
    }
}

/// Every arrow pointing at `target`: the node it leaves and the field it sits in.
pub fn arrows_into(
    nodes: &Map<String, Value>,
    target: &str,
    catalogue: &Catalogue,
) -> Vec<(String, String)> {
    let mut found = Vec::new();
    for (name, node) in nodes {
        for port in ports(node, catalogue) {
            if port.target.as_deref() == Some(target) {
                found.push((name.clone(), port.field));
            }
        }
    }
    found
}

/// What the arrow leaving `from` by `field` is called on its card.
pub fn port_label(
    nodes: &Map<String, Value>,
    catalogue: &Catalogue,
    from: &str,
    field: &str,
) -> String {
    nodes
        .get(from)
        .and_then(|node| {
            ports(node, catalogue)
                .into_iter()
                .find(|port| port.field == field)
        })
        .map(|port| port.label)
        .unwrap_or_else(|| field.rsplit('/').next().unwrap_or("").to_owned())
}

/// The nodes a flow can reach from any on node.
pub fn reachable(nodes: &Map<String, Value>, catalogue: &Catalogue) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut queue: VecDeque<String> = nodes
        .iter()
        .filter(|(_, node)| kind(node) == "on")
        .map(|(name, _)| name.clone())
        .collect();
    while let Some(name) = queue.pop_front() {
        if !seen.insert(name.clone()) {
            continue;
        }
        if let Some(node) = nodes.get(&name) {
            for port in ports(node, catalogue) {
                if let Some(target) = port.target
                    && !seen.contains(&target)
                {
                    queue.push_back(target);
                }
            }
        }
    }
    seen
}

/// Renames a node and every arrow naming it.
pub fn rename(nodes: &mut Map<String, Value>, old: &str, new: &str, catalogue: &Catalogue) {
    let Some(node) = nodes.remove(old) else {
        return;
    };
    nodes.insert(new.to_owned(), node);
    let arrows: Vec<(String, String)> = arrows_into(nodes, old, catalogue);
    for (from, field) in arrows {
        if let Some(node) = nodes.get_mut(&from) {
            set_arrow(node, &field, Some(new));
        }
    }
    let mut sorted: Vec<(String, Value)> = std::mem::take(nodes).into_iter().collect();
    sorted.sort_by(|(a, _), (b, _)| a.cmp(b));
    nodes.extend(sorted);
}

/// A key not yet taken: `base`, then `base_2`, `base_3`, …
pub fn free_name(nodes: &Map<String, Value>, base: &str) -> String {
    let base = base
        .trim()
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '_', "_");
    let base = if base.is_empty() {
        "node".to_owned()
    } else {
        base
    };
    if !nodes.contains_key(&base) {
        return base;
    }
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|name| !nodes.contains_key(name))
        .expect("a free suffix")
}

/// A fresh node of `kind`, its required fields filled.
pub fn template(root: &Value, kind: &str) -> Option<Value> {
    if kind == "on" {
        return Some(serde_json::json!({ "type": "on", "event": "started" }));
    }
    let variants = variants(root);
    let variant = variants.iter().find(|variant| variant.tag == kind)?;
    let mut value = schema::variant_template(root, variant);
    match kind {
        "dialogue" => {
            value["lines"] = serde_json::json!([{ "by": { "type": "narrator" }, "text": [""] }]);
        }
        "random" => {
            value["weights"] = serde_json::json!([1, 1]);
            value["outputs"] = serde_json::json!([null, null]);
        }
        "repeat" => {
            value["times"] = Value::from(2);
            value["at_most"] = Value::from(10);
        }
        "wait" => {
            value["seconds"] = Value::from(1.0);
            value["at_most"] = Value::from(60.0);
        }
        "if" => value["test"] = Value::Bool(true),
        _ => {}
    }
    Some(value)
}

/// Points every empty row reference in `value` at the first row of its table, so a fresh node loads.
pub fn fill_references(
    root: &Value,
    schema: &Value,
    value: &mut Value,
    files: &crate::project::Files,
) {
    let schema = schema::resolve(root, schema);
    if let Some(table) = schema::table_of(schema) {
        if value.as_str().is_some_and(str::is_empty)
            && let Some(key) = files
                .paths_under(&format!("tables/{table}/"))
                .filter_map(|file| crate::project::row_of(file).map(|(_, key)| key.to_owned()))
                .min()
        {
            *value = Value::String(key);
        }
        return;
    }
    match schema::kind(root, schema) {
        schema::Kind::Object => {
            for (name, field) in schema::properties(schema) {
                if let Some(inner) = value.get_mut(name) {
                    fill_references(root, field, inner, files);
                }
            }
        }
        schema::Kind::Choice(alternatives) => {
            if let Some(alternative) = alternatives
                .iter()
                .find(|alternative| crate::forms::fits(root, alternative, value))
            {
                fill_references(root, alternative, value, files);
            }
        }
        schema::Kind::Union(variants) => {
            if let Some(variant) = schema::variant_of(&variants, value) {
                fill_references(root, variant.schema, value, files);
            }
        }
        _ => {}
    }
}

/// An on node starting at `event`, the event's required fields filled.
pub fn template_event(root: &Value, event: &str) -> Option<Value> {
    let variant = event_variants(root)
        .into_iter()
        .find(|variant| variant.tag == event)?;
    let mut node = schema::variant_template(root, &variant);
    node["type"] = Value::String("on".to_owned());
    if event == "interacted" {
        node["verb"] = Value::String("talk".to_owned());
        node["reach"] = Value::from(1.5);
    }
    if event == "came_near" || event == "heard" {
        node["within"] = Value::from(4.0);
    }
    Some(node)
}

/// A node's event, with the on node's arrow and tag set aside.
pub fn event_of(node: &Value) -> Option<&str> {
    node["event"].as_str()
}

pub fn node_schema(root: &Value) -> Option<&Value> {
    root.get("properties")?
        .get("nodes")?
        .get("additionalProperties")
}

pub fn variants(root: &Value) -> Vec<Variant<'_>> {
    let Some(schema) = node_schema(root) else {
        return Vec::new();
    };
    match schema::kind(root, schema) {
        schema::Kind::Union(variants) => variants,
        _ => Vec::new(),
    }
}

pub fn variant_schema<'a>(root: &'a Value, kind: &str) -> Option<&'a Value> {
    variants(root)
        .into_iter()
        .find(|variant| variant.tag == kind)
        .map(|variant| variant.schema)
}

/// The events an on node may start at, each tagged `event`.
pub fn event_variants(root: &Value) -> Vec<Variant<'_>> {
    let Some(on) = variant_schema(root, "on") else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for alternative in on
        .get("oneOf")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some((field, tag)) = schema::tag_of(alternative)
            && field == "event"
        {
            found.push(Variant {
                field,
                tag,
                schema: alternative,
            });
        }
    }
    found
}

/// The schema of a node kind with its arrows and tag left out, for a form that edits only what
/// wires do not.
pub fn form_schema(root: &Value, node: &Value) -> Option<Value> {
    let kind = kind(node);
    let schema = variant_schema(root, kind)?;
    let mut form = schema.clone();
    let arrows: HashSet<String> = match kind {
        "on" => ["next"].iter().map(|s| (*s).to_owned()).collect(),
        "if" => ["yes", "no"].iter().map(|s| (*s).to_owned()).collect(),
        "repeat" => ["each", "then"].iter().map(|s| (*s).to_owned()).collect(),
        "random" => ["outputs"].iter().map(|s| (*s).to_owned()).collect(),
        "dialogue" => ["next", "left", "lines", "choices"]
            .iter()
            .map(|s| (*s).to_owned())
            .collect(),
        _ => schema::properties(schema)
            .into_iter()
            .filter(|(_, field)| is_arrow(field))
            .map(|(name, _)| name.clone())
            .collect(),
    };
    if let Some(properties) = form.get_mut("properties").and_then(Value::as_object_mut) {
        properties.remove("type");
        if kind == "on" {
            properties.remove("event");
        }
        for name in &arrows {
            properties.remove(name);
        }
    }
    if let Some(required) = form.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|name| {
            name.as_str()
                .is_none_or(|n| n != "type" && !arrows.contains(n))
        });
    }
    if let Some(map) = form.as_object_mut() {
        map.remove("oneOf");
    }
    Some(form)
}

/// The schema of an on node's event fields, the tag left out.
pub fn event_form_schema(root: &Value, event: &str) -> Option<Value> {
    let variant = event_variants(root)
        .into_iter()
        .find(|variant| variant.tag == event)?;
    let mut form = variant.schema.clone();
    if let Some(properties) = form.get_mut("properties").and_then(Value::as_object_mut) {
        properties.remove("event");
    }
    if let Some(required) = form.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|name| name != "event");
    }
    Some(form)
}

fn is_arrow(field: &Value) -> bool {
    let types = schema::type_names(field);
    types.len() == 2
        && types.contains(&"string")
        && types.contains(&"null")
        && schema::marker(field).is_none()
}

fn flow_outputs(kind: &str) -> Vec<String> {
    match kind {
        "on" | "wait" | "set" | "run" => vec!["next".to_owned()],
        "if" => vec!["yes".to_owned(), "no".to_owned()],
        "repeat" => vec!["each".to_owned(), "then".to_owned()],
        "random" => vec!["outputs".to_owned()],
        "dialogue" => vec!["choices".to_owned(), "next".to_owned(), "left".to_owned()],
        _ => Vec::new(),
    }
}

/// A short reading of a node for its card, the outline and the trace.
pub fn summary(node: &Value) -> String {
    match kind(node) {
        "on" => {
            let mut text = format!("on {}", event_of(node).unwrap_or("?"));
            if let Some(verb) = node["verb"].as_str() {
                text.push_str(&format!(" · {verb}"));
            }
            if let Some(by) = node["by"].as_str() {
                text.push_str(&format!(" by {by}"));
            }
            if let Some(within) = node["within"].as_f64() {
                text.push_str(&format!(" within {within}"));
            }
            text
        }
        "if" => format!("if {}", crate::condition::summary(&node["test"])),
        "random" => {
            let weights: Vec<String> = node["weights"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|w| w.to_string())
                .collect();
            format!("random {}", weights.join(" : "))
        }
        "repeat" => format!("repeat {} ×", crate::condition::summary(&node["times"])),
        "wait" => format!("wait {} s", crate::condition::summary(&node["seconds"])),
        "set" => {
            let names: Vec<String> = node["values"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|value| {
                    value["local"]
                        .as_str()
                        .map(|name| format!("local {name}"))
                        .or_else(|| value["state"].as_str().map(|name| format!("state {name}")))
                        .unwrap_or_default()
                })
                .collect();
            format!("set {}", names.join(", "))
        }
        "run" => format!("run {}", node["script"].as_str().unwrap_or("?")),
        "return" => match node.get("value") {
            Some(value) if !value.is_null() => {
                format!("return {}", crate::condition::summary(value))
            }
            _ => "return".to_owned(),
        },
        "dialogue" => {
            let lines = node["lines"].as_array().cloned().unwrap_or_default();
            let first = lines.first();
            let speaker = first
                .map(|line| speaker_name(&line["by"]))
                .unwrap_or_default();
            let text = first
                .map(|line| plain_text(&line["text"]))
                .unwrap_or_default();
            let choices = node["choices"].as_array().map_or(0, Vec::len);
            let mut out = format!("{speaker}: {}", clip(&text, 48));
            if lines.len() > 1 {
                out.push_str(&format!(" (+{} lines)", lines.len() - 1));
            }
            if choices > 0 {
                out.push_str(&format!(" · {choices} choices"));
            }
            out
        }
        other => {
            let mut out = other.replace('_', " ");
            for field in CONTENT_FIELDS {
                if let Some(value) = node.get(*field)
                    && !value.is_null()
                {
                    out.push(' ');
                    out.push_str(&content_text(value));
                }
            }
            if let Some(take) = node["take"].as_array()
                && !take.is_empty()
            {
                out.push_str(&format!(" takes {}", stacks(take)));
            }
            if let Some(give) = node["give"].as_array()
                && !give.is_empty()
            {
                out.push_str(&format!(" gives {}", stacks(give)));
            }
            if let Some(items) = node["items"].as_array()
                && !items.is_empty()
            {
                out.push(' ');
                out.push_str(&stacks(items));
            }
            if let Some(text) = node["text"].as_array() {
                out.push_str(&format!(
                    " {:?}",
                    clip(&plain_text(&Value::Array(text.clone())), 40)
                ));
            }
            out
        }
    }
}

const CONTENT_FIELDS: &[&str] = &[
    "to",
    "item",
    "quest",
    "shop",
    "memory",
    "notification",
    "npc",
    "job",
    "sfx",
    "stat",
    "attitude",
    "slot",
    "task",
    "path",
    "memories",
    "count",
    "by",
    "xp",
    "seconds",
    "toward",
    "target",
    "priority",
];

fn content_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Object(map) if map.len() == 1 && map.contains_key("var") => {
            format!("◇{}", map["var"].as_str().unwrap_or(""))
        }
        Value::Object(map) if map.contains_key("area") && map.contains_key("x") => format!(
            "{} {}, {}",
            map["area"].as_str().unwrap_or("?"),
            map["x"].as_f64().unwrap_or(0.0),
            map["y"].as_f64().unwrap_or(0.0)
        ),
        Value::Array(items) => items
            .iter()
            .map(content_text)
            .collect::<Vec<_>>()
            .join(", "),
        other => crate::condition::summary(other),
    }
}

fn stacks(list: &[Value]) -> String {
    list.iter()
        .map(|stack| {
            let count = stack["count"].as_u64().unwrap_or(1);
            let item = stack["item"].as_str().unwrap_or("?");
            if count == 1 {
                item.to_owned()
            } else {
                format!("{count} {item}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn speaker_name(by: &Value) -> String {
    match by["type"].as_str() {
        Some("npc") => by["npc"].as_str().unwrap_or("npc").to_owned(),
        Some("object") => "object".to_owned(),
        Some("narrator") => "narrator".to_owned(),
        Some("player") => "player".to_owned(),
        _ => "?".to_owned(),
    }
}

/// The words of a span list, inks and values folded to text.
pub fn plain_text(spans: &Value) -> String {
    match spans {
        Value::String(text) => text.clone(),
        Value::Array(items) => items.iter().map(plain_text).collect::<String>(),
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                text.to_owned()
            } else if let Some(value) = map.get("value") {
                format!("[{}]", crate::condition::summary(value))
            } else if let Some(input) = map.get("input").and_then(Value::as_str) {
                format!("[{input}]")
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

pub fn clip(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Node names in written order with their depth from the first on node reaching them, for the
/// outline; a node reached twice appears once, later visits as links.
pub struct OutlineRow {
    pub name: String,
    pub depth: usize,
    pub via: Option<String>,
    pub link: bool,
    pub choice: Option<usize>,
}

/// The graph as rows: each node under the arrow that led there, a dialogue's choices under it
/// with their targets nested one deeper, and a node reached twice as a link back.
pub fn outline(nodes: &Map<String, Value>, catalogue: &Catalogue) -> Vec<OutlineRow> {
    let mut rows = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    fn walk(
        nodes: &Map<String, Value>,
        catalogue: &Catalogue,
        name: &str,
        depth: usize,
        via: Option<String>,
        seen: &mut HashSet<String>,
        rows: &mut Vec<OutlineRow>,
    ) {
        if depth > 64 {
            return;
        }
        let link = !seen.insert(name.to_owned());
        rows.push(OutlineRow {
            name: name.to_owned(),
            depth,
            via,
            link,
            choice: None,
        });
        if link {
            return;
        }
        let Some(node) = nodes.get(name) else {
            return;
        };
        if kind(node) == "dialogue" {
            for (index, choice) in node["choices"].as_array().into_iter().flatten().enumerate() {
                rows.push(OutlineRow {
                    name: name.to_owned(),
                    depth: depth + 1,
                    via: None,
                    link: false,
                    choice: Some(index),
                });
                if let Some(target) = choice["to"].as_str() {
                    walk(nodes, catalogue, target, depth + 2, None, seen, rows);
                }
            }
            for port in ports(node, catalogue)
                .into_iter()
                .filter(|port| !port.field.starts_with("/choices/"))
            {
                if let Some(target) = port.target {
                    walk(
                        nodes,
                        catalogue,
                        &target,
                        depth + 1,
                        Some(port.label.clone()),
                        seen,
                        rows,
                    );
                }
            }
            return;
        }
        for port in ports(node, catalogue) {
            if let Some(target) = port.target {
                walk(
                    nodes,
                    catalogue,
                    &target,
                    depth + 1,
                    Some(port.label.clone()),
                    seen,
                    rows,
                );
            }
        }
    }
    for (name, node) in nodes {
        if kind(node) == "on" {
            walk(nodes, catalogue, name, 0, None, &mut seen, &mut rows);
        }
    }
    for name in nodes.keys() {
        if !seen.contains(name) {
            walk(
                nodes,
                catalogue,
                name,
                0,
                Some("unreachable".to_owned()),
                &mut seen,
                &mut rows,
            );
        }
    }
    rows
}

/// Nodes and the depth each sits at from the on nodes, for a first layout.
pub fn depths(nodes: &Map<String, Value>, catalogue: &Catalogue) -> BTreeMap<String, usize> {
    let mut depths: BTreeMap<String, usize> = BTreeMap::new();
    let mut queue: VecDeque<(String, usize)> = nodes
        .iter()
        .filter(|(_, node)| kind(node) == "on")
        .map(|(name, _)| (name.clone(), 0))
        .collect();
    while let Some((name, depth)) = queue.pop_front() {
        if depths.contains_key(&name) {
            continue;
        }
        depths.insert(name.clone(), depth);
        if let Some(node) = nodes.get(&name) {
            for port in ports(node, catalogue) {
                if let Some(target) = port.target
                    && !depths.contains_key(&target)
                {
                    queue.push_back((target, depth + 1));
                }
            }
        }
    }
    depths
}

pub fn owner_kind_of(table: &str, pointer: &str) -> OwnerKind {
    match table {
        "npc" => OwnerKind::Npc,
        "item" => OwnerKind::Item,
        "quest" => OwnerKind::Quest,
        "shop" => OwnerKind::Shop,
        "blueprint" => OwnerKind::Blueprint,
        "area" if pointer.contains("/scripts/") => OwnerKind::Object,
        "area" => OwnerKind::Area,
        "script" => OwnerKind::Any,
        _ => OwnerKind::Any,
    }
}

pub fn owner_kind_named(name: &str) -> OwnerKind {
    match name {
        "object" => OwnerKind::Object,
        "npc" => OwnerKind::Npc,
        "item" => OwnerKind::Item,
        "area" => OwnerKind::Area,
        "quest" => OwnerKind::Quest,
        "shop" => OwnerKind::Shop,
        "blueprint" => OwnerKind::Blueprint,
        _ => OwnerKind::Any,
    }
}

const FLOW_BLURBS: [(&str, &str); 9] = [
    ("on", "Starts a flow at an event; its cause is the subject"),
    ("if", "Takes yes when the test holds, else no"),
    ("random", "Picks an output by weight"),
    ("repeat", "Runs each a number of times, then goes on"),
    ("wait", "Pauses for seconds, or one tick at 0"),
    ("set", "Writes locals and owner state in order"),
    ("run", "Calls another script and goes on when it ends"),
    ("return", "Ends a called script, handing back a value"),
    ("dialogue", "Lines and choices spoken to the subject"),
];

const EFFECT_BLURBS: [(&str, &str, &str); 35] = [
    (
        "warp",
        "area",
        "Moves an actor to a place, setting its spawn point",
    ),
    ("heal", "stat", "Restores health up to the maximum"),
    ("damage", "stat", "Takes health, credited to an npc owner"),
    ("buff", "stat", "Adds a timed effect to a stat"),
    ("clear_buffs", "stat", "Ends every timed effect"),
    (
        "items",
        "item",
        "Takes and gives items in one exchange, all or nothing",
    ),
    ("use_item", "item", "Uses an item as the player would"),
    ("equip", "item", "Puts an item on, swapping with the slot"),
    ("unequip", "item", "Takes an item or slot off"),
    (
        "drop_items",
        "item",
        "Drops items to the ground at their feet",
    ),
    (
        "spawn_ground_items",
        "item",
        "Scatters items as loot at a place or actor",
    ),
    (
        "clear_ground_items",
        "item",
        "Removes ground items in range",
    ),
    ("move_items", "item", "Moves items from one bag to another"),
    ("grant_xp", "job", "Grants experience as kills do"),
    ("set_job", "job", "Sets the job"),
    ("remember", "memory", "Sets a memory, timed now"),
    ("forget", "memory", "Sets memories back to zero"),
    ("offer_quest", "quest", "Shows the offer card and pauses"),
    ("accept_quest", "quest", "Takes the quest at once"),
    ("turn_in", "quest", "Shows the turn-in card and pauses"),
    ("fail_quest", "quest", "Fails an active quest"),
    ("complete_task", "quest", "Completes a task objective"),
    ("decide", "quest", "Decides a quest's path"),
    ("open_shop", "shop", "Opens the shop until it closes"),
    ("notify", "notification", "Shows a notification"),
    (
        "say",
        "chat",
        "A chat line and a speech bubble from the owner",
    ),
    ("wander", "npc body", "Walks to a random reachable spot"),
    (
        "walk_to",
        "npc body",
        "Walks to a place, an object or an actor",
    ),
    ("attack", "npc body", "Chases and swings at a target"),
    ("stop", "npc body", "Interrupts the body"),
    ("face", "npc body", "Turns the body toward something"),
    (
        "set_attitude",
        "npc",
        "Hostile or friendly, until set again",
    ),
    ("spawn_npcs", "npc", "Spawns a pack of npcs nearby"),
    ("despawn", "npc", "Removes an npc that spawn_npcs made"),
    (
        "play_sound",
        "audio",
        "Plays a sound at the owner or the subject",
    ),
];

/// One styled run of a card line.
#[derive(Clone, Debug, PartialEq)]
pub struct Piece {
    pub text: String,
    pub tone: Tone,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Muted,
    Strong,
    Var,
}

fn muted(text: impl Into<String>) -> Piece {
    Piece {
        text: text.into(),
        tone: Tone::Muted,
    }
}

fn strong(text: impl Into<String>) -> Piece {
    Piece {
        text: text.into(),
        tone: Tone::Strong,
    }
}

fn var(text: impl Into<String>) -> Piece {
    Piece {
        text: text.into(),
        tone: Tone::Var,
    }
}

/// The card lines of a node: what it names in strong text, the words around it muted.
pub fn pieces(node: &Value, catalogue: &Catalogue) -> Vec<Vec<Piece>> {
    match kind(node) {
        "on" => vec![event_pieces(node)],
        "if" => vec![expression_pieces(&node["test"])],
        "random" => {
            let weights: Vec<String> = node["weights"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|w| w.to_string())
                .collect();
            vec![vec![muted("weights "), strong(weights.join(" : "))]]
        }
        "repeat" => {
            let mut line = expression_pieces(&node["times"]);
            line.push(muted(" times"));
            if let Some(at_most) = node["at_most"].as_f64() {
                line.push(muted(" · at most "));
                line.push(strong(trim(at_most)));
            }
            vec![line]
        }
        "wait" => {
            let mut line = expression_pieces(&node["seconds"]);
            line.push(muted(" s"));
            if node["seconds"].as_f64() == Some(0.0) {
                line.push(muted(" · the next tick"));
            } else if let Some(at_most) = node["at_most"].as_f64() {
                line.push(muted(" · at most "));
                line.push(strong(trim(at_most)));
            }
            vec![line]
        }
        "set" => node["values"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|value| {
                let name = value["local"]
                    .as_str()
                    .or(value["state"].as_str())
                    .unwrap_or("?");
                let mut line = vec![strong(name), muted(" = ")];
                line.extend(expression_pieces(&value["to"]));
                line
            })
            .collect(),
        "run" => {
            let mut lines = vec![vec![
                muted("script/"),
                strong(node["script"].as_str().unwrap_or("?")),
            ]];
            if let Some(values) = node["values"].as_object().filter(|v| !v.is_empty()) {
                let mut line = Vec::new();
                for (index, (name, value)) in values.iter().enumerate() {
                    if index > 0 {
                        line.push(muted(" · "));
                    }
                    line.push(muted(format!("{name} ")));
                    line.extend(expression_pieces(value));
                }
                lines.push(line);
            }
            lines
        }
        "return" => match node.get("value") {
            Some(value) if !value.is_null() => vec![expression_pieces(value)],
            _ => vec![vec![muted("back to the caller")]],
        },
        "remember" => {
            let mut line = vec![strong(node["memory"].as_str().unwrap_or("?")), muted(" = ")];
            match node.get("to") {
                Some(to) if !to.is_null() => line.extend(expression_pieces(to)),
                _ => line.push(strong("true")),
            }
            vec![line]
        }
        "forget" => vec![vec![
            strong(
                node["memories"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", "),
            ),
            muted(" back to zero"),
        ]],
        "items" => {
            let mut lines = Vec::new();
            for (field, word) in [("take", "take "), ("give", "give ")] {
                if let Some(list) = node[field].as_array().filter(|l| !l.is_empty()) {
                    let mut line = vec![muted(word)];
                    for (index, stack) in list.iter().enumerate() {
                        if index > 0 {
                            line.push(muted(", "));
                        }
                        let count = stack["count"].as_u64().unwrap_or(1);
                        line.push(strong(format!("{count} ")));
                        line.push(strong(stack["item"].as_str().unwrap_or("?")));
                    }
                    lines.push(line);
                }
            }
            if lines.is_empty() {
                lines.push(vec![muted("nothing changes hands")]);
            }
            lines
        }
        "dialogue" => Vec::new(),
        "warp" => {
            let who = node["who"]
                .as_str()
                .map(actor_word)
                .unwrap_or_else(|| "the subject".to_owned());
            let mut line = vec![strong(who), muted(" to ")];
            match &node["to"] {
                Value::Object(map) if map.len() == 1 && map.contains_key("var") => {
                    line.push(var(format!("◇ {}", map["var"].as_str().unwrap_or(""))))
                }
                Value::Object(map) if map.contains_key("area") => line.push(strong(format!(
                    "{} {}, {}",
                    map["area"].as_str().unwrap_or("?"),
                    trim(map["x"].as_f64().unwrap_or(0.0)),
                    trim(map["y"].as_f64().unwrap_or(0.0))
                ))),
                other => line.extend(expression_pieces(other)),
            }
            vec![line, vec![muted("sets its spawn point")]]
        }
        other => effect_pieces(node, other, catalogue),
    }
}

fn event_pieces(node: &Value) -> Vec<Piece> {
    let mut line = Vec::new();
    match event_of(node) {
        Some("interacted") => {
            line.push(muted("verb "));
            line.push(strong(node["verb"].as_str().unwrap_or("use")));
            if let Some(reach) = node["reach"].as_f64() {
                line.push(muted(" · reach "));
                line.push(strong(trim(reach)));
                line.push(muted(" tiles"));
            }
        }
        Some("came_near") | Some("entered") | Some("left") => {
            if let Some(by) = node["by"].as_str() {
                line.push(strong(by));
            } else {
                line.push(strong("characters"));
            }
            if let Some(within) = node["within"].as_f64() {
                line.push(muted(" within "));
                line.push(strong(trim(within)));
            }
        }
        Some("started") => line.push(muted("the owner spawned")),
        Some("run") => line.push(muted("started by a run node")),
        Some(_) | None => {
            for (field, value) in node.as_object().into_iter().flatten() {
                if matches!(field.as_str(), "type" | "event" | "next") {
                    continue;
                }
                if !line.is_empty() {
                    line.push(muted(" · "));
                }
                line.push(muted(format!("{field} ")));
                line.extend(expression_pieces(value));
            }
        }
    }
    line
}

fn effect_pieces(node: &Value, kind: &str, catalogue: &Catalogue) -> Vec<Vec<Piece>> {
    let fields: Vec<(String, Option<String>)> = catalogue
        .entry(kind)
        .map(|entry| entry.fields.clone())
        .unwrap_or_else(|| {
            node.as_object()
                .into_iter()
                .flatten()
                .map(|(name, _)| (name.clone(), None))
                .filter(|(name, _)| name != "type")
                .collect()
        });
    let mut named: Vec<Piece> = Vec::new();
    let mut rest: Vec<Piece> = Vec::new();
    for (field, table) in &fields {
        let Some(value) = node.get(field).filter(|v| !v.is_null()) else {
            continue;
        };
        let mut piece: Vec<Piece> = Vec::new();
        match (table, value) {
            (Some(table), Value::String(key)) => {
                piece.push(muted(format!("{table}/")));
                piece.push(strong(key));
            }
            (_, Value::Object(map)) if map.len() == 1 && map.contains_key("var") => {
                if field != "who" {
                    piece.push(muted(format!("{field} ")));
                }
                piece.push(var(format!("◇ {}", map["var"].as_str().unwrap_or(""))));
            }
            (_, Value::String(text))
                if matches!(
                    field.as_str(),
                    "who" | "at" | "for" | "toward" | "target" | "from" | "to"
                ) =>
            {
                if field != "who" {
                    piece.push(muted(format!("{field} ")));
                }
                piece.push(strong(actor_word(text)));
            }
            (_, Value::Array(list)) if list.iter().all(|item| item.get("item").is_some()) => {
                piece.push(muted(format!("{field} ")));
                for (index, stack) in list.iter().enumerate() {
                    if index > 0 {
                        piece.push(muted(", "));
                    }
                    let count = stack["count"].as_u64().unwrap_or(1);
                    piece.push(strong(format!(
                        "{count} {}",
                        stack["item"].as_str().unwrap_or("?")
                    )));
                }
            }
            (_, Value::Object(map)) if map.contains_key("area") && map.contains_key("x") => {
                if field != "to" {
                    piece.push(muted(format!("{field} ")));
                }
                piece.push(strong(format!(
                    "{} {}, {}",
                    map["area"].as_str().unwrap_or("?"),
                    trim(map["x"].as_f64().unwrap_or(0.0)),
                    trim(map["y"].as_f64().unwrap_or(0.0))
                )));
            }
            (_, Value::Object(map))
                if map.get("type").is_some()
                    && matches!(
                        map["type"].as_str(),
                        Some("object") | Some("actor") | Some("place")
                    ) =>
            {
                let inner = map
                    .iter()
                    .find(|(k, _)| *k != "type")
                    .map(|(_, v)| content_text(v))
                    .unwrap_or_default();
                piece.push(muted(format!("{} ", map["type"].as_str().unwrap_or(""))));
                piece.push(strong(inner));
            }
            (_, Value::Number(_)) | (_, Value::Bool(_)) => {
                piece.push(muted(format!("{field} ")));
                piece.push(strong(content_text(value)));
            }
            (_, Value::String(text)) => {
                piece.push(strong(text));
            }
            (_, Value::Array(list)) => {
                piece.push(muted(format!("{field} ")));
                piece.push(strong(
                    list.iter().map(content_text).collect::<Vec<_>>().join(", "),
                ));
            }
            (_, other) => {
                piece.push(muted(format!("{field} ")));
                piece.extend(expression_pieces(other));
            }
        }
        let main = table.is_some()
            || matches!(
                field.as_str(),
                "who" | "to" | "at" | "for" | "toward" | "target"
            )
            || value.is_object()
            || value.is_array();
        let into = if main { &mut named } else { &mut rest };
        if !into.is_empty() {
            into.push(muted(" · "));
        }
        into.extend(piece);
    }
    let mut lines = Vec::new();
    if !named.is_empty() {
        lines.push(named);
    }
    if !rest.is_empty() {
        lines.push(rest);
    }
    lines
}

fn actor_word(text: &str) -> String {
    match text {
        "subject" => "the subject".to_owned(),
        "owner" => "the owner".to_owned(),
        other => other.replace('_', " "),
    }
}

/// A condition or expression as strong names and muted words.
pub fn expression_pieces(value: &Value) -> Vec<Piece> {
    if let Some(map) = value.as_object()
        && map.len() == 1
        && let Some(name) = map.get("var").and_then(Value::as_str)
    {
        return vec![var(format!("◇ {name}"))];
    }
    let summary = crate::condition::summary(value);
    let mut out: Vec<Piece> = Vec::new();
    for word in summary.split(' ') {
        let bare = word.trim_matches(|c: char| c == '(' || c == ')' || c == ',');
        let is_name = !bare.is_empty()
            && (bare.contains('_')
                || bare.chars().all(|c| c.is_ascii_digit() || c == '.')
                || bare.starts_with('"')
                || bare == "true"
                || bare == "false");
        let piece = if is_name { strong(word) } else { muted(word) };
        if let Some(last) = out.last_mut()
            && last.tone == piece.tone
        {
            last.text.push(' ');
            last.text.push_str(&piece.text);
        } else {
            if !out.is_empty() {
                out.push(muted(" "));
            }
            out.push(piece);
        }
    }
    out
}

fn trim(number: f64) -> String {
    if number.fract() == 0.0 {
        format!("{}", number as i64)
    } else {
        format!("{number}")
    }
}

/// The bust image of an npc's face, from its model's bust module.
pub fn bust_file(files: &crate::project::Files, npc: &str, face: Option<&str>) -> Option<String> {
    let npc_row = files.json(&crate::project::row_file("npc", npc))?;
    let model = files.json(&crate::project::row_file(
        "model",
        npc_row["model"].as_str()?,
    ))?;
    let bust = model["modules"]
        .as_array()?
        .iter()
        .find(|module| module["type"] == "bust")?;
    let face = face.unwrap_or("neutral");
    if let Some(file) = bust[face].as_str() {
        return Some(file.to_owned());
    }
    bust["own"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|own| own["name"].as_str() == Some(face))
        .and_then(|own| own["file"].as_str().map(str::to_owned))
        .or_else(|| bust["neutral"].as_str().map(str::to_owned))
}
