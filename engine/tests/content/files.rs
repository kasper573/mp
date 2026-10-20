use engine::core::content::{LoadReport, SETTINGS_FILE};
use engine::systems::npc::NpcDef;
use serde_json::json;
use testkit::{Game, path, png};

use crate::support::game;

#[test]
fn content_loads_from_any_folder_and_is_named_by_its_path() {
    let content = game()
        .file(
            "world/forest/npcs/orc.npc.json",
            npc_fields("Orc", &path("model", "hero")),
        )
        .file("world/forest/notes.md", "Orcs live here.")
        .load();

    let orc = content
        .by_path::<NpcDef>("world/forest/npcs/orc.npc.json")
        .expect("the orc");
    assert_eq!(orc.name(&content), "orc");
    assert_eq!(orc.get(&content).name, "Orc");
}

#[test]
fn a_file_of_no_known_type_is_refused_naming_the_nearest_type() {
    let report = refused(game().file("orc.ncp.json", "{}"));

    let error = only(&report, "orc.ncp.json");
    assert_eq!(error.0, "unknown type");
    assert_eq!(error.1.as_deref(), Some("\"npc\""));
}

#[test]
fn a_file_that_is_no_content_media_or_note_is_refused() {
    let report = refused(game().file("todo.txt", "later"));

    assert_eq!(only(&report, "todo.txt").0, "unknown file");
}

#[test]
fn the_settings_anywhere_but_their_place_are_refused_saying_where_they_belong() {
    let report = refused(game().file("game.json", "{}"));

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "game.json")
        .unwrap_or_else(|| panic!("{report}"));
    assert_eq!(error.problem.rule, "unknown file");
    assert!(error.problem.expected.contains(SETTINGS_FILE), "{report}");
}

#[test]
fn a_name_a_disk_or_a_url_would_change_is_refused() {
    for name in [
        "Orc.npc.json",
        "big orc.npc.json",
        "con.npc.json",
        "-orc.npc.json",
    ] {
        let report = refused(game().file(name, npc_fields("Orc", &path("model", "hero"))));

        assert_eq!(only(&report, name).0, "invalid name", "{name}");
    }
}

#[test]
fn a_numbered_name_is_a_valid_name() {
    let content = game()
        .file(
            "orc (2).npc.json",
            npc_fields("Orc", &path("model", "hero")),
        )
        .load();

    assert!(content.by_path::<NpcDef>("orc (2).npc.json").is_some());
}

#[test]
fn names_that_differ_only_by_case_clash() {
    let report = refused(game().file("caves/a.md", "one").file("Caves/b.md", "two"));

    let rules: Vec<&str> = report
        .errors
        .iter()
        .map(|error| error.problem.rule)
        .collect();
    assert!(rules.contains(&"case clash"), "{report}");
}

#[test]
fn a_folder_with_a_dot_that_no_bundle_type_names_is_refused() {
    let report = refused(game().file("old.stuff/a.md", "notes"));

    assert_eq!(only(&report, "old.stuff").0, "unknown type");
}

#[test]
fn a_bundle_type_kept_as_one_file_is_refused() {
    let report = refused(game().file("lamp.model.json", "{}"));

    assert_eq!(
        only(&report, "lamp.model.json").0,
        "bundle kept as one file"
    );
}

#[test]
fn a_json_type_kept_as_a_folder_is_refused() {
    let report = refused(game().file("orc.npc/config.json", "{}"));

    assert_eq!(only(&report, "orc.npc").0, "folder with a dot");
}

#[test]
fn hidden_files_are_left_alone() {
    game()
        .file(".git/HEAD", "ref: refs/heads/main")
        .file("world/.DS_Store", "")
        .load();
}

#[test]
fn a_bundles_part_is_never_named_from_outside_it() {
    let report = refused(game().edit("class", "hero", |hero| {
        hero["icon"] = json!(format!("{}/sprites.png", path("model", "hero")));
    }));

    assert_eq!(only(&report, "hero.class.json").0, "part of a bundle");
}

#[test]
fn media_is_named_by_its_path_from_the_game_folder() {
    let content = game()
        .asset("art/icons/axe.png", png(1, 1))
        .edit("class", "hero", |hero| {
            hero["icon"] = json!("art/icons/axe.png")
        })
        .load();

    assert!(content.files().media.contains("art/icons/axe.png"));
}

fn npc_fields(name: &str, model: &str) -> Vec<u8> {
    serde_json::to_vec_pretty(&json!({
        "name": name,
        "model": model,
        "stats": testkit::stats(10.0),
    }))
    .expect("json")
}

fn refused(game: Game) -> LoadReport {
    game.try_load().err().expect("refused")
}

/// The rule and nearest value of the one problem with `file`.
fn only<'a>(report: &'a LoadReport, file: &str) -> (&'a str, Option<String>) {
    let errors: Vec<_> = report
        .errors
        .iter()
        .filter(|error| error.file == file)
        .collect();
    assert_eq!(errors.len(), 1, "{report}");
    (errors[0].problem.rule, errors[0].problem.nearest.clone())
}
