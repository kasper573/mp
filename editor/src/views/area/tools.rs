use egui::{Color32, Pos2, Rect as ERect, Stroke as EStroke, Ui, Vec2};
use game::core::math::{Offset, Rect};
use game::core::tiling::{Cell, TilePos, Tiles};
use game::systems::area::AreaModuleKind;

use super::brush::{BrushStrokeKind, eyedrop, fill, grid_stroke, paint_preview, pick_place};
use super::modules::{change_modules, context_menu_at, open_add_menu, show_add_menu};
use super::select::{
    copy_selection, delete_selection, duplicate_selection, move_selection, paste_anchor,
    paste_in_place, select_input, selected_indices, snapped_delta, start_paste,
};
use super::{AreaDrag, AreaFrame, AreaTool, MAX_ZOOM, MIN_ZOOM, blueprint, grid, shapes};
use super::{placement, scenery, stamp};
use crate::app::Editor;
use crate::project::RowSelection;
use crate::ui::{theme, widgets};
use crate::value::RowValue;
use crate::views::navigation::{self, Viewport};

pub fn rail(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    let view = editor.views.area.view_mut(view_key);
    let mut switched = None;
    ui.add_space(6.0);
    for tool in AreaTool::ALL {
        let selected = view.tool == tool;
        let (rect, response) = ui.allocate_exact_size(Vec2::new(32.0, 34.0), egui::Sense::click());
        let painter = ui.painter();
        if selected {
            painter.rect_filled(rect, 5.0, theme::ACCENT);
        } else if response.hovered() {
            painter.rect_filled(rect, 5.0, theme::RAISED);
        }
        let ink = if selected {
            Color32::WHITE
        } else {
            theme::TEXT
        };
        tool_icon(painter, tool, rect.center() - Vec2::new(0.0, 3.0), ink);
        painter.text(
            rect.right_bottom() - Vec2::new(4.0, 2.0),
            egui::Align2::RIGHT_BOTTOM,
            tool.icon(),
            egui::FontId::monospace(9.0),
            if selected {
                Color32::WHITE
            } else {
                theme::MUTED
            },
        );
        if response
            .on_hover_text(format!("{} ({})", tool.label(), tool.icon()))
            .clicked()
        {
            view.tool = tool;
            view.take_drag();
            switched = Some(tool);
        }
        ui.add_space(2.0);
    }
    if let Some(bottom) = switched.and_then(AreaTool::bottom_tab) {
        editor.panels.bottom = bottom;
    }
}

fn tool_icon(painter: &egui::Painter, tool: AreaTool, c: Pos2, ink: Color32) {
    let stroke = EStroke::new(1.6, ink);
    let p = |x: f32, y: f32| Pos2::new(c.x + x, c.y + y);
    match tool {
        AreaTool::Select => {
            painter.add(egui::Shape::convex_polygon(
                vec![
                    p(-5.0, -7.0),
                    p(5.0, 2.0),
                    p(1.0, 2.5),
                    p(3.5, 7.0),
                    p(1.5, 8.0),
                    p(-1.0, 3.5),
                    p(-5.0, 6.0),
                ],
                ink,
                EStroke::NONE,
            ));
        }
        AreaTool::Paint => {
            painter.line_segment([p(-6.0, 6.0), p(3.0, -3.0)], EStroke::new(2.2, ink));
            painter.line_segment([p(3.0, -3.0), p(6.0, -6.0)], EStroke::new(3.5, ink));
            painter.circle_filled(p(-6.0, 6.0), 2.0, ink);
        }
        AreaTool::Terrain => {
            painter.rect_stroke(
                ERect::from_min_max(p(-6.0, -6.0), p(3.0, 3.0)),
                1.0,
                stroke,
                egui::StrokeKind::Middle,
            );
            painter.rect_filled(ERect::from_min_max(p(-2.0, -2.0), p(7.0, 7.0)), 1.0, ink);
        }
        AreaTool::Fill => {
            painter.add(egui::Shape::closed_line(
                vec![p(-6.0, -1.0), p(0.0, -7.0), p(6.0, -1.0), p(0.0, 5.0)],
                stroke,
            ));
            painter.circle_filled(p(5.5, 5.0), 2.2, ink);
        }
        AreaTool::Erase => {
            painter.line_segment([p(-5.0, -5.0), p(5.0, 5.0)], EStroke::new(2.0, ink));
            painter.line_segment([p(-5.0, 5.0), p(5.0, -5.0)], EStroke::new(2.0, ink));
        }
        AreaTool::Eyedropper => {
            painter.line_segment([p(-6.0, 6.0), p(2.0, -2.0)], EStroke::new(2.0, ink));
            painter.circle_filled(p(4.0, -4.0), 3.0, ink);
        }
        AreaTool::Stamp => {
            painter.rect_filled(ERect::from_min_max(p(-7.0, 3.0), p(7.0, 7.0)), 1.0, ink);
            painter.rect_filled(ERect::from_min_max(p(-2.0, -3.0), p(2.0, 3.0)), 0.0, ink);
            painter.circle_filled(p(0.0, -5.0), 3.0, ink);
        }
        AreaTool::Module => {
            painter.line_segment([p(-6.0, 0.0), p(6.0, 0.0)], EStroke::new(2.2, ink));
            painter.line_segment([p(0.0, -6.0), p(0.0, 6.0)], EStroke::new(2.2, ink));
        }
    }
}

