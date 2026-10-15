use bevy::prelude::*;
use bevy::window::SystemCursorIcon;

use crate::core::gui;
use crate::systems::input::gestures::{ClickClaim, Cursor, Gesture};
use crate::systems::interface::CursorShape;

pub struct InterfaceGesture;

impl Gesture for InterfaceGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        gui::pointer_claimed(world).then_some(ClickClaim::Interface)
    }

    fn drive(&self, _world: &mut World, _start: bool) {}

    fn cursor(&self, world: &mut World) -> Option<Cursor> {
        use egui::CursorIcon as Asked;
        let shape = match gui::cursor(world) {
            Asked::PointingHand => CursorShape::Pointer,
            Asked::Grab => CursorShape::Grab,
            Asked::Grabbing | Asked::Move | Asked::AllScroll => CursorShape::Grabbing,
            Asked::ResizeHorizontal
            | Asked::ResizeNeSw
            | Asked::ResizeNwSe
            | Asked::ResizeVertical
            | Asked::ResizeEast
            | Asked::ResizeSouthEast
            | Asked::ResizeSouth
            | Asked::ResizeSouthWest
            | Asked::ResizeWest
            | Asked::ResizeNorthWest
            | Asked::ResizeNorth
            | Asked::ResizeNorthEast
            | Asked::ResizeColumn
            | Asked::ResizeRow => CursorShape::Resize,
            Asked::Text | Asked::VerticalText => {
                return Some(Cursor::System(SystemCursorIcon::Text));
            }
            _ => CursorShape::Default,
        };
        Some(Cursor::Shaped(shape))
    }
}
