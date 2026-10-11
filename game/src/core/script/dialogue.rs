use serde::{Deserialize, Serialize};

use super::expr::Expr;
use super::{Arrow, Name, Vocabulary};
use crate::core::content::serial;

pub const MAX_LINES: usize = 16;
pub const MAX_CHOICES: usize = 12;

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct DialogueNode<V: Vocabulary> {
    pub lines: &'static [V::Line],
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub choices: &'static [Choice<V>],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Arrow,
}

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct Choice<V: Vocabulary> {
    pub label: V::Text,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires: Option<Expr<V>>,
    #[serde(skip_serializing_if = "serial::is_empty")]
    pub reveal: &'static [Reveal],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warn: Option<Name>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
