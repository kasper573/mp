use bevy_ecs::change_detection::DetectChanges;
use bevy_ecs::prelude::*;
use game::systems::equipment::{self, Equipment, EquipmentSlot, UnequipRequest};
use game::systems::item::ItemId;
use game::systems::stat::{self, StatKind, Stats};

use testkit::{Sim, count, give, row, spawn_area};

#[test]
fn a_lowered_maximum_pulls_health_down_to_it() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    set_vitals(&mut sim, player, 30.0, 30.0);
    give(&mut sim, player, row("FruloosRock"), 1);

    equipment::equip_held(sim.world(), player, row("FruloosRock")).expect("the rock is worn");
    sim.tick();

    assert_eq!(stat::max_health(sim.world(), player), 20.0);
    assert_eq!(stat::current_health(sim.world(), player), 20.0);
}

#[test]
fn a_tick_without_a_vitals_change_leaves_stats_untouched() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    set_vitals(&mut sim, player, 30.0, 30.0);
    sim.tick();

    let since = sim.world().change_tick();
    sim.tick();

    let now = sim.world().change_tick();
    let stats = sim
        .world()
        .entity(player)
        .get_ref::<Stats>()
        .expect("stats");
    assert!(!stats.last_changed().is_newer_than(since, now));
}

#[test]
fn healing_does_not_bring_the_dead_back() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    set_vitals(&mut sim, player, 0.0, 30.0);

    stat::heal(sim.world(), player, 10.0);
    stat::refill(sim.world(), player);

    assert!(stat::is_dead(sim.world(), player));
}

#[test]
fn the_dead_cannot_take_off_what_they_wear() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("FruloosRock"), 1);
    equipment::equip_held(sim.world(), player, row("FruloosRock")).expect("the rock is worn");
    set_vitals(&mut sim, player, 0.0, 30.0);

    sim.send(
        1,
        UnequipRequest {
            slot: EquipmentSlot::Head,
        },
    );
    sim.tick();

    assert_eq!(
        worn(&mut sim, player, EquipmentSlot::Head),
        Some(row("FruloosRock"))
    );
    assert_eq!(count(&mut sim, player, row("FruloosRock")), 0);
}

#[test]
fn wearing_one_of_a_stack_leaves_the_rest_in_the_bag() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("FruloosRock"), 2);

    equipment::equip_held(sim.world(), player, row("FruloosRock")).expect("the rock is worn");

    assert_eq!(
        worn(&mut sim, player, EquipmentSlot::Head),
        Some(row("FruloosRock"))
    );
    assert_eq!(count(&mut sim, player, row("FruloosRock")), 1);
}

fn set_vitals(sim: &mut Sim, player: Entity, health: f32, max: f32) {
    *sim.world().get_mut::<Stats>(player).expect("stats") = Stats(vec![
        StatKind::Health.of(health),
        StatKind::MaxHealth.of(max),
    ]);
}

fn worn(sim: &mut Sim, player: Entity, slot: EquipmentSlot) -> Option<ItemId> {
    sim.world()
        .get::<Equipment>(player)
        .expect("equipment")
        .slots
        .get(&slot)
        .copied()
}
