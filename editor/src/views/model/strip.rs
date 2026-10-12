use std::time::Instant;

use egui::{Color32, Rect as ERect, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::{
    ACTIONS, CueKind, DIRECTIONS, FrameData, MAX_FRAME_MS, MAX_FRAMES, Page, action_timing,
    play_rule, strip_of, total_ms,
};
use crate::app::Editor;
use crate::ui::{theme, widgets};

pub const PREVIEW: Vec2 = Vec2::new(170.0, 200.0);
const CARD_H: f32 = 128.0;
const LANE_LABEL: f32 = 56.0;
const LANE_H: f32 = 22.0;
const NUDGE: u32 = 10;

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum SetBy {
    #[default]
    Ms,
    Fps,
    Scale,
}

#[derive(Default)]
pub struct TimingDraft {
    pub set_by: SetBy,
    pub text: String,
}

pub struct EdgeDrag {
    pub frame: usize,
    pub start_ms: u32,
    pub origin_x: f32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Confirm {
    Timing,
    Cues,
}

pub struct SheetFrame(pub u32);

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let (action, direction) = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction)
    };
    let frames = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
    header(editor, ui, key, row, action, direction);
    keys(editor, ui, key, &frames, &sheet);
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
    let timing = action_timing(row, ACTIONS[action]);
    let total = total_ms(&frames);
    let was = was_ms(editor, key, action, direction, &timing);
    ui.add_space(6.0);
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(PREVIEW.x);
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
                    zoom: 2.0,
                },
            );
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
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
            ui.label(theme::muted(sentence(was, total, &timing, direction)));
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if ui
                    .button("Apply timing to the other 7 directions…")
                    .clicked()
                {
                    let view = editor
                        .views
                        .model
                        .views
                        .get_mut(key)
                        .expect("the view exists");
                    view.confirm = Some(Confirm::Timing);
                }
                let recorded = crate::import::recorded_lengths(
                    editor,
                    key,
                    ACTIONS[action],
                    DIRECTIONS[direction],
                );
                let can_revert = recorded
                    .as_ref()
                    .is_some_and(|lengths| *lengths != super::lengths(&frames));
                if ui
                    .add_enabled(can_revert, egui::Button::new("↶ Revert to the import"))
                    .on_disabled_hover_text(if recorded.is_some() {
                        "The lengths are the import's"
                    } else {
                        "No import on record for this model"
                    })
                    .clicked()
                    && let Some(lengths) = recorded
                {
                    let reverted: Vec<FrameData> = frames
                        .iter()
                        .zip(lengths)
                        .map(|(frame, ms)| FrameData {
                            ms,
                            ..frame.clone()
                        })
                        .collect();
                    super::write_strip(
                        editor,
                        key,
                        ACTIONS[action],
                        DIRECTIONS[direction],
                        &reverted,
                        format!(
                            "Revert {} · {} of {key} to the import's lengths",
                            ACTIONS[action], DIRECTIONS[direction]
                        ),
                        false,
                    );
                }
            });
            ui.add_space(6.0);
            widgets::hint(
                ui,
                "Frames are sheet tiles with a length each. Nothing here changes a pixel.",
            );
        });
    });
    ui.add_space(10.0);
    let layout = timeline(
        editor, ui, key, &sheet, &frames, action, direction, was, true,
    );
    lanes(editor, ui, key, &frames, &layout, action, direction, false);
    rides(ui, &frames);
    confirm(editor, &ctx, key, row, action, direction);
    let selected = editor.views.model.views[key].frames.clone();
    let mut status = format!("{} · {}", ACTIONS[action], DIRECTIONS[direction]);
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
    editor
        .status
        .left
        .push("drag an edge to retime · Space plays · , and . step".to_owned());
    editor
        .status
        .right
        .push("stored as ms per frame".to_owned());
}

