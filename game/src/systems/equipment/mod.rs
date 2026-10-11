pub mod widget;

use std::collections::BTreeMap;

use bevy_app::App;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use strum::{IntoStaticStr, VariantArray};

use crate::core::content::Content;
use crate::core::script::{Owner, OwnerKind};
use crate::data;
use crate::systems::effect::{self, Effect};
use crate::systems::item::ItemKind;
use crate::systems::item::{Inventory, ItemStack};
use crate::systems::notification::{self, Notification, NotificationKind};
use crate::systems::player::sender_player;
use crate::systems::script::condition;
use crate::systems::script::{EventKind, RiftInstances};
use crate::systems::text::LineText;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<Equipment>()
        .add_client_message::<UnequipRequest>(Channel::Ordered);
    effect::source(app, equipped);
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Equipment {
    pub slots: BTreeMap<EquipmentSlot, data::item::Id>,
}

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UnequipRequest {
    pub slot: EquipmentSlot,
}

#[derive(
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Default,
    VariantArray,
    IntoStaticStr,
)]
pub enum EquipmentSlot {
    #[default]
    Weapon,
    Offhand,
    Head,
}

impl EquipmentSlot {
    pub fn label(self) -> &'static str {
        self.into()
    }

    pub fn all() -> &'static [EquipmentSlot] {
        EquipmentSlot::VARIANTS
    }
}

pub fn equip_held(world: &mut World, player: Entity, item: data::item::Id) -> Result<(), String> {
    let slot = world
        .get::<Inventory>(player)
        .and_then(|inventory| inventory.slots.iter().position(|stack| stack.item == item))
        .ok_or_else(|| {
            format!(
                "{} is not in your bag",
                item.get(world.resource::<Content>()).name
            )
        })?;
    equip(world, player, slot)
}

pub fn equip(world: &mut World, player: Entity, inv_slot: usize) -> Result<(), String> {
    let content = *world.resource::<Content>();
    let item = world
        .get::<Inventory>(player)
        .and_then(|inventory| inventory.slots.get(inv_slot).map(|slot| slot.item))
        .ok_or_else(|| "Nothing there".to_owned())?;
    let ItemKind::Equipment {
        slot: into,
        requires,
    } = item.get(&content).kind
    else {
        return Err(format!("{} can't be worn", item.get(&content).name));
    };
    if let Some(requires) = requires
        && let Some(unmet) = condition::parts(requires)
            .into_iter()
            .find(|part| !condition::holds(world, player, part))
    {
        return Err(format!(
            "{} needs {}",
            item.get(&content).name,
            condition::describe(&content, unmet)
        ));
    }
    let occupant = world
        .get::<Equipment>(player)
        .and_then(|equipment| equipment.slots.get(&into).copied());
    if let Some(mut inventory) = world.get_mut::<Inventory>(player) {
        inventory.slots.remove(inv_slot);
        if let Some(occupant) = occupant {
            inventory
                .exchange(&content, &[], &[ItemStack::new(occupant, 1)])
                .expect("the equipped item's slot was just freed");
        }
    }
    if let Some(mut equipment) = world.get_mut::<Equipment>(player) {
        equipment.slots.insert(into, item);
    }
    if let Some(occupant) = occupant {
        raise(world, occupant, EventKind::Unequipped, player);
    }
    raise(world, item, EventKind::Equipped, player);
    Ok(())
}

pub fn unequip_slot(world: &mut World, player: Entity, slot: EquipmentSlot) -> Result<(), String> {
    let content = *world.resource::<Content>();
    let item = world
        .get::<Equipment>(player)
        .and_then(|equipment| equipment.slots.get(&slot).copied())
        .ok_or_else(|| format!("Nothing worn as {}", slot.label()))?;
    let mut inventory = world
        .get_mut::<Inventory>(player)
        .ok_or_else(|| "Has no bag".to_owned())?;
    inventory
        .exchange(&content, &[], &[ItemStack::new(item, 1)])
        .map_err(|refusal| refusal.describe(&content))?;
    if let Some(mut equipment) = world.get_mut::<Equipment>(player) {
        equipment.slots.remove(&slot);
    }
    raise(world, item, EventKind::Unequipped, player);
    Ok(())
}

pub fn unequip(world: &mut World) {
    for request in crate::systems::requests::<UnequipRequest>(world) {
        let Some(player) = sender_player(world, request.client_id) else {
            continue;
        };
        if let Err(refusal) = unequip_slot(world, player, request.message.slot) {
            notification::notify(
                world,
                player,
                Notification::new(
                    NotificationKind::error(world.resource::<Content>()),
                    LineText::plain(refusal),
                ),
            );
        }
    }
}

fn raise(world: &mut World, item: data::item::Id, kind: EventKind, player: Entity) {
    world.resource_mut::<RiftInstances>().raise(
        Owner::Row(OwnerKind::Item, item.raw()),
        kind,
        Some(player),
        Vec::new(),
        |_| true,
    );
}

fn equipped(world: &World, entity: Entity) -> Vec<Effect> {
    let content = world.resource::<Content>();
    world
        .get::<Equipment>(entity)
        .map(|equipment| {
            equipment
                .slots
                .values()
                .flat_map(|item| item.get(content).effects())
                .collect()
        })
        .unwrap_or_default()
}
