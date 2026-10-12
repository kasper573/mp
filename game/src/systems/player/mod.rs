pub mod session;
pub mod snapshot;
pub mod widget;

use bevy_app::App;
use bevy_ecs::component::Component;
use bevy_ecs::message::Message;
use bevy_time::Time;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::{Content, ContentId, ContentRow, ModuleRule, ModuleSet};
use crate::core::math::{Direction, Pos, Rng};
use crate::core::tiling::Tiles;
use crate::core::time::{PlaybackRate, Seconds, WallClock};
use crate::systems::Character;
use crate::systems::GameSettings;
use crate::systems::account::identity::Identity;
use crate::systems::actor;
use crate::systems::actor::{Action, Actor, Hitbox, Name, Rgba, Tint, set_action};
use crate::systems::area::transition::Discovered;
use crate::systems::area::{self, AreaTag};
use crate::systems::belongings;
use crate::systems::combat::HealthRegen;
use crate::systems::dialogue::Heard;
use crate::systems::effect::TimedEffects;
use crate::systems::equipment::Equipment;
use crate::systems::history::History;
use crate::systems::item::Inventory;
use crate::systems::job::Job;
use crate::systems::memory::Memory;
use crate::systems::movement::Position;
use crate::systems::quest::QuestLog;
use crate::systems::shop::ShopLedger;
use crate::systems::spectate::Spectators;
use crate::systems::stat::{self, StatKind, Stats};
use crate::systems::visibility::OwnedBy;
use bevy_ecs::lifecycle::{Add, Remove};
use bevy_ecs::observer::On;
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::{Replicated, SendTargets, ToClients};
use snapshot::JoinAs;
use std::collections::HashMap;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;

    app.replicate::<Owner>()
        .replicate::<Xp>()
        .replicate::<CommandLock>()
        .replicate::<ArrivalHold>()
        .add_client_message::<JoinRequest>(Channel::Ordered)
        .add_client_message::<RespawnRequest>(Channel::Ordered)
        .add_client_message::<AreaDrawn>(Channel::Ordered)
        .add_server_message::<Welcome>(Channel::Ordered);
}

#[derive(
    Component,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Debug,
    Default,
)]
#[component(immutable)]
pub struct ClientId(pub u32);

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Owner {
    pub client: ClientId,
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Xp {
    pub amount: u32,
}

impl Xp {
    pub fn gain(&mut self, amount: u32) {
        self.amount += amount;
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CommandLock;

#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct ArrivalHold {
    pub until: Seconds,
}

pub const ARRIVAL_HOLD: Seconds = Seconds(5.0);

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AreaDrawn;

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JoinRequest;

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RespawnRequest;

#[derive(Message, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Welcome {
    pub id: ClientId,
}

/// Health a player spawns with when [`Immortal`] is set — high enough that nothing in the world can
/// grind it down, so test/dev sessions never die to NPCs.
const IMMORTAL_HEALTH: f32 = 9999.0;

pub type Id = ContentId<PlayerDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct PlayerDef {
    pub model: crate::systems::actor::bust::Id,
    pub job: crate::systems::job::Id,
    #[schemars(transform = crate::systems::stat::schema_with_units)]
    pub stats: crate::systems::stat::StatMap,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<PlayerModule>,
}

impl ContentRow for PlayerDef {
    const TABLE: &'static str = "player";
}

impl ModuleSet for PlayerDef {
    type Module = PlayerModule;

    fn modules(&self) -> &[PlayerModule] {
        &self.modules
    }

    fn rule(_: &PlayerModule) -> ModuleRule {
        ModuleRule::AtMostOne
    }
}

#[derive(JsonSchema, Clone, Copy, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlayerModule {
    Tint(Tint),
    Regen(HealthRegen),
}

impl PlayerDef {
    pub fn tint(&self) -> Rgba {
        self.modules
            .iter()
            .find_map(|module| match module {
                PlayerModule::Tint(tint) => Some(tint.rgba),
                _ => None,
            })
            .unwrap_or(Rgba::WHITE)
    }

    pub fn regen(&self) -> Option<HealthRegen> {
        self.modules.iter().find_map(|module| match module {
            PlayerModule::Regen(regen) => Some(*regen),
            _ => None,
        })
    }
}

pub fn def(content: &Content) -> &'static PlayerDef {
    content.built::<GameSettings>().player.get(content)
}

#[derive(Resource, Default)]
pub struct Players(pub HashMap<ClientId, Entity>);

