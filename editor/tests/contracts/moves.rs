use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use editor::app::{Editor, ModalDialog};
use editor::moves::{MoveRefusal, ScopeMoves, StaysGlobal, owner_lines};
use editor::project::{ContentEdit, Project};
use editor::rows;
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use engine::core::content::{RowName, row_file};
use engine::systems::registry;
use serde_json::{Value, json};
use testkit::{Game, Map};

use crate::support;

fn resident(npc: &str) -> Value {
    json!({ "type": "resident", "npc": npc, "at": { "x": 2.0, "y": 2.0 } })
}

/// Wren lives on the island, the bat on the island and in the forest.
fn islands() -> Game {
    support::game()
        .npc("wren", 10.0, json!([]))
        .npc("bat", 10.0, json!([]))
        .area(
            "island",
            &Map::open(8, 8),
            json!([resident("wren"), resident("bat")]),
        )
        .area("forest", &Map::open(8, 8), json!([resident("bat")]))
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

fn project(editor: &mut Editor) -> &Project {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    if let Some(report) = &project.report {
        let errors: Vec<String> = report
            .errors
            .iter()
            .map(|error| format!("{}: {}", error.file, error.problem))
            .collect();
        panic!("the game doesn't load: {errors:?}");
    }
    project
}

fn row(name: &str) -> RowName {
    RowName::try_from(name.to_owned()).expect("table/key")
}

fn owner_of(editor: &mut Editor, name: &str) -> Option<String> {
    let name = row(name);
    project(editor)
        .files
        .owners()
        .owner(&name.table, &name.key)
        .map(RowName::to_string)
}

#[test]
fn a_row_used_from_one_area_belongs_to_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let moves = ScopeMoves::of(project(&mut editor));
    assert_eq!(moves.home(&row("npc/wren")), Ok(row("area/island")));
}

#[test]
fn a_row_two_areas_use_stays_global() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let moves = ScopeMoves::of(project(&mut editor));
    assert_eq!(
        moves.home(&row("npc/bat")),
        Err(StaysGlobal::Scattered(vec![
            row("area/forest"),
            row("area/island")
        ]))
    );
}

#[test]
fn a_fixture_stays_global() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let project = project(&mut editor);
    let fixture = registry()
        .table_names()
        .into_iter()
        .flat_map(|table| {
            project
                .files
                .keys_of(table)
                .map(move |key| RowName::new(table, key))
        })
        .find(|row| registry().is_fixture(row))
        .expect("the engine's rows hold a fixture");
    assert_eq!(
        ScopeMoves::of(project).home(&fixture),
        Err(StaysGlobal::Fixture)
    );
}

#[test]
fn a_row_made_local_takes_along_what_only_it_uses() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let moves = ScopeMoves::of(project(&mut editor));
    let plan = moves.make_local(&row("npc/wren"), &row("area/island"), &BTreeSet::new());
    assert_eq!(plan.along, [(row("model/wren"), row("npc/wren"))]);
    let kept = BTreeSet::from([row("model/wren")]);
    let plan = moves.make_local(&row("npc/wren"), &row("area/island"), &kept);
    assert_eq!(plan.along, []);
}

#[test]
fn a_row_made_global_takes_along_the_local_rows_it_uses() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands()
        .own("npc", "wren", "area/island")
        .own("model", "wren", "area/island");
    let mut editor = open(game, &scratch);
    let moves = ScopeMoves::of(project(&mut editor));
    assert_eq!(
        moves.make_global(&row("npc/wren"), &BTreeSet::new()),
        [row("model/wren")]
    );
}

#[test]
fn a_row_moved_away_from_its_users_is_refused_naming_them() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands().own("npc", "wren", "area/island");
    let mut editor = open(game, &scratch);
    let moves = ScopeMoves::of(project(&mut editor));
    let Err(MoveRefusal::Breaks(broken)) = moves.move_to(&row("npc/wren"), &row("area/forest"))
    else {
        panic!("the island still uses wren");
    };
    assert_eq!(broken.len(), 1);
    assert_eq!(broken[0].file, row_file("area", "island"));
    assert_eq!(
        moves.move_to(&row("area/island"), &row("npc/wren")),
        Err(MoveRefusal::Inside)
    );
}

#[test]
fn gathering_nests_rows_in_the_rows_they_belong_to_and_leaves_areas_unticked() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let gathered = ScopeMoves::of(project(&mut editor)).gather(&BTreeMap::new());
    let ticked: BTreeMap<RowName, RowName> = gathered
        .iter()
        .filter(|gathered| gathered.ticked)
        .map(|gathered| (gathered.row.clone(), gathered.owner.clone()))
        .collect();
    assert_eq!(ticked.get(&row("npc/wren")), Some(&row("area/island")));
    assert_eq!(ticked.get(&row("model/wren")), Some(&row("npc/wren")));
    assert_eq!(ticked.get(&row("npc/bat")), None);
    assert!(ticked.keys().all(|row| row.table != "area"));
}

