use editor::app::BottomTab;
use editor::scenes::{ModelStep, Step};

#[test]
fn a_scene_is_a_json_array_of_named_steps() {
    let steps: Vec<Step> = serde_json::from_str(
        r#"[{"area":"island"},{"bottom":"output"},{"model":{"open":"walk"}}]"#,
    )
    .expect("a scene of named steps");
    assert_eq!(steps.len(), 3);
    assert!(matches!(&steps[0], Step::Area(key) if key == "island"));
    assert!(matches!(steps[1], Step::Bottom(BottomTab::Output)));
    assert!(matches!(&steps[2], Step::Model(ModelStep::Open(key)) if key == "walk"));
}

#[test]
fn the_string_language_is_not_a_scene() {
    assert!(serde_json::from_str::<Vec<Step>>("area:island;bottom:output").is_err());
}
