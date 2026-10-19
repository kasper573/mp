use engine::core::content::{ErrorPlace, LoadReport};
use serde_json::json;
use testkit::Game;

use crate::support::game;

const PINNED: &str = include_str!("load_errors.txt");

#[test]
fn every_rule_names_its_file_line_pointer_and_nearest_value() {
    let report = game()
        .edit_settings(|settings| {
            settings["player"] = json!("heroo");
            settings["initial_spawn"]["x"] = json!(40.0);
            settings["initial_spawn"]["y"] = json!(40.0);
        })
        .sfx("slash")
        .row(
            "sfx",
            "splash",
            json!({ "file": "audio/splash.wav", "role": "sounds", "volume": 1.0, "pitch": 1.0 }),
        )
        .file("tables/class/apprentice.json", "{ \"name\": 3 }")
        .row(
            "area",
            "cove",
            json!({
                "name": "Cove",
                "map": { "size": { "width": 4, "height": 4 }, "tile": 16, "ground": ["ground"] },
            }),
        )
        .file(
            "tables/area/cove/palette.csv",
            "tileset,tile,flip\nstart_ground,0,\n",
        )
        .file(
            "tables/area/cove/ground.csv",
            "0,0,0,0\n0,0,7,0\n0,0,0,0\n0,0,0,0\n",
        )
        .file("tables/area/cove/walk.csv", "1,1,1,1\n".repeat(4))
        .row(
            "test_character",
            "lost",
            json!({
                "name": "Lost",
                "class": "hero",
                "known_areas": ["cove"],
                "start": { "area": "start", "x": 40.0, "y": 40.0 },
            }),
        )
        .try_load()
        .err()
        .expect("refused");

    let text = report.to_string();
    let body = text
        .split_once("\nresult   ")
        .map(|(_, body)| body)
        .expect("a result line");
    assert_eq!(
        body.trim_end(),
        PINNED.trim_end(),
        "the report text\n{text}"
    );
}

#[test]
fn a_malformed_palette_names_the_row_and_column_of_each_bad_cell() {
    let report = game()
        .row(
            "area",
            "cove",
            json!({
                "name": "Cove",
                "map": { "size": { "width": 4, "height": 4 }, "tile": 16, "ground": ["ground"] },
            }),
        )
        .file(
            "tables/area/cove/palette.csv",
            "tileset,tile,flip\nstart_ground,x,\nstart_ground,0,sideways\nstart_ground,0\n",
        )
        .file("tables/area/cove/ground.csv", "0,0,0,0\n".repeat(4))
        .file("tables/area/cove/walk.csv", "1,1,1,1\n".repeat(4))
        .try_load()
        .err()
        .expect("refused");

    let palette: Vec<(ErrorPlace, &str)> = report
        .errors
        .iter()
        .filter(|error| error.file == "tables/area/cove/palette.csv")
        .map(|error| (error.at.clone(), error.problem.expected.as_str()))
        .collect();
    assert_eq!(
        palette,
        vec![
            (ErrorPlace::Csv { row: 2, column: 2 }, "a tile number"),
            (
                ErrorPlace::Csv { row: 3, column: 3 },
                "empty, horizontal, vertical or both"
            ),
            (
                ErrorPlace::Csv { row: 4, column: 1 },
                "three fields: tileset,tile,flip"
            ),
        ]
    );
}

#[test]
fn a_bust_listed_before_the_generic_ones_is_placed_at_its_own_line() {
    let report = game()
        .busts("hero")
        .edit("model", "hero", |model| {
            let generic = model["modules"][0].take();
            let mut bust = json!({
                "type": "bust",
                "own": [{ "name": "Scar", "file": "busts/hero/scar.png" }],
            });
            for (expression, file) in generic.as_object().expect("a bust") {
                bust[expression] = file.clone();
            }
            model["modules"][0] = bust;
        })
        .try_load()
        .err()
        .expect("refused");

    let own = report
        .errors
        .iter()
        .find(|error| {
            error.file == "tables/model/hero.json" && error.problem.found.contains("scar.png")
        })
        .expect("the own bust is refused");
    assert_eq!(own.problem.rule, "missing file");
    assert!(
        matches!(&own.at, ErrorPlace::Json { pointer, .. } if pointer == "/modules/0/own/0/file"),
        "{:?}",
        own.at
    );
}

#[test]
fn a_binding_the_game_never_reads_for_its_action_is_refused() {
    let report = Game::new()
        .row(
            "input",
            "carry_item",
            json!({
                "label": "Carry an item",
                "bindings": [{ "type": "click", "button": "Left", "times": 1 }],
            }),
        )
        .whole()
        .try_load()
        .err()
        .expect("refused");

    assert_eq!(
        rules_in(&report, "tables/input/carry_item.json"),
        vec![("variant the engine never reads", "drag")]
    );
}

#[test]
fn a_basic_attack_that_costs_or_cools_down_is_refused() {
    let report = game()
        .sword()
        .item("ore", json!({ "kind": { "type": "resource" } }))
        .edit("skill", "strike", |strike| {
            strike["cost"] = json!([{ "item": "ore", "count": 1 }]);
            strike["cooldown"] = json!(2.0);
        })
        .try_load()
        .err()
        .expect("refused");

    assert_eq!(
        rules_in(&report, "tables/skill/strike.json"),
        vec![
            (
                "basic attack with a cost",
                "nothing: a click on an enemy must always answer"
            ),
            (
                "basic attack with a cooldown",
                "nothing: a click on an enemy must always answer"
            ),
        ]
    );
}

