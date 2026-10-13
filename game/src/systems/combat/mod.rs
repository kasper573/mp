pub mod render;

use bevy_app::App;
use bevy_ecs::entity::MapEntities;
use bevy_ecs::prelude::*;
use bevy_time::Time;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::Content;
use crate::core::math::{Direction, Pos};
use crate::core::tiling::Tiles;
use crate::core::time::{Millis, PlaybackRate, Seconds};
use crate::systems::actor::{self, Action, Actor, set_facing};
use crate::systems::area::AreaTag;
use crate::systems::movement::{MoveTarget, Path, halt, on_tile, position};
use crate::systems::player::{self, Owner, commands_locked, sender_player, session};
use crate::systems::reach::{self, Pursuit, ReachAct};
use crate::systems::stat::{self, StatKind};
use crate::systems::visibility;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.add_mapped_client_message::<AttackRequest>(Channel::Ordered)
        .replicate::<Attitude>();
}

#[derive(JsonSchema, Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Attitude {
    Friendly,
    Hostile,
}

pub fn attackable(world: &World, attacker: Entity, target: Entity) -> bool {
    world.get::<Attitude>(target) != Some(&Attitude::Friendly)
        && !player::held(world, target)
        && visibility::coexist(world, attacker, target)
}

#[derive(Message, Serialize, Deserialize, MapEntities, Clone, Debug, PartialEq)]
pub struct AttackRequest {
    #[entities]
    pub target: Entity,
}

pub fn enemy_at(world: &mut World, point: Pos<Tiles>) -> Option<Entity> {
    let me = session::my_character(world).map(|entity| entity.id());
    actor::frontmost_at(world, point, me, |world, entity| {
        world.get::<Actor>(entity).is_some()
            && world.get::<Attitude>(entity) != Some(&Attitude::Friendly)
    })
}

#[derive(Component, Clone, Debug, PartialEq)]
pub struct LastAttack {
    pub at: Seconds,
}

#[derive(Component, Clone, Debug, PartialEq)]
pub struct Attackers {
    pub ids: Vec<Entity>,
}

#[derive(Message, Clone, Debug, PartialEq)]
pub struct Died {
    pub entity: Entity,
    pub killer: Option<Entity>,
}

