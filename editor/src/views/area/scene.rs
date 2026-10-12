use std::collections::HashMap;

use bevy::asset::RenderAssetUsages;
use bevy::camera::visibility::RenderLayers;
use bevy::camera::{ClearColorConfig, RenderTarget, Viewport};
use bevy::ecs::system::RunSystemOnce;
use bevy::image::ImageSampler;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
use bevy_egui::{EguiTextureHandle, EguiUserTextures};
use game::core::content::Content;
use game::core::math::Pos;
use game::core::render::{TILE, ToScreen};
use game::core::tiling::{TileSize, Tiles};
use game::systems::area::{self, AreaModule, Scenery};

use crate::project::Files;

pub struct SceneRequest {
    pub key: String,
    pub spec: SceneSpec,
    pub width: u32,
    pub height: u32,
    pub center: Pos<Tiles>,
    pub zoom: f32,
    pub generation: u64,
}

#[derive(Clone, PartialEq)]
pub struct SceneSpec {
    pub ground: String,
    pub scenery: SceneryOf,
    pub hidden_ground: Vec<String>,
    pub show_blueprints: bool,
    pub show_scenery: bool,
}

#[derive(Clone, PartialEq)]
pub enum SceneryOf {
    Area,
    Parts {
        blueprint: String,
        at: Pos<Tiles>,
        values: serde_json::Value,
    },
}

pub struct Scene {
    pub texture: egui::TextureId,
    pub image: Handle<Image>,
    pub alloc: [u32; 2],
    pub shown: [u32; 2],
    pub layer: usize,
    camera: Entity,
    spec: SceneSpec,
    generation: u64,
    idle: u32,
}

#[derive(Component)]
pub struct SceneOf(pub usize);

#[derive(Default)]
pub struct Scenes {
    pub by_key: HashMap<String, Scene>,
    images: HashMap<String, (String, Handle<Image>)>,
    next_layer: usize,
    free_layers: Vec<usize>,
}

pub const IDLE_FRAMES: u32 = 120;

pub fn sync(
    scenes: &mut Scenes,
    requests: Vec<SceneRequest>,
    content: Option<Content>,
    files: &Files,
    world: &mut World,
) {
    let mut seen: Vec<String> = Vec::new();
    for request in requests {
        seen.push(request.key.clone());
        let Some(content) = content else {
            continue;
        };
        let respawn = match scenes.by_key.get(&request.key) {
            Some(scene) => scene.generation != request.generation || scene.spec != request.spec,
            None => true,
        };
        if respawn {
            despawn(scenes, &request.key, world);
            spawn(scenes, &request, content, files, world);
        }
        let Some(scene) = scenes.by_key.get_mut(&request.key) else {
            continue;
        };
        scene.idle = 0;
        let wanted = [request.width.max(1), request.height.max(1)];
        if wanted[0] > scene.alloc[0]
            || wanted[1] > scene.alloc[1]
            || scene.alloc[0] > wanted[0] * 2
            || scene.alloc[1] > wanted[1] * 2
        {
            let alloc = [round_up(wanted[0]), round_up(wanted[1])];
            let image = target_image(alloc);
            let handle = world.resource_mut::<Assets<Image>>().add(image);
            let mut textures = world.resource_mut::<EguiUserTextures>();
            textures.remove_image(&scene.image);
            scene.texture = textures.add_image(EguiTextureHandle::Strong(handle.clone()));
            scene.image = handle.clone();
            scene.alloc = alloc;
            if let Ok(mut camera) = world.get_entity_mut(scene.camera) {
                camera.insert(RenderTarget::Image(handle.into()));
            }
        }
        scene.shown = wanted;
        if let Ok(mut camera) = world.get_entity_mut(scene.camera) {
            if let Some(mut cam) = camera.get_mut::<Camera>() {
                cam.viewport = Some(Viewport {
                    physical_position: UVec2::ZERO,
                    physical_size: UVec2::new(wanted[0], wanted[1]),
                    ..default()
                });
            }
            if let Some(mut projection) = camera.get_mut::<Projection>()
                && let Projection::Orthographic(ortho) = &mut *projection
            {
                ortho.scale = 1.0 / request.zoom.max(0.01);
            }
            if let Some(mut transform) = camera.get_mut::<Transform>() {
                let at = request.center.to_screen();
                transform.translation.x = at.x;
                transform.translation.y = at.y;
            }
        }
    }
    let stale: Vec<String> = scenes
        .by_key
        .iter_mut()
        .filter_map(|(key, scene)| {
            if seen.contains(key) {
                return None;
            }
            scene.idle += 1;
            (scene.idle > IDLE_FRAMES).then(|| key.clone())
        })
        .collect();
    for key in stale {
        despawn(scenes, &key, world);
    }
}

