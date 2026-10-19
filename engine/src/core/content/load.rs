use std::any::{Any, TypeId};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::fmt::Display;
use std::io;
use std::marker::PhantomData;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use rayon::prelude::*;
use schemars::JsonSchema;
use schemars::generate::SchemaSettings;
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::check::RowCheck;
use super::fixture::{Fixture, FixtureLock};
use super::id::{ContentId, ContentScope, Leaf, LeafKind, ScopeReader, nearest, with_content};
use super::locate::{IndexedValue, JsonIndex, escape};
use super::owner::{ContentOwners, OWNER_FIELD, RowName};
use super::report::{ContentProblem, ErrorPlace, LoadError, LoadReport, VERSION_RULE, article};
use super::table::{Content, ContentBuilder, ContentRow, ModuleRule, ModuleSet, Table};
use super::version::ContentVersion;
use super::{ASSETS_DIR, GAME_FILE, TABLES_DIR, row_file, row_folder, table_folder};

// The steps a load runs its hooks at, in order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LoadStep {
    // Every row parsed and checked on its own.
    Rows,
    // Every file read and hashed.
    Files,
    // Rows that stand for others, such as templates, expanded.
    Expand,
    // What's put together from expanded rows.
    Assemble,
    // Checks across tables.
    Across,
    // Checks of the game's settings, once they parsed.
    Settings,
    // Only once everything else loaded without an error.
    Compile,
}

type Hook = Box<dyn Fn(&mut Loading) + Send + Sync>;
struct FixtureEntry {
    table: &'static str,
    whole_table: bool,
    keys: Vec<(&'static str, Vec<FixtureLock>)>,
    check: Hook,
}

pub type FolderWriter = Box<dyn Fn(&Content, &mut FileWriter) -> io::Result<()> + Send + Sync>;

#[derive(Default)]
pub struct ContentRegistry {
    rows: Vec<Box<dyn TableLoader>>,
    fixtures: Vec<FixtureEntry>,
    hooks: Vec<(LoadStep, Hook)>,
    settings: Option<Box<dyn SettingsLoader>>,
    writers: Vec<FolderWriter>,
    module_rules: Vec<(&'static str, ModuleProbe)>,
    list_kinds: Vec<ListKind>,
    // Hashing every shape takes a while, and a registry is read far more often than it changes.
    version: OnceLock<ContentVersion>,
}

/// The shape of every table and of the game's settings, for tools that edit content.
#[derive(Serialize)]
pub struct ContentShapes {
    pub tables: Vec<TableShape>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct TableShape {
    pub table: String,
    /// Whether each row keeps a folder of files beside its file.
    pub folders: bool,
    pub shape: serde_json::Value,
    pub fixtures: Vec<String>,
    /// What each fixture's row keeps as the engine reads it, by key.
    pub locks: BTreeMap<String, Vec<FixtureLock>>,
    /// Whether the table holds its fixtures and nothing else.
    pub closed: bool,
}

/// What the entries of a JSON list field are called in shape errors: a list of `field` whose
/// entry names an unknown variant reports `rule`, and asks for `expected` in its place.
#[derive(Clone, Copy, Debug)]
struct ListKind {
    field: &'static str,
    rule: &'static str,
    expected: &'static str,
}

type ModuleProbe = Box<dyn Fn(&serde_json::Value) -> Option<ModuleRule> + Send + Sync>;

impl ContentRegistry {
    pub fn row<Row: ContentRow>(&mut self) -> &mut ContentRegistry {
        self.version.take();
        self.rows.push(Box::new(RowLoader::<Row> {
            folders: false,
            marker: PhantomData,
        }));
        self
    }

    pub fn modules<Row: ModuleSet>(&mut self) -> &mut ContentRegistry {
        self.version.take();
        self.module_rules.push((
            Row::TABLE,
            Box::new(|json| {
                let (parsed, _) = with_content(ContentScope::new(), || {
                    serde_json::from_value::<Row::Module>(json.clone())
                });
                parsed.ok().map(|module| Row::rule(&module))
            }),
        ));
        self.hook(LoadStep::Rows, module_rules::<Row>)
    }

    pub fn module_rule(&self, table: &str, json: &serde_json::Value) -> Option<ModuleRule> {
        self.module_rules
            .iter()
            .find(|(name, _)| *name == table)
            .and_then(|(_, probe)| probe(json))
    }

    /// Whether a row of `table` holding `modules` may take `module` as well: not when it holds
    /// at most one of that kind and has one already.
    pub fn takes_module(
        &self,
        table: &str,
        modules: &[serde_json::Value],
        module: &serde_json::Value,
    ) -> bool {
        let held = modules.iter().any(|known| known["type"] == module["type"]);
        !held || self.module_rule(table, module) != Some(ModuleRule::AtMostOne)
    }

    pub fn list_kind(
        &mut self,
        field: &'static str,
        rule: &'static str,
        expected: &'static str,
    ) -> &mut ContentRegistry {
        self.version.take();
        self.list_kinds.push(ListKind {
            field,
            rule,
            expected,
        });
        self
    }

    pub fn folder<Row: ContentRow>(&mut self) -> &mut ContentRegistry {
        self.version.take();
        self.rows.push(Box::new(RowLoader::<Row> {
            folders: true,
            marker: PhantomData,
        }));
        self
    }

    pub fn fixture<F: Fixture>(&mut self) -> &mut ContentRegistry {
        self.version.take();
        self.fixtures.push(FixtureEntry {
            table: F::Row::TABLE,
            whole_table: F::WHOLE_TABLE,
            keys: F::VARIANTS
                .iter()
                .map(|fixture| (fixture.key(), fixture.locks()))
                .collect(),
            check: Box::new(check_fixture::<F>),
        });
        self
    }

    pub fn settings<G: Settings>(&mut self) -> &mut ContentRegistry {
        self.version.take();
        self.settings = Some(Box::new(SettingsOf::<G>(PhantomData)));
        self
    }

    pub fn hook(
        &mut self,
        step: LoadStep,
        hook: impl Fn(&mut Loading) + Send + Sync + 'static,
    ) -> &mut ContentRegistry {
        self.hooks.push((step, Box::new(hook)));
        self
    }

    pub fn writer(
        &mut self,
        writer: impl Fn(&Content, &mut FileWriter) -> io::Result<()> + Send + Sync + 'static,
    ) -> &mut ContentRegistry {
        self.writers.push(Box::new(writer));
        self
    }

    pub fn table_names(&self) -> Vec<&'static str> {
        self.rows.iter().map(|row| row.name()).collect()
    }

