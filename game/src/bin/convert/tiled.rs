use std::collections::{BTreeMap, HashMap, HashSet};

use game::core::assets::AssetService;
use game::core::audio::playback::SfxDef;
use game::core::audio::soundscape::SoundscapeShape;
use game::core::content::{Content, key_of};
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, CellPos, TileRect, Tiles};
use game::systems::area::{Area, AreaDef};
use serde::Serialize;
use tiled::{LayerType, PropertyValue, Tileset, WangSetType};

const TILE: u32 = 16;
const OBSCURING_CUTOFF: f32 = 0.4;

#[derive(Serialize)]
pub struct TileMap {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub size: Dims,
    pub tile: u32,
    pub ground: Vec<String>,
}

#[derive(Serialize, Clone, Copy)]
pub struct Dims {
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Clone, Copy)]
pub struct Xy {
    pub x: f32,
    pub y: f32,
}

#[derive(Serialize, Clone, Copy)]
pub struct Xywh {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Xywh {
    fn of(rect: Rect<Tiles>) -> Xywh {
        Xywh {
            x: tidy(rect.origin.x),
            y: tidy(rect.origin.y),
            w: tidy(rect.size.width),
            h: tidy(rect.size.height),
        }
    }
}

impl Xy {
    fn of(pos: Pos<Tiles>) -> Xy {
        Xy {
            x: tidy(pos.x),
            y: tidy(pos.y),
        }
    }
}

/// Pixel positions divided by the tile size leave f32 noise (4.1000004); a thousandth of a tile
/// is finer than anything Tiled authored.
fn tidy(value: f32) -> f32 {
    (value * 1000.0).round() / 1000.0
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TiledModule {
    SafeZone {
        rect: Xywh,
    },
    Soundscape {
        shape: Shape,
        emit: f32,
        channels: Vec<Channel>,
    },
    Scenery {
        at: Xy,
        tileset: String,
        tiles: Vec<Vec<Option<SceneryTile>>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        sort: Option<f32>,
    },
    Blueprint {
        blueprint: String,
        at: Xy,
        #[serde(skip_serializing_if = "Option::is_none")]
        flip: Option<&'static str>,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct SceneryTile {
    pub tile: u32,
    pub flip: Option<&'static str>,
}

impl Serialize for SceneryTile {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        match self.flip {
            None => serializer.serialize_u32(self.tile),
            Some(flip) => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("tile", &self.tile)?;
                map.serialize_entry("flip", flip)?;
                map.end()
            }
        }
    }
}

#[derive(Serialize, Clone, Copy)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Shape {
    Rect { x: f32, y: f32, w: f32, h: f32 },
    Ellipse { x: f32, y: f32, w: f32, h: f32 },
}

#[derive(Serialize, Clone)]
pub struct Channel {
    pub channel: u32,
    pub file: String,
    #[serde(skip_serializing_if = "is_one")]
    pub volume: f32,
    #[serde(skip_serializing_if = "is_zero")]
    pub pan: f32,
}

fn is_one(value: &f32) -> bool {
    *value == 1.0
}

fn is_zero(value: &f32) -> bool {
    *value == 0.0
}

#[derive(Serialize)]
pub struct TilesetRow {
    pub image: String,
    pub tile: u32,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub terrains: BTreeMap<String, Vec<String>>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub tiles: BTreeMap<u32, TileData>,
}

#[derive(Serialize, Default, Clone)]
pub struct TileData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub walk: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub corners: BTreeMap<String, [String; 4]>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub animation: Vec<Frame>,
}

#[derive(Serialize, Clone)]
pub struct Frame {
    pub tile: u32,
    pub ms: u32,
}

#[derive(Serialize)]
pub struct SurfaceRow {
    pub name: String,
    pub footstep: String,
}

#[derive(Serialize)]
pub struct BlueprintRow {
    pub parts: Vec<TiledModule>,
}

