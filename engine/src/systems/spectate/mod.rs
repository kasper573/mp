pub mod widget;

use std::collections::HashMap;

use bevy_app::App;
use bevy_ecs::prelude::*;
use bevy_terminal::{CommandCtx, command};
use serde::{Deserialize, Serialize};

use crate::systems::account::{Identity, Role};
use crate::systems::area::transition::{self, Departures, Traveler};
use crate::systems::movement::Position;
use crate::systems::player::{self, ClientId, Players, SpawnPoint, last_connection};
use crate::systems::visibility::{self, PrivateSight};
use crate::systems::{WorldArea, drain_requests};

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;

    app.add_client_message::<SpectateRequest>(Channel::Ordered)
        .add_server_message::<Spectating>(Channel::Ordered);
}

#[derive(Message, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpectateRequest {
    Next,
    Previous,
    Stop,
}

/// Whom a spectator watches, told whenever it changes. A spectator watches nobody only while nobody
/// plays.
#[derive(Message, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Spectating {
    Nobody,
    Player(Watched),
    Stopped,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Watched {
    pub player: ClientId,
    /// Counts from 1.
    pub place: u32,
    pub online: u32,
}

#[derive(Resource, Default)]
pub struct Spectators(pub HashMap<ClientId, Spectator>);

pub struct Spectator {
    watching: Option<ClientId>,
    step: Option<Step>,
    told: Option<Spectating>,
    character: Box<Traveler>,
}

impl Spectator {
    pub fn watching(&self) -> Option<ClientId> {
        self.watching
    }
}

/// Leave your character where it stands to watch the other players, until Exit on the spectator panel.
#[command(access = may_spectate)]
fn spectate(world: &mut World, ctx: &CommandCtx) -> Result<String, String> {
    let client = *world
        .get::<ClientId>(ctx.conn)
        .ok_or("You're not connected.")?;
    if world.resource::<Spectators>().0.contains_key(&client) {
        return Err("You're spectating already.".to_owned());
    }
    let player = world
        .resource::<Players>()
        .0
        .get(&client)
        .copied()
        .ok_or("You have no character to leave.")?;
    if !player::may_command(world, player) {
        return Err("Your character can't leave right now.".to_owned());
    }
    let zone = world.resource::<WorldArea>().0;
    let at = world
        .get::<Position>(player)
        .ok_or("Your character has no place.")?
        .pos;
    let spawn = world
        .get::<SpawnPoint>(player)
        .ok_or("Your character has no place.")?
        .0;
    let character =
        transition::leave(world, player, zone, at, spawn).ok_or("Your character can't leave.")?;
    world.resource_mut::<Spectators>().0.insert(
        client,
        Spectator {
            watching: None,
            step: None,
            told: None,
            character: Box::new(character),
        },
    );
    Ok(
        "You're spectating. Exit on the spectator panel takes you back to your character."
            .to_owned(),
    )
}

fn may_spectate(world: &World, conn: Entity) -> bool {
    world
        .get::<Identity>(conn)
        .is_some_and(|identity| identity.has_role(Role::Spectate))
}

pub struct SpectatorTransfer {
    pub client: ClientId,
    pub dest: usize,
    spectator: Spectator,
}

pub fn requests(world: &mut World) {
    for request in drain_requests::<SpectateRequest>(world) {
        let Some(conn) = request.client_id.entity() else {
            continue;
        };
        let Some(&client) = world.get::<ClientId>(conn) else {
            continue;
        };
        let step = match request.message {
            SpectateRequest::Stop => {
                stop(world, client);
                continue;
            }
            SpectateRequest::Next => Step::Next,
            SpectateRequest::Previous => Step::Previous,
        };
        if let Some(spectator) = world.resource_mut::<Spectators>().0.get_mut(&client) {
            spectator.step = Some(step);
        }
    }
}

/// Points every spectator at a player, wherever in `worlds` that player is. `arriving` are the players
/// between worlds, by the index of the world they're bound for. A spectator whose player is in another
/// world leaves theirs, and sees nothing until the transfer lands them there.
pub fn coordinate(
    worlds: &mut [App],
    arriving: impl Iterator<Item = (ClientId, usize)>,
) -> Vec<SpectatorTransfer> {
    if worlds
        .iter()
        .all(|app| app.world().resource::<Spectators>().0.is_empty())
    {
        return Vec::new();
    }
    let roster = roster(worlds, arriving);
    let mut transfers = Vec::new();
    for (index, app) in worlds.iter_mut().enumerate() {
        let world = app.world_mut();
        let clients: Vec<ClientId> = world.resource::<Spectators>().0.keys().copied().collect();
        for client in clients {
            let Some(mut spectator) = world.resource_mut::<Spectators>().0.remove(&client) else {
                continue;
            };
            spectator.watching = pick(&roster, spectator.watching, spectator.step.take());
            let status = match spectator.watching.and_then(|player| roster.watched(player)) {
                Some(watched) => Spectating::Player(watched),
                None => Spectating::Nobody,
            };
            aim(world, client, spectator.watching);
            if spectator.told != Some(status) {
                announce(world, client, status);
                spectator.told = Some(status);
            }
            match spectator
                .watching
                .and_then(|player| roster.world_of(player))
            {
                Some(dest) if dest != index => transfers.push(SpectatorTransfer {
                    client,
                    dest,
                    spectator,
                }),
                _ => {
                    world
                        .resource_mut::<Spectators>()
                        .0
                        .insert(client, spectator);
                }
            }
        }
    }
    transfers
}

