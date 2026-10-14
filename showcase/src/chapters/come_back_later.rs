use driver::{finished, in_feed, on_quest};
use game::systems::input::map::InputAction;
use game::systems::quest::QuestResult;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "come-back-later",
    title: "Come back later",
    summary: "Wren's daily tithe, and an answer that knows what time it is",
    play,
};

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as("tithe_payer", None);
    let mut me = shoot.roll(player);
    me.caption("Wren takes ten bones a day, and pays in tokens");
    me.talk_to("wren");
    me.read_to_choices();
    me.pick("Bone Tithe");
    me.on_stage("tithe_offer");
    me.read_to_choices();
    me.pick("I'll bring today's bones.");
    me.wait_until("the tithe ready", |snapshot| {
        on_quest(snapshot, "bone_tithe").is_some_and(|quest| quest.ready)
    });
    me.caption_top("Ten bones already in the bag: the tithe is ready at once");

    me.talk_to("wren");
    me.read_to_choices();
    me.pick("Bone Tithe");
    me.read_to_choices();
    me.caption_top("She named her price and her pay, so the hand-in shows both");
    me.hold();
    me.pick("Here are today's bones.");
    me.on_stage("tithe_thanks");
    me.wait_until("the tithe paid", |snapshot| {
        finished(snapshot, "bone_tithe") == Some(QuestResult::Completed)
    });
    me.wait_until("the tokens in the feed", |snapshot| {
        in_feed(snapshot, "+6 Bone Token")
    });
    me.caption_top("Bones out, tokens in, and the day's tithe is done");
    me.read_to_choices();
    me.pick("Goodbye.");
    me.conversation_over();

    me.caption("Once it's done for the day, she answers a different question");
    me.talk_to("wren");
    me.read_to_choices();
    me.pick("When can I bring more bones?");
    me.on_stage("tomorrow");
    me.wait_until("her saying when", |snapshot| {
        snapshot.stage.as_ref().is_some_and(|stage| {
            !stage.typing
                && stage
                    .text
                    .as_deref()
                    .is_some_and(|text| text.contains("Come back in"))
        })
    });
    me.caption_top("She works out the time left as she says it, in the words anyone would use");
    me.read_to_choices();
    me.pick("I'll be back.");
    me.conversation_over();

    me.caption_top("History keeps what she said, exactly as she said it");
    me.act(InputAction::ToggleHistory);
    me.wait_until("the history to open", |snapshot| snapshot.history.open);
    me.open_history_tab("Talk");
    me.wait_until("her answer in the history", |snapshot| {
        snapshot
            .history
            .records
            .iter()
            .any(|record| record.text.contains("Come back in"))
    });
    me.hold();
    me.act(InputAction::Dismiss);
    me.wait_until("the history to close", |snapshot| !snapshot.history.open);
}
