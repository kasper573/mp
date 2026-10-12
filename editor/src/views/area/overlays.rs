use std::collections::HashSet;

use egui::{Color32, Pos2, Rect as ERect, Sense, Stroke as EStroke, Ui, Vec2};
use game::core::math::{Pos, Rect};
use game::core::tiling::{Cell, CellPos, TileRect, TileSize};
use game::systems::area::{self, AreaModuleKind};
use serde_json::Value;

use super::{
    Frame, TILE_PX, Tool, modules, population, scenery, selected_parts, shapes, size_cells,
};
use crate::app::Editor;
use crate::value::RowValue;

pub(super) fn overlay_grid(painter: &egui::Painter, frame: &Frame, area: &area::Area, lines: bool) {
    let canvas = frame.canvas;
    let bounds = Rect::new(Pos::new(-0.5, -0.5), area.size);
    painter.rect_stroke(
        canvas.rect(bounds),
        0.0,
        EStroke::new(1.0, Color32::from_gray(120)),
        egui::StrokeKind::Outside,
    );
    if !lines || canvas.scale() < 6.0 {
        return;
    }
    let visible = canvas.visible();
    let x0 = visible.min().x.floor().max(-0.5) as i32;
    let x1 = visible.max().x.ceil().min(area.size.width - 0.5) as i32;
    let y0 = visible.min().y.floor().max(-0.5) as i32;
    let y1 = visible.max().y.ceil().min(area.size.height - 0.5) as i32;
    let color = Color32::from_rgba_unmultiplied(255, 255, 255, 28);
    for x in x0..=x1 {
        let sx = canvas.to_screen(Pos::new(x as f32 - 0.5, 0.0)).x;
        painter.line_segment(
            [
                Pos2::new(sx, canvas.rect(bounds).min.y),
                Pos2::new(sx, canvas.rect(bounds).max.y),
            ],
            EStroke::new(1.0, color),
        );
    }
    for y in y0..=y1 {
        let sy = canvas.to_screen(Pos::new(0.0, y as f32 - 0.5)).y;
        painter.line_segment(
            [
                Pos2::new(canvas.rect(bounds).min.x, sy),
                Pos2::new(canvas.rect(bounds).max.x, sy),
            ],
            EStroke::new(1.0, color),
        );
    }
}

pub(super) fn overlay_walk(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    let visible = canvas.visible();
    let size = area.size.grid();
    let grids = area.grids;
    for cell in size_cells(size) {
        let bounds = cell.bounds();
        if !visible.intersects(&bounds) {
            continue;
        }
        let Some(index) = cell.index(size) else {
            continue;
        };
        let rect = canvas.rect(bounds);
        if !area.grid.walkable(cell.center()) {
            hatch(
                painter,
                rect,
                Color32::from_rgba_unmultiplied(220, 60, 60, 110),
                canvas.scale(),
            );
        } else if !area.wild_grid.walkable(cell.center()) {
            painter.rect_filled(rect, 0.0, Color32::from_rgba_unmultiplied(80, 120, 220, 40));
        }
        if grids.walk[index].is_some() && canvas.scale() >= 8.0 {
            let mark =
                ERect::from_min_size(rect.min, Vec2::splat((canvas.scale() * 0.25).max(2.0)));
            let color = if grids.walk[index] == Some(true) {
                Color32::from_rgb(90, 200, 120)
            } else {
                Color32::from_rgb(220, 90, 90)
            };
            painter.rect_filled(mark, 0.0, color);
        }
    }
}

pub fn hatch(painter: &egui::Painter, rect: ERect, color: Color32, scale: f32) {
    painter.rect_filled(
        rect,
        0.0,
        Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), color.a() / 3),
    );
    let step = (scale / 2.0).clamp(3.0, 12.0);
    let mut x = rect.min.x - rect.height();
    while x < rect.max.x {
        let a = Pos2::new(x, rect.max.y);
        let b = Pos2::new(x + rect.height(), rect.min.y);
        let clipped = clip_line(a, b, rect);
        if let Some((a, b)) = clipped {
            painter.line_segment([a, b], EStroke::new(1.0, color));
        }
        x += step;
    }
}

pub(super) fn clip_line(a: Pos2, b: Pos2, rect: ERect) -> Option<(Pos2, Pos2)> {
    let mut t0 = 0.0f32;
    let mut t1 = 1.0f32;
    let d = b - a;
    for (p, q) in [
        (-d.x, a.x - rect.min.x),
        (d.x, rect.max.x - a.x),
        (-d.y, a.y - rect.min.y),
        (d.y, rect.max.y - a.y),
    ] {
        if p == 0.0 {
            if q < 0.0 {
                return None;
            }
            continue;
        }
        let r = q / p;
        if p < 0.0 {
            t0 = t0.max(r);
        } else {
            t1 = t1.min(r);
        }
        if t0 > t1 {
            return None;
        }
    }
    Some((a + d * t0, a + d * t1))
}

