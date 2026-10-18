use bevy_ecs::prelude::*;

use super::{StatKind, Stats, base, effective};
use crate::core::vfx::VfxSite;
use crate::systems::notification;
use crate::systems::vfx::{VfxFixture, VfxShaderFixture, fixture};

pub fn current_health(world: &World, entity: Entity) -> f32 {
    base(world, entity, StatKind::Health)
}

pub fn max_health(world: &World, entity: Entity) -> f32 {
    effective(world, entity, StatKind::MaxHealth)
}

pub fn is_dead(world: &World, entity: Entity) -> bool {
    world.get::<Stats>(entity).is_some_and(dead)
}

/// Whether an entity is there and not fallen; what has no health never falls.
pub fn stands(world: &World, entity: Entity) -> bool {
    world.get_entity(entity).is_ok() && !is_dead(world, entity)
}

pub fn dead(stats: &Stats) -> bool {
    stats.get(StatKind::Health) <= 0.0
}

pub fn fraction(world: &World, entity: Entity) -> f32 {
    let max = max_health(world, entity);
    if max <= 0.0 {
        0.0
    } else {
        current_health(world, entity) / max
    }
}

pub fn apply_damage(world: &mut World, entity: Entity, amount: f32) {
    if is_dead(world, entity) {
        return;
    }
    set_health(world, entity, |health, _| (health - amount).max(0.0));
    if amount > 0.0 {
        fixture::play(world, VfxFixture::DamageTaken, VfxSite::Actor(entity));
        let shown = whole(amount).to_string();
        notification::pop_as(world, entity, shown, VfxShaderFixture::DamagePop);
    }
}

/// A heal that lands as an event, shown where it lands; the slow trickle of regeneration is
/// `regenerate`.
pub fn heal(world: &mut World, entity: Entity, amount: f32) {
    if is_dead(world, entity) || amount <= 0.0 {
        return;
    }
    let before = current_health(world, entity);
    regenerate(world, entity, amount);
    if current_health(world, entity) > before {
        fixture::play(world, VfxFixture::Healed, VfxSite::Actor(entity));
        let shown = format!("+{}", whole(amount));
        notification::pop_as(world, entity, shown, VfxShaderFixture::HealPop);
    }
}

pub fn regenerate(world: &mut World, entity: Entity, amount: f32) {
    if !is_dead(world, entity) {
        set_health(world, entity, |health, max| (health + amount).min(max));
    }
}

pub fn refill(world: &mut World, entity: Entity) {
    if !is_dead(world, entity) {
        set_health(world, entity, |_, max| max);
    }
}

pub fn revive(world: &mut World, entity: Entity) {
    set_health(world, entity, |_, max| max);
}

pub fn settle_health(world: &mut World, living: &mut QueryState<Entity, With<Stats>>) {
    let entities: Vec<Entity> = living.iter(world).collect();
    for entity in entities {
        set_health(world, entity, |health, _| health);
    }
}

fn set_health(world: &mut World, entity: Entity, f: impl Fn(f32, f32) -> f32) {
    let max = max_health(world, entity);
    let Some(stats) = world.get::<Stats>(entity) else {
        return;
    };
    let changes = stats
        .0
        .iter()
        .any(|stat| stat.kind == StatKind::Health && f(stat.value.min(max), max) != stat.value);
    if !changes {
        return;
    }
    if let Some(mut stats) = world.get_mut::<Stats>(entity) {
        for stat in stats
            .0
            .iter_mut()
            .filter(|stat| stat.kind == StatKind::Health)
        {
            stat.value = f(stat.value.min(max), max);
        }
    }
}

/// An amount as players read it: whole, and never a zero for something that landed.
fn whole(amount: f32) -> u32 {
    amount.round().max(1.0) as u32
}
