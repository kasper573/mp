mod json;
mod model;
mod rows;
mod template;
mod tiled;

use std::fs;
use std::path::{Path, PathBuf};

use game::core::assets::{AssetService, FilesystemSource};
use game::core::audio::playback::SfxDef;
use game::core::babble::{BabbleBankDef, BabbleDef};
use game::core::content::{Content, ContentScope, with_content};
use game::systems::GameSettings;
use game::systems::actor::bust::ModelDef;
use game::systems::area::{AreaDef, AreaModule};
use game::systems::attention::AttentionDef;
use game::systems::input::map::InputDef;
use game::systems::interface::{CursorDef, FontDef, InterfaceIconDef};
use game::systems::item::ItemDef;
use game::systems::job::JobDef;
use game::systems::memory::MemoryDef;
use game::systems::notification::NotificationDef;
use game::systems::npc::NpcDef;
use game::systems::player::PlayerDef;
use game::systems::quest::QuestDef;
use game::systems::script::ScriptDef;
use game::systems::shop::ShopDef;
use serde::Serialize;

const CONTENT_VERSION_PLACEHOLDER: &str = "00000000";

#[derive(Serialize)]
pub struct GameRow<'a> {
    pub name: &'a str,
    pub content_version: &'a str,
    pub spawn: SpawnRow<'a>,
    pub player: &'a str,
    pub bench: &'a str,
}

#[derive(Serialize)]
pub struct SpawnRow<'a> {
    pub area: &'a str,
    pub x: f32,
    pub y: f32,
}

