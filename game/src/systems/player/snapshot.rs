use std::collections::BTreeMap;

use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::{Content, ContentId, ContentRow, Loading, RowCheck, key_of, serial};
use crate::core::script::{Value, ValueType};
use crate::core::time::{Seconds, WallClock};
use crate::systems::GameSettings;
use crate::systems::actor::Name;
use crate::systems::area::{self, AreaId, transition::Discovered};
use crate::systems::dialogue::Heard;
use crate::systems::effect::{Effect, TimedEffect, TimedEffects};
use crate::systems::equipment::{Equipment, EquipmentSlot};
use crate::systems::history::{History, HistoryEntry};
use crate::systems::item::{INVENTORY_MAX, Inventory, ItemId, ItemKind, ItemStack};
use crate::systems::job::{Job, JobId};
use crate::systems::memory::{Memory, MemoryId};
use crate::systems::player::{CharacterState, SpawnPoint, Xp, def, player_stats};
use crate::systems::quest::{ActiveQuest, FinishedQuest, Parties, QuestId, QuestLog, QuestResult};
use crate::systems::script::Place;
use crate::systems::shop::{Sale, ShopId, ShopLedger};
use crate::systems::stat::StatMap;

pub type TestCharacterId = ContentId<CharacterSnapshot>;

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterSnapshot {
    pub name: String,
    pub job: JobId,
    #[serde(default, skip_serializing_if = "serial::is_zero")]
    pub xp: u32,
    #[serde(default, skip_serializing_if = "StatMap::is_empty")]
    pub stats: StatMap,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effects: Vec<SnapshotEffect>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bag: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub equipment: BTreeMap<EquipmentSlot, ItemId>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub known_areas: Vec<AreaId>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quests: Vec<SnapshotQuest>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub memories: Vec<SnapshotMemory>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lines_heard: Vec<HeardLine>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shops: Vec<SnapshotShop>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub history: Vec<SnapshotRecord>,
    pub start: CharacterStart,
}

impl ContentRow for CharacterSnapshot {
    const TABLE: &'static str = "test_character";
}

