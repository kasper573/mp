use bevy_ecs::prelude::*;
use engine::core::math::{Offset, Pos};
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::combat::{AttackRequest, Attitude};
use engine::systems::movement::{self, position};
use engine::systems::npc::{Home, body};
use engine::systems::script::{EventKind, Owner, OwnerKind, RiftInstances};
use engine::systems::stat::{self, StatKind};
use serde_json::json;
use testkit::Sim;

use crate::game::{compiled, field, health, inline_with, spawn};

const FAR: Pos<Tiles> = Pos::new(28.0, 28.0);

#[test]
fn an_aggressive_monster_picks_a_character_in_its_aggro_range_and_drops_one_beyond_it() {
    let (mut sim, player) = field();
    let hunter = monster(&mut sim, "hunter", player, 1);

    assert_eq!(sim.world.get::<Attitude>(hunter), Some(&Attitude::Hostile));
    assert!(targets(&mut sim, hunter, player, 3.0));

    movement::relocate(&mut sim.world, player, FAR);
    assert!(sim.run_until(5.0, |world| body::target(world, hunter).is_none()));
}

#[test]
fn a_defensive_monster_only_fights_whoever_attacks_it() {
    let (mut sim, player) = field();
    let guard = monster(&mut sim, "guard", player, 1);

    assert!(!targets(&mut sim, guard, player, 3.0));

    attack(&mut sim, guard);
    assert!(targets(&mut sim, guard, player, 5.0));
}

#[test]
fn a_protective_monster_fights_whoever_attacks_its_pack() {
    let (mut sim, player) = field();
    let member = monster(&mut sim, "bat", player, 4);
    let chief = monster(&mut sim, "chief", player, 4);

    assert!(!targets(&mut sim, chief, player, 3.0));

    // The pack wandered meanwhile, and the chief guards it only within its aggro range.
    let beside = position(&sim.world, player).expect("a position") + Offset::new(1.0, 1.0);
    movement::relocate(&mut sim.world, member, beside);
    movement::relocate(&mut sim.world, chief, beside);
    attack(&mut sim, member);
    assert!(targets(&mut sim, chief, player, 5.0));
}

#[test]
fn a_pacifist_monster_never_fights_back() {
    let (mut sim, player) = field();
    let bat = monster(&mut sim, "bat", player, 1);
    let full = health(&sim, bat);

    attack(&mut sim, bat);
    assert!(
        sim.run_until(5.0, |world| stat::effective(world, bat, StatKind::Health)
            < full)
    );

    assert!(!targets(&mut sim, bat, player, 3.0));
    assert_eq!(sim.world.get::<Attitude>(bat), Some(&Attitude::Hostile));
}

#[test]
fn idle_stroll_keeps_its_leash() {
    let (mut sim, _) = field();
    let stroller = sim.npc("stroller");
    let home = sim
        .world
        .get::<Home>(stroller)
        .expect("a resident's home")
        .0;
    let leash = Tiles(3.0);

    let mut farthest = Tiles(0.0);
    let mut moved = false;
    sim.run_until(90.0, |world| {
        let here = position(world, stroller).expect("position");
        farthest = Tiles(farthest.0.max(here.distance(home).0));
        moved |= here != home;
        false
    });

    assert!(moved, "the stroller never strolled");
    assert!(
        farthest <= Tiles(leash.0 + 1.0),
        "strayed {farthest:?} from home"
    );
}

#[test]
fn two_npcs_targeting_each_other_fight() {
    let (mut sim, player) = field();
    let first = brawling_npc(&mut sim, player, Offset::new(2.0, 0.0), 1);
    let second = brawling_npc(&mut sim, player, Offset::new(0.0, 2.0), 2);
    sim.tick();
    let full = [health(&sim, first), health(&sim, second)];

    assert!(sim.run_until(5.0, |world| {
        body::target(world, first) == Some(second) && body::target(world, second) == Some(first)
    }));
    assert!(sim.run_until(10.0, |world| {
        stat::effective(world, first, StatKind::Health) < full[0]
            && stat::effective(world, second, StatKind::Health) < full[1]
    }));
}

/// A monster of the npc row under `key`, set down three tiles from `near`.
fn monster(sim: &mut Sim, key: &str, near: Entity, pack: u32) -> Entity {
    let monster = spawn(sim, key, near, Offset::new(3.0, 0.0), pack);
    sim.tick();
    monster
}

fn attack(sim: &mut Sim, target: Entity) {
    let conn = sim.conn(1);
    sim.send(conn, AttackRequest { target });
}

fn targets(sim: &mut Sim, npc: Entity, player: Entity, within: f32) -> bool {
    sim.run_until(within, |world| body::target(world, npc) == Some(player))
}

/// A fighter that fights the nearest other character it finds, whatever its pack.
fn brawling_npc(sim: &mut Sim, near: Entity, offset: Offset<Tiles>, pack: u32) -> Entity {
    let script = inline_with(
        json!({ "target": "actor" }),
        json!({
            "spawned": { "type": "on", "event": "started", "next": "hostile" },
            "hostile": { "type": "set_attitude", "attitude": "hostile", "next": "look" },
            "look": {
                "type": "set",
                "values": [{
                    "local": "target",
                    "to": { "type": "nearest", "among": "npcs", "within": 10.0 }
                }],
                "next": "found"
            },
            "found": {
                "type": "if",
                "test": { "type": "present", "actor": { "type": "local", "local": "target" } },
                "yes": "fight",
                "no": "roam"
            },
            "fight": {
                "type": "attack",
                "target": { "type": "local", "local": "target" },
                "within": 10.0,
                "priority": 5,
                "defeated": "look",
                "lost": "look",
                "interrupted": "look"
            },
            "roam": { "type": "wander", "priority": 1, "next": "tick" },
            "tick": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "look" },
        }),
    );
    let npc = spawn(sim, "fighter", near, offset, pack);
    let owner = Owner::Entity(OwnerKind::Npc, npc);
    let mut instances = sim.world.resource_mut::<RiftInstances>();
    instances.remove_owner(owner);
    instances.spawn_owner(owner, compiled("test/brawler", &[&script]));
    instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
    npc
}
