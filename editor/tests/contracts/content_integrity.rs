use std::sync::Arc;

use editor::app::Editor;
use editor::project::{ContentEdit, FileBytes, Project, ProjectFiles};
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use editor::{rows, ui::content_tree};
use engine::core::content::fields_file;
use serde_json::json;
use testkit::{Game, path, png};

use crate::support;

fn open(game: Game, scratch: &tempfile::TempDir) -> Editor {
    let editor = open_as_is(game, scratch);
    let project = editor.project.as_ref().expect("a project");
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
    editor
}

/// The game opened however it loads.
fn open_as_is(game: Game, scratch: &tempfile::TempDir) -> Editor {
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

fn files(editor: &mut Editor) -> ProjectFiles {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    project.files.clone()
}

fn camp() -> Game {
    support::game()
        .npc("orc", 10.0, json!([]))
        .asset("icons/cap.png", png(16, 16))
}

#[test]
fn an_edit_writing_a_field_its_type_does_not_have_is_refused_and_changes_nothing() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let before = files(&mut editor);
    let config = fields_file(&path("model", "orc"));
    let mut edit = ContentEdit::new("give the sheet an image field");
    edit.update_json(&before, &config, |model| {
        model["sprites"]["image"] = json!("icons/cap.png");
        Some(())
    })
    .expect("the model is there");

    let refused = editor.try_apply(edit).expect_err("refused");
    assert!(refused.contains("unknown field"), "{refused}");
    assert_eq!(files(&mut editor).get(&config), before.get(&config));
}

#[test]
fn an_edit_writing_an_image_that_does_not_decode_is_refused() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let mut cut = png(16, 16);
    cut.truncate(cut.len() - 20);
    let mut edit = ContentEdit::new("cut the cap short");
    edit.write("icons/cap.png", FileBytes::from(cut));

    let refused = editor.try_apply(edit).expect_err("refused");
    assert!(refused.contains("unreadable image"), "{refused}");
}

#[test]
fn removing_what_another_file_names_is_refused() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let model = path("model", "orc");
    let mut edit = ContentEdit::new("remove the orc's model");
    for file in files(&mut editor).files_of(&model) {
        edit.remove(file);
    }

    let refused = editor.try_apply(edit).expect_err("refused");
    assert!(refused.contains("missing file"), "{refused}");
    assert!(files(&mut editor).contains(&fields_file(&model)));
}

#[test]
fn a_new_file_names_the_content_nearest_it_and_loads() {
    let scratch = tempfile::tempdir().expect("scratch");
    let orc = camp().folder();
    let game = orc
        .files
        .iter()
        .filter(|(file, _)| file.starts_with(&format!("{}/", path("model", "orc"))))
        .fold(camp(), |game, (file, bytes)| {
            game.file(
                &format!("wilds/{}", file.replace("orc", "wolf")),
                bytes.to_vec(),
            )
        });
    let mut editor = open(game, &scratch);

    content_tree::new_file(&mut editor, "wilds", "npc");

    let made = files(&mut editor)
        .json("wilds/npc.npc.json")
        .expect("a new npc");
    assert_eq!(
        made["model"],
        json!(format!("wilds/{}", path("model", "wolf")))
    );
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
}

#[test]
fn making_a_missing_fixture_writes_one_that_loads() {
    let scratch = tempfile::tempdir().expect("scratch");
    let fixture = registry_fixture();
    let held: Vec<String> = camp()
        .folder()
        .files
        .keys()
        .filter(|file| file.starts_with(&format!("{fixture}/")))
        .cloned()
        .collect();
    let game = held.iter().fold(camp(), |game, file| game.remove(file));
    let mut editor = open_as_is(game, &scratch);

    rows::make_fixture(&mut editor, &fixture).expect("made");

    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(project.files.index().is_content(&fixture));
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
}

fn registry_fixture() -> String {
    engine::systems::registry()
        .fixture_paths()
        .find(|path| path.contains("ui_open"))
        .expect("a ui sound fixture")
        .to_owned()
}

#[test]
fn replacing_a_sheet_with_one_too_small_for_its_frames_is_refused() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let config = fields_file(&path("model", "orc"));
    let mut edit = ContentEdit::new("show a frame the sheet lacks");
    edit.update_json(&files(&mut editor), &config, |model| {
        model["sprites"]["actions"]["idle"]["s"][0]["frame"] = json!(3);
        Some(())
    })
    .expect("the model is there");

    let refused = editor.try_apply(edit).expect_err("refused");
    assert!(refused.contains("tile out of range"), "{refused}");
}