pub fn input(
    editor: &mut Editor,
    ui: &mut Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &AreaFrame,
) {
    let response = frame.response;
    let modifiers = ui.input(|i| i.modifiers);
    let view = editor.views.area.view_mut(view_key);
    let mut viewport = Viewport {
        screen: frame.canvas.screen,
        center: view.center,
        zoom: view.zoom,
    };
    let panning = navigation::zoom_and_pan(ui, response, &mut viewport, (MIN_ZOOM, MAX_ZOOM));
    view.center = viewport.center;
    view.zoom = viewport.zoom;
    if panning {
        return;
    }
    if let Some(pick) = editor.pick.clone() {
        pick_place(editor, painter, frame, &pick, modifiers.alt);
        return;
    }
    let tool = editor.views.area.view(view_key).tool;
    let walk_overlay = editor.views.area.view(view_key).walk_overlay;
    if response.secondary_clicked() {
        context_menu_at(editor, view_key, frame);
    }
    let in_place = frame.in_place.last().cloned();
    match tool {
        AreaTool::Select if in_place.is_some() => placement::select_input_in_place(
            editor,
            view_key,
            frame,
            in_place.as_ref().expect("in place"),
            modifiers,
        ),
        AreaTool::Select => select_input(editor, ui, view_key, frame, modifiers),
        AreaTool::Paint if walk_overlay => {
            grid_stroke(editor, view_key, frame, BrushStrokeKind::Walk)
        }
        AreaTool::Paint => grid_stroke(editor, view_key, frame, BrushStrokeKind::Paint),
        AreaTool::Erase => grid_stroke(editor, view_key, frame, BrushStrokeKind::Erase),
        AreaTool::Terrain => grid_stroke(editor, view_key, frame, BrushStrokeKind::Terrain),
        AreaTool::Fill => {
            if response.clicked()
                && let Some(cell) = frame.pointer_cell()
            {
                fill(editor, view_key, frame, cell);
            }
        }
        AreaTool::Eyedropper => {
            if response.clicked()
                && let Some(cell) = frame.pointer_cell()
            {
                eyedrop(editor, view_key, frame, cell, modifiers.alt);
            }
        }
        AreaTool::Stamp => stamp::stamp_input(editor, ui, view_key, frame),
        AreaTool::Module => {
            if response.clicked()
                && let Some(tile) = frame.pointer_tile
            {
                editor.views.area.view_mut(view_key).cursor_cell = Some(tile.cell());
                open_add_menu(ui, editor, view_key, frame, tile);
            }
        }
    }
    show_add_menu(ui, editor, view_key, frame);
}

