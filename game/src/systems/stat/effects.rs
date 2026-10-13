use std::borrow::Cow;

use bevy_ecs::prelude::*;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};

use super::{Stat, StatKind};
use crate::core::script::{Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind};
use crate::core::time::{Seconds, WallClock};
use crate::systems::combat;
use crate::systems::effect::{Effect, TimedEffect, TimedEffects};
use crate::systems::npc::Npc;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow, Link};
use crate::systems::script::{Condition, Reach, RiftScripting};

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Heal {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub by: HealBy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(Clone)]
pub enum HealBy {
    Amount(Condition),
    Full,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
enum FullHeal {
    Full,
}

#[derive(Deserialize, JsonSchema)]
#[serde(untagged)]
enum HealByRow {
    Full(FullHeal),
    Amount(Condition),
}

impl<'de> Deserialize<'de> for HealBy {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<HealBy, D::Error> {
        Ok(match HealByRow::deserialize(deserializer)? {
            HealByRow::Full(FullHeal::Full) => HealBy::Full,
            HealByRow::Amount(amount) => HealBy::Amount(amount),
        })
    }
}

impl JsonSchema for HealBy {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("HealBy")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        HealByRow::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

impl Serialize for HealBy {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            HealBy::Amount(amount) => amount.serialize(serializer),
            HealBy::Full => serializer.serialize_str("full"),
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Damage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub by: Condition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Buff {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub stat: StatKind,
    pub by: Condition,
    pub seconds: Condition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct ClearBuffs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Heal {
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
        let by = match &self.by {
            HealBy::Amount(amount) => Some(effects::number(cx, amount)?),
            HealBy::Full => None,
        };
        Ok(Box::new(move |world, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                match &by {
                    Some(by) => {
                        let amount = by(world, cx).as_num() as f32;
                        super::heal(world, actor, amount);
                    }
                    None => super::refill(world, actor),
                }
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Heals]
    }
}

impl EffectDef<RiftScripting> for Damage {
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
        let by = effects::number(cx, &self.by)?;
        Ok(Box::new(move |world, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                let amount = by(world, cx).as_num() as f32;
                let attacker = cx
                    .owner
                    .entity()
                    .filter(|owner| world.get::<Npc>(*owner).is_some());
                combat::inflict(world, actor, attacker, amount);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Damages]
    }
}

impl EffectDef<RiftScripting> for Buff {
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
        let by = effects::number(cx, &self.by)?;
        let seconds = effects::number(cx, &self.seconds)?;
        let stat = self.stat;
        Ok(Box::new(move |world, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                let value = by(world, cx).as_num() as f32;
                let lasts = Seconds(seconds(world, cx).as_num() as f32);
                buff(world, actor, Stat { kind: stat, value }, lasts);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Buffs]
    }
}

impl EffectDef<RiftScripting> for ClearBuffs {
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
        Ok(Box::new(move |world, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who)
                && let Some(mut timed) = world.get_mut::<TimedEffects>(actor)
            {
                timed.0.clear();
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Buffs]
    }
}

pub fn buff(world: &mut World, actor: Entity, stat: Stat, lasts: Seconds) {
    let until = world.resource::<WallClock>().now.after(lasts);
    let timed = TimedEffect {
        effect: Effect::StatModifier(stat),
        until,
    };
    match world.get_mut::<TimedEffects>(actor) {
        Some(mut effects) => effects.0.push(timed),
        None => {
            world.entity_mut(actor).insert(TimedEffects(vec![timed]));
        }
    }
}
