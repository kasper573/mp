use std::collections::BTreeMap;

use egui::{Align, Layout, RichText, Ui, Vec2};
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::GameSettings;
use game::systems::area::{self, AreaDef, AreaModule};
use game::systems::job::{JobDef, JobLevel};
use game::systems::npc::NpcId;
use game::systems::quest::{Objective, Parties, Party, QuestDef, QuestId, QuestLog, QuestResult};
use game::systems::script::RiftScripts;
use game::systems::stat::StatKind;
use serde_json::{Map, Value};

use super::area::scene::{AreaSceneRequest, AreaSceneSpec, SceneryOf};
use crate::app::{Editor, PlacePick};
use crate::forms::{FormAction, FormChange, FormCx};
use crate::project::{ContentEdit, RowSelection, row_file};
use crate::tabs::EditorTab;
use crate::ui::browser::BrowserAction;
use crate::ui::{inspector, theme, widgets};
use crate::value::RowValue;
use crate::views::area::AreaViews;
use crate::{condition, forms, picker, play, schema};

pub const TABLE: &str = "test_character";
const NAV: f32 = 150.0;
const COLUMN: f32 = 300.0;
const MAP: Vec2 = Vec2::new(272.0, 96.0);

#[derive(Default)]
pub struct CharacterView {
    pub section: CharacterSection,
    pub more_quests: bool,
    pub more_memories: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum CharacterSection {
    #[default]
    Identity,
    Stats,
    Bag,
    Equipment,
    Start,
    AreasKnown,
    Quests,
    Memories,
    LinesHeard,
    Shops,
    History,
}

impl CharacterSection {
    const ALL: [CharacterSection; 11] = [
        CharacterSection::Identity,
        CharacterSection::Stats,
        CharacterSection::Bag,
        CharacterSection::Equipment,
        CharacterSection::Start,
        CharacterSection::AreasKnown,
        CharacterSection::Quests,
        CharacterSection::Memories,
        CharacterSection::LinesHeard,
        CharacterSection::Shops,
        CharacterSection::History,
    ];

    fn page(self) -> (&'static [CharacterSection], &'static [CharacterSection]) {
        match self {
            CharacterSection::Identity
            | CharacterSection::Bag
            | CharacterSection::Equipment
            | CharacterSection::Start => (
                &[CharacterSection::Bag, CharacterSection::Equipment],
                &[CharacterSection::Identity, CharacterSection::Start],
            ),
            CharacterSection::Stats | CharacterSection::AreasKnown => {
                (&[CharacterSection::Stats], &[CharacterSection::AreasKnown])
            }
            CharacterSection::Quests | CharacterSection::Memories => {
                (&[CharacterSection::Quests], &[CharacterSection::Memories])
            }
            CharacterSection::LinesHeard | CharacterSection::Shops | CharacterSection::History => (
                &[CharacterSection::LinesHeard, CharacterSection::Shops],
                &[CharacterSection::History],
            ),
        }
    }

