use editor::app::Editor;
use editor::views::model::{FrameCueKind, ModelStrip, strip, strip_of};
use engine::systems::actor::ModelDef;
use serde_json::json;
use testkit::path;

use crate::support;

#[test]
fn only_a_strip_that_lands_a_hit_takes_an_apex() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(support::game().model("wolf", 1.5, json!([])), &scratch);
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

    let attack = ModelStrip::parse("attack", "s").expect("a strip");
    let before = apexes(&editor, attack);

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
    editor.undo();
    assert_eq!(
        apexes(&editor, attack),
        before,
        "one undo takes the apex back"
    );
}
