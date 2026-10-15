use driver::UiTarget;
use game::systems::input::map::InputAction;

use crate::playtest;

#[test]
fn the_terminal_works_from_the_keyboard_alone() {
    let mut playtest = playtest();
    let mut player = playtest.join_fresh();
    player.act(InputAction::ToggleTerminal);
    let field = player.find_ui(UiTarget::typing_field());
    assert_eq!(
        field.text, None,
        "the key that opened the terminal was typed into it"
    );
    player.type_text("hello there", |snapshot| {
        UiTarget::text_field()
            .find(snapshot)
            .is_some_and(|field| field.text.as_deref() == Some("hello there"))
    });
    player.act(InputAction::SubmitText);
    player.wait_until(
        "the line in the log, and the field ready for the next",
        |snapshot| {
            sent("hello there").find(snapshot).is_some()
                && UiTarget::typing_field()
                    .find(snapshot)
                    .is_some_and(|field| field.text.is_none())
        },
    );
    player.act(InputAction::Dismiss);
    player.wait_until("the field to let go of the keys", |snapshot| {
        UiTarget::text_field().find(snapshot).is_some()
            && UiTarget::typing_field().find(snapshot).is_none()
    });
    player.act(InputAction::ToggleTerminal);
    player.wait_until("the terminal to close", |snapshot| {
        UiTarget::text_field().find(snapshot).is_none()
    });
}

fn sent(line: &str) -> UiTarget {
    UiTarget::containing(line).and("in the log", |element, _| !element.editable)
}
