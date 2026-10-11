use std::collections::BTreeSet;

use bevy_ecs::prelude::*;

use super::Id;
use crate::core::content::Content;
use crate::core::math::Pos;
use crate::core::script::Owner as ScriptOwner;
use crate::core::tiling::Tiles;
use crate::systems::actor::Name;
use crate::systems::dialogue::Heard;
use crate::systems::effect::TimedEffects;
use crate::systems::equipment::Equipment;
use crate::systems::history::{self, History, HistoryEntry, HistoryMark, HistoryTopic};
use crate::systems::item::Inventory;
use crate::systems::job::Job;
use crate::systems::memory::Memory;
use crate::systems::player::{CharacterState, ClientId, Owner, Xp};
use crate::systems::quest::QuestLog;
use crate::systems::script::{EventKind, RiftEvent, RiftInstances};
use crate::systems::shop;
use crate::systems::stat;
use crate::systems::text::LineText;

#[derive(Component, Clone, Copy)]
pub struct Crossing {
    pub dest_area: Id,
    pub dest: Pos<Tiles>,
}

#[derive(Component, Clone, Debug, Default)]
pub struct Discovered(BTreeSet<Id>);

impl Discovered {
    pub fn starting_in(zone: Id) -> Discovered {
        Discovered(BTreeSet::from([zone]))
    }

    pub fn discover(&mut self, area: Id) -> bool {
        self.0.insert(area)
    }

    pub fn knows(&self, area: Id) -> bool {
        self.0.contains(&area)
    }
}

pub struct Traveler {
    pub client: ClientId,
    pub dest_area: Id,
    pub dest: Pos<Tiles>,
    pub state: CharacterState,
}

pub fn departing(world: &mut World) -> Vec<Traveler> {
    let content = *world.resource::<Content>();
    let ids: Vec<Entity> = world
        .query_filtered::<Entity, With<Crossing>>()
        .iter(world)
        .collect();
    let leaving: Vec<(Entity, Traveler)> = ids
        .into_iter()
        .filter_map(|entity| {
            let crossing = *world.get::<Crossing>(entity)?;
            Some((
                entity,
                Traveler {
                    client: world.get::<Owner>(entity)?.client,
                    dest_area: crossing.dest_area,
                    dest: crossing.dest,
                    state: CharacterState {
                        name: world.get::<Name>(entity)?.name.clone(),
                        spawn: crossing.dest,
                        discovered: world.get::<Discovered>(entity)?.clone(),
                        stats: stat::snapshot(world, entity),
                        inventory: world.get::<Inventory>(entity)?.clone(),
                        xp: world.get::<Xp>(entity)?.clone(),
                        equipment: world.get::<Equipment>(entity)?.clone(),
                        job: *world.get::<Job>(entity)?,
                        timed: world
                            .get::<TimedEffects>(entity)
                            .cloned()
                            .unwrap_or_default(),
                        memory: world
                            .get::<Memory>(entity)
                            .cloned()
                            .map(|mut memory| {
                                memory.leave_area(&content);
                                memory
                            })
                            .unwrap_or_default(),
                        heard: world.get::<Heard>(entity).cloned().unwrap_or_default(),
                        ledger: shop::ledger(world, entity),
                        quests: world.get::<QuestLog>(entity).cloned().unwrap_or_default(),
                        history: world.get::<History>(entity).cloned().unwrap_or_default(),
                    },
                },
            ))
        })
        .collect();
    for (entity, traveler) in &leaving {
        raise_area(world, EventKind::Left, *entity);
        world
            .resource_mut::<crate::systems::player::Players>()
            .0
            .remove(&traveler.client);
        world.despawn(*entity);
    }
    leaving.into_iter().map(|(_, traveler)| traveler).collect()
}

pub fn arrive(world: &mut World, mut traveler: Traveler) -> Entity {
    let content = *world.resource::<Content>();
    let first_visit = traveler.state.discovered.discover(traveler.dest_area);
    let entity = crate::systems::player::place(
        world,
        traveler.client,
        traveler.dest_area,
        traveler.dest,
        traveler.state,
    );
    let arrived = HistoryEntry::of(
        HistoryTopic::Notification,
        LineText::plain(&*traveler.dest_area.get(&content).name),
    )
    .mark(Some(HistoryMark::Arrived));
    history::record(world, entity, arrived);
    raise_area(world, EventKind::Entered, entity);
    if first_visit {
        raise_area(world, EventKind::Discovered, entity);
    }
    entity
}

pub fn raise_area(world: &mut World, kind: EventKind, subject: Entity) {
    let is_npc = world.get::<crate::systems::npc::Npc>(subject).is_some();
    world.resource_mut::<RiftInstances>().raise(
        ScriptOwner::Area,
        kind,
        Some(subject),
        Vec::new(),
        move |event| match event {
            RiftEvent::Entered { by } | RiftEvent::Left { by } => by.admits(is_npc),
            _ => true,
        },
    );
}
