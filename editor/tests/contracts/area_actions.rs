use std::collections::HashSet;

use editor::app::Editor;
use editor::project::RowSelection;
use editor::views::area::brush::{BrushStroke, BrushStrokeKind};
use editor::views::area::grid::GridDraft;
use editor::views::area::nodes::SceneTree;
use editor::views::area::scene_tree;
use editor::views::area::{AreaAction, AreaSnapshot, AreaTool, nodes, run_action};
use engine::core::content::ContentFile;
use engine::core::math::Rng;
use engine::core::tiling::CellPos;
use engine::systems::area::object::ObjectShape;
use engine::systems::area::scene::{ModuleNode, SceneNode};
use engine::systems::area::{AreaDef, AreaModule};
use serde_json::{Value, json};

use crate::support::{self, Frames, area, key};

fn barn_door() -> Value {
    json!({
        "type": "object",
        "name": "barn-doors",
        "shape": { "type": "rect", "x": 2.5, "y": 2.5, "w": 2.0, "h": 2.0 }
    })
}

fn editor_with_a_door(scratch: &tempfile::TempDir) -> Editor {
    let mut editor = support::open(support::game(), scratch);
    let reader = editor.reader().expect("a reader");
    let door: AreaModule = reader.from_json(&barn_door()).expect("a door");
    assert!(nodes::change_scene(&mut editor, &area(), |scene| {
        SceneTree::new(scene).append("", vec![SceneNode::Module(ModuleNode::new(door))]);
        Some("Add a door".to_owned())
    }));
    editor
}

/// The door's node: after the ground layer the area starts with.
const DOOR: &str = "/1";

/// The name and shape of each object of the start area, in the order its scene lists them.
fn doors(editor: &Editor) -> Vec<(Option<String>, ObjectShape)> {
    nodes::modules(&nodes::scene_of(editor, &area()))
        .iter()
        .filter_map(|module| match module.module() {
            AreaModule::Object(object) => Some((object.name.clone(), object.shape)),
            _ => None,
        })
        .collect()
}

fn duplicate(editor: &mut Editor, rows: Vec<String>) {
    editor.selection = RowSelection::parts(AreaDef::TABLE, &area(), rows);
    let snapshot = AreaSnapshot::for_bundle(editor, &area()).expect("the area is open");
    run_action(editor, &snapshot, AreaAction::Duplicate);
}

#[test]
fn duplicating_a_module_places_its_copy_one_tile_on_under_a_fresh_name_in_one_undo_step() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let original = doors(&editor);

    duplicate(&mut editor, Vec::new());
    assert_eq!(doors(&editor), original, "nothing selected, nothing copied");

    duplicate(&mut editor, vec![DOOR.to_owned()]);
    let copies = doors(&editor);
    assert_eq!(copies.len(), 2);
    assert_eq!(copies[0], original[0]);
    let (ObjectShape::Rect(was), ObjectShape::Rect(copy)) = (copies[0].1, copies[1].1) else {
        panic!("the doors are rects");
    };
    assert_eq!(
        (copy.origin.x - was.origin.x, copy.origin.y - was.origin.y),
        (1.0, 1.0),
        "the copy sits one tile on"
    );
    assert_ne!(copies[1].0, copies[0].0);

    editor.undo();
    assert_eq!(doors(&editor), original);
}

#[test]
fn a_duplicated_ground_layer_takes_a_fresh_name_and_its_cells_along() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);

    duplicate(&mut editor, vec!["/0".to_owned(), DOOR.to_owned()]);

    assert_eq!(doors(&editor).len(), 2, "the duplicate applies");
    let bundle = nodes::bundle_of(&editor, &area()).expect("the area reads");
    let grids = &bundle.blueprint().scene.grids;
    let names: Vec<&String> = grids.layers.keys().collect();
    assert_eq!(names.len(), 2);
    assert_eq!(grids.layers[names[0]], grids.layers[names[1]]);
}

#[test]
fn copied_rows_paste_in_the_order_the_scene_lists_them() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let reader = editor.reader().expect("a reader");
    let named = |name: &str| {
        let mut door = barn_door();
        door["name"] = json!(name);
        SceneNode::Module(ModuleNode::new(reader.from_json(&door).expect("a door")))
    };
    let more: Vec<SceneNode> = (2..=10).map(|n| named(&format!("door-{n}"))).collect();
    assert!(nodes::change_scene(&mut editor, &area(), |scene| {
        SceneTree::new(scene).append("", more);
        Some("Add doors".to_owned())
    }));
    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    scene_tree::copy_rows(&mut editor, &snapshot, &["/10".to_owned(), "/2".to_owned()]);

    let snapshot = AreaSnapshot::for_bundle(&mut editor, &area()).expect("the area is open");
    scene_tree::paste_rows(&mut editor, &snapshot, "");

    let names = support::names(&nodes::scene_of(&editor, &area()));
    assert_eq!(names[names.len() - 2..], ["door-2", "door-10"]);
}

#[test]
fn switching_tools_or_escape_over_the_area_ends_the_stroke_held() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    hold_a_stroke(&mut editor);
    view(&mut editor).set_tool(AreaTool::Select);
    assert!(view(&mut editor).stroke().is_none());

    let mut frames = Frames::new(egui::vec2(1600.0, 900.0));
    let over_the_area = vec![egui::Event::PointerMoved(egui::pos2(800.0, 450.0))];
    frames.run(over_the_area.clone(), |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });
    hold_a_stroke(&mut editor);
    frames.run(over_the_area, |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });
    assert!(view(&mut editor).stroke().is_some());

    frames.run(key(egui::Key::Escape, egui::Modifiers::NONE), |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });
    assert!(view(&mut editor).stroke().is_none());
}

#[test]
fn ctrl_g_over_the_scene_graph_groups_the_selection_into_a_new_folder() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let mut frames = Frames::new(egui::vec2(1600.0, 900.0));
    let over_the_panel = vec![egui::Event::PointerMoved(egui::pos2(150.0, 400.0))];
    frames.run(over_the_panel.clone(), |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });
    editor.selection = RowSelection::parts(
        AreaDef::TABLE,
        &area(),
        vec!["/0".to_owned(), DOOR.to_owned()],
    );
    frames.run(over_the_panel, |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });

    let ctrl = egui::Modifiers::CTRL | egui::Modifiers::COMMAND;
    let ctrl_g = [egui::Event::ModifiersChanged(ctrl)]
        .into_iter()
        .chain(key(egui::Key::G, ctrl))
        .collect();
    frames.run(ctrl_g, |ui| {
        editor::views::area::show(&mut editor, ui, &area())
    });

    let scene = nodes::scene_of(&editor, &area());
    assert_eq!(scene.len(), 1);
    assert!(nodes::is_folder(&scene[0]));
    assert_eq!(nodes::children_of(&scene[0]).len(), 2);
}

fn hold_a_stroke(editor: &mut Editor) {
    let snapshot = AreaSnapshot::for_bundle(editor, &area()).expect("the area is open");
    let draft = GridDraft::own(editor, &snapshot.bundle).expect("the area's grids");
    view(editor).set_stroke(BrushStroke {
        draft,
        kind: BrushStrokeKind::Paint,
        layer: 0,
        cells: HashSet::new(),
        anchor: CellPos::new(0, 0),
        rng: Rng::new(1),
    });
}

fn view(editor: &mut Editor) -> &mut editor::views::area::AreaViewState {
    editor.views.area.ensure_view(&area())
}