impl CharacterSnapshot {
    pub fn fresh(name: &str, job: JobId) -> CharacterSnapshot {
        CharacterSnapshot {
            name: name.to_owned(),
            job,
            xp: 0,
            stats: StatMap::default(),
            effects: Vec::new(),
            bag: Vec::new(),
            equipment: BTreeMap::new(),
            known_areas: Vec::new(),
            quests: Vec::new(),
            memories: Vec::new(),
            lines_heard: Vec::new(),
            shops: Vec::new(),
            history: Vec::new(),
            start: CharacterStart::InitialSpawn(AtInitialSpawn::InitialSpawn),
        }
    }
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CharacterStart {
    InitialSpawn(AtInitialSpawn),
    At(Place),
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AtInitialSpawn {
    InitialSpawn,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotEffect {
    pub effect: Effect,
    pub left: Seconds,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotQuest {
    pub quest: QuestId,
    pub state: QuestState,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub progress: Vec<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<Seconds>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decided: Option<String>,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestState {
    Active,
    Completed,
    Failed,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotMemory {
    pub memory: MemoryId,
    pub value: MemoryValue,
    pub ago: Seconds,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MemoryValue {
    Bool(bool),
    Int(i64),
    Num(f64),
    Text(String),
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeardLine {
    pub script: String,
    pub node: String,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotShop {
    pub shop: ShopId,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stock: Vec<ShopStock>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sales: Vec<Sale>,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShopStock {
    pub offer: u32,
    pub left: u32,
    pub restocks_in: Seconds,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotRecord {
    pub ago: Seconds,
    pub entry: HistoryEntry,
}

#[derive(Component, Clone, Debug, PartialEq)]
pub struct JoinAs {
    pub snapshot: CharacterSnapshot,
    pub start: Place,
}

pub fn start_of(content: &Content, snapshot: &CharacterSnapshot) -> Place {
    match snapshot.start {
        CharacterStart::InitialSpawn(_) => content.built::<GameSettings>().initial_spawn,
        CharacterStart::At(place) => place,
    }
}

pub fn materialize(
    content: &Content,
    snapshot: &CharacterSnapshot,
    start: Place,
    clock: WallClock,
    immortal: bool,
) -> CharacterState {
    let mut stats = def(content).stats.clone();
    stats.0.extend(&snapshot.stats.0);
    let mut discovered = Discovered::starting_in(start.area);
    for &known in &snapshot.known_areas {
        discovered.discover(known);
    }
    let mut memory = Memory::default();
    for remembered in &snapshot.memories {
        memory.set(
            content,
            remembered.memory,
            remembered.value.clone().into(),
            WallClock {
                now: clock.now.before(remembered.ago),
                reset: clock.reset,
            },
        );
    }
    let mut heard = Heard::default();
    for line in &snapshot.lines_heard {
        heard.hear(&line.script, &line.node);
    }
    let mut ledger = ShopLedger::default();
    for visited in &snapshot.shops {
        for stock in &visited.stock {
            ledger.stocked(
                visited.shop,
                stock.offer,
                stock.left,
                clock.now.after(stock.restocks_in),
            );
        }
        for sale in &visited.sales {
            ledger.record_sale(visited.shop, sale.clone());
        }
    }
    CharacterState {
        name: Name {
            name: snapshot.name.clone(),
        },
        spawn: SpawnPoint(start.at),
        discovered,
        stats: player_stats(&stats, immortal),
        inventory: Inventory {
            slots: snapshot.bag.clone(),
            max: INVENTORY_MAX,
        },
        xp: Xp {
            amount: snapshot.xp,
        },
        equipment: Equipment {
            slots: snapshot.equipment.clone(),
        },
        job: Job { def: snapshot.job },
        timed: TimedEffects(
            snapshot
                .effects
                .iter()
                .map(|timed| TimedEffect {
                    effect: timed.effect,
                    until: clock.now.after(timed.left),
                })
                .collect(),
        ),
        memory,
        heard,
        ledger,
        quests: quest_log(content, snapshot, clock),
        history: History::replayed(
            snapshot
                .history
                .iter()
                .map(|record| (clock.now.before(record.ago), record.entry.clone())),
        ),
    }
}

pub fn check_all(loading: &mut Loading) {
    let content = loading.content();
    for (id, snapshot) in loading.rows::<CharacterSnapshot>() {
        let mut check = RowCheck::default();
        check_start(&content, snapshot, &mut check);
        check_bag(&content, snapshot, &mut check);
        check_equipment(&content, snapshot, &mut check);
        check_quests(&content, snapshot, &mut check);
        check_memories(&content, snapshot, &mut check);
        check_shops(&content, snapshot, &mut check);
        loading.row_errors(id, check);
    }
}

impl From<MemoryValue> for Value {
    fn from(value: MemoryValue) -> Value {
        match value {
            MemoryValue::Bool(flag) => Value::Bool(flag),
            MemoryValue::Int(int) => Value::Int(int),
            MemoryValue::Num(num) => Value::Num(num),
            MemoryValue::Text(text) => Value::Text(text),
        }
    }
}

impl MemoryValue {
    fn fits(&self, ty: ValueType) -> bool {
        matches!(
            (self, ty),
            (MemoryValue::Bool(_), ValueType::Boolean)
                | (MemoryValue::Int(_), ValueType::Integer | ValueType::Number)
                | (MemoryValue::Num(_), ValueType::Number)
                | (MemoryValue::Text(_), ValueType::Text)
        )
    }

    fn describe(&self) -> String {
        match self {
            MemoryValue::Bool(flag) => flag.to_string(),
            MemoryValue::Int(int) => int.to_string(),
            MemoryValue::Num(num) => num.to_string(),
            MemoryValue::Text(text) => format!("{text:?}"),
        }
    }
}

fn quest_log(content: &Content, snapshot: &CharacterSnapshot, clock: WallClock) -> QuestLog {
    let mut log = QuestLog::default();
    for entry in &snapshot.quests {
        let result = match entry.state {
            QuestState::Active => {
                let mut active = ActiveQuest::fresh(content, entry.quest);
                for (count, given) in active.counts.iter_mut().zip(&entry.progress) {
                    *count = *given;
                }
                active.deadline = entry.left.map(|left| clock.now.after(left));
                active.decided = entry.decided.clone();
                log.active.push(active);
                log.tracked.push(entry.quest);
                continue;
            }
            QuestState::Completed => QuestResult::Completed,
            QuestState::Failed => QuestResult::Failed,
        };
        log.finished
            .push(FinishedQuest::new(entry.quest, result, clock.day()));
    }
    log
}

fn check_start(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    let start = start_of(content, snapshot);
    if let CharacterStart::At(place) = snapshot.start
        && let Err(problem) = area::check_place(content, place)
    {
        check.problem("/start", problem);
    }
    if !snapshot.known_areas.is_empty() && !snapshot.known_areas.contains(&start.area) {
        check.error(
            "/known_areas",
            "start not known",
            start.area.key(content),
            "the known areas to include the start's area",
        );
    }
}

fn check_bag(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    if snapshot.bag.len() > INVENTORY_MAX as usize {
        check.error(
            "/bag",
            "bag too full",
            format!("{} slots", snapshot.bag.len()),
            format!("at most {INVENTORY_MAX} slots"),
        );
    }
    for (index, stack) in snapshot.bag.iter().enumerate() {
        let max = stack.item.get(content).stack_max();
        if stack.count == 0 {
            check.error(
                format!("/bag/{index}/count"),
                "empty stack",
                0,
                "at least 1",
            );
        } else if stack.count > max {
            check.error(
                format!("/bag/{index}/count"),
                "bag too full",
                format!("{} {} in one slot", stack.count, stack.item.key(content)),
                format!("a stack of at most {max}"),
            );
        }
    }
}

fn check_equipment(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    for (&slot, &worn) in &snapshot.equipment {
        let fits = matches!(
            worn.get(content).kind,
            ItemKind::Equipment { slot: made_for, .. } if made_for == slot
        );
        if !fits {
            let slot = key_of(slot.label()).as_str().to_owned();
            check.error(
                format!("/equipment/{slot}"),
                "not wearable",
                format!("{} on {slot}", worn.key(content)),
                format!("an item made for the {slot} slot"),
            );
        }
    }
}

fn check_quests(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    let parties = content.built::<Parties>();
    for (index, entry) in snapshot.quests.iter().enumerate() {
        if snapshot.quests[..index]
            .iter()
            .any(|earlier| earlier.quest == entry.quest)
        {
            check.error(
                format!("/quests/{index}/quest"),
                "quest listed twice",
                entry.quest.key(content),
                "each quest once",
            );
        }
        if entry.state != QuestState::Active || entry.progress.is_empty() {
            continue;
        }
        let def = entry.quest.get(content);
        let objectives = def.objectives().count();
        if entry.progress.len() != objectives {
            check.error(
                format!("/quests/{index}/progress"),
                "progress mismatch",
                format!("{} counts", entry.progress.len()),
                format!("{objectives}, one per objective"),
            );
            continue;
        }
        let needs = def.progress(
            content,
            parties,
            &ActiveQuest::fresh(content, entry.quest),
            None,
        );
        for (objective, (&count, progress)) in entry.progress.iter().zip(needs).enumerate() {
            if count > progress.need {
                check.error(
                    format!("/quests/{index}/progress/{objective}"),
                    "progress out of range",
                    count,
                    format!("0 to {}", progress.need),
                );
            }
        }
    }
}

fn check_memories(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    for (index, remembered) in snapshot.memories.iter().enumerate() {
        let ty = remembered.memory.get(content).ty;
        if !remembered.value.fits(ty) {
            check.error(
                format!("/memories/{index}/value"),
                "memory type",
                remembered.value.describe(),
                format!(
                    "{}, the type of {}",
                    ty.name(),
                    remembered.memory.key(content)
                ),
            );
        }
    }
}

fn check_shops(content: &Content, snapshot: &CharacterSnapshot, check: &mut RowCheck) {
    for (index, visited) in snapshot.shops.iter().enumerate() {
        let offers = visited.shop.get(content).sells().count() as u32;
        for (entry, stock) in visited.stock.iter().enumerate() {
            if stock.offer >= offers {
                check.error(
                    format!("/shops/{index}/stock/{entry}/offer"),
                    "unknown offer",
                    stock.offer,
                    format!(
                        "0 to {}, an offer of {}",
                        offers.saturating_sub(1),
                        visited.shop.key(content)
                    ),
                );
            }
        }
    }
}
