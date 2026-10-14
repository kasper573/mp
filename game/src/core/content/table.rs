use std::any::{Any, TypeId};

use bevy_ecs::prelude::Resource;
use bevy_platform::collections::HashMap;
use bevy_platform::hash::NoOpHash;
use schemars::JsonSchema;
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::check::RowCheck;
use super::id::ContentId;

pub trait ContentRow: DeserializeOwned + Serialize + JsonSchema + Send + Sync + 'static {
    const TABLE: &'static str;

    fn check(&self, _cx: &mut RowCheck) {}
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
            .or_else(|| {
                self.keys
                    .iter()
                    .position(|candidate| candidate.eq_ignore_ascii_case(key))
            })
            .map(|index| ContentId::new(index as u32))
    }
}

pub trait AnyTable: Any + Send + Sync {
    fn name(&self) -> &'static str;
    fn keys(&self) -> &[String];
    fn as_any(&self) -> &dyn Any;
}

impl<Row: ContentRow> AnyTable for Table<Row> {
    fn name(&self) -> &'static str {
        Row::TABLE
    }

    fn keys(&self) -> &[String] {
        &self.keys
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

type Tables = HashMap<TypeId, &'static dyn AnyTable, NoOpHash>;
type Built = HashMap<TypeId, &'static (dyn Any + Send + Sync), NoOpHash>;

struct Loaded {
    tables: Tables,
    built: Built,
}

/// Every table of one content folder plus what the loader built from them (areas, models, compiled
/// scripts). Leaked on build, so rows and everything compiled from them live as long as the process.
#[derive(Resource, Clone, Copy)]
pub struct Content(&'static Loaded);

impl Content {
    pub fn table<Row: ContentRow>(&self) -> &'static Table<Row> {
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
        self.table::<Row>().ids()
    }

    pub fn by_key<Row: ContentRow>(&self, key: &str) -> Option<ContentId<Row>> {
        self.table::<Row>().id_of(key)
    }

    pub fn built<T: Any + Send + Sync>(&self) -> &'static T {
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

    pub fn has_built<T: Any + Send + Sync>(&self) -> bool {
        self.0.built.contains_key(&TypeId::of::<T>())
    }

    pub fn table_named(&self, name: &str) -> Option<&'static dyn AnyTable> {
        self.0
            .tables
            .values()
            .copied()
            .find(|table| table.name() == name)
    }

    pub(super) fn tables(&self) -> impl Iterator<Item = (TypeId, &'static dyn AnyTable)> {
        self.0.tables.iter().map(|(id, table)| (*id, *table))
    }

    /// Frees every table and built value this content leaked, for a process that loads many
    /// contents in a row.
    ///
    /// # Safety
    ///
    /// Nothing may still refer into this content: no copy of it, no `&'static` row or built value,
    /// no world holding its compiled scripts, and no cache keyed by the address of one of its rows.
    pub unsafe fn release(self) {
        let loaded = self.0 as *const Loaded as *mut Loaded;
        // SAFETY: every pointer below was leaked from a `Box` by `ContentBuilder`, and the caller
        // promises no reference into any of them survives this call.
        unsafe {
            for table in self.0.tables.values() {
                drop(Box::from_raw(
                    *table as *const dyn AnyTable as *mut dyn AnyTable,
                ));
            }
            for built in self.0.built.values() {
                drop(Box::from_raw(
                    *built as *const (dyn Any + Send + Sync) as *mut (dyn Any + Send + Sync),
                ));
            }
            drop(Box::from_raw(loaded));
        }
    }
}

#[derive(Default)]
pub struct ContentBuilder {
    tables: Tables,
    built: Built,
}

impl ContentBuilder {
    pub fn table<Row: ContentRow>(&mut self, rows: Vec<(String, Row)>) -> &mut ContentBuilder {
        self.insert_table(Table::new(rows))
    }

    pub fn insert_table<Row: ContentRow>(&mut self, table: Table<Row>) -> &mut ContentBuilder {
        let table: &'static Table<Row> = Box::leak(Box::new(table));
        self.tables.insert(TypeId::of::<Row>(), table);
        self
    }

    pub fn built<T: Any + Send + Sync>(&mut self, value: T) -> &'static T {
        let value: &'static T = Box::leak(Box::new(value));
        self.built.insert(TypeId::of::<T>(), value);
        value
    }

    pub fn build(&self) -> Content {
        Content(Box::leak(Box::new(Loaded {
            tables: self.tables.clone(),
            built: self.built.clone(),
        })))
    }
}