    fn label(self) -> &'static str {
        match self {
            CharacterSection::Identity => "Identity",
            CharacterSection::Stats => "Stats and effects",
            CharacterSection::Bag => "Bag",
            CharacterSection::Equipment => "Equipment",
            CharacterSection::Start => "Start",
            CharacterSection::AreasKnown => "Areas known",
            CharacterSection::Quests => "Quests",
            CharacterSection::Memories => "Memories",
            CharacterSection::LinesHeard => "Lines heard",
            CharacterSection::Shops => "Shops",
            CharacterSection::History => "History",
        }
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let file = row_file(TABLE, key);
    let Some(mut value) = editor.row_value(TABLE, key) else {
        ui.label(theme::muted(format!("{file} is gone")));
        return;
    };
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(TABLE);
    let section = editor.views.character.section;
    let characters: Vec<String> = editor
        .project
        .as_ref()
        .map(|project| {
            project
                .files
                .keys_of("test_character")
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let mut switch: Option<String> = None;
    let mut changed = FormChange::default();
    let mut label = format!("Edit {TABLE}/{key}");
    let mut actions = Vec::new();
    let mut pick: Option<PlacePick> = None;
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(NAV);
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.label(theme::faint(key.to_uppercase()).monospace().size(11.5));
                ui.menu_button(theme::faint("▾"), |ui| {
                    for other in &characters {
                        if ui
                            .selectable_label(other == key, theme::mono(other).size(12.5))
                            .clicked()
                        {
                            switch = Some(other.clone());
                            ui.close();
                        }
                    }
                });
            });
            ui.add_space(6.0);
            for candidate in CharacterSection::ALL {
                let selected = candidate == section;
                let (rect, response) =
                    ui.allocate_exact_size(egui::vec2(NAV, 26.0), egui::Sense::click());
                if selected {
                    ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
                } else if response.hovered() {
                    ui.painter().rect_filled(rect, 4.0, theme::RAISED);
                }
                ui.painter().text(
                    rect.left_center() + egui::vec2(10.0, 0.0),
                    egui::Align2::LEFT_CENTER,
                    candidate.label(),
                    egui::FontId::proportional(13.5),
                    if selected { theme::TEXT } else { theme::MUTED },
                );
                if response.clicked() {
                    editor.views.character.section = candidate;
                }
            }
        });
        ui.add_space(14.0);
        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            let Editor {
                project,
                form,
                shapes,
                views,
                ..
            } = editor;
            let project = project.as_ref().expect("a project");
            let mut cx =
                FormCx::new(project, root, shapes, form, &mut actions).owned_by(TABLE, Some(key));
            ui.push_id(("character", key), |ui| {
                let (left, right) = section.page();
                ui.horizontal_top(|ui| {
                    for column in [left, right] {
                        ui.vertical(|ui| {
                            ui.set_width(COLUMN + 16.0);
                            for card in column {
                                let result = match card {
                                    CharacterSection::Identity => identity(ui, &mut cx, &mut value),
                                    CharacterSection::Stats => generic(
                                        ui,
                                        &mut cx,
                                        root,
                                        &mut value,
                                        &[("stats", "Stats"), ("effects", "Effects")],
                                    ),
                                    CharacterSection::Bag => bag(ui, &mut cx, &mut value),
                                    CharacterSection::Equipment => {
                                        equipment(ui, &mut cx, &mut value)
                                    }
                                    CharacterSection::Start => start(
                                        ui,
                                        &mut cx,
                                        &mut value,
                                        key,
                                        &mut views.area,
                                        &mut pick,
                                        project.generation,
                                    ),
                                    CharacterSection::AreasKnown => {
                                        areas_known(ui, &mut cx, &mut value)
                                    }
                                    CharacterSection::Quests => quests(
                                        ui,
                                        &mut cx,
                                        &mut value,
                                        &mut views.character,
                                        &mut label,
                                    ),
                                    CharacterSection::Memories => {
                                        memories(ui, &mut cx, &mut value, &mut views.character)
                                    }
                                    CharacterSection::LinesHeard => generic(
                                        ui,
                                        &mut cx,
                                        root,
                                        &mut value,
                                        &[("lines_heard", "Lines heard")],
                                    ),
                                    CharacterSection::Shops => generic(
                                        ui,
                                        &mut cx,
                                        root,
                                        &mut value,
                                        &[("shops", "Shops")],
                                    ),
                                    CharacterSection::History => generic(
                                        ui,
                                        &mut cx,
                                        root,
                                        &mut value,
                                        &[("history", "History")],
                                    ),
                                };
                                changed |= result;
                                ui.add_space(8.0);
                            }
                        });
                        ui.add_space(16.0);
                    }
                });
            });
        });
    });
    editor.status.left.push(format!(
        "test character {key} › {}",
        section.label().to_lowercase()
    ));
    editor.status.left.push(match section {
        CharacterSection::Quests => {
            "Set up for… fills bag, counts, memories and start in one step".to_owned()
        }
        CharacterSection::Start => {
            "the start is where Play puts the character; Play here overrides it once".to_owned()
        }
        CharacterSection::Bag => "counts stop at each item's stack size".to_owned(),
        _ => "every section is what the server keeps for a player".to_owned(),
    });
    if let Some(request) = pick {
        if let Some(area) = request.area.clone() {
            editor.open_tab(EditorTab::Area { key: area });
        }
        editor.pick = Some(request);
    }
    if changed.is_some() {
        let mut edit = ContentEdit::new(label);
        edit.write_json(&file, &value);
        editor.apply(edit);
    }
    for action in actions {
        inspector::act(editor, action, TABLE, key);
    }
    if let Some(other) = switch {
        editor.select(RowSelection::row(TABLE, &other));
        editor.open_tab(EditorTab::for_row(TABLE, &other));
    }
}

fn identity(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut changed = FormChange::default();
    let jobs: Vec<String> = cx.files.keys_of("job").map(str::to_owned).collect();
    let xp = value["xp"].as_u64().unwrap_or(0) as u32;
    let level = level_of(cx, value.text("job"), xp);
    card(ui, "player", "Identity", |ui| {
        widgets::kv(ui, "name", |ui| {
            changed |= forms::text(ui, cx, &mut value["name"], "/name");
        });
        widgets::kv(ui, "job", |ui| {
            let current = value.text("job").to_owned();
            let mut picked = current.clone();
            widgets::combo_box("character-job")
                .width(ui.available_width() - 8.0)
                .selected_text(theme::mono(&current).size(13.0))
                .show_ui(ui, |ui| {
                    for job in &jobs {
                        ui.selectable_value(&mut picked, job.clone(), job);
                    }
                });
            if picked != current {
                value["job"] = Value::String(picked);
                changed = FormChange::at("/job");
            }
        });
        widgets::kv(ui, "xp", |ui| {
            let mut draft = xp;
            let response = forms::boxed_input(ui, Some(&format!("level {level}")), |ui| {
                ui.add(egui::DragValue::new(&mut draft).speed(1.0))
            });
            if response.changed() && draft != xp {
                value["xp"] = Value::from(draft);
                changed = FormChange::at("/xp");
            }
        });
    });
    changed
}

fn generic(
    ui: &mut Ui,
    cx: &mut FormCx,
    root: &Value,
    value: &mut Value,
    fields: &[(&str, &str)],
) -> FormChange {
    let mut changed = FormChange::default();
    for (field, title) in fields {
        let Some(schema) = schema::properties(root)
            .into_iter()
            .find(|(name, _)| name == field)
            .map(|(_, schema)| schema)
        else {
            continue;
        };
        card(ui, "player", title, |ui| {
            if value.get(*field).is_none_or(Value::is_null) {
                value[*field] = schema::template(cx.root, schema);
            }
            changed |= forms::value(ui, cx, schema, &mut value[*field], &format!("/{field}"));
        });
    }
    changed
}

