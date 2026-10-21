use editor::app::BottomTab;
use editor::scenes::{ModelStep, SceneStep};

#[test]
fn a_scene_is_a_json_array_of_named_steps() {
    let steps: Vec<SceneStep> = serde_json::from_str(
        r#"[{"area":"island"},{"bottom":"output"},{"model":{"open":"walk"}}]"#,
    )
    .expect("a scene of named steps");
    assert_eq!(steps.len(), 3);
    assert!(matches!(&steps[0], SceneStep::Area(key) if key == "island"));
    assert!(matches!(steps[1], SceneStep::Bottom(BottomTab::Output)));
    assert!(matches!(&steps[2], SceneStep::Model(ModelStep::Open(key)) if key == "walk"));
}
