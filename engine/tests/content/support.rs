use serde_json::json;
use testkit::{Game, Map};

/// A small game set up to be played: a hero starting in a corner of a field with a rock in it.
pub fn game() -> Game {
    Game::new()
        .area(
            "start",
            &Map::of(&[
                "..........",
                "..........",
                "..........",
                "...#......",
                "..........",
                "..........",
                "..........",
                "..........",
            ]),
            json!([]),
        )
        .hero("start", 1.0, 1.0)
}
