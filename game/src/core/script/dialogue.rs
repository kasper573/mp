use std::collections::HashSet;

use super::expr::Expr;
use super::{Arrow, Name, RevealDef, ScriptFault, Vocabulary};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const MAX_LINES: usize = 16;
pub const MAX_CHOICES: usize = 12;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "", deny_unknown_fields)]
#[schemars(bound = "")]
pub struct DialogueNode<V: Vocabulary> {
    pub lines: Vec<V::Line>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<Choice<V>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Arrow,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "", deny_unknown_fields)]
#[schemars(bound = "")]
pub struct Choice<V: Vocabulary> {
    pub label: V::Text,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires: Option<Expr<V>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reveal: Vec<V::Reveal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warn: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Arrow,
}

pub fn check_reveals_unique<R: RevealDef>(reveal: &[R]) -> Result<(), ScriptFault> {
    let mut seen = HashSet::new();
    match reveal.iter().find(|kind| !seen.insert(**kind)) {
        Some(kind) => Err(ScriptFault::new(
            "revealed twice",
            format!("{} twice", kind.name()),
        )),
        None => Ok(()),
    }
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
    pub label_values: SpokenValues,
    pub locked: bool,
    pub requires: Option<&'static Expr<V>>,
    pub reveal: &'static [V::Reveal],
    pub warn: Option<Name>,
    pub leads: Vec<&'a V::Effect>,
}
