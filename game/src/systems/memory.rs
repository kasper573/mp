use std::collections::BTreeMap;

use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::{Content, ContentId};
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind, Value, ValueType,
};
use crate::core::time::{GameDay, Seconds, UnixMillis, WallClock};
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow, Link};
use crate::systems::script::{Condition, Reach, RiftScripting};

pub type Id = ContentId<MemoryDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct MemoryDef {
    pub label: String,
    #[serde(rename = "type")]
    pub ty: ValueType,
    pub resets: Resets,
}

impl crate::core::content::ContentRow for MemoryDef {
    const TABLE: &'static str = "memory";
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Resets {
    Never,
    Daily,
    LeavingArea,
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Memory(BTreeMap<Id, Recollection>);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Recollection {
    value: Value,
    at: UnixMillis,
    day: GameDay,
}

impl Recollection {
    fn holds(&self, resets: Resets, clock: WallClock) -> bool {
        resets != Resets::Daily || self.day == clock.day()
    }
}

impl Memory {
    pub fn get(&self, content: &Content, key: Id, clock: WallClock) -> Value {
        let def = key.get(content);
        match self.0.get(&key) {
            Some(recollection) if recollection.holds(def.resets, clock) => {
                recollection.value.clone()
            }
            _ => def.ty.zero(),
        }
    }

    pub fn is_set(&self, content: &Content, key: Id, clock: WallClock) -> bool {
        self.get(content, key, clock).truthy()
    }

    pub fn set(&mut self, content: &Content, key: Id, value: Value, clock: WallClock) {
        let ty = key.get(content).ty;
        self.0.insert(
            key,
            Recollection {
                value: value.widened(ty),
                at: clock.now,
                day: clock.day(),
            },
        );
    }

    pub fn set_within(&self, content: &Content, key: Id, lasts: Seconds, clock: WallClock) -> bool {
        let def = key.get(content);
        self.0.get(&key).is_some_and(|recollection| {
            recollection.holds(def.resets, clock) && clock.now.since(recollection.at) < lasts
        })
    }

    pub fn forget(&mut self, key: Id) {
        self.0.remove(&key);
    }

    pub fn leave_area(&mut self, content: &Content) {
        self.0
            .retain(|key, _| key.get(content).resets != Resets::LeavingArea);
    }
}

pub fn get(world: &World, player: Entity, key: Id) -> Value {
    let clock = *world.resource::<WallClock>();
    let content = world.resource::<Content>();
    world.get::<Memory>(player).map_or_else(
        || key.get(content).ty.zero(),
        |memory| memory.get(content, key, clock),
    )
}

pub fn set_within(world: &World, player: Entity, key: Id, lasts: Seconds) -> bool {
    let clock = *world.resource::<WallClock>();
    world
        .get::<Memory>(player)
        .is_some_and(|memory| memory.set_within(world.resource::<Content>(), key, lasts, clock))
}

pub fn set(world: &mut World, player: Entity, key: Id, value: Value) {
    let clock = *world.resource::<WallClock>();
    let content = *world.resource::<Content>();
    if let Some(mut memory) = world.get_mut::<Memory>(player) {
        memory.set(&content, key, value, clock);
    }
}

pub fn forget(world: &mut World, player: Entity, key: Id) {
    if let Some(mut memory) = world.get_mut::<Memory>(player) {
        memory.forget(key);
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Remember {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub memory: Id,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Forget {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub memories: Vec<Id>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Remember {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, &self.who)?;
        let ty = self.memory.get(cx.content).ty;
        let to = cx.opt_expr(self.to.as_ref(), ty).map_err(effects::bad)?;
        let memory = self.memory;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                let value = match &to {
                    Some(to) => to(world, cx),
                    None => Value::Bool(true).widened(ty),
                };
                set(world, player, memory, value);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Remembers(self.memory)]
    }
}

impl EffectDef<RiftScripting> for Forget {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, &self.who)?;
        let memories = self.memories.as_slice();
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                for &memory in memories {
                    forget(world, player, memory);
                }
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        self.memories
            .iter()
            .map(|memory| Reach::Remembers(*memory))
            .collect()
    }
}
