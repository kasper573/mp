use engine::core::time::{UnixMillis, UtcHour, WallClock};
use engine::systems::dialogue::Conversation;
use engine::systems::interact::InteractRequest;
use engine::systems::player::commands_locked;

use testkit::{Sim, conversation, count, leave, object, open_with, row, spawn_area};

const DAY: u64 = 24 * 3_600_000;

#[test]
fn reading_a_map_object_opens_its_conversation_with_the_object() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let board = object(&mut sim, "notice-board");

    let opened = open_with(&mut sim, 1, player, board);

    assert_eq!(opened.node, "read");
    assert_eq!(opened.with, Some(board));
    assert!(commands_locked(sim.world(), player));
}

#[test]
fn a_chest_gives_its_gold_once_a_day() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let chest = object(&mut sim, "tide-chest");
    let before = count(&mut sim, player, row("Gold"));

    let found = open_with(&mut sim, 1, player, chest);
    assert_eq!(found.node, "map");
    assert_eq!(count(&mut sim, player, row("Gold")), before + 5);
    leave(&mut sim, 1, player);

    let empty = open_with(&mut sim, 1, player, chest);
    assert_eq!(empty.node, "empty");
    assert_eq!(count(&mut sim, player, row("Gold")), before + 5);
    leave(&mut sim, 1, player);

    sim.world().insert_resource(WallClock {
        now: UnixMillis(DAY),
        reset: UtcHour::MIDNIGHT,
    });
    let refilled = open_with(&mut sim, 1, player, chest);
    assert_eq!(refilled.node, "found");
    assert_eq!(count(&mut sim, player, row("Gold")), before + 10);
}

#[test]
fn two_players_open_the_same_chest_for_themselves() {
    let mut sim = Sim::area(spawn_area());
    let first = sim.join(1);
    let second = sim.join(2);
    let chest = object(&mut sim, "tide-chest");
    let before = [
        count(&mut sim, first, row("Gold")),
        count(&mut sim, second, row("Gold")),
    ];

    sim.send(1, InteractRequest { target: chest });
    sim.send(2, InteractRequest { target: chest });
    assert!(sim.run_until(20.0, |world| {
        world.get::<Conversation>(first).is_some() && world.get::<Conversation>(second).is_some()
    }));

    for (player, before) in [first, second].into_iter().zip(before) {
        let opened = conversation(&mut sim, player).expect("open");
        assert_eq!(opened.node, "map");
        assert_eq!(count(&mut sim, player, row("Gold")), before + 5);
    }
}
