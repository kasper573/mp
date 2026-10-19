use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use engine::core::content::ContentRow;
use engine::core::time::Seconds;
use engine::systems::GameSettings;
use engine::systems::actor::ModelDef;
use engine::systems::actor::render::ACTOR_ANCHOR;
use serde_json::Value;

use super::{ModelStrip, strip_of};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::stage::{self, Posed, PosedActor, Scene};
use crate::ui::{theme, widgets};
use crate::views::area::TILE_PX;

const ZOOM: f32 = 4.0;
const INSET: Vec2 = Vec2::new(400.0, 300.0);
const MIN: f32 = 0.1;
const MAX: f32 = 8.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HitboxHandle {
    N,
    S,
    E,
    W,
    Ne,
    Nw,
    Se,
    Sw,
}

impl HitboxHandle {
    const ALL: [HitboxHandle; 8] = [
        HitboxHandle::N,
        HitboxHandle::S,
        HitboxHandle::E,
        HitboxHandle::W,
        HitboxHandle::Ne,
        HitboxHandle::Nw,
        HitboxHandle::Se,
        HitboxHandle::Sw,
    ];

    fn horizontal(self) -> bool {
        !matches!(self, HitboxHandle::N | HitboxHandle::S)
    }

    fn vertical(self) -> bool {
        !matches!(self, HitboxHandle::E | HitboxHandle::W)
    }

    fn at(self, rect: ERect) -> egui::Pos2 {
        match self {
            HitboxHandle::N => rect.center_top(),
            HitboxHandle::S => rect.center_bottom(),
            HitboxHandle::E => rect.right_center(),
            HitboxHandle::W => rect.left_center(),
            HitboxHandle::Ne => rect.right_top(),
            HitboxHandle::Nw => rect.left_top(),
            HitboxHandle::Se => rect.right_bottom(),
            HitboxHandle::Sw => rect.left_bottom(),
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
    let model = RowSelection::row(ModelDef::TABLE, key);
    if editor.selection != model {
        editor.select(model);
    }
    let width = row["hitbox"]["width"].as_f64().unwrap_or(1.0) as f32;
    let height = row["hitbox"]["height"].as_f64().unwrap_or(1.0) as f32;
    let frame = strip_of(row, ModelStrip::default())
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
            draw_grid(&painter, rect, feet, tile);
            let shown = Vec2::new(
                sheet.frame_width as f32 * ZOOM * scale_of(row),
                sheet.frame_height as f32 * ZOOM * scale_of(row),
            );
            let sprite = sprite_rect(feet, shown);
            widgets::dashed_rect(
                &painter,
                sprite,
                egui::Stroke::new(1.0, theme::MUTED),
                4.0,
                4.0,
            );
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
            for handle in HitboxHandle::ALL {
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
            if hovered_handle.is_some() || editor.views.model.view(key).hitbox_drag.is_some() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::Grab);
            }
            let shift = ui.input(|i| EditorKey::FineStep.held(i));
            if response.drag_started()
                && let Some(handle) = hovered_handle
            {
                let view = editor.views.model.view_mut(key);
                view.hitbox_drag = Some(handle);
            }
            if response.dragged()
                && let Some(handle) = editor.views.model.view(key).hitbox_drag
                && let Some(pos) = response.interact_pointer_pos()
            {
                let mut new_width = width;
                let mut new_height = height;
                if handle.horizontal() {
                    new_width = ((pos.x - feet.x).abs() * 2.0 / tile).clamp(MIN, MAX);
                }
                if handle.vertical() {
                    new_height = match handle {
                        HitboxHandle::S | HitboxHandle::Se | HitboxHandle::Sw => height,
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
                        ContentEdit::new(format!("Resize hitbox of {key}")).merging(),
                    );
                }
            }
            if response.drag_stopped() {
                let view = editor.views.model.view_mut(key);
                view.hitbox_drag = None;
            }
            painter.text(
                egui::pos2(rect.center().x, rect.max.y - 16.0),
                egui::Align2::CENTER_CENTER,
                format!(
                    "frame {} × {} px · hitbox {} × {} tiles",
                    sheet.frame_width, sheet.frame_height, width, height
                ),
                egui::FontId::monospace(12.0),
                theme::MUTED,
            );
        });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.set_width(INSET.x);
            inset(editor, ui, key, row);
        });
    });
    editor.status.left.push(format!("model/{key}"));
    editor.status.left.push(format!(
        "drag the hitbox handles · {} snaps to quarter tiles",
        EditorKey::FineStep.name()
    ));
}

fn inset(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let Some(content) = editor.loaded() else {
        return;
    };
    let Some(model) = content.by_key::<ModelDef>(key) else {
        return;
    };
    let center = stage::center(&content);
    let name = content
        .built::<GameSettings>()
        .initial_spawn
        .area
        .get(&content)
        .name
        .clone();
    ui.label(
        theme::mono(format!("In {name}"))
            .color(theme::CODE)
            .size(13.0),
    );
    let posed = Posed {
        actors: vec![PosedActor {
            held: Some(Seconds(0.0)),
            ..PosedActor::standing(model, center)
        }],
        ..Posed::default()
    };
    let Some(shown) = stage::show(
        editor,
        ui,
        &format!("model/{key}/inset"),
        Scene::Posed(posed),
        true,
    ) else {
        return;
    };
    if airborne(row) {
        let rect = shown.rect;
        let from = rect.left_bottom() + Vec2::new(20.0, -20.0);
        let to = rect.right_top() + Vec2::new(-20.0, 20.0);
        let mut points = Vec::new();
        for i in 0..=40 {
            let t = i as f32 / 40.0;
            let x = from.x + (to.x - from.x) * t;
            let y = from.y + (to.y - from.y) * (t * t * (3.0 - 2.0 * t));
            points.push(egui::pos2(x, y));
        }
        ui.painter().extend(egui::Shape::dashed_line(
            &points,
            egui::Stroke::new(2.0, Color32::WHITE),
            8.0,
            6.0,
        ));
    }
    ui.add_space(4.0);
}

fn sprite_rect(feet: egui::Pos2, shown: Vec2) -> ERect {
    let anchor = ACTOR_ANCHOR.0;
    ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, (0.5 - anchor.y) * shown.y),
        feet + Vec2::new(shown.x / 2.0, (0.5 + anchor.y) * shown.y),
    )
}

// Feet stand at a tile's center, so the cell edges lie half a tile to either side of them.
fn draw_grid(painter: &egui::Painter, rect: ERect, feet: egui::Pos2, tile: f32) {
    let stroke = egui::Stroke::new(1.0, theme::BORDER);
    let edge = feet - Vec2::splat(tile / 2.0);
    let mut x = edge.x - ((edge.x - rect.min.x) / tile).ceil() * tile;
    while x <= rect.max.x {
        painter.line_segment(
            [egui::pos2(x, rect.min.y), egui::pos2(x, rect.max.y)],
            stroke,
        );
        x += tile;
    }
    let mut y = edge.y - ((edge.y - rect.min.y) / tile).ceil() * tile;
    while y <= rect.max.y {
        painter.line_segment(
            [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
            stroke,
        );
        y += tile;
    }
}

fn round(value: f32) -> Value {
    serde_json::json!((value * 100.0).round() / 100.0)
}
