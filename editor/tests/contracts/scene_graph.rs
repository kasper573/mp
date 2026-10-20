use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use editor::app::Editor;
use editor::project::{Project, RowSelection};
use editor::schema::SchemaShapes;
use editor::ui::tree::{DropAt, TreeDrop, TreeSource};
use editor::user::{EditorSettings, TreeView, UserFolder};
use editor::views::area::flags::{Flag, SceneFlags, SceneLevel};
use editor::views::area::nodes::{self, Landing};
use editor::views::area::scene_tree::{self, SceneSource};
use editor::views::area::{AreaSnapshot, drop_gone, layers, placement};
use engine::core::content::{Content, ContentFile};
use engine::systems::area::AreaDef;
use serde_json::{Value, json};
use testkit::{Game, path, png};

use crate::support::{self, area};

fn object(name: &str) -> Value {
    json!({ "type": "object", "name": name, "shape": { "type": "point", "x": 1.5, "y": 1.5 } })
}

fn folder(label: &str, children: Vec<Value>) -> Value {
    json!({ "type": "folder", "label": label, "children": children })
}

fn names(nodes: &Value) -> Vec<String> {
    let mut found = Vec::new();
    nodes::walk(nodes, &mut |_, node| {
        let name = node["name"].as_str().or(node["label"].as_str());
        found.push(name.unwrap_or_default().to_owned());
    });
    found
}

#[test]
fn grouping_puts_the_rows_in_order_into_a_new_folder_where_the_first_was() {
    let mut scene = json!([object("a"), object("b"), object("c"), object("d")]);

    let made = nodes::group(&mut scene, &["/2".to_owned(), "/1".to_owned()], "Storage");

    assert_eq!(made.as_deref(), Some("/1"));
    assert_eq!(names(&scene), ["a", "Storage", "b", "c", "d"]);
    assert_eq!(scene[1]["children"].as_array().map(Vec::len), Some(2));
}

#[test]
fn grouping_rows_of_several_folders_makes_the_folder_in_the_one_holding_them_all() {
    let mut scene = json!([
        folder("Hall", vec![object("a"), object("b")]),
        folder("Altar", vec![object("c")]),
        object("d"),
    ]);

    let made = nodes::group(
        &mut scene,
        &["/0/children/1".to_owned(), "/1/children/0".to_owned()],
        "Picked",
    );

    assert_eq!(made.as_deref(), Some("/0"));
    assert_eq!(scene[0]["label"], "Picked");
    assert_eq!(names(&scene[0]["children"]), ["b", "c"]);
    assert_eq!(names(&scene[1]["children"]), ["a"]);
}

#[test]
fn ungrouping_puts_what_a_folder_held_in_its_place_in_order() {
    let mut scene = json!([
        object("a"),
        folder("Hall", vec![object("b"), object("c")]),
        object("d")
    ]);

    nodes::ungroup(&mut scene, &["/1".to_owned()]);

    assert_eq!(names(&scene), ["a", "b", "c", "d"]);
}

#[test]
fn moving_rows_into_a_folder_lands_them_where_asked() {
    let mut scene = json!([object("a"), object("b"), folder("Hall", vec![object("c")])]);

    let landed =
        nodes::move_nodes(&mut scene, &["/0".to_owned()], "/2", &Landing::First).expect("the move");

    assert_eq!(landed, ["/1/children/0"]);
    assert_eq!(names(&scene), ["b", "Hall", "a", "c"]);
}

#[test]
fn a_folder_never_moves_into_itself() {
    let mut scene = json!([folder("Hall", vec![folder("Nave", vec![])])]);
    let before = scene.clone();

    let moved = nodes::move_nodes(
        &mut scene,
        &["/0".to_owned()],
        "/0/children/0",
        &Landing::End,
    );

    assert!(moved.is_none());
    assert_eq!(scene, before);
}

#[test]
fn reordering_moves_each_row_one_place_among_its_siblings() {
    let mut scene = json!([object("a"), object("b"), object("c")]);

    nodes::reorder(&mut scene, &["/1".to_owned()], -1);

    assert_eq!(names(&scene), ["b", "a", "c"]);
}

#[test]
fn a_folders_hide_and_lock_reach_what_it_holds_without_touching_their_own() {
    let scene = json!([
        { "type": "folder", "label": "Pews", "hidden": true, "children": [
            { "type": "object", "name": "a", "hidden": true },
            { "type": "object", "name": "b" },
        ] },
        { "type": "folder", "label": "Guards", "locked": true, "children": [object("c")] },
        object("d"),
    ]);

    let flags = SceneFlags::of(
        &[SceneLevel {
            under: String::new(),
            scene: &scene,
        }],
        None,
    );

    assert_eq!(flags.row("/0").hidden, Flag::Own);
    assert_eq!(flags.row("/0/children/0").hidden, Flag::Own);
    assert_eq!(flags.row("/0/children/1").hidden, Flag::Inherited);
    assert_eq!(flags.row("/1/children/0").locked, Flag::Inherited);
    assert_eq!(flags.row("/2"), Default::default());
    assert_eq!((flags.hidden, flags.locked), (2, 1));
    assert!(!flags.keep(&["/0/children/1"]));
    assert!(flags.keep(&["/2"]));
}

