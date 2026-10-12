use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use game::core::math::Pos;
use serde_json::Value;

use super::{ACTIONS, DIRECTIONS, strip_of};
use crate::app::Editor;
use crate::project::Selection;
use crate::ui::{theme, widgets};
use crate::views::area::TILE_PX;
use crate::views::area::scene::{SceneRequest, SceneSpec, SceneryOf};

const ZOOM: f32 = 4.0;
const INSET: Vec2 = Vec2::new(400.0, 300.0);
const MIN: f32 = 0.1;
const MAX: f32 = 8.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Handle {
    N,
    S,
    E,
    W,
    Ne,
    Nw,
    Se,
    Sw,
}

impl Handle {
    const ALL: [Handle; 8] = [
        Handle::N,
        Handle::S,
        Handle::E,
        Handle::W,
        Handle::Ne,
        Handle::Nw,
        Handle::Se,
        Handle::Sw,
    ];

    fn horizontal(self) -> bool {
        !matches!(self, Handle::N | Handle::S)
    }

    fn vertical(self) -> bool {
        !matches!(self, Handle::E | Handle::W)
    }

    fn at(self, rect: ERect) -> egui::Pos2 {
        match self {
            Handle::N => rect.center_top(),
            Handle::S => rect.center_bottom(),
            Handle::E => rect.right_center(),
            Handle::W => rect.left_center(),
            Handle::Ne => rect.right_top(),
            Handle::Nw => rect.left_top(),
            Handle::Se => rect.right_bottom(),
            Handle::Sw => rect.left_bottom(),
        }
    }
}

