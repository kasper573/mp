use std::collections::{HashMap, HashSet};

use game::core::content::Content;
use game::core::math::Rng;
use game::core::tiling::{Cell, CellPos};
use game::systems::area::grid::Flip;
use game::systems::area::tileset::TilesetDef;

use super::grid::GridDraft;
use crate::views::tileset::terrain::MixCompleteness;

pub struct TerrainBrush<'a> {
    pub def: &'a TilesetDef,
    pub tileset: &'a str,
    pub set: &'a str,
    pub terrain: usize,
    pub size: u32,
}

pub fn paint(
    draft: &mut GridDraft,
    layer: usize,
    brush: &TerrainBrush,
    center: CellPos,
    rng: &mut Rng,
    painted: &mut HashSet<CellPos>,
) -> usize {
    let TerrainBrush {
        def,
        tileset,
        set,
        terrain,
        size,
    } = *brush;
    let Some(terrains) = def.terrains.get(set) else {
        return 0;
    };
    let Some(name) = terrains.get(terrain) else {
        return 0;
    };
    let base = &terrains[0];
    let plain = || std::array::from_fn(|_| base.clone());
    let half = (size.max(1) as i32 - 1) / 2;
    let extra = i32::from(size.max(1).is_multiple_of(2));
    let mut vertices: Vec<(i32, i32)> = Vec::new();
    for dy in -half - extra..=half + 1 {
        for dx in -half - extra..=half + 1 {
            vertices.push((center.x + dx, center.y + dy));
        }
    }
    let mut touched: HashSet<CellPos> = HashSet::new();
    let corners_of = |cell: CellPos| -> [String; 4] {
        let current = draft
            .get(layer, cell)
            .and_then(|index| draft.entry(index).cloned());
        match current {
            Some(row) if row.tileset == tileset => def
                .data(row.tile)
                .and_then(|data| data.corners.get(set))
                .cloned()
                .unwrap_or_else(plain),
            _ => plain(),
        }
    };
    let mut wanted: HashMap<CellPos, [String; 4]> = HashMap::new();
    for (vx, vy) in vertices {
        let around = [
            (CellPos::new(vx - 1, vy - 1), 2),
            (CellPos::new(vx, vy - 1), 3),
            (CellPos::new(vx - 1, vy), 1),
            (CellPos::new(vx, vy), 0),
        ];
        for (cell, corner) in around {
            if cell.index(draft.size).is_none() {
                continue;
            }
            let entry = wanted.entry(cell).or_insert_with(|| corners_of(cell));
            entry[corner] = name.clone();
            touched.insert(cell);
        }
    }
    let mut kept = 0;
    for cell in touched {
        let corners = &wanted[&cell];
        if corners.iter().all(|c| c == base) {
            if draft.set(layer, cell, None) {
                painted.insert(cell);
            }
            continue;
        }
        let Some(tile) = rng.choose(&def.tiles_with_corners(set, corners)).copied() else {
            kept += 1;
            continue;
        };
        let index = draft.intern(tileset, tile, Flip::None);
        if draft.set(layer, cell, Some(index)) {
            painted.insert(cell);
        }
    }
    kept
}

pub fn repaint(
    draft: &mut GridDraft,
    layer: usize,
    def: &TilesetDef,
    tileset: &str,
    set: &str,
    rng: &mut Rng,
) -> (usize, usize) {
    let cells: Vec<CellPos> = draft.cells().collect();
    let (mut changed, mut kept) = (0, 0);
    for cell in cells {
        let Some(row) = draft
            .get(layer, cell)
            .and_then(|index| draft.entry(index).cloned())
        else {
            continue;
        };
        if row.tileset != tileset {
            continue;
        }
        let Some(corners) = def
            .data(row.tile)
            .and_then(|data| data.corners.get(set))
            .cloned()
        else {
            continue;
        };
        let Some(pick) = rng.choose(&def.tiles_with_corners(set, &corners)).copied() else {
            kept += 1;
            continue;
        };
        let index = draft.intern(tileset, pick, Flip::None);
        if draft.set(layer, cell, Some(index)) {
            changed += 1;
        }
    }
    (changed, kept)
}

pub struct TerrainSetCoverage {
    pub tileset: String,
    pub set: String,
    pub terrains: Vec<String>,
    pub have: usize,
    pub total: usize,
}

pub fn sets_for(content: &Content, tile_px: u32) -> Vec<TerrainSetCoverage> {
    content
        .table::<TilesetDef>()
        .iter()
        .filter(|(_, def)| def.tile == tile_px)
        .flat_map(|(id, def)| {
            let tileset = id.key(content).to_owned();
            def.terrains.iter().map(move |(set, terrains)| {
                let mixes = MixCompleteness::of(def, set);
                TerrainSetCoverage {
                    tileset: tileset.clone(),
                    set: set.clone(),
                    terrains: terrains.clone(),
                    have: mixes.have,
                    total: mixes.total,
                }
            })
        })
        .collect()
}
