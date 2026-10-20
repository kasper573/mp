use std::path::{Path, PathBuf};

use serde_json::json;
use testkit::{Game, Map};

/// The area every game of the editor's tests starts in.
pub const AREA: &str = "start";

/// The path of the area every game of the editor's tests starts in.
pub fn area() -> String {
    testkit::path("area", AREA)
}

/// A whole game of nothing but a field to start in and the rows the engine itself requires,
/// written to `folder`, which it returns.
pub fn game_folder(folder: PathBuf) -> PathBuf {
    game().write_to(&folder);
    folder
}

pub fn game() -> Game {
    Game::new()
        .area(AREA, &Map::open(8, 8), json!([]))
        .hero(AREA, 1.0, 1.0)
        .engine_rows()
        .whole()
}

pub fn game_name(folder: &Path) -> String {
    let text = std::fs::read_to_string(folder.join(engine::core::content::SETTINGS_FILE))
        .expect("the settings");
    let game: serde_json::Value = serde_json::from_str(&text).expect("json");
    game["name"].as_str().expect("a name").to_owned()
}
