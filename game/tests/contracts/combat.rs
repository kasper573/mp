use game::core::tiling::Tiles;
use game::systems::combat::AttackRequest;
use game::systems::movement::position;
use game::systems::npc::{self, Pack};
use game::systems::stat::{self, StatKind};

use testkit::{Sim, row, spawn_area};

#[test]
fn an_attack_walks_into_range_and_strikes() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let start = position(sim.world(), player).expect("position");
    let spot = sim.walkable_near(start, Tiles(3.0), Tiles(5.0));
    let orc = npc::spawn(sim.world(), row("Orc"), spot, spawn_area(), Pack(u32::MAX));
    sim.tick();
    let full = stat::effective(sim.world(), orc, StatKind::Health);

    sim.send(1, AttackRequest { target: orc });

    assert!(
        sim.run_until(10.0, |world| stat::effective(world, orc, StatKind::Health)
            < full)
    );
}

// Right beside the player, so the fight stays where it starts: a chase could run into anything.
#[test]
fn an_attacked_monster_is_fought_until_it_falls() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let start = position(sim.world(), player).expect("position");
    let spot = sim.walkable_near(start, Tiles(1.0), Tiles(1.0));
    let orc = npc::spawn(sim.world(), row("Orc"), spot, spawn_area(), Pack(u32::MAX));
    sim.tick();

    sim.send(1, AttackRequest { target: orc });

    assert!(sim.run_until(60.0, |world| stat::is_dead(world, orc)));
}
