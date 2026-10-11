pub mod render;

use bevy_app::App;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::assets::AssetRef;
use crate::core::content::Content;
use crate::core::math::{Offset, Pos, Rect, Size};
use crate::core::script::{Name, Owner, OwnerKind};
use crate::core::tiling::{Cell, CellPos, TilePos, Tiles};
use crate::systems::actor::{Hitbox, Name as ActorName};
use crate::systems::area::{self, AreaModule, AreaTag};
use crate::systems::dialogue;
use crate::systems::interact::Interactive;
use crate::systems::movement::Position;
use crate::systems::npc::Npc;
use crate::systems::player::Owner as PlayerOwner;
use crate::systems::script::condition::CompiledCondition;
use crate::systems::script::{
    self, Condition, EventKind, Place, RiftEvent, RiftInstances, ScriptModule,
};
use crate::systems::visibility::Presence;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<AreaObject>();
}

#[derive(Clone)]
pub struct ObjectDef {
    pub name: Option<Name>,
    pub label: Option<&'static str>,
    pub shape: ObjectShape,
    pub look: Option<AssetRef>,
    pub shown: Option<&'static Condition>,
    pub scripts: &'static [ScriptModule],
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum ObjectShape {
    Point(Pos<Tiles>),
    Rect(Rect<Tiles>),
}

impl ObjectShape {
    pub fn covers(&self, at: Pos<Tiles>) -> bool {
        self.covers_cell(at.cell())
    }

    pub fn covers_cell(&self, cell: CellPos) -> bool {
        match self {
            ObjectShape::Point(point) => point.cell() == cell,
            ObjectShape::Rect(rect) => rect.contains(cell.center()),
        }
    }

    pub fn origin(&self) -> Pos<Tiles> {
        match self {
            ObjectShape::Point(point) => *point,
            ObjectShape::Rect(rect) => rect.origin,
        }
    }

    pub fn center(&self) -> Pos<Tiles> {
        match self {
            ObjectShape::Point(point) => *point,
            ObjectShape::Rect(rect) => rect.center(),
        }
    }

    pub fn bounds(&self) -> Rect<Tiles> {
        match self {
            ObjectShape::Point(point) => {
                Rect::new(*point - Offset::new(0.5, 0.5), Size::new(1.0, 1.0))
            }
            ObjectShape::Rect(rect) => *rect,
        }
    }

