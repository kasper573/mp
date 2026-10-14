use bevy_app::App;
use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::{Content, ContentId, ContentRow, serial};
use crate::core::script::{Compiler, EffectDef, EffectStep, Name, ScriptFault, ValueType};
use crate::systems::effect::{self, Effect};
use crate::systems::player::Xp;
use crate::systems::script::effect::{self as effects, Aim, Arrow, Link};
use crate::systems::script::{
    Condition, EffectCall, EventKind, Reach, RiftInstances, RiftScripting, area_owner,
};
use crate::systems::stat::StatMap;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<Job>();
    effect::source(app, level_effects);
}

#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Job {
    pub def: JobId,
}

pub type JobId = ContentId<JobDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct JobDef {
    pub name: String,
    pub levels: Vec<JobLevel>,
}

impl ContentRow for JobDef {
    const TABLE: &'static str = "job";
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct JobLevel {
    pub xp: u32,
    pub stats: StatMap,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub chasing: bool,
}

impl JobLevel {
    pub fn effects(&self) -> impl Iterator<Item = Effect> + '_ {
        self.stats
            .listed()
            .map(Effect::StatModifier)
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
        let owner = area_owner(world);
        world.resource_mut::<RiftInstances>().raise(
            owner,
            EventKind::LeveledUp,
            Some(entity),
            Vec::new(),
            |_| true,
        );
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct GrantXp {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub xp: Condition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct SetJob {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub job: JobId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for GrantXp {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let xp = cx.expr(&self.xp, ValueType::Integer)?;
        Ok(Box::new(move |world, _, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                let amount = xp(world, cx).as_int().clamp(0, i64::from(u32::MAX)) as u32;
                grant_xp(world, player, amount);
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::GrantsXp]
    }
}

impl EffectDef<RiftScripting> for SetJob {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let job = self.job;
        Ok(Box::new(move |world, _, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                world.entity_mut(player).insert(Job { def: job });
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::SetsJob(self.job)]
    }
}
