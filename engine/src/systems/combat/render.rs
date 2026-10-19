use bevy::prelude::*;

use crate::core::render::present::ScreenGrade;
use crate::systems::player::session;
use crate::systems::screen::ClientScreen;

pub struct CombatRenderPlugin;

impl Plugin for CombatRenderPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, death_wash.run_if(in_state(ClientScreen::Area)));
    }
}

const DEATH_WASH: ScreenGrade = ScreenGrade {
    scale: Vec3::new(1.0, 1.0 / 3.0, 1.0 / 3.0),
    offset: Vec3::new(160.0 / 255.0, 0.0, 0.0),
};

fn death_wash(world: &mut World) {
    let grade = if session::is_dead(world) {
        DEATH_WASH
    } else {
        ScreenGrade::NONE
    };
    *world.resource_mut::<ScreenGrade>() = grade;
}
