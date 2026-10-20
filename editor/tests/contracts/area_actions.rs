use std::collections::HashSet;
use std::sync::Arc;

use editor::app::Editor;
use editor::project::{ContentEdit, Project, RowSelection};
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use editor::views::area::brush::{BrushStroke, BrushStrokeKind};
use editor::views::area::grid::GridDraft;
use editor::views::area::{AreaAction, AreaSnapshot, AreaTool, area_view_key, nodes, run_action};
use engine::core::content::ContentFile;
use engine::core::math::Rng;
use engine::core::tiling::CellPos;
use engine::systems::area::AreaDef;
use engine::systems::area::scene::scene_file;
use serde_json::{Value, json};

use crate::support::{area, game_folder};

fn barn_door() -> Value {
    json!({
        "type": "object",
        "name": "barn-doors",
        "shape": { "type": "rect", "x": 2.5, "y": 2.5, "w": 2.0, "h": 2.0 }
    })
}

fn editor_with_a_door(scratch: &tempfile::TempDir) -> Editor {
    let folder = game_folder(scratch.path().join("game"));
    let project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    let mut scene = nodes::scene_of(&editor, &area());
    nodes::append(&mut scene, "", vec![barn_door()]);
    let mut edit = ContentEdit::new("Add a door");
    edit.write_json(scene_file(&area()), &scene);
    editor.try_apply(edit).expect("the door is written");
    editor
}

/// The door's node: after the ground layer the area starts with.
const DOOR: &str = "/1";

fn modules(editor: &Editor) -> Vec<Value> {
    nodes::modules(&nodes::scene_of(editor, &area()))
        .into_iter()
        .map(|module| module.json)
        .collect()
}

#[test]
fn duplicating_a_module_places_its_copy_one_tile_on_under_a_fresh_name() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    editor.selection = RowSelection::parts(AreaDef::TABLE, &area(), vec![DOOR.to_owned()]);
    let snapshot = AreaSnapshot::for_area(&mut editor, &area()).expect("the area is open");
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
    editor.selection = RowSelection::parts(AreaDef::TABLE, &area(), vec![DOOR.to_owned()]);
    let snapshot = AreaSnapshot::for_area(&mut editor, &area()).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::Duplicate);
    assert_eq!(modules(&editor).len(), 2);

    editor.undo();
    assert_eq!(modules(&editor), vec![barn_door()]);
}

#[test]
fn duplicating_with_nothing_selected_changes_nothing() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    editor.selection = RowSelection::row(AreaDef::TABLE, &area());
    let snapshot = AreaSnapshot::for_area(&mut editor, &area()).expect("the area is open");
    run_action(&mut editor, &snapshot, AreaAction::Duplicate);
    assert_eq!(modules(&editor), vec![barn_door()]);
}

#[test]
fn a_snapshot_lists_the_modules_of_its_area() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let snapshot = AreaSnapshot::for_area(&mut editor, &area()).expect("the area is open");
    let listed: Vec<(&str, &Value)> = snapshot
        .modules
        .iter()
        .map(|module| (module.pointer.as_str(), &module.json))
        .collect();
    assert_eq!(listed, vec![(DOOR, &barn_door())]);
    assert_eq!(snapshot.area_key, area());
    assert!(AreaSnapshot::for_area(&mut editor, "nowhere").is_none());
}

#[test]
fn switching_tools_ends_the_stroke_held_across_it() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let snapshot = AreaSnapshot::for_area(&mut editor, &area()).expect("the area is open");
    let draft = GridDraft::own(&snapshot.content, &snapshot.area_key).expect("the area's grids");
    let view = editor
        .views
        .area
        .ensure_view(&area_view_key(&area()), &area());
    view.set_stroke(BrushStroke {
        draft,
        kind: BrushStrokeKind::Paint,
        cells: HashSet::new(),
        anchor: CellPos::new(0, 0),
        rng: Rng::new(1),
    });
    view.set_tool(AreaTool::Select);
    assert!(view.stroke().is_none());
}

#[test]
fn escape_over_the_area_ends_the_stroke_held() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let ctx = egui::Context::default();
    editor::ui::theme::apply(&ctx);
    let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(1600.0, 900.0));
    let over_the_area = vec![egui::Event::PointerMoved(screen.center())];
    show_area(&ctx, &mut editor, screen, over_the_area.clone());
    hold_a_stroke(&mut editor);
    show_area(&ctx, &mut editor, screen, over_the_area);
    assert!(view(&mut editor).stroke().is_some());

    let escape = egui::Event::Key {
        key: egui::Key::Escape,
        physical_key: None,
        pressed: true,
        repeat: false,
        modifiers: egui::Modifiers::NONE,
    };
    show_area(&ctx, &mut editor, screen, vec![escape]);
    assert!(view(&mut editor).stroke().is_none());
}

fn show_area(
    ctx: &egui::Context,
    editor: &mut Editor,
    screen: egui::Rect,
    events: Vec<egui::Event>,
) {
    let input = egui::RawInput {
        screen_rect: Some(screen),
        events,
        ..Default::default()
    };
    let mut output = ctx.run_ui(input, |ui| editor::views::area::show(editor, ui, &area()));
    output.textures_delta.clear();
}

fn hold_a_stroke(editor: &mut Editor) {
    let snapshot = AreaSnapshot::for_area(editor, &area()).expect("the area is open");
    let draft = GridDraft::own(&snapshot.content, &snapshot.area_key).expect("the area's grids");
    view(editor).set_stroke(BrushStroke {
        draft,
        kind: BrushStrokeKind::Paint,
        cells: HashSet::new(),
        anchor: CellPos::new(0, 0),
        rng: Rng::new(1),
    });
}

fn view(editor: &mut Editor) -> &mut editor::views::area::AreaViewState {
    editor
        .views
        .area
        .ensure_view(&area_view_key(&area()), &area())
}
