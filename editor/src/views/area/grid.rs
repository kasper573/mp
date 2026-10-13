use std::collections::HashSet;

use game::core::content::Content;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{self, Cell, CellPos, GridSize, NEIGHBORS_4, Tiles};
use game::systems::area::grid::{self, AreaGrids, Flip, GroundLayer, PaletteEntry, PaletteRow};

use crate::project::{ContentEdit, ProjectFiles, text_bytes};

#[derive(Clone)]
pub struct GridDraft {
    pub area: String,
    pub size: GridSize,
    pub palette: Vec<PaletteRow>,
    pub ground: Vec<GroundLayer>,
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
        tiling::cells(self.size)
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
            for (dx, dy) in NEIGHBORS_4 {
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

    fn write_parts(&self, edit: &mut ContentEdit, wanted: impl Fn(&GridPart) -> bool) {
        let folder = grid::folder(&self.area);
        if wanted(&GridPart::Palette) {
            edit.write(
                grid::palette_file(&self.area),
                text_bytes(grid::write_palette(&self.palette)),
            );
        }
        if wanted(&GridPart::Walk) {
            edit.write(
                format!("{folder}/{}", grid::WALK_FILE),
                text_bytes(grid::write_walk(self.size, &self.walk)),
            );
        }
        for layer in &self.ground {
            if wanted(&GridPart::Layer(layer.name.clone())) {
                edit.write(
                    format!("{folder}/{}", grid::layer_file(&layer.name)),
                    text_bytes(grid::write_layer(self.size, layer)),
                );
            }
        }
    }

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

    pub fn palette_entries(&self, content: &Content) -> Vec<Option<PaletteEntry>> {
        self.palette
            .iter()
            .map(|row| row.resolve(content))
            .collect()
    }
}

pub fn palettes(files: &ProjectFiles) -> Vec<(String, Vec<PaletteRow>)> {
    files
        .paths_under("tables/")
        .filter_map(|path| {
            let area = grid::area_of_palette_file(path)?;
            let text = files.text(path)?;
            let file = grid::GridFile { path, text: &text };
            let rows = grid::read_palette(file, &mut Vec::new())?;
            Some((area.to_owned(), rows))
        })
        .collect()
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
