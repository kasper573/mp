use bevy::prelude::*;
use bevy::window::CursorIcon;

use crate::core::render;
use crate::systems::input::gestures::{ClickClaim, Gesture, content_cursor};
use crate::systems::interact::{self, InteractRequest};
use crate::systems::player::session;

pub struct InteractGesture;

impl Gesture for InteractGesture {
    fn claim(&self, world: &mut World) -> Option<ClickClaim> {
        if !session::is_alive(world) {
            return None;
        }
        target(world).map(ClickClaim::Interact)
    }

    fn drive(&self, world: &mut World, start: bool) {
        if start && let Some(target) = target(world) {
            world.write_message(InteractRequest { target });
        }
    }

    fn cursor(&self, world: &mut World) -> Option<CursorIcon> {
        let target = target(world)?;
        let verb = interact::interaction_of(world, target)?.verb;
        Some(content_cursor(world, verb.cursor()))
    }
}

fn target(world: &mut World) -> Option<Entity> {
    let point = render::cursor_tile(world)?;
    interact::interactable_at(world, point)
}
