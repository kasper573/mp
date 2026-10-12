use std::collections::BTreeMap;
use std::str::FromStr;

use bevy::app::Main;
use bevy::ecs::message::{MessageCursor, Messages};
use bevy::prelude::{Entity, World};
use bevy::time::TimeUpdateStrategy;
use bevy_replicon::prelude::{ClientId as Sender, FromClient, SendTargets, ServerState, ToClients};
use egui::{RichText, Ui};
use game::core::content::{Content, ContentScope, with_content};
use game::core::math::{Pos, Rng};
use game::core::script::{
    FlowKey, FlowSteering, FlowTrace, Owner, OwnerKind, Pause, Value as ScriptValue, ValueType,
};
use game::core::tiling::Tiles;
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::TICK_HZ;
use game::systems::area::{self, AreaDef, AreaModule, AreaObject};
use game::systems::dialogue::{Conversation, ConversationRequest};
use game::systems::input::map::InputMap;
use game::systems::item::{self, Inventory, ItemDef, ItemStack};
use game::systems::job::{self, Job, JobDef};
use game::systems::memory::{Memory, MemoryDef};
use game::systems::notification::NotificationSent;
use game::systems::npc::Npc;
use game::systems::player::snapshot::{CharacterSnapshot, JoinAs};
use game::systems::player::{
    AreaDrawn, ClientId, JoinRequest, Players, SpawnPolicy, SpawnRules, Xp,
};
use game::systems::quest::{self, ActiveQuest, FinishedQuest, QuestDef, QuestLog, QuestResult};
use game::systems::script::{EventKind, Place, Reach, RiftInstances, RiftScripts};

use super::panel::{Bound, bindings};
use super::{Doc, ScriptOwner, nodes};
use crate::app::Editor;
use crate::project::Selection;
use crate::tabs::Tab;
use crate::ui::{theme, widgets};

const CLIENT: u32 = 1;
const MAX_TICKS: usize = 2_000;

#[derive(Clone, Debug)]
pub struct Setup {
    pub event: String,
    pub owner: usize,
    pub character: Option<String>,
    pub hour: f32,
    pub random: BTreeMap<String, usize>,
    pub step: bool,
}

