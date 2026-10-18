use std::borrow::Cow;
use std::marker::PhantomData;
use std::time::Duration;

use bevy::prelude::*;
use design_tokens::glyph::{self, Mark};
use design_tokens::motion::{self, SheetPose};
use design_tokens::{Face, TextRole, ink, slip};
use egui::text::{LayoutJob, TextFormat};
use egui::{Align, Align2, Color32, Id, Pos2, Rect, Sense, Ui, Vec2};
use serde::{Deserialize, Serialize};

use super::{NotificationSent, window_visible};
use crate::core::gui::{self, Band};
use crate::core::text::{self, StyledLine, TextLook, TextPiece};
use crate::core::time::Seconds;
use crate::systems::hud;
use crate::systems::input::map::{self, InputAction};
use crate::systems::screen::ClientScreen;

const COUNT_LINGERS: Seconds = Seconds(5.0);

const NOTICE: Vec2 = Vec2::new(280.0, 36.0);
const NOTICE_WIDEST: f32 = 440.0;
const NOTICE_ICON: f32 = 20.0;
const BIG_NOTICE: Vec2 = Vec2::new(360.0, 72.0);
const BIG_NOTICE_WIDEST: f32 = 560.0;
const BIG_LINE: f32 = 20.0;
const ROW_GAP: f32 = 6.0;
const MILESTONE_GAP: f32 = 12.0;

pub(super) trait RowPlace: Send + Sync + 'static {
    const ROWS: usize;
    const REPLACE_AFTER: Seconds;
}

pub(super) struct Captions;
pub(super) struct Alerts;
pub(super) struct Milestones;

impl RowPlace for Captions {
    const ROWS: usize = 3;
    const REPLACE_AFTER: Seconds = Seconds(2.0);
}

impl RowPlace for Alerts {
    const ROWS: usize = 2;
    const REPLACE_AFTER: Seconds = Seconds(3.0);
}

