pub mod card;
pub mod effects;
pub mod render;
pub mod widget;

use std::borrow::Cow;

use bevy_app::App;
use bevy_ecs::component::Component;
use bevy_ecs::entity::{Entity, MapEntities};
use bevy_ecs::message::Message;
use bevy_ecs::query::{QueryState, With};
use bevy_ecs::world::World;
use bevy_replicon::prelude::Replicated;
use bevy_time::Time;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};

use crate::core::assets::AssetRef;
use crate::core::audio::playback::SfxId;
use crate::core::content::{Content, ContentId, ContentRow, ModuleRule, ModuleSet, serial};
use crate::core::math::{Offset, Pos};
use crate::core::script::{Owner as ScriptOwner, OwnerKind};
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::{Seconds, WallClock};
use crate::systems::area::{self, AreaTag};
use crate::systems::effect::{self, Effect, TimedEffect, TimedEffects};
use crate::systems::movement::{Position, position};
use crate::systems::notification::{self, Notification, NotificationKind};
use crate::systems::npc::Npc;
use crate::systems::player::{ClientId, Owner, commands_locked, sender_player};
use crate::systems::reach::{self, Pursuit, ReachAct};
use crate::systems::script::ScriptModule;
use crate::systems::script::{Condition, EventKind, RiftInstances};
use crate::systems::stat::{self, Stat};
use crate::systems::text::LineText;
use crate::systems::visibility::{self, Presence, seen_by};
use crate::systems::{drain_requests, equipment};

pub const INVENTORY_MAX: u32 = 25;
const RESERVATION_TTL: Seconds = Seconds(60.0);
const DROP_TTL: Seconds = Seconds(120.0);
const DROP_RADIUS: Tiles = Tiles(1.0);
const PICKUP_RANGE: Tiles = Tiles(1.0);

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;

    app.replicate::<Inventory>()
        .replicate::<DroppedItem>()
        .replicate::<Reservation>()
        .add_client_message::<UseItemRequest>(Channel::Ordered)
        .add_client_message::<DropItemRequest>(Channel::Ordered)
        .add_mapped_client_message::<PickupRequest>(Channel::Ordered)
        .add_mapped_server_message::<ItemConsumed>(Channel::Ordered)
        .add_mapped_server_message::<ItemsDropped>(Channel::Ordered);
    effect::source(app, carried);
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Inventory {
    pub slots: Vec<ItemStack>,
    pub max: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemStack {
    pub item: Id,
    pub count: u32,
}

/// The file form leaves a count of one out; the wire form always carries it, as a binary format
/// cannot tell an omitted field from a missing one.
#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ItemStackRow {
    item: Id,
    #[serde(default = "serial::one", skip_serializing_if = "serial::is_one")]
    count: u32,
}

impl Serialize for ItemStack {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if serializer.is_human_readable() {
            return ItemStackRow {
                item: self.item,
                count: self.count,
            }
            .serialize(serializer);
        }
        (self.item, self.count).serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ItemStack {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<ItemStack, D::Error> {
        if deserializer.is_human_readable() {
            let ItemStackRow { item, count } = ItemStackRow::deserialize(deserializer)?;
            return Ok(ItemStack { item, count });
        }
        let (item, count) = <(Id, u32)>::deserialize(deserializer)?;
        Ok(ItemStack { item, count })
    }
}

impl JsonSchema for ItemStack {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("ItemStack")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        ItemStackRow::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

impl ItemStack {
    pub const fn new(item: Id, count: u32) -> ItemStack {
        ItemStack { item, count }
    }

