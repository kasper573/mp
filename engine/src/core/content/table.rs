use std::any::{Any, TypeId};
use std::sync::Arc;

use bevy_ecs::prelude::Resource;
use bevy_platform::collections::HashMap;
use bevy_platform::hash::NoOpHash;
use schemars::JsonSchema;
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::check::RowCheck;
use super::id::ContentId;
use super::owner::{ContentOwners, RowFolders};

pub trait ContentRow: DeserializeOwned + Serialize + JsonSchema + Send + Sync + 'static {
    const TABLE: &'static str;
    /// Whether this row records or lays out the whole game rather than building one part of it, so
    /// it may name any row of a table, local or not.
    const SEES_ALL_ROWS: bool = false;
    /// Whether every row is in use by being in the table, offered to pick from rather than named
    /// by another row.
    const PICKED_FROM_TABLE: bool = false;

    fn check(&self, _cx: &mut RowCheck) {}

    /// Reads, in the scope the row was just parsed in, what it holds as plain JSON for another row
    /// to read later, so the rows named there count as this row's references.
    fn read_held(&self) {}
}

pub trait ModuleSet: ContentRow {
    type Module: Serialize + DeserializeOwned;
    fn modules(&self) -> &[Self::Module];
    fn rule(module: &Self::Module) -> ModuleRule;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModuleRule {
    AtMostOne,
    AnyNumber,
}

/// Every key of one table, sorted bytewise, and the rows that parsed. A key without a row failed to
/// load; it keeps its index so references to it still resolve while the loader collects errors.
pub struct Table<Row> {
    keys: Vec<String>,
    rows: Vec<Option<Row>>,
}

impl<Row: ContentRow> Table<Row> {
    pub fn new(rows: Vec<(String, Row)>) -> Table<Row> {
        let keys = rows.iter().map(|(key, _)| key.clone()).collect();
        let mut table = Table::keyed(keys);
        for (key, row) in rows {
            let index = table
                .keys
                .binary_search(&key)
                .expect("every key was listed above");
            table.rows[index] = Some(row);
        }
        table
    }

    pub fn keyed(mut keys: Vec<String>) -> Table<Row> {
        keys.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
        for pair in keys.windows(2) {
            if pair[0].eq_ignore_ascii_case(&pair[1]) {
                panic!(
                    "{} has two rows keyed {:?} and {:?}",
                    Row::TABLE,
                    pair[0],
                    pair[1]
                );
            }
        }
        let rows = keys.iter().map(|_| None).collect();
        Table { keys, rows }
    }

    pub fn insert(&mut self, key: &str, row: Row) {
        let index = self
            .keys
            .binary_search_by(|candidate| candidate.as_str().cmp(key))
            .unwrap_or_else(|_| panic!("{} has no key {key:?}", Row::TABLE));
        self.rows[index] = Some(row);
    }

    pub fn ids(&self) -> impl ExactSizeIterator<Item = ContentId<Row>> + Clone + '_ {
        (0..self.rows.len() as u32).map(ContentId::new)
    }

    pub fn iter(&self) -> impl Iterator<Item = (ContentId<Row>, &Row)> {
        self.ids()
            .zip(&self.rows)
            .filter_map(|(id, row)| row.as_ref().map(|row| (id, row)))
    }

    pub fn rows(&self) -> impl Iterator<Item = &Row> {
        self.rows.iter().flatten()
    }

    pub fn keys(&self) -> &[String] {
        &self.keys
    }

    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    pub fn row(&self, id: ContentId<Row>) -> &Row {
        self.get(id)
            .unwrap_or_else(|| panic!("{}/{} failed to load", Row::TABLE, self.key(id)))
    }

    pub fn get(&self, id: ContentId<Row>) -> Option<&Row> {
        self.rows.get(id.index()).and_then(Option::as_ref)
    }

    pub fn key(&self, id: ContentId<Row>) -> &str {
        &self.keys[id.index()]
    }

    pub fn id_of(&self, key: &str) -> Option<ContentId<Row>> {
        self.keys
            .binary_search_by(|candidate| candidate.as_bytes().cmp(key.as_bytes()))
            .ok()
            .map(|index| ContentId::new(index as u32))
    }
}