impl RowPlace for Milestones {
    const ROWS: usize = 2;
    const REPLACE_AFTER: Seconds = Seconds(2.0);
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NotificationRows {
    pub rows: Vec<NotificationRow>,
    pub more: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NotificationRow {
    pub label: String,
    pub text: String,
    pub replaced: u32,
}

pub(super) fn plugin<P: RowPlace>(app: &mut App) {
    app.init_resource::<PlacedRows<P>>()
        .add_systems(
            Update,
            tick::<P>
                .run_if(in_state(ClientScreen::Area))
                .run_if(window_visible),
        )
        .add_systems(OnExit(ClientScreen::Area), forget::<PlacedRows<P>>);
}

/// Everything a notification place or row keeps is about the area it was raised in, so each one
/// starts empty when that area is left.
pub(super) fn forget<R: Resource + Default>(world: &mut World) {
    world.insert_resource(R::default());
}

pub(super) fn join<P: RowPlace>(
    world: &mut World,
    voice: Cow<'static, str>,
    notification_sent: NotificationSent,
) {
    world
        .resource_mut::<PlacedRows<P>>()
        .rows
        .join(voice, notification_sent);
}

pub(super) fn shown<P: RowPlace>(world: &World) -> NotificationRows {
    world.resource::<PlacedRows<P>>().rows.shown()
}

/// Alerts as notice slips down from `top`; a click on one puts it away.
pub(super) fn draw_alerts(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    draw_rows::<Alerts>(world, gui, top, Mark::Bell, true)
}

/// Narration as notice slips down from `top`.
pub(super) fn draw_captions(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    draw_rows::<Captions>(world, gui, top, Mark::Page, false)
}

/// Milestones as larger slips down from `top`: the label in small caps over the words.
pub(super) fn draw_milestones(world: &mut World, gui: &egui::Context, top: f32) -> f32 {
    let step = hud::motion_step(gui);
    let (lines, more) = lines_of::<Milestones>(world);
    let shown = world
        .resource_mut::<PlacedRows<Milestones>>()
        .fades
        .sync(step, lines.into_iter().map(|line| (line.key, line)));
    let mut drawn = Vec::new();
    let mut at = top;
    for (line, pose) in shown {
        let big = BigNotice {
            emblem: None,
            title: &label_text(&line.label, line.replaced),
            line: &line.text,
        };
        let rect = big_notice(world, gui, Id::new(("milestone", line.key)), at, big, pose);
        at = rect.bottom() + MILESTONE_GAP;
        drawn.push(rect);
    }
    if let Some(more) = more {
        drawn.push(more_slip(world, gui, "milestones-more", at, more));
    }
    let bottom = drawn.last().map_or(top, Rect::bottom);
    world.resource_mut::<PlacedRows<Milestones>>().drawn = drawn;
    bottom
}

/// What a notice slip shows: its 20 px icon, the label of who it is from, and its line.
pub(super) struct Notice<'a> {
    pub icon: NoticeIcon<'a>,
    pub label: Option<&'a str>,
    pub line: &'a StyledLine,
    /// Rubric for an error or a failure, ink otherwise.
    pub ink: Color32,
    /// A click puts it away.
    pub closable: bool,
}

pub(super) enum NoticeIcon<'a> {
    File(&'a str),
    Mark(Mark),
}

/// A notice slip hung at the top centre with its top edge at `top`, dropping in or lifting off in
/// `pose`. Hands back where it lies at rest and whether it was clicked.
pub(super) fn notice(
    world: &mut World,
    gui: &egui::Context,
    id: Id,
    top: f32,
    notice: Notice,
    pose: SheetPose,
) -> (Rect, bool) {
    let area = column_area(gui, id, top).interactable(notice.closable);
    let shown = gui::show_anchored(gui, area, |ui| {
        ui.multiply_opacity(pose.opacity);
        let written = slip::show(ui, |ui| {
            ui.set_min_size(NOTICE - padding());
            ui.set_max_width(NOTICE_WIDEST - padding().x);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 8.0;
                notice_icon(ui, world, &notice.icon, notice.ink);
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    if let Some(label) = notice.label {
                        ui.label(TextRole::Band.widget_text(label, ink::INK2));
                    }
                    text::show(
                        ui,
                        world,
                        notice.line,
                        TextLook::new(TextRole::Body.size(), notice.ink),
                        None,
                    );
                });
            });
        });
        notice.closable && written.response.interact(Sense::click()).clicked()
    });
    let rect = shown.response.rect;
    gui.set_transform_layer(shown.response.layer_id, pose.transform(rect));
    (rect, shown.inner)
}

/// What a larger slip shows: an emblem over a small-caps title over a line in the book face.
pub(super) struct BigNotice<'a> {
    pub emblem: Option<egui::Image<'static>>,
    pub title: &'a str,
    pub line: &'a StyledLine,
}

/// A larger slip centred under `top`, for milestones and the intro of an area.
pub(super) fn big_notice(
    world: &mut World,
    gui: &egui::Context,
    id: Id,
    top: f32,
    big: BigNotice,
    pose: SheetPose,
) -> Rect {
    let area = column_area(gui, id, top);
    let shown = gui::show_anchored(gui, area, |ui| {
        ui.multiply_opacity(pose.opacity);
        slip::show(ui, |ui| {
            ui.set_min_size(BIG_NOTICE - padding());
            ui.set_max_width(BIG_NOTICE_WIDEST - padding().x);
            ui.vertical_centered(|ui| {
                ui.spacing_mut().item_spacing.y = 4.0;
                if let Some(emblem) = big.emblem {
                    ui.add(emblem);
                }
                ui.label(big_title(big.title));
                text::show(ui, world, big.line, TextLook::new(BIG_LINE, ink::INK), None);
            });
        });
    });
    let rect = shown.response.rect;
    gui.set_transform_layer(shown.response.layer_id, pose.transform(rect));
    rect
}

