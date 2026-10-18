use serde::Serialize;
use serde_json::Value;
use strum::VariantArray;

use super::check::RowCheck;
use super::id::ContentId;
use super::table::{Content, ContentRow};

pub trait Fixture: Copy + Into<&'static str> + VariantArray + 'static {
    type Row: ContentRow;

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
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FixtureLock {
    /// The list at `list` keeps an entry that carries every field of `entry` as it reads there.
    Entry { list: &'static str, entry: Value },
    /// Every entry of the list at `list` is one of `variants`, by its `type`.
    Variants {
        list: &'static str,
        variants: Vec<&'static str>,
    },
}

impl FixtureLock {
    pub fn check(&self, row: &Value, check: &mut RowCheck) {
        match self {
            FixtureLock::Entry { list, entry } => {
                let kept = entries(row, list).any(|(_, held)| carries(held, entry));
                if !kept {
                    check.error(
                        *list,
                        "fixture entry missing",
                        "no such entry",
                        format!("an entry with {entry}"),
                    );
                }
            }
            FixtureLock::Variants { list, variants } => {
                for (index, held) in entries(row, list) {
                    let variant = held.get("type").and_then(Value::as_str).unwrap_or_default();
                    if !variants.contains(&variant) {
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
