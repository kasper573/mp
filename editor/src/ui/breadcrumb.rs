use egui::{RichText, Sense, Ui};
use engine::core::content::{ContentOwners, RowName};

use super::theme;
use crate::keymap::EditorKey;

/// A row's name behind every owner it is local to, from the top owner down; a global row's is just
/// its name. Answers the owner clicked.
pub fn show(ui: &mut Ui, owners: &ContentOwners, table: &str, key: &str) -> Option<RowName> {
    let mut chain: Vec<RowName> = owners.chain(table, key).cloned().collect();
    chain.reverse();
    let mut clicked = None;
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        for owner in chain {
            let response = ui
                .add(
                    egui::Label::new(
                        RichText::new(owner.to_string())
                            .monospace()
                            .underline()
                            .color(theme::CODE),
                    )
                    .sense(Sense::click()),
                )
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .on_hover_text(format!("{} opens the owner", EditorKey::OpenOwner.name()));
            if response.clicked() {
                clicked = Some(owner);
            }
            ui.label(theme::faint("›"));
        }
        ui.label(theme::strong(format!("{table}/{key}")).monospace());
    });
    clicked
}

/// The prefix a tab of a local row carries: its owner's key.
pub fn tab_prefix(owners: &ContentOwners, table: &str, key: &str) -> Option<String> {
    owners
        .owner(table, key)
        .map(|owner| format!("{} › ", owner.key))
}
