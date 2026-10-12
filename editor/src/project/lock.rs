use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::user::UserFolder;

/// Keeps one editor writing a folder: a second one opens it read-only until the lock dies.
pub struct Lock {
    file: PathBuf,
}

const STALE_AFTER: Duration = Duration::from_secs(10 * 60);

impl Lock {
    pub fn take(user: &UserFolder, folder: &Path) -> Result<Lock, String> {
        let dir = user.locks_dir();
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join(format!("{}.lock", UserFolder::folder_key(folder)));
        if let Ok(text) = std::fs::read_to_string(&file)
            && let Some(holder) = Holder::parse(&text)
            && holder.alive()
        {
            return Err(format!(
                "another editor (process {}) has this folder open",
                holder.pid
            ));
        }
        let lock = Lock { file };
        lock.refresh();
        Ok(lock)
    }

    pub fn refresh(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = std::fs::write(&self.file, format!("{} {now}\n", std::process::id()));
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.file);
    }
}

struct Holder {
    pid: u32,
    since: u64,
}

impl Holder {
    fn parse(text: &str) -> Option<Holder> {
        let mut parts = text.split_whitespace();
        Some(Holder {
            pid: parts.next()?.parse().ok()?,
            since: parts.next()?.parse().ok()?,
        })
    }

    fn alive(&self) -> bool {
        if self.pid == std::process::id() {
            return false;
        }
        let proc_dir = Path::new("/proc").join(self.pid.to_string());
        if Path::new("/proc").exists() {
            return proc_dir.exists();
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(self.since) < STALE_AFTER.as_secs()
    }
}