/// "+N more · H history", on a slip of its own, for what a place had no room left to show.
pub(super) fn more_slip(
    world: &mut World,
    gui: &egui::Context,
    id: &str,
    top: f32,
    more: u32,
) -> Rect {
    let area = column_area(gui, Id::new(("notice", id)), top);
    gui::show_anchored(gui, area, |ui| {
        slip::show(ui, |ui| {
            text::show(
                ui,
                world,
                &more_text(more),
                TextLook::new(TextRole::Small.size(), ink::INK3),
                None,
            );
        });
    })
    .response
    .rect
}

pub(super) fn more_text(more: u32) -> StyledLine {
    StyledLine::new(vec![
        TextPiece::text(format!("+{more} more \u{b7} ")),
        map::input(InputAction::ToggleHistory),
        TextPiece::text(" history"),
    ])
}

pub(super) fn hovered(world: &World, rects: &[Rect]) -> bool {
    let pointer = gui::context(world).and_then(|gui| gui.pointer_latest_pos());
    pointer.is_some_and(|at| rects.iter().any(|rect| rect.contains(at)))
}

/// The time a notification place has been on show. It only moves while the place is not held,
/// so a notification read under the pointer keeps its time.
#[derive(Default, Clone, Copy)]
pub(super) struct Clock(Duration);

impl Clock {
    pub(super) fn advance(&mut self, delta: Duration) {
        self.0 += delta;
    }

    pub(super) fn now(self) -> Duration {
        self.0
    }

    pub(super) fn ends_after(self, stays: Seconds) -> Duration {
        self.0 + Duration::from(stays)
    }

    pub(super) fn lapsed(self, deadline: Duration) -> bool {
        self.0 >= deadline
    }
}

pub(super) fn look(size: f32, color: Color32) -> TextLook {
    TextLook::new(size, color)
}

/// The size of a label as a notice writes it, in small caps.
pub(super) fn label_size(gui: &egui::Context, label: &str) -> Vec2 {
    gui.fonts_mut(|fonts| fonts.layout_job(TextRole::Band.job(label, ink::INK2)))
        .size()
}

/// An area hung from the top centre of the screen at `top`, which notices are drawn in.
pub(super) fn column_area(gui: &egui::Context, id: Id, top: f32) -> egui::Area {
    egui::Area::new(id)
        .order(Band::Notices.order())
        .interactable(false)
        .fade_in(false)
        .constrain(false)
        .pivot(Align2::CENTER_TOP)
        .fixed_pos(Pos2::new(gui.content_rect().center().x, top))
}

/// Things that drop onto the table and lift off it like a slip, each on a reversible clock of its
/// own; one that left keeps its place until it has lifted off.
pub(super) struct Fades<T> {
    items: Vec<Fading<T>>,
}

impl<T> Default for Fades<T> {
    fn default() -> Fades<T> {
        Fades { items: Vec::new() }
    }
}

impl<T: Clone> Fades<T> {
    /// Brings the place up to what it shows now, in the order given, each with its pose after
    /// `seconds` more of its motion.
    pub(super) fn sync(
        &mut self,
        seconds: f32,
        current: impl IntoIterator<Item = (u64, T)>,
    ) -> Vec<(T, SheetPose)> {
        let mut previous: Vec<Option<Fading<T>>> = std::mem::take(&mut self.items)
            .into_iter()
            .map(Some)
            .collect();
        let mut items: Vec<Fading<T>> = Vec::new();
        for (key, item) in current {
            let kept = previous
                .iter_mut()
                .find_map(|slot| slot.take_if(|fading| fading.key == key));
            let mut fading = kept.unwrap_or(Fading {
                key,
                item: item.clone(),
                clock: motion::Clock::CLOSED,
                leaving: false,
            });
            fading.item = item;
            fading.leaving = false;
            fading.clock.run(true, seconds);
            items.push(fading);
        }
        for (index, slot) in previous.into_iter().enumerate() {
            let Some(mut fading) = slot else {
                continue;
            };
            fading.leaving = true;
            fading.clock.run(false, seconds);
            if !fading.clock.is_closed() {
                items.insert(index.min(items.len()), fading);
            }
        }
        self.items = items;
        self.items
            .iter()
            .map(|fading| (fading.item.clone(), fading.clock.pose()))
            .collect()
    }
}

