use std::collections::HashMap;
use std::fmt;
use std::sync::LazyLock;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::load::valid_key;

/// A row named by its table and key, written `table/key` in files.
#[derive(
    Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(try_from = "String", into = "String")]
pub struct RowName {
    pub table: String,
    pub key: String,
}

impl RowName {
    pub fn new(table: impl Into<String>, key: impl Into<String>) -> RowName {
        RowName {
            table: table.into(),
            key: key.into(),
        }
    }

    pub fn is(&self, table: &str, key: &str) -> bool {
        self.table == table && self.key == key
    }
}

impl fmt::Display for RowName {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}/{}", self.table, self.key)
    }
}

impl From<RowName> for String {
    fn from(name: RowName) -> String {
        name.to_string()
    }
}

impl TryFrom<String> for RowName {
    type Error = String;

    fn try_from(text: String) -> Result<RowName, String> {
        match text.split_once('/') {
            Some((table, key)) if !table.is_empty() && valid_key(key) => {
                Ok(RowName::new(table, key))
            }
            _ => Err(format!("{text:?} is not a table/key")),
        }
    }
}

/// The JSON field a local row names its owner in. The loader takes it off before the row's own
/// type reads the file, so no row type knows about owners.
pub const OWNER_FIELD: &str = "owner";

/// Which row each local row belongs to. A row without an owner is global.
#[derive(Clone, Debug, Default)]
pub struct ContentOwners {
    owners: HashMap<String, HashMap<String, RowName>>,
    held: HashMap<RowName, Vec<RowName>>,
}

impl ContentOwners {
    pub fn new(owned: impl IntoIterator<Item = (RowName, RowName)>) -> ContentOwners {
        let mut owners = ContentOwners::default();
        for (row, owner) in owned {
            owners
                .held
                .entry(owner.clone())
                .or_default()
                .push(row.clone());
            owners
                .owners
                .entry(row.table)
                .or_default()
                .insert(row.key, owner);
        }
        for rows in owners.held.values_mut() {
            rows.sort();
        }
        owners
    }

    /// Gives `row` the owner `owner`, or makes it global.
    pub fn set(&mut self, row: &RowName, owner: Option<RowName>) {
        if let Some(old) = self
            .owners
            .get_mut(&row.table)
            .and_then(|keys| keys.remove(&row.key))
            && let Some(held) = self.held.get_mut(&old)
        {
            held.retain(|held| held != row);
        }
        if let Some(owner) = owner {
            let held = self.held.entry(owner.clone()).or_default();
            held.push(row.clone());
            held.sort();
            self.owners
                .entry(row.table.clone())
                .or_default()
                .insert(row.key.clone(), owner);
        }
    }

    pub fn empty() -> &'static ContentOwners {
        static EMPTY: LazyLock<ContentOwners> = LazyLock::new(ContentOwners::default);
        &EMPTY
    }

    pub fn owner(&self, table: &str, key: &str) -> Option<&RowName> {
        self.owners.get(table)?.get(key)
    }

    pub fn is_local(&self, table: &str, key: &str) -> bool {
        self.owner(table, key).is_some()
    }

    /// The owner of a row, that row's owner, and so on to the top.
    pub fn chain<'a>(&'a self, table: &str, key: &str) -> impl Iterator<Item = &'a RowName> + 'a {
        let mut next = self.owner(table, key);
        let mut steps = 0;
        std::iter::from_fn(move || {
            let current = next?;
            steps += 1;
            next = if steps > self.len() {
                None
            } else {
                self.owner(&current.table, &current.key)
            };
            Some(current)
        })
    }

    /// Whether a row reading `target` may: the target is global, or local to the reader or to one
    /// of the reader's owners. `reader` is `None` for what sits above every row, such as the game's
    /// settings.
    pub fn in_reach(&self, reader: Option<&RowName>, table: &str, key: &str) -> bool {
        let Some(owner) = self.owner(table, key) else {
            return true;
        };
        let Some(reader) = reader else {
            return false;
        };
        owner == reader
            || self
                .chain(&reader.table, &reader.key)
                .any(|above| above == owner)
    }

    /// The rows local to `owner` itself, not to its local rows.
    pub fn held_by(&self, owner: &RowName) -> &[RowName] {
        self.held.get(owner).map_or(&[], Vec::as_slice)
    }

    /// The rows local to `owner` and, in turn, to those, at any depth.
    pub fn held_within(&self, owner: &RowName) -> Vec<RowName> {
        let mut rows = Vec::new();
        let mut pending = vec![owner.clone()];
        while let Some(next) = pending.pop() {
            for row in self.held_by(&next) {
                if !rows.contains(row) && row != owner {
                    rows.push(row.clone());
                    pending.push(row.clone());
                }
            }
        }
        rows
    }

    pub fn len(&self) -> usize {
        self.owners.values().map(HashMap::len).sum()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn iter(&self) -> impl Iterator<Item = (RowName, &RowName)> {
        self.owners.iter().flat_map(|(table, keys)| {
            keys.iter()
                .map(move |(key, owner)| (RowName::new(table.clone(), key.clone()), owner))
        })
    }
}
