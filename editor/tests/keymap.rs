use editor::keymap::{EditorKey, KeyScope};
use egui::{Context, Event, Key, Modifiers, RawInput};
use strum::VariantArray;

#[test]
fn a_chord_with_more_modifiers_held_claims_its_key_alone() {
    let ctrl_shift = Modifiers::COMMAND | Modifiers::SHIFT;
    assert_eq!(pressed_by(Key::Z, ctrl_shift), vec![EditorKey::Redo]);
    assert_eq!(
        pressed_by(Key::Z, Modifiers::COMMAND),
        vec![EditorKey::Undo]
    );
    assert_eq!(
        pressed_by(Key::F5, Modifiers::SHIFT),
        vec![EditorKey::StopPlay]
    );
    assert_eq!(
        pressed_by(Key::ArrowLeft, Modifiers::ALT),
        vec![EditorKey::FrameShorter]
    );
}

#[test]
fn a_modifier_held_for_a_finer_step_keeps_the_key_it_steps_with() {
    let pressed = pressed_by(Key::ArrowLeft, Modifiers::SHIFT);
    assert_eq!(pressed, vec![EditorKey::Move]);
}

#[test]
fn every_key_is_named_and_listed_in_the_sheet_once() {
    let listed: Vec<EditorKey> = KeyScope::VARIANTS
        .iter()
        .flat_map(|scope| scope.keys())
        .collect();
    assert_eq!(listed, EditorKey::VARIANTS.to_vec());
    for key in EditorKey::VARIANTS {
        assert!(!key.name().is_empty(), "{key:?} has no name");
        assert!(!key.about().is_empty(), "{key:?} says nothing");
    }
}

fn pressed_by(key: Key, modifiers: Modifiers) -> Vec<EditorKey> {
    let ctx = Context::default();
    let input = RawInput {
        events: vec![
            Event::ModifiersChanged(modifiers),
            Event::Key {
                key,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers,
            },
        ],
        ..RawInput::default()
    };
    let mut pressed = Vec::new();
    let _ = ctx.run_ui(input, |ui| {
        pressed = EditorKey::VARIANTS
            .iter()
            .copied()
            .filter(|editor_key| ui.input(|i| editor_key.pressed(i)))
            .collect();
    });
    pressed
}
