use egui::{Color32, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::{ACTIONS, DIRECTIONS, FrameData, action_timing, play_rule, strip_of, total_ms};
use crate::app::Editor;
use crate::ui::{theme, widgets};

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let (action, direction) = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction)
    };
    let frames = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
    super::strip::header(editor, ui, key, row, action, direction);
    super::strip::keys(editor, ui, key, &frames, &sheet);
    let frames = strip_of(
        &editor.row_value(super::TABLE, key).unwrap_or(row.clone()),
        ACTIONS[action],
        DIRECTIONS[direction],
    );
    let dt = ui.input(|i| i.stable_dt).min(0.1);
    let tick = {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        super::preview::keys(ui, &mut view.preview, &frames);
        super::preview::tick(&mut view.preview, dt, &frames, ACTIONS[action])
    };
    super::preview::fire(editor, key, &frames, &tick.passed);
    ui.ctx().request_repaint();
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        ui.label(RichText::new("◆").color(theme::WARN));
        ui.label(theme::strong("apex"));
        ui.label(theme::muted("the hit lands ·"));
        ui.label(RichText::new("♫").color(theme::ACCENT));
        ui.label(theme::strong("sound"));
        ui.label(theme::muted("plays a sound row ·"));
        ui.label(RichText::new("●").color(theme::WARN));
        ui.label(theme::strong("step"));
        ui.label(theme::muted(
            "plays the footstep of the surface underfoot. Each rides its frame.",
        ));
    });
    ui.add_space(14.0);
    let timing = action_timing(row, ACTIONS[action]);
    let total = total_ms(&frames);
    let layout = super::strip::timeline(
        editor, ui, key, &sheet, &frames, action, direction, None, true,
    );
    let _ = timing;
    let strip_end = layout.x_at(total);
    ui.painter().text(
        egui::pos2(strip_end, layout.rect.min.y - 14.0),
        egui::Align2::RIGHT_BOTTOM,
        format!("strip ends · {total} ms"),
        egui::FontId::monospace(11.0),
        theme::MUTED,
    );
    super::strip::lanes(editor, ui, key, &frames, &layout, action, direction, true);
    ui.add_space(16.0);
    steps(editor, ui, key, row, &sheet, action, direction, &frames);
    super::strip::confirm(editor, &ctx, key, row, action, direction);
    let cue = editor.views.model.views[key].cue;
    let mut status = format!("{} · {}", ACTIONS[action], DIRECTIONS[direction]);
    if let Some((index, kind)) = cue {
        status.push_str(&format!(" · {} on frame {}", kind.key(), index + 1));
    }
    editor.status.left.push(status);
    editor.status.left.push(
        "Space plays with sound · M mutes the preview · A, S, T put cues on the frame".to_owned(),
    );
}

/// The strip's steps auditioned on every surface: the current strip when it has steps, else the
/// model's first strip that does.
#[allow(clippy::too_many_arguments)]
fn steps(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    sheet: &super::SheetInfo,
    action: usize,
    direction: usize,
    frames: &[FrameData],
) {
    let own = frames.iter().any(|frame| frame.step);
    let (a, d, strip) = if own {
        (action, direction, frames.to_vec())
    } else {
        let mut found = None;
        'search: for (a, name) in ACTIONS.iter().enumerate() {
            for (d, dir) in DIRECTIONS.iter().enumerate() {
                let strip = strip_of(row, name, dir);
                if strip.iter().any(|frame| frame.step) {
                    found = Some((a, d, strip));
                    break 'search;
                }
            }
        }
        let Some(found) = found else {
            widgets::hint(ui, "No strip of this model has a step cue.");
            return;
        };
        found
    };
    let surfaces = super::sounds::surfaces(editor);
    let chosen = editor.views.model.views[key].surface.clone();
    let mut play = None;
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(ui.available_width() - 190.0);
            ui.horizontal(|ui| {
                ui.label(
                    theme::mono(format!("{} · {}", ACTIONS[a], DIRECTIONS[d]))
                        .color(theme::CODE)
                        .size(13.0),
                );
                ui.label(theme::muted(format!(
                    "{} frames · {} ms · {}",
                    strip.len(),
                    total_ms(&strip),
                    play_rule(ACTIONS[a])
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
                            let c = egui::pos2(rect.min.x + 10.0, lane.center().y);
                            painter.circle_filled(c + Vec2::new(-3.0, 2.0), 4.0, theme::WARN);
                            painter.circle_filled(c + Vec2::new(3.0, -3.0), 4.0, theme::WARN);
                        }
                    }
                });
            }
        });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.label(theme::muted("hear this step on").size(12.0));
            for (surface, name, footstep) in &surfaces {
                ui.horizontal(|ui| {
                    let on = chosen.as_deref() == Some(surface);
                    let (fill, ink) = if on {
                        (theme::ACCENT, Color32::WHITE)
                    } else {
                        (theme::RAISED, theme::TEXT)
                    };
                    if widgets::chip_coloured(ui, "▶", fill, ink).clicked() {
                        play = Some((surface.clone(), footstep.clone()));
                    }
                    ui.label(theme::mono(name.to_lowercase()).size(12.5));
                    let wave = super::sounds::wave_of_sfx(editor, footstep);
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
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.surface = Some(surface);
        editor
            .views
            .model
            .play
            .push(super::sounds::PlayRequest::Sfx(footstep));
    }
}
