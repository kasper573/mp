use bevy::prelude::*;
use bevy::tasks::{IoTaskPool, Task, block_on, futures_lite::future};
use bevy_replicon::prelude::RepliconChannels;
use bevy_replicon_renet2::RenetChannelsExt;
use renet2::{ConnectionConfig, RenetClient};
use ui::{Activate, button, text_colored};

use super::mode::ClientMode;
use super::{ClientScreen, SERVER_RETRY, despawn_all};
use crate::core::content::sync::SyncedContent;
use crate::core::content::version;
use crate::core::math::Rng;
use crate::core::net::SessionRequest;
use crate::core::net::auth::Credentials;
use crate::core::net::transport::ClientSocket;
use crate::core::platform::{ClientPlatform, FetchFailure, StartParams};
use crate::core::render::transition::ScreenTransitionPhase;
use crate::core::time::Seconds;
use crate::systems::hud::spawn_ui;

pub(super) const OVERLAY_BG: Color = Color::srgb(0.07, 0.07, 0.07);

pub struct ConnectionPlugin;

impl Plugin for ConnectionPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Reconnect>()
            .add_systems(
                OnEnter(ClientScreen::Connecting),
                (connecting, begin_session),
            )
            .add_systems(OnEnter(ClientScreen::Lost), lost)
            .add_systems(OnEnter(ClientScreen::Area), settle)
            .add_systems(Update, retry_when_due.run_if(in_state(ClientScreen::Lost)))
            .add_systems(
                OnExit(ClientScreen::Connecting),
                despawn_all::<ConnectionUi>,
            )
            .add_systems(OnExit(ClientScreen::Lost), despawn_all::<ConnectionUi>);
    }
}

#[derive(Resource)]
pub struct Announce {
    pub spectate: bool,
}

#[derive(Resource)]
pub struct PendingSession {
    task: Task<Result<String, FetchFailure>>,
    spectate: bool,
}

#[derive(Resource, Default)]
struct Reconnect {
    failures: u32,
    due: Option<Seconds>,
}

pub fn open_session(world: &mut World, spectate: bool) {
    let Some(credentials) = world.get_resource::<Credentials>().cloned() else {
        error!("no access token; cannot open a session");
        return;
    };
    let game_server_url = world.resource::<StartParams>().game_server_url.clone();
    let rows = world.resource::<SyncedContent>().manifest.rows.hash.clone();
    let body = serde_json::to_string(&SessionRequest {
        build: version::build().to_owned(),
        rows,
    })
    .expect("a session request serializes");
    let fetch = world.resource::<ClientPlatform>().0.post(
        format!("{game_server_url}/session"),
        credentials.authorization,
        body,
    );
    let task = IoTaskPool::get().spawn_local(fetch);
    world.insert_resource(PendingSession { task, spectate });
}

pub(super) fn poll_session(world: &mut World) {
    let Some(mut pending) = world.remove_resource::<PendingSession>() else {
        return;
    };
    match block_on(future::poll_once(&mut pending.task)) {
        Some(Ok(ticket)) => {
            connect(world, ticket.trim());
            world.insert_resource(Announce {
                spectate: pending.spectate,
            });
        }
        // Loading again finds out what changed, and catches the client up or relaunches it.
        Some(Err(FetchFailure::Status { status: 409, body })) => {
            info!("the server refused the session: {body}");
            world
                .resource_mut::<NextState<ClientScreen>>()
                .set(ClientScreen::Loading);
        }
        Some(Err(error)) => error!("could not open a session: {error}"),
        None => world.insert_resource(pending),
    }
}

fn begin_session(world: &mut World) {
    let spectate = *world.resource::<ClientMode>() == ClientMode::Spectate;
    open_session(world, spectate);
}

fn connect(world: &mut World, ticket: &str) {
    let channels = world.resource::<RepliconChannels>();
    let connection_config =
        ConnectionConfig::from_channels(channels.server_configs(), channels.client_configs());
    let ws_url = world.resource::<StartParams>().game_server_ws_url.clone();
    let client = RenetClient::new(connection_config, true);
    let socket = world
        .resource::<ClientPlatform>()
        .0
        .connect(&format!("{ws_url}/?ticket={ticket}"));
    world.insert_resource(client);
    world.insert_non_send(ClientSocket(socket));
    info!("connection opened");
}

#[derive(Component, Default, Clone)]
struct ConnectionUi;

fn connecting(mut commands: Commands, phase: Res<ScreenTransitionPhase>) {
    let background = overlay(*phase);
    commands.spawn_scene(bsn! {
        ConnectionUi
        super::screen_node()
        BackgroundColor({background})
        GlobalZIndex({ui::tokens::layer::SYSTEM})
        Children [ @{text_colored("Connecting…", Color::WHITE)} ]
    });
}

fn lost(world: &mut World) {
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let failures = world.resource::<Reconnect>().failures + 1;
    let wait = SERVER_RETRY.after(failures, &mut world.resource_mut::<Rng>());
    *world.resource_mut::<Reconnect>() = Reconnect {
        failures,
        due: Some(now + wait),
    };
    world
        .resource::<ClientPlatform>()
        .0
        .announce("Connection lost. Reconnecting…");
    let background = overlay(*world.resource::<ScreenTransitionPhase>());
    spawn_ui(world, connection_lost(background));
}

fn connection_lost(background: Color) -> impl Scene {
    bsn! {
        ConnectionUi
        super::screen_node()
        BackgroundColor({background})
        GlobalZIndex({ui::tokens::layer::SYSTEM})
        Children [
            @{text_colored("Connection lost", Color::WHITE)}
            --
            @{text_colored("Reconnecting…", Color::WHITE)}
            --
            @{button("Retry now")} on(retry_now)
        ]
    }
}

fn settle(mut reconnect: ResMut<Reconnect>) {
    *reconnect = Reconnect::default();
}

fn retry_when_due(
    time: Res<Time>,
    mut reconnect: ResMut<Reconnect>,
    mut next: ResMut<NextState<ClientScreen>>,
) {
    let now = Seconds(time.elapsed_secs());
    if reconnect.due.is_some_and(|due| now >= due) {
        reconnect.due = None;
        next.set(ClientScreen::Loading);
    }
}

fn retry_now(
    _: On<Activate>,
    mut reconnect: ResMut<Reconnect>,
    mut next: ResMut<NextState<ClientScreen>>,
) {
    reconnect.due = None;
    next.set(ClientScreen::Loading);
}

fn overlay(phase: ScreenTransitionPhase) -> Color {
    if phase == ScreenTransitionPhase::Idle {
        OVERLAY_BG
    } else {
        Color::NONE
    }
}
