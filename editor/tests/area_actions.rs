use std::sync::Arc;

use editor::app::Editor;
use editor::project::{ContentEdit, Project, RowSelection, row_file};
use editor::schema::SchemaShapes;
use editor::templates;
use editor::user::{EditorSettings, UserFolder};
use editor::views::area::{AreaAction, AreaSnapshot, run_action};
use serde_json::{Value, json};

const AREA: &str = "start";

fn barn_door() -> Value {
    json!({
        "type": "object",
        "name": "barn-doors",
        "shape": { "type": "rect", "x": 2.5, "y": 2.5, "w": 2.0, "h": 2.0 }
    })
}

fn editor_with_a_door(scratch: &tempfile::TempDir) -> Editor {
    let folder = scratch.path().join("game");
    templates::new_game("new_game", "Saltmarsh", &folder).expect("writes");
    let project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    let mut row = editor.row_value("area", AREA).expect("the start area");
    row["modules"] = json!([barn_door()]);
    let mut edit = ContentEdit::new("Add a door");
    edit.write_json(row_file("area", AREA), &row);
    editor.try_apply(edit).expect("the door is written");
    editor
}

fn modules(editor: &Editor) -> Vec<Value> {
    editor.row_value("area", AREA).expect("the area")["modules"]
        .as_array()
        .cloned()
        .expect("modules")
}

#[test]
fn duplicating_a_module_places_its_copy_one_tile_on_under_a_fresh_name() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    editor.selection = RowSelection::parts("area", AREA, vec!["/modules/0".to_owned()]);
    let snapshot = AreaSnapshot::for_area(&mut editor, AREA).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::Duplicate);

    let copies = modules(&editor);
    assert_eq!(copies.len(), 2);
    assert_eq!(copies[0], barn_door());
    assert_eq!(copies[1]["shape"]["x"].as_f64(), Some(3.5));
    assert_eq!(copies[1]["shape"]["y"].as_f64(), Some(3.5));
    assert_ne!(copies[1]["name"], copies[0]["name"]);
}

#[test]
fn duplicating_is_one_undo_step() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    editor.selection = RowSelection::parts("area", AREA, vec!["/modules/0".to_owned()]);
    let snapshot = AreaSnapshot::for_area(&mut editor, AREA).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::Duplicate);
    assert_eq!(modules(&editor).len(), 2);

    editor.undo();
    assert_eq!(modules(&editor), vec![barn_door()]);
}

#[test]
fn duplicating_with_nothing_selected_changes_nothing() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    editor.selection = RowSelection::row("area", AREA);
    let snapshot = AreaSnapshot::for_area(&mut editor, AREA).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::Duplicate);
    assert_eq!(modules(&editor), vec![barn_door()]);
}

#[test]
fn a_snapshot_lists_the_modules_of_its_area() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let snapshot = AreaSnapshot::for_area(&mut editor, AREA).expect("the area is open");
    assert_eq!(snapshot.modules, vec![barn_door()]);
    assert_eq!(snapshot.area_key, AREA);
    assert!(AreaSnapshot::for_area(&mut editor, "nowhere").is_none());
}
