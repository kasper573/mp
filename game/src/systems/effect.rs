use bevy_app::App;
use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::time::{UnixMillis, WallClock};
use crate::systems::stat::{self, Stat, StatKind};

const CHASE_SPEED_MULTIPLIER: f32 = 2.0;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<TimedEffects>().init_resource::<Sources>();
    source(app, timed);
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Effect {
    StatModifier(Stat),
    Chasing,
}

impl Effect {
    pub fn modifier(self, world: &World, entity: Entity) -> Stat {
        match self {
            Effect::StatModifier(stat) => stat,
            Effect::Chasing => {
                let base = stat::base(world, entity, StatKind::MovementSpeed);
                StatKind::MovementSpeed.of(base * (CHASE_SPEED_MULTIPLIER - 1.0))
            }
        }
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct TimedEffects(pub Vec<TimedEffect>);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TimedEffect {
    pub effect: Effect,
    pub until: UnixMillis,
}

pub type Source = fn(&World, Entity) -> Vec<Effect>;

#[derive(Resource, Default)]
pub struct Sources(Vec<Source>);

pub fn source(app: &mut App, source: Source) {
    app.world_mut().resource_mut::<Sources>().0.push(source);
}

pub fn active_effects(world: &World, entity: Entity) -> Vec<Effect> {
    world
        .resource::<Sources>()
        .0
        .iter()
        .flat_map(|source| source(world, entity))
        .collect()
}

pub fn expire(world: &mut World, timed: &mut QueryState<Entity, With<TimedEffects>>) {
    let now = world.resource::<WallClock>().now;
    let ids: Vec<Entity> = timed.iter(world).collect();
    for id in ids {
        if let Some(mut timed) = world.get_mut::<TimedEffects>(id)
            && timed.0.iter().any(|effect| effect.until <= now)
        {
            timed.0.retain(|effect| effect.until > now);
        }
    }
}

// Clients keep no wall clock: they show the timed effects the server has not yet swept away.
fn timed(world: &World, entity: Entity) -> Vec<Effect> {
    let now = world.get_resource::<WallClock>().map(|clock| clock.now);
    world
        .get::<TimedEffects>(entity)
        .map(|timed| {
            timed
                .0
                .iter()
                .filter(|timed| now.is_none_or(|now| timed.until > now))
                .map(|timed| timed.effect)
                .collect()
        })
        .unwrap_or_default()
}
