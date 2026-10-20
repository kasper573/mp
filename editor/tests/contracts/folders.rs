use std::sync::Arc;

use editor::app::Editor;
use editor::folders;
use editor::project::{ContentEdit, Project};
use editor::schema::SchemaShapes;
use editor::ui::folder_dialogs;
use editor::user::{ContentFolds, EditorSettings, UserFolder};
use engine::core::content::{RowFolder, RowName, row_file};
use serde_json::json;
use testkit::Game;

use crate::support;

/// Three models: the lamp listed in towns, the net in towns/coast, the key in dungeons.
fn stocked() -> Game {
    support::game()
        .model("lamp", 1.0, json!([]))
        .model("net", 1.0, json!([]))
        .model("key", 1.0, json!([]))
        .edit("model", "lamp", |lamp| lamp["folder"] = json!("towns"))
        .edit("model", "net", |net| net["folder"] = json!("towns/coast"))
        .edit("model", "key", |key| key["folder"] = json!("dungeons"))
}

fn open(game: Game, scratch: &tempfile::TempDir) -> Editor {
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

fn apply(editor: &mut Editor, change: impl FnOnce(&mut ContentEdit, &Project)) {
    let project = editor.project.as_ref().expect("a project");
    let mut edit = ContentEdit::new("folders");
    change(&mut edit, project);
    editor.try_apply(edit).expect("applies");
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
}

fn folder(editor: &Editor, key: &str) -> Option<String> {
    let project = editor.project.as_ref().expect("a project");
    folders::folder_of(&project.files, "model", key).map(|folder| folder.to_string())
}

fn named(path: &str) -> RowFolder {
    RowFolder::try_from(path.to_owned()).expect("a folder")
}

#[test]
fn a_rows_folder_line_comes_after_its_owner_and_ahead_of_its_fields() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(
        support::game()
            .model("lamp", 1.0, json!([]))
            .own("model", "lamp", "area/start"),
        &scratch,
    );

    apply(&mut editor, |edit, project| {
        folders::move_rows(
            edit,
            &project.files,
            &[RowName::new("model", "lamp")],
            Some(&named("light")),
        )
    });

    let project = editor.project.as_ref().expect("a project");
    let lamp = project
        .files
        .json(&row_file("model", "lamp"))
        .expect("the lamp");
    let fields: Vec<&str> = lamp
        .as_object()
        .expect("an object")
        .keys()
        .take(2)
        .map(String::as_str)
        .collect();
    assert_eq!(fields, ["owner", "folder"]);
    assert_eq!(folder(&editor, "lamp").as_deref(), Some("light"));
}

#[test]
fn a_row_moved_out_of_its_folder_loses_the_line() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(stocked(), &scratch);

    apply(&mut editor, |edit, project| {
        folders::move_rows(edit, &project.files, &[RowName::new("model", "lamp")], None)
    });

    assert_eq!(folder(&editor, "lamp"), None);
    let project = editor.project.as_ref().expect("a project");
    let tables: Vec<String> = folders::folders_of(&project.files, "model")
        .iter()
        .map(ToString::to_string)
        .collect();
    assert_eq!(tables, ["dungeons", "towns", "towns/coast"]);
}

#[test]
fn renaming_a_folder_takes_the_folders_inside_along() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(stocked(), &scratch);

    apply(&mut editor, |edit, project| {
        folders::rename(
            edit,
            &project.files,
            "model",
            &named("towns"),
            &named("cities"),
        )
    });

    assert_eq!(folder(&editor, "lamp").as_deref(), Some("cities"));
    assert_eq!(folder(&editor, "net").as_deref(), Some("cities/coast"));
    assert_eq!(folder(&editor, "key").as_deref(), Some("dungeons"));
}

#[test]
fn removing_a_folder_moves_what_it_held_up_one_level() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(stocked(), &scratch);

    apply(&mut editor, |edit, project| {
        folders::remove(edit, &project.files, "model", &named("towns"))
    });

    assert_eq!(folder(&editor, "lamp"), None);
    assert_eq!(folder(&editor, "net").as_deref(), Some("coast"));
    assert_eq!(folder(&editor, "key").as_deref(), Some("dungeons"));
}

#[test]
fn a_renamed_folder_stays_unfolded_with_the_folders_inside_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(stocked(), &scratch);
    let unfolded = |ids: &[&str]| ContentFolds {
        tables: ids.iter().map(|id| (*id).to_owned()).collect(),
        ..ContentFolds::default()
    };
    editor.settings.content_folds.insert(
        "global".to_owned(),
        unfolded(&["model", "folder:model:towns", "folder:model:towns/coast"]),
    );

    folder_dialogs::rename(&mut editor, "model", &named("towns"), "cities").expect("renames");

    assert_eq!(
        editor.settings.content_folds["global"],
        unfolded(&["model", "folder:model:cities", "folder:model:cities/coast"])
    );
}
