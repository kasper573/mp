use bevy::prelude::*;
use bevy_replicon_renet2::RepliconRenetClientPlugin;
use bevy_replicon_renet2::renet2::{RenetClient, RenetClientPlugin, RenetReceive, RenetSend};

use crate::core::platform::{ServerSocket, SocketState};

pub struct ClientSocket(pub Box<dyn ServerSocket>);

/// Carries renet2 over a socket the platform opened, with no netcode layer: the socket itself is
/// what connects and disconnects the client.
pub struct SocketClientPlugin;

impl Plugin for SocketClientPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(RepliconRenetClientPlugin)
            .add_systems(
                PreUpdate,
                receive
                    .in_set(RenetReceive)
                    .after(RenetClientPlugin::update_system),
            )
            .add_systems(PostUpdate, send.in_set(RenetSend));
    }
}

fn receive(
    mut commands: Commands,
    socket: Option<NonSend<ClientSocket>>,
    client: Option<ResMut<RenetClient>>,
) {
    let (Some(socket), Some(mut client)) = (socket, client) else {
        return;
    };
    while let Some(packet) = socket.0.recv() {
        client.process_packet(&packet);
    }
    match socket.0.state() {
        SocketState::Open if client.is_connecting() => client.set_connected(),
        // renet has no internal timeout, so a closed socket is the only liveness signal. The
        // connection ends with its resources: replicon starts a connection when a client resource is
        // added, so the next one must not overwrite this one.
        SocketState::Closed => {
            commands.remove_resource::<RenetClient>();
            commands.queue(|world: &mut World| {
                world.remove_non_send::<ClientSocket>();
            });
        }
        SocketState::Connecting | SocketState::Open => {}
    }
}

fn send(socket: Option<NonSend<ClientSocket>>, client: Option<ResMut<RenetClient>>) {
    let (Some(socket), Some(mut client)) = (socket, client) else {
        return;
    };
    for packet in client.get_packets_to_send() {
        socket.0.send(packet);
    }
}
