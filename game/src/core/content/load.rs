use std::any::{Any, TypeId};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Display;
use std::io;
use std::marker::PhantomData;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use rayon::prelude::*;
use schemars::JsonSchema;
use schemars::generate::SchemaSettings;
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::check::RowCheck;
use super::fixture::Fixture;
use super::id::{ContentId, ContentScope, Leaf, LeafKind, LeafProblem, nearest, with_content};
use super::locate::{JsonIndex, escape};
use super::report::{ErrorPlace, LoadError, LoadReport, VERSION_RULE};
use super::table::{Content, ContentBuilder, ContentRow, ModuleRule, ModuleSet, Table};
use super::version::ContentVersion;

/// Which loading step a hook runs in; the loader's own work in each step runs first.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LoadStep {
    Rows,
    Files,
    Blueprints,
    Areas,
    Across,
    Settings,
    Compile,
}

type Hook = Box<dyn Fn(&mut Loading) + Send + Sync>;
type FixtureCheck = Box<dyn Fn(&Content) -> Vec<(&'static str, &'static str)> + Send + Sync>;

struct FixtureEntry {
    table: &'static str,
    keys: Vec<&'static str>,
    check: FixtureCheck,
}
pub type FolderWriter = Box<dyn Fn(&Content, &mut FileWriter) -> io::Result<()> + Send + Sync>;

/// Every table, fixture, settings type and loading hook the game registers. The loader and the
/// writer read the registry; nothing else knows which tables exist.
#[derive(Default)]
pub struct ContentRegistry {
    rows: Vec<Box<dyn TableLoader>>,
    fixtures: Vec<FixtureEntry>,
    hooks: Vec<(LoadStep, Hook)>,
    settings: Option<Box<dyn SettingsLoader>>,
    writers: Vec<FolderWriter>,
    module_rules: Vec<(&'static str, ModuleProbe)>,
}

type ModuleProbe = Box<dyn Fn(&serde_json::Value) -> Option<ModuleRule> + Send + Sync>;

impl ContentRegistry {
    pub fn row<Row: ContentRow>(&mut self) -> &mut ContentRegistry {
        self.rows.push(Box::new(RowLoader::<Row> {
            folders: false,
            marker: PhantomData,
        }));
        self
    }

