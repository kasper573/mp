use std::any::TypeId;
use std::borrow::Cow;
use std::cell::RefCell;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
use std::sync::Arc;

use bevy_platform::collections::HashMap;
use bevy_platform::hash::NoOpHash;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize, Serializer};

use super::table::{Content, ContentRow};

/// In files a key, in memory and on the wire the index among the table's keys sorted bytewise, so
/// an id is valid only within the `Content` it was resolved against.
pub struct ContentId<Row>(u32, PhantomData<fn() -> Row>);

impl<Row> ContentId<Row> {
    pub const fn new(index: u32) -> ContentId<Row> {
        ContentId(index, PhantomData)
    }

    pub const fn index(self) -> usize {
        self.0 as usize
    }

    pub const fn raw(self) -> u32 {
        self.0
    }
}

impl<Row: ContentRow> ContentId<Row> {
    pub fn get(self, content: &Content) -> &'static Row {
        content.table::<Row>().row(self)
    }

    pub fn key(self, content: &Content) -> &'static str {
        content.table::<Row>().key(self)
    }
}

impl<Row> Clone for ContentId<Row> {
    fn clone(&self) -> ContentId<Row> {
        *self
    }
}

impl<Row> Copy for ContentId<Row> {}

impl<Row> PartialEq for ContentId<Row> {
    fn eq(&self, other: &ContentId<Row>) -> bool {
        self.0 == other.0
    }
}

impl<Row> Eq for ContentId<Row> {}

impl<Row> PartialOrd for ContentId<Row> {
    fn partial_cmp(&self, other: &ContentId<Row>) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<Row> Ord for ContentId<Row> {
    fn cmp(&self, other: &ContentId<Row>) -> std::cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

impl<Row> Hash for ContentId<Row> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl<Row: ContentRow> fmt::Debug for ContentId<Row> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match SCOPE.with(|scope| {
            scope
                .borrow()
                .as_ref()
                .and_then(|scope| scope.key::<Row>(self.0))
        }) {
            Some(key) => write!(f, "{}/{key}", Row::TABLE),
            None => write!(f, "{}#{}", Row::TABLE, self.0),
        }
    }
}

impl<Row: ContentRow> JsonSchema for ContentId<Row> {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("Key")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let mut schema = String::json_schema(generator);
        schema.insert("x-table".to_owned(), Row::TABLE.into());
        schema
    }

    fn inline_schema() -> bool {
        true
    }
}

impl<Row: ContentRow> Serialize for ContentId<Row> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if !serializer.is_human_readable() {
            return serializer.serialize_u32(self.0);
        }
        let key = SCOPE.with(|scope| {
            scope
                .borrow()
                .as_ref()
                .and_then(|scope| scope.key::<Row>(self.0))
        });
        match key {
            Some(key) => serializer.serialize_str(&key),
            None => Err(serde::ser::Error::custom(format!(
                "a {} id is written as its key only inside with_content",
                Row::TABLE
            ))),
        }
    }
}

