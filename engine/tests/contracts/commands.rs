use bevy_ecs::prelude::*;
use engine::core::time::Seconds;
use engine::systems::equipment::{self, Equipment, EquipmentSlot, UnequipRequest};
use engine::systems::item::{DropItemRequest, UseItemRequest};
use engine::systems::player::{ArrivalHold, CommandLock};
use engine::systems::stat;

use testkit::{Sim, count, give, row, slot_of, spawn_area};

#[test]
fn a_command_lock_refuses_use_drop_and_unequip_until_it_lifts() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    free(&mut sim, player);
    prepare(&mut sim, player);

    sim.world().entity_mut(player).insert(CommandLock);
    attempt_each(&mut sim, player);
    assert_eq!(belongings(&mut sim, player), PREPARED);

    sim.world().entity_mut(player).remove::<CommandLock>();
    attempt_each(&mut sim, player);
    assert_eq!(belongings(&mut sim, player), EACH_DONE);
}

#[test]
fn an_arrival_hold_refuses_use_drop_and_unequip_until_it_lifts() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    free(&mut sim, player);
    prepare(&mut sim, player);

    sim.world().entity_mut(player).insert(ArrivalHold {
        until: Seconds(1000.0),
    });
    attempt_each(&mut sim, player);
    assert_eq!(belongings(&mut sim, player), PREPARED);

    sim.world().entity_mut(player).remove::<ArrivalHold>();
    attempt_each(&mut sim, player);
    assert_eq!(belongings(&mut sim, player), EACH_DONE);
}

fn free(sim: &mut Sim, player: Entity) {
    sim.tick();
    sim.world()
        .entity_mut(player)
        .remove::<(ArrivalHold, CommandLock)>();
}

fn prepare(sim: &mut Sim, player: Entity) {
    give(sim, player, row("GreaterHealthPotion"), 1);
    give(sim, player, row("OrcTusk"), 1);
    give(sim, player, row("FruloosRock"), 1);
    equipment::equip_held(sim.world(), player, row("FruloosRock")).expect("the rock is worn");
    stat::apply_damage(sim.world(), player, 10.0);
}

fn attempt_each(sim: &mut Sim, player: Entity) {
    let potion = slot_of(sim, player, row("GreaterHealthPotion"));
    sim.send(1, UseItemRequest { slot: potion });
    sim.tick();

    let tusk = slot_of(sim, player, row("OrcTusk"));
    sim.send(1, DropItemRequest { slot: tusk });
    sim.tick();

    sim.send(
        1,
        UnequipRequest {
            slot: EquipmentSlot::Head,
        },
    );
    sim.tick();
}

#[derive(Debug, PartialEq)]
struct Belongings {
    potions: u32,
    tusks: u32,
    helmet_worn: bool,
}

const PREPARED: Belongings = Belongings {
    potions: 1,
    tusks: 1,
    helmet_worn: true,
};

const EACH_DONE: Belongings = Belongings {
    potions: 0,
    tusks: 0,
    helmet_worn: false,
};

fn belongings(sim: &mut Sim, player: Entity) -> Belongings {
    Belongings {
        potions: count(sim, player, row("GreaterHealthPotion")),
        tusks: count(sim, player, row("OrcTusk")),
        helmet_worn: sim
            .world()
            .get::<Equipment>(player)
            .is_some_and(|equipment| equipment.slots.contains_key(&EquipmentSlot::Head)),
    }
}
