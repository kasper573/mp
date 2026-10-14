use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{DroppedItem, Inventory, ItemId, ItemStack};
use crate::core::content::Content;
use crate::core::math::Pos;
use crate::core::script::{
    Compiler, EffectDef, EffectStep, Eval, FlowCx, Name, ScriptFault, ValueType,
};
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::Seconds;
use crate::systems::area::{AreaId, AreaTag};
use crate::systems::equipment::{self, EquipmentSlot};
use crate::systems::movement::{Position, position};
use crate::systems::player::Owner;
use crate::systems::script::effect::{self as effects, Aim, Arrow, Link};
use crate::systems::script::{Condition, EffectCall, Place, Reach, RiftScripting};
use crate::systems::visibility::Presence;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Items {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub take: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub give: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct UseItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: ItemId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub used: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Equip {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: ItemId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Unequip {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub slot: EquipmentSlot,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct DropItems {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub item: ItemId,
    pub count: Condition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct SpawnGroundItems {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<Spot>,
    #[serde(rename = "for")]
    pub for_whom: GroundItemsFor,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seconds: Option<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct ClearGroundItems {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<Spot>,
    pub within: Condition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct MoveItems {
    pub from: Condition,
    pub to: Condition,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Spot {
    Place(Place),
    Actor(Condition),
}

#[derive(JsonSchema, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroundItemsFor {
    Subject,
    Anyone,
}

impl EffectDef<RiftScripting> for Items {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let (take, give, refused) = (
            self.take.as_slice(),
            self.give.as_slice(),
            self.refused.as_deref(),
        );
        Ok(Box::new(move |world, _, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                return effects::refuse(world, cx, refused, "Nobody to trade with");
            };
            let outcome = exchange(world, actor, take, give);
            effects::settle(world, cx, refused, outcome)
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
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("used", self.used.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let (item, refused) = (self.item, self.refused.as_deref());
        Ok(Box::new(move |world, _, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                return effects::refuse(world, cx, refused, "Nobody to use it");
            };
            let outcome = super::use_held(world, actor, item);
            effects::settle(world, cx, refused, outcome)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Takes(self.item)]
    }
}

impl EffectDef<RiftScripting> for Equip {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let (item, refused) = (self.item, self.refused.as_deref());
        Ok(Box::new(move |world, _, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                return effects::refuse(world, cx, refused, "Nobody to equip");
            };
            let outcome = equipment::equip_held(world, actor, item);
            effects::settle(world, cx, refused, outcome)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for Unequip {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let (slot, refused) = (self.slot, self.refused.as_deref());
        Ok(Box::new(move |world, _, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                return effects::refuse(world, cx, refused, "Nobody to unequip");
            };
            let outcome = equipment::unequip_slot(world, actor, slot);
            effects::settle(world, cx, refused, outcome)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for DropItems {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let count = cx.expr(&self.count, ValueType::Integer)?;
        let (item, refused) = (self.item, self.refused.as_deref());
        Ok(Box::new(move |world, _, cx| {
            let Some(actor) = effects::aimed_character(world, cx, &who) else {
                return effects::refuse(world, cx, refused, "Nobody to drop them");
            };
            let count = count(world, cx).as_int().clamp(0, i64::from(u32::MAX)) as u32;
            let outcome = drop_held(world, actor, ItemStack::new(item, count));
            effects::settle(world, cx, refused, outcome)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Drops(self.item)]
    }
}

impl EffectDef<RiftScripting> for SpawnGroundItems {
    fn needs_subject(&self) -> bool {
        self.for_whom == GroundItemsFor::Subject || self.at.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let at = spot(cx, self.at.as_ref())?;
        let seconds = cx.opt_expr(self.seconds.as_ref(), ValueType::Number)?;
        let (items, for_whom) = (self.items.as_slice(), self.for_whom);
        Ok(Box::new(move |world, _, cx| {
            let Some((area, from)) = at(world, cx) else {
                return EffectStep::Done;
            };
            let ttl = seconds
                .as_ref()
                .map(|seconds| Seconds(seconds(world, cx).as_num() as f32));
            let client = cx
                .subject
                .filter(|_| for_whom == GroundItemsFor::Subject)
                .and_then(|subject| world.get::<Owner>(subject))
                .map(|owner| owner.client);
            let presence = client.map(Presence::For);
            let drops: Vec<(ItemId, u32)> = items
                .iter()
                .map(|stack| (stack.item, stack.count))
                .collect();
            super::scatter_at(world, from, area, &drops, client, presence, ttl);
            EffectStep::Done
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
    fn needs_subject(&self) -> bool {
        self.at.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let at = spot(cx, self.at.as_ref())?;
        let within = effects::number(cx, &self.within)?;
        Ok(Box::new(move |world, _, cx| {
            let Some((area, center)) = at(world, cx) else {
                return EffectStep::Done;
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
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for MoveItems {
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let from = cx.expr(&self.from, ValueType::Actor)?;
        let to = cx.expr(&self.to, ValueType::Actor)?;
        let (items, refused) = (self.items.as_slice(), self.refused.as_deref());
        Ok(Box::new(move |world, _, cx| {
            let (Some(from), Some(to)) = (
                effects::aimed_character(world, cx, &from),
                effects::aimed_character(world, cx, &to),
            ) else {
                return effects::refuse(world, cx, refused, "Nobody to trade between");
            };
            let outcome = move_between(world, from, to, items);
            effects::settle(world, cx, refused, outcome)
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

type SpotEval = Box<dyn Fn(&World, &FlowCx) -> Option<(AreaId, Pos<Tiles>)> + Send + Sync>;

fn spot(
    cx: &mut Compiler<RiftScripting>,
    at: Option<&'static Spot>,
) -> Result<SpotEval, ScriptFault> {
    Ok(match at {
        Some(Spot::Place(place)) => {
            let place = *place;
            Box::new(move |_, _| Some((place.area, place.at)))
        }
        Some(Spot::Actor(actor)) => {
            let actor: Eval = cx.expr(actor, ValueType::Actor)?;
            Box::new(move |world, cx| {
                let who = effects::aimed(world, cx, &actor)?;
                standing(world, who)
            })
        }
        None => Box::new(|world, cx| cx.owner.or(cx.subject).and_then(|who| standing(world, who))),
    })
}

fn standing(world: &World, who: Entity) -> Option<(AreaId, Pos<Tiles>)> {
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
    super::scatter_drop(world, actor, &[(stack.item, stack.count)], None, None);
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
