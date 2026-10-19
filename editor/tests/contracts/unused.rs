use std::sync::Arc;

use editor::app::Editor;
use editor::moves::ScopeMoves;
use editor::project::Project;
use editor::rows;
use editor::schema::SchemaShapes;
use editor::unused::{self, UnusedRow};
use editor::user::{EditorSettings, UserFolder};
use engine::core::content::{RowName, row_file};
use serde_json::json;
use testkit::{Game, png};

use crate::support;

/// Wren lives in the start, behind a rock blueprint drawn from its own tileset. The hermit lives
/// nowhere, and a stray icon is named by nothing.
fn hermitage() -> Game {
    let rock = json!({ "parts": [
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "rocks", "tiles": [[0]] }
    ] });
    support::game()
        .npc("wren", 10.0, json!([]))
        .npc("hermit", 10.0, json!([]))
        .row(
            "tileset",
            "rocks",
            json!({ "image": "tilesets/rocks.png", "tile": 16, "tiles": {} }),
        )
        .asset("tilesets/rocks.png", png(16, 16))
        .row("blueprint", "rock", rock)
        .asset("icons/stray.png", png(16, 16))
        .edit("area", support::AREA, |area| {
            area["modules"] = json!([
                { "type": "resident", "npc": "wren", "at": { "x": 2.0, "y": 2.0 } },
                { "type": "blueprint", "blueprint": "rock", "at": { "x": 4.0, "y": 4.0 } }
            ])
        })
}

fn open(game: Game, scratch: &tempfile::TempDir) -> Editor {
    let folder = scratch.path().join("game");
    game.write_to(&folder);
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    project.settle();
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    editor
}

fn settled(editor: &mut Editor) -> &Project {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
    project
}

fn row(name: &str) -> RowName {
    let (table, key) = name.split_once('/').expect("table/key");
    RowName::new(table, key)
}

#[test]
fn what_nothing_in_use_reaches_is_unused_at_any_depth() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);

    let unused: Vec<(String, &UnusedRow)> = project
        .unused
        .rows()
        .map(|(row, why)| (row.to_string(), why))
        .collect();

    assert_eq!(
        unused,
        vec![
            (
                "model/hermit".to_owned(),
                &UnusedRow::NamedByUnused(vec![row("npc/hermit")])
            ),
            ("npc/hermit".to_owned(), &UnusedRow::Unnamed),
        ]
    );
    let assets: Vec<&str> = project.unused.assets().collect();
    assert_eq!(assets, ["icons/stray.png", "models/hermit.png"]);
}

#[test]
fn a_tileset_named_only_by_a_palette_or_a_blueprint_part_is_used_there() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);
    let moves = ScopeMoves::of(project);

    let ground = moves.users(&row("tileset/start_ground")).rows;
    let rocks = moves.users(&row("tileset/rocks")).rows;

    assert_eq!(ground.into_iter().collect::<Vec<_>>(), [row("area/start")]);
    assert_eq!(
        rocks.into_iter().collect::<Vec<_>>(),
        [row("blueprint/rock")]
    );
    assert!(project.unused.row("tileset", "start_ground").is_none());
    assert!(project.unused.row("tileset", "rocks").is_none());
}

#[test]
fn deleting_unused_content_takes_the_rows_and_files_in_one_undo_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);
    let rows: Vec<RowName> = project.unused.rows().map(|(row, _)| row.clone()).collect();
    let assets: Vec<String> = project.unused.assets().map(str::to_owned).collect();

    let deletion = unused::delete(project, &rows, &assets).expect("deletes");
    editor.try_apply(deletion.edit).expect("applies");

    let project = settled(&mut editor);
    assert!(project.unused.is_empty());
    assert!(!project.files.contains(&row_file("npc", "hermit")));
    assert!(!project.files.contains("assets/icons/stray.png"));
    assert!(project.files.contains(&row_file("npc", "wren")));
    editor.undo();
    let project = settled(&mut editor);
    assert!(project.files.contains(&row_file("npc", "hermit")));
    assert!(project.files.contains("assets/models/hermit.png"));
}

#[test]
fn deleting_is_refused_while_something_left_behind_names_what_goes() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);

    let model_alone = unused::delete(project, &[row("model/hermit")], &[]).err();
    let image_alone = unused::delete(project, &[], &["models/hermit.png".to_owned()]).err();

    assert_eq!(
        model_alone.as_deref(),
        Some("npc/hermit still names model/hermit: tick it too, or keep model/hermit")
    );
    assert_eq!(
        image_alone.as_deref(),
        Some("model/hermit still names models/hermit.png: tick it too, or keep the file")
    );
}

#[test]
fn renaming_a_tileset_rewrites_the_palettes_and_blueprint_parts_that_name_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);

    rows::rename(&mut editor, "tileset", "start_ground", "meadow", false).expect("renamed");
    rows::rename(&mut editor, "tileset", "rocks", "boulders", false).expect("renamed");

    let project = settled(&mut editor);
    let palette = project
        .files
        .text("tables/area/start/palette.csv")
        .expect("the palette");
    assert_eq!(palette, "tileset,tile,flip\nmeadow,0,\n");
    let rock = project
        .files
        .json(&row_file("blueprint", "rock"))
        .expect("the rock");
    assert_eq!(rock["parts"][0]["tileset"], "boulders");
}
