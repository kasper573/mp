use egui::{Color32, Rect as ERect, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::{ACTIONS, DIRECTIONS, FrameData, Page, action_timing, play_rule, strip_of};
use crate::app::Editor;
use crate::ui::{theme, widgets};

const CELL: f32 = 58.0;
const LABEL_W: f32 = 100.0;
const PREVIEW: Vec2 = Vec2::new(180.0, 350.0);

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let timings: Vec<super::ActionTiming> = ACTIONS
        .iter()
        .map(|action| action_timing(row, action))
        .collect();
    let (action, direction) = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction)
    };
    keys(editor, ui, key);
    let moved = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction)
    };
    if moved != (action, direction) {
        super::select_strip(editor, key, moved.0, moved.1);
    }
    let (action, direction) = moved;
    let frames = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
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
    let mut open = None;
    let mut pick = None;
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(LABEL_W + DIRECTIONS.len() as f32 * (CELL + 8.0));
            header(ui);
            let mut counts = (0usize, 0usize);
            for (a, name) in ACTIONS.iter().enumerate() {
                ui.horizontal(|ui| {
                    let first = strip_of(row, name, DIRECTIONS[0]);
                    let total = super::total_ms(&first);
                    ui.allocate_ui_with_layout(
                        Vec2::new(LABEL_W, CELL + 22.0),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            ui.add_space(6.0);
                            ui.label(theme::mono(*name).color(theme::CODE).size(13.0));
                            ui.label(
                                theme::muted(format!("{} · {total} ms", first.len())).size(12.0),
                            );
                            ui.label(theme::faint(play_rule(name)).size(11.5));
                        },
                    );
                    for (d, dir) in DIRECTIONS.iter().enumerate() {
                        let strip = strip_of(row, name, dir);
                        counts.0 += 1;
                        counts.1 += strip.len();
                        let selected = (a, d) == (action, direction);
                        let badged = timings[a].differing.contains(&d)
                            && timings[a].differing.len() < DIRECTIONS.len();
                        let response = cell(ui, &sheet, strip.first(), selected, badged);
                        if response.clicked() {
                            pick = Some((a, d));
                        }
                        if response.double_clicked() {
                            open = Some((a, d));
                        }
                        if badged {
                            response.on_hover_text(format!(
                                "{dir}: {} frames · {} ms · the other directions last {} ms over {} frames",
                                strip.len(),
                                super::total_ms(&strip),
                                timings[a].common.iter().sum::<u32>(),
                                timings[a].common.len()
                            ));
                        }
                    }
                });
            }
            ui.add_space(8.0);
            let out_of_step: usize = timings
                .iter()
                .map(|timing| {
                    if timing.differing.len() < DIRECTIONS.len() {
                        timing.differing.len()
                    } else {
                        0
                    }
                })
                .sum();
            ui.horizontal(|ui| {
                if out_of_step == 0 {
                    ui.label(RichText::new("✓").color(theme::OK));
                    ui.label(theme::muted(format!(
                        "{} strips · {} frames · all match",
                        counts.0, counts.1
                    )));
                } else {
                    ui.label(RichText::new("!").color(theme::WARN).strong());
                    ui.label(theme::muted(format!(
                        "{} strips · {} frames · {out_of_step} out of step with their action",
                        counts.0, counts.1
                    )));
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("🗋 Import onto this model…").clicked() {
                        crate::import::start_for_model(editor, key);
                    }
                });
            });
            if let Some(record) = editor.imports.record_for(super::TABLE, key).cloned() {
                ui.horizontal(|ui| {
                    let export = crate::import::show_path(editor, &record.export);
                    match record.missing() {
                        true => {
                            ui.label(theme::warn("⚠"));
                            ui.label(theme::muted(format!(
                                "imported from {export}, which is missing now"
                            )));
                        }
                        false => {
                            ui.label(theme::faint(format!(
                                "imported from {export} · watched for changes"
                            )));
                        }
                    }
                });
            }
        });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.set_width(PREVIEW.x);
            ui.label(
                theme::mono(format!("{} · {}", ACTIONS[action], DIRECTIONS[direction]))
                    .color(theme::CODE),
            );
            let frame = frames.get(tick.index).map(|frame| frame.frame);
            super::preview::draw(
                editor,
                ui,
                key,
                &sheet,
                row,
                frame,
                super::preview::Fit {
                    size: PREVIEW,
                    zoom: 3.0,
                },
            );
            let view = editor.views.model.views.get_mut(key).expect("the view exists");
            super::preview::controls(ui, &mut view.preview, tick.index, frames.len(), false);
        });
    });
    if let Some((a, d)) = pick {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.action = a;
        view.direction = d;
        view.frames.clear();
        super::preview::restart(&mut view.preview);
        super::select_strip(editor, key, a, d);
    }
    if let Some((a, d)) = open {
        open_strip(editor, key, a, d);
    }
    let used = super::users(editor, key).len();
    editor.status.left.push(format!(
        "model/{key} · {} · {}",
        ACTIONS[action], DIRECTIONS[direction]
    ));
    editor.status.left.push(
        "Space plays · , and . step frames · arrows move in the matrix · Enter opens the strip"
            .to_owned(),
    );
    editor.status.right.push(format!(
        "{used} {} use this model",
        if used == 1 { "row" } else { "rows" }
    ));
}

