use bevy_ecs::prelude::*;

use super::{Stat, StatKind};
use crate::core::script::{Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind};
use crate::core::time::{Seconds, WallClock};
use crate::systems::combat;
use crate::systems::effect::{Effect, TimedEffect, TimedEffects};
use crate::systems::npc::Npc;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Condition, Reach, RiftScripting};

#[derive(Clone)]
pub struct Heal {
    pub who: Aim,
    pub by: HealBy,
    pub next: Arrow,
}

#[derive(Clone, Copy)]
pub enum HealBy {
    Amount(&'static Condition),
    Full,
}

#[derive(Clone)]
pub struct Damage {
    pub who: Aim,
    pub by: &'static Condition,
    pub next: Arrow,
}

#[derive(Clone)]
pub struct Buff {
    pub who: Aim,
    pub stat: StatKind,
    pub by: &'static Condition,
    pub seconds: &'static Condition,
    pub next: Arrow,
}

#[derive(Clone)]
pub struct ClearBuffs {
    pub who: Aim,
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Heal {
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
        let by = match self.by {
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
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let by = effects::number(cx, self.by)?;
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
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let by = effects::number(cx, self.by)?;
        let seconds = effects::number(cx, self.seconds)?;
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
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
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
