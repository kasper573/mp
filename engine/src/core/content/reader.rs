use std::any::Any;
use std::collections::BTreeMap;
use std::io;
use std::sync::Arc;

use super::files::{Listing, list};
use super::id::{ContentId, ContentScope, with_content};
use super::load::{
    ContentFolder, ContentRegistry, FileWriter, Settings, listing_scope, parse_file,
    parse_settings, parse_value,
};
use super::report::{ContentProblem, ErrorPlace, LoadError, MISSING_FILE};
use super::table::ContentFile;
use serde::de::DeserializeOwned;

/// A game folder read one content file at a time, each exactly as the loader reads it, against
/// every path the folder holds: how a tool that edits a file reads it, and writes it back as the
/// loader would read it again.
pub struct FolderReader {
    registry: &'static ContentRegistry,
    folder: Arc<dyn ContentFolder>,
    listing: Listing,
    scope: ContentScope,
}

/// What writing a content file makes of the folder: the files written, by their path from the
/// game folder, and the parts of its bundle no longer written.
#[derive(Debug, Default)]
pub struct WrittenFiles {
    pub files: BTreeMap<String, Vec<u8>>,
    pub removed: Vec<String>,
}

/// A file that can't be read as its type: its errors, as loading the folder would report them.
pub type Unreadable = Vec<LoadError>;

impl FolderReader {
    pub fn new(registry: &'static ContentRegistry, folder: Arc<dyn ContentFolder>) -> FolderReader {
        let (listing, _) = list(folder.as_ref(), &registry.file_types());
        let scope = listing_scope(registry, &listing);
        FolderReader {
            registry,
            folder,
            listing,
            scope,
        }
    }

    /// The content file at `path`, its fields and the parts of its bundle, when it reads whole:
    /// parsed, with every reference naming a file the folder holds.
    pub fn read<Row: ContentFile>(&self, path: &str) -> Result<Row, Unreadable> {
        let Some(loader) = self.registry.loader_of::<Row>() else {
            return Err(vec![unknown_type(path, Row::TABLE)]);
        };
        if self.scope.id_of::<Row>(path).is_none() {
            return Err(vec![missing(path, Row::TABLE)]);
        }
        let parsed = parse_file(
            self.registry,
            loader,
            &self.folder,
            &self.listing,
            &self.scope,
            path,
        );
        whole(parsed.row, parsed.errors, path)
    }

    /// `json` read as a `T`, its references resolved among the folder's paths: the fields of a file
    /// about to be made, or a value kept apart from the files.
    pub fn from_json<T: DeserializeOwned>(&self, json: &serde_json::Value) -> Result<T, String> {
        let (parsed, scope) = with_content(self.scope.clone(), || parse_value::<T>(json));
        let row = parsed.map_err(|error| format!("at {}: {}", error.pointer, error.inner))?;
        match scope.leaves().iter().find_map(|leaf| leaf.reported()) {
            Some(problem) => Err(problem.to_string()),
            None => Ok(row),
        }
    }

    /// `value` as JSON, its ids written as the paths they stand for among the folder's.
    pub fn to_json<T: serde::Serialize>(&self, value: &T) -> Result<serde_json::Value, String> {
        with_content(self.scope.clone(), || serde_json::to_value(value))
            .0
            .map_err(|error| error.to_string())
    }

    /// The game's settings, when they read whole.
    pub fn settings<G: Settings>(&self) -> Result<G, Unreadable> {
        let parsed = parse_settings(self.registry, self.folder.as_ref(), &self.scope);
        whole(parsed.row, parsed.errors, super::SETTINGS_FILE)
    }

    /// Every file `row` is kept in as the content file at `path`, by its path from the game
    /// folder: its fields, and the parts its type writes. The parts of the type the folder holds
    /// for it that it no longer writes are in `removed`.
    pub fn write<Row: ContentFile>(&self, path: &str, row: &Row) -> io::Result<WrittenFiles> {
        let loader = self.registry.loader_of::<Row>().ok_or_else(|| {
            io::Error::other(format!("no {} files in this game's registry", Row::TABLE))
        })?;
        let files = self.write_with(|writer| loader.write_row(row, path, writer))?;
        let written = loader.written_parts();
        let removed = self
            .listing
            .parts
            .get(path)
            .into_iter()
            .flatten()
            .filter(|part| written.iter().any(|spec| spec.matches(part)))
            .map(|part| format!("{path}/{part}"))
            .filter(|file| !files.contains_key(file))
            .collect();
        Ok(WrittenFiles { files, removed })
    }

    pub fn write_settings<G: Settings>(
        &self,
        settings: &G,
    ) -> io::Result<BTreeMap<String, Vec<u8>>> {
        let loader = self
            .registry
            .settings_loader()
            .ok_or_else(|| io::Error::other("no settings in this game's registry"))?;
        self.write_with(|writer| loader.write_value(settings, writer))
    }

    /// The paths every reference read here resolves among.
    pub fn scope(&self) -> &ContentScope {
        &self.scope
    }

    pub fn path_of<Row: ContentFile>(&self, id: ContentId<Row>) -> Option<&str> {
        self.scope.path_of(id)
    }

    pub fn id_of<Row: ContentFile>(&self, path: &str) -> Option<ContentId<Row>> {
        self.scope.id_of(path)
    }

    pub fn paths_of<Row: ContentFile>(&self) -> &[String] {
        self.scope.paths_of::<Row>()
    }

    fn write_with(
        &self,
        write: impl FnOnce(&mut FileWriter) -> io::Result<()>,
    ) -> io::Result<BTreeMap<String, Vec<u8>>> {
        let mut writer = FileWriter::in_memory();
        with_content(self.scope.clone(), || write(&mut writer)).0?;
        Ok(writer.into_files())
    }
}

fn whole<T: Any>(
    row: Option<Box<dyn Any + Send + Sync>>,
    errors: Vec<LoadError>,
    path: &str,
) -> Result<T, Unreadable> {
    if !errors.is_empty() {
        return Err(errors);
    }
    let Some(row) = row else {
        return Err(vec![LoadError {
            file: path.to_owned(),
            at: ErrorPlace::WholeFile,
            problem: ContentProblem::new(MISSING_FILE, "no such file", "a file to read"),
        }]);
    };
    Ok(*row
        .downcast::<T>()
        .expect("a file parsed by its own loader"))
}

fn missing(path: &str, table: &str) -> LoadError {
    LoadError {
        file: path.to_owned(),
        at: ErrorPlace::WholeFile,
        problem: ContentProblem::new(MISSING_FILE, "no such file", format!("a {table} file")),
    }
}

fn unknown_type(path: &str, table: &str) -> LoadError {
    LoadError {
        file: path.to_owned(),
        at: ErrorPlace::WholeFile,
        problem: ContentProblem::new(
            "unknown type",
            format!("a {table} file"),
            "a type this game registers",
        ),
    }
}
