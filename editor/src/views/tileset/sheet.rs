use egui::{Color32, Pos2, Rect as ERect, RichText, Sense, Stroke, Ui, Vec2};
use serde_json::Value;

use super::{Grid, Mode, TileRect, TilesetDialog, WalkBrush, set_tile_field, tile_data};
use crate::app::Editor;
use crate::project::{Edit, row_file};
use crate::ui::{theme, widgets};

pub const WALKABLE: Color32 = Color32::from_rgb(110, 200, 110);
pub const BLOCKS: Color32 = Color32::from_rgb(230, 90, 90);
const MIN_TILE: f32 = 8.0;
const MAX_TILE: f32 = 64.0;

pub struct Canvas {
    pub rect: ERect,
    pub shown: f32,
    pub hover: Option<u32>,
    pub response: egui::Response,
}

impl Canvas {
    pub fn cell(&self, grid: &Grid, tile: u32) -> ERect {
        let (x, y) = grid.xy(tile);
        ERect::from_min_size(
            self.rect.min + Vec2::new(x as f32 * self.shown, y as f32 * self.shown),
            Vec2::splat(self.shown),
        )
    }

    pub fn tile_at(&self, grid: &Grid, pos: Pos2) -> Option<u32> {
        if !self.rect.contains(pos) {
            return None;
        }
        let x = ((pos.x - self.rect.min.x) / self.shown).floor() as u32;
        let y = ((pos.y - self.rect.min.y) / self.shown).floor() as u32;
        (x < grid.columns && y < grid.rows).then(|| y * grid.columns + x)
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let mode = editor.views.tileset.views[key].mode;
    let surfaces = surface_keys(editor);
    let canvas = canvas(editor, ui, key, grid, |painter, tile, cell| match mode {
        Mode::Walk => walk_mark(painter, cell, tile_data(row, tile)["walk"].as_str()),
        Mode::Surface => {
            if let Some(surface) = tile_data(row, tile)["surface"].as_str() {
                surface_mark(painter, cell, surface_index(&surfaces, surface));
            }
        }
        _ => {}
    });
    paint(editor, ui, key, row, grid, &canvas);
    select(editor, ui, key, grid, &canvas);
    draw_selection(editor, ui, key, grid, &canvas);
}

pub fn canvas(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    grid: &Grid,
    mut mark: impl FnMut(&egui::Painter, u32, ERect),
) -> Canvas {
    let zoom = editor.views.tileset.views[key].zoom;
    let fit = ((ui.available_width() - 16.0) / grid.columns as f32)
        .clamp(MIN_TILE, 34.0)
        .floor();
    let shown = (fit * zoom).clamp(MIN_TILE, MAX_TILE).floor();
    let size = Vec2::new(grid.columns as f32 * shown, grid.rows as f32 * shown);
    let mut out = None;
    egui::ScrollArea::both()
        .id_salt(("tileset-sheet", key))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let (rect, response) = ui.allocate_exact_size(size, Sense::click_and_drag());
            let painter = ui.painter_at(rect.expand(2.0));
            painter.rect_filled(rect, 0.0, theme::CANVAS);
            if let Some(thumb) = &grid.thumb {
                painter.image(
                    thumb.texture.id(),
                    rect,
                    ERect::from_min_max(
                        Pos2::ZERO,
                        Pos2::new(
                            (grid.columns * grid.tile_px) as f32 / thumb.size[0] as f32,
                            (grid.rows * grid.tile_px) as f32 / thumb.size[1] as f32,
                        ),
                    ),
                    Color32::WHITE,
                );
            }
            for tile in 0..grid.count() {
                let (x, y) = grid.xy(tile);
                let cell = ERect::from_min_size(
                    rect.min + Vec2::new(x as f32 * shown, y as f32 * shown),
                    Vec2::splat(shown),
                );
                if cell.intersects(ui.clip_rect()) {
                    mark(&painter, tile, cell);
                }
            }
            let line = Stroke::new(1.0, Color32::from_rgba_unmultiplied(0, 0, 0, 90));
            for x in 0..=grid.columns {
                let sx = rect.min.x + x as f32 * shown;
                painter.line_segment([Pos2::new(sx, rect.min.y), Pos2::new(sx, rect.max.y)], line);
            }
            for y in 0..=grid.rows {
                let sy = rect.min.y + y as f32 * shown;
                painter.line_segment([Pos2::new(rect.min.x, sy), Pos2::new(rect.max.x, sy)], line);
            }
            let hover = response.hover_pos().and_then(|pos| {
                let x = ((pos.x - rect.min.x) / shown).floor();
                let y = ((pos.y - rect.min.y) / shown).floor();
                (x >= 0.0 && y >= 0.0 && (x as u32) < grid.columns && (y as u32) < grid.rows)
                    .then(|| y as u32 * grid.columns + x as u32)
            });
            if let Some(tile) = hover {
                let (x, y) = grid.xy(tile);
                let cell = ERect::from_min_size(
                    rect.min + Vec2::new(x as f32 * shown, y as f32 * shown),
                    Vec2::splat(shown),
                );
                painter.rect_stroke(
                    cell,
                    0.0,
                    Stroke::new(1.5, Color32::WHITE),
                    egui::StrokeKind::Inside,
                );
            }
            let scroll = ui.input(|i| (i.modifiers.command, i.smooth_scroll_delta.y));
            if scroll.0 && scroll.1 != 0.0 && response.hovered() {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.zoom = (view.zoom * if scroll.1 > 0.0 { 1.25 } else { 0.8 }).clamp(0.25, 8.0);
            }
            out = Some(Canvas {
                rect,
                shown,
                hover,
                response,
            });
        });
    out.expect("the sheet was drawn")
}

