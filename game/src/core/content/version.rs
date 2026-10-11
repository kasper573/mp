use std::collections::BTreeMap;
use std::fmt;

use schemars::JsonSchema;
use schemars::generate::SchemaSettings;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::load::ContentRegistry;

/// Eight hex digits of the hash over every row shape, so a folder states which engine shapes it
/// was written for.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct ContentVersion(pub String);

impl fmt::Display for ContentVersion {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// The engine build: eight hex digits of the commit, `-dirty` with uncommitted changes, or
/// `RIFT_BUILD` when built outside git.
pub fn build() -> &'static str {
    env!("RIFT_BUILD")
}

pub fn compute(registry: &ContentRegistry) -> ContentVersion {
    let settings =
        SchemaSettings::draft2020_12().with(|settings| settings.inline_subschemas = true);
    let shapes = canonical(registry.shapes(&settings));
    let text = serde_json::to_string(&shapes).expect("shapes are json");
    ContentVersion(blake3::hash(text.as_bytes()).to_hex()[..8].to_owned())
}

/// Keys sorted and prose dropped, so neither field order in Rust nor a doc comment moves the hash.
fn canonical(value: Value) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .filter(|(key, _)| !matches!(key.as_str(), "title" | "description" | "$schema"))
                .map(|(key, value)| (key, canonical(value)))
                .collect::<BTreeMap<String, Value>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(canonical).collect()),
        other => other,
    }
}