pub trait AnyTable: Any + Send + Sync {
    fn name(&self) -> &'static str;
    fn keys(&self) -> &[String];
    /// The raw id of the row keyed `key`, for code that names a table only by its name.
    fn raw_of(&self, key: &str) -> Option<u32>;
    fn as_any(&self) -> &dyn Any;
}

impl<Row: ContentRow> AnyTable for Table<Row> {
    fn name(&self) -> &'static str {
        Row::TABLE
    }

    fn keys(&self) -> &[String] {
        &self.keys
    }

    fn raw_of(&self, key: &str) -> Option<u32> {
        self.id_of(key).map(ContentId::raw)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

type Tables = HashMap<TypeId, Arc<dyn AnyTable>, NoOpHash>;
type Built = HashMap<TypeId, Arc<dyn Any + Send + Sync>, NoOpHash>;

struct Loaded {
    tables: Tables,
    built: Built,
}

/// Every table of one content folder plus what the loader built from them (areas, models, compiled
/// scripts).
#[derive(Resource, Clone)]
pub struct Content(Arc<Loaded>);

impl Content {
    pub fn table<Row: ContentRow>(&self) -> &Table<Row> {
        self.0
            .tables
            .get(&TypeId::of::<Row>())
            .unwrap_or_else(|| panic!("table {} was never registered", Row::TABLE))
            .as_any()
            .downcast_ref()
            .expect("a table is stored under its row type")
    }

    pub fn ids<Row: ContentRow>(
        &self,
    ) -> impl ExactSizeIterator<Item = ContentId<Row>> + Clone + 'static {
        (0..self.table::<Row>().len() as u32).map(ContentId::new)
    }

    pub fn by_key<Row: ContentRow>(&self, key: &str) -> Option<ContentId<Row>> {
        self.table::<Row>().id_of(key)
    }

    pub fn built<T: Any + Send + Sync>(&self) -> &T {
        self.0
            .built
            .get(&TypeId::of::<T>())
            .and_then(|built| built.downcast_ref())
            .unwrap_or_else(|| {
                panic!(
                    "{} was never built into this content",
                    std::any::type_name::<T>()
                )
            })
    }

    /// The folder each row is listed in. Content put together without the loader has none.
    pub fn folders(&self) -> &RowFolders {
        self.0
            .built
            .get(&TypeId::of::<RowFolders>())
            .and_then(|built| built.downcast_ref())
            .unwrap_or(RowFolders::empty())
    }

    /// Which rows are local to which. Content put together without the loader has no local rows.
    pub fn owners(&self) -> &ContentOwners {
        self.0
            .built
            .get(&TypeId::of::<ContentOwners>())
            .and_then(|built| built.downcast_ref())
            .unwrap_or(ContentOwners::empty())
    }

    pub fn has_built<T: Any + Send + Sync>(&self) -> bool {
        self.0.built.contains_key(&TypeId::of::<T>())
    }

    pub fn table_named(&self, name: &str) -> Option<&dyn AnyTable> {
        self.0
            .tables
            .values()
            .find(|table| table.name() == name)
            .map(|table| table.as_ref())
    }

    pub(super) fn tables(&self) -> impl Iterator<Item = (TypeId, &dyn AnyTable)> {
        self.0
            .tables
            .iter()
            .map(|(id, table)| (*id, table.as_ref()))
    }
}

#[derive(Default)]
pub struct ContentBuilder {
    tables: Tables,
    built: Built,
}

impl ContentBuilder {
    pub fn insert_table<Row: ContentRow>(&mut self, table: Table<Row>) -> &mut ContentBuilder {
        self.tables.insert(TypeId::of::<Row>(), Arc::new(table));
        self
    }

    pub fn built<T: Any + Send + Sync>(&mut self, value: T) {
        self.built.insert(TypeId::of::<T>(), Arc::new(value));
    }

    pub fn build(&self) -> Content {
        Content(Arc::new(Loaded {
            tables: self.tables.clone(),
            built: self.built.clone(),
        }))
    }
}
