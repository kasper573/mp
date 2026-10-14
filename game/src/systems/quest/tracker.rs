use bevy::prelude::*;
use ui::tokens::{palette, spacing, typography};
use ui::{DragHandle, DragRoot, OnSettle};

use super::card::{Countdown, icon, live_text};
use super::{Parties, QuestId, QuestLog, QuestResult, ready_mark};
use crate::core::assets::AssetRef;
use crate::core::content::{Content, Fixture};
use crate::systems::hud::{self, HudAudience, Widget, spawn_ui};
use crate::systems::interface::InterfaceIcon;
use crate::systems::item::Inventory;
use crate::systems::player::session::Viewpoint;
use crate::systems::screen::ClientScreen;

const WIDTH: f32 = 230.0;
const MARK: f32 = 16.0;

pub struct QuestTrackerPlugin;

impl Plugin for QuestTrackerPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Folded>()
            .init_resource::<Built>()
            .add_systems(OnExit(ClientScreen::Area), forget);
    }
}

pub struct QuestTrackerWidget;

impl Widget for QuestTrackerWidget {
    fn audience(&self) -> HudAudience {
        HudAudience::Everyone
    }
    fn fallback(&self, screen_w: f32) -> Vec2 {
        Vec2::new(screen_w - hud::WIDGET.0 - WIDTH - 24.0, 8.0)
    }
    fn build(&self, pos: Vec2, id: &'static str) -> Box<dyn Scene> {
        let node = Node {
            position_type: PositionType::Absolute,
            left: Val::Px(pos.x),
            top: Val::Px(pos.y),
            width: Val::Px(WIDTH),
            flex_direction: FlexDirection::Column,
            row_gap: Val::Px(spacing::S),
            padding: UiRect::all(Val::Px(6.0)),
            border: UiRect::all(Val::Px(1.0)),
            display: Display::None,
            ..default()
        };
        Box::new(bsn! {
            node
            BackgroundColor({hud::PANEL_BG})
            BorderColor::all(hud::BORDER)
            DragRoot
            DragHandle
            QuestTracker
            ~{OnSettle::new(move |world, geom| hud::persist_widget(world, id, geom))}
        })
    }
    fn sync(&self, world: &mut World) {
        sync_tracker(world)
    }
}

#[derive(Component, Default, Clone)]
struct QuestTracker;

#[derive(Resource, Default)]
struct Folded(bool);

#[derive(Resource, Default)]
struct Built(Option<u64>);

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
enum Tone {
    Plain,
    Done,
    Next,
    Bad,
}

#[derive(Debug, Hash)]
struct Entry {
    quest: QuestId,
    mark: Option<&'static AssetRef>,
    timed: bool,
    rows: Vec<(String, Count, Tone)>,
}

#[derive(Debug, Hash)]
enum Count {
    Fixed(String),
    Live(Countdown),
}

fn forget(mut built: ResMut<Built>) {
    built.0 = None;
}

fn sync_tracker(world: &mut World) {
    let Some(panel) = world
        .query_filtered::<Entity, With<QuestTracker>>()
        .iter(world)
        .next()
    else {
        return;
    };
    let entries = entries(world);
    let log = world
        .resource::<Viewpoint>()
        .0
        .and_then(|seen| world.get::<QuestLog>(seen))
        .cloned()
        .unwrap_or_default();
    let folded = world.resource::<Folded>().0;
    let key = hud::fingerprint(&(&entries, folded));
    if world.resource::<Built>().0 == Some(key) {
        return;
    }
    world.resource_mut::<Built>().0 = Some(key);
    if let Some(mut node) = world.get_mut::<Node>(panel) {
        node.display = if entries.is_empty() {
            Display::None
        } else {
            Display::Flex
        };
    }
    let header = header(entries.len(), folded);
    let content = world.resource::<Content>();
    let assets = world.resource::<AssetServer>();
    let mut parts: Vec<Box<dyn Scene>> = vec![Box::new(header)];
    if !folded {
        parts.extend(
            entries
                .iter()
                .map(|entry| entry_scene(content, assets, &log, entry)),
        );
    }
    world.entity_mut(panel).despawn_related::<Children>();
    for part in parts {
        spawn_ui(world, part).insert(ChildOf(panel));
    }
}

