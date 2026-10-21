use std::sync::Arc;

use editor::app::Editor;
use editor::project::Project;
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
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
    let folder = scratch.path().join("game");
    game.write_to(&folder);
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    project.settle();
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    editor
}

fn faces(editor: &Editor) -> Vec<BustFace> {
    let model = editor
        .read::<ModelDef>(&path("model", "orc"))
        .expect("a project")
        .expect("the model reads");
    busts::faces(&model)
}

fn settled_loads(editor: &mut Editor) {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
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

    settled_loads(&mut editor);
    let names: Vec<String> = faces(&editor).into_iter().map(|face| face.name).collect();
    assert!(names.contains(&"sly".to_owned()), "{names:?}");
    assert!(!names.contains(&"smug".to_owned()), "{names:?}");
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

    settled_loads(&mut editor);
    assert_eq!(faces(&editor).len(), GenericExpression::VARIANTS.len());
}
