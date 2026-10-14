use bevy::prelude::*;
use design_tokens::{TextRole, color, family};
use egui::{Align, Color32, Layout, Pos2, Rect, RichText, Ui};

use super::card::Countdown;
use super::{Parties, QuestId, QuestLog, QuestResult, ready_mark};
use crate::core::assets::AssetRef;
use crate::core::content::{Content, Fixture};
use crate::systems::hud::{self, HudAudience, Widget};
use crate::systems::interface::InterfaceIcon;
use crate::systems::item::Inventory;
use crate::systems::player::session::Viewpoint;

const WIDTH: f32 = 230.0;
const MARK: f32 = 16.0;

pub struct QuestTrackerPlugin;

impl Plugin for QuestTrackerPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Folded>();
    }
}

pub struct QuestTrackerWidget;

impl Widget for QuestTrackerWidget {
    fn audience(&self) -> HudAudience {
        HudAudience::Everyone
    }
    fn fallback(&self, screen: Rect) -> Pos2 {
        Pos2::new(
            screen.right() - hud::WIDGET.0 - WIDTH - 24.0,
            screen.top() + 8.0,
        )
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let entries = entries(world);
        if entries.is_empty() {
            return;
        }
        let log = world
            .resource::<Viewpoint>()
            .0
            .and_then(|seen| world.get::<QuestLog>(seen))
            .cloned()
            .unwrap_or_default();
        hud::panel().show(ui, |ui| {
            ui.set_width(WIDTH);
            ui.spacing_mut().item_spacing.y = 4.0;
            let folded = world.resource::<Folded>().0;
            header(ui, world, entries.len(), folded);
            if folded {
                return;
            }
            for entry in &entries {
                ui.push_id(("tracked", entry.quest.index()), |ui| {
                    entry_rows(ui, world, &log, entry);
                });
            }
        });
    }
}

#[derive(Resource, Default)]
struct Folded(bool);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Tone {
    Plain,
    Done,
    Next,
    Bad,
}

struct Entry {
    quest: QuestId,
    mark: Option<&'static AssetRef>,
    timed: bool,
    rows: Vec<(String, Count, Tone)>,
}

enum Count {
    Fixed(String),
    Live(Countdown),
}

impl Tone {
    fn colour(self) -> Color32 {
        match self {
            Tone::Plain => color::TEXT.gamma_multiply(0.75),
            Tone::Done => color::OK.gamma_multiply(0.7),
            Tone::Next => color::WARN,
            Tone::Bad => color::DANGER,
        }
    }
}

fn header(ui: &mut Ui, world: &mut World, count: usize, folded: bool) {
    let (title, toggle) = if folded {
        (format!("QUESTS ({count})"), "+")
    } else {
        ("QUESTS".to_owned(), "–")
    };
    ui.horizontal(|ui| {
        ui.label(
            RichText::new(title)
                .size(TextRole::Small.size())
                .family(family::medium())
                .color(color::MUTED),
        );
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.small_button(toggle).clicked() {
                world.resource_mut::<Folded>().0 = !folded;
            }
        });
    });
}

fn entry_rows(ui: &mut Ui, world: &mut World, log: &QuestLog, entry: &Entry) {
    let content = *world.resource::<Content>();
    let small = TextRole::Small.size();
    ui.horizontal(|ui| {
        if let Some(mark) = entry.mark {
            hud::icon(ui, world, mark, MARK);
        }
        ui.label(
            RichText::new(entry.quest.get(&content).title.as_str())
                .family(family::medium())
                .color(color::TEXT),
        );
        if entry.timed {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let left = Countdown::Left.label(log, entry.quest).unwrap_or_default();
                ui.label(RichText::new(left).size(small).color(color::WARN));
                hud::icon(ui, world, &InterfaceIcon::Timed.get(&content).image, 12.0);
            });
        }
    });
    for (label, count, tone) in &entry.rows {
        let colour = tone.colour();
        let count = match count {
            Count::Fixed(count) => count.clone(),
            Count::Live(shows) => shows.label(log, entry.quest).unwrap_or_default(),
        };
        ui.horizontal(|ui| {
            ui.add_space(8.0);
            ui.label(RichText::new(label.as_str()).size(small).color(colour));
            if !count.is_empty() {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.label(RichText::new(count).size(small).color(colour));
                });
            }
        });
    }
    ui.add_space(2.0);
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
