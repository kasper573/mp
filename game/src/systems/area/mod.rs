pub mod load;
pub mod object;
pub mod transition;
pub mod warp;

pub use load::build_area;
pub use object::{AreaObject, ObjectDef, ObjectShape};

use std::collections::HashSet;

use bevy_app::App;
use bevy_ecs::component::Component;
use bevy_ecs::entity::Entity;
use bevy_ecs::world::World;
use serde::{Deserialize, Serialize};

use crate::core::assets::{AssetRef, AssetService};
use crate::core::audio::playback::SfxId;
use crate::core::audio::soundscape::SoundscapeZone;
use crate::core::math::{Pos, Rect, Size};
use crate::core::tiling::{Cell, CellPos, GridSize, TilePos, TileSize, Tiles};
use crate::data;
use crate::systems::movement;
use crate::systems::script::{Condition, ScriptModule};

pub use crate::data::area::Id;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<AreaTag>();
    object::register(app);
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

#[derive(Clone)]
pub struct AreaDef {
    pub name: &'static str,
    pub map: AssetRef,
    pub modules: &'static [AreaModule],
}

impl crate::core::content::ContentRow for AreaDef {
    const TABLE: &'static str = "area";
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AreaModule {
    Object(ObjectDef),
    Population {
        npc: data::npc::Id,
        count: u32,
        #[serde(
            serialize_with = "crate::core::content::serial::opt_rect",
            skip_serializing_if = "Option::is_none"
        )]
        roams: Option<Rect<Tiles>>,
    },
    Resident {
        npc: data::npc::Id,
        at: Pos<Tiles>,
        #[serde(skip_serializing_if = "Option::is_none")]
        shown: Option<&'static Condition>,
    },
    #[serde(untagged)]
    Script(ScriptModule),
}

impl AreaDef {
    pub fn objects(&self) -> impl Iterator<Item = (u32, &ObjectDef)> {
        self.modules
            .iter()
            .enumerate()
            .filter_map(|(index, module)| match module {
                AreaModule::Object(object) => Some((index as u32, object)),
                _ => None,
            })
    }

    pub fn residents(&self) -> impl Iterator<Item = data::npc::Id> + '_ {
        self.modules.iter().filter_map(|module| match module {
            AreaModule::Resident { npc, .. } => Some(*npc),
            _ => None,
        })
    }

    pub fn scripts(&self) -> Vec<ScriptModule> {
        self.modules
            .iter()
            .filter_map(|module| match module {
                AreaModule::Script(script) => Some(script.clone()),
                _ => None,
            })
            .collect()
    }
}

pub fn walkable(world: &World, tile: Pos<Tiles>) -> bool {
    crate::systems::player::session::my_character(world)
        .map(|me| me.id())
        .and_then(|entity| of(world, entity))
        .is_some_and(|area| area.grid.walkable(tile))
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct TileRef(u32);

impl TileRef {
    const EMPTY: TileRef = TileRef(0);

    fn new(index: usize) -> TileRef {
        TileRef(index as u32 + 1)
    }

    fn index(self) -> Option<usize> {
        match self.0 {
            0 => None,
            index => Some(index as usize - 1),
        }
    }
}

#[derive(Clone)]
pub struct RenderLayer {
    pub dynamic: bool,
    size: GridSize,
    cells: Vec<TileRef>,
}

impl RenderLayer {
    pub fn at(&self, c: CellPos) -> TileRef {
        c.index(self.size).map_or(TileRef::EMPTY, |i| self.cells[i])
    }
}

#[derive(Clone)]
pub struct Group {
    pub bottom: Tiles,
    pub tiles: Vec<CellPos>,
}

#[derive(Clone)]
pub struct Area {
    pub size: Size<Tiles>,
    pub grid: movement::Grid,
    pub tile_sfx: Vec<Option<SfxId>>,
    pub wild_grid: movement::Grid,
    pub airspace: movement::Grid,
    pub wild_airspace: movement::Grid,
    pub safe_zones: Vec<Rect<Tiles>>,
    pub safe_cells: Vec<bool>,
    pub spawn: Pos<Tiles>,
    pub obscuring_rects: Vec<Rect<Tiles>>,
    pub groups: Vec<Group>,
    pub grouped_cells: HashSet<CellPos>,
    pub layers: Vec<RenderLayer>,
    pub soundscape: Vec<SoundscapeZone>,
    pub map: std::sync::Arc<tiled::Map>,
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

    pub fn obscured_amount(&self, c: CellPos) -> f32 {
        self.obscuring_rects
            .iter()
            .map(|rect| cell_overlap(rect, c))
            .fold(0.0, f32::max)
    }

    pub fn dynamic_layer(&self) -> usize {
        self.layers
            .iter()
            .position(|layer| layer.dynamic)
            .expect("validated at load: every map has a 'Dynamic' layer")
    }

    pub fn tile_sfx_at(&self, c: CellPos) -> Option<&SfxId> {
        let i = c.index(self.size.grid())?;
        self.tile_sfx[i].as_ref()
    }
}

pub fn check(assets: &AssetService) {
    let content = assets.content();
    let table = content.table::<AreaDef>();
    let areas = assets.resolve_all(table.rows().iter().map(|def| def.map), build_area);
    for (id, area) in table.ids().zip(areas) {
        let def = id.get(content);
        for module in def.modules {
            match module {
                AreaModule::Population { npc, roams, .. } => {
                    let ground = area.wild_grid.nodes();
                    let has_ground = match roams {
                        Some(bounds) => ground.iter().any(|&node| bounds.contains(node)),
                        None => !ground.is_empty(),
                    };
                    if !has_ground {
                        panic!("area {id:?}: {npc:?} roams ground that lies inside the safe zones");
                    }
                }
                AreaModule::Resident { npc, at, shown } => {
                    if !area.grid.walkable(*at) {
                        panic!("area {id:?}: {npc:?} stands at {at:?}, which isn't walkable");
                    }
                    if let Some(shown) = shown
                        && let Err(error) = crate::systems::script::condition::check(content, shown)
                    {
                        panic!("area {id:?}: {npc:?} shown: {error}");
                    }
                }
                AreaModule::Object(object) => {
                    if let Some(shown) = object.shown
                        && let Err(error) = crate::systems::script::condition::check(content, shown)
                    {
                        panic!("area {id:?}: object {:?} shown: {error}", object.name);
                    }
                }
                AreaModule::Script(_) => {}
            }
        }
        for layer in area
            .soundscape
            .iter()
            .flat_map(|zone| zone.channels.values())
        {
            if let Err(error) = assets.open(std::path::Path::new(&layer.src)) {
                panic!("area {id:?}: soundscape track {}: {error}", layer.src);
            }
        }
    }
}

pub fn load(assets: &AssetService, area: Id) -> &'static Area {
    assets.resolve(area.get(assets.content()).map, build_area)
}

pub fn of(world: &World, entity: Entity) -> Option<&'static Area> {
    let area = world.get::<AreaTag>(entity)?.area;
    Some(load(world.resource::<AssetService>(), area))
}

fn cell_overlap(rect: &Rect<Tiles>, c: CellPos) -> f32 {
    rect.intersection(&c.bounds())
        .map_or(0.0, |overlap| overlap.area())
}
