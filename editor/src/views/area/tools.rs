use egui::{Color32, Pos2, Rect as ERect, Stroke as EStroke, Ui, Vec2};
use engine::core::math::{Offset, Rect};
use engine::core::tiling::{Cell, TilePos, Tiles};
use engine::systems::area::AreaModuleKind;
use strum::VariantArray;

use super::brush::{BrushStrokeKind, eyedrop, fill, grid_stroke, paint_preview, pick_place};
use super::modules::{context_menu_at, open_add_menu, show_add_menu};
use super::select::{
    copy_selection, delete_selection, duplicate_selection, move_selection, paste_anchor,
    paste_in_place, select_input, selected_nodes, snapped_delta, start_paste,
};
use super::{
    AreaDrag, AreaFrame, AreaTool, MAX_ZOOM, MIN_ZOOM, blueprint, grid, nodes, placement, shapes,
    stamp,
};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::ui::{theme, widgets};
use crate::value::RowValue;
use crate::views::navigation::{self, Viewport};

pub fn rail(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    let view = editor.views.area.view_mut(view_key);
    let mut switched = None;
    ui.add_space(6.0);
    for &tool in AreaTool::VARIANTS {
        let selected = view.tool == tool;
        let (rect, response) = ui.allocate_exact_size(Vec2::new(32.0, 34.0), egui::Sense::click());
        let painter = ui.painter();
        if selected {
            painter.rect(
                rect,
                4.0,
                theme::SELECTION,
                egui::Stroke::new(1.0, theme::TEXT),
                egui::StrokeKind::Inside,
            );
        } else if response.hovered() {
            painter.rect_filled(rect, 4.0, theme::ACCENT_SOFT);
        }
        tool_icon(
            painter,
            tool,
            rect.center() - Vec2::new(0.0, 3.0),
            theme::TEXT,
        );
        painter.text(
            rect.right_bottom() - Vec2::new(4.0, 2.0),
            egui::Align2::RIGHT_BOTTOM,
            tool.key().name(),
            egui::FontId::monospace(9.0),
            theme::MUTED,
        );
        if response
            .on_hover_text(format!("{} ({})", tool.as_ref(), tool.key().name()))
            .clicked()
        {
            view.set_tool(tool);
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
        pick_place(
            editor,
            painter,
            frame,
            &pick,
            EditorKey::Unsnapped.held_among(modifiers),
        );
        return;
    }
    let tool = editor.views.area.view(view_key).tool;
    let walk_overlay = editor.views.area.view(view_key).walk_overlay;
    if response.secondary_clicked() {
        context_menu_at(editor, view_key, frame);
    }
    match tool {
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
                eyedrop(
                    editor,
                    view_key,
                    frame,
                    cell,
                    EditorKey::Topmost.held_among(modifiers),
                );
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
                let alt = painter.ctx().input(|i| EditorKey::Unsnapped.held(i));
                let (dx, dy) = snapped_delta(*from, tile, alt);
                for node in selected_nodes(editor, frame) {
                    if let Some(bounds) = frame.module_bounds(&node) {
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
        editor.status.left.push(format!(
            "click or {} places · {} cancels",
            EditorKey::Confirm.name(),
            EditorKey::Cancel.name()
        ));
        editor.status.left.push(format!(
            "{} pastes at the same tiles",
            EditorKey::PasteInPlace.name()
        ));
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
    let pressed = |key: EditorKey| key.pressed(&input);
    if editor.pick.is_some() {
        if pressed(EditorKey::Cancel) {
            editor.pick = None;
            editor.toast("Pick cancelled");
        }
        return;
    }
    if pressed(EditorKey::BrushSmaller) {
        editor.update_brush(|brush| brush.size = brush.size.saturating_sub(1).max(1));
    }
    if pressed(EditorKey::BrushBigger) {
        editor.update_brush(|brush| brush.size = (brush.size + 1).min(9));
    }
    let mut switched = None;
    {
        let view = editor.views.area.view_mut(view_key);
        for &tool in AreaTool::VARIANTS {
            if pressed(tool.key()) {
                view.set_tool(tool);
                switched = tool.bottom_tab();
            }
        }
        if pressed(EditorKey::WalkOverlay) {
            view.walk_overlay = !view.walk_overlay;
        }
        if pressed(EditorKey::Layers) {
            view.layers_open = Some(!view.layers_shown());
        }
        if view.tool == AreaTool::Terrain
            && let Some(index) = EditorKey::Pick.digit(&input)
        {
            view.terrain.terrain = index;
        }
    }
    if let Some(bottom) = switched {
        editor.panels.bottom = bottom;
    }
    let view_tool = editor.views.area.view(view_key).tool;
    let flip_across = pressed(EditorKey::FlipHorizontal);
    if flip_across || pressed(EditorKey::FlipVertical) {
        let horizontal = flip_across;
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
                let flipped = selected_nodes(editor, frame);
                if !flipped.is_empty() {
                    nodes::change_scene(editor, &frame.area_key, |scene| {
                        for node in &flipped {
                            shapes::flip_field(scene.pointer_mut(node)?, horizontal);
                        }
                        Some(format!("Flip {} modules", flipped.len()))
                    });
                }
            }
        }
    }
    if pressed(EditorKey::Cancel) {
        let view = editor.views.area.view_mut(view_key);
        if !view.cancel_gesture() && view.paste.take().is_none() {
            view.in_place.pop();
            editor.selection.parts.clear();
        }
        return;
    }
    if pressed(EditorKey::Confirm)
        && let [node] = selected_nodes(editor, frame).as_slice()
        && frame
            .module(node)
            .is_some_and(|module| module.is_module(AreaModuleKind::Blueprint))
    {
        placement::edit_in_place(editor, view_key, frame, node);
    }
    if pressed(EditorKey::Delete) {
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
    if copied || pressed(EditorKey::Copy) {
        copy_selection(editor, frame);
        if let Some(clip) = &editor.clipboard {
            ui.ctx()
                .copy_text(serde_json::to_string_pretty(&clip.modules).unwrap_or_default());
        }
    }
    if pressed(EditorKey::PasteInPlace) {
        paste_in_place(editor, frame);
    } else if pasted || pressed(EditorKey::Paste) {
        start_paste(editor, view_key);
    }
    if pressed(EditorKey::Duplicate) {
        duplicate_selection(editor, frame);
    }
    if pressed(EditorKey::MakeBlueprint) {
        blueprint::make_blueprint_from_selection(editor, frame);
    }
    if let Some([x, y]) = EditorKey::Move.arrow(&input) {
        let step = if EditorKey::FineStep.held(&input) {
            1.0 / 16.0
        } else {
            1.0
        };
        if !editor.selection.parts.is_empty() {
            move_selection(editor, frame, x as f32 * step, y as f32 * step);
        } else {
            let view = editor.views.area.view_mut(view_key);
            let cursor = view.cursor_cell.unwrap_or_else(|| view.center.cell());
            view.cursor_cell = Some(cursor.step((x, y)));
        }
    }
    if pressed(EditorKey::SelectAtCursor)
        && let Some(cursor) = editor.views.area.view(view_key).cursor_cell
    {
        let tile = cursor.center();
        if let Some(hit) = frame.hit(tile) {
            nodes::select(editor, &frame.area_key, vec![hit]);
        }
    }
    if pressed(EditorKey::ContextMenu) {
        let view = editor.views.area.view_mut(view_key);
        let at = view
            .cursor_cell
            .map(|c| frame.canvas.to_screen(c.center()))
            .unwrap_or(frame.canvas.screen.center());
        let tile = view.cursor_cell.map(|c| c.center()).unwrap_or(view.center);
        super::modules::open_menu(ui.ctx(), view, view_key, at, tile);
    }
}
