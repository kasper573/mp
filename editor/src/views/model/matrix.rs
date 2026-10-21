use std::collections::BTreeMap;

use design_tokens::controls;
use design_tokens::glyph::{self, Mark};
use egui::{Color32, Sense, Ui, Vec2};
use engine::core::content::ContentFile;
use engine::core::math::Direction;
use engine::core::time::Millis;
use engine::systems::actor::model::SheetFrame;
use engine::systems::actor::{Action, ModelDef};
use strum::VariantArray;

use super::{ModelPage, ModelStrip, action_timing, play_rule, shifted, starts_at, strip_of};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::tabs::shown_path;
use crate::ui::{theme, widgets};
use crate::{import, stage};

const CELL: f32 = 58.0;
const LABEL_W: f32 = 120.0;
const PREVIEW_GAP: f32 = 12.0;

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &ModelDef) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let timings: BTreeMap<Action, super::ActionTiming> = Action::VARIANTS
        .iter()
        .map(|&action| (action, action_timing(row, action)))
        .collect();
    let strip = editor.views.model.view(key).strip;
    keys(editor, ui, key);
    let moved = editor.views.model.view(key).strip;
    if moved != strip {
        super::select_strip(editor, key, moved);
    }
    let strip = moved;
    let frames = strip_of(row, strip);
    let dt = ui.input(|i| i.stable_dt).min(0.1);
    let tick = {
        let view = editor.views.model.view_mut(key);
        super::preview::keys(ui, &mut view.preview, &frames);
        super::preview::tick(&mut view.preview, dt, &frames, strip.action)
    };
    super::preview::fire(editor, key, &frames, &tick.passed);
    ui.ctx().request_repaint();
    let mut open = None;
    let mut pick = None;
    let grid_width = LABEL_W + Direction::VARIANTS.len() as f32 * (CELL + 8.0);
    let layout = if ui.available_width() >= grid_width + PREVIEW_GAP + stage::NARROWEST {
        egui::Layout::left_to_right(egui::Align::Min)
    } else {
        egui::Layout::top_down(egui::Align::Min)
    };
    ui.with_layout(layout, |ui| {
        ui.vertical(|ui| {
            ui.set_width(grid_width);
            header(ui);
            let mut strips = 0;
            let mut frames_total = 0;
            for &action in Action::VARIANTS {
                let timing = &timings[&action];
                ui.horizontal(|ui| {
                    let first = strip_of(row, ModelStrip { action, ..ModelStrip::default() });
                    let total = super::total_ms(&first);
                    let (column, _) =
                        ui.allocate_exact_size(Vec2::new(LABEL_W, CELL + 22.0), Sense::hover());
                    let mut column = ui.new_child(
                        egui::UiBuilder::new()
                            .max_rect(column)
                            .layout(egui::Layout::top_down(egui::Align::Min)),
                    );
                    column.add_space(6.0);
                    column.label(theme::mono(action.as_ref()).color(theme::CODE).size(13.0));
                    column.label(theme::muted(format!("{} · {total} ms", first.len())).size(12.0));
                    column.label(theme::faint(play_rule(action)).size(11.5));
                    for &direction in Direction::VARIANTS {
                        let this = ModelStrip { action, direction };
                        let frames = strip_of(row, this);
                        strips += 1;
                        frames_total += frames.len();
                        let badged = timing.out_of_step(direction);
                        let response = cell(ui, &sheet, frames.first(), this == strip, badged);
                        if response.clicked() {
                            pick = Some(this);
                        }
                        if response.double_clicked() {
                            open = Some(this);
                        }
                        if badged {
                            response.on_hover_text(format!(
                                "{}: {} frames · {} ms · the other directions last {} ms over {} frames",
                                direction.as_ref(),
                                frames.len(),
                                super::total_ms(&frames),
                                timing.common.iter().sum::<u32>(),
                                timing.common.len()
                            ));
                        }
                    }
                });
            }
            ui.add_space(8.0);
            let out_of_step: usize = timings.values().map(super::ActionTiming::stragglers).sum();
            ui.horizontal(|ui| {
                if out_of_step == 0 {
                    glyph::show(ui, Mark::Check, 14.0, theme::OK);
                    ui.label(theme::muted(format!(
                        "{strips} strips · {frames_total} frames · all match"
                    )));
                } else {
                    glyph::show(ui, Mark::Warning, 14.0, theme::WARN);
                    ui.label(theme::muted(format!(
                        "{strips} strips · {frames_total} frames · {out_of_step} out of step with their action"
                    )));
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if controls::marked(ui, Mark::File, "Import onto this model…").clicked() {
                        import::start_for_model(editor, key);
                    }
                });
            });
            if let Some(record) = editor.imports.record_for(ModelDef::TABLE, key)
                && let Some(file) = record.files.first()
            {
                ui.horizontal(|ui| {
                    let export = import::show_path(editor, file);
                    if record.missing() {
                        glyph::show(ui, Mark::Warning, 14.0, theme::WARN);
                        ui.label(theme::muted(format!(
                            "imported from {export}, which is missing now"
                        )));
                    } else {
                        ui.label(theme::faint(format!(
                            "imported from {export} · watched for changes"
                        )));
                    }
                });
            }
        });
        ui.add_space(PREVIEW_GAP);
        ui.vertical(|ui| {
            ui.set_width(stage::preview_width(ui.available_width()));
            ui.label(
                theme::mono(strip.name())
                    .color(theme::CODE),
            );
            super::preview::draw(
                editor,
                ui,
                key,
                strip,
                Millis(starts_at(&frames, tick.index) as f32 + 1.0),
            );
            let view = editor.views.model.view_mut(key);
            super::preview::controls(ui, &mut view.preview, tick.index, frames.len(), false);
        });
    });
    if let Some(picked) = pick {
        let view = editor.views.model.view_mut(key);
        view.strip = picked;
        view.frames.clear();
        super::preview::restart(&mut view.preview);
        super::select_strip(editor, key, picked);
    }
    if let Some(opened) = open {
        open_strip(editor, key, opened);
    }
    let used = super::users(editor, key).len();
    editor
        .status
        .left
        .push(format!("{} · {}", shown_path(key), strip.name()));
    editor.status.left.push(
        format!(
            "{} plays · {} and {} step frames · {} move in the matrix · {} opens the strip",
            EditorKey::PlayPause.name(),
            EditorKey::PreviousFrame.name(),
            EditorKey::NextFrame.name(),
            EditorKey::Move.name(),
            EditorKey::Confirm.name()
        )
        .to_owned(),
    );
    editor.status.right.push(format!(
        "{used} {} use this model",
        if used == 1 { "row" } else { "rows" }
    ));
}

