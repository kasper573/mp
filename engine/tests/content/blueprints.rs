use engine::core::content::ContentId;
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems::area::grid::Flip;
use engine::systems::area::{self, AreaDef, AreaModule, Scenery, SceneryTile, walk};
use serde_json::{Value, json};
use testkit::Game;

use crate::support::game;

#[test]
fn a_placement_flattens_to_exactly_its_parts_nested_ones_included() {
    let content = placing(
        game().row("blueprint", "tree", tree()).row("blueprint", "grove", grove()),
        json!([
            { "type": "blueprint", "blueprint": "grove", "at": { "x": 6.0, "y": 4.0 }, "flip": "horizontal" },
            { "type": "blueprint", "blueprint": "tree", "at": { "x": 2.0, "y": 2.0 } }
        ]),
    )
    .load();
    let start = content.table::<AreaDef>().id_of("start").expect("start");
    let placed = area::placed(&content, start);

    let parts: Vec<(usize, usize, Pos<Tiles>, Flip)> = placed
        .iter()
        .map(|part| {
            let (at, flip) = scenery_at(&part.module);
            (part.origin, part.chain.len(), at, flip)
        })
        .collect();
    assert_eq!(
        parts,
        vec![
            (0, 1, Pos::new(6.0, 4.0), Flip::Horizontal),
            (0, 2, Pos::new(4.0, 5.0), Flip::Horizontal),
            (1, 1, Pos::new(2.0, 2.0), Flip::None),
        ]
    );
}

#[test]
fn a_blueprint_holding_itself_is_refused() {
    let report = placing(
        game().row(
            "blueprint",
            "loop",
            json!({ "parts": [
                scenery(json!([[0]])),
                { "type": "blueprint", "blueprint": "loop", "at": { "x": 1.0, "y": 0.0 } }
            ] }),
        ),
        json!([{ "type": "blueprint", "blueprint": "loop", "at": { "x": 2.0, "y": 2.0 } }]),
    )
    .try_load()
    .err()
    .expect("refused");

    assert!(
        rules(&report).contains(&"blueprint holds itself"),
        "{report}"
    );
}

#[test]
fn nesting_past_eight_levels_is_refused() {
    let report = nest(0).try_load().err().expect("refused");

    let rules = rules(&report);
    assert!(rules.contains(&"nested too deep"), "{report}");
    assert!(!rules.contains(&"blueprint holds itself"), "{report}");
}

#[test]
fn nesting_up_to_eight_levels_loads() {
    let content = nest(1).load();
    let start = content.table::<AreaDef>().id_of("start").expect("start");
    assert_eq!(area::placed(&content, start).len(), 1);
}

#[test]
fn a_scenerys_bounds_cover_exactly_its_tiles_however_it_is_flipped() {
    for flip in [Flip::None, Flip::Horizontal, Flip::Vertical, Flip::Both] {
        let tile = SceneryTile {
            tile: 338,
            flip: Flip::None,
        };
        let scenery = Scenery {
            at: Pos::new(5.0, 7.0),
            tileset: ContentId::new(0),
            tiles: vec![vec![Some(tile); 3]; 2],
            sort: None,
            flip,
            blocks: Vec::new(),
        };

        let covered = (0..2)
            .flat_map(|row| (0..3).map(move |column| (column, row)))
            .map(|(column, row)| walk::tile_square(&scenery, column, row))
            .reduce(|a, b| a.union(&b));

        assert_eq!(covered, Some(scenery.bounds()), "{flip:?}");
    }
}

#[test]
fn a_placed_blueprint_naming_an_unknown_row_is_reported_once_at_the_blueprint() {
    let mut bad = scenery(json!([[0]]));
    bad["tileset"] = json!("nowhere");
    let report = placing(
        game().row("blueprint", "bad", json!({ "parts": [bad] })),
        json!([{ "type": "blueprint", "blueprint": "bad", "at": { "x": 2.0, "y": 2.0 } }]),
    )
    .try_load()
    .err()
    .expect("refused");

    let unknown: Vec<&str> = report
        .errors
        .iter()
        .filter(|error| error.problem.rule == "unknown row")
        .map(|error| error.file.as_str())
        .collect();
    assert_eq!(unknown, ["tables/blueprint/bad.json"], "{report}");
}

fn tree() -> Value {
    let mut trunk = scenery(json!([[0]]));
    trunk["sort"] = json!(0.5);
    json!({ "parts": [trunk] })
}

fn grove() -> Value {
    json!({ "parts": [
        scenery(json!([[0, 0]])),
        { "type": "blueprint", "blueprint": "tree", "at": { "x": 2.0, "y": 1.0 } }
    ] })
}

fn scenery(tiles: Value) -> Value {
    json!({ "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "start_ground", "tiles": tiles })
}

/// Blueprints nested from `level{top}` down to the deepest level allowed, placed in the start.
fn nest(top: usize) -> Game {
    let mut game = game();
    for depth in top..=area::blueprint::MAX_DEPTH {
        let parts = if depth == area::blueprint::MAX_DEPTH {
            json!([scenery(json!([[0]]))])
        } else {
            json!([{ "type": "blueprint", "blueprint": format!("level{}", depth + 1), "at": { "x": 0.0, "y": 0.0 } }])
        };
        game = game.row(
            "blueprint",
            &format!("level{depth}"),
            json!({ "parts": parts }),
        );
    }
    placing(
        game,
        json!([{ "type": "blueprint", "blueprint": format!("level{top}"), "at": { "x": 2.0, "y": 2.0 } }]),
    )
}

fn placing(game: Game, modules: Value) -> Game {
    game.edit("area", "start", |area| area["modules"] = modules)
}

fn rules(report: &engine::core::content::LoadReport) -> Vec<&str> {
    report
        .errors
        .iter()
        .map(|error| error.problem.rule)
        .collect()
}

fn scenery_at(module: &AreaModule) -> (Pos<Tiles>, Flip) {
    match module {
        AreaModule::Scenery(scenery) => (scenery.at, scenery.flip),
        other => panic!(
            "not scenery: {}",
            serde_json::to_value(other).expect("json")
        ),
    }
}
