use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{self, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bevy::tasks::futures_lite::future;
use bevy_ecs::prelude::Resource;
use futures_timer::Delay;
use futures_util::StreamExt;
use futures_util::stream;
use serde::{Deserialize, Serialize};

use super::load::{ContentFolder, FileHashes, MemoryFolder};
use super::store::ContentStore;
use super::table::Content;
use crate::core::math::Rng;
use crate::core::platform::{FetchFailure, LocalFuture};

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

pub trait ContentSource {
    fn get(&self, path: &str) -> LocalFuture<Result<Vec<u8>, FetchFailure>>;
}

#[derive(Clone, Copy, Debug)]
pub struct SyncPolicy {
    pub timeout: Duration,
    pub tries: u32,
    pub first_backoff: Duration,
    pub longest_backoff: Duration,
    pub at_once: usize,
    pub restarts: u32,
}

impl Default for SyncPolicy {
    fn default() -> SyncPolicy {
        SyncPolicy {
            timeout: Duration::from_secs(30),
            tries: 5,
            first_backoff: Duration::from_millis(500),
            longest_backoff: Duration::from_secs(8),
            at_once: 16,
            restarts: 5,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct SyncProgress {
    pub name: Option<String>,
    pub phase: SyncPhase,
    pub read: Counted,
    pub fetched: Counted,
    pub files_in_index: usize,
    pub rows_changed: bool,
    pub retrying: usize,
    pub memory_only: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Counted {
    pub bytes: u64,
    pub bytes_total: u64,
    pub files: usize,
    pub files_total: usize,
}

impl Counted {
    fn of(files: &[IndexedFile]) -> Counted {
        Counted {
            bytes: 0,
            bytes_total: files.iter().map(|file| file.size).sum(),
            files: 0,
            files_total: files.len(),
        }
    }

    fn advance(&mut self, size: u64) {
        self.files += 1;
        self.bytes += size;
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub enum SyncPhase {
    #[default]
    Checking,
    Reading,
    Downloading {
        changes: bool,
    },
    Done,
}

#[derive(Clone, Default)]
pub struct SyncStatus(Arc<Mutex<SyncProgress>>);

impl SyncStatus {
    pub fn latest(&self) -> SyncProgress {
        self.0.lock().expect("sync status lock").clone()
    }

    fn update(&self, change: impl FnOnce(&mut SyncProgress)) {
        change(&mut self.0.lock().expect("sync status lock"));
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SyncError {
    OtherBuild { server: String },
    Failed(String),
}

#[derive(Resource)]
pub struct SyncedContent {
    pub manifest: Manifest,
    pub index: FileIndex,
    pub rows: Vec<(String, Arc<[u8]>)>,
    pub assets: HashMap<String, Arc<[u8]>>,
    pub memory_only: bool,
}

impl SyncedContent {
    pub fn folder(&self) -> MemoryFolder {
        let files: BTreeMap<String, Arc<[u8]>> = self
            .rows
            .iter()
            .map(|(path, bytes)| (path, bytes))
            .chain(self.assets.iter())
            .map(|(path, bytes)| (path.clone(), bytes.clone()))
            .collect();
        MemoryFolder {
            name: format!("the synced content of {}", self.manifest.name),
            files,
        }
    }

    pub fn same_as(&self, other: &SyncedContent) -> bool {
        self.manifest.rows == other.manifest.rows && self.manifest.index == other.manifest.index
    }

    pub fn changed_assets(&self, before: &SyncedContent) -> Vec<String> {
        let old: HashMap<&str, &str> = before
            .index
            .files
            .iter()
            .map(|file| (file.path.as_str(), file.hash.as_str()))
            .collect();
        self.index
            .files
            .iter()
            .filter(|file| old.get(file.path.as_str()) != Some(&file.hash.as_str()))
            .map(|file| file.path.clone())
            .collect()
    }
}

pub async fn sync(
    source: &dyn ContentSource,
    store: &dyn ContentStore,
    build: &str,
    policy: SyncPolicy,
    status: SyncStatus,
) -> Result<SyncedContent, SyncError> {
    let run = Run {
        source,
        store,
        policy,
        status,
        rng: RefCell::new(Rng::from_entropy()),
        memory_only: Cell::new(false),
    };
    let mut restarts = 0;
    loop {
        match run.attempt(build).await {
            Ok(synced) => return Ok(synced),
            Err(Attempt::Restart) if restarts < policy.restarts => restarts += 1,
            Err(Attempt::Restart) => {
                return Err(SyncError::Failed(
                    "the content kept changing while it downloaded".to_owned(),
                ));
            }
            Err(Attempt::OtherBuild(server)) => return Err(SyncError::OtherBuild { server }),
            Err(Attempt::Failed(reason)) => return Err(SyncError::Failed(reason)),
        }
    }
}

pub fn well_formed_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

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

struct Run<'a> {
    source: &'a dyn ContentSource,
    store: &'a dyn ContentStore,
    policy: SyncPolicy,
    status: SyncStatus,
    rng: RefCell<Rng>,
    memory_only: Cell<bool>,
}

enum Attempt {
    Restart,
    OtherBuild(String),
    Failed(String),
}

type Fetched = Result<(String, Arc<[u8]>), Attempt>;

impl Run<'_> {
    async fn attempt(&self, build: &str) -> Result<SyncedContent, Attempt> {
        self.status.update(|progress| {
            *progress = SyncProgress {
                memory_only: progress.memory_only,
                ..SyncProgress::default()
            }
        });
        let manifest = self.fetch_with_retries("/content/manifest", None).await?;
        let manifest: Manifest = serde_json::from_slice(&manifest)
            .map_err(|error| Attempt::Failed(format!("the manifest did not parse: {error}")))?;
        self.status
            .update(|progress| progress.name = Some(manifest.name.clone()));
        if manifest.build != build {
            return Err(Attempt::OtherBuild(manifest.build));
        }
        let stored: HashSet<String> = self.store.list().await.into_iter().collect();
        let index = self.obtain(&manifest.index.hash, &stored).await?;
        let index: FileIndex = serde_json::from_slice(&index)
            .map_err(|error| Attempt::Failed(format!("the file index did not parse: {error}")))?;
        let bundle = self.obtain(&manifest.rows.hash, &stored).await?;
        let rows: Vec<(String, Arc<[u8]>)> = unpack_rows(&bundle)
            .map_err(|error| Attempt::Failed(format!("the rows bundle did not unpack: {error}")))?
            .into_iter()
            .map(|(path, bytes)| (path, Arc::from(bytes)))
            .collect();

        let (kept, mut missing): (Vec<IndexedFile>, Vec<IndexedFile>) = index
            .files
            .iter()
            .cloned()
            .partition(|file| stored.contains(&file.hash));
        self.status.update(|progress| {
            progress.phase = SyncPhase::Reading;
            progress.files_in_index = index.files.len();
            progress.read = Counted::of(&kept);
        });
        let mut assets: HashMap<String, Arc<[u8]>> = HashMap::new();
        let mut reads = stream::iter(kept)
            .map(|file| async move { (self.read_verified(&file.hash).await, file) })
            .buffer_unordered(self.policy.at_once);
        while let Some((read, file)) = reads.next().await {
            match read {
                Some(bytes) => {
                    self.status
                        .update(|progress| progress.read.advance(file.size));
                    assets.insert(file.path, bytes);
                }
                None => missing.push(file),
            }
        }
        drop(reads);

        self.status.update(|progress| {
            progress.phase = SyncPhase::Downloading {
                changes: !stored.is_empty(),
            };
            progress.rows_changed = !stored.is_empty() && !stored.contains(&manifest.rows.hash);
            progress.fetched = Counted::of(&missing);
        });
        let mut downloads = stream::iter(missing)
            .map(|file| async move {
                let bytes = self.fetch_file(&file.hash).await?;
                self.status
                    .update(|progress| progress.fetched.advance(file.size));
                Ok((file.path, bytes)) as Fetched
            })
            .buffer_unordered(self.policy.at_once);
        while let Some(fetched) = downloads.next().await {
            let (path, bytes) = fetched?;
            assets.insert(path, bytes);
        }
        drop(downloads);

        let keep: HashSet<&str> = index
            .files
            .iter()
            .map(|file| file.hash.as_str())
            .chain([manifest.index.hash.as_str(), manifest.rows.hash.as_str()])
            .collect();
        for hash in &stored {
            if !keep.contains(hash.as_str()) {
                self.store.remove(hash).await;
            }
        }
        self.status
            .update(|progress| progress.phase = SyncPhase::Done);
        Ok(SyncedContent {
            manifest,
            index,
            rows,
            assets,
            memory_only: self.memory_only.get(),
        })
    }

    async fn obtain(&self, hash: &str, stored: &HashSet<String>) -> Result<Arc<[u8]>, Attempt> {
        if stored.contains(hash)
            && let Some(bytes) = self.read_verified(hash).await
        {
            return Ok(bytes);
        }
        self.fetch_file(hash).await
    }

    async fn read_verified(&self, hash: &str) -> Option<Arc<[u8]>> {
        self.store
            .read(hash)
            .await
            .filter(|bytes| blake3::hash(bytes).to_hex().as_str() == hash)
            .map(Arc::from)
    }

    async fn fetch_file(&self, hash: &str) -> Result<Arc<[u8]>, Attempt> {
        let bytes: Arc<[u8]> = Arc::from(
            self.fetch_with_retries(&format!("/content/files/{hash}"), Some(hash))
                .await?,
        );
        if !self.memory_only.get() && self.store.write(hash, bytes.clone()).await.is_err() {
            self.memory_only.set(true);
            self.status.update(|progress| progress.memory_only = true);
        }
        Ok(bytes)
    }

    async fn fetch_with_retries(
        &self,
        path: &str,
        expected_hash: Option<&str>,
    ) -> Result<Vec<u8>, Attempt> {
        let mut failures = 0;
        loop {
            let timeout = async {
                Delay::new(self.policy.timeout).await;
                Err(FetchFailure::Transport("timed out".to_owned()))
            };
            let failed = match future::or(self.source.get(path), timeout).await {
                Ok(bytes) => match expected_hash {
                    Some(hash) if blake3::hash(&bytes).to_hex().as_str() != hash => {
                        "a corrupt file arrived".to_owned()
                    }
                    _ => return Ok(bytes),
                },
                Err(FetchFailure::Status { status: 404, .. }) if expected_hash.is_some() => {
                    return Err(Attempt::Restart);
                }
                Err(failure) => failure.to_string(),
            };
            failures += 1;
            if failures >= self.policy.tries {
                return Err(Attempt::Failed(format!("{path}: {failed}")));
            }
            self.status.update(|progress| progress.retrying += 1);
            Delay::new(self.backoff(failures)).await;
            self.status.update(|progress| progress.retrying -= 1);
        }
    }

    fn backoff(&self, failures: u32) -> Duration {
        let doubled = self.policy.first_backoff * 2u32.saturating_pow(failures - 1);
        let base = doubled.min(self.policy.longest_backoff);
        let jitter = 0.5 + self.rng.borrow_mut().rand_float();
        base.mul_f32(jitter)
    }
}
