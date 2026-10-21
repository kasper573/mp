use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use engine::core::content::{Content, ContentFile, ContentId, FolderReader, Unreadable};
use engine::systems::{self, GameSettings};

use super::files::ProjectFiles;

/// The project's files read as the types the game reads them as, each read once per revision of
/// the files and only when asked for: everything the editor knows of a file's fields comes from
/// its type, so a field the game no longer has is one the editor can no longer name.
#[derive(Default)]
pub(super) struct TypedFiles {
    at: Mutex<Option<Typed>>,
}

struct Typed {
    revision: u64,
    reader: Arc<FolderReader>,
    read: HashMap<(TypeId, String), Read>,
}

type Read = Result<Arc<dyn Any + Send + Sync>, Arc<Unreadable>>;

impl TypedFiles {
    pub(super) fn reader(&self, files: &ProjectFiles, name: &str) -> Arc<FolderReader> {
        self.with(files, name, |typed| typed.reader.clone())
    }

    pub(super) fn read<Row: ContentFile>(
        &self,
        files: &ProjectFiles,
        name: &str,
        path: &str,
    ) -> Result<Arc<Row>, Arc<Unreadable>> {
        self.read_as(files, name, path, |reader| reader.read::<Row>(path))
    }

    pub(super) fn settings(
        &self,
        files: &ProjectFiles,
        name: &str,
    ) -> Result<Arc<GameSettings>, Arc<Unreadable>> {
        self.read_as(files, name, "", FolderReader::settings::<GameSettings>)
    }

    fn read_as<T: Any + Send + Sync>(
        &self,
        files: &ProjectFiles,
        name: &str,
        path: &str,
        read: impl FnOnce(&FolderReader) -> Result<T, Unreadable>,
    ) -> Result<Arc<T>, Arc<Unreadable>> {
        self.with(files, name, |typed| {
            let key = (TypeId::of::<T>(), path.to_owned());
            let reader = typed.reader.clone();
            typed
                .read
                .entry(key)
                .or_insert_with(|| match read(&reader) {
                    Ok(row) => Ok(Arc::new(row)),
                    Err(errors) => Err(Arc::new(errors)),
                })
                .clone()
                .map(|row| row.downcast::<T>().expect("read as its own type"))
        })
    }

    fn with<R>(&self, files: &ProjectFiles, name: &str, f: impl FnOnce(&mut Typed) -> R) -> R {
        let mut at = self
            .at
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let typed = match at.as_mut() {
            Some(typed) if typed.revision == files.revision() => typed,
            _ => at.insert(Typed {
                revision: files.revision(),
                reader: Arc::new(FolderReader::new(
                    systems::registry(),
                    Arc::new(files.folder(name)),
                )),
                read: HashMap::new(),
            }),
        };
        f(typed)
    }
}

/// Where the ids a value holds lead, by the paths of the scope they were read in: the files as they
/// stand now for what the editor reads of them, the content loaded last for what it built. An id
/// means a file only among the paths it was read against.
pub trait IdPaths {
    fn path_of<Row: ContentFile>(&self, id: ContentId<Row>) -> Option<&str>;
}

impl IdPaths for FolderReader {
    fn path_of<Row: ContentFile>(&self, id: ContentId<Row>) -> Option<&str> {
        FolderReader::path_of(self, id)
    }
}

impl IdPaths for Content {
    fn path_of<Row: ContentFile>(&self, id: ContentId<Row>) -> Option<&str> {
        self.table::<Row>()
            .paths()
            .get(id.index())
            .map(String::as_str)
    }
}