pub fn arrive(world: &mut World, transfer: SpectatorTransfer) {
    // Told again from the destination: the departing world may never have sent the last word.
    let spectator = Spectator {
        told: None,
        ..transfer.spectator
    };
    aim(world, transfer.client, spectator.watching);
    world
        .resource_mut::<Spectators>()
        .0
        .insert(transfer.client, spectator);
}

pub fn client_left(
    remove: On<Remove<ClientId>>,
    clients: Query<(Entity, &ClientId)>,
    mut spectators: ResMut<Spectators>,
) {
    if let Some(id) = last_connection(remove.entity, &clients) {
        spectators.0.remove(&id);
    }
}

#[derive(Clone, Copy, Debug)]
enum Step {
    Next,
    Previous,
}

struct Roster(Vec<Online>);

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Online {
    player: ClientId,
    world: usize,
}

impl Roster {
    fn place(&self, player: ClientId) -> Result<usize, usize> {
        self.0.binary_search_by_key(&player, |online| online.player)
    }

    fn world_of(&self, player: ClientId) -> Option<usize> {
        self.place(player).ok().map(|place| self.0[place].world)
    }

    fn watched(&self, player: ClientId) -> Option<Watched> {
        let place = self.place(player).ok()?;
        Some(Watched {
            player,
            place: place as u32 + 1,
            online: self.0.len() as u32,
        })
    }
}

fn roster(worlds: &[App], arriving: impl Iterator<Item = (ClientId, usize)>) -> Roster {
    let mut online: Vec<Online> = worlds
        .iter()
        .enumerate()
        .flat_map(|(index, app)| {
            app.world()
                .resource::<Players>()
                .0
                .keys()
                .map(move |&client| (client, index))
        })
        .chain(arriving)
        .map(|(player, world)| Online { player, world })
        .collect();
    online.sort_unstable();
    Roster(online)
}

/// Keeps watching the same player while they're online. One who left hands over to the next in the
/// roster, so stepping from a player who left still lands next to where they were.
fn pick(roster: &Roster, watching: Option<ClientId>, step: Option<Step>) -> Option<ClientId> {
    let count = roster.0.len();
    if count == 0 {
        return None;
    }
    let index = match watching.map(|player| roster.place(player)) {
        None => 0,
        Some(Ok(place)) => match step {
            None => place,
            Some(Step::Next) => (place + 1) % count,
            Some(Step::Previous) => (place + count - 1) % count,
        },
        Some(Err(after)) => match step {
            None | Some(Step::Next) => after % count,
            Some(Step::Previous) => (after + count - 1) % count,
        },
    };
    Some(roster.0[index].player)
}

fn connections(world: &mut World, client: ClientId) -> Vec<Entity> {
    world
        .query::<(Entity, &ClientId)>()
        .iter(world)
        .filter(|(_, id)| **id == client)
        .map(|(conn, _)| conn)
        .collect()
}

/// The filter's view of a spectator's watch, mirrored from `Spectator::watching` on every coordination.
/// Inserting only on a change keeps `Changed<PrivateSight>` meaning "the watched player changed".
fn aim(world: &mut World, client: ClientId, watching: Option<ClientId>) {
    let sight = PrivateSight {
        own: client,
        watching,
    };
    for conn in connections(world, client) {
        if world.get::<PrivateSight>(conn) != Some(&sight) {
            world.entity_mut(conn).insert(sight);
        }
    }
}

fn announce(world: &mut World, client: ClientId, status: Spectating) {
    for conn in connections(world, client) {
        visibility::send_to(world, conn, status);
    }
}

fn stop(world: &mut World, client: ClientId) {
    let Some(spectator) = world.resource_mut::<Spectators>().0.remove(&client) else {
        return;
    };
    aim(world, client, None);
    announce(world, client, Spectating::Stopped);
    world
        .resource_mut::<Departures>()
        .0
        .push(*spectator.character);
}
