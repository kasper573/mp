use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

type OwnerSeed = (String, OwnerKind, String, OwnerRow, Option<Pos<Tiles>>);

use game::core::content::Content;
use game::core::math::{Pos, Size};
use game::core::script::{OwnerKind, OwnerRow};
use game::core::tiling::Tiles;
use game::systems::area::{self, AreaDef, AreaModule};
use game::systems::quest::QuestDef;
use game::systems::script::{Reach, RiftScripts};
use serde_json::Value;

use crate::project::{Files, row_file};
use crate::value::RowValue;

#[derive(Default)]
pub struct Atlas {
    pub areas: BTreeMap<String, AreaInfo>,
    pub warps: Vec<Warp>,
    pub spawn: String,
    pub distances: BTreeMap<String, u32>,
    pub owners: Vec<Owner>,
    pub quests: Vec<QuestInfo>,
    pub lines: Vec<QuestLine>,
    pub module_types: BTreeSet<String>,
}

pub struct AreaInfo {
    pub id: area::Id,
    pub name: String,
    pub size: Size<Tiles>,
    pub modules: BTreeSet<String>,
    pub text: String,
    pub npcs: Vec<(String, u32)>,
    pub residents: Vec<PlacedNpc>,
    pub populations: Vec<PlacedNpc>,
    pub doors: Vec<Door>,
}

#[derive(Clone)]
pub struct PlacedNpc {
    pub npc: String,
    pub at: Pos<Tiles>,
    pub count: u32,
}

#[derive(Clone)]
pub struct Door {
    pub at: Pos<Tiles>,
    pub to: String,
    pub label: String,
}

#[derive(Clone)]
pub struct Warp {
    pub from: String,
    pub to: String,
    pub at: Option<Pos<Tiles>>,
    pub landing: Pos<Tiles>,
    pub owner: String,
}

pub struct Owner {
    pub area: String,
    pub label: String,
    pub kind: OwnerKind,
    pub row_key: String,
    pub at: Option<Pos<Tiles>>,
    pub reaches: Vec<Reach>,
}

