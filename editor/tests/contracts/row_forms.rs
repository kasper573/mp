use std::sync::Arc;

use editor::app::Editor;
use editor::ui::row_form;
use editor::views::spreadsheet;
use engine::core::content::Fixture;
use engine::systems::area::world_map::{WorldMap, WorldMapDef};
use engine::systems::memory::{MemoryDef, Resets};
use engine::systems::notification::{NotificationDef, NotificationDefKind};
use engine::systems::npc::NpcDef;
use serde_json::json;
use testkit::{Game, path};

use crate::support::{self, Drawn, Frames, click, key};

#[test]
fn a_multi_row_form_of_a_type_without_modules_says_nothing_of_modules() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .memory("taunted", "never")
        .memory("bribed", "never");
    let mut editor = support::open(game, &scratch);
    let keys = [path("memory", "taunted"), path("memory", "bribed")];

    let drawn = rows_form(&mut editor, "memory", &keys, Vec::new());

    assert!(drawn.rect("label").is_some(), "{drawn:?}");
    assert!(
        !drawn.any(|text| text.contains("modules don't read") || text.contains("Add module")),
        "{drawn:?}"
    );
}

#[test]
fn an_edit_to_a_field_the_rows_hold_apart_sets_it_in_every_row_unless_it_holds_more() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .npc("wolf", 10.0, json!([]))
        .npc("bear", 10.0, json!([]))
        .item(
            "cap",
            json!({ "kind": { "type": "equipment", "slot": "head" } }),
        )
        .item("ore", json!({ "kind": { "type": "resource" } }));
    let mut editor = support::open(game, &scratch);
    let npcs = [path("npc", "wolf"), path("npc", "bear")];
    let items = [path("item", "cap"), path("item", "ore")];
    let items_before: Vec<_> = items
        .iter()
        .map(|key| editor.fields_json(key).expect("the item"))
        .collect();

    let drawn = rows_form(&mut editor, "npc", &npcs, Vec::new());
    let name = drawn.rect("name").expect("the name field");
    let apart = drawn
        .0
        .iter()
        .filter(|(text, _)| text.contains("an edit sets them all"))
        .map(|(_, rect)| *rect)
        .min_by(|a, b| {
            (a.top() - name.top())
                .abs()
                .total_cmp(&(b.top() - name.top()).abs())
        })
        .expect("the name field says the rows hold it apart");
    type_below(&mut editor, "npc", &npcs, apart, "1234");

    let kind = rows_form(&mut editor, "item", &items, Vec::new())
        .0
        .into_iter()
        .find(|(text, _)| text.contains("edit the rows one by one"))
        .map(|(_, rect)| rect)
        .expect("the kind field says to edit each row");
    type_below(&mut editor, "item", &items, kind, "x");

    for key in &npcs {
        let npc = editor
            .read::<NpcDef>(key)
            .expect("a project")
            .unwrap_or_else(|error| panic!("{key} reads as an npc: {error:?}"));
        assert_eq!(npc.name, "1234", "{key}");
    }
    let items_after: Vec<_> = items
        .iter()
        .map(|key| editor.fields_json(key).expect("the item"))
        .collect();
    assert_eq!(items_after, items_before);
}

#[test]
fn the_spreadsheet_shows_an_edit_on_the_next_frame() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game().npc("wolf", 10.0, json!([]));
    let mut editor = support::open(game, &scratch);
    let mut frames = Frames::new(egui::vec2(1200.0, 900.0));
    let drawn = frames.run(Vec::new(), |ui| spreadsheet::show(&mut editor, ui, "npc"));
    assert!(drawn.rect("wolf").is_some(), "{drawn:?}");
    let wolf = path("npc", "wolf");
    let mut npc = (*editor
        .read::<NpcDef>(&wolf)
        .expect("a project")
        .expect("the npc reads"))
    .clone();
    npc.name = "Grey wolf".to_owned();

    assert!(editor.write_content("Rename the wolf", &wolf, &npc));

    let drawn = frames.run(Vec::new(), |ui| spreadsheet::show(&mut editor, ui, "npc"));
    assert!(drawn.rect("Grey wolf").is_some(), "{drawn:?}");
}

#[test]
fn pasting_into_the_spreadsheet_writes_each_cell_its_column_reads_and_skips_the_rest() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .memory("bribed", "never")
        .memory("taunted", "never");
    let mut editor = support::open(game, &scratch);
    let (bribed, taunted) = (path("memory", "bribed"), path("memory", "taunted"));
    let mut frames = Frames::new(egui::vec2(1200.0, 900.0));
    frames.run(Vec::new(), |ui| {
        spreadsheet::show(&mut editor, ui, "memory")
    });
    editor.views.spreadsheet.state_mut("memory").selected =
        Some((bribed.clone(), "resets".to_owned()));

    let paste = vec![egui::Event::Paste("daily\nsometimes".to_owned())];
    frames.run(paste, |ui| spreadsheet::show(&mut editor, ui, "memory"));

    let resets = |editor: &mut Editor, memory: &str| {
        editor
            .read::<MemoryDef>(memory)
            .expect("a project")
            .expect("the memory reads")
            .resets
    };
    assert_eq!(resets(&mut editor, &bribed), Resets::Daily);
    assert_eq!(resets(&mut editor, &taunted), Resets::Never);
}

