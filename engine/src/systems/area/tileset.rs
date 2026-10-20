use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::assets::ImageRef;
use crate::core::audio::playback::SfxId;
use crate::core::content::id::nearest;
use crate::core::content::locate::escape;
use crate::core::content::{
    Bundle, ContentFile, ContentId, ContentProblem, FileWriter, PartSpec, Parts, RowCheck, Shape,
};
use crate::core::math::{Pos, Rect, Size, WorldPx};

pub type TilesetId = ContentId<TilesetDef>;
pub type SurfaceId = ContentId<SurfaceDef>;

pub const MAX_TILE_PX: u32 = 512;
pub const MAX_TILE_FRAMES: usize = 256;
pub const MAX_TILE_FRAME_MS: u32 = 60_000;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TilesetDef {
    #[serde(skip)]
    pub image: ImageRef,
    pub tile: u32,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub terrains: BTreeMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tiles: BTreeMap<u32, TileData>,
}

pub const TILESET_IMAGE: PartSpec = PartSpec::File {
    name: "image",
    exts: &["png"],
};

impl Bundle for TilesetDef {
    const PARTS: &'static [PartSpec] = &[TILESET_IMAGE];

    fn read_parts(&mut self, parts: &mut Parts) {
        if let Some(image) = parts.required(TILESET_IMAGE) {
            self.image = ImageRef::new(parts.path(image));
        }
    }

    fn write_parts(&self, _: &str, _: &mut FileWriter) -> std::io::Result<()> {
        Ok(())
    }
}

impl ContentFile for TilesetDef {
    const TABLE: &'static str = "tileset";
    const SHAPE: Shape = Shape::Bundle;

    fn check(&self, cx: &mut RowCheck) {
        cx.range("/tile", self.tile, 1, MAX_TILE_PX, "a tile size in pixels");
        for (set, terrains) in &self.terrains {
            let pointer = format!("/terrains/{}", escape(set));
            cx.count(&pointer, terrains.len(), 2, 8, "terrains in the set");
            let mut seen: Vec<&String> = Vec::new();
            for terrain in terrains {
                if seen.contains(&terrain) {
                    cx.error(
                        &pointer,
                        "duplicate name",
                        format!("{terrain} twice in set {set}"),
                        "unique terrain names in each set",
                    );
                }
                seen.push(terrain);
            }
        }
        for (tile, data) in &self.tiles {
            let pointer = format!("/tiles/{tile}");
            if !data.animation.is_empty() {
                cx.count(
                    format!("{pointer}/animation"),
                    data.animation.len(),
                    2,
                    MAX_TILE_FRAMES,
                    "frames",
                );
                for (index, frame) in data.animation.iter().enumerate() {
                    cx.range(
                        format!("{pointer}/animation/{index}/ms"),
                        frame.ms,
                        1,
                        MAX_TILE_FRAME_MS,
                        "whole milliseconds",
                    );
                    if self
                        .tiles
                        .get(&frame.tile)
                        .is_some_and(|other| frame.tile != *tile && !other.animation.is_empty())
                    {
                        cx.error(
                            format!("{pointer}/animation/{index}/tile"),
                            "animation chain",
                            format!("tile {}", frame.tile),
                            "frames that don't animate themselves",
                        );
                    }
                }
            }
            for (set, corners) in &data.corners {
                let pointer = format!("{pointer}/corners/{}", escape(set));
                let Some(terrains) = self.terrains.get(set) else {
                    cx.problem(
                        &pointer,
                        ContentProblem::new(
                            "unknown terrain",
                            format!("set {set}"),
                            "a terrain set the tileset declares",
                        )
                        .near(nearest(self.terrains.keys(), set)),
                    );
                    continue;
                };
                for (corner, terrain) in corners.iter().enumerate() {
                    if !terrains.contains(terrain) {
                        cx.problem(
                            format!("{pointer}/{corner}"),
                            ContentProblem::new(
                                "unknown terrain",
                                format!("{terrain} in set {set}"),
                                format!("one of {}", terrains.join(", ")),
                            )
                            .near(nearest(terrains, terrain)),
                        );
                    }
                }
            }
        }
    }
}

#[derive(JsonSchema, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TileData {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub walk: Option<Walk>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface: Option<SurfaceId>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub corners: BTreeMap<String, [String; 4]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub animation: Vec<TileFrame>,
}

#[derive(
    JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, strum::IntoStaticStr,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Walk {
    Walkable,
    Blocks,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TileFrame {
    pub tile: u32,
    pub ms: u32,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SurfaceDef {
    pub name: String,
    pub footstep: SfxId,
}

impl ContentFile for SurfaceDef {
    const TABLE: &'static str = "surface";

    fn check(&self, cx: &mut RowCheck) {
        cx.text("/name", &self.name, 1, 60);
    }
}

impl TilesetDef {
    pub fn tiles_with_corners(&self, set: &str, corners: &[String; 4]) -> Vec<u32> {
        self.tiles
            .iter()
            .filter(|(_, data)| data.corners.get(set) == Some(corners))
            .map(|(tile, _)| *tile)
            .collect()
    }

    pub fn data(&self, tile: u32) -> Option<&TileData> {
        self.tiles.get(&tile)
    }

    pub fn walk(&self, tile: u32) -> Option<Walk> {
        self.tiles.get(&tile).and_then(|data| data.walk)
    }

    pub fn surface(&self, tile: u32) -> Option<SurfaceId> {
        self.tiles.get(&tile).and_then(|data| data.surface)
    }

    pub fn animation(&self, tile: u32) -> &[TileFrame] {
        self.tiles
            .get(&tile)
            .map_or(&[], |data| data.animation.as_slice())
    }

    pub fn animations(&self, width: u32, height: u32) -> impl Iterator<Item = (u32, &[TileFrame])> {
        let count = self.grid(width, height).count();
        self.tiles
            .iter()
            .filter(move |(tile, data)| **tile < count && !data.animation.is_empty())
            .map(|(tile, data)| (*tile, data.animation.as_slice()))
    }

    pub fn grid(&self, width: u32, height: u32) -> TilesetGrid {
        TilesetGrid {
            columns: (width / self.tile.max(1)).max(1),
            rows: (height / self.tile.max(1)).max(1),
            tile: self.tile,
            width,
            height,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TilesetGrid {
    pub columns: u32,
    pub rows: u32,
    pub tile: u32,
    pub width: u32,
    pub height: u32,
}

impl TilesetGrid {
    pub fn count(&self) -> u32 {
        self.columns * self.rows
    }

    pub fn region(&self, tile: u32) -> Rect<WorldPx> {
        let tile_px = self.tile as f32;
        Rect::new(
            Pos::new(
                (tile % self.columns) as f32 * tile_px,
                (tile / self.columns) as f32 * tile_px,
            ),
            Size::splat(tile_px),
        )
    }
}
