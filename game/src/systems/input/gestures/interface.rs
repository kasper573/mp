use bevy::prelude::*;
use bevy::window::{CursorIcon, SystemCursorIcon};
use ui::{CursorStyle, InterfaceCursor};

use crate::systems::input::gestures::{ClickClaim, Gesture, content_cursor};
use crate::systems::interface::CursorShape;

pub struct InterfaceGesture;

impl Gesture for InterfaceGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        world
            .resource::<InterfaceCursor>()
            .captured()
            .then_some(ClickClaim::Interface)
    }

    fn drive(&self, _world: &mut World, _start: bool) {}

    fn cursor(&self, world: &mut World) -> Option<CursorIcon> {
        let shape = match world.resource::<InterfaceCursor>().style()? {
            CursorStyle::Default => CursorShape::Default,
            CursorStyle::Pointer => CursorShape::Pointer,
            CursorStyle::Grab => CursorShape::Grab,
            CursorStyle::Grabbing => CursorShape::Grabbing,
            CursorStyle::Resize => CursorShape::Resize,
            CursorStyle::Text => return Some(CursorIcon::System(SystemCursorIcon::Text)),
        };
        Some(content_cursor(world, shape))
    }
}