impl Default for Setup {
    fn default() -> Setup {
        Setup {
            event: "interacted".to_owned(),
            owner: 0,
            character: None,
            hour: 12.0,
            random: BTreeMap::new(),
            step: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum RunState {
    Running,
    Dialogue,
    Waiting { seconds: f64 },
    Paused { what: String },
    Stepping,
    Ended,
}

pub struct Run {
    pub doc_owner: ScriptOwner,
    pub label: String,
    world: World,
    owner: Owner,
    subject: Entity,
    conn: Entity,
    cursor: MessageCursor<ToClients<NotificationSent>>,
    traced: usize,
    pub visited: Vec<String>,
    pub log: Vec<String>,
    pub state: RunState,
    flow: Option<FlowKey>,
    inputs: InputMap,
    pub conversation: Option<Conversation>,
    area: area::Id,
    watched: Watched,
}

#[derive(Default)]
struct Watched {
    memories: Vec<String>,
    quests: Vec<String>,
    items: Vec<String>,
}

pub fn panel(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let _ = super::catalogue(editor);
    let bound = bindings(editor, doc);
    let owner_key = doc.owner.clone();
    let mut setup: Setup = editor
        .views
        .script
        .setups
        .get(&owner_key)
        .cloned()
        .unwrap_or_default();
    let events: Vec<String> = doc
        .nodes()
        .values()
        .filter_map(nodes::event_of)
        .map(str::to_owned)
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    if !events.contains(&setup.event) {
        setup.event = events.first().cloned().unwrap_or_default();
    }
    let randoms: Vec<(String, usize)> = doc
        .nodes()
        .iter()
        .filter(|(_, node)| nodes::kind(node) == "random")
        .map(|(name, node)| (name.clone(), node["weights"].as_array().map_or(0, Vec::len)))
        .collect();
    let characters: Vec<(String, String)> = editor
        .project
        .as_ref()
        .map(|project| {
            project
                .files
                .paths_under("tables/test_character/")
                .filter_map(|file| {
                    let (_, key) = crate::project::row_of(file)?;
                    let name = project
                        .files
                        .json(file)
                        .and_then(|row| row["name"].as_str().map(str::to_owned))
                        .unwrap_or_else(|| key.to_owned());
                    Some((key.to_owned(), name))
                })
                .collect()
        })
        .unwrap_or_default();
    let running = editor
        .views
        .script
        .run
        .as_ref()
        .is_some_and(|run| run.doc_owner == doc.owner);
    let mut start = editor
        .views
        .script
        .fire
        .take()
        .is_some_and(|fired| fired == doc.owner);
    let mut stop = false;
    let mut open_owner: Option<String> = None;
    let mut step = false;
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        if ui
            .add_enabled(
                !bound.is_empty() && !events.is_empty(),
                egui::Button::new(
                    RichText::new("▶ Fire")
                        .color(egui::Color32::WHITE)
                        .family(egui::FontFamily::Name("medium".into())),
                )
                .fill(theme::ACCENT)
                .stroke(egui::Stroke::NONE),
            )
            .clicked()
        {
            start = true;
        }
        egui::ComboBox::from_id_salt(("run-event", doc.owner.slug()))
            .selected_text(theme::mono(&setup.event).size(13.0))
            .show_ui(ui, |ui| {
                for event in &events {
                    ui.selectable_value(&mut setup.event, event.clone(), event);
                }
            });
        ui.label(theme::muted("on").size(13.0));
        match bound.len() {
            0 => {
                ui.label(theme::muted("no owner").size(13.0));
            }
            1 => {
                let owner = &bound[0];
                let response = ui
                    .horizontal(|ui| {
                        egui::Frame::new()
                            .fill(theme::ACCENT_SOFT)
                            .stroke(egui::Stroke::new(1.0, theme::ACCENT))
                            .corner_radius(4.0)
                            .inner_margin(egui::Margin::symmetric(6, 2))
                            .show(ui, |ui| {
                                widgets::badge(ui, owner.row.kind.name());
                                ui.label(theme::mono(&owner.label).size(13.0));
                                ui.label(RichText::new("→").size(12.0).color(theme::ACCENT));
                            });
                    })
                    .response
                    .interact(egui::Sense::click());
                if response
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    open_owner = Some(owner.file.clone());
                }
            }
            _ => {
                egui::ComboBox::from_id_salt(("run-owner", doc.owner.slug()))
                    .selected_text(
                        theme::mono(
                            bound
                                .get(setup.owner)
                                .map(|b| b.label.clone())
                                .unwrap_or_default(),
                        )
                        .size(13.0),
                    )
                    .show_ui(ui, |ui| {
                        for (index, owner) in bound.iter().enumerate() {
                            ui.selectable_value(&mut setup.owner, index, &owner.label);
                        }
                    });
            }
        }
        ui.label(theme::muted("by").size(13.0));
        egui::ComboBox::from_id_salt(("run-character", doc.owner.slug()))
            .selected_text(
                theme::mono(
                    setup
                        .character
                        .as_ref()
                        .and_then(|key| characters.iter().find(|(k, _)| k == key))
                        .map(|(_, name)| name.clone())
                        .unwrap_or_else(|| "pretend character".to_owned()),
                )
                .size(13.0),
            )
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut setup.character, None, "pretend character · fresh");
                for (key, name) in &characters {
                    ui.selectable_value(
                        &mut setup.character,
                        Some(key.clone()),
                        format!("{name} · test_character/{key}"),
                    );
                }
            });
        if running {
            if ui.button("↻ Restart").clicked() {
                start = true;
            }
            if ui
                .button("Step ▶")
                .on_hover_text("One tick at a time")
                .clicked()
            {
                step = true;
            }
            if ui.button("■ Stop").on_hover_text("Esc").clicked() {
                stop = true;
            }
        }
        ui.menu_button(theme::faint("⋯"), |ui| {
            ui.set_min_width(220.0);
            ui.horizontal(|ui| {
                ui.label(theme::muted("clock"));
                ui.add(
                    egui::DragValue::new(&mut setup.hour)
                        .range(0.0..=23.99)
                        .speed(0.25)
                        .suffix(" h UTC"),
                );
            });
            ui.checkbox(&mut setup.step, "pause at every node");
            for (name, outputs) in &randoms {
                ui.horizontal(|ui| {
                    ui.label(theme::muted(format!("{name} takes")));
                    let pick = setup.random.get(name).copied();
                    egui::ComboBox::from_id_salt(("run-random", doc.owner.slug(), name))
                        .selected_text(pick.map_or("its weights".to_owned(), |index| {
                            format!("output {}", index + 1)
                        }))
                        .show_ui(ui, |ui| {
                            let mut picked = pick;
                            ui.selectable_value(&mut picked, None, "its weights");
                            for index in 0..*outputs {
                                ui.selectable_value(
                                    &mut picked,
                                    Some(index),
                                    format!("output {}", index + 1),
                                );
                            }
                            match picked {
                                Some(index) => {
                                    setup.random.insert(name.clone(), index);
                                }
                                None => {
                                    setup.random.remove(name);
                                }
                            }
                        });
                });
            }
        });
    });
    editor
        .views
        .script
        .setups
        .insert(owner_key.clone(), setup.clone());
    if let Some(file) = open_owner
        && let Some((table, key)) = crate::project::row_of(&file)
    {
        editor.select(crate::project::Selection::row(table, key));
        editor.open_tab(crate::tabs::Tab::for_row(table, key));
    }
    if stop {
        editor.views.script.run = None;
    }
    if start {
        let owner = bound.get(setup.owner).or(bound.first());
        if let Some(mut run) = owner.and_then(|owner| {
            start_run(editor, doc, owner, &setup)
                .map_err(|e| editor.toast(e))
                .ok()
        }) {
            run.apply_steering(&setup);
            if setup.step {
                run.tick();
                run.read();
            } else {
                run.go();
            }
            editor.views.script.run = Some(run);
        }
    }
    let catalogue_pieces: Vec<(String, String, String)> = doc
        .nodes()
        .iter()
        .map(|(name, node)| {
            let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
            let title = super::graph::card_title(name, node);
            let detail = nodes::pieces(node, catalogue)
                .into_iter()
                .map(|line| line.into_iter().map(|p| p.text).collect::<String>())
                .collect::<Vec<_>>()
                .join(" · ");
            (name.clone(), title, detail)
        })
        .collect();
    let owner_label = bound
        .get(setup.owner)
        .or(bound.first())
        .map(|b| b.label.clone())
        .unwrap_or_default();
    let Some(run) = editor
        .views
        .script
        .run
        .as_mut()
        .filter(|run| run.doc_owner == owner_key)
    else {
        if bound.is_empty() {
            widgets::hint(
                ui,
                "Run needs an owner: name this script from an npc, object, item, quest, shop or area first.",
            );
        }
        return;
    };
    if step {
        run.set_step(true);
        run.tick();
        run.read();
    }
    ui.add_space(4.0);
    let state = match &run.state {
        RunState::Running => "running".to_owned(),
        RunState::Dialogue => "waiting for a choice".to_owned(),
        RunState::Waiting { seconds } => format!("waiting {seconds:.1} s"),
        RunState::Paused { what } => format!("paused in {what}"),
        RunState::Stepping => "stepping".to_owned(),
        RunState::Ended => "ended".to_owned(),
    };
    let mut skip = false;
    let mut resume = false;
    egui::ScrollArea::vertical().id_salt(("run-trace", doc.owner.slug())).stick_to_bottom(true).show(ui, |ui| {
        let mut row_number = 0;
        let total = run.log.len();
        for (index, line) in run.log.iter().enumerate() {
            let last = index + 1 == total;
            let (node, extra) = match line.split_once("  ·  ") {
                Some((node, procedure)) => (Some(node.to_owned()), Some(procedure.to_owned())),
                None => (None, None),
            };
            let (title, detail) = match &node {
                Some(node) => {
                    row_number += 1;
                    let (title, pieces) = catalogue_pieces.iter().find(|(name, _, _)| name == node).map(|(_, title, detail)| (title.clone(), detail.clone())).unwrap_or_else(|| (node.clone(), String::new()));
                    let mut parts: Vec<String> = Vec::new();
                    if title.starts_with("on ") {
                        parts.push(format!("{owner_label} · {pieces} · a new flow, subject the pretend character"));
                    } else if !pieces.is_empty() {
                        parts.push(pieces);
                    } else if let Some(source) = doc.nodes().get(node).filter(|source| source["type"] == "dialogue") {
                        let lines = source["lines"].as_array().map_or(0, Vec::len);
                        let choices = source["choices"].as_array().map_or(0, Vec::len);
                        parts.push(format!("{lines} {} · {choices} {}", if lines == 1 { "line" } else { "lines" }, if choices == 1 { "choice" } else { "choices" }));
                    }
                    if let Some(branch) = branch_taken(doc, node, run.log.get(index + 1)) {
                        parts.push(format!("→ {branch}"));
                    }
                    if let Some(procedure) = extra.filter(|p| !p.is_empty() && !p.ends_with(&owner_label)) {
                        parts.push(format!("in {procedure}"));
                    }
                    if last {
                        parts.push(match &run.state {
                            RunState::Dialogue => run.conversation.as_ref().map(|c| format!("waiting for a choice · {} shown, {} locked", c.choices.len(), c.choices.iter().filter(|c| c.locked).count())).unwrap_or_else(|| "waiting for a choice".to_owned()),
                            _ => state.clone(),
                        });
                    }
                    (title, parts.join(" · "))
                }
                None => (String::new(), line.clone()),
            };
            ui.horizontal(|ui| {
                ui.add_sized(egui::vec2(24.0, 18.0), egui::Label::new(theme::faint(if node.is_some() { row_number.to_string() } else { String::new() }).monospace().size(12.5)));
                if !title.is_empty() {
                    ui.add_sized(egui::vec2(120.0, 18.0), egui::Label::new(theme::mono(&title).size(13.0)).truncate());
                }
                ui.add(egui::Label::new(theme::muted(detail).monospace().size(12.5)).wrap());
            });
            let rect = ui.max_rect();
            let y = ui.cursor().min.y;
            ui.painter().line_segment([egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)], egui::Stroke::new(1.0, theme::BORDER));
        }
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            if matches!(run.state, RunState::Waiting { .. }) && ui.button("⏩ Skip the wait").clicked() {
                skip = true;
            }
            if matches!(run.state, RunState::Stepping | RunState::Paused { .. }) && ui.button("▶ Run on").clicked() {
                resume = true;
            }
            if run.state == RunState::Ended {
                ui.label(theme::muted("The flow ended. Fire again or pick another event.").size(12.5));
            }
        });
    });
    if resume {
        run.set_step(false);
        run.go();
    }
    if skip {
        run.skip_wait();
        run.go();
    }
}