pub fn module_color(kind: Option<AreaModuleKind>) -> Color32 {
    match kind {
        Some(AreaModuleKind::Object) => Color32::from_rgb(255, 200, 80),
        Some(AreaModuleKind::SafeZone) => Color32::from_rgb(90, 160, 255),
        Some(AreaModuleKind::Soundscape) => Color32::from_rgb(170, 110, 255),
        Some(AreaModuleKind::Scenery) => Color32::from_rgb(140, 220, 140),
        Some(AreaModuleKind::Blueprint) => Color32::from_rgb(90, 220, 220),
        Some(AreaModuleKind::Population) => Color32::from_rgb(255, 120, 120),
        Some(AreaModuleKind::Resident) => Color32::from_rgb(255, 160, 200),
        _ => Color32::from_gray(200),
    }
}

pub(super) fn overlay_modules(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
) {
    let canvas = frame.canvas;
    let selected: HashSet<String> = selected_parts(editor, &frame.area_key);
    let view = &editor.views.area.views[view_key];
    let editing = view.in_place.last().map(|p| p.module);
    let visible = canvas.visible();
    let hovered = match view.tool {
        Tool::Select | Tool::Module => frame.pointer_tile.and_then(|tile| frame.hit(tile)),
        _ => None,
    };
    for (index, module) in frame.modules.iter().enumerate() {
        let Some(bounds) = frame.module_bounds(index) else {
            continue;
        };
        if !visible.intersects(&bounds) {
            continue;
        }
        let Some(kind) = module.module_kind() else {
            continue;
        };
        if kind == AreaModuleKind::Population && module["roams"].is_null() {
            continue;
        }
        let part = format!("/modules/{index}");
        let is_selected = selected.contains(&part);
        let is_hovered = hovered == Some(index);
        if matches!(kind, AreaModuleKind::Blueprint | AreaModuleKind::Scenery)
            && !is_selected
            && !is_hovered
        {
            continue;
        }
        let color = module_color(Some(kind));
        let rect = canvas.rect(bounds);
        let dim = editing.is_some_and(|e| e != index);
        let alpha = if dim {
            60
        } else if is_selected {
            255
        } else {
            170
        };
        let color = Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), alpha);
        let width = if is_selected { 2.0 } else { 1.0 };
        match kind {
            AreaModuleKind::Soundscape if module["shape"]["type"] == "ellipse" => {
                let center = rect.center();
                let radius = rect.size() / 2.0;
                let points: Vec<Pos2> = (0..48)
                    .map(|i| {
                        let t = i as f32 / 48.0 * std::f32::consts::TAU;
                        Pos2::new(center.x + radius.x * t.cos(), center.y + radius.y * t.sin())
                    })
                    .collect();
                painter.add(egui::Shape::closed_line(points, EStroke::new(width, color)));
            }
            AreaModuleKind::Resident | AreaModuleKind::Object if shapes::is_point(module) => {
                painter.circle_stroke(
                    rect.center(),
                    (canvas.scale() * 0.35).max(3.0),
                    EStroke::new(width, color),
                );
            }
            _ => {
                painter.rect_stroke(
                    rect,
                    0.0,
                    EStroke::new(width, color),
                    egui::StrokeKind::Inside,
                );
            }
        }
        if is_selected
            || is_hovered
            || (kind == AreaModuleKind::Population && canvas.scale() >= 2.0)
        {
            label_chip(
                painter,
                rect.min + Vec2::new(0.0, -4.0),
                &shapes::label(module),
                color,
            );
        }
        if is_selected && shapes::has_size(module) {
            for corner in [
                rect.min,
                Pos2::new(rect.max.x, rect.min.y),
                Pos2::new(rect.min.x, rect.max.y),
                rect.max,
            ] {
                painter.rect_filled(
                    ERect::from_center_size(corner, Vec2::splat(6.0)),
                    0.0,
                    color,
                );
            }
        }
    }
    if view.blueprint.is_some() {
        let (origin, _) = view.origin();
        let at = canvas.to_screen(origin);
        let color = Color32::from_rgb(90, 220, 220);
        painter.line_segment(
            [at - Vec2::new(10.0, 0.0), at + Vec2::new(10.0, 0.0)],
            EStroke::new(1.0, color),
        );
        painter.line_segment(
            [at - Vec2::new(0.0, 10.0), at + Vec2::new(0.0, 10.0)],
            EStroke::new(1.0, color),
        );
        label_chip(painter, at + Vec2::new(8.0, -8.0), "0, 0 · top-left", color);
    }
}

