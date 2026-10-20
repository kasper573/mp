use std::collections::HashSet;

use engine::core::content::{Content, ContentFile, table_of};
use engine::core::math::{Pos, Rect, Size};
use engine::core::tiling::{Cell, CellPos, GridDims, GridSize, NEIGHBORS_4, TilePos, Tiles};
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::grid::{self, Flip, LayerGrid, PaletteRow};
use engine::systems::area::scene::{self, LAYERS_FOLDER, PALETTE_FILE, WALK_FILE};

use crate::project::{ContentEdit, ProjectFiles, text_bytes};

/// The grids an area's or a blueprint's bundle keeps, being painted: its palette, its ground
/// layers in tree order and its forced walk cells. What placed blueprints paint over them is not
/// in it.
#[derive(Clone)]
pub struct GridDraft {
    pub bundle: String,
    pub size: GridSize,
    pub palette: Vec<PaletteRow>,
    pub ground: Vec<LayerGrid>,
    pub walk: Vec<Option<bool>>,
    touched: HashSet<GridPart>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum GridPart {
    Palette,
    Walk,
    Layer(String),
}

impl GridDraft {
    /// The grids of the area or blueprint bundle at `bundle`, as `content` loaded them.
    pub fn own(content: &Content, bundle: &str) -> Option<GridDraft> {
        let blueprint = blueprint_of(content, bundle)?;
        let map = &blueprint.map;
        let grids = &blueprint.scene.grids;
        Some(GridDraft {
            bundle: bundle.to_owned(),
            size: map.size.grid(),
            palette: grids.palette.clone(),
            ground: scene::layers(&blueprint.scene.nodes)
                .into_iter()
                .map(|layer| LayerGrid {
                    name: layer.name.clone(),
                    cells: grids.layer(&layer.name, map),
                })
                .collect(),
            walk: grids.walk.clone(),
            touched: HashSet::new(),
        })
    }

    pub fn index(&self, cell: CellPos) -> Option<usize> {
        cell.index(self.size)
    }

    pub fn cells(&self) -> impl Iterator<Item = CellPos> {
        self.size.cells()
    }

    pub fn entry(&self, index: u32) -> Option<&PaletteRow> {
        self.palette.get(index as usize)
    }

    pub fn entry_of(&self, tileset: &str, tile: u32, flip: Flip) -> Option<u32> {
        self.palette
            .iter()
            .position(|row| row.tileset == tileset && row.tile == tile && row.flip == flip)
            .map(|index| index as u32)
    }

    pub fn intern(&mut self, tileset: &str, tile: u32, flip: Flip) -> u32 {
        if let Some(index) = self.entry_of(tileset, tile, flip) {
            return index;
        }
        self.palette.push(PaletteRow {
            tileset: tileset.to_owned(),
            tile,
            flip,
        });
        self.touched.insert(GridPart::Palette);
        (self.palette.len() - 1) as u32
    }

    pub fn get(&self, layer: usize, cell: CellPos) -> Option<u32> {
        let index = self.index(cell)?;
        self.ground.get(layer)?.cells.get(index).copied().flatten()
    }

    pub fn set(&mut self, layer: usize, cell: CellPos, value: Option<u32>) -> bool {
        let Some(index) = self.index(cell) else {
            return false;
        };
        let Some(ground) = self.ground.get_mut(layer) else {
            return false;
        };
        if ground.cells[index] == value {
            return false;
        }
        ground.cells[index] = value;
        let name = ground.name.clone();
        self.touched.insert(GridPart::Layer(name));
        true
    }

    pub fn walk_at(&self, cell: CellPos) -> Option<bool> {
        self.index(cell).and_then(|index| self.walk[index])
    }

    pub fn set_walk(&mut self, cell: CellPos, value: Option<bool>) -> bool {
        let Some(index) = self.index(cell) else {
            return false;
        };
        if self.walk[index] == value {
            return false;
        }
        self.walk[index] = value;
        self.touched.insert(GridPart::Walk);
        true
    }

    /// The cells joined to `start` that hold what it holds in `layer`.
    pub fn flood(&self, layer: usize, start: CellPos) -> Vec<CellPos> {
        match self.ground.get(layer) {
            Some(ground) => self.flood_by(start, |index| ground.cells[index]),
            None => Vec::new(),
        }
    }

    /// The cells joined to `start` whose walk is forced as its is.
    pub fn flood_walk(&self, start: CellPos) -> Vec<CellPos> {
        self.flood_by(start, |index| self.walk[index])
    }

