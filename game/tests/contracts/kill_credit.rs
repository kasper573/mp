use bevy_ecs::message::MessageCursor;
use bevy_ecs::prelude::*;
use game::core::time::Seconds;
use game::systems::combat::{self, Died};
use game::systems::item;
use game::systems::movement::position;
use game::systems::npc::{self, Pack};
use game::systems::rewards::KillCredited;

use testkit::{Sim, row, spawn_area};

#[test]
fn a_reserved_kill_credits_the_reserving_player_once() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let victim = orc(&mut sim, player);
    item::reserve(sim.world(), victim, player, Seconds(0.0));
    kill(&mut sim, victim, player);

    let credits = credits(&mut sim, 3);

    assert_eq!(
        credits,
        vec![KillCredited {
            npc: row("Orc"),
            victim,
            credited: player,
        }]
    );
}

#[test]
fn an_unreserved_kill_credits_nobody() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let victim = orc(&mut sim, player);
    combat::inflict(sim.world(), victim, None, 1_000_000.0);

    assert!(credits(&mut sim, 3).is_empty());
}

#[test]
fn deaths_stay_observable_to_every_reader() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let victim = orc(&mut sim, player);
    item::reserve(sim.world(), victim, player, Seconds(0.0));
    kill(&mut sim, victim, player);
    sim.tick();

    assert!(
        sim.read_all::<Died>()
            .iter()
            .any(|died| died.entity == victim)
    );
}

fn orc(sim: &mut Sim, near: Entity) -> Entity {
    let world = sim.world();
    let at = position(world, near).expect("player position");
    npc::spawn(world, row("Orc"), at, spawn_area(), Pack(u32::MAX))
}

fn kill(sim: &mut Sim, victim: Entity, killer: Entity) {
    combat::inflict(sim.world(), victim, Some(killer), 1_000_000.0);
}

fn credits(sim: &mut Sim, ticks: usize) -> Vec<KillCredited> {
    let mut cursor = MessageCursor::<KillCredited>::default();
    let mut seen = Vec::new();
    for _ in 0..ticks {
        sim.tick();
        seen.extend(sim.read(&mut cursor));
    }
    seen
}