pub(super) fn overlay_selected_scenery(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    area: &area::Area,
) {
    let Some(index) = scenery::selected_scenery(editor, frame) else {
        return;
    };
    let module = &frame.modules[index];
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let canvas = frame.canvas;
    let grids = area.grids;
    let size = area.size.grid();
    for cell in rect.tiles() {
        if let Some(cell_index) = cell.index(size)
            && grids.walk[cell_index] == Some(false)
        {
            hatch(
                painter,
                canvas.rect(cell.bounds()),
                Color32::from_rgba_unmultiplied(220, 60, 60, 140),
                canvas.scale(),
            );
        }
    }
    let at = shapes::pos_of(&module["at"]).unwrap_or(rect.min());
    for block in module["blocks"].as_array().into_iter().flatten() {
        if let (Some(dx), Some(dy)) = (block[0].as_i64(), block[1].as_i64()) {
            let cell = CellPos::new(
                at.x.round() as i32 + dx as i32,
                at.y.round() as i32 + dy as i32,
            );
            hatch(
                painter,
                canvas.rect(cell.bounds()),
                Color32::from_rgba_unmultiplied(220, 120, 60, 140),
                canvas.scale(),
            );
        }
    }
    let height = rect.size.height;
    let sort = module["sort"]
        .as_f64()
        .map(|s| s as f32)
        .unwrap_or(height - 1.0);
    let line_y = rect.min().y + sort;
    let a = canvas.to_screen(Pos::new(rect.min().x, line_y));
    let b = canvas.to_screen(Pos::new(rect.max().x, line_y));
    painter.add(egui::Shape::dashed_line(
        &[a, b],
        EStroke::new(2.0, Color32::from_rgb(120, 170, 255)),
        8.0,
        5.0,
    ));
    let handle = ERect::from_center_size(b + Vec2::new(10.0, 0.0), Vec2::splat(10.0));
    painter.rect_filled(handle, 2.0, Color32::from_rgb(120, 170, 255));
    label_chip(
        painter,
        a + Vec2::new(4.0, -6.0),
        "sort line",
        Color32::from_rgb(120, 170, 255),
    );
    let grab = ui.interact(
        ERect::from_min_max(a, b).expand2(Vec2::new(16.0, 6.0)),
        ui.id().with((view_key, "sort-line")),
        Sense::drag(),
    );
    if grab.hovered() || grab.dragged() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeVertical);
    }
    if grab.drag_stopped()
        && let Some(pointer) = grab.interact_pointer_pos()
    {
        let shift = ui.input(|i| i.modifiers.shift);
        let tile_y = canvas.to_tile(pointer).y - rect.min().y;
        let snapped = if shift {
            (tile_y * 16.0).round() / 16.0
        } else {
            tile_y.round()
        };
        let new_sort = snapped.clamp(0.0, height);
        if (new_sort - sort).abs() > f32::EPSILON {
            let mut modules = frame.modules.clone();
            modules[index]["sort"] = Value::from(new_sort as f64);
            modules::write_modules(
                editor,
                &frame.area_key,
                modules,
                &format!("Move the sort line of the scenery in {}", frame.area_key),
            );
        }
    }
    let tiles: usize = module["tiles"].as_array().map_or(0, |rows| {
        rows.iter()
            .map(|r| {
                r.as_array()
                    .map_or(0, |cells| cells.iter().filter(|c| !c.is_null()).count())
            })
            .sum()
    });
    editor.status.left.push(format!(
        "scenery · {} · {tiles} tiles",
        module.text("tileset")
    ));
    editor
        .status
        .left
        .push("drag the sort line · ⇧ snaps to 1/16".to_owned());
}