pub fn conversation_box(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let owner = doc.owner.clone();
    let Some(run) = editor
        .views
        .script
        .run
        .as_mut()
        .filter(|run| run.doc_owner == owner)
    else {
        return;
    };
    let Some(conversation) = run.conversation.clone() else {
        return;
    };
    let content = run_content(run);
    let inputs = run.inputs.clone();
    let mut pick: Option<usize> = None;
    let mut leave = false;
    let digits = [
        egui::Key::Num1,
        egui::Key::Num2,
        egui::Key::Num3,
        egui::Key::Num4,
        egui::Key::Num5,
        egui::Key::Num6,
        egui::Key::Num7,
        egui::Key::Num8,
        egui::Key::Num9,
    ];
    if !ui.ctx().text_edit_focused() {
        ui.input(|i| {
            for (index, key) in digits.iter().enumerate() {
                if i.key_pressed(*key)
                    && index < conversation.choices.len()
                    && !conversation.choices[index].locked
                {
                    pick = Some(index);
                }
            }
            if i.key_pressed(egui::Key::Escape) {
                leave = true;
            }
        });
    }
    let rect = ui.max_rect();
    let width = 360.0_f32.min(rect.width() - 32.0);
    egui::Area::new(ui.id().with(("conversation-box", owner.slug())))
        .order(egui::Order::Foreground)
        .fixed_pos(egui::pos2(rect.max.x - width - 16.0, rect.max.y - 16.0))
        .pivot(egui::Align2::LEFT_BOTTOM)
        .show(ui.ctx(), |ui| {
            egui::Frame::new()
                .fill(egui::Color32::from_rgba_unmultiplied(14, 14, 18, 235))
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(6.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    ui.set_width(width);
                    ui.label(
                        RichText::new("CONVERSATION · the client's box")
                            .size(10.5)
                            .color(theme::FAINT),
                    );
                    for line in &conversation.lines {
                        let who = match &line.by {
                            game::systems::script::Speaker::Npc(npc) => content
                                .by_key::<game::systems::npc::NpcDef>(npc.key(&content))
                                .map(|id| id.get(&content).name.clone())
                                .unwrap_or_else(|| npc.key(&content).to_owned()),
                            game::systems::script::Speaker::Object => "—".to_owned(),
                            game::systems::script::Speaker::Narrator => String::new(),
                            game::systems::script::Speaker::Player => "You".to_owned(),
                        };
                        let text = line.text.words(&inputs);
                        if who.is_empty() {
                            ui.add(
                                egui::Label::new(
                                    RichText::new(text).size(13.5).color(theme::TEXT).italics(),
                                )
                                .wrap(),
                            );
                        } else {
                            ui.add(
                                egui::Label::new(
                                    RichText::new(format!("{who}: {text}"))
                                        .size(13.5)
                                        .color(theme::TEXT),
                                )
                                .wrap(),
                            );
                        }
                    }
                    ui.add_space(6.0);
                    for (index, choice) in conversation.choices.iter().enumerate() {
                        let mut text = format!("{}  {}", index + 1, choice.label.words(&inputs));
                        if let Some(warn) = &choice.warn {
                            text.push_str(&format!("  ⚠ {warn}"));
                        }
                        if choice.locked {
                            text.push_str("  locked");
                        }
                        if ui
                            .add_enabled(
                                !choice.locked,
                                egui::Button::new(RichText::new(text).size(13.0)).frame(false),
                            )
                            .clicked()
                        {
                            pick = Some(index);
                        }
                    }
                    ui.horizontal(|ui| {
                        if ui
                            .add(egui::Button::new(theme::muted("Leave").size(12.5)).frame(false))
                            .clicked()
                        {
                            leave = true;
                        }
                        ui.label(
                            theme::faint("1 – 9 pick · Esc leaves")
                                .size(11.5)
                                .monospace(),
                        );
                    });
                });
        });
    if let Some(index) = pick {
        run.pick(index);
        run.go();
    }
    if leave {
        run.leave();
        run.go();
    }
}

