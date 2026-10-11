use std::collections::HashSet;

use crate::core::audio::soundscape::Soundscape;
use crate::core::content::Content;
use crate::core::content::media::ImageSizes;
use crate::core::math::{Direction, Pos};
use crate::core::render::TILE;
use crate::core::render::transition::{self, WorldViewSystems};
use crate::core::tiling::Tiles;
use crate::core::time::Seconds;
use crate::systems::actor::Actor;
use crate::systems::area::{self, AreaTag, tileset};
use crate::systems::input::map::{self, InputAction};
use crate::systems::movement::RenderPosition;
use crate::systems::player::session::{self, Viewpoint};
use bevy::prelude::*;
use bevy::scene::EntityScene;
use ui::{RichPiece, RichText};

use crate::core::render::dynamic_z;
use crate::core::render::screen::ToScreen;

pub struct AreaPlugin;

impl Plugin for AreaPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SpawnedArea>()
            .init_resource::<Crossing>()
            .init_resource::<RetainedImages>()
            .add_plugins(bevy_tilemap::TilemapPlugin)
            .add_systems(
                Update,
                (
                    carry_view_across.before(WorldViewSystems),
                    (spawn_area_tiles, play_area_soundscape).in_set(WorldViewSystems),
                    retain_loaded_images,
                    sync_death_banner,
                )
                    .run_if(in_state(super::Scene::Area)),
            )
            .add_systems(
                OnExit(super::Scene::Area),
                (
                    crate::systems::scene::despawn_all::<DeathBanner>,
                    silence_soundscape,
                    forget_crossing,
                ),
            );
    }
}

/// A view held on screen this long without its new area becoming drawable is revealed regardless:
/// a missing image or a lost arrival must not hide the world for good.
const ARRIVAL_PATIENCE: Seconds = Seconds(5.0);

#[derive(Resource, Default)]
struct SpawnedArea {
    area: Option<crate::systems::area::Id>,
    images: Vec<Handle<Image>>,
}

#[derive(Resource, Default)]
struct Crossing {
    last_seen: Option<Pose>,
    held: Option<Held>,
}

#[derive(Clone, Copy)]
struct Pose {
    at: Pos<Tiles>,
    heading: Direction,
    area: area::Id,
}

#[derive(Clone, Copy)]
struct Held {
    since: Seconds,
    pose: Pose,
    /// The first frame that draws a newly drawable area uploads its images to the GPU, a long
    /// frame. The view is revealed only after it, so that frame passes under the full cover.
    rendered: bool,
}

fn carry_view_across(world: &mut World) {
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let Crossing { last_seen, held } = *world.resource::<Crossing>();
    let (last_seen, held) = match world.resource::<Viewpoint>().0 {
        Some(character) => match (pose_of(world, character), held, last_seen) {
            (None, _, _) => (last_seen, held),
            (Some(pose), None, Some(seen)) if seen.area != pose.area => {
                transition::freeze(world, seen.at, seen.heading);
                (Some(pose), Some(Held::new(now, seen)))
            }
            (Some(pose), Some(held), _) => {
                let drawable = area_drawable(world, pose.area);
                if now - held.since > ARRIVAL_PATIENCE || (drawable && held.rendered) {
                    transition::reveal(world, pose.at);
                    release_unshown_images(world);
                    (Some(pose), None)
                } else {
                    (
                        Some(pose),
                        Some(Held {
                            rendered: drawable,
                            ..held
                        }),
                    )
                }
            }
            (Some(pose), None, _) => (Some(pose), None),
        },
        None => match (held, last_seen) {
            (Some(_), _) if session::followed(world).is_none() => {
                transition::abort(world);
                (None, None)
            }
            (Some(held), _) if now - held.since > ARRIVAL_PATIENCE => {
                transition::reveal(world, held.pose.at);
                (None, None)
            }
            (None, Some(pose)) if session::followed(world).is_some() => {
                transition::freeze(world, pose.at, pose.heading);
                (None, Some(Held::new(now, pose)))
            }
            _ => (None, held),
        },
    };
    *world.resource_mut::<Crossing>() = Crossing { last_seen, held };
}

impl Held {
    fn new(since: Seconds, pose: Pose) -> Held {
        Held {
            since,
            pose,
            rendered: false,
        }
    }
}

fn pose_of(world: &World, character: Entity) -> Option<Pose> {
    let character = world.get_entity(character).ok()?;
    Some(Pose {
        at: character.get::<RenderPosition>()?.0,
        heading: character.get::<Actor>()?.dir,
        area: character.get::<AreaTag>()?.area,
    })
}