pub fn open_strip(editor: &mut Editor, key: &str, strip: ModelStrip) {
    let view = editor.views.model.view_mut(key);
    view.strip = strip;
    view.page = ModelPage::Timing;
    view.frames.clear();
    view.cue = None;
    super::preview::restart(&mut view.preview);
    super::select_strip(editor, key, strip);
}

fn header(ui: &mut Ui) {
    ui.horizontal(|ui| {
        ui.add_space(LABEL_W);
        for direction in Direction::VARIANTS {
            let (rect, _) = ui.allocate_exact_size(Vec2::new(CELL, 18.0), Sense::hover());
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                direction.as_ref(),
                egui::FontId::monospace(12.5),
                theme::MUTED,
            );
        }
    });
}

fn cell(
    ui: &mut Ui,
    sheet: &super::ModelSheet,
    first: Option<&SheetFrame>,
    selected: bool,
    badged: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(CELL, CELL + 22.0), Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, theme::INPUT);
    painter.rect_stroke(
        rect,
        0.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    if let Some(first) = first {
        sheet.draw(&painter, rect.shrink(6.0), first.frame, Color32::WHITE);
    }
    if badged {
        glyph::alert(&painter, rect.right_top() + Vec2::new(-10.0, 10.0), 7.0);
    }
    if selected || response.hovered() {
        painter.rect_stroke(
            rect,
            0.0,
            egui::Stroke::new(
                2.0,
                if selected {
                    theme::ACCENT
                } else {
                    theme::MUTED
                },
            ),
            egui::StrokeKind::Inside,
        );
    }
    response
}

