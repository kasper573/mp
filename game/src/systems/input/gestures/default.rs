use bevy::prelude::*;

use crate::core::math::Pos;
use crate::core::tiling::Tiles;
use crate::systems::input::gestures::{ClickClaim, Cursor, Gesture};
use crate::systems::interface::CursorShape;

pub struct DefaultGesture;

impl Gesture for DefaultGesture {
    fn claim(&self, _world: &mut World, _tile: Option<Pos<Tiles>>) -> Option<ClickClaim> {
        Some(ClickClaim::Nothing)
    }

    fn drive(&self, _world: &mut World, _claim: Option<ClickClaim>, _start: bool) {}

    fn cursor(&self, _world: &mut World, _claim: ClickClaim) -> Option<Cursor> {
        Some(Cursor::Shaped(CursorShape::Default))
    }
}
