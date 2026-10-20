use std::sync::Arc;

use editor::app::Editor;
use editor::moves;
use editor::project::watch::FolderChange;
use editor::project::{MovedOutside, Project, ProjectFiles};
use editor::rows;
use editor::schema::SchemaShapes;
use editor::ui::content_tree;
use editor::ui::tree::TreeRow;
use editor::user::{EditorSettings, TreeView, UserFolder};
use engine::core::content::{FIXTURES_DIR, parent_of, table_of};
use engine::systems::registry;
use serde_json::json;
use testkit::{Game, path, png};

use crate::support::{self, area};

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

fn files(editor: &mut Editor) -> &ProjectFiles {
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    &project.files
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
    let mut editor = open(camp(), &scratch);
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
    let editor = open(camp(), &scratch);

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
    let mut editor = open(camp(), &scratch);
    let kit = rows::new_folder(&mut editor, "").expect("a folder");
    rows::move_into(&mut editor, &[path("blueprint", "pew")], &kit).expect("moved");
    let inner = rows::new_folder(&mut editor, &kit).expect("a folder");
    let cap = ["icons/cap.png".to_owned()];
    rows::copy_into(&mut editor, &cap, &kit, "Copy".to_owned()).expect("copied");
    rows::copy_into(&mut editor, &cap, &inner, "Copy".to_owned()).expect("copied");
    files(&mut editor);

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
    let mut editor = open(camp(), &scratch);
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
    let mut editor = open(camp(), &scratch);
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
    let folder = scratch.path().join("game");
    game.write_to(&folder);
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    project.settle();
    editor.project = Some(project);

    let listed = content_tree::listed(&editor, parent_of(&fixture));
    let (_, row) = listed
        .iter()
        .find(|(path, _)| *path == fixture)
        .expect("a placeholder where the fixture belongs");
    assert!(row.dim);
    assert!(row.problem.is_some());

    rows::make_fixture(&mut editor, &fixture).expect("made");
    let project = editor.project.as_mut().expect("a project");
    project.settle();
    assert!(project.files.index().is_content(&fixture));
}

#[test]
fn new_makes_the_type_at_once_numbered_past_a_taken_name_with_its_name_up_for_typing() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);

    content_tree::new_file(&mut editor, "icons", "npc");
    content_tree::new_file(&mut editor, "icons", "npc");

    let made = "icons/npc (1).npc.json";
    assert!(files(&mut editor).contains("icons/npc.npc.json"));
    assert!(files(&mut editor).contains(made));
    assert_eq!(editor.content_tree.tree.renaming(), Some(made));
    editor.undo();
    assert!(!files(&mut editor).contains(made));
    assert!(files(&mut editor).contains("icons/npc.npc.json"));
}

#[test]
fn pasting_a_folder_copies_all_it_holds_beside_it_under_a_free_name() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);

    let copies = rows::copy_into(&mut editor, &["icons".to_owned()], "", "Paste".to_owned())
        .expect("pasted");

    assert_eq!(copies, ["icons (1)"]);
    assert!(files(&mut editor).contains("icons (1)/cap.png"));
    assert!(files(&mut editor).contains("icons/cap.png"));
}

#[test]
fn moving_a_file_into_a_folder_rewrites_what_names_it_in_one_undo_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let orc = path("npc", "orc");
    let resident = || format!("{}/scene.json", area());

    rows::move_into(&mut editor, std::slice::from_ref(&orc), "icons").expect("moved");

    let scene = files(&mut editor).json(&resident()).expect("the scene");
    assert_eq!(scene[1]["npc"], format!("icons/{orc}"));
    assert!(editor.project.as_ref().expect("a project").loads());
    editor.undo();
    let scene = files(&mut editor).json(&resident()).expect("the scene");
    assert_eq!(scene[1]["npc"], orc);
    assert!(files(&mut editor).contains(&orc));
}

#[test]
fn a_fixture_never_moves() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
    let fixture = registry()
        .fixture_paths()
        .next()
        .expect("a fixture")
        .to_owned();

    let moved = rows::move_into(&mut editor, std::slice::from_ref(&fixture), "icons");

    assert!(moved.is_err_and(|refusal| refusal.contains("stays")));
    assert!(files(&mut editor).index().is_content(&fixture));
}

#[test]
fn a_file_moved_on_disk_breaks_what_names_it_until_it_is_pointed_there_in_one_step() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(camp(), &scratch);
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
    let scene = files(&mut editor)
        .json(&format!("{}/scene.json", area()))
        .expect("the scene");
    assert_eq!(scene[1]["npc"], moved);
    let project = editor.project.as_ref().expect("a project");
    assert!(project.loads());
    assert!(project.moved_outside.is_empty());
    editor.undo();
    let scene = files(&mut editor)
        .json(&format!("{}/scene.json", area()))
        .expect("the scene");
    assert_eq!(scene[1]["npc"], orc);
}

#[test]
fn a_folder_moved_on_disk_is_followed_file_by_file_and_said_to_be_a_folder() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(
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
    files(&mut editor);
    assert!(editor.project.as_ref().expect("a project").loads());
}
