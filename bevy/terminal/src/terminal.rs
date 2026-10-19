use bevy_app::App;
use bevy_ecs::message::{Message, Messages};
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::{
    Channel, ClientId, ConnectedClient, FromClient, SendTargets, ToClients,
};
use serde::{Deserialize, Serialize};

use crate::command::{self, TerminalCommand, TerminalCommands};

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TerminalInput {
    pub text: String,
}

#[derive(Message, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TerminalLine {
    pub text: String,
    pub tone: LineTone,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineTone {
    Said,
    Failed,
}

#[derive(Message, Clone, Debug, PartialEq)]
pub struct TerminalSaid {
    pub conn: Entity,
    pub text: String,
}

pub fn register(app: &mut App, commands: &[TerminalCommand]) {
    use bevy_replicon::prelude::{ClientMessageAppExt, ServerMessageAppExt};

    app.insert_resource(TerminalCommands::new(commands))
        .add_message::<TerminalSaid>()
        .add_client_message::<TerminalInput>(Channel::Ordered)
        .add_server_message::<TerminalLine>(Channel::Ordered);
}

pub fn broadcast(world: &mut World, text: impl Into<String>) {
    let text = text.into();
    let conns: Vec<Entity> = world
        .query_filtered::<Entity, With<ConnectedClient>>()
        .iter(world)
        .collect();
    for conn in conns {
        send(world, conn, &text, LineTone::Said);
    }
}

pub fn reply(world: &mut World, conn: Entity, text: impl Into<String>) {
    send(world, conn, &text.into(), LineTone::Said);
}

pub fn reply_failure(world: &mut World, conn: Entity, text: impl Into<String>) {
    send(world, conn, &text.into(), LineTone::Failed);
}

pub fn ingest(world: &mut World) {
    let requests: Vec<FromClient<TerminalInput>> = world
        .resource_mut::<Messages<FromClient<TerminalInput>>>()
        .drain()
        .collect();
    for request in requests {
        let Some(conn) = request.client_id.entity() else {
            continue;
        };
        let text: String = request
            .message
            .text
            .trim()
            .chars()
            .take(MAX_INPUT_LEN)
            .collect();
        if text.is_empty() {
            continue;
        }
        if let Some(line) = text.strip_prefix('/') {
            command::run(world, conn, line);
        } else {
            world.write_message(TerminalSaid { conn, text });
        }
    }
}

const MAX_INPUT_LEN: usize = 256;

fn send(world: &mut World, conn: Entity, text: &str, tone: LineTone) {
    for line in text.lines() {
        world.write_message(ToClients {
            targets: SendTargets::Single(ClientId::Client(conn)),
            message: TerminalLine {
                text: line.to_owned(),
                tone,
            },
        });
    }
}
