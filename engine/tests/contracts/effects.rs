use bevy_ecs::prelude::*;
use engine::core::time::Seconds;
use engine::systems::equipment::{self, EquipmentSlot, UnequipRequest};
use engine::systems::item::{Inventory, ItemId, UseItemRequest};
use engine::systems::skill::{
    self, Aim, AssignHotbarRequest, Hotbar, HotbarEntry, Rank, UseSkillRequest,
};
use engine::systems::stat::{self, StatKind};
use engine::systems::status::{self, StatusCategory, Statuses};

use testkit::{Sim, count, errors, give, later, row, settle, slot_of, spawn_area};

#[test]
fn a_status_holds_its_boost_until_its_time_runs_out() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let base = stat::max_health(sim.world(), player);

    status::apply(
        sim.world(),
        player,
        row("Guarded"),
        10.0,
        Some(Seconds(5.0)),
    );
    settle(&mut sim);
    assert_eq!(stat::max_health(sim.world(), player), base + 10.0);

    later(&mut sim, 5.0);
    assert_eq!(stat::max_health(sim.world(), player), base);
    assert!(!status::has(sim.world(), player, row("Guarded")));
}

#[test]
fn applying_a_held_status_refreshes_it_instead_of_stacking() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let base = stat::max_health(sim.world(), player);

    status::apply(
        sim.world(),
        player,
        row("Guarded"),
        10.0,
        Some(Seconds(1.0)),
    );
    settle(&mut sim);
    status::apply(
        sim.world(),
        player,
        row("Guarded"),
        18.0,
        Some(Seconds(5.0)),
    );
    settle(&mut sim);
    assert_eq!(statuses(&mut sim, player).0.len(), 1);
    assert_eq!(stat::max_health(sim.world(), player), base + 18.0);

    later(&mut sim, 1.5);
    assert_eq!(stat::max_health(sim.world(), player), base + 18.0);
}

#[test]
fn a_cleanse_takes_only_the_category_it_names() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    status::apply(sim.world(), player, row("Guarded"), 10.0, None);
    status::apply(sim.world(), player, row("Poisoned"), 1.0, None);
    settle(&mut sim);

    let antidote: ItemId = row("Antidote");
    give(&mut sim, player, antidote, 1);
    let slot = slot_of(&mut sim, player, antidote);
    sim.send(1, UseItemRequest { slot });
    settle(&mut sim);

    assert!(!status::has(sim.world(), player, row("Poisoned")));
    assert!(status::has(sim.world(), player, row("Guarded")));
    assert_eq!(count(&mut sim, player, antidote), 0);
    let content = testkit::content();
    assert_eq!(
        statuses(&mut sim, player).count(content, Some(StatusCategory::Debuff)),
        0
    );
}

#[test]
fn a_status_on_an_interval_strikes_every_period_while_it_holds() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let full = stat::current_health(sim.world(), player);

    let bog_water: ItemId = row("BogWater");
    give(&mut sim, player, bog_water, 1);
    let slot = slot_of(&mut sim, player, bog_water);
    sim.send(1, UseItemRequest { slot });
    settle(&mut sim);
    assert!(status::has(sim.world(), player, row("Poisoned")));
    assert_eq!(stat::current_health(sim.world(), player), full);

    later(&mut sim, 2.0);
    assert_eq!(stat::current_health(sim.world(), player), full - 2.0);
    later(&mut sim, 2.0);
    assert_eq!(stat::current_health(sim.world(), player), full - 4.0);

    later(&mut sim, 10.0);
    assert!(!status::has(sim.world(), player, row("Poisoned")));
    let bitten = stat::current_health(sim.world(), player);
    later(&mut sim, 2.0);
    assert_eq!(stat::current_health(sim.world(), player), bitten);
}

#[test]
fn worn_gear_boosts_only_while_it_is_worn() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let bare = {
        sim.send(
            1,
            UnequipRequest {
                slot: EquipmentSlot::Weapon,
            },
        );
        settle(&mut sim);
        stat::effective(sim.world(), player, StatKind::Damage)
    };

    let sword: ItemId = row("IronSword");
    give(&mut sim, player, sword, 1);
    equipment::equip_held(sim.world(), player, sword).expect("the sword is worn");
    settle(&mut sim);
    assert_eq!(
        stat::effective(sim.world(), player, StatKind::Damage),
        bare + 4.0
    );

    sim.send(
        1,
        UnequipRequest {
            slot: EquipmentSlot::Weapon,
        },
    );
    settle(&mut sim);
    assert_eq!(stat::effective(sim.world(), player, StatKind::Damage), bare);
}

#[test]
fn a_carried_charm_boosts_only_while_it_is_carried() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let base = stat::effective(sim.world(), player, StatKind::MovementSpeed);

    let wing: ItemId = row("BatWing");
    give(&mut sim, player, wing, 1);
    settle(&mut sim);
    assert_eq!(
        stat::effective(sim.world(), player, StatKind::MovementSpeed),
        base + 0.5
    );

    sim.world()
        .get_mut::<Inventory>(player)
        .expect("bag")
        .set_count(wing, 0);
    settle(&mut sim);
    assert_eq!(
        stat::effective(sim.world(), player, StatKind::MovementSpeed),
        base
    );
}

#[test]
fn a_passive_skill_holds_its_boost_while_known_and_cannot_be_cast_or_slotted() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let base = stat::max_health(sim.world(), player);

    skill::learn::learn(sim.world(), player, &[("toughness".to_owned(), Rank(1))])
        .expect("toughness is learned");
    settle(&mut sim);
    assert_eq!(stat::max_health(sim.world(), player), base + 6.0);

    sim.forget_notified();
    sim.send(
        1,
        UseSkillRequest {
            skill: row("Toughness"),
            aim: Aim::Actor(player),
        },
    );
    settle(&mut sim);
    assert!(errors(&sim, 1).iter().any(|text| text.contains("passive")));

    sim.send(
        1,
        AssignHotbarRequest {
            slot: 8,
            entry: HotbarEntry::Skill(row("Toughness")),
        },
    );
    settle(&mut sim);
    let hotbar = sim
        .world()
        .get::<Hotbar>(player)
        .cloned()
        .unwrap_or_default();
    assert_eq!(hotbar.entry(8), HotbarEntry::Empty);

    skill::reset::reset(sim.world(), player);
    settle(&mut sim);
    assert_eq!(stat::max_health(sim.world(), player), base);
}

fn statuses(sim: &mut Sim, who: Entity) -> Statuses {
    sim.world()
        .get::<Statuses>(who)
        .cloned()
        .unwrap_or_default()
}
