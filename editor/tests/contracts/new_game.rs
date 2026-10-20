use std::path::Path;

use editor::templates;
use engine::core::content::SETTINGS_FILE;
use tempfile::TempDir;
use walkdir::WalkDir;

use crate::support::{game_folder, game_name};

#[test]
fn new_game_from_a_game_copies_its_whole_folder_but_what_is_hidden() {
    let scratch = scratch();
    let source = game_folder(scratch.path().join("source"));
    std::fs::write(source.join("plans.md"), "a note").unwrap();
    std::fs::create_dir_all(source.join("art")).unwrap();
    std::fs::write(source.join("art/sketch.png"), testkit::png(2, 2)).unwrap();
    std::fs::create_dir_all(source.join(".git")).unwrap();
    std::fs::write(source.join(".git/HEAD"), "ref").unwrap();
    let copy = scratch.path().join("copy");

    templates::new_game_from(&source, "Coral Bay", &copy).expect("copies");

    assert_eq!(game_name(&copy), "Coral Bay");
    assert_eq!(game_name(&source), "Test", "the source keeps its name");
    let mut expected = walk(&source);
    expected.retain(|path| !path.starts_with(".git/"));
    assert!(expected.contains(&"plans.md".to_owned()));
    assert!(expected.contains(&"art/sketch.png".to_owned()));
    assert_eq!(walk(&copy), expected);
    assert!(
        !scratch.path().join(".copy.new-game").exists(),
        "the hidden staging folder is renamed into place"
    );
    let loaded = engine::systems::load_content(
        std::sync::Arc::new(engine::core::content::FilesystemFolder(copy)),
        "cargo test failed",
    );
    if let Err(report) = loaded {
        panic!("the copy loads with this build:\n{report}");
    }
}

#[test]
fn a_folder_that_is_not_empty_is_refused_and_left_alone() {
    let scratch = scratch();
    let source = game_folder(scratch.path().join("source"));
    let folder = scratch.path().join("taken");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("notes.txt"), "mine").unwrap();

    let refused = templates::new_game_from(&source, "Saltmarsh", &folder).unwrap_err();

    assert!(refused.contains("not empty"), "{refused}");
    assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 1);
}

#[test]
fn a_source_or_template_that_is_not_there_is_refused() {
    let scratch = scratch();

    let missing = templates::new_game_from(
        &scratch.path().join("missing-source"),
        "Nowhere",
        &scratch.path().join("nowhere"),
    )
    .unwrap_err();
    let unknown = templates::new_game(
        "no_such_template",
        "Saltmarsh",
        &scratch.path().join("unknown"),
    )
    .unwrap_err();

    assert!(
        missing.contains(&format!("No {SETTINGS_FILE}")),
        "{missing}"
    );
    assert!(unknown.contains("no built-in template"), "{unknown}");
    assert!(!scratch.path().join("nowhere").exists());
    assert!(!scratch.path().join("unknown").exists());
}

fn scratch() -> TempDir {
    tempfile::tempdir().expect("a scratch folder")
}

fn walk(folder: &Path) -> Vec<String> {
    let mut files: Vec<String> = WalkDir::new(folder)
        .into_iter()
        .map(|entry| entry.expect("an entry"))
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| {
            entry
                .path()
                .strip_prefix(folder)
                .expect("under the folder")
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect();
    files.sort();
    files
}