fn bag(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut changed = FormChange::default();
    if !value["bag"].is_array() {
        value["bag"] = Value::Array(Vec::new());
    }
    let items: Vec<String> = cx.files.keys_of("item").map(str::to_owned).collect();
    let count = value["bag"].as_array().map_or(0, Vec::len);
    let mut remove = None;
    card(ui, "item", "Bag", |ui| {
        for index in 0..count {
            let path = format!("/bag/{index}");
            let stack = &mut value["bag"][index];
            let item_key = stack.text("item").to_owned();
            let cap = stack_max(cx, &item_key);
            ui.horizontal(|ui| {
                if ui
                    .add(egui::Label::new(theme::faint("×")).sense(egui::Sense::click()))
                    .on_hover_text("Remove")
                    .clicked()
                {
                    remove = Some(index);
                }
                let mut key = item_key.clone();
                ui.scope(|ui| {
                    ui.set_width(200.0);
                    if picker::row(ui, cx, "item", &mut key, &format!("{path}/item")) {
                        stack["item"] = Value::String(key);
                        changed = FormChange::at(&path);
                    }
                });
                let held = stack["count"].as_u64().unwrap_or(1) as u32;
                let mut draft = held;
                let response =
                    forms::boxed_input(ui, cap.map(|cap| format!("/{cap}")).as_deref(), |ui| {
                        ui.add(
                            egui::DragValue::new(&mut draft)
                                .speed(0.2)
                                .range(1..=cap.unwrap_or(999)),
                        )
                    });
                if response.changed() && draft != held {
                    stack["count"] = Value::from(draft);
                    changed = FormChange::at(&path);
                }
            });
        }
        if count == 0 {
            ui.label(theme::muted("empty").size(13.0));
        }
        if ui.button("+ item").clicked()
            && let Some(first) = items.first()
            && let Some(list) = value["bag"].as_array_mut()
        {
            list.push(serde_json::json!({ "item": first, "count": 1 }));
            changed = FormChange::at("/bag");
        }
    });
    if let Some(index) = remove
        && let Some(list) = value["bag"].as_array_mut()
    {
        list.remove(index);
        changed = FormChange::at("/bag");
    }
    changed
}

fn equipment(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut changed = FormChange::default();
    let slots = ["weapon", "offhand", "head"];
    let fitting: BTreeMap<&str, Vec<String>> = slots
        .iter()
        .map(|slot| {
            let items = cx
                .files
                .keys_of("item")
                .filter_map(|key| {
                    let row = cx.files.json(&row_file("item", key))?;
                    (row["kind"]["type"] == "equipment"
                        && row["kind"]["slot"].as_str() == Some(slot))
                    .then(|| key.to_owned())
                })
                .collect();
            (*slot, items)
        })
        .collect();
    card(ui, "equipment", "Equipment", |ui| {
        for slot in slots {
            let current = value["equipment"][slot].as_str().map(str::to_owned);
            widgets::kv(ui, slot, |ui| {
                let mut picked = current.clone();
                widgets::combo_box(("equipment", slot))
                    .width(ui.available_width() - 8.0)
                    .selected_text(match &current {
                        Some(item) => theme::mono(format!("item/ {item}")).size(13.0),
                        None => theme::muted("empty").size(13.0),
                    })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut picked, None, "empty");
                        for item in fitting.get(slot).into_iter().flatten() {
                            ui.selectable_value(&mut picked, Some(item.clone()), item);
                        }
                    });
                if picked != current {
                    if !value["equipment"].is_object() {
                        value["equipment"] = Value::Object(Map::new());
                    }
                    match picked {
                        Some(item) => value["equipment"][slot] = Value::String(item),
                        None => {
                            value["equipment"].remove_field(slot);
                        }
                    }
                    if value["equipment"].as_object().is_some_and(Map::is_empty) {
                        value.remove_field("equipment");
                    }
                    changed = FormChange::at("/equipment");
                }
            });
        }
        ui.label(theme::faint("each slot offers only the items made for it").size(12.0));
    });
    changed
}

