use driver::{Player, UiTarget, on_quest, told_by};
use game::core::tiling::Tiles;
use game::systems::history::HistoryMark;
use game::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "history",
    title: "History",
    summary: "Everything said, shown and gained, kept in one place",
    play,
};

const HISTORY: &str = "icons/misc/book_3.png";

const TABS: [(&str, &str); 4] = [
    (
        "Talk",
        "Tabs filter by what a record is about: what was said…",
    ),
    ("Quests", "…quests…"),
    ("Items", "…what came and went…"),
    (
        "Notifications",
        "…and every notification, whether or not you were looking",
    ),
];

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as("pass_holder", None);
    let mut me = shoot.roll(player);
    me.caption(
        "Everything you say, see and get is kept: a talk with Tobb, the gulls out on the pier…",
    );
    me.talk_to("tobb");
    me.read_to_choices();
    me.pick("A Letter for the Captain");
    me.on_stage("letter_offer");
    me.read_to_choices();
    me.pick("I'll take it.");
    me.wait_until("the letter quest", |snapshot| {
        on_quest(snapshot, "letter_for_the_captain").is_some()
    });
    leave_tobb(&mut me);

    me.walk_into("ferry-pier", Tiles(1.0));
    me.wait_until("the gulls to squabble", |snapshot| {
        told_by(snapshot, "Gulls")
    });

    me.caption("History has its own slot in the toolbar, or press H");
    me.hover_ui(UiTarget::image(HISTORY));
    me.hold();
    me.click_ui(UiTarget::image(HISTORY));
    me.wait_until("the history to open", |snapshot| snapshot.history.open);
    me.caption_top("All of it, in order: conversations grouped, what you heard, what you gained");
    for (tab, says) in TABS {
        me.caption_top(says);
        me.open_history_tab(tab);
    }
    me.hold();
    me.open_history_tab("All");
    me.act(InputAction::Dismiss);
    me.wait_until("the history to close", |snapshot| !snapshot.history.open);

    me.caption("History stays with your character, across the strait too");
    me.cross("forest-road");
    me.wait_until("the forest's intro", |snapshot| {
        told_by(snapshot, "The forest")
    });
    me.act(InputAction::ToggleHistory);
    me.wait_until("the crossing marked in the history", |snapshot| {
        snapshot.history.open
            && snapshot
                .history
                .records
                .iter()
                .any(|record| record.mark == Some(HistoryMark::Arrived))
    });
    me.caption_top("Changing area adds a divider, so you can tell where things happened");
    me.hold();
    me.act(InputAction::ToggleHistory);
    me.wait_until("the history to close", |snapshot| !snapshot.history.open);
}

// Accepting leads on to a last word, and Tobb may follow it with news he held while you talked:
// each answered with its first choice.
fn leave_tobb(me: &mut Player) {
    for _ in 0..3 {
        let Some(before) = me.snapshot().stage else {
            return;
        };
        me.read_to_choices();
        me.act(InputAction::Choice1);
        me.wait_until("the conversation to move on", |snapshot| {
            snapshot
                .stage
                .as_ref()
                .is_none_or(|now| now.node != before.node)
        });
    }
    me.conversation_over();
}
