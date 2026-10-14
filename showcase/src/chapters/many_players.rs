use driver::{Player, holding, marked, nearest_npc, npc_is, told_by, townsperson};
use game::core::math::Offset;
use game::systems::attention::AttentionMark;
use game::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::{Shoot, Star};

pub const CHAPTER: Chapter = Chapter {
    name: "many-players",
    title: "Many players",
    summary: "One island, a world each: what you see of a townsperson is yours alone",
    play,
};

fn play(shoot: &mut Shoot) {
    let mut me = shoot.join_as("well_off", None);
    let mut other = shoot.join_as("on_maras_errand", None);
    stand_below(&mut other, "mara", 1.0);
    stand_below(&mut me, "mara", -1.0);
    let name = other.snapshot().me.expect("the other player").name;
    let mut me = shoot.roll(me);
    me.inset(other, &format!("{name}'s screen"), |me, other| {
        at_the_stall(me, other, &name)
    });
}

fn at_the_stall(me: &mut Star, other: &mut Player, name: &str) {
    me.caption("Two players at Mara's stall. On your screen she has a quest for you: !");
    me.wait_until("! over Mara", |snapshot| {
        marked(snapshot, "mara", AttentionMark::QuestOffered)
    });
    me.caption(&format!(
        "On {name}'s, top left, she shows a ?: they're halfway through it"
    ));
    other.wait_until("? over Mara", |snapshot| {
        marked(snapshot, "mara", AttentionMark::QuestInProgress)
    });

    me.caption("You both talk to her at once, each in a conversation of your own");
    me.talk_to("mara");
    other.talk_to("mara");
    me.read_to_choices();
    other.read_to_choices();
    me.caption_top("What she offers comes from each player's own quest log");
    me.hold();
    for player in [&mut **me, other] {
        player.act(InputAction::Dismiss);
        player.conversation_over();
    }

    me.caption("Pell runs a dice table");
    stand_below(other, "pell", 2.0);
    me.talk_to("pell");
    me.read_to_choices();
    lose_at_dice(me);
    me.caption_top("Losing again? Call him out — he won't take it quietly");
    me.hover_choice("You're cheating.");
    me.hold();
    me.pick("You're cheating.");
    me.conversation_over();
    me.wait_until("Pell to shout", |snapshot| told_by(snapshot, "Pell"));
    me.caption(&format!(
        "Pell shouts for the guards over his head — for you alone. {name} sees none of them"
    ));
    fight_off(me, "harbour_guard");

    me.caption("Pell holds a grudge now, and settles it himself");
    me.talk_to("pell");
    me.on_stage("grudging");
    me.read_to_choices();
    me.hover_choice("Then let's settle this.");
    me.hold();
    me.pick("Then let's settle this.");
    me.conversation_over();
    me.caption(&format!(
        "His table is empty for you while his copy fights you. On {name}'s screen, Pell never left"
    ));
    fight_off(me, "pell_hostile");
    me.caption(&format!(
        "Pell is dead in your world for half an hour, and alive in {name}'s"
    ));
    me.hold();
}

// Clear of whoever stands there, so the click walks rather than talks.
fn stand_below(player: &mut Player, npc: &str, across: f32) {
    player.walk_toward(|snapshot| {
        townsperson(snapshot, npc).map(|body| body.at + Offset::new(across, 2.5))
    });
}

// Rolls until Pell wins one.
fn lose_at_dice(me: &mut Star) {
    for _ in 0..20 {
        let before = me.snapshot();
        let stage = before.stage.as_ref().expect("the dice table");
        if stage.node == "wins" {
            return;
        }
        let gold = holding(&before, "gold");
        me.pick(if stage.node == "hello" {
            "Roll the dice."
        } else {
            "Roll again."
        });
        let landed = me.wait_for("the dice to land", |snapshot| {
            snapshot
                .stage
                .clone()
                .filter(|stage| holding(snapshot, "gold") != gold && !stage.typing)
        });
        if landed.node == "loses" {
            me.caption_top("A win pays twenty. Again!");
        }
        me.read_to_choices();
    }
    panic!("Pell never won a roll");
}

// Waits for them to come, then fights until none is left standing.
fn fight_off(me: &mut Star, npc: &str) {
    me.wait_for(&format!("a {npc}"), |snapshot| {
        nearest_npc(snapshot, npc).cloned()
    });
    me.fight(
        |_, body| npc_is(body, npc),
        |snapshot| nearest_npc(snapshot, npc).is_none(),
    );
}