impl<'de, Row: ContentRow> Deserialize<'de> for ContentId<Row> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<ContentId<Row>, D::Error> {
        if !deserializer.is_human_readable() {
            return u32::deserialize(deserializer).map(ContentId::new);
        }
        let key = String::deserialize(deserializer)?;
        SCOPE.with(|scope| {
            let mut scope = scope.borrow_mut();
            let Some(scope) = scope.as_mut() else {
                return Err(de::Error::custom(format!(
                    "a {} key is read only inside with_content",
                    Row::TABLE
                )));
            };
            Ok(scope.resolve::<Row>(key))
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnknownRow {
    pub table: &'static str,
    pub key: String,
    pub nearest: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Leaf {
    pub kind: LeafKind,
    pub value: String,
    pub problem: Option<LeafProblem>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeafKind {
    Row(&'static str),
    Asset,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LeafProblem {
    Unknown { nearest: Option<String> },
    Unsafe,
}

type ScopeKeys = HashMap<TypeId, (&'static str, Vec<String>), NoOpHash>;

/// Resolves keys while reading and collects every reference it met, so one parse reports every
/// dangling reference instead of stopping at the first.
#[derive(Clone)]
pub struct ContentScope {
    keys: Arc<ScopeKeys>,
    assets: Option<Arc<Vec<String>>>,
    leaves: Vec<Leaf>,
    content: Option<Content>,
}

impl ContentScope {
    pub fn new() -> ContentScope {
        ContentScope {
            keys: Arc::new(HashMap::default()),
            assets: None,
            leaves: Vec::new(),
            content: None,
        }
    }

    pub fn of(content: &Content) -> ContentScope {
        let mut scope = ContentScope::new();
        scope.content = Some(*content);
        for (type_id, table) in content.tables() {
            Arc::make_mut(&mut scope.keys).insert(type_id, (table.name(), table.keys().to_vec()));
        }
        scope
    }

    pub fn table<Row: ContentRow>(&mut self, keys: Vec<String>) {
        Arc::make_mut(&mut self.keys).insert(TypeId::of::<Row>(), (Row::TABLE, keys));
    }

    pub fn table_by_type(&mut self, type_id: TypeId, name: &'static str, keys: Vec<String>) {
        Arc::make_mut(&mut self.keys).insert(type_id, (name, keys));
    }

    pub fn assets(&mut self, mut files: Vec<String>) {
        files.sort_unstable();
        self.assets = Some(Arc::new(files));
    }

    pub fn leaves(&self) -> &[Leaf] {
        &self.leaves
    }

    pub fn unknown(&self) -> impl Iterator<Item = UnknownRow> + '_ {
        self.leaves
            .iter()
            .filter_map(|leaf| match (&leaf.kind, &leaf.problem) {
                (LeafKind::Row(table), Some(LeafProblem::Unknown { nearest })) => {
                    Some(UnknownRow {
                        table,
                        key: leaf.value.clone(),
                        nearest: nearest.clone(),
                    })
                }
                _ => None,
            })
    }

    pub fn has_problems(&self) -> bool {
        self.leaves.iter().any(|leaf| leaf.problem.is_some())
    }

    pub fn asset(&mut self, path: &str) {
        let unsafe_path = path.starts_with('/')
            || path.contains('\\')
            || path.split('/').any(|part| part == ".." || part.is_empty())
            || path.chars().nth(1) == Some(':');
        let problem = if unsafe_path {
            Some(LeafProblem::Unsafe)
        } else {
            match &self.assets {
                Some(files) if files.binary_search_by(|f| f.as_str().cmp(path)).is_err() => {
                    Some(LeafProblem::Unknown {
                        nearest: nearest(files.as_slice(), path),
                    })
                }
                _ => None,
            }
        };
        self.leaves.push(Leaf {
            kind: LeafKind::Asset,
            value: path.to_owned(),
            problem,
        });
    }

    fn key<Row: ContentRow>(&self, index: u32) -> Option<String> {
        self.keys
            .get(&TypeId::of::<Row>())?
            .1
            .get(index as usize)
            .cloned()
    }

    fn resolve<Row: ContentRow>(&mut self, key: String) -> ContentId<Row> {
        let keys = self.keys.get(&TypeId::of::<Row>()).map(|(_, keys)| keys);
        let (id, problem) = match keys.and_then(|keys| keys.binary_search(&key).ok()) {
            Some(index) => (ContentId::new(index as u32), None),
            None => (
                ContentId::new(u32::MAX),
                Some(LeafProblem::Unknown {
                    nearest: keys.and_then(|keys| nearest(keys, &key)),
                }),
            ),
        };
        self.leaves.push(Leaf {
            kind: LeafKind::Row(Row::TABLE),
            value: key,
            problem,
        });
        id
    }
}

impl Default for ContentScope {
    fn default() -> ContentScope {
        ContentScope::new()
    }
}

thread_local! {
    static SCOPE: RefCell<Option<ContentScope>> = const { RefCell::new(None) };
}

pub fn scope_asset(path: &str) {
    SCOPE.with(|scope| {
        if let Some(scope) = scope.borrow_mut().as_mut() {
            scope.asset(path);
        }
    });
}

pub fn with_content<T>(scope: ContentScope, f: impl FnOnce() -> T) -> (T, ContentScope) {
    let previous = SCOPE.with(|slot| slot.replace(Some(scope)));
    let result = f();
    let scope = SCOPE.with(|slot| slot.replace(previous));
    (result, scope.expect("the scope installed above"))
}

pub fn nearest<'a>(candidates: impl IntoIterator<Item = &'a String>, key: &str) -> Option<String> {
    let allowed = if key.len() > 12 { 3 } else { 2 };
    let mut best: Option<(usize, &String)> = None;
    for candidate in candidates {
        let distance = edit_distance(candidate, key);
        if distance <= allowed && best.is_none_or(|(d, _)| distance < d) {
            best = Some((distance, candidate));
        }
    }
    best.map(|(_, candidate)| candidate.clone())
}

fn edit_distance(a: &str, b: &str) -> usize {
    strsim::osa_distance(&a.to_lowercase(), &b.to_lowercase())
}
