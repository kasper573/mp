use serde::{Deserialize, Serialize};

use super::expr::Expr;
use super::{Arrow, Name, Vocabulary};

pub const MAX_LINES: usize = 16;
pub const MAX_CHOICES: usize = 12;

#[derive(Clone)]
pub struct DialogueNode<V: Vocabulary> {
    pub lines: &'static [V::Line],
    pub choices: &'static [Choice<V>],
    pub next: Arrow,
    pub left: Arrow,
}

#[derive(Clone)]
pub struct Choice<V: Vocabulary> {
    pub label: V::Text,
    pub requires: Option<Expr<V>>,
    pub reveal: &'static [Reveal],
    pub warn: Option<Name>,
    pub to: Arrow,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Reveal {
    Locked,
    Needs,
    Costs,
    Gains,
}

pub struct DialogueView<'a, V: Vocabulary> {
    pub script: &'a str,
    pub node: Name,
    pub lines: Vec<(&'a V::Line, SpokenValues)>,
    pub choices: Vec<ChoiceOffer<'a, V>>,
}

pub type SpokenValues = Vec<super::Value>;

pub struct ChoiceOffer<'a, V: Vocabulary> {
    pub index: usize,
    pub label: &'static V::Text,
    pub locked: bool,
    pub requires: Option<&'static Expr<V>>,
    pub reveal: &'static [Reveal],
    pub warn: Option<Name>,
    pub leads: Vec<&'a V::Effect>,
}
