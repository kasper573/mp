use bevy_ecs::prelude::*;
use engine::core::content::Content;
use engine::core::math::{Offset, Pos};
use engine::core::script::{Expr, Value};
use engine::core::tiling::Tiles;
use engine::systems::area::AreaDef;
use engine::systems::combat::{self, AttackRequest, Attitude};
use engine::systems::item::{ItemDef, ItemKind};
use engine::systems::memory::{self, MemoryDef};
use engine::systems::movement::{self, position};
use engine::systems::npc::{self, NpcDef, Pack};
use engine::systems::player::ClientId;
use engine::systems::script::condition::{self, CompiledCondition};
use engine::systems::script::{self, RiftQuery};
use engine::systems::stat::{self, StatKind};
use engine::systems::visibility::{self, Presence};
use engine::systems::{actor, reach, skill};
use serde_json::json;
use testkit::{Game, Map, Sim};

#[test]
fn an_npc_spawned_for_one_player_cannot_be_fought_by_another() {
    let mut sim = arena();
    let owner = sim.join(1);
    sim.join(2);
    let brute = spawn(&mut sim, "brute", owner, Offset::new(2.0, 0.0));
    sim.world
        .entity_mut(brute)
        .insert((Attitude::Hostile, Presence::For(ClientId(1))));
    let full = stat::effective(&sim.world, brute, StatKind::Health);

    let other = sim.conn(2);
    sim.send(other, AttackRequest { target: brute });
    sim.run(4.0);
    assert_eq!(stat::effective(&sim.world, brute, StatKind::Health), full);

    let own = sim.conn(1);
    sim.send(own, AttackRequest { target: brute });
    assert!(sim.run_until(10.0, |world| stat::effective(
        world,
        brute,
        StatKind::Health
    ) < full));
}

#[test]
fn a_friendly_npc_cannot_be_attacked() {
    let mut sim = arena();
    let player = sim.join(1);
    let friend = spawn(&mut sim, "brute", player, Offset::new(1.0, 0.0));
    assert_eq!(sim.world.get::<Attitude>(friend), Some(&Attitude::Friendly));
    let full = stat::effective(&sim.world, friend, StatKind::Health);

    let conn = sim.conn(1);
    sim.send(conn, AttackRequest { target: friend });
    sim.run(4.0);

    assert_eq!(reach::attacking(&sim.world, player), None);
    assert_eq!(stat::effective(&sim.world, friend, StatKind::Health), full);
}

#[test]
fn a_monster_spawned_for_one_player_ignores_everyone_else() {
    let mut sim = arena();
    let owner = sim.join(1);
    let bystander = sim.join(2);
    let hunter = spawn(&mut sim, "hunter", bystander, Offset::new(1.0, 0.0));
    sim.world
        .entity_mut(hunter)
        .insert(Presence::For(ClientId(1)));

    let mut hunted = Vec::new();
    sim.run_until(3.0, |world| {
        hunted.extend(reach::attacking(world, hunter));
        false
    });

    assert!(hunted.contains(&owner));
    assert!(!hunted.contains(&bystander));
}

#[test]
fn presence_by_condition_follows_the_players_memory() {
    let mut sim = arena();
    let player = sim.join(1);
    let brute = spawn(&mut sim, "brute", player, Offset::new(2.0, 0.0));
    let slain = sim.id::<MemoryDef>("slain");
    let alive = Expr::Not {
        of: Box::new(Expr::Query(RiftQuery::Memory {
            of: None,
            memory: slain,
        })),
    };
    let shown = CompiledCondition::new(sim.world.resource::<Content>(), &alive);
    sim.world.entity_mut(brute).insert(Presence::When(shown));
    assert!(visibility::present(&sim.world, brute, player));

    memory::set(&mut sim.world, player, slain, Value::Bool(true));

    assert!(!visibility::present(&sim.world, brute, player));
}

#[test]
fn a_world_that_serves_no_area_judges_an_items_requirements() {
    let content = Game::new()
        .item(
            "shield",
            json!({
                "kind": {
                    "type": "equipment",
                    "slot": "offhand",
                    "requires": { "type": "at_least", "a": { "type": "level" }, "b": 2 },
                },
            }),
        )
        .load();
    let shield = content.by_key::<ItemDef>("shield").expect("the shield");
    let ItemKind::Equipment {
        requires: Some(requirement),
        ..
    } = &shield.get(&content).kind
    else {
        panic!("the shield asks something of its wearer");
    };
    let mut world = World::new();
    world.insert_resource(content.clone());
    let viewer = world.spawn_empty().id();

    assert!(!condition::holds(&world, viewer, requirement));
}

fn arena() -> Sim {
    let content = Game::new()
        .area("arena", &Map::open(11, 7), json!([]))
        .hero("arena", 3.0, 3.0)
        .sword()
        .wearing(&["sword"])
        .npc("brute", 25.0, json!([]))
        .npc(
            "hunter",
            25.0,
            json!([{ "type": "script", "script": "hunter_hunt" }]),
        )
        .owned(
            "script",
            "hunter_hunt",
            "npc/hunter",
            json!({
                "runs_on": "npc",
                "locals": { "target": "actor" },
                "nodes": {
                    "spawned": { "type": "on", "event": "started", "next": "hostile" },
                    "hostile": { "type": "set_attitude", "attitude": "hostile", "next": "look" },
                    "look": {
                        "type": "set",
                        "values": [{
                            "local": "target",
                            "to": { "type": "nearest", "among": "characters", "within": 8.0 },
                        }],
                        "next": "found",
                    },
                    "found": {
                        "type": "if",
                        "test": { "type": "present", "actor": { "type": "local", "local": "target" } },
                        "yes": "fight",
                        "no": "tick",
                    },
                    "fight": {
                        "type": "attack",
                        "target": { "type": "local", "local": "target" },
                        "within": 8.0,
                        "priority": 5,
                        "defeated": "look",
                        "lost": "look",
                        "interrupted": "look",
                    },
                    "tick": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "look" },
                },
            }),
        )
        .edit("npc", "hunter", |hunter| hunter["basic_attack"] = json!("strike"))
        .row(
            "memory",
            "slain",
            json!({ "label": "Slew the brute", "type": "boolean", "resets": "never" }),
        )
        .vfx("damage_taken")
        .shader("damage_pop")
        .vfx("defeated")
        .load();
    let mut sim = Sim::new(content);
    sim.serve("arena")
        .accept::<AttackRequest>()
        .add((
            combat::request,
            actor::playing::progress,
            skill::casting::casts,
        ))
        .add((
            script::query::take_tick_roster,
            script::run_tick,
            npc::body::drive,
            movement::advance,
        ))
        .add((
            stat::settle_health,
            combat::defeats,
            skill::hotbar::settle_basic_attack,
            actor::settle,
        ));
    script::spawn_stateless(&mut sim.world);
    sim
}

fn spawn(sim: &mut Sim, key: &str, near: Entity, offset: Offset<Tiles>) -> Entity {
    let at: Pos<Tiles> = position(&sim.world, near).expect("a position") + offset;
    let area = sim.id::<AreaDef>("arena");
    let def = sim.id::<NpcDef>(key);
    npc::spawn(&mut sim.world, def, at, area, Pack(u32::MAX))
}