fn area_drawable(world: &mut World, area: area::Id) -> bool {
    let spawned = world.resource::<SpawnedArea>();
    if spawned.area != Some(area) {
        return false;
    }
    let mut pending = spawned.images.clone();
    pending.extend(
        world
            .query::<&Sprite>()
            .iter(world)
            .map(|sprite| sprite.image.clone()),
    );
    let images = world.resource::<Assets<Image>>();
    pending.iter().all(|image| images.contains(image))
}

fn forget_crossing(world: &mut World) {
    transition::abort(world);
    *world.resource_mut::<Crossing>() = Crossing::default();
    world.resource_mut::<RetainedImages>().0.clear();
}

/// Images loaded since the last crossing finished, and those it ended up showing, stay loaded until
/// the next one finishes. What the area left behind shares with the next (the player's own sheet, a
/// common tileset) then survives its departure, instead of unloading and decoding again moments
/// later.
#[derive(Resource, Default)]
struct RetainedImages(Vec<Handle<Image>>);

fn retain_loaded_images(
    mut events: MessageReader<AssetEvent<Image>>,
    mut images: ResMut<Assets<Image>>,
    mut retained: ResMut<RetainedImages>,
) {
    for event in events.read() {
        if let AssetEvent::LoadedWithDependencies { id } = *event
            && let Some(image) = images.get_strong_handle(id)
        {
            retained.0.push(image);
        }
    }
}

fn release_unshown_images(world: &mut World) {
    let mut shown: HashSet<AssetId<Image>> = world
        .resource::<SpawnedArea>()
        .images
        .iter()
        .map(Handle::id)
        .collect();
    shown.extend(
        world
            .query::<&Sprite>()
            .iter(world)
            .map(|sprite| sprite.image.id()),
    );
    world
        .resource_mut::<RetainedImages>()
        .0
        .retain(|image| shown.contains(&image.id()));
}

#[allow(clippy::too_many_arguments)]
fn spawn_area_tiles(
    viewpoint: Res<Viewpoint>,
    areas: Query<&AreaTag>,
    assets: Res<AssetServer>,
    service: Res<Content>,
    mut spawned: ResMut<SpawnedArea>,
    tiles: Query<Entity, With<bevy_tilemap::MapTile>>,
    mut images: ResMut<bevy::asset::Assets<Image>>,
    mut meshes: ResMut<bevy::asset::Assets<Mesh>>,
    mut materials: ResMut<bevy::asset::Assets<bevy_tilemap::TilemapMaterial>>,
    mut commands: Commands,
) {
    let Some(area_id) = viewpoint
        .0
        .and_then(|seen| areas.get(seen).ok())
        .map(|tag| tag.area)
    else {
        return;
    };
    if spawned.area == Some(area_id) {
        return;
    }
    for tile in &tiles {
        commands.entity(tile).despawn();
    }
    let content = &service;
    let area = area::load(content, area_id);
    let origin = Pos::<Tiles>::new(0.0, 0.0).to_screen();
    let sheets = AreaSheets::new(content, area, &assets);
    let grids = area.grids;
    let size = grids.size;
    for (index, layer) in grids.ground.iter().enumerate() {
        let cells: Vec<Option<bevy_tilemap::GridCell>> = layer
            .cells
            .iter()
            .map(|cell| {
                let entry = grids.entry(*cell)?;
                Some(bevy_tilemap::GridCell {
                    sheet: sheets.index(entry.tileset)?,
                    tile: entry.tile,
                    flip_x: entry.flip.horizontal(),
                    flip_y: entry.flip.vertical(),
                })
            })
            .collect();
        bevy_tilemap::spawn_grid_layer(
            &mut commands,
            &mut images,
            &mut meshes,
            &mut materials,
            &sheets.sheets,
            &bevy_tilemap::GridLayer {
                width: size.width,
                height: size.height,
                cells: &cells,
            },
            bevy_tilemap::LayerPlacement {
                origin,
                tile_px: TILE.0,
                z: index as f32,
            },
        );
    }
    let flat_count = area
        .scenery
        .iter()
        .filter(|s| s.sort_line().is_none())
        .count();
    let mut flat_index = 0;
    for scenery in &area.scenery {
        let Some(sheet) = sheets.index(scenery.tileset) else {
            continue;
        };
        let z = match scenery.sort_line() {
            Some(line) => dynamic_z(area.size.height, area.sort_base(), line),
            None => {
                flat_index += 1;
                area.sort_base() - 1.0 + flat_index as f32 / (flat_count as f32 + 1.0)
            }
        };
        for (row, tiles) in scenery.tiles.iter().enumerate() {
            for (column, tile) in tiles.iter().enumerate() {
                let Some(tile) = tile else {
                    continue;
                };
                let square = area::walk::tile_square(scenery, column, row);
                let flip = tile.flip.compose(scenery.flip);
                bevy_tilemap::spawn_tile_sprite(
                    &mut commands,
                    &sheets.sheets,
                    bevy_tilemap::TileSprite {
                        sheet,
                        tile: tile.tile,
                        flip_x: flip.horizontal(),
                        flip_y: flip.vertical(),
                        at: square.max().to_screen().with_x(square.min().to_screen().x),
                        z,
                    },
                    TILE.0,
                );
            }
        }
    }
    *spawned = SpawnedArea {
        area: Some(area_id),
        images: sheets.images,
    };
}