fn keys(editor: &mut Editor, ui: &Ui, key: &str) {
    if !super::keyboard_free(ui) {
        return;
    }
    let ([turn, step], enter) = ui.input(|i| {
        (
            EditorKey::Move.arrow(i).unwrap_or_default(),
            EditorKey::Confirm.pressed(i),
        )
    });
    let view = editor.views.model.view_mut(key);
    let was = view.strip;
    view.strip = ModelStrip {
        action: shifted(Action::VARIANTS, was.action, step as isize),
        direction: shifted(Direction::VARIANTS, was.direction, turn as isize),
    };
    if view.strip != was {
        view.frames.clear();
        super::preview::restart(&mut view.preview);
    }
    if enter {
        let strip = view.strip;
        open_strip(editor, key, strip);
    }
}

pub fn timeline(editor: &mut Editor, ui: &mut Ui, key: &str, row: &ModelDef) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let view = editor.views.model.view(key);
    let (strip, selected) = (view.strip, view.frames.clone());
    let frames = strip_of(row, strip);
    let Some(reader) = editor.reader() else {
        return;
    };
    let total = super::total_ms(&frames).max(1);
    ui.add_space(6.0);
    let visible = (ui.clip_rect().right() - ui.cursor().left()).max(200.0);
    let width = ui.available_width().min(visible) - 16.0 - 4.0 * (frames.len() + 1) as f32;
    let px_per_ms = (width / total as f32).min(1.2);
    let mut clicked = None;
    ui.horizontal_top(|ui| {
        ui.add_space(8.0);
        ui.spacing_mut().item_spacing.x = 4.0;
        for (index, frame) in frames.iter().enumerate() {
            let w = (frame.ms as f32 * px_per_ms).max(28.0);
            ui.vertical(|ui| {
                ui.set_width(w);
                ui.allocate_ui(Vec2::new(w, 22.0), |ui| {
                    ui.set_min_height(22.0);
                    ui.spacing_mut().item_spacing.x = 2.0;
                    ui.horizontal(|ui| {
                        for cue in super::cues_of(frame, &reader) {
                            let text = match cue {
                                super::FrameCue::Sound(sound) => format!("sound {sound}"),
                                other => other.label(),
                            };
                            widgets::chip_colored(ui, &text, theme::ACCENT_SOFT, theme::TEXT);
                        }
                    });
                });
                let is_selected = selected.contains(&index);
                let response = frame_card(ui, &sheet, frame, index, w, is_selected);
                if response.clicked() {
                    clicked = Some(index);
                }
            });
        }
    });
    ui.horizontal(|ui| {
        ui.add_space(8.0);
        ui.label(theme::faint("0 ms").monospace().size(11.5));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.add_space(8.0);
            ui.label(theme::faint(format!("{total} ms")).monospace().size(11.5));
            ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                ui.add_space((ui.available_width() / 2.0 - 120.0).max(0.0));
                ui.label(
                    theme::faint(format!(
                        "{} opens the strip in the animation editor",
                        EditorKey::Confirm.name()
                    ))
                    .size(12.0),
                );
            });
        });
    });
    if let Some(index) = clicked {
        let view = editor.views.model.view_mut(key);
        view.frames = vec![index];
        super::select_frames(editor, key, strip);
    }
}

fn frame_card(
    ui: &mut Ui,
    sheet: &super::ModelSheet,
    frame: &SheetFrame,
    index: usize,
    width: f32,
    selected: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(width, 100.0), Sense::click());
    super::strip::frame_card(&ui.painter_at(rect), rect, sheet, frame, index, selected);
    response
}