#[test]
fn a_map_keyed_by_files_shows_each_key_as_its_file_and_typing_never_renames_one() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(world_with_a_card(), &scratch);
    let world = WorldMap::Game.path();
    let mut form = RowFrames::new("world_map", &world);
    form.run(&mut editor, Vec::new());
    let shown = editor::tabs::shown_path(&support::area()).to_owned();
    let card = form.run(&mut editor, Vec::new()).at(&shown);

    form.type_into(&mut editor, card, "x");

    let map = world_map(&editor);
    let reader = editor.reader().expect("a project");
    let keys: Vec<Option<&str>> = map.cards.keys().map(|area| reader.path_of(*area)).collect();
    assert_eq!(keys, [Some(support::area().as_str())]);
}

#[test]
fn a_whole_number_field_refuses_a_fraction_instead_of_rounding_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(world_with_a_card(), &scratch);
    let world = WorldMap::Game.path();
    let mut form = RowFrames::new("world_map", &world);
    form.run(&mut editor, Vec::new());
    let size = form.run(&mut editor, Vec::new()).at("100");

    let drawn = form.type_into(&mut editor, size, "5.5");

    let sizes: Vec<u32> = world_map(&editor)
        .cards
        .values()
        .map(|card| card.size)
        .collect();
    assert_eq!(sizes, [100]);
    assert!(
        drawn.any(|text| text.contains("a whole number")),
        "{drawn:?}"
    );
}

#[test]
fn the_keys_walk_a_picker_list_past_what_it_shows_and_pick_what_they_reach() {
    let scratch = tempfile::tempdir().expect("scratch");
    let voice = json!([{ "type": "voice", "babble": path("babble", "crier") }]);
    let mut game = support::game().babble("crier");
    for index in 0..30 {
        game = game.npc(&format!("npc_{index:02}"), 10.0, voice.clone());
    }
    let game = game.row(
        "notification",
        "shout",
        json!({ "kind": { "type": "speech", "speaker": path("npc", "npc_00") }, "text": [] }),
    );
    let mut editor = support::open(game, &scratch);
    let mut form = RowFrames::new("notification", &path("notification", "shout"));
    form.run(&mut editor, Vec::new());
    let chip = form.run(&mut editor, Vec::new()).at("npc_00.npc");
    for events in click(chip) {
        form.run(&mut editor, events);
    }

    let mut drawn = Drawn::default();
    for events in std::iter::repeat_n(key(egui::Key::ArrowDown, egui::Modifiers::NONE), 20)
        .chain([Vec::new(), Vec::new()])
    {
        drawn = form.run(&mut editor, events);
    }
    form.run(&mut editor, key(egui::Key::Enter, egui::Modifiers::NONE));

    assert!(drawn.rect("npc_20.npc").is_some(), "{drawn:?}");
    let shout = editor
        .read::<NotificationDef>(&path("notification", "shout"))
        .expect("a project")
        .expect("the notification reads");
    let NotificationDefKind::Speech { speaker } = &shout.kind else {
        panic!("a speech");
    };
    let reader = editor.reader().expect("a project");
    assert_eq!(
        reader.path_of(*speaker),
        Some(path("npc", "npc_20").as_str())
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

/// The form of one row drawn frame after frame, as the editor draws it.
struct RowFrames {
    frames: Frames,
    table: String,
    key: String,
}

impl RowFrames {
    fn new(table: &str, key: &str) -> RowFrames {
        RowFrames {
            frames: Frames::new(egui::vec2(900.0, 1200.0)),
            table: table.to_owned(),
            key: key.to_owned(),
        }
    }

    fn run(&mut self, editor: &mut Editor, events: Vec<egui::Event>) -> Drawn {
        self.frames.run(events, |ui| {
            row_form::show_row(editor, ui, &self.table, &self.key)
        })
    }

    /// Clicks at `at`, types `text` over what is there and presses Enter, giving what the form
    /// draws once that settles.
    fn type_into(&mut self, editor: &mut Editor, at: egui::Pos2, text: &str) -> Drawn {
        for events in click(at).into_iter().chain([
            key(egui::Key::A, egui::Modifiers::COMMAND),
            vec![egui::Event::Text(text.to_owned())],
            key(egui::Key::Enter, egui::Modifiers::NONE),
            Vec::new(),
        ]) {
            self.run(editor, events);
        }
        self.run(editor, Vec::new())
    }
}

/// What the multi-row form of `keys` draws once a frame of `events` settles.
fn rows_form(editor: &mut Editor, table: &str, keys: &[String], events: Vec<egui::Event>) -> Drawn {
    let mut frames = Frames::new(egui::vec2(1200.0, 900.0));
    let mut drawn = Drawn::default();
    for events in [Vec::new(), Vec::new(), events, Vec::new(), Vec::new()] {
        drawn = frames.run(events, |ui| {
            row_form::show_rows_tab(editor, ui, table, keys)
        });
    }
    drawn
}

/// Clicks just below `label` in the multi-row form of `keys`, into the field it labels, types
/// `text` and presses Enter.
fn type_below(editor: &mut Editor, table: &str, keys: &[String], label: egui::Rect, text: &str) {
    let field = egui::pos2(label.left() + 20.0, label.bottom() + 12.0);
    let mut frames = Frames::new(egui::vec2(1200.0, 900.0));
    for events in [Vec::new(), Vec::new()]
        .into_iter()
        .chain(click(field))
        .chain([
            vec![egui::Event::Text(text.to_owned())],
            key(egui::Key::Enter, egui::Modifiers::NONE),
            Vec::new(),
            Vec::new(),
        ])
    {
        frames.run(events, |ui| {
            row_form::show_rows_tab(editor, ui, table, keys)
        });
    }
}
