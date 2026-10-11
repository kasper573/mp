use bevy_ecs::prelude::*;
use serde::Serialize;

use super::{DroppedItem, Id, Inventory, ItemStack, ReservedBy};
use crate::core::content::Content;
use crate::core::content::serial;
use crate::core::math::Pos;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Eval, FlowCx, Name, OwnerKind, ValueType,
};
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::Seconds;
use crate::systems::area::{self, AreaTag};
use crate::systems::equipment::{self, EquipmentSlot};
use crate::systems::movement::{Position, position};
use crate::systems::player::Owner;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Condition, Place, Reach, RiftScripting};
use crate::systems::visibility::Presence;

#[derive(Clone, Serialize)]
pub struct Items {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub take: &'static [ItemStack],
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub give: &'static [ItemStack],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Serialize)]
pub struct UseItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Serialize)]
pub struct Equip {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Serialize)]
pub struct Unequip {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub slot: EquipmentSlot,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Serialize)]
pub struct DropItems {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: Id,
    pub count: &'static Condition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Serialize)]
pub struct SpawnGroundItems {
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub items: &'static [ItemStack],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<Spot>,
    #[serde(rename = "for", serialize_with = "ground_items_for")]
    pub for_subject: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seconds: Option<&'static Condition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(Clone, Serialize)]
pub struct ClearGroundItems {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<Spot>,
    pub within: &'static Condition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(Clone, Serialize)]
pub struct MoveItems {
    pub from: &'static Condition,
    pub to: &'static Condition,
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub items: &'static [ItemStack],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Clone, Copy, Serialize)]
#[serde(untagged)]
pub enum Spot {
    Place(Place),
    Actor(&'static Condition),
}

fn ground_items_for<S: serde::Serializer>(
    for_subject: &bool,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(if *for_subject { "subject" } else { "anyone" })
}

impl EffectDef<RiftScripting> for Items {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (take, give, refused) = (self.take, self.give, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to trade with");
                return EffectStep::Output(1);
            };
            match exchange(world, actor, take, give) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        self.take
            .iter()
            .map(|stack| Reach::Takes(stack.item))
            .chain(self.give.iter().map(|stack| Reach::Gives(stack.item)))
            .collect()
    }
}

impl EffectDef<RiftScripting> for UseItem {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("used", self.used), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (item, refused) = (self.item, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to use it");
                return EffectStep::Output(1);
            };
            match super::use_held(world, actor, item) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Takes(self.item)]
    }
}

impl EffectDef<RiftScripting> for Equip {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (item, refused) = (self.item, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to equip");
                return EffectStep::Output(1);
            };
            match equipment::equip_held(world, actor, item) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for Unequip {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (slot, refused) = (self.slot, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to unequip");
                return EffectStep::Output(1);
            };
            match equipment::unequip_slot(world, actor, slot) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for DropItems {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let count = cx
            .expr(self.count, ValueType::Integer)
            .map_err(effects::bad)?;
        let (item, refused) = (self.item, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to drop them");
                return EffectStep::Output(1);
            };
            let count = count(world, cx).as_int().clamp(0, i64::from(u32::MAX)) as u32;
            match drop_held(world, actor, ItemStack::new(item, count)) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Drops(self.item)]
    }
}

impl EffectDef<RiftScripting> for SpawnGroundItems {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.for_subject || self.at.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let at = spot(cx, self.at)?;
        let seconds = cx
            .opt_expr(self.seconds, ValueType::Number)
            .map_err(effects::bad)?;
        let (items, for_subject) = (self.items, self.for_subject);
        Ok(Box::new(move |world, cx| {
            let Some((area, from)) = at(world, cx) else {
                return EffectStep::Output(0);
            };
            let ttl = seconds
                .as_ref()
                .map(|seconds| Seconds(seconds(world, cx).as_num() as f32));
            let client = cx
                .subject
                .filter(|_| for_subject)
                .and_then(|subject| world.get::<Owner>(subject))
                .map(|owner| owner.client);
            let (reserved, presence) = match client {
                Some(client) => (ReservedBy::Account(client), Some(Presence::For(client))),
                None => (ReservedBy::None, None),
            };
            let drops: Vec<(Id, u32)> = items
                .iter()
                .map(|stack| (stack.item, stack.count))
                .collect();
            super::scatter_at(world, from, area, &drops, reserved, presence, ttl);
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        self.items
            .iter()
            .map(|stack| Reach::Drops(stack.item))
            .collect()
    }
}

impl EffectDef<RiftScripting> for ClearGroundItems {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.at.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let at = spot(cx, self.at)?;
        let within = effects::number(cx, self.within)?;
        Ok(Box::new(move |world, cx| {
            let Some((area, center)) = at(world, cx) else {
                return EffectStep::Output(0);
            };
            let within = Tiles(within(world, cx).as_num() as f32);
            let cleared: Vec<Entity> = world
                .iter_entities()
                .filter(|entity| entity.get::<DroppedItem>().is_some())
                .filter(|entity| entity.get::<AreaTag>().is_some_and(|tag| tag.area == area))
                .filter(|entity| {
                    entity
                        .get::<Position>()
                        .is_some_and(|at| at.pos.distance(center) <= within)
                })
                .map(|entity| entity.id())
                .collect();
            for entity in cleared {
                world.despawn(entity);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for MoveItems {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let from = cx.expr(self.from, ValueType::Actor).map_err(effects::bad)?;
        let to = cx.expr(self.to, ValueType::Actor).map_err(effects::bad)?;
        let (items, refused) = (self.items, self.refused);
        Ok(Box::new(move |world, cx| {
            let (Some(from), Some(to)) = (
                effects::aimed_character(world, cx, &from),
                effects::aimed_character(world, cx, &to),
            ) else {
                effects::refuse(world, cx, refused, "Nobody to trade between");
                return EffectStep::Output(1);
            };
            match move_between(world, from, to, items) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        self.items
            .iter()
            .flat_map(|stack| [Reach::Takes(stack.item), Reach::Gives(stack.item)])
            .collect()
    }
}

pub fn exchange(
    world: &mut World,
    actor: Entity,
    take: &[ItemStack],
    give: &[ItemStack],
) -> Result<(), String> {
    let content = *world.resource::<Content>();
    let mut inventory = world
        .get_mut::<Inventory>(actor)
        .ok_or_else(|| "Has no bag".to_owned())?;
    inventory
        .exchange(&content, take, give)
        .map_err(|refusal| refusal.describe(&content))
}

type SpotEval = Box<dyn Fn(&World, &FlowCx) -> Option<(area::Id, Pos<Tiles>)> + Send + Sync>;

fn spot(cx: &mut Compiler<RiftScripting>, at: Option<Spot>) -> Result<SpotEval, String> {
    Ok(match at {
        Some(Spot::Place(place)) => Box::new(move |_, _| Some((place.area, place.at))),
        Some(Spot::Actor(actor)) => {
            let actor: Eval = cx.expr(actor, ValueType::Actor).map_err(effects::bad)?;
            Box::new(move |world, cx| {
                let who = effects::aimed(world, cx, &actor)?;
                standing(world, who)
            })
        }
        None => Box::new(|world, cx| {
            cx.owner
                .entity()
                .or(cx.subject)
                .and_then(|who| standing(world, who))
        }),
    })
}

fn standing(world: &World, who: Entity) -> Option<(area::Id, Pos<Tiles>)> {
    Some((world.get::<AreaTag>(who)?.area, position(world, who)?))
}

fn drop_held(world: &mut World, actor: Entity, stack: ItemStack) -> Result<(), String> {
    let content = *world.resource::<Content>();
    if stack.item.get(&content).bound() {
        return Err(format!("{} is bound to you", stack.item.get(&content).name));
    }
    let mut inventory = world
        .get_mut::<Inventory>(actor)
        .ok_or_else(|| "Has no bag".to_owned())?;
    inventory
        .exchange(&content, &[stack], &[])
        .map_err(|refusal| refusal.describe(&content))?;
    super::scatter_drop(
        world,
        actor,
        &[(stack.item, stack.count)],
        ReservedBy::None,
        None,
    );
    Ok(())
}

fn move_between(
    world: &mut World,
    from: Entity,
    to: Entity,
    items: &[ItemStack],
) -> Result<(), String> {
    let content = *world.resource::<Content>();
    if let Some(bound) = items.iter().find(|stack| stack.item.get(&content).bound()) {
        return Err(format!("{} is bound", bound.item.get(&content).name));
    }
    let mut giving = world
        .get::<Inventory>(from)
        .cloned()
        .ok_or_else(|| "Has no bag".to_owned())?;
    let mut taking = world
        .get::<Inventory>(to)
        .cloned()
        .ok_or_else(|| "Has no bag".to_owned())?;
    giving
        .exchange(&content, items, &[])
        .map_err(|refusal| refusal.describe(&content))?;
    taking
        .exchange(&content, &[], items)
        .map_err(|refusal| refusal.describe(&content))?;
    world.entity_mut(from).insert(giving);
    world.entity_mut(to).insert(taking);
    Ok(())
}