pub fn inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc) -> bool {
    let owner_key = doc.owner.clone();
    if !editor
        .views
        .script
        .run
        .as_ref()
        .is_some_and(|run| run.doc_owner == owner_key)
    {
        return false;
    }
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return false;
    };
    let bound = bindings(editor, doc);
    let setup = editor
        .views
        .script
        .setups
        .get(&owner_key)
        .cloned()
        .unwrap_or_default();
    let reaches: Vec<Reach> = bound
        .get(setup.owner)
        .or(bound.first())
        .map(|b| content.built::<RiftScripts>().may_do(b.row).reaches)
        .unwrap_or_default();
    let read_memories = memories_read(doc);
    let kind = doc.kind.name().to_owned();
    let state_names = super::inspect::names_text(&doc.script["state"]);
    let mut open: Option<Tab> = None;
    let run = editor.views.script.run.as_mut().expect("a live run");
    let label = run.label.split(" · ").next().unwrap_or("").to_owned();
    let flows = run.world.resource::<RiftInstances>().live_flows(run.owner);
    let waiting = match &run.state {
        RunState::Dialogue => run
            .visited
            .last()
            .map(|node| format!("waiting at {node}"))
            .unwrap_or_default(),
        RunState::Waiting { seconds } => format!("waiting {seconds:.0} s"),
        RunState::Ended => "ended".to_owned(),
        _ => run
            .visited
            .last()
            .map(|node| format!("at {node}"))
            .unwrap_or_default(),
    };
    widgets::section(ui, "Owner");
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, &kind, &label, "", |_| {});
        widgets::kv_text(ui, "state", state_names);
        widgets::kv_text(
            ui,
            "flows",
            if flows == 0 {
                "none".to_owned()
            } else {
                format!("{flows} · {waiting}")
            },
        );
    });
    widgets::section(ui, "Pretend subject");
    character_card(ui, run, &content, &mut open);
    memories_card(ui, run, &content, &read_memories);
    quests_card(ui, run, &content, &reaches, &mut open);
    bag_card(ui, run, &content, &reaches, &mut open);
    if let Some(tab) = open {
        if let Some((table, key)) = tab.row() {
            editor.select(Selection::row(&table, &key));
        }
        editor.open_tab(tab);
    }
    true
}

fn character_card(ui: &mut Ui, run: &mut Run, content: &Content, open: &mut Option<Tab>) {
    let subject = run.subject;
    let name = run
        .world
        .get::<game::systems::actor::Name>(subject)
        .map(|n| n.name.clone())
        .unwrap_or_else(|| "character".to_owned());
    let job = run.world.get::<Job>(subject).map(|job| job.def);
    let level = game::systems::job::level(&run.world, subject);
    let jobs: Vec<(job::Id, String)> = content
        .table::<JobDef>()
        .ids()
        .map(|id| (id, id.key(content).to_owned()))
        .collect();
    let tiers = job.map(|job| job.get(content).levels.len()).unwrap_or(0);
    let area_key = run.area.key(content).to_owned();
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "player", &name, "", |_| {});
        widgets::kv(ui, "level", |ui| {
            let mut picked = level;
            egui::ComboBox::from_id_salt("run-level")
                .width(ui.available_width() - 8.0)
                .selected_text(theme::mono(level.to_string()))
                .show_ui(ui, |ui| {
                    for tier in 1..=tiers.max(1) as u32 {
                        ui.selectable_value(&mut picked, tier, tier.to_string());
                    }
                });
            if picked != level {
                let xp = job
                    .and_then(|job| job.get(content).levels.get(picked as usize - 1))
                    .map_or(0, |tier| tier.xp);
                if let Some(mut held) = run.world.get_mut::<Xp>(subject) {
                    held.amount = xp;
                }
            }
        });
        widgets::kv(ui, "job", |ui| {
            let current = job
                .map(|job| job.key(content).to_owned())
                .unwrap_or_else(|| "none".to_owned());
            let mut picked = job;
            egui::ComboBox::from_id_salt("run-job")
                .width(ui.available_width() - 8.0)
                .selected_text(theme::mono(&current))
                .show_ui(ui, |ui| {
                    for (id, key) in &jobs {
                        ui.selectable_value(&mut picked, Some(*id), key);
                    }
                });
            if picked != job
                && let (Some(def), Some(mut held)) = (picked, run.world.get_mut::<Job>(subject))
            {
                held.def = def;
            }
        });
        widgets::kv(ui, "area", |ui| {
            if widgets::keyed_button(ui, &format!("area/ {area_key}"), "", true)
                .on_hover_text("Open the area the run plays in")
                .clicked()
            {
                *open = Some(Tab::Area {
                    key: area_key.clone(),
                });
            }
        });
    });
}

