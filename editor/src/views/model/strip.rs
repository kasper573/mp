use egui::{Color32, Rect as ERect, RichText, Sense, Ui, Vec2};
use engine::core::math::Direction;
use engine::core::time::Millis;
use engine::systems::actor::model::{MAX_FRAME_MS, MAX_STRIP_FRAMES};
use serde_json::Value;
use strum::VariantArray;

use super::{
    FrameCueKind, ModelPage, ModelStrip, StripFrame, action_timing, play_rule, starts_at, strip_of,
    total_ms,
};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::ContentEdit;
use crate::ui::dialogs::{self, DialogAnswer};
use crate::ui::{patterns, theme, widgets};
use crate::{import, stage};

const CARD_H: f32 = 128.0;
const LANE_LABEL: f32 = 56.0;
const LANE_H: f32 = 22.0;
const NUDGE: u32 = 10;

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimingSetBy {
    #[default]
    Ms,
    Fps,
    Scale,
}

#[derive(Default)]
pub struct TimingDraft {
    pub set_by: TimingSetBy,
    pub text: String,
}

pub struct FrameEdgeDrag {
    pub frame: usize,
    pub start_ms: u32,
    pub origin_x: f32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StripConfirm {
    Timing,
    Cues,
}

pub struct DraggedFrame(pub u32);

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let strip = editor.views.model.view(key).strip;
    let frames = strip_of(row, strip);
    header(editor, ui, key, row, strip);
    keys(editor, ui, key, &frames, &sheet);
    let frames = strip_of(&editor.row_value(key).unwrap_or(row.clone()), strip);
    let dt = ui.input(|i| i.stable_dt).min(0.1);
    let tick = {
        let view = editor.views.model.view_mut(key);
        super::preview::keys(ui, &mut view.preview, &frames);
        super::preview::tick(&mut view.preview, dt, &frames, strip.action)
    };
    super::preview::fire(editor, key, &frames, &tick.passed);
    ui.ctx().request_repaint();
    let timing = action_timing(row, strip.action);
    let total = total_ms(&frames);
    let was = was_ms(editor, key, strip, &timing);
    ui.add_space(6.0);
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(stage::preview_width(ui.available_width() / 2.0));
            super::preview::draw(
                editor,
                ui,
                key,
                strip,
                Millis(starts_at(&frames, tick.index) as f32 + 1.0),
            );
            let view = editor.views.model.view_mut(key);
            super::preview::controls(ui, &mut view.preview, tick.index, frames.len(), true);
        });
        ui.add_space(16.0);
        ui.vertical(|ui| {
            ui.add_space(4.0);
            ui.label(
                RichText::new(format!("{} Frames · {total} ms", frames.len()))
                    .size(20.0)
                    .strong(),
            );
            ui.label(theme::muted(sentence(was, total, &timing, strip.direction)));
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if ui
                    .button("Apply timing to the other 7 directions…")
                    .clicked()
                {
                    let view = editor.views.model.view_mut(key);
                    view.confirm = Some(StripConfirm::Timing);
                }
                let recorded = import::recorded_lengths(editor, key, strip);
                let can_revert = recorded
                    .as_ref()
                    .is_some_and(|lengths| *lengths != super::lengths(&frames));
                if ui
                    .add_enabled(can_revert, egui::Button::new("Revert to the import"))
                    .on_disabled_hover_text(if recorded.is_some() {
                        "The lengths are the import's"
                    } else {
                        "No import on record for this model"
                    })
                    .clicked()
                    && let Some(lengths) = recorded
                {
                    let reverted: Vec<StripFrame> = frames
                        .iter()
                        .zip(lengths)
                        .map(|(frame, ms)| StripFrame {
                            ms,
                            ..frame.clone()
                        })
                        .collect();
                    super::write_strip(
                        editor,
                        key,
                        strip,
                        &reverted,
                        ContentEdit::new(format!(
                            "Revert {} of {key} to the import's lengths",
                            strip.name()
                        )),
                    );
                }
            });
            ui.add_space(6.0);
        });
    });
    ui.add_space(10.0);
    let layout = timeline(editor, ui, key, &sheet, &frames, strip, was);
    lanes(editor, ui, key, &frames, &layout, strip, false);
    rides(ui, &frames);
    confirm(editor, &ctx, key, row, strip);
    let selected = editor.views.model.view(key).frames.clone();
    let mut status = strip.name();
    if !selected.is_empty() {
        status.push_str(&format!(
            " · frames {}",
            selected
                .iter()
                .map(|index| (index + 1).to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    editor.status.left.push(status);
    editor.status.left.push(format!(
        "drag an edge to retime · {} plays · {} and {} step",
        EditorKey::PlayPause.name(),
        EditorKey::PreviousFrame.name(),
        EditorKey::NextFrame.name()
    ));
    editor
        .status
        .right
        .push("stored as ms per frame".to_owned());
}

pub fn header(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, strip: ModelStrip) {
    let timing = action_timing(row, strip.action);
    let mut pick = None;
    ui.horizontal(|ui| {
        ui.label(
            RichText::new(strip.action.as_ref())
                .size(16.0)
                .strong()
                .monospace(),
        );
        ui.add_space(6.0);
        for &direction in Direction::VARIANTS {
            let on = direction == strip.direction;
            let marked = timing.out_of_step(direction);
            let text = if marked {
                format!("{} •", direction.as_ref())
            } else {
                direction.as_ref().to_owned()
            };
            let response = widgets::mode_chip(ui, &text, on);
            if marked {
                response
                    .clone()
                    .on_hover_text("edited alone: its lengths differ from the action's");
            }
            if response.clicked() {
                pick = Some(direction);
            }
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let page = editor.views.model.view(key).page;
            if page == ModelPage::Cues {
                if widgets::primary(ui, "▶ Play with sound").clicked() {
                    let view = editor.views.model.view_mut(key);
                    view.preview.muted = false;
                    super::preview::restart(&mut view.preview);
                }
            } else {
                ui.label(theme::muted(format!(
                    "{} · from the action",
                    play_rule(strip.action)
                )));
            }
        });
    });
    if let Some(direction) = pick {
        let picked = ModelStrip { direction, ..strip };
        let view = editor.views.model.view_mut(key);
        view.strip = picked;
        view.frames.clear();
        view.cue = None;
        super::preview::restart(&mut view.preview);
        super::select_strip(editor, key, picked);
    }
}

pub struct TimelineLayout {
    pub rect: ERect,
    pub width: f32,
    pub px_per_ms: f32,
    pub frames: Vec<ERect>,
    pub origin_x: f32,
}

impl TimelineLayout {
    pub fn x_at(&self, ms: u32) -> f32 {
        self.origin_x + ms as f32 * self.px_per_ms
    }

    pub fn frame_at(&self, x: f32) -> Option<usize> {
        self.frames
            .iter()
            .position(|rect| x >= rect.min.x && x < rect.max.x + 4.0)
    }
}

pub fn timeline(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sheet: &super::ModelSheet,
    frames: &[StripFrame],
    strip: ModelStrip,
    was: Option<u32>,
) -> TimelineLayout {
    let total = total_ms(frames).max(1);
    let width = ui.available_width() - LANE_LABEL - 24.0;
    let span = total.max(was.unwrap_or(0)) as f32;
    let px_per_ms = (width / span).min(1.2);
    let (origin, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 0.0), Sense::hover());
    let origin_x = origin.min.x + LANE_LABEL;
    let top = ui.cursor().min.y;
    let mut rects = Vec::new();
    let mut x = origin_x;
    for frame in frames {
        let w = (frame.ms as f32 * px_per_ms).max(20.0);
        rects.push(ERect::from_min_size(
            egui::pos2(x, top),
            Vec2::new(w, CARD_H),
        ));
        x += w + 4.0;
    }
    let rect = ERect::from_min_size(
        egui::pos2(origin_x, top),
        Vec2::new(width + LANE_LABEL, CARD_H + 24.0),
    );
    let (_, response) = ui.allocate_exact_size(rect.size(), Sense::click_and_drag());
    let painter = ui.painter_at(rect.expand2(Vec2::new(0.0, 40.0)));
    let selected = editor.views.model.view(key).frames.clone();
    for (index, frame_rect) in rects.iter().enumerate() {
        frame_card(
            &painter,
            *frame_rect,
            sheet,
            &frames[index],
            index,
            selected.contains(&index),
        );
    }
    let edge_hover = response.hover_pos().and_then(|pos| edge_at(&rects, pos));
    let edge_dragged = editor
        .views
        .model
        .view(key)
        .edge_drag
        .as_ref()
        .map(|drag| drag.frame);
    if let Some(index) = edge_hover.or(edge_dragged) {
        if let Some(frame_rect) = rects.get(index) {
            let handle = ERect::from_center_size(
                egui::pos2(frame_rect.max.x + 2.0, frame_rect.center().y),
                Vec2::new(5.0, CARD_H * 0.6),
            );
            painter.rect_filled(handle, 2.0, Color32::WHITE);
        }
        ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
    }
    let ruler_y = rect.max.y - 12.0;
    let mut tick = 0;
    while tick as f32 <= span {
        let x = origin_x + tick as f32 * px_per_ms;
        painter.line_segment(
            [egui::pos2(x, ruler_y - 6.0), egui::pos2(x, ruler_y)],
            egui::Stroke::new(1.0, theme::BORDER),
        );
        painter.text(
            egui::pos2(x + 3.0, ruler_y + 2.0),
            egui::Align2::LEFT_TOP,
            tick.to_string(),
            egui::FontId::monospace(10.0),
            theme::FAINT,
        );
        tick += 200;
    }
    if let Some(was) = was
        && was != total
    {
        let x = origin_x + was as f32 * px_per_ms;
        painter.extend(egui::Shape::dashed_line(
            &[egui::pos2(x, top - 8.0), egui::pos2(x, ruler_y)],
            egui::Stroke::new(1.0, theme::WARN),
            4.0,
            3.0,
        ));
        let label = format!("was {was} ms");
        let galley = painter.layout_no_wrap(label, egui::FontId::monospace(11.0), theme::TEXT);
        let chip_size = galley.size() + Vec2::new(10.0, 4.0);
        let chip_x = if x + 4.0 + chip_size.x > rect.max.x {
            x - 4.0 - chip_size.x
        } else {
            x + 4.0
        };
        let chip = ERect::from_min_size(egui::pos2(chip_x, top - 22.0), chip_size);
        painter.rect_filled(chip, 3.0, theme::RAISED);
        painter.galley(chip.min + Vec2::new(5.0, 2.0), galley, theme::TEXT);
    }
    let layout = TimelineLayout {
        rect,
        width,
        px_per_ms,
        frames: rects,
        origin_x,
    };
    interact(editor, ui, key, &response, &layout, frames, strip);
    layout
}

fn edge_at(frames: &[ERect], pos: egui::Pos2) -> Option<usize> {
    frames.iter().position(|rect| {
        (pos.x - rect.max.x).abs() <= 6.0 && pos.y >= rect.min.y && pos.y <= rect.max.y
    })
}

fn interact(
    editor: &mut Editor,
    ui: &Ui,
    key: &str,
    response: &egui::Response,
    layout: &TimelineLayout,
    frames: &[StripFrame],
    strip: ModelStrip,
) {
    let (extend, toggle) = ui.input(|i| {
        (
            EditorKey::ExtendSelection.held(i),
            EditorKey::ToggleSelection.held(i),
        )
    });
    let edge_hover = response
        .hover_pos()
        .and_then(|pos| edge_at(&layout.frames, pos));
    let edge_dragging = editor.views.model.view(key).edge_drag.is_some();
    if response.drag_started()
        && let Some(index) = edge_hover
        && let Some(pos) = response.interact_pointer_pos()
    {
        let view = editor.views.model.view_mut(key);
        view.edge_drag = Some(FrameEdgeDrag {
            frame: index,
            start_ms: frames[index].ms,
            origin_x: pos.x,
        });
    }
    if response.dragged()
        && let Some(pos) = response.interact_pointer_pos()
        && let Some(drag) = editor.views.model.view(key).edge_drag.as_ref()
    {
        let ms = (drag.start_ms as f32 + (pos.x - drag.origin_x) / layout.px_per_ms)
            .round()
            .clamp(1.0, MAX_FRAME_MS as f32) as u32;
        let index = drag.frame;
        if frames.get(index).is_some_and(|frame| frame.ms != ms) {
            let mut retimed = frames.to_vec();
            retimed[index].ms = ms;
            super::write_strip(
                editor,
                key,
                strip,
                &retimed,
                ContentEdit::new(format!("Retime {} of {key}", strip.name())).merging(),
            );
        }
    }
    if response.drag_stopped() {
        let view = editor.views.model.view_mut(key);
        view.edge_drag = None;
    }
    if response.clicked()
        && let Some(pos) = response.interact_pointer_pos()
        && edge_hover.is_none()
        && !edge_dragging
    {
        let hit = layout.frame_at(pos.x);
        let view = editor.views.model.view_mut(key);
        match hit {
            Some(index) if extend && !view.frames.is_empty() => {
                let anchor = view.frames[0];
                let (from, to) = (anchor.min(index), anchor.max(index));
                view.frames = (from..=to).collect();
            }
            Some(index) if toggle => {
                if let Some(at) = view.frames.iter().position(|f| *f == index) {
                    view.frames.remove(at);
                } else {
                    view.frames.push(index);
                }
            }
            Some(index) => view.frames = vec![index],
            None => view.frames.clear(),
        }
        view.cue = None;
        view.timing.text.clear();
        super::select_frames(editor, key, strip);
    }
    if response.double_clicked()
        && let Some(pos) = response.interact_pointer_pos()
        && let Some(index) = layout.frame_at(pos.x)
    {
        let view = editor.views.model.view_mut(key);
        view.preview.playing = false;
        view.preview.position = super::starts_at(frames, index) as f32;
    }
    if let Some(payload) = response.dnd_release_payload::<DraggedFrame>()
        && let Some(pos) = response.interact_pointer_pos()
    {
        let at = layout
            .frames
            .iter()
            .position(|rect| pos.x < rect.center().x)
            .unwrap_or(frames.len());
        insert_frame(editor, key, frames, strip, at, payload.0);
    }
    if response.dnd_hover_payload::<DraggedFrame>().is_some()
        && let Some(pos) = response.hover_pos()
    {
        let at = layout
            .frames
            .iter()
            .position(|rect| pos.x < rect.center().x)
            .unwrap_or(frames.len());
        let x = layout
            .frames
            .get(at)
            .map(|rect| rect.min.x - 2.0)
            .or_else(|| layout.frames.last().map(|rect| rect.max.x + 2.0))
            .unwrap_or(layout.origin_x);
        ui.painter().line_segment(
            [
                egui::pos2(x, layout.rect.min.y),
                egui::pos2(x, layout.rect.min.y + CARD_H),
            ],
            egui::Stroke::new(3.0, theme::ACCENT),
        );
    }
}

pub fn insert_frame(
    editor: &mut Editor,
    key: &str,
    frames: &[StripFrame],
    strip: ModelStrip,
    at: usize,
    sheet_frame: u32,
) {
    if frames.len() >= MAX_STRIP_FRAMES {
        editor.toast(format!("A strip holds at most {MAX_STRIP_FRAMES} frames"));
        return;
    }
    let mut added = frames.to_vec();
    let ms = frames
        .get(at.saturating_sub(1))
        .map_or(100, |frame| frame.ms);
    added.insert(
        at.min(frames.len()),
        StripFrame {
            frame: sheet_frame,
            ms,
            apex: false,
            step: false,
            sound: None,
        },
    );
    if super::write_strip(
        editor,
        key,
        strip,
        &added,
        ContentEdit::new(format!(
            "Add sheet frame {sheet_frame} to {} of {key}",
            strip.name()
        )),
    ) {
        let view = editor.views.model.view_mut(key);
        view.frames = vec![at.min(frames.len())];
        super::select_frames(editor, key, strip);
    }
}

pub fn lanes(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    frames: &[StripFrame],
    layout: &TimelineLayout,
    strip: ModelStrip,
    with_waves: bool,
) {
    let has_steps = frames.iter().any(|frame| frame.step);
    let page = editor.views.model.view(key).page;
    let kinds: Vec<FrameCueKind> = if page == ModelPage::Cues || has_steps {
        vec![FrameCueKind::Apex, FrameCueKind::Sound, FrameCueKind::Step]
    } else {
        vec![FrameCueKind::Apex, FrameCueKind::Sound]
    };
    let selected_cue = editor.views.model.view(key).cue;
    let lane_w = layout.width;
    let mut set = None;
    let mut select = None;
    let strip_end = layout.x_at(total_ms(frames));
    for kind in kinds {
        ui.add_space(4.0);
        let lane_h = if with_waves && kind == FrameCueKind::Sound {
            LANE_H * 1.8
        } else {
            LANE_H
        };
        let (row, _) =
            ui.allocate_exact_size(Vec2::new(LANE_LABEL + lane_w, lane_h), Sense::hover());
        let painter = ui.painter_at(row);
        painter.text(
            egui::pos2(row.min.x + LANE_LABEL - 8.0, row.center().y),
            egui::Align2::RIGHT_CENTER,
            kind.key(),
            egui::FontId::monospace(11.5),
            theme::MUTED,
        );
        let lane = ERect::from_min_max(egui::pos2(layout.origin_x, row.min.y), row.max);
        let response = ui.interact(
            lane,
            ui.id().with(("lane", key, kind.key())),
            Sense::click(),
        );
        painter.rect(
            lane,
            3.0,
            theme::INPUT,
            egui::Stroke::new(1.0, theme::BORDER),
            egui::StrokeKind::Inside,
        );
        painter.line_segment(
            [
                egui::pos2(strip_end, lane.min.y),
                egui::pos2(strip_end, lane.max.y),
            ],
            egui::Stroke::new(1.0, theme::BORDER),
        );
        let mut any = false;
        for (index, frame) in frames.iter().enumerate() {
            let Some(frame_rect) = layout.frames.get(index) else {
                continue;
            };
            let x = frame_rect.min.x + 4.0;
            let is_selected = selected_cue == Some((index, kind));
            match kind {
                FrameCueKind::Apex if frame.apex => {
                    any = true;
                    draw_cue(
                        &painter,
                        kind,
                        egui::pos2(x + 6.0, lane.center().y),
                        is_selected,
                    );
                }
                FrameCueKind::Sound => {
                    if let Some(sound) = &frame.sound {
                        any = true;
                        if with_waves {
                            let wave = super::sounds::wave_of_sfx(editor, sound);
                            if let Some(wave) = wave {
                                let w = wave.ms as f32 * layout.px_per_ms;
                                let wave_rect = ERect::from_min_size(
                                    egui::pos2(x, lane.min.y + 2.0),
                                    Vec2::new(w.min(lane.max.x - x), lane_h - 4.0),
                                );
                                super::sounds::draw_wave(
                                    &painter,
                                    wave_rect,
                                    &wave.bins,
                                    theme::ACCENT,
                                );
                            }
                        }
                        let galley = painter.layout_no_wrap(
                            sound.to_string(),
                            egui::FontId::monospace(11.0),
                            theme::TEXT,
                        );
                        let chip = ERect::from_min_size(
                            egui::pos2(x, lane.min.y + 2.0),
                            galley.size() + Vec2::new(10.0, 2.0),
                        );
                        painter.rect(
                            chip,
                            3.0,
                            theme::RAISED,
                            egui::Stroke::new(
                                1.0,
                                if is_selected {
                                    theme::ACCENT
                                } else {
                                    theme::BORDER
                                },
                            ),
                            egui::StrokeKind::Inside,
                        );
                        painter.galley(chip.min + Vec2::new(5.0, 1.0), galley, theme::TEXT);
                    }
                }
                FrameCueKind::Step if frame.step => {
                    any = true;
                    draw_cue(
                        &painter,
                        kind,
                        egui::pos2(x + 6.0, lane.center().y),
                        is_selected,
                    );
                }
                _ => {}
            }
        }
        if !any {
            painter.text(
                egui::pos2(lane.min.x + 8.0, lane.center().y),
                egui::Align2::LEFT_CENTER,
                "none on this strip",
                egui::FontId::proportional(11.5),
                theme::FAINT,
            );
        }
        if response.clicked()
            && let Some(pos) = response.interact_pointer_pos()
            && let Some(index) = layout.frame_at(pos.x)
        {
            let frame = &frames[index];
            if frame.has(kind) {
                select = Some((index, kind));
            } else {
                set = Some((index, kind));
            }
        }
        response.on_hover_text(match kind {
            FrameCueKind::Apex => "Click a frame to put the apex there · A",
            FrameCueKind::Sound => "Click a frame to give it a sound · S",
            FrameCueKind::Step => "Click a frame to make it a step · T",
        });
    }
    if let Some((index, kind)) = set {
        set_cue(editor, key, frames, strip, index, kind);
    }
    if let Some((index, kind)) = select {
        let view = editor.views.model.view_mut(key);
        view.cue = Some((index, kind));
        view.frames = vec![index];
        super::select_cue(editor, key, strip, index, kind);
    }
}

pub fn set_cue(
    editor: &mut Editor,
    key: &str,
    frames: &[StripFrame],
    strip: ModelStrip,
    index: usize,
    kind: FrameCueKind,
) {
    let mut cued = frames.to_vec();
    let label = match kind {
        FrameCueKind::Apex => {
            for frame in &mut cued {
                frame.apex = false;
            }
            cued[index].apex = true;
            format!("Apex on frame {} of {} of {key}", index + 1, strip.name())
        }
        FrameCueKind::Sound => {
            let sound = editor
                .views
                .model
                .view(key)
                .last_sound
                .clone()
                .or_else(|| super::sounds::first_sfx(editor));
            let Some(sound) = sound else {
                editor.toast("No sound rows to pick from");
                return;
            };
            cued[index].sound = Some(sound.clone());
            format!(
                "Sound {sound} on frame {} of {} of {key}",
                index + 1,
                strip.name()
            )
        }
        FrameCueKind::Step => {
            cued[index].step = !cued[index].step;
            if cued[index].step {
                format!("Step on frame {} of {} of {key}", index + 1, strip.name())
            } else {
                format!(
                    "No step on frame {} of {} of {key}",
                    index + 1,
                    strip.name()
                )
            }
        }
    };
    if super::write_strip(editor, key, strip, &cued, ContentEdit::new(label)) {
        let view = editor.views.model.view_mut(key);
        let present = cued[index].has(kind);
        view.cue = present.then_some((index, kind));
        view.frames = vec![index];
        if present {
            super::select_cue(editor, key, strip, index, kind);
        } else {
            super::select_frames(editor, key, strip);
        }
    }
}

pub fn draw_cue(painter: &egui::Painter, kind: FrameCueKind, at: egui::Pos2, selected: bool) {
    match kind {
        FrameCueKind::Apex => {
            painter.add(egui::Shape::convex_polygon(
                vec![
                    at + Vec2::new(0.0, -7.0),
                    at + Vec2::new(7.0, 0.0),
                    at + Vec2::new(0.0, 7.0),
                    at + Vec2::new(-7.0, 0.0),
                ],
                theme::WARN,
                egui::Stroke::new(if selected { 2.0 } else { 0.0 }, Color32::WHITE),
            ));
        }
        FrameCueKind::Step => {
            painter.circle_filled(at + Vec2::new(-3.0, 2.0), 4.0, theme::WARN);
            painter.circle_filled(at + Vec2::new(3.0, -3.0), 4.0, theme::WARN);
            if selected {
                painter.circle_stroke(at, 9.0, egui::Stroke::new(1.5, Color32::WHITE));
            }
        }
        FrameCueKind::Sound => {}
    }
}

pub fn frame_card(
    painter: &egui::Painter,
    rect: ERect,
    sheet: &super::ModelSheet,
    frame: &StripFrame,
    index: usize,
    selected: bool,
) {
    patterns::paint_card(painter, rect, selected);
    let art = ERect::from_min_max(
        rect.min + Vec2::new(2.0, 4.0),
        rect.right_bottom() - Vec2::new(2.0, 44.0),
    );
    sheet.draw(painter, art, frame.frame, Color32::WHITE);
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
}

fn rides(ui: &mut Ui, frames: &[StripFrame]) {
    let cued: Vec<(usize, u32)> = frames
        .iter()
        .enumerate()
        .filter(|(_, frame)| !frame.cues().is_empty())
        .map(|(index, _)| (index, super::starts_at(frames, index)))
        .collect();
    ui.add_space(4.0);
    ui.vertical_centered(|ui| {
        if cued.is_empty() {
            widgets::hint(ui, "no cues on this strip");
        } else {
            let text = cued
                .iter()
                .map(|(index, at)| format!("frame {}, now at {at} ms", index + 1))
                .collect::<Vec<_>>()
                .join(" · ");
            widgets::hint(ui, &format!("cues ride on {text}"));
        }
    });
}

fn sentence(
    was: Option<u32>,
    total: u32,
    timing: &super::ActionTiming,
    direction: Direction,
) -> String {
    let common: u32 = timing.common.iter().sum();
    let others = Direction::VARIANTS.len() - 1;
    let mut parts = Vec::new();
    if let Some(was) = was
        && was != total
    {
        let change = (total as f32 - was as f32) / was.max(1) as f32 * 100.0;
        parts.push(format!("was {was} ms"));
        parts.push(if change >= 0.0 {
            format!("{:.0}% longer", change)
        } else {
            format!("{:.0}% shorter", -change)
        });
    }
    if timing.out_of_step(direction) {
        parts.push(format!(
            "the other {} directions still last {common} ms",
            others - timing.differing.len() + 1
        ));
    } else if timing.differing.is_empty() {
        parts.push(format!("the same as the other {others} directions"));
    } else {
        parts.push(format!(
            "{} of the other directions differ",
            timing.differing.len()
        ));
    }
    parts.join(" · ")
}

fn was_ms(
    editor: &Editor,
    key: &str,
    strip: ModelStrip,
    timing: &super::ActionTiming,
) -> Option<u32> {
    import::recorded_lengths(editor, key, strip)
        .map(|lengths| lengths.iter().sum())
        .or_else(|| {
            timing
                .out_of_step(strip.direction)
                .then(|| timing.common.iter().sum())
        })
}

pub fn keys(
    editor: &mut Editor,
    ui: &Ui,
    key: &str,
    frames: &[StripFrame],
    sheet: &super::ModelSheet,
) {
    if !super::keyboard_free(ui) {
        return;
    }
    let StripKeys {
        shorter,
        longer,
        earlier,
        later,
        along,
        fine,
        extend,
        dup,
        del,
        insert,
        escape,
        apex,
        sound,
        step,
    } = ui.input(StripKeys::read);
    let view = editor.views.model.view(key);
    let (strip, selected, sheet_pick, confirm_open) = (
        view.strip,
        view.frames.clone(),
        view.sheet_pick,
        view.confirm.is_some(),
    );
    if confirm_open {
        return;
    }
    if escape {
        let view = editor.views.model.view_mut(key);
        if view.cue.is_some() {
            view.cue = None;
            super::select_frames(editor, key, strip);
        } else {
            view.page = ModelPage::Matrix;
            super::select_strip(editor, key, strip);
        }
        return;
    }
    let name = strip.name();
    if (shorter || longer) && !selected.is_empty() {
        let delta = if fine { 1 } else { NUDGE };
        let mut nudged = frames.to_vec();
        for index in &selected {
            if let Some(frame) = nudged.get_mut(*index) {
                frame.ms = if longer {
                    (frame.ms + delta).min(MAX_FRAME_MS)
                } else {
                    frame.ms.saturating_sub(delta).max(1)
                };
            }
        }
        let edit = ContentEdit::new(format!("Retime {name} of {key}")).merging();
        super::write_strip(editor, key, strip, &nudged, edit);
        return;
    }
    if (earlier || later) && selected.len() == 1 {
        let index = selected[0];
        let target = if later {
            index + 1
        } else {
            index.wrapping_sub(1)
        };
        if target < frames.len() {
            let mut moved = frames.to_vec();
            moved.swap(index, target);
            if super::write_strip(
                editor,
                key,
                strip,
                &moved,
                ContentEdit::new(format!("Move frame {} of {name} of {key}", index + 1)),
            ) {
                let view = editor.views.model.view_mut(key);
                view.frames = vec![target];
                super::select_frames(editor, key, strip);
            }
        }
        return;
    }
    if let Some(along) = along {
        let view = editor.views.model.view_mut(key);
        let current = view.frames.first().copied();
        let next = match (current, along > 0) {
            (None, _) => 0,
            (Some(index), true) => (index + 1).min(frames.len().saturating_sub(1)),
            (Some(index), false) => index.saturating_sub(1),
        };
        if extend && let Some(anchor) = current {
            let (from, to) = (anchor.min(next), anchor.max(next));
            view.frames = (from..=to).collect();
        } else {
            view.frames = vec![next];
        }
        view.cue = None;
        super::select_frames(editor, key, strip);
        return;
    }
    if dup && !selected.is_empty() {
        if frames.len() + selected.len() > MAX_STRIP_FRAMES {
            editor.toast(format!("A strip holds at most {MAX_STRIP_FRAMES} frames"));
            return;
        }
        let mut sorted = selected.clone();
        sorted.sort_unstable();
        let mut duplicated = Vec::new();
        let mut new_selection = Vec::new();
        for (index, frame) in frames.iter().enumerate() {
            duplicated.push(frame.clone());
            if sorted.contains(&index) {
                new_selection.push(duplicated.len());
                duplicated.push(frame.clone());
            }
        }
        if super::write_strip(
            editor,
            key,
            strip,
            &duplicated,
            ContentEdit::new(format!(
                "Duplicate {} of {name} of {key}",
                frames_text(&sorted)
            )),
        ) {
            let view = editor.views.model.view_mut(key);
            view.frames = new_selection;
            super::select_frames(editor, key, strip);
        }
        return;
    }
    if del && !selected.is_empty() {
        if selected.len() >= frames.len() {
            editor.toast("The last frame stays: a strip needs one");
            return;
        }
        let mut sorted = selected.clone();
        sorted.sort_unstable();
        let cues: Vec<String> = sorted
            .iter()
            .filter_map(|index| frames.get(*index))
            .flat_map(|frame| frame.cues().into_iter().map(|cue| cue.label()))
            .collect();
        let kept: Vec<StripFrame> = frames
            .iter()
            .enumerate()
            .filter(|(index, _)| !sorted.contains(index))
            .map(|(_, frame)| frame.clone())
            .collect();
        let mut label = format!("Remove {} of {name} of {key}", frames_text(&sorted));
        if !cues.is_empty() {
            label.push_str(&format!(" with {}", cues.join(", ")));
        }
        if super::write_strip(editor, key, strip, &kept, ContentEdit::new(label)) {
            let view = editor.views.model.view_mut(key);
            view.frames = vec![sorted[0].min(kept.len().saturating_sub(1))];
            view.cue = None;
            super::select_frames(editor, key, strip);
        }
        return;
    }
    if insert
        && let Some(pick) = sheet_pick
        && pick < sheet.frames()
    {
        let at = selected.iter().max().map_or(frames.len(), |last| last + 1);
        insert_frame(editor, key, frames, strip, at, pick);
        return;
    }
    if (apex || sound || step)
        && let Some(index) = selected.first().copied()
    {
        let kind = if apex {
            FrameCueKind::Apex
        } else if sound {
            FrameCueKind::Sound
        } else {
            FrameCueKind::Step
        };
        set_cue(editor, key, frames, strip, index, kind);
    }
}

struct StripKeys {
    shorter: bool,
    longer: bool,
    earlier: bool,
    later: bool,
    along: Option<i32>,
    fine: bool,
    extend: bool,
    dup: bool,
    del: bool,
    insert: bool,
    escape: bool,
    apex: bool,
    sound: bool,
    step: bool,
}

impl StripKeys {
    fn read(input: &egui::InputState) -> StripKeys {
        StripKeys {
            shorter: EditorKey::FrameShorter.pressed(input),
            longer: EditorKey::FrameLonger.pressed(input),
            earlier: EditorKey::FrameEarlier.pressed(input),
            later: EditorKey::FrameLater.pressed(input),
            along: EditorKey::Move
                .arrow(input)
                .filter(|[_, y]| *y == 0)
                .map(|[x, _]| x),
            fine: EditorKey::FineStep.held(input),
            extend: EditorKey::ExtendSelection.held(input),
            dup: EditorKey::Duplicate.pressed(input),
            del: EditorKey::Delete.pressed(input),
            insert: EditorKey::InsertFrame.pressed(input),
            escape: EditorKey::Cancel.pressed(input),
            apex: EditorKey::ApexCue.pressed(input),
            sound: EditorKey::SoundCue.pressed(input),
            step: EditorKey::StepCue.pressed(input),
        }
    }
}

fn frames_text(indices: &[usize]) -> String {
    if indices.len() == 1 {
        format!("frame {}", indices[0] + 1)
    } else {
        format!(
            "frames {}",
            indices
                .iter()
                .map(|index| (index + 1).to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    }
}

pub fn confirm(
    editor: &mut Editor,
    ctx: &egui::Context,
    key: &str,
    row: &Value,
    strip: ModelStrip,
) {
    let Some(what) = editor.views.model.view(key).confirm else {
        return;
    };
    let source = strip_of(row, strip);
    let others_of = |direction: Direction| ModelStrip { direction, ..strip };
    let mismatched: Vec<String> = Direction::VARIANTS
        .iter()
        .filter(|&&direction| direction != strip.direction)
        .filter_map(|&direction| {
            let other = strip_of(row, others_of(direction));
            (other.len() != source.len())
                .then(|| format!("{} ({})", direction.as_ref(), other.len()))
        })
        .collect();
    let others = Direction::VARIANTS.len() - 1 - mismatched.len();
    let (title, noun) = match what {
        StripConfirm::Timing => ("Apply timing to the other directions", "lengths"),
        StripConfirm::Cues => ("Copy cues to the other directions", "cues"),
    };
    let mut answer = None;
    dialogs::card(ctx, "model-confirm", 420.0, |ui| {
        ui.label(RichText::new(title).size(16.0).strong());
        ui.add_space(6.0);
        ui.label(format!(
            "{}'s {noun} go to the other {others} directions, frame by frame.",
            strip.name()
        ));
        if !mismatched.is_empty() {
            ui.add_space(4.0);
            ui.label(theme::muted(format!(
                "{} with a different frame count keep theirs: {}",
                mismatched.len(),
                mismatched.join(", ")
            )));
        }
        ui.add_space(10.0);
        answer = dialogs::answer_row(ui, &format!("Apply to {others} directions"));
    });
    let Some(answer) = answer else {
        return;
    };
    editor.views.model.view_mut(key).confirm = None;
    if answer == DialogAnswer::Cancel {
        return;
    }
    let mut changed = row.clone();
    for &direction in Direction::VARIANTS {
        if direction == strip.direction {
            continue;
        }
        let other = strip_of(row, others_of(direction));
        if other.len() != source.len() {
            continue;
        }
        let merged: Vec<StripFrame> = other
            .iter()
            .zip(&source)
            .map(|(frame, from)| match what {
                StripConfirm::Timing => StripFrame {
                    ms: from.ms,
                    ..frame.clone()
                },
                StripConfirm::Cues => StripFrame {
                    apex: from.apex,
                    step: from.step,
                    sound: from.sound.clone(),
                    ..frame.clone()
                },
            })
            .collect();
        changed["sprites"]["actions"][strip.action.as_ref()][direction.as_ref()] =
            super::frames_json(&merged);
    }
    let label = match what {
        StripConfirm::Timing => format!(
            "Apply {}'s timing to {others} directions of {key}",
            strip.name()
        ),
        StripConfirm::Cues => format!(
            "Copy {}'s cues to {others} directions of {key}",
            strip.name()
        ),
    };
    super::write_row(editor, key, &changed, ContentEdit::new(label));
}
