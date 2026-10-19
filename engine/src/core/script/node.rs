use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{EnumDiscriminants, EnumString, IntoStaticStr, VariantArray};

use super::dialogue::DialogueNode;
use super::expr::Expr;
use super::{Arrow, EffectDef, ScriptId, VarValue, Vocabulary};
use crate::core::time::Seconds;

pub const MAX_NODES: usize = 2_000;
pub const MAX_SLOTS: usize = 32;
pub const MAX_REPEAT: u32 = 1_000;
pub const MAX_WAIT: Seconds = Seconds(3_600.0);
pub const MAX_STEPS: usize = 10_000;
pub const MAX_CALL_DEPTH: usize = 8;
pub const MAX_LIVE_FLOWS: usize = 32;

#[derive(JsonSchema, Clone, Serialize, Deserialize, EnumDiscriminants)]
#[serde(tag = "type", rename_all = "snake_case", bound = "")]
#[schemars(bound = "")]
#[strum_discriminants(
    name(NodeKind),
    derive(EnumString, IntoStaticStr, VariantArray),
    strum(serialize_all = "snake_case")
)]
pub enum Node<V: Vocabulary> {
    /// Starts a flow at an event; its cause is the subject.
    #[schemars(extend("x-system" = "flow"))]
    On {
        #[serde(flatten)]
        event: V::Event,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        next: Arrow,
    },
    /// Takes yes when the test holds, else no.
    #[schemars(extend("x-system" = "flow"))]
    If {
        test: Expr<V>,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        yes: Arrow,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        no: Arrow,
    },
    /// Picks an output by weight.
    #[schemars(extend("x-system" = "flow"))]
    Random {
        weights: Vec<u32>,
        outputs: Vec<Arrow>,
    },
    /// Runs each a number of times, then goes on.
    #[schemars(extend("x-system" = "flow"))]
    Repeat {
        #[schemars(extend("x-count" = true))]
        times: Expr<V>,
        at_most: u32,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        each: Arrow,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        then: Arrow,
    },
    /// Pauses for seconds, or one tick at 0.
    #[schemars(extend("x-system" = "flow"))]
    Wait {
        seconds: Expr<V>,
        at_most: Seconds,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        next: Arrow,
    },
    /// Writes locals and owner state in order.
    #[schemars(extend("x-system" = "flow"))]
    Set {
        values: Vec<Assignment<V>>,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        next: Arrow,
    },
    /// Calls another script and goes on when it ends.
    #[schemars(extend("x-system" = "flow"))]
    Run {
        script: ScriptId<V>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        values: BTreeMap<String, VarValue<V>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        into: Option<String>,
        #[serde(default, skip_serializing_if = "Arrow::is_none")]
        next: Arrow,
    },
    /// Ends a called script, handing back a value.
    #[schemars(extend("x-system" = "flow"))]
    Return {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<Expr<V>>,
    },
    /// Lines and choices spoken to the subject.
    #[schemars(extend("x-system" = "dialogue"))]
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

impl NodeKind {
    pub fn name(self) -> &'static str {
        self.into()
    }
}

impl<V: Vocabulary> Node<V> {
    /// Whether a flow halts at the node until time passes or someone answers, the only way a
    /// loop may come back around.
    pub fn pauses(&self) -> bool {
        match self {
            Node::Wait { .. } | Node::Dialogue(_) => true,
            Node::Effect(effect) => effect.pauses(),
            _ => false,
        }
    }
}
