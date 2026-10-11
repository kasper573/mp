use std::path::Path;

use game::core::content::{Content, ContentRow};
use serde::Serialize;

pub fn write_table<Row: ContentRow + Serialize>(root: &Path, content: &Content) {
    for (id, row) in content.table::<Row>().iter() {
        write_row(root, Row::TABLE, id.key(content), row);
    }
}

pub fn write_row(root: &Path, table: &str, key: &str, row: &impl Serialize) {
    super::json::write_json(
        &root.join("tables").join(table).join(format!("{key}.json")),
        row,
    );
}
