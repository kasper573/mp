use editor::app::Editor;
use editor::views::model::busts::{self, BustFace};
use engine::systems::actor::ModelDef;
use engine::systems::actor::model::GenericExpression;
use serde_json::json;
use strum::VariantArray;
use testkit::{Game, path, png};

use crate::support;

fn open(scratch: &tempfile::TempDir) -> Editor {
    let game: Game = support::game()
        .model("orc", 1.0, json!([]))
        .busts("orc")
        .part("model", "orc", "busts/smug.png", png(4, 4));
    support::open(game, scratch)
}

fn faces(editor: &Editor) -> Vec<BustFace> {
    faces_of(editor, &path("model", "orc"))
}

#[test]
fn a_bust_has_a_face_for_every_picture_its_bundle_keeps() {
    let scratch = tempfile::tempdir().expect("scratch");
    let editor = open(&scratch);
    let faces = faces(&editor);

    assert_eq!(faces.len(), GenericExpression::VARIANTS.len() + 1);
    let smug = faces.iter().find(|face| face.name == "smug").expect("smug");
    assert!(smug.own);
    assert_eq!(
        smug.file,
        format!("{}/busts/smug.png", path("model", "orc"))
    );
    assert!(
        faces
            .iter()
            .filter(|face| face.name != "smug")
            .all(|face| !face.own)
    );
}

#[test]
fn renaming_an_own_face_moves_its_picture_and_the_game_still_loads() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let smug = faces(&editor)
        .into_iter()
        .find(|face| face.name == "smug")
        .expect("smug");

    assert!(busts::rename(
        &mut editor,
        &path("model", "orc"),
        &smug,
        "sly"
    ));

    support::settled(&mut editor);
    let names: Vec<String> = faces(&editor).into_iter().map(|face| face.name).collect();
    assert!(names.contains(&"sly".to_owned()), "{names:?}");
    assert!(!names.contains(&"smug".to_owned()), "{names:?}");
}

#[test]
fn a_face_keeps_its_name_when_asked_for_one_no_file_can_hold() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let smug = faces(&editor)
        .into_iter()
        .find(|face| face.name == "smug")
        .expect("smug");

    for wanted in ["grin!", "a/b", "happy (2) x"] {
        assert!(
            !busts::rename(&mut editor, &path("model", "orc"), &smug, wanted),
            "{wanted}"
        );
    }
    let names: Vec<String> = faces(&editor).into_iter().map(|face| face.name).collect();
    assert!(names.contains(&"smug".to_owned()), "{names:?}");
}

#[test]
fn removing_an_own_face_removes_its_picture_and_a_generic_face_stays() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let faces_before = faces(&editor);
    let model = path("model", "orc");
    let smug = faces_before
        .iter()
        .find(|face| face.own)
        .expect("an own face");
    let happy = faces_before
        .iter()
        .find(|face| face.name == "happy")
        .expect("a generic face");

    assert!(busts::remove(&mut editor, &model, smug, "happy"));
    assert!(!busts::remove(&mut editor, &model, happy, "sad"));

    support::settled(&mut editor);
    assert_eq!(faces(&editor).len(), GenericExpression::VARIANTS.len());
}

#[test]
fn renaming_a_face_leaves_the_lines_of_speakers_wearing_another_model_alone() {
    let scratch = tempfile::tempdir().expect("scratch");
    let line = |npc: &str| json!({ "by": { "type": "npc", "npc": path("npc", npc), "face": "smug" }, "text": ["Hm."] });
    let game = ["grunt", "lady"].iter().fold(support::game(), |game, npc| {
        game.npc(npc, 10.0, json!([]))
            .busts(npc)
            .part("model", npc, "busts/smug.png", png(4, 4))
    });
    let game = game.script(
        "talk",
        "npc",
        json!({
            "start": { "type": "on", "event": "interacted", "verb": "talk", "reach": 2.0, "next": "said" },
            "said": { "type": "dialogue", "lines": [line("grunt"), line("lady")], "choices": [{ "label": ["Bye."] }] },
        }),
    );
    let mut editor = support::open(game, &scratch);
    let grunt = path("model", "grunt");
    let model = editor
        .read::<ModelDef>(&grunt)
        .expect("a project")
        .expect("the model reads");
    let smug = busts::faces(&model)
        .into_iter()
        .find(|face| face.name == "smug")
        .expect("smug");

    assert!(busts::rename(&mut editor, &grunt, &smug, "sly"));

    support::settled(&mut editor);
    let faces_of = |model: &str| -> Vec<String> {
        busts::lines(&editor, &path("model", model))
            .into_iter()
            .map(|line| line.face)
            .collect()
    };
    assert_eq!(faces_of("grunt"), ["sly"]);
    assert_eq!(faces_of("lady"), ["smug"]);
}

#[test]
fn a_model_takes_a_bust_with_all_its_faces_in_one_step_and_only_with_every_generic_one() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(support::game().model("elder", 1.0, json!([])), &scratch);
    let model = path("model", "elder");
    let art = tempfile::tempdir().expect("art");
    let face = |name: &str| {
        let file = art.path().join(format!("{name}.png"));
        std::fs::write(&file, png(4, 4)).expect("a face");
        file
    };
    let generic: Vec<_> = GenericExpression::VARIANTS
        .iter()
        .map(|expression| face(expression.as_ref()))
        .collect();
    let has_bust = |editor: &mut Editor| {
        support::settled(editor);
        editor
            .read::<ModelDef>(&model)
            .expect("a project")
            .expect("the model reads")
            .busts()
            .is_some()
    };

    busts::give(&mut editor, &model, &generic[1..]);
    assert!(!has_bust(&mut editor));

    let mut all = generic.clone();
    all.push(face("wistful"));
    busts::give(&mut editor, &model, &all);
    assert!(has_bust(&mut editor));
    let names: Vec<String> = faces_of(&editor, &model)
        .into_iter()
        .map(|face| face.name)
        .collect();
    assert_eq!(names.len(), GenericExpression::VARIANTS.len() + 1);
    assert!(names.contains(&"wistful".to_owned()), "{names:?}");

    editor.undo();
    assert!(!has_bust(&mut editor));
    assert!(
        !support::files(&mut editor)
            .paths()
            .any(|file| file.starts_with(&format!("{model}/busts/")))
    );
}

fn faces_of(editor: &Editor, model: &str) -> Vec<BustFace> {
    let model = editor
        .read::<ModelDef>(model)
        .expect("a project")
        .expect("the model reads");
    busts::faces(&model)
}
