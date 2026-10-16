use bevy_app::{App, Plugin, PreUpdate, Update};
use bevy_ecs::prelude::*;
use bevy_replicon::client::ClientSystems;
use bevy_replicon::prelude::{AuthMethod, ClientState, RepliconPlugins, RepliconSharedPlugin};
use bevy_replicon::shared::server_entity_map::ServerEntityMap;
use bevy_state::prelude::{OnEnter, OnExit};

use super::{ClientId, Owner, Welcome};
use crate::core::render::transition::WorldViewSystems;
use crate::core::time::{Seconds, UnixMillis};
use crate::systems::spectate::Spectating;
use crate::systems::stat;
use bevy_time::Time;

pub struct ClientSessionPlugin;

impl Plugin for ClientSessionPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(
            bevy_app::PluginGroup::build(RepliconPlugins).set(RepliconSharedPlugin {
                auth_method: AuthMethod::None,
            }),
        );
        crate::systems::protocol(app);
        app.init_resource::<MyClient>()
            .init_resource::<ServerClock>()
            .init_resource::<MyCharacter>()
            .init_resource::<SpectateStatus>()
            .init_resource::<Viewpoint>();
        app.add_systems(Update, record_welcome);
        app.add_systems(
            PreUpdate,
            (record_spectating, track_characters.in_set(WorldViewSystems))
                .chain()
                .after(ClientSystems::Receive),
        );
        app.add_systems(OnEnter(ClientState::Disconnected), forget_me);
        app.add_systems(
            OnExit(ClientState::Connected),
            drop_replicated.before(ClientSystems::Reset),
        );
    }
}

#[derive(Resource, Default)]
pub struct MyClient(pub Option<ClientId>);

/// The server's wall clock as the welcome carried it, against the client's own uptime, so the
/// client can tell how far along a server deadline is without a wall clock of its own.
#[derive(Resource, Default)]
pub struct ServerClock(Option<(UnixMillis, Seconds)>);

impl ServerClock {
    pub fn now(&self, uptime: Seconds) -> Option<UnixMillis> {
        let (then, at) = self.0?;
        Some(then.after(uptime - at))
    }
}

pub fn server_now(world: &World) -> Option<UnixMillis> {
    let uptime = Seconds(world.resource::<Time>().elapsed_secs());
    world.resource::<ServerClock>().now(uptime)
}

#[derive(Resource, Default)]
struct MyCharacter(Option<Entity>);

#[derive(Resource, Default)]
pub struct SpectateStatus(pub Option<Spectating>);

impl SpectateStatus {
    pub fn mode(&self) -> ClientMode {
        match self.0 {
            Some(_) => ClientMode::Spectate,
            None => ClientMode::Play,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClientMode {
    Play,
    Spectate,
}

pub fn mode(world: &World) -> ClientMode {
    world.resource::<SpectateStatus>().mode()
}

pub fn in_mode(mode: ClientMode) -> impl Fn(Res<SpectateStatus>) -> bool + Clone {
    move |status| status.mode() == mode
}

/// The character this client sees the world through: its own, or the one it spectates. There is no
/// other way to look at the world.
#[derive(Resource, Default)]
pub struct Viewpoint(pub Option<Entity>);

pub fn my_id(world: &World) -> Option<ClientId> {
    world.resource::<MyClient>().0
}

pub fn my_character(world: &World) -> Option<EntityRef<'_>> {
    world
        .resource::<MyCharacter>()
        .0
        .and_then(|character| world.get_entity(character).ok())
}

pub fn is_dead(world: &World) -> bool {
    my_character(world).is_some_and(|entity| stat::is_dead(world, entity.id()))
}

pub fn is_locked(world: &World) -> bool {
    my_character(world).is_some_and(|entity| super::commands_locked(world, entity.id()))
}

pub fn is_alive(world: &World) -> bool {
    my_character(world).is_some_and(|entity| !stat::is_dead(world, entity.id()))
}

pub fn followed(world: &World) -> Option<ClientId> {
    followed_client(
        world.resource::<MyClient>(),
        world.resource::<SpectateStatus>(),
    )
}

fn record_welcome(
    mut welcomes: MessageReader<Welcome>,
    time: Res<Time>,
    mut me: ResMut<MyClient>,
    mut clock: ResMut<ServerClock>,
) {
    for welcome in welcomes.read() {
        me.0 = Some(welcome.id);
        clock.0 = Some((welcome.now, Seconds(time.elapsed_secs())));
    }
}

fn record_spectating(mut told: MessageReader<Spectating>, mut status: ResMut<SpectateStatus>) {
    if let Some(&latest) = told.read().last() {
        status.0 = (latest != Spectating::Stopped).then_some(latest);
    }
}

fn followed_client(me: &MyClient, status: &SpectateStatus) -> Option<ClientId> {
    match status.0 {
        Some(Spectating::Player(watched)) => Some(watched.player),
        Some(Spectating::Nobody) => None,
        Some(Spectating::Stopped) | None => me.0,
    }
}

fn track_characters(
    me: Res<MyClient>,
    status: Res<SpectateStatus>,
    characters: Query<(Entity, &Owner)>,
    mut mine: ResMut<MyCharacter>,
    mut viewpoint: ResMut<Viewpoint>,
) {
    let character_of = |client: ClientId| {
        characters
            .iter()
            .find(|(_, owner)| owner.client == client)
            .map(|(character, _)| character)
    };
    let my_character = me.0.and_then(character_of);
    if mine.0 != my_character {
        mine.0 = my_character;
    }
    let followed = followed_client(&me, &status).and_then(character_of);
    if viewpoint.0 != followed {
        viewpoint.0 = followed;
    }
}

/// A connection's world ends with it: the next server (the same one restarted, or another after a
/// deploy) numbers its entities afresh, so nothing of the old one may stay to be mistaken for new.
fn drop_replicated(world: &mut World) {
    let entities: Vec<Entity> = world
        .resource::<ServerEntityMap>()
        .to_client()
        .values()
        .copied()
        .collect();
    for entity in entities {
        if let Ok(entity) = world.get_entity_mut(entity) {
            entity.despawn();
        }
    }
}

fn forget_me(mut me: ResMut<MyClient>, mut status: ResMut<SpectateStatus>) {
    me.0 = None;
    status.0 = None;
}