    pub fn layer_index(&self, name: &str) -> Option<usize> {
        self.ground.iter().position(|layer| layer.name == name)
    }

    fn flood_by<T: PartialEq>(&self, start: CellPos, holds: impl Fn(usize) -> T) -> Vec<CellPos> {
        let Some(start_index) = self.index(start) else {
            return Vec::new();
        };
        let wanted = holds(start_index);
        let mut seen = vec![false; self.walk.len()];
        let mut out = Vec::new();
        let mut stack = vec![start];
        seen[start_index] = true;
        while let Some(cell) = stack.pop() {
            out.push(cell);
            for (dx, dy) in NEIGHBORS_4 {
                let next = cell.step((dx, dy));
                if let Some(index) = self.index(next)
                    && !seen[index]
                    && holds(index) == wanted
                {
                    seen[index] = true;
                    stack.push(next);
                }
            }
        }
        out
    }

    pub fn add_layer(&mut self, name: &str) {
        self.ground.push(LayerGrid {
            name: name.to_owned(),
            cells: vec![None; (self.size.width * self.size.height) as usize],
        });
        self.touched.insert(GridPart::Layer(name.to_owned()));
    }

    pub fn is_touched(&self) -> bool {
        !self.touched.is_empty()
    }

    pub fn layer_names(&self) -> Vec<String> {
        self.ground.iter().map(|layer| layer.name.clone()).collect()
    }

    pub fn compact_palette(&mut self) {
        let mut used = vec![false; self.palette.len()];
        for layer in &self.ground {
            for cell in layer.cells.iter().flatten() {
                if let Some(slot) = used.get_mut(*cell as usize) {
                    *slot = true;
                }
            }
        }
        if used.iter().all(|u| *u) {
            return;
        }
        let mut renumber = vec![None; self.palette.len()];
        let mut next = 0u32;
        let mut palette = Vec::new();
        for (index, keep) in used.iter().enumerate() {
            if *keep {
                renumber[index] = Some(next);
                palette.push(self.palette[index].clone());
                next += 1;
            }
        }
        for layer in &mut self.ground {
            let mut changed = false;
            for cell in &mut layer.cells {
                if let Some(index) = *cell {
                    let renumbered = renumber[index as usize];
                    changed |= renumbered != Some(index);
                    *cell = renumbered;
                }
            }
            if changed {
                self.touched.insert(GridPart::Layer(layer.name.clone()));
            }
        }
        self.palette = palette;
        self.touched.insert(GridPart::Palette);
    }

    pub fn write_into(&self, edit: &mut ContentEdit) {
        self.write_parts(edit, |part| self.touched.contains(part));
    }

    pub fn write_all_into(&self, edit: &mut ContentEdit) {
        self.write_parts(edit, |_| true);
    }

    // An empty grid is no file, so a bundle keeps only what was painted.
    fn write_parts(&self, edit: &mut ContentEdit, wanted: impl Fn(&GridPart) -> bool) {
        let bundle = &self.bundle;
        if wanted(&GridPart::Palette) {
            let file = format!("{bundle}/{PALETTE_FILE}");
            if self.palette.is_empty() {
                edit.remove(file)
            } else {
                edit.write(file, text_bytes(grid::write_palette(&self.palette)))
            };
        }
        if wanted(&GridPart::Walk) {
            let file = format!("{bundle}/{WALK_FILE}");
            if self.walk.iter().all(Option::is_none) {
                edit.remove(file)
            } else {
                edit.write(file, text_bytes(grid::write_walk(self.size, &self.walk)))
            };
        }
        for layer in &self.ground {
            if wanted(&GridPart::Layer(layer.name.clone())) {
                let file = layer_file(bundle, &layer.name);
                if layer.cells.iter().all(Option::is_none) {
                    edit.remove(file)
                } else {
                    edit.write(
                        file,
                        text_bytes(grid::write_grid_cells(self.size, &layer.cells)),
                    )
                };
            }
        }
    }

