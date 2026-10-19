use std::collections::BTreeMap;

use bevy_ecs::change_detection::DetectChanges;
use bevy_ecs::prelude::*;
use engine::systems::equipment::{self, Equipment, EquipmentSlot, UnequipRequest};
use engine::systems::item::{ItemDef, ItemId};
use engine::systems::stat::{self, StatKind, Stats};
use engine::systems::{script, status};
use serde_json::json;
use testkit::{Game, Map, Sim};

#[test]
fn a_lowered_maximum_pulls_health_down_to_it() {
    let (mut sim, player) = wardrobe();
    set_vitals(&mut sim, player, 30.0, 30.0);
    sim.give(player, "rock", 1);

    let rock = sim.id::<ItemDef>("rock");
    equipment::equip_held(&mut sim.world, player, rock).expect("the rock is worn");
    sim.tick();

    assert_eq!(stat::max_health(&sim.world, player), 20.0);
    assert_eq!(stat::current_health(&sim.world, player), 20.0);
}

#[test]
fn a_tick_without_a_vitals_change_leaves_stats_untouched() {
    let (mut sim, player) = wardrobe();
    set_vitals(&mut sim, player, 30.0, 30.0);
    sim.tick();

    let since = sim.world.change_tick();
    sim.tick();

    let now = sim.world.change_tick();
    let stats = sim.world.entity(player).get_ref::<Stats>().expect("stats");
    assert!(!stats.last_changed().is_newer_than(since, now));
}

#[test]
fn healing_does_not_bring_the_dead_back() {
    let (mut sim, player) = wardrobe();
    set_vitals(&mut sim, player, 0.0, 30.0);

    stat::heal(&mut sim.world, player, 10.0);
    stat::refill(&mut sim.world, player);

    assert!(stat::is_dead(&sim.world, player));
}

#[test]
fn the_dead_cannot_take_off_what_they_wear() {
    let (mut sim, player) = wardrobe();
    sim.give(player, "rock", 1);
    let rock = sim.id::<ItemDef>("rock");
    equipment::equip_held(&mut sim.world, player, rock).expect("the rock is worn");
    set_vitals(&mut sim, player, 0.0, 30.0);

    let conn = sim.conn(1);
    sim.send(
        conn,
        UnequipRequest {
            slot: EquipmentSlot::Head,
        },
    );
    sim.tick();

    assert_eq!(worn(&sim, player, EquipmentSlot::Head), Some(rock));
    assert_eq!(sim.count(player, "rock"), 0);
}

#[test]
fn wearing_one_of_a_stack_leaves_the_rest_in_the_bag() {
    let (mut sim, player) = wardrobe();
    sim.give(player, "rock", 2);
    let rock = sim.id::<ItemDef>("rock");

    equipment::equip_held(&mut sim.world, player, rock).expect("the rock is worn");

    assert_eq!(worn(&sim, player, EquipmentSlot::Head), Some(rock));
    assert_eq!(sim.count(player, "rock"), 1);
}

fn wardrobe() -> (Sim, Entity) {
    let content = Game::new()
        .area("room", &Map::open(5, 5), json!([]))
        .hero("room", 2.0, 2.0)
        .item(
            "rock",
            json!({
                "kind": { "type": "equipment", "slot": "head" },
                "modules": [{ "type": "script", "script": "rock_lower" }],
            }),
        )
        .script(
            "rock_lower",
            "item/rock",
            "item",
            json!({
                "activated": { "type": "on", "event": "activated", "next": "lower" },
                "lower": { "type": "boost", "stat": "max_health", "by": -10.0 },
            }),
        )
        .load();
    let mut sim = Sim::new(content);
    sim.serve("room")
        .accept::<UnequipRequest>()
        .add((
            (status::expire, status::aspect::settle, status::aspect::tick).chain(),
            equipment::unequip,
        ))
        .add(script::run_tick)
        .add(stat::settle_health);
    script::spawn_stateless(&mut sim.world);
    let player = sim.join(1);
    (sim, player)
}

fn set_vitals(sim: &mut Sim, player: Entity, health: f32, max: f32) {
    *sim.world.get_mut::<Stats>(player).expect("stats") = Stats(BTreeMap::from([
        (StatKind::Health, health),
        (StatKind::MaxHealth, max),
    ]));
}

fn worn(sim: &Sim, player: Entity, slot: EquipmentSlot) -> Option<ItemId> {
    sim.world
        .get::<Equipment>(player)
        .expect("equipment")
        .slots
        .get(&slot)
        .copied()
}
