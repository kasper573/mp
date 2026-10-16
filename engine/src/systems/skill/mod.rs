use std::collections::BTreeMap;

use bevy_app::App;
use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{IntoStaticStr, VariantArray};

use crate::core::assets::AssetRef;
use crate::core::audio::playback::SfxId;
use crate::core::content::{
    Content, ContentId, ContentProblem, ContentRow, Loading, ModuleRule, ModuleSet, RowCheck,
    serial,
};
use crate::core::geometry::{Footprint, Shape, facing_from};
use crate::core::math::Pos;
use crate::core::script::FlowCx;
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::{Seconds, UnixMillis};
use crate::systems::area::AreaTag;
use crate::systems::class::{self, SkillPoints, SkillTree};
use crate::systems::combat::{self, Relation};
use crate::systems::equipment::Equipment;
use crate::systems::item::{ItemId, ItemKind, ItemStack};
use crate::systems::movement;
use crate::systems::npc::Npc;
use crate::systems::script::event::{USED_POINT, USED_RANK, USED_TARGET};
use crate::systems::script::query::TickRoster;
use crate::systems::script::{
    Condition, EventKind, OwnerKind, OwnerRow, RiftScripts, ScriptModule, ScriptedRow,
};
use crate::systems::stat::{self, StatKind};
use crate::systems::visibility;

pub const HOTBAR_SLOTS: u32 = 40;
/// An area hits the nearest few, so a crowd never multiplies one cast without bound.
pub const AREA_TARGETS: usize = 8;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<Learned>()
        .replicate::<Cooldowns>()
        .replicate::<Hotbar>()
        .replicate::<BasicAttack>();
}

pub type SkillId = ContentId<SkillDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct SkillDef {
    pub name: String,
    pub icon: AssetRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sfx: Option<SfxId>,
    pub target: Targeting,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<Tiles>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area: Option<Shape>,
    #[serde(default, skip_serializing_if = "is_no_time")]
    pub cooldown: Seconds,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires: Option<Condition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cost: Vec<ItemStack>,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub basic_attack: bool,
    pub levels: Vec<SkillLevel>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<SkillModule>,
}

impl ContentRow for SkillDef {
    const TABLE: &'static str = "skill";

    fn check(&self, check: &mut RowCheck) {
        check.text("/name", &self.name, 1, 40);
        check.count("/levels", self.levels.len(), 1, 20, "ranks");
        match (self.target.aimed_at_point(), self.area.is_some()) {
            (true, false) => check.error(
                "/area",
                "area kind without an area",
                self.target.label(),
                "a shape the skill covers at the aimed point",
            ),
            (false, true) => check.error(
                "/area",
                "area on a single kind",
                self.target.label(),
                "no area: a single or self skill has no shape",
            ),
            _ => {}
        }
        if self.cooldown.0 < 0.0 {
            check.error("/cooldown", "out of range", self.cooldown.0, "0 or more");
        }
        if let Some(range) = self.range
            && range.0 <= 0.0
        {
            check.error("/range", "out of range", range.0, "more than 0 tiles");
        }
        for (index, stack) in self.cost.iter().enumerate() {
            if stack.count == 0 {
                check.error(
                    format!("/cost/{index}/count"),
                    "empty stack",
                    0,
                    "at least 1",
                );
            }
        }
    }
}

impl ModuleSet for SkillDef {
    type Module = SkillModule;

    fn modules(&self) -> &[SkillModule] {
        &self.modules
    }

    fn rule(_: &SkillModule) -> ModuleRule {
        ModuleRule::AnyNumber
    }
}

impl ScriptedRow for SkillDef {
    const OWNER: OwnerKind = OwnerKind::Skill;

