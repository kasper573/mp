use std::collections::HashMap;
use std::time::Duration;

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

impl TileSheet {
    fn columns(&self) -> u32 {
        ((self.size.x / self.tile.x.max(1.0)) as u32).max(1)
    }

    fn tile_count(&self) -> u32 {
        let rows = ((self.size.y / self.tile.y.max(1.0)) as u32).max(1);
        self.columns() * rows
    }

    fn region(&self, tile: u32) -> Rect {
        let x = (tile % self.columns()) as f32 * self.tile.x;
        let y = (tile / self.columns()) as f32 * self.tile.y;
        Rect::new(x, y, x + self.tile.x, y + self.tile.y)
    }

    fn frames(&self, tile: u32) -> Vec<Frame<Rect>> {
        match self
            .animations
            .iter()
            .find(|animation| animation.tile == tile)
        {
            Some(animation) if !animation.frames.is_empty() => animation
                .frames
                .iter()
                .map(|frame| Frame {
                    shows: self.region(frame.tile),
                    lasts: frame.lasts,
                })
                .collect(),
            _ => vec![Frame {
                shows: self.region(tile),
                lasts: Duration::ZERO,
            }],
        }
    }
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

#[derive(Clone, Copy)]
pub struct LayerPlacement {
    pub origin: Vec2,
    pub tile_px: f32,
    pub z: f32,
}

pub struct TilemapAssets<'a> {
    pub images: &'a mut Assets<Image>,
    pub meshes: &'a mut Assets<Mesh>,
    pub materials: &'a mut Assets<TilemapMaterial>,
}

pub fn spawn_grid_layer(
    commands: &mut Commands,
    assets: &mut TilemapAssets,
    sheets: &[TileSheet],
    layer: &GridLayer,
    placement: LayerPlacement,
    extra: impl Bundle + Clone,
) {
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
    let quad = assets.meshes.add(Rectangle::new(1.0, 1.0));
    for builder in builders.into_values() {
        spawn_tilemap(commands, assets, &quad, builder, placement, extra.clone());
    }
}

pub fn spawn_tile_sprite(
    commands: &mut Commands,
    sheets: &[TileSheet],
    sprite: TileSprite,
    tile_px: f32,
    extra: impl Bundle,
) {
    let Some(sheet) = sheets.get(sprite.sheet) else {
        return;
    };
    let frames = sheet.frames(sprite.tile);
    let total: Duration = frames.iter().map(|frame| frame.lasts).sum();
    let mut tile = commands.spawn((
        MapTile,
        Sprite {
            image: sheet.image.clone(),
            rect: Some(frames[0].shows),
            custom_size: Some(Vec2::splat(tile_px)),
            flip_x: sprite.flip_x,
            flip_y: sprite.flip_y,
            ..default()
        },
        Anchor::BOTTOM_LEFT,
        Transform::from_xyz(sprite.bottom_left.x, sprite.bottom_left.y, sprite.z),
        extra,
    ));
    if !total.is_zero() {
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
    frames: Vec<Frame<u32>>,
    total: Duration,
    current: usize,
}

struct Frame<T> {
    shows: T,
    lasts: Duration,
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

    fn uniform(&self) -> TilemapUniform {
        TilemapUniform {
            grid: Vec4::new(
                self.width as f32,
                self.height as f32,
                self.sheet.columns() as f32,
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
        let count = self.sheet.tile_count();
        let mut data = vec![0u8; (count * 4) as usize];
        for tile in 0..count {
            let i = (tile * 4) as usize;
            data[i] = (tile & 0xff) as u8;
            data[i + 1] = (tile >> 8) as u8;
        }
        data
    }

    fn anims(&self) -> Vec<Anim> {
        let count = self.sheet.tile_count();
        self.sheet
            .animations
            .iter()
            .filter(|animation| animation.tile < count && animation.frames.len() > 1)
            .map(|animation| {
                let frames: Vec<Frame<u32>> = animation
                    .frames
                    .iter()
                    .map(|frame| Frame {
                        shows: frame.tile.min(count - 1),
                        lasts: frame.lasts,
                    })
                    .collect();
                Anim {
                    tile: animation.tile,
                    total: frames.iter().map(|frame| frame.lasts).sum(),
                    frames,
                    current: 0,
                }
            })
            .collect()
    }
}

fn spawn_tilemap(
    commands: &mut Commands,
    assets: &mut TilemapAssets,
    quad: &Handle<Mesh>,
    builder: IndexBuilder,
    placement: LayerPlacement,
    extra: impl Bundle,
) {
    let LayerPlacement { origin, tile_px, z } = placement;
    let width_px = builder.width as f32 * tile_px;
    let height_px = builder.height as f32 * tile_px;
    let frame_map = assets.images.add(uint_image(
        builder.sheet.tile_count(),
        1,
        builder.frame_map_data(),
        RenderAssetUsages::default(),
    ));
    let anims = builder.anims();
    let index = assets.images.add(uint_image(
        builder.width,
        builder.height,
        builder.data.clone(),
        RenderAssetUsages::RENDER_WORLD,
    ));
    let material = assets.materials.add(TilemapMaterial {
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
        extra,
    ));
}

#[derive(Component)]
struct AnimatedSprite {
    frames: Vec<Frame<Rect>>,
    total: Duration,
}

fn animate_sprites(time: Res<Time>, mut sprites: Query<(&AnimatedSprite, &mut Sprite)>) {
    let now = time.elapsed();
    for (anim, mut sprite) in &mut sprites {
        sprite.rect = Some(anim.frames[frame_at(&anim.frames, anim.total, now)].shows);
    }
}

fn animate_tilemaps(
    time: Res<Time>,
    mut images: ResMut<Assets<Image>>,
    mut materials: ResMut<Assets<TilemapMaterial>>,
    mut maps: Query<(&mut TilemapAnim, &MeshMaterial2d<TilemapMaterial>)>,
) {
    let now = time.elapsed();
    for (mut map, material) in &mut maps {
        let mut dirty = false;
        for anim in &mut map.anims {
            if anim.total.is_zero() {
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
                let shown = anim.frames[anim.current].shows;
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

fn frame_at<T>(frames: &[Frame<T>], total: Duration, now: Duration) -> usize {
    let mut remaining = Duration::from_nanos((now.as_nanos() % total.as_nanos()) as u64);
    for (index, frame) in frames.iter().enumerate() {
        if remaining < frame.lasts {
            return index;
        }
        remaining -= frame.lasts;
    }
    frames.len() - 1
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
