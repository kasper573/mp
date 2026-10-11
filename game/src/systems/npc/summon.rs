use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::math::{Offset, Pos};
use crate::core::script::{Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind};
use crate::core::tiling::{TilePos, Tiles};
use crate::systems::area::{self, AreaTag};
use crate::systems::combat::Attitude;
use crate::systems::movement::position;
use crate::systems::player::{ClientId, Owner};
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow, Link};
use crate::systems::script::{Reach, RiftScripting};
use crate::systems::stat;
use crate::systems::visibility::Presence;

use super::Home;

const RING: Tiles = Tiles(1.5);
const MAX_SPAWNED: u32 = 20;
const NPC: &[OwnerKind] = &[OwnerKind::Npc];

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct SetAttitude {
    pub attitude: Attitude,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct SpawnNpcs {
    pub npc: crate::systems::npc::Id,
    pub count: u32,
    pub near: SpawnNear,
    pub shown: ShownFor,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpawnNear {
    Owner,
    Subject,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShownFor {
    Subject,
    Everyone,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Despawn {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Arrow,
}

#[derive(Component, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Summoned {
    pub with: Option<Entity>,
}

impl EffectDef<RiftScripting> for SetAttitude {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, _cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let attitude = self.attitude;
        Ok(Box::new(move |world, cx| {
            if let Some(npc) = cx.owner.entity()
                && world.get_entity(npc).is_ok()
            {
                world.entity_mut(npc).insert(attitude);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![match self.attitude {
            Attitude::Hostile => Reach::Hostile,
            Attitude::Friendly => Reach::Friendly,
        }]
    }
}

impl EffectDef<RiftScripting> for SpawnNpcs {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.near == SpawnNear::Subject || self.shown == ShownFor::Subject
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, _cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        if !(1..=MAX_SPAWNED).contains(&self.count) {
            return Err(format!("count {} is not 1 to {MAX_SPAWNED}", self.count));
        }
        let (npc, count, near, shown) = (self.npc, self.count, self.near, self.shown);
        Ok(Box::new(move |world, cx| {
            let beside = match near {
                SpawnNear::Owner => cx.owner.entity().or(cx.subject),
                SpawnNear::Subject => cx.subject,
            };
            let Some(beside) = beside else {
                return EffectStep::Output(0);
            };
            let only_for = match shown {
                ShownFor::Subject => cx
                    .subject
                    .and_then(|subject| world.get::<Owner>(subject))
                    .map(|owner| owner.client),
                ShownFor::Everyone => None,
            };
            summon(
                world,
                npc,
                count,
                beside,
                only_for,
                cx.subject.filter(|_| shown == ShownFor::Subject),
            );
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Spawns(self.npc)]
    }
}

impl EffectDef<RiftScripting> for Despawn {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            ("done", self.done.as_deref()),
            ("refused", self.refused.as_deref()),
        ]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, &self.who)?;
        let refused = self.refused.as_deref();
        Ok(Box::new(move |world, cx| {
            let Some(npc) = effects::aimed(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody there to send away");
                return EffectStep::Output(1);
            };
            if world.get::<Summoned>(npc).is_none() {
                effects::refuse(world, cx, refused, "Only spawned npcs leave on command");
                return EffectStep::Output(1);
            }
            super::despawn(world, npc);
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Despawns]
    }
}

pub fn summon(
    world: &mut World,
    npc: crate::systems::npc::Id,
    count: u32,
    beside: Entity,
    only_for: Option<ClientId>,
    with: Option<Entity>,
) -> Vec<Entity> {
    let (Some(at), Some(tag), Some(region)) = (
        position(world, beside),
        world.get::<AreaTag>(beside).cloned(),
        area::of(world, beside),
    ) else {
        return Vec::new();
    };
    let pack = super::next_pack(world);
    let mut spawned = Vec::with_capacity(count as usize);
    for index in 0..count {
        let spot = ring(region, at, index, count);
        let summon = super::spawn(world, npc, spot, tag.area, pack);
        world
            .entity_mut(summon)
            .insert((Summoned { with }, Home(spot)));
        if let Some(client) = only_for {
            world.entity_mut(summon).insert(Presence::For(client));
        }
        spawned.push(summon);
    }
    spawned
}

pub fn dismiss(world: &mut World, summons: &mut QueryState<(Entity, &'static Summoned)>) {
    let dismissed: Vec<Entity> = summons
        .iter(world)
        .filter_map(|(summon, summoned)| Some((summon, summoned.with?)))
        .filter(|&(summon, with)| {
            let area = |entity| world.get::<AreaTag>(entity).map(|tag| tag.area);
            world.get_entity(with).is_err()
                || stat::is_dead(world, with)
                || area(with) != area(summon)
        })
        .map(|(summon, _)| summon)
        .collect();
    for summon in dismissed {
        super::despawn(world, summon);
    }
}

fn ring(region: &area::Area, at: Pos<Tiles>, index: u32, count: u32) -> Pos<Tiles> {
    let angle = std::f32::consts::TAU * index as f32 / count as f32;
    let spot = at + Offset::new(angle.cos() * RING.0, angle.sin() * RING.0);
    region.grid.nearest_walkable(spot).unwrap_or(at.snap())
}
