use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use engine::core::content::{Content, FilesystemFolder, LoadReport};
use engine::systems::load_content;
use tempfile::TempDir;
use walkdir::WalkDir;

pub fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

pub fn load(folder: &Path) -> Result<Content, LoadReport> {
    load_content(
        Arc::new(FilesystemFolder(folder.to_path_buf())),
        "cargo test failed",
    )
}

pub struct TempFolder(TempDir);

impl TempFolder {
    pub fn of_template() -> TempFolder {
        let dir = tempfile::tempdir().expect("a temp folder");
        copy_dir(&repo().join("editor/templates/new_game"), dir.path());
        TempFolder(dir)
    }

    pub fn path(&self) -> &Path {
        self.0.path()
    }

    pub fn write(&self, file: &str, text: &str) {
        let path = self.path().join(file);
        std::fs::create_dir_all(path.parent().expect("a parent folder")).expect("folders");
        std::fs::write(path, text).expect("written");
    }

    pub fn remove(&self, file: &str) {
        std::fs::remove_file(self.path().join(file)).expect("removed");
    }

    pub fn append(&self, file: &str, bytes: &[u8]) {
        let mut opened = std::fs::OpenOptions::new()
            .append(true)
            .open(self.path().join(file))
            .expect("opened");
        opened.write_all(bytes).expect("appended");
    }

    pub fn edit(&self, file: &str, edit: impl FnOnce(&mut serde_json::Value)) {
        let path = self.path().join(file);
        let mut value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("read")).expect("json");
        edit(&mut value);
        let mut text = serde_json::to_string_pretty(&value).expect("json");
        text.push('\n');
        std::fs::write(path, text).expect("written");
    }
}

fn copy_dir(from: &Path, to: &Path) {
    for entry in WalkDir::new(from) {
        let entry = entry.expect("an entry");
        let target = to.join(entry.path().strip_prefix(from).expect("under the source"));
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(target).expect("a folder");
        } else {
            std::fs::copy(entry.path(), target).expect("copied");
        }
    }
}
