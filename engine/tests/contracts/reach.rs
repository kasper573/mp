use bevy_ecs::prelude::*;
use engine::core::math::{Offset, Pos};
use engine::core::tiling::Tiles;
use engine::core::time::Seconds;
use engine::systems::area::{AreaDef, AreaTag};
use engine::systems::item::{self, DroppedItem, Inventory, ItemDef, PickupRequest, Reservation};
use engine::systems::movement::{self, MoveRequest, MoveSeq, Position, position};
use engine::systems::npc::{self, NpcDef, Pack};
use engine::systems::reach::{self, ReachAct, ReachTarget, Tether};
use engine::systems::skill::SkillDef;
use serde_json::json;
use testkit::{Declared, Game, Map, Sim};

#[test]
fn a_pickup_walks_into_reach_and_then_collects() {
    let mut sim = yard();
    let player = sim.join(1);
    let start = position(&sim.world, player).expect("position");
    let bone = drop_bone(&mut sim, start + Offset::new(4.0, 0.0));

    let conn = sim.conn(1);
    sim.send(conn, PickupRequest { target: bone });

    assert!(sim.run_until(10.0, |world| bones(world, player) == 2));
    assert!(sim.world.get_entity(bone).is_err());
}

#[test]
fn walking_away_cancels_the_intent() {
    let mut sim = yard();
    let player = sim.join(1);
    let start = position(&sim.world, player).expect("position");
    let bone = drop_bone(&mut sim, start + Offset::new(5.0, 0.0));

    let conn = sim.conn(1);
    sim.send(conn, PickupRequest { target: bone });
    sim.tick();
    sim.send(
        conn,
        MoveRequest {
            pos: start,
            seq: MoveSeq(1),
        },
    );

    assert!(!sim.run_until(10.0, |world| bones(world, player) > 0));
    assert!(sim.world.get_entity(bone).is_ok());
}

#[test]
fn an_actor_holds_one_intent_at_a_time() {
    let mut sim = yard();
    let player = sim.join(1);
    let at = position(&sim.world, player).expect("position");
    let brute = brute(&mut sim, at);
    let bone = drop_bone(&mut sim, at);
    let strike = sim.id::<SkillDef>("strike");
    let world = &mut sim.world;

    reach::intend(
        world,
        player,
        ReachTarget::Actor(brute),
        ReachAct::Cast {
            skill: strike,
            repeat: true,
        },
    );
    reach::intend(world, player, ReachTarget::Actor(bone), ReachAct::Pickup);

    assert_eq!(reach::attacking(world, player), None);
    assert_eq!(reach::intent(world, player, ReachAct::Pickup), Some(bone));
}

#[test]
fn a_tether_holds_while_its_owner_stays_in_reach_of_a_living_npc() {
    let mut sim = yard();
    let player = sim.join(1);
    let anchor = position(&sim.world, player).expect("position");
    let far = anchor + Offset::new(6.0, 0.0);
    let brute = brute(&mut sim, far);
    let world = &mut sim.world;
    let tether = Tether::around(world, player, Tiles(2.0), Some(brute)).expect("tether");

    assert!(tether.holds(world, player));

    world.get_mut::<Position>(player).expect("position").pos = far;
    assert!(!tether.holds(world, player));

    world.get_mut::<Position>(player).expect("position").pos = anchor;
    assert!(tether.holds(world, player));

    world.despawn(brute);
    assert!(!tether.holds(world, player));
}

fn yard() -> Sim {
    let content = Game::new()
        .area("yard", &Map::open(13, 5), json!([]))
        .hero("yard", 2.0, 2.0)
        .sword()
        .npc("brute", 25.0, json!([]))
        .item(
            "bone",
            json!({ "kind": { "type": "resource" }, "modules": [{ "type": "stack", "max": 10 }] }),
        )
        .load();
    let mut sim = Sim::new(content);
    sim.serve("yard")
        .accept::<MoveRequest>()
        .accept::<PickupRequest>()
        .add((movement::move_request, item::pickup_request))
        .add((movement::advance, item::pickups));
    sim
}

fn brute(sim: &mut Sim, at: Pos<Tiles>) -> Entity {
    let area = sim.id::<AreaDef>("yard");
    let brute = sim.id::<NpcDef>("brute");
    npc::spawn(&mut sim.world, brute, at, area, Pack(u32::MAX))
}

fn drop_bone(sim: &mut Sim, at: Pos<Tiles>) -> Entity {
    let area = sim.id::<AreaDef>("yard");
    let bone = sim.id::<ItemDef>("bone");
    sim.world
        .spawn((
            Position::at(at),
            AreaTag { area },
            DroppedItem {
                item: bone,
                count: 2,
            },
            Reservation {
                by: None,
                at: Seconds(0.0),
            },
        ))
        .id()
}

fn bones(world: &World, player: Entity) -> u32 {
    let content = world.resource::<engine::core::content::Content>();
    let bone = content.declared::<ItemDef>("bone").expect("bones");
    world
        .get::<Inventory>(player)
        .map_or(0, |inventory| inventory.count(bone))
}