pub(crate) fn sender_player(
    world: &World,
    sender: bevy_replicon::prelude::ClientId,
) -> Option<Entity> {
    conn_player(world, sender.entity()?)
}

pub fn commands_locked(world: &World, player: Entity) -> bool {
    world.get::<CommandLock>(player).is_some() || held(world, player)
}

pub fn held(world: &World, entity: Entity) -> bool {
    world.get::<ArrivalHold>(entity).is_some()
}

pub fn arrival_holds(world: &mut World) {
    for request in crate::systems::requests::<AreaDrawn>(world) {
        if let Some(player) = sender_player(world, request.client_id)
            && let Ok(mut player) = world.get_entity_mut(player)
        {
            player.remove::<ArrivalHold>();
        }
    }
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let expired: Vec<Entity> = world
        .query::<(Entity, &ArrivalHold)>()
        .iter(world)
        .filter(|(_, hold)| hold.until <= now)
        .map(|(entity, _)| entity)
        .collect();
    for entity in expired {
        world.entity_mut(entity).remove::<ArrivalHold>();
    }
}

pub(crate) fn conn_player(world: &World, conn: Entity) -> Option<Entity> {
    let client = world.get::<ClientId>(conn)?;
    world.resource::<Players>().0.get(client).copied()
}

pub fn greet(
    add: On<Add, ClientId>,
    clients: Query<&ClientId>,
    mut welcome: MessageWriter<ToClients<Welcome>>,
) {
    let Ok(&id) = clients.get(add.entity) else {
        return;
    };
    welcome.write(ToClients {
        targets: SendTargets::Single(bevy_replicon::prelude::ClientId::Client(add.entity)),
        message: Welcome { id },
    });
}

pub fn client_left(
    remove: On<Remove, ClientId>,
    clients: Query<(Entity, &ClientId)>,
    mut players: ResMut<Players>,
    mut commands: Commands,
) {
    let Ok((_, id)) = clients.get(remove.entity) else {
        return;
    };
    if clients
        .iter()
        .any(|(entity, other)| entity != remove.entity && other == id)
    {
        return;
    }
    if let Some(entity) = players.0.remove(id) {
        commands.entity(entity).despawn();
    }
}

#[derive(Resource, Clone, Copy, Default, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpawnPolicy {
    #[default]
    Map,
    Dist,
}

/// When set, players spawn with [`IMMORTAL_HEALTH`] instead of their usual health — a config toggle
/// (off in production) so test/dev sessions aren't killed by NPCs.
#[derive(Resource, Clone, Copy, Default)]
pub struct Immortal(pub bool);

pub fn join(world: &mut World) {
    let zone = world.resource::<crate::systems::WorldArea>().0;
    let assets = *world.resource::<Content>();
    let area = area::load(&assets, zone);
    let policy = world
        .get_resource::<SpawnPolicy>()
        .copied()
        .unwrap_or_default();
    let immortal = world
        .get_resource::<Immortal>()
        .copied()
        .unwrap_or_default();
    for request in crate::systems::requests::<JoinRequest>(world) {
        let Some(client_entity) = request.client_id.entity() else {
            continue;
        };
        let Some(&client) = world.get::<ClientId>(client_entity) else {
            continue;
        };
        let playing = world.resource::<Players>().0.contains_key(&client);
        let spectating = world.resource::<Spectators>().0.contains_key(&client);
        if playing || spectating {
            continue;
        }
        let clock = *world.resource::<WallClock>();
        let (at, state) = match world.get::<JoinAs>(client_entity) {
            Some(JoinAs { snapshot, start }) if start.area == zone => (
                start.at,
                snapshot::materialize(&assets, snapshot, *start, clock, immortal),
            ),
            _ => {
                let name = world
                    .get::<Identity>(client_entity)
                    .map_or_else(|| format!("player {}", client.0), |id| id.name.clone());
                let at = spawn_position(world, policy, zone, area);
                (at, fresh_state(&assets, zone, at, name, immortal))
            }
        };
        let entity = place(world, client, zone, at, state);
        spawned(world, entity);
    }
}

pub fn spawned(world: &mut World, player: Entity) {
    crate::systems::area::transition::raise_area(
        world,
        crate::systems::script::EventKind::Entered,
        player,
    );
}

