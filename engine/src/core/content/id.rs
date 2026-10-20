use std::any::TypeId;
use std::borrow::Cow;
use std::cell::RefCell;
use std::cmp::Ordering;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
use std::sync::Arc;

use bevy_platform::collections::HashMap;
use bevy_platform::hash::NoOpHash;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize, Serializer};

use super::files::{bundle_of, name_of};
use super::report::ContentProblem;
use super::table::{Content, ContentFile};

/// In files the path of a content file from the game folder, in memory and on the wire the index
/// among its type's paths sorted bytewise, so an id is valid only within the `Content` it was
/// resolved against.
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

impl<Row: ContentFile> ContentId<Row> {
    pub fn get(self, content: &Content) -> &Row {
        content.table::<Row>().row(self)
    }

    pub fn path(self, content: &Content) -> &str {
        content.table::<Row>().path(self)
    }

    /// The name the file goes by: its file name before the first dot.
    pub fn name(self, content: &Content) -> &str {
        name_of(self.path(content))
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
    fn partial_cmp(&self, other: &ContentId<Row>) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<Row> Ord for ContentId<Row> {
    fn cmp(&self, other: &ContentId<Row>) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl<Row> Hash for ContentId<Row> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl<Row: ContentFile> fmt::Debug for ContentId<Row> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match SCOPE.with(|scope| {
            scope
                .borrow()
                .as_ref()
                .and_then(|scope| scope.path::<Row>(self.0))
        }) {
            Some(path) => f.write_str(&path),
            None => write!(f, "{}#{}", Row::TABLE, self.0),
        }
    }
}

impl<Row: ContentFile> JsonSchema for ContentId<Row> {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("ContentPath")
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

impl<Row: ContentFile> Serialize for ContentId<Row> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if !serializer.is_human_readable() {
            return serializer.serialize_u32(self.0);
        }
        let path = SCOPE.with(|scope| {
            scope
                .borrow()
                .as_ref()
                .and_then(|scope| scope.path::<Row>(self.0))
        });
        match path {
            Some(path) => serializer.serialize_str(&path),
            None => Err(serde::ser::Error::custom(format!(
                "a {} id is written as its path only inside with_content",
                Row::TABLE
            ))),
        }
    }
}