    pub fn overlaps(&self, other: &ObjectShape) -> bool {
        let a = self.bounds();
        let b = other.bounds();
        a.origin.x < b.origin.x + b.size.width
            && b.origin.x < a.origin.x + a.size.width
            && a.origin.y < b.origin.y + b.size.height
            && b.origin.y < a.origin.y + a.size.height
    }
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AreaObject {
    pub index: u32,
    pub name: Option<String>,
    pub label: Option<String>,
    pub shape: ObjectShape,
    pub look: Option<String>,
    pub warp: Option<Place>,
}

#[derive(Component, Default)]
pub struct InsideObjects(Vec<Entity>);

pub fn spawn_all(world: &mut World) {
    let zone = world.resource::<crate::systems::WorldArea>().0;
    let content = *world.resource::<Content>();
    let scripts = world.resource::<script::RiftScripts>().clone();
    let def = zone.get(&content);
    for (index, module) in def.modules.iter().enumerate() {
        let AreaModule::Object(object) = module else {
            continue;
        };
        let owner_row = crate::core::script::OwnerRow {
            kind: OwnerKind::Object,
            row: zone.raw(),
            object: Some(index as u32),
        };
        let procedures = scripts.of(owner_row).to_vec();
        let may_do = scripts.may_do(owner_row);
        let interactive = procedures
            .iter()
            .flat_map(|procedure| procedure.entry(EventKind::Interacted))
            .find_map(|(_, event)| match event {
                RiftEvent::Interacted { verb, reach, .. } => Some(Interactive {
                    verb: *verb,
                    reach: *reach,
                }),
                _ => None,
            });
        let warp = may_do.reaches.iter().find_map(|reach| match reach {
            script::Reach::Warp(place) => Some(*place),
            _ => None,
        });
        let bounds = object.shape.bounds();
        let mut entity = world.spawn((
            Position {
                pos: match object.shape {
                    ObjectShape::Point(point) => point,
                    ObjectShape::Rect(rect) => Pos::new(
                        rect.origin.x + rect.size.width / 2.0 - 0.5,
                        rect.origin.y + rect.size.height - 1.0,
                    ),
                },
            },
            AreaTag { area: zone },
            AreaObject {
                index: index as u32,
                name: object.name.map(str::to_owned),
                label: object.label.map(str::to_owned),
                shape: object.shape,
                look: object.look.map(|look| look.0.to_owned()),
                warp,
            },
        ));
        if object.look.is_some() || object.label.is_some() || interactive.is_some() {
            entity.insert(bevy_replicon::prelude::Replicated);
        }
        if object.look.is_some() || interactive.is_some() {
            entity.insert(Hitbox {
                size: Size::new(bounds.size.width, bounds.size.height),
            });
        }
        if let Some(label) = object.label {
            entity.insert(ActorName {
                name: label.to_owned(),
            });
        }
        if let Some(interactive) = interactive {
            entity.insert(interactive);
        }
        if let Some(shown) = object.shown {
            entity.insert(Presence::When(CompiledCondition::new(&content, shown)));
        }
        let id = entity.id();
        let owner = Owner::Entity(OwnerKind::Object, id);
        let mut instances = world.resource_mut::<RiftInstances>();
        instances.spawn_owner(owner, procedures);
        instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
    }
}

pub fn named(world: &World, area: area::Id, name: &str) -> Option<Entity> {
    world.iter_entities().find_map(|entity| {
        let object = entity.get::<AreaObject>()?;
        let tag = entity.get::<AreaTag>()?;
        (tag.area == area && object.name.as_deref() == Some(name)).then_some(entity.id())
    })
}

pub fn inside(world: &World, actor: Entity, name: &str) -> bool {
    let Some(tag) = world.get::<AreaTag>(actor) else {
        return false;
    };
    let Some(at) = world.get::<Position>(actor) else {
        return false;
    };
    named(world, tag.area, name)
        .and_then(|object| world.get::<AreaObject>(object))
        .is_some_and(|object| object.shape.covers(at.pos))
}

pub fn shape_of(world: &World, object: Entity) -> Option<ObjectShape> {
    world.get::<AreaObject>(object).map(|object| object.shape)
}

type Actors =
    QueryState<(Entity, &'static Position, &'static AreaTag), Or<(With<PlayerOwner>, With<Npc>)>>;

pub fn track(
    world: &mut World,
    actors: &mut Actors,
    objects: &mut QueryState<(Entity, &AreaObject, &AreaTag)>,
    mut now: Local<Vec<Entity>>,
) {
    let instances = world.resource::<RiftInstances>();
    let crossed = |object: Entity| {
        [EventKind::Entered, EventKind::Left].iter().any(|kind| {
            instances
                .owners_answering(*kind)
                .contains(&Owner::Entity(OwnerKind::Object, object))
        })
    };
    let placed: Vec<(Entity, ObjectShape, area::Id)> = objects
        .iter(world)
        .filter(|(entity, ..)| crossed(*entity))
        .map(|(entity, object, tag)| (entity, object.shape, tag.area))
        .collect();
    if placed.is_empty() {
        return;
    }
    let positions: Vec<(Entity, Pos<Tiles>, area::Id)> = actors
        .iter(world)
        .map(|(entity, at, tag)| (entity, at.pos, tag.area))
        .collect();
    for (actor, at, area_id) in positions {
        let cell = at.cell();
        now.clear();
        now.extend(
            placed
                .iter()
                .filter(|(_, shape, area)| *area == area_id && shape.covers_cell(cell))
                .filter(|(object, _, _)| crate::systems::visibility::present(world, *object, actor))
                .map(|(object, _, _)| *object),
        );
        now.sort_unstable();
        let unchanged = world
            .get::<InsideObjects>(actor)
            .map_or(now.is_empty(), |inside| inside.0 == *now);
        if unchanged {
            continue;
        }
        let before: Vec<Entity> = world
            .get::<InsideObjects>(actor)
            .map(|inside| inside.0.clone())
            .unwrap_or_default();
        let talking = dialogue::in_conversation(world, actor);
        let is_npc = world.get::<Npc>(actor).is_some();
        let mut after = before.clone();
        for object in now.iter().filter(|object| !before.contains(object)) {
            if talking {
                continue;
            }
            after.push(*object);
            raise_crossing(world, *object, EventKind::Entered, actor, is_npc);
        }
        for object in before.iter().filter(|object| !now.contains(object)) {
            after.retain(|kept| kept != object);
            raise_crossing(world, *object, EventKind::Left, actor, is_npc);
        }
        after.sort_unstable();
        if after != before {
            world.entity_mut(actor).insert(InsideObjects(after));
        }
    }
}

fn raise_crossing(world: &mut World, object: Entity, kind: EventKind, actor: Entity, is_npc: bool) {
    world.resource_mut::<RiftInstances>().raise(
        Owner::Entity(OwnerKind::Object, object),
        kind,
        Some(actor),
        Vec::new(),
        move |event| match event {
            RiftEvent::Entered { by } | RiftEvent::Left { by } => by.admits(is_npc),
            _ => false,
        },
    );
}
