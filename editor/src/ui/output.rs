use egui::{Align, Layout, RichText, Ui};

use super::theme;
use crate::app::Editor;

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    ui.horizontal(|ui| {
        ui.label(theme::faint(format!("{} lines", editor.output.lines.len())).size(12.0));
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.small_button("Clear").clicked() {
                editor.output.lines.clear();
            }
            if ui.small_button("Save to file…").clicked() {
                crate::play::save_output(editor);
            }
            if ui.small_button("Copy").clicked() {
                let text = editor.output.text();
                ui.ctx().copy_text(text);
            }
        });
    });
    let lines = &editor.output.lines;
    egui::ScrollArea::both()
        .stick_to_bottom(true)
        .show_rows(ui, ROW, lines.len(), |ui, rows| {
            for line in &lines[rows] {
                let bad = alarming(&line.text);
                ui.horizontal(|ui| {
                    ui.set_height(ROW);
                    ui.add_sized(
                        egui::vec2(104.0, ROW),
                        egui::Label::new(
                            RichText::new(format!("{}:", line.tag))
                                .monospace()
                                .size(12.5)
                                .color(if bad { theme::DANGER } else { theme::MUTED }),
                        ),
                    );
                    ui.add(
                        egui::Label::new(
                            RichText::new(&line.text)
                                .monospace()
                                .size(12.5)
                                .color(if bad { theme::DANGER } else { theme::TEXT }),
                        )
                        .extend()
                        .selectable(true),
                    );
                });
            }
        });
}

const ROW: f32 = 18.0;

fn alarming(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("error")
        || lower.contains("panicked")
        || lower.contains("refused")
        || lower.contains("failed")
        || lower.contains("stopped:")
        || (lower.contains("exited with code")
            && !lower.ends_with("code 0)")
            && !lower.ends_with("code 0"))
}
