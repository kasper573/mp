use std::time::Duration;

use bevy::prelude::*;
use design_tokens::glyph::Mark;
use design_tokens::ink;
use egui::{Id, Rect};

use super::rows::{self, Clock, Fades, Notice, NoticeIcon};
use super::{Notification, NotificationKind, NotificationSent, reading, window_visible};
use crate::core::text::StyledLine;
use crate::core::time::Seconds;
use crate::systems::history::RecordTally;
use crate::systems::history::widget::tallied;
use crate::systems::hud;
use crate::systems::screen::ClientScreen;

const READING_MIN: Seconds = Seconds(3.0);
const READING_MAX: Seconds = Seconds(6.0);
const GAP: f32 = 6.0;
const SHOWN: usize = 3;
const HELD: usize = 8;

pub struct FeedPlugin;

impl Plugin for FeedPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Feed>()
            .add_systems(
                Update,
                age.run_if(in_state(ClientScreen::Area))
                    .run_if(window_visible),
            )
            .add_systems(OnExit(ClientScreen::Area), rows::forget::<Feed>);
    }
}

pub fn show(world: &mut World, notification_sent: NotificationSent) {
    let notification = notification_sent.notification;
    let mut feed = world.resource_mut::<Feed>();
    let clock = feed.clock;
    let merge = feed.toasts.iter().enumerate().find_map(|(index, shown)| {
        merged(&shown.notification, &notification).map(|merged| (index, merged))
    });
    if let Some((index, merged)) = merge {
        let mut toast = feed.toasts.remove(index);
        toast.notification = merged;
        toast.until = clock.ends_after(toast.lasts);
        feed.toasts.push(toast);
        return;
    }
    feed.keys += 1;
    let key = feed.keys;
    let lasts = reading_time(&notification);
    feed.toasts.push(FeedToast {
        key,
        until: clock.ends_after(lasts),
        lasts,
        notification,
    });
}

pub fn rows(world: &World) -> Vec<String> {
    world
        .resource::<Feed>()
        .toasts
        .iter()
        .map(|toast| label(&toast.notification))
        .collect()
}

#[derive(Resource, Default)]
struct Feed {
    toasts: Vec<FeedToast>,
    fades: Fades<FeedToast>,
    drawn: Vec<Rect>,
    clock: Clock,
    keys: u64,
}

#[derive(Clone)]
struct FeedToast {
    key: u64,
    notification: Notification,
    until: Duration,
    lasts: Seconds,
}

fn age(world: &mut World) {
    let expanded = rows::hovered(world, &world.resource::<Feed>().drawn);
    if expanded {
        return;
    }
    let delta = world.resource::<Time>().delta();
    let mut feed = world.resource_mut::<Feed>();
    feed.clock.advance(delta);
    let clock = feed.clock;
    feed.toasts.retain(|toast| !clock.lapsed(toast.until));
}

/// The feed as notice slips down from `top`, oldest first; held under the pointer, it shows more.
pub(super) fn draw(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    let step = hud::motion_step(gui);
    let expanded = rows::hovered(world, &world.resource::<Feed>().drawn);
    let limit = if expanded { HELD } else { SHOWN };
    let mut feed = world.resource_mut::<Feed>();
    let overflow = feed.toasts.len().saturating_sub(limit);
    let current: Vec<(u64, FeedToast)> = feed
        .toasts
        .iter()
        .skip(overflow)
        .map(|toast| (toast.key, toast.clone()))
        .collect();
    let toasts = feed.fades.sync(step, current);
    let mut drawn = Vec::new();
    let mut at = top;
    if overflow > 0 {
        let rect = rows::more_slip(world, gui, "feed-more", at, overflow as u32);
        at = rect.bottom() + GAP;
        drawn.push(rect);
    }
    for (
        FeedToast {
            key, notification, ..
        },
        pose,
    ) in toasts
    {
        let line = feed_line(&notification);
        let icon = icon_of(&notification);
        let failure = matches!(
            notification.kind,
            NotificationKind::Feed { failure: true, .. }
        );
        let slip = Notice {
            icon: icon
                .as_deref()
                .map_or(NoticeIcon::Mark(Mark::Dot), NoticeIcon::File),
            label: None,
            line: &line,
            ink: if failure { ink::RUBRIC } else { ink::INK },
            closable: false,
        };
        let (rect, _) = rows::notice(world, gui, Id::new(("feed", key)), at, slip, pose);
        at = rect.bottom() + GAP;
        drawn.push(rect);
    }
    world.resource_mut::<Feed>().drawn = drawn;
    at
}

fn merged(shown: &Notification, newer: &Notification) -> Option<Notification> {
    let (
        NotificationKind::Feed {
            topic,
            icon,
            tally: Some(old),
            failure,
            ..
        },
        NotificationKind::Feed {
            icon: new_icon,
            tally: Some(new),
            failure: new_failure,
            sfx,
            ..
        },
    ) = (&shown.kind, &newer.kind)
    else {
        return None;
    };
    let same = shown.text == newer.text && icon == new_icon && failure == new_failure;
    let tally = old.merged(*new)?;
    same.then(|| Notification {
        kind: NotificationKind::Feed {
            topic: *topic,
            icon: new_icon.clone(),
            tally: Some(tally),
            failure: *new_failure,
            sfx: *sfx,
        },
        ..newer.clone()
    })
}

fn reading_time(notification: &Notification) -> Seconds {
    let words = notification.text.word_count() + 1;
    Seconds(reading(words).0.clamp(READING_MIN.0, READING_MAX.0))
}

fn label(notification: &Notification) -> String {
    let text = notification.text.plain_words();
    tally_of(notification).map_or_else(|| text.clone(), |tally| tally.line(&text))
}

fn tally_of(notification: &Notification) -> Option<RecordTally> {
    match notification.kind {
        NotificationKind::Feed { tally, .. } => tally,
        _ => None,
    }
}

fn icon_of(notification: &Notification) -> Option<String> {
    match &notification.kind {
        NotificationKind::Feed { icon, .. } => icon.clone(),
        _ => None,
    }
}

fn feed_line(notification: &Notification) -> StyledLine {
    let mut line = notification.text.styled();
    tallied(
        &mut line,
        tally_of(notification),
        icon_of(notification).is_some(),
        ink::INK,
    );
    line
}
