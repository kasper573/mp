use egui::{RichText, Ui};

use super::{theme, widgets};

pub enum ReportAction {
    None,
    LoadAgain,
    Close,
}

/// A load report as the start screen and the broken-folder overlay show it: a titled box of the
/// report text, coloured by line, with Copy, Save, Load again and (optionally) Close under it.
pub fn panel(ui: &mut Ui, folder: &str, text: &str, closable: bool) -> ReportAction {
    let mut action = ReportAction::None;
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(6.0)
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(12, 6))
                .show(ui, |ui| {
                    ui.label(
                        theme::muted(format!("load report · {folder}"))
                            .monospace()
                            .size(12.5),
                    );
                });
            ui.separator();
            egui::ScrollArea::vertical()
                .max_height(ui.available_height() - 60.0)
                .show(ui, |ui| {
                    egui::Frame::new()
                        .inner_margin(egui::Margin::symmetric(12, 8))
                        .show(ui, |ui| {
                            ui.spacing_mut().item_spacing.y = 2.0;
                            for line in text.lines() {
                                ui.label(coloured(line));
                            }
                        });
                });
        });
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        if widgets::primary(ui, "Copy report").clicked() {
            ui.ctx().copy_text(text.to_owned());
        }
        if ui.button("Save to file…").clicked()
            && let Some(path) = rfd::FileDialog::new()
                .set_file_name("load-report.txt")
                .save_file()
        {
            let _ = std::fs::write(path, text);
        }
        if ui.button("⟳ Load again").clicked() {
            action = ReportAction::LoadAgain;
        }
        if closable && ui.button("Close").clicked() {
            action = ReportAction::Close;
        }
    });
    action
}

fn coloured(line: &str) -> RichText {
    let text = RichText::new(line).monospace().size(13.0);
    if line.starts_with('#') {
        text.color(theme::WARN)
    } else if line.starts_with("result") {
        text.color(theme::DANGER)
    } else if line.starts_with("tables/")
        || line.starts_with("assets/")
        || line.starts_with("game.json")
    {
        text.color(theme::CODE)
    } else if line.starts_with("  ") {
        text.color(theme::TEXT)
    } else {
        text.color(theme::MUTED)
    }
}
