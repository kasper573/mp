use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use bevy_ecs::prelude::*;

use super::dialogue::{DialogueNode, MAX_CHOICES, MAX_LINES};
use super::expr::{self, Expr};
use super::may_do::MayDo;
use super::node::{
    MAX_CALL_DEPTH, MAX_NODES, MAX_REPEAT, MAX_SLOTS, MAX_STEPS, MAX_WAIT, Node, Target,
};
use super::run::FlowCx;
use super::value::{Value, ValueType};
use super::{
    EffectDef, EventDef, Fill, InlineScript, LineDef, Name, OwnerKind, QueryDef, ScriptDef,
    ScriptError, ScriptId, ScriptModule, VarValue, Variable, VariableType, Vocabulary,
};
use crate::core::content::Content;

pub type Eval = Box<dyn Fn(&World, &FlowCx) -> Value + Send + Sync>;
pub type EffectCall = Box<dyn Fn(&mut World, &mut FlowCx) -> EffectStep + Send + Sync>;

pub enum EffectStep {
    Output(usize),
    Pause,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct OwnerRow {
    pub kind: OwnerKind,
    pub row: u32,
    pub object: Option<u32>,
}

#[derive(Resource, Clone, Default)]
pub struct Scripts<V: Vocabulary>(pub Arc<HashMap<OwnerRow, Vec<Arc<Procedure<V>>>>>);

impl<V: Vocabulary> Scripts<V> {
    pub fn of(&self, owner: OwnerRow) -> &[Arc<Procedure<V>>] {
        self.0.get(&owner).map_or(&[], Vec::as_slice)
    }

    pub fn may_do(&self, owner: OwnerRow) -> MayDo<V> {
        let mut all = MayDo::default();
        for procedure in self.of(owner) {
            all.absorb(&procedure.may_do);
            all.answers.extend(procedure.may_do.answers.iter().copied());
        }
        all
    }