#[derive(Serialize)]
struct AreaRow<'a> {
    name: &'a str,
    map: &'a tiled::TileMap,
    modules: Vec<Placed<'a>>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Placed<'a> {
    Data(&'a AreaModule),
    Tiled(&'a tiled::TiledModule),
}

fn main() {
    let mut args = std::env::args().skip(1);
    let content_dir = PathBuf::from(args.next().unwrap_or_else(|| "content".to_owned()));
    let template_dir = PathBuf::from(
        args.next()
            .unwrap_or_else(|| "editor/templates/new_game".to_owned()),
    );
    let assets_dir = PathBuf::from("assets");

    let content = game::data::build();
    let settings = game::data::settings();
    let assets = AssetService::new(FilesystemSource(assets_dir.clone()), content);

    with_content(ContentScope::of(&content), || {
        write_game(&content_dir, &content, &settings);
        write_static_tables(&content_dir, &content);
        let converted = tiled::convert(&assets, &content);
        write_areas(&content_dir, &content, &converted);
        write_rows(&content_dir, "tileset", &converted.tilesets);
        write_rows(&content_dir, "surface", &converted.surfaces);
        write_rows(&content_dir, "blueprint", &converted.blueprints);
        let models = write_models(&content_dir, &assets, &content);
        copy_assets(&assets_dir, &content_dir.join("assets"));
        template::write(&template_dir, &assets_dir, &content, &converted, &models);
    });
    eprintln!(
        "[convert] wrote {} and {}",
        content_dir.display(),
        template_dir.display()
    );
}

fn write_game(root: &Path, content: &Content, settings: &GameSettings) {
    json::write_json(
        &root.join("game.json"),
        &GameRow {
            name: settings.name,
            content_version: CONTENT_VERSION_PLACEHOLDER,
            spawn: SpawnRow {
                area: settings.spawn.area.key(content),
                x: settings.spawn.at.x,
                y: settings.spawn.at.y,
            },
            player: settings.player.key(content),
            bench: settings.bench.key(content),
        },
    );
}

fn write_static_tables(root: &Path, content: &Content) {
    rows::write_table::<AttentionDef>(root, content);
    rows::write_table::<BabbleDef>(root, content);
    rows::write_table::<BabbleBankDef>(root, content);
    rows::write_table::<CursorDef>(root, content);
    rows::write_table::<FontDef>(root, content);
    rows::write_table::<InputDef>(root, content);
    rows::write_table::<InterfaceIconDef>(root, content);
    rows::write_table::<ItemDef>(root, content);
    rows::write_table::<JobDef>(root, content);
    rows::write_table::<MemoryDef>(root, content);
    rows::write_table::<NotificationDef>(root, content);
    rows::write_table::<NpcDef>(root, content);
    rows::write_table::<PlayerDef>(root, content);
    rows::write_table::<QuestDef>(root, content);
    rows::write_table::<ScriptDef>(root, content);
    rows::write_table::<SfxDef>(root, content);
    rows::write_table::<ShopDef>(root, content);
}

fn write_rows<T: Serialize>(
    root: &Path,
    table: &str,
    rows: &std::collections::BTreeMap<String, T>,
) {
    for (key, row) in rows {
        rows::write_row(root, table, key, row);
    }
}

fn write_areas(root: &Path, content: &Content, converted: &tiled::Converted) {
    for area in &converted.areas {
        let def = content
            .by_key::<AreaDef>(&area.key)
            .expect("a converted area is a row")
            .get(content);
        let modules = def
            .modules
            .iter()
            .map(Placed::Data)
            .chain(area.modules.iter().map(Placed::Tiled))
            .collect();
        rows::write_row(
            root,
            "area",
            &area.key,
            &AreaRow {
                name: def.name,
                map: &area.map,
                modules,
            },
        );
        write_grids(&root.join("tables").join("area").join(&area.key), area);
    }
}

pub fn write_grids(folder: &Path, area: &tiled::ConvertedArea) {
    let width = area.map.size.width as usize;
    json::write_csv(
        &folder.join("palette.csv"),
        Some("tileset,tile,flip"),
        area.grids
            .palette
            .iter()
            .map(|(tileset, tile, flip)| format!("{tileset},{tile},{flip}")),
    );
    json::write_csv(
        &folder.join("walk.csv"),
        None,
        area.grids.walk.chunks(width).map(|row| {
            row.iter()
                .map(|cell| match cell {
                    Some(true) => "1",
                    Some(false) => "0",
                    None => "",
                })
                .collect::<Vec<_>>()
                .join(",")
        }),
    );
    for (name, cells) in &area.grids.layers {
        json::write_csv(
            &folder.join(format!("{name}.csv")),
            None,
            cells.chunks(width).map(|row| {
                row.iter()
                    .map(|cell| cell.map(|index| index.to_string()).unwrap_or_default())
                    .collect::<Vec<_>>()
                    .join(",")
            }),
        );
    }
}

fn write_models(
    root: &Path,
    assets: &AssetService,
    content: &Content,
) -> std::collections::BTreeMap<String, model::ModelRow> {
    let mut models = std::collections::BTreeMap::new();
    for (id, def) in content.table::<ModelDef>().iter() {
        let row = model::convert(assets, content, def.sheet.0, def.modules);
        rows::write_row(root, "model", id.key(content), &row);
        models.insert(id.key(content).to_owned(), row);
    }
    models
}

fn copy_assets(from: &Path, to: &Path) {
    copy_tree(from, to, &|path| {
        let relative = path.strip_prefix(from).expect("inside the assets folder");
        let first = relative
            .components()
            .next()
            .and_then(|c| c.as_os_str().to_str());
        !matches!(first, Some("maps") | Some("shaders"))
            && path.extension().and_then(|e| e.to_str()) != Some("tsx")
    });
}

pub fn copy_tree(from: &Path, to: &Path, keep: &dyn Fn(&Path) -> bool) {
    for entry in fs::read_dir(from).unwrap_or_else(|error| panic!("{}: {error}", from.display())) {
        let entry = entry.expect("a readable directory entry");
        let path = entry.path();
        if !keep(&path) {
            continue;
        }
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &target, keep);
        } else {
            copy_file(&path, &target);
        }
    }
}

pub fn copy_file(from: &Path, to: &Path) {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).expect("the target folder is writable");
    }
    fs::copy(from, to).unwrap_or_else(|error| panic!("copying {}: {error}", from.display()));
}