fn paint(editor: &mut Editor, ui: &Ui, key: &str, row: &Value, grid: &Grid, canvas: &Canvas) {
    let mode = editor.views.tileset.views[key].mode;
    if !matches!(mode, Mode::Walk | Mode::Surface) {
        return;
    }
    let (pressed, down, released, pointer, shift) = ui.input(|i| {
        (
            i.pointer.primary_pressed(),
            i.pointer.primary_down(),
            i.pointer.primary_released(),
            i.pointer.latest_pos(),
            i.modifiers.shift,
        )
    });
    if shift {
        return;
    }
    if pressed && canvas.response.hovered() {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.painting = true;
        view.stroke.clear();
    }
    let painting = editor.views.tileset.views[key].painting;
    if painting
        && (down || pressed)
        && let Some(pos) = pointer
        && let Some(tile) = canvas.tile_at(grid, pos)
        && !editor.views.tileset.views[key].stroke.contains(&tile)
    {
        let (field, value, label) = match mode {
            Mode::Walk => {
                let brush = editor.views.tileset.views[key].walk;
                let value = match brush {
                    WalkBrush::Walkable => Value::String("walkable".to_owned()),
                    WalkBrush::Blocks => Value::String("blocks".to_owned()),
                    WalkBrush::Nothing => Value::Null,
                };
                let name = match brush {
                    WalkBrush::Walkable => "walkable",
                    WalkBrush::Blocks => "blocks",
                    WalkBrush::Nothing => "nothing",
                };
                ("walk", value, format!("Paint walk: {name} on {key}"))
            }
            _ => {
                let brush = editor.views.tileset.views[key].surface.clone();
                let value = match &brush {
                    Some(surface) => Value::String(surface.clone()),
                    None => Value::Null,
                };
                (
                    "surface",
                    value,
                    format!(
                        "Paint surface: {} on {key}",
                        brush.unwrap_or_else(|| "none".to_owned())
                    ),
                )
            }
        };
        let current = tile_data(row, tile)[field].clone();
        let mut changed = editor.row_value(super::TABLE, key).unwrap_or(row.clone());
        if current != value {
            set_tile_field(&mut changed, tile, field, value);
            super::write_row(editor, key, &changed, label, true);
        }
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.stroke.push(tile);
        super::select_tile(editor, key, tile);
    }
    if released {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.painting = false;
    }
}