type PaletteEntry = (String, u32, &'static str);
type TileCells = Vec<Option<PaletteEntry>>;

pub struct Grids {
    pub palette: Vec<PaletteEntry>,
    pub layers: Vec<(String, Vec<Option<usize>>)>,
    pub walk: Vec<Option<bool>>,
}

pub struct ConvertedArea {
    pub key: String,
    pub map: TileMap,
    pub modules: Vec<TiledModule>,
    pub grids: Grids,
}

pub struct Converted {
    pub areas: Vec<ConvertedArea>,
    pub tilesets: BTreeMap<String, TilesetRow>,
    pub surfaces: BTreeMap<String, SurfaceRow>,
    pub blueprints: BTreeMap<String, BlueprintRow>,
}

struct Loaded {
    key: String,
    area: &'static Area,
    size: Dims,
    ground: Vec<(String, TileCells)>,
    collision: Vec<TileCells>,
    groups: Vec<Group>,
    props: Vec<Prop>,
}

type Arrangement = (String, Vec<Vec<Option<SceneryTile>>>);

#[derive(Clone)]
struct Group {
    tileset: String,
    at: CellPos,
    tiles: Vec<Vec<Option<SceneryTile>>>,
    sort: f32,
}

impl Group {
    fn signature(&self) -> Arrangement {
        (self.tileset.clone(), self.tiles.clone())
    }
}

struct Prop {
    tileset: String,
    tile: u32,
    rect: Rect<Tiles>,
    flipped: bool,
}

#[derive(Default)]
struct TileUse {
    ground: HashSet<(String, u32)>,
    blocking_props: HashSet<(String, u32)>,
}

pub fn convert(assets: &AssetService, content: &Content) -> Converted {
    let mut tilesets: BTreeMap<String, TilesetRow> = BTreeMap::new();
    let mut surfaces: BTreeMap<String, SurfaceRow> = BTreeMap::new();
    let mut uses = TileUse::default();
    let mut loaded = Vec::new();
    for (id, def) in content.table::<AreaDef>().iter() {
        let area = game::systems::area::load(assets, id);
        let map = area.map.clone();
        for tileset in map.tilesets() {
            tilesets
                .entry(tileset_key(tileset))
                .or_insert_with(|| tileset_row(tileset, content, &mut surfaces));
        }
        let _ = def;
        loaded.push(load_area(id.key(content), area, &map, &mut uses));
    }
    for (tileset, tile) in &uses.blocking_props {
        if uses.ground.contains(&(tileset.clone(), *tile)) {
            continue;
        }
        let data = tilesets
            .get_mut(tileset)
            .expect("a prop's tileset is loaded")
            .tiles
            .entry(*tile)
            .or_default();
        if data.walk.is_none() {
            data.walk = Some("blocks");
        }
    }

    let mut signatures: HashMap<Arrangement, usize> = HashMap::new();
    for map in &loaded {
        for group in &map.groups {
            *signatures.entry(group.signature()).or_default() += 1;
        }
    }
    let mut blueprints: BTreeMap<String, BlueprintRow> = BTreeMap::new();
    let mut group_blueprints: HashMap<Arrangement, String> = HashMap::new();
    for map in &loaded {
        for prop in &map.props {
            let key = format!("{}_{}", prop.tileset, prop.tile);
            blueprints.entry(key).or_insert_with(|| {
                let tile_height = tilesets[&prop.tileset].tile as f32 / TILE as f32;
                BlueprintRow {
                    parts: vec![TiledModule::Scenery {
                        at: Xy { x: 0.0, y: 0.0 },
                        tileset: prop.tileset.clone(),
                        tiles: vec![vec![Some(SceneryTile {
                            tile: prop.tile,
                            flip: None,
                        })]],
                        sort: Some(tile_height - 0.5),
                    }],
                }
            });
        }
        for group in &map.groups {
            let signature = group.signature();
            if signatures[&signature] < 2 || group_blueprints.contains_key(&signature) {
                continue;
            }
            let base = format!(
                "{}_{}x{}",
                group.tileset,
                group.tiles[0].len(),
                group.tiles.len()
            );
            let mut key = base.clone();
            let mut suffix = 2;
            while blueprints.contains_key(&key) {
                key = format!("{base}_{suffix}");
                suffix += 1;
            }
            blueprints.insert(
                key.clone(),
                BlueprintRow {
                    parts: vec![TiledModule::Scenery {
                        at: Xy { x: 0.0, y: 0.0 },
                        tileset: group.tileset.clone(),
                        tiles: group.tiles.clone(),
                        sort: Some(group.sort),
                    }],
                },
            );
            group_blueprints.insert(signature, key);
        }
    }

    let mut areas = Vec::new();
    let mut patched = 0;
    for map in loaded {
        let (converted, cells) = finish_area(map, content, &tilesets, &surfaces, &group_blueprints);
        patched += cells;
        areas.push(converted);
    }
    eprintln!(
        "[convert] {} areas, {} tilesets, {} surfaces, {} blueprints, {} walk cells written explicitly",
        areas.len(),
        tilesets.len(),
        surfaces.len(),
        blueprints.len(),
        patched
    );
    Converted {
        areas,
        tilesets,
        surfaces,
        blueprints,
    }
}

fn load_area(key: &str, area: &'static Area, map: &tiled::Map, uses: &mut TileUse) -> Loaded {
    let size = Dims {
        width: map.width,
        height: map.height,
    };
    let cells = (map.width * map.height) as usize;
    let mut ground = Vec::new();
    let mut collision_layers = Vec::new();
    let mut groups = Vec::new();
    let mut props = Vec::new();
    let mut tile_layer_index = 0;
    for layer in map.layers() {
        match layer.layer_type() {
            LayerType::Tiles(tiles) => {
                let dynamic = area.layers[tile_layer_index].dynamic;
                tile_layer_index += 1;
                let collision = layer.name.eq_ignore_ascii_case("collision");
                let mut cells_of = vec![None; cells];
                for y in 0..map.height as i32 {
                    for x in 0..map.width as i32 {
                        let Some(tile) = tiles.get_tile(x, y) else {
                            continue;
                        };
                        let cell = CellPos::new(x, y);
                        if dynamic && area.grouped_cells.contains(&cell) {
                            continue;
                        }
                        if tile.flip_d {
                            eprintln!(
                                "[convert] area {key}: tile ({x}, {y}) is flipped diagonally, which the renderer ignores; dropped"
                            );
                        }
                        let flip = match (tile.flip_h, tile.flip_v) {
                            (false, false) => "",
                            (true, false) => "horizontal",
                            (false, true) => "vertical",
                            (true, true) => "both",
                        };
                        let tileset = tileset_key(tile.get_tileset());
                        if !collision {
                            uses.ground.insert((tileset.clone(), tile.id()));
                        }
                        cells_of[(y as u32 * map.width + x as u32) as usize] =
                            Some((tileset, tile.id(), flip));
                    }
                }
                if collision {
                    collision_layers.push(cells_of);
                    continue;
                }
                let name = if dynamic {
                    "upper".to_owned()
                } else {
                    layer_key(&layer.name)
                };
                if !dynamic || cells_of.iter().any(Option::is_some) {
                    ground.push((name, cells_of));
                }
                if dynamic {
                    for group in &area.groups {
                        groups.push(group_of(key, group, &tiles));
                    }
                }
            }
            LayerType::Objects(objects) => {
                for object in objects.objects() {
                    let Some(tile) = object.get_tile() else {
                        continue;
                    };
                    let tileset = tile.get_tileset();
                    let (width, height) = match object.shape {
                        tiled::ObjectShape::Rect { width, height } => (width, height),
                        _ => panic!("area {key}: a tile object is not a rectangle"),
                    };
                    assert_eq!(
                        (width as u32, height as u32),
                        (tileset.tile_width, tileset.tile_height),
                        "area {key}: tile object {} is scaled",
                        object.id()
                    );
                    assert!(
                        !tile.flip_v,
                        "area {key}: tile object {} is flipped vertically",
                        object.id()
                    );
                    let walkable = tileset.get_tile(tile.id()).is_some_and(|data| {
                        data.properties.get("Walkable") == Some(&PropertyValue::BoolValue(true))
                    });
                    let tileset_key = tileset_key(tileset);
                    if !walkable {
                        uses.blocking_props.insert((tileset_key.clone(), tile.id()));
                    }
                    props.push(Prop {
                        tileset: tileset_key,
                        tile: tile.id(),
                        rect: Rect::new(
                            Pos::new(
                                object.x / TILE as f32 - 0.5,
                                (object.y - height) / TILE as f32 - 0.5,
                            ),
                            Size::new(width / TILE as f32, height / TILE as f32),
                        ),
                        flipped: tile.flip_h,
                    });
                }
            }
            _ => {}
        }
    }
    Loaded {
        key: key.to_owned(),
        area,
        size,
        ground,
        collision: collision_layers,
        groups,
        props,
    }
}

fn group_of(key: &str, group: &game::systems::area::Group, layer: &tiled::TileLayer) -> Group {
    let min_x = group
        .tiles
        .iter()
        .map(|c| c.x)
        .min()
        .expect("a group has cells");
    let min_y = group
        .tiles
        .iter()
        .map(|c| c.y)
        .min()
        .expect("a group has cells");
    let max_x = group
        .tiles
        .iter()
        .map(|c| c.x)
        .max()
        .expect("a group has cells");
    let max_y = group
        .tiles
        .iter()
        .map(|c| c.y)
        .max()
        .expect("a group has cells");
    let mut tiles = vec![vec![None; (max_x - min_x + 1) as usize]; (max_y - min_y + 1) as usize];
    let mut tileset: Option<String> = None;
    for cell in &group.tiles {
        let tile = layer
            .get_tile(cell.x, cell.y)
            .expect("a grouped cell holds a tile");
        assert!(
            !tile.flip_d,
            "area {key}: grouped tile at ({}, {}) is flipped diagonally",
            cell.x, cell.y
        );
        let this = tileset_key(tile.get_tileset());
        match &tileset {
            Some(known) => assert_eq!(known, &this, "area {key}: a group spans two tilesets"),
            None => tileset = Some(this),
        }
        let flip = match (tile.flip_h, tile.flip_v) {
            (false, false) => None,
            (true, false) => Some("horizontal"),
            (false, true) => Some("vertical"),
            (true, true) => Some("both"),
        };
        tiles[(cell.y - min_y) as usize][(cell.x - min_x) as usize] = Some(SceneryTile {
            tile: tile.id(),
            flip,
        });
    }
    Group {
        tileset: tileset.expect("a group has a tileset"),
        at: CellPos::new(min_x, min_y),
        tiles,
        sort: (max_y - min_y) as f32,
    }
}

fn finish_area(
    map: Loaded,
    content: &Content,
    tilesets: &BTreeMap<String, TilesetRow>,
    surfaces: &BTreeMap<String, SurfaceRow>,
    group_blueprints: &HashMap<Arrangement, String>,
) -> (ConvertedArea, usize) {
    let cells = (map.size.width * map.size.height) as usize;
    let walk_of = |tileset: &str, tile: u32| -> Option<&'static str> {
        tilesets[tileset]
            .tiles
            .get(&tile)
            .and_then(|data| data.walk)
    };
    let mut blocked = vec![false; cells];
    let mut walkable = vec![false; cells];
    let mut vote = |index: usize, walk: Option<&'static str>| match walk {
        Some("blocks") => blocked[index] = true,
        Some("walkable") => walkable[index] = true,
        _ => {}
    };
    for (_, layer) in &map.ground {
        for (index, cell) in layer.iter().enumerate() {
            if let Some((tileset, tile, _)) = cell {
                vote(index, walk_of(tileset, *tile));
            }
        }
    }
    for group in &map.groups {
        for (dy, row) in group.tiles.iter().enumerate() {
            for (dx, tile) in row.iter().enumerate() {
                let Some(tile) = tile else { continue };
                let cell = CellPos::new(group.at.x + dx as i32, group.at.y + dy as i32);
                if let Some(index) = cell_index(cell, map.size) {
                    vote(index, walk_of(&group.tileset, tile.tile));
                }
            }
        }
    }
    for prop in &map.props {
        let walk = walk_of(&prop.tileset, prop.tile);
        if walk.is_none() {
            continue;
        }
        for cell in prop.rect.tiles() {
            if cell_overlap(&prop.rect, cell) >= OBSCURING_CUTOFF
                && let Some(index) = cell_index(cell, map.size)
            {
                vote(index, walk);
            }
        }
    }
    let mut walk: Vec<Option<bool>> = vec![None; cells];
    for layer in &map.collision {
        for (index, cell) in layer.iter().enumerate() {
            if let Some((tileset, tile, _)) = cell {
                match walk_of(tileset, *tile) {
                    Some("blocks") => walk[index] = Some(false),
                    Some("walkable") if walk[index].is_none() => walk[index] = Some(true),
                    _ => {}
                }
            }
        }
    }
    let mut patched = 0;
    let mut footsteps_differ = 0;
    for y in 0..map.size.height as i32 {
        for x in 0..map.size.width as i32 {
            let cell = CellPos::new(x, y);
            let index = (y as u32 * map.size.width + x as u32) as usize;
            let today = map.area.grid.walkable(cell.center());
            let resolved = walk[index].unwrap_or(!blocked[index] && walkable[index]);
            if today != resolved {
                walk[index] = Some(today);
                patched += 1;
            }
            let by_rule = map.ground.iter().rev().find_map(|(_, layer)| {
                let (tileset, tile, _) = layer[index].as_ref()?;
                let surface = tilesets[tileset].tiles.get(tile)?.surface.as_ref()?;
                Some(surfaces[surface].footstep.clone())
            });
            let today_footstep = map
                .area
                .tile_sfx_at(cell)
                .map(|sfx| sfx.key(content).to_owned());
            if by_rule != today_footstep {
                footsteps_differ += 1;
            }
        }
    }
    if patched > 0 || footsteps_differ > 0 {
        eprintln!(
            "[convert] area {}: {patched} walk cells written explicitly, {footsteps_differ} footsteps differ",
            map.key
        );
    }

    let mut palette: Vec<PaletteEntry> = Vec::new();
    let mut palette_index: HashMap<PaletteEntry, usize> = HashMap::new();
    let mut layers = Vec::new();
    for (name, cells_of) in &map.ground {
        let indexed = cells_of
            .iter()
            .map(|cell| {
                cell.as_ref().map(|entry| {
                    *palette_index.entry(entry.clone()).or_insert_with(|| {
                        palette.push(entry.clone());
                        palette.len() - 1
                    })
                })
            })
            .collect();
        layers.push((name.clone(), indexed));
    }

    let mut modules = Vec::new();
    for zone in &map.area.safe_zones {
        modules.push(TiledModule::SafeZone {
            rect: Xywh::of(*zone),
        });
    }
    for zone in &map.area.soundscape {
        let shape = match zone.shape {
            SoundscapeShape::Rect(rect) => {
                let Xywh { x, y, w, h } = Xywh::of(rect);
                Shape::Rect { x, y, w, h }
            }
            SoundscapeShape::Ellipse(rect) => {
                let Xywh { x, y, w, h } = Xywh::of(rect);
                Shape::Ellipse { x, y, w, h }
            }
        };
        modules.push(TiledModule::Soundscape {
            shape,
            emit: zone.emit.0,
            channels: zone
                .channels
                .iter()
                .map(|(channel, layer)| Channel {
                    channel: channel.0,
                    file: layer.src.clone(),
                    volume: layer.volume,
                    pan: layer.pan,
                })
                .collect(),
        });
    }
    for prop in &map.props {
        let at = if prop.flipped {
            Xy::of(Pos::new(
                prop.rect.origin.x + prop.rect.size.width,
                prop.rect.origin.y,
            ))
        } else {
            Xy::of(prop.rect.origin)
        };
        modules.push(TiledModule::Blueprint {
            blueprint: format!("{}_{}", prop.tileset, prop.tile),
            at,
            flip: prop.flipped.then_some("horizontal"),
        });
    }
    for group in &map.groups {
        let at = Xy {
            x: group.at.x as f32 - 0.5,
            y: group.at.y as f32 - 0.5,
        };
        match group_blueprints.get(&group.signature()) {
            Some(blueprint) => modules.push(TiledModule::Blueprint {
                blueprint: blueprint.clone(),
                at,
                flip: None,
            }),
            None => modules.push(TiledModule::Scenery {
                at,
                tileset: group.tileset.clone(),
                tiles: group.tiles.clone(),
                sort: Some(group.sort),
            }),
        }
    }

    (
        ConvertedArea {
            key: map.key,
            map: TileMap {
                kind: "tilemap",
                size: map.size,
                tile: TILE,
                ground: layers.iter().map(|(name, _)| name.clone()).collect(),
            },
            modules,
            grids: Grids {
                palette,
                layers,
                walk,
            },
        },
        patched,
    )
}

