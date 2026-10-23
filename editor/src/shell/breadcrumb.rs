use ui::egui;
use ui::egui::{RichText, Sense, Ui};
use ui::theme;

use crate::tabs::file_title;

/// A content file's path: each folder above it, then its name. Answers the folder clicked.
pub fn show(ui: &mut Ui, path: &str) -> Option<String> {
    let mut clicked = None;
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        let mut folder = String::new();
        for segment in path
            .split('/')
            .collect::<Vec<_>>()
            .split_last()
            .map_or(&[][..], |(_, above)| above)
        {
            if !folder.is_empty() {
                folder.push('/');
            }
            folder.push_str(segment);
            let response = ui
                .add(
                    egui::Label::new(RichText::new(*segment).monospace().color(theme::MUTED))
                        .sense(Sense::click()),
                )
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .on_hover_text("Show in the content tree");
            if response.clicked() {
                clicked = Some(folder.clone());
            }
            ui.label(theme::faint("/"));
        }
        ui.label(theme::strong(file_title(path)).monospace());
    });
    clicked
}
