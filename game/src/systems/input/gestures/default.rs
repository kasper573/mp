use bevy::prelude::*;
use bevy::window::CursorIcon;

use crate::systems::input::gestures::{ClickClaim, Gesture, content_cursor};
use crate::systems::interface::CursorShape;

pub struct DefaultGesture;

impl Gesture for DefaultGesture {
    fn priority(&self) -> i32 {
        6
    }

    fn claim(&self, _world: &mut World) -> Option<ClickClaim> {
        Some(ClickClaim::Nothing)
    }

    fn drive(&self, _world: &mut World, _start: bool) {}

    fn cursor(&self, world: &mut World) -> Option<CursorIcon> {
        Some(content_cursor(world, CursorShape::Default))
    }
}