#[derive(Clone, PartialEq)]
pub(super) struct LabelledLine {
    pub key: u64,
    pub label: String,
    pub replaced: u32,
    pub text: StyledLine,
}

#[derive(Resource)]
pub(super) struct PlacedRows<P> {
    rows: VoiceRows,
    drawn: Vec<Rect>,
    fades: Fades<LabelledLine>,
    place: PhantomData<fn() -> P>,
}

impl<P: RowPlace> Default for PlacedRows<P> {
    fn default() -> PlacedRows<P> {
        PlacedRows {
            rows: VoiceRows::new(P::ROWS, P::REPLACE_AFTER),
            drawn: Vec::new(),
            fades: Fades::default(),
            place: PhantomData,
        }
    }
}

struct Fading<T> {
    key: u64,
    item: T,
    clock: motion::Clock,
    leaving: bool,
}

struct VoiceRows {
    limit: usize,
    replace_after: Duration,
    rows: Vec<VoiceRow>,
    turned_away: Option<TurnedAway>,
    clock: Clock,
    keys: u64,
}

struct VoiceRow {
    key: u64,
    voice: Cow<'static, str>,
    shown: NotificationSent,
    newest: Option<NotificationSent>,
    replaced: u32,
    changed: Duration,
    read_by: Duration,
}

struct TurnedAway {
    more: u32,
    until: Duration,
}

impl VoiceRows {
    fn new(limit: usize, replace_after: Seconds) -> VoiceRows {
        VoiceRows {
            limit,
            replace_after: replace_after.into(),
            rows: Vec::new(),
            turned_away: None,
            clock: Clock::default(),
            keys: 0,
        }
    }

    fn join(&mut self, voice: Cow<'static, str>, notification_sent: NotificationSent) {
        let now = self.clock.now();
        let stays: Duration = notification_sent.notification.stays().into();
        if let Some(row) = self.rows.iter_mut().find(|row| row.voice == voice) {
            if row.shown.notification == notification_sent.notification {
                row.read_by = row.read_by.max(
                    self.clock
                        .ends_after(notification_sent.notification.stays()),
                );
                return;
            }
            row.replaced += 1;
            row.newest = Some(notification_sent);
            return;
        }
        if self.rows.len() >= self.limit {
            let turned_away = self.turned_away.get_or_insert(TurnedAway {
                more: 0,
                until: now,
            });
            turned_away.more += 1;
            turned_away.until = self.clock.ends_after(COUNT_LINGERS);
            return;
        }
        let after = self.rows.last().map_or(now, |last| last.read_by.max(now));
        self.keys += 1;
        self.rows.push(VoiceRow {
            key: self.keys,
            voice,
            shown: notification_sent,
            newest: None,
            replaced: 0,
            changed: now,
            read_by: after + stays,
        });
    }

    fn tick(&mut self, delta: Duration, held: bool) {
        if held {
            return;
        }
        self.clock.advance(delta);
        let now = self.clock.now();
        for row in &mut self.rows {
            if now >= row.changed + self.replace_after
                && let Some(newest) = row.newest.take()
            {
                let stays: Duration = newest.notification.stays().into();
                row.read_by = row.read_by.max(now + stays);
                row.shown = newest;
                row.changed = now;
            }
        }
        self.rows.retain(|row| row.read_by > now);
        self.turned_away = self
            .turned_away
            .take()
            .filter(|turned_away| turned_away.until > now);
    }

