use ui::egui;
use ui::egui::Ui;
use ui::panel::{self, Side};
use ui::sheet;

use crate::app::Editor;

/// A view's right panel: the inspector of what is selected inside it. A resizable column on the
/// right of its window.
pub fn inspector(
    editor: &mut Editor,
    ui: &mut Ui,
    id: &str,
    body: impl FnOnce(&mut Editor, &mut Ui),
) {
    panel::column(ui, ("inspector", id), Side::Right, |ui| {
        sheet::tabs(ui, &[((), "Inspector".to_owned())], &mut ());
        panel::scrolled(ui, |ui| body(editor, ui));
    });
}

/// The row a view works on, laid out on the left of its window.
pub fn row(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    panel::column(ui, ("row", id), Side::Left, |ui| panel::scrolled(ui, body));
}

/// The left column of a view whose body scrolls what it must itself, such as a tree under a few
/// fixed boxes.
pub fn panel(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    panel::column(ui, ("row", id), Side::Left, |ui| {
        egui::Frame::new()
            .inner_margin(panel::PADDING)
            .show(ui, |ui| {
                ui.set_min_height(ui.available_height());
                body(ui)
            });
    });
}
