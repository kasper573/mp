pub mod area;
pub mod connection;
pub mod loading;
pub mod mode;

use bevy::prelude::*;

use crate::core::net::transport::Client;
use crate::systems::player::session;
use connection::{Announce, PendingSession};

#[derive(States, Default, Clone, PartialEq, Eq, Hash, Debug)]
pub enum Scene {
    #[default]
    Loading,
    Mode,
    Connecting,
    Lost,
    Area,
}

pub struct ScenePlugin {
    pub spectator: bool,
}

impl Plugin for ScenePlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<Scene>()
            .insert_resource(loading::AfterLoading(if self.spectator {
                Scene::Mode
            } else {
                Scene::Connecting
            }))
            .add_plugins((
                loading::LoadingPlugin,
                mode::ModePlugin,
                connection::ConnectionPlugin,
                area::AreaPlugin,
            ))
            .add_systems(Update, (connection::poll_session, drive, announce).chain());
    }
}

fn drive(
    pending: Option<Res<PendingSession>>,
    client: Option<Res<Client>>,
    scene: Res<State<Scene>>,
    mut next: ResMut<NextState<Scene>>,
) {
    if matches!(scene.get(), Scene::Mode | Scene::Loading) || !matches!(*next, NextState::Unchanged)
    {
        return;
    }
    let connected = client
        .as_ref()
        .is_some_and(|client| client.0.is_connected());
    let attempting = pending.is_some()
        || client
            .as_ref()
            .is_some_and(|client| client.0.is_connecting());
    let target = if connected {
        Scene::Area
    } else if attempting {
        Scene::Connecting
    } else {
        Scene::Lost
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
        session::spectate(world, crate::systems::spectate::SpectateRequest::Start);
    } else {
        session::join(world);
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
