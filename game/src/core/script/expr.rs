use super::{Name, Vocabulary};

#[derive(Clone)]
pub enum Expr<V: Vocabulary> {
    Bool(bool),
    Int(i64),
    Num(f64),
    Text(Name),
    Var(Name),
    Local(Name),
    State(Name),
    Event(Name),
    Query(V::Query),
    All(&'static [Expr<V>]),
    Any(&'static [Expr<V>]),
    Not(&'static Expr<V>),
    Equal(&'static Expr<V>, &'static Expr<V>),
    NotEqual(&'static Expr<V>, &'static Expr<V>),
    Less(&'static Expr<V>, &'static Expr<V>),
    AtMost(&'static Expr<V>, &'static Expr<V>),
    More(&'static Expr<V>, &'static Expr<V>),
    AtLeast(&'static Expr<V>, &'static Expr<V>),
    Add(&'static Expr<V>, &'static Expr<V>),
    Subtract(&'static Expr<V>, &'static Expr<V>),
    Multiply(&'static Expr<V>, &'static Expr<V>),
    Divide(&'static Expr<V>, &'static Expr<V>),
    Min(&'static Expr<V>, &'static Expr<V>),
    Max(&'static Expr<V>, &'static Expr<V>),
    Round(&'static Expr<V>),
    Join(&'static [Expr<V>]),
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

    pub fn queries(&self) -> Vec<&V::Query> {
        let mut found = Vec::new();
        self.visit(&mut |expr| {
            if let Expr::Query(query) = expr {
                found.push(query);
            }
        });
        found
    }

    pub fn vars(&self) -> Vec<Name> {
        let mut found = Vec::new();
        self.visit(&mut |expr| {
            if let Expr::Var(name) = expr {
                found.push(*name);
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
