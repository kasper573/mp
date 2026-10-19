use std::collections::BTreeSet;

use engine::core::content::{FOLDER_FIELD, OWNER_FIELD, RowFolder, RowName, row_file};
use serde_json::Value;

use crate::project::{ContentEdit, ProjectFiles};

/// The folder a row is listed in, as its file says now, saved or not.
pub fn folder_of(files: &ProjectFiles, table: &str, key: &str) -> Option<RowFolder> {
    let folder = files
        .json(&row_file(table, key))?
        .get(FOLDER_FIELD)?
        .clone();
    serde_json::from_value(folder).ok()
}

/// Every folder the rows of `table` are listed in, and the folders holding those.
pub fn folders_of(files: &ProjectFiles, table: &str) -> BTreeSet<RowFolder> {
    let mut folders = BTreeSet::new();
    for key in files.keys_of(table) {
        let mut folder = folder_of(files, table, key);
        while let Some(at) = folder {
            folder = at.parent();
            folders.insert(at);
        }
    }
    folders
}

/// Lists `rows` in `folder`, or straight in their table when it is `None`.
pub fn move_rows(
    edit: &mut ContentEdit,
    files: &ProjectFiles,
    rows: &[RowName],
    folder: Option<&RowFolder>,
) {
    for row in rows {
        let file = row_file(&row.table, &row.key);
        if let Some(json) = edit.pending_json(files, &file) {
            edit.write_json(file, &with_folder(&json, folder));
        }
    }
}

/// Renames `from` to `to` in `table`, the folders inside it with it.
pub fn rename(
    edit: &mut ContentEdit,
    files: &ProjectFiles,
    table: &str,
    from: &RowFolder,
    to: &RowFolder,
) {
    regroup(edit, files, table, from, |rest| match rest {
        Some(rest) => to.join(rest).ok(),
        None => Some(to.clone()),
    });
}

/// Removes `folder` from `table`: what it held moves up into the folder holding it.
pub fn remove(edit: &mut ContentEdit, files: &ProjectFiles, table: &str, folder: &RowFolder) {
    let parent = folder.parent();
    regroup(edit, files, table, folder, |rest| match (&parent, rest) {
        (Some(parent), Some(rest)) => parent.join(rest).ok(),
        (None, Some(rest)) => RowFolder::try_from(rest.to_owned()).ok(),
        (Some(parent), None) => Some(parent.clone()),
        (None, None) => None,
    });
}

/// `row` listed in `folder`: the folder line follows the owner line, ahead of the row's fields.
pub fn with_folder(row: &Value, folder: Option<&RowFolder>) -> Value {
    let mut fields = serde_json::Map::new();
    if let Some(owner) = row.get(OWNER_FIELD) {
        fields.insert(OWNER_FIELD.to_owned(), owner.clone());
    }
    if let Some(folder) = folder {
        fields.insert(FOLDER_FIELD.to_owned(), Value::String(folder.to_string()));
    }
    for (name, value) in row.as_object().into_iter().flatten() {
        if name != OWNER_FIELD && name != FOLDER_FIELD {
            fields.insert(name.clone(), value.clone());
        }
    }
    Value::Object(fields)
}

/// Lists each row of `table` in `folder` or a folder inside it where `moved` says, given the rest
/// of its folder's path below `folder`.
fn regroup(
    edit: &mut ContentEdit,
    files: &ProjectFiles,
    table: &str,
    folder: &RowFolder,
    moved: impl Fn(Option<&str>) -> Option<RowFolder>,
) {
    let inside = format!("{folder}/");
    let rows: Vec<(String, Option<RowFolder>)> = files
        .keys_of(table)
        .filter_map(|key| {
            let at = folder_of(files, table, key)?;
            let rest = if at == *folder {
                None
            } else {
                Some(at.as_str().strip_prefix(&inside)?)
            };
            Some((key.to_owned(), moved(rest)))
        })
        .collect();
    for (key, to) in rows {
        move_rows(edit, files, &[RowName::new(table, key)], to.as_ref());
    }
}
