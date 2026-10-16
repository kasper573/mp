use std::path::Path;
use std::sync::Arc;

use engine::core::content::FilesystemFolder;
use engine::systems::load_content;

#[test]
fn every_template_loads() {
    let templates = Path::new(env!("CARGO_MANIFEST_DIR")).join("../editor/templates");
    let mut seen = 0;
    for entry in std::fs::read_dir(&templates).expect("templates") {
        let folder = entry.expect("entry").path();
        if !folder.is_dir() {
            continue;
        }
        seen += 1;
        let folder = Arc::new(FilesystemFolder(folder.clone()));
        if let Err(report) = load_content(folder, "cargo test failed") {
            panic!("{}: {report}", folder_name(&templates, &report.folder));
        }
    }
    assert!(seen > 0, "no templates under {}", templates.display());
}

fn folder_name(templates: &Path, folder: &str) -> String {
    Path::new(folder)
        .strip_prefix(templates)
        .map(|rest| rest.display().to_string())
        .unwrap_or_else(|_| folder.to_owned())
}
