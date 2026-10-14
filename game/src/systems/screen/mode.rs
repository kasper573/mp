use bevy::prelude::*;
use ui::{Activate, button, text_colored};

use super::loading::AfterLoading;
use super::{ClientScreen, despawn_all};

#[derive(Resource, Default, Clone, Copy, PartialEq, Eq)]
pub enum ClientMode {
    #[default]
    Play,
    Spectate,
}

pub struct ClientModePlugin;

impl Plugin for ClientModePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ClientMode>()
            .add_systems(OnEnter(ClientScreen::ChoosingMode), choose_mode)
            .add_systems(OnExit(ClientScreen::ChoosingMode), despawn_all::<ModeUi>);
    }
}

#[derive(Component, Default, Clone)]
struct ModeUi;

fn choose_mode(mut commands: Commands) {
    commands.spawn_scene(bsn! {
        ModeUi
        super::screen_node()
        Children [
            @{text_colored("Choose a mode", Color::WHITE)}
            --
            @{button("Play")} on(enter(ClientMode::Play))
            --
            @{button("Spectate")} on(enter(ClientMode::Spectate))
        ]
    });
}

fn enter(mode: ClientMode) -> impl Fn(On<Activate>, Commands) + Clone {
    move |_, mut commands| {
        commands.queue(move |world: &mut World| {
            *world.resource_mut::<ClientMode>() = mode;
            world.resource_mut::<AfterLoading>().0 = ClientScreen::Connecting;
            world
                .resource_mut::<NextState<ClientScreen>>()
                .set(ClientScreen::Connecting);
        });
    }
}
