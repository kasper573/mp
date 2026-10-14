use std::sync::Arc;

use bevy_ecs::prelude::*;
use game::core::math::{Pos, Rng};
use game::core::script::compile::compile_owner;
use game::core::tiling::{TilePos, Tiles};
use game::systems::combat::{AttackRequest, Attitude};
use game::systems::movement::{Position, position};
use game::systems::npc::{self, NpcId, Pack, body};
use game::systems::script::{EventKind, Owner, OwnerKind, Procedure, RiftInstances};
use game::systems::stat::{self, StatKind};
use serde_json::json;

use crate::json::inline_with;
use crate::support::{Sim, content, row, spawn_area, townsperson};

const SEED: u64 = 7;

fn sim() -> (Sim, Entity, Pos<Tiles>) {
    let mut sim = Sim::area(spawn_area());
    sim.world().insert_resource(Rng::new(SEED));
    let player = sim.join(1);
    sim.run_until(1.0, |_| false);
    let at = position(sim.world(), player).expect("position");
    (sim, player, at)
}

fn monster(sim: &mut Sim, who: &str, near: Pos<Tiles>, pack: u32) -> Entity {
    let spot = sim.walkable_near(near, Tiles(3.0), Tiles(4.0));
    let npc = npc::spawn(
        sim.world(),
        row::<NpcId>(who),
        spot,
        spawn_area(),
        Pack(pack),
    );
    sim.tick();
    npc
}

fn targets(sim: &mut Sim, npc: Entity, player: Entity, within: f32) -> bool {
    sim.run_until(within, |world| body::target(world, npc) == Some(player))
}

fn health(sim: &mut Sim, who: Entity) -> f32 {
    stat::effective(sim.world(), who, StatKind::Health)
}

#[test]
fn an_aggressive_monster_picks_a_character_in_its_aggro_range_and_drops_one_beyond_it() {
    let (mut sim, player, at) = sim();
    let skeleton = monster(&mut sim, "Skeleton", at, 1);

    assert_eq!(
        sim.world().get::<Attitude>(skeleton),
        Some(&Attitude::Hostile)
    );
    assert!(targets(&mut sim, skeleton, player, 3.0));

    let far = sim.walkable_near(at, Tiles(16.0), Tiles(40.0));
    sim.world().entity_mut(player).insert(Position { pos: far });
    assert!(sim.run_until(5.0, |world| body::target(world, skeleton).is_none()));
}

#[test]
fn a_defensive_monster_only_fights_whoever_attacks_it() {
    let (mut sim, player, at) = sim();
    let orc = monster(&mut sim, "Orc", at, 1);

    assert!(!targets(&mut sim, orc, player, 3.0));

    sim.send(1, AttackRequest { target: orc });
    assert!(targets(&mut sim, orc, player, 5.0));
}

#[test]
fn a_protective_monster_fights_whoever_attacks_its_pack() {
    let (mut sim, player, at) = sim();
    let orc = monster(&mut sim, "Orc", at, 4);
    let chief = monster(&mut sim, "OrcChief", at, 4);

    assert!(!targets(&mut sim, chief, player, 3.0));

    sim.send(1, AttackRequest { target: orc });
    assert!(targets(&mut sim, chief, player, 5.0));
}

#[test]
fn a_pacifist_monster_never_fights_back() {
    let (mut sim, player, at) = sim();
    let bat = monster(&mut sim, "Bat", at, 1);
    let full = health(&mut sim, bat);

    sim.send(1, AttackRequest { target: bat });
    assert!(
        sim.run_until(5.0, |world| stat::effective(world, bat, StatKind::Health)
            < full)
    );

    assert!(!targets(&mut sim, bat, player, 3.0));
    assert_eq!(sim.world().get::<Attitude>(bat), Some(&Attitude::Hostile));
}

#[test]
fn idle_stroll_keeps_its_leash() {
    let (mut sim, _, _) = sim();
    let grisha = townsperson(&mut sim, row("Grisha"));
    let home = position(sim.world(), grisha).expect("position");
    let leash = Tiles(3.0);

    let mut farthest = Tiles(0.0);
    let mut moved = false;
    sim.run_until(90.0, |world| {
        let here = position(world, grisha).expect("position");
        farthest = Tiles(farthest.0.max(here.distance(home).0));
        moved |= here != home;
        false
    });

    assert!(moved, "Grisha never strolled");
    assert!(
        farthest <= Tiles(leash.0 + 1.0),
        "strayed {farthest:?} from home"
    );
}

fn brawler() -> Vec<Arc<Procedure>> {
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
    compile_owner(content(), OwnerKind::Npc, "test/brawler", &[script]).expect("compiles")
}

fn brawling_npc(sim: &mut Sim, near: Pos<Tiles>, pack: u32) -> Entity {
    let spot = sim.walkable_near(near, Tiles(2.0), Tiles(3.0));
    let npc = npc::spawn(
        sim.world(),
        row::<NpcId>("Orc"),
        spot,
        spawn_area(),
        Pack(pack),
    );
    let owner = Owner::Entity(OwnerKind::Npc, npc);
    let mut instances = sim.world().resource_mut::<RiftInstances>();
    instances.remove_owner(owner);
    instances.spawn_owner(owner, brawler());
    instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
    npc
}

#[test]
fn two_npcs_targeting_each_other_fight() {
    let (mut sim, _, at) = sim();
    let first = brawling_npc(&mut sim, at, 1);
    let second = brawling_npc(&mut sim, at, 2);
    sim.tick();
    let full = [health(&mut sim, first), health(&mut sim, second)];

    assert!(sim.run_until(5.0, |world| {
        body::target(world, first) == Some(second) && body::target(world, second) == Some(first)
    }));
    assert!(sim.run_until(10.0, |world| {
        stat::effective(world, first, StatKind::Health) < full[0]
            && stat::effective(world, second, StatKind::Health) < full[1]
    }));
}
