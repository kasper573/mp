use std::collections::HashSet;

use egui::{Color32, Pos2, Rect as ERect, Stroke as EStroke, Vec2};
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, CellPos, TilePos, TileSize};
use game::systems::area::{self, Flip};

use super::select::snap_sixteenth;
use super::{Frame, Tool, grid, pins};
use crate::app::{Editor, PickWhat};
use crate::project::Edit;

#[derive(Clone, Default, Debug)]
pub struct TilePick {
    pub tileset: Option<String>,
    pub block: Vec<Vec<u32>>,
    pub random: Vec<u32>,
    pub anchor: Option<(u32, u32)>,
}

impl TilePick {
    pub fn is_empty(&self) -> bool {
        self.block.is_empty() && self.random.is_empty()
    }

    pub fn block_size(&self) -> (usize, usize) {
        (self.block.first().map_or(0, Vec::len), self.block.len())
    }
}

#[derive(Clone, Default, Debug)]
pub struct TerrainPick {
    pub tileset: Option<String>,
    pub set: Option<String>,
    pub terrain: usize,
}

pub struct Stroke {
    pub draft: grid::GridDraft,
    pub kind: StrokeKind,
    pub cells: HashSet<CellPos>,
    pub seed: u64,
    pub anchor: CellPos,
    pub rng: game::core::math::Rng,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StrokeKind {
    Paint,
    Erase,
    Walk,
    Terrain,
}

pub(super) fn grid_stroke(editor: &mut Editor, view_key: &str, frame: &Frame, kind: StrokeKind) {
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
    if pressed && editor.views.area.views[view_key].stroke.is_none() {
        let grids = frame.area().grids;
        let draft = grid::GridDraft::of(&frame.area_key, grids);
        let seed = editor
            .frame
            .wrapping_mul(6364136223846793005)
            .wrapping_add(cell.x as u64 * 31 + cell.y as u64);
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .stroke = Some(Stroke {
            draft,
            kind,
            cells: HashSet::new(),
            seed,
            anchor: cell,
            rng: game::core::math::Rng::new(seed),
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
    frame: &Frame,
    center: CellPos,
    brush: &crate::user::BrushSettings,
) {
    let content = frame.content;
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let layer = view.layer;
    let walk_value = view.walk_value;
    let pick = view.pick.clone();
    let terrain = view.terrain.clone();
    let Some(stroke) = &mut view.stroke else {
        return;
    };
    match stroke.kind {
        StrokeKind::Walk => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set_walk(cell, walk_value) {
                    stroke.cells.insert(cell);
                }
            }
        }
        StrokeKind::Erase => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set(layer, cell, None) {
                    stroke.cells.insert(cell);
                }
            }
        }
        StrokeKind::Paint => {
            let Some(tileset) = pick.tileset.clone() else {
                return;
            };
            if pick.is_empty() {
                return;
            }
            let flip = Flip::of(brush.flip_x, brush.flip_y);
            if !pick.random.is_empty() || brush.random {
                let choices: Vec<u32> = if pick.random.is_empty() {
                    pick.block.iter().flatten().copied().collect()
                } else {
                    pick.random.clone()
                };
                for cell in grid::brush_cells(center, brush.size) {
                    if stroke.cells.contains(&cell) {
                        continue;
                    }
                    let tile = choices[stroke.rng.rand_range(0..choices.len() as u32) as usize];
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            } else {
                let (w, h) = pick.block_size();
                let (w, h) = (w as i32, h as i32);
                for cell in grid::brush_cells(center, brush.size) {
                    let bx = (cell.x - stroke.anchor.x).rem_euclid(w);
                    let by = (cell.y - stroke.anchor.y).rem_euclid(h);
                    let (bx, by) = (
                        if brush.flip_x { w - 1 - bx } else { bx },
                        if brush.flip_y { h - 1 - by } else { by },
                    );
                    let tile = pick.block[by as usize][bx as usize];
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            }
        }
        StrokeKind::Terrain => {
            let (Some(tileset), Some(set)) = (terrain.tileset.clone(), terrain.set.clone()) else {
                return;
            };
            let Some(def) = content
                .by_key::<area::tileset::TilesetDef>(&tileset)
                .map(|id| id.get(&content))
            else {
                return;
            };
            let kept = super::terrain::paint(
                &mut stroke.draft,
                layer,
                def,
                &tileset,
                &set,
                terrain.terrain,
                center,
                brush.size,
                &mut stroke.rng,
                &mut stroke.cells,
            );
            if kept > 0 {
                view.skipped = Some(format!("{kept} cells kept: no tile for that mix"));
            }
        }
    }
}

pub(super) fn finish_stroke(editor: &mut Editor, view_key: &str, frame: &Frame) {
    let view = editor.views.area.views.get_mut(view_key).expect("view");
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
        StrokeKind::Paint => format!(
            "Paint {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Erase => format!(
            "Erase {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Walk => format!(
            "Walk grid: {} cells in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Terrain => format!(
            "Terrain: {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
    };
    let mut draft = stroke.draft;
    if stroke.kind == StrokeKind::Erase {
        draft.compact_palette();
    }
    let mut edit = Edit::new(label);
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub(super) fn fill(editor: &mut Editor, view_key: &str, frame: &Frame, cell: CellPos) {
    let view = &editor.views.area.views[view_key];
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
        let mut edit = Edit::new(format!(
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
    let mut rng = game::core::math::Rng::new(editor.frame);
    let choices: Vec<u32> = if pick.random.is_empty() {
        pick.block.iter().flatten().copied().collect()
    } else {
        pick.random.clone()
    };
    let (w, h) = pick.block_size();
    for c in cells {
        let tile = if !pick.random.is_empty() || brush.random {
            choices[rng.rand_range(0..choices.len() as u32) as usize]
        } else {
            let bx = (c.x - cell.x).rem_euclid(w as i32) as usize;
            let by = (c.y - cell.y).rem_euclid(h as i32) as usize;
            pick.block[by][bx]
        };
        let entry = draft.intern(&tileset, tile, flip);
        draft.set(layer, c, Some(entry));
    }
    let layer_name = draft.layer_names().get(layer).cloned().unwrap_or_default();
    let mut edit = Edit::new(format!(
        "Fill {count} cells of {layer_name} in {}",
        frame.area_key
    ));
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub(super) fn eyedrop(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    cell: CellPos,
    topmost: bool,
) {
    let grids = frame.area().grids;
    let view = editor.views.area.views.get_mut(view_key).expect("view");
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
            tileset: Some(entry.0.clone()),
            block: vec![vec![entry.1]],
            random: Vec::new(),
            anchor: None,
        };
        view.layer = layer;
        editor.settings.brush.flip_x = entry.2.horizontal();
        editor.settings.brush.flip_y = entry.2.vertical();
        view.tool = Tool::Paint;
        return;
    }
    editor.toast("Nothing on that layer here");
}

pub(super) fn pick_place(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    pick: &crate::app::PickRequest,
    fine: bool,
) {
    let canvas = frame.canvas;
    let area = frame.area();
    let warps = pins::warp_objects(frame.content, frame.area_id);
    let visible = canvas.visible();
    for cell in super::size_cells(area.size.grid()) {
        let bounds = cell.bounds();
        if !visible.intersects(&bounds) {
            continue;
        }
        let valid =
            area.grid.walkable(cell.center()) && !warps.iter().any(|shape| shape.covers_cell(cell));
        if !valid {
            super::overlays::hatch(
                painter,
                canvas.rect(bounds),
                Color32::from_rgba_unmultiplied(220, 60, 60, 90),
                canvas.scale(),
            );
        }
    }
    pins::draw_arrivals(editor, painter, frame);
    let text = match &pick.what {
        PickWhat::Place { file, pointer } => format!(
            "Pick a place for {file} {pointer} · click a cell, Alt-click any point · Esc cancels"
        ),
    };
    painter.text(
        canvas.rect.min + Vec2::new(8.0, 8.0),
        egui::Align2::LEFT_TOP,
        text,
        egui::FontId::proportional(13.0),
        Color32::from_rgb(255, 230, 120),
    );
    let _ = view_key;
    let Some(tile) = frame.pointer_tile else {
        return;
    };
    let at = if fine {
        snap_sixteenth(tile)
    } else {
        tile.snap()
    };
    painter.circle_stroke(
        canvas.to_screen(at),
        6.0,
        EStroke::new(2.0, Color32::from_rgb(255, 230, 120)),
    );
    if !frame.response.clicked() {
        return;
    }
    let place = game::systems::script::Place {
        area: frame.area_id,
        at,
    };
    if let Err(problem) = area::check_place(&frame.content, place) {
        editor.toast(format!("{}: {}", problem.rule, problem.expected));
        return;
    }
    let PickWhat::Place { file, pointer } = &pick.what;
    let Some(mut target) = editor.project.as_ref().and_then(|p| p.files.json(file)) else {
        editor.pick = None;
        return;
    };
    let Some(slot) = target.pointer_mut(pointer) else {
        editor.toast(format!("{pointer} is gone from {file}"));
        editor.pick = None;
        return;
    };
    *slot = serde_json::json!({ "area": frame.area_key, "x": at.x, "y": at.y });
    let mut edit = Edit::new(format!(
        "Pick place {} {}, {} for {file}",
        frame.area_key, at.x, at.y
    ));
    edit.write_json(file.clone(), &target);
    if editor.apply(edit) {
        editor.pick = None;
        editor.toast(format!("Picked {} {}, {}", frame.area_key, at.x, at.y));
    }
}

pub(super) fn paint_preview(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    cells: &[CellPos],
) {
    let view = &editor.views.area.views[view_key];
    let pick = view.pick.clone();
    let (Some(tileset), false) = (pick.tileset.clone(), pick.is_empty()) else {
        return;
    };
    let Some(def) = frame
        .content
        .by_key::<area::tileset::TilesetDef>(&tileset)
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
    let (w, h) = pick.block_size();
    let anchor = view.stroke.as_ref().map(|s| s.anchor).unwrap_or(cells[0]);
    let brush = &editor.settings.brush;
    for cell in cells {
        let tile = if !pick.random.is_empty() || brush.random {
            let choices: Vec<u32> = if pick.random.is_empty() {
                pick.block.iter().flatten().copied().collect()
            } else {
                pick.random.clone()
            };
            choices[((cell.x * 7 + cell.y * 13).rem_euclid(choices.len() as i32)) as usize]
        } else {
            let bx = (cell.x - anchor.x).rem_euclid(w as i32) as usize;
            let by = (cell.y - anchor.y).rem_euclid(h as i32) as usize;
            let (bx, by) = (
                if brush.flip_x { w - 1 - bx } else { bx },
                if brush.flip_y { h - 1 - by } else { by },
            );
            pick.block[by][bx]
        };
        let (x, y) = ((tile % columns) * def.tile, (tile / columns) * def.tile);
        let mut uv = crate::thumbs::uv(
            thumb.size,
            x as f32,
            y as f32,
            def.tile as f32,
            def.tile as f32,
        );
        if brush.flip_x {
            uv = ERect::from_min_max(Pos2::new(uv.max.x, uv.min.y), Pos2::new(uv.min.x, uv.max.y));
        }
        if brush.flip_y {
            uv = ERect::from_min_max(Pos2::new(uv.min.x, uv.max.y), Pos2::new(uv.max.x, uv.min.y));
        }
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
