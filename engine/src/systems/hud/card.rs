use bevy::prelude::*;
use egui::{Pos2, Rect, Ui, Vec2};

use super::{Sizing, WindowFrame};
use crate::core::gui::{self, GuiContext};
use crate::systems::interface::InterfaceSound;

const CARD_SIZE: Vec2 = Vec2::new(300.0, 380.0);
const CARD_TOP: f32 = 96.0;
const CARD_MARGIN: f32 = 72.0;

/// One thing of a kind inspected at a time, in a card pinned beside the windows until it is
/// closed; opening another of the kind replaces it.
#[derive(Resource)]
pub(crate) struct Pinned<T: Send + Sync + 'static> {
    wanted: Option<T>,
    to_front: bool,
    drawn: Option<Rect>,
}

impl<T: Send + Sync + 'static> Default for Pinned<T> {
    fn default() -> Pinned<T> {
        Pinned {
            wanted: None,
            to_front: false,
            drawn: None,
        }
    }
}

pub(crate) fn pin<T: Send + Sync + 'static>(world: &mut World, card: T) {
    let mut pinned = world.resource_mut::<Pinned<T>>();
    let was_shown = pinned.wanted.replace(card);
    pinned.to_front = true;
    if was_shown.is_none() {
        InterfaceSound::UiOpen.play(world);
    }
}

pub(crate) fn unpin<T: Send + Sync + 'static>(world: &mut World) -> bool {
    let closed = world.resource_mut::<Pinned<T>>().wanted.take().is_some();
    if closed {
        InterfaceSound::UiClose.play(world);
    }
    closed
}

pub(crate) fn pinned<T: Clone + Send + Sync + 'static>(world: &World) -> Option<T> {
    world.resource::<Pinned<T>>().wanted.clone()
}

/// Where the card stood when last drawn, while it is pinned.
pub(crate) fn pinned_rect<T: Send + Sync + 'static>(world: &World) -> Option<Rect> {
    world.resource::<Pinned<T>>().drawn
}

/// Draws the pinned card of the kind, if any, as a fitted window keyed by `key`.
pub(crate) fn draw_pinned<T: Clone + Send + Sync + 'static>(
    world: &mut World,
    key: &'static str,
    sheet: impl FnOnce(&mut Ui, &mut World, &T),
) {
    let Some(card) = pinned::<T>(world) else {
        world.resource_mut::<Pinned<T>>().drawn = None;
        return;
    };
    let Some(gui) = gui::context(world) else {
        return;
    };
    let screen = gui.content_rect();
    let start = Rect::from_min_size(
        Pos2::new(
            (screen.right() - CARD_SIZE.x - CARD_MARGIN).max(8.0),
            screen.top() + CARD_TOP,
        ),
        CARD_SIZE,
    );
    let mut open = true;
    let frame = WindowFrame {
        key,
        title: None,
        start,
        sizing: Sizing::FitsContent,
        body_limit: None,
    };
    let shown = super::window(world, &gui, frame, &mut open, |ui, world| {
        egui::ScrollArea::vertical()
            .max_height(CARD_SIZE.y)
            .auto_shrink([false, true])
            .show(ui, |ui| sheet(ui, world, &card));
    });
    world.resource_mut::<Pinned<T>>().drawn = Some(shown.response.rect);
    if !open {
        unpin::<T>(world);
    }
}

// A press brings the area it lands on to the front as its pass ends, and areas brought to the front
// in the same pass keep their order. So the card comes to the front a pass after it was asked for,
// to end up above the window it was asked for from.
pub(crate) fn raise_pinned<T: Send + Sync + 'static>(
    key: &'static str,
) -> impl FnMut(ResMut<Pinned<T>>, Option<Res<GuiContext>>) {
    move |mut pinned, gui| {
        if !pinned.to_front {
            return;
        }
        pinned.to_front = false;
        if let Some(gui) = gui
            && pinned.wanted.is_some()
        {
            gui.0.move_to_top(super::window_layer(key));
        }
    }
}

pub(crate) fn forget_pinned<T: Send + Sync + 'static>(mut pinned: ResMut<Pinned<T>>) {
    *pinned = Pinned::default();
}
