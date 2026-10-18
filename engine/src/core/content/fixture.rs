use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum::VariantArray;

use super::check::RowCheck;
use super::id::ContentId;
use super::table::{Content, ContentRow};

pub trait Fixture: Copy + Into<&'static str> + VariantArray + 'static {
    type Row: ContentRow;
    /// Whether the fixtures are every row of their table, which content adds none of its own to.
    const WHOLE_TABLE: bool = false;

    fn key(self) -> &'static str {
        self.into()
    }

    fn id(self, content: &Content) -> ContentId<Self::Row> {
        content
            .table::<Self::Row>()
            .id_of(self.key())
            .unwrap_or_else(|| {
                panic!(
                    "fixture {}/{} is checked at load",
                    Self::Row::TABLE,
                    self.key()
                )
            })
    }

    fn get(self, content: &Content) -> &Self::Row {
        self.id(content).get(content)
    }

    /// The parts of the fixture's row the engine reads beyond the row being there.
    fn locks(self) -> Vec<FixtureLock> {
        Vec::new()
    }
}

/// A part of a fixture's row the engine reads: content tunes its values, but never removes or
/// reshapes it, so the engine finds what it reads in every game.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FixtureLock {
    /// The list at `list` keeps an entry that carries every field of `entry` as it reads there.
    Entry { list: String, entry: Value },
    /// Every entry of the list at `list` is one of `variants`, by its `type`.
    Variants { list: String, variants: Vec<String> },
}

impl FixtureLock {
    /// Whether `held`, an entry of the list at `list`, is one this lock keeps.
    pub fn keeps(&self, list: &str, held: &Value) -> bool {
        matches!(self, FixtureLock::Entry { list: locked, entry } if locked == list && carries(held, entry))
    }

    /// The fields of `held`, an entry of the list at `list`, that this lock pins as they read.
    pub fn pinned(&self, list: &str, held: &Value) -> Vec<&str> {
        match self {
            FixtureLock::Entry { entry, .. } if self.keeps(list, held) => entry
                .as_object()
                .into_iter()
                .flat_map(|fields| fields.keys().map(String::as_str))
                .collect(),
            _ => Vec::new(),
        }
    }

    /// The variants every entry of the list at `list` is held to, when this lock holds them.
    pub fn variants(&self, list: &str) -> Option<&[String]> {
        match self {
            FixtureLock::Variants {
                list: locked,
                variants,
            } if locked == list => Some(variants),
            _ => None,
        }
    }

    pub fn check(&self, row: &Value, check: &mut RowCheck) {
        match self {
            FixtureLock::Entry { list, entry } => {
                let kept = entries(row, list).any(|(_, held)| carries(held, entry));
                if !kept {
                    check.error(
                        list.as_str(),
                        "fixture entry missing",
                        "no such entry",
                        format!("an entry with {entry}"),
                    );
                }
            }
            FixtureLock::Variants { list, variants } => {
                for (index, held) in entries(row, list) {
                    let variant = held.get("type").and_then(Value::as_str).unwrap_or_default();
                    if !variants.iter().any(|known| known == variant) {
                        check.error(
                            format!("{list}/{index}"),
                            "variant the engine never reads",
                            variant,
                            variants.join(" or "),
                        );
                    }
                }
            }
        }
    }
}

fn entries<'v>(row: &'v Value, list: &str) -> impl Iterator<Item = (usize, &'v Value)> {
    row.pointer(list)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
}

fn carries(held: &Value, entry: &Value) -> bool {
    entry.as_object().is_some_and(|fields| {
        fields
            .iter()
            .all(|(name, value)| held.get(name) == Some(value))
    })
}