    fn close(&mut self, key: u64) {
        self.rows.retain(|row| row.key != key);
    }

    fn labelled_lines(&self) -> Vec<LabelledLine> {
        self.rows
            .iter()
            .map(|row| LabelledLine {
                key: row.key,
                label: row.voice.to_string(),
                replaced: row.replaced,
                text: row.shown.notification.text.styled(),
            })
            .collect()
    }

    fn more(&self) -> Option<u32> {
        self.turned_away
            .as_ref()
            .map(|turned_away| turned_away.more)
    }

    fn shown(&self) -> NotificationRows {
        NotificationRows {
            rows: self
                .rows
                .iter()
                .map(|row| NotificationRow {
                    label: row.voice.to_string(),
                    text: row.shown.notification.text.plain_words(),
                    replaced: row.replaced,
                })
                .collect(),
            more: self.more().unwrap_or(0),
        }
    }
}

fn tick<P: RowPlace>(world: &mut World) {
    let held = hovered(world, &world.resource::<PlacedRows<P>>().drawn);
    let delta = world.resource::<Time>().delta();
    world.resource_mut::<PlacedRows<P>>().rows.tick(delta, held);
}

fn lines_of<P: RowPlace>(world: &World) -> (Vec<LabelledLine>, Option<u32>) {
    let placed = world.resource::<PlacedRows<P>>();
    (placed.rows.labelled_lines(), placed.rows.more())
}

fn draw_rows<P: RowPlace>(
    world: &mut World,
    gui: &egui::Context,
    top: f32,
    mark: Mark,
    closable: bool,
) -> f32 {
    let step = hud::motion_step(gui);
    let (lines, more) = lines_of::<P>(world);
    let shown = world
        .resource_mut::<PlacedRows<P>>()
        .fades
        .sync(step, lines.into_iter().map(|line| (line.key, line)));
    let mut drawn = Vec::new();
    let mut at = top;
    for (line, pose) in shown {
        let label = label_text(&line.label, line.replaced);
        let slip = Notice {
            icon: NoticeIcon::Mark(mark),
            label: Some(&label),
            line: &line.text,
            ink: ink::INK,
            closable,
        };
        let id = Id::new((std::any::type_name::<P>(), line.key));
        let (rect, clicked) = notice(world, gui, id, at, slip, pose);
        if clicked {
            world.resource_mut::<PlacedRows<P>>().rows.close(line.key);
        }
        at = rect.bottom() + ROW_GAP;
        drawn.push(rect);
    }
    if let Some(more) = more {
        drawn.push(more_slip(world, gui, std::any::type_name::<P>(), at, more));
    }
    let bottom = drawn.last().map_or(top, Rect::bottom);
    world.resource_mut::<PlacedRows<P>>().drawn = drawn;
    bottom
}

fn notice_icon(ui: &mut Ui, world: &mut World, icon: &NoticeIcon, color: Color32) {
    match icon {
        NoticeIcon::File(file) => {
            hud::file_icon(ui, world, file, NOTICE_ICON);
        }
        NoticeIcon::Mark(mark) => {
            glyph::show(ui, *mark, NOTICE_ICON, color);
        }
    }
}

fn padding() -> Vec2 {
    Vec2::new(
        f32::from(slip::PADDING.left + slip::PADDING.right),
        f32::from(slip::PADDING.top + slip::PADDING.bottom),
    )
}

fn big_title(title: &str) -> LayoutJob {
    let mut job = LayoutJob::default();
    job.append(
        title,
        0.0,
        TextFormat {
            font_id: Face::SmallCapsBold.id(TextRole::Title.size()),
            ..TextRole::Title.format(ink::RUBRIC)
        },
    );
    job.halign = Align::Center;
    job
}

fn label_text(label: &str, replaced: u32) -> String {
    match replaced {
        0 => label.to_owned(),
        replaced => format!("{label} +{replaced}"),
    }
}
