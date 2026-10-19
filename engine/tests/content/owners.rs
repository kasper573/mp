use engine::core::content::{ContentOwners, LoadReport, RowName, write};
use engine::systems::actor::model::ModelDef;
use serde_json::json;
use testkit::Map;

use crate::support::game;

#[test]
fn a_local_row_loads_into_its_table_and_names_its_owner() {
    let content = game()
        .npc("wren", 10.0, json!([]))
        .own("model", "wren", "npc/wren")
        .load();

    assert!(content.by_key::<ModelDef>("wren").is_some());
    assert_eq!(
        content.owners().owner("model", "wren"),
        Some(&RowName::new("npc", "wren"))
    );
    assert!(!content.owners().is_local("npc", "wren"));
}

#[test]
fn a_row_reaches_the_rows_local_to_each_of_its_owners() {
    let content = game()
        .npc("wren", 10.0, json!([]))
        .own("npc", "wren", "area/start")
        .own("model", "wren", "area/start")
        .load();

    let chain: Vec<String> = content
        .owners()
        .chain("model", "wren")
        .map(RowName::to_string)
        .collect();
    assert_eq!(chain, vec!["area/start"]);
}

#[test]
fn a_row_local_to_a_sibling_is_out_of_reach() {
    let report = game()
        .npc("wren", 10.0, json!([]))
        .npc("tobb", 10.0, json!([]))
        .own("model", "tobb", "npc/tobb")
        .edit("npc", "wren", |wren| wren["model"] = json!("tobb"))
        .try_load()
        .err()
        .expect("refused");

    let error = only_error_in(&report, "tables/npc/wren.json");
    assert_eq!(error.0, "out of reach");
    assert_eq!(error.1, "\"tobb\", local to npc/tobb");
    assert_eq!(error.2, "a global model row or one local to npc/wren");
}

#[test]
fn the_game_settings_reach_only_global_rows() {
    let report = game()
        .own("player", "hero", "area/start")
        .try_load()
        .err()
        .expect("refused");

    let error = only_error_in(&report, "game.json");
    assert_eq!(error.0, "out of reach");
    assert_eq!(error.2, "a global player row");
}

#[test]
fn rows_that_see_every_row_may_name_local_ones() {
    let loaded = game()
        .own("class", "hero", "player/hero")
        .row(
            "test_character",
            "veteran",
            json!({
                "name": "Veteran",
                "class": "hero",
                "known_areas": ["start"],
                "start": { "area": "start", "x": 1.0, "y": 1.0 },
            }),
        )
        .try_load();

    if let Err(report) = loaded {
        panic!("{report}");
    }
}

#[test]
fn an_owner_that_is_not_a_row_is_refused_with_the_nearest() {
    let report = game()
        .npc("wren", 10.0, json!([]))
        .own("model", "wren", "npc/wern")
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/model/wren.json")
        .expect("the row is refused");
    assert_eq!(error.problem.rule, "unknown owner");
    assert_eq!(error.at.pointer(), "/owner");
    assert_eq!(error.problem.nearest.as_deref(), Some("\"npc/wren\""));
}

#[test]
fn owners_that_lead_round_in_a_loop_are_refused() {
    let report = game()
        .npc("wren", 10.0, json!([]))
        .npc("tobb", 10.0, json!([]))
        .own("npc", "wren", "npc/tobb")
        .own("npc", "tobb", "npc/wren")
        .try_load()
        .err()
        .expect("refused");

    let error = only_error_in(&report, "tables/npc/wren.json");
    assert_eq!(error.0, "owner loop");
    assert_eq!(error.1, "npc/wren → npc/tobb → npc/wren");
}

#[test]
fn a_fixture_row_with_an_owner_is_refused() {
    let report = game()
        .engine_rows()
        .own("input", "interact", "area/start")
        .whole()
        .try_load()
        .err()
        .expect("refused");

    let error = only_error_in(&report, "tables/input/interact.json");
    assert_eq!(error.0, "fixture with an owner");
}

#[test]
fn a_written_local_row_names_its_owner_first() {
    let content = game()
        .npc("wren", 10.0, json!([]))
        .own("model", "wren", "npc/wren")
        .load();
    let out = tempfile::tempdir().expect("a temp dir");

    write(testkit::Game::new().registry(), content, out.path()).expect("written");

    let written = std::fs::read_to_string(out.path().join("tables/model/wren.json")).expect("read");
    assert!(
        written.starts_with("{\n  \"owner\": \"npc/wren\",\n"),
        "{written}"
    );
}

#[test]
fn an_owner_set_after_loading_moves_the_row_and_what_it_holds() {
    let island = RowName::new("area", "island");
    let forest = RowName::new("area", "forest");
    let wren = RowName::new("npc", "wren");
    let quest = RowName::new("quest", "bone_tithe");
    let mut owners = ContentOwners::new([
        (wren.clone(), island.clone()),
        (quest.clone(), wren.clone()),
    ]);
    owners.set(&wren, Some(forest.clone()));
    assert_eq!(owners.held_by(&island), []);
    assert_eq!(owners.held_within(&forest), [wren.clone(), quest.clone()]);
    assert!(!owners.in_reach(Some(&forest), "quest", "bone_tithe"));
    assert!(owners.in_reach(Some(&quest), "npc", "wren"));
    owners.set(&wren, None);
    assert_eq!(owners.owner("npc", "wren"), None);
    assert_eq!(owners.len(), 1);
}

#[test]
fn a_palette_reaches_only_the_tilesets_its_area_reaches() {
    let report = game()
        .area("other", &Map::of(&[".."]), json!([]))
        .own("tileset", "start_ground", "area/other")
        .try_load()
        .err()
        .expect("refused");

    let error = only_error_in(&report, "tables/area/start/palette.csv");
    assert_eq!(error.0, "out of reach");
    assert_eq!(error.1, "\"start_ground\", local to area/other");
}

#[test]
fn a_blueprint_part_reaches_only_what_its_blueprint_reaches() {
    let rock = || {
        game()
            .row(
                "blueprint",
                "rock",
                json!({ "parts": [
                    { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "start_ground", "tiles": [[0]] }
                ] }),
            )
            .own("tileset", "start_ground", "area/start")
    };
    let local = rock().own("blueprint", "rock", "area/start");

    let report = rock().try_load().err().expect("refused");

    let error = only_error_in(&report, "tables/blueprint/rock.json");
    assert_eq!(error.0, "out of reach");
    assert_eq!(
        error.2,
        "a global tileset row or one local to blueprint/rock"
    );
    local.load();
}

fn only_error_in<'a>(report: &'a LoadReport, file: &str) -> (&'a str, &'a str, &'a str) {
    let errors: Vec<_> = report
        .errors
        .iter()
        .filter(|error| error.file == file)
        .collect();
    assert_eq!(errors.len(), 1, "{report}");
    let problem = &errors[0].problem;
    (problem.rule, &problem.found, &problem.expected)
}