pub fn scale_of(row: &Value) -> f32 {
    row["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|module| module["type"] == "scale")
        .and_then(|module| module["factor"].as_f64())
        .map_or(1.0, |factor| factor as f32)
}

pub fn airborne(row: &Value) -> bool {
    row["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|module| module["type"] == "airborne")
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    if editor.selection.table != super::TABLE
        || editor.selection.keys != [key.to_owned()]
        || editor.selection.parts != ["/hitbox".to_owned()]
    {
        editor.select(Selection {
            table: super::TABLE.to_owned(),
            keys: vec![key.to_owned()],
            parts: vec!["/hitbox".to_owned()],
        });
    }
    let width = row["hitbox"]["width"].as_f64().unwrap_or(1.0) as f32;
    let height = row["hitbox"]["height"].as_f64().unwrap_or(1.0) as f32;
    let frame = strip_of(row, ACTIONS[0], DIRECTIONS[0])
        .first()
        .map(|frame| frame.frame);
    let tile = TILE_PX * ZOOM;
    ui.horizontal_top(|ui| {
        let canvas_w = (ui.available_width() - INSET.x - 24.0).max(200.0);
        let canvas_h = (ui.available_height() - 30.0).max(200.0);
        ui.vertical(|ui| {
            let (rect, response) =
                ui.allocate_exact_size(Vec2::new(canvas_w, canvas_h), Sense::click_and_drag());
            let painter = ui.painter_at(rect);
            painter.rect_filled(rect, 0.0, theme::CANVAS);
            let feet = egui::pos2(
                rect.center().x.round(),
                (rect.center().y + canvas_h * 0.15).round(),
            );
            let mut x = feet.x - ((feet.x - rect.min.x) / tile).ceil() * tile;
            while x <= rect.max.x {
                painter.line_segment(
                    [egui::pos2(x, rect.min.y), egui::pos2(x, rect.max.y)],
                    egui::Stroke::new(1.0, theme::BORDER),
                );
                x += tile;
            }
            let mut y = feet.y - ((feet.y - rect.min.y) / tile).ceil() * tile;
            while y <= rect.max.y {
                painter.line_segment(
                    [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
                    egui::Stroke::new(1.0, theme::BORDER),
                );
                y += tile;
            }
            let shown = Vec2::new(
                sheet.frame_width as f32 * ZOOM * scale_of(row),
                sheet.frame_height as f32 * ZOOM * scale_of(row),
            );
            let sprite = ERect::from_min_max(
                feet - Vec2::new(shown.x / 2.0, shown.y - tile / 2.0),
                feet + Vec2::new(shown.x / 2.0, tile / 2.0),
            );
            painter.extend(egui::Shape::dashed_line(
                &[
                    sprite.left_top(),
                    sprite.right_top(),
                    sprite.right_bottom(),
                    sprite.left_bottom(),
                    sprite.left_top(),
                ],
                egui::Stroke::new(1.0, theme::MUTED),
                4.0,
                4.0,
            ));
            painter.add(egui::Shape::ellipse_filled(
                feet,
                Vec2::new(shown.x * 0.3, shown.x * 0.1),
                Color32::from_rgba_unmultiplied(0, 0, 0, 90),
            ));
            if let Some(frame) = frame
                && let Some(thumb) = &sheet.thumb
            {
                painter.image(thumb.texture.id(), sprite, sheet.uv(frame), Color32::WHITE);
            }
            let hitbox = ERect::from_min_max(
                egui::pos2(
                    feet.x - width * tile / 2.0,
                    feet.y + tile / 2.0 - height * tile,
                ),
                egui::pos2(feet.x + width * tile / 2.0, feet.y + tile / 2.0),
            );
            painter.rect(
                hitbox,
                0.0,
                Color32::from_rgba_unmultiplied(120, 150, 220, 50),
                egui::Stroke::new(1.5, theme::ACCENT),
                egui::StrokeKind::Inside,
            );
            let hover = response.hover_pos();
            let mut hovered_handle = None;
            for handle in Handle::ALL {
                let at = handle.at(hitbox);
                let near = hover.is_some_and(|pos| (pos - at).length() <= 8.0);
                if near {
                    hovered_handle = Some(handle);
                }
                painter.rect(
                    ERect::from_center_size(at, Vec2::splat(8.0)),
                    1.0,
                    if near { theme::ACCENT } else { Color32::WHITE },
                    egui::Stroke::new(1.0, theme::ACCENT),
                    egui::StrokeKind::Inside,
                );
            }
            if hovered_handle.is_some() || editor.views.model.views[key].hitbox_drag.is_some() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::Grab);
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
            if pressed
                && response.hovered()
                && let Some(handle) = hovered_handle
            {
                let view = editor
                    .views
                    .model
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.hitbox_drag = Some(handle);
            }
            if down
                && let Some(handle) = editor.views.model.views[key].hitbox_drag
                && let Some(pos) = pointer
            {
                let mut new_width = width;
                let mut new_height = height;
                if handle.horizontal() {
                    new_width = ((pos.x - feet.x).abs() * 2.0 / tile).clamp(MIN, MAX);
                }
                if handle.vertical() {
                    new_height = match handle {
                        Handle::S | Handle::Se | Handle::Sw => height,
                        _ => ((feet.y + tile / 2.0 - pos.y) / tile).clamp(MIN, MAX),
                    };
                }
                let step = if shift { 0.25 } else { 0.05 };
                new_width = (new_width / step).round() * step;
                new_height = (new_height / step).round() * step;
                if (new_width - width).abs() > 1e-3 || (new_height - height).abs() > 1e-3 {
                    let mut changed = row.clone();
                    changed["hitbox"]["width"] = round(new_width);
                    changed["hitbox"]["height"] = round(new_height);
                    super::write_row(
                        editor,
                        key,
                        &changed,
                        format!("Resize hitbox of {key}"),
                        true,
                    );
                }
            }
            if released {
                let view = editor
                    .views
                    .model
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.hitbox_drag = None;
            }
            painter.text(
                egui::pos2(rect.center().x, rect.max.y - 16.0),
                egui::Align2::CENTER_CENTER,
                format!(
                    "frame {} × {} px · hitbox {} × {} tiles",
                    sheet.frame_width,
                    sheet.frame_height,
                    crate::forms::trim_number(width as f64),
                    crate::forms::trim_number(height as f64)
                ),
                egui::FontId::monospace(12.0),
                theme::MUTED,
            );
        });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.set_width(INSET.x);
            inset(editor, ui, key, &sheet, row, frame);
        });
    });
    editor.status.left.push(format!("model/{key}"));
    editor
        .status
        .left
        .push("drag the hitbox handles · Shift snaps to quarter tiles".to_owned());
}