    pub fn version(&self) -> ContentVersion {
        self.version
            .get_or_init(|| super::version::compute(self))
            .clone()
    }

    pub fn shapes(&self, settings: &SchemaSettings) -> ContentShapes {
        let tables = self
            .rows
            .iter()
            .map(|row| {
                let fixtures = || {
                    self.fixtures
                        .iter()
                        .filter(|fixture| fixture.table == row.name())
                        .flat_map(|fixture| fixture.keys.iter())
                };
                TableShape {
                    table: row.name().to_owned(),
                    folders: row.folders(),
                    shape: row.shape(settings),
                    fixtures: fixtures().map(|(key, _)| (*key).to_owned()).collect(),
                    locks: fixtures()
                        .filter(|(_, locks)| !locks.is_empty())
                        .map(|(key, locks)| ((*key).to_owned(), locks.clone()))
                        .collect(),
                    closed: self
                        .fixtures
                        .iter()
                        .any(|fixture| fixture.table == row.name() && fixture.whole_table),
                }
            })
            .collect();
        ContentShapes {
            tables,
            settings: self.settings.as_ref().map(|loader| loader.shape(settings)),
        }
    }

    pub fn references(&self, content: &Content, file: &str, text: &str) -> Vec<Reference> {
        let parse: &dyn Fn(&str) -> ParseResult = if file == GAME_FILE {
            let Some(loader) = self.settings.as_deref() else {
                return Vec::new();
            };
            &|text| loader.parse(text)
        } else {
            let loader = super::row_of(file)
                .and_then(|(table, _)| self.rows.iter().find(|row| row.name() == table));
            let Some(loader) = loader else {
                return Vec::new();
            };
            &|text| loader.parse(text)
        };
        let (_, scope) = with_content(ContentScope::of(content), || parse(text));
        let index = JsonIndex::of(text);
        placed(scope.leaves(), &index)
            .filter_map(|(leaf, found)| {
                let found = found?;
                Some(Reference {
                    kind: leaf.kind,
                    value: leaf.value.clone(),
                    known: leaf.problem.is_none(),
                    pointer: found.pointer.clone(),
                    key: found.key,
                    line: found.line,
                    column: found.column,
                })
            })
            .collect()
    }

    pub(super) fn settings_loader(&self) -> Option<&dyn SettingsLoader> {
        self.settings.as_deref()
    }

    pub(super) fn row_loaders(&self) -> &[Box<dyn TableLoader>] {
        &self.rows
    }

    pub(super) fn folder_writers(&self) -> &[FolderWriter] {
        &self.writers
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub kind: LeafKind,
    pub value: String,
    pub known: bool,
    pub pointer: String,
    pub key: bool,
    pub line: usize,
    pub column: usize,
}

pub trait ContentFolder: Send + Sync {
    fn name(&self) -> String;
    fn entries(&self, dir: &str) -> Vec<FolderEntry>;
    fn read(&self, file: &str) -> io::Result<Vec<u8>>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FolderEntry {
    pub name: String,
    pub dir: bool,
}

pub struct FilesystemFolder(pub PathBuf);

impl ContentFolder for FilesystemFolder {
    fn name(&self) -> String {
        self.0.display().to_string()
    }

    fn entries(&self, dir: &str) -> Vec<FolderEntry> {
        let Ok(read) = std::fs::read_dir(self.0.join(dir)) else {
            return Vec::new();
        };
        read.filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_str()?.to_owned();
                let dir = std::fs::metadata(entry.path()).ok()?.is_dir();
                Some(FolderEntry { name, dir })
            })
            .collect()
    }

    fn read(&self, file: &str) -> io::Result<Vec<u8>> {
        std::fs::read(self.0.join(file))
    }
}

pub struct MemoryFolder {
    pub name: String,
    pub files: BTreeMap<String, Arc<[u8]>>,
}

impl ContentFolder for MemoryFolder {
    fn name(&self) -> String {
        self.name.clone()
    }

    fn entries(&self, dir: &str) -> Vec<FolderEntry> {
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let mut entries: Vec<FolderEntry> = self
            .files
            .keys()
            .filter_map(|path| path.strip_prefix(&prefix))
            .map(|rest| match rest.split_once('/') {
                Some((name, _)) => FolderEntry {
                    name: name.to_owned(),
                    dir: true,
                },
                None => FolderEntry {
                    name: rest.to_owned(),
                    dir: false,
                },
            })
            .collect();
        entries.dedup();
        entries
    }

    fn read(&self, file: &str) -> io::Result<Vec<u8>> {
        self.files
            .get(file)
            .map(|bytes| bytes.to_vec())
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("missing {file}")))
    }
}

pub trait Settings: DeserializeOwned + Serialize + JsonSchema + Send + Sync + 'static {
    fn content_version(&self) -> &ContentVersion;
}

pub fn load(
    registry: &ContentRegistry,
    folder: Arc<dyn ContentFolder>,
    build: &str,
    outcome: &str,
) -> Result<Content, LoadReport> {
    let version = registry.version();
    let listing = Listing::read(registry, folder.as_ref());
    let mut loading = Loading {
        folder: folder.clone(),
        listing: listing.listing,
        builder: ContentBuilder::default(),
        snapshot: None,
        errors: listing.errors,
        indexes: HashMap::new(),
        failed: HashSet::new(),
    };
    loading.parse(registry);
    loading.check_rows(registry);
    loading.run_hooks(registry, LoadStep::Rows);
    loading.hash_files();
    loading.run_hooks(registry, LoadStep::Files);
    loading.run_hooks(registry, LoadStep::Expand);
    loading.run_hooks(registry, LoadStep::Assemble);
    loading.run_hooks(registry, LoadStep::Across);
    loading.check_fixtures(registry);
    if loading.has_settings(registry) {
        loading.run_hooks(registry, LoadStep::Settings);
    }
    loading.check_version(registry, &version);
    loading.built(version.clone());
    if loading.errors.is_empty() {
        loading.run_hooks(registry, LoadStep::Compile);
    }
    if loading.errors.is_empty() {
        Ok(loading.content())
    } else {
        Err(LoadReport::new(
            folder.name(),
            build,
            version.0,
            outcome,
            loading.errors,
        ))
    }
}

pub struct Loading {
    folder: Arc<dyn ContentFolder>,
    listing: Listing,
    builder: ContentBuilder,
    snapshot: Option<Content>,
    errors: Vec<LoadError>,
    indexes: HashMap<String, Arc<JsonIndex>>,
    failed: HashSet<(&'static str, String)>,
}

impl Loading {
    pub fn content(&mut self) -> Content {
        self.snapshot
            .get_or_insert_with(|| self.builder.build())
            .clone()
    }

