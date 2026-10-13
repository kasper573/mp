use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use game::core::content::{Content, FilesystemFolder, LoadReport};
use game::systems::load_content;

pub fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

pub fn load(folder: &Path) -> Result<Content, LoadReport> {
    load_content(
        Arc::new(FilesystemFolder(folder.to_path_buf())),
        "cargo test failed",
    )
}

/// A fresh copy of the new-game template under the system temp folder, deleted when dropped.
pub struct TempFolder(pub PathBuf);

impl TempFolder {
    pub fn of_template() -> TempFolder {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "rift-content-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&root);
        copy_dir(&repo().join("editor/templates/new_game"), &root);
        TempFolder(root)
    }

    pub fn write(&self, file: &str, text: &str) {
        let path = self.0.join(file);
        std::fs::create_dir_all(path.parent().expect("a parent folder")).expect("folders");
        std::fs::write(path, text).expect("written");
    }

    pub fn remove(&self, file: &str) {
        std::fs::remove_file(self.0.join(file)).expect("removed");
    }

    pub fn edit(&self, file: &str, edit: impl FnOnce(&mut serde_json::Value)) {
        let path = self.0.join(file);
        let mut value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("read")).expect("json");
        edit(&mut value);
        let mut text = serde_json::to_string_pretty(&value).expect("json");
        text.push('\n');
        std::fs::write(path, text).expect("written");
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).expect("folder");
    for entry in std::fs::read_dir(from).expect("read dir") {
        let entry = entry.expect("entry");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("type").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).expect("copied");
        }
    }
}
