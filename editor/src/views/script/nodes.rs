use std::collections::{BTreeMap, HashSet, VecDeque};

use engine::core::content::{Content, ContentScope, with_content};
use engine::core::script::node::MAX_CALL_DEPTH;
use engine::core::script::{EffectDef, EventDef, NodeKind, REFUSED, RunnerKindDef};
use engine::systems::actor::model::Expression;
use engine::systems::area::blueprint::hole_name;
use engine::systems::npc::NpcDef;
use engine::systems::script::{
    EventKind, Node, RiftEffectKind, RiftQuery, RiftQueryKind, RunnerKind,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::keymap::EditorKey;
use crate::project::ProjectFiles;
use crate::schema::{self, SchemaVariant};
use crate::ui::widgets;
use crate::value::RowValue;
use crate::{condition, rows, spans};

/// A node's kind as its tag names it; any tag no flow node takes is an effect's.
pub fn kind_of(node: &Value) -> NodeKind {
    node.kind().parse().unwrap_or(NodeKind::Effect)
}

pub fn is_dialogue(node: &Value) -> bool {
    kind_of(node) == NodeKind::Dialogue
}

pub fn is_event(node: &Value) -> bool {
    kind_of(node) == NodeKind::On
}

pub fn hint(node: &Value) -> String {
    match kind_of(node) {
        NodeKind::Dialogue => format!(
            "{} adds a line · {} a choice · select text to style it",
            EditorKey::Confirm.name(),
            EditorKey::AddChoice.name()
        ),
        NodeKind::If => {
            "each slot takes one type · the same builder edits every condition".to_owned()
        }
        NodeKind::Repeat | NodeKind::Wait | NodeKind::Random => {
            "a loop may come back only through a node that pauses".to_owned()
        }
        NodeKind::Run => format!("calls nest {MAX_CALL_DEPTH} deep and never loop back"),
        NodeKind::On => "a flow starts here; its cause is the subject".to_owned(),
        NodeKind::Set | NodeKind::Return | NodeKind::Effect => {
            "an output without an arrow ends the flow".to_owned()
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LineSpeaker {
    Npc {
        npc: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        face: Option<String>,
    },
    Object,
    Narrator,
    Player,
}

impl LineSpeaker {
    pub fn of(by: &Value) -> Option<LineSpeaker> {
        serde_json::from_value(by.clone()).ok()
    }

    pub fn named(kind: &str, npc: &str) -> LineSpeaker {
        match kind {
            "npc" => LineSpeaker::Npc {
                npc: npc.to_owned(),
                face: None,
            },
            "object" => LineSpeaker::Object,
            "player" => LineSpeaker::Player,
            _ => LineSpeaker::Narrator,
        }
    }

    pub fn options(owner: RunnerKind) -> &'static [&'static str] {
        match owner {
            RunnerKind::Object => &["npc", "object", "narrator"],
            _ => &["npc", "narrator"],
        }
    }

    pub fn json(&self) -> Value {
        serde_json::to_value(self).expect("a speaker serialises")
    }

    pub fn blank_line(&self) -> Value {
        serde_json::json!({ "by": self.json(), "text": [""] })
    }

    pub fn kind(&self) -> &'static str {
        match self {
            LineSpeaker::Npc { .. } => "npc",
            LineSpeaker::Object => "object",
            LineSpeaker::Narrator => "narrator",
            LineSpeaker::Player => "player",
        }
    }

    pub fn npc(&self) -> Option<&str> {
        match self {
            LineSpeaker::Npc { npc, .. } => Some(npc),
            _ => None,
        }
    }

    pub fn faceless(&self) -> LineSpeaker {
        match self {
            LineSpeaker::Npc { npc, .. } => LineSpeaker::Npc {
                npc: npc.clone(),
                face: None,
            },
            other => other.clone(),
        }
    }

    pub fn name(&self) -> String {
        match self {
            LineSpeaker::Npc { npc, .. } => npc.clone(),
            other => other.kind().to_owned(),
        }
    }
}

pub fn speaker_name(by: &Value) -> String {
    LineSpeaker::of(by).map_or_else(|| "?".to_owned(), |speaker| speaker.name())
}

pub fn bust_file(content: Option<&Content>, speaker: &LineSpeaker) -> Option<String> {
    let content = content?;
    let LineSpeaker::Npc { npc, face } = speaker else {
        return None;
    };
    let busts = content
        .by_path::<NpcDef>(npc)?
        .get(content)
        .model
        .get(content)
        .busts()?;
    let face = face
        .as_deref()
        .map(|face| serde_json::from_value::<Expression>(Value::String(face.to_owned())))
        .transpose()
        .ok()?;
    let file = match face {
        Some(face) => busts.face(&face)?,
        None => &busts.generic.neutral,
    };
    Some(file.as_str().to_owned())
}

#[derive(Clone, Debug, PartialEq)]
pub struct NodePort {
    pub label: String,
    pub field: String,
    pub target: Option<String>,
}

#[derive(Clone, Debug)]
pub struct NodeEntry {
    pub kind: String,
    pub system: String,
    pub blurb: String,
    pub owners: Vec<RunnerKind>,
    pub outputs: Vec<NodeOutput>,
    pub fields: Vec<(String, Option<String>)>,
    pub pauses: bool,
}

#[derive(Clone, Debug)]
pub struct NodeOutput {
    pub name: String,
    /// When the node takes the output, as its definition says.
    pub meaning: Option<String>,
    /// Whether the node takes the output when what it does fails.
    pub fails: bool,
}

impl NodeEntry {
    pub fn fits(&self, linking: bool) -> bool {
        (self.kind == NodeKind::On.name()) != linking
    }
}

pub struct OwnerRefusal {
    pub owner: RunnerKind,
    pub allowed: Vec<RunnerKind>,
}

impl OwnerRefusal {
    pub fn text(&self) -> String {
        let names: Vec<&str> = self.allowed.iter().map(|kind| kind.name()).collect();
        format!(
            "not for {} owners: only {}",
            self.owner.name(),
            names.join(", ")
        )
    }

    pub fn only_for(&self) -> String {
        match self.allowed.first() {
            Some(first) => format!(
                "only for {} {} owner",
                widgets::article(first.name()),
                first.name()
            ),
            None => self.text(),
        }
    }
}

#[derive(Default)]
pub struct NodeCatalogue {
    pub entries: Vec<NodeEntry>,
    pub events: Vec<(String, Vec<RunnerKind>)>,
}

impl NodeCatalogue {
    pub fn build(root: &Value) -> NodeCatalogue {
        let parse = |template: Option<Value>| -> Option<Node> {
            let (parsed, _) = with_content(ContentScope::new(), || {
                serde_json::from_value::<Node>(template?).ok()
            });
            parsed
        };
        let entries = variants(root)
            .iter()
            .map(|variant| {
                let (outputs, fields): (Vec<_>, Vec<_>) = schema::properties(variant.schema)
                    .into_iter()
                    .filter(|(name, _)| *name != "type")
                    .partition(|(_, field)| leads_out(field));
                let node = parse(fresh(root, variant));
                NodeEntry {
                    kind: variant.tag.clone(),
                    system: schema::system_of(variant.schema)
                        .unwrap_or("other")
                        .to_owned(),
                    blurb: schema::description(variant.schema)
                        .map(first_sentence)
                        .unwrap_or_default(),
                    owners: match &node {
                        Some(Node::Effect(effect)) => effect.owners().to_vec(),
                        _ => Vec::new(),
                    },
                    outputs: outputs
                        .into_iter()
                        .map(|(name, field)| NodeOutput {
                            name: name.clone(),
                            meaning: schema::description(field).map(first_sentence),
                            fails: field["x-fails"] == true,
                        })
                        .collect(),
                    fields: fields
                        .into_iter()
                        .map(|(name, field)| {
                            (
                                name.clone(),
                                schema::table_of(schema::resolve(root, field)).map(str::to_owned),
                            )
                        })
                        .collect(),
                    pauses: node.as_ref().is_some_and(Node::pauses),
                }
            })
            .collect();
        let events = event_variants(root)
            .into_iter()
            .map(|variant| {
                let owners = match parse(template_event(root, &variant.tag)) {
                    Some(Node::On { event, .. }) => event.owners().to_vec(),
                    _ => Vec::new(),
                };
                (variant.tag.clone(), owners)
            })
            .collect();
        NodeCatalogue { entries, events }
    }

    pub fn entry(&self, kind: &str) -> Option<&NodeEntry> {
        self.entries.iter().find(|entry| entry.kind == kind)
    }

    /// What becomes of a flow that takes the output while no arrow leaves it.
    pub fn unwired(&self, kind: &str, output: &str) -> String {
        let meaning = self
            .entry(kind)
            .and_then(|entry| entry.outputs.iter().find(|known| known.name == output))
            .and_then(|known| known.meaning.as_deref());
        match meaning {
            Some(meaning) => format!("{meaning} · no arrow ends the flow"),
            None if output == REFUSED => {
                "no arrow: the flow ends and the player is told why".to_owned()
            }
            None => "no arrow · ends the flow".to_owned(),
        }
    }

    pub fn refusal(&self, kind: &str, owner: RunnerKind) -> Option<OwnerRefusal> {
        allowed(&self.entry(kind)?.owners, owner)
    }

    pub fn event_refusal(&self, event: &str, owner: RunnerKind) -> Option<OwnerRefusal> {
        let (_, owners) = self.events.iter().find(|(name, _)| name == event)?;
        allowed(owners, owner)
    }
}

fn allowed(owners: &[RunnerKind], owner: RunnerKind) -> Option<OwnerRefusal> {
    if owners.is_empty()
        || owner == RunnerKind::Any
        || owners.contains(&owner)
        || owners.contains(&RunnerKind::Any)
    {
        return None;
    }
    Some(OwnerRefusal {
        owner,
        allowed: owners.to_vec(),
    })
}

pub fn has_input(node: &Value) -> bool {
    !is_event(node)
}

pub fn ports(node: &Value, catalogue: &NodeCatalogue) -> Vec<NodePort> {
    let arrow = |field: &str| -> NodePort {
        NodePort {
            label: field.to_owned(),
            field: format!("/{field}"),
            target: node[field].as_str().map(str::to_owned),
        }
    };
    match kind_of(node) {
        NodeKind::Random => {
            let weights = node["weights"].as_array().cloned().unwrap_or_default();
            let outputs = node["outputs"].as_array().cloned().unwrap_or_default();
            (0..weights.len().max(outputs.len()))
                .map(|index| NodePort {
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
        NodeKind::Dialogue => {
            let choices = node["choices"].as_array().cloned().unwrap_or_default();
            let mut ports: Vec<NodePort> = choices
                .iter()
                .enumerate()
                .map(|(index, choice)| NodePort {
                    label: widgets::clip(&spans::plain(&choice["label"]), 22),
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
        NodeKind::On
        | NodeKind::If
        | NodeKind::Repeat
        | NodeKind::Wait
        | NodeKind::Set
        | NodeKind::Run
        | NodeKind::Return
        | NodeKind::Effect => catalogue
            .entry(node.kind())
            .map(|entry| {
                entry
                    .outputs
                    .iter()
                    .map(|output| arrow(&output.name))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

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

pub fn arrows_into(
    nodes: &Map<String, Value>,
    target: &str,
    catalogue: &NodeCatalogue,
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

pub fn unlink(nodes: &mut Map<String, Value>, target: &str, catalogue: &NodeCatalogue) {
    for (from, field) in arrows_into(nodes, target, catalogue) {
        if let Some(node) = nodes.get_mut(&from) {
            set_arrow(node, &field, None);
        }
    }
}

pub fn port_label(
    nodes: &Map<String, Value>,
    catalogue: &NodeCatalogue,
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

pub fn reachable(nodes: &Map<String, Value>, catalogue: &NodeCatalogue) -> HashSet<String> {
    depths(nodes, catalogue).into_keys().collect()
}

pub fn depths(nodes: &Map<String, Value>, catalogue: &NodeCatalogue) -> BTreeMap<String, usize> {
    let mut depths: BTreeMap<String, usize> = BTreeMap::new();
    let mut queue: VecDeque<(String, usize)> = nodes
        .iter()
        .filter(|(_, node)| is_event(node))
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

pub fn insert_sorted(nodes: &mut Map<String, Value>, name: &str, node: Value) {
    nodes.insert(name.to_owned(), node);
    nodes.sort_keys();
}

pub fn rename(nodes: &mut Map<String, Value>, old: &str, new: &str, catalogue: &NodeCatalogue) {
    let Some(node) = nodes.remove(old) else {
        return;
    };
    insert_sorted(nodes, new, node);
    for (from, field) in arrows_into(nodes, old, catalogue) {
        if let Some(node) = nodes.get_mut(&from) {
            set_arrow(node, &field, Some(new));
        }
    }
}

pub fn free_name(nodes: &Map<String, Value>, base: &str) -> String {
    let base = base
        .trim()
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '_', "_");
    let base = if base.is_empty() { "node" } else { &base };
    rows::free_name(base, &nodes.keys().cloned().collect())
}

pub fn template(root: &Value, kind: &str) -> Option<Value> {
    fresh(
        root,
        variants(root).iter().find(|variant| variant.tag == kind)?,
    )
}

/// A node as the editor first places it: the schema's least, with a start a writer can see work.
fn fresh(root: &Value, variant: &SchemaVariant) -> Option<Value> {
    let kind: NodeKind = variant.tag.parse().unwrap_or(NodeKind::Effect);
    if kind == NodeKind::On {
        return template_event(root, EventKind::Started.name());
    }
    let mut value = schema::variant_template(root, variant);
    match kind {
        NodeKind::Dialogue => {
            value["lines"] = serde_json::json!([LineSpeaker::Narrator.blank_line()]);
        }
        NodeKind::Random => {
            value["weights"] = serde_json::json!([1, 1]);
            value["outputs"] = serde_json::json!([null, null]);
        }
        NodeKind::Repeat => {
            value["times"] = Value::from(2);
            value["at_most"] = Value::from(10);
        }
        NodeKind::Wait => {
            value["seconds"] = Value::from(1.0);
            value["at_most"] = Value::from(60.0);
        }
        NodeKind::If => value["test"] = Value::Bool(true),
        NodeKind::On | NodeKind::Set | NodeKind::Run | NodeKind::Return | NodeKind::Effect => {}
    }
    Some(value)
}

/// Fills each empty reference in a new node with the first file of its type.
pub fn fill_references(root: &Value, schema: &Value, value: &mut Value, files: &ProjectFiles) {
    let schema = schema::resolve(root, schema);
    if let Some(table) = schema::table_of(schema) {
        if value.as_str().is_some_and(str::is_empty)
            && let Some(key) = files.index().paths_of(table).min()
        {
            *value = Value::from(key);
        }
        return;
    }
    match schema::kind(root, schema) {
        schema::SchemaKind::Object => {
            for (name, field) in schema::properties(schema) {
                if let Some(inner) = value.get_mut(name) {
                    fill_references(root, field, inner, files);
                }
            }
        }
        schema::SchemaKind::Choice(alternatives) => {
            if let Some(alternative) = alternatives
                .iter()
                .find(|alternative| schema::fits(root, alternative, value))
            {
                fill_references(root, alternative, value, files);
            }
        }
        schema::SchemaKind::Union(variants) => {
            if let Some(variant) = schema::variant_of(&variants, value) {
                fill_references(root, variant.schema, value, files);
            }
        }
        _ => {}
    }
}

pub fn template_event(root: &Value, event: &str) -> Option<Value> {
    let variant = event_variants(root)
        .into_iter()
        .find(|variant| variant.tag == event)?;
    let mut node = schema::variant_template(root, &variant);
    node["type"] = Value::from(NodeKind::On.name());
    match event.parse() {
        Ok(EventKind::Interacted) => {
            node["verb"] = Value::from("talk");
            node["reach"] = Value::from(1.5);
        }
        Ok(EventKind::CameNear | EventKind::Heard) => node["within"] = Value::from(4.0),
        _ => {}
    }
    Some(node)
}

pub fn event_of(node: &Value) -> Option<&str> {
    node["event"].as_str()
}

pub fn node_schema(root: &Value) -> Option<&Value> {
    root.get("properties")?
        .get("nodes")?
        .get("additionalProperties")
}

pub fn variants(root: &Value) -> Vec<SchemaVariant<'_>> {
    let Some(schema) = node_schema(root) else {
        return Vec::new();
    };
    match schema::kind(root, schema) {
        schema::SchemaKind::Union(variants) => variants,
        _ => Vec::new(),
    }
}

pub fn variant_schema<'a>(root: &'a Value, kind: &str) -> Option<&'a Value> {
    variants(root)
        .into_iter()
        .find(|variant| variant.tag == kind)
        .map(|variant| variant.schema)
}

pub fn event_variants(root: &Value) -> Vec<SchemaVariant<'_>> {
    let Some(on) = variant_schema(root, NodeKind::On.name()) else {
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
            found.push(SchemaVariant {
                field,
                tag,
                schema: alternative,
            });
        }
    }
    found
}

pub fn event_variant<'a>(root: &'a Value, event: &str) -> Option<&'a Value> {
    event_variants(root)
        .into_iter()
        .find(|variant| variant.tag == event)
        .map(|variant| variant.schema)
}

pub fn form_fields<'a>(root: &'a Value, node: &Value) -> Option<(&'a Value, Vec<String>)> {
    let schema = variant_schema(root, node.kind())?;
    let hidden = schema::properties(schema)
        .into_iter()
        .filter(|(name, field)| *name == "type" || leads_out(field))
        .map(|(name, _)| name.clone())
        .collect();
    Some((schema, hidden))
}

fn leads_out(field: &Value) -> bool {
    let is_arrow = |schema: &Value| schema::marker(schema) == Some("x-arrow");
    is_arrow(field) || field.get("items").is_some_and(is_arrow)
}

pub fn summary(node: &Value, catalogue: &NodeCatalogue) -> String {
    pieces(node, catalogue)
        .into_iter()
        .map(|line| line.into_iter().map(|piece| piece.text).collect::<String>())
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

pub fn place_text(value: &Value) -> Option<String> {
    let map = value.as_object()?;
    if !map.contains_key("area") || !map.contains_key("x") {
        return None;
    }
    Some(format!(
        "{} {}, {}",
        map.text_or("area", "?"),
        map["x"].as_f64().unwrap_or(0.0),
        map["y"].as_f64().unwrap_or(0.0)
    ))
}

fn value_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Object(_) if hole_name(value).is_some() => {
            format!("◇{}", hole_name(value).unwrap_or(""))
        }
        Value::Array(items) => items.iter().map(value_text).collect::<Vec<_>>().join(", "),
        other => place_text(other).unwrap_or_else(|| condition::summary(other)),
    }
}

pub struct OutlineRow {
    pub name: String,
    pub depth: usize,
    pub via: Option<String>,
    pub reachable: bool,
    pub link: bool,
    pub choice: Option<usize>,
}

pub fn outline(nodes: &Map<String, Value>, catalogue: &NodeCatalogue) -> Vec<OutlineRow> {
    let mut walker = Walker {
        nodes,
        catalogue,
        seen: HashSet::new(),
        rows: Vec::new(),
        reachable: true,
    };
    for (name, node) in nodes {
        if is_event(node) {
            walker.walk(name, 0, None);
        }
    }
    walker.reachable = false;
    for name in nodes.keys() {
        if !walker.seen.contains(name) {
            walker.walk(name, 0, None);
        }
    }
    walker.rows
}

struct Walker<'a> {
    nodes: &'a Map<String, Value>,
    catalogue: &'a NodeCatalogue,
    seen: HashSet<String>,
    rows: Vec<OutlineRow>,
    reachable: bool,
}

impl Walker<'_> {
    fn walk(&mut self, name: &str, depth: usize, via: Option<String>) {
        if depth > 64 {
            return;
        }
        let link = !self.seen.insert(name.to_owned());
        self.rows.push(OutlineRow {
            name: name.to_owned(),
            depth,
            via,
            reachable: self.reachable,
            link,
            choice: None,
        });
        if link {
            return;
        }
        let Some(node) = self.nodes.get(name) else {
            return;
        };
        let choices = if is_dialogue(node) {
            node["choices"].as_array().map_or(0, Vec::len)
        } else {
            0
        };
        for (index, choice) in node["choices"]
            .as_array()
            .into_iter()
            .flatten()
            .take(choices)
            .enumerate()
        {
            self.rows.push(OutlineRow {
                name: name.to_owned(),
                depth: depth + 1,
                via: None,
                reachable: self.reachable,
                link: false,
                choice: Some(index),
            });
            if let Some(target) = choice["to"].as_str() {
                self.walk(target, depth + 2, None);
            }
        }
        for port in ports(node, self.catalogue) {
            if port.field.starts_with("/choices/") {
                continue;
            }
            if let Some(target) = port.target {
                self.walk(&target, depth + 1, Some(port.label));
            }
        }
    }
}

#[derive(Default)]
pub struct NodeReads {
    pub memories: Vec<String>,
    pub items: Vec<String>,
    pub places: Vec<String>,
    pub other: Vec<String>,
}

impl NodeReads {
    /// What the nodes' tests and choice requirements ask of the world.
    pub fn of(content: &Content, nodes: &Map<String, Value>) -> NodeReads {
        let mut asked = Vec::new();
        for node in nodes.values() {
            let requires = node["choices"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|choice| choice.get("requires"));
            for test in node.get("test").into_iter().chain(requires) {
                queries_in(test, &mut asked);
            }
        }
        let (queries, _) = with_content(ContentScope::of(content), || {
            asked
                .into_iter()
                .filter_map(|query| serde_json::from_value::<RiftQuery>(query.clone()).ok())
                .collect::<Vec<_>>()
        });
        let mut reads = NodeReads::default();
        for query in &queries {
            reads.note(content, query);
        }
        for list in [
            &mut reads.memories,
            &mut reads.items,
            &mut reads.places,
            &mut reads.other,
        ] {
            list.sort();
            list.dedup();
        }
        reads
    }

    pub fn text(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if !self.memories.is_empty() {
            parts.push(format!("the subject's memory {}", self.memories.join(", ")));
        }
        parts.extend(self.items.iter().cloned());
        parts.extend(self.places.iter().cloned());
        parts.extend(self.other.iter().cloned());
        parts.join(" · ")
    }

    fn note(&mut self, content: &Content, query: &RiftQuery) {
        match query {
            RiftQuery::Memory { memory, .. } | RiftQuery::SetWithin { memory, .. } => {
                self.memories.push(memory.path(content).to_owned());
            }
            RiftQuery::Holding { item, .. } => {
                self.items.push(format!("holding {}", item.path(content)));
            }
            RiftQuery::Wearing { item, .. } => {
                self.items.push(format!("wearing {}", item.path(content)));
            }
            RiftQuery::Inside { object, .. } => self.places.push(format!("inside {object}")),
            RiftQuery::InArea { area, .. } => {
                self.places.push(format!("in area/{}", area.path(content)));
            }
            RiftQuery::KnowsArea { area, .. } => {
                self.places
                    .push(format!("knows area/{}", area.path(content)));
            }
            RiftQuery::OnQuest { quest, .. }
            | RiftQuery::QuestDone { quest, .. }
            | RiftQuery::QuestCooling { quest, .. }
            | RiftQuery::TaskDone { quest, .. }
            | RiftQuery::QuestResetsIn { quest, .. } => {
                self.other.push(format!("quest/{}", quest.path(content)));
            }
            RiftQuery::Level { .. } => self.other.push("the level".to_owned()),
            _ => {}
        }
    }
}

fn queries_in<'a>(value: &'a Value, found: &mut Vec<&'a Value>) {
    match value {
        Value::Object(map) => {
            if map.kind().parse::<RiftQueryKind>().is_ok() {
                found.push(value);
            }
            map.values().for_each(|child| queries_in(child, found));
        }
        Value::Array(list) => list.iter().for_each(|child| queries_in(child, found)),
        _ => {}
    }
}

/// A description's opening sentence, without its full stop: what a palette row says.
fn first_sentence(text: &str) -> String {
    let first = text.split_once(". ").map_or(text, |(first, _)| first);
    first.trim_end_matches('.').to_owned()
}

#[derive(Clone, Debug, PartialEq)]
pub struct SummaryPiece {
    pub text: String,
    pub tone: SummaryTone,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SummaryTone {
    Muted,
    Strong,
    Var,
}

fn muted(text: impl Into<String>) -> SummaryPiece {
    SummaryPiece {
        text: text.into(),
        tone: SummaryTone::Muted,
    }
}

fn strong(text: impl Into<String>) -> SummaryPiece {
    SummaryPiece {
        text: text.into(),
        tone: SummaryTone::Strong,
    }
}

fn var(text: impl Into<String>) -> SummaryPiece {
    SummaryPiece {
        text: text.into(),
        tone: SummaryTone::Var,
    }
}

pub fn pieces(node: &Value, catalogue: &NodeCatalogue) -> Vec<Vec<SummaryPiece>> {
    match kind_of(node) {
        NodeKind::On => vec![event_pieces(node)],
        NodeKind::If => vec![expression_pieces(&node["test"])],
        NodeKind::Random => {
            let weights: Vec<String> = node["weights"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|w| w.to_string())
                .collect();
            vec![vec![muted("weights "), strong(weights.join(" : "))]]
        }
        NodeKind::Repeat => {
            let mut line = expression_pieces(&node["times"]);
            line.push(muted(" times"));
            if let Some(at_most) = node["at_most"].as_f64() {
                line.push(muted(" · at most "));
                line.push(strong(at_most.to_string()));
            }
            vec![line]
        }
        NodeKind::Wait => {
            let mut line = expression_pieces(&node["seconds"]);
            line.push(muted(" s"));
            if node["seconds"].as_f64() == Some(0.0) {
                line.push(muted(" · the next tick"));
            } else if let Some(at_most) = node["at_most"].as_f64() {
                line.push(muted(" · at most "));
                line.push(strong(at_most.to_string()));
            }
            vec![line]
        }
        NodeKind::Set => node["values"]
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
        NodeKind::Run => {
            let mut lines = vec![vec![muted("script/"), strong(node.text_or("script", "?"))]];
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
        NodeKind::Return => match node.get("value") {
            Some(value) if !value.is_null() => vec![expression_pieces(value)],
            _ => vec![vec![muted("back to the caller")]],
        },
        NodeKind::Dialogue => vec![dialogue_pieces(node)],
        NodeKind::Effect => match node.kind().parse() {
            Ok(RiftEffectKind::Remember) => {
                let mut line = vec![strong(node.text_or("memory", "?")), muted(" = ")];
                match node.get("to") {
                    Some(to) if !to.is_null() => line.extend(expression_pieces(to)),
                    _ => line.push(strong("true")),
                }
                vec![line]
            }
            Ok(RiftEffectKind::Forget) => vec![vec![
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
            Ok(RiftEffectKind::Items) => {
                let mut lines = Vec::new();
                for (field, word) in [("take", "take "), ("give", "give ")] {
                    if let Some(list) = node[field].as_array().filter(|l| !l.is_empty()) {
                        let mut line = vec![muted(word)];
                        line.extend(stack_pieces(list));
                        lines.push(line);
                    }
                }
                if lines.is_empty() {
                    lines.push(vec![muted("nothing changes hands")]);
                }
                lines
            }
            Ok(RiftEffectKind::Warp) => {
                let who = node["who"]
                    .as_str()
                    .map(actor_word)
                    .unwrap_or_else(|| "the subject".to_owned());
                let mut line = vec![strong(who), muted(" to ")];
                match (hole_name(&node["to"]), place_text(&node["to"])) {
                    (Some(name), _) => line.push(var(format!("◇ {name}"))),
                    (None, Some(place)) => line.push(strong(place)),
                    (None, None) => line.extend(expression_pieces(&node["to"])),
                }
                vec![line, vec![muted("sets its spawn point")]]
            }
            _ => effect_pieces(node, catalogue),
        },
    }
}

fn dialogue_pieces(node: &Value) -> Vec<SummaryPiece> {
    let lines = node["lines"].as_array().cloned().unwrap_or_default();
    let Some(first) = lines.first() else {
        return vec![muted("no lines")];
    };
    let mut line = vec![
        strong(speaker_name(&first["by"])),
        muted(": "),
        strong(widgets::clip(&spans::plain(&first["text"]), 48)),
    ];
    if lines.len() > 1 {
        line.push(muted(format!(" (+{} lines)", lines.len() - 1)));
    }
    let choices = node["choices"].as_array().map_or(0, Vec::len);
    if choices > 0 {
        line.push(muted(format!(" · {choices} choices")));
    }
    line
}

fn stack_pieces(list: &[Value]) -> Vec<SummaryPiece> {
    let mut line = Vec::new();
    for (index, stack) in list.iter().enumerate() {
        if index > 0 {
            line.push(muted(", "));
        }
        let count = stack["count"].as_u64().unwrap_or(1);
        line.push(strong(format!("{count} {}", stack.text_or("item", "?"))));
    }
    line
}

fn event_pieces(node: &Value) -> Vec<SummaryPiece> {
    let mut line = Vec::new();
    match event_of(node).and_then(|event| event.parse().ok()) {
        Some(EventKind::Interacted) => {
            line.push(muted("verb "));
            line.push(strong(node.text_or("verb", "use")));
            if let Some(reach) = node["reach"].as_f64() {
                line.push(muted(" · reach "));
                line.push(strong(reach.to_string()));
                line.push(muted(" tiles"));
            }
        }
        Some(EventKind::CameNear | EventKind::Entered | EventKind::Left) => {
            line.push(strong(node.text_or("by", "characters")));
            if let Some(within) = node["within"].as_f64() {
                line.push(muted(" within "));
                line.push(strong(within.to_string()));
            }
        }
        Some(EventKind::StoodOn) => {
            line.push(strong(node.text_or("by", "characters")));
            line.push(muted(" on "));
            line.push(strong(node.text_or("object", "?")));
        }
        Some(EventKind::Started) => line.push(muted("the owner spawned")),
        Some(EventKind::Run) => line.push(muted("started by a run node")),
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

fn effect_pieces(node: &Value, catalogue: &NodeCatalogue) -> Vec<Vec<SummaryPiece>> {
    let fields: Vec<(String, Option<String>)> = catalogue
        .entry(node.kind())
        .map(|entry| entry.fields.clone())
        .unwrap_or_else(|| {
            node.as_object()
                .into_iter()
                .flatten()
                .map(|(name, _)| (name.clone(), None))
                .filter(|(name, _)| name != "type")
                .collect()
        });
    let mut named: Vec<SummaryPiece> = Vec::new();
    let mut rest: Vec<SummaryPiece> = Vec::new();
    for (field, table) in &fields {
        let Some(value) = node.get(field).filter(|v| !v.is_null()) else {
            continue;
        };
        let piece = field_pieces(field, table.as_deref(), value);
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

fn field_pieces(field: &str, table: Option<&str>, value: &Value) -> Vec<SummaryPiece> {
    let is_actor_field = matches!(
        field,
        "who" | "at" | "for" | "toward" | "target" | "from" | "to"
    );
    let labelled = |pieces: Vec<SummaryPiece>| -> Vec<SummaryPiece> {
        let mut out = vec![muted(format!("{field} "))];
        out.extend(pieces);
        out
    };
    match (table, value) {
        (Some(table), Value::String(key)) => vec![muted(format!("{table}/")), strong(key)],
        _ if hole_name(value).is_some() => {
            let hole = var(format!("◇ {}", hole_name(value).unwrap_or("")));
            if field == "who" {
                vec![hole]
            } else {
                labelled(vec![hole])
            }
        }
        (_, Value::String(text)) if is_actor_field => {
            let actor = strong(actor_word(text));
            if field == "who" {
                vec![actor]
            } else {
                labelled(vec![actor])
            }
        }
        (_, Value::Array(list)) if list.iter().all(|item| item.get("item").is_some()) => {
            labelled(stack_pieces(list))
        }
        _ if place_text(value).is_some() => {
            let place = strong(place_text(value).unwrap_or_default());
            if field == "to" {
                vec![place]
            } else {
                labelled(vec![place])
            }
        }
        (_, Value::Object(map))
            if map.get("type").is_some() && matches!(map.kind(), "object" | "actor" | "place") =>
        {
            let inner = map
                .iter()
                .find(|(k, _)| *k != "type")
                .map(|(_, v)| value_text(v))
                .unwrap_or_default();
            vec![muted(format!("{} ", map.kind())), strong(inner)]
        }
        (_, Value::Number(_)) | (_, Value::Bool(_)) => labelled(vec![strong(value_text(value))]),
        (_, Value::String(text)) => vec![strong(text)],
        (_, Value::Array(list)) => labelled(vec![strong(
            list.iter().map(value_text).collect::<Vec<_>>().join(", "),
        )]),
        (_, other) => labelled(expression_pieces(other)),
    }
}

fn actor_word(text: &str) -> String {
    match text {
        "subject" => "the subject".to_owned(),
        "owner" => "the owner".to_owned(),
        other => other.replace('_', " "),
    }
}

pub fn expression_pieces(value: &Value) -> Vec<SummaryPiece> {
    if let Some(name) = hole_name(value) {
        return vec![var(format!("◇ {name}"))];
    }
    let summary = condition::summary(value);
    let mut out: Vec<SummaryPiece> = Vec::new();
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
