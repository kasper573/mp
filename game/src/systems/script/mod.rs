pub mod condition;
pub mod effect;
pub mod event;
pub mod query;

use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::audio::playback::SfxId;
use crate::core::content::{Content, ContentId, ContentRow, Loading, row_file};
use crate::core::math::Pos;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::script::{
    self, BoxEnding, DialogueView, Expr, FlowKey, Instances, LineDef, Owner, OwnerKind, OwnerRow,
    ScriptError, Scripts, Vocabulary, compile::compile_owner,
};
use crate::core::tiling::Tiles;
use crate::systems::actor::bust::Face;
use crate::systems::area::blueprint::BlueprintDef;
use crate::systems::area::{self, AreaDef, AreaObject};
use crate::systems::dialogue;
use crate::systems::item::ItemDef;
use crate::systems::job::JobDef;
use crate::systems::memory::MemoryDef;
use crate::systems::notification::NotificationDef;
use crate::systems::npc::{Npc, NpcDef};
use crate::systems::quest::QuestDef;
use crate::systems::shop::ShopDef;
use crate::systems::text::Span;

pub use effect::RiftEffect;
pub use event::{EventKind, RiftEvent, Who};
pub use query::RiftQuery;

#[derive(Clone, Copy, Debug)]
pub struct RiftScripting;

pub type ScriptDef = script::ScriptDef<RiftScripting>;
pub type ScriptId = script::ScriptId<RiftScripting>;
pub type InlineScript = script::InlineScript<RiftScripting>;
pub type ScriptModule = script::ScriptModule<RiftScripting>;
pub type Condition = Expr<RiftScripting>;
pub type VarValue = script::VarValue<RiftScripting>;
pub type Variable = script::Variable<RiftScripting>;
pub type Node = script::Node<RiftScripting>;
pub type DialogueNode = script::DialogueNode<RiftScripting>;
pub type Choice = script::Choice<RiftScripting>;
pub type Procedure = script::Procedure<RiftScripting>;
pub type MayDo = script::MayDo<RiftScripting>;
pub type Fill<T> = script::Fill<T>;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(from = "PlaceRow", into = "PlaceRow")]
pub struct Place {
    pub area: area::Id,
    pub at: Pos<Tiles>,
}