pub fn header(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    action: usize,
    direction: usize,
) {
    let timing = action_timing(row, ACTIONS[action]);
    let mut pick = None;
    ui.horizontal(|ui| {
        ui.label(
            RichText::new(ACTIONS[action])
                .size(16.0)
                .strong()
                .monospace(),
        );
        ui.add_space(6.0);
        for (d, dir) in DIRECTIONS.iter().enumerate() {
            let on = d == direction;
            let marked = timing.differing.contains(&d) && timing.differing.len() < DIRECTIONS.len();
            let text = if marked {
                format!("{dir} ●")
            } else {
                dir.to_string()
            };
            let (fill, ink) = if on {
                (theme::ACCENT, Color32::WHITE)
            } else {
                (theme::RAISED, theme::TEXT)
            };
            let response = widgets::chip_coloured(ui, &text, fill, ink);
            if marked {
                response
                    .clone()
                    .on_hover_text("edited alone: its lengths differ from the action's");
            }
            if response.clicked() {
                pick = Some(d);
            }
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let page = editor.views.model.views[key].page;
            if page == Page::Cues {
                if widgets::primary(ui, "▶ Play with sound").clicked() {
                    let view = editor
                        .views
                        .model
                        .views
                        .get_mut(key)
                        .expect("the view exists");
                    view.preview.muted = false;
                    super::preview::restart(&mut view.preview);
                }
            } else {
                ui.label(theme::muted(format!(
                    "{} · from the action",
                    play_rule(ACTIONS[action])
                )));
            }
        });
    });
    if let Some(d) = pick {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.direction = d;
        view.frames.clear();
        view.cue = None;
        super::preview::restart(&mut view.preview);
        super::select_strip(editor, key, action, d);
    }
}

/// Where the timeline put each frame, so lanes and drops line up with it.
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

