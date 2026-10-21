use std::sync::Arc;

use editor::app::Editor;
use editor::project::Project;
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use editor::views::model::{FrameCueKind, ModelStrip, strip, strip_of};
use engine::systems::actor::ModelDef;
use serde_json::json;
use testkit::path;

use crate::support;

#[test]
fn only_a_strip_that_lands_a_hit_takes_an_apex() {
    let scratch = tempfile::tempdir().expect("scratch");
    let folder = scratch.path().join("game");
    support::game()
        .model("wolf", 1.5, json!([]))
        .write_to(&folder);
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    project.settle();
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    let key = path("model", "wolf");
    let apexes = |editor: &Editor, strip: ModelStrip| -> Vec<bool> {
        let model = editor
            .read::<ModelDef>(&key)
            .expect("a project")
            .expect("the wolf reads");
        strip_of(&model, strip)
            .iter()
            .map(|frame| frame.apex)
            .collect()
    };

    for (action, expected) in [("idle", vec![false]), ("attack", vec![true, false, false])] {
        let at = ModelStrip::parse(action, "s").expect("a strip");
        let model = editor
            .read::<ModelDef>(&key)
            .expect("a project")
            .expect("the wolf reads");
        strip::set_cue(
            &mut editor,
            &key,
            &strip_of(&model, at),
            at,
            0,
            FrameCueKind::Apex,
        );
        assert_eq!(apexes(&editor, at), expected, "{action}");
        assert!(
            editor.last_refusal.is_none(),
            "{action}: the editor never tries an apex the game refuses"
        );
    }
    assert_eq!(
        editor
            .project
            .as_ref()
            .expect("a project")
            .history
            .steps()
            .len(),
        1
    );
}