pub fn overlay(editor: &mut Editor, painter: &egui::Painter, view_key: &str, frame: &AreaFrame) {
    let canvas = frame.canvas;
    let brush = editor.settings.brush.clone();
    let view = editor.views.area.view(view_key);
    let accent = Color32::from_rgb(255, 230, 120);
    match view.drag() {
        Some(AreaDrag::Box { from }) => {
            if let Some(tile) = frame.pointer_tile {
                painter.rect_stroke(
                    canvas.rect(Rect::from_points([*from, tile])),
                    0.0,
                    EStroke::new(1.0, accent),
                    egui::StrokeKind::Inside,
                );
            }
        }
        Some(AreaDrag::Move { from, moved: true }) => {
            if let Some(tile) = frame.pointer_tile {
                let alt = painter.ctx().input(|i| i.modifiers.alt);
                let (dx, dy) = snapped_delta(*from, tile, alt);
                for index in selected_indices(editor, &frame.area_key) {
                    if let Some(bounds) = frame.module_bounds(index) {
                        let moved = bounds.translate(Offset::new(dx, dy));
                        painter.rect_stroke(
                            canvas.rect(moved),
                            0.0,
                            EStroke::new(1.5, accent),
                            egui::StrokeKind::Inside,
                        );
                    }
                }
            }
        }
        _ => {}
    }
    if let Some(listener) = view.listener {
        let at = canvas.to_screen(listener);
        painter.circle_stroke(at, 8.0, EStroke::new(2.0, Color32::from_rgb(170, 110, 255)));
        painter.text(
            at + Vec2::new(10.0, -8.0),
            egui::Align2::LEFT_TOP,
            "listening",
            egui::FontId::proportional(11.0),
            Color32::from_rgb(170, 110, 255),
        );
    }
    if let Some(ghost) = &view.paste
        && let Some(tile) = frame.pointer_tile
    {
        let at = paste_anchor(tile);
        let mut whole: Option<Rect<Tiles>> = None;
        for module in &ghost.modules {
            let mut placed = module.clone();
            shapes::shift(&mut placed, at.x, at.y);
            if let Some(bounds) = shapes::bounds(&placed, None) {
                let color = super::overlays::module_color(module.module_kind());
                let rect = canvas.rect(bounds);
                widgets::dashed_rect(painter, rect, EStroke::new(1.5, color), 6.0, 4.0);
                if matches!(
                    module.module_kind(),
                    Some(
                        AreaModuleKind::Population
                            | AreaModuleKind::Resident
                            | AreaModuleKind::Object
                    )
                ) {
                    frame.labels.chip(
                        rect.min + Vec2::new(0.0, -4.0),
                        shapes::label(module),
                        color,
                    );
                }
                whole = Some(whole.map_or(bounds, |w| w.union(&bounds)));
            }
        }
        if let Some(whole) = whole {
            let rect = canvas.rect(whole);
            widgets::dashed_rect(
                painter,
                rect,
                EStroke::new(1.0, Color32::from_rgba_unmultiplied(255, 120, 160, 160)),
                8.0,
                6.0,
            );
        }
        let from = editor
            .clipboard
            .as_ref()
            .map(|clip| format!(" from area/{}", clip.from))
            .unwrap_or_default();
        frame.labels.chip(
            canvas.to_screen(tile) + Vec2::new(16.0, 8.0),
            format!(
                "{} module{}{from}",
                ghost.modules.len(),
                crate::ui::widgets::plural(ghost.modules.len())
            ),
            Color32::WHITE,
        );
        editor
            .status
            .left
            .push(format!("pasting into area/{}", frame.area_key));
        editor
            .status
            .left
            .push("click or Enter places · Esc cancels".to_owned());
        editor
            .status
            .left
            .push("Ctrl ⇧ V pastes at the same tiles".to_owned());
    }
    let view = editor.views.area.view(view_key);
    let Some(cell) = frame.pointer_cell() else {
        return;
    };
    match view.tool {
        AreaTool::Paint | AreaTool::Erase => {
            let cells = grid::brush_cells(cell, brush.size);
            if let Some(rect) = grid::rect_of_cells(&cells) {
                let color = if view.tool == AreaTool::Erase || view.walk_overlay {
                    Color32::from_rgb(255, 120, 120)
                } else {
                    accent
                };
                painter.rect_stroke(
                    canvas.rect(rect),
                    0.0,
                    EStroke::new(1.5, color),
                    egui::StrokeKind::Inside,
                );
                if view.tool == AreaTool::Paint && !view.walk_overlay {
                    paint_preview(editor, painter, view_key, frame, &cells);
                }
            }
        }
        AreaTool::Terrain => {
            let cells = grid::brush_cells(cell, brush.size);
            if let Some(rect) = grid::rect_of_cells(&cells) {
                let outline = rect.inflate(0.5, 0.5);
                painter.rect_stroke(
                    canvas.rect(outline),
                    0.0,
                    EStroke::new(1.5, Color32::from_rgb(140, 220, 140)),
                    egui::StrokeKind::Inside,
                );
            }
        }
        AreaTool::Fill | AreaTool::Eyedropper | AreaTool::Module => {
            painter.rect_stroke(
                canvas.rect(cell.bounds()),
                0.0,
                EStroke::new(1.0, accent),
                egui::StrokeKind::Inside,
            );
        }
        AreaTool::Stamp => stamp::stamp_overlay(editor, painter, view_key, frame),
        AreaTool::Select => {
            if let Some(cursor) = view.cursor_cell
                && !painter.ctx().text_edit_focused()
            {
                painter.rect_stroke(
                    canvas.rect(cursor.bounds()),
                    0.0,
                    EStroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 90)),
                    egui::StrokeKind::Inside,
                );
            }
        }
    }
}

