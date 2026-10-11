pub mod condition;
pub mod effect;
pub mod event;
pub mod query;

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::audio::playback::SfxId;
use crate::core::content::{Content, ContentId};
use crate::core::math::Pos;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::assets::AssetService;
use crate::core::script::{
    self, BoxEnding, DialogueView, Expr, FlowKey, Instances, LineDef, Name, Owner, OwnerKind,
    OwnerRow, ScriptError, Scripts, Vocabulary, compile::compile_owner,
};
use crate::core::tiling::Tiles;
use crate::data;
use crate::systems::actor::bust::Face;
use crate::systems::area::{self, AreaDef, AreaObject};
use crate::systems::dialogue;
use crate::systems::item::ItemDef;
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

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Place {
    pub area: data::area::Id,
    pub at: Pos<Tiles>,
}

impl Serialize for Place {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("area", &self.area)?;
        map.serialize_entry("x", &self.at.x)?;
        map.serialize_entry("y", &self.at.y)?;
        map.end()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum RowRef {
    Area(data::area::Id),
    Item(data::item::Id),
    Npc(data::npc::Id),
    Quest(data::quest::Id),
    Shop(data::shop::Id),
    Memory(data::memory::Id),
    Notification(data::notification::Id),
    Job(data::job::Id),
}

#[derive(Clone, Copy)]
pub struct Line {
    pub by: Speaker,
    pub face: Option<Face>,
    pub text: &'static [Span],
}

impl Serialize for Line {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("by", &SpeakerRow(self.by, self.face))?;
        map.serialize_entry("text", self.text)?;
        map.end()
    }
}

struct SpeakerRow(Speaker, Option<Face>);

