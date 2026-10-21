use editor::app::{Editor, ModalDialog};
use editor::moves;
use editor::project::MovedOutside;
use editor::project::watch::FolderChange;
use editor::rows::{self, UsageDecision};
use editor::ui::content_tree;
use editor::ui::tree::TreeRow;
use editor::user::{TreeView, UserFolder};
use editor::views::area::pins;
use engine::core::content::Fixture;
use engine::core::content::{FIXTURES_DIR, parent_of, table_of};
use engine::systems::area::AreaDef;
use engine::systems::area::world_map::{WorldMap, WorldMapDef};
use engine::systems::registry;
use serde_json::json;
use testkit::{Game, path, png};

use crate::support::{self, Drawn, Frames, area, click};

/// A game with an orc living in the start, a pew blueprint and its tileset, a note, and an icon
/// kept in a folder of its own.
fn camp() -> Game {
    let pew = json!([
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": path("tileset", "wood"), "tiles": [[0]] }
    ]);
    support::game()
        .npc("orc", 10.0, json!([]))
        .row("tileset", "wood", json!({ "tile": 16, "tiles": {} }))
        .part("tileset", "wood", "image.png", png(16, 16))
        .blueprint("pew", (1, 1), json!({}), pew)
        .asset("icons/cap.png", png(16, 16))
        .file("README.md", b"# Camp".to_vec())
        .edit_scene("area", support::AREA, |scene| {
            scene.as_array_mut().expect("a scene").push(
                json!({ "type": "resident", "npc": path("npc", "orc"), "at": { "x": 2.0, "y": 2.0 } }),
            );
        })
}

fn names(rows: &[(String, TreeRow)]) -> Vec<String> {
    rows.iter()
        .map(|(_, row)| {
            let suffix = row
                .suffix
                .as_ref()
                .map_or("", |(suffix, _)| suffix.as_str());
            format!("{}{suffix}", row.name)
        })
        .collect()
}

fn view(editor: &mut Editor) -> &mut TreeView {
    let root = editor.project.as_ref().expect("a project").root.clone();
    editor
        .settings
        .content_trees
        .entry(UserFolder::folder_key(&root))
        .or_default()
}

#[test]
fn a_folder_lists_its_folders_first_then_its_files_each_by_name() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    rows::new_folder(&mut editor, "").expect("a folder");
    rows::rename(&mut editor, "folder", "zeta").expect("renamed");

    let listed = content_tree::listed(&editor, "");

    let folders: Vec<&str> = listed
        .iter()
        .take_while(|(_, row)| row.folder)
        .map(|(path, _)| path.as_str())
        .collect();
    let mut sorted = folders.clone();
    sorted.sort();
    assert_eq!(folders, sorted);
    for folder in [FIXTURES_DIR, "icons", "zeta"] {
        assert!(folders.contains(&folder), "{folders:?}");
    }
    let files: Vec<String> = listed[folders.len()..]
        .iter()
        .map(|(path, _)| path.to_lowercase())
        .collect();
    let mut sorted = files.clone();
    sorted.sort();
    assert_eq!(files, sorted);
    assert!(listed[folders.len()..].iter().all(|(_, row)| !row.folder));
}

#[test]
fn a_content_file_reads_as_its_name_and_type_and_a_bundle_as_one_file() {
    let scratch = tempfile::tempdir().expect("scratch");
    let editor = support::open(camp(), &scratch);

    let listed = names(&content_tree::listed(&editor, ""));

    assert!(listed.contains(&"orc.npc".to_owned()), "{listed:?}");
    assert!(listed.contains(&"pew.blueprint".to_owned()), "{listed:?}");
    assert!(listed.contains(&"README.md".to_owned()), "{listed:?}");
    assert!(
        listed.iter().all(|name| !name.contains("scene")),
        "{listed:?}"
    );
    assert!(
        content_tree::listed(&editor, &path("blueprint", "pew")).is_empty(),
        "a bundle's parts never show"
    );
}

#[test]
fn a_folder_counts_its_files_at_any_depth_a_bundle_counting_as_one() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let kit = rows::new_folder(&mut editor, "").expect("a folder");
    rows::move_into(&mut editor, &[path("blueprint", "pew")], &kit).expect("moved");
    let inner = rows::new_folder(&mut editor, &kit).expect("a folder");
    let cap = ["icons/cap.png".to_owned()];
    rows::copy_into(&mut editor, &cap, &kit, "Copy".to_owned()).expect("copied");
    rows::copy_into(&mut editor, &cap, &inner, "Copy".to_owned()).expect("copied");
    support::files(&mut editor);

    let top = content_tree::listed(&editor, "");
    let (_, row) = top
        .iter()
        .find(|(path, _)| *path == kit)
        .expect("the new folder");

    assert_eq!(row.detail, "3");
}

