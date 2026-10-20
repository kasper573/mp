use egui::Ui;

use super::{Edge, divide, panel_body, theme, widgets};
use crate::app::Editor;

/// A view's right panel: the inspector of what is selected inside it. A resizable column on the
/// right of its window.
pub fn inspector(
    editor: &mut Editor,
    ui: &mut Ui,
    id: &str,
    body: impl FnOnce(&mut Editor, &mut Ui),
) {
    column(ui, ("inspector", id), Side::Right, |ui| {
        widgets::tabs(ui, &[((), "Inspector".to_owned())], &mut ());
        scrolled(ui, |ui| body(editor, ui));
    });
}

/// What an inspector says while nothing inside its view is picked: how to pick something.
pub fn nothing_selected(ui: &mut Ui, call_to_action: &str) {
    ui.add_space(24.0);
    ui.vertical_centered(|ui| {
        ui.label(theme::muted(call_to_action).size(13.0));
    });
}

/// The row a view works on, laid out on the left of its window.
pub fn row(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    column(ui, ("row", id), Side::Left, |ui| scrolled(ui, body));
}

/// The left column of a view whose body scrolls what it must itself, such as a tree under a few
/// fixed boxes.
pub fn panel(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    column(ui, ("row", id), Side::Left, |ui| {
        egui::Frame::new()
            .inner_margin(egui::Margin::symmetric(10, 8))
            .show(ui, |ui| {
                ui.set_min_height(ui.available_height());
                body(ui)
            });
    });
}

fn scrolled(ui: &mut Ui, body: impl FnOnce(&mut Ui)) {
    egui::ScrollArea::vertical()
        .id_salt("sidebar")
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(10, 8))
                .show(ui, body);
        });
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
        .show(ui, |ui| panel_body(ui, body));
    divide(ui, column.response.rect, divider);
}