fn start(
    ui: &mut Ui,
    cx: &mut FormCx,
    value: &mut Value,
    key: &str,
    area: &mut AreaViews,
    pick: &mut Option<PlacePick>,
    generation: u64,
) -> FormChange {
    let mut changed = FormChange::default();
    let scene_key = format!("character:{key}");
    let file = row_file(TABLE, key);
    let texture = area
        .scenes
        .by_key
        .get(&scene_key)
        .map(|scene| (scene.texture, scene.uv()));
    let spawn = cx.content.map(|content| {
        let place = &content.built::<GameSettings>().initial_spawn;
        (place.area.key(&content).to_owned(), place.at)
    });
    let at_spawn = value["start"].as_str() == Some("initial_spawn");
    let (area_key, at) = if at_spawn {
        spawn.clone().unwrap_or_default()
    } else {
        (
            value["start"].text("area").to_owned(),
            Pos::new(
                value["start"]["x"].as_f64().unwrap_or(0.0) as f32,
                value["start"]["y"].as_f64().unwrap_or(0.0) as f32,
            ),
        )
    };
    card(ui, "player", "Start", |ui| {
        widgets::kv(ui, "area", |ui| {
            if at_spawn {
                ui.label(theme::mono(format!("area/ {area_key}")).size(13.0));
                ui.label(theme::faint("· the initial spawn").size(12.0));
            } else {
                let mut draft = area_key.clone();
                if picker::row(ui, cx, "area", &mut draft, "/start/area") {
                    value["start"]["area"] = Value::String(draft);
                    changed = FormChange::at("/start");
                }
            }
        });
        widgets::kv(ui, "at", |ui| {
            if at_spawn {
                ui.label(theme::mono(format!("{}, {}", at.x, at.y)).size(13.0));
                ui.label(theme::faint("tiles").size(12.0));
            } else {
                let (mut x, mut y) = (at.x, at.y);
                let response = forms::boxed_input(ui, Some("tiles"), |ui| {
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                        let a = ui.add(egui::DragValue::new(&mut x).speed(0.5).fixed_decimals(1));
                        ui.label(theme::faint(","));
                        let b = ui.add(egui::DragValue::new(&mut y).speed(0.5).fixed_decimals(1));
                        a | b
                    })
                    .inner
                });
                if response.changed() && (x != at.x || y != at.y) {
                    value["start"]["x"] = Value::from(x as f64);
                    value["start"]["y"] = Value::from(y as f64);
                    changed = FormChange::at("/start");
                }
            }
        });
        if let Some(content) = cx.content
            && let Some(area_id) = content.by_key::<AreaDef>(&area_key)
        {
            let size = area::load(&content, area_id).size;
            let (rect, _) = ui.allocate_exact_size(MAP, egui::Sense::hover());
            let ppp = ui.ctx().pixels_per_point();
            let px_per_tile = 8.0;
            let center = Pos::new(
                at.x.clamp(
                    MAP.x / px_per_tile / 2.0,
                    size.width - MAP.x / px_per_tile / 2.0,
                ),
                at.y.clamp(
                    MAP.y / px_per_tile / 2.0,
                    size.height - MAP.y / px_per_tile / 2.0,
                ),
            );
            area.requests.push(AreaSceneRequest {
                key: scene_key.clone(),
                spec: AreaSceneSpec {
                    ground: area_key.clone(),
                    scenery: SceneryOf::Area,
                    hidden_ground: Vec::new(),
                    show_blueprints: true,
                    show_scenery: true,
                },
                width: (MAP.x * ppp) as u32,
                height: (MAP.y * ppp) as u32,
                center,
                zoom: px_per_tile / super::area::TILE_PX * ppp,
                generation,
                live: true,
            });
            ui.painter().rect_filled(rect, 4.0, theme::INPUT);
            if let Some((texture, uv)) = texture {
                ui.painter().image(texture, rect, uv, egui::Color32::WHITE);
            }
            let marker = rect.center()
                + egui::vec2(
                    (at.x - center.x) * px_per_tile,
                    (at.y - center.y) * px_per_tile,
                );
            ui.painter().circle(
                marker,
                4.0,
                theme::WARN,
                egui::Stroke::new(1.5, egui::Color32::BLACK),
            );
            ui.painter().rect_stroke(
                rect,
                4.0,
                egui::Stroke::new(1.0, theme::BORDER),
                egui::StrokeKind::Outside,
            );
        }
        ui.horizontal(|ui| {
            if ui.button("📍 Pick on the map").clicked() {
                if at_spawn {
                    value["start"] = serde_json::json!({ "area": area_key, "x": at.x, "y": at.y });
                    changed = FormChange::at("/start");
                }
                *pick = Some(PlacePick {
                    file: file.clone(),
                    pointer: "/start".to_owned(),
                    area: Some(area_key.clone()),
                });
            }
            if ui
                .add_enabled(!at_spawn, egui::Button::new("Use the initial spawn"))
                .clicked()
            {
                value["start"] = Value::String("initial_spawn".to_owned());
                changed = FormChange::at("/start");
            }
        });
    });
    changed
}

fn areas_known(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut changed = FormChange::default();
    let known: Vec<String> = value["known_areas"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect();
    let all: Vec<String> = cx
        .files
        .keys_of("area")
        .map(str::to_owned)
        .filter(|key| !known.contains(key))
        .collect();
    let mut remove: Option<String> = None;
    let mut add: Option<String> = None;
    card(ui, "area", "Areas known", |ui| {
        ui.horizontal_wrapped(|ui| {
            for area in &known {
                let (_, closed) = widgets::chip_closable(ui, &format!("area/{area}"));
                if closed {
                    remove = Some(area.clone());
                }
            }
            if known.is_empty() {
                ui.label(
                    theme::muted("only the start's area · the map shows nothing else").size(13.0),
                );
            }
        });
        let response = ui.button("+ area");
        egui::Popup::from_toggle_button_response(&response).show(|ui| {
            egui::ScrollArea::vertical()
                .max_height(240.0)
                .show(ui, |ui| {
                    for area in &all {
                        if ui
                            .selectable_label(false, theme::mono(area).size(12.5))
                            .clicked()
                        {
                            add = Some(area.clone());
                        }
                    }
                });
        });
    });
    if remove.is_some() || add.is_some() {
        let mut list: Vec<Value> = known
            .iter()
            .filter(|area| remove.as_ref() != Some(area))
            .map(|area| Value::String(area.clone()))
            .collect();
        if let Some(area) = add {
            list.push(Value::String(area));
        }
        if list.is_empty() {
            value.remove_field("known_areas");
        } else {
            value["known_areas"] = Value::Array(list);
        }
        changed = FormChange::at("/known_areas");
    }
    changed
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Standing {
    NotTaken,
    Active,
    Completed,
    Failed,
}

impl Standing {
    pub const ALL: [Standing; 4] = [
        Standing::NotTaken,
        Standing::Active,
        Standing::Completed,
        Standing::Failed,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Standing::NotTaken => "not taken",
            Standing::Active => "in progress",
            Standing::Completed => "completed",
            Standing::Failed => "failed",
        }
    }

    pub fn of_log(log: &QuestLog, quest: QuestId) -> Standing {
        if log.active(quest).is_some() {
            return Standing::Active;
        }
        match log.finished(quest).map(|finished| finished.result) {
            Some(QuestResult::Completed) => Standing::Completed,
            Some(QuestResult::Failed) => Standing::Failed,
            None => Standing::NotTaken,
        }
    }

    fn of(state: Option<&str>) -> Standing {
        match state {
            Some("active") => Standing::Active,
            Some("completed") => Standing::Completed,
            Some("failed") => Standing::Failed,
            _ => Standing::NotTaken,
        }
    }

    fn state(self) -> Option<&'static str> {
        match self {
            Standing::NotTaken => None,
            Standing::Active => Some("active"),
            Standing::Completed => Some("completed"),
            Standing::Failed => Some("failed"),
        }
    }
}