/// What the model's modules change in play: its flight over an area it lives in.
fn inset(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sheet: &super::SheetInfo,
    row: &Value,
    frame: Option<u32>,
) {
    let Some((area, at, title)) = home(editor, key) else {
        widgets::hint(ui, "No npc stands in an area with this model yet.");
        return;
    };
    ui.label(
        theme::mono(format!("In {title}"))
            .color(theme::CODE)
            .size(13.0),
    );
    let ppp = ui.ctx().pixels_per_point();
    let zoom = 2.0;
    let (rect, _) = ui.allocate_exact_size(INSET, Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, Color32::from_rgb(78, 128, 52));
    let scene_key = format!("model-inset:{key}");
    let generation = editor
        .project
        .as_ref()
        .map_or(0, |project| project.generation);
    editor.views.area.requests.push(SceneRequest {
        key: scene_key.clone(),
        spec: SceneSpec {
            ground: area.clone(),
            scenery: SceneryOf::Area,
            hidden_ground: Vec::new(),
            show_blueprints: true,
            show_scenery: true,
        },
        width: (INSET.x * ppp) as u32,
        height: (INSET.y * ppp) as u32,
        center: Pos::new(at.x + 0.5, at.y + 0.5),
        zoom: zoom * ppp,
        generation,
    });
    if let Some(scene) = editor.views.area.scenes.by_key.get(&scene_key) {
        let uv = ERect::from_min_max(
            egui::Pos2::ZERO,
            egui::pos2(
                scene.shown[0] as f32 / scene.alloc[0].max(1) as f32,
                scene.shown[1] as f32 / scene.alloc[1].max(1) as f32,
            ),
        );
        painter.image(scene.texture, rect, uv, Color32::WHITE);
    }
    let flies = airborne(row);
    if flies {
        let from = rect.left_bottom() + Vec2::new(20.0, -20.0);
        let to = rect.right_top() + Vec2::new(-20.0, 20.0);
        let mut points = Vec::new();
        for i in 0..=40 {
            let t = i as f32 / 40.0;
            let x = from.x + (to.x - from.x) * t;
            let y = from.y + (to.y - from.y) * (t * t * (3.0 - 2.0 * t));
            points.push(egui::pos2(x, y));
        }
        painter.extend(egui::Shape::dashed_line(
            &points,
            egui::Stroke::new(2.0, Color32::WHITE),
            8.0,
            6.0,
        ));
    }
    let tile = TILE_PX * zoom;
    let shown = Vec2::new(
        sheet.frame_width as f32 * zoom * scale_of(row),
        sheet.frame_height as f32 * zoom * scale_of(row),
    );
    let feet = rect.center() + Vec2::new(0.0, tile / 2.0);
    painter.add(egui::Shape::ellipse_filled(
        feet,
        Vec2::new(shown.x * 0.3, shown.x * 0.1),
        Color32::from_rgba_unmultiplied(0, 0, 0, 80),
    ));
    if let Some(frame) = frame
        && let Some(thumb) = &sheet.thumb
    {
        let sprite = ERect::from_min_max(
            feet - Vec2::new(shown.x / 2.0, shown.y - tile / 2.0),
            feet + Vec2::new(shown.x / 2.0, tile / 2.0),
        );
        painter.image(thumb.texture.id(), sprite, sheet.uv(frame), Color32::WHITE);
    }
    painter.rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    ui.add_space(4.0);
    widgets::hint(
        ui,
        if flies {
            "Flies over fences and crops: walks ignore blocked cells. A wild one still turns back at safe zones."
        } else {
            "Walks the grid: blocked cells stop it, and a wild one turns back at safe zones."
        },
    );
}

/// An area where an npc with this model stands, and its name.
fn home(editor: &Editor, key: &str) -> Option<(String, Pos<game::core::tiling::Tiles>, String)> {
    let project = editor.project.as_ref()?;
    let npcs: Vec<String> = super::users(editor, key)
        .into_iter()
        .filter(|(table, _)| table == "npc")
        .map(|(_, key)| key)
        .collect();
    let files: Vec<String> = project
        .files
        .paths_under("tables/area/")
        .filter(|path| path.ends_with(".json"))
        .cloned()
        .collect();
    for file in files {
        let Some((_, area)) = crate::project::row_of(&file) else {
            continue;
        };
        let Some(row) = project.files.json(&file) else {
            continue;
        };
        for module in row["modules"].as_array().into_iter().flatten() {
            let npc = module["npc"].as_str().unwrap_or_default();
            if !matches!(module["type"].as_str(), Some("resident" | "population"))
                || !npcs.iter().any(|n| n == npc)
            {
                continue;
            }
            let at = &module["at"];
            let (x, y) = if at.is_array() {
                (at[0].as_f64(), at[1].as_f64())
            } else {
                (at["x"].as_f64(), at["y"].as_f64())
            };
            let place = match (x, y) {
                (Some(x), Some(y)) => Pos::new(x as f32, y as f32),
                _ => {
                    let w = row["map"]["width"].as_f64().unwrap_or(20.0) as f32;
                    let h = row["map"]["height"].as_f64().unwrap_or(20.0) as f32;
                    Pos::new(w / 2.0, h / 2.0)
                }
            };
            let title = row["name"].as_str().unwrap_or(area).to_owned();
            return Some((area.to_owned(), place, title));
        }
    }
    let content = project.content?;
    let settings = content.built::<game::systems::GameSettings>();
    let area = settings.spawn.area.key(&content).to_owned();
    let title = project
        .files
        .json(&crate::project::row_file("area", &area))
        .and_then(|row| row["name"].as_str().map(str::to_owned))
        .unwrap_or_else(|| area.clone());
    Some((area, settings.spawn.at, title))
}

fn round(value: f32) -> Value {
    serde_json::json!((value * 100.0).round() / 100.0)
}
