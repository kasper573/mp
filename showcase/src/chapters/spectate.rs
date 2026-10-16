use driver::{Player, beside_resident, content, noticed, on_quest};
use engine::core::math::Offset;
use engine::systems::input::map::InputAction;
use engine::systems::probe::ProbeSnapshot;
use engine::systems::spectate::Spectating;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "spectate",
    title: "Spectate",
    summary: "Follow any player live, wherever they are",
    play,
};

fn play(shoot: &mut Shoot) {
    let mut islander = shoot.join_fresh();
    let mut explorer = shoot.join_as(
        "pass_holder",
        Some(beside_resident("bloomvale", "farmer_girl")),
    );
    let spectator = shoot.join_spectator();
    let mut me = shoot.roll(spectator);
    let islander_name = name_of(&mut islander);
    let explorer_name = name_of(&mut explorer);

    me.caption("Spectators choose between playing and watching");
    me.hold();
    me.click_ui("Spectate");
    switch_to(&mut me, &islander_name);
    me.caption("A spectator always follows a player, and sees what they see");
    islander.walk_by(Offset::new(3.0, 1.0));
    islander.walk_by(Offset::new(-2.0, 2.0));
    me.caption("That includes their conversations, read along without a way to answer");
    islander.talk_to("tobb");
    me.on_stage("hello");
    islander.read_to_choices();
    islander.pick("A Letter for the Captain");
    me.on_stage("letter_offer");
    me.caption_top("The quest panel and the choices show, but only the player picks");
    islander.read_to_choices();
    me.hold();
    islander.pick("I'll take it.");
    me.wait_until("the quest on the watched tracker", |snapshot| {
        on_quest(snapshot, "letter_for_the_captain").is_some()
    });
    me.caption_top("Their quest tracker follows along, and so does their feed in the corner");
    me.wait_until("the quest in the watched feed", |snapshot| {
        noticed(snapshot, "Quest accepted · A Letter for the Captain")
    });
    me.caption_top("H opens their history, and says whose it is");
    me.act(InputAction::ToggleHistory);
    me.wait_until("the watched player's history", |snapshot| {
        snapshot.history.open
            && snapshot
                .history
                .records
                .iter()
                .any(|record| record.text.contains("A Letter for the Captain"))
    });
    me.hold();
    me.act(InputAction::ToggleHistory);
    me.wait_until("the history to close", |snapshot| !snapshot.history.open);

    me.caption("So do their shops, with every button off");
    islander.talk_to("mara");
    islander.read_to_choices();
    islander.pick("Show me your wares.");
    me.wait_until("the watched shop", |snapshot| {
        snapshot
            .shop
            .as_ref()
            .is_some_and(|shop| shop.shop.key(content()) == "mara_wares")
    });
    me.hold();
    islander.act(InputAction::Dismiss);
    me.wait_until("the watched shop to close", |snapshot| {
        snapshot.shop.is_none()
    });
    islander.act(InputAction::Dismiss);
    me.wait_until("the watched conversation to end", |snapshot| {
        snapshot.stage.is_none()
    });

    me.caption("The arrow keys switch to the next player…");
    switch_to(&mut me, &explorer_name);
    me.caption("…wherever in the world they are");
    explorer.walk_by(Offset::new(2.0, 2.0));
    explorer.walk_by(Offset::new(-3.0, 1.0));
    me.caption("The buttons on the spectator panel switch too");
    me.click_ui("<");
    watching(&mut me, &islander_name);
    me.caption("When the watched player leaves, the spectator moves on to the next");
    drop(islander);
    watching(&mut me, &explorer_name);
    me.caption("And with nobody playing, there is nothing to watch");
    drop(explorer);
    me.find_ui("Nobody is playing right now");
    me.caption("…until someone joins, whom the spectator then follows");
    let mut newcomer = shoot.join_fresh();
    let newcomer_name = name_of(&mut newcomer);
    watching(&mut me, &newcomer_name);
    newcomer.walk_by(Offset::new(-3.0, 1.0));
}

fn name_of(player: &mut Player) -> String {
    player.snapshot().me.expect("a player in the world").name
}

// The spectator steps through everyone online in turn, so one full turn reaches each of them.
fn switch_to(me: &mut Player, name: &str) {
    let online = me.wait_for(
        "the spectator to follow someone",
        |snapshot| match snapshot.spectating {
            Some(Spectating::Player(watched)) => Some(watched.online),
            _ => None,
        },
    );
    for _ in 0..online {
        let before = me.wait_for("the spectator to watch someone", watched_name);
        if before == name {
            return;
        }
        me.act(InputAction::SpectateNext);
        me.wait_until("the spectator to switch", |snapshot| {
            watched_name(snapshot).is_some_and(|now| now != before)
        });
    }
    panic!("never got to watch {name}");
}

fn watched_name(snapshot: &ProbeSnapshot) -> Option<String> {
    snapshot.viewpoint.as_ref().map(|body| body.name.clone())
}

fn watching(me: &mut Player, name: &str) {
    me.wait_until(&format!("the spectator to watch {name}"), |snapshot| {
        snapshot
            .viewpoint
            .as_ref()
            .is_some_and(|body| body.name == name)
    });
}
