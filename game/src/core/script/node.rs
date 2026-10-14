use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::dialogue::DialogueNode;
use super::expr::Expr;
use super::{Arrow, ScriptId, VarValue, Vocabulary};

pub const MAX_NODES: usize = 2_000;
pub const MAX_SLOTS: usize = 32;
pub const MAX_REPEAT: u32 = 1_000;
pub const MAX_WAIT: f32 = 3_600.0;
pub const MAX_STEPS: usize = 10_000;
pub const MAX_CALL_DEPTH: usize = 8;
pub const MAX_LIVE_FLOWS: usize = 32;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", bound = "")]
#[schemars(bound = "")]
pub enum Node<V: Vocabulary> {
    On {
        #[serde(flatten)]
        event: V::Event,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    If {
        test: Expr<V>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        yes: Arrow,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        no: Arrow,
    },
    Random {
        weights: Vec<u32>,
        outputs: Vec<Arrow>,
    },
    Repeat {
        times: Expr<V>,
        at_most: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        each: Arrow,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        then: Arrow,
    },
    Wait {
        seconds: Expr<V>,
        at_most: f32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Set {
        values: Vec<Assignment<V>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Run {
        script: ScriptId<V>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        values: BTreeMap<String, VarValue<V>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        into: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        next: Arrow,
    },
    Return {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<Expr<V>>,
    },
    Dialogue(DialogueNode<V>),
    #[serde(untagged)]
    Effect(V::Effect),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "")]
#[schemars(bound = "")]
pub struct Assignment<V: Vocabulary> {
    #[serde(flatten)]
    pub target: Target,
    pub to: Expr<V>,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Target {
    Local(String),
    State(String),
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
