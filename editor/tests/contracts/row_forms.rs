use std::sync::Arc;

use editor::app::Editor;
use editor::project::Project;
use editor::schema::SchemaShapes;
use editor::ui::row_form;
use editor::user::{EditorSettings, UserFolder};
use editor::views::spreadsheet;
use engine::core::content::Fixture;
use engine::systems::area::world_map::{WorldMap, WorldMapDef};
use engine::systems::npc::NpcDef;
use serde_json::json;
use testkit::{Game, path};

use crate::support;

#[test]
fn a_multi_row_form_of_a_type_without_modules_says_nothing_of_modules() {
    let scratch = tempfile::tempdir().expect("scratch");
    let memory = |label: &str| json!({ "label": label, "type": "boolean", "resets": "never" });
    let game = support::game()
        .row("memory", "taunted", memory("Taunted"))
        .row("memory", "bribed", memory("Bribed"));
    let mut editor = open(game, &scratch);
    let keys = [path("memory", "taunted"), path("memory", "bribed")];

    let texts = drawn(&mut editor, "memory", &keys, &mut Vec::new());

    assert!(!texts.is_empty());
    for (text, _) in &texts {
        assert!(!text.contains("modules don't read"), "{text}");
        assert!(!text.contains("Add module"), "{text}");
    }
}

#[test]
fn an_edit_to_a_field_the_rows_hold_apart_sets_it_in_every_row_as_its_type() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .npc("wolf", 10.0, json!([]))
        .npc("bear", 10.0, json!([]));
    let mut editor = open(game, &scratch);
    let keys = [path("npc", "wolf"), path("npc", "bear")];

    let texts = drawn(&mut editor, "npc", &keys, &mut Vec::new());
    let name = texts
        .iter()
        .find(|(text, _)| text == "name")
        .map(|(_, rect)| *rect)
        .expect("the name field");
    let apart = texts
        .iter()
        .filter(|(text, _)| text.contains("an edit sets them all"))
        .map(|(_, rect)| *rect)
        .min_by(|a, b| {
            (a.top() - name.top())
                .abs()
                .total_cmp(&(b.top() - name.top()).abs())
        })
        .expect("the name field says the rows hold it apart");
    let field = egui::pos2(apart.left() + 20.0, apart.bottom() + 12.0);
    let mut events = vec![
        vec![egui::Event::PointerMoved(field)],
        vec![click(field, true)],
        vec![click(field, false)],
        vec![egui::Event::Text("1234".to_owned())],
        vec![key(egui::Key::Enter, true), key(egui::Key::Enter, false)],
        Vec::new(),
    ];
    drawn(&mut editor, "npc", &keys, &mut events);

    for key in &keys {
        let npc = editor
            .read::<NpcDef>(key)
            .expect("a project")
            .unwrap_or_else(|error| panic!("{key} reads as an npc: {error:?}"));
        assert_eq!(npc.name, "1234", "{key}");
    }
}

#[test]
fn a_field_the_rows_hold_apart_with_more_inside_it_is_left_to_each_row() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .item(
            "cap",
            json!({ "kind": { "type": "equipment", "slot": "head" } }),
        )
        .item("ore", json!({ "kind": { "type": "resource" } }));
    let mut editor = open(game, &scratch);
    let keys = [path("item", "cap"), path("item", "ore")];
    let before: Vec<_> = keys
        .iter()
        .map(|key| editor.fields_json(key).expect("the item"))
        .collect();

    let texts = drawn(&mut editor, "item", &keys, &mut Vec::new());
    let apart = texts
        .iter()
        .find(|(text, _)| text.contains("edit the rows one by one"))
        .map(|(_, rect)| *rect)
        .expect("the kind field says to edit each row");
    let below = egui::pos2(apart.left() + 20.0, apart.bottom() + 12.0);
    let mut events = vec![
        vec![egui::Event::PointerMoved(below)],
        vec![click(below, true)],
        vec![click(below, false)],
        vec![egui::Event::Text("x".to_owned())],
        Vec::new(),
    ];
    drawn(&mut editor, "item", &keys, &mut events);

    let after: Vec<_> = keys
        .iter()
        .map(|key| editor.fields_json(key).expect("the item"))
        .collect();
    assert_eq!(after, before);
}

#[test]
fn the_spreadsheet_shows_an_edit_before_the_folder_has_loaded_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game().npc("wolf", 10.0, json!([]));
    let mut editor = open(game, &scratch);
    let names = |editor: &mut Editor| -> Vec<serde_json::Value> {
        spreadsheet::shown_rows(editor, "npc")
            .0
            .iter()
            .map(|row| row.value["name"].clone())
            .collect()
    };
    assert_eq!(names(&mut editor), [json!("wolf")]);
    let wolf = path("npc", "wolf");
    let mut npc = (*editor
        .read::<NpcDef>(&wolf)
        .expect("a project")
        .expect("the npc reads"))
    .clone();
    npc.name = "Grey wolf".to_owned();

    assert!(editor.write_content("Rename the wolf", &wolf, &npc));

    assert!(editor.project.as_ref().expect("a project").loading());
    assert_eq!(names(&mut editor), [json!("Grey wolf")]);
}

#[test]
fn a_map_keyed_by_files_shows_each_key_as_its_file_and_typing_never_renames_one() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(world_with_a_card(), &scratch);
    let world = WorldMap::Game.path();
    let mut form = RowFrames::new("world_map", &world);
    form.run(&mut editor, Vec::new());
    let texts = form.run(&mut editor, Vec::new());
    let shown = editor::tabs::shown_path(&support::area()).to_owned();
    let card = texts
        .iter()
        .find(|(text, _)| *text == shown)
        .map(|(_, rect)| rect.center())
        .unwrap_or_else(|| panic!("the card's area is shown as {shown}: {texts:?}"));

    form.type_into(&mut editor, card, "x");

    let map = world_map(&editor);
    let reader = editor.reader().expect("a project");
    let keys: Vec<Option<&str>> = map.cards.keys().map(|area| reader.path_of(*area)).collect();
    assert_eq!(keys, [Some(support::area().as_str())]);
}