/// The orc's npc made to wear the elf's model, applied but not yet loaded.
fn orc_wearing_elf(editor: &mut Editor) {
    let before = editor.project.as_ref().expect("a project").files.clone();
    let mut edit = ContentEdit::new("dress the orc as an elf");
    edit.update_json(&before, &fields_file(&path("npc", "orc")), |npc| {
        npc["model"] = json!(path("model", "elf"));
        Some(())
    })
    .expect("the npc is there");
    editor.try_apply(edit).expect("applies");
}

#[test]
fn renaming_what_an_edit_still_loading_names_rewrites_that_edit_too() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp().model("elf", 1.5, json!([])), &scratch);
    orc_wearing_elf(&mut editor);

    let renamed = rows::rename(&mut editor, &path("model", "elf"), "fae").expect("renames");

    let files = files(&mut editor);
    let npc = files
        .json(&fields_file(&path("npc", "orc")))
        .expect("the npc");
    assert_eq!(npc["model"], json!(renamed));
    let project = editor.project.as_ref().expect("a project");
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
}

#[test]
fn removing_what_an_edit_still_loading_names_is_refused() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp().model("elf", 1.5, json!([])), &scratch);
    orc_wearing_elf(&mut editor);
    let model = path("model", "elf");
    let mut edit = ContentEdit::new("remove the elf's model");
    for file in editor
        .project
        .as_ref()
        .expect("a project")
        .files
        .files_of(&model)
    {
        edit.remove(file);
    }

    let refused = editor.try_apply(edit).expect_err("refused");
    assert!(refused.contains("missing file"), "{refused}");
}

/// An area placing a yard blueprint, and a post blueprint the yard may place.
fn yard() -> Game {
    let post = json!([{
        "type": "object",
        "name": "post",
        "shape": { "type": "point", "x": 0.5, "y": 0.5 },
    }]);
    camp()
        .blueprint("post", (1, 1), json!({}), post)
        .blueprint("yard", (2, 2), json!({}), json!([]))
        .edit_scene("area", support::AREA, |scene| {
            scene.as_array_mut().expect("a scene").push(json!({
                "type": "blueprint",
                "label": "yard",
                "blueprint": path("blueprint", "yard"),
                "at": { "x": 3.0, "y": 3.0 },
            }));
        })
}

fn yard_scene() -> String {
    format!("{}/scene.json", path("blueprint", "yard"))
}

#[test]
fn an_edit_that_breaks_a_file_it_never_touched_is_taken_back_once_the_folder_loads() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(yard(), &scratch);
    let before = files(&mut editor);
    let mut edit = ContentEdit::new("place a post far out in the yard");
    let far_post = json!([{
        "type": "blueprint",
        "label": "post",
        "blueprint": path("blueprint", "post"),
        "at": { "x": 6.0, "y": 6.0 },
    }]);
    edit.write(
        yard_scene(),
        FileBytes::from(serde_json::to_vec_pretty(&far_post).expect("json")),
    );

    editor.try_apply(edit).expect("the yard alone reads");
    let project = editor.project.as_mut().expect("a project");
    project.settle();

    let refused = project.take_refused().expect("the edit is taken back");
    assert_eq!(refused.label, "place a post far out in the yard");
    assert_eq!(
        refused.refusal.file,
        format!("{}/scene.json", support::area())
    );
    assert_eq!(project.files.get(&yard_scene()), before.get(&yard_scene()));
    assert!(project.history.steps().is_empty());
    assert!(project.loads());
}

#[test]
fn an_edit_that_keeps_every_file_loading_stays() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(yard(), &scratch);
    let mut edit = ContentEdit::new("place a post in the yard");
    let near_post = json!([{
        "type": "blueprint",
        "label": "post",
        "blueprint": path("blueprint", "post"),
        "at": { "x": 1.0, "y": 1.0 },
    }]);
    let bytes = FileBytes::from(serde_json::to_vec_pretty(&near_post).expect("json"));
    edit.write(yard_scene(), bytes.clone());

    editor.try_apply(edit).expect("applies");
    let project = editor.project.as_mut().expect("a project");
    project.settle();

    let refused = project.take_refused();
    assert!(
        refused.is_none(),
        "{:?}",
        refused.map(|refused| refused.refusal.sentence())
    );
    assert_eq!(project.files.get(&yard_scene()), Some(&bytes));
    assert_eq!(project.history.steps().len(), 1);
}
