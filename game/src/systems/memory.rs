use std::collections::BTreeMap;

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::content::Content;
use crate::core::content::serial;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind, Value, ValueType,
};
use crate::core::time::{GameDay, Seconds, UnixMillis, WallClock};
use crate::data::memory::Id;
use crate::systems::player::conn_player;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Condition, Reach, RiftScripting};

#[derive(Clone, Serialize)]
pub struct MemoryDef {
    pub label: &'static str,
    #[serde(rename = "type")]
    pub ty: ValueType,
    pub resets: Resets,
}

impl crate::core::content::ContentRow for MemoryDef {
    const TABLE: &'static str = "memory";
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
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

impl Memory {
    pub fn get(&self, content: &Content, key: Id, clock: WallClock) -> Value {
        let def = key.get(content);
        match self.0.get(&key) {
            Some(recollection)
                if !(def.resets == Resets::Daily && recollection.day != clock.day()) =>
            {
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
            !(def.resets == Resets::Daily && recollection.day != clock.day())
                && clock.now.since(recollection.at) < lasts
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

#[derive(Clone, Serialize)]
pub struct Remember {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub memory: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<&'static Condition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(Clone, Serialize)]
pub struct Forget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub memories: &'static [Id],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Remember {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let ty = self.memory.get(cx.content).ty;
        let to = cx.opt_expr(self.to, ty).map_err(effects::bad)?;
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
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let memories = self.memories;
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

/// Set one of your character's memories.
#[bevy_terminal::command(name = "remember", access = crate::systems::account::role::is_admin)]
fn remember_command(
    world: &mut World,
    ctx: &bevy_terminal::CommandCtx,
    key: String,
    value: Option<String>,
) -> Result<String, String> {
    let player = conn_player(world, ctx.conn).ok_or_else(|| "you have no player".to_owned())?;
    let key = crate::core::content::named::<MemoryDef>(world, &key)?;
    let content = *world.resource::<Content>();
    let value = match (key.get(&content).ty, value) {
        (ValueType::Boolean, None) => Value::Bool(true),
        (ValueType::Boolean, Some(text)) => Value::Bool(text.parse().map_err(|_| "true or false")?),
        (ValueType::Integer, None) => Value::Int(1),
        (ValueType::Integer, Some(text)) => Value::Int(text.parse().map_err(|_| "an integer")?),
        (ValueType::Number, None) => Value::Num(1.0),
        (ValueType::Number, Some(text)) => Value::Num(text.parse().map_err(|_| "a number")?),
        (ValueType::Text, text) => Value::Text(text.unwrap_or_default()),
        (ValueType::Actor | ValueType::Character, _) => {
            return Err("memories hold no actors".to_owned());
        }
    };
    set(world, player, key, value);
    Ok(format!(
        "{} is now {:?}",
        key.key(&content),
        get(world, player, key)
    ))
}

/// Make your character forget something.
#[bevy_terminal::command(name = "forget", access = crate::systems::account::role::is_admin)]
fn forget_command(
    world: &mut World,
    ctx: &bevy_terminal::CommandCtx,
    key: String,
) -> Result<String, String> {
    let player = conn_player(world, ctx.conn).ok_or_else(|| "you have no player".to_owned())?;
    let key = crate::core::content::named::<MemoryDef>(world, &key)?;
    forget(world, player, key);
    Ok(format!(
        "{} forgotten",
        key.key(world.resource::<Content>())
    ))
}