pub fn select(editor: &mut Editor, ui: &Ui, key: &str, grid: &Grid, canvas: &Canvas) {
    let mode = editor.views.tileset.views[key].mode;
    let (pressed, down, released, pointer, shift) = ui.input(|i| {
        (
            i.pointer.primary_pressed(),
            i.pointer.primary_down(),
            i.pointer.primary_released(),
            i.pointer.latest_pos(),
            i.modifiers.shift,
        )
    });
    let selects = shift || mode == Mode::Animation;
    if pressed
        && canvas.response.hovered()
        && selects
        && let Some(tile) = canvas.hover
    {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.anchor = Some(grid.xy(tile));
        view.selecting = true;
        view.selection = Some(TileRect {
            x: grid.xy(tile).0,
            y: grid.xy(tile).1,
            w: 1,
            h: 1,
        });
        view.tile = Some(tile);
    }
    let selecting = editor.views.tileset.views[key].selecting;
    if selecting
        && down
        && let Some(pos) = pointer
        && let Some(anchor) = editor.views.tileset.views[key].anchor
    {
        let clamped = Pos2::new(
            pos.x.clamp(canvas.rect.min.x, canvas.rect.max.x - 1.0),
            pos.y.clamp(canvas.rect.min.y, canvas.rect.max.y - 1.0),
        );
        if let Some(tile) = canvas.tile_at(grid, clamped) {
            let (x, y) = grid.xy(tile);
            let (x0, x1) = (anchor.0.min(x), anchor.0.max(x));
            let (y0, y1) = (anchor.1.min(y), anchor.1.max(y));
            let view = editor
                .views
                .tileset
                .views
                .get_mut(key)
                .expect("the view exists");
            view.selection = Some(TileRect {
                x: x0,
                y: y0,
                w: x1 - x0 + 1,
                h: y1 - y0 + 1,
            });
        }
    }
    if released && selecting {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.selecting = false;
        view.anchor = None;
        if mode == Mode::Animation {
            super::select_parts(editor, key, vec!["/animation".to_owned()]);
        } else if let Some(tile) = editor.views.tileset.views[key].tile {
            super::select_tile(editor, key, tile);
        }
    }
    if canvas.response.clicked()
        && !selects
        && mode != Mode::Animation
        && let Some(tile) = canvas.hover
    {
        super::select_tile(editor, key, tile);
    }
}

pub fn draw_selection(editor: &Editor, ui: &Ui, key: &str, grid: &Grid, canvas: &Canvas) {
    let Some(selection) = editor.views.tileset.views[key].selection else {
        return;
    };
    let rect = ERect::from_min_size(
        canvas.rect.min
            + Vec2::new(
                selection.x as f32 * canvas.shown,
                selection.y as f32 * canvas.shown,
            ),
        Vec2::new(
            selection.w as f32 * canvas.shown,
            selection.h as f32 * canvas.shown,
        ),
    );
    let painter = ui.painter_at(canvas.rect.expand(2.0));
    painter.rect_filled(
        rect,
        0.0,
        Color32::from_rgba_unmultiplied(120, 170, 250, 30),
    );
    painter.extend(egui::Shape::dashed_line(
        &[
            rect.left_top(),
            rect.right_top(),
            rect.right_bottom(),
            rect.left_bottom(),
            rect.left_top(),
        ],
        Stroke::new(2.0, theme::SELECTION),
        6.0,
        4.0,
    ));
    let _ = grid;
}

pub fn walk_mark(painter: &egui::Painter, cell: ERect, walk: Option<&str>) {
    match walk {
        Some("walkable") => dots(painter, cell, WALKABLE),
        Some("blocks") => crate::views::area::overlays::hatch(painter, cell, BLOCKS, cell.width()),
        _ => {}
    }
}

pub fn dots(painter: &egui::Painter, cell: ERect, colour: Color32) {
    painter.rect_filled(
        cell,
        0.0,
        Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 60),
    );
    let step = (cell.width() / 4.0).max(3.0);
    let mut y = cell.min.y + step / 2.0;
    while y < cell.max.y {
        let mut x = cell.min.x + step / 2.0;
        while x < cell.max.x {
            painter.circle_filled(Pos2::new(x, y), (step / 5.0).max(1.0), colour);
            x += step;
        }
        y += step;
    }
}