    pub fn built<T: Any + Send + Sync>(&mut self, value: T) {
        self.snapshot = None;
        self.builder.built(value);
    }

    pub fn error(&mut self, error: LoadError) {
        self.errors.push(error);
    }

    pub fn extend_errors(&mut self, errors: impl IntoIterator<Item = LoadError>) {
        self.errors.extend(errors);
    }

    pub fn file_error(&mut self, file: impl Into<String>, at: ErrorPlace, problem: ContentProblem) {
        self.errors.push(LoadError {
            file: file.into(),
            at,
            problem,
        });
    }

    pub fn json_error(&mut self, file: impl Into<String>, pointer: &str, problem: ContentProblem) {
        let file = file.into();
        let at = self.place(&file, pointer);
        self.file_error(file, at, problem);
    }

    pub fn row_error<Row: ContentRow>(
        &mut self,
        id: ContentId<Row>,
        pointer: &str,
        problem: ContentProblem,
    ) {
        let file = self.row_file(id);
        self.json_error(file, pointer, problem);
    }

    pub fn row_errors<Row: ContentRow>(&mut self, id: ContentId<Row>, check: RowCheck) {
        for error in check.into_errors() {
            self.row_error(id, &error.pointer, error.problem);
        }
    }

    pub fn row_file<Row: ContentRow>(&mut self, id: ContentId<Row>) -> String {
        super::row_file(Row::TABLE, id.key(&self.content()))
    }

    pub fn fail<Row: ContentRow>(&mut self, id: ContentId<Row>) {
        let key = id.key(&self.content()).to_owned();
        self.failed.insert((Row::TABLE, key));
    }

    pub fn rows<'c, Row: ContentRow>(
        &self,
        content: &'c Content,
    ) -> Vec<(ContentId<Row>, &'c Row)> {
        content
            .table::<Row>()
            .iter()
            .filter(|(id, _)| {
                !self
                    .failed
                    .contains(&(Row::TABLE, id.key(content).to_owned()))
            })
            .collect()
    }

    pub fn folder(&self) -> Arc<dyn ContentFolder> {
        self.folder.clone()
    }

    pub fn read(&self, file: &str) -> io::Result<Vec<u8>> {
        self.folder.read(file)
    }

