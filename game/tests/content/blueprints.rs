use game::core::content::ContentId;
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::area::grid::Flip;
use game::systems::area::{self, AreaDef, AreaModule, Scenery, SceneryTile, walk};
use serde_json::json;

use crate::support::{TempFolder, load};

#[test]
fn a_placement_flattens_to_exactly_its_parts_nested_ones_included() {
    let folder = TempFolder::of_template();
    folder.write("tables/blueprint/tree.json", &tree().to_string());
    folder.write("tables/blueprint/grove.json", &grove().to_string());
    place(
        &folder,
        json!([
            { "type": "blueprint", "blueprint": "grove", "at": { "x": 6.0, "y": 4.0 }, "flip": "horizontal" },
            { "type": "blueprint", "blueprint": "tree", "at": { "x": 2.0, "y": 2.0 } }
        ]),
    );

    let content = load(folder.path()).unwrap_or_else(|report| panic!("{report}"));
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
    let folder = TempFolder::of_template();
    folder.write(
        "tables/blueprint/loop.json",
        &json!({ "parts": [
            { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "beach_tileset", "tiles": [[338]] },
            { "type": "blueprint", "blueprint": "loop", "at": { "x": 1.0, "y": 0.0 } }
        ] })
        .to_string(),
    );
    place(
        &folder,
        json!([{ "type": "blueprint", "blueprint": "loop", "at": { "x": 2.0, "y": 2.0 } }]),
    );

    let report = load(folder.path()).err().expect("refused");

    let rules: Vec<&str> = report
        .errors
        .iter()
        .map(|error| error.problem.rule)
        .collect();
    assert!(rules.contains(&"blueprint holds itself"), "{report}");
}

#[test]
fn nesting_past_eight_levels_is_refused() {
    let folder = TempFolder::of_template();
    nest(&folder, 0);

    let report = load(folder.path()).err().expect("refused");

    let rules: Vec<&str> = report
        .errors
        .iter()
        .map(|error| error.problem.rule)
        .collect();
    assert!(rules.contains(&"nested too deep"), "{report}");
    assert!(!rules.contains(&"blueprint holds itself"), "{report}");
}

#[test]
fn nesting_up_to_eight_levels_loads() {
    let folder = TempFolder::of_template();
    nest(&folder, 1);

    let content = load(folder.path()).unwrap_or_else(|report| panic!("{report}"));
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

fn tree() -> serde_json::Value {
    json!({ "parts": [
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "beach_tileset", "tiles": [[338]], "sort": 0.5 }
    ] })
}

fn grove() -> serde_json::Value {
    json!({ "parts": [
        { "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "beach_tileset", "tiles": [[338, 338]] },
        { "type": "blueprint", "blueprint": "tree", "at": { "x": 2.0, "y": 1.0 } }
    ] })
}

fn nest(folder: &TempFolder, top: usize) {
    for depth in top..=area::blueprint::MAX_DEPTH {
        let parts = if depth == area::blueprint::MAX_DEPTH {
            json!([{ "type": "scenery", "at": { "x": 0.0, "y": 0.0 }, "tileset": "beach_tileset", "tiles": [[338]] }])
        } else {
            json!([{ "type": "blueprint", "blueprint": format!("level{}", depth + 1), "at": { "x": 0.0, "y": 0.0 } }])
        };
        folder.write(
            &format!("tables/blueprint/level{depth}.json"),
            &json!({ "parts": parts }).to_string(),
        );
    }
    place(
        folder,
        json!([{ "type": "blueprint", "blueprint": format!("level{top}"), "at": { "x": 2.0, "y": 2.0 } }]),
    );
}

fn place(folder: &TempFolder, modules: serde_json::Value) {
    folder.edit("tables/area/start.json", |area| area["modules"] = modules);
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