fn play_area_soundscape(
    viewpoint: Res<Viewpoint>,
    areas: Query<&AreaTag>,
    service: Res<Content>,
    mut soundscape: ResMut<Soundscape>,
) {
    let Some(area_id) = viewpoint
        .0
        .and_then(|seen| areas.get(seen).ok())
        .map(|tag| tag.area)
    else {
        return;
    };
    let zones = area::load(&service, area_id).soundscape.as_slice();
    if !std::ptr::eq(soundscape.0, zones) {
        soundscape.0 = zones;
    }
}

fn silence_soundscape(mut soundscape: ResMut<Soundscape>) {
    soundscape.0 = &[];
}

struct AreaSheets {
    tilesets: Vec<tileset::Id>,
    sheets: Vec<bevy_tilemap::TileSheet>,
    images: Vec<Handle<Image>>,
}

impl AreaSheets {
    fn new(content: &Content, area: &area::Area, assets: &AssetServer) -> AreaSheets {
        let sizes = content.built::<ImageSizes>();
        let mut tilesets: Vec<tileset::Id> = area
            .grids
            .palette
            .iter()
            .map(|entry| entry.tileset)
            .chain(area.scenery.iter().map(|scenery| scenery.tileset))
            .collect();
        tilesets.sort_by_key(|id| id.index());
        tilesets.dedup();
        let mut sheets = Vec::new();
        let mut images = Vec::new();
        for &id in &tilesets {
            let def = id.get(content);
            let image = assets.load(def.image.path());
            images.push(image.clone());
            let (width, height) = sizes.0.get(def.image.as_str()).copied().unwrap_or((0, 0));
            let grid = def.grid(width, height);
            sheets.push(bevy_tilemap::TileSheet {
                image,
                size: Vec2::new(width as f32, height as f32),
                tile: Vec2::splat(def.tile as f32),
                animations: (0..grid.count())
                    .filter_map(|tile| {
                        let frames = def.animation(tile);
                        (!frames.is_empty()).then(|| bevy_tilemap::TileAnimation {
                            tile,
                            frames: frames
                                .iter()
                                .map(|frame| bevy_tilemap::TileAnimationFrame {
                                    tile: frame.tile,
                                    seconds: frame.ms as f32 / 1000.0,
                                })
                                .collect(),
                        })
                    })
                    .collect(),
            });
        }
        AreaSheets {
            tilesets,
            sheets,
            images,
        }
    }

    fn index(&self, tileset: tileset::Id) -> Option<usize> {
        self.tilesets.iter().position(|&id| id == tileset)
    }
}

#[derive(Component, Default, Clone)]
struct DeathBanner;

fn sync_death_banner(world: &mut World) {
    let dead = session::is_dead(world);
    let banner = world
        .query_filtered::<Entity, With<DeathBanner>>()
        .iter(world)
        .next();
    match (dead, banner) {
        (true, None) => {
            let _ = world.spawn_scene(death_banner());
        }
        (false, Some(banner)) => world.entity_mut(banner).despawn(),
        _ => {}
    }
}

fn death_banner() -> impl Scene {
    bsn! {
        DeathBanner
        Node {
            position_type: PositionType::Absolute,
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
        }
        GlobalZIndex({ui::tokens::layer::ALERTS})
        Pickable { should_block_lower: false, is_hoverable: false }
        Children [ {EntityScene(ui::rich_text(death_text(), false))} ]
    }
}

fn death_text() -> RichText {
    RichText {
        color: Color::WHITE,
        ..RichText::new(vec![
            RichPiece::text("You died! Press "),
            map::input(InputAction::Respawn),
            RichPiece::text(" to respawn"),
        ])
    }
}
