use std::collections::HashSet;

use egui::{Color32, Stroke as EStroke, Vec2};
use game::core::math::{Pos, Rect, Rng, Size};
use game::core::tiling::{Cell, CellPos, TilePos, TileSize};
use game::systems::area::{self, Flip};
use game::systems::script::Place;

use super::{AreaFrame, AreaTool, grid, pins, select, terrain};
use crate::app::{Editor, PlacePick};
use crate::project::ContentEdit;
use crate::ui::{patterns, theme};
use crate::user::BrushSettings;
use crate::views::tileset::SheetCell;
use crate::{thumbs, user};
use game::core::tiling;
use game::systems::area::tileset::TilesetDef;

#[derive(Clone, Default, Debug)]
pub struct TilePick {
    pub tileset: Option<String>,
    pub block: Vec<Vec<u32>>,
    pub random: Vec<u32>,
    pub anchor: Option<SheetCell>,
}

impl TilePick {
    pub fn is_random(&self, brush: &BrushSettings) -> bool {
        !self.random.is_empty() || brush.random
    }

    pub fn is_empty(&self) -> bool {
        self.block.is_empty() && self.random.is_empty()
    }

    pub fn block_size(&self) -> (usize, usize) {
        (self.block.first().map_or(0, Vec::len), self.block.len())
    }

    pub fn choices(&self) -> Vec<u32> {
        if self.random.is_empty() {
            self.block.iter().flatten().copied().collect()
        } else {
            self.random.clone()
        }
    }

    pub fn tile_at(&self, anchor: CellPos, cell: CellPos, flip_x: bool, flip_y: bool) -> u32 {
        let (w, h) = self.block_size();
        let (w, h) = (w as i32, h as i32);
        let bx = (cell.x - anchor.x).rem_euclid(w);
        let by = (cell.y - anchor.y).rem_euclid(h);
        let bx = if flip_x { w - 1 - bx } else { bx };
        let by = if flip_y { h - 1 - by } else { by };
        self.block[by as usize][bx as usize]
    }
}

#[derive(Clone, Default, Debug)]
pub struct TerrainPick {
    pub tileset: Option<String>,
    pub set: Option<String>,
    pub terrain: usize,
}

pub struct BrushStroke {
    pub draft: grid::GridDraft,
    pub kind: BrushStrokeKind,
    pub cells: HashSet<CellPos>,
    pub seed: u64,
    pub anchor: CellPos,
    pub rng: Rng,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrushStrokeKind {
    Paint,
    Erase,
    Walk,
    Terrain,
}

pub(super) fn grid_stroke(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    kind: BrushStrokeKind,
) {
    let response = frame.response;
    let brush = editor.settings.brush.clone();
    let pressed = response.drag_started_by(egui::PointerButton::Primary)
        || response.clicked_by(egui::PointerButton::Primary);
    let down = response.dragged_by(egui::PointerButton::Primary);
    let released = response.drag_stopped_by(egui::PointerButton::Primary)
        || response.clicked_by(egui::PointerButton::Primary);
    let Some(cell) = frame.pointer_cell().or_else(|| {
        frame
            .response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p).cell())
    }) else {
        if released {
            finish_stroke(editor, view_key, frame);
        }
        return;
    };
    if pressed && editor.views.area.view(view_key).stroke.is_none() {
        let grids = frame.area().grids;
        let draft = grid::GridDraft::of(&frame.area_key, grids);
        let seed = stroke_seed(editor.frame, cell);
        editor.views.area.view_mut(view_key).stroke = Some(BrushStroke {
            draft,
            kind,
            cells: HashSet::new(),
            seed,
            anchor: cell,
            rng: Rng::new(seed),
        });
    }
    if pressed || down {
        apply_brush(editor, view_key, frame, cell, &brush);
    }
    if released {
        finish_stroke(editor, view_key, frame);
    }
}