impl Serialize for SpeakerRow {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        match self.0 {
            Speaker::Npc(npc) => {
                map.serialize_entry("type", "npc")?;
                map.serialize_entry("npc", &npc)?;
                if let Some(face) = self.1 {
                    map.serialize_entry("face", &face)?;
                }
            }
            Speaker::Object => map.serialize_entry("type", "object")?,
            Speaker::Narrator => map.serialize_entry("type", "narrator")?,
            Speaker::Player => map.serialize_entry("type", "player")?,
        }
        map.end()
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Speaker {
    Npc(data::npc::Id),
    Object,
    Narrator,
    Player,
}

impl LineDef<RiftScripting> for Line {
    fn values(&self) -> Vec<&'static Expr<RiftScripting>> {
        self.text
            .iter()
            .filter_map(|span| match span {
                Span::Value { value, .. } => Some(*value),
                _ => None,
            })
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reach {
    Warp(Place),
    Takes(data::item::Id),
    Gives(data::item::Id),
    Drops(data::item::Id),
    Offers(data::quest::Id),
    Accepts(data::quest::Id),
    TurnsIn(data::quest::Id),
    Fails(data::quest::Id),
    Completes(data::quest::Id),
    Remembers(data::memory::Id),
    OpensShop(data::shop::Id),
    Spawns(data::npc::Id),
    Hostile,
    Friendly,
    Despawns,
    Targets,
    Walks,
    Damages,
    Heals,
    Buffs,
    GrantsXp,
    SetsJob(data::job::Id),
    Notifies(data::notification::Id),
    Says,
    Plays(SfxId),
    Speaks(data::npc::Id),
}

impl Vocabulary for RiftScripting {
    type Event = RiftEvent;
    type Query = RiftQuery;
    type Effect = RiftEffect;
    type Line = Line;
    type Text = &'static [Span];
    type Place = Place;
    type Row = RowRef;
    type Audio = SfxId;
    type Reach = Reach;

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

pub const fn choice(label: &'static [Span], to: script::Arrow) -> Choice {
    Choice {
        label,
        requires: None,
        reveal: &[],
        warn: None,
        to,
    }
}

pub fn owner_label(kind: OwnerKind, key: &str, object: Option<Name>) -> String {
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

pub fn build(content: &Content) -> Result<RiftScripts, ScriptError> {
    let mut all = HashMap::new();
    let mut bind =
        |row: OwnerRow, label: String, modules: Vec<ScriptModule>| -> Result<(), ScriptError> {
            if modules.is_empty() {
                return Ok(());
            }
            let procedures = compile_owner(content, row.kind, &label, &modules)?;
            all.insert(row, procedures);
            Ok(())
        };
    for (id, def) in content.table::<AreaDef>().iter() {
        let key = id.key(content);
        bind(
            OwnerRow {
                kind: OwnerKind::Area,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Area, key, None),
            def.scripts(),
        )?;
        for (index, object) in def.objects() {
            let name = object.name.or(object.label).unwrap_or("object");
            bind(
                OwnerRow {
                    kind: OwnerKind::Object,
                    row: id.raw(),
                    object: Some(index),
                },
                owner_label(OwnerKind::Object, key, Some(name)),
                object.scripts.to_vec(),
            )?;
        }
    }
    for (id, def) in content.table::<NpcDef>().iter() {
        bind(
            OwnerRow {
                kind: OwnerKind::Npc,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Npc, id.key(content), None),
            def.scripts(),
        )?;
    }
    for (id, def) in content.table::<ItemDef>().iter() {
        bind(
            OwnerRow {
                kind: OwnerKind::Item,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Item, id.key(content), None),
            def.scripts(),
        )?;
    }
    for (id, def) in content.table::<QuestDef>().iter() {
        bind(
            OwnerRow {
                kind: OwnerKind::Quest,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Quest, id.key(content), None),
            def.scripts(),
        )?;
    }
    for (id, def) in content.table::<ShopDef>().iter() {
        bind(
            OwnerRow {
                kind: OwnerKind::Shop,
                row: id.raw(),
                object: None,
            },
            owner_label(OwnerKind::Shop, id.key(content), None),
            def.scripts(),
        )?;
    }
    Ok(Scripts(Arc::new(all)))
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
            OwnerKind::Item | OwnerKind::Quest | OwnerKind::Shop => Owner::Row(row.kind, row.row),
            _ => continue,
        };
        instances.spawn_owner(owner, procedures.clone());
        if owner == Owner::Area {
            instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
        }
    }
}

pub fn check(assets: &AssetService, scripts: &RiftScripts) {
    let content = assets.content();
    for (row, procedures) in scripts.owners() {
        let label = procedures
            .first()
            .map(|procedure| procedure.label.clone())
            .unwrap_or_default();
        let may_do = scripts.may_do(*row);
        for reach in &may_do.reaches {
            match reach {
                Reach::Warp(place) => {
                    let map = area::load(assets, place.area);
                    if !map.grid.walkable(place.at) {
                        panic!(
                            "{label}: warps to {:?} at {:?}, which isn't walkable",
                            place.area.key(content),
                            place.at
                        );
                    }
                }
                Reach::Speaks(npc) => {
                    let def = npc.get(content);
                    if def.voice().is_none() {
                        panic!("{label}: {} speaks without a voice", def.name);
                    }
                    let placed = match row.kind {
                        OwnerKind::Npc => row.row == npc.raw(),
                        OwnerKind::Object | OwnerKind::Area => {
                            let area: ContentId<AreaDef> = ContentId::new(row.row);
                            area.get(content)
                                .residents()
                                .any(|resident| resident == *npc)
                        }
                        _ => false,
                    };
                    if !placed {
                        panic!(
                            "{label}: {} speaks here but is neither the owner nor a resident",
                            def.name
                        );
                    }
                }
                _ => {}
            }
        }
        if row.kind == OwnerKind::Object && may_do.answers(EventKind::Interacted) {
            let area: ContentId<AreaDef> = ContentId::new(row.row);
            let labelled = area
                .get(content)
                .objects()
                .any(|(index, object)| Some(index) == row.object && object.label.is_some());
            if !labelled {
                panic!("{label}: interactive, but has no label");
            }
        }
    }
    for (id, def) in content.table::<ItemDef>().iter() {
        let usable = matches!(def.kind, crate::systems::item::ItemKind::Usable);
        let answers = scripts
            .may_do(OwnerRow {
                kind: OwnerKind::Item,
                row: id.raw(),
                object: None,
            })
            .answers(EventKind::Used);
        if usable && !answers {
            panic!("item/{}: usable, but nothing answers used", id.key(content));
        }
    }
    for (id, _) in content.table::<ShopDef>().iter() {
        let opened = scripts.owners().any(|(row, _)| {
            scripts
                .may_do(*row)
                .reaches
                .iter()
                .any(|reach| matches!(reach, Reach::OpensShop(shop) if *shop == id))
        });
        if !opened {
            panic!("shop/{}: nothing opens it", id.key(content));
        }
    }
}
