use std::io;
use std::path::PathBuf;
use std::sync::Arc;

use bevy::asset::io::memory::{Dir, MemoryAssetReader};
use bevy::asset::io::{AssetSourceBuilder, ErasedAssetReader};
use game::core::content::{Content, ContentFolder, FolderEntry};
use include_dir::{Dir as Embedded, include_dir};

static CONTENT: Embedded<'static> = include_dir!("$CARGO_MANIFEST_DIR/../content");

pub fn content() -> Content {
    game::systems::load_content(Arc::new(EmbeddedFolder), "the client did not start")
        .unwrap_or_else(|report| panic!("{report}"))
}

pub fn bevy_source() -> AssetSourceBuilder {
    let root = Dir::new(PathBuf::new());
    fill(&root, &CONTENT);
    AssetSourceBuilder::new(move || {
        Box::new(MemoryAssetReader { root: root.clone() }) as Box<dyn ErasedAssetReader>
    })
}

struct EmbeddedFolder;

impl ContentFolder for EmbeddedFolder {
    fn name(&self) -> String {
        "the embedded content".to_owned()
    }

    fn entries(&self, dir: &str) -> Vec<FolderEntry> {
        let listed = if dir.is_empty() {
            Some(&CONTENT)
        } else {
            CONTENT.get_dir(dir)
        };
        let Some(listed) = listed else {
            return Vec::new();
        };
        listed
            .entries()
            .iter()
            .filter_map(|entry| {
                let name = entry.path().file_name()?.to_str()?.to_owned();
                Some(FolderEntry {
                    name,
                    dir: entry.as_dir().is_some(),
                })
            })
            .collect()
    }

    fn read(&self, file: &str) -> io::Result<Vec<u8>> {
        CONTENT
            .get_file(file)
            .map(|file| file.contents().to_vec())
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("missing {file}")))
    }
}

fn fill(dir: &Dir, embedded: &'static Embedded<'static>) {
    for file in embedded.files() {
        dir.insert_asset(file.path(), file.contents());
    }
    for sub in embedded.dirs() {
        fill(dir, sub);
    }
}
