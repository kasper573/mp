use std::borrow::Cow;

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};

use super::Vocabulary;

#[derive(Clone, Serialize, Deserialize)]
#[serde(into = "ExprRow<V>", from = "ExprRow<V>", bound = "")]
pub enum Expr<V: Vocabulary> {
    Bool(bool),
    Int(i64),
    Num(f64),
    Text(String),
    Var(String),
    Local(String),
    State(String),
    Event(String),
    Query(V::Query),
    All(Vec<Expr<V>>),
    Any(Vec<Expr<V>>),
    Not(Box<Expr<V>>),
    Equal(Box<Expr<V>>, Box<Expr<V>>),
    NotEqual(Box<Expr<V>>, Box<Expr<V>>),
    Less(Box<Expr<V>>, Box<Expr<V>>),
    AtMost(Box<Expr<V>>, Box<Expr<V>>),
    More(Box<Expr<V>>, Box<Expr<V>>),
    AtLeast(Box<Expr<V>>, Box<Expr<V>>),
    Add(Box<Expr<V>>, Box<Expr<V>>),
    Subtract(Box<Expr<V>>, Box<Expr<V>>),
    Multiply(Box<Expr<V>>, Box<Expr<V>>),
    Divide(Box<Expr<V>>, Box<Expr<V>>),
    Min(Box<Expr<V>>, Box<Expr<V>>),
    Max(Box<Expr<V>>, Box<Expr<V>>),
    Round(Box<Expr<V>>),
    Join(Vec<Expr<V>>),
}

impl<V: Vocabulary> JsonSchema for Expr<V> {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("Expr")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let mut schema = ExprRow::<V>::json_schema(generator);
        schema.insert("x-condition".to_owned(), true.into());
        schema
    }
}

impl<V: Vocabulary> From<ExprRow<V>> for Expr<V> {
    fn from(row: ExprRow<V>) -> Self {
        match row {
            ExprRow::Bool(value) => Expr::Bool(value),
            ExprRow::Int(value) => Expr::Int(value),
            ExprRow::Num(value) => Expr::Num(value),
            ExprRow::Text(value) => Expr::Text(value),
            ExprRow::Var { var } => Expr::Var(var),
            ExprRow::Tagged(tagged) => match tagged {
                Tagged::Local { local } => Expr::Local(local),
                Tagged::State { state } => Expr::State(state),
                Tagged::Event { event } => Expr::Event(event),
                Tagged::All { of } => Expr::All(of),
                Tagged::Any { of } => Expr::Any(of),
                Tagged::Join { of } => Expr::Join(of),
                Tagged::Not { of } => Expr::Not(of),
                Tagged::Round { of } => Expr::Round(of),
                Tagged::Equal { a, b } => Expr::Equal(a, b),
                Tagged::NotEqual { a, b } => Expr::NotEqual(a, b),
                Tagged::Less { a, b } => Expr::Less(a, b),
                Tagged::AtMost { a, b } => Expr::AtMost(a, b),
                Tagged::More { a, b } => Expr::More(a, b),
                Tagged::AtLeast { a, b } => Expr::AtLeast(a, b),
                Tagged::Add { a, b } => Expr::Add(a, b),
                Tagged::Subtract { a, b } => Expr::Subtract(a, b),
                Tagged::Multiply { a, b } => Expr::Multiply(a, b),
                Tagged::Divide { a, b } => Expr::Divide(a, b),
                Tagged::Min { a, b } => Expr::Min(a, b),
                Tagged::Max { a, b } => Expr::Max(a, b),
                Tagged::Query(query) => Expr::Query(query),
            },
        }
    }
}

