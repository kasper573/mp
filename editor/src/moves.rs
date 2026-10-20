use std::collections::{BTreeMap, HashSet};

use engine::core::content::{FIXTURES_DIR, locate, name_of, numbered, parent_of, table_of};
use engine::systems::registry;
use serde_json::Value;

use crate::app::Editor;
use crate::project::files::{folder_entry, is_folder};
use crate::project::{ContentEdit, Project, ProjectFiles};
use crate::tabs::EditorTab;
use crate::usages::{ContentUsage, ContentUsages};
use crate::user::UserFolder;

/// A file, bundle, media file or folder going from one path to another.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PathMove {
    pub from: String,
    pub to: String,
}

impl PathMove {
    pub fn new(from: impl Into<String>, to: impl Into<String>) -> PathMove {
        PathMove {
            from: from.into(),
            to: to.into(),
        }
    }

    /// Where `path` lands when this moves: itself if it is what moves, or the same place inside
    /// it if it is inside.
    pub fn moved(&self, path: &str) -> Option<String> {
        if path == self.from {
            return Some(self.to.clone());
        }
        let rest = path.strip_prefix(&self.from)?.strip_prefix('/')?;
        Some(format!("{}/{rest}", self.to))
    }
}

/// What a move does to the folder: the edit, and how many references it rewrites in how many
/// files.
pub struct PlannedMove {
    pub edit: ContentEdit,
    pub rewritten: usize,
    pub files_rewritten: usize,
}

/// Why `path` stays where it is, if the engine finds it there: the fixtures folder, a fixture, or a
/// folder that holds one.
pub fn fixed_place(path: &str) -> Option<&'static str> {
    let registry = registry();
    if path == FIXTURES_DIR {
        return Some("the engine finds its fixtures and the game's settings in this folder");
    }
    if registry.is_fixture(path) {
        return Some("the engine finds this file at this path");
    }
    let inside = format!("{path}/");
    registry
        .fixture_paths()
        .any(|fixture| fixture.starts_with(&inside))
        .then_some("this folder holds fixtures the engine finds by their path")
}

/// The path a file or folder named `file` gets in `folder`: `file` itself when no neighbour has
/// its name, ignoring case, or else its name numbered " (1)", " (2)", the first that is free.
/// `leaving` names entries that move away in the same step, whose names are free.
pub fn free_path(files: &ProjectFiles, folder: &str, file: &str, leaving: &[String]) -> String {
    free_path_among(files, folder, file, leaving, &[])
}

/// `free_path`, with the paths `arriving` in the same step taken as well.
pub fn free_path_among(
    files: &ProjectFiles,
    folder: &str,
    file: &str,
    leaving: &[String],
    arriving: &[String],
) -> String {
    let mut taken = names_in(files, folder, leaving);
    taken.extend(
        arriving
            .iter()
            .filter(|path| parent_of(path) == folder)
            .map(|path| file_name(path).to_lowercase()),
    );
    let at = |file: &str| match folder {
        "" => file.to_owned(),
        folder => format!("{folder}/{file}"),
    };
    if !taken.contains(&file.to_lowercase()) {
        return at(file);
    }
    let (stem, rest) = file
        .split_once('.')
        .map_or((file, ""), |(stem, rest)| (stem, rest));
    let base = numbered(stem).map_or(stem, |(base, _)| base);
    let dot = if rest.is_empty() { "" } else { "." };
    (1..)
        .map(|n| format!("{base} ({n}){dot}{rest}"))
        .find(|candidate| !taken.contains(&candidate.to_lowercase()))
        .map(|candidate| at(&candidate))
        .expect("a free name")
}

/// Plans each move with every reference to what moves rewritten, as one edit labelled `label`.
pub fn plan(project: &Project, moves: &[PathMove], label: String) -> Result<PlannedMove, String> {
    for step in moves {
        if let Some(reason) = fixed_place(&step.from) {
            return Err(format!("{} stays: {reason}", step.from));
        }
        if step.to.starts_with(&format!("{}/", step.from)) {
            return Err(format!("{} can't go inside itself", step.from));
        }
    }
    let files = &project.files;
    let mut edit = ContentEdit::new(label);
    let named = named_inside(&project.usages, moves);
    let mut by_file: BTreeMap<&str, Vec<(&ContentUsage, String, &str)>> = BTreeMap::new();
    for (usage, from, to) in &named {
        by_file
            .entry(usage.file.as_str())
            .or_default()
            .push((usage, to.clone(), from.as_str()));
    }
    let files_rewritten = by_file.len();
    for (file, mut uses) in by_file {
        if !file.ends_with(".json") {
            for (_, to, from) in &uses {
                let table = table_of(from).unwrap_or_default();
                edit.rename_beside(files, file, table, from, to);
            }
            continue;
        }
        uses.sort_by(|a, b| b.0.pointer.cmp(&a.0.pointer));
        edit.update_json(files, file, |value| {
            for (usage, to, _) in &uses {
                rewrite(value, usage, &project.usages, file, to);
            }
            Some(())
        });
    }
    for step in moves {
        let entries: Vec<String> = files
            .entries()
            .filter(|entry| step.moved(entry.trim_end_matches('/')).is_some())
            .cloned()
            .collect();
        for entry in entries {
            let Some(bytes) = edit.pending_bytes(files, &entry) else {
                continue;
            };
            let moved = if is_folder(&entry) {
                folder_entry(&step.moved(entry.trim_end_matches('/')).expect("inside"))
            } else {
                step.moved(&entry).expect("inside")
            };
            edit.remove(entry);
            edit.write(moved, bytes);
        }
        keep_folder(files, &mut edit, parent_of(&step.from));
    }
    Ok(PlannedMove {
        edit,
        rewritten: named.len(),
        files_rewritten,
    })
}

