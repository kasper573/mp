use engine::core::content::{ContentFile, ContentRegistry, Nearby};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::support::game;

#[test]
fn another_version_is_refused_last() {
    let report = game()
        .edit_settings(|settings| {
            settings["content_version"] = json!("deadbeef");
            settings["initial_spawn"]["area"] = json!("strat.area");
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
    assert!(rules.contains(&"missing file"), "{rules:?}");
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

impl ContentFile for Narrow {
    const TABLE: &'static str = "thing";

    fn fresh(near: &Nearby) -> Result<Narrow, String> {
        Ok(Narrow { name: near.name() })
    }
}
impl ContentFile for Wide {
    const TABLE: &'static str = "thing";

    fn fresh(near: &Nearby) -> Result<Wide, String> {
        Ok(Wide {
            name: near.name(),
            weight: 0,
        })
    }
}
impl ContentFile for Retyped {
    const TABLE: &'static str = "thing";

    fn fresh(_: &Nearby) -> Result<Retyped, String> {
        Ok(Retyped { name: Vec::new() })
    }
}
impl ContentFile for SameShape {
    const TABLE: &'static str = "thing";

    fn fresh(near: &Nearby) -> Result<SameShape, String> {
        Ok(SameShape { name: near.name() })
    }
}

fn version_of<Row: ContentFile>() -> String {
    let mut registry = ContentRegistry::default();
    registry.file::<Row>();
    registry.version().0
}
