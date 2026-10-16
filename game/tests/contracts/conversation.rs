use bevy_ecs::prelude::*;
use game::core::content::Fixture;
use game::core::tiling::{TilePos, Tiles};
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::attention::{Attention, AttentionId, AttentionMark};
use game::systems::dialogue::{Conversation, ConversationRequest};
use game::systems::movement::{MoveRequest, MoveSeq, moving, position};
use game::systems::player::commands_locked;
use game::systems::script::{self, EventKind, RiftInstances};
use game::systems::stat::{self, StatKind};

use testkit::{
    Sim, choice, content, conversation, count, counted, errors, give, place, row, spawn_area, talk,
    townsperson,
};

#[test]
fn a_conversation_reaches_the_client_as_the_world_holds_it() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);

    let opened = talk(&mut sim, 1, player, row("Grisha"));
    let wire = postcard::to_allocvec(&opened).expect("a conversation serializes");
    let received: Conversation = postcard::from_bytes(&wire).expect("a conversation deserializes");

    assert!(opened.lines.iter().any(|line| line.face.is_some()));
    assert_eq!(received, opened);
}

#[test]
fn talking_walks_into_reach_opens_the_greeting_and_locks_commands() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let grisha = townsperson(&mut sim, row("Grisha"));

    let opened = talk(&mut sim, 1, player, row("Grisha"));

    assert_eq!(opened.node, "hello");
    assert_eq!(opened.with, Some(grisha));
    // A step under way when the greeting opens still ends on its tile.
    assert!(sim.run_until(1.0, |world| !moving(world, player)));
    let at = position(sim.world(), player).expect("position");
    let grisha_at = position(sim.world(), grisha).expect("position");
    assert!(at.distance(grisha_at) <= Tiles(2.0 + std::f32::consts::SQRT_2));
    assert!(commands_locked(sim.world(), player));

    let elsewhere = sim.walkable_near(at, Tiles(4.0), Tiles(6.0));
    sim.send(
        1,
        MoveRequest {
            pos: elsewhere,
            seq: MoveSeq(1),
        },
    );
    sim.run_until(2.0, |_| false);
    let still = position(sim.world(), player).expect("position");
    assert!(still.distance(at) < Tiles(0.5));

    sim.send(1, ConversationRequest::Leave { step: opened.step });
    sim.tick();
    assert!(conversation(&mut sim, player).is_none());
    assert!(!commands_locked(sim.world(), player));
}

#[test]
fn a_pick_answers_its_step_once() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Gold"), 30);
    let opened = talk(&mut sim, 1, player, row("Grisha"));
    let round = ConversationRequest::Pick {
        step: opened.step,
        choice: choice(&opened, "Buy a round for the room."),
    };

    sim.send(1, round);
    sim.send(1, round);
    sim.tick();

    assert_eq!(count(&mut sim, player, row("Gold")), 20);
    let now = conversation(&mut sim, player).expect("still talking");
    assert_eq!(now.node, "round");
    assert_eq!(counted(&mut sim, player, row("InnFavour")), 1);

    sim.send(1, round);
    sim.tick();
    assert_eq!(count(&mut sim, player, row("Gold")), 20);
}

#[test]
fn a_choice_that_costs_too_much_changes_nothing() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let opened = talk(&mut sim, 1, player, row("Grisha"));
    let index = choice(&opened, "Buy a round for the room.");
    assert!(!opened.choices[index as usize].locked);

    sim.send(
        1,
        ConversationRequest::Pick {
            step: opened.step,
            choice: index,
        },
    );
    sim.tick();

    let now = conversation(&mut sim, player).expect("still talking");
    assert_eq!(now.node, "hello");
    assert_eq!(now.refused.map(|refused| refused.choice), Some(index));
    assert_eq!(errors(&sim, 1), vec!["Needs 10 more Gold".to_owned()]);
    assert_eq!(counted(&mut sim, player, row("InnFavour")), 0);
}

#[test]
fn walking_out_of_reach_ends_the_conversation() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    talk(&mut sim, 1, player, row("Grisha"));
    let at = position(sim.world(), player).expect("position");
    let away = sim.walkable_near(at, Tiles(6.0), Tiles(9.0));

    place(&mut sim, player, away);
    sim.tick();

    assert!(conversation(&mut sim, player).is_none());
    assert!(!commands_locked(sim.world(), player));
}

#[test]
fn damage_keeps_a_conversation_but_death_ends_it() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    talk(&mut sim, 1, player, row("Grisha"));

    stat::apply_damage(sim.world(), player, 1.0);
    sim.tick();
    assert!(conversation(&mut sim, player).is_some());

    let health = stat::effective(sim.world(), player, StatKind::Health);
    stat::apply_damage(sim.world(), player, health);
    sim.tick();
    assert!(conversation(&mut sim, player).is_none());
}

#[test]
fn a_conversation_an_npc_starts_replaces_the_one_in_progress() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let grisha = townsperson(&mut sim, row("Grisha"));
    talk(&mut sim, 1, player, row("Grisha"));

    let ilsa = townsperson(&mut sim, row("Ilsa"));
    let owner = script::owner_of(sim.world(), ilsa).expect("Ilsa runs scripts");
    sim.world().resource_mut::<RiftInstances>().raise(
        owner,
        EventKind::Interacted,
        Some(player),
        Vec::new(),
        |_| true,
    );
    sim.tick();

    let opened = conversation(&mut sim, player).expect("talking");
    assert_eq!(opened.with, Some(ilsa));
    assert_ne!(opened.with, Some(grisha));
    assert_eq!(opened.node, "hello");
}

#[test]
fn tobb_holds_his_news_until_you_are_free() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let opened = talk(&mut sim, 1, player, row("Tobb"));
    assert_eq!(opened.node, "hello");

    sim.run_until(1.0, |_| false);
    assert_eq!(
        conversation(&mut sim, player).map(|now| now.step),
        Some(opened.step)
    );
    sim.send(1, ConversationRequest::Leave { step: opened.step });
    assert!(sim.run_until(1.0, |world| {
        world
            .get::<Conversation>(player)
            .is_some_and(|now| now.step != opened.step)
    }));
    let news = conversation(&mut sim, player).expect("Tobb's news");
    assert_eq!(news.node, "news");

    sim.send(1, ConversationRequest::Leave { step: news.step });
    sim.run_until(2.0, |_| false);
    assert!(conversation(&mut sim, player).is_none());
}

#[test]
fn an_npc_shows_news_only_to_those_who_have_not_heard_him_out() {
    let mut sim = Sim::area(spawn_area());
    let regular = sim.join(1);
    let stranger = sim.join(2);
    let tobb = townsperson(&mut sim, row("Tobb"));
    for visit in 0..4 {
        sim.world().insert_resource(WallClock {
            now: UnixMillis(visit * 3_600_000),
            reset: UtcHour::MIDNIGHT,
        });
        let step = talk(&mut sim, 1, regular, row("Tobb")).step;
        sim.send(1, ConversationRequest::Leave { step });
        sim.tick();
    }
    sim.world().insert_resource(WallClock {
        now: UnixMillis(4 * 3_600_000),
        reset: UtcHour::MIDNIGHT,
    });

    let marks = |sim: &mut Sim, player: Entity| -> Vec<AttentionId> {
        sim.world()
            .get::<Attention>(player)
            .expect("attention")
            .of(tobb)
            .to_vec()
    };
    sim.run_until(0.5, |_| false);

    assert!(!marks(&mut sim, regular).contains(&AttentionMark::News.id(content())));
    assert!(marks(&mut sim, stranger).contains(&AttentionMark::News.id(content())));
}
