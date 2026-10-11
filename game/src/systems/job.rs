use bevy_app::App;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::content::Content;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Name, Owner, OwnerKind, ValueType,
};
use crate::data;
use crate::systems::effect::{self, Effect};
use crate::systems::player::Xp;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Condition, EventKind, Reach, RiftInstances, RiftScripting};
use crate::systems::stat::Stat;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<Job>();
    effect::source(app, level_effects);
}

#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Job {
    pub def: data::job::Id,
}

#[derive(Clone, Serialize)]
pub struct JobDef {
    pub name: &'static str,
    pub levels: &'static [JobLevel],
}

impl crate::core::content::ContentRow for JobDef {
    const TABLE: &'static str = "job";
}

#[derive(Clone, Copy, Serialize)]
pub struct JobLevel {
    pub xp: u32,
    #[serde(serialize_with = "crate::systems::stat::stats_map")]
    pub stats: &'static [Stat],
    #[serde(skip_serializing_if = "crate::core::content::serial::is_false")]
    pub chasing: bool,
}

impl JobLevel {
    pub fn effects(&self) -> impl Iterator<Item = Effect> + '_ {
        self.stats
            .iter()
            .map(|&stat| Effect::StatModifier(stat))
            .chain(self.chasing.then_some(Effect::Chasing))
    }
}

pub fn level(world: &World, entity: Entity) -> u32 {
    let content = world.resource::<Content>();
    let Some(job) = world.get::<Job>(entity) else {
        return 0;
    };
    let xp = world.get::<Xp>(entity).map_or(0, |xp| xp.amount);
    job.def
        .get(content)
        .levels
        .iter()
        .filter(|tier| tier.xp <= xp)
        .count() as u32
}

fn level_effects(world: &World, entity: Entity) -> Vec<Effect> {
    let content = world.resource::<Content>();
    let Some(job) = world.get::<Job>(entity) else {
        return Vec::new();
    };
    let level = level(world, entity) as usize;
    job.def
        .get(content)
        .levels
        .iter()
        .take(level)
        .flat_map(JobLevel::effects)
        .collect()
}

pub fn grant_xp(world: &mut World, entity: Entity, amount: u32) {
    let before = level(world, entity);
    if let Some(mut xp) = world.get_mut::<Xp>(entity) {
        xp.gain(amount);
    }
    if level(world, entity) > before {
        world.resource_mut::<RiftInstances>().raise(
            Owner::Area,
            EventKind::LeveledUp,
            Some(entity),
            Vec::new(),
            |_| true,
        );
    }
}

#[derive(Clone, Serialize)]
pub struct GrantXp {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub xp: &'static Condition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(Clone, Serialize)]
pub struct SetJob {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub job: data::job::Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for GrantXp {
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
        let xp = cx.expr(self.xp, ValueType::Integer).map_err(effects::bad)?;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                let amount = xp(world, cx).as_int().clamp(0, i64::from(u32::MAX)) as u32;
                grant_xp(world, player, amount);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::GrantsXp]
    }
}

impl EffectDef<RiftScripting> for SetJob {
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
        let job = self.job;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                world.entity_mut(player).insert(Job { def: job });
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::SetsJob(self.job)]
    }
}
