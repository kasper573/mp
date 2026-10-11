use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::load::{ContentFolder, FileHashes};
use super::table::Content;

/// What a client fetches first: the build, the content version and the two hashes that lead to
/// everything else.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub build: String,
    pub content_version: String,
    pub name: String,
    pub rows: FileStamp,
    pub index: FileStamp,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileStamp {
    pub hash: String,
    pub size: u64,
}

/// Every file under `assets/`, by path.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileIndex {
    pub files: Vec<IndexedFile>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndexedFile {
    pub path: String,
    pub hash: String,
    pub size: u64,
}

/// A loaded folder held in memory to be served: the manifest, and every file by its hash.
pub struct ServedContent {
    pub manifest: Manifest,
    files: HashMap<String, Arc<[u8]>>,
}

impl ServedContent {
    pub fn new(
        content: &Content,
        folder: &dyn ContentFolder,
        build: &str,
        name: &str,
    ) -> io::Result<ServedContent> {
        let hashes = content.built::<FileHashes>();
        let version = content.built::<super::ContentVersion>();
        let mut files: HashMap<String, Arc<[u8]>> = HashMap::new();
        let mut index = FileIndex { files: Vec::new() };
        let mut rows: Vec<(String, Vec<u8>)> = Vec::new();
        for (path, stamp) in &hashes.0 {
            let bytes = folder.read(path)?;
            if path.starts_with("assets/") {
                index.files.push(IndexedFile {
                    path: path.clone(),
                    hash: stamp.hash.clone(),
                    size: stamp.size,
                });
                files.insert(stamp.hash.clone(), Arc::from(bytes));
            } else {
                rows.push((path.clone(), bytes));
            }
        }
        let index = serde_json::to_vec(&index)?;
        let bundle = rows_bundle(&rows)?;
        let manifest = Manifest {
            build: build.to_owned(),
            content_version: version.0.clone(),
            name: name.to_owned(),
            rows: stamp_of(&bundle),
            index: stamp_of(&index),
        };
        files.insert(manifest.rows.hash.clone(), Arc::from(bundle));
        files.insert(manifest.index.hash.clone(), Arc::from(index));
        Ok(ServedContent { manifest, files })
    }

    pub fn file(&self, hash: &str) -> Option<Arc<[u8]>> {
        self.files.get(hash).cloned()
    }
}

/// `true` for exactly the hashes `GET /content/files/{hash}` accepts.
pub fn well_formed_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Unpacks a rows bundle into its files by folder-relative path.
pub fn unpack_rows(bundle: &[u8]) -> io::Result<Vec<(String, Vec<u8>)>> {
    use std::io::Read;
    let decoder = flate2::read::GzDecoder::new(bundle);
    let mut archive = tar::Archive::new(decoder);
    let mut files = Vec::new();
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_string_lossy().into_owned();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        files.push((path, bytes));
    }
    Ok(files)
}

fn stamp_of(bytes: &[u8]) -> FileStamp {
    FileStamp {
        hash: blake3::hash(bytes).to_hex().to_string(),
        size: bytes.len() as u64,
    }
}

/// A gzip tar that depends on nothing but the files: no timestamps, owners or platform bytes.
fn rows_bundle(rows: &[(String, Vec<u8>)]) -> io::Result<Vec<u8>> {
    let mut archive = tar::Builder::new(Vec::new());
    for (path, bytes) in rows {
        let mut header = tar::Header::new_ustar();
        header.set_path(path)?;
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_mtime(0);
        header.set_uid(0);
        header.set_gid(0);
        header.set_cksum();
        archive.append(&header, bytes.as_slice())?;
    }
    let tar = archive.into_inner()?;
    let mut encoder = flate2::GzBuilder::new()
        .mtime(0)
        .operating_system(255)
        .write(Vec::new(), flate2::Compression::default());
    encoder.write_all(&tar)?;
    encoder.finish()
}