impl<'de, Row: ContentFile> Deserialize<'de> for ContentId<Row> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<ContentId<Row>, D::Error> {
        if !deserializer.is_human_readable() {
            return u32::deserialize(deserializer).map(ContentId::new);
        }
        let path = String::deserialize(deserializer)?;
        SCOPE.with(|scope| {
            let mut scope = scope.borrow_mut();
            let Some(scope) = scope.as_mut() else {
                return Err(de::Error::custom(format!(
                    "a {} path is read only inside with_content",
                    Row::TABLE
                )));
            };
            Ok(scope.resolve::<Row>(path))
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Leaf {
    pub kind: LeafKind,
    pub value: String,
    pub problem: Option<LeafProblem>,
}

impl Leaf {
    /// What is wrong with the leaf, as a content problem, when anything is.
    pub fn reported(&self) -> Option<ContentProblem> {
        let (rule, expected, nearest) = match (&self.kind, self.problem.as_ref()?) {
            (LeafKind::Row(table), LeafProblem::Unknown { nearest }) => {
                return Some(ContentProblem::unknown_row(
                    table,
                    &self.value,
                    nearest.as_deref(),
                ));
            }
            (LeafKind::Asset, LeafProblem::Unknown { nearest }) => (
                super::MISSING_FILE,
                "the path of a media file from the game folder".to_owned(),
                nearest.as_ref(),
            ),
            (LeafKind::Asset, LeafProblem::InBundle { bundle }) => (
                "part of a bundle",
                format!("a media file outside every bundle: {bundle} keeps its parts to itself"),
                None,
            ),
            (LeafKind::Row(_), LeafProblem::InBundle { .. }) => return None,
            (_, LeafProblem::Unsafe) => (
                "unsafe path",
                "a path from the game folder: forward slashes, never absolute or through .."
                    .to_owned(),
                None,
            ),
        };
        Some(
            ContentProblem::new(rule, format!("{:?}", self.value), expected)
                .near(nearest.map(|near| format!("{near:?}"))),
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeafKind {
    Row(&'static str),
    Asset,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LeafProblem {
    Unknown {
        nearest: Option<String>,
    },
    /// A part of `bundle`, which nothing outside it names.
    InBundle {
        bundle: String,
    },
    Unsafe,
}

type ScopePaths = HashMap<TypeId, (&'static str, Vec<String>), NoOpHash>;

/// Resolves paths while reading and collects every reference it met, so one parse reports every
/// dangling reference instead of stopping at the first.
#[derive(Clone)]
pub struct ContentScope {
    paths: Arc<ScopePaths>,
    media: Option<Arc<Vec<String>>>,
    leaves: Vec<Leaf>,
}

impl ContentScope {
    pub fn new() -> ContentScope {
        ContentScope {
            paths: Arc::new(HashMap::default()),
            media: None,
            leaves: Vec::new(),
        }
    }

    pub fn of(content: &Content) -> ContentScope {
        let mut scope = ContentScope::new();
        for (type_id, table) in content.tables() {
            Arc::make_mut(&mut scope.paths).insert(type_id, (table.name(), table.paths().to_vec()));
        }
        scope
    }

    pub fn table<Row: ContentFile>(&mut self, paths: Vec<String>) {
        Arc::make_mut(&mut self.paths).insert(TypeId::of::<Row>(), (Row::TABLE, paths));
    }

    pub fn table_by_type(&mut self, type_id: TypeId, name: &'static str, paths: Vec<String>) {
        Arc::make_mut(&mut self.paths).insert(type_id, (name, paths));
    }

    /// Checks every media path read from here on against `files`.
    pub fn media(&mut self, mut files: Vec<String>) {
        files.sort_unstable();
        self.media = Some(Arc::new(files));
    }

    pub fn leaves(&self) -> &[Leaf] {
        &self.leaves
    }

    pub fn asset(&mut self, path: &str) {
        let unsafe_path = path.starts_with('/')
            || path.contains('\\')
            || path.split('/').any(|part| part == ".." || part.is_empty())
            || path.chars().nth(1) == Some(':');
        let problem = if unsafe_path {
            Some(LeafProblem::Unsafe)
        } else if let Some((bundle, _)) = bundle_of(path) {
            Some(LeafProblem::InBundle {
                bundle: bundle.to_owned(),
            })
        } else {
            match &self.media {
                Some(files) if files.binary_search_by(|f| f.as_str().cmp(path)).is_err() => {
                    Some(LeafProblem::Unknown {
                        nearest: nearest_path(files.as_slice(), path),
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

    fn path<Row: ContentFile>(&self, index: u32) -> Option<String> {
        self.paths
            .get(&TypeId::of::<Row>())?
            .1
            .get(index as usize)
            .cloned()
    }

    fn resolve<Row: ContentFile>(&mut self, path: String) -> ContentId<Row> {
        let paths = self.paths.get(&TypeId::of::<Row>()).map(|(_, paths)| paths);
        let found = paths.and_then(|paths| {
            paths
                .binary_search_by(|candidate| candidate.as_bytes().cmp(path.as_bytes()))
                .ok()
        });
        let (id, problem) = match found {
            Some(index) => (ContentId::new(index as u32), None),
            None => (
                ContentId::new(u32::MAX),
                Some(LeafProblem::Unknown {
                    nearest: paths.and_then(|paths| nearest_path(paths, &path)),
                }),
            ),
        };
        self.leaves.push(Leaf {
            kind: LeafKind::Row(Row::TABLE),
            value: path,
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

/// Runs `f` in a copy of the scope being read in, and keeps the references it met that `keep`
/// lets through, as if the scope had met them itself.
pub fn read_aside<T>(f: impl FnOnce() -> T, keep: impl Fn(&Leaf) -> bool) -> T {
    let Some(mut aside) = SCOPE.with(|slot| slot.borrow().clone()) else {
        return f();
    };
    aside.leaves.clear();
    let (result, aside) = with_content(aside, f);
    SCOPE.with(|slot| {
        if let Some(scope) = slot.borrow_mut().as_mut() {
            scope
                .leaves
                .extend(aside.leaves.into_iter().filter(|leaf| keep(leaf)));
        }
    });
    result
}

/// The path among `candidates` that `path` most likely meant: the one file of the same file name,
/// as after a move made outside the editor, or the one file of the same name, as when only a name
/// is written, or else the nearest by spelling.
pub fn nearest_path(candidates: &[String], path: &str) -> Option<String> {
    let file = path.rsplit('/').next().unwrap_or(path);
    let only = |same: &dyn Fn(&str) -> bool| {
        let mut found = candidates.iter().filter(|candidate| same(candidate));
        match (found.next(), found.next()) {
            (Some(only), None) => Some(only.clone()),
            _ => None,
        }
    };
    only(&|candidate| candidate.rsplit('/').next() == Some(file))
        .or_else(|| only(&|candidate| name_of(candidate) == name_of(path)))
        .or_else(|| nearest(candidates, path))
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