#[test]
fn showing_only_a_row_hides_everything_else_for_the_moment() {
    let scene = json!([folder("Pews", vec![object("a")]), object("b")]);

    let flags = SceneFlags::of(
        &[SceneLevel {
            under: String::new(),
            scene: &scene,
        }],
        Some("/0"),
    );

    assert!(!flags.hidden("/0"));
    assert!(!flags.hidden("/0/children/0"));
    assert_eq!(flags.row("/1").hidden, Flag::Inherited);
}

#[test]
fn grouping_and_naming_the_folder_is_one_undo_step() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(objects_game(), &scratch);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    let rows = ["/1".to_owned(), "/2".to_owned()];

    let (id, step) = scene_tree::group(&mut editor, &snapshot, &rows).expect("grouped");
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    scene_tree::rename_grouped(&mut editor, &snapshot, &id, "Storage", &step);

    let scene = nodes::scene_of(&editor, &area());
    assert_eq!(scene[1]["label"], "Storage");
    assert_eq!(names(&scene[1]["children"]), ["a", "b"]);
    editor.undo();
    assert_eq!(
        names(&nodes::scene_of(&editor, &area()))[1..],
        ["a", "b", "c"]
    );
}

#[test]
fn a_new_folder_lands_in_the_insertion_folder_and_never_shares_a_label() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(objects_game(), &scratch);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");

    let first = scene_tree::new_folder(&mut editor, &snapshot, "").expect("a folder");
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    let second = scene_tree::new_folder(&mut editor, &snapshot, "").expect("a folder");

    let scene = nodes::scene_of(&editor, &area());
    let label = |id: &str| scene.pointer(id).map(|node| node["label"].clone());
    assert_ne!(label(&first), label(&second));
}

#[test]
fn deleting_a_folder_takes_all_it_holds_in_one_step() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(objects_game(), &scratch);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    let (id, _) = scene_tree::group(&mut editor, &snapshot, &["/1".to_owned(), "/2".to_owned()])
        .expect("grouped");
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");

    scene_tree::delete_rows(&mut editor, &snapshot, &[id]);

    assert_eq!(names(&nodes::scene_of(&editor, &area()))[1..], ["c"]);
    editor.undo();
    assert_eq!(
        names(&nodes::scene_of(&editor, &area()))[1..],
        ["New folder", "a", "b", "c"]
    );
}

#[test]
fn a_selected_folder_moves_what_it_holds_that_is_shown_and_unlocked() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let game = support::game().edit_scene("area", support::AREA, |scene| {
        let mut locked = object("b");
        locked["locked"] = Value::Bool(true);
        scene
            .as_array_mut()
            .expect("a scene")
            .push(folder("Pews", vec![object("a"), locked]));
    });
    let mut editor = open(game, &scratch);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");

    let moved = snapshot.selected_modules(&HashSet::from(["/1".to_owned()]));

    assert_eq!(moved, ["/1/children/0"]);
    assert!(
        snapshot
            .folder_box(&HashSet::from(["/1".to_owned()]))
            .is_some_and(|(_, label)| label == "Pews")
    );
}

#[test]
fn rows_never_drop_onto_a_placement_or_into_themselves() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let game = support::game()
        .blueprint("pew", (1, 1), json!({}), json!([]))
        .edit_scene("area", support::AREA, |scene| {
            let rows = scene.as_array_mut().expect("a scene");
            rows.push(folder("Hall", vec![folder("Nave", vec![])]));
            rows.push(json!({
                "type": "blueprint",
                "label": "pew",
                "blueprint": path("blueprint", "pew"),
                "at": { "x": 1.0, "y": 1.0 }
            }));
        });
    let mut editor = open(game, &scratch);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    let project = editor.project.as_ref().expect("a project");
    let cells = HashMap::new();
    let source = SceneSource::new(
        project,
        &snapshot,
        &editor.selection,
        "",
        &TreeView::default(),
        &cells,
        false,
    );
    let into = |folder: &str| TreeDrop {
        folder: folder.to_owned(),
        at: DropAt::End,
        onto: None,
    };

    assert!(source.drop_tip(&["/2".to_owned()], &into("/1")).is_ok());
    assert!(
        source
            .drop_tip(&["/1".to_owned()], &into("/1/children/0"))
            .is_err()
    );
    let onto_a_placement = TreeDrop {
        onto: Some("/2".to_owned()),
        ..into("")
    };
    assert!(
        source
            .drop_tip(&["/1".to_owned()], &onto_a_placement)
            .is_err()
    );
}

