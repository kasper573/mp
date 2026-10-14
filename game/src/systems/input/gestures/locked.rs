use bevy::prelude::*;
use bevy::window::CursorIcon;

use crate::systems::input::gestures::{ClickClaim, Gesture, content_cursor};
use crate::systems::interface::CursorShape;
use crate::systems::player::session;

pub struct LockedGesture;

impl Gesture for LockedGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        session::is_locked(world).then_some(ClickClaim::Locked)
    }

    fn drive(&self, _world: &mut World, _start: bool) {}

    fn cursor(&self, world: &mut World) -> Option<CursorIcon> {
        Some(content_cursor(world, CursorShape::Default))
    }
}
