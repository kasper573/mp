use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{Stat, StatKind};
use crate::core::script::{Compiler, EffectDef, EffectStep, Name, ScriptFault};
use crate::core::time::{Seconds, WallClock};
use crate::systems::combat;
use crate::systems::effect::{Effect, TimedEffect, TimedEffects};
use crate::systems::npc::Npc;
use crate::systems::script::effect::{self as effects, Aim, Arrow, Link};
use crate::systems::script::{Condition, EffectCall, Reach, RiftScripting};

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Heal {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub by: HealBy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HealBy {
    Full(Fully),
    Amount(Condition),
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Fully {
    Full,
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
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Link<'_>)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile<'c>(
        &'c self,
        cx: &mut Compiler<'c, RiftScripting>,
    ) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let by = match &self.by {
            HealBy::Amount(amount) => Some(effects::number(cx, amount)?),
            HealBy::Full(_) => None,
        };
        Ok(Box::new(move |world, _, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                match &by {
                    Some(by) => {
                        let amount = by(world, cx).as_num() as f32;
                        super::heal(world, actor, amount);
                    }
                    None => super::refill(world, actor),
                }
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Heals]
    }
}

impl EffectDef<RiftScripting> for Damage {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Link<'_>)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile<'c>(
        &'c self,
        cx: &mut Compiler<'c, RiftScripting>,
    ) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let by = effects::number(cx, &self.by)?;
        Ok(Box::new(move |world, _, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                let amount = by(world, cx).as_num() as f32;
                let attacker = cx.owner.filter(|owner| world.get::<Npc>(*owner).is_some());
                combat::inflict(world, actor, attacker, amount);
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Damages]
    }
}

impl EffectDef<RiftScripting> for Buff {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Link<'_>)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile<'c>(
        &'c self,
        cx: &mut Compiler<'c, RiftScripting>,
    ) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let by = effects::number(cx, &self.by)?;
        let seconds = effects::number(cx, &self.seconds)?;
        let stat = self.stat;
        Ok(Box::new(move |world, _, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who) {
                let value = by(world, cx).as_num() as f32;
                let lasts = Seconds(seconds(world, cx).as_num() as f32);
                buff(world, actor, Stat { kind: stat, value }, lasts);
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Buffs]
    }
}

impl EffectDef<RiftScripting> for ClearBuffs {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Link<'_>)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile<'c>(
        &'c self,
        cx: &mut Compiler<'c, RiftScripting>,
    ) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        Ok(Box::new(move |world, _, cx| {
            if let Some(actor) = effects::aimed(world, cx, &who)
                && let Some(mut timed) = world.get_mut::<TimedEffects>(actor)
            {
                timed.0.clear();
            }
            EffectStep::Done
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
