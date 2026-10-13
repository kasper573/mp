pub mod blueprint;
pub mod grid;
pub mod object;
pub mod tileset;
pub mod transition;
pub mod walk;
pub mod warp;
pub mod world_map;

pub use blueprint::{Flattened, PlacedBlueprint, Placement};
pub use grid::{AreaGrids, Flip, PaletteEntry};
pub use object::{AreaObject, ObjectDef, ObjectShape};

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::io;

use bevy_app::App;
use bevy_ecs::component::Component;
use bevy_ecs::entity::Entity;
use bevy_ecs::world::World;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};
use strum::{EnumString, IntoStaticStr, VariantArray};

use crate::core::assets::AssetRef;
use crate::core::audio::playback::SfxId;
use crate::core::audio::soundscape::{
    SoundscapeChannel, SoundscapeLayer, SoundscapeShape, SoundscapeZone,
};
use crate::core::content::media::ImageSizes;
use crate::core::content::{
    Content, ContentId, ContentRegistry, ContentRow, ErrorPlace, FileWriter, LoadError, LoadStep,
    Loading, ModuleRule, ModuleSet, RowCheck, serial, valid_key,
};
use crate::core::math::{Pos, Rect, Size};
use crate::core::script::{OwnerKind, OwnerRow};
use crate::core::tiling::{Cell, CellPos, GridSize, TilePos, TileRect, TileSize, Tiles};
use crate::systems::movement;
use crate::systems::npc::Id as NpcId;
use crate::systems::script::{self, Condition, Reach, RiftScripts, ScriptModule};

pub type Id = ContentId<AreaDef>;

pub const MAX_SIDE: u32 = 256;
pub const MIN_SIDE: u32 = 4;
pub const MAX_CELLS: u32 = 65_536;
pub const MAX_GROUND_LAYERS: usize = 16;
pub const MAX_POPULATION: u32 = 500;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<AreaTag>();
    object::register(app);
}

