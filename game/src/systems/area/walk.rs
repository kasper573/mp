use super::grid::AreaGrids;
use super::tileset::{TilesetDef, Walk};
use super::{AreaModule, Scenery};
use crate::core::audio::playback::SfxId;
use crate::core::content::Content;
use crate::core::math::{Pos, Rect, Size};
use crate::core::tiling::{Cell, CellPos, GridDims, GridSize, TilePos, TileRect, Tiles};

pub const OBSCURING_CUTOFF: f32 = 0.4;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CellVotes {
    pub grid: Option<bool>,
    pub blocks: bool,
    pub walks: bool,
}

impl CellVotes {
    pub fn vote(&mut self, walk: Option<Walk>) {
        match walk {
            Some(Walk::Blocks) => self.blocks = true,
            Some(Walk::Walkable) => self.walks = true,
            None => {}
        }
    }

    pub fn walkable(self) -> bool {
        match self.grid {
            Some(value) => value,
            None => !self.blocks && self.walks,
        }
    }
}

pub struct WalkGrids {
    pub walk: Vec<bool>,
    pub wild: Vec<bool>,
    pub airspace: Vec<bool>,
    pub wild_airspace: Vec<bool>,
    pub safe_cells: Vec<bool>,
    pub footsteps: Vec<Option<SfxId>>,
}

pub fn grids(
    content: &Content,
    grids: &AreaGrids,
    modules: &[AreaModule],
    safe_zones: &[Rect<Tiles>],
) -> WalkGrids {
    let size = grids.size;
    let votes = votes(content, grids, modules);
    let safe_cells: Vec<bool> = size
        .cells()
        .map(|cell| safe_zones.iter().any(|zone| zone.contains(cell.center())))
        .collect();
    let walk: Vec<bool> = votes.iter().map(|votes| votes.walkable()).collect();
    let wild = walk
        .iter()
        .zip(&safe_cells)
        .map(|(&walkable, &safe)| walkable && !safe)
        .collect();
    let airspace = vec![true; walk.len()];
    let wild_airspace = safe_cells.iter().map(|safe| !safe).collect();
    WalkGrids {
        walk,
        wild,
        airspace,
        wild_airspace,
        safe_cells,
        footsteps: footsteps(content, grids),
    }
}

pub fn votes(content: &Content, grids: &AreaGrids, modules: &[AreaModule]) -> Vec<CellVotes> {
    let size = grids.size;
    let mut votes: Vec<CellVotes> = grids
        .walk
        .iter()
        .map(|&grid| CellVotes {
            grid,
            ..CellVotes::default()
        })
        .collect();
    for layer in &grids.ground {
        for (index, cell) in layer.cells.iter().enumerate() {
            if let Some(entry) = grids.entry(*cell) {
                votes[index].vote(entry.tileset.get(content).walk(entry.tile));
            }
        }
    }
    for scenery in modules.iter().filter_map(|module| match module {
        AreaModule::Scenery(scenery) => Some(scenery),
        _ => None,
    }) {
        let tileset = scenery.tileset.get(content);
        for (tile, rect) in scenery_tiles(scenery) {
            let walk = tileset.walk(tile);
            if walk.is_none() {
                continue;
            }
            for cell in rect.tiles() {
                if cell_overlap(&rect, cell) >= OBSCURING_CUTOFF
                    && let Some(index) = cell.index(size)
                {
                    votes[index].vote(walk);
                }
            }
        }
        for cell in scenery_blocks(scenery) {
            if let Some(index) = cell.index(size) {
                votes[index].blocks = true;
            }
        }
    }
    votes
}

pub fn scenery_tiles(scenery: &Scenery) -> impl Iterator<Item = (u32, Rect<Tiles>)> + '_ {
    scenery
        .tiles
        .iter()
        .enumerate()
        .flat_map(move |(row, tiles)| {
            tiles.iter().enumerate().filter_map(move |(column, tile)| {
                let tile = tile.as_ref()?;
                Some((tile.tile, tile_square(scenery, column, row)))
            })
        })
}

pub fn tile_square(scenery: &Scenery, column: usize, row: usize) -> Rect<Tiles> {
    let x = column as f32;
    let y = row as f32;
    let origin = Pos::new(
        if scenery.flip.horizontal() {
            scenery.at.x - x - 1.0
        } else {
            scenery.at.x + x
        },
        if scenery.flip.vertical() {
            scenery.at.y - y - 1.0
        } else {
            scenery.at.y + y
        },
    );
    Rect::new(origin, Size::splat(1.0))
}

pub fn scenery_blocks(scenery: &Scenery) -> impl Iterator<Item = CellPos> + '_ {
    scenery.blocks.iter().map(move |[x, y]| {
        let center = Pos::new(*x as f32 + 0.5, *y as f32 + 0.5);
        (scenery.at + scenery.flip.apply(center).to_vector()).cell()
    })
}

pub fn cell_overlap(rect: &Rect<Tiles>, cell: CellPos) -> f32 {
    rect.intersection(&cell.bounds())
        .map_or(0.0, |overlap| overlap.area())
}

pub fn footsteps(content: &Content, grids: &AreaGrids) -> Vec<Option<SfxId>> {
    let mut footsteps = vec![None; (grids.size.width * grids.size.height) as usize];
    for layer in &grids.ground {
        for (index, cell) in layer.cells.iter().enumerate() {
            let Some(entry) = grids.entry(*cell) else {
                continue;
            };
            let tileset: &TilesetDef = entry.tileset.get(content);
            if let Some(surface) = tileset.surface(entry.tile) {
                footsteps[index] = Some(surface.get(content).footstep);
            }
        }
    }
    footsteps
}

pub fn in_map(size: GridSize, at: Pos<Tiles>) -> bool {
    at.cell().index(size).is_some()
}