pub fn open_strip(editor: &mut Editor, key: &str, action: usize, direction: usize) {
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    view.action = action;
    view.direction = direction;
    view.page = Page::Timing;
    view.frames.clear();
    view.cue = None;
    super::preview::restart(&mut view.preview);
    super::select_strip(editor, key, action, direction);
}

fn header(ui: &mut Ui) {
    ui.horizontal(|ui| {
        ui.add_space(LABEL_W);
        for dir in DIRECTIONS {
            let (rect, _) = ui.allocate_exact_size(Vec2::new(CELL, 18.0), Sense::hover());
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                dir,
                egui::FontId::monospace(12.5),
                theme::MUTED,
            );
        }
    });
}

fn cell(
    ui: &mut Ui,
    sheet: &super::SheetInfo,
    first: Option<&FrameData>,
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
        let badge =
            ERect::from_center_size(rect.right_top() + Vec2::new(-9.0, 9.0), Vec2::splat(12.0));
        painter.circle_filled(badge.center(), 6.0, theme::WARN);
        painter.text(
            badge.center(),
            egui::Align2::CENTER_CENTER,
            "!",
            egui::FontId::proportional(10.0),
            Color32::BLACK,
        );
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
    let (left, right, up, down, enter) = ui.input(|i| {
        (
            i.key_pressed(egui::Key::ArrowLeft),
            i.key_pressed(egui::Key::ArrowRight),
            i.key_pressed(egui::Key::ArrowUp),
            i.key_pressed(egui::Key::ArrowDown),
            i.key_pressed(egui::Key::Enter),
        )
    });
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    let mut moved = false;
    if left && view.direction > 0 {
        view.direction -= 1;
        moved = true;
    }
    if right && view.direction + 1 < DIRECTIONS.len() {
        view.direction += 1;
        moved = true;
    }
    if up && view.action > 0 {
        view.action -= 1;
        moved = true;
    }
    if down && view.action + 1 < ACTIONS.len() {
        view.action += 1;
        moved = true;
    }
    if moved {
        view.frames.clear();
        super::preview::restart(&mut view.preview);
    }
    if enter {
        let (a, d) = (view.action, view.direction);
        open_strip(editor, key, a, d);
    }
}

/// The TIMELINE tab under the matrix: the selected strip's frames as wide as they last, cues above.
pub fn timeline(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let (action, direction, selected) = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction, view.frames.clone())
    };
    let frames = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
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
                        for cue in frame.cues() {
                            let text = match cue {
                                super::CueKind::Apex => "◆ apex".to_owned(),
                                super::CueKind::Sound => {
                                    format!("♫ {}", frame.sound.clone().unwrap_or_default())
                                }
                                super::CueKind::Step => "● step".to_owned(),
                            };
                            widgets::chip_coloured(ui, &text, theme::ACCENT_SOFT, theme::TEXT);
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
                ui.label(theme::faint("Enter opens the strip in the animation editor").size(12.0));
            });
        });
    });
    if let Some(index) = clicked {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.frames = vec![index];
        super::select_frames(editor, key, action, direction);
    }
}

pub fn frame_card(
    ui: &mut Ui,
    sheet: &super::SheetInfo,
    frame: &FrameData,
    index: usize,
    width: f32,
    selected: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(width, 100.0), Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect(
        rect,
        3.0,
        if selected {
            theme::ACCENT_SOFT
        } else {
            theme::INPUT
        },
        egui::Stroke::new(
            1.0,
            if selected {
                theme::ACCENT
            } else {
                theme::BORDER
            },
        ),
        egui::StrokeKind::Inside,
    );
    let art = ERect::from_min_max(
        rect.min + Vec2::new(2.0, 4.0),
        rect.right_top() + Vec2::new(-2.0, 58.0),
    );
    sheet.draw(&painter, art, frame.frame, Color32::WHITE);
    painter.text(
        egui::pos2(rect.center().x, rect.max.y - 26.0),
        egui::Align2::CENTER_CENTER,
        format!("{} ms", frame.ms),
        egui::FontId::monospace(12.0),
        theme::TEXT,
    );
    painter.text(
        egui::pos2(rect.center().x, rect.max.y - 11.0),
        egui::Align2::CENTER_CENTER,
        format!("frame {}", index + 1),
        egui::FontId::monospace(10.5),
        theme::MUTED,
    );
    response
}
