use bevy_app::App;
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::{ClientId as Sender, ConnectedClient, FromClient, ServerState};
use bevy_replicon::shared::backend::server_messages::ServerMessages;
use bevy_state::prelude::NextState;
use game::core::content::Content;
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::GameSettings;
use game::systems::area::AreaModule;
use game::systems::player::{ClientId, JoinRequest, SpawnPolicy, SpawnRules};

pub const PLAYERS_PER_AREA: usize = 25;

const CLOCK: WallClock = WallClock {
    now: UnixMillis(0),
    reset: UtcHour::MIDNIGHT,
};

/// Ticks stepped before sampling, so spawn waves and connect churn settle out of the measurement.
pub const WARMUP: usize = 30;

pub type Roster = Vec<Entity>;

/// How the area's players are positioned, which sets how much their areas-of-interest overlap. Maps
/// directly onto the server's [`SpawnPolicy`], so the bench spreads players exactly as production does.
#[derive(Clone, Copy, PartialEq)]
pub enum Layout {
    /// Every player spawns on the spawn tile, so all clients share one identical area-of-interest —
    /// the worst case for replicating nearby entities to many overlapping viewers.
    Congested,
    /// Players spawn across the area's walkable cells, so clients have realistically distinct
    /// areas-of-interest.
    Distributed,
}

impl Layout {
    pub fn label(self) -> &'static str {
        match self {
            Layout::Congested => "congested",
            Layout::Distributed => "distributed",
        }
    }

    fn spawn_policy(self) -> SpawnPolicy {
        match self {
            Layout::Congested => SpawnPolicy::Map,
            Layout::Distributed => SpawnPolicy::Dist,
        }
    }
}

pub fn npcs_per_area(content: &Content) -> usize {
    let area = content
        .built::<GameSettings>()
        .initial_spawn
        .area
        .get(content);
    area.modules
        .iter()
        .map(|module| match module {
            AreaModule::Population(population) => population.count as usize,
            AreaModule::Resident(_) => 1,
            _ => 0,
        })
        .sum()
}

pub fn worlds(areas: usize, layout: Layout, assets: &Content) -> (Vec<App>, Vec<Roster>) {
    let mut worlds = Vec::with_capacity(areas);
    let mut rosters = Vec::with_capacity(areas);
    for ordinal in 0..areas {
        let (app, roster) = build_world(layout, assets, ordinal as u64);
        worlds.push(app);
        rosters.push(roster);
    }
    (worlds, rosters)
}

pub fn connect(worlds: &mut [App], rosters: &[Roster]) {
    for (app, roster) in worlds.iter_mut().zip(rosters) {
        let world = app.world_mut();
        for &conn in roster {
            world
                .entity_mut(conn)
                .insert(ConnectedClient { max_size: 1200 });
        }
    }
}

/// Advances every world one tick across all cores — the same parallel area fan-out the real server
/// uses, so the benchmark's capacity reflects the threaded server.
pub fn step(worlds: &mut [App]) {
    game::systems::step_areas(worlds, CLOCK);
    consume_sent(worlds);
}

/// Advances every world one tick on the calling thread only. Used by the profiler so CPU samples
/// attribute cleanly to game systems instead of being scattered across rayon worker frames.
#[cfg(feature = "profiling")]
pub fn step_single_threaded(worlds: &mut [App]) {
    for app in worlds.iter_mut() {
        app.update();
    }
    consume_sent(worlds);
}

/// What the server's transport does with outgoing messages once they are on the wire.
fn consume_sent(worlds: &mut [App]) {
    for app in worlds.iter_mut() {
        app.world_mut()
            .resource_mut::<ServerMessages>()
            .drain_sent()
            .for_each(drop);
    }
}

fn build_world(layout: Layout, assets: &Content, ordinal: u64) -> (App, Roster) {
    let mut app = game::systems::server_app(
        assets.built::<GameSettings>().initial_spawn.area,
        ordinal,
        CLOCK,
        assets,
    );
    app.insert_resource(game::core::math::Rng::from_entropy());
    app.insert_resource(SpawnRules {
        policy: layout.spawn_policy(),
        immortal: false,
    });
    app.finish();
    app.cleanup();
    app.world_mut()
        .resource_mut::<NextState<ServerState>>()
        .set(ServerState::Running);
    app.update(); // Startup `npc::spawn_all` populates the area's real NPC distribution.

    let world = app.world_mut();
    let mut roster = Vec::with_capacity(PLAYERS_PER_AREA);
    for index in 0..PLAYERS_PER_AREA {
        let conn = world.spawn(ClientId(index as u32 + 1)).id();
        world.write_message(FromClient {
            client_id: Sender::Client(conn),
            message: JoinRequest,
        });
        roster.push(conn);
    }
    app.update(); // the real `player::join` system spawns each player's character.
    (app, roster)
}
