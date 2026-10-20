use std::sync::Arc;

use editor::app::Editor;
use editor::project::{Project, RowSelection};
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use editor::views::area::{AreaAction, AreaSnapshot, nodes, placement, run_action};
use engine::core::content::{Content, ContentFile};
use engine::core::math::{Pos, Rect, Size};
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::{self, AreaDef, AreaModuleKind};
use serde_json::{Value, json};
use strum::VariantArray;
use testkit::{Game, path, png};

use crate::support::{self, area};

#[test]
fn every_kind_of_scene_module_has_a_shape_to_add_it_from() {
    let shapes = SchemaShapes::load();
    let offered: Vec<String> = shapes
        .scene_variants()
        .iter()
        .map(|variant| variant.tag.clone())
        .collect();

    for kind in AreaModuleKind::VARIANTS {
        assert!(
            offered.iter().any(|tag| tag == kind.tag()),
            "{}",
            kind.tag()
        );
    }
}

#[test]
fn removing_nodes_takes_each_named_one_whatever_order_they_are_named_in() {
    let mut scene = json!([
        { "type": "object", "name": "a" },
        { "type": "folder", "label": "Hall", "children": [
            { "type": "object", "name": "b" },
            { "type": "object", "name": "c" }
        ] },
        { "type": "object", "name": "d" }
    ]);

    let taken = nodes::remove(
        &mut scene,
        &["/1/children/0".to_owned(), "/2".to_owned(), "/0".to_owned()],
    );

    let names: Vec<&str> = taken
        .iter()
        .filter_map(|node| node["name"].as_str())
        .collect();
    assert_eq!(names, ["b", "d", "a"]);
    assert_eq!(
        scene,
        json!([{ "type": "folder", "label": "Hall", "children": [{ "type": "object", "name": "c" }] }])
    );
}

#[test]
fn a_duplicate_lands_right_after_its_original_labelled_apart_from_its_siblings() {
    let mut scene = json!([
        { "type": "folder", "label": "Pews", "children": [
            { "type": "blueprint", "label": "Pew", "blueprint": "pew.blueprint", "at": { "x": 1.0, "y": 1.0 } },
            { "type": "blueprint", "label": "Pew (1)", "blueprint": "pew.blueprint", "at": { "x": 3.0, "y": 1.0 } }
        ] },
        { "type": "object", "name": "door" }
    ]);

    let made = nodes::duplicate(
        &mut scene,
        &["/0/children/0".to_owned(), "/1".to_owned()],
        Value::clone,
    );

    assert_eq!(made, ["/0/children/1", "/2"]);
    let labels: Vec<&str> = scene[0]["children"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|node| node["label"].as_str())
        .collect();
    assert_eq!(labels, ["Pew", "Pew (2)", "Pew (1)"]);
    assert_eq!(scene[2]["name"], "door");
}

#[test]
fn new_nodes_land_in_the_selected_folder_or_beside_the_selected_node() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(chapel(), &scratch);
    let door = json!({ "type": "object", "name": "door", "shape": { "type": "point", "x": 1.0, "y": 1.0 } });

    nodes::select(&mut editor, &area(), vec!["/1".to_owned()]);
    assert_eq!(nodes::insertion_folder(&editor, &area()), "/1");
    nodes::select(&mut editor, &area(), vec!["/1/children/0".to_owned()]);
    assert_eq!(nodes::insertion_folder(&editor, &area()), "/1");
    nodes::select(&mut editor, &area(), Vec::new());
    assert_eq!(nodes::insertion_folder(&editor, &area()), "");

    nodes::select(&mut editor, &area(), vec!["/1/children/1".to_owned()]);
    assert!(nodes::add(
        &mut editor,
        &area(),
        vec![door.clone()],
        "Add a door"
    ));

    let scene = nodes::scene_of(&editor, &area());
    assert_eq!(scene.pointer("/1/children/2"), Some(&door));
    assert_eq!(editor.selection.parts, ["/1/children/2"]);
}

#[test]
fn a_new_placement_takes_its_blueprints_name_numbered_past_its_siblings() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(chapel(), &scratch);
    let pew = json!({ "type": "blueprint", "blueprint": path("blueprint", "pew"), "at": { "x": 5.0, "y": 5.0 } });

    nodes::select(&mut editor, &area(), vec!["/1".to_owned()]);
    nodes::add(&mut editor, &area(), vec![pew.clone(), pew], "Add pews");

    let scene = nodes::scene_of(&editor, &area());
    assert_eq!(
        scene.pointer("/1/children/2/label"),
        Some(&json!("pew (2)"))
    );
    assert_eq!(
        scene.pointer("/1/children/3/label"),
        Some(&json!("pew (3)"))
    );
    settled(&mut editor);
}

