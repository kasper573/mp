use editor::project::{ContentEdit, ProjectFiles, json_bytes};
use serde_json::{Value, json};

const FILE: &str = "tables/world/hub.json";

fn files_with(json: Value) -> ProjectFiles {
    let mut files = ProjectFiles::default();
    files.insert(FILE.to_owned(), json_bytes(&json));
    files
}

fn pending(edit: &ContentEdit, file: &str) -> Value {
    let change = edit
        .changes
        .iter()
        .find(|change| change.file == file)
        .expect("a pending change for the file");
    serde_json::from_slice(change.bytes.as_ref().expect("written, not removed")).expect("json")
}

#[test]
fn two_edits_to_one_file_both_land() {
    let files = files_with(json!({ "doors": [{ "x": 1.0, "y": 2.0 }, { "x": 3.0, "y": 4.0 }] }));
    let mut edit = ContentEdit::new("move two doors");
    for index in 0..2 {
        let pointer = format!("/doors/{index}");
        edit.update_json(&files, FILE, |json| {
            let place = json.pointer_mut(&pointer)?;
            place["x"] = json!(place["x"].as_f64()? + 10.0);
            Some(())
        })
        .expect("the door is there");
    }
    let written = pending(&edit, FILE);
    assert_eq!(written["doors"][0]["x"], json!(11.0));
    assert_eq!(written["doors"][1]["x"], json!(13.0));
}

#[test]
fn an_update_that_finds_no_place_writes_nothing() {
    let files = files_with(json!({ "doors": [] }));
    let mut edit = ContentEdit::new("move a door that is gone");
    let applied = edit.update_json(&files, FILE, |json| {
        json.pointer_mut("/doors/0")?;
        Some(())
    });
    assert!(applied.is_none());
    assert!(edit.changes.is_empty());
}

#[test]
fn an_edit_that_removed_the_file_cannot_update_it() {
    let files = files_with(json!({ "doors": [] }));
    let mut edit = ContentEdit::new("remove, then edit");
    edit.remove(FILE);
    let applied = edit.update_json(&files, FILE, |_| Some(()));
    assert!(applied.is_none());
}