fn grid_lines(painter: &egui::Painter, cell: ERect, colour: Color32) {
    painter.rect_filled(
        cell,
        0.0,
        Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 50),
    );
    let step = (cell.width() / 3.0).max(3.0);
    let mut x = cell.min.x + step;
    while x < cell.max.x {
        painter.line_segment(
            [Pos2::new(x, cell.min.y), Pos2::new(x, cell.max.y)],
            Stroke::new(1.0, colour),
        );
        x += step;
    }
    let mut y = cell.min.y + step;
    while y < cell.max.y {
        painter.line_segment(
            [Pos2::new(cell.min.x, y), Pos2::new(cell.max.x, y)],
            Stroke::new(1.0, colour),
        );
        y += step;
    }
}

fn stripes(painter: &egui::Painter, cell: ERect, colour: Color32) {
    painter.rect_filled(
        cell,
        0.0,
        Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 50),
    );
    let step = (cell.height() / 4.0).max(3.0);
    let mut y = cell.min.y + step / 2.0;
    while y < cell.max.y {
        painter.line_segment(
            [Pos2::new(cell.min.x, y), Pos2::new(cell.max.x, y)],
            Stroke::new(1.0, colour),
        );
        y += step;
    }
}

pub const SURFACE_COLOURS: [Color32; 6] = [
    Color32::from_rgb(230, 190, 90),
    Color32::from_rgb(120, 200, 110),
    Color32::from_rgb(170, 180, 200),
    Color32::from_rgb(200, 140, 80),
    Color32::from_rgb(200, 120, 200),
    Color32::from_rgb(90, 180, 220),
];

pub fn surface_mark(painter: &egui::Painter, cell: ERect, index: usize) {
    let colour = SURFACE_COLOURS[index % SURFACE_COLOURS.len()];
    match index % 4 {
        0 => dots(painter, cell, colour),
        1 => crate::views::area::overlays::hatch(painter, cell, colour, cell.width()),
        2 => grid_lines(painter, cell, colour),
        _ => stripes(painter, cell, colour),
    }
}

pub fn surface_keys(editor: &mut Editor) -> Vec<String> {
    crate::views::model::sounds::surfaces(editor)
        .iter()
        .map(|(key, _, _)| key.clone())
        .collect()
}

pub fn surface_index(surfaces: &[String], surface: &str) -> usize {
    surfaces
        .iter()
        .position(|s| s == surface)
        .unwrap_or(surfaces.len())
}