struct ObjectiveLine {
    label: String,
    subject: String,
    held: Option<String>,
    max: u32,
}

fn objectives_of(cx: &FormCx, quest: &str) -> Vec<ObjectiveLine> {
    let Some(content) = cx.content else {
        return Vec::new();
    };
    let Some(id) = content.by_key::<QuestDef>(quest) else {
        return Vec::new();
    };
    id.get(&content)
        .objectives()
        .map(|objective| match objective {
            Objective::Hold(stack) => {
                let item = stack.item.key(&content).to_owned();
                ObjectiveLine {
                    label: format!("hold {item}"),
                    subject: item.clone(),
                    held: Some(item),
                    max: stack.count,
                }
            }
            Objective::Defeat { npc, count } => {
                let npc = npc.key(&content).to_owned();
                ObjectiveLine {
                    label: format!("defeat {npc}"),
                    subject: npc,
                    held: None,
                    max: *count,
                }
            }
            Objective::Task { label, .. } | Objective::Decide { label, .. } => ObjectiveLine {
                label: label.clone(),
                subject: label.clone(),
                held: None,
                max: 1,
            },
            Objective::Deliver { item } => {
                let item = item.key(&content).to_owned();
                ObjectiveLine {
                    label: format!("deliver {item}"),
                    subject: item,
                    held: None,
                    max: 1,
                }
            }
        })
        .collect()
}

fn quests(
    ui: &mut Ui,
    cx: &mut FormCx,
    value: &mut Value,
    view: &mut CharacterView,
    label: &mut String,
) -> FormChange {
    let mut changed = FormChange::default();
    let all: Vec<String> = cx.files.keys_of("quest").map(str::to_owned).collect();
    let in_log: Vec<String> = value["quests"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|q| q["quest"].as_str().map(str::to_owned))
        .collect();
    let parties = cx
        .content
        .filter(|content| content.has_built::<RiftScripts>())
        .map(|content| Parties::of(&content, content.built::<RiftScripts>()));
    let mut order: Vec<String> = in_log.clone();
    let rest: Vec<String> = all
        .iter()
        .filter(|key| !in_log.contains(key))
        .cloned()
        .collect();
    let hidden = if view.more_quests {
        0
    } else {
        rest.len().saturating_sub(3)
    };
    order.extend(rest.iter().take(rest.len() - hidden).cloned());
    let mut setup: Option<(String, Moment)> = None;
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(COLUMN);
            widgets::section_count(ui, "Quests", all.len());
            for quest in &order {
                let entry_index = value["quests"]
                    .as_array()
                    .and_then(|list| list.iter().position(|q| q["quest"].as_str() == Some(quest)));
                let standing =
                    Standing::of(entry_index.and_then(|i| value["quests"][i]["state"].as_str()));
                let giver = cx
                    .content
                    .zip(parties.as_ref())
                    .and_then(|(content, parties)| {
                        content
                            .by_key::<QuestDef>(quest)
                            .and_then(|id| parties.giver(id).map(|party| party.name.clone()))
                    });
                let requires = cx.files.json(&row_file("quest", quest)).and_then(|row| {
                    row["modules"].as_array().and_then(|modules| {
                        modules
                            .iter()
                            .find(|m| m["type"] == "requires")
                            .map(|m| condition::summary(&m["condition"]))
                    })
                });
                let subtitle = match standing {
                    Standing::NotTaken => requires
                        .map(|r| format!("needs {r}"))
                        .or_else(|| giver.clone().map(|g| format!("offered by {g}")))
                        .unwrap_or_default(),
                    _ => giver
                        .clone()
                        .map(|g| format!("from {g}"))
                        .unwrap_or_default(),
                };
                widgets::card_frame(standing == Standing::Active).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(theme::mono(quest).size(13.0));
                            if !subtitle.is_empty() {
                                ui.label(theme::faint(subtitle).size(12.0));
                            }
                        });
                        ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
                            let mut picked = standing;
                            widgets::combo_box(("quest-state", quest))
                                .selected_text(theme::mono(standing.label()).size(12.5))
                                .show_ui(ui, |ui| {
                                    for option in Standing::ALL {
                                        ui.selectable_value(&mut picked, option, option.label());
                                    }
                                });
                            if picked != standing {
                                set_standing(value, quest, picked);
                                changed = FormChange::at("/quests");
                            }
                        });
                    });
                    if standing == Standing::Active
                        && let Some(index) = entry_index
                    {
                        let objectives = objectives_of(cx, quest);
                        for (i, objective) in objectives.iter().enumerate() {
                            widgets::kv(ui, &objective.label, |ui| {
                                let held = value["quests"][index]["progress"][i]
                                    .as_u64()
                                    .unwrap_or(0) as u32;
                                let mut draft = held;
                                let response = forms::boxed_input(
                                    ui,
                                    Some(&format!("/ {}", objective.max)),
                                    |ui| {
                                        ui.add(
                                            egui::DragValue::new(&mut draft)
                                                .speed(0.2)
                                                .range(0..=objective.max),
                                        )
                                    },
                                );
                                if response.changed() && draft != held {
                                    let progress = value["quests"][index]["progress"]
                                        .as_array()
                                        .cloned()
                                        .unwrap_or_default();
                                    let mut progress: Vec<u32> = (0..objectives.len())
                                        .map(|j| {
                                            progress.get(j).and_then(Value::as_u64).unwrap_or(0)
                                                as u32
                                        })
                                        .collect();
                                    progress[i] = draft;
                                    value["quests"][index]["progress"] = Value::Array(
                                        progress.into_iter().map(Value::from).collect(),
                                    );
                                    changed = FormChange::at("/quests");
                                }
                            });
                        }
                    }
                });
            }
            if hidden > 0
                && ui
                    .add(
                        egui::Label::new(
                            theme::muted(format!("… {hidden} more not taken")).size(12.5),
                        )
                        .sense(egui::Sense::click()),
                    )
                    .clicked()
            {
                view.more_quests = true;
            }
            ui.add_space(6.0);
            let response = ui.add(
                egui::Button::new(RichText::new("Set up for… ▾").color(egui::Color32::WHITE))
                    .fill(theme::ACCENT)
                    .corner_radius(4.0),
            );
            egui::Popup::from_toggle_button_response(&response)
                .width(300.0)
                .show(|ui| {
                    egui::ScrollArea::vertical()
                        .max_height(420.0)
                        .show(ui, |ui| {
                            let subjects: Vec<String> = if in_log.is_empty() {
                                all.iter().take(3).cloned().collect()
                            } else {
                                in_log.clone()
                            };
                            for quest in &subjects {
                                widgets::section(ui, &format!("Set up for {quest}"));
                                let giver = giver_of(cx, parties.as_ref(), quest);
                                for moment in Moment::all(cx, quest) {
                                    let hint = moment.hint(
                                        cx,
                                        quest,
                                        giver.map(|party| party.name.as_str()),
                                    );
                                    let (rect, response) = ui.allocate_exact_size(
                                        egui::vec2(ui.available_width(), 36.0),
                                        egui::Sense::click(),
                                    );
                                    if response.hovered() {
                                        ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
                                    }
                                    ui.painter().text(
                                        rect.left_top() + egui::vec2(8.0, 4.0),
                                        egui::Align2::LEFT_TOP,
                                        moment.label(),
                                        egui::FontId::proportional(13.0),
                                        theme::TEXT,
                                    );
                                    ui.painter().text(
                                        rect.left_bottom() + egui::vec2(8.0, -4.0),
                                        egui::Align2::LEFT_BOTTOM,
                                        &hint,
                                        egui::FontId::proportional(11.5),
                                        theme::FAINT,
                                    );
                                    if response.clicked() {
                                        setup = Some((quest.clone(), moment));
                                        ui.close();
                                    }
                                }
                            }
                        });
                });
        });
    });
    if let Some((quest, moment)) = setup {
        *label = format!(
            "Set up {} for {quest} · {}",
            cx.owner_key.clone().unwrap_or_default(),
            moment.label()
        );
        apply_moment(cx, value, &quest, moment, parties.as_ref());
        changed = FormChange::at("/quests");
    }
    changed
}

