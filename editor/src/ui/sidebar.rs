use egui::Ui;

use super::{panel_body, theme};

/// A view's own inspector: a resizable column on the right of its window, scrolled as a whole.
pub fn right(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    egui::Panel::right(egui::Id::new(("sidebar", id)))
        .resizable(true)
        .default_size(360.0)
        .size_range(260.0..=720.0)
        .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(0.0))
        .show(ui, |ui| {
            panel_body(ui, |ui| {
                egui::ScrollArea::vertical()
                    .id_salt("sidebar")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        egui::Frame::new()
                            .inner_margin(egui::Margin::symmetric(10, 8))
                            .show(ui, body);
                    });
            });
        });
}
