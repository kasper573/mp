use bevy::prelude::*;

use crate::core::render::present::ScreenTint;
use crate::systems::player::session;
use crate::systems::screen::ClientScreen;

pub struct CombatPlugin;

impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, death_tint.run_if(in_state(ClientScreen::Area)));
    }
}

fn death_tint(world: &mut World) {
    let tint = if session::is_dead(world) {
        Vec4::new(1.0, 0.0, 0.0, 0.0)
    } else {
        Vec4::ZERO
    };
    world.resource_mut::<ScreenTint>().0 = tint;
}
