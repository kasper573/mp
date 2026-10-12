use std::collections::HashSet;

use game::core::math::Rng;
use game::core::tiling::{Cell, CellPos};
use game::systems::area::grid::Flip;
use game::systems::area::tileset::TilesetDef;

use super::grid::GridDraft;

/// Paints vertices of a terrain set around the brush and re-picks every touched cell's tile;
/// returns how many cells kept their tile for want of a matching mix.
#[allow(clippy::too_many_arguments)]
pub fn paint(
    draft: &mut GridDraft,
    layer: usize,
    def: &TilesetDef,
    tileset: &str,
    set: &str,
    terrain: usize,
    center: CellPos,
    size: u32,
    rng: &mut Rng,
    painted: &mut HashSet<CellPos>,
) -> usize {
    let Some(terrains) = def.terrains.get(set) else {
        return 0;
    };
    let Some(name) = terrains.get(terrain) else {
        return 0;
    };
    let base = &terrains[0];
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
            Some((ts, tile, _)) if ts == tileset => def
                .data(tile)
                .and_then(|data| data.corners.get(set))
                .cloned()
                .unwrap_or_else(|| [base.clone(), base.clone(), base.clone(), base.clone()]),
            _ => [base.clone(), base.clone(), base.clone(), base.clone()],
        }
    };
    let mut wanted: std::collections::HashMap<CellPos, [String; 4]> =
        std::collections::HashMap::new();
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
        let matches: Vec<u32> = def
            .tiles
            .iter()
            .filter(|(_, data)| data.corners.get(set).is_some_and(|c| c == corners))
            .map(|(tile, _)| *tile)
            .collect();
        if matches.is_empty() {
            kept += 1;
            continue;
        }
        let tile = matches[rng.rand_range(0..matches.len() as u32) as usize];
        let index = draft.intern(tileset, tile, Flip::None);
        if draft.set(layer, cell, Some(index)) {
            painted.insert(cell);
        }
    }
    kept
}

/// How many of the set's mixes have a tile, and how many mixes there are.
pub fn completeness(def: &TilesetDef, set: &str, terrains: &[String]) -> (usize, usize) {
    let total = terrains.len().pow(4);
    let seen: HashSet<&[String; 4]> = def
        .tiles
        .values()
        .filter_map(|data| data.corners.get(set))
        .collect();
    (seen.len().min(total), total)
}