#[test]
fn owner_lines_are_written_first_and_taken_off_again() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(islands(), &scratch);
    let mut edit = ContentEdit::new("make wren local");
    owner_lines(
        &mut edit,
        &project(&mut editor).files,
        &[(row("npc/wren"), Some(row("area/island")))],
    );
    editor.try_apply(edit).expect("applies");
    assert_eq!(
        owner_of(&mut editor, "npc/wren").as_deref(),
        Some("area/island")
    );
    let written = editor.row_value("npc", "wren").expect("wren");
    let first = written
        .as_object()
        .and_then(|fields| fields.keys().next().cloned());
    assert_eq!(first.as_deref(), Some("owner"));

    let mut edit = ContentEdit::new("make wren global");
    owner_lines(
        &mut edit,
        &project(&mut editor).files,
        &[(row("npc/wren"), None)],
    );
    editor.try_apply(edit).expect("applies");
    assert_eq!(owner_of(&mut editor, "npc/wren"), None);
}

#[test]
fn renaming_an_owner_rewrites_its_local_rows_owner_lines() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands()
        .npc("island_guard", 10.0, json!([]))
        .edit("area", "island", |area| {
            area["modules"]
                .as_array_mut()
                .expect("modules")
                .push(resident("island_guard"));
        })
        .own("npc", "wren", "area/island")
        .own("npc", "island_guard", "area/island");
    let mut editor = open(game, &scratch);
    project(&mut editor);
    rows::rename(&mut editor, "area", "island", "isle", true).expect("renames");
    assert_eq!(
        owner_of(&mut editor, "npc/wren").as_deref(),
        Some("area/isle")
    );
    assert_eq!(
        owner_of(&mut editor, "npc/isle_guard").as_deref(),
        Some("area/isle")
    );
    let isle = editor.row_value("area", "isle").expect("the isle");
    assert!(
        isle["modules"]
            .as_array()
            .expect("modules")
            .iter()
            .any(|module| module["npc"] == "isle_guard")
    );
}

#[test]
fn deleting_an_owner_deletes_its_local_rows() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands()
        .own("npc", "wren", "area/island")
        .own("model", "wren", "npc/wren");
    let mut editor = open(game, &scratch);
    project(&mut editor);
    rows::delete_dialog(&mut editor, "area", vec!["island".to_owned()]);
    let Some(ModalDialog::Delete(dialog)) = editor.dialogs.pop() else {
        panic!("a delete dialog opens");
    };
    assert_eq!(dialog.along, [row("npc/wren"), row("model/wren")]);
    rows::delete(&mut editor, &dialog).expect("deletes");
    let files = &project(&mut editor).files;
    assert!(!files.contains(&row_file("npc", "wren")));
    assert!(!files.contains(&row_file("model", "wren")));
    assert!(files.contains(&row_file("npc", "bat")));
}

#[test]
fn duplicating_an_owner_copies_its_local_rows_under_new_keys() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands()
        .own("npc", "wren", "area/island")
        .own("model", "wren", "npc/wren");
    let mut editor = open(game, &scratch);
    project(&mut editor);
    rows::duplicate_as(&mut editor, &row("area/island"), "island_2").expect("duplicates");
    assert_eq!(
        owner_of(&mut editor, "npc/island_2_wren").as_deref(),
        Some("area/island_2")
    );
    assert_eq!(
        owner_of(&mut editor, "model/island_2_wren").as_deref(),
        Some("npc/island_2_wren")
    );
    let copy = editor.row_value("npc", "island_2_wren").expect("the copy");
    assert_eq!(copy["model"], "island_2_wren");
    let area = editor
        .row_value("area", "island_2")
        .expect("the copied area");
    let npcs: Vec<&Value> = area["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .map(|module| &module["npc"])
        .collect();
    assert_eq!(npcs, [&json!("island_2_wren"), &json!("bat")]);
    assert_eq!(
        owner_of(&mut editor, "npc/wren").as_deref(),
        Some("area/island")
    );
}

#[test]
fn a_copied_key_starting_with_the_owners_key_takes_the_new_key_in_its_place() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = islands()
        .npc("island_guard", 10.0, json!([]))
        .own("npc", "island_guard", "area/island")
        .own("npc", "wren", "area/island");
    let mut editor = open(game, &scratch);
    let copies = rows::copied_keys(&project(&mut editor).files, &row("area/island"), "island_2");
    let keys: BTreeMap<String, String> = copies
        .into_iter()
        .map(|(row, key)| (row.to_string(), key))
        .collect();
    assert_eq!(keys["npc/island_guard"], "island_2_guard");
    assert_eq!(keys["npc/wren"], "island_2_wren");
}