#[test]
fn searching_lists_the_hits_under_the_folders_above_them_in_grey() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    editor.content_tree.search = "cap".to_owned();

    let top = content_tree::listed(&editor, "");
    let inside = content_tree::listed(&editor, "icons");

    assert_eq!(names(&top), ["icons"]);
    assert!(top[0].1.dim);
    assert_eq!(names(&inside), ["cap.png"]);
    assert!(!inside[0].1.dim);
}

#[test]
fn show_narrows_the_tree_to_the_kinds_ticked_and_can_drop_folders_left_empty() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let kinds: Vec<String> = editor
        .shapes
        .order
        .iter()
        .filter(|table| table.as_str() != "npc")
        .cloned()
        .chain(["media".to_owned(), "notes".to_owned()])
        .collect();
    view(&mut editor).hidden_kinds = kinds.into_iter().collect();

    let kept = content_tree::listed(&editor, "");
    assert!(kept.iter().any(|(path, _)| path == "icons"));
    assert!(names(&kept).contains(&"orc.npc".to_owned()));
    assert!(!names(&kept).contains(&"README.md".to_owned()));

    view(&mut editor).hide_empty_folders = true;
    let shown = content_tree::listed(&editor, "");
    assert!(shown.iter().all(|(path, _)| path != "icons"));
    assert!(
        shown
            .iter()
            .all(|(path, row)| row.folder || table_of(path) == Some("npc")),
        "{:?}",
        names(&shown)
    );
}

#[test]
fn a_missing_fixture_shows_where_it_belongs_and_making_it_writes_its_default() {
    let fixture = registry()
        .fixture_paths()
        .find(|path| table_of(path) == Some("sfx"))
        .expect("an sfx fixture")
        .to_owned();
    let mut game = camp();
    for part in ["config.json", "clip.wav", "clip.ogg"] {
        let file = format!("{fixture}/{part}");
        if game.folder().files.contains_key(&file) {
            game = game.remove(&file);
        }
    }
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open_as_is(game, &scratch);

    let listed = content_tree::listed(&editor, parent_of(&fixture));
    let (_, row) = listed
        .iter()
        .find(|(path, _)| *path == fixture)
        .expect("a placeholder where the fixture belongs");
    assert!(row.dim);
    assert!(row.problem.is_some());

    rows::make_fixture(&mut editor, &fixture).expect("made");
    assert!(
        support::settled(&mut editor)
            .files
            .index()
            .is_content(&fixture)
    );
}

#[test]
fn new_makes_the_type_at_once_numbered_past_a_taken_name_with_its_name_up_for_typing() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);

    content_tree::new_file(&mut editor, "icons", "npc");
    content_tree::new_file(&mut editor, "icons", "npc");

    let made = "icons/npc (1).npc.json";
    assert!(support::files(&mut editor).contains("icons/npc.npc.json"));
    assert!(support::files(&mut editor).contains(made));
    assert_eq!(editor.content_tree.tree.renaming(), Some(made));
    editor.undo();
    assert!(!support::files(&mut editor).contains(made));
    assert!(support::files(&mut editor).contains("icons/npc.npc.json"));
}

#[test]
fn pasting_a_folder_copies_all_it_holds_beside_it_under_a_free_name() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);

    let copies = rows::copy_into(&mut editor, &["icons".to_owned()], "", "Paste".to_owned())
        .expect("pasted");

    assert_eq!(copies, ["icons (1)"]);
    assert!(support::files(&mut editor).contains("icons (1)/cap.png"));
    assert!(support::files(&mut editor).contains("icons/cap.png"));
}

#[test]
fn a_duplicated_area_gets_its_own_card_beside_the_original_on_the_world_map() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = camp().edit("world_map", WorldMap::Game.name(), |map| {
        map["cards"] = json!({ area(): { "at": { "x": 0.0, "y": 0.0 }, "size": 100 } });
    });
    let mut editor = support::open(game, &scratch);

    let copy = rows::duplicate(&mut editor, &area()).expect("duplicated");

    let reader = editor.reader().expect("a reader");
    let map = editor
        .read::<WorldMapDef>(&WorldMap::Game.path())
        .expect("a project")
        .expect("the world map reads");
    let card = |path: &str| {
        let id = reader.id_of::<AreaDef>(path).expect("an area");
        map.cards.get(&id).cloned().expect("a card")
    };
    let (original, copied) = (card(&area()), card(&copy));
    assert_eq!(copied.size, original.size);
    assert!(
        copied.at.x > original.at.x,
        "the copy's card lies right of the original's"
    );
}