#[test]
fn a_fixture_shader_without_the_parameter_the_engine_sets_is_refused() {
    let report = Game::new()
        .shader("skill_area")
        .whole()
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/vfx_shader/skill_area.json")
        .expect("the shader row is refused");
    assert_eq!(error.problem.rule, "fixture entry missing");
    assert!(
        matches!(&error.at, ErrorPlace::Json { pointer, .. } if pointer == "/params"),
        "{:?}",
        error.at
    );
}

#[test]
fn a_shader_parameter_named_with_a_leading_underscore_is_refused() {
    let report = Game::new()
        .shader("tint")
        .edit("vfx_shader", "tint", |shader| {
            shader["params"] =
                json!([{ "name": "_color", "kind": "color", "default": [255, 255, 255, 255] }]);
        })
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/vfx_shader/tint.json")
        .expect("the shader row is refused");
    assert_eq!(error.problem.rule, "invalid parameter name");
}

#[test]
fn a_shader_that_does_not_compile_is_refused_at_its_line() {
    let report = Game::new()
        .shader("tint")
        .asset(
            "shaders/tint.wgsl",
            b"fn vfx(uv: vec2<f32>) -> vec4<f32> {\n    return oops;\n}\n".to_vec(),
        )
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "assets/shaders/tint.wgsl")
        .expect("the shader is refused");
    assert_eq!(error.problem.rule, "shader does not compile");
    assert!(
        matches!(error.at, ErrorPlace::Text { line: 2, .. }),
        "{:?}",
        error.at
    );
}

#[test]
fn a_shader_row_without_its_file_is_refused() {
    let report = Game::new()
        .shader("tint")
        .remove("assets/shaders/tint.wgsl")
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/vfx_shader/tint.json")
        .expect("the row is refused");
    assert_eq!(error.problem.rule, "shader file missing");
    assert_eq!(error.problem.expected, "assets/shaders/tint.wgsl");
}

#[test]
fn a_layer_filling_a_parameter_its_shader_lacks_is_refused() {
    let report = Game::new()
        .shader("tint")
        .edit("vfx_shader", "tint", |shader| {
            shader["params"] = json!([{ "name": "amount", "kind": "number", "default": 0.6, "min": 0.0, "max": 1.0 }]);
        })
        .row(
            "vfx",
            "healed",
            json!({
                "name": "Healed",
                "layers": [{
                    "type": "shader",
                    "shader": "tint",
                    "duration": 0.35,
                    "params": { "amount": 0.5, "glow": 1.0 },
                }],
            }),
        )
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/vfx/healed.json")
        .expect("the layer is refused");
    assert_eq!(error.problem.rule, "unknown shader parameter");
    assert!(
        matches!(&error.at, ErrorPlace::Json { pointer, .. } if pointer == "/layers/0/params/glow"),
        "{:?}",
        error.at
    );
}

#[test]
fn a_game_file_that_does_not_parse_is_refused_at_its_field() {
    let report = game()
        .edit_settings(|settings| settings["initial_spawn"] = json!("start"))
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "game.json")
        .unwrap_or_else(|| panic!("no error in game.json:\n{report}"));
    assert_eq!(error.problem.rule, "wrong type");
}

#[test]
fn a_folder_without_a_game_file_is_refused() {
    let report = Game::new()
        .remove("game.json")
        .whole()
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "game.json")
        .unwrap_or_else(|| panic!("no error for game.json:\n{report}"));
    assert_eq!(error.problem.rule, "missing file");
}

#[test]
fn a_fixture_without_its_row_is_refused() {
    let report = Game::new().whole().try_load().err().expect("refused");

    assert_eq!(
        rules_in(&report, "tables/input/interact.json"),
        vec![(
            "missing fixture",
            "one row for every input fixture the engine requires"
        )]
    );
}

#[test]
fn a_row_of_its_own_in_a_table_of_fixtures_alone_is_refused() {
    let report = Game::new()
        .row(
            "input",
            "wave_hello",
            json!({ "label": "Wave hello", "bindings": [] }),
        )
        .whole()
        .try_load()
        .err()
        .expect("refused");

    let error = report
        .errors
        .iter()
        .find(|error| error.file == "tables/input/wave_hello.json")
        .expect("the stray row is refused");
    assert_eq!(error.problem.rule, "row the engine never reads");
}

#[test]
fn a_class_tree_naming_a_skill_that_did_not_load_reports_only_the_skill() {
    let report = game()
        .row("skill", "broken", json!({ "name": "Broken", "icon": 3 }))
        .edit("class", "hero", |hero| {
            hero["tree"] = json!({ "broken": { "skill": "broken", "at": { "x": 0.0, "y": 0.0 } } });
        })
        .try_load()
        .err()
        .expect("refused");

    let files: Vec<&str> = report
        .errors
        .iter()
        .map(|error| error.file.as_str())
        .collect();
    assert!(files.contains(&"tables/skill/broken.json"), "{report}");
    assert!(!files.contains(&"tables/class/hero.json"), "{report}");
}

#[test]
fn a_game_of_only_what_the_engine_requires_loads_as_a_whole_one() {
    let loaded = game().engine_rows().whole().try_load();

    if let Err(report) = loaded {
        panic!("{report}");
    }
}

fn rules_in<'a>(report: &'a LoadReport, file: &str) -> Vec<(&'a str, &'a str)> {
    report
        .errors
        .iter()
        .filter(|error| error.file == file)
        .map(|error| (error.problem.rule, error.problem.expected.as_str()))
        .collect()
}
