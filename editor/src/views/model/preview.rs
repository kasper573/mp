use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::GameSettings;
use game::systems::actor::Action;
use game::systems::actor::render::ACTOR_ANCHOR;
use serde_json::Value;

use super::{ModelSheet, StripFrame};
use crate::app::Editor;
use crate::ui::{theme, widgets};
use crate::views::area::scene::{AreaSceneRequest, AreaSceneSpec, SceneryOf};

pub struct StripPreview {
    pub playing: bool,
    pub muted: bool,
    pub speed: f32,
    pub position: f32,
    pub speeds: usize,
}

impl Default for StripPreview {
    fn default() -> StripPreview {
        StripPreview {
            playing: true,
            muted: false,
            speed: 1.0,
            position: 0.0,
            speeds: 0,
        }
    }
}

pub const SPEEDS: [f32; 4] = [1.0, 0.5, 0.25, 2.0];

pub struct PreviewTick {
    pub index: usize,
    pub passed: Vec<usize>,
}

pub fn index_at(frames: &[StripFrame], position: f32, holds: bool) -> usize {
    let total = super::total_ms(frames).max(1) as f32;
    let position = if holds {
        position.min(total - 1.0)
    } else {
        position.rem_euclid(total)
    };
    let mut cursor = 0.0;
    for (index, frame) in frames.iter().enumerate() {
        cursor += frame.ms as f32;
        if position < cursor {
            return index;
        }
    }
    frames.len().saturating_sub(1)
}

pub fn tick(
    preview: &mut StripPreview,
    dt: f32,
    frames: &[StripFrame],
    action: Action,
) -> PreviewTick {
    let total = super::total_ms(frames).max(1) as f32;
    let holds = action == Action::Dead;
    let before = preview.position;
    if preview.playing {
        preview.position += dt * 1000.0 * preview.speed;
    }
    let mut passed = Vec::new();
    if preview.playing && !frames.is_empty() {
        let after = preview.position;
        let starts: Vec<f32> = (0..frames.len())
            .map(|index| super::starts_at(frames, index) as f32)
            .collect();
        if holds {
            for (index, start) in starts.iter().enumerate() {
                if *start > before && *start <= after && before < total {
                    passed.push(index);
                }
            }
            if before < total && after >= total {
                preview.position = total;
            }
        } else {
            let from_lap = (before / total).floor();
            let to_lap = (after / total).floor();
            let mut lap = from_lap;
            while lap <= to_lap {
                for (index, start) in starts.iter().enumerate() {
                    let at = lap * total + *start;
                    if at > before && at <= after {
                        passed.push(index);
                    }
                }
                lap += 1.0;
            }
            if after > total * 1000.0 {
                preview.position = after.rem_euclid(total);
            }
        }
    }
    PreviewTick {
        index: index_at(frames, preview.position, holds),
        passed,
    }
}

pub fn restart(preview: &mut StripPreview) {
    preview.position = 0.0;
    preview.playing = true;
}

pub fn fire(editor: &mut Editor, key: &str, frames: &[StripFrame], passed: &[usize]) {
    let muted = editor
        .views
        .model
        .views
        .get(key)
        .is_some_and(|view| view.preview.muted);
    if muted {
        return;
    }
    let surface = editor
        .views
        .model
        .views
        .get(key)
        .and_then(|view| view.surface.clone());
    let mut stepped = false;
    for index in passed {
        let Some(frame) = frames.get(*index) else {
            continue;
        };
        if let Some(sound) = &frame.sound {
            editor.views.model.sfx_to_play.push(sound.clone());
        }
        if frame.step && !stepped {
            stepped = true;
            if let Some(footstep) = super::sounds::footstep_of(editor, surface.as_deref()) {
                editor.views.model.sfx_to_play.push(footstep);
            }
        }
    }
}

#[derive(Clone, Copy)]
pub struct PreviewFit {
    pub size: Vec2,
    pub zoom: f32,
}

