use std::time::Duration;

use bevy::prelude::*;
use egui::emath::{TSTransform, easing};
use egui::{Rect, Vec2};

use super::rows::{self, Fades, Move, Presence};
use super::{Notification, NotificationSent};
use crate::core::text;
use crate::systems::screen::ClientScreen;

const WIDEST: f32 = 356.0;
const SIZE: f32 = 16.0;
const BUMP_SCALE: f32 = 1.08;
const BUMP_SECONDS: f64 = 0.25;
const PRESENCE: Presence = Presence {
    enter: Move::new(Vec2::new(0.0, -100.0), 0.9, 0.25),
    exit: Move::new(Vec2::new(0.0, -30.0), 0.94, 0.2),
};

pub fn toast(world: &mut World, notification_sent: NotificationSent) {
    let notification = notification_sent.notification;
    let mut errors = world.resource_mut::<Errors>();
    if let Some(shown) = &mut errors.shown
        && shown.notification == notification
    {
        shown.age = Duration::ZERO;
        shown.bumped = true;
        return;
    }
    errors.keys += 1;
    let key = errors.keys;
    errors.shown = Some(ErrorToast {
        key,
        lasts: notification.stays().into(),
        notification,
        age: Duration::ZERO,
        bumped: false,
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
        .add_systems(Update, age.run_if(in_state(ClientScreen::Area)))
        .add_systems(OnExit(ClientScreen::Area), forget);
}

/// The error in egui's popup frame, coloured as egui colours errors; returns where it ends.
pub(super) fn draw(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    let (now, still) = rows::clock(world, gui);
    let mut errors = world.resource_mut::<Errors>();
    if let Some(shown) = &mut errors.shown
        && std::mem::take(&mut shown.bumped)
    {
        errors.bumped_at = Some(now);
    }
    let current = errors
        .shown
        .as_ref()
        .map(|shown| (shown.key, (shown.key, shown.notification.clone())));
    let toasts = errors.fades.sync(now, PRESENCE, still, current);
    let bump = errors.bumped_at.filter(|_| !still).map_or(1.0, |at| {
        let t = ((now - at) / BUMP_SECONDS).clamp(0.0, 1.0) as f32;
        1.0 + (BUMP_SCALE - 1.0) * (1.0 - easing::cubic_out(t))
    });
    let width = gui.content_rect().width();
    let mut drawn: Vec<Rect> = Vec::new();
    for ((key, notification), look) in toasts {
        let shown = rows::column_area(gui, &format!("error-{key}"), top).show(gui, |ui| {
            ui.set_width(width);
            ui.vertical_centered(|ui| {
                ui.multiply_opacity(look.opacity);
                let style = ui.style().clone();
                egui::Frame::popup(&style)
                    .show(ui, |ui| {
                        ui.set_max_width(WIDEST);
                        let ink = ui.visuals().error_fg_color;
                        text::show(
                            ui,
                            world,
                            &notification.text.styled(),
                            rows::look(SIZE, ink),
                            None,
                        );
                    })
                    .response
                    .rect
            })
            .inner
        });
        let swell = TSTransform::new(shown.inner.center().to_vec2() * (1.0 - bump), bump);
        gui.set_transform_layer(shown.response.layer_id, look.around(shown.inner) * swell);
        drawn.push(shown.inner);
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
    bumped_at: Option<f64>,
    keys: u64,
}

struct ErrorToast {
    key: u64,
    notification: Notification,
    age: Duration,
    lasts: Duration,
    bumped: bool,
}

fn age(world: &mut World) {
    let held = rows::hovered(world, &world.resource::<Errors>().drawn);
    let delta = world.resource::<Time>().delta();
    let mut errors = world.resource_mut::<Errors>();
    if held {
        return;
    }
    let over = errors.shown.as_mut().is_some_and(|shown| {
        shown.age += delta;
        shown.age >= shown.lasts
    });
    if over {
        errors.shown = None;
    }
}

fn forget(mut errors: ResMut<Errors>) {
    *errors = Errors::default();
}