pub fn walk_legend(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    for (brush, label) in [
        (WalkBrush::Walkable, "walkable"),
        (WalkBrush::Blocks, "blocks"),
        (WalkBrush::Nothing, "says nothing"),
    ] {
        let on = view.walk == brush;
        let response = ui
            .horizontal(|ui| {
                let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
                let painter = ui.painter();
                painter.rect_stroke(
                    swatch,
                    2.0,
                    Stroke::new(1.0, theme::BORDER),
                    egui::StrokeKind::Inside,
                );
                match brush {
                    WalkBrush::Walkable => dots(painter, swatch, WALKABLE),
                    WalkBrush::Blocks => {
                        crate::views::area::overlays::hatch(painter, swatch, BLOCKS, 14.0)
                    }
                    WalkBrush::Nothing => {}
                }
                if on {
                    painter.rect_stroke(
                        swatch,
                        2.0,
                        Stroke::new(1.5, Color32::WHITE),
                        egui::StrokeKind::Outside,
                    );
                }
                ui.label(if on {
                    theme::strong(label)
                } else {
                    theme::muted(label)
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            view.walk = brush;
        }
    }
}

pub fn surface_legend(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let surfaces = crate::views::model::sounds::surfaces(editor);
    let keys: Vec<String> = surfaces.iter().map(|(key, _, _)| key.clone()).collect();
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    if view.surface.is_none() && !keys.is_empty() {
        view.surface = keys.first().cloned();
    }
    for (index, (surface, name, _)) in surfaces.iter().enumerate() {
        let on = view.surface.as_deref() == Some(surface);
        let response = ui
            .horizontal(|ui| {
                let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
                let painter = ui.painter();
                surface_mark(painter, swatch, index);
                painter.rect_stroke(
                    swatch,
                    2.0,
                    Stroke::new(1.0, theme::BORDER),
                    egui::StrokeKind::Inside,
                );
                if on {
                    painter.rect_stroke(
                        swatch,
                        2.0,
                        Stroke::new(1.5, Color32::WHITE),
                        egui::StrokeKind::Outside,
                    );
                }
                ui.label(if on {
                    theme::strong(name.to_lowercase())
                } else {
                    theme::muted(name.to_lowercase())
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            view.surface = Some(surface.clone());
        }
    }
    let none = view.surface.is_none();
    let response = ui
        .horizontal(|ui| {
            let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
            ui.painter().rect_stroke(
                swatch,
                2.0,
                Stroke::new(1.0, theme::BORDER),
                egui::StrokeKind::Inside,
            );
            if none {
                ui.painter().rect_stroke(
                    swatch,
                    2.0,
                    Stroke::new(1.5, Color32::WHITE),
                    egui::StrokeKind::Outside,
                );
            }
            ui.label(if none {
                theme::strong("none")
            } else {
                theme::muted("none")
            });
        })
        .response
        .interact(Sense::click());
    if response.clicked() {
        view.surface = None;
    }
}

#[allow(clippy::too_many_arguments)]
pub fn make_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    key: &str,
    grid: &Grid,
    mut name: String,
    error: Option<String>,
    next: &mut Option<TilesetDialog>,
) {
    let Some(selection) = editor.views.tileset.views[key].selection else {
        *next = None;
        return;
    };
    let mut decision = None;
    crate::ui::dialogs::card(ctx, "tileset-blueprint", 420.0, |ui| {
        ui.label(
            RichText::new("Make a blueprint from these tiles")
                .size(16.0)
                .strong(),
        );
        ui.add_space(6.0);
        ui.label(theme::muted(format!(
            "{} tiles of {key} · {}, {} · {} × {} become one scenery part, sorted at its bottom row.",
            selection.count(),
            selection.x,
            selection.y,
            selection.w,
            selection.h
        )));
        ui.add_space(8.0);
        widgets::kv(ui, "key", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut name)
                        .desired_width(240.0)
                        .font(egui::TextStyle::Monospace),
                )
            });
            response.request_focus();
        });
        if let Some(error) = &error {
            ui.label(RichText::new(error).color(theme::DANGER).size(12.5));
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Make blueprint").clicked() {
                decision = Some(true);
            }
            if ui.button("Cancel").clicked() {
                decision = Some(false);
            }
        });
        let (enter, escape) = ui.input(|i| {
            (
                i.key_pressed(egui::Key::Enter),
                i.key_pressed(egui::Key::Escape),
            )
        });
        if enter {
            decision = Some(true);
        }
        if escape {
            decision = Some(false);
        }
    });
    match decision {
        None => {
            *next = Some(TilesetDialog::MakeBlueprint { name, error });
        }
        Some(false) => *next = None,
        Some(true) => {
            let wanted = name.trim().to_owned();
            let problem = editor
                .project
                .as_ref()
                .and_then(|project| crate::rows::key_problem(&project.files, "blueprint", &wanted));
            if let Some(problem) = problem {
                *next = Some(TilesetDialog::MakeBlueprint {
                    name,
                    error: Some(problem),
                });
                return;
            }
            let tiles = selection.tiles(grid.columns);
            let part = serde_json::json!({
                "type": "scenery",
                "at": { "x": 0.0, "y": 0.0 },
                "tileset": key,
                "tiles": tiles,
                "sort": selection.h as f32 - 0.5,
            });
            let blueprint = serde_json::json!({ "parts": [part] });
            let mut edit = Edit::new(format!(
                "Make blueprint {wanted} from {} tiles of {key}",
                selection.count()
            ));
            edit.write_json(row_file("blueprint", &wanted), &blueprint);
            if editor.apply(edit) {
                editor.toast(format!("blueprint/{wanted} is ready to stamp"));
                editor.select(crate::project::Selection::row("blueprint", &wanted));
                *next = None;
            } else {
                *next = Some(TilesetDialog::MakeBlueprint {
                    name,
                    error: Some("the folder refused it".to_owned()),
                });
            }
        }
    }
}