fn memories_card(ui: &mut Ui, run: &mut Run, content: &Content, read: &[String]) {
    let subject = run.subject;
    let set: Vec<String> = run
        .world
        .get::<Memory>(subject)
        .and_then(|memory| crate::value::json(memory).ok())
        .and_then(|json| json.as_object().map(|map| map.keys().cloned().collect()))
        .unwrap_or_default();
    let mut shown: Vec<String> = read.to_vec();
    for key in set.iter().chain(&run.watched.memories) {
        if !shown.contains(key) {
            shown.push(key.clone());
        }
    }
    let all: Vec<String> = content.table::<MemoryDef>().keys().to_vec();
    let mut add: Option<String> = None;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "memory", "memories", "", |_| {});
        if shown.is_empty() {
            ui.label(theme::muted("none set · unset reads as zero").size(13.0));
        }
        for key in &shown {
            let Some(id) = content.by_key::<MemoryDef>(key) else {
                continue;
            };
            let ty = id.get(content).ty;
            let is_set = set.contains(key);
            let value = game::systems::memory::get(&run.world, subject, id);
            widgets::kv(ui, key, |ui| {
                let mut changed = None;
                match (ty, value) {
                    (ValueType::Boolean, value) => {
                        let mut on = value.truthy();
                        if !is_set {
                            ui.label(theme::muted("unset").size(13.0));
                        }
                        if widgets::toggle(ui, &mut on).changed() {
                            changed = Some(ScriptValue::Bool(on));
                        }
                    }
                    (ValueType::Text, value) => {
                        let mut text = match value {
                            ScriptValue::Text(text) => text,
                            _ => String::new(),
                        };
                        let response = ui.add(
                            egui::TextEdit::singleline(&mut text)
                                .hint_text(if is_set { "" } else { "unset" })
                                .desired_width(ui.available_width() - 8.0)
                                .font(egui::TextStyle::Monospace),
                        );
                        if response.lost_focus() && response.changed() {
                            changed = Some(ScriptValue::Text(text));
                        }
                    }
                    (_, value) => {
                        let mut number = match value {
                            ScriptValue::Int(int) => int as f64,
                            ScriptValue::Num(num) => num,
                            _ => 0.0,
                        };
                        if !is_set {
                            ui.label(theme::muted("unset").size(13.0));
                        }
                        let response = ui.add(egui::DragValue::new(&mut number).speed(1.0));
                        if response.changed() {
                            changed = Some(if ty == ValueType::Integer {
                                ScriptValue::Int(number as i64)
                            } else {
                                ScriptValue::Num(number)
                            });
                        }
                    }
                }
                if let Some(value) = changed {
                    game::systems::memory::set(&mut run.world, subject, id, value);
                }
                if is_set
                    && ui
                        .add(egui::Button::new(theme::faint("✕").size(12.0)).frame(false))
                        .on_hover_text("Forget it · reads as unset")
                        .clicked()
                    && let Some(mut memory) = run.world.get_mut::<Memory>(subject)
                {
                    memory.forget(id);
                }
            });
        }
        let response = ui.add(egui::Button::new(theme::muted("+ memory").size(12.5)));
        egui::Popup::from_toggle_button_response(&response).show(|ui| {
            ui.set_min_width(180.0);
            for key in all.iter().filter(|key| !shown.contains(key)) {
                if ui
                    .selectable_label(false, theme::mono(key).size(12.5))
                    .clicked()
                {
                    add = Some(key.clone());
                }
            }
            if all.iter().all(|key| shown.contains(key)) {
                ui.label(theme::faint("every memory is listed").size(12.0));
            }
        });
    });
    if let Some(key) = add {
        run.watched.memories.push(key);
    }
}

fn quests_card(
    ui: &mut Ui,
    run: &mut Run,
    content: &Content,
    reaches: &[Reach],
    open: &mut Option<Tab>,
) {
    let subject = run.subject;
    let log = run
        .world
        .get::<QuestLog>(subject)
        .cloned()
        .unwrap_or_default();
    let mut shown: Vec<String> = reaches
        .iter()
        .filter_map(|reach| match reach {
            Reach::Offers(q)
            | Reach::Accepts(q)
            | Reach::TurnsIn(q)
            | Reach::Completes(q)
            | Reach::Fails(q) => Some(q.key(content).to_owned()),
            _ => None,
        })
        .collect();
    shown.dedup();
    for key in log
        .active
        .iter()
        .map(|a| a.quest.key(content).to_owned())
        .chain(log.finished.iter().map(|f| f.quest.key(content).to_owned()))
        .chain(run.watched.quests.iter().cloned())
    {
        if !shown.contains(&key) {
            shown.push(key);
        }
    }
    let all: Vec<String> = content.table::<QuestDef>().keys().to_vec();
    let mut add: Option<String> = None;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "quest", "quests", "", |_| {});
        if shown.is_empty() {
            ui.label(theme::muted("none taken").size(13.0));
        }
        for key in &shown {
            let Some(id) = content.by_key::<QuestDef>(key) else {
                continue;
            };
            let standing = quest_standing(&log, id);
            ui.horizontal(|ui| {
                if widgets::keyed_button(ui, &format!("quest/ {key}"), "", true).clicked() {
                    *open = Some(Tab::for_row("quest", key));
                }
                let mut picked = standing;
                egui::ComboBox::from_id_salt(("run-quest", key))
                    .selected_text(theme::mono(standing.label()))
                    .show_ui(ui, |ui| {
                        for option in QuestStanding::ALL {
                            ui.selectable_value(&mut picked, option, option.label());
                        }
                    });
                if picked != standing {
                    set_quest_standing(&mut run.world, subject, content, id, picked);
                }
            });
        }
        let response = ui.add(egui::Button::new(theme::muted("+ quest").size(12.5)));
        egui::Popup::from_toggle_button_response(&response).show(|ui| {
            ui.set_min_width(180.0);
            for key in all.iter().filter(|key| !shown.contains(key)) {
                if ui
                    .selectable_label(false, theme::mono(key).size(12.5))
                    .clicked()
                {
                    add = Some(key.clone());
                }
            }
        });
    });
    if let Some(key) = add {
        run.watched.quests.push(key);
    }
}

