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

    let report = load(&folder.0).err().expect("refused");

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
