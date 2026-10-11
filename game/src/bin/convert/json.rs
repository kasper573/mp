use std::fs;
use std::path::Path;

use serde::Serialize;

pub fn write_json(path: &Path, value: &impl Serialize) {
    let mut text = serde_json::to_string_pretty(value).expect("content serializes");
    text.push('\n');
    write_text(path, &text);
}

pub fn write_text(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the content folder is writable");
    }
    fs::write(path, text).unwrap_or_else(|error| panic!("writing {}: {error}", path.display()));
}

pub fn write_csv(path: &Path, header: Option<&str>, records: impl Iterator<Item = String>) {
    let mut text = String::new();
    if let Some(header) = header {
        text.push_str(header);
        text.push('\n');
    }
    for record in records {
        text.push_str(&record);
        text.push('\n');
    }
    write_text(path, &text);
}
