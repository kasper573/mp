use std::collections::BTreeMap;
use std::path::Path;

use game::core::audio::playback::SfxDef;
use game::core::content::{Content, ContentRow, Fixture};
use game::systems::attention::{AttentionDef, AttentionMark};
use game::systems::input::map::InputDef;
use game::systems::interface::{
    CursorDef, CursorShape, FontDef, FontFace, InterfaceIcon, InterfaceIconDef, InterfaceSound,
};
use game::systems::job::JobDef;
use game::systems::player::PlayerDef;
use game::systems::script::ScriptDef;
use serde::Serialize;

use crate::model::ModelRow;
use crate::tiled::{Converted, ConvertedArea, Dims, Grids, TileMap, TilesetRow};
use crate::{GameRow, SpawnRow, json, rows};

const START_WIDTH: u32 = 16;
const START_HEIGHT: u32 = 12;

pub fn write(
    root: &Path,
    assets_dir: &Path,
    content: &Content,
    converted: &Converted,
    models: &BTreeMap<String, ModelRow>,
) {
    let settings = game::data::settings();
    let player = settings.player.key(content);
    let player_def = settings.player.get(content);
    let model = player_def.model.key(content);
    let job = player_def.job.key(content);
    let mut files: Vec<String> = Vec::new();

    json::write_json(
        &root.join("game.json"),
        &GameRow {
            name: "New Game",
            content_version: crate::CONTENT_VERSION_PLACEHOLDER,
            spawn: SpawnRow {
                area: "start",
                x: (START_WIDTH / 2) as f32,
                y: (START_HEIGHT / 2) as f32,
            },
            player,
            bench: "start",
        },
    );

    write_fixtures::<AttentionMark>(root, content, |row: &AttentionDef| {
        files.push(row.icon.0.to_owned())
    });
    write_fixtures::<CursorShape>(root, content, |row: &CursorDef| {
        files.push(row.image.0.to_owned())
    });
    write_fixtures::<FontFace>(root, content, |row: &FontDef| {
        files.push(row.file.0.to_owned())
    });
    write_fixtures::<InterfaceIcon>(root, content, |row: &InterfaceIconDef| {
        files.push(row.image.0.to_owned())
    });
    write_fixtures::<InterfaceSound>(root, content, |row: &SfxDef| {
        files.push(row.file.0.to_owned())
    });
    for (id, row) in content.table::<InputDef>().iter() {
        rows::write_row(root, InputDef::TABLE, id.key(content), row);
    }
    for (id, row) in content.table::<ScriptDef>().iter() {
        rows::write_row(root, ScriptDef::TABLE, id.key(content), row);
    }
    rows::write_row(root, PlayerDef::TABLE, player, player_def);
    rows::write_row(root, JobDef::TABLE, job, player_def.job.get(content));
    let model_row = &models[model];
    rows::write_row(root, "model", model, model_row);
    files.push(model_row.sprites.image.clone());

    let bench = settings.bench.key(content);
    let (tileset, tile) = ground_tile(converted, bench);
    let source = &converted.tilesets[&tileset];
    let data = source.tiles.get(&tile).cloned().unwrap_or_default();
    files.push(source.image.clone());
    if let Some(surface) = &data.surface {
        let surface_row = &converted.surfaces[surface];
        rows::write_row(root, "surface", surface, surface_row);
        let sfx = content
            .by_key::<SfxDef>(&surface_row.footstep)
            .expect("a surface's footstep is a sound");
        rows::write_row(root, SfxDef::TABLE, &surface_row.footstep, sfx.get(content));
        files.push(sfx.get(content).file.0.to_owned());
    }
    rows::write_row(
        root,
        "tileset",
        &tileset,
        &TilesetRow {
            image: source.image.clone(),
            tile: source.tile,
            terrains: BTreeMap::new(),
            tiles: BTreeMap::from([(tile, data)]),
        },
    );

    let cells = (START_WIDTH * START_HEIGHT) as usize;
    let start = ConvertedArea {
        key: "start".to_owned(),
        map: TileMap {
            kind: "tilemap",
            size: Dims {
                width: START_WIDTH,
                height: START_HEIGHT,
            },
            tile: source.tile,
            ground: vec!["ground".to_owned()],
        },
        modules: Vec::new(),
        grids: Grids {
            palette: vec![(tileset, tile, "")],
            layers: vec![("ground".to_owned(), vec![Some(0); cells])],
            walk: vec![None; cells],
        },
    };
    rows::write_row(
        root,
        "area",
        &start.key,
        &StartArea {
            name: "Start",
            map: &start.map,
            modules: Vec::<()>::new(),
        },
    );
    crate::write_grids(&root.join("tables").join("area").join(&start.key), &start);

    files.sort();
    files.dedup();
    for file in files {
        crate::copy_file(&assets_dir.join(&file), &root.join("assets").join(&file));
    }
}

#[derive(Serialize)]
struct StartArea<'a> {
    name: &'a str,
    map: &'a TileMap,
    modules: Vec<()>,
}

fn write_fixtures<F: Fixture>(root: &Path, content: &Content, mut each: impl FnMut(&F::Row))
where
    F::Row: Serialize,
{
    for fixture in F::VARIANTS {
        let row = fixture.get(content);
        rows::write_row(root, F::Row::TABLE, fixture.key(), row);
        each(row);
    }
}

fn ground_tile(converted: &Converted, bench: &str) -> (String, u32) {
    let area = converted
        .areas
        .iter()
        .find(|area| area.key == bench)
        .expect("the bench area is converted");
    let (_, layer) = area
        .grids
        .layers
        .first()
        .expect("the bench area has ground");
    let mut counts: BTreeMap<usize, usize> = BTreeMap::new();
    for index in layer.iter().flatten() {
        *counts.entry(*index).or_default() += 1;
    }
    let mut candidates: Vec<(usize, usize)> = counts.into_iter().collect();
    candidates.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    candidates
        .into_iter()
        .map(|(index, _)| &area.grids.palette[index])
        .find(|(tileset, tile, flip)| {
            flip.is_empty()
                && converted.tilesets[tileset]
                    .tiles
                    .get(tile)
                    .is_some_and(|data| data.walk == Some("walkable"))
        })
        .map(|(tileset, tile, _)| (tileset.clone(), *tile))
        .expect("the bench area has a walkable ground tile")
}