pub fn clear(scenes: &mut Scenes, world: &mut World) {
    let keys: Vec<String> = scenes.by_key.keys().cloned().collect();
    for key in keys {
        despawn(scenes, &key, world);
    }
    scenes.images.clear();
}

fn round_up(n: u32) -> u32 {
    n.div_ceil(256) * 256
}

fn target_image(alloc: [u32; 2]) -> Image {
    let mut image =
        Image::new_target_texture(alloc[0], alloc[1], TextureFormat::Rgba8UnormSrgb, None);
    image.sampler = ImageSampler::nearest();
    image
}

fn despawn(scenes: &mut Scenes, key: &str, world: &mut World) {
    let Some(scene) = scenes.by_key.remove(key) else {
        return;
    };
    let tiles: Vec<Entity> = world
        .query::<(Entity, &SceneOf)>()
        .iter(world)
        .filter(|(_, of)| of.0 == scene.layer)
        .map(|(entity, _)| entity)
        .collect();
    for entity in tiles {
        world.despawn(entity);
    }
    world
        .resource_mut::<EguiUserTextures>()
        .remove_image(&scene.image);
    scenes.free_layers.push(scene.layer);
}

fn spawn(
    scenes: &mut Scenes,
    request: &SceneRequest,
    content: Content,
    files: &Files,
    world: &mut World,
) {
    let Some(area_id) = content.by_key::<area::AreaDef>(&request.spec.ground) else {
        return;
    };
    let layer = scenes.free_layers.pop().unwrap_or_else(|| {
        scenes.next_layer += 1;
        scenes.next_layer
    });
    let alloc = [
        round_up(request.width.max(1)),
        round_up(request.height.max(1)),
    ];
    let image = world
        .resource_mut::<Assets<Image>>()
        .add(target_image(alloc));
    let texture = world
        .resource_mut::<EguiUserTextures>()
        .add_image(EguiTextureHandle::Strong(image.clone()));
    let at = request.center.to_screen();
    let camera = world
        .spawn((
            Camera2d,
            RenderTarget::Image(image.clone().into()),
            Camera {
                order: -(10 + layer as isize),
                clear_color: ClearColorConfig::Custom(Color::srgb(0.09, 0.09, 0.11)),
                ..default()
            },
            Projection::Orthographic(OrthographicProjection {
                scale: 1.0 / request.zoom.max(0.01),
                ..OrthographicProjection::default_2d()
            }),
            Transform::from_xyz(at.x, at.y, 0.0),
            RenderLayers::from_layers(&[layer]),
            SceneOf(layer),
        ))
        .id();
    let area = area::load(&content, area_id);
    let scenery: Vec<Scenery> = match &request.spec.scenery {
        SceneryOf::Area => area::placed(&content, area_id)
            .iter()
            .filter(|placed| {
                if placed.chain.is_empty() {
                    request.spec.show_scenery
                } else {
                    request.spec.show_blueprints
                }
            })
            .filter_map(|placed| match &placed.module {
                AreaModule::Scenery(scenery) => Some(scenery.clone()),
                _ => None,
            })
            .collect(),
        SceneryOf::Parts {
            blueprint,
            at,
            values,
        } => parts_scenery(content, blueprint, *at, values),
    };
    let sheets = sheets_for(scenes, content, files, area.grids, &scenery, world);
    let spec = SpawnSpec {
        content,
        area: area_id,
        scenery,
        sheets,
        layer,
        hidden_ground: request.spec.hidden_ground.clone(),
    };
    let _ = world.run_system_once_with(spawn_tiles, spec);
    scenes.by_key.insert(
        request.key.clone(),
        Scene {
            texture,
            image,
            alloc,
            shown: [request.width.max(1), request.height.max(1)],
            layer,
            camera,
            spec: request.spec.clone(),
            generation: request.generation,
            idle: 0,
        },
    );
}

