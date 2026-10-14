use driver::{Player, UiTarget};
use game::core::math::Offset;
use game::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "chat",
    title: "Chat",
    summary: "Meet other players and talk in the terminal",
    play,
};

fn play(shoot: &mut Shoot) {
    let player = shoot.join_fresh();
    let mut me = shoot.roll(player);
    me.caption("Other players share the world in real time…");
    let mut friend = shoot.join_fresh();
    me.caption("…like this one, who just signed in");
    let name = friend.snapshot().me.expect("the friend").name;
    friend.walk_by(Offset::new(-3.0, -1.0));
    me.caption("Every player's name floats over their head");
    me.find_ui(name.as_str());
    me.caption("Press C for the terminal, where everyone can chat: type, and Enter sends");
    say(&mut me, "hello! anyone around?");
    say(&mut friend, "hi! let's go hunt some orcs");
    me.find_ui(UiTarget::containing("let's go hunt some orcs"));
    me.caption("It also takes commands — /commands lists them");
    me.act(InputAction::ToggleTerminal);
    submit(&mut me, "/commands");
}

// Esc hands the keys back to the game, so the C that follows closes the terminal.
fn say(player: &mut Player, text: &str) {
    player.act(InputAction::ToggleTerminal);
    submit(player, text);
    player.act(InputAction::Dismiss);
    player.wait_until("the field to let go of the keys", |snapshot| {
        typing_field().find(snapshot).is_none()
    });
    player.act(InputAction::ToggleTerminal);
    player.wait_until("the terminal to close", |snapshot| {
        text_field().find(snapshot).is_none()
    });
}

// Keys typed before the field holds focus, or a submit sent before every key has landed, would be
// lost: each step waits for the game to catch up.
fn submit(player: &mut Player, text: &str) {
    player.find_ui(typing_field());
    let field = text_field();
    player.type_text(text, |snapshot| {
        field
            .find(snapshot)
            .is_some_and(|field| field.text.as_deref() == Some(text))
    });
    player.act(InputAction::SubmitText);
    player.wait_until("the line to be sent", |snapshot| {
        typing_field()
            .find(snapshot)
            .is_some_and(|field| field.text.is_none())
    });
}

fn text_field() -> UiTarget {
    UiTarget::new("the text field", |element, _| element.editable)
}

fn typing_field() -> UiTarget {
    text_field().and("with focus", |element, _| element.focused)
}
