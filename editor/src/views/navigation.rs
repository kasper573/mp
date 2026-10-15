use egui::{Pos2, Rect, Response, Ui, Vec2};

use super::area::TILE_PX;

pub fn zoom_and_pan(
    ui: &Ui,
    response: &Response,
    rect: Rect,
    zoom_range: (f32, f32),
    center: &mut Pos2,
    zoom: &mut f32,
) -> bool {
    let scroll = ui.input(|i| i.smooth_scroll_delta);
    let zoom_delta = ui.input(|i| i.zoom_delta());
    if response.hovered() && (scroll.y != 0.0 || zoom_delta != 1.0) {
        let factor = if zoom_delta != 1.0 {
            zoom_delta
        } else {
            (scroll.y / 240.0).exp2()
        };
        let before = *zoom;
        *zoom = (before * factor).clamp(zoom_range.0, zoom_range.1);
        if let Some(pointer) = response.hover_pos() {
            let under = tile_under(rect, *center, before, pointer);
            *center = under + (*center - under) * (before / *zoom);
        }
    }
    let space = ui.input(|i| i.key_down(egui::Key::Space));
    let panning = response.dragged_by(egui::PointerButton::Middle)
        || (space && response.dragged_by(egui::PointerButton::Primary));
    if panning {
        *center -= response.drag_delta() / (*zoom * TILE_PX);
    }
    panning
}

fn tile_under(rect: Rect, center: Pos2, zoom: f32, pointer: Pos2) -> Pos2 {
    center + (pointer - rect.center()) / (zoom * TILE_PX)
}

pub fn pixels_per_unit(available: Vec2, content: Vec2) -> f32 {
    (available.x / content.x.max(1.0)).min(available.y / content.y.max(1.0))
}

pub fn fit_zoom(available: Vec2, content_tiles: Vec2, tile_px: f32) -> f32 {
    pixels_per_unit(available, content_tiles) / tile_px
}
