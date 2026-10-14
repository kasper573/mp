use std::time::Duration;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use super::{NotificationKind, NotificationSent};
use crate::core::assets::AssetRef;
use crate::systems::actor::Rgba;
use crate::systems::hud::spawn_ui;
use crate::systems::screen::ClientScreen;
use crate::systems::text::Motion;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct IntroAppearance {
    pub tint: Option<Rgba>,
    pub motion: Option<Motion>,
    pub emblem: Option<AssetRef>,
}

pub struct IntroPlugin;

impl Plugin for IntroPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ShownIntro>()
            .add_systems(Update, show_intro.run_if(in_state(ClientScreen::Area)));
    }
}

#[derive(Component, Default, Clone)]
pub(super) struct IntroHost;

pub fn show(world: &mut World, notification_sent: NotificationSent) {
    let stays = Duration::from(notification_sent.notification.stays());
    let mut shown = world.resource_mut::<ShownIntro>();
    let until = shown.clock + stays;
    shown.showing = Some(ShowingIntro {
        notification_sent,
        until,
        drawn: false,
    });
}

pub fn shown(world: &World) -> Option<(String, String)> {
    let showing = world.resource::<ShownIntro>().showing.as_ref()?;
    let notification = &showing.notification_sent.notification;
    let NotificationKind::Intro { title, .. } = &notification.kind else {
        return None;
    };
    Some((title.to_string(), notification.text.plain_words()))
}

#[derive(Resource, Default)]
struct ShownIntro {
    showing: Option<ShowingIntro>,
    clock: Duration,
}

struct ShowingIntro {
    notification_sent: NotificationSent,
    until: Duration,
    drawn: bool,
}

fn show_intro(world: &mut World) {
    let held = super::rows::held::<ui::Intro>(world);
    let delta = world.resource::<Time>().delta();
    let mut shown = world.resource_mut::<ShownIntro>();
    if !held {
        shown.clock += delta;
    }
    let now = shown.clock;
    if shown
        .showing
        .as_ref()
        .is_some_and(|showing| showing.until <= now)
    {
        shown.showing = None;
    }
    let drawing = shown
        .showing
        .as_mut()
        .filter(|showing| !showing.drawn)
        .map(|showing| {
            showing.drawn = true;
            showing.notification_sent.notification.clone()
        });
    let leaving = shown.showing.is_none();
    if !leaving && drawing.is_none() {
        return;
    }
    let drawn: Vec<Entity> = world
        .query_filtered::<Entity, (With<ui::Intro>, Without<ui::Leaving>)>()
        .iter(world)
        .collect();
    for intro in drawn {
        world.entity_mut(intro).insert(ui::Leaving);
    }
    let Some((
        NotificationKind::Intro {
            title, appearance, ..
        },
        text,
    )) = drawing.map(|drawing| (drawing.kind, drawing.text))
    else {
        return;
    };
    let Some(host) = world
        .query_filtered::<Entity, With<IntroHost>>()
        .iter(world)
        .next()
    else {
        return;
    };
    let emblem = appearance
        .emblem
        .as_ref()
        .map(|emblem| world.resource::<AssetServer>().load(emblem.path()));
    let intro = ui::Intro {
        title: title.to_string(),
        text: text.rich(),
        tint: appearance.tint.map(Rgba::color),
        motion: appearance.motion.map(Motion::text_motion),
        emblem,
    };
    let stacked = bsn! {
        @{ui::intro(intro)}
        Node { grid_row: {GridPlacement::start(1)}, grid_column: {GridPlacement::start(1)} }
    };
    spawn_ui(world, stacked).insert(ChildOf(host));
}
