use super::dialogue::DialogueNode;
use super::expr::Expr;
use super::{Arrow, Name, ScriptId, VarValue, Vocabulary};

pub const MAX_NODES: usize = 2_000;
pub const MAX_SLOTS: usize = 32;
pub const MAX_REPEAT: u32 = 1_000;
pub const MAX_WAIT: f32 = 3_600.0;
pub const MAX_STEPS: usize = 10_000;
pub const MAX_CALL_DEPTH: usize = 8;
pub const MAX_LIVE_FLOWS: usize = 32;

#[derive(Clone)]
pub enum Node<V: Vocabulary> {
    On {
        event: V::Event,
        next: Arrow,
    },
    If {
        test: Expr<V>,
        yes: Arrow,
        no: Arrow,
    },
    Random {
        weights: &'static [u32],
        outputs: &'static [Arrow],
    },
    Repeat {
        times: Expr<V>,
        at_most: u32,
        each: Arrow,
        then: Arrow,
    },
    Wait {
        seconds: Expr<V>,
        at_most: f32,
        next: Arrow,
    },
    Set {
        values: &'static [Assignment<V>],
        next: Arrow,
    },
    Run {
        script: ScriptId<V>,
        values: &'static [(Name, VarValue<V>)],
        into: Option<Name>,
        next: Arrow,
    },
    Return {
        value: Option<Expr<V>>,
    },
    Dialogue(DialogueNode<V>),
    Effect(V::Effect),
}

#[derive(Clone)]
pub struct Assignment<V: Vocabulary> {
    pub target: Target,
    pub to: Expr<V>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