pub(super) fn apply_brush(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    center: CellPos,
    brush: &user::BrushSettings,
) {
    let content = frame.content;
    let view = editor.views.area.view_mut(view_key);
    let layer = view.layer;
    let walk_value = view.walk_value;
    let pick = view.pick.clone();
    let terrain = view.terrain.clone();
    let Some(stroke) = &mut view.stroke else {
        return;
    };
    match stroke.kind {
        BrushStrokeKind::Walk => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set_walk(cell, walk_value) {
                    stroke.cells.insert(cell);
                }
            }
        }
        BrushStrokeKind::Erase => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set(layer, cell, None) {
                    stroke.cells.insert(cell);
                }
            }
        }
        BrushStrokeKind::Paint => {
            let Some(tileset) = pick.tileset.clone() else {
                return;
            };
            if pick.is_empty() {
                return;
            }
            let flip = Flip::of(brush.flip_x, brush.flip_y);
            if pick.is_random(brush) {
                let choices = pick.choices();
                for cell in grid::brush_cells(center, brush.size) {
                    if stroke.cells.contains(&cell) {
                        continue;
                    }
                    let tile = stroke.rng.choose(&choices).copied().unwrap_or(0);
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            } else {
                for cell in grid::brush_cells(center, brush.size) {
                    let tile = pick.tile_at(stroke.anchor, cell, brush.flip_x, brush.flip_y);
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            }
        }
        BrushStrokeKind::Terrain => {
            let (Some(tileset), Some(set)) = (terrain.tileset.clone(), terrain.set.clone()) else {
                return;
            };
            let Some(def) = content
                .by_key::<TilesetDef>(&tileset)
                .map(|id| id.get(&content))
            else {
                return;
            };
            let terrain_brush = terrain::TerrainBrush {
                def,
                tileset: &tileset,
                set: &set,
                terrain: terrain.terrain,
                size: brush.size,
            };
            let kept = terrain::paint(
                &mut stroke.draft,
                layer,
                &terrain_brush,
                center,
                &mut stroke.rng,
                &mut stroke.cells,
            );
            if kept > 0 {
                view.skipped = Some(format!("{kept} cells kept: no tile for that mix"));
            }
        }
    }
}