#[test]
fn moving_a_file_into_a_folder_rewrites_what_names_it_in_one_undo_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let orc = path("npc", "orc");

    rows::move_into(&mut editor, std::slice::from_ref(&orc), "icons").expect("moved");

    assert_eq!(support::residents(&mut editor), [format!("icons/{orc}")]);
    support::settled(&mut editor);
    editor.undo();
    assert_eq!(support::residents(&mut editor), std::slice::from_ref(&orc));
    assert!(support::files(&mut editor).contains(&orc));
}

#[test]
fn deleting_a_file_can_point_what_named_it_at_another_in_one_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp().npc("goblin", 8.0, json!([])), &scratch);
    let (orc, goblin) = (path("npc", "orc"), path("npc", "goblin"));

    rows::delete_dialog(&mut editor, vec![orc.clone()]);
    let Some(ModalDialog::Delete(mut dialog)) = editor.dialogs.pop() else {
        panic!("a delete dialog");
    };
    for group in &mut dialog.groups {
        group.decision = UsageDecision::Repoint(goblin.clone());
    }
    rows::delete(&mut editor, &dialog).expect("deleted");

    assert!(!support::files(&mut editor).contains(&orc));
    assert_eq!(support::residents(&mut editor), [goblin]);
    support::settled(&mut editor);
}

#[test]
fn deleting_files_removes_exactly_the_entries_that_named_them_wherever_they_sit() {
    let scratch = tempfile::tempdir().expect("scratch");
    let names: Vec<String> = (0..12).map(|n| format!("villager_{n}")).collect();
    let game = names.iter().fold(camp(), |game, name| {
        game.npc(name, 5.0, json!([])).edit_scene("area", support::AREA, |scene| {
            scene.as_array_mut().expect("a scene").push(
                json!({ "type": "resident", "npc": path("npc", name), "at": { "x": 3.0, "y": 3.0 } }),
            );
        })
    });
    let mut editor = support::open(game, &scratch);
    let before = support::residents(&mut editor);
    // Entries past the ninth are where ordering them by text and by number part ways.
    let gone = [path("npc", "villager_7"), path("npc", "villager_8")];

    rows::delete_dialog(&mut editor, gone.to_vec());
    let Some(ModalDialog::Delete(mut dialog)) = editor.dialogs.pop() else {
        panic!("a delete dialog");
    };
    for group in &mut dialog.groups {
        group.decision = UsageDecision::Remove;
    }
    rows::delete(&mut editor, &dialog).expect("deleted");

    let kept: Vec<String> = before
        .into_iter()
        .filter(|named| !gone.contains(named))
        .collect();
    assert_eq!(support::residents(&mut editor), kept);
    support::settled(&mut editor);
}

#[test]
fn deleting_a_file_refuses_to_point_what_named_it_where_the_game_would_refuse_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let crier = path("npc", "crier");
    let game = camp()
        .babble("crier")
        .npc(
            "crier",
            8.0,
            json!([{ "type": "voice", "babble": path("babble", "crier") }]),
        )
        .row(
            "notification",
            "call",
            json!({ "kind": { "type": "speech", "speaker": crier }, "text": ["Hear ye!"] }),
        );
    let mut editor = support::open(game, &scratch);

    rows::delete_dialog(&mut editor, vec![crier.clone()]);
    let Some(ModalDialog::Delete(mut dialog)) = editor.dialogs.pop() else {
        panic!("a delete dialog");
    };
    for group in &mut dialog.groups {
        group.decision = UsageDecision::Repoint(path("npc", "orc"));
    }
    let refused = rows::delete(&mut editor, &dialog);

    assert!(
        refused
            .as_ref()
            .is_err_and(|reason| reason.contains("voice")),
        "{refused:?}"
    );
    assert!(support::files(&mut editor).contains(&crier));
    assert!(editor.project.as_ref().expect("a project").loads());
}

#[test]
fn a_fixture_never_moves() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let fixture = registry()
        .fixture_paths()
        .next()
        .expect("a fixture")
        .to_owned();

    let moved = rows::move_into(&mut editor, std::slice::from_ref(&fixture), "icons");

    assert!(moved.is_err_and(|refusal| refusal.contains("stays")));
    assert!(support::files(&mut editor).index().is_content(&fixture));
}

