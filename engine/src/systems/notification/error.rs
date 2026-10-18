use std::time::Duration;

use bevy::prelude::*;
use design_tokens::glyph::Mark;
use design_tokens::ink;
use egui::{Id, Rect};

use super::rows::{self, Clock, Fades, Notice, NoticeIcon};
use super::{Notification, NotificationSent, window_visible};
use crate::systems::hud;
use crate::systems::screen::ClientScreen;

pub fn toast(world: &mut World, notification_sent: NotificationSent) {
    let notification = notification_sent.notification;
    let mut errors = world.resource_mut::<Errors>();
    let clock = errors.clock;
    if let Some(shown) = &mut errors.shown
        && shown.notification == notification
    {
        shown.until = clock.ends_after(notification.stays());
        return;
    }
    errors.keys += 1;
    let key = errors.keys;
    errors.shown = Some(ErrorToast {
        key,
        until: clock.ends_after(notification.stays()),
        notification,
    });
}

pub fn shown(world: &World) -> Option<String> {
    world
        .resource::<Errors>()
        .shown
        .as_ref()
        .map(|shown| shown.notification.text.plain_words())
}

pub(super) fn plugin(app: &mut App) {
    app.init_resource::<Errors>()
        .add_systems(
            Update,
            age.run_if(in_state(ClientScreen::Area))
                .run_if(window_visible),
        )
        .add_systems(OnExit(ClientScreen::Area), rows::forget::<Errors>);
}

/// The error as a notice slip, its line and warning mark in rubric.
pub(super) fn draw(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    let step = hud::motion_step(gui);
    let mut errors = world.resource_mut::<Errors>();
    let current = errors
        .shown
        .as_ref()
        .map(|shown| (shown.key, (shown.key, shown.notification.clone())));
    let toasts = errors.fades.sync(step, current);
    let mut drawn: Vec<Rect> = Vec::new();
    for ((key, notification), pose) in toasts {
        let line = notification.text.styled();
        let slip = Notice {
            icon: NoticeIcon::Mark(Mark::Warning),
            label: None,
            line: &line,
            ink: ink::RUBRIC,
            closable: false,
        };
        let (rect, _) = rows::notice(world, gui, Id::new(("error", key)), top, slip, pose);
        drawn.push(rect);
    }
    let bottom = drawn.iter().map(Rect::bottom).fold(top, f32::max);
    world.resource_mut::<Errors>().drawn = drawn;
    bottom
}

#[derive(Resource, Default)]
struct Errors {
    shown: Option<ErrorToast>,
    fades: Fades<(u64, Notification)>,
    drawn: Vec<Rect>,
    clock: Clock,
    keys: u64,
}

struct ErrorToast {
    key: u64,
    notification: Notification,
    until: Duration,
}

fn age(world: &mut World) {
    let held = rows::hovered(world, &world.resource::<Errors>().drawn);
    let delta = world.resource::<Time>().delta();
    let mut errors = world.resource_mut::<Errors>();
    if held {
        return;
    }
    errors.clock.advance(delta);
    let clock = errors.clock;
    if errors
        .shown
        .as_ref()
        .is_some_and(|shown| clock.lapsed(shown.until))
    {
        errors.shown = None;
    }
}