#[allow(clippy::too_many_arguments)]
pub fn timeline(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sheet: &super::SheetInfo,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    was: Option<u32>,
    interactive: bool,
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
    let selected = editor.views.model.views[key].frames.clone();
    let hover = response.hover_pos();
    let mut edge_hover = None;
    for (index, frame_rect) in rects.iter().enumerate() {
        let is_selected = selected.contains(&index);
        painter.rect(
            *frame_rect,
            3.0,
            if is_selected {
                theme::ACCENT_SOFT
            } else {
                theme::INPUT
            },
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
        let art = ERect::from_min_max(
            frame_rect.min + Vec2::new(2.0, 6.0),
            frame_rect.right_top() + Vec2::new(-2.0, 78.0),
        );
        sheet.draw(&painter, art, frames[index].frame, Color32::WHITE);
        painter.text(
            egui::pos2(frame_rect.center().x, frame_rect.max.y - 28.0),
            egui::Align2::CENTER_CENTER,
            format!("{} ms", frames[index].ms),
            egui::FontId::monospace(12.0),
            theme::TEXT,
        );
        painter.text(
            egui::pos2(frame_rect.center().x, frame_rect.max.y - 12.0),
            egui::Align2::CENTER_CENTER,
            format!("frame {}", index + 1),
            egui::FontId::monospace(10.5),
            theme::MUTED,
        );
        if interactive
            && let Some(pos) = hover
            && (pos.x - frame_rect.max.x).abs() <= 6.0
            && pos.y >= frame_rect.min.y
            && pos.y <= frame_rect.max.y
        {
            edge_hover = Some(index);
        }
    }
    let edge_dragging = editor.views.model.views[key].edge_drag.is_some();
    if let Some(index) = edge_hover.or(editor.views.model.views[key]
        .edge_drag
        .as_ref()
        .map(|d| d.frame))
    {
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
    if interactive {
        interact(
            editor,
            ui,
            key,
            &response,
            &layout,
            frames,
            action,
            direction,
            edge_hover,
            edge_dragging,
        );
    }
    layout
}

#[allow(clippy::too_many_arguments)]
fn interact(
    editor: &mut Editor,
    ui: &Ui,
    key: &str,
    response: &egui::Response,
    layout: &TimelineLayout,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    edge_hover: Option<usize>,
    edge_dragging: bool,
) {
    let (shift, ctrl, pressed, down, released, pointer) = ui.input(|i| {
        (
            i.modifiers.shift,
            i.modifiers.command,
            i.pointer.primary_pressed(),
            i.pointer.primary_down(),
            i.pointer.primary_released(),
            i.pointer.latest_pos(),
        )
    });
    if pressed
        && response.hovered()
        && let Some(index) = edge_hover
        && let Some(pos) = pointer
    {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.edge_drag = Some(EdgeDrag {
            frame: index,
            start_ms: frames[index].ms,
            origin_x: pos.x,
        });
    }
    if edge_dragging
        && down
        && let Some(pos) = pointer
        && let Some(drag) = editor.views.model.views[key].edge_drag.as_ref()
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
                ACTIONS[action],
                DIRECTIONS[direction],
                &retimed,
                format!(
                    "Retime {} · {} of {key}",
                    ACTIONS[action], DIRECTIONS[direction]
                ),
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
        view.edge_drag = None;
    }
    if response.clicked()
        && let Some(pos) = response.interact_pointer_pos()
        && edge_hover.is_none()
        && !edge_dragging
    {
        let hit = layout.frame_at(pos.x);
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        match hit {
            Some(index) if shift && !view.frames.is_empty() => {
                let anchor = view.frames[0];
                let (from, to) = (anchor.min(index), anchor.max(index));
                view.frames = (from..=to).collect();
            }
            Some(index) if ctrl => {
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
        super::select_frames(editor, key, action, direction);
    }
    if response.double_clicked()
        && let Some(pos) = response.interact_pointer_pos()
        && let Some(index) = layout.frame_at(pos.x)
    {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.preview.playing = false;
        view.preview.position = super::starts_at(frames, index) as f32;
    }
    if let Some(payload) = response.dnd_release_payload::<SheetFrame>()
        && let Some(pos) = response.interact_pointer_pos()
    {
        let at = layout
            .frames
            .iter()
            .position(|rect| pos.x < rect.center().x)
            .unwrap_or(frames.len());
        insert_frame(editor, key, frames, action, direction, at, payload.0);
    }
    if response.dnd_hover_payload::<SheetFrame>().is_some()
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
    frames: &[FrameData],
    action: usize,
    direction: usize,
    at: usize,
    sheet_frame: u32,
) {
    if frames.len() >= MAX_FRAMES {
        editor.toast(format!("A strip holds at most {MAX_FRAMES} frames"));
        return;
    }
    let mut added = frames.to_vec();
    let ms = frames
        .get(at.saturating_sub(1))
        .map_or(100, |frame| frame.ms);
    added.insert(
        at.min(frames.len()),
        FrameData {
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
        ACTIONS[action],
        DIRECTIONS[direction],
        &added,
        format!(
            "Add sheet frame {sheet_frame} to {} · {} of {key}",
            ACTIONS[action], DIRECTIONS[direction]
        ),
        false,
    ) {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.frames = vec![at.min(frames.len())];
        super::select_frames(editor, key, action, direction);
    }
}

#[allow(clippy::too_many_arguments)]
pub fn lanes(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    frames: &[FrameData],
    layout: &TimelineLayout,
    action: usize,
    direction: usize,
    with_waves: bool,
) {
    let has_steps = frames.iter().any(|frame| frame.step);
    let page = editor.views.model.views[key].page;
    let kinds: Vec<CueKind> = if page == Page::Cues || has_steps {
        vec![CueKind::Apex, CueKind::Sound, CueKind::Step]
    } else {
        vec![CueKind::Apex, CueKind::Sound]
    };
    let selected_cue = editor.views.model.views[key].cue;
    let lane_w = layout.width;
    let mut set = None;
    let mut select = None;
    let strip_end = layout.x_at(total_ms(frames));
    for kind in kinds {
        ui.add_space(4.0);
        let lane_h = if with_waves && kind == CueKind::Sound {
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
                CueKind::Apex if frame.apex => {
                    any = true;
                    let c = egui::pos2(x + 6.0, lane.center().y);
                    painter.add(egui::Shape::convex_polygon(
                        vec![
                            c + Vec2::new(0.0, -7.0),
                            c + Vec2::new(7.0, 0.0),
                            c + Vec2::new(0.0, 7.0),
                            c + Vec2::new(-7.0, 0.0),
                        ],
                        theme::WARN,
                        egui::Stroke::new(if is_selected { 2.0 } else { 0.0 }, Color32::WHITE),
                    ));
                }
                CueKind::Sound => {
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
                            format!("♫ {sound}"),
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
                CueKind::Step if frame.step => {
                    any = true;
                    let c = egui::pos2(x + 6.0, lane.center().y);
                    painter.circle_filled(c + Vec2::new(-3.0, 2.0), 4.0, theme::WARN);
                    painter.circle_filled(c + Vec2::new(3.0, -3.0), 4.0, theme::WARN);
                    if is_selected {
                        painter.circle_stroke(c, 9.0, egui::Stroke::new(1.5, Color32::WHITE));
                    }
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
            let present = match kind {
                CueKind::Apex => frame.apex,
                CueKind::Sound => frame.sound.is_some(),
                CueKind::Step => frame.step,
            };
            if present {
                select = Some((index, kind));
            } else {
                set = Some((index, kind));
            }
        }
        response.on_hover_text(match kind {
            CueKind::Apex => "Click a frame to put the apex there · A",
            CueKind::Sound => "Click a frame to give it a sound · S",
            CueKind::Step => "Click a frame to make it a step · T",
        });
    }
    if let Some((index, kind)) = set {
        set_cue(editor, key, frames, action, direction, index, kind);
    }
    if let Some((index, kind)) = select {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.cue = Some((index, kind));
        view.frames = vec![index];
        super::select_cue(editor, key, action, direction, index, kind);
    }
}

pub fn set_cue(
    editor: &mut Editor,
    key: &str,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    index: usize,
    kind: CueKind,
) {
    let mut cued = frames.to_vec();
    let label = match kind {
        CueKind::Apex => {
            for frame in &mut cued {
                frame.apex = false;
            }
            cued[index].apex = true;
            format!(
                "Apex on frame {} of {} · {} of {key}",
                index + 1,
                ACTIONS[action],
                DIRECTIONS[direction]
            )
        }
        CueKind::Sound => {
            let sound = editor.views.model.views[key]
                .last_sound
                .clone()
                .or_else(|| super::sounds::first_sfx(editor));
            let Some(sound) = sound else {
                editor.toast("No sound rows to pick from");
                return;
            };
            cued[index].sound = Some(sound.clone());
            format!(
                "Sound {sound} on frame {} of {} · {} of {key}",
                index + 1,
                ACTIONS[action],
                DIRECTIONS[direction]
            )
        }
        CueKind::Step => {
            cued[index].step = !cued[index].step;
            if cued[index].step {
                format!(
                    "Step on frame {} of {} · {} of {key}",
                    index + 1,
                    ACTIONS[action],
                    DIRECTIONS[direction]
                )
            } else {
                format!(
                    "No step on frame {} of {} · {} of {key}",
                    index + 1,
                    ACTIONS[action],
                    DIRECTIONS[direction]
                )
            }
        }
    };
    if super::write_strip(
        editor,
        key,
        ACTIONS[action],
        DIRECTIONS[direction],
        &cued,
        label,
        false,
    ) {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        let present = match kind {
            CueKind::Apex => true,
            CueKind::Sound => true,
            CueKind::Step => cued[index].step,
        };
        view.cue = present.then_some((index, kind));
        view.frames = vec![index];
        if present {
            super::select_cue(editor, key, action, direction, index, kind);
        } else {
            super::select_frames(editor, key, action, direction);
        }
    }
}

fn rides(ui: &mut Ui, frames: &[FrameData]) {
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
    direction: usize,
) -> String {
    let common: u32 = timing.common.iter().sum();
    let others = DIRECTIONS.len() - 1;
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
    if timing.differing.contains(&direction) && timing.differing.len() < DIRECTIONS.len() {
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
    action: usize,
    direction: usize,
    timing: &super::ActionTiming,
) -> Option<u32> {
    crate::import::recorded_lengths(editor, key, ACTIONS[action], DIRECTIONS[direction])
        .map(|lengths| lengths.iter().sum())
        .or_else(|| {
            (timing.differing.contains(&direction) && timing.differing.len() < DIRECTIONS.len())
                .then(|| timing.common.iter().sum())
        })
}

pub fn keys(
    editor: &mut Editor,
    ui: &Ui,
    key: &str,
    frames: &[FrameData],
    sheet: &super::SheetInfo,
) {
    if !super::keyboard_free(ui) {
        return;
    }
    let (left, right, alt, shift, ctrl, dup, del, insert, escape, apex, sound, step) =
        ui.input(|i| {
            (
                i.key_pressed(egui::Key::ArrowLeft),
                i.key_pressed(egui::Key::ArrowRight),
                i.modifiers.alt,
                i.modifiers.shift,
                i.modifiers.command,
                i.modifiers.command && i.key_pressed(egui::Key::D),
                i.key_pressed(egui::Key::Delete) || i.key_pressed(egui::Key::Backspace),
                i.key_pressed(egui::Key::Insert),
                i.key_pressed(egui::Key::Escape),
                i.key_pressed(egui::Key::A) && !i.modifiers.command,
                i.key_pressed(egui::Key::S) && !i.modifiers.command,
                i.key_pressed(egui::Key::T) && !i.modifiers.command,
            )
        });
    let (action, direction, selected, sheet_pick, confirm_open) = {
        let view = &editor.views.model.views[key];
        (
            view.action,
            view.direction,
            view.frames.clone(),
            view.sheet_pick,
            view.confirm.is_some(),
        )
    };
    if confirm_open {
        return;
    }
    if escape {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        if view.cue.is_some() {
            view.cue = None;
            super::select_frames(editor, key, action, direction);
        } else {
            view.page = Page::Matrix;
            super::select_strip(editor, key, action, direction);
        }
        return;
    }
    let name = format!("{} · {}", ACTIONS[action], DIRECTIONS[direction]);
    if alt && (left || right) && !selected.is_empty() {
        let delta = if shift { 1 } else { NUDGE };
        let mut nudged = frames.to_vec();
        for index in &selected {
            if let Some(frame) = nudged.get_mut(*index) {
                frame.ms = if right {
                    (frame.ms + delta).min(MAX_FRAME_MS)
                } else {
                    frame.ms.saturating_sub(delta).max(1)
                };
            }
        }
        let merge = editor.views.model.views[key]
            .last_nudge
            .is_some_and(|at| at.elapsed().as_secs_f32() < 1.0);
        if super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &nudged,
            format!("Retime {name} of {key}"),
            merge,
        ) {
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
            view.last_nudge = Some(Instant::now());
        }
        return;
    }
    if ctrl && (left || right) && selected.len() == 1 {
        let index = selected[0];
        let target = if right {
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
                ACTIONS[action],
                DIRECTIONS[direction],
                &moved,
                format!("Move frame {} of {name} of {key}", index + 1),
                false,
            ) {
                let view = editor
                    .views
                    .model
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.frames = vec![target];
                super::select_frames(editor, key, action, direction);
            }
        }
        return;
    }
    if !ctrl && !alt && (left || right) {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        let current = view.frames.first().copied();
        let next = match (current, right) {
            (None, _) => 0,
            (Some(index), true) => (index + 1).min(frames.len().saturating_sub(1)),
            (Some(index), false) => index.saturating_sub(1),
        };
        if shift && let Some(anchor) = current {
            let (from, to) = (anchor.min(next), anchor.max(next));
            view.frames = (from..=to).collect();
        } else {
            view.frames = vec![next];
        }
        view.cue = None;
        super::select_frames(editor, key, action, direction);
        return;
    }
    if dup && !selected.is_empty() {
        if frames.len() + selected.len() > MAX_FRAMES {
            editor.toast(format!("A strip holds at most {MAX_FRAMES} frames"));
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
            ACTIONS[action],
            DIRECTIONS[direction],
            &duplicated,
            format!("Duplicate {} of {name} of {key}", frames_text(&sorted)),
            false,
        ) {
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
            view.frames = new_selection;
            super::select_frames(editor, key, action, direction);
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
            .flat_map(|frame| {
                frame.cues().into_iter().map(move |cue| match cue {
                    CueKind::Sound => frame.sound.clone().unwrap_or_default(),
                    other => other.key().to_owned(),
                })
            })
            .collect();
        let kept: Vec<FrameData> = frames
            .iter()
            .enumerate()
            .filter(|(index, _)| !sorted.contains(index))
            .map(|(_, frame)| frame.clone())
            .collect();
        let mut label = format!("Remove {} of {name} of {key}", frames_text(&sorted));
        if !cues.is_empty() {
            label.push_str(&format!(" with {}", cues.join(", ")));
        }
        if super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &kept,
            label,
            false,
        ) {
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
            view.frames = vec![sorted[0].min(kept.len().saturating_sub(1))];
            view.cue = None;
            super::select_frames(editor, key, action, direction);
        }
        return;
    }
    if insert
        && let Some(pick) = sheet_pick
        && pick < sheet.frames()
    {
        let at = selected.iter().max().map_or(frames.len(), |last| last + 1);
        insert_frame(editor, key, frames, action, direction, at, pick);
        return;
    }
    if (apex || sound || step)
        && let Some(index) = selected.first().copied()
    {
        let kind = if apex {
            CueKind::Apex
        } else if sound {
            CueKind::Sound
        } else {
            CueKind::Step
        };
        set_cue(editor, key, frames, action, direction, index, kind);
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
    action: usize,
    direction: usize,
) {
    let Some(what) = editor.views.model.views[key].confirm else {
        return;
    };
    let source = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
    let mismatched: Vec<String> = DIRECTIONS
        .iter()
        .enumerate()
        .filter(|(d, _)| *d != direction)
        .filter_map(|(_, dir)| {
            let other = strip_of(row, ACTIONS[action], dir);
            (other.len() != source.len()).then(|| format!("{dir} ({})", other.len()))
        })
        .collect();
    let others = DIRECTIONS.len() - 1 - mismatched.len();
    let (title, noun) = match what {
        Confirm::Timing => ("⑂ Apply timing to the other directions", "lengths"),
        Confirm::Cues => ("⑂ Copy cues to the other directions", "cues"),
    };
    let mut decision = None;
    crate::ui::dialogs::card(ctx, "model-confirm", 420.0, |ui| {
        ui.label(RichText::new(title).size(16.0).strong());
        ui.add_space(6.0);
        ui.label(format!(
            "{} · {}'s {noun} go to the other {others} directions, frame by frame.",
            ACTIONS[action], DIRECTIONS[direction]
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
        ui.horizontal(|ui| {
            if widgets::primary(ui, &format!("Apply to {others} directions")).clicked() {
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
    let Some(apply) = decision else {
        return;
    };
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    view.confirm = None;
    if !apply {
        return;
    }
    let mut changed = row.clone();
    for (d, dir) in DIRECTIONS.iter().enumerate() {
        if d == direction {
            continue;
        }
        let other = strip_of(row, ACTIONS[action], dir);
        if other.len() != source.len() {
            continue;
        }
        let merged: Vec<FrameData> = other
            .iter()
            .zip(&source)
            .map(|(frame, from)| match what {
                Confirm::Timing => FrameData {
                    ms: from.ms,
                    ..frame.clone()
                },
                Confirm::Cues => FrameData {
                    apex: from.apex,
                    step: from.step,
                    sound: from.sound.clone(),
                    ..frame.clone()
                },
            })
            .collect();
        changed["sprites"]["actions"][ACTIONS[action]][*dir] =
            Value::Array(merged.iter().map(FrameData::to_value).collect());
    }
    let label = match what {
        Confirm::Timing => format!(
            "Apply {} · {}'s timing to {others} directions of {key}",
            ACTIONS[action], DIRECTIONS[direction]
        ),
        Confirm::Cues => format!(
            "Copy {} · {}'s cues to {others} directions of {key}",
            ACTIONS[action], DIRECTIONS[direction]
        ),
    };
    super::write_row(editor, key, &changed, label, false);
}