pub fn keys(editor: &mut Editor, ui: &mut Ui, view_key: &str, frame: &AreaFrame) {
    let input = ui.input(|i| i.clone());
    let modifiers = input.modifiers;
    if editor.pick.is_some() {
        if input.key_pressed(egui::Key::Escape) {
            editor.pick = None;
            editor.toast("Pick cancelled");
        }
        return;
    }
    if !modifiers.ctrl && !modifiers.alt {
        if input.key_pressed(egui::Key::OpenBracket) {
            editor.update_brush(|brush| brush.size = brush.size.saturating_sub(1).max(1));
        }
        if input.key_pressed(egui::Key::CloseBracket) {
            editor.update_brush(|brush| brush.size = (brush.size + 1).min(9));
        }
    }
    let mut switched = None;
    let plain_key = |key: egui::Key| key_event(&input, key, |m| !m.ctrl && !m.alt && !m.command);
    {
        let view = editor.views.area.view_mut(view_key);
        if !modifiers.ctrl && !modifiers.alt {
            for tool in AreaTool::ALL {
                if plain_key(tool.key()) {
                    view.tool = tool;
                    view.take_drag();
                    switched = tool.bottom_tab();
                }
            }
            if input.key_pressed(egui::Key::W) {
                view.walk_overlay = !view.walk_overlay;
            }
            if input.key_pressed(egui::Key::L) {
                view.layers_open = Some(!view.layers_shown());
            }
            if view.tool == AreaTool::Terrain
                && let Some(index) = widgets::digit_pressed(ui)
            {
                view.terrain.terrain = index;
            }
        }
    }
    if let Some(bottom) = switched {
        editor.panels.bottom = bottom;
    }
    let view_tool = editor.views.area.view(view_key).tool;
    if input.key_pressed(egui::Key::X) || input.key_pressed(egui::Key::Y) {
        let horizontal = input.key_pressed(egui::Key::X);
        match view_tool {
            AreaTool::Paint | AreaTool::Fill => {
                editor.update_brush(|brush| {
                    if horizontal {
                        brush.flip_x = !brush.flip_x;
                    } else {
                        brush.flip_y = !brush.flip_y;
                    }
                });
            }
            AreaTool::Stamp => stamp::flip_stamp(editor, view_key, horizontal),
            _ => {
                let indices = selected_indices(editor, &frame.area_key);
                if !indices.is_empty() {
                    change_modules(editor, &frame.area_key, |modules| {
                        for &index in &indices {
                            shapes::flip_field(modules.get_mut(index)?, horizontal);
                        }
                        Some(format!(
                            "Flip {} modules in {}",
                            indices.len(),
                            frame.area_key
                        ))
                    });
                }
            }
        }
    }
    if input.key_pressed(egui::Key::Escape) {
        let view = editor.views.area.view_mut(view_key);
        if view.drag().is_some() {
            view.take_drag();
        } else if view.paste.is_some() {
            view.paste = None;
        } else if view.in_place.pop().is_some() || !editor.selection.parts.is_empty() {
            editor.selection.parts.clear();
        }
        return;
    }
    if input.key_pressed(egui::Key::Enter) {
        let indices = selected_indices(editor, &frame.area_key);
        if indices.len() == 1 && frame.modules[indices[0]].is_module(AreaModuleKind::Blueprint) {
            placement::edit_in_place(editor, view_key, frame, indices[0]);
        }
    }
    if input.key_pressed(egui::Key::Delete) || input.key_pressed(egui::Key::Backspace) {
        delete_selection(editor, frame);
    }
    let (copied, pasted) = ui.input(|i| {
        (
            i.events
                .iter()
                .any(|event| matches!(event, egui::Event::Copy)),
            i.events
                .iter()
                .any(|event| matches!(event, egui::Event::Paste(_))),
        )
    });
    if copied || (modifiers.command && input.key_pressed(egui::Key::C)) {
        copy_selection(editor, frame);
        if let Some(clip) = &editor.clipboard {
            ui.ctx()
                .copy_text(serde_json::to_string_pretty(&clip.modules).unwrap_or_default());
        }
    }
    if pasted || (modifiers.command && input.key_pressed(egui::Key::V)) {
        if modifiers.shift {
            paste_in_place(editor, frame);
        } else {
            start_paste(editor, view_key);
        }
    }
    if modifiers.command && input.key_pressed(egui::Key::D) {
        duplicate_selection(editor, frame);
    }
    if modifiers.command && input.key_pressed(egui::Key::G) {
        scenery::join_scenery(editor, frame);
    }
    let make_blueprint = key_event(&input, egui::Key::B, |m| m.command && m.alt);
    if make_blueprint {
        blueprint::make_blueprint_from_selection(editor, frame);
    }
    let step = if modifiers.shift { 1.0 / 16.0 } else { 1.0 };
    let nudge = [
        (egui::Key::ArrowLeft, (-step, 0.0)),
        (egui::Key::ArrowRight, (step, 0.0)),
        (egui::Key::ArrowUp, (0.0, -step)),
        (egui::Key::ArrowDown, (0.0, step)),
    ];
    for (key, (dx, dy)) in nudge {
        if input.key_pressed(key) {
            if !editor.selection.parts.is_empty() && editor.selection.table == "area" {
                move_selection(editor, frame, dx, dy);
            } else {
                let view = editor.views.area.view_mut(view_key);
                let cursor = view.cursor_cell.unwrap_or_else(|| view.center.cell());
                view.cursor_cell = Some(cursor.step((dx.round() as i32, dy.round() as i32)));
            }
        }
    }
    if input.key_pressed(egui::Key::Space)
        && !modifiers.any()
        && let Some(cursor) = editor.views.area.view(view_key).cursor_cell
    {
        let tile = cursor.center();
        if let Some(hit) = frame.hit(tile) {
            editor.selection = RowSelection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts: vec![super::module_part(hit)],
            };
        }
    }
    if input.key_pressed(egui::Key::F10) && modifiers.shift {
        let view = editor.views.area.view_mut(view_key);
        let at = view
            .cursor_cell
            .map(|c| frame.canvas.to_screen(c.center()))
            .unwrap_or(frame.canvas.screen.center());
        let tile = view.cursor_cell.map(|c| c.center()).unwrap_or(view.center);
        super::modules::open_menu(ui.ctx(), view, view_key, at, tile);
    }
}

fn key_event(
    input: &egui::InputState,
    key: egui::Key,
    wanted: impl Fn(&egui::Modifiers) -> bool,
) -> bool {
    input.events.iter().any(|event| {
        matches!(event, egui::Event::Key { key: pressed, pressed: true, modifiers, .. }
            if *pressed == key && wanted(modifiers))
    })
}