    pub fn owners(&self) -> impl Iterator<Item = (&OwnerRow, &Vec<Arc<Procedure<V>>>)> {
        self.0.iter()
    }
}

pub type Next = Option<usize>;

pub struct Procedure<V: Vocabulary> {
    pub id: u64,
    pub owner: OwnerKind,
    pub label: String,
    pub names: Vec<Name>,
    pub steps: Vec<Step<V>>,
    pub entries: Vec<(usize, V::Event)>,
    pub state: Vec<(Name, ValueType)>,
    pub locals: Vec<(Name, ValueType)>,
    pub may_do: MayDo<V>,
    pub returns: Vec<ValueType>,
    pub needs_subject: bool,
}

pub enum Step<V: Vocabulary> {
    On {
        next: Next,
    },
    If {
        test: Eval,
        yes: Next,
        no: Next,
    },
    Random {
        weights: Vec<u32>,
        outputs: Vec<Next>,
    },
    Repeat {
        times: Eval,
        at_most: u32,
        each: Next,
        then: Next,
    },
    Wait {
        seconds: Eval,
        at_most: f32,
        next: Next,
    },
    Set {
        values: Vec<(Slot, Eval)>,
        next: Next,
    },
    Run {
        callee: Arc<Procedure<V>>,
        entry: usize,
        into: Option<usize>,
        next: Next,
    },
    Return {
        value: Option<Eval>,
    },
    Dialogue {
        node: &'static DialogueNode<V>,
        values: Vec<Vec<Eval>>,
        requires: Vec<Option<Eval>>,
        choices: Vec<Next>,
        next: Next,
        left: Next,
    },
    Effect {
        def: &'static V::Effect,
        call: EffectCall,
        outputs: Vec<Next>,
        pauses: bool,
        keeps_box: bool,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Slot {
    Local(usize),
    State(usize),
}

impl<V: Vocabulary> Procedure<V> {
    pub fn entry(&self, kind: <V::Event as EventDef>::Kind) -> Vec<(usize, &V::Event)> {
        self.entries
            .iter()
            .filter(|(_, event)| event.kind() == kind)
            .map(|(node, event)| (*node, event))
            .collect()
    }

    pub fn answers(&self, kind: <V::Event as EventDef>::Kind) -> bool {
        self.entries.iter().any(|(_, event)| event.kind() == kind)
    }

    pub fn run_entry(&self) -> Option<usize> {
        self.entries
            .iter()
            .find(|(_, event)| event.is_run())
            .map(|(node, _)| *node)
    }

    pub fn pauses_at(&self, node: usize) -> bool {
        match &self.steps[node] {
            Step::Wait { .. } | Step::Dialogue { .. } => true,
            Step::Effect { pauses, .. } => *pauses,
            _ => false,
        }
    }
}

pub struct Binding<'a, V: Vocabulary> {
    pub owner: OwnerKind,
    pub label: String,
    pub module: &'a ScriptModule<V>,
}

pub fn compile_owner<V: Vocabulary>(
    content: &Content,
    owner: OwnerKind,
    label: &str,
    modules: &[ScriptModule<V>],
) -> Result<Vec<Arc<Procedure<V>>>, ScriptError> {
    let mut procedures = Vec::new();
    let mut answered: HashMap<<V::Event as EventDef>::Kind, Vec<Name>> = HashMap::new();
    for module in modules {
        let procedure = compile_binding(
            content,
            &Binding {
                owner,
                label: label.to_owned(),
                module,
            },
        )?;
        for (node, event) in &procedure.entries {
            let twice = answered.entry(event.kind()).or_default();
            if !twice.is_empty() {
                return Err(ScriptError {
                    rule: "answered twice",
                    owner: label.to_owned(),
                    node: Some(procedure.names[*node].to_owned()),
                    expected: format!("one answer to {:?} per owner", event.kind()),
                });
            }
            twice.push(procedure.names[*node]);
        }
        procedures.push(procedure);
    }
    Ok(procedures)
}

pub fn compile_binding<V: Vocabulary>(
    content: &Content,
    binding: &Binding<V>,
) -> Result<Arc<Procedure<V>>, ScriptError> {
    compile_source(content, binding, &[])
}

type Bound<V> = (
    Source<V>,
    &'static [(Name, VarValue<V>)],
    &'static [(Name, Variable<V>)],
);

fn compile_source<V: Vocabulary>(
    content: &Content,
    binding: &Binding<V>,
    stack: &[ScriptId<V>],
) -> Result<Arc<Procedure<V>>, ScriptError> {
    let fail = |rule: &'static str, node: Option<Name>, expected: String| ScriptError {
        rule,
        owner: binding.label.clone(),
        node: node.map(str::to_owned),
        expected,
    };
    let (source, values, declared): Bound<V> = match binding.module {
        ScriptModule::Shared { script, values } => {
            let def = script.get(content);
            let called = !stack.is_empty();
            if called {
                if def.owner != OwnerKind::Any && def.owner != binding.owner {
                    return Err(fail(
                        "owners of another kind",
                        None,
                        format!(
                            "script/{} is {}'s, run by {}",
                            script.key(content),
                            def.owner.name(),
                            binding.owner.name()
                        ),
                    ));
                }
            } else if def.owner != binding.owner {
                return Err(fail(
                    "owners of another kind",
                    None,
                    format!("script/{} is {}'s", script.key(content), def.owner.name()),
                ));
            }
            (
                Source {
                    state: def.state,
                    locals: def.locals,
                    nodes: def.nodes,
                    label: format!("script/{}", script.key(content)),
                },
                values,
                def.variables,
            )
        }
        ScriptModule::Inline(InlineScript {
            state,
            locals,
            nodes,
        }) => (
            Source {
                state,
                locals,
                nodes,
                label: binding.label.clone(),
            },
            &[],
            &[],
        ),
    };
    if source.nodes.len() > MAX_NODES {
        return Err(fail(
            "out of range",
            None,
            format!("at most {MAX_NODES} nodes, found {}", source.nodes.len()),
        ));
    }
    for (what, count) in [
        ("variables", declared.len()),
        ("locals", source.locals.len()),
        ("state", source.state.len()),
    ] {
        if count > MAX_SLOTS {
            return Err(fail(
                "out of range",
                None,
                format!("at most {MAX_SLOTS} {what}, found {count}"),
            ));
        }
    }
    if !source.state.is_empty() && !binding.owner.keeps_state() {
        return Err(fail(
            "state kept nowhere",
            None,
            format!(
                "{} scripts keep no state; found {}",
                binding.owner.name(),
                source.state[0].0
            ),
        ));
    }
    let mut variables: HashMap<Name, (VariableType, Option<&VarValue<V>>)> = HashMap::new();
    for (name, variable) in declared {
        variables.insert(*name, (variable.ty, variable.default.as_ref()));
    }
    for (name, value) in values {
        let Some(slot) = variables.get_mut(name) else {
            return Err(fail(
                "unknown variable",
                None,
                format!(
                    "{name} is not a variable of {}{}",
                    source.label,
                    nearest(name, declared.iter().map(|(name, _)| *name))
                ),
            ));
        };
        if value.variable_type() != slot.0 {
            return Err(fail(
                "wrong type",
                None,
                format!("{name} is a {:?}", slot.0),
            ));
        }
        slot.1 = Some(value);
    }
    for (name, (_, value)) in &variables {
        if value.is_none() {
            return Err(fail(
                "missing value",
                None,
                format!("{name} has no default and no value"),
            ));
        }
    }
    let names: Vec<Name> = source.nodes.iter().map(|(name, _)| *name).collect();
    let mut seen = HashSet::new();
    for name in &names {
        if !seen.insert(name.to_ascii_lowercase()) {
            return Err(fail(
                "duplicate name",
                Some(name),
                "unique node names".to_owned(),
            ));
        }
    }
    let index_of = |name: Name| names.iter().position(|known| *known == name);
    let arrow = |arrow: super::Arrow, at: Name| -> Result<Next, ScriptError> {
        match arrow {
            None => Ok(None),
            Some(name) => index_of(name).map(Some).ok_or_else(|| {
                fail(
                    "unknown node",
                    Some(at),
                    format!("{name:?}{}", nearest(name, names.iter().copied())),
                )
            }),
        }
    };
    let mut cx = Compiler {
        content,
        owner: binding.owner,
        label: source.label.clone(),
        variables,
        state: source.state,
        locals: source.locals,
        node: None,
        has_subject: true,
        used_vars: HashSet::new(),
        read_slots: HashSet::new(),
        stack: stack.to_vec(),
        subject_read: false,
        event_fields: &[],
    };
    let mut steps = Vec::with_capacity(source.nodes.len());
    let mut entries = Vec::new();
    cx.event_fields = source
        .nodes
        .iter()
        .find_map(|(_, node)| match node {
            Node::On { event, .. } if !event.fields().is_empty() => Some(event.fields()),
            _ => None,
        })
        .unwrap_or(&[]);
    let mut may_do = MayDo::default();
    let mut needs_subject = vec![false; names.len()];
    let mut returns = Vec::new();
    for (index, (name, node)) in source.nodes.iter().enumerate() {
        cx.node = Some(name);
        let node_fail = |rule: &'static str, expected: String| fail(rule, Some(name), expected);
        let step = match node {
            Node::On { event, next } => {
                let function =
                    event.is_run() && (binding.owner == OwnerKind::Any || !cx.stack.is_empty());
                if !event.owners().contains(&binding.owner) && !function {
                    return Err(node_fail(
                        "event not raised here",
                        format!(
                            "{:?} is never raised for {}",
                            event.kind(),
                            binding.owner.name()
                        ),
                    ));
                }
                if cx.stack.is_empty() && event.is_run() && binding.owner != OwnerKind::Any {
                    return Err(node_fail(
                        "event not raised here",
                        "run starts only a script another runs".to_owned(),
                    ));
                }
                entries.push((index, event.clone()));
                may_do.answers.push(event.kind());
                Step::On {
                    next: arrow(*next, name)?,
                }
            }
            Node::If { test, yes, no } => {
                let (test, uses) = cx
                    .expr_tracking(test, ValueType::Boolean)
                    .map_err(|e| node_fail(e.0, e.1))?;
                needs_subject[index] |= uses;
                Step::If {
                    test,
                    yes: arrow(*yes, name)?,
                    no: arrow(*no, name)?,
                }
            }
            Node::Random { weights, outputs } => {
                if weights.len() < 2 || weights.len() > 8 || weights.len() != outputs.len() {
                    return Err(node_fail(
                        "out of range",
                        "2 to 8 weights, one output each".to_owned(),
                    ));
                }
                if weights.iter().any(|weight| !(1..=1_000).contains(weight)) {
                    return Err(node_fail("out of range", "weights 1 to 1,000".to_owned()));
                }
                Step::Random {
                    weights: weights.to_vec(),
                    outputs: outputs
                        .iter()
                        .map(|output| arrow(*output, name))
                        .collect::<Result<_, _>>()?,
                }
            }
            Node::Repeat {
                times,
                at_most,
                each,
                then,
            } => {
                if !(1..=MAX_REPEAT).contains(at_most) {
                    return Err(node_fail(
                        "out of range",
                        format!("at_most 1 to {MAX_REPEAT}"),
                    ));
                }
                let (times, uses) = cx
                    .expr_tracking(times, ValueType::Integer)
                    .map_err(|e| node_fail(e.0, e.1))?;
                needs_subject[index] |= uses;
                Step::Repeat {
                    times,
                    at_most: *at_most,
                    each: arrow(*each, name)?,
                    then: arrow(*then, name)?,
                }
            }
            Node::Wait {
                seconds,
                at_most,
                next,
            } => {
                if !(*at_most > 0.0 && *at_most <= MAX_WAIT) {
                    return Err(node_fail(
                        "out of range",
                        format!("at_most up to {MAX_WAIT} seconds"),
                    ));
                }
                let (seconds, uses) = cx
                    .expr_tracking(seconds, ValueType::Number)
                    .map_err(|e| node_fail(e.0, e.1))?;
                needs_subject[index] |= uses;
                may_do.waits = true;
                Step::Wait {
                    seconds,
                    at_most: *at_most,
                    next: arrow(*next, name)?,
                }
            }
            Node::Set { values, next } => {
                let mut compiled = Vec::new();
                for assignment in values.iter() {
                    let (slot, ty) = match assignment.target {
                        Target::Local(local) => {
                            cx.local(local).map(|(index, ty)| (Slot::Local(index), ty))
                        }
                        Target::State(state) => {
                            cx.state(state).map(|(index, ty)| (Slot::State(index), ty))
                        }
                    }
                    .ok_or_else(|| {
                        node_fail("unknown variable", format!("{:?}", assignment.target))
                    })?;
                    let (to, uses) = cx
                        .expr_tracking(&assignment.to, ty)
                        .map_err(|e| node_fail(e.0, e.1))?;
                    needs_subject[index] |= uses;
                    compiled.push((slot, to));
                }
                Step::Set {
                    values: compiled,
                    next: arrow(*next, name)?,
                }
            }
            Node::Run {
                script,
                values,
                into,
                next,
            } => {
                if cx.stack.contains(script) {
                    return Err(node_fail(
                        "runs itself",
                        format!("script/{} reaches itself", script.key(content)),
                    ));
                }
                if cx.stack.len() + 1 > MAX_CALL_DEPTH {
                    return Err(node_fail(
                        "runs itself",
                        format!("calls nest past {MAX_CALL_DEPTH}"),
                    ));
                }
                let module = ScriptModule::Shared {
                    script: *script,
                    values,
                };
                let mut deeper = cx.stack.clone();
                deeper.push(*script);
                let callee = compile_source(
                    content,
                    &Binding {
                        owner: binding.owner,
                        label: format!("{} › script/{}", source.label, script.key(content)),
                        module: &module,
                    },
                    &deeper,
                )?;
                let entry = callee.run_entry().ok_or_else(|| {
                    node_fail(
                        "event not raised here",
                        format!("script/{} has no run node", script.key(content)),
                    )
                })?;
                let into = match into {
                    Some(local) => {
                        let (slot, ty) = cx.local(local).ok_or_else(|| {
                            node_fail("unknown variable", format!("local {local}"))
                        })?;
                        for returned in callee.returns.iter().copied() {
                            if !ty.accepts(returned) {
                                return Err(node_fail(
                                    "wrong type",
                                    format!(
                                        "{local} is {} but script/{} returns {}",
                                        ty.name(),
                                        script.key(content),
                                        returned.name()
                                    ),
                                ));
                            }
                        }
                        Some(slot)
                    }
                    None => None,
                };
                may_do.absorb(&callee.may_do);
                may_do.calls.push(script.key(content).to_owned());
                needs_subject[index] |= callee.needs_subject;
                Step::Run {
                    callee,
                    entry,
                    into,
                    next: arrow(*next, name)?,
                }
            }
            Node::Return { value } => {
                if cx.stack.is_empty() {
                    return Err(node_fail(
                        "event not raised here",
                        "return belongs in a script another runs".to_owned(),
                    ));
                }
                let value = match value {
                    Some(value) => {
                        let (eval, ty, uses) =
                            cx.typed_tracking(value).map_err(|e| node_fail(e.0, e.1))?;
                        needs_subject[index] |= uses;
                        returns.push(ty);
                        Some(eval)
                    }
                    None => None,
                };
                Step::Return { value }
            }
            Node::Dialogue(dialogue) => {
                if dialogue.lines.is_empty() || dialogue.lines.len() > MAX_LINES {
                    return Err(node_fail("out of range", format!("1 to {MAX_LINES} lines")));
                }
                if dialogue.choices.len() > MAX_CHOICES {
                    return Err(node_fail(
                        "out of range",
                        format!("at most {MAX_CHOICES} choices"),
                    ));
                }
                if dialogue.next.is_some() && !dialogue.choices.is_empty() {
                    return Err(node_fail(
                        "wrong type",
                        "next only without choices".to_owned(),
                    ));
                }
                needs_subject[index] = true;
                may_do.dialogue.push(name);
                let mut values = Vec::new();
                for line in dialogue.lines {
                    let mut evals = Vec::new();
                    for value in line.values() {
                        evals.push(cx.typed(value).map_err(|e| node_fail(e.0, e.1))?.0);
                    }
                    values.push(evals);
                }
                let mut requires = Vec::new();
                let mut choices = Vec::new();
                for choice in dialogue.choices {
                    check_reveal(choice.reveal).map_err(|e| node_fail(e.0, e.1))?;
                    if choice.warn.is_some_and(|warn| warn.chars().count() > 60) {
                        return Err(node_fail(
                            "out of range",
                            "warn at most 60 characters".to_owned(),
                        ));
                    }
                    requires.push(match &choice.requires {
                        Some(expr) => Some(
                            cx.expr(expr, ValueType::Boolean)
                                .map_err(|e| node_fail(e.0, e.1))?,
                        ),
                        None => None,
                    });
                    choices.push(arrow(choice.to, name)?);
                }
                Step::Dialogue {
                    node: dialogue,
                    values,
                    requires,
                    choices,
                    next: arrow(dialogue.next, name)?,
                    left: arrow(dialogue.left, name)?,
                }
            }
            Node::Effect(effect) => {
                if !effect.owners().contains(&binding.owner) && binding.owner != OwnerKind::Any {
                    return Err(node_fail(
                        "not for this owner",
                        format!("not for {} owners", binding.owner.name()),
                    ));
                }
                cx.subject_read = false;
                let call = effect
                    .compile(&mut cx)
                    .map_err(|expected| node_fail("wrong type", expected))?;
                needs_subject[index] |= effect.needs_subject() || cx.subject_read;
                may_do.reaches.extend(effect.reach(&cx));
                let outputs = effect
                    .outputs()
                    .into_iter()
                    .map(|(_, to)| arrow(to, name))
                    .collect::<Result<Vec<_>, _>>()?;
                Step::Effect {
                    def: effect,
                    call,
                    outputs,
                    pauses: effect.pauses(),
                    keeps_box: effect.keeps_box(),
                }
            }
        };
        steps.push(step);
    }
    cx.node = None;
    if entries.is_empty() {
        return Err(fail("unreachable node", None, "no on node".to_owned()));
    }
    for (name, (_, _)) in &cx.variables {
        if !cx.used_vars.contains(name) {
            return Err(fail(
                "unused variable",
                None,
                format!("{name} is never used"),
            ));
        }
    }
    for (index, (name, _)) in source.locals.iter().enumerate() {
        if !cx.read_slots.contains(&Slot::Local(index)) {
            return Err(fail(
                "unused local",
                None,
                format!("local {name} is never read"),
            ));
        }
    }
    for (index, (name, _)) in source.state.iter().enumerate() {
        if !cx.read_slots.contains(&Slot::State(index)) {
            return Err(fail(
                "unused local",
                None,
                format!("state {name} is never read"),
            ));
        }
    }
    let successors: Vec<Vec<usize>> = steps.iter().map(step_successors).collect();
    let mut reachable = vec![false; names.len()];
    let mut subject_free = vec![false; names.len()];
    for (entry, event) in &entries {
        let mut todo = vec![*entry];
        while let Some(node) = todo.pop() {
            if reachable[node] && (event.has_subject() || subject_free[node]) {
                continue;
            }
            reachable[node] = true;
            if !event.has_subject() {
                subject_free[node] = true;
            }
            todo.extend(successors[node].iter().copied());
        }
    }
    for (index, name) in names.iter().enumerate() {
        if !reachable[index] {
            return Err(fail(
                "unreachable node",
                Some(name),
                "no on node leads here".to_owned(),
            ));
        }
        if subject_free[index] && needs_subject[index] {
            return Err(fail(
                "no subject here",
                Some(name),
                "reached from an event without a subject".to_owned(),
            ));
        }
    }
    bound_steps(&steps, &names, &successors, &entries, &fail)?;
    let any_needs_subject = needs_subject.iter().any(|needs| *needs);
    Ok(Arc::new(Procedure {
        id: NEXT_PROCEDURE.fetch_add(1, Ordering::Relaxed),
        owner: binding.owner,
        label: source.label,
        names,
        steps,
        entries,
        state: source.state.to_vec(),
        locals: source.locals.to_vec(),
        may_do,
        returns,
        needs_subject: any_needs_subject,
    }))
}

static NEXT_PROCEDURE: AtomicU64 = AtomicU64::new(1);

struct Source<V: Vocabulary> {
    state: &'static [(Name, ValueType)],
    locals: &'static [(Name, ValueType)],
    nodes: &'static [(Name, Node<V>)],
    label: String,
}

fn step_successors<V: Vocabulary>(step: &Step<V>) -> Vec<usize> {
    let arrows: Vec<Next> = match step {
        Step::On { next } | Step::Wait { next, .. } | Step::Set { next, .. } => vec![*next],
        Step::If { yes, no, .. } => vec![*yes, *no],
        Step::Random { outputs, .. } => outputs.clone(),
        Step::Repeat { each, then, .. } => vec![*each, *then],
        Step::Run { next, .. } => vec![*next],
        Step::Return { .. } => vec![],
        Step::Dialogue {
            choices,
            next,
            left,
            ..
        } => {
            let mut all = choices.clone();
            all.push(*next);
            all.push(*left);
            all
        }
        Step::Effect { outputs, .. } => outputs.clone(),
    };
    arrows.into_iter().flatten().collect()
}

fn bound_steps<V: Vocabulary>(
    steps: &[Step<V>],
    names: &[Name],
    successors: &[Vec<usize>],
    entries: &[(usize, V::Event)],
    fail: &impl Fn(&'static str, Option<Name>, String) -> ScriptError,
) -> Result<(), ScriptError> {
    let pauses = |node: usize| match &steps[node] {
        Step::Wait { .. } | Step::Dialogue { .. } => true,
        Step::Effect { pauses, .. } => *pauses,
        _ => false,
    };
    let mut sources: Vec<usize> = entries.iter().map(|(entry, _)| *entry).collect();
    sources.extend((0..steps.len()).filter(|node| pauses(*node)));
    let mut memo: HashMap<usize, usize> = HashMap::new();
    for source in sources {
        let mut path = Vec::new();
        let starts: Vec<usize> = if pauses(source) {
            successors[source].clone()
        } else {
            vec![source]
        };
        for start in starts {
            longest(
                start, steps, names, successors, &pauses, &mut path, &mut memo, fail,
            )?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn longest<V: Vocabulary>(
    node: usize,
    steps: &[Step<V>],
    names: &[Name],
    successors: &[Vec<usize>],
    pauses: &impl Fn(usize) -> bool,
    path: &mut Vec<usize>,
    memo: &mut HashMap<usize, usize>,
    fail: &impl Fn(&'static str, Option<Name>, String) -> ScriptError,
) -> Result<usize, ScriptError> {
    if pauses(node) {
        return Ok(1);
    }
    if let Some(known) = memo.get(&node) {
        return Ok(*known);
    }
    if path.contains(&node) {
        let cycle: Vec<&str> = path
            .iter()
            .skip_while(|seen| **seen != node)
            .map(|seen| names[*seen])
            .chain([names[node]])
            .collect();
        return Err(fail(
            "loop without a wait",
            Some(names[node]),
            cycle.join(" → "),
        ));
    }
    path.push(node);
    let cost = match &steps[node] {
        Step::Repeat {
            at_most,
            each,
            then,
            ..
        } => {
            let body = match each {
                Some(each) => longest(*each, steps, names, successors, pauses, path, memo, fail)?,
                None => 0,
            };
            let after = match then {
                Some(then) => longest(*then, steps, names, successors, pauses, path, memo, fail)?,
                None => 0,
            };
            (*at_most as usize) * (1 + body) + 1 + after
        }
        _ => {
            let mut most = 0;
            for next in &successors[node] {
                most = most.max(longest(
                    *next, steps, names, successors, pauses, path, memo, fail,
                )?);
            }
            1 + most
        }
    };
    path.pop();
    if cost > MAX_STEPS {
        return Err(fail(
            "too many steps",
            Some(names[node]),
            format!("{cost} steps between pauses, at most {MAX_STEPS}"),
        ));
    }
    memo.insert(node, cost);
    Ok(cost)
}

fn check_reveal(reveal: &[super::Reveal]) -> Result<(), (&'static str, String)> {
    let mut seen = HashSet::new();
    for kind in reveal {
        if !seen.insert(*kind) {
            return Err(("revealed twice", format!("{kind:?} twice")));
        }
    }
    Ok(())
}

pub fn nearest<'a>(wanted: &str, known: impl Iterator<Item = &'a str>) -> String {
    let known: Vec<String> = known.map(str::to_owned).collect();
    crate::core::content::id::nearest(&known, wanted)
        .map(|near| format!(" · nearest {near:?}"))
        .unwrap_or_default()
}

pub struct Compiler<'c, V: Vocabulary> {
    pub content: &'c Content,
    owner: OwnerKind,
    label: String,
    variables: HashMap<Name, (VariableType, Option<&'c VarValue<V>>)>,
    state: &'static [(Name, ValueType)],
    locals: &'static [(Name, ValueType)],
    node: Option<Name>,
    has_subject: bool,
    used_vars: HashSet<Name>,
    read_slots: HashSet<Slot>,
    stack: Vec<ScriptId<V>>,
    subject_read: bool,
    event_fields: &'static [(Name, ValueType)],
}

type ExprError = (&'static str, String);

impl<'c, V: Vocabulary> Compiler<'c, V> {
    pub fn standalone(content: &'c Content) -> Compiler<'c, V> {
        Compiler {
            content,
            owner: OwnerKind::Any,
            label: "condition".to_owned(),
            variables: HashMap::new(),
            state: &[],
            locals: &[],
            node: None,
            has_subject: true,
            used_vars: HashSet::new(),
            read_slots: HashSet::new(),
            stack: Vec::new(),
            subject_read: false,
            event_fields: &[],
        }
    }

    pub fn owner(&self) -> OwnerKind {
        self.owner
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn node(&self) -> Option<Name> {
        self.node
    }

    pub fn has_subject(&self) -> bool {
        self.has_subject
    }

    pub fn expr(&mut self, expr: &'static Expr<V>, want: ValueType) -> Result<Eval, ExprError> {
        let (eval, ty) = self.typed(expr)?;
        if !want.accepts(ty) {
            return Err((
                "wrong type",
                format!("{} is {}, expected {}", expr.kind(), ty.name(), want.name()),
            ));
        }
        Ok(if ty == want {
            eval
        } else {
            Box::new(move |world, cx| eval(world, cx).widened(want))
        })
    }

    pub fn opt_expr(
        &mut self,
        expr: Option<&'static Expr<V>>,
        want: ValueType,
    ) -> Result<Option<Eval>, ExprError> {
        expr.map(|expr| self.expr(expr, want)).transpose()
    }

    pub fn actor(&mut self, expr: Option<&'static Expr<V>>) -> Result<Eval, ExprError> {
        match expr {
            Some(expr) => self.expr(expr, ValueType::Actor),
            None => {
                self.subject_read = true;
                Ok(Box::new(|_, cx: &FlowCx| Value::Actor(cx.subject)))
            }
        }
    }

    pub fn fill<T: Clone>(
        &mut self,
        fill: &Fill<T>,
        ty: VariableType,
        extract: impl Fn(&VarValue<V>) -> Option<T>,
    ) -> Result<T, ExprError> {
        match fill {
            Fill::Const(value) => Ok(value.clone()),
            Fill::Var(name) => {
                let value = self.var(name)?;
                extract(value).ok_or_else(|| ("wrong type", format!("{name} is not a {ty:?}")))
            }
        }
    }

    pub fn peek<T: Clone>(
        &self,
        fill: &Fill<T>,
        extract: impl Fn(&VarValue<V>) -> Option<T>,
    ) -> Option<T> {
        match fill {
            Fill::Const(value) => Some(value.clone()),
            Fill::Var(name) => self
                .variables
                .get(name)
                .and_then(|(_, value)| value.and_then(extract)),
        }
    }

    pub fn peek_place(&self, fill: &Fill<V::Place>) -> Option<V::Place> {
        self.peek(fill, |value| match value {
            VarValue::Place(place) => Some(place.clone()),
            _ => None,
        })
    }

    pub fn peek_row(&self, fill: &Fill<V::Row>) -> Option<V::Row> {
        self.peek(fill, |value| match value {
            VarValue::Row(row) => Some(row.clone()),
            _ => None,
        })
    }

    pub fn peek_audio(&self, fill: &Fill<V::Audio>) -> Option<V::Audio> {
        self.peek(fill, |value| match value {
            VarValue::Audio(audio) => Some(audio.clone()),
            _ => None,
        })
    }

    pub fn place(&mut self, fill: &Fill<V::Place>) -> Result<V::Place, ExprError> {
        self.fill(fill, VariableType::Place, |value| match value {
            VarValue::Place(place) => Some(place.clone()),
            _ => None,
        })
    }

    pub fn row(&mut self, fill: &Fill<V::Row>) -> Result<V::Row, ExprError> {
        self.fill(fill, VariableType::Row, |value| match value {
            VarValue::Row(row) => Some(row.clone()),
            _ => None,
        })
    }

    pub fn audio(&mut self, fill: &Fill<V::Audio>) -> Result<V::Audio, ExprError> {
        self.fill(fill, VariableType::Audio, |value| match value {
            VarValue::Audio(audio) => Some(audio.clone()),
            _ => None,
        })
    }

    pub fn name(&mut self, fill: &Fill<Name>) -> Result<Name, ExprError> {
        self.fill(fill, VariableType::Name, |value| match value {
            VarValue::Name(name) => Some(name),
            _ => None,
        })
    }

    pub fn var(&mut self, name: Name) -> Result<&'c VarValue<V>, ExprError> {
        let Some((_, value)) = self.variables.get(name) else {
            return Err((
                "unknown variable",
                format!("{name}{}", nearest(name, self.variables.keys().copied())),
            ));
        };
        self.used_vars.insert(name);
        value.ok_or(("missing value", format!("{name} has no value")))
    }

    fn expr_tracking(
        &mut self,
        expr: &'static Expr<V>,
        want: ValueType,
    ) -> Result<(Eval, bool), ExprError> {
        self.subject_read = false;
        let eval = self.expr(expr, want)?;
        Ok((eval, self.subject_read))
    }

    fn typed_tracking(
        &mut self,
        expr: &'static Expr<V>,
    ) -> Result<(Eval, ValueType, bool), ExprError> {
        self.subject_read = false;
        let (eval, ty) = self.typed(expr)?;
        Ok((eval, ty, self.subject_read))
    }

    fn event_field(&self, name: Name) -> Option<(usize, ValueType)> {
        self.event_fields
            .iter()
            .position(|(known, _)| *known == name)
            .map(|index| (index, self.event_fields[index].1))
    }

    fn local(&self, name: Name) -> Option<(usize, ValueType)> {
        self.locals
            .iter()
            .position(|(known, _)| *known == name)
            .map(|index| (index, self.locals[index].1))
    }

    fn state(&self, name: Name) -> Option<(usize, ValueType)> {
        self.state
            .iter()
            .position(|(known, _)| *known == name)
            .map(|index| (index, self.state[index].1))
    }

    pub fn typed(&mut self, expr: &'static Expr<V>) -> Result<(Eval, ValueType), ExprError> {
        if expr.depth() > expr::MAX_DEPTH {
            return Err((
                "out of range",
                format!("expressions nest at most {} deep", expr::MAX_DEPTH),
            ));
        }
        if expr.size() > expr::MAX_NODES {
            return Err((
                "out of range",
                format!("expressions hold at most {} nodes", expr::MAX_NODES),
            ));
        }
        self.typed_inner(expr)
    }

    fn typed_inner(&mut self, expr: &'static Expr<V>) -> Result<(Eval, ValueType), ExprError> {
        Ok(match expr {
            Expr::Bool(value) => (constant(Value::Bool(*value)), ValueType::Boolean),
            Expr::Int(value) => (constant(Value::Int(*value)), ValueType::Integer),
            Expr::Num(value) => (constant(Value::Num(*value)), ValueType::Number),
            Expr::Text(value) => (constant(Value::Text((*value).to_owned())), ValueType::Text),
            Expr::Var(name) => match self.var(name)? {
                VarValue::Integer(value) => (constant(Value::Int(*value)), ValueType::Integer),
                VarValue::Number(value) => (constant(Value::Num(*value)), ValueType::Number),
                VarValue::Boolean(value) => (constant(Value::Bool(*value)), ValueType::Boolean),
                VarValue::Text(value) => {
                    (constant(Value::Text((*value).to_owned())), ValueType::Text)
                }
                VarValue::Condition(condition) => {
                    let condition: &'static Expr<V> = condition;
                    (
                        self.expr(condition, ValueType::Boolean)?,
                        ValueType::Boolean,
                    )
                }
                other => {
                    return Err((
                        "wrong type",
                        format!("{name} is a {:?}, not a value", other.variable_type()),
                    ));
                }
            },
            Expr::Local(name) => {
                let (index, ty) = self
                    .local(name)
                    .ok_or_else(|| ("unknown variable", format!("local {name}")))?;
                self.read_slots.insert(Slot::Local(index));
                (Box::new(move |_, cx: &FlowCx| cx.locals[index].clone()), ty)
            }
            Expr::State(name) => {
                let (index, ty) = self
                    .state(name)
                    .ok_or_else(|| ("unknown variable", format!("state {name}")))?;
                self.read_slots.insert(Slot::State(index));
                (Box::new(move |_, cx: &FlowCx| cx.state[index].clone()), ty)
            }
            Expr::Event(name) => {
                let (index, ty) = self
                    .event_field(name)
                    .ok_or_else(|| ("unknown field", format!("the event has no field {name}")))?;
                (Box::new(move |_, cx: &FlowCx| cx.event_field(index)), ty)
            }
            Expr::Query(query) => {
                let ty = query.value_type(self).map_err(|e| ("wrong type", e))?;
                if query.reads_subject() {
                    self.subject_read = true;
                }
                (query.compile(self).map_err(|e| ("wrong type", e))?, ty)
            }
            Expr::All(list) | Expr::Any(list) => {
                let all = matches!(expr, Expr::All(_));
                let parts = self.list(list, ValueType::Boolean)?;
                (
                    Box::new(move |world, cx| {
                        let mut result = all;
                        for part in &parts {
                            let held = part(world, cx).truthy();
                            if all && !held {
                                result = false;
                                break;
                            }
                            if !all && held {
                                result = true;
                                break;
                            }
                        }
                        Value::Bool(result)
                    }),
                    ValueType::Boolean,
                )
            }
            Expr::Not(of) => {
                let of = self.expr(of, ValueType::Boolean)?;
                (
                    Box::new(move |world, cx| Value::Bool(!of(world, cx).truthy())),
                    ValueType::Boolean,
                )
            }
            Expr::Equal(a, b) | Expr::NotEqual(a, b) => {
                let negate = matches!(expr, Expr::NotEqual(..));
                let (a, ta) = self.typed_inner(a)?;
                let (b, tb) = self.typed_inner(b)?;
                if !(ta.accepts(tb) || tb.accepts(ta)) {
                    return Err((
                        "wrong type",
                        format!("comparing {} with {}", ta.name(), tb.name()),
                    ));
                }
                (
                    Box::new(move |world, cx| {
                        let a = a(world, cx);
                        let b = b(world, cx);
                        let equal = match (&a, &b) {
                            (Value::Int(a), Value::Int(b)) => a == b,
                            (Value::Text(a), Value::Text(b)) => a == b,
                            (Value::Bool(a), Value::Bool(b)) => a == b,
                            (Value::Actor(a), Value::Actor(b)) => a == b,
                            _ => a.as_num() == b.as_num(),
                        };
                        Value::Bool(equal != negate)
                    }),
                    ValueType::Boolean,
                )
            }
            Expr::Less(a, b) | Expr::AtMost(a, b) | Expr::More(a, b) | Expr::AtLeast(a, b) => {
                let (a, b, _) = self.numeric(a, b)?;
                let compare: fn(f64, f64) -> bool = match expr {
                    Expr::Less(..) => |a, b| a < b,
                    Expr::AtMost(..) => |a, b| a <= b,
                    Expr::More(..) => |a, b| a > b,
                    _ => |a, b| a >= b,
                };
                (
                    Box::new(move |world, cx| {
                        Value::Bool(compare(a(world, cx).as_num(), b(world, cx).as_num()))
                    }),
                    ValueType::Boolean,
                )
            }
            Expr::Add(a, b)
            | Expr::Subtract(a, b)
            | Expr::Multiply(a, b)
            | Expr::Min(a, b)
            | Expr::Max(a, b) => {
                let (a, b, integer) = self.numeric(a, b)?;
                let op = expr.kind();
                let eval: Eval = if integer {
                    let f: fn(i64, i64) -> i64 = match op {
                        "add" => i64::saturating_add,
                        "subtract" => i64::saturating_sub,
                        "multiply" => i64::saturating_mul,
                        "min" => i64::min,
                        _ => i64::max,
                    };
                    Box::new(move |world, cx| {
                        Value::Int(f(a(world, cx).as_int(), b(world, cx).as_int()))
                    })
                } else {
                    let f: fn(f64, f64) -> f64 = match op {
                        "add" => |a, b| a + b,
                        "subtract" => |a, b| a - b,
                        "multiply" => |a, b| a * b,
                        "min" => f64::min,
                        _ => f64::max,
                    };
                    Box::new(move |world, cx| {
                        Value::Num(f(a(world, cx).as_num(), b(world, cx).as_num()))
                    })
                };
                (
                    eval,
                    if integer {
                        ValueType::Integer
                    } else {
                        ValueType::Number
                    },
                )
            }
            Expr::Divide(a, b) => {
                let (a, b, _) = self.numeric(a, b)?;
                (
                    Box::new(move |world, cx| {
                        let divisor = b(world, cx).as_num();
                        Value::Num(if divisor == 0.0 {
                            0.0
                        } else {
                            a(world, cx).as_num() / divisor
                        })
                    }),
                    ValueType::Number,
                )
            }
            Expr::Round(of) => {
                let of = self.expr(of, ValueType::Number)?;
                (
                    Box::new(move |world, cx| Value::Int(of(world, cx).as_num().round() as i64)),
                    ValueType::Integer,
                )
            }
            Expr::Join(list) => {
                if list.len() > expr::MAX_LIST {
                    return Err(("out of range", format!("at most {} parts", expr::MAX_LIST)));
                }
                let mut parts = Vec::new();
                for part in list.iter() {
                    parts.push(self.typed_inner(part)?.0);
                }
                (
                    Box::new(move |world, cx| {
                        Value::Text(parts.iter().map(|part| part(world, cx).as_text()).collect())
                    }),
                    ValueType::Text,
                )
            }
        })
    }

    fn list(&mut self, list: &'static [Expr<V>], want: ValueType) -> Result<Vec<Eval>, ExprError> {
        if list.len() > expr::MAX_LIST {
            return Err(("out of range", format!("at most {} parts", expr::MAX_LIST)));
        }
        list.iter().map(|part| self.expr(part, want)).collect()
    }

    fn numeric(
        &mut self,
        a: &'static Expr<V>,
        b: &'static Expr<V>,
    ) -> Result<(Eval, Eval, bool), ExprError> {
        let (a, ta) = self.typed_inner(a)?;
        let (b, tb) = self.typed_inner(b)?;
        for ty in [ta, tb] {
            if !ValueType::Number.accepts(ty) {
                return Err(("wrong type", format!("{} is not a number", ty.name())));
            }
        }
        Ok((a, b, ta == ValueType::Integer && tb == ValueType::Integer))
    }
}

fn constant(value: Value) -> Eval {
    Box::new(move |_, _| value.clone())
}

pub fn script_def_check<V: Vocabulary>(def: &ScriptDef<V>) -> Result<(), String> {
    if def.owner == OwnerKind::Any {
        let runs = def
            .nodes
            .iter()
            .filter(|(_, node)| matches!(node, Node::On { event, .. } if event.is_run()))
            .count();
        if runs != 1 {
            return Err("a function has exactly one run node".to_owned());
        }
    }
    Ok(())
}