pub(super) fn overlay_soundscape_reach(editor: &Editor, painter: &egui::Painter, frame: &Frame) {
    let canvas = frame.canvas;
    for part in selected_parts(editor, &frame.area_key) {
        let Some(index) = part
            .strip_prefix("/modules/")
            .and_then(|i| i.parse::<usize>().ok())
        else {
            continue;
        };
        let Some(module) = frame.modules.get(index) else {
            continue;
        };
        if !module.is_module(AreaModuleKind::Soundscape) {
            continue;
        }
        let Some(bounds) = shapes::bounds(module, None) else {
            continue;
        };
        let reach = module["emit"].as_f64().unwrap_or(0.0) as f32
            + game::core::audio::soundscape::EDGE_FALLOFF.0;
        let outer = bounds.inflate(reach, reach);
        let rect = canvas.rect(outer);
        let color = Color32::from_rgba_unmultiplied(170, 110, 255, 120);
        if module["shape"]["type"] == "ellipse" {
            let center = rect.center();
            let radius = rect.size() / 2.0;
            let points: Vec<Pos2> = (0..64)
                .map(|i| {
                    let t = i as f32 / 64.0 * std::f32::consts::TAU;
                    Pos2::new(center.x + radius.x * t.cos(), center.y + radius.y * t.sin())
                })
                .collect();
            painter.add(egui::Shape::dashed_line(
                &points,
                EStroke::new(1.0, color),
                6.0,
                6.0,
            ));
        } else {
            painter.add(egui::Shape::dashed_line(
                &[
                    rect.left_top(),
                    rect.right_top(),
                    rect.right_bottom(),
                    rect.left_bottom(),
                    rect.left_top(),
                ],
                EStroke::new(1.0, color),
                6.0,
                6.0,
            ));
        }
        label_chip(
            painter,
            rect.left_bottom() + Vec2::new(0.0, 22.0),
            &format!("♪ reach {} tiles", crate::forms::tiles(reach)),
            Color32::from_rgb(190, 150, 255),
        );
    }
}

pub(super) fn overlay_blueprint_ghost(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
) {
    let canvas = frame.canvas;
    let (origin, blueprint) = {
        let view = &editor.views.area.views[view_key];
        let Some(blueprint) = view.blueprint.clone() else {
            return;
        };
        (view.origin().0, blueprint)
    };
    let ctx = ui.ctx().clone();
    let Some((texture, uv, drawn)) = population::player_sprite(editor, &ctx, frame.content) else {
        return;
    };
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let feet_tile = view
        .ghost
        .unwrap_or(Pos::new(origin.x + 4.0, origin.y + 2.0));
    let scale = canvas.scale() / TILE_PX;
    let shown = drawn * scale;
    let feet = canvas.to_screen(feet_tile) + Vec2::new(0.0, canvas.scale() * 0.5);
    let sprite = ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, shown.y),
        feet + Vec2::new(shown.x / 2.0, 0.0),
    );
    painter.add(egui::Shape::ellipse_filled(
        feet,
        Vec2::new(shown.x * 0.35, shown.x * 0.12),
        Color32::from_rgba_unmultiplied(0, 0, 0, 70),
    ));
    painter.image(
        texture,
        sprite,
        uv,
        Color32::from_rgba_unmultiplied(255, 255, 255, 230),
    );
    let heard: Vec<String> = frame
        .modules
        .iter()
        .filter(|m| m.is_module(AreaModuleKind::Soundscape))
        .filter_map(|m| {
            let bounds = shapes::bounds(m, None)?;
            let emit = m["emit"].as_f64().unwrap_or(0.0) as f32;
            let inside = bounds.inflate(emit, emit);
            let outer = bounds.inflate(
                emit + game::core::audio::soundscape::EDGE_FALLOFF.0,
                emit + game::core::audio::soundscape::EDGE_FALLOFF.0,
            );
            if !outer.contains(feet_tile) {
                return None;
            }
            let gain = if inside.contains(feet_tile) {
                1.0
            } else {
                let dx = (inside.min().x - feet_tile.x)
                    .max(feet_tile.x - inside.max().x)
                    .max(0.0);
                let dy = (inside.min().y - feet_tile.y)
                    .max(feet_tile.y - inside.max().y)
                    .max(0.0);
                (1.0 - (dx.max(dy) / game::core::audio::soundscape::EDGE_FALLOFF.0)).clamp(0.0, 1.0)
            };
            let file = m["channels"]
                .as_array()
                .and_then(|c| c.first())
                .and_then(|c| c["file"].as_str())
                .and_then(|f| f.rsplit('/').next())
                .map(|f| {
                    f.trim_end_matches(".flac")
                        .trim_end_matches(".ogg")
                        .to_owned()
                })
                .unwrap_or_else(|| "soundscape".to_owned());
            Some(format!("hears {file} {:.2}", gain))
        })
        .collect();
    let text = if heard.is_empty() {
        "ghost".to_owned()
    } else {
        format!("ghost · {}", heard.join(" · "))
    };
    label_chip(
        painter,
        sprite.right_bottom() + Vec2::new(8.0, 0.0),
        &text,
        Color32::WHITE,
    );
    let drag = ui.interact(sprite, ui.id().with((view_key, "ghost")), Sense::drag());
    if drag.dragged()
        && let Some(pointer) = drag.interact_pointer_pos()
    {
        let tile = canvas.to_tile(pointer);
        view.ghost = Some(Pos::new(tile.x, tile.y - 0.5));
    }
    let _ = blueprint;
}