fn entries(world: &World) -> Vec<Entry> {
    let content = world.resource::<Content>();
    let parties = world.resource::<Parties>();
    let seen = world.resource::<Viewpoint>().0;
    let Some(log) = seen.and_then(|seen| world.get::<QuestLog>(seen)) else {
        return Vec::new();
    };
    let inventory = seen.and_then(|seen| world.get::<Inventory>(seen));
    log.tracked
        .iter()
        .filter_map(|&quest| {
            let def = quest.get(content);
            if let Some(active) = log.active(quest) {
                let timed = active.left.is_some();
                if active.ready && def.decision().is_none() {
                    return Some(Entry {
                        quest,
                        mark: Some(&ready_mark(def).get(content).icon),
                        timed,
                        rows: vec![(
                            def.hand_in_hint(parties, quest),
                            Count::Fixed(String::new()),
                            Tone::Next,
                        )],
                    });
                }
                let progress = def.progress(content, parties, active, inventory);
                let next = progress.iter().position(|progress| !progress.done());
                let rows = progress
                    .into_iter()
                    .enumerate()
                    .map(|(index, progress)| {
                        let count = Count::Fixed(if progress.counted {
                            format!("{}/{}", progress.have, progress.need)
                        } else {
                            String::new()
                        });
                        let tone = if progress.done() {
                            Tone::Done
                        } else if Some(index) == next {
                            Tone::Next
                        } else {
                            Tone::Plain
                        };
                        (progress.label, count, tone)
                    })
                    .collect();
                return Some(Entry {
                    quest,
                    mark: None,
                    timed,
                    rows,
                });
            }
            let finished = log.finished(quest)?;
            let rows = match finished.result {
                QuestResult::Completed => vec![(
                    "Done for today".to_owned(),
                    Count::Live(Countdown::Resets),
                    Tone::Done,
                )],
                QuestResult::Failed => vec![
                    ("Failed".to_owned(), Count::Fixed(String::new()), Tone::Bad),
                    (
                        def.retry_hint(parties, quest),
                        Count::Fixed(String::new()),
                        Tone::Plain,
                    ),
                ],
            };
            Some(Entry {
                quest,
                mark: None,
                timed: false,
                rows,
            })
        })
        .collect()
}

fn header(count: usize, folded: bool) -> impl Scene {
    let ink = ui::theme::theme().surface_floating.on;
    let (title, toggle) = if folded {
        (format!("QUESTS ({count})"), "+")
    } else {
        ("QUESTS".to_owned(), "–")
    };
    bsn! {
        Node { justify_content: JustifyContent::SpaceBetween, align_items: AlignItems::Center, width: Val::Percent(100.0) }
        Pickable::IGNORE
        Children [
            @{ui::styled_text(title, ink.with_alpha(0.7), typography::LABEL)}
            --
            @{ui::button_styled(ui::button::intent::SECONDARY, ui::ButtonSize::Sm, toggle)}
            on(|_: On<ui::Activate>, mut commands: Commands| {
                commands.queue(|world: &mut World| {
                    let mut folded = world.resource_mut::<Folded>();
                    folded.0 = !folded.0;
                });
            })
        ]
    }
}

fn entry_scene(
    content: &Content,
    assets: &AssetServer,
    log: &QuestLog,
    entry: &Entry,
) -> Box<dyn Scene> {
    let ink = ui::theme::theme().surface_floating.on;
    let mark: Vec<Box<dyn Scene>> = entry
        .mark
        .map(|mark| -> Box<dyn Scene> { Box::new(icon(assets, mark, MARK)) })
        .into_iter()
        .collect();
    let quest = entry.quest;
    let timer: Vec<Box<dyn Scene>> = entry
        .timed
        .then(|| -> Box<dyn Scene> {
            Box::new(bsn! {
                Node { column_gap: Val::Px({spacing::S}), align_items: AlignItems::Center }
                Children [
                    @{icon(assets, &InterfaceIcon::Timed.get(content).image, 12.0)}
                    --
                    @{live_text(log, quest, Countdown::Left, palette::AMBER_80, typography::CAPTION)}
                ]
            })
        })
        .into_iter()
        .collect();
    let rows: Vec<Box<dyn Scene>> = entry
        .rows
        .iter()
        .map(|(label, count, tone)| -> Box<dyn Scene> {
            let color = match tone {
                Tone::Plain => ink.with_alpha(0.75),
                Tone::Done => palette::EMERALD_80.with_alpha(0.7),
                Tone::Next => palette::AMBER_80,
                Tone::Bad => palette::CRIMSON_80,
            };
            let count: Box<dyn Scene> = match count {
                Count::Fixed(count) => {
                    Box::new(ui::styled_text(count.clone(), color, typography::CAPTION))
                }
                Count::Live(shows) => {
                    Box::new(live_text(log, quest, *shows, color, typography::CAPTION))
                }
            };
            let count = vec![count];
            Box::new(bsn! {
                Node {
                    justify_content: JustifyContent::SpaceBetween,
                    column_gap: Val::Px({spacing::L}),
                    padding: {UiRect::left(Val::Px(spacing::L))},
                    width: Val::Percent(100.0),
                }
                Pickable::IGNORE
                Children [
                    @{ui::styled_text(label.clone(), color, typography::CAPTION)}
                    --
                    {count}
                ]
            })
        })
        .collect();
    let title = quest.get(content).title.as_str();
    Box::new(bsn! {
        Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(1.0), width: Val::Percent(100.0) }
        Pickable::IGNORE
        Children [
            Node { column_gap: Val::Px({spacing::M}), align_items: AlignItems::Center, width: Val::Percent(100.0) }
            Pickable::IGNORE
            Children [
                {mark}
                --
                Node { flex_grow: 1.0 } Children [ @{ui::styled_text(title, ink, typography::LABEL)} ]
                --
                {timer}
            ]
            --
            {rows}
        ]
    })
}