pub fn parts_scenery(
    content: Content,
    blueprint: &str,
    at: Pos<Tiles>,
    values: &serde_json::Value,
) -> Vec<Scenery> {
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(blueprint) else {
        return Vec::new();
    };
    let placement = serde_json::json!({
        "type": "blueprint",
        "blueprint": blueprint,
        "at": { "x": at.x, "y": at.y },
        "values": values,
    });
    let Ok(module) =
        game::core::content::with_content(game::core::content::ContentScope::of(&content), || {
            serde_json::from_value::<AreaModule>(placement)
        })
        .0
    else {
        return Vec::new();
    };
    let _ = id;
    let mut errors = Vec::new();
    let flattening = area::blueprint::flatten(&content, &[module], &mut errors);
    flattening
        .modules
        .into_iter()
        .filter_map(|placed| match placed.module {
            AreaModule::Scenery(scenery) => Some(scenery),
            _ => None,
        })
        .collect()
}

struct SheetSet {
    tilesets: Vec<area::tileset::Id>,
    sheets: Vec<bevy_tilemap::TileSheet>,
}

fn sheets_for(
    scenes: &mut Scenes,
    content: Content,
    files: &Files,
    grids: &area::AreaGrids,
    scenery: &[Scenery],
    world: &mut World,
) -> SheetSet {
    let sizes = content.built::<game::core::content::media::ImageSizes>();
    let mut tilesets: Vec<area::tileset::Id> = grids
        .palette
        .iter()
        .map(|entry| entry.tileset)
        .chain(scenery.iter().map(|s| s.tileset))
        .collect();
    tilesets.sort_by_key(|id| id.index());
    tilesets.dedup();
    let mut sheets = Vec::new();
    for &id in &tilesets {
        let def = id.get(&content);
        let image = image_handle(scenes, files, def.image.as_str(), world);
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
    SheetSet { tilesets, sheets }
}

pub fn image_handle(
    scenes: &mut Scenes,
    files: &Files,
    path: &str,
    world: &mut World,
) -> Handle<Image> {
    let file = format!("assets/{path}");
    let Some(bytes) = files.get(&file) else {
        return Handle::default();
    };
    let hash = crate::project::hash(bytes);
    if let Some((known, handle)) = scenes.images.get(&file)
        && *known == hash
    {
        return handle.clone();
    }
    let handle = match image::load_from_memory(bytes) {
        Ok(decoded) => {
            let rgba = decoded.into_rgba8();
            let mut image = Image::new(
                Extent3d {
                    width: rgba.width(),
                    height: rgba.height(),
                    depth_or_array_layers: 1,
                },
                TextureDimension::D2,
                rgba.into_raw(),
                TextureFormat::Rgba8UnormSrgb,
                RenderAssetUsages::RENDER_WORLD,
            );
            image.sampler = ImageSampler::nearest();
            world.resource_mut::<Assets<Image>>().add(image)
        }
        Err(_) => Handle::default(),
    };
    scenes.images.insert(file, (hash, handle.clone()));
    handle
}

struct SpawnSpec {
    content: Content,
    area: area::Id,
    scenery: Vec<Scenery>,
    sheets: SheetSet,
    layer: usize,
    hidden_ground: Vec<String>,
}

fn spawn_tiles(
    In(spec): In<SpawnSpec>,
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<bevy_tilemap::TilemapMaterial>>,
) {
    let area = area::load(&spec.content, spec.area);
    let grids = area.grids;
    let size = grids.size;
    let origin = area.size.bounds().min().to_screen();
    let index_of =
        |tileset: area::tileset::Id| spec.sheets.tilesets.iter().position(|&id| id == tileset);
    for (index, layer) in grids.ground.iter().enumerate() {
        if spec.hidden_ground.contains(&layer.name) {
            continue;
        }
        let cells: Vec<Option<bevy_tilemap::GridCell>> = layer
            .cells
            .iter()
            .map(|cell| {
                let entry = grids.entry(*cell)?;
                Some(bevy_tilemap::GridCell {
                    sheet: index_of(entry.tileset)?,
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
            &spec.sheets.sheets,
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
    let flat_count = spec
        .scenery
        .iter()
        .filter(|s| s.sort_line().is_none())
        .count();
    let mut flat_index = 0;
    for scenery in &spec.scenery {
        let Some(sheet) = index_of(scenery.tileset) else {
            continue;
        };
        let z = match scenery.sort_line() {
            Some(line) => game::core::render::dynamic_z(area.size.height, area.sort_base(), line),
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
                    &spec.sheets.sheets,
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
    let layer = spec.layer;
    commands.queue(move |world: &mut World| {
        let fresh: Vec<Entity> = world
            .query_filtered::<Entity, (With<bevy_tilemap::MapTile>, Without<SceneOf>)>()
            .iter(world)
            .collect();
        for entity in fresh {
            world
                .entity_mut(entity)
                .insert((SceneOf(layer), RenderLayers::from_layers(&[layer])));
        }
    });
}