    pub fn read_text(&self, file: &str) -> io::Result<String> {
        let bytes = self.read(file)?;
        String::from_utf8(bytes)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "not UTF-8"))
    }

    pub fn assets(&self) -> &[String] {
        &self.listing.assets
    }

    pub fn has_asset(&self, path: &str) -> bool {
        self.listing
            .assets
            .binary_search_by(|candidate| candidate.as_str().cmp(path))
            .is_ok()
    }

    pub fn row_folder<Row: ContentRow>(&mut self, id: ContentId<Row>) -> Vec<String> {
        let key = id.key(&self.content()).to_owned();
        self.listing
            .tables
            .get(Row::TABLE)
            .and_then(|table| table.folders.get(&key))
            .cloned()
            .unwrap_or_default()
    }

    pub fn place(&mut self, file: &str, pointer: &str) -> ErrorPlace {
        match self.index(file).and_then(|index| index.position(pointer)) {
            Some((line, column)) => ErrorPlace::Json {
                line,
                column,
                pointer: pointer.to_owned(),
            },
            None => ErrorPlace::WholeFile,
        }
    }

    fn index(&mut self, file: &str) -> Option<Arc<JsonIndex>> {
        if let Some(index) = self.indexes.get(file) {
            return Some(index.clone());
        }
        let text = self.read_text(file).ok()?;
        let index = Arc::new(JsonIndex::of(&text));
        self.indexes.insert(file.to_owned(), index.clone());
        Some(index)
    }

    fn parse(&mut self, registry: &ContentRegistry) {
        let mut scope = ContentScope::new();
        for loader in registry.row_loaders() {
            scope.table_by_type(
                loader.row_type(),
                loader.name(),
                self.listing.keys_of(loader.name()),
            );
        }
        scope.assets(self.listing.assets.clone());

        let jobs: Vec<(usize, String)> = registry
            .row_loaders()
            .iter()
            .enumerate()
            .flat_map(|(index, loader)| {
                self.listing
                    .keys_of(loader.name())
                    .into_iter()
                    .map(move |key| (index, key))
            })
            .collect();
        let root = self.folder.clone();
        let read: Vec<(usize, String, ReadFile)> = jobs
            .into_par_iter()
            .map(|(index, key)| {
                let file = super::row_file(registry.row_loaders()[index].name(), &key);
                (index, key, read_file(root.as_ref(), &file, true))
            })
            .collect();

        let mut owned: Vec<(RowName, RowName)> = Vec::new();
        for (loader, key, file) in &read {
            if let Some(owner) = &file.owner {
                owned.push((
                    RowName::new(registry.row_loaders()[*loader].name(), key.clone()),
                    owner.clone(),
                ));
            }
        }
        for (_, _, file) in &read {
            if let Some(index) = &file.index {
                self.indexes.insert(file.file.clone(), index.clone());
            }
        }
        let owners = Arc::new(self.check_owners(registry, owned));

        let parsed: Vec<(usize, String, ParsedFile)> = read
            .into_par_iter()
            .map(|(index, key, file)| {
                let loader = &registry.row_loaders()[index];
                let reader = (!loader.sees_all_rows()).then(|| ScopeReader {
                    row: Some(RowName::new(loader.name(), key.clone())),
                    owners: owners.clone(),
                });
                let scope = match reader {
                    Some(reader) => scope.clone().reading(reader),
                    None => scope.clone(),
                };
                let parsed = parse_read(file, &scope, &registry.list_kinds, |value| {
                    loader.parse_value(value)
                });
                (index, key, parsed)
            })
            .collect();

        let mut rows: Vec<Vec<(String, Box<dyn Any + Send + Sync>)>> =
            registry.row_loaders().iter().map(|_| Vec::new()).collect();
        for (loader, key, parsed) in parsed {
            if !parsed.errors.is_empty() {
                let table = registry.row_loaders()[loader].name();
                self.failed.insert((table, key.clone()));
            }
            self.errors.extend(parsed.errors);
            if let Some(row) = parsed.row {
                rows[loader].push((key, row));
            }
        }
        for (loader, rows) in registry.row_loaders().iter().zip(rows) {
            loader.finish(self.listing.keys_of(loader.name()), rows, &mut self.builder);
        }
        self.builder.built(ContentOwners::clone(&owners));
        self.snapshot = None;

        let settings = parse_read(
            read_file(root.as_ref(), GAME_FILE, false),
            &scope.clone().reading(ScopeReader { row: None, owners }),
            &registry.list_kinds,
            |value| {
                registry
                    .settings_loader()
                    .map(|loader| loader.parse_value(value))
                    .unwrap_or_else(|| Ok(Box::new(())))
            },
        );
        self.errors.extend(settings.errors);
        if let Some(index) = settings.index {
            self.indexes.insert(GAME_FILE.to_owned(), index);
        }
        match settings.row {
            Some(settings) => {
                if let Some(loader) = registry.settings_loader() {
                    loader.store(settings, &mut self.builder);
                }
            }
            None if !self.listing.game_json => self.file_error(
                GAME_FILE,
                ErrorPlace::WholeFile,
                ContentProblem::new(
                    "missing file",
                    "no such file",
                    "game.json at the root of the folder",
                ),
            ),
            None => {}
        }
        self.snapshot = None;
    }

    /// Keeps every owner that names a row and leads up to a global one; reports the others, whose
    /// rows then load as global.
    fn check_owners(
        &mut self,
        registry: &ContentRegistry,
        owned: Vec<(RowName, RowName)>,
    ) -> ContentOwners {
        let mut kept: Vec<(RowName, RowName)> = Vec::new();
        for (row, owner) in owned {
            let file = row_file(&row.table, &row.key);
            let keys = registry
                .row_loaders()
                .iter()
                .find(|loader| loader.name() == owner.table)
                .map(|loader| self.listing.keys_of(loader.name()));
            let problem = match keys {
                Some(keys) if keys.contains(&owner.key) => is_fixture(registry, &row).then(|| {
                    ContentProblem::new(
                        "fixture with an owner",
                        format!("{row} owned by {owner}"),
                        format!(
                            "no owner: {} rows are fixtures, which code names, so they stay global",
                            row.table
                        ),
                    )
                }),
                keys => {
                    let candidates: Vec<String> = match keys {
                        Some(keys) => keys
                            .iter()
                            .map(|key| format!("{}/{key}", owner.table))
                            .collect(),
                        None => registry
                            .table_names()
                            .iter()
                            .map(|table| format!("{table}/{}", owner.key))
                            .collect(),
                    };
                    let wanted = owner.to_string();
                    Some(
                        ContentProblem::new(
                            "unknown owner",
                            format!("{wanted:?}"),
                            "the table/key of a row",
                        )
                        .near(nearest(&candidates, &wanted).map(|near| format!("{near:?}"))),
                    )
                }
            };
            match problem {
                Some(problem) => {
                    self.json_error(file, &format!("/{OWNER_FIELD}"), problem);
                    self.failed
                        .insert((table_name(registry, &row.table), row.key));
                }
                None => kept.push((row, owner)),
            }
        }
        let owners = ContentOwners::new(kept.clone());
        let mut looped: Vec<RowName> = Vec::new();
        for (row, _) in &kept {
            let mut path = vec![row.clone()];
            let mut at = row.clone();
            while let Some(owner) = owners.owner(&at.table, &at.key) {
                if owner == row {
                    path.push(owner.clone());
                    let names: Vec<String> = path.iter().map(RowName::to_string).collect();
                    self.json_error(
                        row_file(&row.table, &row.key),
                        &format!("/{OWNER_FIELD}"),
                        ContentProblem::new(
                            "owner loop",
                            names.join(" → "),
                            "owners that lead up to a global row",
                        ),
                    );
                    self.failed
                        .insert((table_name(registry, &row.table), row.key.clone()));
                    looped.push(row.clone());
                    break;
                }
                if path.contains(owner) {
                    break;
                }
                path.push(owner.clone());
                at = owner.clone();
            }
        }
        ContentOwners::new(kept.into_iter().filter(|(row, _)| !looped.contains(row)))
    }

    fn check_rows(&mut self, registry: &ContentRegistry) {
        let content = self.content();
        let mut errors: Vec<(&'static str, String, RowCheck)> = Vec::new();
        for loader in registry.row_loaders() {
            loader.check_rows(&content, &mut errors);
        }
        for (table, key, check) in errors {
            let file = super::row_file(table, &key);
            self.failed.insert((table, key));
            for error in check.into_errors() {
                self.json_error(file.clone(), &error.pointer, error.problem);
            }
        }
    }

    fn hash_files(&mut self) {
        let mut files: Vec<String> = Vec::new();
        if self.listing.game_json {
            files.push(GAME_FILE.to_owned());
        }
        for (table, listing) in &self.listing.tables {
            for key in &listing.keys {
                files.push(super::row_file(table, key));
            }
            for (key, names) in &listing.folders {
                let folder = row_folder(table, key);
                files.extend(names.iter().map(|name| format!("{folder}/{name}")));
            }
        }
        files.extend(
            self.listing
                .assets
                .iter()
                .map(|path| super::asset_file(path)),
        );
        let root = self.folder.clone();
        let hashed: Vec<(String, io::Result<FileHash>)> = files
            .into_par_iter()
            .map(|file| {
                let hashed = root.read(&file).map(|bytes| FileHash {
                    hash: blake3::hash(&bytes).to_hex().to_string(),
                    size: bytes.len() as u64,
                });
                (file, hashed)
            })
            .collect();
        let mut hashes = BTreeMap::new();
        for (file, hashed) in hashed {
            match hashed {
                Ok(hashed) => {
                    hashes.insert(file, hashed);
                }
                Err(error) => self.file_error(
                    file,
                    ErrorPlace::WholeFile,
                    ContentProblem::new("unreadable file", error, "a readable file"),
                ),
            }
        }
        self.built(FileHashes(hashes));
    }

    fn has_settings(&mut self, registry: &ContentRegistry) -> bool {
        registry
            .settings_loader()
            .is_some_and(|loader| loader.built(&self.content()))
    }

    fn run_hooks(&mut self, registry: &ContentRegistry, step: LoadStep) {
        for (_, hook) in registry.hooks.iter().filter(|(at, _)| *at == step) {
            hook(self);
        }
    }

    fn check_fixtures(&mut self, registry: &ContentRegistry) {
        for fixture in &registry.fixtures {
            (fixture.check)(self);
        }
    }

    fn check_version(&mut self, registry: &ContentRegistry, version: &ContentVersion) {
        let Some(loader) = registry.settings_loader() else {
            return;
        };
        let content = self.content();
        let Some(found) = loader.version(&content) else {
            return;
        };
        if found != version {
            self.json_error(
                GAME_FILE,
                "/content_version",
                ContentProblem::new(
                    VERSION_RULE,
                    format!("{:?}", found.0),
                    format!("{:?}", version.0),
                ),
            );
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileHash {
    pub hash: String,
    pub size: u64,
}

pub struct FileHashes(pub BTreeMap<String, FileHash>);

struct ParsedFile {
    row: Option<Box<dyn Any + Send + Sync>>,
    index: Option<Arc<JsonIndex>>,
    errors: Vec<LoadError>,
}

pub struct ParseError {
    pub pointer: String,
    pub inner: serde_json::Error,
}

impl From<serde_path_to_error::Error<serde_json::Error>> for ParseError {
    fn from(error: serde_path_to_error::Error<serde_json::Error>) -> ParseError {
        ParseError {
            pointer: pointer_of(error.path()),
            inner: error.into_inner(),
        }
    }
}
type ParseResult = Result<Box<dyn Any + Send + Sync>, ParseError>;

/// A file read and parsed as JSON, with a row's owner taken off it, before any row type reads it.
struct ReadFile {
    file: String,
    value: Option<serde_json::Value>,
    owner: Option<RowName>,
    index: Option<Arc<JsonIndex>>,
    errors: Vec<LoadError>,
}

fn read_file(root: &dyn ContentFolder, file: &str, row: bool) -> ReadFile {
    let mut read = ReadFile {
        file: file.to_owned(),
        value: None,
        owner: None,
        index: None,
        errors: Vec::new(),
    };
    let text = match root.read(file) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(_) => {
                read.errors.push(whole_file(
                    file,
                    "unreadable file",
                    "not UTF-8",
                    "a UTF-8 JSON file",
                ));
                return read;
            }
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => return read,
        Err(error) => {
            read.errors.push(whole_file(
                file,
                "unreadable file",
                error,
                "a readable file",
            ));
            return read;
        }
    };
    let index = Arc::new(JsonIndex::of(&text));
    let split = if row {
        split_owner(&text)
    } else {
        parse_json(&text).map(|value| (value, None))
    };
    match split {
        Ok((value, owner)) => {
            read.value = Some(value);
            read.owner = owner;
        }
        Err(error) => read.errors.push(shape_error(file, &error, &index, &[])),
    }
    read.index = Some(index);
    read
}

/// A row file's JSON without its owner field, and the owner it names.
pub fn split_owner(text: &str) -> Result<(serde_json::Value, Option<RowName>), ParseError> {
    let mut value: serde_json::Value = parse_json(text)?;
    let owner = value
        .as_object_mut()
        .and_then(|fields| fields.shift_remove(OWNER_FIELD))
        .map(|owner| {
            serde_path_to_error::deserialize::<_, RowName>(owner).map_err(|error| ParseError {
                pointer: format!("/{OWNER_FIELD}"),
                inner: error.into_inner(),
            })
        })
        .transpose()?;
    Ok((value, owner))
}

fn parse_read(
    read: ReadFile,
    scope: &ContentScope,
    list_kinds: &[ListKind],
    parse: impl FnOnce(serde_json::Value) -> ParseResult,
) -> ParsedFile {
    let mut parsed = ParsedFile {
        row: None,
        index: read.index,
        errors: read.errors,
    };
    let (Some(value), Some(index)) = (read.value, parsed.index.clone()) else {
        return parsed;
    };
    let (result, scope) = with_content(scope.clone(), || parse(value));
    match result {
        Ok(row) => {
            parsed.row = Some(row);
            parsed
                .errors
                .extend(reference_errors(&read.file, scope.leaves(), &index));
        }
        Err(error) => parsed
            .errors
            .push(shape_error(&read.file, &error, &index, list_kinds)),
    }
    parsed
}

fn whole_file(
    file: &str,
    rule: &'static str,
    found: impl Display,
    expected: impl Display,
) -> LoadError {
    LoadError {
        file: file.to_owned(),
        at: ErrorPlace::WholeFile,
        problem: ContentProblem::new(rule, found, expected),
    }
}

pub fn reference_errors(file: &str, leaves: &[Leaf], index: &JsonIndex) -> Vec<LoadError> {
    placed(leaves, index)
        .filter_map(|(leaf, found)| {
            Some(LoadError {
                file: file.to_owned(),
                at: found.map_or(ErrorPlace::WholeFile, |value| ErrorPlace::Json {
                    line: value.line,
                    column: value.column,
                    pointer: value.pointer.clone(),
                }),
                problem: leaf.reported()?,
            })
        })
        .collect()
}

// A leaf is written where its value is. The parse may meet the leaves in another order than the
// file has them (flattened fields are read in declaration order), so each leaf takes the next
// unclaimed occurrence of its value.
fn placed<'a>(
    leaves: &'a [Leaf],
    index: &'a JsonIndex,
) -> impl Iterator<Item = (&'a Leaf, Option<&'a IndexedValue>)> {
    let mut occurrences: HashMap<&'a str, VecDeque<&'a IndexedValue>> = HashMap::new();
    for value in index.strings() {
        if let Some(string) = value.string.as_deref() {
            occurrences.entry(string).or_default().push_back(value);
        }
    }
    leaves.iter().map(move |leaf| {
        let found = occurrences
            .get_mut(leaf.value.as_str())
            .and_then(VecDeque::pop_front);
        (leaf, found)
    })
}

pub fn pointer_of(path: &serde_path_to_error::Path) -> String {
    use serde_path_to_error::Segment;
    let mut pointer = String::new();
    for segment in path.iter() {
        match segment {
            Segment::Seq { index } => {
                pointer.push('/');
                pointer.push_str(&index.to_string());
            }
            Segment::Map { key } => {
                pointer.push('/');
                pointer.push_str(&escape(key));
            }
            Segment::Enum { .. } | Segment::Unknown => {}
        }
    }
    pointer
}

fn shape_error(
    file: &str,
    error: &ParseError,
    index: &JsonIndex,
    list_kinds: &[ListKind],
) -> LoadError {
    use serde_json::error::Category;
    let inner = &error.inner;
    let pointer = error.pointer.clone();
    let message = inner.to_string();
    let message = message
        .split(" at line ")
        .next()
        .unwrap_or(&message)
        .to_owned();
    if matches!(
        inner.classify(),
        Category::Syntax | Category::Eof | Category::Io
    ) {
        return LoadError {
            file: file.to_owned(),
            at: ErrorPlace::Json {
                line: inner.line().max(1),
                column: inner.column().max(1),
                pointer: pointer.clone(),
            },
            problem: ContentProblem::new(
                "invalid json",
                message,
                "one JSON object: no comments, no trailing commas",
            ),
        };
    }
    let (line, column) = index
        .position(&pointer)
        .unwrap_or((inner.line().max(1), inner.column().max(1)));
    let at = ErrorPlace::Json {
        line,
        column,
        pointer: pointer.clone(),
    };
    LoadError {
        file: file.to_owned(),
        at,
        problem: classify_shape(&message, &pointer, list_kinds),
    }
}

fn classify_shape(message: &str, pointer: &str, list_kinds: &[ListKind]) -> ContentProblem {
    if let Some(rest) = message.strip_prefix("missing field `") {
        let field = rest.trim_end_matches('`');
        return ContentProblem::new(
            "missing field",
            format!("no field {field}"),
            format!("a {field} field"),
        );
    }
    if let Some(rest) = message.strip_prefix("duplicate field `") {
        let field = rest.trim_end_matches('`');
        return ContentProblem::new(
            "duplicate field",
            format!("{field} twice"),
            format!("{field} once"),
        );
    }
    if let Some(rest) = message.strip_prefix("unknown field `") {
        let (field, options) = split_options(rest);
        let nearest = nearest(&options, field);
        return ContentProblem::new(
            "unknown field",
            format!("{field:?}"),
            expected_options("a field", &options),
        )
        .near(nearest.map(|f| format!("{f:?}")));
    }
    if let Some(rest) = message.strip_prefix("unknown variant `") {
        let (variant, options) = split_options(rest);
        let nearest = nearest(&options, variant);
        let list = pointer
            .rsplit('/')
            .nth(1)
            .and_then(|parent| list_kinds.iter().find(|kind| kind.field == parent));
        return ContentProblem::new(
            list.map_or("unknown variant", |kind| kind.rule),
            format!("{variant:?}"),
            expected_options(list.map_or("a variant", |kind| kind.expected), &options),
        )
        .near(nearest.map(|v| format!("{v:?}")));
    }
    if let Some(rest) = message
        .strip_prefix("invalid type: ")
        .or_else(|| message.strip_prefix("invalid value: "))
        .or_else(|| message.strip_prefix("invalid length "))
    {
        let (found, expected) = rest
            .split_once(", expected ")
            .unwrap_or((rest, "another value"));
        return ContentProblem::new("wrong type", found, expected);
    }
    if let Some(rest) = message.strip_prefix("data did not match any variant of untagged enum ") {
        return ContentProblem::new(
            "wrong type",
            "a value of another shape",
            format!("a {rest} value"),
        );
    }
    ContentProblem::new("wrong type", message, "a value of the field's type")
}

fn split_options(rest: &str) -> (&str, Vec<String>) {
    let (name, tail) = rest.split_once('`').unwrap_or((rest, ""));
    let options = tail
        .split('`')
        .skip(1)
        .step_by(2)
        .map(str::to_owned)
        .collect();
    (name, options)
}

fn expected_options(what: &str, options: &[String]) -> String {
    if options.is_empty() {
        format!("{what} the type has")
    } else if options.len() <= 12 {
        format!("one of {}", options.join(", "))
    } else {
        format!("{what} the type has ({} of them)", options.len())
    }
}

pub(super) trait TableLoader: Send + Sync {
    fn name(&self) -> &'static str;
    fn row_type(&self) -> TypeId;
    fn folders(&self) -> bool;
    fn shape(&self, settings: &SchemaSettings) -> serde_json::Value;
    fn sees_all_rows(&self) -> bool;
    fn parse(&self, text: &str) -> ParseResult {
        let (value, _) = split_owner(text)?;
        self.parse_value(value)
    }
    fn parse_value(&self, value: serde_json::Value) -> ParseResult;
    fn finish(
        &self,
        keys: Vec<String>,
        rows: Vec<(String, Box<dyn Any + Send + Sync>)>,
        builder: &mut ContentBuilder,
    );
    fn check_rows(&self, content: &Content, errors: &mut Vec<(&'static str, String, RowCheck)>);
    fn write_rows(&self, content: &Content, writer: &mut FileWriter) -> io::Result<()>;
}

fn shape_of<T: JsonSchema>(settings: &SchemaSettings) -> serde_json::Value {
    settings
        .clone()
        .into_generator()
        .into_root_schema_for::<T>()
        .to_value()
}

struct RowLoader<Row> {
    folders: bool,
    marker: PhantomData<fn() -> Row>,
}

impl<Row: ContentRow> TableLoader for RowLoader<Row> {
    fn name(&self) -> &'static str {
        Row::TABLE
    }

    fn row_type(&self) -> TypeId {
        TypeId::of::<Row>()
    }

    fn folders(&self) -> bool {
        self.folders
    }

    fn shape(&self, settings: &SchemaSettings) -> serde_json::Value {
        shape_of::<Row>(settings)
    }

    fn sees_all_rows(&self) -> bool {
        Row::SEES_ALL_ROWS
    }

    fn parse_value(&self, value: serde_json::Value) -> ParseResult {
        parse_value::<Row>(value).map(|row| Box::new(row) as Box<dyn Any + Send + Sync>)
    }

    fn finish(
        &self,
        keys: Vec<String>,
        rows: Vec<(String, Box<dyn Any + Send + Sync>)>,
        builder: &mut ContentBuilder,
    ) {
        let mut table = Table::<Row>::keyed(keys);
        for (key, row) in rows {
            let row = *row
                .downcast::<Row>()
                .expect("a row parsed by its own loader");
            table.insert(&key, row);
        }
        builder.insert_table(table);
    }

    fn check_rows(&self, content: &Content, errors: &mut Vec<(&'static str, String, RowCheck)>) {
        for (id, row) in content.table::<Row>().iter() {
            let mut check = RowCheck::default();
            row.check(&mut check);
            if !check.is_empty() {
                errors.push((Row::TABLE, id.key(content).to_owned(), check));
            }
        }
    }

    fn write_rows(&self, content: &Content, writer: &mut FileWriter) -> io::Result<()> {
        for (id, row) in content.table::<Row>().iter() {
            let key = id.key(content);
            let file = super::row_file(Row::TABLE, key);
            match content.owners().owner(Row::TABLE, key) {
                Some(owner) => writer.json(&file, &Owned { owner, row })?,
                None => writer.json(&file, row)?,
            }
        }
        Ok(())
    }
}

#[derive(Serialize)]
struct Owned<'a, Row> {
    owner: &'a RowName,
    #[serde(flatten)]
    row: &'a Row,
}

pub fn parse_value<T: DeserializeOwned>(value: serde_json::Value) -> Result<T, ParseError> {
    Ok(serde_path_to_error::deserialize(value)?)
}

pub fn parse_json<T: DeserializeOwned>(text: &str) -> Result<T, ParseError> {
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let value: T = serde_path_to_error::deserialize(&mut deserializer)?;
    deserializer.end().map_err(|inner| ParseError {
        pointer: String::new(),
        inner,
    })?;
    Ok(value)
}

pub(super) trait SettingsLoader: Send + Sync {
    fn parse(&self, text: &str) -> ParseResult;
    fn parse_value(&self, value: serde_json::Value) -> ParseResult;
    fn shape(&self, settings: &SchemaSettings) -> serde_json::Value;
    fn store(&self, settings: Box<dyn Any + Send + Sync>, builder: &mut ContentBuilder);
    fn built(&self, content: &Content) -> bool;
    fn version<'a>(&self, content: &'a Content) -> Option<&'a ContentVersion>;
    fn write(&self, content: &Content, writer: &mut FileWriter) -> io::Result<()>;
}

struct SettingsOf<G>(PhantomData<fn() -> G>);

impl<G: Settings> SettingsLoader for SettingsOf<G> {
    fn shape(&self, settings: &SchemaSettings) -> serde_json::Value {
        shape_of::<G>(settings)
    }

    fn parse(&self, text: &str) -> ParseResult {
        parse_json::<G>(text).map(|settings| Box::new(settings) as Box<dyn Any + Send + Sync>)
    }

    fn parse_value(&self, value: serde_json::Value) -> ParseResult {
        parse_value::<G>(value).map(|settings| Box::new(settings) as Box<dyn Any + Send + Sync>)
    }

    fn store(&self, settings: Box<dyn Any + Send + Sync>, builder: &mut ContentBuilder) {
        let settings = *settings
            .downcast::<G>()
            .expect("settings parsed by their own loader");
        builder.built(settings);
    }

    fn built(&self, content: &Content) -> bool {
        content.has_built::<G>()
    }

    fn version<'a>(&self, content: &'a Content) -> Option<&'a ContentVersion> {
        self.built(content)
            .then(|| content.built::<G>().content_version())
    }

    fn write(&self, content: &Content, writer: &mut FileWriter) -> io::Result<()> {
        if self.built(content) {
            writer.json(GAME_FILE, content.built::<G>())?;
        }
        Ok(())
    }
}