/// Moves and renames as one step, and points every open tab and the selection at where things
/// went. Says what was rewritten.
pub fn apply(editor: &mut Editor, moves: &[PathMove], label: String) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let planned = plan(project, moves, label.clone())?;
    let (rewritten, files) = (planned.rewritten, planned.files_rewritten);
    editor.try_apply(planned.edit)?;
    follow(editor, moves);
    let mut said = label;
    if rewritten > 0 {
        said.push_str(&format!(
            ": {rewritten} reference{} in {files} file{} rewritten",
            plural(rewritten),
            plural(files)
        ));
    }
    editor.toast(said);
    Ok(())
}

/// Points open tabs, the selection and open folders at where `moves` took what they show.
pub fn follow(editor: &mut Editor, moves: &[PathMove]) {
    let moved = |path: &str| moves.iter().find_map(|step| step.moved(path));
    editor.rename_tabs(|tab| match tab {
        EditorTab::Script(owner) => {
            moved(&owner.key).map(|to| EditorTab::Script(crate::views::script::ScriptRow::new(&to)))
        }
        EditorTab::Asset { path } => moved(path).map(|path| EditorTab::Asset { path }),
        EditorTab::Rows { table, keys } => {
            keys.iter()
                .any(|key| moved(key).is_some())
                .then(|| EditorTab::Rows {
                    table: table.clone(),
                    keys: keys
                        .iter()
                        .map(|key| moved(key).unwrap_or_else(|| key.clone()))
                        .collect(),
                })
        }
        other => {
            let (table, key) = other.row()?;
            moved(&key).map(|to| EditorTab::for_row(&table, &to))
        }
    });
    for key in &mut editor.selection.keys {
        if let Some(to) = moved(key) {
            *key = to;
        }
    }
    editor.imports.moved(&moved);
    if let Some(project) = &editor.project {
        let folder = UserFolder::folder_key(&project.root);
        if let Some(view) = editor.settings.content_trees.get_mut(&folder) {
            view.moved(&moved);
        }
    }
}

/// The name a moved or renamed file or folder takes in `folder`, as `free_path` gives it.
pub fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// `path` renamed to `name`, the name before its first dot, keeping its type.
pub fn renamed(path: &str, name: &str) -> String {
    let file = file_name(path);
    let rest = file.strip_prefix(name_of(path)).unwrap_or("");
    match parent_of(path) {
        "" => format!("{name}{rest}"),
        folder => format!("{folder}/{name}{rest}"),
    }
}

/// Every reference to a path that moves, with that path and where it lands.
fn named_inside<'u>(
    usages: &'u ContentUsages,
    moves: &[PathMove],
) -> Vec<(&'u ContentUsage, String, String)> {
    let mut named = Vec::new();
    for (path, uses) in usages.content().chain(usages.media()) {
        if let Some(to) = moves.iter().find_map(|step| step.moved(path)) {
            named.extend(
                uses.iter()
                    .map(|usage| (usage, path.to_owned(), to.clone())),
            );
        }
    }
    named
}

/// Keeps `folder` once what moves leaves it, as a file manager does.
pub fn keep_folder(files: &ProjectFiles, edit: &mut ContentEdit, folder: &str) {
    if folder.is_empty() {
        return;
    }
    let kept = folder_entry(folder);
    let still_holds = files
        .paths_under(&kept)
        .any(|entry| edit.pending_bytes(files, entry).is_some());
    let written = edit
        .changes
        .iter()
        .any(|change| change.bytes.is_some() && change.file.starts_with(&kept));
    if !still_holds && !written {
        edit.write(kept, Default::default());
    }
}

fn names_in(files: &ProjectFiles, folder: &str, leaving: &[String]) -> HashSet<String> {
    let prefix = match folder {
        "" => String::new(),
        folder => folder_entry(folder),
    };
    files
        .paths_under(&prefix)
        .filter(|entry| {
            !leaving
                .iter()
                .any(|gone| *entry == gone || entry.starts_with(&format!("{gone}/")))
        })
        .filter_map(|entry| entry[prefix.len()..].split('/').next())
        .filter(|name| !name.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// Writes `to` where the use names what moved: the value at its pointer, or the key it is.
pub fn rewrite(
    value: &mut Value,
    usage: &ContentUsage,
    usages: &ContentUsages,
    file: &str,
    to: &str,
) {
    let pointer = usage.pointer.as_str();
    let is_key = usages
        .in_file(file)
        .iter()
        .any(|reference| reference.pointer == pointer && reference.key);
    if is_key {
        let (parent, name) = split_pointer(pointer);
        if let Some(map) = value.pointer_mut(parent).and_then(Value::as_object_mut)
            && let Some(entry) = map.remove(&name)
        {
            map.insert(to.to_owned(), entry);
        }
    } else if let Some(slot) = value.pointer_mut(pointer) {
        *slot = Value::String(to.to_owned());
    }
}

fn split_pointer(pointer: &str) -> (&str, String) {
    let cut = pointer.rfind('/').unwrap_or(0);
    let name = locate::unescape(&pointer[cut + 1..]);
    (&pointer[..cut], name)
}

fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}
