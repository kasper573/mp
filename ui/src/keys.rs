use egui::{InputState, Key, KeyboardShortcut, Modifiers};

/// Takes what's typed or picked.
pub const CONFIRM: KeyboardShortcut = KeyboardShortcut::new(Modifiers::NONE, Key::Enter);
/// Leaves without taking it.
pub const CANCEL: KeyboardShortcut = KeyboardShortcut::new(Modifiers::NONE, Key::Escape);

pub fn pressed(input: &InputState, key: KeyboardShortcut) -> bool {
    input.key_pressed(key.logical_key) && input.modifiers.matches_exact(key.modifiers)
}

/// The text pasted this frame. A host may hand a paste over as `Paste`, or, as bevy_egui does on
/// desktops, as the clipboard's text typed in the frame the paste shortcut is pressed.
pub fn pasted(input: &InputState) -> Option<String> {
    let shortcut = input.events.iter().any(|event| {
        matches!(
            event,
            egui::Event::Key { key: Key::V, pressed: true, modifiers, .. } if modifiers.command
        )
    });
    input.events.iter().find_map(|event| match event {
        egui::Event::Paste(text) => Some(text.clone()),
        egui::Event::Text(text) if shortcut => Some(text.clone()),
        _ => None,
    })
}
