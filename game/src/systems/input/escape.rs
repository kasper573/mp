use bevy::prelude::*;
use bevy_egui::input::egui_wants_any_keyboard_input;

use super::map::{self, InputAction, InputMap};
use crate::systems::dialogue::stage;
use crate::systems::history::widget as history;
use crate::systems::{hud, item};

static LAYERS: &[fn(&mut World) -> bool] = &[
    hud::dismiss_confirm,
    item::card::close,
    history::close,
    stage::leave,
    hud::close_topmost_window,
];

pub(super) fn plugin(app: &mut App) {
    app.add_systems(
        Update,
        dismiss_topmost
            .run_if(not(egui_wants_any_keyboard_input))
            .run_if(resource_exists::<InputMap>),
    );
}

fn dismiss_topmost(world: &mut World) {
    if !map::just_pressed(world, InputAction::Dismiss) {
        return;
    }
    for dismiss in LAYERS {
        if dismiss(world) {
            return;
        }
    }
}
