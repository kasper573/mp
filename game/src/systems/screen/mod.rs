pub mod area;
pub mod connection;
pub mod loading;
pub mod mode;

use bevy::prelude::*;
use renet2::RenetClient;

use crate::core::time::{Backoff, Seconds};
use crate::systems::player::{JoinRequest, session};
use crate::systems::spectate::SpectateRequest;
use connection::{Announce, PendingSession};

const SERVER_RETRY: Backoff = Backoff {
    first: Seconds(1.0),
    longest: Seconds(30.0),
};

#[derive(States, Default, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ClientScreen {
    #[default]
    Loading,
    ChoosingMode,
    Connecting,
    Lost,
    Area,
}

pub struct ClientScreenPlugin {
    pub spectator: bool,
}

impl Plugin for ClientScreenPlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<ClientScreen>()
            .insert_resource(loading::AfterLoading(if self.spectator {
                ClientScreen::ChoosingMode
            } else {
                ClientScreen::Connecting
            }))
            .add_plugins((
                loading::LoadingPlugin,
                mode::ClientModePlugin,
                connection::ConnectionPlugin,
                area::AreaPlugin,
            ))
            .add_systems(Update, (connection::poll_session, drive, announce).chain());
    }
}

fn drive(
    pending: Option<Res<PendingSession>>,
    client: Option<Res<RenetClient>>,
    scene: Res<State<ClientScreen>>,
    mut next: ResMut<NextState<ClientScreen>>,
) {
    if matches!(
        scene.get(),
        ClientScreen::ChoosingMode | ClientScreen::Loading
    ) || !matches!(*next, NextState::Unchanged)
    {
        return;
    }
    let connected = client.as_ref().is_some_and(|client| client.is_connected());
    let attempting =
        pending.is_some() || client.as_ref().is_some_and(|client| client.is_connecting());
    let target = if connected {
        ClientScreen::Area
    } else if attempting {
        ClientScreen::Connecting
    } else {
        ClientScreen::Lost
    };
    if *scene.get() != target {
        next.set(target);
    }
}

fn announce(world: &mut World) {
    if world.get_resource::<Announce>().is_none() || session::my_id(world).is_none() {
        return;
    }
    let spectate = world.resource::<Announce>().spectate;
    info!(
        "connection welcomed; announcing {}",
        if spectate { "spectate" } else { "join" }
    );
    if spectate {
        world.write_message(SpectateRequest::Start);
    } else {
        world.write_message(JoinRequest);
    }
    world.remove_resource::<Announce>();
}

pub(crate) fn screen_node() -> Node {
    Node {
        position_type: PositionType::Absolute,
        width: Val::Percent(100.0),
        height: Val::Percent(100.0),
        flex_direction: FlexDirection::Column,
        align_items: AlignItems::Center,
        justify_content: JustifyContent::Center,
        row_gap: Val::Px(16.0),
        ..default()
    }
}

pub(crate) fn despawn_all<M: Component>(entities: Query<Entity, With<M>>, mut commands: Commands) {
    for entity in &entities {
        commands.entity(entity).despawn();
    }
}
