use design_tokens::glyph::{self, Mark};
use egui::{Color32, RichText, Sense, Ui, Vec2};
use engine::core::content::ContentRow;
use engine::systems::actor::ModelDef;
use serde_json::Value;

use super::{ModelStrip, StripFrame, play_rule, strip_of, total_ms};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::ui::{theme, widgets};

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let strip = editor.views.model.view(key).strip;
    let frames = strip_of(row, strip);
    super::strip::header(editor, ui, key, row, strip);
    super::strip::keys(editor, ui, key, &frames, &sheet);
    let frames = strip_of(
        &editor
            .row_value(ModelDef::TABLE, key)
            .unwrap_or(row.clone()),
        strip,
    );
    let dt = ui.input(|i| i.stable_dt).min(0.1);
    let tick = {
        let view = editor.views.model.view_mut(key);
        super::preview::keys(ui, &mut view.preview, &frames);
        super::preview::tick(&mut view.preview, dt, &frames, strip.action)
    };
    super::preview::fire(editor, key, &frames, &tick.passed);
    ui.ctx().request_repaint();
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        ui.label(RichText::new("◆").color(theme::WARN));
        ui.label(theme::strong("apex"));
        ui.label(theme::muted("the hit lands ·"));
        glyph::show(ui, Mark::Note, 14.0, theme::ACCENT);
        ui.label(theme::strong("sound"));
        ui.label(theme::muted("plays a sound row ·"));
        glyph::show(ui, Mark::Dot, 10.0, theme::WARN);
        ui.label(theme::strong("step"));
        ui.label(theme::muted(
            "plays the footstep of the surface underfoot. Each rides its frame.",
        ));
    });
    ui.add_space(14.0);
    let total = total_ms(&frames);
    let layout = super::strip::timeline(editor, ui, key, &sheet, &frames, strip, None);
    let strip_end = layout.x_at(total);
    ui.painter().text(
        egui::pos2(strip_end, layout.rect.min.y - 14.0),
        egui::Align2::RIGHT_BOTTOM,
        format!("strip ends · {total} ms"),
        egui::FontId::monospace(11.0),
        theme::MUTED,
    );
    super::strip::lanes(editor, ui, key, &frames, &layout, strip, true);
    ui.add_space(16.0);
    steps(editor, ui, key, row, &sheet, strip, &frames);
    super::strip::confirm(editor, &ctx, key, row, strip);
    let cue = editor.views.model.view(key).cue;
    let mut status = strip.name();
    if let Some((index, kind)) = cue {
        status.push_str(&format!(" · {} on frame {}", kind.key(), index + 1));
    }
    editor.status.left.push(status);
    editor.status.left.push(format!(
        "{} plays with sound · {} mutes the preview · {}, {}, {} put cues on the frame",
        EditorKey::PlayPause.name(),
        EditorKey::Mute.name(),
        EditorKey::ApexCue.name(),
        EditorKey::SoundCue.name(),
        EditorKey::StepCue.name()
    ));
}

fn steps(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    sheet: &super::ModelSheet,
    strip: ModelStrip,
    frames: &[StripFrame],
) {
    let own = frames.iter().any(|frame| frame.step);
    let (stepping, strip) = if own {
        (strip, frames.to_vec())
    } else {
        let found = ModelStrip::all().find_map(|other| {
            let frames = strip_of(row, other);
            frames
                .iter()
                .any(|frame| frame.step)
                .then_some((other, frames))
        });
        let Some(found) = found else {
            widgets::hint(ui, "No strip of this model has a step cue.");
            return;
        };
        found
    };
    let surfaces = super::sounds::surfaces(editor);
    let chosen = editor.views.model.view(key).surface.clone();
    let mut play = None;
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(ui.available_width() - 190.0);
            ui.horizontal(|ui| {
                ui.label(theme::mono(stepping.name()).color(theme::CODE).size(13.0));
                ui.label(theme::muted(format!(
                    "{} frames · {} ms · {}",
                    strip.len(),
                    total_ms(&strip),
                    play_rule(stepping.action)
                )));
                if !own {
                    ui.label(theme::faint("· the strip with steps"));
                }
            });
            if !own {
                let width = ui.available_width();
                let px_per_ms = ((width - 44.0) / total_ms(&strip).max(1) as f32).min(1.2);
                let mut rects = Vec::new();
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 4.0;
                    ui.add_space(40.0);
                    for frame in &strip {
                        let w = (frame.ms as f32 * px_per_ms).max(20.0);
                        let (rect, _) = ui.allocate_exact_size(Vec2::new(w, 56.0), Sense::hover());
                        ui.painter().rect(
                            rect,
                            3.0,
                            theme::INPUT,
                            egui::Stroke::new(1.0, theme::BORDER),
                            egui::StrokeKind::Inside,
                        );
                        sheet.draw(
                            &ui.painter_at(rect),
                            rect.shrink(3.0),
                            frame.frame,
                            Color32::WHITE,
                        );
                        rects.push(rect);
                    }
                });
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 4.0;
                    ui.allocate_ui(Vec2::new(36.0, 20.0), |ui| {
                        ui.label(theme::muted("step").monospace().size(11.5));
                    });
                    let (lane, _) =
                        ui.allocate_exact_size(Vec2::new(width - 44.0, 20.0), Sense::hover());
                    let painter = ui.painter_at(lane);
                    painter.rect(
                        lane,
                        3.0,
                        theme::INPUT,
                        egui::Stroke::new(1.0, theme::BORDER),
                        egui::StrokeKind::Inside,
                    );
                    for (index, frame) in strip.iter().enumerate() {
                        if frame.step
                            && let Some(rect) = rects.get(index)
                        {
                            let at = egui::pos2(rect.min.x + 10.0, lane.center().y);
                            super::strip::draw_cue(&painter, super::FrameCueKind::Step, at, false);
                        }
                    }
                });
            }
        });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.label(theme::muted("hear this step on").size(12.0));
            for surface in &surfaces {
                ui.horizontal(|ui| {
                    let on = chosen.as_deref() == Some(surface.key.as_str());
                    if widgets::mode_chip(ui, "▶", on).clicked() {
                        play = Some((surface.key.clone(), surface.footstep.clone()));
                    }
                    ui.label(theme::mono(surface.name.to_lowercase()).size(12.5));
                    let wave = super::sounds::wave_of_sfx(editor, &surface.footstep);
                    let (rect, _) = ui.allocate_exact_size(Vec2::new(60.0, 14.0), Sense::hover());
                    if let Some(wave) = wave {
                        super::sounds::draw_wave(ui.painter(), rect, &wave.bins, theme::WARN);
                    }
                });
            }
            if surfaces.is_empty() {
                widgets::hint(ui, "no surface rows");
            }
        });
    });
    if let Some((surface, footstep)) = play {
        let view = editor.views.model.view_mut(key);
        view.surface = Some(surface);
        editor.views.sound.play.push(footstep);
    }
}