pub(super) fn overlay_populations(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    area: &area::Area,
) {
    let canvas = frame.canvas;
    let ctx = ui.ctx().clone();
    let hidden = editor.views.area.views[view_key].population_hidden.clone();
    let seeds = editor.views.area.views[view_key].population_seed.clone();
    for (index, module) in frame.modules.iter().enumerate() {
        if !module.is_module(AreaModuleKind::Population) || hidden.contains(&index) {
            continue;
        }
        let Some(npc) = module["npc"].as_str() else {
            continue;
        };
        let Some((texture, uv, drawn)) = population::npc_sprite(editor, &ctx, frame.content, npc)
        else {
            continue;
        };
        let scale = canvas.scale() / TILE_PX;
        for at in
            population::population_places(area, module, seeds.get(&index).copied().unwrap_or(0))
        {
            let feet = canvas.to_screen(at) + Vec2::new(0.0, canvas.scale() * 0.5);
            let shown = drawn * scale;
            let sprite = ERect::from_min_max(
                feet - Vec2::new(shown.x / 2.0, shown.y),
                feet + Vec2::new(shown.x / 2.0, 0.0),
            );
            painter.add(egui::Shape::ellipse_filled(
                feet,
                Vec2::new(shown.x * 0.35, shown.x * 0.12),
                Color32::from_rgba_unmultiplied(0, 0, 0, 70),
            ));
            painter.image(
                texture,
                sprite,
                uv,
                Color32::from_rgba_unmultiplied(255, 255, 255, 200),
            );
        }
    }
}

pub fn label_chip(painter: &egui::Painter, bottom_left: Pos2, text: &str, color: Color32) {
    let galley = painter.layout_no_wrap(text.to_owned(), egui::FontId::monospace(11.5), color);
    let size = galley.size() + Vec2::new(10.0, 6.0);
    let back = ERect::from_min_size(bottom_left - Vec2::new(0.0, size.y), size);
    painter.rect_filled(back, 4.0, Color32::from_rgba_unmultiplied(20, 22, 26, 225));
    painter.galley(back.min + Vec2::new(5.0, 3.0), galley, color);
}

pub(super) fn overlay_surfaces(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    if canvas.scale() < 3.0 {
        return;
    }
    let visible = canvas.visible();
    let mut palette: Vec<(String, Color32)> = Vec::new();
    for cell in size_cells(area.size.grid()) {
        let tile = cell.center();
        if !visible.contains(tile) {
            continue;
        }
        let Some(surface) = area.footstep_at(cell) else {
            continue;
        };
        let key = surface.key(&frame.content);
        let colour = match palette.iter().find(|(k, _)| k == key) {
            Some((_, colour)) => *colour,
            None => {
                let hue = (palette.len() as f32 * 0.37) % 1.0;
                let colour = hsv(hue, 0.55, 0.95);
                palette.push((key.to_owned(), colour));
                colour
            }
        };
        let rect = canvas.rect(cell.bounds());
        painter.rect_filled(
            rect,
            0.0,
            Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 70),
        );
        painter.line_segment(
            [rect.left_bottom(), rect.right_top()],
            EStroke::new(
                1.0,
                Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 120),
            ),
        );
    }
}

pub fn hsv(h: f32, s: f32, v: f32) -> Color32 {
    let i = (h * 6.0).floor();
    let f = h * 6.0 - i;
    let (p, q, t) = (v * (1.0 - s), v * (1.0 - f * s), v * (1.0 - (1.0 - f) * s));
    let (r, g, b) = match i as i32 % 6 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    Color32::from_rgb((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

pub(super) fn overlay_sort_lines(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    for scenery in &area.scenery {
        let Some(line) = scenery.sort_line() else {
            continue;
        };
        let width = scenery.tiles.first().map_or(0, Vec::len) as f32;
        let a = canvas.to_screen(Pos::new(scenery.at.x, line.0));
        let b = canvas.to_screen(Pos::new(scenery.at.x + width, line.0));
        painter.add(egui::Shape::dashed_line(
            &[a, b],
            EStroke::new(1.5, Color32::from_rgb(120, 170, 255)),
            6.0,
            4.0,
        ));
    }
}