    fn script(module: &SkillModule) -> Option<&ScriptModule> {
        match module {
            SkillModule::Script(script) => Some(script),
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SkillModule {
    #[serde(untagged)]
    Script(ScriptModule),
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Hash,
    VariantArray,
    IntoStaticStr,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Targeting {
    SingleAlly,
    SingleEnemy,
    AreaAlly,
    AreaEnemy,
    #[serde(rename = "self")]
    #[strum(serialize = "self")]
    Caster,
}

impl Targeting {
    pub fn aimed_at_point(self) -> bool {
        matches!(self, Targeting::AreaAlly | Targeting::AreaEnemy)
    }

    pub fn aimed_at_actor(self) -> bool {
        matches!(self, Targeting::SingleAlly | Targeting::SingleEnemy)
    }

    pub fn hostile(self) -> bool {
        matches!(self, Targeting::SingleEnemy | Targeting::AreaEnemy)
    }

    pub fn label(self) -> &'static str {
        self.into()
    }

    pub fn describe(self) -> &'static str {
        match self {
            Targeting::SingleAlly => "One ally",
            Targeting::SingleEnemy => "One enemy",
            Targeting::AreaAlly => "Allies around the aimed point",
            Targeting::AreaEnemy => "Enemies around the aimed point",
            Targeting::Caster => "Yourself",
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SkillLevel {
    pub cost: SkillPoints,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub stats: BTreeMap<SkillStat, f32>,
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    VariantArray,
    IntoStaticStr,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "title_case")]
pub enum SkillStat {
    Power,
    Cooldown,
    Range,
    Radius,
    Duration,
}

impl SkillStat {
    pub fn label(self) -> &'static str {
        self.into()
    }

    pub fn unit(self) -> Option<&'static str> {
        match self {
            SkillStat::Cooldown | SkillStat::Duration => Some("s"),
            SkillStat::Range | SkillStat::Radius => Some("tiles"),
            SkillStat::Power => None,
        }
    }
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
)]
#[serde(transparent)]
pub struct Rank(pub u8);

impl Rank {
    pub const NONE: Rank = Rank(0);
    pub const FIRST: Rank = Rank(1);
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Learned(pub BTreeMap<String, Rank>);

impl Learned {
    pub fn rank(&self, node: &str) -> Rank {
        self.0.get(node).copied().unwrap_or(Rank::NONE)
    }

    pub fn cost(&self, content: &Content, tree: &SkillTree) -> SkillPoints {
        self.0
            .iter()
            .filter_map(|(key, rank)| Some((tree.node(key)?.skill.get(content), *rank)))
            .fold(SkillPoints(0), |sum, (skill, rank)| {
                sum + skill.cost_to(rank)
            })
    }