impl JsonSchema for Place {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        std::borrow::Cow::Borrowed("Place")
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        PlaceRow::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[schemars(extend("x-place" = true))]
struct PlaceRow {
    area: area::Id,
    x: f32,
    y: f32,
}

impl From<PlaceRow> for Place {
    fn from(row: PlaceRow) -> Place {
        Place {
            area: row.area,
            at: Pos::new(row.x, row.y),
        }
    }
}

impl From<Place> for PlaceRow {
    fn from(place: Place) -> PlaceRow {
        PlaceRow {
            area: place.area,
            x: place.at.x,
            y: place.at.y,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowRef {
    Area(area::Id),
    Item(crate::systems::item::Id),
    Npc(crate::systems::npc::Id),
    Quest(crate::systems::quest::Id),
    Shop(crate::systems::shop::Id),
    Memory(crate::systems::memory::Id),
    Notification(crate::systems::notification::Id),
    Job(crate::systems::job::Id),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(from = "LineRow", into = "LineRow")]
pub struct Line {
    pub by: Speaker,
    pub face: Option<Face>,
    pub text: Vec<Span>,
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LineRow {
    by: SpeakerRow,
    text: Vec<Span>,
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SpeakerRow {
    Npc {
        npc: crate::systems::npc::Id,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        face: Option<Face>,
    },
    Object,
    Narrator,
    Player,
}

impl From<LineRow> for Line {
    fn from(row: LineRow) -> Line {
        let (by, face) = match row.by {
            SpeakerRow::Npc { npc, face } => (Speaker::Npc(npc), face),
            SpeakerRow::Object => (Speaker::Object, None),
            SpeakerRow::Narrator => (Speaker::Narrator, None),
            SpeakerRow::Player => (Speaker::Player, None),
        };
        Line {
            by,
            face,
            text: row.text,
        }
    }
}

impl From<Line> for LineRow {
    fn from(line: Line) -> LineRow {
        LineRow {
            by: match line.by {
                Speaker::Npc(npc) => SpeakerRow::Npc {
                    npc,
                    face: line.face,
                },
                Speaker::Object => SpeakerRow::Object,
                Speaker::Narrator => SpeakerRow::Narrator,
                Speaker::Player => SpeakerRow::Player,
            },
            text: line.text,
        }
    }
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Speaker {
    Npc(crate::systems::npc::Id),
    Object,
    Narrator,
    Player,
}

impl LineDef<RiftScripting> for Line {
    fn values(&'static self) -> Vec<&'static Expr<RiftScripting>> {
        self.text
            .iter()
            .filter_map(|span| match span {
                Span::Value { value, .. } => Some(&**value),
                _ => None,
            })
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reach {
    Warp(Place),
    Takes(crate::systems::item::Id),
    Gives(crate::systems::item::Id),
    Drops(crate::systems::item::Id),
    Offers(crate::systems::quest::Id),
    Accepts(crate::systems::quest::Id),
    TurnsIn(crate::systems::quest::Id),
    Fails(crate::systems::quest::Id),
    Completes(crate::systems::quest::Id),
    Remembers(crate::systems::memory::Id),
    OpensShop(crate::systems::shop::Id),
    Spawns(crate::systems::npc::Id),
    Hostile,
    Friendly,
    Despawns,
    Targets,
    Walks,
    Damages,
    Heals,
    Buffs,
    GrantsXp,
    SetsJob(crate::systems::job::Id),
    Notifies(crate::systems::notification::Id),
    Says,
    Plays(SfxId),
    Speaks(crate::systems::npc::Id),
}

impl Vocabulary for RiftScripting {
    type Event = RiftEvent;
    type Query = RiftQuery;
    type Effect = RiftEffect;
    type Line = Line;
    type Text = Vec<Span>;
    type Place = Place;
    type Row = RowRef;
    type Audio = SfxId;
    type Reach = Reach;

    fn row_value(content: &Content, table: &str, key: &str) -> Option<RowRef> {
        Some(match table {
            "area" => RowRef::Area(content.by_key::<AreaDef>(key)?),
            "item" => RowRef::Item(content.by_key::<ItemDef>(key)?),
            "npc" => RowRef::Npc(content.by_key::<NpcDef>(key)?),
            "quest" => RowRef::Quest(content.by_key::<QuestDef>(key)?),
            "shop" => RowRef::Shop(content.by_key::<ShopDef>(key)?),
            "memory" => RowRef::Memory(content.by_key::<MemoryDef>(key)?),
            "notification" => RowRef::Notification(content.by_key::<NotificationDef>(key)?),
            "job" => RowRef::Job(content.by_key::<JobDef>(key)?),
            _ => return None,
        })
    }

    fn audio_value(content: &Content, key: &str) -> Option<SfxId> {
        content.by_key(key)
    }

    fn show_dialogue(world: &mut World, flow: FlowKey, subject: Entity, view: DialogueView<Self>) {
        dialogue::show(world, flow, subject, view);
    }

    fn close_dialogue(world: &mut World, flow: FlowKey, subject: Entity, ending: BoxEnding) {
        dialogue::close(world, flow, subject, ending);
    }

    fn log_dropped_flow(_world: &World, owner: &script::Owner, why: &str) {
        bevy::log::warn!("{owner:?}: flow dropped: {why}");
    }
}

pub type RiftInstances = Instances<RiftScripting>;
pub type RiftScripts = Scripts<RiftScripting>;

pub fn owner_label(kind: OwnerKind, key: &str, object: Option<&str>) -> String {
    match object {
        Some(object) => format!("{}/{key} › {object}", kind.name()),
        None => format!("{}/{key}", kind.name()),
    }
}

pub fn row_key(content: &Content, row: RowRef) -> String {
    match row {
        RowRef::Area(id) => id.key(content).to_owned(),
        RowRef::Item(id) => id.key(content).to_owned(),
        RowRef::Npc(id) => id.key(content).to_owned(),
        RowRef::Quest(id) => id.key(content).to_owned(),
        RowRef::Shop(id) => id.key(content).to_owned(),
        RowRef::Memory(id) => id.key(content).to_owned(),
        RowRef::Notification(id) => id.key(content).to_owned(),
        RowRef::Job(id) => id.key(content).to_owned(),
    }
}

pub fn owner_of(world: &World, entity: Entity) -> Option<Owner> {
    if world.get::<Npc>(entity).is_some() {
        return Some(Owner::Entity(OwnerKind::Npc, entity));
    }
    if world.get::<AreaObject>(entity).is_some() {
        return Some(Owner::Entity(OwnerKind::Object, entity));
    }
    None
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScriptSite {
    pub file: String,
    pub pointer: String,
}

pub fn build_all(loading: &mut Loading) {
    let content = loading.content();
    let mut all = HashMap::new();
    let mut errors: Vec<(ScriptSite, ScriptError)> = Vec::new();
    let mut bind =
        |row: OwnerRow, label: String, modules: Vec<(ScriptSite, &'static ScriptModule)>| {
            if modules.is_empty() {
                return;
            }
            let scripts: Vec<&'static ScriptModule> =
                modules.iter().map(|(_, module)| *module).collect();
            match compile_owner(&content, row.kind, &label, &scripts) {
                Ok(procedures) => {
                    all.insert(row, procedures);
                }
                Err(failed) => errors.extend(
                    failed
                        .into_iter()
                        .map(|(index, error)| (modules[index].0.clone(), error)),
                ),
            }
        };
    let row_sites =
        |table: &'static str, key: &str, modules: Vec<(usize, &'static ScriptModule)>| {
            modules
                .into_iter()
                .map(|(index, module)| {
                    (
                        ScriptSite {
                            file: row_file(table, key),
                            pointer: format!("/modules/{index}"),
                        },
                        module,
                    )
                })
                .collect::<Vec<_>>()
        };
    for (id, def) in loading.rows::<AreaDef>() {
        let key = id.key(&content);
        bind(
            OwnerRow {
                kind: OwnerKind::Area,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Area, key, None),
            row_sites(AreaDef::TABLE, key, def.scripts()),
        );
        let placed = area::placed(&content, id);
        for (index, object) in area::objects(placed) {
            let name = object
                .name
                .as_deref()
                .or(object.label.as_deref())
                .unwrap_or("object");
            let (file, pointer) = placed[index as usize].site(&content, id);
            let modules = object
                .scripts
                .iter()
                .enumerate()
                .map(|(at, module)| {
                    (
                        ScriptSite {
                            file: file.clone(),
                            pointer: format!("{pointer}/scripts/{at}"),
                        },
                        module,
                    )
                })
                .collect();
            bind(
                OwnerRow {
                    kind: OwnerKind::Object,
                    row: id.raw(),
                    object: Some(index),
                },
                owner_label(OwnerKind::Object, key, Some(name)),
                modules,
            );
        }
    }
    for (id, _) in loading.rows::<AreaDef>() {
        let key = id.key(&content);
        for (ordinal, placement) in area::placements(&content, id).iter().enumerate() {
            if placement.scripts.is_empty() {
                continue;
            }
            let blueprint = placement.blueprint.key(&content);
            let modules = placement
                .scripts
                .iter()
                .enumerate()
                .map(|(at, module)| {
                    (
                        ScriptSite {
                            file: row_file(BlueprintDef::TABLE, blueprint),
                            pointer: format!("/modules/{at}"),
                        },
                        module,
                    )
                })
                .collect();
            bind(
                OwnerRow {
                    kind: OwnerKind::Blueprint,
                    row: id.raw(),
                    object: Some(ordinal as u32),
                },
                owner_label(
                    OwnerKind::Blueprint,
                    blueprint,
                    Some(&format!("{key} {ordinal}")),
                ),
                modules,
            );
        }
    }
    for (id, def) in loading.rows::<NpcDef>() {
        let key = id.key(&content);
        bind(
            OwnerRow {
                kind: OwnerKind::Npc,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Npc, key, None),
            row_sites(NpcDef::TABLE, key, def.scripts()),
        );
    }
    for (id, def) in loading.rows::<ItemDef>() {
        let key = id.key(&content);
        bind(
            OwnerRow {
                kind: OwnerKind::Item,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Item, key, None),
            row_sites(ItemDef::TABLE, key, def.scripts()),
        );
    }
    for (id, def) in loading.rows::<QuestDef>() {
        let key = id.key(&content);
        bind(
            OwnerRow {
                kind: OwnerKind::Quest,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Quest, key, None),
            row_sites(QuestDef::TABLE, key, def.scripts()),
        );
    }
    for (id, def) in loading.rows::<ShopDef>() {
        let key = id.key(&content);
        bind(
            OwnerRow {
                kind: OwnerKind::Shop,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Shop, key, None),
            row_sites(ShopDef::TABLE, key, def.scripts()),
        );
    }
    for (site, error) in errors {
        let (file, pointer) = match (&error.script, &error.node) {
            (Some(script), Some(node)) => {
                (row_file(ScriptDef::TABLE, script), format!("/nodes/{node}"))
            }
            (Some(script), None) => (row_file(ScriptDef::TABLE, script), String::new()),
            (None, Some(node)) => (site.file.clone(), format!("{}/nodes/{node}", site.pointer)),
            (None, None) => (site.file.clone(), site.pointer.clone()),
        };
        let found = match &error.node {
            Some(node) => format!("{node} in {}", error.owner),
            None => error.owner.clone(),
        };
        loading.json_error(file, &pointer, error.rule, found, error.expected, None);
    }
    loading.built(Scripts(Arc::new(all)));
}

fn owner_site(content: &Content, row: OwnerRow) -> ScriptSite {
    let (table, key) = match row.kind {
        OwnerKind::Area | OwnerKind::Object => {
            let area: ContentId<AreaDef> = ContentId::new(row.row);
            if let Some(index) = row.object {
                let (file, pointer) =
                    area::placed(content, area)[index as usize].site(content, area);
                return ScriptSite { file, pointer };
            }
            (AreaDef::TABLE, area.key(content))
        }
        OwnerKind::Npc => (
            NpcDef::TABLE,
            ContentId::<NpcDef>::new(row.row).key(content),
        ),
        OwnerKind::Item => (
            ItemDef::TABLE,
            ContentId::<ItemDef>::new(row.row).key(content),
        ),
        OwnerKind::Quest => (
            QuestDef::TABLE,
            ContentId::<QuestDef>::new(row.row).key(content),
        ),
        OwnerKind::Shop => (
            ShopDef::TABLE,
            ContentId::<ShopDef>::new(row.row).key(content),
        ),
        OwnerKind::Blueprint => {
            let area: ContentId<AreaDef> = ContentId::new(row.row);
            let placement = row
                .object
                .and_then(|ordinal| area::placements(content, area).get(ordinal as usize));
            (
                BlueprintDef::TABLE,
                placement.map_or("", |placement| placement.blueprint.key(content)),
            )
        }
        OwnerKind::Any => (ScriptDef::TABLE, ""),
    };
    ScriptSite {
        file: row_file(table, key),
        pointer: "/modules".to_owned(),
    }
}

pub fn run_tick(world: &mut World) {
    script::run::tick::<RiftScripting>(world);
}

pub fn spawn_stateless(world: &mut World) {
    let scripts = world.resource::<RiftScripts>().clone();
    let area = world.resource::<crate::systems::WorldArea>().0;
    let mut instances = world.resource_mut::<RiftInstances>();
    for (row, procedures) in scripts.owners() {
        let owner = match row.kind {
            OwnerKind::Area if row.row == area.raw() => Owner::Area,
            OwnerKind::Blueprint if row.row == area.raw() => {
                Owner::Row(OwnerKind::Blueprint, row.object.unwrap_or_default())
            }
            OwnerKind::Item | OwnerKind::Quest | OwnerKind::Shop => Owner::Row(row.kind, row.row),
            _ => continue,
        };
        instances.spawn_owner(owner, procedures.clone());
        if matches!(owner, Owner::Area | Owner::Row(OwnerKind::Blueprint, _)) {
            instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
        }
    }
}

pub fn check_all(loading: &mut Loading) {
    let content = loading.content();
    let scripts = content.built::<RiftScripts>();
    for (row, procedures) in scripts.owners() {
        let label = procedures
            .first()
            .map(|procedure| procedure.label.clone())
            .unwrap_or_default();
        let site = owner_site(&content, *row);
        let may_do = scripts.may_do(*row);
        for reach in &may_do.reaches {
            match reach {
                Reach::Warp(place) => {
                    if let Err(problem) = area::check_place(&content, *place) {
                        loading.json_error(
                            &site.file,
                            &site.pointer,
                            problem.rule,
                            format!("{label} warps to {}", problem.found),
                            problem.expected,
                            problem.nearest,
                        );
                    }
                }
                Reach::Speaks(npc) => {
                    if content.table::<NpcDef>().get(*npc).is_none() {
                        continue;
                    }
                    let def = npc.get(&content);
                    if def.voice().is_none() {
                        loading.json_error(
                            &site.file,
                            &site.pointer,
                            "needs a voice",
                            format!("{} speaks in {label}", npc.key(&content)),
                            "an npc with a voice module",
                            None,
                        );
                    }
                    let placed = match row.kind {
                        OwnerKind::Npc => row.row == npc.raw(),
                        OwnerKind::Object | OwnerKind::Area | OwnerKind::Blueprint => {
                            let area: ContentId<AreaDef> = ContentId::new(row.row);
                            area::residents(area::placed(&content, area))
                                .any(|resident| resident == *npc)
                        }
                        _ => false,
                    };
                    if !placed {
                        loading.json_error(
                            &site.file,
                            &site.pointer,
                            "speaker not here",
                            format!("{} in {label}", npc.key(&content)),
                            "a line by the owner itself or a resident of its area",
                            None,
                        );
                    }
                }
                _ => {}
            }
        }
        if row.kind == OwnerKind::Object && may_do.answers(EventKind::Interacted) {
            let area: ContentId<AreaDef> = ContentId::new(row.row);
            let labelled = area::objects(area::placed(&content, area))
                .any(|(index, object)| Some(index) == row.object && object.label.is_some());
            if !labelled {
                loading.json_error(
                    &site.file,
                    &site.pointer,
                    "interactive without label",
                    label.clone(),
                    "a label on every object a script of which answers interacted",
                    None,
                );
            }
        }
    }
    for (id, def) in loading.rows::<ItemDef>() {
        let usable = matches!(def.kind, crate::systems::item::ItemKind::Usable);
        let answers = scripts
            .may_do(OwnerRow {
                kind: OwnerKind::Item,
                row: id.raw(),
                object: None,
            })
            .answers(EventKind::Used);
        if usable && !answers {
            loading.row_error(
                id,
                "/modules",
                "usable without used",
                format!("item/{}", id.key(&content)),
                "a script answering used on every usable item",
                None,
            );
        }
    }
    for (id, _) in loading.rows::<ShopDef>() {
        let opened = scripts.owners().any(|(row, _)| {
            scripts
                .may_do(*row)
                .reaches
                .iter()
                .any(|reach| matches!(reach, Reach::OpensShop(shop) if *shop == id))
        });
        if !opened {
            loading.row_error(
                id,
                "",
                "never opened",
                format!("shop/{}", id.key(&content)),
                "a script that may reach open_shop for it",
                None,
            );
        }
    }
    let parties = crate::systems::quest::Parties::of(&content, scripts);
    crate::systems::quest::check_parties(loading, scripts, &parties);
    loading.built(parties);
}
