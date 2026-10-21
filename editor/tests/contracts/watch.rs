use std::time::{Duration, Instant};

use editor::project::watch::{FolderChange, FolderWatcher, QUIET};

/// What the watcher says once the folder has kept quiet past [`QUIET`].
fn settled(watcher: &mut FolderWatcher) -> Option<FolderChange> {
    let until = Instant::now() + QUIET * 3;
    while Instant::now() < until {
        if let Some(change) = watcher.poll() {
            return Some(change);
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    None
}

#[test]
fn reading_a_watched_folder_is_no_change_and_writing_one_is() {
    let folder = tempfile::tempdir().expect("a folder");
    let file = folder.path().join("cap.item.json");
    std::fs::write(&file, b"{}").expect("written");
    let mut watcher = FolderWatcher::on(folder.path());

    std::fs::read(&file).expect("read");
    std::fs::read_dir(folder.path())
        .expect("listed")
        .for_each(drop);
    assert!(settled(&mut watcher).is_none(), "reading changed nothing");

    std::fs::write(&file, b"{ \"name\": \"Cap\" }").expect("rewritten");
    match settled(&mut watcher) {
        Some(FolderChange::Files(files)) => assert_eq!(files, ["cap.item.json"]),
        Some(FolderChange::Unknown) => panic!("the watcher lost track"),
        None => panic!("a write is a change"),
    }
}
