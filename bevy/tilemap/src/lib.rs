use std::time::Duration;

use std::collections::HashMap;

use bevy::asset::{AssetPath, RenderAssetUsages, embedded_asset, embedded_path};
use bevy::image::ImageSampler;
use bevy::prelude::*;
use bevy::render::render_resource::{
    AsBindGroup, Extent3d, ShaderType, TextureDimension, TextureFormat, TextureUsages,
};
use bevy::shader::ShaderRef;
use bevy::sprite::Anchor;
use bevy::sprite_render::{AlphaMode2d, Material2d, Material2dPlugin};

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "tilemap.wesl");
        app.add_plugins(Material2dPlugin::<TilemapMaterial>::default())
            .add_systems(Update, (animate_sprites, animate_tilemaps));
    }
}

#[derive(Component)]
pub struct MapTile;

#[derive(Clone)]
pub struct TileSheet {
    pub image: Handle<Image>,
    pub size: Vec2,
    pub tile: Vec2,
    pub animations: Vec<TileAnimation>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TileAnimation {
    pub tile: u32,
    pub frames: Vec<TileAnimationFrame>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TileAnimationFrame {
    pub tile: u32,
    pub lasts: Duration,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GridCell {
    pub sheet: usize,
    pub tile: u32,
    pub flip_x: bool,
    pub flip_y: bool,
}

pub struct GridLayer<'a> {
    pub width: u32,
    pub height: u32,
    pub cells: &'a [Option<GridCell>],
}

pub struct TileSprite {
    pub sheet: usize,
    pub tile: u32,
    pub flip_x: bool,
    pub flip_y: bool,
    pub bottom_left: Vec2,
    pub z: f32,
}

pub struct LayerPlacement {
    pub origin: Vec2,
    pub tile_px: f32,
    pub z: f32,
}

pub fn spawn_grid_layer(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<TilemapMaterial>,
    sheets: &[TileSheet],
    layer: &GridLayer,
    placement: LayerPlacement,
) {
    let LayerPlacement { origin, tile_px, z } = placement;
    let mut builders: HashMap<usize, IndexBuilder> = HashMap::new();
    for (index, cell) in layer.cells.iter().enumerate() {
        let Some(cell) = cell else {
            continue;
        };
        let Some(sheet) = sheets.get(cell.sheet) else {
            continue;
        };
        let (x, y) = (index as u32 % layer.width, index as u32 / layer.width);
        builders
            .entry(cell.sheet)
            .or_insert_with(|| IndexBuilder::new(layer.width, layer.height, sheet))
            .set(x, y, cell.tile, cell.flip_x, cell.flip_y);
    }
    let quad = meshes.add(Rectangle::new(1.0, 1.0));
    for builder in builders.into_values() {
        spawn_tilemap(
            commands, images, &quad, materials, builder, origin, tile_px, z,
        );
    }
}

pub fn spawn_tile_sprite(
    commands: &mut Commands,
    sheets: &[TileSheet],
    sprite: TileSprite,
    tile_px: f32,
) {
    let Some(sheet) = sheets.get(sprite.sheet) else {
        return;
    };
    let frames = frames(sheet, sprite.tile);
    let total: f32 = frames.iter().map(|(_, seconds)| seconds).sum();
    let mut tile = commands.spawn((
        MapTile,
        Sprite {
            image: sheet.image.clone(),
            rect: Some(frames[0].0),
            custom_size: Some(Vec2::splat(tile_px)),
            flip_x: sprite.flip_x,
            flip_y: sprite.flip_y,
            ..default()
        },
        Anchor::BOTTOM_LEFT,
        Transform::from_xyz(sprite.bottom_left.x, sprite.bottom_left.y, sprite.z),
    ));
    if total > 0.0 {
        tile.insert(AnimatedSprite { frames, total });
    }
}

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct TilemapMaterial {
    #[texture(0, sample_type = "u_int")]
    index: Handle<Image>,
    #[texture(1)]
    #[sampler(2)]
    atlas: Handle<Image>,
    #[texture(3, sample_type = "u_int")]
    frame_map: Handle<Image>,
    #[uniform(4)]
    data: TilemapUniform,
}

impl Material2d for TilemapMaterial {
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(
            AssetPath::from_path_buf(embedded_path!("tilemap.wesl")).with_source("embedded"),
        )
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

#[derive(Clone, ShaderType)]
struct TilemapUniform {
    grid: Vec4,
    sheet: Vec4,
}

#[derive(Component)]
struct TilemapAnim {
    frame_map: Handle<Image>,
    anims: Vec<Anim>,
}

struct Anim {
    tile: u32,
    frames: Vec<(u32, f32)>,
    total: f32,
    current: usize,
}

struct IndexBuilder {
    sheet: TileSheet,
    width: u32,
    height: u32,
    data: Vec<u8>,
}

impl IndexBuilder {
    fn new(width: u32, height: u32, sheet: &TileSheet) -> IndexBuilder {
        IndexBuilder {
            sheet: sheet.clone(),
            width,
            height,
            data: vec![0u8; (width * height * 4) as usize],
        }
    }

    fn set(&mut self, x: u32, y: u32, tile: u32, flip_x: bool, flip_y: bool) {
        let i = ((y * self.width + x) * 4) as usize;
        self.data[i] = (tile & 0xff) as u8;
        self.data[i + 1] = (tile >> 8) as u8;
        self.data[i + 2] = u8::from(flip_x) | (u8::from(flip_y) << 1);
        self.data[i + 3] = 255;
    }

    fn columns(&self) -> u32 {
        ((self.sheet.size.x / self.sheet.tile.x.max(1.0)) as u32).max(1)
    }

    fn tile_count(&self) -> u32 {
        let rows = ((self.sheet.size.y / self.sheet.tile.y.max(1.0)) as u32).max(1);
        self.columns() * rows
    }

    fn uniform(&self) -> TilemapUniform {
        TilemapUniform {
            grid: Vec4::new(
                self.width as f32,
                self.height as f32,
                self.columns() as f32,
                0.0,
            ),
            sheet: Vec4::new(
                self.sheet.size.x,
                self.sheet.size.y,
                self.sheet.tile.x,
                self.sheet.tile.y,
            ),
        }
    }

    fn frame_map_data(&self) -> Vec<u8> {
        let count = self.tile_count();
        let mut data = vec![0u8; (count * 4) as usize];
        for tile in 0..count {
            let i = (tile * 4) as usize;
            data[i] = (tile & 0xff) as u8;
            data[i + 1] = (tile >> 8) as u8;
        }
        data
    }

    fn anims(&self) -> Vec<Anim> {
        let count = self.tile_count();
        self.sheet
            .animations
            .iter()
            .filter(|animation| animation.tile < count && animation.frames.len() > 1)
            .map(|animation| {
                let frames: Vec<(u32, f32)> = animation
                    .frames
                    .iter()
                    .map(|frame| (frame.tile.min(count - 1), frame.lasts.as_secs_f32()))
                    .collect();
                Anim {
                    tile: animation.tile,
                    total: frames.iter().map(|(_, seconds)| seconds).sum(),
                    frames,
                    current: 0,
                }
            })
            .collect()
    }
}

#[allow(clippy::too_many_arguments)]
fn spawn_tilemap(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    quad: &Handle<Mesh>,
    materials: &mut Assets<TilemapMaterial>,
    builder: IndexBuilder,
    origin: Vec2,
    tile_px: f32,
    z: f32,
) {
    let width_px = builder.width as f32 * tile_px;
    let height_px = builder.height as f32 * tile_px;
    let frame_map = images.add(uint_image(
        builder.tile_count(),
        1,
        builder.frame_map_data(),
        RenderAssetUsages::default(),
    ));
    let anims = builder.anims();
    let index = images.add(uint_image(
        builder.width,
        builder.height,
        builder.data.clone(),
        RenderAssetUsages::RENDER_WORLD,
    ));
    let material = materials.add(TilemapMaterial {
        index,
        atlas: builder.sheet.image.clone(),
        frame_map: frame_map.clone(),
        data: builder.uniform(),
    });
    commands.spawn((
        MapTile,
        Mesh2d(quad.clone()),
        MeshMaterial2d(material),
        Transform {
            translation: Vec3::new(origin.x + width_px / 2.0, origin.y - height_px / 2.0, z),
            scale: Vec3::new(width_px, height_px, 1.0),
            ..default()
        },
        TilemapAnim { frame_map, anims },
    ));
}

#[derive(Component)]
struct AnimatedSprite {
    frames: Vec<(Rect, f32)>,
    total: f32,
}

fn animate_sprites(time: Res<Time>, mut sprites: Query<(&AnimatedSprite, &mut Sprite)>) {
    let now = time.elapsed_secs();
    for (anim, mut sprite) in &mut sprites {
        sprite.rect = Some(anim.frames[frame_at(&anim.frames, anim.total, now)].0);
    }
}

fn animate_tilemaps(
    time: Res<Time>,
    mut images: ResMut<Assets<Image>>,
    mut materials: ResMut<Assets<TilemapMaterial>>,
    mut maps: Query<(&mut TilemapAnim, &MeshMaterial2d<TilemapMaterial>)>,
) {
    let now = time.elapsed_secs();
    for (mut map, material) in &mut maps {
        let mut dirty = false;
        for anim in &mut map.anims {
            if anim.total <= 0.0 {
                continue;
            }
            let frame = frame_at(&anim.frames, anim.total, now);
            if frame != anim.current {
                anim.current = frame;
                dirty = true;
            }
        }
        if !dirty {
            continue;
        }
        if let Some(mut image) = images.get_mut(&map.frame_map)
            && let Some(data) = image.data.as_mut()
        {
            for anim in &map.anims {
                let shown = anim.frames[anim.current].0;
                let i = anim.tile as usize * 4;
                data[i] = (shown & 0xff) as u8;
                data[i + 1] = (shown >> 8) as u8;
            }
        }
        // The material's bind group caches the frame-map texture view, so the material has to be
        // marked changed for the rewritten image to reach the shader.
        materials.get_mut(&material.0);
    }
}

fn frame_at<T>(frames: &[(T, f32)], total: f32, now: f32) -> usize {
    let mut remaining = now % total;
    for (index, (_, duration)) in frames.iter().enumerate() {
        if remaining < *duration {
            return index;
        }
        remaining -= *duration;
    }
    frames.len() - 1
}

fn region(sheet: &TileSheet, tile: u32) -> Rect {
    let columns = ((sheet.size.x / sheet.tile.x.max(1.0)) as u32).max(1);
    let x = (tile % columns) as f32 * sheet.tile.x;
    let y = (tile / columns) as f32 * sheet.tile.y;
    Rect::new(x, y, x + sheet.tile.x, y + sheet.tile.y)
}

fn frames(sheet: &TileSheet, tile: u32) -> Vec<(Rect, f32)> {
    match sheet
        .animations
        .iter()
        .find(|animation| animation.tile == tile)
    {
        Some(animation) if !animation.frames.is_empty() => animation
            .frames
            .iter()
            .map(|frame| (region(sheet, frame.tile), frame.lasts.as_secs_f32()))
            .collect(),
        _ => vec![(region(sheet, tile), 0.0)],
    }
}

fn uint_image(width: u32, height: u32, data: Vec<u8>, usage: RenderAssetUsages) -> Image {
    let mut image = Image::new(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8Uint,
        usage,
    );
    image.texture_descriptor.usage = TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST;
    image.sampler = ImageSampler::nearest();
    image
}