pub struct QuestInfo {
    pub key: String,
    pub title: String,
    pub category: String,
    pub steps: Vec<QuestStep>,
    pub after: Vec<QuestLink>,
    pub requires: Option<String>,
    pub giver: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuestLink {
    pub quest: String,
    pub how: LinkHow,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LinkHow {
    Done,
    During,
    Memory(String),
    Failed,
}

#[derive(Clone)]
pub struct QuestStep {
    pub label: String,
    pub areas: Vec<String>,
    pub who: Option<String>,
}

pub struct QuestLine {
    pub category: String,
    pub quests: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Source {
    pub kind: &'static str,
    pub label: String,
}

impl Atlas {
    pub fn build(content: Content, files: &Files) -> Atlas {
        let mut atlas = Atlas::default();
        let scripts = content
            .has_built::<RiftScripts>()
            .then(|| content.built::<RiftScripts>());
        atlas.spawn = content
            .built::<game::systems::GameSettings>()
            .spawn
            .area
            .key(&content)
            .to_owned();
        for id in content.ids::<AreaDef>() {
            let key = id.key(&content).to_owned();
            let def = id.get(&content);
            let loaded = area::load(&content, id);
            let row = files
                .json_owned(&row_file("area", &key))
                .unwrap_or(Value::Null);
            let mut modules: BTreeSet<String> = module_types(&row);
            let mut text = row.to_string().to_lowercase();
            let placed = area::placed(&content, id);
            let mut npcs: BTreeMap<String, u32> = BTreeMap::new();
            let mut residents = Vec::new();
            let mut populations = Vec::new();
            for placement in area::placements(&content, id) {
                let blueprint = placement.blueprint.key(&content);
                if let Some(blueprint_row) = files.json(&row_file("blueprint", blueprint)) {
                    modules.extend(module_types(&blueprint_row));
                    text.push(' ');
                    text.push_str(&blueprint_row.to_string().to_lowercase());
                }
            }
            for flattened in placed {
                match &flattened.module {
                    AreaModule::Resident(resident) => {
                        let npc = resident.npc.key(&content).to_owned();
                        *npcs.entry(npc.clone()).or_default() += 1;
                        residents.push(PlacedNpc {
                            npc,
                            at: resident.at,
                            count: 1,
                        });
                    }
                    AreaModule::Population(population) => {
                        let npc = population.npc.key(&content).to_owned();
                        *npcs.entry(npc.clone()).or_default() += population.count;
                        populations.push(PlacedNpc {
                            npc,
                            at: population.roams.map(|r| r.center()).unwrap_or_else(|| {
                                Pos::new(loaded.size.width / 2.0, loaded.size.height / 2.0)
                            }),
                            count: population.count,
                        });
                    }
                    _ => {}
                }
            }
            atlas.module_types.extend(modules.iter().cloned());
            atlas.areas.insert(
                key.clone(),
                AreaInfo {
                    id,
                    name: def.name.clone(),
                    size: loaded.size,
                    modules,
                    text,
                    npcs: npcs.into_iter().collect(),
                    residents,
                    populations,
                    doors: Vec::new(),
                },
            );
            let Some(scripts) = scripts else {
                continue;
            };
            let mut owners: Vec<OwnerSeed> = Vec::new();
            owners.push((
                format!("area/{key}"),
                OwnerKind::Area,
                key.clone(),
                OwnerRow {
                    kind: OwnerKind::Area,
                    row: id.raw(),
                    object: None,
                },
                None,
            ));
            for (index, object) in area::objects(placed) {
                let name = object
                    .name
                    .clone()
                    .or_else(|| object.label.clone())
                    .unwrap_or_else(|| format!("object {index}"));
                let at = match object.shape {
                    area::ObjectShape::Point(p) => p,
                    area::ObjectShape::Rect(r) => r.center(),
                };
                owners.push((
                    format!("area/{key} › {name}"),
                    OwnerKind::Object,
                    key.clone(),
                    OwnerRow {
                        kind: OwnerKind::Object,
                        row: id.raw(),
                        object: Some(index),
                    },
                    Some(at),
                ));
            }
            for (ordinal, placement) in area::placements(&content, id).iter().enumerate() {
                if placement.scripts.is_empty() {
                    continue;
                }
                let blueprint = placement.blueprint.key(&content);
                owners.push((
                    format!("blueprint/{blueprint} in {key} {ordinal}"),
                    OwnerKind::Blueprint,
                    blueprint.to_owned(),
                    OwnerRow {
                        kind: OwnerKind::Blueprint,
                        row: id.raw(),
                        object: Some(ordinal as u32),
                    },
                    Some(placement.at),
                ));
            }
            let mut seen_npcs: BTreeSet<String> = BTreeSet::new();
            for flattened in placed {
                let (npc, at) = match &flattened.module {
                    AreaModule::Resident(resident) => (resident.npc, Some(resident.at)),
                    AreaModule::Population(population) => {
                        (population.npc, population.roams.map(|r| r.center()))
                    }
                    _ => continue,
                };
                let npc_key = npc.key(&content).to_owned();
                if !seen_npcs.insert(npc_key.clone()) {
                    continue;
                }
                owners.push((
                    format!("npc/{npc_key}"),
                    OwnerKind::Npc,
                    npc_key,
                    OwnerRow {
                        kind: OwnerKind::Npc,
                        row: npc.raw(),
                        object: None,
                    },
                    at,
                ));
            }
            for (label, kind, row_key, row, at) in owners {
                let may = scripts.may_do(row);
                for reach in &may.reaches {
                    if let Reach::Warp(place) = reach {
                        let to = place.area.key(&content).to_owned();
                        atlas.warps.push(Warp {
                            from: key.clone(),
                            to: to.clone(),
                            at,
                            landing: place.at,
                            owner: label.clone(),
                        });
                        if let (Some(at), Some(info)) = (at, atlas.areas.get_mut(&key)) {
                            info.doors.push(Door {
                                at,
                                to,
                                label: label.clone(),
                            });
                        }
                    }
                }
                atlas.owners.push(Owner {
                    area: key.clone(),
                    label,
                    kind,
                    row_key,
                    at,
                    reaches: may.reaches,
                });
            }
        }
        atlas.distances = atlas.distances_from(&atlas.spawn);
        atlas.build_quests(content, files);
        atlas
    }

    pub fn neighbours(&self, from: &str) -> Vec<&str> {
        let mut out: Vec<&str> = self
            .warps
            .iter()
            .filter(|warp| warp.from == from)
            .map(|warp| warp.to.as_str())
            .collect();
        out.sort();
        out.dedup();
        out
    }

    pub fn distances_from(&self, start: &str) -> BTreeMap<String, u32> {
        let mut distances = BTreeMap::new();
        if !self.areas.contains_key(start) {
            return distances;
        }
        let mut queue = VecDeque::new();
        distances.insert(start.to_owned(), 0);
        queue.push_back(start.to_owned());
        while let Some(current) = queue.pop_front() {
            let here = distances[&current];
            for next in self.neighbours(&current) {
                if !distances.contains_key(next) {
                    distances.insert(next.to_owned(), here + 1);
                    queue.push_back(next.to_owned());
                }
            }
        }
        distances
    }

    pub fn route(&self, from: &str, to: &str) -> Option<Vec<Warp>> {
        let mut previous: HashMap<String, Warp> = HashMap::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut queue = VecDeque::new();
        seen.insert(from.to_owned());
        queue.push_back(from.to_owned());
        while let Some(current) = queue.pop_front() {
            if current == to {
                let mut path = Vec::new();
                let mut at = current.clone();
                while at != from {
                    let step = previous[&at].clone();
                    at = step.from.clone();
                    path.push(step);
                }
                path.reverse();
                return Some(path);
            }
            let mut outgoing: Vec<&Warp> = self
                .warps
                .iter()
                .filter(|warp| warp.from == current)
                .collect();
            outgoing.sort_by(|a, b| a.to.cmp(&b.to).then(a.owner.cmp(&b.owner)));
            for warp in outgoing {
                if seen.insert(warp.to.clone()) {
                    previous.insert(warp.to.clone(), warp.clone());
                    queue.push_back(warp.to.clone());
                }
            }
        }
        None
    }

    pub fn hostile(&self, npc: &str) -> bool {
        self.owners.iter().any(|owner| {
            owner.kind == OwnerKind::Npc
                && owner.row_key == npc
                && owner.reaches.contains(&Reach::Hostile)
        })
    }

    pub fn givers(&self, area: &str) -> Vec<&Owner> {
        self.owners
            .iter()
            .filter(|owner| {
                owner.area == area
                    && owner
                        .reaches
                        .iter()
                        .any(|reach| matches!(reach, Reach::Offers(_) | Reach::Accepts(_)))
            })
            .collect()
    }

    pub fn warps_between(&self, from: &str, to: &str) -> usize {
        self.warps
            .iter()
            .filter(|warp| warp.from == from && warp.to == to)
            .count()
    }

    pub fn both_ways(&self, from: &str, to: &str) -> bool {
        self.warps
            .iter()
            .any(|warp| warp.from == to && warp.to == from)
    }

    pub fn sources(
        &self,
        content: Content,
        files: &Files,
        area: &str,
        table: &str,
        key: &str,
    ) -> Vec<Source> {
        let mut out = Vec::new();
        let Some(info) = self.areas.get(area) else {
            return out;
        };
        let owners = self.owners.iter().filter(|owner| owner.area == area);
        let source = |kind: &'static str, label: String| Source { kind, label };
        match table {
            "area" => {
                if area == key {
                    out.push(source("area", "this area".to_owned()));
                }
                for warp in self
                    .warps
                    .iter()
                    .filter(|warp| warp.to == key && warp.from == area)
                {
                    out.push(source("warp", format!("{} warps there", warp.owner)));
                }
            }
            "npc" => {
                for (npc, count) in &info.npcs {
                    if npc == key {
                        out.push(source("placed", format!("{count} placed")));
                    }
                }
                for owner in owners {
                    if owner.reaches.iter().any(
                        |reach| matches!(reach, Reach::Spawns(npc) if npc.key(&content) == key),
                    ) {
                        out.push(source("script", format!("{} spawns it", owner.label)));
                    }
                }
            }
            "item" => {
                for (npc, _) in &info.npcs {
                    if let Some(row) = files.json(&row_file("npc", npc))
                        && loot_names(&row, key)
                    {
                        out.push(source("drop", format!("{npc} drops it")));
                    }
                }
                for owner in owners {
                    for reach in &owner.reaches {
                        match reach {
                            Reach::Gives(item) | Reach::Drops(item)
                                if item.key(&content) == key =>
                            {
                                out.push(source("script", format!("{} gives it", owner.label)));
                            }
                            Reach::OpensShop(shop) => {
                                let shop_key = shop.key(&content);
                                if files
                                    .json(&row_file("shop", shop_key))
                                    .is_some_and(|row| mentions(&row, key))
                                {
                                    out.push(source("shop", format!("{shop_key} sells it")));
                                }
                            }
                            Reach::Offers(quest) | Reach::TurnsIn(quest) => {
                                let quest_key = quest.key(&content);
                                if files
                                    .json(&row_file("quest", quest_key))
                                    .is_some_and(|row| mentions(&row, key))
                                {
                                    out.push(source(
                                        "quest",
                                        format!("{quest_key} at {}", owner.label),
                                    ));
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            "quest" => {
                for owner in owners {
                    for reach in &owner.reaches {
                        let (verb, quest) = match reach {
                            Reach::Offers(quest) => ("offers", quest),
                            Reach::Accepts(quest) => ("accepts", quest),
                            Reach::TurnsIn(quest) => ("turns in", quest),
                            Reach::Fails(quest) => ("fails", quest),
                            Reach::Completes(quest) => ("completes a task of", quest),
                            _ => continue,
                        };
                        if quest.key(&content) == key {
                            out.push(source(verb, format!("{} {verb} it", owner.label)));
                        }
                    }
                }
            }
            "shop" => {
                for owner in owners {
                    if owner.reaches.iter().any(|reach| matches!(reach, Reach::OpensShop(shop) if shop.key(&content) == key)) {
                        out.push(source("shop", format!("{} opens it", owner.label)));
                    }
                }
            }
            "memory" => {
                for owner in owners {
                    if owner.reaches.iter().any(|reach| matches!(reach, Reach::Remembers(memory) if memory.key(&content) == key)) {
                        out.push(source("remembers", format!("{} remembers it", owner.label)));
                    }
                }
                if info.text.contains(&format!("\"{}\"", key.to_lowercase())) {
                    out.push(source("reads", "a condition reads it".to_owned()));
                }
            }
            "script" => {
                for owner in owners {
                    if owner.kind == OwnerKind::Npc {
                        if files
                            .json(&row_file("npc", &owner.row_key))
                            .is_some_and(|row| mentions(&row, key))
                        {
                            out.push(source("script", format!("{} runs it", owner.label)));
                        }
                    } else if info.text.contains(&format!("\"{}\"", key.to_lowercase()))
                        && owner.kind == OwnerKind::Area
                    {
                        out.push(source("script", "a module here runs it".to_owned()));
                    }
                }
            }
            _ => {
                if info.text.contains(&format!("\"{}\"", key.to_lowercase())) {
                    out.push(source(table_kind(table), format!("named in {area}")));
                }
            }
        }
        out.sort();
        out.dedup();
        out
    }

    fn build_quests(&mut self, content: Content, files: &Files) {
        let mut quests: Vec<QuestInfo> = Vec::new();
        for id in content.ids::<QuestDef>() {
            let key = id.key(&content).to_owned();
            let def = id.get(&content);
            let row = files
                .json_owned(&row_file("quest", &key))
                .unwrap_or(Value::Null);
            let areas_where = |pick: &dyn Fn(&Reach) -> bool| -> Vec<String> {
                let mut areas: Vec<String> = self
                    .owners
                    .iter()
                    .filter(|owner| owner.reaches.iter().any(pick))
                    .map(|owner| owner.area.clone())
                    .collect();
                areas.sort();
                areas.dedup();
                areas
            };
            let who_does = |pick: &dyn Fn(&Reach) -> bool| -> Option<String> {
                self.owners
                    .iter()
                    .find(|owner| owner.reaches.iter().any(pick))
                    .map(|owner| display_name(content, owner))
            };
            let mut steps = Vec::new();
            let offered = areas_where(
                &|reach| matches!(reach, Reach::Offers(quest) | Reach::Accepts(quest) if quest.key(&content) == key),
            );
            let giver = who_does(
                &|reach| matches!(reach, Reach::Offers(quest) | Reach::Accepts(quest) if quest.key(&content) == key),
            );
            if !offered.is_empty() {
                steps.push(QuestStep {
                    label: "offered".to_owned(),
                    areas: offered,
                    who: giver.clone(),
                });
            }
            for module in row["modules"].as_array().into_iter().flatten() {
                let objective = module.kind();
                match objective {
                    "defeat" => {
                        let npc = module.text("npc");
                        let areas: Vec<String> = self
                            .areas
                            .iter()
                            .filter(|(_, info)| info.npcs.iter().any(|(placed, _)| placed == npc))
                            .map(|(area, _)| area.clone())
                            .collect();
                        steps.push(QuestStep {
                            label: format!("defeat {npc}"),
                            areas,
                            who: None,
                        });
                    }
                    "hold" | "deliver" => {
                        let item = module.text("item").to_owned();
                        let areas: Vec<String> = self
                            .areas
                            .keys()
                            .filter(|area| {
                                self.sources(content, files, area, "item", &item)
                                    .iter()
                                    .any(|source| matches!(source.kind, "drop" | "script"))
                            })
                            .cloned()
                            .collect();
                        let count = module["count"].as_u64().unwrap_or(1);
                        steps.push(QuestStep {
                            label: if count > 1 {
                                format!("{objective} {count} {item}")
                            } else {
                                format!("{objective} {item}")
                            },
                            areas,
                            who: None,
                        });
                    }
                    "task" | "decide" => {
                        let label = module["label"].as_str().unwrap_or(objective).to_owned();
                        let areas = areas_where(
                            &|reach| matches!(reach, Reach::Completes(quest) if quest.key(&content) == key),
                        );
                        steps.push(QuestStep {
                            label,
                            areas,
                            who: None,
                        });
                    }
                    _ => {}
                }
            }
            let turn_in = areas_where(
                &|reach| matches!(reach, Reach::TurnsIn(quest) if quest.key(&content) == key),
            );
            if !turn_in.is_empty() {
                let who = who_does(
                    &|reach| matches!(reach, Reach::TurnsIn(quest) if quest.key(&content) == key),
                );
                steps.push(QuestStep {
                    label: "turned in".to_owned(),
                    areas: turn_in,
                    who,
                });
            }
            let failed = areas_where(
                &|reach| matches!(reach, Reach::Fails(quest) if quest.key(&content) == key),
            );
            if !failed.is_empty() {
                steps.push(QuestStep {
                    label: "failed".to_owned(),
                    areas: failed,
                    who: None,
                });
            }
            let requires = row["modules"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|module| matches!(module.kind(), "shown" | "requires"))
                .map(|module| crate::condition::summary(&module["condition"]));
            quests.push(QuestInfo {
                key,
                title: def.title.clone(),
                category: def.category.clone(),
                steps,
                after: Vec::new(),
                requires,
                giver,
            });
        }
        let keys: Vec<String> = quests.iter().map(|quest| quest.key.clone()).collect();
        for quest in &mut quests {
            let key = quest.key.clone();
            let row = files
                .json_owned(&row_file("quest", &key))
                .unwrap_or(Value::Null);
            let mut after: Vec<QuestLink> = Vec::new();
            for module in row["modules"].as_array().into_iter().flatten() {
                if matches!(module.kind(), "shown" | "requires") {
                    self.quest_links(content, &module["condition"], &keys, &key, &mut after);
                }
            }
            for owner in self.owners.iter().filter(|owner| {
                owner.reaches.iter().any(|reach| matches!(reach, Reach::Offers(q) | Reach::Accepts(q) if q.key(&content) == key))
            }) {
                for reach in &owner.reaches {
                    if let Reach::Fails(q) = reach {
                        let other = q.key(&content);
                        if other != key && !after.iter().any(|link| link.quest == other) {
                            after.push(QuestLink {
                                quest: other.to_owned(),
                                how: LinkHow::Failed,
                            });
                        }
                    }
                }
            }
            quest.after = after;
        }
        let mut categories: Vec<String> =
            quests.iter().map(|quest| quest.category.clone()).collect();
        categories.sort();
        categories.dedup();
        let mut lines = Vec::new();
        for category in categories {
            let mut ordered: Vec<String> = Vec::new();
            let mut pending: Vec<&QuestInfo> = quests
                .iter()
                .filter(|quest| quest.category == category)
                .collect();
            pending.sort_by(|a, b| a.key.cmp(&b.key));
            while !pending.is_empty() {
                let next = pending
                    .iter()
                    .position(|quest| {
                        quest.after.iter().all(|link| {
                            ordered.contains(&link.quest)
                                || !pending.iter().any(|p| p.key == link.quest)
                        })
                    })
                    .unwrap_or(0);
                ordered.push(pending.remove(next).key.clone());
            }
            lines.push(QuestLine {
                category,
                quests: ordered,
            });
        }
        self.quests = quests;
        self.lines = lines;
    }

    fn quest_links(
        &self,
        content: Content,
        condition: &Value,
        keys: &[String],
        key: &str,
        out: &mut Vec<QuestLink>,
    ) {
        match condition {
            Value::Object(fields) => {
                let kind = fields.get("type").and_then(Value::as_str).unwrap_or("");
                if kind == "not" {
                    return;
                }
                let quest = fields.get("quest").and_then(Value::as_str).unwrap_or("");
                let link = match kind {
                    "on_quest" => Some(LinkHow::During),
                    "quest_done" | "quest_complete" | "quest_completed" => Some(LinkHow::Done),
                    "quest_failed" => Some(LinkHow::Failed),
                    _ => None,
                };
                if let Some(how) = link
                    && quest != key
                    && keys.iter().any(|k| k == quest)
                    && !out.iter().any(|l| l.quest == quest)
                {
                    out.push(QuestLink {
                        quest: quest.to_owned(),
                        how,
                    });
                }
                if kind == "memory"
                    && let Some(memory) = fields.get("memory").and_then(Value::as_str)
                {
                    for other in keys.iter().filter(|other| *other != key) {
                        let set_in_other = self.owners.iter().any(|owner| {
                            owner.reaches.iter().any(|reach| matches!(reach, Reach::Remembers(m) if m.key(&content) == memory))
                                && owner.reaches.iter().any(|reach| {
                                    matches!(reach, Reach::Offers(q) | Reach::Accepts(q) | Reach::TurnsIn(q) | Reach::Completes(q) if q.key(&content) == *other)
                                })
                        });
                        if set_in_other && !out.iter().any(|l| l.quest == *other) {
                            out.push(QuestLink {
                                quest: other.clone(),
                                how: LinkHow::Memory(memory.to_owned()),
                            });
                        }
                    }
                }
                for value in fields.values() {
                    self.quest_links(content, value, keys, key, out);
                }
            }
            Value::Array(items) => {
                for item in items {
                    self.quest_links(content, item, keys, key, out);
                }
            }
            _ => {}
        }
    }

    pub fn number_range(&self, files: &Files, area: &str, path: &str) -> Option<(f64, f64)> {
        let (table, rest) = path.split_once('.').unwrap_or((path, ""));
        let info = self.areas.get(area)?;
        let keys: Vec<String> = match table {
            "area" => vec![area.to_owned()],
            "npc" => info.npcs.iter().map(|(npc, _)| npc.clone()).collect(),
            _ => files
                .paths_under(&format!("tables/{table}/"))
                .filter_map(|file| crate::project::row_of(file).map(|(_, key)| key.to_owned()))
                .filter(|key| info.text.contains(&format!("\"{}\"", key.to_lowercase())))
                .collect(),
        };
        let mut range: Option<(f64, f64)> = None;
        for key in keys {
            let Some(row) = files.json(&row_file(table, &key)) else {
                continue;
            };
            for value in numbers_at(&row, rest) {
                range = Some(match range {
                    Some((low, high)) => (low.min(value), high.max(value)),
                    None => (value, value),
                });
            }
        }
        range
    }
}

fn display_name(content: Content, owner: &Owner) -> String {
    if owner.kind == OwnerKind::Npc
        && let Some(id) = content.by_key::<game::systems::npc::NpcDef>(&owner.row_key)
    {
        return id.get(&content).name.clone();
    }
    owner
        .label
        .rsplit(" › ")
        .next()
        .unwrap_or(&owner.label)
        .to_owned()
}

fn module_types(row: &Value) -> BTreeSet<String> {
    row["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|module| {
            module["type"]
                .as_str()
                .or_else(|| module["objective"].as_str())
                .map(str::to_owned)
        })
        .collect()
}

fn loot_names(row: &Value, item: &str) -> bool {
    row["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|module| {
            module["type"] == "loot"
                && module["items"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|loot| loot["item"] == item)
        })
}

pub fn mentions(value: &Value, key: &str) -> bool {
    match value {
        Value::String(text) => text == key,
        Value::Array(items) => items.iter().any(|item| mentions(item, key)),
        Value::Object(fields) => fields.values().any(|field| mentions(field, key)),
        _ => false,
    }
}

pub fn numbers_at(value: &Value, path: &str) -> Vec<f64> {
    if path.is_empty() {
        return match value {
            Value::Number(number) => number.as_f64().into_iter().collect(),
            Value::Array(items) => items.iter().filter_map(Value::as_f64).collect(),
            _ => Vec::new(),
        };
    }
    let (head, rest) = path.split_once('.').unwrap_or((path, ""));
    match value {
        Value::Object(fields) => {
            if let Some(field) = fields.get(head) {
                return numbers_at(field, rest);
            }
            fields
                .get("modules")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter(|module| module["type"] == head)
                .flat_map(|module| numbers_at(module, rest))
                .collect()
        }
        Value::Array(items) => items
            .iter()
            .flat_map(|item| numbers_at(item, path))
            .collect(),
        _ => Vec::new(),
    }
}

fn table_kind(table: &str) -> &'static str {
    match table {
        "npc" => "npc",
        "item" => "item",
        "quest" => "quest",
        "shop" => "shop",
        "blueprint" => "blueprint",
        "tileset" => "tileset",
        "model" => "model",
        "script" => "script",
        _ => "row",
    }
}
