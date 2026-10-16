use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use design_tokens::widgets;

use super::loading::AfterLoading;
use super::{ClientScreen, system_screen};
use crate::core::gui::{self, Band};

#[derive(Resource, Default, Clone, Copy, PartialEq, Eq)]
pub enum ClientMode {
    #[default]
    Play,
    Spectate,
}

pub struct ClientModePlugin;

impl Plugin for ClientModePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ClientMode>().add_systems(
            EguiPrimaryContextPass,
            choose_mode
                .in_set(Band::System)
                .run_if(in_state(ClientScreen::ChoosingMode)),
        );
    }
}

fn choose_mode(world: &mut World) {
    let Some(gui) = gui::context(world) else {
        return;
    };
    let picked = system_screen(&gui, "mode", None, |ui| {
        ui.heading("Choose a mode");
        if widgets::primary(ui, "Play").clicked() {
            return Some(ClientMode::Play);
        }
        ui.button("Spectate")
            .clicked()
            .then_some(ClientMode::Spectate)
    })
    .inner;
    if let Some(mode) = picked {
        *world.resource_mut::<ClientMode>() = mode;
        world.resource_mut::<AfterLoading>().0 = ClientScreen::Connecting;
        world
            .resource_mut::<NextState<ClientScreen>>()
            .set(ClientScreen::Connecting);
    }
}
