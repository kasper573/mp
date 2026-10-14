use std::cell::RefCell;
use std::sync::Arc;

use bevy_ecs::prelude::*;
use bevy_platform::collections::HashMap;
use thread_local::ThreadLocal;

use super::{Condition, RiftQuery, RiftScripting};
use crate::core::content::Content;
use crate::core::script::{Compiler, Eval, Expr, FlowCx, ScriptFault, Value, ValueType};
use crate::systems::stat::StatKind;
use crate::systems::text::{self, LineText, Span};

#[derive(Clone)]
pub struct CompiledCondition(Arc<Eval>);

impl CompiledCondition {
    pub fn new(content: &Content, condition: &'static Condition) -> CompiledCondition {
        CompiledCondition(compiled(content, condition, ValueType::Boolean))
    }

    pub fn holds(&self, world: &World, subject: Entity) -> bool {
        run(world, subject, &self.0).truthy()
    }
}

pub fn holds(world: &World, subject: Entity, condition: &'static Condition) -> bool {
    eval(world, subject, condition, ValueType::Boolean).truthy()
}

pub fn first_unmet(
    world: &World,
    subject: Entity,
    conditions: impl IntoIterator<Item = &'static Condition>,
) -> Option<String> {
    conditions
        .into_iter()
        .flat_map(parts)
        .find(|part| !holds(world, subject, part))
        .map(|part| describe(world.resource::<Content>(), part))
}

pub fn spoken(world: &World, subject: Entity, spans: &'static [Span]) -> LineText {
    let values: Vec<Value> = text::values(spans)
        .into_iter()
        .map(|value| eval(world, subject, value, ValueType::Text))
        .collect();
    LineText::spoken(spans, &values)
}

fn eval(world: &World, subject: Entity, expr: &'static Condition, want: ValueType) -> Value {
    run(
        world,
        subject,
        &compiled(world.resource::<Content>(), expr, want),
    )
}

fn run(world: &World, subject: Entity, compiled: &Eval) -> Value {
    compiled(world, &FlowCx::standalone(subject))
}

pub fn check(content: &Content, condition: &'static Condition) -> Result<(), ScriptFault> {
    Compiler::<RiftScripting>::standalone(content)
        .expr(condition, ValueType::Boolean)
        .map(|_| ())
}

pub fn check_value(content: &Content, value: &'static Condition) -> Result<(), ScriptFault> {
    Compiler::<RiftScripting>::standalone(content)
        .expr(value, ValueType::Text)
        .map(|_| ())
}

pub fn min_level(part: &Condition) -> Option<u32> {
    match part {
        Expr::AtLeast(a, b) => match (&**a, &**b) {
            (Expr::Query(RiftQuery::Level { .. }), Expr::Int(level)) => u32::try_from(*level).ok(),
            _ => None,
        },
        _ => None,
    }
}