fn bag_card(
    ui: &mut Ui,
    run: &mut Run,
    content: &Content,
    reaches: &[Reach],
    open: &mut Option<Tab>,
) {
    let subject = run.subject;
    let held: Vec<ItemStack> = run
        .world
        .get::<Inventory>(subject)
        .map(|bag| bag.slots.clone())
        .unwrap_or_default();
    let mut shown: Vec<String> = reaches
        .iter()
        .filter_map(|reach| match reach {
            Reach::Takes(i) | Reach::Gives(i) | Reach::Drops(i) => Some(i.key(content).to_owned()),
            _ => None,
        })
        .collect();
    shown.dedup();
    for key in held
        .iter()
        .map(|stack| stack.item.key(content).to_owned())
        .chain(run.watched.items.iter().cloned())
    {
        if !shown.contains(&key) {
            shown.push(key);
        }
    }
    let all: Vec<String> = content.table::<ItemDef>().keys().to_vec();
    let mut add: Option<String> = None;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "item", "bag", "", |_| {});
        if shown.is_empty() {
            ui.label(theme::muted("empty").size(13.0));
        }
        for key in &shown {
            let Some(id) = content.by_key::<ItemDef>(key) else {
                continue;
            };
            let count = held
                .iter()
                .filter(|stack| stack.item == id)
                .map(|stack| stack.count)
                .sum::<u32>();
            ui.horizontal(|ui| {
                if widgets::keyed_button(ui, &format!("item/ {key}"), "", true).clicked() {
                    *open = Some(Tab::for_row("item", key));
                }
                let mut picked = count;
                if ui
                    .add(egui::DragValue::new(&mut picked).speed(0.1).range(0..=999))
                    .changed()
                    && picked != count
                {
                    set_held(&mut run.world, subject, id, picked);
                }
            });
        }
        let response = ui.add(egui::Button::new(theme::muted("+ item").size(12.5)));
        egui::Popup::from_toggle_button_response(&response).show(|ui| {
            ui.set_min_width(180.0);
            egui::ScrollArea::vertical()
                .max_height(240.0)
                .show(ui, |ui| {
                    for key in all.iter().filter(|key| !shown.contains(key)) {
                        if ui
                            .selectable_label(false, theme::mono(key).size(12.5))
                            .clicked()
                        {
                            add = Some(key.clone());
                        }
                    }
                });
        });
    });
    if let Some(key) = add {
        run.watched.items.push(key);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum QuestStanding {
    NotTaken,
    Active,
    Completed,
    Failed,
}

impl QuestStanding {
    const ALL: [QuestStanding; 4] = [
        QuestStanding::NotTaken,
        QuestStanding::Active,
        QuestStanding::Completed,
        QuestStanding::Failed,
    ];

    fn label(self) -> &'static str {
        match self {
            QuestStanding::NotTaken => "not taken",
            QuestStanding::Active => "active",
            QuestStanding::Completed => "completed",
            QuestStanding::Failed => "failed",
        }
    }
}

fn quest_standing(log: &QuestLog, quest: quest::Id) -> QuestStanding {
    if log.active(quest).is_some() {
        return QuestStanding::Active;
    }
    match log.finished(quest).map(|finished| finished.result) {
        Some(QuestResult::Completed) => QuestStanding::Completed,
        Some(QuestResult::Failed) => QuestStanding::Failed,
        None => QuestStanding::NotTaken,
    }
}

fn set_quest_standing(
    world: &mut World,
    subject: Entity,
    content: &Content,
    quest: quest::Id,
    standing: QuestStanding,
) {
    let day = world.resource::<WallClock>().day();
    let Some(mut log) = world.get_mut::<QuestLog>(subject) else {
        return;
    };
    log.active.retain(|active| active.quest != quest);
    log.finished.retain(|finished| finished.quest != quest);
    log.tracked.retain(|tracked| *tracked != quest);
    match standing {
        QuestStanding::NotTaken => {}
        QuestStanding::Active => log.active.push(ActiveQuest::fresh(content, quest)),
        QuestStanding::Completed | QuestStanding::Failed => log.finished.push(FinishedQuest {
            quest,
            result: if standing == QuestStanding::Completed {
                QuestResult::Completed
            } else {
                QuestResult::Failed
            },
            day,
            resets_in: None,
            offered_again: false,
        }),
    }
}

fn set_held(world: &mut World, subject: Entity, item: item::Id, count: u32) {
    let Some(mut bag) = world.get_mut::<Inventory>(subject) else {
        return;
    };
    bag.slots.retain(|stack| stack.item != item);
    if count > 0 {
        bag.slots.push(ItemStack { item, count });
    }
}

fn memories_read(doc: &Doc) -> Vec<String> {
    fn walk(value: &serde_json::Value, out: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                if matches!(
                    map.get("type").and_then(serde_json::Value::as_str),
                    Some("memory") | Some("set_within")
                ) && let Some(name) = map.get("memory").and_then(serde_json::Value::as_str)
                    && !out.iter().any(|known| known == name)
                {
                    out.push(name.to_owned());
                }
                map.values().for_each(|child| walk(child, out));
            }
            serde_json::Value::Array(list) => list.iter().for_each(|child| walk(child, out)),
            _ => {}
        }
    }
    let mut out = Vec::new();
    for node in doc.nodes().values() {
        if let Some(test) = node.get("test") {
            walk(test, &mut out);
        }
        for choice in node["choices"].as_array().into_iter().flatten() {
            if let Some(requires) = choice.get("requires") {
                walk(requires, &mut out);
            }
        }
    }
    out
}