fn giver_of<'p>(cx: &FormCx, parties: Option<&'p Parties>, quest: &str) -> Option<&'p Party> {
    let content = cx.content?;
    let id = content.by_key::<QuestDef>(quest)?;
    parties?.giver(id)
}

fn set_standing(value: &mut Value, quest: &str, standing: Standing) {
    if !value["quests"].is_array() {
        value["quests"] = Value::Array(Vec::new());
    }
    let list = value["quests"].as_array_mut().expect("quests");
    list.retain(|q| q["quest"].as_str() != Some(quest));
    if let Some(state) = standing.state() {
        list.push(serde_json::json!({ "quest": quest, "state": state }));
    }
    if list.is_empty() {
        value.remove_field("quests");
    }
}

#[derive(Clone, PartialEq, Eq)]
enum Moment {
    JustOffered,
    ObjectivesMet,
    Decided(String),
    ReadyToHandIn,
    Completed,
    Failed,
}

impl Moment {
    fn all(cx: &FormCx, quest: &str) -> Vec<Moment> {
        let mut moments = vec![Moment::JustOffered, Moment::ObjectivesMet];
        if let Some(content) = cx.content
            && let Some(id) = content.by_key::<QuestDef>(quest)
        {
            for objective in id.get(&content).objectives() {
                if let Objective::Decide { paths, .. } = objective {
                    moments.extend(
                        paths
                            .iter()
                            .map(|path| Moment::Decided(path.choice.clone())),
                    );
                }
            }
        }
        moments.extend([Moment::ReadyToHandIn, Moment::Completed, Moment::Failed]);
        moments
    }

    fn label(&self) -> String {
        match self {
            Moment::JustOffered => "just offered".to_owned(),
            Moment::ObjectivesMet => "objectives met".to_owned(),
            Moment::Decided(choice) => format!("decided: {choice}"),
            Moment::ReadyToHandIn => "ready to hand in".to_owned(),
            Moment::Completed => "completed".to_owned(),
            Moment::Failed => "failed".to_owned(),
        }
    }

