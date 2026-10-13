use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::IntoStaticStr;

use crate::core::math::{Pos, Rng};
use crate::core::script::{
    Answer, Compiler, EffectCall, EffectDef, EffectStep, Eval, FlowCx, FlowKey, Name, OwnerKind,
    ValueType,
};
use crate::core::tiling::{TilePos, Tiles};
use crate::systems::actor::{self, Actor};
use crate::systems::area::{self, AreaTag, object};
use crate::systems::dialogue;
use crate::systems::movement;
use crate::systems::npc::{Home, Roams};
use crate::systems::reach::{self, ReachAct};
use crate::systems::script::effect::{self as effects, Arrow, Link};
use crate::systems::script::query;
use crate::systems::script::{Condition, Place, Reach, RiftInstances, RiftScripting};
use crate::systems::stat;
use crate::systems::visibility;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Priority(pub u8);

impl Priority {
    pub fn checked(priority: u8) -> Result<Priority, String> {
        if (1..=9).contains(&priority) {
            Ok(Priority(priority))
        } else {
            Err(format!("priority {priority} is not 1 to 9"))
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Act {
    Wander { leash: Option<Tiles> },
    WalkTo { to: Destination, within: Tiles },
    Attack { target: Entity, within: Tiles },
    Stop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, IntoStaticStr)]
#[strum(serialize_all = "snake_case")]
pub enum Outcome {
    Next,
    Arrived,
    Blocked,
    Defeated,
    Lost,
    Interrupted,
}

impl Outcome {
    pub fn name(self) -> Name {
        self.into()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Destination {
    Place(Pos<Tiles>),
    Object(Entity),
    Actor(Entity),
}

#[derive(Component, Default)]
pub struct Body {
    current: Option<Running>,
    waiting: Vec<Running>,
}

#[derive(Clone, Copy)]
struct Running {
    act: Act,
    priority: Priority,
    flow: Option<FlowKey>,
    started: bool,
}

impl Running {
    fn pauses(&self) -> bool {
        matches!(self.act, Act::WalkTo { .. } | Act::Attack { .. })
    }
}

pub fn order(world: &mut World, npc: Entity, act: Act, priority: Priority, flow: Option<FlowKey>) {
    let running = Running {
        act,
        priority,
        flow,
        started: false,
    };
    let same_as_current = world
        .get::<Body>(npc)
        .and_then(|body| body.current)
        .is_some_and(|current| {
            !current.pauses() && current.act == act && current.priority == priority
        });
    if same_as_current && flow.is_none() {
        return;
    }
    let interrupted = {
        let Some(mut body) = world.get_mut::<Body>(npc) else {
            world.entity_mut(npc).insert(Body {
                current: Some(running),
                waiting: Vec::new(),
            });
            return;
        };
        match body.current {
            Some(current) if current.priority > priority => {
                body.waiting.push(running);
                body.waiting
                    .sort_by_key(|running| std::cmp::Reverse(running.priority));
                return;
            }
            current => {
                body.current = Some(running);
                current
            }
        }
    };
    if let Some(interrupted) = interrupted {
        clear(world, npc);
        answer(world, interrupted, Outcome::Interrupted);
    }
}

pub fn target(world: &World, npc: Entity) -> Option<Entity> {
    match world.get::<Body>(npc)?.current?.act {
        Act::Attack { target, .. } => Some(target),
        _ => None,
    }
}

pub fn face_toward(world: &mut World, npc: Entity, toward: Pos<Tiles>) {
    let Some(at) = movement::position(world, npc) else {
        return;
    };
    let step = toward - at;
    if step.x == 0.0 && step.y == 0.0 {
        return;
    }
    let action = world
        .get::<Actor>(npc)
        .map(|actor| actor.action)
        .unwrap_or_default();
    if let Some(mut actor) = world.get_mut::<Actor>(npc) {
        actor::set_facing(&mut actor, crate::core::math::Direction::from(step), action);
    }
}

pub fn drive(
    world: &mut World,
    bodies: &mut QueryState<Entity, With<Body>>,
    sessions: &mut dialogue::Sessions,
    mut npcs: Local<Vec<Entity>>,
) {
    npcs.clear();
    npcs.extend(bodies.iter(world));
    let talking = dialogue::counterparts(world, sessions);
    for &npc in npcs.iter() {
        if talking.contains(&npc) {
            if movement::moving(world, npc) {
                movement::forget(world, npc);
            }
            continue;
        }
        if stat::is_dead(world, npc) {
            let Some(mut body) = world.get_mut::<Body>(npc) else {
                continue;
            };
            let dropped: Vec<Running> = body
                .current
                .take()
                .into_iter()
                .chain(body.waiting.drain(..))
                .collect();
            for running in dropped {
                answer(world, running, Outcome::Lost);
            }
            continue;
        }
        let Some(current) = world.get::<Body>(npc).and_then(|body| body.current) else {
            start_waiting(world, npc);
            continue;
        };
        let outcome = step(world, npc, current);
        if !current.started
            && let Some(mut body) = world.get_mut::<Body>(npc)
            && let Some(running) = body.current.as_mut()
        {
            running.started = true;
        }
        if let Some(output) = outcome {
            clear(world, npc);
            if let Some(mut body) = world.get_mut::<Body>(npc) {
                body.current = None;
            }
            answer(world, current, output);
            start_waiting(world, npc);
        }
    }
}

fn start_waiting(world: &mut World, npc: Entity) {
    let Some(mut body) = world.get_mut::<Body>(npc) else {
        return;
    };
    if body.current.is_none() && !body.waiting.is_empty() {
        body.current = Some(body.waiting.remove(0));
    }
}

fn clear(world: &mut World, npc: Entity) {
    reach::forget(world, npc);
}

fn answer(world: &mut World, running: Running, outcome: Outcome) {
    if running.pauses()
        && let Some(flow) = running.flow
    {
        world
            .resource_mut::<RiftInstances>()
            .answer(flow, Answer::Output(outcome.name()));
    }
}

fn step(world: &mut World, npc: Entity, running: Running) -> Option<Outcome> {
    match running.act {
        Act::Stop => {
            movement::forget(world, npc);
            Some(Outcome::Next)
        }
        Act::Wander { leash } => {
            if !running.started {
                wander(world, npc, leash);
                return None;
            }
            (!movement::moving(world, npc)).then_some(Outcome::Next)
        }
        Act::WalkTo { to, within } => {
            let Some(goal) = destination(world, npc, to) else {
                return Some(Outcome::Blocked);
            };
            if movement::approach(world, npc, goal, within) {
                movement::forget(world, npc);
                return Some(Outcome::Arrived);
            }
            if running.started && !movement::moving(world, npc) {
                return Some(Outcome::Blocked);
            }
            None
        }
        Act::Attack { target, within } => {
            if !running.started {
                reach::intend(world, npc, target, ReachAct::Attack);
            }
            if world.get_entity(target).is_err() || stat::is_dead(world, target) {
                return Some(Outcome::Defeated);
            }
            let lost = (|| {
                let at = movement::position(world, npc)?;
                let there = movement::position(world, target)?;
                let same_area = world.get::<AreaTag>(npc).map(|tag| tag.area)
                    == world.get::<AreaTag>(target).map(|tag| tag.area);
                let sheltered = area::wild(world, npc)
                    && area::of(world, npc).is_some_and(|area| area.safe(there));
                Some(
                    !same_area
                        || at.distance(there) > within
                        || !visibility::coexist(world, npc, target)
                        || sheltered,
                )
            })()
            .unwrap_or(true);
            if lost {
                return Some(Outcome::Lost);
            }
            if reach::intent(world, npc, ReachAct::Attack) != Some(target) {
                reach::intend(world, npc, target, ReachAct::Attack);
            }
            None
        }
    }
}

fn destination(world: &World, npc: Entity, to: Destination) -> Option<Pos<Tiles>> {
    match to {
        Destination::Place(at) => Some(at),
        Destination::Object(object) => object::shape_of(world, object).map(|shape| shape.center()),
        Destination::Actor(actor) => {
            if stat::is_dead(world, actor) {
                return None;
            }
            if world.get::<AreaTag>(npc).map(|tag| tag.area)
                != world.get::<AreaTag>(actor).map(|tag| tag.area)
            {
                return None;
            }
            movement::position(world, actor)
        }
    }
}

fn wander(world: &mut World, npc: Entity, leash: Option<Tiles>) {
    let Some(at) = movement::position(world, npc) else {
        return;
    };
    let Some(area) = area::of(world, npc) else {
        return;
    };
    let grid = area.grid_for(area::wild(world, npc));
    let home = world.get::<Home>(npc).map(|home| home.0);
    let roams = world.get::<Roams>(npc).map(|roams| roams.0);
    let goal = {
        let mut rng = world.resource_mut::<Rng>();
        match (leash.zip(home), roams) {
            (Some((leash, home)), _) => (0..16)
                .filter_map(|_| grid.random_reachable(&mut rng, at))
                .find(|node| node.distance(home) <= leash),
            (None, Some(roams)) => grid.random_reachable_within(&mut rng, at, roams),
            (None, None) => grid.random_reachable(&mut rng, at),
        }
    };
    if let Some(goal) = goal {
        movement::goto(world, npc, goal);
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Wander {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leash: Option<Condition>,
    pub priority: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct WalkTo {
    pub to: WalkTarget,
    pub within: Condition,
    pub priority: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrived: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interrupted: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WalkTarget {
    Place(Place),
    Object(String),
    Actor(Condition),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Attack {
    pub target: Condition,
    pub within: Condition,
    pub priority: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defeated: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lost: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interrupted: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Stop {
    pub priority: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct FaceToward {
    pub toward: FaceTarget,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FaceTarget {
    Place(Place),
    Actor(Condition),
}

type Aimed<T> = Box<dyn Fn(&World, &FlowCx) -> Option<T> + Send + Sync>;

const NPC: &[OwnerKind] = &[OwnerKind::Npc];
const WALK_BLOCKED: usize = 1;
const ATTACK_LOST: usize = 1;

impl EffectDef<RiftScripting> for Wander {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![(Outcome::Next.name(), self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let priority = Priority::checked(self.priority)?;
        let leash = cx
            .opt_expr(self.leash.as_ref(), ValueType::Number)
            .map_err(effects::bad)?;
        Ok(Box::new(move |world, cx| {
            let leash = leash
                .as_ref()
                .map(|leash| Tiles(leash(world, cx).as_num() as f32));
            if let Some(npc) = cx.owner.entity() {
                order(world, npc, Act::Wander { leash }, priority, None);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Walks]
    }
}

impl EffectDef<RiftScripting> for WalkTo {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            (Outcome::Arrived.name(), self.arrived.as_deref()),
            (Outcome::Blocked.name(), self.blocked.as_deref()),
            (Outcome::Interrupted.name(), self.interrupted.as_deref()),
        ]
    }
    fn pauses(&self) -> bool {
        true
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let priority = Priority::checked(self.priority)?;
        let within = cx
            .expr(&self.within, ValueType::Number)
            .map_err(effects::bad)?;
        let to: Aimed<Destination> = match &self.to {
            WalkTarget::Place(place) => {
                let at = place.at;
                Box::new(move |_, _| Some(Destination::Place(at)))
            }
            WalkTarget::Object(name) => {
                let name = name.as_str();
                Box::new(move |world, cx| {
                    let area = cx
                        .owner
                        .entity()
                        .and_then(|npc| world.get::<AreaTag>(npc))?
                        .area;
                    object::named(world, area, name).map(Destination::Object)
                })
            }
            WalkTarget::Actor(actor) => {
                let actor: Eval = cx.expr(actor, ValueType::Actor).map_err(effects::bad)?;
                Box::new(move |world, cx| query::actor(world, cx, &actor).map(Destination::Actor))
            }
        };
        Ok(Box::new(move |world, cx| {
            let Some(npc) = cx.owner.entity() else {
                return EffectStep::Output(WALK_BLOCKED);
            };
            let Some(to) = to(world, cx) else {
                return EffectStep::Output(WALK_BLOCKED);
            };
            let within = Tiles(within(world, cx).as_num() as f32);
            order(
                world,
                npc,
                Act::WalkTo { to, within },
                priority,
                Some(cx.key),
            );
            EffectStep::Pause
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Walks]
    }
}

impl EffectDef<RiftScripting> for Attack {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![
            (Outcome::Defeated.name(), self.defeated.as_deref()),
            (Outcome::Lost.name(), self.lost.as_deref()),
            (Outcome::Interrupted.name(), self.interrupted.as_deref()),
        ]
    }
    fn pauses(&self) -> bool {
        true
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let priority = Priority::checked(self.priority)?;
        let target = cx
            .expr(&self.target, ValueType::Actor)
            .map_err(effects::bad)?;
        let within = cx
            .expr(&self.within, ValueType::Number)
            .map_err(effects::bad)?;
        Ok(Box::new(move |world, cx| {
            let Some(npc) = cx.owner.entity() else {
                return EffectStep::Output(ATTACK_LOST);
            };
            let Some(target) = query::actor(world, cx, &target) else {
                return EffectStep::Output(ATTACK_LOST);
            };
            let within = Tiles(within(world, cx).as_num() as f32);
            order(
                world,
                npc,
                Act::Attack { target, within },
                priority,
                Some(cx.key),
            );
            EffectStep::Pause
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![crate::systems::script::Reach::Targets]
    }
}

impl EffectDef<RiftScripting> for Stop {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![(Outcome::Next.name(), self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, _cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let priority = Priority::checked(self.priority)?;
        Ok(Box::new(move |world, cx| {
            if let Some(npc) = cx.owner.entity() {
                order(world, npc, Act::Stop, priority, None);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}

impl EffectDef<RiftScripting> for FaceToward {
    fn owners(&self) -> &'static [OwnerKind] {
        NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![(Outcome::Next.name(), self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let toward: Aimed<Pos<Tiles>> = match &self.toward {
            FaceTarget::Place(place) => {
                let at = place.at;
                Box::new(move |_, _| Some(at))
            }
            FaceTarget::Actor(actor) => {
                let actor: Eval = cx.expr(actor, ValueType::Actor).map_err(effects::bad)?;
                Box::new(move |world, cx| {
                    query::actor(world, cx, &actor).and_then(|who| movement::position(world, who))
                })
            }
        };
        Ok(Box::new(move |world, cx| {
            if let (Some(npc), Some(at)) = (cx.owner.entity(), toward(world, cx)) {
                face_toward(world, npc, at);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        Vec::new()
    }
}