pub fn parts(condition: &'static Condition) -> Vec<&'static Condition> {
    match condition {
        Expr::All(parts) => parts.iter().collect(),
        other => vec![other],
    }
}

pub fn describe(content: &Content, condition: &Condition) -> String {
    match condition {
        Expr::Not(of) => format!("not {}", describe(content, of)),
        Expr::All(parts) => parts
            .iter()
            .map(|part| describe(content, part))
            .collect::<Vec<_>>()
            .join(" and "),
        Expr::Any(parts) => parts
            .iter()
            .map(|part| describe(content, part))
            .collect::<Vec<_>>()
            .join(" or "),
        Expr::AtLeast(a, b) | Expr::More(a, b) => match (&**a, &**b) {
            (Expr::Query(RiftQuery::Level { .. }), Expr::Int(level)) => format!("Level {level}"),
            (Expr::Query(RiftQuery::Holding { item, .. }), Expr::Int(count)) => {
                format!("{count} {}", item.get(content).name)
            }
            (Expr::Query(RiftQuery::Stat { stat, .. }), Expr::Num(min)) => {
                format!("{min} {}", stat_label(*stat))
            }
            (Expr::Query(RiftQuery::Stat { stat, .. }), Expr::Int(min)) => {
                format!("{min} {}", stat_label(*stat))
            }
            (Expr::Query(RiftQuery::Memory { memory, .. }), Expr::Int(count)) => {
                format!("{} {count}", memory.get(content).label)
            }
            (Expr::Query(RiftQuery::FreeSlots { .. }), Expr::Int(1)) => "1 free slot".to_owned(),
            (Expr::Query(RiftQuery::FreeSlots { .. }), Expr::Int(slots)) => {
                format!("{slots} free slots")
            }
            _ => format!("{} ≥ {}", describe(content, a), describe(content, b)),
        },
        Expr::Query(query) => describe_query(content, query),
        Expr::Bool(value) => value.to_string(),
        Expr::Int(value) => value.to_string(),
        Expr::Num(value) => value.to_string(),
        Expr::Text(value) => (*value).to_owned(),
        Expr::Equal(a, b) => format!("{} is {}", describe(content, a), describe(content, b)),
        Expr::NotEqual(a, b) => format!("{} is not {}", describe(content, a), describe(content, b)),
        Expr::Less(a, b) => format!("{} < {}", describe(content, a), describe(content, b)),
        Expr::AtMost(a, b) => format!("{} ≤ {}", describe(content, a), describe(content, b)),
        other => other.kind().to_owned(),
    }
}

fn describe_query(content: &Content, query: &RiftQuery) -> String {
    match query {
        RiftQuery::Level { .. } => "Level".to_owned(),
        RiftQuery::IsJob { job, .. } => job.get(content).name.to_owned(),
        RiftQuery::Stat { stat, .. } => stat_label(*stat).to_owned(),
        RiftQuery::Buffed { stat, .. } => format!("{} buffed", stat_label(*stat)),
        RiftQuery::Holding { item, .. } => item.get(content).name.to_owned(),
        RiftQuery::FreeSlots { .. } => "free slots".to_owned(),
        RiftQuery::Wearing { item, .. } => format!("{} worn", item.get(content).name),
        RiftQuery::Memory { memory, .. } => memory.get(content).label.to_owned(),
        RiftQuery::SetWithin { memory, .. } => format!("{} lately", memory.get(content).label),
        RiftQuery::OnQuest { quest, .. } => format!("On {}", quest.get(content).title),
        RiftQuery::QuestDone { quest, .. } => quest.get(content).title.to_owned(),
        RiftQuery::QuestCooling { quest, .. } => {
            format!("{} done for today", quest.get(content).title)
        }
        RiftQuery::TaskDone { quest, task, .. } => format!("{} · {task}", quest.get(content).title),
        RiftQuery::QuestResetsIn { quest, .. } => format!("{} resets", quest.get(content).title),
        RiftQuery::Inside { object, .. } => format!("Standing on {object}"),
        RiftQuery::InArea { area, .. } => format!("In {}", area.get(content).name),
        RiftQuery::KnowsArea { area, .. } => format!("Knows {}", area.get(content).name),
        RiftQuery::Nearest { .. } => "nearest".to_owned(),
        RiftQuery::Count { .. } => "count".to_owned(),
        RiftQuery::Present { .. } => "present".to_owned(),
        RiftQuery::Distance { .. } => "distance".to_owned(),
        RiftQuery::Health { .. } => "health".to_owned(),
        RiftQuery::IsNpc { .. } => "an npc".to_owned(),
        RiftQuery::Subject => "you".to_owned(),
        RiftQuery::Target => "target".to_owned(),
        RiftQuery::Walking { .. } => "walking".to_owned(),
        RiftQuery::Hostile { .. } => "hostile".to_owned(),
        RiftQuery::GroundItems { item, .. } => format!("{} on the ground", item.get(content).name),
    }
}

fn stat_label(stat: StatKind) -> &'static str {
    stat.into()
}

// Keyed by address, which only stays unique while the content lives, so the cache is built into it.
#[derive(Default)]
pub(super) struct CompiledConditions(ThreadLocal<RefCell<ByAddress>>);

type ByAddress = HashMap<(usize, ValueType), Arc<Eval>>;

fn compiled(content: &Content, condition: &'static Condition, want: ValueType) -> Arc<Eval> {
    let key = (condition as *const Condition as usize, want);
    let cache = content.built::<CompiledConditions>().0.get_or_default();
    if let Some(found) = cache.borrow().get(&key) {
        return found.clone();
    }
    let eval = Compiler::<RiftScripting>::standalone(content)
        .expr(condition, want)
        .unwrap_or_else(|fault| {
            panic!("condition does not compile ({fault}); check_content should have refused it")
        });
    let eval = Arc::new(eval);
    cache.borrow_mut().insert(key, eval.clone());
    eval
}
