use std::ops::RangeInclusive;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use engine::core::content::{
    Content, ContentId, ContentRow, ContentScope, FilesystemFolder, with_content,
};
use engine::core::math::{Offset, Pos, Rect};
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::area::{self, Area, AreaDef, AreaModule};
use engine::systems::input::map::{InputAction, InputMap};
use engine::systems::load_content;
use engine::systems::probe::ProbeSnapshot;
use engine::systems::script::Place;
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::seen::{area_key, clickable_point};

/// The content the driver reads names and places from: the one the server it drives plays.
pub fn content() -> &'static Content {
    CONTENT
        .get()
        .expect("a session loads the content before anything reads it")
}

pub(crate) fn load(folder: &Path) {
    CONTENT.get_or_init(|| {
        load_content(
            Arc::new(FilesystemFolder(folder.to_path_buf())),
            "the driver did not start",
        )
        .unwrap_or_else(|report| panic!("{report}"))
    });
}

static CONTENT: OnceLock<Content> = OnceLock::new();

pub fn input_name(action: InputAction) -> String {
    input_names(action)
        .into_iter()
        .next()
        .unwrap_or_else(|| panic!("{action:?} has no binding"))
}

pub fn input_names(action: InputAction) -> Vec<String> {
    InputMap::new(content())
        .bindings(action)
        .iter()
        .map(|binding| binding.name())
        .collect()
}

pub fn id<Row: ContentRow>(name: &str) -> ContentId<Row> {
    content()
        .by_key::<Row>(name)
        .unwrap_or_else(|| panic!("no {} named {name}", Row::TABLE))
}

/// Content ids travel by key, so JSON is read and written within the content's scope.
pub fn to_json(value: &impl Serialize) -> String {
    let (json, _) = with_content(ContentScope::of(content()), || {
        serde_json::to_string(value).expect("serializable")
    });
    json
}

pub fn from_json<T: DeserializeOwned>(json: &str) -> T {
    let (value, _) = with_content(ContentScope::of(content()), || serde_json::from_str(json));
    value.unwrap_or_else(|error| panic!("unreadable {}: {error}", std::any::type_name::<T>()))
}

pub fn area_named(name: &str) -> &'static Area {
    area::load(content(), id::<AreaDef>(name))
}

/// Where the townsperson lives: standing there puts a player at their feet.
pub fn resident_home(area: &str, npc: &str) -> Place {
    area::residence(content(), id(npc))
        .filter(|home| home.area == id(area))
        .unwrap_or_else(|| panic!("nobody named {npc:?} lives in {area}"))
}

/// The middle of the ground where the monster roams: its own corner of the area, or all of it.
pub fn hunting_ground(area: &str, npc: &str) -> Pos<Tiles> {
    let npc = id(npc);
    let whole = Rect::from_size(area_named(area).size);
    area::modules(content(), id(area))
        .find_map(|module| match module {
            AreaModule::Population(population) if population.npc == npc => {
                Some(population.roams.unwrap_or(whole).center())
            }
            _ => None,
        })
        .unwrap_or_else(|| panic!("no {npc:?} roams {area}"))
}

/// The middle of the tightest ground a pack of the monster keeps to: where several of them stand
/// close enough together for one cast to reach them all.
pub fn pack_ground(area: &str, npc: &str) -> Pos<Tiles> {
    let npc = id(npc);
    area::modules(content(), id(area))
        .filter_map(|module| match module {
            AreaModule::Population(population) if population.npc == npc => population.roams,
            _ => None,
        })
        .min_by(|a, b| (a.size.width * a.size.height).total_cmp(&(b.size.width * b.size.height)))
        .map(|roams| roams.center())
        .unwrap_or_else(|| panic!("no {npc:?} keeps to a ground in {area}"))
}

/// A place `by` tiles east of a spot and a tile down from its row, clear of whoever stands there.
pub fn east_of(area: &str, spot: Pos<Tiles>, by: f32) -> Place {
    Place {
        area: id(area),
        at: spot + Offset::new(by, 1.0),
    }
}

/// A marked spot: a named object, or where a townsperson lives.
pub fn marker_at(area: &str, name: &str) -> Pos<Tiles> {
    placed_object(area, name).unwrap_or_else(|| resident_home(area, name).at)
}

/// Ground in view beside the player, farthest from anyone first, so nobody strolls under the
/// pointer.
pub fn open_ground_beside(snapshot: &ProbeSnapshot) -> Vec<Pos<Tiles>> {
    let me = snapshot.me.as_ref().expect("the player").at;
    let room = |tile: &Pos<Tiles>| {
        snapshot
            .actors
            .iter()
            .map(|actor| actor.at.distance_to(*tile))
            .fold(f32::INFINITY, f32::min)
    };
    let mut ground: Vec<Pos<Tiles>> = ground_near(
        area_key(snapshot).expect("an area"),
        me,
        Tiles(2.0)..=Tiles(4.0),
    )
    .into_iter()
    .filter(|tile| clickable_point(snapshot, *tile).is_some())
    .collect();
    ground.sort_by(|a, b| room(b).total_cmp(&room(a)));
    ground
}

/// Nearest first, and only what can be walked to from the spot.
pub fn ground_near(area: &str, at: Pos<Tiles>, within: RangeInclusive<Tiles>) -> Vec<Pos<Tiles>> {
    let grid = &area_named(area).grid;
    let reach = grid.region(grid.nearest_walkable(at).expect("walkable ground near"));
    let mut ground: Vec<Pos<Tiles>> = grid
        .nodes()
        .iter()
        .copied()
        .filter(|tile| grid.region(*tile) == reach && within.contains(&tile.distance(at)))
        .collect();
    ground.sort_by(|a, b| a.distance_to(at).total_cmp(&b.distance_to(at)));
    ground
}

fn placed_object(area: &str, object: &str) -> Option<Pos<Tiles>> {
    area::objects(area::placed(content(), id(area)))
        .find(|(_, def)| def.name.as_deref() == Some(object))
        .map(|(_, def)| def.shape.center())
}
