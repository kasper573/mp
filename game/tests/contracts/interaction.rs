use bevy_ecs::prelude::*;
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::dialogue::{Conversation, ConversationRequest};
use game::systems::interact::InteractRequest;
use game::systems::item::Inventory;
use game::systems::player::commands_locked;

use crate::support::{Sim, object, row, spawn_area};

const DAY: u64 = 24 * 3_600_000;

fn interact(sim: &mut Sim, client: u32, player: Entity, target: Entity) -> Conversation {
    sim.send(client, InteractRequest { target });
    assert!(
        sim.run_until(20.0, |world| world.get::<Conversation>(player).is_some()),
        "interacting never opened a conversation"
    );
    sim.world()
        .get::<Conversation>(player)
        .cloned()
        .expect("open")
}

fn leave(sim: &mut Sim, client: u32, player: Entity) {
    let step = sim
        .world()
        .get::<Conversation>(player)
        .expect("talking")
        .step;
    sim.send(client, ConversationRequest::Leave { step });
    sim.tick();
    assert!(sim.world().get::<Conversation>(player).is_none());
}

fn gold(sim: &mut Sim, player: Entity) -> u32 {
    sim.world()
        .get::<Inventory>(player)
        .expect("bag")
        .count(row("Gold"))
}

#[test]
fn reading_a_map_object_opens_its_conversation_with_the_object() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let board = object(&mut sim, "notice-board");

    let opened = interact(&mut sim, 1, player, board);

    assert_eq!(opened.node, "read");
    assert_eq!(opened.with, Some(board));
    assert!(commands_locked(sim.world(), player));
}

#[test]
fn a_chest_gives_its_gold_once_a_day() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let chest = object(&mut sim, "tide-chest");
    let before = gold(&mut sim, player);

    let found = interact(&mut sim, 1, player, chest);
    assert_eq!(found.node, "map");
    assert_eq!(gold(&mut sim, player), before + 5);
    leave(&mut sim, 1, player);

    let empty = interact(&mut sim, 1, player, chest);
    assert_eq!(empty.node, "empty");
    assert_eq!(gold(&mut sim, player), before + 5);
    leave(&mut sim, 1, player);

    sim.world().insert_resource(WallClock {
        now: UnixMillis(DAY),
        reset: UtcHour::MIDNIGHT,
    });
    let refilled = interact(&mut sim, 1, player, chest);
    assert_eq!(refilled.node, "found");
    assert_eq!(gold(&mut sim, player), before + 10);
}

#[test]
fn two_players_open_the_same_chest_for_themselves() {
    let mut sim = Sim::area(spawn_area());
    let first = sim.join(1);
    let second = sim.join(2);
    let chest = object(&mut sim, "tide-chest");
    let before = [gold(&mut sim, first), gold(&mut sim, second)];

    sim.send(1, InteractRequest { target: chest });
    sim.send(2, InteractRequest { target: chest });
    assert!(sim.run_until(20.0, |world| {
        world.get::<Conversation>(first).is_some() && world.get::<Conversation>(second).is_some()
    }));

    for (player, before) in [first, second].into_iter().zip(before) {
        let opened = sim
            .world()
            .get::<Conversation>(player)
            .cloned()
            .expect("open");
        assert_eq!(opened.node, "map");
        assert_eq!(gold(&mut sim, player), before + 5);
    }
}
