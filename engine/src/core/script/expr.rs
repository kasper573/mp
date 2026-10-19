use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::Vocabulary;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", bound = "")]
#[schemars(rename = "Expr", bound = "", extend("x-condition" = true))]
pub enum Expr<V: Vocabulary> {
    Local {
        local: String,
    },
    State {
        state: String,
    },
    Event {
        event: String,
    },
    All {
        of: Vec<Expr<V>>,
    },
    Any {
        of: Vec<Expr<V>>,
    },
    Join {
        of: Vec<Expr<V>>,
    },
    Not {
        of: Box<Expr<V>>,
    },
    Round {
        of: Box<Expr<V>>,
    },
    Equal {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    NotEqual {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Less {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    AtMost {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    More {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    AtLeast {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Add {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Subtract {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Multiply {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Divide {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Min {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    Max {
        a: Box<Expr<V>>,
        b: Box<Expr<V>>,
    },
    #[serde(untagged)]
    Bool(bool),
    #[serde(untagged)]
    Int(i64),
    #[serde(untagged)]
    Num(f64),
    #[serde(untagged)]
    Text(String),
    #[serde(untagged)]
    Var {
        var: String,
    },
    #[serde(untagged)]
    Query(V::Query),
}

pub const MAX_DEPTH: usize = 16;
pub const MAX_NODES: usize = 64;
pub const MAX_LIST: usize = 32;

impl<V: Vocabulary> Expr<V> {
    pub fn kind(&self) -> &'static str {
        match self {
            Expr::Bool(_) => "boolean",
            Expr::Int(_) => "integer",
            Expr::Num(_) => "number",
            Expr::Text(_) => "text",
            Expr::Var { .. } => "var",
            Expr::Local { .. } => "local",
            Expr::State { .. } => "state",
            Expr::Event { .. } => "event",
            Expr::Query(_) => "query",
            Expr::All { .. } => "all",
            Expr::Any { .. } => "any",
            Expr::Not { .. } => "not",
            Expr::Equal { .. } => "equal",
            Expr::NotEqual { .. } => "not_equal",
            Expr::Less { .. } => "less",
            Expr::AtMost { .. } => "at_most",
            Expr::More { .. } => "more",
            Expr::AtLeast { .. } => "at_least",
            Expr::Add { .. } => "add",
            Expr::Subtract { .. } => "subtract",
            Expr::Multiply { .. } => "multiply",
            Expr::Divide { .. } => "divide",
            Expr::Min { .. } => "min",
            Expr::Max { .. } => "max",
            Expr::Round { .. } => "round",
            Expr::Join { .. } => "join",
        }
    }

    pub fn children(&self) -> Vec<&Expr<V>> {
        match self {
            Expr::All { of } | Expr::Any { of } | Expr::Join { of } => of.iter().collect(),
            Expr::Not { of } | Expr::Round { of } => vec![of],
            Expr::Equal { a, b }
            | Expr::NotEqual { a, b }
            | Expr::Less { a, b }
            | Expr::AtMost { a, b }
            | Expr::More { a, b }
            | Expr::AtLeast { a, b }
            | Expr::Add { a, b }
            | Expr::Subtract { a, b }
            | Expr::Multiply { a, b }
            | Expr::Divide { a, b }
            | Expr::Min { a, b }
            | Expr::Max { a, b } => vec![a, b],
            _ => Vec::new(),
        }
    }

    pub fn vars(&self) -> Vec<&str> {
        let mut found = Vec::new();
        self.visit(&mut |expr| {
            if let Expr::Var { var } = expr {
                found.push(var.as_str());
            }
        });
        found
    }

    pub fn visit<'a>(&'a self, f: &mut impl FnMut(&'a Expr<V>)) {
        f(self);
        for child in self.children() {
            child.visit(f);
        }
    }

    pub fn depth(&self) -> usize {
        1 + self
            .children()
            .into_iter()
            .map(Expr::depth)
            .max()
            .unwrap_or(0)
    }

    pub fn size(&self) -> usize {
        1 + self.children().into_iter().map(Expr::size).sum::<usize>()
    }
}