pub fn content(registry: &mut ContentRegistry) {
    registry
        .row::<tileset::TilesetDef>()
        .row::<tileset::SurfaceDef>()
        .row::<blueprint::BlueprintDef>()
        .row::<world_map::WorldMapDef>()
        .fixture::<world_map::WorldMap>()
        .folder::<AreaDef>()
        .modules::<AreaDef>()
        .hook(LoadStep::Files, read_grids)
        .hook(LoadStep::Blueprints, flatten_all)
        .hook(LoadStep::Areas, build_all)
        .hook(LoadStep::Across, world_map::check_all)
        .writer(write_grids);
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AreaTag {
    pub area: Id,
}

#[derive(Component, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Wild;

pub fn wild(world: &World, entity: Entity) -> bool {
    world.get::<Wild>(entity).is_some()
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AreaDef {
    pub name: String,
    pub map: AreaMap,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<AreaModule>,
}

impl ContentRow for AreaDef {
    const TABLE: &'static str = "area";

    fn check(&self, cx: &mut RowCheck) {
        cx.text("/name", &self.name, 1, 60);
        let AreaMap::Tilemap(map) = &self.map;
        cx.range(
            "/map/size/width",
            map.size.width,
            MIN_SIDE,
            MAX_SIDE,
            "tiles",
        );
        cx.range(
            "/map/size/height",
            map.size.height,
            MIN_SIDE,
            MAX_SIDE,
            "tiles",
        );
        if map.size.width.saturating_mul(map.size.height) > MAX_CELLS {
            cx.error(
                "/map/size",
                "out of range",
                format!("{} cells", map.size.width * map.size.height),
                format!("at most {MAX_CELLS} cells"),
            );
        }
        cx.range(
            "/map/tile",
            map.tile,
            1,
            tileset::MAX_TILE_PX,
            "pixels per tile",
        );
        cx.count(
            "/map/ground",
            map.ground.len(),
            1,
            MAX_GROUND_LAYERS,
            "ground layers",
        );
        for (index, layer) in map.ground.iter().enumerate() {
            let pointer = format!("/map/ground/{index}");
            if layer == "palette" || layer == "walk" || !valid_key(layer) {
                cx.error(
                    &pointer,
                    "out of range",
                    format!("{layer:?}"),
                    "a valid key that isn't palette or walk",
                );
            }
            if map.ground[..index]
                .iter()
                .any(|other| other.eq_ignore_ascii_case(layer))
            {
                cx.error(
                    &pointer,
                    "duplicate name",
                    format!("layer {layer} twice"),
                    "unique layer names",
                );
            }
        }
        for (index, module) in self.modules.iter().enumerate() {
            module.check(&format!("/modules/{index}"), cx);
        }
    }
}

impl ModuleSet for AreaDef {
    type Module = AreaModule;

    fn modules(&self) -> &[AreaModule] {
        &self.modules
    }

    fn rule(_: &AreaModule) -> ModuleRule {
        ModuleRule::AnyNumber
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AreaMap {
    Tilemap(Tilemap),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tilemap {
    pub size: MapSize,
    pub tile: u32,
    pub ground: Vec<String>,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MapSize {
    pub width: u32,
    pub height: u32,
}

impl MapSize {
    pub fn grid(self) -> GridSize {
        GridSize::new(self.width, self.height)
    }

    pub fn tiles(self) -> Size<Tiles> {
        Size::new(self.width as f32, self.height as f32)
    }
}

impl AreaDef {
    pub fn map(&self) -> &Tilemap {
        let AreaMap::Tilemap(map) = &self.map;
        map
    }

    pub fn scripts(&self) -> Vec<(usize, &ScriptModule)> {
        self.modules
            .iter()
            .enumerate()
            .filter_map(|(index, module)| match module {
                AreaModule::Script(script) => Some((index, script)),
                _ => None,
            })
            .collect()
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AreaModule {
    Object(ObjectDef),
    SafeZone(SafeZone),
    Soundscape(SoundscapeDef),
    Scenery(Scenery),
    Blueprint(Placement),
    Population(Population),
    Resident(Resident),
    #[serde(untagged)]
    Script(ScriptModule),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, EnumString, IntoStaticStr, VariantArray)]
#[strum(serialize_all = "snake_case")]
pub enum AreaModuleKind {
    Object,
    SafeZone,
    Soundscape,
    Scenery,
    Blueprint,
    Population,
    Resident,
    SharedScript,
    InlineScript,
}

impl AreaModuleKind {
    pub fn tag(self) -> &'static str {
        self.into()
    }
}

impl AreaModule {
    pub fn kind(&self) -> AreaModuleKind {
        match self {
            AreaModule::Object(_) => AreaModuleKind::Object,
            AreaModule::SafeZone(_) => AreaModuleKind::SafeZone,
            AreaModule::Soundscape(_) => AreaModuleKind::Soundscape,
            AreaModule::Scenery(_) => AreaModuleKind::Scenery,
            AreaModule::Blueprint(_) => AreaModuleKind::Blueprint,
            AreaModule::Population(_) => AreaModuleKind::Population,
            AreaModule::Resident(_) => AreaModuleKind::Resident,
            AreaModule::Script(ScriptModule::Shared { .. }) => AreaModuleKind::SharedScript,
            AreaModule::Script(ScriptModule::Inline(_)) => AreaModuleKind::InlineScript,
        }
    }

    fn check(&self, pointer: &str, cx: &mut RowCheck) {
        match self {
            AreaModule::Population(population) => cx.range(
                format!("{pointer}/count"),
                population.count,
                1,
                MAX_POPULATION,
                "npcs",
            ),
            AreaModule::Soundscape(soundscape) => soundscape.check(pointer, cx),
            AreaModule::Scenery(scenery) => scenery.check(pointer, cx),
            _ => {}
        }
    }
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SafeZone {
    #[schemars(with = "serial::RectRow")]
    #[serde(
        serialize_with = "serial::rect",
        deserialize_with = "serial::rect_from"
    )]
    pub rect: Rect<Tiles>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SoundscapeDef {
    pub shape: ZoneShape,
    pub emit: f32,
    pub channels: Vec<SoundChannel>,
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
#[serde(from = "ZoneShapeRow", into = "ZoneShapeRow")]
pub enum ZoneShape {
    Rect(Rect<Tiles>),
    Ellipse(Rect<Tiles>),
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum ZoneShapeRow {
    Rect { x: f32, y: f32, w: f32, h: f32 },
    Ellipse { x: f32, y: f32, w: f32, h: f32 },
}

impl From<ZoneShapeRow> for ZoneShape {
    fn from(row: ZoneShapeRow) -> ZoneShape {
        match row {
            ZoneShapeRow::Rect { x, y, w, h } => {
                ZoneShape::Rect(Rect::new(Pos::new(x, y), Size::new(w, h)))
            }
            ZoneShapeRow::Ellipse { x, y, w, h } => {
                ZoneShape::Ellipse(Rect::new(Pos::new(x, y), Size::new(w, h)))
            }
        }
    }
}

impl From<ZoneShape> for ZoneShapeRow {
    fn from(shape: ZoneShape) -> ZoneShapeRow {
        match shape {
            ZoneShape::Rect(r) => ZoneShapeRow::Rect {
                x: r.origin.x,
                y: r.origin.y,
                w: r.size.width,
                h: r.size.height,
            },
            ZoneShape::Ellipse(r) => ZoneShapeRow::Ellipse {
                x: r.origin.x,
                y: r.origin.y,
                w: r.size.width,
                h: r.size.height,
            },
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SoundChannel {
    pub channel: u32,
    #[schemars(extend("x-asset" = "audio"))]
    pub file: AssetRef,
    #[serde(
        default = "serial::one_f32",
        skip_serializing_if = "serial::is_one_f32"
    )]
    pub volume: f32,
    #[serde(default, skip_serializing_if = "serial::is_zero_f32")]
    pub pan: f32,
}

impl SoundscapeDef {
    fn check(&self, pointer: &str, cx: &mut RowCheck) {
        cx.range(format!("{pointer}/emit"), self.emit, 0.0, 32.0, "tiles");
        cx.count(
            format!("{pointer}/channels"),
            self.channels.len(),
            1,
            8,
            "channels",
        );
        for (index, channel) in self.channels.iter().enumerate() {
            let at = format!("{pointer}/channels/{index}");
            cx.range(
                format!("{at}/channel"),
                channel.channel,
                1,
                16,
                "a channel number",
            );
            cx.range(format!("{at}/volume"), channel.volume, 0.0, 4.0, "volume");
            cx.range(format!("{at}/pan"), channel.pan, -1.0, 1.0, "pan");
            if self.channels[..index]
                .iter()
                .any(|other| other.channel == channel.channel)
            {
                cx.error(
                    format!("{at}/channel"),
                    "duplicate name",
                    format!("channel {} twice", channel.channel),
                    "each channel number once per soundscape",
                );
            }
        }
    }

    pub fn zone(&self) -> SoundscapeZone {
        SoundscapeZone {
            shape: match self.shape {
                ZoneShape::Rect(r) => SoundscapeShape::Rect(r),
                ZoneShape::Ellipse(r) => SoundscapeShape::Ellipse(r),
            },
            emit: Tiles(self.emit),
            channels: self
                .channels
                .iter()
                .map(|channel| {
                    (
                        SoundscapeChannel(channel.channel),
                        SoundscapeLayer {
                            src: channel.file.clone(),
                            volume: channel.volume,
                            pan: channel.pan,
                        },
                    )
                })
                .collect::<BTreeMap<_, _>>(),
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scenery {
    #[schemars(with = "serial::PosRow")]
    #[serde(serialize_with = "serial::pos", deserialize_with = "serial::pos_from")]
    pub at: Pos<Tiles>,
    pub tileset: tileset::Id,
    pub tiles: Vec<Vec<Option<SceneryTile>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort: Option<f32>,
    #[serde(default, skip_serializing_if = "Flip::is_none")]
    pub flip: Flip,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocks: Vec<[i32; 2]>,
}

impl Scenery {
    fn check(&self, pointer: &str, cx: &mut RowCheck) {
        let width = self.tiles.first().map_or(0, Vec::len);
        if self.tiles.is_empty() || width == 0 {
            cx.error(
                format!("{pointer}/tiles"),
                "out of range",
                "no tiles",
                "at least one row of tiles",
            );
        }
        for (row, tiles) in self.tiles.iter().enumerate() {
            if tiles.len() != width {
                cx.error(
                    format!("{pointer}/tiles/{row}"),
                    "out of range",
                    format!("a row of {} tiles", tiles.len()),
                    format!("rows of {width} tiles, like the first"),
                );
            }
        }
        if let Some(sort) = self.sort {
            cx.range(
                format!("{pointer}/sort"),
                sort,
                0.0,
                self.tiles.len() as f32,
                "tiles from the top of the grid",
            );
        }
    }

    pub fn height(&self) -> usize {
        self.tiles.len()
    }

    pub fn width(&self) -> usize {
        self.tiles.first().map_or(0, Vec::len)
    }

    pub fn bounds(&self) -> Rect<Tiles> {
        Rect::new(
            self.at,
            Size::new(self.width() as f32, self.height() as f32),
        )
    }

    pub fn sort_line(&self) -> Option<Tiles> {
        let sort = self.sort?;
        Some(Tiles(if self.flip.vertical() {
            self.at.y - self.height() as f32 + sort
        } else {
            self.at.y + sort
        }))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SceneryTile {
    pub tile: u32,
    pub flip: Flip,
}

impl Serialize for SceneryTile {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        if self.flip.is_none() {
            return serializer.serialize_u32(self.tile);
        }
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("tile", &self.tile)?;
        map.serialize_entry("flip", &self.flip)?;
        map.end()
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(untagged)]
enum SceneryTileRow {
    Tile(u32),
    Flipped {
        tile: u32,
        #[serde(default)]
        flip: Flip,
    },
}

impl<'de> Deserialize<'de> for SceneryTile {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<SceneryTile, D::Error> {
        Ok(match SceneryTileRow::deserialize(deserializer)? {
            SceneryTileRow::Tile(tile) => SceneryTile {
                tile,
                flip: Flip::None,
            },
            SceneryTileRow::Flipped { tile, flip } => SceneryTile { tile, flip },
        })
    }
}

impl JsonSchema for SceneryTile {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("SceneryTile")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        SceneryTileRow::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Population {
    pub npc: NpcId,
    pub count: u32,
    #[schemars(with = "Option<serial::RectRow>")]
    #[serde(
        default,
        serialize_with = "serial::opt_rect",
        deserialize_with = "serial::opt_rect_from",
        skip_serializing_if = "Option::is_none"
    )]
    pub roams: Option<Rect<Tiles>>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Resident {
    pub npc: NpcId,
    #[schemars(with = "serial::PosRow")]
    #[serde(serialize_with = "serial::pos", deserialize_with = "serial::pos_from")]
    pub at: Pos<Tiles>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shown: Option<Condition>,
}

pub struct PlacedModules(pub Vec<Vec<Flattened>>);

pub struct PlacedBlueprints(pub Vec<Vec<PlacedBlueprint>>);

pub fn placed(content: &Content, area: Id) -> &'static [Flattened] {
    content
        .built::<PlacedModules>()
        .0
        .get(area.index())
        .map_or(&[], Vec::as_slice)
}

pub fn placements(content: &Content, area: Id) -> &'static [PlacedBlueprint] {
    content
        .built::<PlacedBlueprints>()
        .0
        .get(area.index())
        .map_or(&[], Vec::as_slice)
}

pub fn modules(content: &Content, area: Id) -> impl Iterator<Item = &'static AreaModule> {
    placed(content, area).iter().map(|placed| &placed.module)
}

pub fn objects(modules: &[Flattened]) -> impl Iterator<Item = (u32, &ObjectDef)> {
    modules
        .iter()
        .enumerate()
        .filter_map(|(index, placed)| match &placed.module {
            AreaModule::Object(object) => Some((index as u32, object)),
            _ => None,
        })
}

pub fn npcs(modules: &[Flattened]) -> impl Iterator<Item = NpcId> + '_ {
    modules.iter().filter_map(|placed| match &placed.module {
        AreaModule::Resident(resident) => Some(resident.npc),
        AreaModule::Population(population) => Some(population.npc),
        _ => None,
    })
}

pub fn residents(modules: &[Flattened]) -> impl Iterator<Item = NpcId> + '_ {
    modules.iter().filter_map(|placed| match &placed.module {
        AreaModule::Resident(resident) => Some(resident.npc),
        _ => None,
    })
}

pub fn walkable(world: &World, tile: Pos<Tiles>) -> bool {
    crate::systems::player::session::my_character(world)
        .map(|me| me.id())
        .and_then(|entity| of(world, entity))
        .is_some_and(|area| area.grid.walkable(tile))
}

pub struct Area {
    pub size: Size<Tiles>,
    pub tile: u32,
    pub grid: movement::Grid,
    pub wild_grid: movement::Grid,
    pub airspace: movement::Grid,
    pub wild_airspace: movement::Grid,
    pub safe_zones: Vec<Rect<Tiles>>,
    pub safe_cells: Vec<bool>,
    pub footsteps: Vec<Option<SfxId>>,
    pub soundscape: Vec<SoundscapeZone>,
    pub grids: &'static AreaGrids,
    pub scenery: Vec<&'static Scenery>,
}

impl Area {
    pub fn safe(&self, at: Pos<Tiles>) -> bool {
        at.cell()
            .index(self.size.grid())
            .is_some_and(|index| self.safe_cells[index])
    }

    pub fn grid_for(&self, wild: bool) -> &movement::Grid {
        if wild { &self.wild_grid } else { &self.grid }
    }

    pub fn airspace_for(&self, wild: bool) -> &movement::Grid {
        if wild {
            &self.wild_airspace
        } else {
            &self.airspace
        }
    }

    pub fn sort_base(&self) -> f32 {
        self.grids.ground.len() as f32
    }

    pub fn footstep_at(&self, c: CellPos) -> Option<&SfxId> {
        let i = c.index(self.size.grid())?;
        self.footsteps[i].as_ref()
    }

    pub fn fallback_spawn(&self) -> Pos<Tiles> {
        self.grid
            .nearest_walkable(self.center())
            .unwrap_or_else(|| self.center())
    }

    pub fn center(&self) -> Pos<Tiles> {
        Pos::new(
            (self.size.width / 2.0).floor(),
            (self.size.height / 2.0).floor(),
        )
    }
}

pub struct Areas(Vec<Option<Area>>);

pub struct AreaGridSet(Vec<Option<AreaGrids>>);

pub fn load(content: &Content, area: Id) -> &'static Area {
    content
        .built::<Areas>()
        .0
        .get(area.index())
        .and_then(Option::as_ref)
        .unwrap_or_else(|| panic!("area {} failed to load", area.key(content)))
}

pub fn of(world: &World, entity: Entity) -> Option<&'static Area> {
    let area = world.get::<AreaTag>(entity)?.area;
    Some(load(world.resource::<Content>(), area))
}

fn read_grids(loading: &mut Loading) {
    let content = loading.content();
    let sizes = content.built::<ImageSizes>();
    let mut grids: Vec<Option<AreaGrids>> = content.ids::<AreaDef>().map(|_| None).collect();
    for (id, def) in loading.rows::<AreaDef>() {
        let map = def.map();
        let folder = grid::folder(id.key(&content));
        let files = loading.row_folder(id);
        let mut expected: Vec<String> =
            vec![grid::PALETTE_FILE.to_owned(), grid::WALK_FILE.to_owned()];
        expected.extend(map.ground.iter().map(|layer| grid::layer_file(layer)));
        for file in &files {
            if !expected.contains(file) {
                loading.file_error(
                    format!("{folder}/{file}"),
                    ErrorPlace::WholeFile,
                    "unknown entry",
                    format!("file {file}"),
                    format!("only {}", expected.join(", ")),
                    None,
                );
            }
        }
        let mut errors: Vec<LoadError> = Vec::new();
        let read = |name: &str, pointer: &str, loading: &mut Loading| -> Option<String> {
            let file = format!("{folder}/{name}");
            if !files.contains(&name.to_owned()) {
                loading.row_error(
                    id,
                    pointer,
                    "missing file",
                    format!("no {name} in {folder}/"),
                    format!("{file} beside the row"),
                    None,
                );
                return None;
            }
            match loading.read_text(&file) {
                Ok(text) => Some(text),
                Err(error) => {
                    loading.file_error(
                        file,
                        ErrorPlace::WholeFile,
                        "unreadable file",
                        error,
                        "a UTF-8 CSV file",
                        None,
                    );
                    None
                }
            }
        };
        let palette_text = read(grid::PALETTE_FILE, "/map", loading);
        let walk_text = read(grid::WALK_FILE, "/map", loading);
        let layer_texts: Vec<Option<String>> = map
            .ground
            .iter()
            .enumerate()
            .map(|(index, layer)| {
                read(
                    &format!("{layer}.csv"),
                    &format!("/map/ground/{index}"),
                    loading,
                )
            })
            .collect();
        let (Some(palette_text), Some(walk_text)) = (palette_text, walk_text) else {
            loading.fail(id);
            continue;
        };
        if layer_texts.iter().any(Option::is_none) {
            loading.fail(id);
            continue;
        }
        let size = map.size.grid();
        let palette_file = format!("{folder}/{}", grid::PALETTE_FILE);
        let Some(rows) = grid::read_palette(
            grid::GridFile {
                path: &palette_file,
                text: &palette_text,
            },
            &mut errors,
        ) else {
            loading.extend_errors(errors);
            loading.fail(id);
            continue;
        };
        let tilesets = content.table::<tileset::TilesetDef>();
        let mut palette: Vec<PaletteEntry> = Vec::new();
        let mut palette_keys = Vec::new();
        let mut ok = true;
        for (index, row) in rows.iter().enumerate() {
            let at = ErrorPlace::Csv {
                row: index + 2,
                column: 1,
            };
            let Some(tileset_id) = tilesets.id_of(&row.tileset) else {
                errors.push(LoadError {
                    file: palette_file.clone(),
                    at,
                    rule: "unknown row",
                    found: format!("{:?}", row.tileset),
                    expected: "the key of a tileset row".to_owned(),
                    nearest: crate::core::content::id::nearest(tilesets.keys(), &row.tileset)
                        .map(|n| format!("{n:?}")),
                });
                ok = false;
                continue;
            };
            if let Some(tileset) = tilesets.get(tileset_id) {
                if tileset.tile != map.tile {
                    errors.push(LoadError {
                        file: palette_file.clone(),
                        at: at.clone(),
                        rule: "tile size mismatch",
                        found: format!("{} against {}", map.tile, tileset.tile),
                        expected: format!("tilesets of {} px tiles, the area's", map.tile),
                        nearest: None,
                    });
                    ok = false;
                }
                if let Some(&(width, height)) = sizes.0.get(tileset.image.as_str()) {
                    let count = tileset.grid(width, height).count();
                    if row.tile >= count {
                        errors.push(LoadError {
                            file: palette_file.clone(),
                            at: ErrorPlace::Csv {
                                row: index + 2,
                                column: 2,
                            },
                            rule: "tile out of range",
                            found: format!("tile {} of {count}", row.tile),
                            expected: format!("0 to {}", count.saturating_sub(1)),
                            nearest: None,
                        });
                        ok = false;
                    }
                }
            } else {
                ok = false;
            }
            palette.push(PaletteEntry {
                tileset: tileset_id,
                tile: row.tile,
                flip: row.flip,
            });
            palette_keys.push(row.clone());
        }
        let entries = palette.len();
        let mut ground: Vec<grid::GroundLayer> = Vec::new();
        for (layer, text) in map.ground.iter().zip(layer_texts.iter().flatten()) {
            let file = format!("{folder}/{}", grid::layer_file(layer));
            let cells = grid::read_grid(
                grid::GridFile { path: &file, text },
                size,
                |field| {
                    if field.is_empty() {
                        return Ok(None);
                    }
                    let index: u32 = field
                        .parse()
                        .map_err(|_| "empty or a palette index".to_owned())?;
                    if index as usize >= entries {
                        return Err(format!(
                            "0 to {}, an index into the area's {entries} palette entries",
                            entries.saturating_sub(1)
                        ));
                    }
                    Ok(Some(index))
                },
                &mut errors,
            );
            match cells {
                Some(cells) => ground.push(grid::GroundLayer {
                    name: layer.clone(),
                    cells,
                }),
                None => ok = false,
            }
        }
        let walk_file = format!("{folder}/{}", grid::WALK_FILE);
        let walk = grid::read_grid(
            grid::GridFile {
                path: &walk_file,
                text: &walk_text,
            },
            size,
            |field| match field {
                "" => Ok(None),
                "1" => Ok(Some(true)),
                "0" => Ok(Some(false)),
                _ => Err("empty, 1 or 0".to_owned()),
            },
            &mut errors,
        );
        loading.extend_errors(errors);
        let Some(walk) = walk else {
            loading.fail(id);
            continue;
        };
        if !ok {
            loading.fail(id);
            continue;
        }
        grids[id.index()] = Some(AreaGrids {
            size,
            palette,
            palette_keys,
            ground,
            walk,
        });
    }
    loading.built(AreaGridSet(grids));
}

fn flatten_all(loading: &mut Loading) {
    let content = loading.content();
    let mut placed: Vec<Vec<Flattened>> = content.ids::<AreaDef>().map(|_| Vec::new()).collect();
    let mut placements: Vec<Vec<PlacedBlueprint>> =
        content.ids::<AreaDef>().map(|_| Vec::new()).collect();
    for (id, def) in loading.rows::<AreaDef>() {
        let mut errors = Vec::new();
        let flattening = blueprint::flatten(&content, &def.modules, &mut errors);
        if !errors.is_empty() {
            loading.fail(id);
        }
        for error in errors {
            match error.at {
                blueprint::FlattenAt::Area(pointer) => loading.row_error(
                    id,
                    &pointer,
                    error.rule,
                    error.found,
                    error.expected,
                    error.nearest,
                ),
                blueprint::FlattenAt::Blueprint(blueprint, pointer) => loading.row_error(
                    blueprint,
                    &pointer,
                    error.rule,
                    error.found,
                    error.expected,
                    error.nearest,
                ),
            }
        }
        placed[id.index()] = flattening.modules;
        placements[id.index()] = flattening.placements;
    }
    loading.built(PlacedModules(placed));
    loading.built(PlacedBlueprints(placements));
}

fn build_all(loading: &mut Loading) {
    let content = loading.content();
    let grids = content.built::<AreaGridSet>();
    let sizes = content.built::<ImageSizes>();
    let mut areas: Vec<Option<Area>> = content.ids::<AreaDef>().map(|_| None).collect();
    for (id, def) in loading.rows::<AreaDef>() {
        let Some(grids) = grids.0[id.index()].as_ref() else {
            continue;
        };
        let modules = placed(&content, id);
        let map = def.map();
        let mut check = RowCheck::default();
        check_bounds(&content, map, modules, sizes, &mut check);
        let safe_zones: Vec<Rect<Tiles>> = modules
            .iter()
            .filter_map(|placed| match &placed.module {
                AreaModule::SafeZone(zone) => Some(zone.rect),
                _ => None,
            })
            .collect();
        let flat: Vec<AreaModule> = modules.iter().map(|placed| placed.module.clone()).collect();
        let walk = walk::grids(&content, grids, &flat, &safe_zones);
        let size = map.size.grid();
        let area = Area {
            size: map.size.tiles(),
            tile: map.tile,
            grid: movement::Grid::new(size, walk.walk),
            wild_grid: movement::Grid::new(size, walk.wild),
            airspace: movement::Grid::new(size, walk.airspace),
            wild_airspace: movement::Grid::new(size, walk.wild_airspace),
            safe_zones,
            safe_cells: walk.safe_cells,
            footsteps: walk.footsteps,
            soundscape: modules
                .iter()
                .filter_map(|placed| match &placed.module {
                    AreaModule::Soundscape(soundscape) => Some(soundscape.zone()),
                    _ => None,
                })
                .collect(),
            grids,
            scenery: modules
                .iter()
                .filter_map(|placed| match &placed.module {
                    AreaModule::Scenery(scenery) => Some(scenery),
                    _ => None,
                })
                .collect(),
        };
        check_placed(&content, id, &area, modules, &mut check);
        loading.row_errors(id, check);
        areas[id.index()] = Some(area);
    }
    loading.built(Areas(areas));
}

fn module_pointer(placed: &Flattened) -> String {
    format!("/modules/{}", placed.origin)
}

fn check_bounds(
    content: &Content,
    map: &Tilemap,
    modules: &[Flattened],
    sizes: &ImageSizes,
    check: &mut RowCheck,
) {
    let bounds = map.size.tiles().bounds();
    let outside = |at: Pos<Tiles>| !bounds.contains(at);
    for placed in modules {
        let pointer = module_pointer(placed);
        let what = placed.describe(content);
        let out = |check: &mut RowCheck, at: Pos<Tiles>| {
            check.error(
                pointer.clone(),
                "outside the map",
                format!("{what} lands outside the map at {}, {}", at.x, at.y),
                format!(
                    "everything inside the {} × {} map",
                    map.size.width, map.size.height
                ),
            );
        };
        match &placed.module {
            AreaModule::Object(object) => {
                let b = object.shape.bounds();
                if outside(b.min())
                    || outside(b.max() - crate::core::math::Offset::new(0.001, 0.001))
                {
                    out(check, object.shape.origin());
                }
            }
            AreaModule::Scenery(scenery) => {
                let tileset = scenery.tileset.get(content);
                if tileset.tile != map.tile {
                    check.error(
                        format!("{pointer}/tileset"),
                        "tile size mismatch",
                        format!("{} against {}", map.tile, tileset.tile),
                        format!("tilesets of {} px tiles, the area's", map.tile),
                    );
                }
                let count = sizes
                    .0
                    .get(tileset.image.as_str())
                    .map(|&(w, h)| tileset.grid(w, h).count());
                for (row, tiles) in scenery.tiles.iter().enumerate() {
                    for (column, tile) in tiles.iter().enumerate() {
                        let Some(tile) = tile else {
                            continue;
                        };
                        let square = walk::tile_square(scenery, column, row);
                        if outside(square.origin) {
                            out(check, square.origin);
                        }
                        if let Some(count) = count
                            && tile.tile >= count
                        {
                            check.error(
                                format!("{pointer}/tiles/{row}/{column}"),
                                "tile out of range",
                                format!("tile {} of {count}", tile.tile),
                                format!("0 to {}", count.saturating_sub(1)),
                            );
                        }
                    }
                }
            }
            AreaModule::Resident(resident) => {
                if outside(resident.at) {
                    out(check, resident.at);
                }
            }
            AreaModule::Population(Population {
                roams: Some(roams), ..
            }) if outside(roams.min()) => out(check, roams.min()),
            _ => {}
        }
    }
}

fn check_placed(
    content: &Content,
    id: Id,
    area: &Area,
    modules: &[Flattened],
    check: &mut RowCheck,
) {
    let scripts = content
        .has_built::<RiftScripts>()
        .then(|| content.built::<RiftScripts>());
    let warps: Vec<(u32, &ObjectDef, String)> = objects(modules)
        .filter(|(index, _)| {
            scripts.is_some_and(|scripts| {
                scripts
                    .may_do(OwnerRow {
                        kind: OwnerKind::Object,
                        row: id.raw(),
                        object: Some(*index),
                    })
                    .reaches
                    .iter()
                    .any(|reach| matches!(reach, Reach::Warp(_)))
            })
        })
        .map(|(index, object)| {
            (
                index,
                object,
                object
                    .name
                    .clone()
                    .or_else(|| object.label.clone())
                    .unwrap_or_else(|| format!("object {index}")),
            )
        })
        .collect();
    let in_warp = |at: Pos<Tiles>| {
        warps
            .iter()
            .find(|(_, object, _)| object.shape.covers(at))
            .map(|(_, _, name)| name.clone())
    };
    let nearest_cell = |at: Pos<Tiles>| {
        area.grid
            .nearest_walkable(at)
            .map(|cell| format!("{}, {}", cell.x, cell.y))
    };
    let mut names: Vec<(String, String)> = Vec::new();
    let mut seen_residents: Vec<NpcId> = Vec::new();
    for placed in modules {
        let pointer = module_pointer(placed);
        match &placed.module {
            AreaModule::Object(object) => {
                if let Some(name) = &object.name {
                    if let Some((_, first)) =
                        names.iter().find(|(n, _)| n.eq_ignore_ascii_case(name))
                    {
                        check.error(
                            pointer.clone(),
                            "duplicate name",
                            format!("{name}, from {} and {}", first, placed.describe(content)),
                            "object names unique in the area ignoring case",
                        );
                    } else {
                        names.push((name.clone(), placed.describe(content)));
                    }
                }
                if let ObjectShape::Point(at) = object.shape
                    && !area.grid.walkable(at)
                {
                    check.nearest(
                        format!("{pointer}/shape"),
                        "not walkable",
                        format!("{}, {}", at.x, at.y),
                        "a point object on a walkable cell",
                        nearest_cell(at),
                    );
                }
            }
            AreaModule::Resident(resident) => {
                let key = resident.npc.key(content);
                if seen_residents.contains(&resident.npc) {
                    check.error(
                        pointer.clone(),
                        "resident twice",
                        format!("{key} in {}", id.key(content)),
                        "each npc resident once per area",
                    );
                }
                seen_residents.push(resident.npc);
                if !area.grid.walkable(resident.at) {
                    check.nearest(
                        format!("{pointer}/at"),
                        "not walkable",
                        format!("{} {}, {}", key, resident.at.x, resident.at.y),
                        "a resident on a walkable cell",
                        nearest_cell(resident.at),
                    );
                } else if let Some(door) = in_warp(resident.at) {
                    check.error(
                        format!("{pointer}/at"),
                        "in a warp object",
                        format!(
                            "{key} {}, {} inside object {door}",
                            resident.at.x, resident.at.y
                        ),
                        "a spot outside every warp object",
                    );
                }
            }
            AreaModule::Population(population) => {
                let ground = area.wild_grid.nodes();
                let has_ground = match population.roams {
                    Some(bounds) => ground.iter().any(|&node| bounds.contains(node)),
                    None => !ground.is_empty(),
                };
                if !has_ground {
                    check.error(
                        pointer.clone(),
                        "no wild ground",
                        format!("{} in {}", population.npc.key(content), id.key(content)),
                        "a walkable cell outside every safe zone to spawn on",
                    );
                }
            }
            _ => {}
        }
    }
    for (index, (object_index, object, name)) in warps.iter().enumerate() {
        let pointer = format!("/modules/{}", modules[*object_index as usize].origin);
        let covered = object
            .shape
            .bounds()
            .tiles()
            .any(|cell| object.shape.covers_cell(cell) && area.grid.walkable(cell.center()));
        if !covered {
            check.error(
                pointer.clone(),
                "warp object has no ground",
                name.clone(),
                "a warp object covering at least one walkable cell",
            );
        }
        for (_, other, other_name) in &warps[index + 1..] {
            if object.shape.overlaps(&other.shape) {
                check.error(
                    pointer.clone(),
                    "warp objects overlap",
                    format!("{name} and {other_name}"),
                    "warp objects that never overlap",
                );
            }
        }
    }
}

pub struct PlaceProblem {
    pub rule: &'static str,
    pub found: String,
    pub expected: String,
    pub nearest: Option<String>,
}

pub fn check_place(content: &Content, place: script::Place) -> Result<(), PlaceProblem> {
    let Some(area) = content
        .built::<Areas>()
        .0
        .get(place.area.index())
        .and_then(Option::as_ref)
    else {
        return Ok(());
    };
    let key = place.area.key(content);
    let modules = placed(content, place.area);
    let scripts = content.built::<RiftScripts>();
    let warp_objects: Vec<(u32, &ObjectDef)> = objects(modules)
        .filter(|(index, _)| {
            scripts
                .may_do(OwnerRow {
                    kind: OwnerKind::Object,
                    row: place.area.raw(),
                    object: Some(*index),
                })
                .reaches
                .iter()
                .any(|reach| matches!(reach, Reach::Warp(_)))
        })
        .collect();
    let problem = |rule: &'static str, found: String| {
        let nearest = area
            .grid
            .nodes()
            .iter()
            .filter(|cell| {
                !warp_objects
                    .iter()
                    .any(|(_, object)| object.shape.covers(**cell))
            })
            .min_by(|a, b| a.distance(place.at).0.total_cmp(&b.distance(place.at).0))
            .map(|cell| format!("{}, {}", cell.x, cell.y));
        PlaceProblem {
            rule,
            found,
            expected: format!("a place on a walkable cell of {key}, outside every warp object"),
            nearest,
        }
    };
    if !walk::in_map(area.size.grid(), place.at) || !area.grid.walkable(place.at) {
        return Err(problem(
            "not walkable",
            format!("{key} {}, {}", place.at.x, place.at.y),
        ));
    }
    for (index, object) in &warp_objects {
        if object.shape.covers(place.at) {
            let name = object
                .name
                .clone()
                .or_else(|| object.label.clone())
                .unwrap_or_else(|| format!("object {index}"));
            return Err(problem(
                "in a warp object",
                format!("{key} {}, {} inside object {name}", place.at.x, place.at.y),
            ));
        }
    }
    Ok(())
}

fn write_grids(content: &Content, writer: &mut FileWriter) -> io::Result<()> {
    let grids = content.built::<AreaGridSet>();
    for (id, _) in content.table::<AreaDef>().iter() {
        let Some(grids) = grids.0[id.index()].as_ref() else {
            continue;
        };
        let folder = grid::folder(id.key(content));
        writer.file(
            &format!("{folder}/{}", grid::PALETTE_FILE),
            grids.write_palette().as_bytes(),
        )?;
        writer.file(
            &format!("{folder}/{}", grid::WALK_FILE),
            grids.write_walk().as_bytes(),
        )?;
        for layer in &grids.ground {
            writer.file(
                &format!("{folder}/{}", grid::layer_file(&layer.name)),
                grids.write_layer(layer).as_bytes(),
            )?;
        }
    }
    Ok(())
}