fn module_rules<Row: ModuleSet>(loading: &mut Loading) {
    let content = loading.content();
    let mut errors: Vec<(ContentId<Row>, usize, String)> = Vec::new();
    with_content(ContentScope::of(&content), || {
        for (id, row) in content.table::<Row>().iter() {
            let mut seen: Vec<String> = Vec::new();
            for (index, module) in row.modules().iter().enumerate() {
                if Row::rule(module) != ModuleRule::AtMostOne {
                    continue;
                }
                let tag = serde_json::to_value(module)
                    .ok()
                    .and_then(|value| value.get("type")?.as_str().map(str::to_owned))
                    .unwrap_or_default();
                if seen.contains(&tag) {
                    errors.push((id, index, tag));
                } else {
                    seen.push(tag);
                }
            }
        }
    });
    for (id, index, tag) in errors {
        loading.row_error(
            id,
            &format!("/modules/{index}"),
            ContentProblem::new(
                "too many",
                format!("a second {tag} module"),
                format!(
                    "at most one {tag} module on {} {} row",
                    article(Row::TABLE),
                    Row::TABLE
                ),
            ),
        );
    }
}

struct Listing {
    game_json: bool,
    tables: BTreeMap<&'static str, TableListing>,
    assets: Vec<String>,
}

#[derive(Default)]
struct TableListing {
    keys: Vec<String>,
    folders: HashMap<String, Vec<String>>,
}