fn spawn_position(
    world: &mut World,
    policy: SpawnPolicy,
    zone: area::Id,
    area: &area::Area,
) -> Pos<Tiles> {
    let spawn = world.resource::<GameSettings>().spawn;
    let fallback = || area.fallback_spawn();
    match policy {
        SpawnPolicy::Map if spawn.area == zone => spawn.at,
        SpawnPolicy::Map => fallback(),
        SpawnPolicy::Dist => area
            .grid
            .random_node(&mut world.resource_mut::<Rng>())
            .unwrap_or_else(fallback),
    }
}

#[derive(Component, Clone, Copy, Debug, PartialEq)]
pub struct SpawnPoint(pub Pos<Tiles>);

pub struct CharacterState {
    pub name: String,
    pub spawn: Pos<Tiles>,
    pub discovered: Discovered,
    pub stats: Stats,
    pub inventory: Inventory,
    pub xp: Xp,
    pub equipment: Equipment,
    pub job: Job,
    pub timed: TimedEffects,
    pub memory: Memory,
    pub heard: Heard,
    pub ledger: ShopLedger,
    pub quests: QuestLog,
    pub history: History,
}

fn fresh_state(
    content: &Content,
    zone: area::Id,
    at: Pos<Tiles>,
    name: String,
    immortal: Immortal,
) -> CharacterState {
    let def = def(content);
    CharacterState {
        name,
        spawn: at,
        discovered: Discovered::starting_in(zone),
        stats: player_stats(&def.stats, immortal),
        inventory: Inventory::empty(),
        xp: Xp { amount: 0 },
        equipment: Equipment::default(),
        job: Job { def: def.job },
        timed: TimedEffects::default(),
        memory: Memory::default(),
        heard: Heard::default(),
        ledger: ShopLedger::default(),
        quests: QuestLog::default(),
        history: History::default(),
    }
}

pub fn player_stats(stats: &stat::StatMap, immortal: Immortal) -> Stats {
    Stats(
        stat::listed(stats)
            .map(|stat| match stat.kind {
                StatKind::Health | StatKind::MaxHealth if immortal.0 => {
                    stat.kind.of(IMMORTAL_HEALTH)
                }
                _ => stat,
            })
            .collect(),
    )
}

pub(crate) fn place(
    world: &mut World,
    client: ClientId,
    zone: area::Id,
    at: Pos<Tiles>,
    state: CharacterState,
) -> Entity {
    let content = *world.resource::<Content>();
    let def = def(&content);
    let model = def.model;
    let assets = *world.resource::<Content>();
    let entity = world
        .spawn((
            Character {
                replicated: Replicated,
                position: Position { pos: at },
                actor: Actor {
                    color: def.tint(),
                    dir: Direction::S,
                    action: Action::Idle,
                    model,
                    attack_rate: PlaybackRate(stat::of_map(&def.stats, StatKind::AttackSpeed)),
                },
                hitbox: Hitbox {
                    size: actor::model(&assets, model).hitbox(),
                },
                area: AreaTag { area: zone },
            },
            Name { name: state.name },
            state.discovered,
            OwnedBy(client),
            Owner { client },
            state.inventory,
            state.xp,
            state.equipment,
            state.job,
            state.timed,
            state.memory,
            state.heard,
            state.ledger,
            state.quests,
            state.history,
        ))
        .id();
    state.stats.apply(world, entity);
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    world.entity_mut(entity).insert((
        SpawnPoint(state.spawn),
        ArrivalHold {
            until: now + ARRIVAL_HOLD,
        },
    ));
    let belongings = belongings::of(world, entity);
    world.entity_mut(entity).insert(belongings);
    world.resource_mut::<Players>().0.insert(client, entity);
    entity
}

pub fn respawn(world: &mut World) {
    let content = *world.resource::<Content>();
    for request in crate::systems::requests::<RespawnRequest>(world) {
        let Some(entity) = sender_player(world, request.client_id) else {
            continue;
        };
        if !stat::is_dead(world, entity) {
            continue;
        }
        let Some(spawn) = world.get::<SpawnPoint>(entity).map(|spawn| spawn.0) else {
            continue;
        };
        stat::refill(world, entity);
        if let Some(mut memory) = world.get_mut::<Memory>(entity) {
            memory.leave_area(&content);
        }
        if let Some(mut position) = world.get_mut::<Position>(entity) {
            position.pos = spawn;
        }
        if let Some(mut actor) = world.get_mut::<Actor>(entity) {
            set_action(&mut actor, Action::Idle);
        }
        crate::systems::reach::forget(world, entity);
    }
}
