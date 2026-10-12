use egui::{Color32, Sense, Ui, Vec2};
use serde_json::Value;

use super::{ACTIONS, DIRECTIONS, strip::SheetFrame, strip_of};
use crate::app::Editor;
use crate::ui::{theme, widgets};

const CELL: f32 = 76.0;

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let sheet = super::sheet_info(editor, &ctx, row);
    let (action, direction, pick) = {
        let view = &editor.views.model.views[key];
        (view.action, view.direction, view.sheet_pick)
    };
    let current = strip_of(row, ACTIONS[action], DIRECTIONS[direction]);
    let used: Vec<u32> = current.iter().map(|frame| frame.frame).collect();
    let mut starts: Vec<(u32, String)> = Vec::new();
    for name in ACTIONS {
        for dir in DIRECTIONS {
            if let Some(first) = strip_of(row, name, dir).first() {
                starts.push((first.frame, format!("{name} {dir}")));
            }
        }
    }
    let row_of = |frame: u32| -> String {
        let columns = sheet.columns.max(1);
        let line = frame / columns;
        let first = line * columns;
        let last = first + columns;
        starts
            .iter()
            .filter(|(start, _)| *start >= first && *start < last)
            .map(|(_, name)| name.clone())
            .collect::<Vec<_>>()
            .join(" · ")
    };
    ui.add_space(6.0);
    ui.horizontal(|ui| {
        ui.add_space(8.0);
        widgets::chip_coloured(ui, &sheet.image, theme::ACCENT_SOFT, theme::TEXT);
        if let Some(first) = current.first() {
            let line = first.frame / sheet.columns.max(1);
            widgets::chip(ui, &format!("row {} · {}", line + 1, row_of(first.frame)));
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.add_space(8.0);
            widgets::hint(
                ui,
                "drag frames into the timeline, or select and press Insert",
            );
        });
    });
    let mut picked = None;
    egui::ScrollArea::both()
        .id_salt(("sheet", key))
        .show(ui, |ui| {
            ui.add_space(4.0);
            for line in 0..sheet.rows {
                ui.horizontal(|ui| {
                    ui.add_space(8.0);
                    ui.spacing_mut().item_spacing.x = 2.0;
                    for column in 0..sheet.columns {
                        let frame = line * sheet.columns + column;
                        let is_used = used.contains(&frame);
                        let is_picked = pick == Some(frame);
                        let response = ui
                            .dnd_drag_source(
                                ui.id().with(("sheet-frame", key, frame)),
                                SheetFrame(frame),
                                |ui| {
                                    let (rect, response) =
                                        ui.allocate_exact_size(Vec2::splat(CELL), Sense::click());
                                    let painter = ui.painter_at(rect);
                                    painter.rect(
                                        rect,
                                        2.0,
                                        if is_used {
                                            theme::ACCENT_SOFT
                                        } else {
                                            theme::INPUT
                                        },
                                        egui::Stroke::new(
                                            if is_picked { 2.0 } else { 1.0 },
                                            if is_picked {
                                                Color32::WHITE
                                            } else {
                                                theme::BORDER
                                            },
                                        ),
                                        egui::StrokeKind::Inside,
                                    );
                                    sheet.draw(&painter, rect.shrink(4.0), frame, Color32::WHITE);
                                    response
                                },
                            )
                            .inner;
                        if response.clicked() {
                            picked = Some(frame);
                        }
                        response.on_hover_text(format!("sheet frame {frame}"));
                    }
                    let label = row_of(line * sheet.columns);
                    if !label.is_empty() {
                        ui.add_space(8.0);
                        ui.label(theme::faint(format!("row {} · {label}", line + 1)).size(11.5));
                    }
                });
            }
        });
    if let Some(frame) = picked {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.sheet_pick = Some(frame);
    }
}