    pub fn describe(self, content: &Content) -> String {
        format!("{} {}", self.count, self.item.get(content).name)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExchangeRefusal {
    Missing(ItemStack),
    NoRoom { slots: u32 },
}

impl ExchangeRefusal {
    pub fn describe(self, content: &Content) -> String {
        match self {
            ExchangeRefusal::Missing(stack) => {
                format!(
                    "Needs {} more {}",
                    stack.count,
                    stack.item.get(content).name
                )
            }
            ExchangeRefusal::NoRoom { slots: 1 } => "Needs 1 free slot".to_owned(),
            ExchangeRefusal::NoRoom { slots } => format!("Needs {slots} free slots"),
        }
    }
}

impl Inventory {
    pub fn empty() -> Inventory {
        Inventory {
            slots: Vec::new(),
            max: INVENTORY_MAX,
        }
    }

    pub fn count(&self, item: Id) -> u32 {
        self.slots
            .iter()
            .filter(|slot| slot.item == item)
            .fold(0, |total, slot| total.saturating_add(slot.count))
    }

    pub fn free_slots(&self) -> u32 {
        self.max.saturating_sub(self.slots.len() as u32)
    }

    pub fn set_count(&mut self, item: Id, count: u32) {
        self.slots.retain(|slot| slot.item != item);
        if count > 0 {
            self.slots.push(ItemStack { item, count });
        }
    }

    pub fn exchange(
        &mut self,
        content: &Content,
        takes: &[ItemStack],
        gives: &[ItemStack],
    ) -> Result<(), ExchangeRefusal> {
        let mut next = self.clone();
        for take in merged(takes) {
            let held = next.count(take.item);
            if held < take.count {
                return Err(ExchangeRefusal::Missing(ItemStack::new(
                    take.item,
                    take.count - held,
                )));
            }
            next.remove(take);
        }
        let mut unbounded = next.clone();
        unbounded.max = u32::MAX;
        for give in gives {
            unbounded.add(content, give.item, give.count);
        }
        let needed = unbounded.slots.len() as u32;
        if needed > next.max {
            return Err(ExchangeRefusal::NoRoom {
                slots: needed - next.max,
            });
        }
        *self = unbounded;
        self.max = next.max;
        Ok(())
    }

    fn add(&mut self, content: &Content, item: Id, mut count: u32) {
        let stack_max = item.get(content).stack_max();
        for slot in self.slots.iter_mut().filter(|slot| slot.item == item) {
            if count == 0 {
                break;
            }
            let take = stack_max.saturating_sub(slot.count).min(count);
            slot.count += take;
            count -= take;
        }
        while count > 0 && (self.slots.len() as u32) < self.max {
            let take = stack_max.min(count);
            self.slots.push(ItemStack::new(item, take));
            count -= take;
        }
    }

    fn remove(&mut self, stack: ItemStack) {
        let mut left = stack.count;
        for slot in self
            .slots
            .iter_mut()
            .rev()
            .filter(|slot| slot.item == stack.item)
        {
            let take = slot.count.min(left);
            slot.count -= take;
            left -= take;
        }
        self.slots.retain(|slot| slot.count > 0);
    }
}

fn merged(stacks: &[ItemStack]) -> Vec<ItemStack> {
    let mut merged: Vec<ItemStack> = Vec::new();
    for stack in stacks {
        match merged
            .iter_mut()
            .find(|existing| existing.item == stack.item)
        {
            Some(existing) => existing.count = existing.count.saturating_add(stack.count),
            None => merged.push(*stack),
        }
    }
    merged
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReservedBy {
    None,
    Account(ClientId),
}

impl ReservedBy {
    pub fn allows(self, account: Option<ClientId>) -> bool {
        match self {
            ReservedBy::None => true,
            ReservedBy::Account(client) => account == Some(client),
        }
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Reservation {
    pub by: ReservedBy,
    pub at: Seconds,
}

impl Reservation {
    pub fn expired(&self, now: Seconds) -> bool {
        now - self.at >= RESERVATION_TTL
    }
}

#[derive(Component, Clone, Copy, Debug, PartialEq)]
pub struct DropLife(pub Seconds);

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DroppedItem {
    pub item: Id,
    pub count: u32,
}

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UseItemRequest {
    pub slot: u32,
}

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DropItemRequest {
    pub slot: u32,
}

#[derive(Message, Serialize, Deserialize, MapEntities, Clone, Debug, PartialEq)]
pub struct PickupRequest {
    #[entities]
    pub target: Entity,
}

#[derive(Message, Serialize, Deserialize, MapEntities, Clone, Debug, PartialEq)]
pub struct ItemConsumed {
    pub item: Id,
    #[entities]
    pub actor: Entity,
}

#[derive(Message, Serialize, Deserialize, MapEntities, Clone, Debug, PartialEq)]
pub struct ItemsDropped {
    #[entities]
    pub items: Vec<Entity>,
    pub from: Pos<Tiles>,
}

pub type Id = ContentId<ItemDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct ItemDef {
    pub name: String,
    pub icon: AssetRef,
    pub sfx: ItemSfx,
    pub kind: ItemKind,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<ItemModule>,
}

impl ContentRow for ItemDef {
    const TABLE: &'static str = "item";
}

impl ModuleSet for ItemDef {
    type Module = ItemModule;

    fn modules(&self) -> &[ItemModule] {
        &self.modules
    }

    fn rule(module: &ItemModule) -> ModuleRule {
        match module {
            ItemModule::Stat(_) => ModuleRule::AnyNumber,
            _ => ModuleRule::AtMostOne,
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ItemModule {
    Flavor(Flavor),
    Stack(Stack),
    Stat(Stat),
    Chasing,
    QuestItem,
    Bound,
    Currency,
    #[serde(untagged)]
    Script(ScriptModule),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Flavor {
    pub text: String,
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
pub struct Stack {
    pub max: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemFlag {
    Quest,
    Bound,
    Currency,
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ItemCategory {
    Consumable,
    Equipment,
    Material,
    Currency,
}

impl ItemCategory {
    pub fn label(self) -> &'static str {
        match self {
            ItemCategory::Consumable => "Consumable",
            ItemCategory::Equipment => "Equipment",
            ItemCategory::Material => "Material",
            ItemCategory::Currency => "Currency",
        }
    }

    pub fn plural(self) -> &'static str {
        match self {
            ItemCategory::Consumable => "consumables",
            ItemCategory::Equipment => "equipment",
            ItemCategory::Material => "materials",
            ItemCategory::Currency => "currency",
        }
    }
}

impl ItemDef {
    pub fn scripts(&self) -> Vec<(usize, &ScriptModule)> {
        self.modules
            .iter()
            .enumerate()
            .filter_map(|(index, module)| match module {
                ItemModule::Script(script) => Some((index, script)),
                _ => None,
            })
            .collect()
    }

    pub fn flavor(&self) -> Option<&str> {
        self.modules.iter().find_map(|module| match module {
            ItemModule::Flavor(flavor) => Some(flavor.text.as_str()),
            _ => None,
        })
    }

    pub fn stack_max(&self) -> u32 {
        self.modules
            .iter()
            .find_map(|module| match module {
                ItemModule::Stack(stack) => Some(stack.max),
                _ => None,
            })
            .unwrap_or(1)
    }

    pub fn stats(&self) -> impl Iterator<Item = Stat> + '_ {
        self.modules.iter().filter_map(|module| match module {
            ItemModule::Stat(stat) => Some(*stat),
            _ => None,
        })
    }

    pub fn effects(&self) -> impl Iterator<Item = Effect> + '_ {
        self.modules.iter().filter_map(|module| match module {
            ItemModule::Stat(stat) => Some(Effect::StatModifier(*stat)),
            ItemModule::Chasing => Some(Effect::Chasing),
            _ => None,
        })
    }

    pub fn has(&self, flag: ItemFlag) -> bool {
        self.modules.iter().any(|module| {
            matches!(
                (module, flag),
                (ItemModule::QuestItem, ItemFlag::Quest)
                    | (ItemModule::Bound, ItemFlag::Bound)
                    | (ItemModule::Currency, ItemFlag::Currency)
            )
        })
    }

    pub fn bound(&self) -> bool {
        self.has(ItemFlag::Bound) || self.has(ItemFlag::Quest)
    }

    pub fn category(&self) -> ItemCategory {
        if self.has(ItemFlag::Currency) {
            return ItemCategory::Currency;
        }
        match self.kind {
            ItemKind::Consumable { .. } => ItemCategory::Consumable,
            ItemKind::Equipment { .. } => ItemCategory::Equipment,
            ItemKind::Resource | ItemKind::Usable => ItemCategory::Material,
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ItemKind {
    Consumable {
        health_bonus: f32,
        lasts: Seconds,
    },
    Equipment {
        slot: equipment::EquipmentSlot,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        requires: Option<Condition>,
    },
    Usable,
    Resource,
}

impl ItemKind {
    fn carried(&self) -> bool {
        matches!(self, ItemKind::Resource)
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct ItemSfx {
    pub pickup: SfxId,
    pub trade: SfxId,
    pub drop: SfxId,
    #[serde(rename = "use", default, skip_serializing_if = "Option::is_none")]
    pub on_use: Option<SfxId>,
}

pub fn use_item(world: &mut World) {
    for request in drain_requests::<UseItemRequest>(world) {
        let Some(entity) = sender_player(world, request.client_id) else {
            continue;
        };
        if stat::is_dead(world, entity) {
            continue;
        }
        if let Err(refusal) = use_slot(world, entity, request.message.slot as usize) {
            notification::notify(
                world,
                entity,
                Notification::new(
                    NotificationKind::error(world.resource::<Content>()),
                    LineText::plain(refusal),
                ),
            );
        }
    }
}

pub fn use_held(world: &mut World, actor: Entity, item: Id) -> Result<(), String> {
    let slot = world
        .get::<Inventory>(actor)
        .and_then(|inventory| inventory.slots.iter().position(|stack| stack.item == item))
        .ok_or_else(|| {
            format!(
                "{} is not in the bag",
                item.get(world.resource::<Content>()).name
            )
        })?;
    use_slot(world, actor, slot)
}

fn use_slot(world: &mut World, actor: Entity, slot: usize) -> Result<(), String> {
    let content = *world.resource::<Content>();
    let item = world
        .get::<Inventory>(actor)
        .and_then(|inventory| inventory.slots.get(slot).map(|slot| slot.item))
        .ok_or_else(|| "Nothing there".to_owned())?;
    match item.get(&content).kind {
        ItemKind::Consumable {
            health_bonus,
            lasts,
        } => {
            stat::heal(world, actor, health_bonus);
            consume_slot(world, actor, slot);
            announce_consumed(world, actor, item);
            instantiate_effects(world, actor, item, lasts);
            Ok(())
        }
        ItemKind::Equipment { .. } => equipment::equip(world, actor, slot),
        ItemKind::Usable => {
            raise(world, item, EventKind::Used, actor);
            Ok(())
        }
        ItemKind::Resource => Ok(()),
    }
}

fn raise(world: &mut World, item: Id, kind: EventKind, actor: Entity) {
    world.resource_mut::<RiftInstances>().raise(
        ScriptOwner::Row(OwnerKind::Item, item.raw()),
        kind,
        Some(actor),
        Vec::new(),
        |_| true,
    );
}

pub fn drop_item(world: &mut World) {
    let content = *world.resource::<Content>();
    for request in drain_requests::<DropItemRequest>(world) {
        let Some(player) = sender_player(world, request.client_id) else {
            continue;
        };
        if stat::is_dead(world, player) {
            continue;
        }
        let slot = request.message.slot as usize;
        let removed = match world.get_mut::<Inventory>(player) {
            Some(mut inventory)
                if inventory
                    .slots
                    .get(slot)
                    .is_some_and(|stack| !stack.item.get(&content).bound()) =>
            {
                Some(inventory.slots.remove(slot))
            }
            _ => None,
        };
        let Some(slot) = removed else {
            continue;
        };
        scatter_drop(
            world,
            player,
            &[(slot.item, slot.count)],
            ReservedBy::None,
            None,
        );
    }
}

pub fn pickup_request(world: &mut World) {
    for request in drain_requests::<PickupRequest>(world) {
        let Some(player) = sender_player(world, request.client_id) else {
            continue;
        };
        let target = request.message.target;
        if stat::is_dead(world, player)
            || commands_locked(world, player)
            || world.get::<DroppedItem>(target).is_none()
            || !visibility::present(world, target, player)
        {
            continue;
        }
        reach::intend(world, player, target, ReachAct::Pickup);
    }
}

pub fn pickable_at(world: &mut World, point: Pos<Tiles>) -> Option<Entity> {
    let me = crate::systems::player::session::my_id(world);
    let cell = point.cell();
    world
        .query::<(Entity, &Position, &DroppedItem, Option<&Reservation>)>()
        .iter(world)
        .find_map(|(entity, at, _, reservation)| {
            let reserved = reservation.map_or(ReservedBy::None, |reservation| reservation.by);
            (at.pos.cell() == cell && reserved.allows(me)).then_some(entity)
        })
}

pub fn pickups(world: &mut World, intents: &mut reach::Intents) {
    for (player, target) in reach::intending(world, intents, ReachAct::Pickup) {
        match reach::pursue(world, player, PICKUP_RANGE) {
            Pursuit::Approaching => {}
            Pursuit::Lost => reach::forget(world, player),
            Pursuit::Arrived => {
                collect(world, player, target);
                reach::forget(world, player);
            }
        }
    }
}

pub fn expire_drops(
    world: &mut World,
    drops: &mut QueryState<(Entity, &'static Reservation), With<DroppedItem>>,
) {
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let stale: Vec<Entity> = drops
        .iter(world)
        .filter(|(entity, reservation)| {
            let ttl = world
                .get::<DropLife>(*entity)
                .map_or(DROP_TTL, |life| life.0);
            now - reservation.at >= ttl
        })
        .map(|(entity, _)| entity)
        .collect();
    for entity in stale {
        world.entity_mut(entity).despawn();
    }
}

pub fn reserve(world: &mut World, npc: Entity, attacker: Entity, now: Seconds) {
    let Some(account) = world.get::<Owner>(attacker).map(|owner| owner.client) else {
        return;
    };
    if world.get::<Npc>(npc).is_none() {
        return;
    }
    let claim = match world.get::<Reservation>(npc) {
        None => true,
        Some(reservation) => {
            reservation.by == ReservedBy::Account(account) || reservation.expired(now)
        }
    };
    if claim {
        world.entity_mut(npc).insert(Reservation {
            by: ReservedBy::Account(account),
            at: now,
        });
    }
}

pub fn scatter_drop(
    world: &mut World,
    source: Entity,
    drops: &[(Id, u32)],
    reserved_by: ReservedBy,
    presence: Option<Presence>,
) {
    let Some(from) = position(world, source) else {
        return;
    };
    let Some(area_id) = world.get::<AreaTag>(source).map(|tag| tag.area) else {
        return;
    };
    scatter_at(world, from, area_id, drops, reserved_by, presence, None);
}

pub fn scatter_at(
    world: &mut World,
    from: Pos<Tiles>,
    area_id: area::Id,
    drops: &[(Id, u32)],
    reserved_by: ReservedBy,
    presence: Option<Presence>,
    life: Option<Seconds>,
) {
    if drops.is_empty() {
        return;
    }
    let area = area::load(world.resource::<Content>(), area_id);
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let count = drops.len();
    let mut items = Vec::with_capacity(count);
    for (index, &(item, stack)) in drops.iter().enumerate() {
        let pos = scatter_pos(from, index, count, area);
        let entity = world
            .spawn((
                Replicated,
                Position { pos },
                AreaTag { area: area_id },
                DroppedItem { item, count: stack },
                Reservation {
                    by: reserved_by,
                    at: now,
                },
            ))
            .id();
        if let Some(presence) = &presence {
            world.entity_mut(entity).insert(presence.clone());
        }
        if let Some(life) = life {
            world.entity_mut(entity).insert(DropLife(life));
        }
        items.push(entity);
    }
    for client in seen_by(world, items[0]) {
        visibility::send_to(
            world,
            client,
            ItemsDropped {
                items: items.clone(),
                from,
            },
        );
    }
}

fn carried(world: &World, entity: Entity) -> Vec<Effect> {
    let content = world.resource::<Content>();
    world
        .get::<Inventory>(entity)
        .map(|inventory| {
            inventory
                .slots
                .iter()
                .map(|slot| slot.item.get(content))
                .filter(|def| def.kind.carried())
                .flat_map(|def| def.effects())
                .collect()
        })
        .unwrap_or_default()
}

fn announce_consumed(world: &mut World, actor: Entity, item: Id) {
    for client in seen_by(world, actor) {
        visibility::send_to(world, client, ItemConsumed { item, actor });
    }
}

fn consume_slot(world: &mut World, entity: Entity, slot: usize) {
    if let Some(mut inventory) = world.get_mut::<Inventory>(entity)
        && let Some(stack) = inventory.slots.get_mut(slot)
    {
        stack.count -= 1;
        if stack.count == 0 {
            inventory.slots.remove(slot);
        }
    }
}

fn collect(world: &mut World, player: Entity, item: Entity) {
    let Some(drop) = world.get::<DroppedItem>(item).cloned() else {
        return;
    };
    let reserved = world
        .get::<Reservation>(item)
        .map_or(ReservedBy::None, |reservation| reservation.by);
    let account = world.get::<Owner>(player).map(|owner| owner.client);
    if !reserved.allows(account) {
        return;
    }
    let content = *world.resource::<Content>();
    let collected = world
        .get_mut::<Inventory>(player)
        .is_some_and(|mut inventory| {
            inventory
                .exchange(&content, &[], &[ItemStack::new(drop.item, drop.count)])
                .is_ok()
        });
    if collected {
        world.entity_mut(item).despawn();
        raise(world, drop.item, EventKind::PickedUp, player);
    }
}

fn instantiate_effects(world: &mut World, actor: Entity, item: Id, duration: Seconds) {
    let content = *world.resource::<Content>();
    let until = world.resource::<WallClock>().now.after(duration);
    let entries = item
        .get(&content)
        .effects()
        .map(|effect| TimedEffect { effect, until })
        .collect::<Vec<_>>();
    if entries.is_empty() {
        return;
    }
    match world.get_mut::<TimedEffects>(actor) {
        Some(mut timed) => timed.0.extend(entries),
        None => {
            world.entity_mut(actor).insert(TimedEffects(entries));
        }
    }
}

fn scatter_pos(from: Pos<Tiles>, index: usize, count: usize, area: &area::Area) -> Pos<Tiles> {
    let rest = from.snap();
    if count == 1 {
        return area.grid.nearest_walkable(from).unwrap_or(rest);
    }
    let angle = std::f32::consts::TAU * index as f32 / count as f32;
    let spread = from + Offset::new(angle.cos() * DROP_RADIUS.0, angle.sin() * DROP_RADIUS.0);
    area.grid.nearest_walkable(spread).unwrap_or(rest)
}
