use std::collections::HashSet;
use std::sync::Arc;

use editor::app::Editor;
use editor::project::{ContentEdit, Project, RowSelection, row_file};
use editor::schema::SchemaShapes;
use editor::templates;
use editor::user::{EditorSettings, UserFolder};
use editor::views::area::brush::{BrushStroke, BrushStrokeKind};
use editor::views::area::grid::GridDraft;
use editor::views::area::{AreaAction, AreaSnapshot, AreaTool, area_view_key, run_action};
use engine::core::math::Rng;
use engine::core::tiling::CellPos;
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

#[test]
fn switching_tools_ends_the_stroke_held_across_it() {
    let scratch = tempfile::tempdir().expect("a scratch folder");
    let mut editor = editor_with_a_door(&scratch);
    let snapshot = AreaSnapshot::for_area(&mut editor, AREA).expect("the area is open");
    let draft = GridDraft::of(&snapshot.area_key, &snapshot.area().grids);
    let view = editor.views.area.ensure_view(&area_view_key(AREA), AREA);
    view.set_stroke(BrushStroke {
        draft,
        kind: BrushStrokeKind::Paint,
        cells: HashSet::new(),
        seed: 1,
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
    let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(800.0, 600.0));
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
    let _ = ctx.run_ui(input, |ui| editor::views::area::show(editor, ui, AREA));
}

fn hold_a_stroke(editor: &mut Editor) {
    let snapshot = AreaSnapshot::for_area(editor, AREA).expect("the area is open");
    let draft = GridDraft::of(&snapshot.area_key, &snapshot.area().grids);
    view(editor).set_stroke(BrushStroke {
        draft,
        kind: BrushStrokeKind::Paint,
        cells: HashSet::new(),
        seed: 1,
        anchor: CellPos::new(0, 0),
        rng: Rng::new(1),
    });
}

fn view(editor: &mut Editor) -> &mut editor::views::area::AreaViewState {
    editor.views.area.ensure_view(&area_view_key(AREA), AREA)
}
