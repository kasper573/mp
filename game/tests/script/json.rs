use game::core::content::{ContentScope, with_content};
use game::systems::script::{RiftEffect, ScriptModule};
use serde::de::DeserializeOwned;
use serde_json::Value;

use testkit::content;

/// Reads a value as the loader would, with every row key resolved against the shipped content.
pub fn parse<T: DeserializeOwned>(value: Value) -> T {
    let (result, scope) = with_content(ContentScope::of(content()), || {
        serde_json::from_value::<T>(value.clone())
    });
    assert!(!scope.has_problems(), "unknown rows in {value}");
    result.unwrap_or_else(|error| panic!("{error} in {value}"))
}

pub fn inline(nodes: Value) -> ScriptModule {
    parse(serde_json::json!({
        "type": "inline_script",
        "nodes": nodes,
    }))
}

pub fn inline_with(locals: Value, nodes: Value) -> ScriptModule {
    parse(serde_json::json!({
        "type": "inline_script",
        "locals": locals,
        "nodes": nodes,
    }))
}

pub fn effect(value: Value) -> RiftEffect {
    parse(value)
}