#[test]
fn making_a_blueprint_of_a_folder_leaves_one_placement_and_the_area_as_it_was() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(chapel(), &scratch);
    let before = shown(settled(&mut editor));

    nodes::select(&mut editor, &area(), vec!["/1".to_owned()]);
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::MakeBlueprint);

    let made = path("blueprint", "pews");
    let scene = nodes::scene_of(&editor, &area());
    assert_eq!(scene[1]["type"], "blueprint");
    assert_eq!(scene[1]["label"], "Pews");
    assert_eq!(scene[1]["blueprint"], made);
    assert_eq!(editor.selection.parts, ["/1"]);
    let content = settled(&mut editor);
    let blueprint = content
        .by_path::<BlueprintDef>(&made)
        .expect("the new blueprint loads");
    let held = nodes::modules(
        &serde_json::to_value(&blueprint.get(content).scene.nodes).expect("a scene"),
    );
    let kinds: Vec<&str> = held
        .iter()
        .map(|module| module.json["type"].as_str().unwrap_or_default())
        .collect();
    assert_eq!(kinds, ["blueprint", "blueprint"]);
    assert_eq!(shown(content), before);

    editor.undo();
    let content = settled(&mut editor);
    assert!(content.by_path::<BlueprintDef>(&made).is_none());
    assert_eq!(nodes::scene_of(&editor, &area())[1]["type"], "folder");
}

#[test]
fn unpacking_a_placement_leaves_a_folder_of_what_it_placed_and_the_area_as_it_was() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(chapel(), &scratch);
    let before = shown(settled(&mut editor));

    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    run_action(
        &mut editor,
        &snapshot,
        AreaAction::Unpack("/1/children/1".to_owned()),
    );

    let scene = nodes::scene_of(&editor, &area());
    let unpacked = scene.pointer("/1/children/1").expect("the folder");
    assert_eq!(unpacked["type"], "folder");
    assert_eq!(unpacked["label"], "pew (1)");
    assert_eq!(unpacked["children"][0]["type"], "scenery");
    assert_eq!(shown(settled(&mut editor)), before);
}

#[test]
fn a_placement_covers_on_the_map_what_it_places() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(chapel(), &scratch);
    settled(&mut editor);

    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");

    assert_eq!(
        snapshot.module_bounds("/1/children/1"),
        Some(Rect::new(Pos::new(2.0, 4.0), Size::new(2.0, 1.0)))
    );
    assert_eq!(
        snapshot.hit(Pos::new(3.5, 4.5)).as_deref(),
        Some("/1/children/1")
    );
}

#[test]
fn a_variable_left_unset_takes_its_default_even_when_the_default_names_content() {
    let spot = json!({ "area": area(), "x": 3.0, "y": 4.0 });
    let warp = json!({
        "runs_on": "object",
        "variables": { "to": { "type": "place" } },
        "nodes": {
            "entered": { "type": "on", "event": "entered", "by": "characters", "next": "warp" },
            "warp": { "type": "warp", "to": { "var": "to" } }
        }
    });
    let door = json!([{
        "type": "object",
        "name": "door",
        "shape": { "type": "rect", "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },
        "scripts": [{ "script": path("script", "warp"), "values": { "to": { "var": "spot" } } }]
    }]);
    let game = chapel().row("script", "warp", warp).blueprint(
        "signpost",
        (1, 1),
        json!({ "spot": { "type": "place", "default": spot } }),
        door,
    );
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = open(game, &scratch);
    let content = settled(&mut editor);

    let signpost = content
        .by_path::<BlueprintDef>(&path("blueprint", "signpost"))
        .expect("the signpost loads");
    let variable = &signpost.get(content).variables["spot"];

    assert_eq!(placement::variable_default(content, variable), Some(spot));
}

/// A chapel: its ground layer, then a folder of two pews placed from a blueprint.
fn chapel() -> Game {
    let pew = json!([
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": path("tileset", "wood"), "tiles": [[0, 0]] }
    ]);
    support::game()
        .row("tileset", "wood", json!({ "tile": 16, "tiles": {} }))
        .part("tileset", "wood", "image.png", png(16, 16))
        .blueprint("pew", (2, 1), json!({}), pew)
        .edit_scene("area", support::AREA, |scene| {
            let pews = json!({ "type": "folder", "label": "Pews", "children": [
                { "type": "blueprint", "label": "pew", "blueprint": path("blueprint", "pew"), "at": { "x": 2.0, "y": 2.0 } },
                { "type": "blueprint", "label": "pew (1)", "blueprint": path("blueprint", "pew"), "at": { "x": 2.0, "y": 4.0 } }
            ] });
            scene.as_array_mut().expect("a scene").push(pews);
        })
}

/// What an area shows of its scenery, wherever in its scene each piece comes from.
fn shown(content: &Content) -> Vec<String> {
    let id = content.by_path::<AreaDef>(&area()).expect("the area");
    let mut shown: Vec<String> = area::load(content, id)
        .scenery
        .iter()
        .map(|scenery| {
            format!(
                "{} at {:?} of {:?}",
                scenery.tileset.path(content),
                scenery.bounds(),
                scenery.tiles
            )
        })
        .collect();
    shown.sort();
    shown
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
