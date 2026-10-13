use bevy::prelude::*;
use ui::{Activate, button, text_colored};

use super::loading::AfterLoading;
use super::{Scene, despawn_all};

#[derive(Resource, Default, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Play,
    Spectate,
}

pub struct ModePlugin;

impl Plugin for ModePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Mode>()
            .add_systems(OnEnter(Scene::Mode), choose_mode)
            .add_systems(OnExit(Scene::Mode), despawn_all::<ModeUi>);
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
            @{button("Play")} on(enter(Mode::Play))
            --
            @{button("Spectate")} on(enter(Mode::Spectate))
        ]
    });
}

fn enter(mode: Mode) -> impl Fn(On<Activate>, Commands) + Clone {
    move |_, mut commands| {
        commands.queue(move |world: &mut World| {
            *world.resource_mut::<Mode>() = mode;
            world.resource_mut::<AfterLoading>().0 = Scene::Connecting;
            world
                .resource_mut::<NextState<Scene>>()
                .set(Scene::Connecting);
        });
    }
}