pub(super) fn finish_stroke(editor: &mut Editor, view_key: &str, frame: &AreaFrame) {
    let view = editor.views.area.view_mut(view_key);
    let Some(stroke) = view.stroke.take() else {
        return;
    };
    if stroke.cells.is_empty() || !stroke.draft.is_touched() {
        return;
    }
    let layer_name = stroke
        .draft
        .layer_names()
        .get(view.layer)
        .cloned()
        .unwrap_or_default();
    let label = match stroke.kind {
        BrushStrokeKind::Paint => format!(
            "Paint {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        BrushStrokeKind::Erase => format!(
            "Erase {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        BrushStrokeKind::Walk => format!(
            "Walk grid: {} cells in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        BrushStrokeKind::Terrain => format!(
            "Terrain: {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
    };
    let mut draft = stroke.draft;
    if stroke.kind == BrushStrokeKind::Erase {
        draft.compact_palette();
    }
    let mut edit = ContentEdit::new(label);
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub(super) fn fill(editor: &mut Editor, view_key: &str, frame: &AreaFrame, cell: CellPos) {
    let view = editor.views.area.view(view_key);
    let layer = view.layer;
    let pick = view.pick.clone();
    let walk_overlay = view.walk_overlay;
    let walk_value = view.walk_value;
    let brush = editor.settings.brush.clone();
    let grids = frame.area().grids;
    let mut draft = grid::GridDraft::of(&frame.area_key, grids);
    let cells = draft.flood(layer, cell);
    if cells.is_empty() {
        return;
    }
    let count = cells.len();
    if walk_overlay {
        for cell in cells {
            draft.set_walk(cell, walk_value);
        }
        let mut edit = ContentEdit::new(format!(
            "Walk grid: fill {count} cells in {}",
            frame.area_key
        ));
        draft.write_into(&mut edit);
        editor.apply(edit);
        return;
    }
    let Some(tileset) = pick.tileset.clone() else {
        editor.toast("Pick a tile first");
        return;
    };
    if pick.is_empty() {
        editor.toast("Pick a tile first");
        return;
    }
    let flip = Flip::of(brush.flip_x, brush.flip_y);
    let mut rng = Rng::new(editor.frame);
    let choices = pick.choices();
    for c in cells {
        let tile = if pick.is_random(&brush) {
            rng.choose(&choices).copied().unwrap_or(0)
        } else {
            pick.tile_at(cell, c, brush.flip_x, brush.flip_y)
        };
        let entry = draft.intern(&tileset, tile, flip);
        draft.set(layer, c, Some(entry));
    }
    let layer_name = draft.layer_names().get(layer).cloned().unwrap_or_default();
    let mut edit = ContentEdit::new(format!(
        "Fill {count} cells of {layer_name} in {}",
        frame.area_key
    ));
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub(super) fn eyedrop(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    cell: CellPos,
    topmost: bool,
) {
    let grids = frame.area().grids;
    let view = editor.views.area.view_mut(view_key);
    let layers: Vec<usize> = if topmost {
        (0..grids.ground.len()).rev().collect()
    } else {
        vec![view.layer]
    };
    for layer in layers {
        let Some(index) = cell.index(grids.size) else {
            continue;
        };
        let Some(entry) = grids
            .ground
            .get(layer)
            .and_then(|l| l.cells[index])
            .and_then(|i| grids.palette_keys.get(i as usize))
        else {
            continue;
        };
        view.pick = TilePick {
            tileset: Some(entry.tileset.clone()),
            block: vec![vec![entry.tile]],
            random: Vec::new(),
            anchor: None,
        };
        view.layer = layer;
        editor.settings.brush.flip_x = entry.flip.horizontal();
        editor.settings.brush.flip_y = entry.flip.vertical();
        view.tool = AreaTool::Paint;
        return;
    }
    editor.toast("Nothing on that layer here");
}

pub(super) fn pick_place(
    editor: &mut Editor,
    painter: &egui::Painter,
    frame: &AreaFrame,
    pick: &PlacePick,
    fine: bool,
) {
    let canvas = frame.canvas;
    let area = frame.area();
    let warps = pins::warp_objects(frame.content, frame.area_id);
    let visible = canvas.visible();
    for cell in tiling::cells(area.size.grid()) {
        let bounds = cell.bounds();
        if !visible.intersects(&bounds) {
            continue;
        }
        let valid =
            area.grid.walkable(cell.center()) && !warps.iter().any(|shape| shape.covers_cell(cell));
        if !valid {
            patterns::hatch(
                painter,
                canvas.rect(bounds),
                theme::alpha(theme::BLOCKED, 90),
                canvas.scale(),
            );
        }
    }
    pins::draw_arrivals(editor, painter, frame);
    let text = format!(
        "Pick a place for {} {} · click a cell, Alt-click any point · Esc cancels",
        pick.file, pick.pointer
    );
    painter.text(
        canvas.rect.min + Vec2::new(8.0, 8.0),
        egui::Align2::LEFT_TOP,
        text,
        egui::FontId::proportional(13.0),
        Color32::from_rgb(255, 230, 120),
    );
    let Some(tile) = frame.pointer_tile else {
        return;
    };
    let at = select::snap_to(tile, fine);
    painter.circle_stroke(
        canvas.to_screen(at),
        6.0,
        EStroke::new(2.0, Color32::from_rgb(255, 230, 120)),
    );
    if !frame.response.clicked() {
        return;
    }
    let place = Place {
        area: frame.area_id,
        at,
    };
    if let Err(problem) = area::check_place(&frame.content, place) {
        editor.toast(format!("{}: {}", problem.rule, problem.expected));
        return;
    }
    pins::commit_pick(editor, &frame.area_key, at);
}

pub(super) fn paint_preview(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &AreaFrame,
    cells: &[CellPos],
) {
    let view = editor.views.area.view(view_key);
    let pick = view.pick.clone();
    let (Some(tileset), false) = (pick.tileset.clone(), pick.is_empty()) else {
        return;
    };
    let Some(def) = frame
        .content
        .by_key::<TilesetDef>(&tileset)
        .map(|id| id.get(&frame.content))
    else {
        return;
    };
    let image = def.image.as_str().to_owned();
    let ctx = painter.ctx().clone();
    let Some(project) = &editor.project else {
        return;
    };
    let Some(thumb) = editor.form.thumbnails.image(&ctx, &project.files, &image) else {
        return;
    };
    let columns = (thumb.size[0] as u32 / def.tile.max(1)).max(1);
    let Some(&first) = cells.first() else {
        return;
    };
    let anchor = view.stroke.as_ref().map_or(first, |s| s.anchor);
    let brush = &editor.settings.brush;
    let choices = pick.choices();
    for cell in cells {
        let tile = if pick.is_random(brush) {
            choices[((cell.x * 7 + cell.y * 13).rem_euclid(choices.len() as i32)) as usize]
        } else {
            pick.tile_at(anchor, *cell, brush.flip_x, brush.flip_y)
        };
        let (x, y) = ((tile % columns) * def.tile, (tile / columns) * def.tile);
        let uv = thumbs::uv(
            thumb.size,
            x as f32,
            y as f32,
            def.tile as f32,
            def.tile as f32,
        );
        let uv = thumbs::flip_uv(uv, brush.flip_x, brush.flip_y);
        let rect = frame.canvas.rect(Rect::new(
            Pos::new(cell.x as f32, cell.y as f32),
            Size::splat(1.0),
        ));
        painter.image(
            thumb.texture.id(),
            rect,
            uv,
            Color32::from_rgba_unmultiplied(255, 255, 255, 180),
        );
    }
}

fn stroke_seed(frame: u64, cell: CellPos) -> u64 {
    frame
        .wrapping_mul(6364136223846793005)
        .wrapping_add((cell.x as i64).wrapping_mul(31).wrapping_add(cell.y as i64) as u64)
}
