use std::collections::VecDeque;
use std::sync::Arc;

use bevy_ecs::prelude::*;
use bevy_platform::collections::HashMap;
use bevy_time::Time;
use slotmap::{SlotMap, new_key_type};
use smallvec::{SmallVec, smallvec};

use super::compile::{EffectStep, Next, Procedure, Slot, Step};
use super::dialogue::{ChoiceOffer, DialogueView};
use super::may_do::MayDo;
use super::node::MAX_LIVE_FLOWS;
use super::value::Value;
use super::{EffectDef, EventDef, Name, OwnerKind, Vocabulary};
use crate::core::math::Rng;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Owner {
    Area,
    Entity(OwnerKind, Entity),
    Row(OwnerKind, u32),
}

impl Owner {
    pub fn kind(self) -> OwnerKind {
        match self {
            Owner::Area => OwnerKind::Area,
            Owner::Entity(kind, _) | Owner::Row(kind, _) => kind,
        }
    }

    pub fn entity(self) -> Option<Entity> {
        match self {
            Owner::Entity(_, entity) => Some(entity),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct FlowKey {
    pub owner: Owner,
    pub flow: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Pause {
    Wait { until: f64 },
    NextTick { tick: u64 },
    Step { tick: u64 },
    Dialogue,
    Effect { keeps_box: bool },
}

#[derive(Clone, Debug, PartialEq)]
pub enum Answer {
    Output(Name),
    Pick(usize),
    Left,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoxEnding {
    Ended,
    Left,
    Gone,
}

pub type Locals = SmallVec<[Value; 2]>;

pub struct FlowCx {
    pub key: FlowKey,
    pub owner: Owner,
    pub subject: Option<Entity>,
    pub locals: Locals,
    pub state: Vec<Value>,
    pub event: Vec<Value>,
}

impl FlowCx {
    pub fn event_field(&self, index: usize) -> Value {
        self.event.get(index).cloned().unwrap_or(Value::Int(0))
    }
}

type Accept<V> = Box<dyn Fn(&<V as Vocabulary>::Event) -> bool + Send + Sync>;

enum Op<V: Vocabulary> {
    Spawn {
        owner: Owner,
        procedures: Vec<Arc<Procedure<V>>>,
    },
    Remove {
        owner: Owner,
    },
    Raise {
        owner: Owner,
        kind: <V::Event as EventDef>::Kind,
        subject: Option<Entity>,
        event: Vec<Value>,
        accept: Accept<V>,
    },
    Answer {
        key: FlowKey,
        answer: Answer,
    },
    BoxClosed {
        key: FlowKey,
    },
}

#[derive(Resource)]
pub struct Instances<V: Vocabulary> {
    instances: HashMap<Owner, Instance<V>>,
    answering: HashMap<<V::Event as EventDef>::Kind, Vec<Owner>>,
    ops: VecDeque<Op<V>>,
    queue: VecDeque<Queued>,
    flows: SlotMap<FlowSlot, Option<Flow<V>>>,
    by_id: HashMap<u64, FlowSlot>,
    due: Vec<FlowKey>,
    next_flow: u64,
    tick: u64,
}

new_key_type! {
    struct FlowSlot;
}

impl<V: Vocabulary> Default for Instances<V> {
    fn default() -> Self {
        Instances {
            instances: HashMap::new(),
            answering: HashMap::new(),
            ops: VecDeque::new(),
            queue: VecDeque::new(),
            flows: SlotMap::with_key(),
            by_id: HashMap::new(),
            due: Vec::new(),
            next_flow: 1,
            tick: 0,
        }
    }
}

enum Queued {
    Start {
        owner: Owner,
        procedure: usize,
        entry: usize,
        subject: Option<Entity>,
        event: Vec<Value>,
    },
    Resume {
        key: FlowKey,
        answer: Answer,
    },
}

struct Instance<V: Vocabulary> {
    procedures: Vec<Arc<Procedure<V>>>,
    may_do: MayDo<V>,
    answered: Vec<<V::Event as EventDef>::Kind>,
    state: HashMap<u64, Vec<Value>>,
    flows: Vec<FlowSlot>,
}

struct Flow<V: Vocabulary> {
    owner: Owner,
    id: u64,
    procedure: usize,
    entry: usize,
    subject: Option<Entity>,
    event: Vec<Value>,
    frames: SmallVec<[Frame<V>; 1]>,
    pause: Option<Pause>,
    box_open: bool,
}

struct Frame<V: Vocabulary> {
    procedure: Arc<Procedure<V>>,
    node: Option<usize>,
    locals: Locals,
    loops: Vec<(usize, u32)>,
    into: Option<usize>,
    return_to: Next,
}

impl<V: Vocabulary> Instances<V> {
    pub fn spawn_owner(&mut self, owner: Owner, procedures: Vec<Arc<Procedure<V>>>) {
        self.ops.push_back(Op::Spawn { owner, procedures });
    }

    pub fn remove_owner(&mut self, owner: Owner) {
        self.ops.push_back(Op::Remove { owner });
    }

    pub fn raise(
        &mut self,
        owner: Owner,
        kind: <V::Event as EventDef>::Kind,
        subject: Option<Entity>,
        event: Vec<Value>,
        accept: impl Fn(&V::Event) -> bool + Send + Sync + 'static,
    ) {
        self.ops.push_back(Op::Raise {
            owner,
            kind,
            subject,
            event,
            accept: Box::new(accept),
        });
    }

    pub fn answer(&mut self, key: FlowKey, answer: Answer) {
        self.ops.push_back(Op::Answer { key, answer });
    }

    pub fn box_closed(&mut self, key: FlowKey) {
        self.ops.push_back(Op::BoxClosed { key });
    }

    pub fn has_owner(&self, owner: Owner) -> bool {
        self.instances.contains_key(&owner)
    }

    pub fn owners(&self) -> impl Iterator<Item = Owner> + '_ {
        self.instances.keys().copied()
    }

    pub fn may_do(&self, owner: Owner) -> Option<&MayDo<V>> {
        self.instances.get(&owner).map(|instance| &instance.may_do)
    }

    pub fn owners_answering(&self, kind: <V::Event as EventDef>::Kind) -> &[Owner] {
        self.answering.get(&kind).map_or(&[], Vec::as_slice)
    }

    pub fn answers(&self, owner: Owner, kind: <V::Event as EventDef>::Kind) -> bool {
        self.instances
            .get(&owner)
            .is_some_and(|instance| instance.answered.contains(&kind))
    }

    pub fn entries(
        &self,
        owner: Owner,
        kind: <V::Event as EventDef>::Kind,
    ) -> impl Iterator<Item = &V::Event> {
        self.instances
            .get(&owner)
            .into_iter()
            .flat_map(|instance| instance.procedures.iter())
            .flat_map(move |procedure| {
                procedure
                    .entries
                    .iter()
                    .filter(move |(_, event)| event.kind() == kind)
                    .map(|(_, event)| event)
            })
    }

    pub fn next_dialogue(
        &self,
        world: &World,
        owner: Owner,
        kind: <V::Event as EventDef>::Kind,
        subject: Entity,
    ) -> Vec<(String, Name)> {
        let Some(instance) = self.instances.get(&owner) else {
            return Vec::new();
        };
        let mut found = Vec::new();
        for procedure in &instance.procedures {
            for (entry, _) in procedure.entry(kind) {
                let cx = FlowCx {
                    key: FlowKey {
                        owner,
                        flow: PEEK_FLOW,
                    },
                    owner,
                    subject: Some(subject),
                    locals: procedure.locals.iter().map(|(_, ty)| ty.zero()).collect(),
                    state: instance
                        .state
                        .get(&procedure.id)
                        .cloned()
                        .unwrap_or_else(|| {
                            procedure.state.iter().map(|(_, ty)| ty.zero()).collect()
                        }),
                    event: Vec::new(),
                };
                if let Some(node) = peek_dialogue(world, procedure, entry, cx) {
                    found.push((procedure.label.clone(), procedure.names[node]));
                }
            }
        }
        found
    }

    pub fn pause_of(&self, key: FlowKey) -> Option<Pause> {
        self.flow(key).and_then(|flow| flow.pause)
    }

    pub fn subject_of(&self, key: FlowKey) -> Option<Entity> {
        self.flow(key).and_then(|flow| flow.subject)
    }

    pub fn live_flows(&self, owner: Owner) -> usize {
        self.instances
            .get(&owner)
            .map_or(0, |instance| instance.flows.len())
    }

    fn flow(&self, key: FlowKey) -> Option<&Flow<V>> {
        let slot = *self.by_id.get(&key.flow)?;
        self.flows.get(slot)?.as_ref()
    }

    fn flow_mut(&mut self, key: FlowKey) -> Option<&mut Flow<V>> {
        let slot = *self.by_id.get(&key.flow)?;
        self.flows.get_mut(slot)?.as_mut()
    }
}

pub fn choice_open<V: Vocabulary>(world: &mut World, key: FlowKey, choice: usize) -> Option<bool> {
    let (procedure, node, cx) = {
        let mut instances = world.resource_mut::<Instances<V>>();
        let state = flow_state(&mut instances, key);
        let flow = flow_mut(&mut instances, key)?;
        if flow.pause != Some(Pause::Dialogue) {
            return None;
        }
        let subject = flow.subject;
        let event = flow.event.clone();
        let frame = flow.frames.last_mut()?;
        let node = frame.node?;
        let procedure = frame.procedure.clone();
        if !matches!(procedure.steps[node], Step::Dialogue { .. }) {
            return None;
        }
        let cx = FlowCx {
            key,
            owner: key.owner,
            subject,
            locals: std::mem::take(&mut frame.locals),
            state,
            event,
        };
        (procedure, node, cx)
    };
    let open = match &procedure.steps[node] {
        Step::Dialogue { requires, .. } => requires.get(choice).map(|requires| {
            requires
                .as_ref()
                .is_none_or(|requires| requires(world, &cx).truthy())
        }),
        _ => None,
    };
    restore(&mut world.resource_mut::<Instances<V>>(), key, cx);
    open
}

pub fn tick<V: Vocabulary>(world: &mut World) {
    if !world.contains_resource::<Instances<V>>() {
        return;
    }
    let now = world.resource::<Time>().elapsed_secs_f64();
    let tick = {
        let mut instances = world.resource_mut::<Instances<V>>();
        instances.tick += 1;
        let tick = instances.tick;
        let mut due = std::mem::take(&mut instances.due);
        due.clear();
        for flow in instances.flows.values().flatten() {
            let ready = match flow.pause {
                Some(Pause::Wait { until }) => until <= now,
                Some(Pause::NextTick { tick: at }) | Some(Pause::Step { tick: at }) => at <= tick,
                _ => false,
            };
            if ready {
                due.push(FlowKey {
                    owner: flow.owner,
                    flow: flow.id,
                });
            }
        }
        due.sort_by_key(|key| key.flow);
        for key in due.drain(..) {
            instances.queue.push_back(Queued::Resume {
                key,
                answer: Answer::Output("next"),
            });
        }
        instances.due = due;
        tick
    };
    let clock = TickClock { tick, now };
    let mut rounds = 0;
    loop {
        let picked = {
            let mut instances = world.resource_mut::<Instances<V>>();
            let pending_ops = !instances.ops.is_empty();
            if pending_ops {
                apply_ops::<V>(world);
                continue;
            }
            match instances.queue.pop_front() {
                None => break,
                Some(Queued::Start {
                    owner,
                    procedure,
                    entry,
                    subject,
                    event,
                }) => instances
                    .start_flow(owner, procedure, entry, subject, event)
                    .map(|(key, flow)| Picked::Start(key, flow)),
                Some(Queued::Resume { key, answer }) => instances
                    .take_flow(key)
                    .map(|flow| Picked::Resume(key, flow, answer)),
            }
        };
        match picked {
            Some(Picked::Start(key, flow)) => run_flow::<V>(world, key, flow, clock),
            Some(Picked::Resume(key, flow, answer)) => {
                if let Some(flow) = resume::<V>(world, key, flow, answer) {
                    run_flow::<V>(world, key, flow, clock);
                }
            }
            None => {}
        }
        rounds += 1;
        if rounds > 100_000 {
            break;
        }
    }
}

#[derive(Clone, Copy)]
struct TickClock {
    tick: u64,
    now: f64,
}

enum Picked<V: Vocabulary> {
    Start(FlowKey, Flow<V>),
    Resume(FlowKey, Flow<V>, Answer),
}

impl<V: Vocabulary> Instances<V> {
    fn start_flow(
        &mut self,
        owner: Owner,
        procedure: usize,
        entry: usize,
        subject: Option<Entity>,
        event: Vec<Value>,
    ) -> Option<(FlowKey, Flow<V>)> {
        let instance = self.instances.get_mut(&owner)?;
        let id = self.next_flow;
        self.next_flow += 1;
        let slot = self.flows.insert(None);
        self.by_id.insert(id, slot);
        instance.flows.push(slot);
        let root = instance.procedures[procedure].clone();
        let locals = root.locals.iter().map(|(_, ty)| ty.zero()).collect();
        let flow = Flow {
            owner,
            id,
            procedure,
            entry,
            subject,
            event,
            frames: smallvec![Frame {
                procedure: root,
                node: Some(entry),
                locals,
                loops: Vec::new(),
                into: None,
                return_to: None,
            }],
            pause: None,
            box_open: false,
        };
        Some((FlowKey { owner, flow: id }, flow))
    }

    fn take_flow(&mut self, key: FlowKey) -> Option<Flow<V>> {
        let slot = *self.by_id.get(&key.flow)?;
        self.flows.get_mut(slot)?.take()
    }

    fn drop_flow(&mut self, key: FlowKey) {
        let Some(slot) = self.by_id.remove(&key.flow) else {
            return;
        };
        self.flows.remove(slot);
        if let Some(instance) = self.instances.get_mut(&key.owner) {
            instance.flows.retain(|kept| *kept != slot);
        }
    }
}

fn apply_ops<V: Vocabulary>(world: &mut World) {
    while let Some(op) = world.resource_mut::<Instances<V>>().ops.pop_front() {
        match op {
            Op::Spawn { owner, procedures } => {
                let mut may_do = MayDo::default();
                let mut answered = Vec::new();
                for procedure in &procedures {
                    may_do.absorb(&procedure.may_do);
                    may_do
                        .answers
                        .extend(procedure.may_do.answers.iter().copied());
                    for (_, event) in &procedure.entries {
                        if !answered.contains(&event.kind()) {
                            answered.push(event.kind());
                        }
                    }
                }
                let mut instances = world.resource_mut::<Instances<V>>();
                for kind in &answered {
                    let owners = instances.answering.entry(*kind).or_default();
                    if !owners.contains(&owner) {
                        owners.push(owner);
                    }
                }
                instances.instances.insert(
                    owner,
                    Instance {
                        procedures,
                        may_do,
                        answered,
                        state: HashMap::new(),
                        flows: Vec::new(),
                    },
                );
            }
            Op::Remove { owner } => {
                let removed = {
                    let mut instances = world.resource_mut::<Instances<V>>();
                    instances
                        .queue
                        .retain(|queued| queued_owner(queued) != owner);
                    let removed = instances.instances.remove(&owner);
                    if let Some(instance) = &removed {
                        for kind in &instance.answered {
                            if let Some(owners) = instances.answering.get_mut(kind) {
                                owners.retain(|known| *known != owner);
                            }
                        }
                    }
                    removed
                };
                let closing: Vec<(FlowKey, Entity)> = removed.map_or_else(Vec::new, |instance| {
                    let mut instances = world.resource_mut::<Instances<V>>();
                    let mut closing = Vec::new();
                    for &slot in &instance.flows {
                        let Some(flow) = instances.flows.remove(slot).flatten() else {
                            continue;
                        };
                        instances.by_id.remove(&flow.id);
                        if flow.box_open
                            && let Some(subject) = flow.subject
                        {
                            let key = FlowKey {
                                owner,
                                flow: flow.id,
                            };
                            closing.push((key, subject));
                        }
                    }
                    closing
                });
                for (key, subject) in closing {
                    V::close_dialogue(world, key, subject, BoxEnding::Gone);
                }
            }
            Op::Raise {
                owner,
                kind,
                subject,
                event,
                accept,
            } => {
                let starts = {
                    let instances = world.resource::<Instances<V>>();
                    let Some(instance) = instances.instances.get(&owner) else {
                        continue;
                    };
                    let mut starts = Vec::new();
                    for (index, procedure) in instance.procedures.iter().enumerate() {
                        for (entry, def) in procedure.entry(kind) {
                            if !accept(def) {
                                continue;
                            }
                            let live = instance.flows.iter().any(|&slot| {
                                instances
                                    .flows
                                    .get(slot)
                                    .and_then(Option::as_ref)
                                    .is_some_and(|flow| {
                                        flow.procedure == index
                                            && flow.entry == entry
                                            && flow.subject == subject
                                    })
                            });
                            let queued = instances.queue.iter().any(|queued| match queued {
                                Queued::Start {
                                    owner: o,
                                    procedure: p,
                                    entry: e,
                                    subject: s,
                                    ..
                                } => *o == owner && *p == index && *e == entry && *s == subject,
                                Queued::Resume { .. } => false,
                            });
                            if live || queued {
                                continue;
                            }
                            starts.push((index, entry));
                        }
                    }
                    starts
                };
                for (procedure, entry) in starts {
                    let full = world.resource::<Instances<V>>().instances[&owner]
                        .flows
                        .len()
                        >= MAX_LIVE_FLOWS;
                    if full {
                        V::log_dropped_flow(world, &owner, "32 live flows");
                        continue;
                    }
                    world
                        .resource_mut::<Instances<V>>()
                        .queue
                        .push_back(Queued::Start {
                            owner,
                            procedure,
                            entry,
                            subject,
                            event: event.clone(),
                        });
                }
            }
            Op::Answer { key, answer } => {
                world
                    .resource_mut::<Instances<V>>()
                    .queue
                    .push_back(Queued::Resume { key, answer });
            }
            Op::BoxClosed { key } => {
                let mut instances = world.resource_mut::<Instances<V>>();
                if let Some(flow) = flow_mut(&mut instances, key) {
                    flow.box_open = false;
                }
            }
        }
    }
}

fn queued_owner(queued: &Queued) -> Owner {
    match queued {
        Queued::Start { owner, .. } => *owner,
        Queued::Resume { key, .. } => key.owner,
    }
}

fn flow_mut<V: Vocabulary>(instances: &mut Instances<V>, key: FlowKey) -> Option<&mut Flow<V>> {
    instances.flow_mut(key)
}

fn resume<V: Vocabulary>(
    world: &mut World,
    key: FlowKey,
    mut flow: Flow<V>,
    answer: Answer,
) -> Option<Flow<V>> {
    let Some(pause) = flow.pause else {
        return keep(world, key, flow);
    };
    let mut frame = flow.frames.pop().expect("a paused flow has a frame");
    let Some(node) = frame.node else {
        flow.frames.push(frame);
        return keep(world, key, flow);
    };
    let next = match (&frame.procedure.steps[node], pause, &answer) {
        (
            Step::Wait { next, .. },
            Pause::Wait { .. } | Pause::NextTick { .. },
            Answer::Output(_),
        ) => Some(*next),
        (
            Step::Dialogue {
                requires, choices, ..
            },
            Pause::Dialogue,
            Answer::Pick(choice),
        ) => match choices.get(*choice).copied() {
            Some(to) => match requires.get(*choice) {
                Some(Some(requires)) => {
                    let cx = FlowCx {
                        key,
                        owner: key.owner,
                        subject: flow.subject,
                        locals: std::mem::take(&mut frame.locals),
                        state: take_state(world, key.owner, &frame.procedure),
                        event: std::mem::take(&mut flow.event),
                    };
                    let met = requires(world, &cx).truthy();
                    give_back(world, &mut frame, &mut flow, cx);
                    met.then_some(to)
                }
                _ => Some(to),
            },
            None => None,
        },
        (Step::Dialogue { left, .. }, Pause::Dialogue, Answer::Left) => {
            flow.box_open = false;
            Some(*left)
        }
        (Step::Effect { def, outputs, .. }, Pause::Effect { .. }, Answer::Output(name)) => def
            .outputs()
            .iter()
            .position(|(known, _)| known == name)
            .map(|index| outputs[index]),
        (_, Pause::Step { .. }, Answer::Output(_)) => Some(frame.node),
        _ => None,
    };
    let Some(next) = next else {
        flow.frames.push(frame);
        return keep(world, key, flow);
    };
    frame.node = next;
    flow.frames.push(frame);
    flow.pause = None;
    Some(flow)
}

fn keep<V: Vocabulary>(world: &mut World, key: FlowKey, flow: Flow<V>) -> Option<Flow<V>> {
    put_flow(world, key, flow);
    None
}

fn flow_state<V: Vocabulary>(instances: &mut Instances<V>, key: FlowKey) -> Vec<Value> {
    let Some(flow) = instances.flow(key) else {
        return Vec::new();
    };
    let procedure = flow.frames.last().expect("a frame").procedure.clone();
    if procedure.state.is_empty() {
        return Vec::new();
    }
    let Some(instance) = instances.instances.get_mut(&key.owner) else {
        return Vec::new();
    };
    let state = instance.state.entry(procedure.id).or_default();
    if state.len() != procedure.state.len() {
        *state = procedure.state.iter().map(|(_, ty)| ty.zero()).collect();
    }
    std::mem::take(state)
}

fn put_flow<V: Vocabulary>(world: &mut World, key: FlowKey, flow: Flow<V>) {
    let mut instances = world.resource_mut::<Instances<V>>();
    let Some(slot) = instances.by_id.get(&key.flow).copied() else {
        return;
    };
    if let Some(kept) = instances.flows.get_mut(slot) {
        *kept = Some(flow);
    }
}

fn take_state<V: Vocabulary>(
    world: &mut World,
    owner: Owner,
    procedure: &Procedure<V>,
) -> Vec<Value> {
    if procedure.state.is_empty() {
        return Vec::new();
    }
    let mut instances = world.resource_mut::<Instances<V>>();
    let Some(instance) = instances.instances.get_mut(&owner) else {
        return procedure.state.iter().map(|(_, ty)| ty.zero()).collect();
    };
    let state = instance.state.entry(procedure.id).or_default();
    if state.len() != procedure.state.len() {
        *state = procedure.state.iter().map(|(_, ty)| ty.zero()).collect();
    }
    std::mem::take(state)
}

fn put_state<V: Vocabulary>(
    world: &mut World,
    owner: Owner,
    procedure: &Procedure<V>,
    state: Vec<Value>,
) {
    if procedure.state.is_empty() {
        return;
    }
    let mut instances = world.resource_mut::<Instances<V>>();
    if let Some(instance) = instances.instances.get_mut(&owner) {
        instance.state.insert(procedure.id, state);
    }
}

/// Every node a flow stepped through while this resource was in the world, for tools that watch a
/// script run; play never inserts it.
#[derive(Resource, Default)]
pub struct FlowTrace {
    pub steps: Vec<TraceStep>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TraceStep {
    pub key: FlowKey,
    pub procedure: String,
    pub node: Name,
}

/// How a tool steers a run while this resource is in the world: the output each named random node
/// takes instead of rolling, and whether every node pauses until the next tick so a run can be
/// stepped; play never inserts it.
#[derive(Resource, Default)]
pub struct FlowSteering {
    pub random: HashMap<String, usize>,
    pub step: bool,
}

fn run_flow<V: Vocabulary>(world: &mut World, key: FlowKey, flow: Flow<V>, clock: TickClock) {
    let mut trace = world.remove_resource::<FlowTrace>();
    run_flow_traced(world, key, flow, clock, &mut trace);
    if let Some(trace) = trace {
        world.insert_resource(trace);
    }
}

fn run_flow_traced<V: Vocabulary>(
    world: &mut World,
    key: FlowKey,
    mut flow: Flow<V>,
    clock: TickClock,
    trace: &mut Option<FlowTrace>,
) {
    loop {
        let mut frame = flow.frames.pop().expect("a frame");
        let Some(node) = frame.node else {
            if let Some((repeat, _)) = frame.loops.last() {
                frame.node = Some(*repeat);
                flow.frames.push(frame);
                continue;
            }
            if let Some(caller) = flow.frames.last_mut() {
                caller.node = frame.return_to;
                continue;
            }
            end_flow::<V>(world, key, flow, BoxEnding::Ended);
            return;
        };
        let mut cx = FlowCx {
            key,
            owner: key.owner,
            subject: flow.subject,
            locals: std::mem::take(&mut frame.locals),
            state: take_state(world, key.owner, &frame.procedure),
            event: std::mem::take(&mut flow.event),
        };
        if let Some(trace) = trace.as_mut() {
            trace.steps.push(TraceStep {
                key,
                procedure: frame.procedure.label.clone(),
                node: frame.procedure.names[node],
            });
        }
        let outcome;
        match &frame.procedure.steps[node] {
            Step::On { next } => outcome = StepOutcome::Next(*next),
            Step::If { test, yes, no } => {
                outcome = StepOutcome::Next(if test(world, &cx).truthy() { *yes } else { *no });
            }
            Step::Random { weights, outputs } => {
                let steered = world
                    .get_resource::<FlowSteering>()
                    .and_then(|steering| steering.random.get(frame.procedure.names[node]))
                    .copied()
                    .filter(|picked| *picked < outputs.len());
                let picked = steered.unwrap_or_else(|| {
                    let total: u32 = weights.iter().sum();
                    let roll = world.resource_mut::<Rng>().rand_range(0..total);
                    let mut seen = 0;
                    let mut picked = outputs.len() - 1;
                    for (index, weight) in weights.iter().enumerate() {
                        seen += weight;
                        if roll < seen {
                            picked = index;
                            break;
                        }
                    }
                    picked
                });
                outcome = StepOutcome::Next(outputs[picked]);
            }
            Step::Repeat {
                times,
                at_most,
                each,
                then,
            } => {
                let looping = frame
                    .loops
                    .last()
                    .is_some_and(|(repeat, _)| *repeat == node);
                if looping {
                    let (_, remaining) = frame.loops.last_mut().expect("the loop");
                    if *remaining > 0 {
                        *remaining -= 1;
                        outcome = StepOutcome::Next(*each);
                    } else {
                        frame.loops.pop();
                        outcome = StepOutcome::Next(*then);
                    }
                } else {
                    let count = times(world, &cx).as_int().clamp(0, i64::from(*at_most)) as u32;
                    if count == 0 {
                        outcome = StepOutcome::Next(*then);
                    } else {
                        frame.loops.push((node, count - 1));
                        outcome = StepOutcome::Next(*each);
                    }
                }
            }
            Step::Wait {
                seconds, at_most, ..
            } => {
                let seconds = seconds(world, &cx).as_num().min(f64::from(*at_most));
                let pause = if seconds <= 0.0 {
                    Pause::NextTick {
                        tick: clock.tick + 1,
                    }
                } else {
                    Pause::Wait {
                        until: clock.now + seconds,
                    }
                };
                outcome = StepOutcome::Pause(pause);
            }
            Step::Set { values, next } => {
                for (slot, to) in values {
                    let value = to(world, &cx);
                    match slot {
                        Slot::Local(index) => cx.locals[*index] = value,
                        Slot::State(index) => cx.state[*index] = value,
                    }
                }
                outcome = StepOutcome::Next(*next);
            }
            Step::Run {
                callee,
                entry,
                into,
                next,
            } => {
                outcome = StepOutcome::Call {
                    callee: callee.clone(),
                    entry: *entry,
                    into: *into,
                    return_to: *next,
                };
            }
            Step::Return { value } => {
                outcome = StepOutcome::Return(value.as_ref().map(|value| value(world, &cx)));
            }
            Step::Dialogue {
                node: dialogue,
                values,
                requires,
                choices,
                next,
                ..
            } => {
                let Some(subject) = cx.subject else {
                    give_back(world, &mut frame, &mut flow, cx);
                    frame.node = None;
                    flow.frames.push(frame);
                    continue;
                };
                let mut offers = Vec::new();
                for (index, choice) in dialogue.choices.iter().enumerate() {
                    let met = match &requires[index] {
                        Some(requires) => requires(world, &cx).truthy(),
                        None => true,
                    };
                    if !met && !choice.reveal.contains(&super::Reveal::Locked) {
                        continue;
                    }
                    let mut leads = Vec::new();
                    let mut to = choices[index];
                    while let Some(at) = to {
                        let Step::Effect {
                            def,
                            outputs,
                            pauses,
                            ..
                        } = &frame.procedure.steps[at]
                        else {
                            break;
                        };
                        leads.push(*def);
                        to = if *pauses {
                            None
                        } else {
                            outputs.first().copied().flatten()
                        };
                    }
                    offers.push(ChoiceOffer {
                        index,
                        label: &choice.label,
                        locked: !met,
                        requires: choice.requires.as_ref(),
                        reveal: choice.reveal.as_slice(),
                        warn: choice.warn.as_deref(),
                        leads,
                    });
                }
                let lines = dialogue
                    .lines
                    .iter()
                    .zip(values)
                    .map(|(line, evals)| {
                        (line, evals.iter().map(|eval| eval(world, &cx)).collect())
                    })
                    .collect();
                V::show_dialogue(
                    world,
                    key,
                    subject,
                    DialogueView {
                        script: &frame.procedure.label,
                        node: frame.procedure.names[node],
                        lines,
                        choices: offers,
                    },
                );
                flow.box_open = true;
                outcome = if dialogue.choices.is_empty() && next.is_some() {
                    StepOutcome::Next(*next)
                } else {
                    StepOutcome::Pause(Pause::Dialogue)
                };
            }
            Step::Effect {
                call,
                outputs,
                keeps_box,
                ..
            } => {
                outcome = match call(world, &mut cx) {
                    EffectStep::Output(index) => StepOutcome::Next(outputs[index]),
                    EffectStep::Pause => StepOutcome::Pause(Pause::Effect {
                        keeps_box: *keeps_box,
                    }),
                };
            }
        }
        give_back(world, &mut frame, &mut flow, cx);
        let stepping = world
            .get_resource::<FlowSteering>()
            .is_some_and(|steering| steering.step);
        if stepping && let StepOutcome::Next(Some(next)) = outcome {
            frame.node = Some(next);
            flow.frames.push(frame);
            flow.pause = Some(Pause::Step {
                tick: clock.tick + 1,
            });
            put_flow(world, key, flow);
            return;
        }
        match outcome {
            StepOutcome::Next(next) => {
                frame.node = next;
                flow.frames.push(frame);
            }
            StepOutcome::Pause(pause) => {
                flow.frames.push(frame);
                flow.pause = Some(pause);
                let keeps = matches!(pause, Pause::Dialogue | Pause::Effect { keeps_box: true });
                let close = if flow.box_open && !keeps {
                    flow.box_open = false;
                    flow.subject
                } else {
                    None
                };
                put_flow(world, key, flow);
                if let Some(subject) = close {
                    V::close_dialogue(world, key, subject, BoxEnding::Ended);
                }
                return;
            }
            StepOutcome::Call {
                callee,
                entry,
                into,
                return_to,
            } => {
                let locals = callee.locals.iter().map(|(_, ty)| ty.zero()).collect();
                flow.frames.push(frame);
                flow.frames.push(Frame {
                    procedure: callee,
                    node: Some(entry),
                    locals,
                    loops: Vec::new(),
                    into,
                    return_to,
                });
            }
            StepOutcome::Return(value) => {
                let Some(caller) = flow.frames.last_mut() else {
                    end_flow::<V>(world, key, flow, BoxEnding::Ended);
                    return;
                };
                if let (Some(into), Some(value)) = (frame.into, value) {
                    caller.locals[into] = value;
                }
                caller.node = frame.return_to;
            }
        }
    }
}

fn give_back<V: Vocabulary>(
    world: &mut World,
    frame: &mut Frame<V>,
    flow: &mut Flow<V>,
    cx: FlowCx,
) {
    frame.locals = cx.locals;
    flow.event = cx.event;
    put_state(world, cx.owner, &frame.procedure, cx.state);
}

enum StepOutcome<V: Vocabulary> {
    Next(Next),
    Pause(Pause),
    Call {
        callee: Arc<Procedure<V>>,
        entry: usize,
        into: Option<usize>,
        return_to: Next,
    },
    Return(Option<Value>),
}

fn restore<V: Vocabulary>(instances: &mut Instances<V>, key: FlowKey, cx: FlowCx) {
    let Some(slot) = instances.by_id.get(&key.flow).copied() else {
        return;
    };
    let Some(flow) = instances.flows.get_mut(slot).and_then(Option::as_mut) else {
        return;
    };
    let frame = flow.frames.last_mut().expect("a frame");
    frame.locals = cx.locals;
    if !frame.procedure.state.is_empty()
        && let Some(instance) = instances.instances.get_mut(&key.owner)
    {
        instance.state.insert(frame.procedure.id, cx.state);
    }
}

fn end_flow<V: Vocabulary>(world: &mut World, key: FlowKey, flow: Flow<V>, ending: BoxEnding) {
    world.resource_mut::<Instances<V>>().drop_flow(key);
    if flow.box_open
        && let Some(subject) = flow.subject
    {
        V::close_dialogue(world, key, subject, ending);
    }
}

const PEEK_FLOW: u64 = u64::MAX;

fn peek_dialogue<V: Vocabulary>(
    world: &World,
    procedure: &Procedure<V>,
    entry: usize,
    mut cx: FlowCx,
) -> Option<usize> {
    let mut at = Some(entry);
    for _ in 0..procedure.steps.len() {
        let node = at?;
        at = match &procedure.steps[node] {
            Step::On { next } => *next,
            Step::If { test, yes, no } => {
                if test(world, &cx).truthy() {
                    *yes
                } else {
                    *no
                }
            }
            Step::Set { values, next } => {
                for (slot, to) in values {
                    let value = to(world, &cx);
                    match slot {
                        Slot::Local(index) => cx.locals[*index] = value,
                        Slot::State(index) => cx.state[*index] = value,
                    }
                }
                *next
            }
            Step::Effect {
                outputs, pauses, ..
            } if !*pauses => outputs.first().copied().flatten(),
            Step::Dialogue { .. } => return Some(node),
            _ => return None,
        };
    }
    None
}
