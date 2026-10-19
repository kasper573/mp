use egui::Ui;

use super::{Edge, divide, panel_body};

/// A view's inspector of what is selected inside it: a resizable column on the right of its
/// window, scrolled as a whole.
pub fn inspector(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    column(ui, ("inspector", id), Side::Right, body);
}

/// The row a view works on, laid out on the left of its window.
pub fn row(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    column(ui, ("row", id), Side::Left, body);
}

enum Side {
    Left,
    Right,
}

fn column(ui: &mut Ui, id: (&str, &str), side: Side, body: impl FnOnce(&mut Ui)) {
    let id = egui::Id::new(("sidebar", id));
    let (panel, divider) = match side {
        Side::Left => (egui::Panel::left(id), Edge::Right),
        Side::Right => (egui::Panel::right(id), Edge::Left),
    };
    let column = panel
        .resizable(true)
        .default_size(360.0)
        .size_range(260.0..=720.0)
        .show_separator_line(false)
        .frame(egui::Frame::new())
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
    divide(ui, column.response.rect, divider);
}
