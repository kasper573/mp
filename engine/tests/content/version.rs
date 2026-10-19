use engine::core::content::{ContentRegistry, ContentRow};
use engine::systems::registry;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::support::game;

#[test]
fn the_version_is_pinned() {
    assert_eq!(registry().version().0, "e8c06ff9");
}

#[test]
fn another_version_is_refused_last() {
    let report = game()
        .edit_settings(|settings| {
            settings["content_version"] = json!("deadbeef");
            settings["initial_spawn"]["area"] = json!("strat");
        })
        .try_load()
        .err()
        .expect("refused");

    let rules: Vec<&str> = report
        .errors
        .iter()
        .map(|error| error.problem.rule)
        .collect();
    assert_eq!(rules.last(), Some(&"content version"));
    assert!(rules.contains(&"unknown row"), "{rules:?}");
    let version = report.errors.last().expect("an error");
    assert_eq!(version.problem.found, "\"deadbeef\"");
}

#[test]
fn only_a_changed_shape_moves_the_version() {
    assert_eq!(version_of::<Narrow>(), version_of::<SameShape>());
    assert_ne!(version_of::<Narrow>(), version_of::<Wide>());
    assert_ne!(version_of::<Narrow>(), version_of::<Retyped>());
    assert_eq!(version_of::<Narrow>().len(), 8);
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Narrow {
    name: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Wide {
    name: String,
    #[serde(default)]
    weight: u32,
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Retyped {
    name: Vec<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct SameShape {
    name: String,
}

impl ContentRow for Narrow {
    const TABLE: &'static str = "thing";
}
impl ContentRow for Wide {
    const TABLE: &'static str = "thing";
}
impl ContentRow for Retyped {
    const TABLE: &'static str = "thing";
}
impl ContentRow for SameShape {
    const TABLE: &'static str = "thing";
}

fn version_of<Row: ContentRow>() -> String {
    let mut registry = ContentRegistry::default();
    registry.row::<Row>();
    registry.version().0
}