#[test]
fn a_file_moved_on_disk_breaks_what_names_it_until_it_is_pointed_there_in_one_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let root = editor.project.as_ref().expect("a project").root.clone();
    let orc = path("npc", "orc");
    let moved = format!("icons/{orc}");
    std::fs::rename(root.join(&orc), root.join(&moved)).expect("moved by hand");

    let project = editor.project.as_mut().expect("a project");
    project.outside_changes(FolderChange::Files(vec![orc.clone(), moved.clone()]));

    assert!(!project.loads());
    assert!(
        !project.broken_on_disk(),
        "a move alone leaves the editor open"
    );
    assert_eq!(
        project.moved_outside,
        [MovedOutside {
            from: orc.clone(),
            to: moved.clone(),
            references: 1
        }]
    );
    let shown = content_tree::listed(&editor, "");
    let (_, start) = shown
        .iter()
        .find(|(path, _)| *path == area())
        .expect("the start");
    assert!(
        start.problem.is_some(),
        "what names the moved file shows it"
    );

    let found = editor
        .project
        .as_ref()
        .expect("a project")
        .moved_outside
        .clone();
    assert_eq!(moves::repoint(&mut editor, &found), Ok(1));
    assert_eq!(support::residents(&mut editor), [moved]);
    assert!(support::settled(&mut editor).moved_outside.is_empty());
    editor.undo();
    let scene = support::files(&mut editor)
        .text(&format!("{}/scene.json", area()))
        .expect("the scene");
    assert!(
        scene.contains(&format!("\"{orc}\"")),
        "undo names the moved file where it was again: {scene}"
    );
}

#[test]
fn a_folder_moved_on_disk_is_followed_file_by_file_and_said_to_be_a_folder() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(
        camp().item("cap", json!({ "kind": { "type": "resource" } })),
        &scratch,
    );
    let root = editor.project.as_ref().expect("a project").root.clone();
    std::fs::create_dir_all(root.join("kit")).expect("a folder");
    std::fs::rename(root.join("icons"), root.join("kit/icons")).expect("moved by hand");

    let project = editor.project.as_mut().expect("a project");
    project.outside_changes(FolderChange::Files(vec![
        "icons".to_owned(),
        "kit".to_owned(),
    ]));

    assert!(project.files.contains("kit/icons/cap.png"));
    assert!(!project.files.contains("icons/cap.png"));
    assert!(!project.broken_on_disk());
    let moved = project.moved_outside.clone();
    assert!(
        moved
            .iter()
            .any(|step| step.from == "icons/cap.png" && step.to == "kit/icons/cap.png")
    );
    let summary = moves::moved_outside_summary(&moved, &project.files.index());
    assert!(
        summary.starts_with("A folder moved on disk, icons to kit/icons"),
        "{summary}"
    );
    moves::repoint(&mut editor, &moved).expect("pointed");
    support::files(&mut editor);
    assert!(editor.project.as_ref().expect("a project").loads());
}

#[test]
fn a_click_anywhere_on_a_folder_row_opens_or_closes_it_once() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let mut frames = Frames::new(egui::vec2(TREE_WIDTH, 600.0));
    let name = frames
        .run(Vec::new(), |ui| content_tree::show(&mut editor, ui))
        .rect("icons")
        .expect("the icons folder is drawn");

    for x in [2.0, TREE_WIDTH / 2.0, ROW_END - 2.0] {
        let was_open = view(&mut editor).open.contains("icons");
        for events in click(egui::pos2(x, name.center().y)) {
            frames.run(events, |ui| content_tree::show(&mut editor, ui));
        }
        assert_ne!(
            view(&mut editor).open.contains("icons"),
            was_open,
            "a click at x {x} toggles the folder once"
        );
    }
}

const TREE_WIDTH: f32 = 320.0;
/// Where the panel's margin starts, past the right end of every row.
const ROW_END: f32 = TREE_WIDTH - 8.0;

#[test]
fn a_card_on_the_world_map_is_called_by_its_file_name_not_its_path() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(camp(), &scratch);
    let mut frames = Frames::new(egui::vec2(1200.0, 900.0));
    let mut drawn = Drawn::default();
    for _ in 0..3 {
        drawn = frames.run(Vec::new(), |ui| editor::views::world::show(&mut editor, ui));
    }

    assert!(drawn.rect(support::AREA).is_some(), "{drawn:?}");
    assert!(drawn.rect(&area()).is_none(), "{drawn:?}");
}

#[test]
fn an_arrival_into_an_area_is_called_by_the_file_and_object_leading_there_not_their_paths() {
    let scratch = tempfile::tempdir().expect("scratch");
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
        "scripts": [{
            "script": path("script", "warp"),
            "values": { "to": { "area": area(), "x": 1.0, "y": 1.0 } }
        }]
    }]);
    let game =
        support::game()
            .row("script", "warp", warp)
            .area("hall", &testkit::Map::open(4, 4), door);
    let editor = support::open(game, &scratch);

    let names: Vec<(String, Option<String>)> = pins::arrivals(&editor, &area())
        .iter()
        .filter(|arrival| !arrival.initial_spawn)
        .map(|arrival| arrival.names(&editor))
        .collect();

    assert_eq!(names, [("hall".to_owned(), Some("door".to_owned()))]);
}
