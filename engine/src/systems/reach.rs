use bevy_ecs::prelude::*;

use crate::core::math::Pos;
use crate::core::tiling::{TilePos, Tiles};
use crate::systems::area::{self, AreaId, AreaTag};
use crate::systems::movement::{self, approach, position};
use crate::systems::skill::SkillId;
use crate::systems::stat;
use crate::systems::visibility;

const DIAGONAL_MARGIN: Tiles = Tiles(std::f32::consts::SQRT_2 - 1.0);

#[derive(Component, Clone, Copy, Debug, PartialEq)]
pub struct ReachIntent {
    pub target: ReachTarget,
    pub act: ReachAct,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ReachTarget {
    Actor(Entity),
    Point(Pos<Tiles>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReachAct {
    /// `repeat` keeps the intent after a cast, so a basic attack lands again and again until the
    /// target falls or the actor turns away.
    Cast {
        skill: SkillId,
        repeat: bool,
    },
    Pickup,
    Interact,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pursuit {
    Arrived,
    Approaching,
    Lost,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tether {
    pub anchor: Pos<Tiles>,
    pub area: AreaId,
    pub range: Tiles,
    pub with: Option<Entity>,
}

impl ReachTarget {
    pub fn actor(self) -> Option<Entity> {
        match self {
            ReachTarget::Actor(actor) => Some(actor),
            ReachTarget::Point(_) => None,
        }
    }

    pub fn point(self) -> Option<Pos<Tiles>> {
        match self {
            ReachTarget::Point(point) => Some(point),
            ReachTarget::Actor(_) => None,
        }
    }

    pub fn position(self, world: &World) -> Option<Pos<Tiles>> {
        match self {
            ReachTarget::Actor(actor) => position(world, actor),
            ReachTarget::Point(point) => Some(point),
        }
    }
}

impl ReachIntent {
    pub fn cast(&self) -> Option<SkillId> {
        match self.act {
            ReachAct::Cast { skill, .. } => Some(skill),
            ReachAct::Pickup | ReachAct::Interact => None,
        }
    }
}

impl Tether {
    pub fn around(
        world: &World,
        actor: Entity,
        range: Tiles,
        with: Option<Entity>,
    ) -> Option<Tether> {
        Some(Tether {
            anchor: position(world, actor)?,
            area: world.get::<AreaTag>(actor)?.area,
            range,
            with,
        })
    }

    pub fn holds(&self, world: &World, actor: Entity) -> bool {
        !stat::is_dead(world, actor)
            && world.get::<AreaTag>(actor).map(|tag| tag.area) == Some(self.area)
            && position(world, actor)
                .is_some_and(|at| at.distance(self.anchor) <= self.range + DIAGONAL_MARGIN)
            && self.with.is_none_or(|with| {
                world.get_entity(with).is_ok()
                    && !stat::is_dead(world, with)
                    && visibility::coexist(world, actor, with)
            })
    }
}

pub fn intend(world: &mut World, actor: Entity, target: ReachTarget, act: ReachAct) {
    movement::halt(world, actor);
    world.entity_mut(actor).insert(ReachIntent { target, act });
}

pub type Intents = QueryState<(Entity, &'static ReachIntent)>;

/// Every actor reaching for another actor with exactly this act.
pub fn intending(world: &World, intents: &mut Intents, act: ReachAct) -> Vec<(Entity, Entity)> {
    intents
        .iter(world)
        .filter(|(_, intent)| intent.act == act)
        .filter_map(|(actor, intent)| Some((actor, intent.target.actor()?)))
        .collect()
}

pub fn casting(world: &World, intents: &mut Intents) -> Vec<(Entity, ReachIntent)> {
    intents
        .iter(world)
        .filter(|(_, intent)| intent.cast().is_some())
        .map(|(actor, intent)| (actor, *intent))
        .collect()
}

pub fn current(world: &World, actor: Entity) -> Option<ReachIntent> {
    world.get::<ReachIntent>(actor).copied()
}

/// The actor a cast is aimed at, while the actor is casting at one.
pub fn attacking(world: &World, actor: Entity) -> Option<Entity> {
    current(world, actor)
        .filter(|intent| intent.cast().is_some())
        .and_then(|intent| intent.target.actor())
}

pub fn intent(world: &World, actor: Entity, act: ReachAct) -> Option<Entity> {
    current(world, actor)
        .filter(|intent| intent.act == act)
        .and_then(|intent| intent.target.actor())
}

pub fn pursue(world: &mut World, actor: Entity, range: Tiles) -> Pursuit {
    let Some(target) = current(world, actor).map(|intent| intent.target) else {
        return Pursuit::Lost;
    };
    if stat::is_dead(world, actor) {
        return Pursuit::Lost;
    }
    if let ReachTarget::Actor(target) = target
        && !pursuable(world, actor, target)
    {
        return Pursuit::Lost;
    }
    let Some(target_at) = target.position(world) else {
        return Pursuit::Lost;
    };
    if approach(world, actor, target_at, range + DIAGONAL_MARGIN) {
        Pursuit::Arrived
    } else {
        Pursuit::Approaching
    }
}

pub fn pursuable(world: &World, actor: Entity, target: Entity) -> bool {
    world.get_entity(target).is_ok()
        && !stat::is_dead(world, target)
        && area::same_area(world, actor, target)
        && visibility::coexist(world, actor, target)
}

pub fn forget(world: &mut World, actor: Entity) {
    drop_intent(world, actor);
    movement::halt(world, actor);
}

/// Gives up reaching for anything, leaving the actor's walk as it is.
pub fn drop_intent(world: &mut World, actor: Entity) {
    world.entity_mut(actor).remove::<ReachIntent>();
}
