use driver::{UiTarget, erred, noticed, open_ground_beside};
use engine::systems::input::gestures::ClickClaim;
use engine::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "conversation",
    title: "Conversation",
    summary: "Talk to the townsfolk: busts, choices, prices, refusals, history",
    play,
};

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as("talker", None);
    let mut me = shoot.roll(player);
    me.caption("Click a townsperson to talk — you walk into reach and the conversation opens");
    me.talk_to("tobb");
    me.caption("Busts show who is speaking. Space, Enter or a click reads on");
    let stage = me.read_to_choices();
    me.caption_top("No buttons on the frame: Esc leaves, and the choices say the rest");
    me.caption_top("A choice shows its words and nothing more, unless the writer reveals more");
    me.caption_top("↑ ↓ choose and Enter picks, and a pointer at rest never takes the choice back");
    me.hover_choice(&stage.choices[0].label);
    let catch = stage
        .choices
        .iter()
        .position(|choice| choice.label == "Caught anything good today?")
        .expect("the catch choice");
    for _ in 0..=catch {
        me.act(InputAction::ChooseNext);
    }
    me.act(InputAction::ChoosePrevious);
    me.act(InputAction::PickChoice);
    me.on_stage("catch");
    me.read_to_choices();
    me.caption_top("…or click a choice");
    me.pick("Good luck out there.");
    me.on_stage("news");
    me.caption_top("Tobb held his news while you talked — once you're free, he calls you over");
    me.read_to_choices();
    me.act(InputAction::Choice1);
    me.conversation_over();

    me.caption_top(
        "While you talk, the map ignores the mouse: a plain pointer, and clicks do nothing",
    );
    me.talk_to("grisha");
    me.come_to_rest();
    let off_stage = *open_ground_beside(&me.snapshot())
        .first()
        .expect("open ground in view beside the conversation");
    let pointed = me.point_at_tile(off_stage);
    assert_eq!(pointed.claim, ClickClaim::Locked);
    me.click();
    me.read_to_choices();
    me.caption_top(
        "Over the conversation the cursor is its own: an arrow on the words, a hand on the choices",
    );
    me.hover_ui(UiTarget::containing("Driftwood Inn"));
    me.hover_choice("Chat.");
    me.point_at_tile(off_stage);
    me.caption_top("Choices branch into a tree: Chat opens a menu of its own");
    for (pick, next) in [("Chat.", "chat"), ("Tell me about this island.", "island")] {
        me.pick(pick);
        me.on_stage(next);
        me.read_to_choices();
    }
    me.caption_top("Ok leads back up to the chat menu");
    for (pick, next) in [("Ok.", "chat"), ("Any rumours?", "rumour_wren")] {
        me.pick(pick);
        me.on_stage(next);
        me.read_to_choices();
    }
    me.caption_top("…and a branch can go deeper still");
    for (pick, next) in [
        ("What does she do with them?", "wren_secret"),
        ("Ok.", "chat"),
    ] {
        me.pick(pick);
        me.on_stage(next);
        me.read_to_choices();
    }
    me.caption_top("Never mind goes back to the top");
    me.pick("Never mind.");
    me.on_stage("anything_else");
    me.read_to_choices();
    me.caption_top("An inn has its prices on the wall: Grisha's menu shows what each choice costs");
    me.hover_choice("Buy a round for the room.");
    me.hold();
    me.pick("Buy a round for the room.");
    me.on_stage("round");
    me.wait_until("the round's price in the feed", |snapshot| {
        noticed(snapshot, "−10 Gold")
    });
    me.caption_top("What it took drops in as slips at the top");
    me.read_to_choices();
    me.caption_top(
        "Can't afford it? Pick it anyway: it turns rubric, an error says why, and you can pick again",
    );
    me.act(InputAction::Choice1);
    me.wait_until("the refused pick to say why", |snapshot| {
        erred(snapshot, "Needs")
    });
    me.caption_top(
        "History is a window like any other: H opens it here too, over the conversation",
    );
    me.act(InputAction::ToggleHistory);
    me.wait_until("the history to open", |snapshot| snapshot.history.open);
    me.caption_top("Esc closes the history, then leaves the conversation");
    me.act(InputAction::Dismiss);
    me.wait_until("the history to close", |snapshot| !snapshot.history.open);
    me.act(InputAction::Dismiss);
    me.conversation_over();

    me.caption("Things on the map can start conversations too — a chest washed up by the tide");
    me.interact_with("tide-chest");
    me.read_to_choices();
    me.pick("Close the lid.");
    me.conversation_over();
}