fn branch_taken(doc: &Doc, node: &str, next: Option<&String>) -> Option<String> {
    let next = next?.split("  ·  ").next()?;
    let source = doc.nodes().get(node)?;
    let kind = source["type"].as_str()?;
    if kind == "if" {
        return ["yes", "no"]
            .into_iter()
            .find(|arrow| source[arrow].as_str() == Some(next))
            .map(str::to_owned);
    }
    if kind == "random" {
        return source["outputs"]
            .as_array()?
            .iter()
            .position(|arrow| arrow.as_str() == Some(next))
            .map(|index| format!("output {}", index + 1));
    }
    None
}

fn run_content(run: &Run) -> Content {
    *run.world.resource::<Content>()
}

fn step(world: &mut World) {
    world.run_schedule(Main);
    world.clear_trackers();
}

fn start_run(editor: &mut Editor, doc: &Doc, owner: &Bound, setup: &Setup) -> Result<Run, String> {
    let project = editor.project.as_ref().ok_or("no project")?;
    let content = project.content.ok_or("the folder does not load")?;
    let (area_id, near) = area_for(&content, owner).ok_or("no area to run in")?;
    let clock = WallClock {
        now: UnixMillis((setup.hour * 3600.0) as u64 * 1000),
        reset: UtcHour::MIDNIGHT,
    };
    let mut app = game::systems::server_app(area_id, 0, clock, &content);
    app.insert_resource(Rng::new(1));
    app.insert_resource(SpawnRules {
        policy: SpawnPolicy::Map,
        immortal: true,
    });
    app.insert_resource(TimeUpdateStrategy::ManualDuration(TICK_HZ.period()));
    app.insert_resource(FlowTrace::default());
    app.insert_resource(FlowSteering::default());
    app.finish();
    app.cleanup();
    app.world_mut()
        .resource_mut::<bevy::state::prelude::NextState<ServerState>>()
        .set(ServerState::Running);
    app.update();
    let mut world = std::mem::take(app.world_mut());
    let snapshot = snapshot_for(&content, setup.character.as_deref(), &project.files)?;
    let area = area::load(&content, area_id);
    let at = area
        .grid
        .nearest_walkable(near)
        .unwrap_or_else(|| area.fallback_spawn());
    let conn = world
        .spawn((
            ClientId(CLIENT),
            JoinAs {
                snapshot,
                start: Place { area: area_id, at },
            },
        ))
        .id();
    send(&mut world, conn, JoinRequest);
    step(&mut world);
    send(&mut world, conn, AreaDrawn);
    step(&mut world);
    let subject = *world
        .resource::<Players>()
        .0
        .get(&ClientId(CLIENT))
        .ok_or("the pretend character did not join")?;
    let world_owner = locate_owner(&mut world, owner, area_id, at)?;
    let inputs = InputMap::new(&content);
    let mut run = Run {
        doc_owner: doc.owner.clone(),
        label: format!("{} · {}", owner.label, setup.event),
        world,
        owner: world_owner,
        subject,
        conn,
        cursor: MessageCursor::default(),
        traced: 0,
        visited: Vec::new(),
        log: Vec::new(),
        state: RunState::Running,
        flow: None,
        inputs,
        conversation: None,
        area: area_id,
        watched: Watched::default(),
    };
    run.read();
    run.traced = run.world.resource::<FlowTrace>().steps.len();
    run.visited.clear();
    run.log.clear();
    let event =
        EventKind::from_str(&setup.event).map_err(|_| format!("unknown event {}", setup.event))?;
    let subject = (event != EventKind::Started).then_some(run.subject);
    run.world
        .resource_mut::<RiftInstances>()
        .raise(run.owner, event, subject, Vec::new(), |_| true);
    run.log
        .push(format!("▶ {} raised on {}", setup.event, owner.label));
    Ok(run)
}

fn send<M: bevy::ecs::message::Message>(world: &mut World, conn: Entity, message: M) {
    world.write_message(FromClient {
        client_id: Sender::Client(conn),
        message,
    });
}

fn area_for(content: &Content, owner: &Bound) -> Option<(area::Id, Pos<Tiles>)> {
    let spawn = content.built::<game::systems::GameSettings>().spawn;
    match owner.row.kind {
        OwnerKind::Area | OwnerKind::Object | OwnerKind::Blueprint => {
            let area: area::Id = game::core::content::ContentId::new(owner.row.row);
            let placed = area::placed(content, area);
            let near = match (owner.row.kind, owner.row.object) {
                (OwnerKind::Object, Some(index)) => match &placed.get(index as usize)?.module {
                    AreaModule::Object(object) => object.shape.bounds().center(),
                    _ => area::load(content, area).center(),
                },
                (OwnerKind::Blueprint, Some(ordinal)) => {
                    area::placements(content, area).get(ordinal as usize)?.at
                }
                _ => area::load(content, area).center(),
            };
            Some((area, near))
        }
        OwnerKind::Npc => {
            let npc: game::systems::npc::Id = game::core::content::ContentId::new(owner.row.row);
            for area in content.ids::<AreaDef>() {
                for placed in area::placed(content, area) {
                    if let AreaModule::Resident(resident) = &placed.module
                        && resident.npc == npc
                    {
                        return Some((area, resident.at));
                    }
                }
            }
            Some((spawn.area, spawn.at))
        }
        _ => Some((spawn.area, spawn.at)),
    }
}

