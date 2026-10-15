use bevy::prelude::*;

use crate::core::render;
use crate::systems::combat::{self, AttackRequest};
use crate::systems::input::gestures::{ClickClaim, Cursor, Gesture};
use crate::systems::interface::CursorShape;
use crate::systems::player::session;

pub struct AttackGesture;

impl Gesture for AttackGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        if !session::is_alive(world) {
            return None;
        }
        let point = render::cursor_tile(world)?;
        combat::enemy_at(world, point).map(ClickClaim::Attack)
    }

    fn drive(&self, world: &mut World, start: bool) {
        if start && let Some(ClickClaim::Attack(target)) = self.claim(world) {
            world.write_message(AttackRequest { target });
        }
    }

    fn cursor(&self, _world: &mut World) -> Option<Cursor> {
        Some(Cursor::Shaped(CursorShape::Attack))
    }
}