    fn hint(&self, cx: &FormCx, quest: &str, giver: Option<&str>) -> String {
        let by = giver
            .map(|g| format!("standing by {g}"))
            .unwrap_or_else(|| "at its start".to_owned());
        let done: Vec<String> = objectives_of(cx, quest)
            .iter()
            .filter(|o| o.max > 0)
            .map(|o| format!("{} {}", o.max, o.subject))
            .collect();
        match self {
            Moment::JustOffered => format!("{by}, quest not taken"),
            Moment::ObjectivesMet => {
                if done.is_empty() {
                    "taken, every count full".to_owned()
                } else {
                    format!("taken, {} done", done.join(", "))
                }
            }
            Moment::Decided(choice) => format!("every count full, {choice} chosen"),
            Moment::ReadyToHandIn => format!("every count full, {by}"),
            Moment::Completed => "done and rewarded".to_owned(),
            Moment::Failed => "failed, in the log as such".to_owned(),
        }
    }
}

fn apply_moment(
    cx: &FormCx,
    value: &mut Value,
    quest: &str,
    moment: Moment,
    parties: Option<&Parties>,
) {
    let objectives = objectives_of(cx, quest);
    let giver_place = giver_of(cx, parties, quest).and_then(|party| npc_place(cx, party.npc?));
    match &moment {
        Moment::JustOffered => set_standing(value, quest, Standing::NotTaken),
        Moment::ObjectivesMet | Moment::ReadyToHandIn | Moment::Decided(_) => {
            set_standing(value, quest, Standing::Active);
            if let Some(entry) = value["quests"]
                .as_array_mut()
                .and_then(|list| list.iter_mut().find(|q| q["quest"].as_str() == Some(quest)))
            {
                entry["progress"] =
                    Value::Array(objectives.iter().map(|o| Value::from(o.max)).collect());
                if let Moment::Decided(choice) = &moment {
                    entry["decided"] = Value::String(choice.clone());
                }
            }
            for objective in &objectives {
                if let Some(item) = &objective.held {
                    give(value, item, objective.max);
                }
            }
        }
        Moment::Completed => set_standing(value, quest, Standing::Completed),
        Moment::Failed => set_standing(value, quest, Standing::Failed),
    }
    if matches!(
        moment,
        Moment::JustOffered | Moment::ReadyToHandIn | Moment::Decided(_)
    ) && let Some((area, at)) = giver_place
    {
        value["start"] = serde_json::json!({ "area": area, "x": at.x, "y": at.y });
    }
}

fn give(value: &mut Value, item: &str, count: u32) {
    if !value["bag"].is_array() {
        value["bag"] = Value::Array(Vec::new());
    }
    let list = value["bag"].as_array_mut().expect("bag");
    match list
        .iter_mut()
        .find(|stack| stack["item"].as_str() == Some(item))
    {
        Some(stack) => {
            let held = stack["count"].as_u64().unwrap_or(1) as u32;
            stack["count"] = Value::from(held.max(count));
        }
        None => list.push(serde_json::json!({ "item": item, "count": count })),
    }
}

fn npc_place(cx: &FormCx, npc: NpcId) -> Option<(String, Pos<Tiles>)> {
    let content = cx.content?;
    content.ids::<AreaDef>().find_map(|area| {
        area::placed(&content, area)
            .iter()
            .find_map(|placed| match &placed.module {
                AreaModule::Resident(resident) if resident.npc == npc => {
                    Some((area.key(&content).to_owned(), resident.at))
                }
                _ => None,
            })
    })
}

