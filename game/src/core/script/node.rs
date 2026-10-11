use serde::Serialize;

use super::dialogue::DialogueNode;
use super::expr::Expr;
use super::{Arrow, Name, ScriptId, VarValue, Vocabulary};
use crate::core::content::serial;

pub const MAX_NODES: usize = 2_000;
pub const MAX_SLOTS: usize = 32;
pub const MAX_REPEAT: u32 = 1_000;
pub const MAX_WAIT: f32 = 3_600.0;
pub const MAX_STEPS: usize = 10_000;
pub const MAX_CALL_DEPTH: usize = 8;
pub const MAX_LIVE_FLOWS: usize = 32;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub enum Node<V: Vocabulary> {
    On {
        #[serde(flatten)]
        event: V::Event,
        #[serde(skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    If {
        test: Expr<V>,
        #[serde(skip_serializing_if = "Option::is_none")]
        yes: Arrow,
        #[serde(skip_serializing_if = "Option::is_none")]
        no: Arrow,
    },
    Random {
        weights: &'static [u32],
        outputs: &'static [Arrow],
    },
    Repeat {
        times: Expr<V>,
        at_most: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        each: Arrow,
        #[serde(skip_serializing_if = "Option::is_none")]
        then: Arrow,
    },
    Wait {
        seconds: Expr<V>,
        at_most: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Set {
        values: &'static [Assignment<V>],
        #[serde(skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Run {
        script: ScriptId<V>,
        #[serde(
            serialize_with = "serial::pairs_map",
            skip_serializing_if = "serial::is_empty"
        )]
        values: &'static [(Name, VarValue<V>)],
        #[serde(skip_serializing_if = "Option::is_none")]
        into: Option<Name>,
        #[serde(skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Return {
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<Expr<V>>,
    },
    Dialogue(DialogueNode<V>),
    #[serde(untagged)]
    Effect(V::Effect),
}

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct Assignment<V: Vocabulary> {
    #[serde(flatten)]
    pub target: Target,
    pub to: Expr<V>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Target {
    Local(Name),
    State(Name),
}

impl<V: Vocabulary> Node<V> {
    pub fn kind(&self) -> &'static str {
        match self {
            Node::On { .. } => "on",
            Node::If { .. } => "if",
            Node::Random { .. } => "random",
            Node::Repeat { .. } => "repeat",
            Node::Wait { .. } => "wait",
            Node::Set { .. } => "set",
            Node::Run { .. } => "run",
            Node::Return { .. } => "return",
            Node::Dialogue(_) => "dialogue",
            Node::Effect(_) => "effect",
        }
    }
}