pub fn draw(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sheet: &ModelSheet,
    row: &Value,
    frame: Option<u32>,
    fit: PreviewFit,
) -> ERect {
    let PreviewFit { size, zoom } = fit;
    let (rect, _) = ui.allocate_exact_size(size, Sense::hover());
    let painter = ui.painter_at(rect);
    let feet = backdrop(editor, &painter, rect, format!("model-preview:{key}"), zoom);
    draw_sprite(&painter, sheet, row, frame, feet, zoom);
    painter.rect_stroke(
        rect,
        6.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    rect
}

pub fn controls(
    ui: &mut Ui,
    preview: &mut StripPreview,
    index: usize,
    count: usize,
    with_speed: bool,
) {
    ui.horizontal(|ui| {
        let play = if preview.playing { "⏸" } else { "▶" };
        if widgets::chip(ui, play).on_hover_text("Space").clicked() {
            preview.playing = !preview.playing;
        }
        let sound = if preview.muted { "🔇" } else { "🔊" };
        if widgets::chip(ui, sound)
            .on_hover_text("M mutes the preview")
            .clicked()
        {
            preview.muted = !preview.muted;
        }
        if with_speed && widgets::chip(ui, &format!("{}×", preview.speed)).clicked() {
            preview.speeds = (preview.speeds + 1) % SPEEDS.len();
            preview.speed = SPEEDS[preview.speeds];
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if count > 0 {
                widgets::chip(ui, &format!("{} / {count}", index + 1));
            }
        });
    });
}

pub fn keys(ui: &Ui, preview: &mut StripPreview, frames: &[StripFrame]) {
    if !super::keyboard_free(ui) {
        return;
    }
    let (space, comma, period, mute) = ui.input(|i| {
        (
            i.key_pressed(egui::Key::Space),
            i.key_pressed(egui::Key::Comma),
            i.key_pressed(egui::Key::Period),
            i.key_pressed(egui::Key::M),
        )
    });
    if space {
        preview.playing = !preview.playing;
    }
    if mute {
        preview.muted = !preview.muted;
    }
    if (comma || period) && !frames.is_empty() {
        preview.playing = false;
        let total = super::total_ms(frames).max(1) as f32;
        let index = index_at(frames, preview.position, false);
        let next = if period {
            (index + 1) % frames.len()
        } else {
            (index + frames.len() - 1) % frames.len()
        };
        preview.position = (super::starts_at(frames, next) as f32).min(total - 1.0);
    }
}

pub struct SpawnGround {
    pub area: String,
    pub at: Pos<Tiles>,
    pub name: String,
}

pub fn spawn_ground(editor: &Editor) -> Option<SpawnGround> {
    let content = editor.project.as_ref()?.content?;
    let place = &content.built::<GameSettings>().initial_spawn;
    Some(SpawnGround {
        area: place.area.key(&content).to_owned(),
        at: place.at,
        name: place.area.get(&content).name.clone(),
    })
}

pub fn backdrop(
    editor: &mut Editor,
    painter: &egui::Painter,
    rect: ERect,
    scene_key: String,
    zoom: f32,
) -> egui::Pos2 {
    painter.rect_filled(rect, 6.0, Color32::from_rgb(78, 128, 52));
    let feet = rect.center();
    let Some(SpawnGround { area, at, .. }) = spawn_ground(editor) else {
        return feet;
    };
    let ppp = painter.ctx().pixels_per_point();
    let generation = editor
        .project
        .as_ref()
        .map_or(0, |project| project.generation);
    editor.views.area.requests.push(AreaSceneRequest {
        key: scene_key.clone(),
        spec: AreaSceneSpec {
            ground: area,
            scenery: SceneryOf::Area,
            hidden_ground: Vec::new(),
            show_blueprints: true,
            show_scenery: true,
        },
        width: (rect.width() * ppp) as u32,
        height: (rect.height() * ppp) as u32,
        center: at,
        zoom: zoom * ppp,
        generation,
        live: true,
    });
    if let Some(scene) = editor.views.area.scenes.by_key.get(&scene_key) {
        painter.image(scene.texture, rect, scene.uv(), Color32::WHITE);
    }
    feet
}

pub fn draw_sprite(
    painter: &egui::Painter,
    sheet: &ModelSheet,
    row: &Value,
    frame: Option<u32>,
    feet: egui::Pos2,
    zoom: f32,
) {
    let (Some(frame), Some(thumb)) = (frame, &sheet.thumb) else {
        return;
    };
    let scale = zoom * super::hitbox::scale_of(row);
    let shown = Vec2::new(
        sheet.frame_width as f32 * scale,
        sheet.frame_height as f32 * scale,
    );
    painter.image(
        thumb.texture.id(),
        sprite_rect(feet, shown),
        sheet.uv(frame),
        Color32::WHITE,
    );
}

pub fn sprite_rect(feet: egui::Pos2, shown: Vec2) -> ERect {
    let anchor = ACTOR_ANCHOR.0;
    ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, (0.5 - anchor.y) * shown.y),
        feet + Vec2::new(shown.x / 2.0, (0.5 + anchor.y) * shown.y),
    )
}
