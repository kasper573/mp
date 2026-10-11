use std::sync::Arc;

use bevy_ecs::prelude::*;
use game::core::math::{Pos, Rng};
use game::core::script::compile::compile_owner;
use game::core::script::{Assignment, Expr, Owner, OwnerKind, Target, ValueType};
use game::core::tiling::{TilePos, Tiles};
use game::data::npc::Id as NpcId;
use game::systems::combat::{AttackRequest, Attitude};
use game::systems::movement::{Position, position};
use game::systems::npc::body::{self, Attack, Wander};
use game::systems::npc::summon::SetAttitude;
use game::systems::npc::{self, Pack};
use game::systems::script::query::Among;
use game::systems::script::{
    Condition, EventKind, InlineScript, Node, Procedure, RiftEffect, RiftEvent, RiftInstances,
    RiftQuery, ScriptModule,
};
use game::systems::stat::{self, StatKind};

use crate::support::{Sim, content, row, spawn_area, townsperson};

const SEED: u64 = 7;

const TEN: Condition = Expr::Num(10.0);
const TARGET: Condition = Expr::Local("target");

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

const BRAWLER: InlineScript = InlineScript {
    state: &[],
    locals: &[("target", ValueType::Actor)],
    nodes: &[
        (
            "spawned",
            Node::On {
                event: RiftEvent::Started,
                next: Some("hostile"),
            },
        ),
        (
            "hostile",
            Node::Effect(RiftEffect::SetAttitude(SetAttitude {
                attitude: Attitude::Hostile,
                next: Some("look"),
            })),
        ),
        (
            "look",
            Node::Set {
                values: &[Assignment {
                    target: Target::Local("target"),
                    to: Expr::Query(RiftQuery::Nearest {
                        among: Among::Npcs,
                        npc: None,
                        within: &TEN,
                    }),
                }],
                next: Some("found"),
            },
        ),
        (
            "found",
            Node::If {
                test: Expr::Query(RiftQuery::Present { actor: &TARGET }),
                yes: Some("fight"),
                no: Some("roam"),
            },
        ),
        (
            "fight",
            Node::Effect(RiftEffect::Attack(Attack {
                target: &TARGET,
                within: &TEN,
                priority: 5,
                defeated: Some("look"),
                lost: Some("look"),
                interrupted: Some("look"),
            })),
        ),
        (
            "roam",
            Node::Effect(RiftEffect::Wander(Wander {
                leash: None,
                priority: 1,
                next: Some("tick"),
            })),
        ),
        (
            "tick",
            Node::Wait {
                seconds: Expr::Int(0),
                at_most: 1.0,
                next: Some("look"),
            },
        ),
    ],
};

fn brawler() -> Vec<Arc<Procedure>> {
    compile_owner(
        content(),
        OwnerKind::Npc,
        "test/brawler",
        &[ScriptModule::Inline(BRAWLER)],
    )
    .expect("compiles")
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