#[test]
fn a_whole_number_field_refuses_a_fraction_instead_of_rounding_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(world_with_a_card(), &scratch);
    let world = WorldMap::Game.path();
    let mut form = RowFrames::new("world_map", &world);
    form.run(&mut editor, Vec::new());
    let texts = form.run(&mut editor, Vec::new());
    let size = texts
        .iter()
        .find(|(text, _)| text == "100")
        .map(|(_, rect)| rect.center())
        .unwrap_or_else(|| panic!("the card's size is drawn: {texts:?}"));

    let texts = form.type_into(&mut editor, size, "5.5");

    let sizes: Vec<u32> = world_map(&editor)
        .cards
        .values()
        .map(|card| card.size)
        .collect();
    assert_eq!(sizes, [100]);
    assert!(
        texts
            .iter()
            .any(|(text, _)| text.contains("a whole number")),
        "{texts:?}"
    );
}

fn world_with_a_card() -> Game {
    support::game().edit("world_map", WorldMap::Game.name(), |map| {
        map["cards"] = json!({ support::area(): { "at": { "x": 0.0, "y": 0.0 }, "size": 100 } });
    })
}

fn world_map(editor: &Editor) -> Arc<WorldMapDef> {
    editor
        .read::<WorldMapDef>(&WorldMap::Game.path())
        .expect("a project")
        .expect("the world map reads")
}

/// The form of one row drawn frame after frame in one context, as the editor draws it.
struct RowFrames {
    ctx: egui::Context,
    table: String,
    key: String,
}

impl RowFrames {
    fn new(table: &str, key: &str) -> RowFrames {
        let ctx = egui::Context::default();
        editor::ui::theme::apply(&ctx);
        RowFrames {
            ctx,
            table: table.to_owned(),
            key: key.to_owned(),
        }
    }

    /// Draws a frame of `events`, giving the texts it drew and where.
    fn run(&mut self, editor: &mut Editor, events: Vec<egui::Event>) -> Vec<(String, egui::Rect)> {
        let input = egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(
                egui::Pos2::ZERO,
                egui::vec2(900.0, 1200.0),
            )),
            events,
            ..Default::default()
        };
        let mut output = self.ctx.run_ui(input, |ui| {
            row_form::show_row(editor, ui, &self.table, &self.key)
        });
        output.textures_delta.clear();
        output
            .shapes
            .iter()
            .filter_map(|clipped| match &clipped.shape {
                egui::Shape::Text(text) => Some((
                    text.galley.text().to_owned(),
                    text.galley.rect.translate(text.pos.to_vec2()),
                )),
                _ => None,
            })
            .collect()
    }

    /// Clicks at `at`, types `text` over what is there and presses Enter, giving the texts the
    /// form draws once that settles.
    fn type_into(
        &mut self,
        editor: &mut Editor,
        at: egui::Pos2,
        text: &str,
    ) -> Vec<(String, egui::Rect)> {
        let select_all = egui::Event::Key {
            key: egui::Key::A,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: egui::Modifiers::COMMAND,
        };
        for events in [
            vec![egui::Event::PointerMoved(at)],
            vec![click(at, true)],
            vec![click(at, false)],
            vec![select_all],
            vec![egui::Event::Text(text.to_owned())],
            vec![key(egui::Key::Enter, true), key(egui::Key::Enter, false)],
            Vec::new(),
        ] {
            self.run(editor, events);
        }
        self.run(editor, Vec::new())
    }
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

/// The texts the multi-row form of `keys` draws on its last frame, each where it is drawn, after
/// a frame for each of `events` and two more to settle.
fn drawn(
    editor: &mut Editor,
    table: &str,
    keys: &[String],
    events: &mut Vec<Vec<egui::Event>>,
) -> Vec<(String, egui::Rect)> {
    let ctx = egui::Context::default();
    editor::ui::theme::apply(&ctx);
    let mut frames: Vec<Vec<egui::Event>> = vec![Vec::new(), Vec::new()];
    frames.append(events);
    frames.extend([Vec::new(), Vec::new()]);
    let mut texts = Vec::new();
    for events in frames {
        let input = egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(
                egui::Pos2::ZERO,
                egui::vec2(1200.0, 900.0),
            )),
            events,
            ..Default::default()
        };
        let mut output = ctx.run_ui(input, |ui| {
            row_form::show_rows_tab(editor, ui, table, keys);
        });
        output.textures_delta.clear();
        texts = output
            .shapes
            .iter()
            .filter_map(|clipped| match &clipped.shape {
                egui::Shape::Text(text) => Some((
                    text.galley.text().to_owned(),
                    text.galley.rect.translate(text.pos.to_vec2()),
                )),
                _ => None,
            })
            .collect();
    }
    texts
}

fn click(pos: egui::Pos2, pressed: bool) -> egui::Event {
    egui::Event::PointerButton {
        pos,
        button: egui::PointerButton::Primary,
        pressed,
        modifiers: egui::Modifiers::NONE,
    }
}

fn key(key: egui::Key, pressed: bool) -> egui::Event {
    egui::Event::Key {
        key,
        physical_key: None,
        pressed,
        repeat: false,
        modifiers: egui::Modifiers::NONE,
    }
}