    /// Makes what a placement of `placed` at `at`, flipped as `flip`, paints this bundle's own:
    /// its cells into the layers of the same name and its forced walk cells. Answers the names of
    /// the layers it paints that this bundle has none of.
    pub fn stamp(&mut self, placed: &GridDraft, at: Pos<Tiles>, flip: Flip) -> Vec<String> {
        let mut missing = Vec::new();
        for cell in placed.cells() {
            let from = placed.index(cell).expect("a cell of the grid");
            let square = Rect::new(Pos::new(cell.x as f32, cell.y as f32), Size::splat(1.0));
            let to = flip.place(square, at).origin.cell();
            for layer in &placed.ground {
                let Some(row) = layer.cells[from]
                    .and_then(|tile| placed.entry(tile))
                    .cloned()
                else {
                    continue;
                };
                let Some(target) = self.ground.iter().position(|own| own.name == layer.name) else {
                    if !missing.contains(&layer.name) {
                        missing.push(layer.name.clone());
                    }
                    continue;
                };
                let tile = self.intern(&row.tileset, row.tile, row.flip.compose(flip));
                self.set(target, to, Some(tile));
            }
            if let Some(forced) = placed.walk[from] {
                self.set_walk(to, Some(forced));
            }
        }
        missing
    }

    pub fn resized(&self, size: GridSize, shift: (i32, i32)) -> (GridDraft, usize) {
        let count = (size.width * size.height) as usize;
        let mut clipped = 0;
        let mut out = GridDraft {
            bundle: self.bundle.clone(),
            size,
            palette: self.palette.clone(),
            ground: self
                .ground
                .iter()
                .map(|layer| LayerGrid {
                    name: layer.name.clone(),
                    cells: vec![None; count],
                })
                .collect(),
            walk: vec![None; count],
            touched: HashSet::new(),
        };
        for cell in self.cells() {
            let from = self.index(cell).expect("a cell of the grid");
            let moved = CellPos::new(cell.x + shift.0, cell.y + shift.1);
            let Some(to) = moved.index(size) else {
                let had = self.walk[from].is_some()
                    || self.ground.iter().any(|layer| layer.cells[from].is_some());
                if had {
                    clipped += 1;
                }
                continue;
            };
            out.walk[to] = self.walk[from];
            for (layer, source) in out.ground.iter_mut().zip(&self.ground) {
                layer.cells[to] = source.cells[from];
            }
        }
        (out, clipped)
    }
}

/// The palette of every area and blueprint bundle that has one, by the bundle's path.
pub fn palettes(files: &ProjectFiles) -> Vec<(String, Vec<PaletteRow>)> {
    let index = files.index();
    index
        .paths_of(AreaDef::TABLE)
        .chain(index.paths_of(BlueprintDef::TABLE))
        .filter_map(|bundle| {
            let path = palette_file(bundle);
            let text = files.text(&path)?;
            let file = grid::GridFile {
                path: &path,
                text: &text,
            };
            let rows = grid::read_palette(file, &mut Vec::new())?;
            Some((bundle.to_owned(), rows))
        })
        .collect()
}

/// The palette file of the area or blueprint bundle at `bundle`.
pub fn palette_file(bundle: &str) -> String {
    format!("{bundle}/{PALETTE_FILE}")
}

/// The grid file of the ground layer `name` in the bundle at `bundle`.
pub fn layer_file(bundle: &str, name: &str) -> String {
    format!("{bundle}/{LAYERS_FOLDER}/{name}.csv")
}

/// The blueprint an area or blueprint bundle holds, as `content` loaded it.
pub fn blueprint_of<'c>(content: &'c Content, bundle: &str) -> Option<&'c BlueprintDef> {
    match table_of(bundle)? {
        AreaDef::TABLE => Some(&content.by_path::<AreaDef>(bundle)?.get(content).blueprint),
        BlueprintDef::TABLE => Some(content.by_path::<BlueprintDef>(bundle)?.get(content)),
        _ => None,
    }
}

pub fn brush_cells(center: CellPos, size: u32) -> Vec<CellPos> {
    let size = size.max(1) as i32;
    let offset = size / 2;
    let min_x = center.x - offset;
    let min_y = center.y - offset;
    (0..size)
        .flat_map(move |dy| (0..size).map(move |dx| CellPos::new(min_x + dx, min_y + dy)))
        .collect()
}

pub fn rect_of_cells(cells: &[CellPos]) -> Option<Rect<Tiles>> {
    let min_x = cells.iter().map(|c| c.x).min()?;
    let min_y = cells.iter().map(|c| c.y).min()?;
    let max_x = cells.iter().map(|c| c.x).max()?;
    let max_y = cells.iter().map(|c| c.y).max()?;
    Some(Rect::new(
        Pos::new(min_x as f32 - 0.5, min_y as f32 - 0.5),
        Size::new((max_x - min_x + 1) as f32, (max_y - min_y + 1) as f32),
    ))
}