fn locate_owner(
    world: &mut World,
    owner: &Bound,
    area_id: area::Id,
    at: Pos<Tiles>,
) -> Result<Owner, String> {
    Ok(match owner.row.kind {
        OwnerKind::Area => Owner::Area,
        OwnerKind::Object => {
            let index = owner.row.object.ok_or("an object without an index")?;
            let entity = world
                .query::<(Entity, &AreaObject)>()
                .iter(world)
                .find(|(_, object)| object.index == index)
                .map(|(entity, _)| entity)
                .ok_or("the object is not in its area")?;
            Owner::Entity(OwnerKind::Object, entity)
        }
        OwnerKind::Npc => {
            let def: game::systems::npc::Id = game::core::content::ContentId::new(owner.row.row);
            let found = world
                .query::<(Entity, &Npc)>()
                .iter(world)
                .find(|(_, npc)| npc.def == def)
                .map(|(entity, _)| entity);
            let entity = match found {
                Some(entity) => entity,
                None => {
                    let pack = game::systems::npc::next_pack(world);
                    game::systems::npc::spawn(world, def, at, area_id, pack)
                }
            };
            Owner::Entity(OwnerKind::Npc, entity)
        }
        OwnerKind::Blueprint => {
            Owner::Row(OwnerKind::Blueprint, owner.row.object.unwrap_or_default())
        }
        kind => Owner::Row(kind, owner.row.row),
    })
}

fn snapshot_for(
    content: &Content,
    key: Option<&str>,
    files: &crate::project::Files,
) -> Result<CharacterSnapshot, String> {
    let json = match key {
        Some(key) => files
            .json_owned(&crate::project::row_file("test_character", key))
            .ok_or_else(|| format!("no test character {key}"))?,
        None => {
            let job = content
                .table::<game::systems::job::JobDef>()
                .keys()
                .first()
                .cloned()
                .ok_or("no job row for a fresh character")?;
            serde_json::json!({ "name": "Tester", "job": job, "start": "spawn" })
        }
    };
    let (parsed, _) = with_content(ContentScope::of(content), || {
        serde_json::from_value::<CharacterSnapshot>(json)
    });
    parsed.map_err(|error| format!("the pretend character does not read: {error}"))
}

impl Run {
    fn apply_steering(&mut self, setup: &Setup) {
        let content = run_content(self);
        let _ = content;
        let mut steering = self.world.resource_mut::<FlowSteering>();
        steering.step = setup.step;
        steering.random.clear();
        for (name, index) in &setup.random {
            steering.random.insert(name.clone(), *index);
        }
    }

    fn set_step(&mut self, step: bool) {
        self.world.resource_mut::<FlowSteering>().step = step;
    }

    fn tick(&mut self) {
        step(&mut self.world);
    }

    pub fn go(&mut self) {
        for _ in 0..MAX_TICKS {
            self.tick();
            self.read();
            match self.state {
                RunState::Running => {}
                _ => return,
            }
        }
        self.state = RunState::Paused {
            what: "a run that never pauses".to_owned(),
        };
    }

    fn pick(&mut self, choice: usize) {
        if let Some(conversation) = &self.conversation {
            let step = conversation.step;
            send(
                &mut self.world,
                self.conn,
                ConversationRequest::Pick {
                    step,
                    choice: choice as u32,
                },
            );
        }
    }

    fn leave(&mut self) {
        if let Some(conversation) = &self.conversation {
            let step = conversation.step;
            send(
                &mut self.world,
                self.conn,
                ConversationRequest::Leave { step },
            );
        }
    }

    fn skip_wait(&mut self) {
        if let RunState::Waiting { seconds } = self.state {
            let jump = std::time::Duration::from_secs_f64(seconds.max(0.0) + 0.05);
            self.world
                .insert_resource(TimeUpdateStrategy::ManualDuration(jump));
            self.tick();
            self.world
                .insert_resource(TimeUpdateStrategy::ManualDuration(TICK_HZ.period()));
            self.log.push(format!("⏩ skipped {seconds:.1} s"));
        }
    }

    fn read(&mut self) {
        let content = run_content(self);
        let steps: Vec<(FlowKey, String, &'static str)> = {
            let trace = self.world.resource::<FlowTrace>();
            trace.steps[self.traced.min(trace.steps.len())..]
                .iter()
                .map(|step| (step.key, step.procedure.clone(), step.node))
                .collect()
        };
        self.traced += steps.len();
        for (key, procedure, node) in steps.iter().filter(|(key, _, _)| key.owner == self.owner) {
            self.flow = Some(*key);
            self.visited.push((*node).to_owned());
            self.log.push(format!("{node}  ·  {procedure}"));
        }
        let notices: Vec<String> = {
            let messages = self
                .world
                .resource::<Messages<ToClients<NotificationSent>>>();
            self.cursor
                .read(messages)
                .filter(|message| matches!(message.targets, SendTargets::Single(Sender::Client(conn)) if conn == self.conn))
                .map(|message| format!("🔔 {}", message.message.notification.text.words(&self.inputs)))
                .collect()
        };
        self.log.extend(notices);
        self.conversation = self.world.get::<Conversation>(self.subject).cloned();
        let now = self.world.resource::<bevy::time::Time>().elapsed_secs_f64();
        let instances = self.world.resource::<RiftInstances>();
        let live = instances.live_flows(self.owner);
        let pause = self.flow.and_then(|key| instances.pause_of(key));
        self.state = if self.conversation.is_some() {
            RunState::Dialogue
        } else {
            match pause {
                Some(Pause::Wait { until }) => RunState::Waiting {
                    seconds: (until - now).max(0.0),
                },
                Some(Pause::NextTick { .. }) => RunState::Running,
                Some(Pause::Step { .. }) => RunState::Stepping,
                Some(Pause::Dialogue) => RunState::Dialogue,
                Some(Pause::Effect { .. }) => RunState::Paused {
                    what: self.visited.last().cloned().unwrap_or_default(),
                },
                None if live == 0 => RunState::Ended,
                None => RunState::Running,
            }
        };
        let _ = content;
    }
}
