use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, channel};
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher as _};

pub struct Watcher {
    root: PathBuf,
    _watcher: Option<RecommendedWatcher>,
    events: Mutex<Receiver<notify::Result<notify::Event>>>,
    pending: Vec<PathBuf>,
    quiet_since: Option<Instant>,
    lost: bool,
}

pub const QUIET: Duration = Duration::from_millis(500);

impl Watcher {
    pub fn on(root: &Path) -> Watcher {
        let (sender, events) = channel();
        let watcher = notify::recommended_watcher(move |event| {
            let _ = sender.send(event);
        })
        .ok()
        .and_then(|mut watcher| {
            watcher.watch(root, RecursiveMode::Recursive).ok()?;
            Some(watcher)
        });
        Watcher {
            root: root.to_path_buf(),
            _watcher: watcher,
            events: Mutex::new(events),
            pending: Vec::new(),
            quiet_since: None,
            lost: false,
        }
    }

    pub fn rescan(&mut self) {
        self.lost = true;
        self.quiet_since = Some(Instant::now());
    }

    pub fn poll(&mut self) -> Option<Option<Vec<String>>> {
        let events = self
            .events
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while let Ok(event) = events.try_recv() {
            match event {
                Ok(event) => {
                    if event.need_rescan() {
                        self.lost = true;
                    }
                    self.pending.extend(event.paths);
                }
                Err(_) => self.lost = true,
            }
            self.quiet_since = Some(Instant::now());
        }
        let quiet = self.quiet_since?;
        if quiet.elapsed() < QUIET {
            return None;
        }
        self.quiet_since = None;
        if self.lost {
            self.lost = false;
            self.pending.clear();
            return Some(None);
        }
        let mut paths: Vec<String> = self
            .pending
            .drain(..)
            .filter_map(|path| relative(&self.root, &path))
            .collect();
        paths.sort();
        paths.dedup();
        (!paths.is_empty()).then_some(Some(paths))
    }
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    let rest = path.strip_prefix(root).ok()?;
    let name = rest.file_name()?.to_str()?;
    if name.starts_with('.') || name.ends_with(".tmp") {
        return None;
    }
    Some(
        rest.components()
            .map(|part| part.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
    )
}
