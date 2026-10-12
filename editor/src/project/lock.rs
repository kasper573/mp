use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};

use crate::user::UserFolder;

pub struct Lock {
    file: File,
    path: PathBuf,
}

impl Lock {
    pub fn take(user: &UserFolder, folder: &Path) -> Result<Lock, String> {
        let dir = user.locks_dir();
        std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let path = dir.join(format!("{}.lock", UserFolder::folder_key(folder)));
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .map_err(|error| error.to_string())?;
        match file.try_lock() {
            Ok(()) => Ok(Lock { file, path }),
            Err(TryLockError::WouldBlock) => Err("another editor has this folder open".to_owned()),
            Err(TryLockError::Error(error)) => Err(error.to_string()),
        }
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
        let _ = std::fs::remove_file(&self.path);
    }
}
