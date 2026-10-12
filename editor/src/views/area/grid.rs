use std::collections::HashSet;

use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, CellPos, GridSize, Tiles};
use game::systems::area::grid::{AreaGrids, Flip, GroundLayer, PaletteEntry};

use crate::project::Edit;

/// A working copy of an area's grid files, edited by cell and written back as CSV.
#[derive(Clone)]
pub struct GridDraft {
    pub area: String,
    pub size: GridSize,
    pub palette: Vec<(String, u32, Flip)>,
    pub ground: Vec<GroundLayer>,
    pub walk: Vec<Option<bool>>,
    touched: HashSet<String>,
}

impl GridDraft {
    pub fn of(area: &str, grids: &AreaGrids) -> GridDraft {
        GridDraft {
            area: area.to_owned(),
            size: grids.size,
            palette: grids.palette_keys.clone(),
            ground: grids.ground.clone(),
            walk: grids.walk.clone(),
            touched: HashSet::new(),
        }
    }

    pub fn index(&self, cell: CellPos) -> Option<usize> {
        cell.index(self.size)
    }

    pub fn cells(&self) -> impl Iterator<Item = CellPos> {
        let (w, h) = (self.size.width as i32, self.size.height as i32);
        (0..h).flat_map(move |y| (0..w).map(move |x| CellPos::new(x, y)))
    }

    pub fn entry(&self, index: u32) -> Option<&(String, u32, Flip)> {
        self.palette.get(index as usize)
    }

    pub fn entry_of(&self, tileset: &str, tile: u32, flip: Flip) -> Option<u32> {
        self.palette
            .iter()
            .position(|(set, t, f)| set == tileset && *t == tile && *f == flip)
            .map(|index| index as u32)
    }

    /// The palette index of a tile, added at the end when the area didn't use it yet.
    pub fn intern(&mut self, tileset: &str, tile: u32, flip: Flip) -> u32 {
        if let Some(index) = self.entry_of(tileset, tile, flip) {
            return index;
        }
        self.palette.push((tileset.to_owned(), tile, flip));
        self.touched.insert("palette".to_owned());
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
        self.touched.insert(name);
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
        self.touched.insert("walk".to_owned());
        true
    }

    /// Edge-joined cells of the layer holding the same entry as `start`.
    pub fn flood(&self, layer: usize, start: CellPos) -> Vec<CellPos> {
        let Some(ground) = self.ground.get(layer) else {
            return Vec::new();
        };
        let Some(start_index) = self.index(start) else {
            return Vec::new();
        };
        let wanted = ground.cells[start_index];
        let mut seen = vec![false; ground.cells.len()];
        let mut out = Vec::new();
        let mut stack = vec![start];
        seen[start_index] = true;
        while let Some(cell) = stack.pop() {
            out.push(cell);
            for (dx, dy) in game::core::tiling::NEIGHBORS_4 {
                let next = cell.step((dx, dy));
                if let Some(index) = self.index(next)
                    && !seen[index]
                    && ground.cells[index] == wanted
                {
                    seen[index] = true;
                    stack.push(next);
                }
            }
        }
        out
    }

    pub fn add_layer(&mut self, name: &str) {
        self.ground.push(GroundLayer {
            name: name.to_owned(),
            cells: vec![None; (self.size.width * self.size.height) as usize],
        });
        self.touched.insert(name.to_owned());
    }

    pub fn is_touched(&self) -> bool {
        !self.touched.is_empty()
    }

    pub fn layer_names(&self) -> Vec<String> {
        self.ground.iter().map(|layer| layer.name.clone()).collect()
    }

    /// Drops palette entries no layer uses any more, renumbering the cells.
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
            let name = layer.name.clone();
            for cell in &mut layer.cells {
                if let Some(index) = *cell {
                    *cell = renumber[index as usize];
                }
            }
            self.touched.insert(name);
        }
        self.palette = palette;
        self.touched.insert("palette".to_owned());
    }

    /// Writes every touched grid file into the edit.
    pub fn write_into(&self, edit: &mut Edit) {
        let folder = format!("tables/area/{}", self.area);
        let grids = self.as_grids();
        if self.touched.contains("palette") {
            edit.write(
                format!("{folder}/palette.csv"),
                bytes(grids.write_palette()),
            );
        }
        if self.touched.contains("walk") {
            edit.write(format!("{folder}/walk.csv"), bytes(grids.write_walk()));
        }
        for layer in &grids.ground {
            if self.touched.contains(&layer.name) {
                edit.write(
                    format!("{folder}/{}.csv", layer.name),
                    bytes(grids.write_layer(layer)),
                );
            }
        }
    }

    /// Writes every grid file into the edit, for a new or resized area.
    pub fn write_all_into(&self, edit: &mut Edit) {
        let folder = format!("tables/area/{}", self.area);
        let grids = self.as_grids();
        edit.write(
            format!("{folder}/palette.csv"),
            bytes(grids.write_palette()),
        );
        edit.write(format!("{folder}/walk.csv"), bytes(grids.write_walk()));
        for layer in &grids.ground {
            edit.write(
                format!("{folder}/{}.csv", layer.name),
                bytes(grids.write_layer(layer)),
            );
        }
    }

    fn as_grids(&self) -> AreaGrids {
        AreaGrids {
            size: self.size,
            palette: Vec::new(),
            palette_keys: self.palette.clone(),
            ground: self.ground.clone(),
            walk: self.walk.clone(),
        }
    }

    /// The grids resized to `size`, the old content shifted by `shift` cells; cells outside are
    /// clipped and counted.
    pub fn resized(&self, size: GridSize, shift: (i32, i32)) -> (GridDraft, usize) {
        let count = (size.width * size.height) as usize;
        let mut clipped = 0;
        let mut out = GridDraft {
            area: self.area.clone(),
            size,
            palette: self.palette.clone(),
            ground: self
                .ground
                .iter()
                .map(|layer| GroundLayer {
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

    pub fn palette_entries(
        &self,
        content: &game::core::content::Content,
    ) -> Vec<Option<PaletteEntry>> {
        self.palette
            .iter()
            .map(|(tileset, tile, flip)| {
                let id = content.by_key::<game::systems::area::tileset::TilesetDef>(tileset)?;
                Some(PaletteEntry {
                    tileset: id,
                    tile: *tile,
                    flip: *flip,
                })
            })
            .collect()
    }
}

fn bytes(text: String) -> crate::project::Bytes {
    crate::project::Bytes::from(text.into_bytes())
}

/// The cells a square brush of `size` covers, centred on the cursor cell (even sizes lean up-left).
pub fn brush_cells(center: CellPos, size: u32) -> Vec<CellPos> {
    let size = size.max(1) as i32;
    let offset = (size - 1) / 2 + (size + 1) % 2;
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