struct Listed {
    listing: Listing,
    errors: Vec<LoadError>,
}

impl Listing {
    fn keys_of(&self, table: &str) -> Vec<String> {
        self.tables
            .get(table)
            .map(|listing| listing.keys.clone())
            .unwrap_or_default()
    }

    fn read(registry: &ContentRegistry, root: &dyn ContentFolder) -> Listed {
        let mut errors = Vec::new();
        let mut listing = Listing {
            game_json: false,
            tables: BTreeMap::new(),
            assets: Vec::new(),
        };
        for loader in registry.row_loaders() {
            listing
                .tables
                .insert(loader.name(), TableListing::default());
        }
        for entry in entries(root, "") {
            let name = entry.name.clone();
            match (name.as_str(), entry.dir) {
                (GAME_FILE, false) => listing.game_json = true,
                ("credits.md" | "README.md", false) => {}
                (TABLES_DIR, true) => listing.read_tables(registry, root, &mut errors),
                (ASSETS_DIR, true) => collect_assets(root, ASSETS_DIR, "", &mut listing.assets),
                _ => errors.push(whole_file(
                    &name,
                    "unknown entry",
                    describe(&entry),
                    "game.json, tables/, assets/, credits.md or README.md at the root",
                )),
            }
        }
        listing.assets.sort_unstable();
        Listed { listing, errors }
    }