fn memories(
    ui: &mut Ui,
    cx: &mut FormCx,
    value: &mut Value,
    view: &mut CharacterView,
) -> FormChange {
    let mut changed = FormChange::default();
    let defs: Vec<MemoryDef> = cx
        .files
        .keys_of("memory")
        .filter_map(|key| {
            let row = cx.files.json(&row_file("memory", key))?;
            Some(MemoryDef {
                key: key.to_owned(),
                ty: row.kind_or("boolean").to_owned(),
                label: row.text("label").to_owned(),
            })
        })
        .collect();
    let set: Vec<Value> = value["memories"].as_array().cloned().unwrap_or_default();
    let is_set = |def: &&MemoryDef| set.iter().any(|m| m["memory"].as_str() == Some(&def.key));
    let mut order: Vec<&MemoryDef> = defs.iter().filter(is_set).collect();
    order.extend(defs.iter().filter(|def| !is_set(def)));
    let mut updates: Vec<(String, Option<Value>)> = Vec::new();
    widgets::section_count(ui, "Memories", defs.len());
    let hidden = if view.more_memories {
        0
    } else {
        order.len().saturating_sub(6)
    };
    egui::Grid::new("memories")
        .num_columns(4)
        .spacing([10.0, 6.0])
        .min_col_width(10.0)
        .show(ui, |ui| {
            ui.label(theme::faint("MEMORY").size(11.0).monospace());
            ui.label("");
            ui.label(theme::faint("LAST SET").size(11.0).monospace());
            ui.end_row();
            for MemoryDef { key, ty, label } in order.iter().take(order.len() - hidden) {
                let entry = set.iter().find(|m| m["memory"].as_str() == Some(key));
                ui.label(theme::mono(key).size(13.0)).on_hover_text(label);
                match ty.as_str() {
                    "boolean" => {
                        let mut on = entry.and_then(|m| m["value"].as_bool()).unwrap_or(false);
                        if widgets::toggle(ui, &mut on).changed() {
                            updates.push((key.clone(), Some(Value::Bool(on))));
                        }
                    }
                    "text" => {
                        let mut text = entry
                            .and_then(|m| m["value"].as_str())
                            .unwrap_or("")
                            .to_owned();
                        let response = ui.add(
                            egui::TextEdit::singleline(&mut text)
                                .desired_width(100.0)
                                .font(egui::TextStyle::Monospace),
                        );
                        if response.lost_focus() && response.changed() {
                            updates.push((key.clone(), Some(Value::String(text))));
                        }
                    }
                    _ => {
                        let held = entry.and_then(|m| m["value"].as_f64()).unwrap_or(0.0);
                        let mut draft = held;
                        let response = forms::boxed_input(ui, Some("times"), |ui| {
                            ui.add(
                                egui::DragValue::new(&mut draft)
                                    .speed(0.2)
                                    .fixed_decimals(if ty == "integer" { 0 } else { 1 }),
                            )
                        });
                        if response.changed() && draft != held {
                            updates.push((
                                key.clone(),
                                Some(if ty == "integer" {
                                    Value::from(draft as i64)
                                } else {
                                    Value::from(draft)
                                }),
                            ));
                        }
                    }
                }
                let ago = entry.and_then(|m| m["ago"].as_f64());
                ui.label(
                    theme::muted(ago.map_or_else(
                        || "never".to_owned(),
                        |seconds| widgets::ago(seconds as u64),
                    ))
                    .size(12.5)
                    .monospace(),
                );
                if entry.is_some()
                    && ui
                        .add(egui::Label::new(theme::faint("✕")).sense(egui::Sense::click()))
                        .on_hover_text("Unset")
                        .clicked()
                {
                    updates.push((key.clone(), None));
                }
                ui.end_row();
            }
        });
    if hidden > 0
        && ui
            .add(
                egui::Label::new(theme::muted(format!("… {hidden} more")).size(12.5))
                    .sense(egui::Sense::click()),
            )
            .clicked()
    {
        view.more_memories = true;
    }
    if !updates.is_empty() {
        let mut list = set.clone();
        for (key, update) in updates {
            list.retain(|m| m["memory"].as_str() != Some(&key));
            if let Some(new) = update {
                list.push(serde_json::json!({ "memory": key, "value": new, "ago": 0 }));
            }
        }
        if list.is_empty() {
            value.remove_field("memories");
        } else {
            value["memories"] = Value::Array(list);
        }
        changed = FormChange::at("/memories");
    }
    changed
}

struct MemoryDef {
    key: String,
    ty: String,
    label: String,
}

fn card(ui: &mut Ui, badge: &str, title: &str, body: impl FnOnce(&mut Ui)) {
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(COLUMN);
        widgets::card_title(ui, badge, title);
        body(ui);
    });
}

fn stack_max(cx: &FormCx, item: &str) -> Option<u32> {
    let row = cx.files.json(&row_file("item", item))?;
    row["modules"]
        .as_array()?
        .iter()
        .find(|m| m["type"] == "stack")
        .and_then(|m| m["max"].as_u64())
        .map(|max| max as u32)
}

pub fn level_of(cx: &FormCx, job: &str, xp: u32) -> u32 {
    let Some(content) = cx.content else {
        return 0;
    };
    content
        .by_key::<JobDef>(job)
        .map(|job| levels_reached(&job.get(&content).levels, xp))
        .unwrap_or(0)
}

fn levels_reached(tiers: &[JobLevel], xp: u32) -> u32 {
    tiers.iter().filter(|tier| tier.xp <= xp).count() as u32
}

pub fn preview_extras(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(TABLE, key) else {
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let xp = row["xp"].as_u64().unwrap_or(0) as u32;
    let job = row.text("job");
    let tiers = content
        .by_key::<JobDef>(job)
        .map(|id| id.get(&content).levels.clone())
        .unwrap_or_default();
    let level = levels_reached(&tiers, xp);
    let next = tiers
        .iter()
        .find(|tier| tier.xp > xp)
        .map(|tier| format!(" · {xp} of {} xp to {}", tier.xp, level + 1))
        .unwrap_or_else(|| format!(" · {xp} xp · top tier"));
    let settings = content.built::<GameSettings>();
    let base = settings.player.get(&content).stats.get(StatKind::MaxHealth);
    let from_tiers: f32 = tiers
        .iter()
        .filter(|tier| tier.xp <= xp)
        .map(|tier| tier.stats.get(StatKind::MaxHealth))
        .sum();
    let own = row["stats"]["max_health"].as_f64().map(|v| v as f32);
    let health = own.unwrap_or(base + from_tiers);
    let starts = match &row["start"] {
        Value::Object(place) => format!(
            "{} · {}, {}",
            place.text_or("area", "?"),
            place["x"].as_f64().unwrap_or(0.0),
            place["y"].as_f64().unwrap_or(0.0)
        ),
        _ => format!(
            "{} · the initial spawn",
            settings.initial_spawn.area.key(&content)
        ),
    };
    widgets::kv_text(ui, "level", format!("{level}{next}"));
    widgets::kv_text(ui, "health", format!("{} of {}", health, health));
    widgets::kv_text(ui, "starts", starts);
    widgets::kv_code(ui, "file", row_file(TABLE, key));
    ui.add_space(6.0);
    ui.horizontal(|ui| {
        if widgets::primary(ui, &format!("▸ Play as {key}")).clicked() {
            editor.play.character = Some(key.to_owned());
            editor.settings.last_play = Some(key.to_owned());
            play::start(editor, None);
        }
        if ui.button("⑂ Duplicate").clicked() {
            inspector::act(
                editor,
                FormAction::RowAction(BrowserAction::Duplicate),
                TABLE,
                key,
            );
        }
    });
}