impl<V: Vocabulary> From<Expr<V>> for ExprRow<V> {
    fn from(expr: Expr<V>) -> Self {
        let tagged = ExprRow::Tagged;
        match expr {
            Expr::Bool(value) => ExprRow::Bool(value),
            Expr::Int(value) => ExprRow::Int(value),
            Expr::Num(value) => ExprRow::Num(value),
            Expr::Text(value) => ExprRow::Text(value),
            Expr::Var(var) => ExprRow::Var { var },
            Expr::Local(local) => tagged(Tagged::Local { local }),
            Expr::State(state) => tagged(Tagged::State { state }),
            Expr::Event(event) => tagged(Tagged::Event { event }),
            Expr::Query(query) => tagged(Tagged::Query(query)),
            Expr::All(of) => tagged(Tagged::All { of }),
            Expr::Any(of) => tagged(Tagged::Any { of }),
            Expr::Join(of) => tagged(Tagged::Join { of }),
            Expr::Not(of) => tagged(Tagged::Not { of }),
            Expr::Round(of) => tagged(Tagged::Round { of }),
            Expr::Equal(a, b) => tagged(Tagged::Equal { a, b }),
            Expr::NotEqual(a, b) => tagged(Tagged::NotEqual { a, b }),
            Expr::Less(a, b) => tagged(Tagged::Less { a, b }),
            Expr::AtMost(a, b) => tagged(Tagged::AtMost { a, b }),
            Expr::More(a, b) => tagged(Tagged::More { a, b }),
            Expr::AtLeast(a, b) => tagged(Tagged::AtLeast { a, b }),
            Expr::Add(a, b) => tagged(Tagged::Add { a, b }),
            Expr::Subtract(a, b) => tagged(Tagged::Subtract { a, b }),
            Expr::Multiply(a, b) => tagged(Tagged::Multiply { a, b }),
            Expr::Divide(a, b) => tagged(Tagged::Divide { a, b }),
            Expr::Min(a, b) => tagged(Tagged::Min { a, b }),
            Expr::Max(a, b) => tagged(Tagged::Max { a, b }),
        }
    }
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(untagged, bound = "")]
#[schemars(bound = "")]
enum ExprRow<V: Vocabulary> {
    Bool(bool),
    Int(i64),
    Num(f64),
    Text(String),
    Var { var: String },
    Tagged(Tagged<V>),
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", bound = "")]
#[schemars(bound = "")]
enum Tagged<V: Vocabulary> {
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
            Expr::Var(_) => "var",
            Expr::Local(_) => "local",
            Expr::State(_) => "state",
            Expr::Event(_) => "event",
            Expr::Query(_) => "query",
            Expr::All(_) => "all",
            Expr::Any(_) => "any",
            Expr::Not(_) => "not",
            Expr::Equal(..) => "equal",
            Expr::NotEqual(..) => "not_equal",
            Expr::Less(..) => "less",
            Expr::AtMost(..) => "at_most",
            Expr::More(..) => "more",
            Expr::AtLeast(..) => "at_least",
            Expr::Add(..) => "add",
            Expr::Subtract(..) => "subtract",
            Expr::Multiply(..) => "multiply",
            Expr::Divide(..) => "divide",
            Expr::Min(..) => "min",
            Expr::Max(..) => "max",
            Expr::Round(_) => "round",
            Expr::Join(_) => "join",
        }
    }

    pub fn children(&self) -> Vec<&Expr<V>> {
        match self {
            Expr::All(list) | Expr::Any(list) | Expr::Join(list) => list.iter().collect(),
            Expr::Not(of) | Expr::Round(of) => vec![of],
            Expr::Equal(a, b)
            | Expr::NotEqual(a, b)
            | Expr::Less(a, b)
            | Expr::AtMost(a, b)
            | Expr::More(a, b)
            | Expr::AtLeast(a, b)
            | Expr::Add(a, b)
            | Expr::Subtract(a, b)
            | Expr::Multiply(a, b)
            | Expr::Divide(a, b)
            | Expr::Min(a, b)
            | Expr::Max(a, b) => vec![a, b],
            _ => Vec::new(),
        }
    }

    pub fn vars(&self) -> Vec<&str> {
        let mut found = Vec::new();
        self.visit(&mut |expr| {
            if let Expr::Var(name) = expr {
                found.push(name.as_str());
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