    fn read_tables(
        &mut self,
        registry: &ContentRegistry,
        root: &dyn ContentFolder,
        errors: &mut Vec<LoadError>,
    ) {
        let names: Vec<&'static str> = registry.table_names();
        for entry in entries(root, TABLES_DIR) {
            let Some(loader) = registry
                .row_loaders()
                .iter()
                .find(|loader| entry.dir && loader.name() == entry.name)
            else {
                errors.push(whole_file(
                    &table_folder(&entry.name),
                    "unknown entry",
                    describe(&entry),
                    expected_options(
                        "a table",
                        &names.iter().map(|n| n.to_string()).collect::<Vec<_>>(),
                    ),
                ));
                continue;
            };
            let table = loader.name();
            let dir = table_folder(table);
            let mut keyed: Vec<(String, String)> = Vec::new();
            let mut folders: Vec<(String, Vec<String>)> = Vec::new();
            for entry in entries(root, &dir) {
                let file = format!("{dir}/{}", entry.name);
                match (entry.dir, entry.name.strip_suffix(".json")) {
                    (false, Some(key)) => {
                        if valid_key(key) {
                            keyed.push((key.to_owned(), file));
                        } else {
                            errors.push(whole_file(
                                &file,
                                "invalid key",
                                format!("{key:?}"),
                                KEY_RULE,
                            ));
                        }
                    }
                    (true, _) if loader.folders() => {
                        let files: Vec<String> = entries(root, &format!("{dir}/{}", entry.name))
                            .into_iter()
                            .filter(|inner| {
                                if inner.dir {
                                    errors.push(whole_file(
                                        &format!("{file}/{}", inner.name),
                                        "unknown entry",
                                        "a folder",
                                        format!("only files inside tables/{table}/<key>/"),
                                    ));
                                }
                                !inner.dir
                            })
                            .map(|inner| inner.name)
                            .collect();
                        folders.push((entry.name.clone(), files));
                    }
                    _ => errors.push(whole_file(
                        &file,
                        "unknown entry",
                        describe(&entry),
                        format!("only <key>.json rows in tables/{table}/"),
                    )),
                }
            }
            keyed.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
            let mut keys: Vec<String> = Vec::new();
            for (key, file) in keyed {
                if let Some(clash) = keys.iter().find(|k| k.eq_ignore_ascii_case(&key)) {
                    errors.push(whole_file(
                        &file,
                        "duplicate key",
                        format!("{clash} and {key}"),
                        "keys unique in their table ignoring case",
                    ));
                    continue;
                }
                keys.push(key);
            }
            let mut listing = TableListing::default();
            for (folder, files) in folders {
                if keys.contains(&folder) {
                    listing.folders.insert(folder, files);
                } else {
                    errors.push(whole_file(
                        &row_folder(table, &folder),
                        "unknown entry",
                        format!("a folder with no {table} row {folder}.json beside it"),
                        format!("{} for its files", row_file(table, &folder)),
                    ));
                }
            }
            listing.keys = keys;
            self.tables.insert(table, listing);
        }
    }
}