fn cell_index(cell: CellPos, size: Dims) -> Option<usize> {
    (cell.x >= 0 && cell.y >= 0 && (cell.x as u32) < size.width && (cell.y as u32) < size.height)
        .then(|| (cell.y as u32 * size.width + cell.x as u32) as usize)
}

fn cell_overlap(rect: &Rect<Tiles>, cell: CellPos) -> f32 {
    rect.intersection(&cell.bounds())
        .map_or(0.0, |overlap| overlap.area())
}

pub fn tileset_key(tileset: &Tileset) -> String {
    let stem = tileset
        .source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .expect("a tileset file has a name");
    stem.replace('-', "_")
}

fn layer_key(name: &str) -> String {
    name.to_ascii_lowercase().replace([' ', '-'], "_")
}

fn tileset_row(
    tileset: &Tileset,
    content: &Content,
    surfaces: &mut BTreeMap<String, SurfaceRow>,
) -> TilesetRow {
    let image = tileset
        .image
        .as_ref()
        .and_then(|image| image.source.file_name())
        .and_then(|name| name.to_str())
        .expect("a tileset has an image");
    assert_eq!(
        tileset.tile_width, tileset.tile_height,
        "tileset {}: tiles must be square",
        tileset.name
    );
    let mut tiles: BTreeMap<u32, TileData> = BTreeMap::new();
    for (id, tile) in tileset.tiles() {
        let mut data = TileData {
            walk: match tile.properties.get("Walkable") {
                Some(PropertyValue::BoolValue(true)) => Some("walkable"),
                Some(PropertyValue::BoolValue(false)) => Some("blocks"),
                _ => None,
            },
            ..TileData::default()
        };
        if let Some(PropertyValue::StringValue(sfx)) = tile.properties.get("sfx") {
            data.surface = Some(surface_of(sfx, content, surfaces));
        }
        if let Some(frames) = &tile.animation {
            data.animation = frames
                .iter()
                .map(|frame| Frame {
                    tile: frame.tile_id,
                    ms: frame.duration,
                })
                .collect();
        }
        if data.walk.is_some() || data.surface.is_some() || !data.animation.is_empty() {
            tiles.insert(id, data);
        }
    }
    let mut terrains = BTreeMap::new();
    for set in &tileset.wang_sets {
        assert!(
            matches!(set.wang_set_type, WangSetType::Corner),
            "tileset {}: terrain set {} is not a corner set",
            tileset.name,
            set.name
        );
        let set_key = layer_key(&set.name);
        let colors: Vec<String> = set
            .wang_colors
            .iter()
            .map(|color| color.name.clone())
            .collect();
        for (id, wang) in &set.wang_tiles {
            let ids = wang.wang_id.0;
            let corners = [7, 1, 3, 5].map(|index| ids[index] as usize);
            if corners.contains(&0) {
                eprintln!(
                    "[convert] tileset {}: tile {id} leaves a corner of {} unset, skipped",
                    tileset.name, set.name
                );
                continue;
            }
            tiles.entry(*id).or_default().corners.insert(
                set_key.clone(),
                corners.map(|color| colors[color - 1].clone()),
            );
        }
        terrains.insert(set_key, colors);
    }
    TilesetRow {
        image: format!("tilesets/{image}"),
        tile: tileset.tile_width,
        terrains,
        tiles,
    }
}

fn surface_of(sfx: &str, content: &Content, surfaces: &mut BTreeMap<String, SurfaceRow>) -> String {
    let material = sfx
        .strip_prefix("Step")
        .unwrap_or(sfx)
        .trim_end_matches(|c: char| c.is_ascii_digit());
    let key = material.to_ascii_lowercase();
    let footstep = key_of(sfx);
    content
        .by_key::<SfxDef>(footstep.as_str())
        .unwrap_or_else(|| panic!("tile sfx {sfx} is not a known sfx"));
    surfaces.entry(key.clone()).or_insert_with(|| SurfaceRow {
        name: material.to_owned(),
        footstep: footstep.as_str().to_owned(),
    });
    key
}
