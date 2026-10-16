use std::time::Duration;

use bevy::prelude::*;
use egui::emath::TSTransform;
use egui::{Color32, Id, Pos2, Rect, Stroke, Vec2};

use super::rows::{self, Clock, Fades, Move, Presence, Swell};
use super::{Notification, NotificationKind, NotificationSent, reading, window_visible};
use crate::core::gui::{self, Band};
use crate::core::text::{self, StyledLine};
use crate::core::time::Seconds;
use crate::systems::dialogue::stage;
use crate::systems::history::RecordTally;
use crate::systems::history::widget::tallied;
use crate::systems::screen::ClientScreen;

const READING_MIN: Seconds = Seconds(3.0);
const READING_MAX: Seconds = Seconds(6.0);
const EDGE: f32 = 24.0;
const WIDEST: f32 = 320.0;
const NARROWEST: f32 = 140.0;
const ICON: f32 = 16.0;
const SIZE: f32 = 12.0;
const GAP: f32 = 4.0;
const PADDING: Vec2 = Vec2::new(8.0, 2.0);
const BORDER: f32 = 1.0;
const SHOWN: usize = 3;
const HELD: usize = 8;
const SLATE_90: Color32 = Color32::from_rgb(228, 234, 239);
const SLATE_40: Color32 = Color32::from_rgb(41, 46, 45);
const SLATE_50: Color32 = Color32::from_rgb(73, 74, 80);
const CRIMSON_70: Color32 = Color32::from_rgb(221, 84, 80);
const TOAST_PRESENCE: Presence = Presence {
    enter: Move::new(Vec2::new(24.0, 0.0), 1.0, 0.25),
    exit: Move::new(Vec2::new(18.0, 0.0), 0.96, 0.2),
};
const MORE_PRESENCE: Presence = Presence {
    enter: Move::new(Vec2::new(16.0, 0.0), 0.96, 0.26),
    exit: Move::new(Vec2::new(16.0, 0.0), 0.96, 0.16),
};

pub struct FeedPlugin;

impl Plugin for FeedPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Feed>()
            .add_systems(
                Update,
                age.run_if(in_state(ClientScreen::Area))
                    .run_if(window_visible),
            )
            .add_systems(
                bevy_egui::EguiPrimaryContextPass,
                draw.in_set(Band::Notices)
                    .run_if(in_state(ClientScreen::Area)),
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
        toast.swell.bump();
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
        swell: Swell::default(),
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
    more: Fades<u32>,
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
    swell: Swell,
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

fn draw(world: &mut World) {
    let Some(gui) = gui::context(world) else {
        return;
    };
    let (now, still) = rows::motion_time(world, &gui);
    let screen = gui.content_rect();
    let room = stage::box_right(world).map_or(WIDEST, |right| {
        (screen.width() - right - 2.0 * EDGE).clamp(NARROWEST, WIDEST)
    });
    let expanded = rows::hovered(world, &world.resource::<Feed>().drawn);
    let limit = if expanded { HELD } else { SHOWN };
    let mut feed = world.resource_mut::<Feed>();
    for toast in &mut feed.toasts {
        toast.swell.start_if_bumped(now);
    }
    let overflow = feed.toasts.len().saturating_sub(limit);
    let current: Vec<(u64, FeedToast)> = feed
        .toasts
        .iter()
        .skip(overflow)
        .map(|toast| (toast.key, toast.clone()))
        .collect();
    let toasts = feed.fades.sync(now, TOAST_PRESENCE, still, current);
    let more = feed.more.sync(
        now,
        MORE_PRESENCE,
        still,
        (overflow > 0).then_some((0, overflow as u32)),
    );
    let mut bottom = screen.bottom() - EDGE;
    let mut drawn = Vec::new();
    for (
        FeedToast {
            key,
            notification,
            swell,
            ..
        },
        look,
    ) in toasts.into_iter().rev()
    {
        let line = feed_line(&notification);
        let icon = icon_of(&notification);
        let chrome = 2.0 * (PADDING.x + BORDER) + if icon.is_some() { ICON + GAP } else { 0.0 };
        let text_size = text::measure(
            &gui,
            world,
            &line,
            rows::look(SIZE, SLATE_90),
            (room - chrome).max(0.0),
        );
        let size = Vec2::new(
            chrome + text_size.x,
            text_size.y.max(ICON) + 2.0 * (PADDING.y + BORDER),
        );
        let rect = Rect::from_min_size(
            Pos2::new(screen.right() - EDGE - size.x, bottom - size.y),
            size,
        );
        let icon = icon.and_then(|icon| gui::image_file(world, &icon));
        let failure = matches!(
            notification.kind,
            NotificationKind::Feed { failure: true, .. }
        );
        let border = if failure {
            CRIMSON_70
        } else {
            SLATE_50.gamma_multiply(0.6)
        };
        let shown = egui::Area::new(Id::new(("feed", key)))
            .order(Band::Notices.order())
            .interactable(false)
            .fade_in(false)
            .fixed_pos(rect.min)
            .show(&gui, |ui| {
                ui.multiply_opacity(look.opacity);
                egui::Frame::new()
                    .fill(SLATE_40.gamma_multiply(0.72))
                    .stroke(Stroke::new(BORDER, border))
                    .corner_radius(8.0)
                    .inner_margin(egui::Margin::symmetric(PADDING.x as i8, PADDING.y as i8))
                    .show(ui, |ui| {
                        ui.set_width(size.x - 2.0 * (PADDING.x + BORDER));
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = GAP;
                            if let Some(icon) = &icon {
                                ui.add(icon.widget(Vec2::splat(ICON)));
                            }
                            ui.allocate_ui(text_size, |ui| {
                                text::show(ui, world, &line, rows::look(SIZE, SLATE_90), None);
                            });
                        });
                    });
            });
        let bump = swell.scale(now, still);
        let swell = TSTransform::new(rect.center().to_vec2() * (1.0 - bump), bump);
        gui.set_transform_layer(shown.response.layer_id, look.around(rect) * swell);
        drawn.push(rect);
        bottom = rect.top() - GAP;
    }
    for (more, look) in more {
        let area = egui::Area::new(Id::new("feed-more"))
            .order(Band::Notices.order())
            .interactable(false)
            .fade_in(false)
            .pivot(egui::Align2::RIGHT_BOTTOM)
            .fixed_pos(Pos2::new(screen.right() - EDGE, bottom));
        let shown = gui::show_anchored(&gui, area, |ui| {
            ui.multiply_opacity(look.opacity);
            rows::count_chip(ui, world, more);
        });
        gui.set_transform_layer(shown.response.layer_id, look.around(shown.response.rect));
        drawn.push(shown.response.rect);
    }
    world.resource_mut::<Feed>().drawn = drawn;
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
        SLATE_90,
    );
    line
}