#[derive(Component, Clone, Debug, PartialEq)]
pub struct Swing {
    pub target: Entity,
    pub hit_at: Seconds,
    pub ends_at: Seconds,
    pub struck: bool,
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
pub struct HealthRegen {
    pub every: Seconds,
    pub health: f32,
}

#[derive(Resource, Default)]
pub struct RegenAt(Seconds);

pub fn regen(world: &mut World) {
    let Some(regen) = player::def(world.resource::<Content>()).regen() else {
        return;
    };
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    {
        let mut last = world.resource_mut::<RegenAt>();
        if now - last.0 < regen.every {
            return;
        }
        last.0 = now;
    }
    let players: Vec<Entity> = world
        .query_filtered::<Entity, With<Owner>>()
        .iter(world)
        .collect();
    for player in players {
        if !stat::is_dead(world, player) {
            stat::heal(world, player, regen.health);
        }
    }
}

pub fn request(world: &mut World) {
    for request in crate::systems::requests::<AttackRequest>(world) {
        let Some(entity) = sender_player(world, request.client_id) else {
            continue;
        };
        let target = request.message.target;
        if stat::is_dead(world, entity)
            || commands_locked(world, entity)
            || world.get_entity(target).is_err()
            || stat::is_dead(world, target)
            || !attackable(world, entity, target)
        {
            continue;
        }
        reach::intend(world, entity, target, ReachAct::Attack);
    }
}

pub fn combat(
    world: &mut World,
    intents: &mut reach::Intents,
    swings: &mut QueryState<Entity, With<Swing>>,
) {
    let time = Seconds(world.resource::<Time>().elapsed_secs());
    engage(world, time, intents);
    progress_swings(world, time, swings);
}

pub fn inflict(world: &mut World, target: Entity, attacker: Option<Entity>, damage: f32) -> bool {
    if world.get_entity(target).is_err()
        || stat::is_dead(world, target)
        || player::held(world, target)
    {
        return false;
    }
    let time = Seconds(world.resource::<Time>().elapsed_secs());
    if let Some(attacker) = attacker {
        add_attacker(world, target, attacker);
        crate::systems::item::reserve(world, target, attacker, time);
        crate::systems::npc::attacked(world, target, attacker);
    }
    stat::apply_damage(world, target, damage);
    if !stat::is_dead(world, target) {
        return false;
    }
    reach::forget(world, target);
    world.entity_mut(target).remove::<Attackers>();
    world.write_message(Died {
        entity: target,
        killer: attacker,
    });
    true
}

fn engage(world: &mut World, time: Seconds, intents: &mut reach::Intents) {
    for (id, target) in reach::intending(world, intents, ReachAct::Attack) {
        if world.get::<Swing>(id).is_some() {
            continue;
        }
        let stats = stat::effective_all(world, id);
        let range = Tiles(stats.get(StatKind::Range));
        let attack_delay = Millis(stats.get(StatKind::AttackDelay));
        let attack_speed = PlaybackRate(stats.get(StatKind::AttackSpeed));
        match reach::pursue(world, id, range) {
            Pursuit::Lost => {
                reach::forget(world, id);
                continue;
            }
            Pursuit::Approaching => continue,
            Pursuit::Arrived => {}
        }
        let (Some(at), Some(target_at)) = (position(world, id), position(world, target)) else {
            continue;
        };

        halt(world, id);
        if !on_tile(world, id) {
            continue;
        }
        if world
            .get::<LastAttack>(id)
            .is_some_and(|l| time - l.at < attack_delay.seconds())
        {
            continue;
        }
        let dir = Direction::from(target_at - at);
        if let Some(mut actor) = world.get_mut::<Actor>(id) {
            set_facing(&mut actor, dir, Action::Attack);
        }
        let timing = attack_timing(world, id, dir);
        let speed = attack_speed.at_least(0.01);
        world.entity_mut(id).insert(Swing {
            target,
            hit_at: time + timing.apex / speed,
            ends_at: time + timing.duration / speed,
            struck: false,
        });
    }
}

fn progress_swings(world: &mut World, time: Seconds, swings: &mut QueryState<Entity, With<Swing>>) {
    let ids: Vec<Entity> = swings.iter(world).collect();
    for id in ids {
        if stat::is_dead(world, id)
            || world.get::<MoveTarget>(id).is_some()
            || world.get::<Path>(id).is_some()
        {
            world
                .entity_mut(id)
                .remove::<Swing>()
                .insert(LastAttack { at: time });
            continue;
        }
        let Some(swing) = world.get::<Swing>(id).cloned() else {
            continue;
        };
        if !swing.struck && time >= swing.hit_at {
            strike(world, id, swing.target);
            if let Some(mut swing) = world.get_mut::<Swing>(id) {
                swing.struck = true;
            }
        }
        if time >= swing.ends_at {
            world
                .entity_mut(id)
                .remove::<Swing>()
                .insert(LastAttack { at: swing.ends_at });
        }
    }
}

fn strike(world: &mut World, attacker: Entity, target: Entity) {
    let same_area = world.get::<AreaTag>(attacker).map(|t| t.area)
        == world.get::<AreaTag>(target).map(|t| t.area);
    if !same_area {
        return;
    }
    let damage = stat::effective(world, attacker, StatKind::Damage);
    inflict(world, target, Some(attacker), damage);
}

fn attack_timing(world: &World, entity: Entity, dir: Direction) -> crate::systems::actor::Timing {
    let content = world.resource::<crate::core::content::Content>();
    world
        .get::<Actor>(entity)
        .map(|a| actor::model(content, a.model).timing(Action::Attack, dir))
        .unwrap_or_default()
}

fn add_attacker(world: &mut World, target: Entity, by: Entity) {
    match world.get_mut::<Attackers>(target) {
        Some(mut attackers) => {
            if !attackers.ids.contains(&by) {
                attackers.ids.push(by);
            }
        }
        None => {
            world.entity_mut(target).insert(Attackers { ids: vec![by] });
        }
    }
}
