use std::time::Duration;

use bevy::prelude::*;
use egui::{Id, Rect, Vec2};
use serde::{Deserialize, Serialize};

use super::rows::{self, BigNotice, Clock, Fades};
use super::{Notification, NotificationKind, NotificationSent, window_visible};
use crate::core::assets::AssetRef;
use crate::core::audio::playback::{PlaySfx, SfxPlace};
use crate::core::gui;
use crate::systems::hud;
use crate::systems::screen::ClientScreen;
use crate::systems::screen::area;

const EMBLEM: f32 = 48.0;
/// The breathing room after an area settles before its intro lands: a deliberate pause, so the
/// title and its sound do not arrive on the same frame as the transition ends.
const BREATH_AFTER_TRANSITION: Duration = Duration::from_millis(300);
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct IntroAppearance {
    pub emblem: Option<AssetRef>,
}

pub struct IntroPlugin;

impl Plugin for IntroPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ShownIntro>()
            .add_systems(
                Update,
                reveal_when_settled
                    .after(area::carry_view_across)
                    .run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(
                Update,
                age.run_if(in_state(ClientScreen::Area))
                    .run_if(window_visible),
            )
            .add_systems(OnExit(ClientScreen::Area), rows::forget::<ShownIntro>);
    }
}

/// An intro arrives with the area it introduces, while the transition into it still plays, so it
/// waits until the view is revealed.
pub fn show(world: &mut World, notification_sent: NotificationSent) {
    world.resource_mut::<ShownIntro>().waiting = Some(notification_sent.notification);
}

pub fn shown(world: &World) -> Option<(String, String)> {
    let showing = world.resource::<ShownIntro>().showing.as_ref()?;
    let notification = &showing.notification;
    let NotificationKind::Intro { title, .. } = &notification.kind else {
        return None;
    };
    Some((title.to_string(), notification.text.plain_words()))
}

/// The intro as a larger slip centred under `top`: the area's emblem, its name and its line.
pub(super) fn draw(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    let step = hud::motion_step(gui);
    let mut shown = world.resource_mut::<ShownIntro>();
    let current = shown
        .showing
        .as_ref()
        .map(|showing| (showing.key, (showing.key, showing.notification.clone())));
    let intros = shown.fades.sync(step, current);
    let mut drawn: Vec<Rect> = Vec::new();
    for ((key, notification), pose) in intros {
        let NotificationKind::Intro {
            title, appearance, ..
        } = &notification.kind
        else {
            continue;
        };
        let line = notification.text.styled();
        let emblem = appearance
            .emblem
            .as_ref()
            .and_then(|emblem| gui::image(world, emblem))
            .map(|image| image.widget(Vec2::splat(EMBLEM)));
        let big = BigNotice {
            emblem,
            title,
            line: &line,
        };
        drawn.push(rows::big_notice(
            world,
            gui,
            Id::new(("intro", key)),
            top,
            big,
            pose,
        ));
    }
    let bottom = drawn.iter().map(Rect::bottom).fold(top, f32::max);
    world.resource_mut::<ShownIntro>().drawn = drawn;
    bottom
}

#[derive(Resource, Default)]
struct ShownIntro {
    waiting: Option<Notification>,
    settled_for: Duration,
    showing: Option<ShowingIntro>,
    clock: Clock,
    fades: Fades<(u64, Notification)>,
    drawn: Vec<Rect>,
    keys: u64,
}

struct ShowingIntro {
    key: u64,
    notification: Notification,
    until: Duration,
}

fn reveal_when_settled(world: &mut World) {
    let delta = world.resource::<Time>().delta();
    let settled = area::settled(world);
    let mut shown = world.resource_mut::<ShownIntro>();
    shown.settled_for = if settled {
        shown.settled_for + delta
    } else {
        Duration::ZERO
    };
    if shown.settled_for < BREATH_AFTER_TRANSITION || shown.waiting.is_none() {
        return;
    }
    let Some(notification) = shown.waiting.take() else {
        return;
    };
    let until = shown.clock.ends_after(notification.stays());
    shown.keys += 1;
    let key = shown.keys;
    let sfx = notification.kind.sfx();
    shown.showing = Some(ShowingIntro {
        key,
        notification,
        until,
    });
    if let Some(id) = sfx {
        world.write_message(PlaySfx {
            id,
            place: SfxPlace::Interface,
        });
    }
}

fn age(world: &mut World) {
    let held = rows::hovered(world, &world.resource::<ShownIntro>().drawn);
    let delta = world.resource::<Time>().delta();
    let mut shown = world.resource_mut::<ShownIntro>();
    if !held {
        shown.clock.advance(delta);
    }
    let clock = shown.clock;
    if shown
        .showing
        .as_ref()
        .is_some_and(|showing| clock.lapsed(showing.until))
    {
        shown.showing = None;
    }
}
