use bevy::prelude::*;

use crate::core::render;
use crate::systems::input::gestures::{ClickClaim, Cursor, Gesture};
use crate::systems::interface::CursorShape;
use crate::systems::item::{self, PickupRequest};
use crate::systems::player::session;

pub struct PickupGesture;

impl Gesture for PickupGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        if !session::is_alive(world) {
            return None;
        }
        let point = render::cursor_tile(world)?;
        item::pickable_at(world, point).map(ClickClaim::Pickup)
    }

    fn drive(&self, world: &mut World, start: bool) {
        if start && let Some(ClickClaim::Pickup(target)) = self.claim(world) {
            world.write_message(PickupRequest { target });
        }
    }

    fn cursor(&self, _world: &mut World) -> Option<Cursor> {
        Some(Cursor::Shaped(CursorShape::PickUp))
    }
}
