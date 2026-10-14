use game::core::content::ErrorPlace;
use serde_json::json;

use crate::support::{TempFolder, load};

const PINNED: &str = include_str!("load_errors.txt");

#[test]
fn every_rule_names_its_file_line_pointer_and_nearest_value() {
    let folder = TempFolder::of_template();
    folder.edit("game.json", |game| {
        game["player"] = json!("adventurr");
        game["initial_spawn"]["x"] = json!(40.0);
        game["initial_spawn"]["y"] = json!(40.0);
    });
    folder.write(
        "tables/sfx/splash.json",
        &json!({ "file": "audio/combat/splash.wav", "role": "combat", "volume": 1.0, "pitch": 1.0 })
            .to_string(),
    );
    folder.remove("tables/input/interact.json");
    folder.write("tables/job/apprentice.json", "{ \"name\": 3 }");
    folder.write(
        "tables/area/cove.json",
        &serde_json::to_string_pretty(&json!({
            "name": "Cove",
            "map": { "type": "tilemap", "size": { "width": 4, "height": 4 }, "tile": 16, "ground": ["ground"] },
            "modules": [
                { "type": "scenery", "at": { "x": 9.0, "y": 0.0 }, "tileset": "beach_tileset", "tiles": [[338]] }
            ]
        }))
        .expect("json"),
    );
    folder.write(
        "tables/area/cove/palette.csv",
        "tileset,tile,flip\nbeach_tileset,338,\n",
    );
    folder.write(
        "tables/area/cove/ground.csv",
        "0,0,0,0\n0,0,7,0\n0,0,0,0\n0,0,0,0\n",
    );
    folder.write(
        "tables/area/cove/walk.csv",
        "1,1,1,1\n1,1,1,1\n1,1,1,1\n1,1,1,1\n",
    );
    folder.write(
        "tables/test_character/lost.json",
        &serde_json::to_string_pretty(&json!({
            "name": "Lost",
            "job": "adventurer",
            "known_areas": ["cove"],
            "start": { "area": "start", "x": 40.0, "y": 40.0 }
        }))
        .expect("json"),
    );

    let report = load(folder.path()).err().expect("refused");

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
    let folder = TempFolder::of_template();
    folder.write(
        "tables/area/cove.json",
        &json!({
            "name": "Cove",
            "map": { "type": "tilemap", "size": { "width": 4, "height": 4 }, "tile": 16, "ground": ["ground"] }
        })
        .to_string(),
    );
    folder.write(
        "tables/area/cove/palette.csv",
        "tileset,tile,flip\nbeach_tileset,x,\nbeach_tileset,1,sideways\nbeach_tileset,1\n",
    );
    folder.write("tables/area/cove/ground.csv", &"0,0,0,0\n".repeat(4));
    folder.write("tables/area/cove/walk.csv", &"1,1,1,1\n".repeat(4));

    let report = load(folder.path()).err().expect("refused");

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
