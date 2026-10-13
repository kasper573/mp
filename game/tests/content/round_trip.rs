use std::collections::BTreeSet;
use std::path::Path;

use game::core::content::write;
use game::systems::registry;

use crate::support::{TempFolder, load, repo};

#[test]
fn writing_the_shipped_folder_back_changes_no_bytes() {
    let folder = repo().join("content");
    let content = load(&folder).unwrap_or_else(|report| panic!("{report}"));
    let writer = write(&registry(), content, &folder).expect("written");

    assert_eq!(writer.written(), &[] as &[String], "rewritten files");
    assert_eq!(writer.kept(), rows_and_grids(&folder).len());
}

#[test]
fn a_folder_written_from_scratch_lists_every_row_and_grid() {
    let folder = repo().join("content");
    let content = load(&folder).unwrap_or_else(|report| panic!("{report}"));
    let fresh = TempFolder::of_template();
    let _ = std::fs::remove_dir_all(fresh.0.join("tables"));
    let _ = std::fs::remove_file(fresh.0.join("game.json"));

    let writer = write(&registry(), content, &fresh.0).expect("written");

    let written: BTreeSet<String> = writer.written().iter().cloned().collect();
    assert_eq!(written, rows_and_grids(&folder));
    for file in &written {
        assert_eq!(
            std::fs::read(fresh.0.join(file)).expect("fresh"),
            std::fs::read(folder.join(file)).expect("shipped"),
            "{file} differs"
        );
    }
}

fn rows_and_grids(folder: &Path) -> BTreeSet<String> {
    let mut files = BTreeSet::new();
    files.insert("game.json".to_owned());
    walk(&folder.join("tables"), "tables", &mut files);
    files
}

fn walk(dir: &Path, prefix: &str, into: &mut BTreeSet<String>) {
    for entry in std::fs::read_dir(dir).expect("read dir") {
        let entry = entry.expect("entry");
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = format!("{prefix}/{name}");
        if entry.file_type().expect("type").is_dir() {
            walk(&entry.path(), &path, into);
        } else {
            into.insert(path);
        }
    }
}