    pub fn ranks(&self) -> usize {
        self.0.values().map(|rank| usize::from(rank.0)).sum()
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Cooldowns(pub BTreeMap<SkillId, UnixMillis>);

impl Cooldowns {
    pub fn ready_at(&self, skill: SkillId) -> Option<UnixMillis> {
        self.0.get(&skill).copied()
    }

    pub fn cooling(&self, skill: SkillId, now: UnixMillis) -> bool {
        self.ready_at(skill).is_some_and(|ready| ready > now)
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Hotbar(pub Vec<HotbarEntry>);

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum HotbarEntry {
    #[default]
    Empty,
    Skill {
        skill: SkillId,
    },
    Item {
        item: ItemId,
    },
}

impl Hotbar {
    pub fn entry(&self, slot: u32) -> HotbarEntry {
        self.0.get(slot as usize).copied().unwrap_or_default()
    }

    pub fn set(&mut self, slot: u32, entry: HotbarEntry) {
        let slot = slot as usize;
        if self.0.len() <= slot {
            self.0.resize(slot + 1, HotbarEntry::Empty);
        }
        self.0[slot] = entry;
        while self.0.last() == Some(&HotbarEntry::Empty) {
            self.0.pop();
        }
    }

    pub fn first_free(&self, within: u32) -> Option<u32> {
        (0..within).find(|slot| self.entry(*slot) == HotbarEntry::Empty)
    }

    pub fn slot_of(&self, entry: HotbarEntry) -> Option<u32> {
        self.0
            .iter()
            .position(|held| *held == entry)
            .map(|slot| slot as u32)
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BasicAttack(pub Option<SkillId>);

impl SkillDef {
    pub fn cost_to(&self, rank: Rank) -> SkillPoints {
        self.levels
            .iter()
            .take(usize::from(rank.0))
            .fold(SkillPoints(0), |sum, level| sum + level.cost)
    }

    pub fn total_cost(&self) -> SkillPoints {
        self.cost_to(Rank(self.rank_count()))
    }

    /// A stat summed over the ranks reached.
    pub fn stat(&self, rank: Rank, stat: SkillStat) -> f32 {
        self.levels
            .iter()
            .take(usize::from(rank.0))
            .filter_map(|level| level.stats.get(&stat))
            .sum()
    }

    pub fn cooldown_at(&self, rank: Rank) -> Seconds {
        Seconds((self.cooldown.0 + self.stat(rank, SkillStat::Cooldown)).max(0.0))
    }

    pub fn area_at(&self, rank: Rank) -> Option<Shape> {
        self.area
            .map(|shape| shape.grown(Tiles(self.stat(rank, SkillStat::Radius))))
    }

    pub fn answers_used(&self, scripts: &RiftScripts, id: SkillId) -> bool {
        scripts
            .may_do(OwnerRow {
                kind: OwnerKind::Skill,
                row: id.raw(),
                object: None,
            })
            .answers(EventKind::Used)
    }
}

/// Every skill an actor may use now, at the rank it has it: the ranks learned in its class tree,
/// what its worn equipment grants at rank one, and an npc's own basic attack.
pub fn known(world: &World, actor: Entity) -> BTreeMap<SkillId, Rank> {
    let content = world.resource::<Content>();
    let mut known = BTreeMap::new();
    if let Some(class) = class::of(world, actor)
        && let Some(learned) = world.get::<Learned>(actor)
    {
        let tree = &class.get(content).tree;
        for (node, rank) in &learned.0 {
            if let Some(node) = tree.node(node)
                && rank.0 > 0
            {
                known.insert(node.skill, *rank);
            }
        }
    }
    for skill in granted(world, actor) {
        known.entry(skill).or_insert(Rank::FIRST);
    }
    if let Some(npc) = world.get::<Npc>(actor)
        && let Some(skill) = npc.def.get(content).basic_attack
    {
        known.entry(skill).or_insert(Rank::FIRST);
    }
    known
}

pub fn rank_of(world: &World, actor: Entity, skill: SkillId) -> Rank {
    known(world, actor)
        .get(&skill)
        .copied()
        .unwrap_or(Rank::NONE)
}

/// The skills an actor's worn equipment grants, in the order worn and listed.
pub fn granted(world: &World, actor: Entity) -> Vec<SkillId> {
    let content = world.resource::<Content>();
    world
        .get::<Equipment>(actor)
        .map(|equipment| {
            equipment
                .slots
                .values()
                .flat_map(|item| grants_of(content, *item).iter().copied())
                .collect()
        })
        .unwrap_or_default()
}

pub fn grants_of(content: &Content, item: ItemId) -> &[SkillId] {
    match &item.get(content).kind {
        ItemKind::Equipment { grants, .. } => grants,
        _ => &[],
    }
}

/// The reach of a skill from an actor: the row's range, or the actor's Range stat when unset,
/// plus whatever its ranks add.
pub fn range_of(world: &World, actor: Entity, skill: SkillId, rank: Rank) -> Tiles {
    let def = skill.get(world.resource::<Content>());
    let base = def
        .range
        .unwrap_or_else(|| Tiles(stat::effective(world, actor, StatKind::Range)));
    Tiles((base.0 + def.stat(rank, SkillStat::Range)).max(0.0))
}

/// Whom a cast lands on, read from the use that raised the running script: the caster, the aimed
/// actor when it still stands where the skill may reach it, or the nearest actors inside the area.
pub fn targets(world: &World, cx: &FlowCx, skill: SkillId) -> Vec<Entity> {
    let Some(caster) = cx.subject else {
        return Vec::new();
    };
    let def = skill.get(world.resource::<Content>());
    let fits = |who: Entity| {
        let relation = combat::relation(world, caster, who);
        let side = match def.target.hostile() {
            true => relation == Relation::Enemy,
            false => relation != Relation::Enemy,
        };
        side && !stat::is_dead(world, who) && visibility::coexist(world, caster, who)
    };
    match def.target {
        Targeting::Caster => vec![caster],
        Targeting::SingleAlly | Targeting::SingleEnemy => used_target(world, cx)
            .filter(|who| fits(*who))
            .into_iter()
            .collect(),
        Targeting::AreaAlly | Targeting::AreaEnemy => {
            let Some(footprint) = footprint(world, cx, skill) else {
                return Vec::new();
            };
            let Some(roster) = world.get_resource::<TickRoster>() else {
                return Vec::new();
            };
            let Some(area) = world.get::<AreaTag>(caster).map(|tag| tag.area) else {
                return Vec::new();
            };
            let mut inside: Vec<(Entity, Tiles)> = roster
                .iter()
                .filter(|listed| listed.area == area && !listed.held)
                .filter(|listed| footprint.contains(listed.at) && fits(listed.entity))
                .map(|listed| (listed.entity, listed.at.distance(footprint.at)))
                .collect();
            inside.sort_by(|(a, da), (b, db)| da.0.total_cmp(&db.0).then(a.cmp(b)));
            inside
                .into_iter()
                .take(AREA_TARGETS)
                .map(|(entity, _)| entity)
                .collect()
        }
    }
}

/// The ground a cast covers: a circle or rectangle sits on the aimed point, a cone or line
/// reaches out from the caster toward it.
pub fn footprint(world: &World, cx: &FlowCx, skill: SkillId) -> Option<Footprint> {
    let caster = cx.subject?;
    let def = skill.get(world.resource::<Content>());
    let shape = def.area_at(used_rank(cx))?;
    let from = movement::position(world, caster)?;
    let point = aimed_point(world, cx, skill).unwrap_or(from);
    let at = match shape {
        Shape::Cone { .. } | Shape::Line { .. } => from,
        Shape::Circle { .. } | Shape::Rect { .. } => point,
    };
    Some(Footprint {
        at,
        facing: facing_from(from, point),
        shape,
    })
}

pub fn aimed_point(world: &World, cx: &FlowCx, skill: SkillId) -> Option<Pos<Tiles>> {
    let caster = cx.subject?;
    match skill.get(world.resource::<Content>()).target {
        Targeting::Caster => movement::position(world, caster),
        Targeting::SingleAlly | Targeting::SingleEnemy => {
            movement::position(world, used_target(world, cx)?)
        }
        Targeting::AreaAlly | Targeting::AreaEnemy => cx.event.get(USED_POINT)?.as_point(),
    }
}

fn used_target(world: &World, cx: &FlowCx) -> Option<Entity> {
    let target = cx.event.get(USED_TARGET)?.as_actor()?;
    world.get_entity(target).ok().map(|entity| entity.id())
}

fn used_rank(cx: &FlowCx) -> Rank {
    cx.event
        .get(USED_RANK)
        .and_then(|rank| u8::try_from(rank.as_int()).ok())
        .map_or(Rank::FIRST, Rank)
}

pub fn check_all(loading: &mut Loading) {
    let content = loading.content();
    let scripts = content.built::<RiftScripts>();
    for (id, def) in loading.rows::<SkillDef>(&content) {
        if !def.answers_used(scripts, id) {
            loading.row_error(
                id,
                "/modules",
                ContentProblem::new(
                    "skill without used",
                    format!("skill/{}", id.key(&content)),
                    "a script answering used on every skill",
                ),
            );
        }
    }
}

fn is_no_time(seconds: &Seconds) -> bool {
    seconds.0 == 0.0
}
