use std::sync::Arc;

use editor::app::Editor;
use editor::project::Project;
use editor::project::files::content_holding;
use editor::rows;
use editor::schema::SchemaShapes;
use editor::unused::{self, UnusedRow};
use editor::user::{EditorSettings, UserFolder};
use serde_json::json;
use testkit::{Game, path, png};

use crate::support;

/// Wren lives in the start, behind a rock blueprint drawn from its own tileset. The hermit lives
/// nowhere, a cap is worn by no one, and a stray icon is named by nothing.
fn hermitage() -> Game {
    let rock = json!([
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": path("tileset", "rocks"), "tiles": [[0]] }
    ]);
    support::game()
        .npc("wren", 10.0, json!([]))
        .npc("hermit", 10.0, json!([]))
        .item("cap", json!({ "kind": { "type": "resource" } }))
        .row("tileset", "rocks", json!({ "tile": 16, "tiles": {} }))
        .part("tileset", "rocks", "image.png", png(16, 16))
        .blueprint("rock", (1, 1), json!({}), rock)
        .asset("icons/stray.png", png(16, 16))
        .edit_scene("area", support::AREA, |scene| {
            let nodes = scene.as_array_mut().expect("a scene");
            nodes.push(json!({ "type": "resident", "npc": path("npc", "wren"), "at": { "x": 2.0, "y": 2.0 } }));
            nodes.push(json!({ "type": "blueprint", "label": "rock", "blueprint": path("blueprint", "rock"), "at": { "x": 4.0, "y": 4.0 } }));
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

#[test]
fn what_nothing_in_use_reaches_is_unused_at_any_depth() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);

    let unused: Vec<(&str, &UnusedRow)> = project
        .unused
        .rows()
        .map(|(row, why)| (row.as_str(), why))
        .collect();

    assert_eq!(
        unused,
        vec![
            (path("item", "cap").as_str(), &UnusedRow::Unnamed),
            (
                path("model", "hermit").as_str(),
                &UnusedRow::NamedByUnused(vec![path("npc", "hermit")])
            ),
            (path("npc", "hermit").as_str(), &UnusedRow::Unnamed),
            (
                path("sfx", "item").as_str(),
                &UnusedRow::NamedByUnused(vec![path("item", "cap")])
            ),
        ]
    );
    let assets: Vec<&str> = project.unused.assets().collect();
    assert_eq!(assets, ["icons/cap.png", "icons/stray.png"]);
}

#[test]
fn a_tileset_named_only_by_a_palette_or_a_blueprint_scene_is_used_there() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);
    let users = |tileset: &str| -> Vec<&str> {
        let mut users: Vec<&str> = project
            .usages
            .of_content(&path("tileset", tileset))
            .iter()
            .filter_map(|usage| content_holding(&usage.file))
            .collect();
        users.dedup();
        users
    };

    assert_eq!(users("start_ground"), [path("area", "start")]);
    assert_eq!(users("rocks"), [path("blueprint", "rock")]);
    assert!(
        project
            .unused
            .row(&path("tileset", "start_ground"))
            .is_none()
    );
    assert!(project.unused.row(&path("tileset", "rocks")).is_none());
}

#[test]
fn deleting_unused_content_takes_the_files_and_their_parts_in_one_undo_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);
    let rows: Vec<String> = project.unused.rows().map(|(row, _)| row.clone()).collect();
    let assets: Vec<String> = project.unused.assets().map(str::to_owned).collect();
    let sprites = format!("{}/sprites.png", path("model", "hermit"));

    let deletion = unused::delete(project, &rows, &assets).expect("deletes");
    editor.try_apply(deletion.edit).expect("applies");

    let project = settled(&mut editor);
    assert!(project.unused.is_empty());
    assert!(!project.files.contains(&path("npc", "hermit")));
    assert!(!project.files.contains(&sprites));
    assert!(!project.files.contains("icons/stray.png"));
    assert!(project.files.contains(&path("npc", "wren")));
    editor.undo();
    let project = settled(&mut editor);
    assert!(project.files.contains(&path("npc", "hermit")));
    assert!(project.files.contains(&sprites));
}

#[test]
fn deleting_is_refused_while_something_left_behind_names_what_goes() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);
    let project = settled(&mut editor);
    let (model, npc, cap) = (
        path("model", "hermit"),
        path("npc", "hermit"),
        path("item", "cap"),
    );

    let model_alone = unused::delete(project, std::slice::from_ref(&model), &[]).err();
    let icon_alone = unused::delete(project, &[], &["icons/cap.png".to_owned()]).err();

    assert_eq!(
        model_alone,
        Some(format!(
            "{npc} still names {model}: tick it too, or keep {model}"
        ))
    );
    assert_eq!(
        icon_alone,
        Some(format!(
            "{cap} still names icons/cap.png: tick it too, or keep the file"
        ))
    );
}

#[test]
fn renaming_a_tileset_rewrites_the_palettes_and_blueprint_scenes_that_name_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(hermitage(), &scratch);

    rows::rename(&mut editor, &path("tileset", "start_ground"), "meadow").expect("renamed");
    rows::rename(&mut editor, &path("tileset", "rocks"), "boulders").expect("renamed");

    let project = settled(&mut editor);
    let palette = project
        .files
        .text(&format!("{}/palette.csv", path("area", "start")))
        .expect("the palette");
    assert_eq!(
        palette,
        format!("tileset,tile,flip\n{},0,\n", path("tileset", "meadow"))
    );
    let rock = project
        .files
        .json(&format!("{}/scene.json", path("blueprint", "rock")))
        .expect("the rock");
    assert_eq!(rock[0]["tileset"], path("tileset", "boulders"));
}