    /// Checks a registered table's module rules.
    pub fn modules<Row: ModuleSet>(&mut self) -> &mut ContentRegistry {
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

    /// How many modules of the kind `json` is a table's row may hold, read from its module set.
    pub fn module_rule(&self, table: &str, json: &serde_json::Value) -> Option<ModuleRule> {
        self.module_rules
            .iter()
            .find(|(name, _)| *name == table)
            .and_then(|(_, probe)| probe(json))
    }

    /// A table whose rows may own a folder `tables/<table>/<key>/` of extra files.
    pub fn folder<Row: ContentRow>(&mut self) -> &mut ContentRegistry {
        self.rows.push(Box::new(RowLoader::<Row> {
            folders: true,
            marker: PhantomData,
        }));
        self
    }

    pub fn fixture<F: Fixture>(&mut self) -> &mut ContentRegistry {
        self.fixtures.push(FixtureEntry {
            table: F::Row::TABLE,
            keys: F::VARIANTS.iter().map(|fixture| fixture.key()).collect(),
            check: Box::new(|content| {
                F::missing(content)
                    .into_iter()
                    .map(|key| (F::Row::TABLE, key))
                    .collect()
            }),
        });
        self
    }

    pub fn settings<G: Settings>(&mut self) -> &mut ContentRegistry {
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
        super::version::compute(self)
    }

    pub fn shapes(&self, settings: &SchemaSettings) -> serde_json::Value {
        let tables: Vec<serde_json::Value> = self
            .rows
            .iter()
            .map(|row| {
                let fixtures: Vec<&str> = self
                    .fixtures
                    .iter()
                    .filter(|fixture| fixture.table == row.name())
                    .flat_map(|fixture| fixture.keys.iter().copied())
                    .collect();
                serde_json::json!({
                    "table": row.name(),
                    "folders": row.folders(),
                    "shape": row.shape(settings),
                    "fixtures": fixtures,
                })
            })
            .collect();
        serde_json::json!({
            "tables": tables,
            "settings": self.settings.as_ref().map(|settings_loader| settings_loader.shape(settings)),
        })
    }

    /// Every row or asset `text` names, as a parse of `file` (a row file or `game.json`) against
    /// `content` resolves them, each located in the text: the reference graph a tool rewrites by.
    pub fn references(&self, content: &Content, file: &str, text: &str) -> Vec<Reference> {
        let leaves = if file == "game.json" {
            let Some(loader) = self.settings.as_deref() else {
                return Vec::new();
            };
            leaves_of(content, text, &|text| loader.parse(text))
        } else {
            let loader =
                table_of(file).and_then(|table| self.rows.iter().find(|row| row.name() == table));
            let Some(loader) = loader else {
                return Vec::new();
            };
            leaves_of(content, text, &|text| loader.parse(text))
        };
        let index = JsonIndex::of(text);
        let mut strings = index.strings();
        leaves
            .into_iter()
            .filter_map(|leaf| {
                let found = strings
                    .by_ref()
                    .find(|value| value.string.as_deref() == Some(leaf.value.as_str()))?;
                Some(Reference {
                    kind: leaf.kind,
                    value: leaf.value,
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

/// One reference a file makes, located in its text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub kind: LeafKind,
    pub value: String,
    pub known: bool,
    pub pointer: String,
    /// The reference is the key of a map entry at `pointer`, not the value there.
    pub key: bool,
    pub line: usize,
    pub column: usize,
}

fn table_of(file: &str) -> Option<&str> {
    let rest = file.strip_prefix("tables/")?;
    let (table, name) = rest.split_once('/')?;
    name.ends_with(".json").then_some(table)
}

fn leaves_of(content: &Content, text: &str, parse: &dyn Fn(&str) -> ParseResult) -> Vec<Leaf> {
    let (_, scope) = with_content(ContentScope::of(content), || parse(text));
    scope.leaves().to_vec()
}

/// Where a content folder's files come from: a directory, or files embedded in a binary.
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
                let dir = entry.file_type().ok()?.is_dir();
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

/// The `game.json` row.
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
    loading.run_hooks(registry, LoadStep::Blueprints);
    loading.run_hooks(registry, LoadStep::Areas);
    loading.run_hooks(registry, LoadStep::Across);
    loading.check_fixtures(registry);
    loading.run_hooks(registry, LoadStep::Settings);
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

/// The folder being loaded: what parsed so far, what was built from it, and every error met.
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
        *self.snapshot.get_or_insert_with(|| self.builder.build())
    }

    pub fn built<T: Any + Send + Sync>(&mut self, value: T) -> &'static T {
        self.snapshot = None;
        self.builder.built(value)
    }

    pub fn error(&mut self, error: LoadError) {
        self.errors.push(error);
    }

    pub fn errors(&self) -> &[LoadError] {
        &self.errors
    }

    pub fn extend_errors(&mut self, errors: impl IntoIterator<Item = LoadError>) {
        self.errors.extend(errors);
    }

    pub fn file_error(
        &mut self,
        file: impl Into<String>,
        at: ErrorPlace,
        rule: &'static str,
        found: impl Display,
        expected: impl Display,
        nearest: Option<String>,
    ) {
        self.errors.push(LoadError {
            file: file.into(),
            at,
            rule,
            found: found.to_string(),
            expected: expected.to_string(),
            nearest,
        });
    }

    /// An error inside a JSON file at `pointer`, located through the file's text.
    pub fn json_error(
        &mut self,
        file: impl Into<String>,
        pointer: &str,
        rule: &'static str,
        found: impl Display,
        expected: impl Display,
        nearest: Option<String>,
    ) {
        let file = file.into();
        let at = self.place(&file, pointer);
        self.file_error(file, at, rule, found, expected, nearest);
    }

    pub fn row_error<Row: ContentRow>(
        &mut self,
        id: ContentId<Row>,
        pointer: &str,
        rule: &'static str,
        found: impl Display,
        expected: impl Display,
        nearest: Option<String>,
    ) {
        let file = self.row_file(id);
        self.json_error(file, pointer, rule, found, expected, nearest);
    }

    pub fn row_errors<Row: ContentRow>(&mut self, id: ContentId<Row>, check: RowCheck) {
        for error in check.into_errors() {
            self.row_error(
                id,
                &error.pointer,
                error.rule,
                error.found,
                error.expected,
                error.nearest,
            );
        }
    }

    pub fn row_file<Row: ContentRow>(&mut self, id: ContentId<Row>) -> String {
        let key = id.key(&self.content());
        format!("tables/{}/{key}.json", Row::TABLE)
    }

    pub fn fail<Row: ContentRow>(&mut self, id: ContentId<Row>) {
        let key = id.key(&self.content()).to_owned();
        self.failed.insert((Row::TABLE, key));
    }

    pub fn failed<Row: ContentRow>(&mut self, id: ContentId<Row>) -> bool {
        let content = self.content();
        let key = id.key(&content);
        content.table::<Row>().get(id).is_none()
            || self.failed.contains(&(Row::TABLE, key.to_owned()))
    }

    /// The rows of a table that loaded and failed no later step.
    pub fn rows<Row: ContentRow>(&mut self) -> Vec<(ContentId<Row>, &'static Row)> {
        let content = self.content();
        content
            .table::<Row>()
            .iter()
            .filter(|(id, _)| {
                !self
                    .failed
                    .contains(&(Row::TABLE, id.key(&content).to_owned()))
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

    /// The files inside `tables/<table>/<key>/`, as names, sorted bytewise.
    pub fn row_folder<Row: ContentRow>(&mut self, id: ContentId<Row>) -> Vec<String> {
        let key = id.key(&self.content()).to_owned();
        self.listing
            .tables
            .get(Row::TABLE)
            .and_then(|table| table.folders.get(&key))
            .cloned()
            .unwrap_or_default()
    }

    pub fn row_folder_file<Row: ContentRow>(&mut self, id: ContentId<Row>, name: &str) -> String {
        let key = id.key(&self.content());
        format!("tables/{}/{key}/{name}", Row::TABLE)
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
            let keys = self
                .listing
                .tables
                .get(loader.name())
                .map(|table| table.keys.clone())
                .unwrap_or_default();
            scope.table_by_type(loader.row_type(), loader.name(), keys);
        }
        scope.assets(self.listing.assets.clone());

        let jobs: Vec<(usize, String)> = registry
            .row_loaders()
            .iter()
            .enumerate()
            .flat_map(|(index, loader)| {
                self.listing
                    .tables
                    .get(loader.name())
                    .map(|table| table.keys.clone())
                    .unwrap_or_default()
                    .into_iter()
                    .map(move |key| (index, key))
            })
            .collect();
        let root = self.folder.clone();
        let parsed: Vec<Parsed> = jobs
            .into_par_iter()
            .map(|(index, key)| {
                let loader = &registry.row_loaders()[index];
                let file = format!("tables/{}/{key}.json", loader.name());
                parse_file(root.as_ref(), &file, &scope, |text| loader.parse(text))
                    .finish(index, key)
            })
            .collect();

        let mut rows: Vec<Vec<(String, Box<dyn Any + Send + Sync>)>> =
            registry.row_loaders().iter().map(|_| Vec::new()).collect();
        for parsed in parsed {
            if !parsed.errors.is_empty() {
                let table = registry.row_loaders()[parsed.loader].name();
                self.failed.insert((table, parsed.key.clone()));
            }
            self.errors.extend(parsed.errors);
            if let Some(index) = parsed.index {
                self.indexes.insert(parsed.file, Arc::new(index));
            }
            if let Some(row) = parsed.row {
                rows[parsed.loader].push((parsed.key, row));
            }
        }
        for (loader, rows) in registry.row_loaders().iter().zip(rows) {
            let keys = self
                .listing
                .tables
                .get(loader.name())
                .map(|table| table.keys.clone())
                .unwrap_or_default();
            loader.finish(keys, rows, &mut self.builder);
        }
        self.snapshot = None;

        let settings = parse_file(root.as_ref(), "game.json", &scope, |text| {
            registry
                .settings_loader()
                .map(|loader| loader.parse(text))
                .unwrap_or_else(|| Ok(Box::new(())))
        });
        self.errors.extend(settings.errors);
        if let Some(index) = settings.index {
            self.indexes.insert("game.json".to_owned(), Arc::new(index));
        }
        match settings.row {
            Some(settings) => {
                if let Some(loader) = registry.settings_loader() {
                    loader.store(settings, &mut self.builder);
                }
            }
            None if !self.listing.game_json => self.file_error(
                "game.json",
                ErrorPlace::WholeFile,
                "missing file",
                "no such file",
                "game.json at the root of the folder",
                None,
            ),
            None => {}
        }
        self.snapshot = None;
    }

    fn check_rows(&mut self, registry: &ContentRegistry) {
        let content = self.content();
        let mut errors: Vec<(&'static str, String, RowCheck)> = Vec::new();
        for loader in registry.row_loaders() {
            loader.check_rows(&content, &mut errors);
        }
        for (table, key, check) in errors {
            let file = format!("tables/{table}/{key}.json");
            self.failed.insert((table, key));
            for error in check.into_errors() {
                self.json_error(
                    file.clone(),
                    &error.pointer,
                    error.rule,
                    error.found,
                    error.expected,
                    error.nearest,
                );
            }
        }
    }

    fn hash_files(&mut self) {
        let mut files: Vec<String> = Vec::new();
        if self.listing.game_json {
            files.push("game.json".to_owned());
        }
        for (table, listing) in &self.listing.tables {
            for key in &listing.keys {
                files.push(format!("tables/{table}/{key}.json"));
            }
            for (key, names) in &listing.folders {
                for name in names {
                    files.push(format!("tables/{table}/{key}/{name}"));
                }
            }
        }
        files.extend(
            self.listing
                .assets
                .iter()
                .map(|path| format!("assets/{path}")),
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
                    "unreadable file",
                    error,
                    "a readable file",
                    None,
                ),
            }
        }
        self.built(FileHashes(hashes));
    }

    fn run_hooks(&mut self, registry: &ContentRegistry, step: LoadStep) {
        for (_, hook) in registry.hooks.iter().filter(|(at, _)| *at == step) {
            hook(self);
        }
    }

    fn check_fixtures(&mut self, registry: &ContentRegistry) {
        let content = self.content();
        for fixture in &registry.fixtures {
            for (table, key) in (fixture.check)(&content) {
                self.file_error(
                    format!("tables/{table}/{key}.json"),
                    ErrorPlace::WholeFile,
                    "missing fixture",
                    "no such file",
                    format!("one row for every {table} fixture the engine requires"),
                    None,
                );
            }
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
                "game.json",
                "/content_version",
                VERSION_RULE,
                format!("{:?}", found.0),
                format!("{:?}", version.0),
                None,
            );
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileHash {
    pub hash: String,
    pub size: u64,
}

/// Every file of the folder by its relative path, hashed with blake3.
pub struct FileHashes(pub BTreeMap<String, FileHash>);

struct Parsed {
    loader: usize,
    key: String,
    file: String,
    row: Option<Box<dyn Any + Send + Sync>>,
    index: Option<JsonIndex>,
    errors: Vec<LoadError>,
}

struct ParsedFile {
    file: String,
    row: Option<Box<dyn Any + Send + Sync>>,
    index: Option<JsonIndex>,
    errors: Vec<LoadError>,
}

impl ParsedFile {
    fn finish(self, loader: usize, key: String) -> Parsed {
        Parsed {
            loader,
            key,
            file: self.file,
            row: self.row,
            index: self.index,
            errors: self.errors,
        }
    }
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

fn parse_file(
    root: &dyn ContentFolder,
    file: &str,
    scope: &ContentScope,
    parse: impl FnOnce(&str) -> ParseResult,
) -> ParsedFile {
    let mut parsed = ParsedFile {
        file: file.to_owned(),
        row: None,
        index: None,
        errors: Vec::new(),
    };
    let text = match root.read(file) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(_) => {
                parsed.errors.push(whole_file(
                    file,
                    "unreadable file",
                    "not UTF-8",
                    "a UTF-8 JSON file",
                ));
                return parsed;
            }
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => return parsed,
        Err(error) => {
            parsed.errors.push(whole_file(
                file,
                "unreadable file",
                error,
                "a readable file",
            ));
            return parsed;
        }
    };
    let index = JsonIndex::of(&text);
    let (result, scope) = with_content(scope.clone(), || parse(&text));
    match result {
        Ok(row) => {
            parsed.row = Some(row);
            parsed
                .errors
                .extend(reference_errors(file, scope.leaves(), &index));
        }
        Err(error) => parsed.errors.push(shape_error(file, &error, &index)),
    }
    parsed.index = Some(index);
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
        rule,
        found: found.to_string(),
        expected: expected.to_string(),
        nearest: None,
    }
}

pub fn reference_errors(file: &str, leaves: &[Leaf], index: &JsonIndex) -> Vec<LoadError> {
    let mut errors = Vec::new();
    let mut strings = index.strings();
    for leaf in leaves {
        let found = strings
            .by_ref()
            .find(|value| value.string.as_deref() == Some(leaf.value.as_str()));
        let Some(problem) = &leaf.problem else {
            continue;
        };
        let at = match found {
            Some(value) => ErrorPlace::Json {
                line: value.line,
                column: value.column,
                pointer: value.pointer.clone(),
            },
            None => ErrorPlace::WholeFile,
        };
        let (rule, expected, nearest) = match (&leaf.kind, problem) {
            (LeafKind::Row(table), LeafProblem::Unknown { nearest }) => (
                "unknown row",
                format!("the key of {} {table} row", article(table)),
                nearest.as_ref().map(|key| format!("{key:?}")),
            ),
            (LeafKind::Asset, LeafProblem::Unknown { nearest }) => (
                "missing file",
                "a file under assets/".to_owned(),
                nearest.as_ref().map(|path| format!("{path:?}")),
            ),
            (_, LeafProblem::Unsafe) => (
                "unsafe path",
                "a path under assets/: forward slashes, never absolute or through ..".to_owned(),
                None,
            ),
        };
        errors.push(LoadError {
            file: file.to_owned(),
            at,
            rule,
            found: format!("{:?}", leaf.value),
            expected,
            nearest,
        });
    }
    errors
}

fn article(word: &str) -> &'static str {
    match word.chars().next() {
        Some('a' | 'e' | 'i' | 'o' | 'u') => "an",
        _ => "a",
    }
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

fn shape_error(file: &str, error: &ParseError, index: &JsonIndex) -> LoadError {
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
            rule: "invalid json",
            found: message,
            expected: "one JSON object: no comments, no trailing commas".to_owned(),
            nearest: None,
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
    let (rule, found, expected, nearest) = classify_shape(&message, &pointer);
    LoadError {
        file: file.to_owned(),
        at,
        rule,
        found,
        expected,
        nearest,
    }
}

fn classify_shape(message: &str, pointer: &str) -> (&'static str, String, String, Option<String>) {
    if let Some(rest) = message.strip_prefix("missing field `") {
        let field = rest.trim_end_matches('`');
        return (
            "missing field",
            format!("no field {field}"),
            format!("a {field} field"),
            None,
        );
    }
    if let Some(rest) = message.strip_prefix("duplicate field `") {
        let field = rest.trim_end_matches('`');
        return (
            "duplicate field",
            format!("{field} twice"),
            format!("{field} once"),
            None,
        );
    }
    if let Some(rest) = message.strip_prefix("unknown field `") {
        let (field, options) = split_options(rest);
        let nearest = nearest(&options, field);
        return (
            "unknown field",
            format!("{field:?}"),
            expected_options("a field", &options),
            nearest.map(|f| format!("{f:?}")),
        );
    }
    if let Some(rest) = message.strip_prefix("unknown variant `") {
        let (variant, options) = split_options(rest);
        let nearest = nearest(&options, variant);
        let in_modules = pointer
            .rsplit('/')
            .nth(1)
            .is_some_and(|parent| parent == "modules" || parent == "parts");
        let rule = if in_modules {
            "unknown module type"
        } else {
            "unknown variant"
        };
        return (
            rule,
            format!("{variant:?}"),
            expected_options(
                if in_modules {
                    "a module type"
                } else {
                    "a variant"
                },
                &options,
            ),
            nearest.map(|v| format!("{v:?}")),
        );
    }
    if let Some(rest) = message
        .strip_prefix("invalid type: ")
        .or_else(|| message.strip_prefix("invalid value: "))
        .or_else(|| message.strip_prefix("invalid length "))
    {
        let (found, expected) = rest
            .split_once(", expected ")
            .unwrap_or((rest, "another value"));
        return ("wrong type", found.to_owned(), expected.to_owned(), None);
    }
    if let Some(rest) = message.strip_prefix("data did not match any variant of untagged enum ") {
        return (
            "wrong type",
            "a value of another shape".to_owned(),
            format!("a {rest} value"),
            None,
        );
    }
    (
        "wrong type",
        message.to_owned(),
        "a value of the field's type".to_owned(),
        None,
    )
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
    fn parse(&self, text: &str) -> ParseResult;
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

    fn parse(&self, text: &str) -> ParseResult {
        parse_json::<Row>(text).map(|row| Box::new(row) as Box<dyn Any + Send + Sync>)
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
            let file = format!("tables/{}/{}.json", Row::TABLE, id.key(content));
            writer.json(&file, row)?;
        }
        Ok(())
    }
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
    fn shape(&self, settings: &SchemaSettings) -> serde_json::Value;
    fn store(&self, settings: Box<dyn Any + Send + Sync>, builder: &mut ContentBuilder);
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

    fn store(&self, settings: Box<dyn Any + Send + Sync>, builder: &mut ContentBuilder) {
        let settings = *settings
            .downcast::<G>()
            .expect("settings parsed by their own loader");
        builder.built(settings);
    }

    fn version<'a>(&self, content: &'a Content) -> Option<&'a ContentVersion> {
        content
            .has_built::<G>()
            .then(|| content.built::<G>().content_version())
    }

    fn write(&self, content: &Content, writer: &mut FileWriter) -> io::Result<()> {
        if content.has_built::<G>() {
            writer.json("game.json", content.built::<G>())?;
        }
        Ok(())
    }
}

fn module_rules<Row: ModuleSet>(loading: &mut Loading) {
    let content = loading.content();
    let mut errors: Vec<(ContentId<Row>, usize, String)> = Vec::new();
    let (_, _) = with_content(ContentScope::of(&content), || {
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
            "too many",
            format!("a second {tag} module"),
            format!(
                "at most one {tag} module on {} {} row",
                article(Row::TABLE),
                Row::TABLE
            ),
            None,
        );
    }
}

/// Step 1: the folder's entries against the layout.
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
                ("game.json", false) => listing.game_json = true,
                ("credits.md" | "README.md", false) => {}
                ("tables", true) => listing.read_tables(registry, root, &mut errors),
                ("assets", true) => collect_assets(root, "assets", "", &mut listing.assets),
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
        for entry in entries(root, "tables") {
            let Some(loader) = registry
                .row_loaders()
                .iter()
                .find(|loader| entry.dir && loader.name() == entry.name)
            else {
                errors.push(whole_file(
                    &format!("tables/{}", entry.name),
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
            let dir = format!("tables/{table}");
            let mut keyed: Vec<(String, String)> = Vec::new();
            let mut folders: Vec<(String, Vec<String>)> = Vec::new();
            for entry in entries(root, &dir) {
                let file = format!("tables/{table}/{}", entry.name);
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
                        &format!("tables/{table}/{folder}"),
                        "unknown entry",
                        format!("a folder with no {table} row {folder}.json beside it"),
                        format!("tables/{table}/{folder}.json for its files"),
                    ));
                }
            }
            listing.keys = keys;
            self.tables.insert(table, listing);
        }
    }
}

const KEY_RULE: &str =
    "1 to 64 of ASCII letters, digits, _ and -, not starting with -, not a Windows device name";

type Entry = FolderEntry;

fn describe(entry: &Entry) -> String {
    if entry.dir {
        format!("folder {}", entry.name)
    } else {
        format!("file {}", entry.name)
    }
}

fn entries(root: &dyn ContentFolder, dir: &str) -> Vec<Entry> {
    let mut entries: Vec<Entry> = root
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

/// Writes files under one folder, touching only those whose bytes change.
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

    pub fn file(&mut self, file: &str, bytes: &[u8]) -> io::Result<()> {
        let path = self.root.join(file);
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

/// Writes every row, the settings and each table's folder files of `content` into `root`.
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
