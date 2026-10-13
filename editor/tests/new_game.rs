use std::path::PathBuf;

use editor::templates;

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("rift-new-game-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

fn game_name(folder: &std::path::Path) -> String {
    let text = std::fs::read_to_string(folder.join("game.json")).expect("game.json");
    let game: serde_json::Value = serde_json::from_str(&text).expect("json");
    game["name"].as_str().expect("a name").to_owned()
}

#[test]
fn new_game_writes_the_built_in_template_under_the_given_name() {
    let templates = templates::list();
    let first = templates.first().expect("a built-in template");
    assert_eq!(
        first.key, "new_game",
        "New Game comes first and is preselected"
    );
    assert!(!first.areas.is_empty());
    let folder = temp("fresh");
    templates::new_game("new_game", "Saltmarsh", &folder).expect("writes");
    assert_eq!(game_name(&folder), "Saltmarsh");
    assert!(folder.join("tables").is_dir());
    assert!(folder.join("assets").is_dir());
    let written = walk(&folder).len();
    assert_eq!(written, first.files, "every embedded file is written out");
    assert!(
        !folder.parent().unwrap().join(".fresh.new-game").exists(),
        "the hidden staging folder is renamed into place"
    );
    let loaded = game::systems::load_content(
        std::sync::Arc::new(game::core::content::FilesystemFolder(folder.clone())),
        "cargo test",
    );
    assert!(loaded.is_ok(), "the written game loads with this build");
}

#[test]
fn every_built_in_template_carries_the_content_version_of_this_build() {
    let version = game::systems::registry().version().0;
    for template in templates::list() {
        let folder = temp(&format!("version-{}", template.key));
        templates::new_game(&template.key, "Saltmarsh", &folder).expect("writes");
        let text = std::fs::read_to_string(folder.join("game.json")).expect("game.json");
        let game: serde_json::Value = serde_json::from_str(&text).expect("json");
        assert_eq!(
            game["content_version"].as_str(),
            Some(version.as_str()),
            "the {} template",
            template.key
        );
    }
}

#[test]
fn a_folder_that_is_not_empty_is_refused_and_left_alone() {
    let folder = temp("taken");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("notes.txt"), "mine").unwrap();
    let refused = templates::new_game("new_game", "Saltmarsh", &folder).unwrap_err();
    assert!(refused.contains("not empty"), "{refused}");
    assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 1);
    let unknown =
        templates::new_game("no_such_template", "Saltmarsh", &temp("unknown")).unwrap_err();
    assert!(unknown.contains("no built-in template"), "{unknown}");
}

#[test]
fn new_game_from_a_game_copies_only_what_the_loader_reads() {
    let source = temp("source");
    templates::new_game("new_game", "Tide Hollow", &source).expect("a game to copy");
    std::fs::write(source.join("README.md"), "not content").unwrap();
    std::fs::create_dir_all(source.join("art")).unwrap();
    std::fs::write(source.join("art/sketch.png"), b"\x89PNG").unwrap();
    let copy = temp("copy");
    templates::new_game_from(&source, "Coral Bay", &copy).expect("copies");
    assert_eq!(game_name(&copy), "Coral Bay");
    assert_eq!(
        game_name(&source),
        "Tide Hollow",
        "the source keeps its name"
    );
    assert!(!copy.join("README.md").exists());
    assert!(!copy.join("art").exists());
    let mut expected = walk(&source);
    expected.retain(|path| !path.starts_with("README.md") && !path.starts_with("art/"));
    assert_eq!(walk(&copy), expected);
    let missing = temp("missing-source");
    let refused = templates::new_game_from(&missing, "Nowhere", &temp("nowhere")).unwrap_err();
    assert!(refused.contains("No game.json"), "{refused}");
}

fn walk(folder: &std::path::Path) -> Vec<String> {
    fn visit(root: &std::path::Path, dir: &std::path::Path, out: &mut Vec<String>) {
        for entry in std::fs::read_dir(dir).expect("a folder") {
            let path = entry.expect("an entry").path();
            if path.is_dir() {
                visit(root, &path, out);
            } else {
                out.push(
                    path.strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let mut out = Vec::new();
    visit(folder, folder, &mut out);
    out.sort();
    out
}