#[test]
fn renaming_a_layer_renames_it_in_every_blueprint_painting_into_it() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(painted_game(), &scratch);
    let rug = path("blueprint", "rug");

    layers::rename(&mut editor, &area(), "ground", "carpet").expect("renamed");

    for bundle in [area(), rug.clone()] {
        assert_eq!(
            layers::names(&nodes::scene_of(&editor, &bundle)),
            ["carpet"]
        );
    }
    let content = settled(&mut editor);
    assert!(content.by_path::<AreaDef>(&area()).is_some());
    editor.undo();
    assert_eq!(layers::names(&nodes::scene_of(&editor, &rug)), ["ground"]);
}

#[test]
fn a_layer_name_taken_anywhere_it_reaches_is_refused() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(painted_game(), &scratch);
    let rug = path("blueprint", "rug");
    nodes::change_scene(&mut editor, &rug, |scene| {
        nodes::append(
            scene,
            "",
            vec![json!({ "type": "ground_layer", "name": "carpet" })],
        );
        Some("Add a layer".to_owned())
    });

    let refused = layers::rename(&mut editor, &area(), "ground", "carpet");

    assert!(refused.is_err());
    assert_eq!(
        layers::names(&nodes::scene_of(&editor, &area())),
        ["ground"]
    );
}

#[test]
fn a_blueprint_that_would_hold_itself_is_refused_with_the_chain() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let game = painted_game().blueprint(
        "dais",
        (2, 2),
        json!({}),
        json!([{ "type": "blueprint", "label": "rug", "blueprint": path("blueprint", "rug"), "at": { "x": 0.0, "y": 0.0 } }]),
    );
    let editor = open(game, &scratch);
    let files = &editor.project.as_ref().expect("a project").files;
    let rug = path("blueprint", "rug");
    let dais = path("blueprint", "dais");

    assert!(placement::holds_itself(files, &rug, &rug).is_some());
    let reason = placement::holds_itself(files, &rug, &dais).expect("refused");
    assert!(reason.contains("dais"), "{reason}");
    assert!(placement::holds_itself(files, &dais, &rug).is_none());
    assert!(placement::holds_itself(files, &area(), &dais).is_none());
}

#[test]
fn a_change_on_disk_drops_only_the_selected_nodes_it_took_away() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(objects_game(), &scratch);
    editor.selection = RowSelection::parts(
        AreaDef::TABLE,
        &area(),
        vec!["/1".to_owned(), "/9".to_owned()],
    );

    let said = drop_gone(&mut editor).expect("one was dropped");

    assert_eq!(editor.selection.parts, ["/1"]);
    assert!(said.contains("changed on disk"), "{said}");
    assert!(drop_gone(&mut editor).is_none());
}

/// An area of three objects after its ground layer.
fn objects_game() -> Game {
    support::game().edit_scene("area", support::AREA, |scene| {
        let rows = scene.as_array_mut().expect("a scene");
        rows.extend([object("a"), object("b"), object("c")]);
    })
}

/// An area whose ground layer a rug blueprint paints into from its placement.
fn painted_game() -> Game {
    support::game()
        .row("tileset", "wood", json!({ "tile": 16, "tiles": {} }))
        .part("tileset", "wood", "image.png", png(16, 16))
        .blueprint(
            "rug",
            (1, 1),
            json!({}),
            json!([{ "type": "ground_layer", "name": "ground" }]),
        )
        .part(
            "blueprint",
            "rug",
            "palette.csv",
            format!("tileset,tile,flip\n{},0,\n", path("tileset", "wood")).into_bytes(),
        )
        .part("blueprint", "rug", "layers/ground.csv", b"0\n".to_vec())
        .edit_scene("area", support::AREA, |scene| {
            scene.as_array_mut().expect("a scene").push(json!({
                "type": "blueprint",
                "label": "rug",
                "blueprint": path("blueprint", "rug"),
                "at": { "x": 1.0, "y": 1.0 }
            }));
        })
}

fn open(game: Game, scratch: &tempfile::TempDir) -> Editor {
    let folder = scratch.path().join("game");
    game.write_to(&folder);
    let project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    editor.selection = RowSelection::row(AreaDef::TABLE, &area());
    editor
}

fn settled(editor: &mut Editor) -> &Content {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    project.content.as_ref().unwrap_or_else(|| {
        panic!(
            "{}",
            project
                .report
                .as_ref()
                .map(ToString::to_string)
                .unwrap_or_default()
        )
    })
}
