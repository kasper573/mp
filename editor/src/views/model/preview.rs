use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use game::core::math::Pos;
use game::core::tiling::Tiles;
use serde_json::Value;

use super::{FrameData, SheetInfo, sounds::PlayRequest};
use crate::app::Editor;
use crate::ui::theme;
use crate::views::area::TILE_PX;
use crate::views::area::scene::{SceneRequest, SceneSpec, SceneryOf};

pub struct Preview {
    pub playing: bool,
    pub muted: bool,
    pub speed: f32,
    pub position: f32,
    pub remembered: Option<(usize, usize)>,
    pub speeds: usize,
}

impl Default for Preview {
    fn default() -> Preview {
        Preview {
            playing: true,
            muted: false,
            speed: 1.0,
            position: 0.0,
            remembered: None,
            speeds: 0,
        }
    }
}

pub const SPEEDS: [f32; 4] = [1.0, 0.5, 0.25, 2.0];

pub struct Tick {
    pub index: usize,
    pub passed: Vec<usize>,
}

pub fn index_at(frames: &[FrameData], position: f32, holds: bool) -> usize {
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

pub fn tick(preview: &mut Preview, dt: f32, frames: &[FrameData], action: &str) -> Tick {
    let total = super::total_ms(frames).max(1) as f32;
    let holds = action == "death";
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
    Tick {
        index: index_at(frames, preview.position, holds),
        passed,
    }
}

pub fn restart(preview: &mut Preview) {
    preview.position = 0.0;
    preview.playing = true;
}

pub fn fire(editor: &mut Editor, key: &str, frames: &[FrameData], passed: &[usize]) {
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
            editor
                .views
                .model
                .play
                .push(PlayRequest::Sfx(sound.clone()));
        }
        if frame.step && !stepped {
            stepped = true;
            if let Some(footstep) = super::sounds::footstep_of(editor, surface.as_deref()) {
                editor.views.model.play.push(PlayRequest::Sfx(footstep));
            }
        }
    }
}

#[derive(Clone, Copy)]
pub struct Fit {
    pub size: Vec2,
    pub zoom: f32,
}

pub fn draw(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sheet: &SheetInfo,
    row: &Value,
    frame: Option<u32>,
    fit: Fit,
) -> ERect {
    let Fit { size, zoom } = fit;
    let (rect, _) = ui.allocate_exact_size(size, Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 6.0, Color32::from_rgb(78, 128, 52));
    let feet = spawn_backdrop(editor, &painter, rect, format!("model-preview:{key}"), zoom)
        .unwrap_or(rect.center() + Vec2::new(0.0, TILE_PX * zoom / 2.0));
    let scale = zoom * super::hitbox::scale_of(row);
    let shown = Vec2::new(
        sheet.frame_width as f32 * scale,
        sheet.frame_height as f32 * scale,
    );
    if let Some(frame) = frame
        && let Some(thumb) = &sheet.thumb
    {
        let sprite = sprite_rect(feet, shown);
        painter.image(thumb.texture.id(), sprite, sheet.uv(frame), Color32::WHITE);
    }
    painter.rect_stroke(
        rect,
        6.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    rect
}

pub fn controls(ui: &mut Ui, preview: &mut Preview, index: usize, count: usize, speed: bool) {
    ui.horizontal(|ui| {
        let play = if preview.playing { "⏸" } else { "▶" };
        if crate::ui::widgets::chip(ui, play)
            .on_hover_text("Space")
            .clicked()
        {
            preview.playing = !preview.playing;
        }
        let sound = if preview.muted { "🔇" } else { "🔊" };
        if crate::ui::widgets::chip(ui, sound)
            .on_hover_text("M mutes the preview")
            .clicked()
        {
            preview.muted = !preview.muted;
        }
        if speed
            && crate::ui::widgets::chip(
                ui,
                &format!("{}×", crate::forms::trim_number(preview.speed as f64)),
            )
            .clicked()
        {
            preview.speeds = (preview.speeds + 1) % SPEEDS.len();
            preview.speed = SPEEDS[preview.speeds];
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if count > 0 {
                crate::ui::widgets::chip(ui, &format!("{} / {count}", index + 1));
            }
        });
    });
}

pub fn keys(ui: &Ui, preview: &mut Preview, frames: &[FrameData]) {
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

pub fn spawn_ground(editor: &Editor) -> Option<(String, Pos<Tiles>, String)> {
    let content = editor.project.as_ref()?.content?;
    let place = &content.built::<game::systems::GameSettings>().spawn;
    let name = place.area.get(&content).name.clone();
    Some((place.area.key(&content).to_owned(), place.at, name))
}

pub fn spawn_backdrop(
    editor: &mut Editor,
    painter: &egui::Painter,
    rect: ERect,
    scene_key: String,
    zoom: f32,
) -> Option<egui::Pos2> {
    let (area, at, _) = spawn_ground(editor)?;
    let ppp = painter.ctx().pixels_per_point();
    let generation = editor
        .project
        .as_ref()
        .map_or(0, |project| project.generation);
    editor.views.area.requests.push(SceneRequest {
        key: scene_key.clone(),
        spec: SceneSpec {
            ground: area,
            scenery: SceneryOf::Area,
            hidden_ground: Vec::new(),
            show_blueprints: true,
            show_scenery: true,
        },
        width: (rect.width() * ppp) as u32,
        height: (rect.height() * ppp) as u32,
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
    Some(rect.center() + Vec2::new(0.0, TILE_PX * zoom / 2.0))
}

pub fn sprite_rect(feet: egui::Pos2, shown: Vec2) -> ERect {
    let anchor = game::systems::actor::render::ACTOR_ANCHOR.0;
    ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, (0.5 - anchor.y) * shown.y),
        feet + Vec2::new(shown.x / 2.0, (0.5 + anchor.y) * shown.y),
    )
}
