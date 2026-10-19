use std::sync::Arc;
use std::time::SystemTime;

use editor::project::{
    ContentEdit, EditHistory, EditStep, EditViewpoint, FileChange, GAME_FILE, Project,
    RowSelection, json_bytes,
};
use editor::schema::SchemaShapes;

use crate::support::game_folder;

#[test]
fn an_outside_change_restarts_the_saved_marker_at_the_disk_state() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let folder = game_folder(scratch.path().join("game"));
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");

    project
        .apply(rename(&project, "Lowtide"), viewpoint())
        .expect("applies");
    assert!(project.save().is_ok(), "the project saves");
    assert_eq!(project.history.saved(), Some(1));

    let mut outside = project.files.json_owned(GAME_FILE).expect("game.json");
    outside["name"] = "Outside".into();
    std::fs::write(folder.join(GAME_FILE), &*json_bytes(&outside)).expect("writes outside");
    let changes = project.outside_changes(None);
    assert!(changes.taken.iter().any(|file| file == GAME_FILE));
    assert_eq!(project.history.saved(), Some(0));

    for name in ["First", "Second", "Third"] {
        project
            .apply(rename(&project, name), viewpoint())
            .expect("applies");
    }
    assert_eq!(project.history.steps().len(), 3);
    assert_eq!(project.history.saved(), Some(0));
}

#[test]
fn the_saved_marker_follows_its_state_through_undo_and_new_edits() {
    let mut history = EditHistory::default();
    history.push(step("one"));
    history.push(step("two"));
    history.mark_saved();
    history.undone();
    assert_eq!(
        history.saved(),
        Some(2),
        "undo keeps the saved state on record"
    );

    history.push(step("three"));
    assert_eq!(
        history.saved(),
        None,
        "a saved state that a new edit discarded is gone"
    );
}

#[test]
fn the_saved_marker_follows_its_state_through_trimming() {
    let mut history = EditHistory::default();
    history.push(step("one"));
    history.mark_saved();
    for index in 0..499 {
        history.push(step(&format!("filler {index}")));
    }
    assert_eq!(history.steps().len(), 500);
    assert_eq!(history.saved(), Some(1));

    history.push(step("overflow"));
    assert_eq!(
        history.saved(),
        Some(0),
        "the saved state moves with the steps kept"
    );

    history.push(step("overflow again"));
    assert_eq!(history.saved(), None, "a trimmed saved state is gone");
}

fn step(label: &str) -> EditStep {
    EditStep {
        label: label.to_owned(),
        before: Vec::new(),
        after: Vec::new(),
        selection: RowSelection::game(),
        camera: None,
        at: SystemTime::now(),
    }
}

fn viewpoint() -> EditViewpoint {
    EditViewpoint {
        selection: RowSelection::game(),
        camera: None,
    }
}

fn rename(project: &Project, name: &str) -> ContentEdit {
    let mut game = project.files.json_owned(GAME_FILE).expect("game.json");
    game["name"] = name.into();
    ContentEdit {
        label: format!("rename to {name}"),
        changes: vec![FileChange {
            file: GAME_FILE.to_owned(),
            bytes: Some(json_bytes(&game)),
        }],
        merge: false,
    }
}