fn is_fixture(registry: &ContentRegistry, row: &RowName) -> bool {
    registry.fixtures.iter().any(|fixture| {
        fixture.table == row.table
            && (fixture.whole_table || fixture.keys.iter().any(|(key, _)| *key == row.key))
    })
}

fn table_name(registry: &ContentRegistry, table: &str) -> &'static str {
    registry
        .table_names()
        .into_iter()
        .find(|name| *name == table)
        .expect("a row's own table is registered")
}

pub const KEY_RULE: &str =
    "1 to 64 of ASCII letters, digits, _ and -, not starting with -, not a Windows device name";

fn describe(entry: &FolderEntry) -> String {
    if entry.dir {
        format!("folder {}", entry.name)
    } else {
        format!("file {}", entry.name)
    }
}

fn entries(root: &dyn ContentFolder, dir: &str) -> Vec<FolderEntry> {
    let mut entries: Vec<FolderEntry> = root
        .entries(dir)
        .into_iter()
        .filter(|entry| !entry.name.starts_with('.'))
        .collect();
    entries.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    entries
}

fn collect_assets(root: &dyn ContentFolder, dir: &str, prefix: &str, into: &mut Vec<String>) {
    for entry in entries(root, dir) {
        let path = format!("{prefix}{}", entry.name);
        if entry.dir {
            collect_assets(
                root,
                &format!("{dir}/{}", entry.name),
                &format!("{path}/"),
                into,
            );
        } else {
            into.push(path);
        }
    }
}

pub fn valid_key(key: &str) -> bool {
    const DEVICES: [&str; 22] = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    (1..=64).contains(&key.len())
        && !key.starts_with('-')
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        && !DEVICES
            .iter()
            .any(|device| device.eq_ignore_ascii_case(key))
}

pub struct FileWriter {
    root: PathBuf,
    written: Vec<String>,
    kept: usize,
}

impl FileWriter {
    pub fn new(root: &Path) -> FileWriter {
        FileWriter {
            root: root.to_path_buf(),
            written: Vec::new(),
            kept: 0,
        }
    }

    pub fn json<T: Serialize>(&mut self, file: &str, value: &T) -> io::Result<()> {
        let mut bytes = serde_json::to_vec_pretty(value)?;
        bytes.push(b'\n');
        self.file(file, &bytes)
    }

    /// A file shared with another folder through a symlink is written where the link points, so the
    /// one copy changes rather than the link turning into a copy of its own.
    pub fn file(&mut self, file: &str, bytes: &[u8]) -> io::Result<()> {
        let linked = self.root.join(file);
        let path = std::fs::canonicalize(&linked).unwrap_or(linked);
        if std::fs::read(&path).is_ok_and(|current| current == bytes) {
            self.kept += 1;
            return Ok(());
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temp = path.with_extension(format!(
            "{}.tmp",
            path.extension().and_then(|e| e.to_str()).unwrap_or("")
        ));
        std::fs::write(&temp, bytes)?;
        std::fs::rename(&temp, &path)?;
        self.written.push(file.to_owned());
        Ok(())
    }

    pub fn written(&self) -> &[String] {
        &self.written
    }

    pub fn kept(&self) -> usize {
        self.kept
    }
}

pub fn write(registry: &ContentRegistry, content: Content, root: &Path) -> io::Result<FileWriter> {
    let mut writer = FileWriter::new(root);
    let result = with_content(ContentScope::of(&content), || {
        if let Some(settings) = registry.settings_loader() {
            settings.write(&content, &mut writer)?;
        }
        for loader in registry.row_loaders() {
            loader.write_rows(&content, &mut writer)?;
        }
        for folder in registry.folder_writers() {
            folder(&content, &mut writer)?;
        }
        Ok::<(), io::Error>(())
    })
    .0;
    result.map(|()| writer)
}

/// Every fixture of `F` has its row, and every row keeps what the engine reads from it.
fn check_fixture<F: Fixture>(loading: &mut Loading) {
    let content = loading.content();
    let table = F::Row::TABLE;
    for fixture in F::VARIANTS {
        let Some(id) = content.table::<F::Row>().id_of(fixture.key()) else {
            loading.file_error(
                super::row_file(table, fixture.key()),
                ErrorPlace::WholeFile,
                ContentProblem::new(
                    "missing fixture",
                    "no such file",
                    format!("one row for every {table} fixture the engine requires"),
                ),
            );
            continue;
        };
        let Ok(row) = serde_json::to_value(id.get(&content)) else {
            continue;
        };
        let mut check = RowCheck::default();
        for lock in fixture.locks() {
            lock.check(&row, &mut check);
        }
        loading.row_errors(id, check);
    }
    if !F::WHOLE_TABLE {
        return;
    }
    let fixed: Vec<&str> = F::VARIANTS.iter().map(|fixture| fixture.key()).collect();
    for (id, _) in content.table::<F::Row>().iter() {
        let key = id.key(&content);
        if !fixed.contains(&key) {
            loading.file_error(
                super::row_file(table, key),
                ErrorPlace::WholeFile,
                ContentProblem::new(
                    "row the engine never reads",
                    key,
                    format!("one of the {table} fixtures the engine requires"),
                ),
            );
        }
    }
}
