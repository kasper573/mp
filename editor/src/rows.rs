use std::collections::{BTreeMap, HashSet};

use egui::Ui;
use engine::core::assets::AssetKind;
use engine::core::content::files::NAME_RULE;
use engine::core::content::{
    ContentFile, ModuleRule, NOTE_EXTENSION, parent_of, table_of, valid_name,
};
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::scene::SCENE_FILE;
use engine::systems::registry;
use serde_json::Value;

use crate::app::{DeleteDialog, Editor, ModalDialog};
use crate::make;
use crate::moves::{self, PathMove, fixed_place, free_path, free_path_among};
use crate::project::files::{FolderIndex, content_holding, folder_entry};
use crate::project::{ContentEdit, FileBytes, Project, ProjectFiles};
use crate::scene_graph;
use crate::schema::{self, SchemaShapes};
use crate::tabs::shown_path;
use crate::tabs::{EditorTab, file_title};
use crate::ui::{theme, widgets};
use crate::usages::ContentUsage;
use crate::views::area::{self as area, placement};

/// What deleted files leave behind: the uses of one kind of a deleted file, and what becomes of
/// them.
#[derive(Clone, Debug)]
pub struct UsageGroup {
    /// The type of the deleted files the group's uses name, or `MEDIA`.
    pub target: String,
    pub table: String,
    pub kind: String,
    pub usages: Vec<ContentUsage>,
    pub removable: bool,
    pub whole_modules: bool,
    pub decision: UsageDecision,
}

/// The target of uses that name media rather than a content file.
pub const MEDIA: &str = "media";

#[derive(Clone, Debug, PartialEq)]
pub enum UsageDecision {
    Undecided,
    Remove,
    Repoint(String),
    Unpack,
}

/// Why `name` can't name a file or folder beside the others in `folder`, leaving out the one at
/// `own` that is being renamed.
pub fn name_problem(
    files: &ProjectFiles,
    folder: &str,
    name: &str,
    own: Option<&str>,
) -> Option<String> {
    let note = own.is_some_and(|own| own.ends_with(&format!(".{NOTE_EXTENSION}")));
    if note && (name.is_empty() || name.starts_with('.') || name.contains(['/', '\\'])) {
        return Some(
            "a note's name is any name without a slash, not starting with a dot".to_owned(),
        );
    }
    if !note && !valid_name(name) {
        return Some(format!("a name is {NAME_RULE}"));
    }
    let wanted = name.to_lowercase();
    let prefix = match folder {
        "" => String::new(),
        folder => folder_entry(folder),
    };
    files
        .paths_under(&prefix)
        .filter_map(|entry| entry[prefix.len()..].split('/').next())
        .filter(|file| !file.is_empty())
        .find(|file| {
            let path = format!("{prefix}{file}");
            Some(path.as_str()) != own
                && file
                    .split_once('.')
                    .map_or(*file, |(stem, _)| stem)
                    .to_lowercase()
                    == wanted
        })
        .map(|taken| format!("{taken} already has that name here (names ignore case)"))
}

/// `name` as a name within a file, such as a node's or a variable's: `name` itself when none of
/// `taken` has it, ignoring case, or else `name_2`, `name_3`, the first that is free.
pub fn free_name(name: &str, taken: &HashSet<String>) -> String {
    let is_taken = |candidate: &str| taken.iter().any(|t| t.eq_ignore_ascii_case(candidate));
    if !is_taken(name) {
        return name.to_owned();
    }
    let base = match name.rfind('_') {
        Some(cut) if cut > 0 && name[cut + 1..].chars().all(|c| c.is_ascii_digit()) => &name[..cut],
        _ => name,
    };
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|candidate| !is_taken(candidate))
        .expect("a free name")
}

/// A file name made from what someone typed: lower case, spaces as underscores, and only what a
/// name may hold.
pub fn name_from(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c == ' ' { '_' } else { c })
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '_' || *c == '-')
        .collect()
}

/// The path a new content file of `table` named `name` gets in `folder`, numbered when the name is
/// taken there.
pub fn new_path(files: &ProjectFiles, folder: &str, table: &str, name: &str) -> String {
    let shape = registry()
        .shape_of(table)
        .unwrap_or(engine::core::content::Shape::Json);
    let wanted = engine::core::content::content_path("", name, table, shape);
    free_path(files, folder, &wanted, &[])
}

/// Makes a content file of `table` in `folder`, named after its type and numbered when that is
/// taken, holding the type's default content, and opens it. Gives its path.
pub fn new_file(editor: &mut Editor, folder: &str, table: &str) -> Result<String, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let made = make::content_file(&editor.shapes, &project.files, table, folder, table);
    let path = free_path(&project.files, folder, moves::file_name(&made.path), &[]);
    let mut edit = ContentEdit::new(format!("New {}", shown_path(&path)));
    write_moved(&mut edit, &made.files, &made.path, &path);
    editor.try_apply(edit)?;
    editor.open_row(table, &path);
    Ok(path)
}

/// Makes a content file of `table` beside `file` and writes its path into `file` at `pointer`, as
/// one step.
pub fn new_file_into(
    editor: &mut Editor,
    table: &str,
    file: &str,
    pointer: &str,
) -> Result<String, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let folder = parent_of(content_holding(file).unwrap_or(file)).to_owned();
    let made = make::content_file(&editor.shapes, &project.files, table, &folder, table);
    let path = free_path(&project.files, &folder, moves::file_name(&made.path), &[]);
    let mut edit = ContentEdit::new(format!("New {}", shown_path(&path)));
    write_moved(&mut edit, &made.files, &made.path, &path);
    edit.update_json(&project.files, file, |target| {
        *target.pointer_mut(pointer)? = Value::String(path.clone());
        Some(())
    });
    editor.try_apply(edit)?;
    editor.open_row(table, &path);
    Ok(path)
}

/// Makes a folder named "folder", numbered when that is taken, in `parent`. Gives its path.
pub fn new_folder(editor: &mut Editor, parent: &str) -> Result<String, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let path = free_path(&project.files, parent, "folder", &[]);
    let mut edit = ContentEdit::new(format!("New folder {path}"));
    edit.write(folder_entry(&path), FileBytes::from([]));
    editor.try_apply(edit)?;
    Ok(path)
}

/// Makes an empty note named "note" in `folder`. Gives its path.
pub fn new_note(editor: &mut Editor, folder: &str) -> Result<String, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let path = free_path(
        &project.files,
        folder,
        &format!("note.{NOTE_EXTENSION}"),
        &[],
    );
    let mut edit = ContentEdit::new(format!("New note {path}"));
    edit.write(path.clone(), FileBytes::from([]));
    editor.try_apply(edit)?;
    Ok(path)
}

/// Copies the file or bundle at `path` beside it as "name (1)", and opens the copy.
pub fn duplicate(editor: &mut Editor, path: &str) -> Result<String, String> {
    let copies = copy_into(
        editor,
        &[path.to_owned()],
        parent_of(path),
        format!("Duplicate {}", shown_path(path)),
    )?;
    let copy = copies.into_iter().next().ok_or("nothing was copied")?;
    if let Some(table) = table_of(&copy).filter(|_| content_holding(&copy).is_some()) {
        let table = table.to_owned();
        editor.open_row(&table, &copy);
    }
    Ok(copy)
}

/// Copies what is at each path, a file, bundle or folder with all it holds, into `folder`,
/// numbering a name taken there, as one step labelled `label`. Gives where each copy landed.
pub fn copy_into(
    editor: &mut Editor,
    paths: &[String],
    folder: &str,
    label: String,
) -> Result<Vec<String>, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let mut edit = ContentEdit::new(label);
    let mut copies: Vec<String> = Vec::new();
    for path in paths {
        if folder == path || folder.starts_with(&format!("{path}/")) {
            return Err(format!(
                "{} can't be copied inside itself",
                shown_path(path)
            ));
        }
        let copy = free_path_among(&project.files, folder, moves::file_name(path), &[], &copies);
        let held = if project.files.index().folders.contains(path) {
            project
                .files
                .paths_under(&folder_entry(path))
                .cloned()
                .collect()
        } else {
            project.files.files_of(path)
        };
        let files: Vec<(String, FileBytes)> = held
            .into_iter()
            .filter_map(|file| Some((file.clone(), project.files.get(&file)?.clone())))
            .collect();
        write_moved(&mut edit, &files, path, &copy);
        copies.push(copy);
    }
    editor.try_apply(edit)?;
    Ok(copies)
}

/// Copies media files from anywhere on disk into `folder`, numbering a name taken there, as one
/// step. Gives their paths.
pub fn import_media(
    editor: &mut Editor,
    folder: &str,
    sources: &[std::path::PathBuf],
) -> Result<Vec<String>, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let mut edit = ContentEdit::new(match sources {
        [one] => format!("Import {}", import_name(one)),
        many => format!("Import {} files", many.len()),
    });
    let mut made: Vec<String> = Vec::new();
    for source in sources {
        let name = import_name(source);
        if AssetKind::of(&name).is_none() {
            return Err(format!("{name} is no kind of media a game holds"));
        }
        let bytes = std::fs::read(source).map_err(|error| format!("{name}: {error}"))?;
        let path = free_path_among(&project.files, folder, &name, &[], &made);
        edit.write(path.clone(), FileBytes::from(bytes));
        made.push(path);
    }
    editor.try_apply(edit)?;
    Ok(made)
}

/// Puts the bytes of `source` in place of the media file at `path`, which keeps its name.
pub fn replace_media(
    editor: &mut Editor,
    path: &str,
    source: &std::path::Path,
) -> Result<(), String> {
    let name = import_name(source);
    let extension = |file: &str| file.rsplit_once('.').map(|(_, ext)| ext.to_lowercase());
    if extension(&name) != extension(path) {
        return Err(format!(
            "{name} isn't the same kind of file as {}",
            shown_path(path)
        ));
    }
    let bytes = std::fs::read(source).map_err(|error| format!("{name}: {error}"))?;
    let mut edit = ContentEdit::new(format!("Replace {} with {name}", shown_path(path)));
    edit.write(path.to_owned(), FileBytes::from(bytes));
    editor.try_apply(edit)
}

/// Writes the default content of the fixture at `path`, which the engine looks for there.
pub fn make_fixture(editor: &mut Editor, path: &str) -> Result<(), String> {
    let table = table_of(path).ok_or("no type in its name")?;
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let made = make::content_file(
        &editor.shapes,
        &project.files,
        table,
        parent_of(path),
        engine::core::content::name_of(path),
    );
    let mut edit = ContentEdit::new(format!("Make {}", shown_path(path)));
    for (file, bytes) in made.files {
        edit.write(file, bytes);
    }
    editor.try_apply(edit)?;
    let table = table.to_owned();
    editor.open_row(&table, path);
    Ok(())
}

fn import_name(source: &std::path::Path) -> String {
    source
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase().replace(' ', "_"))
        .unwrap_or_default()
}

/// Renames the file, bundle or folder at `path` to `name`, keeping its type, and rewrites every
/// reference to it and to what is inside it.
pub fn rename(editor: &mut Editor, path: &str, name: &str) -> Result<String, String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let to = moves::renamed(path, name);
    if to == path {
        return Ok(to);
    }
    if let Some(problem) = name_problem(&project.files, parent_of(path), name, Some(path)) {
        return Err(problem);
    }
    moves::apply(
        editor,
        &[PathMove::new(path, &to)],
        format!("Rename {} to {name}", shown_path(path)),
    )?;
    Ok(to)
}

/// Moves what is at each path into `folder`, numbering a name taken there.
pub fn move_into(editor: &mut Editor, paths: &[String], folder: &str) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let mut steps: Vec<PathMove> = Vec::new();
    for path in paths {
        if parent_of(path) == folder {
            continue;
        }
        if folder == path || folder.starts_with(&format!("{path}/")) {
            return Err(format!("{} can't go inside itself", shown_path(path)));
        }
        let arriving: Vec<String> = steps.iter().map(|step| step.to.clone()).collect();
        let to = free_path_among(
            &project.files,
            folder,
            moves::file_name(path),
            paths,
            &arriving,
        );
        steps.push(PathMove::new(path, to));
    }
    if steps.is_empty() {
        return Ok(());
    }
    let into = if folder.is_empty() {
        "the game folder"
    } else {
        folder
    };
    let label = match steps.as_slice() {
        [one] => format!("Move {} into {into}", one.from),
        many => format!("Move {} files into {into}", many.len()),
    };
    moves::apply(editor, &steps, label)
}

/// The files `files` were kept in, written to where they land when what they make up moves from
/// `from` to `to`.
fn write_moved(edit: &mut ContentEdit, files: &[(String, FileBytes)], from: &str, to: &str) {
    let step = PathMove::new(from, to);
    for (file, bytes) in files {
        edit.write(
            step.moved(file).unwrap_or_else(|| file.clone()),
            bytes.clone(),
        );
    }
}

/// Asks what becomes of every use of the files at `paths`, and of everything inside the folders
/// among them, before deleting them.
pub fn delete_dialog(editor: &mut Editor, paths: Vec<String>) {
    let paths: Vec<String> = paths
        .into_iter()
        .filter(|path| match fixed_place(path) {
            Some(reason) => {
                editor
                    .output
                    .say("editor", format!("{} stays: {reason}", shown_path(path)));
                false
            }
            None => true,
        })
        .collect();
    if paths.is_empty() {
        editor.toast("Fixtures stay where the engine finds them");
        return;
    }
    let Some(project) = &editor.project else {
        return;
    };
    let index = project.files.index();
    let gone = gone_with(&index, &paths);
    let own: Vec<String> = gone
        .iter()
        .flat_map(|path| project.files.files_of(path))
        .collect();
    let mut groups: Vec<UsageGroup> = Vec::new();
    for path in &gone {
        let target = table_of(path)
            .filter(|_| index.is_content(path))
            .unwrap_or(MEDIA)
            .to_owned();
        let usages = match target.as_str() {
            MEDIA => project.usages.of_media(path),
            _ => project.usages.of_content(path),
        };
        for usage in usages {
            if own.contains(&usage.file) {
                continue;
            }
            let UsageKind {
                table: other_table,
                kind,
                entry,
            } = kind_of(project, &usage.file, &usage.pointer);
            let removable = entry.is_some();
            let same_group = |group: &&mut UsageGroup| {
                group.target == target
                    && group.table == other_table
                    && group.removable == removable
                    && if removable {
                        group.kind == kind
                    } else {
                        group.usages.iter().any(|known| known.file == usage.file)
                    }
            };
            match groups.iter_mut().find(same_group) {
                Some(group) => group.usages.push(usage.clone()),
                None => groups.push(UsageGroup {
                    target: target.clone(),
                    table: other_table,
                    kind,
                    usages: vec![usage.clone()],
                    removable,
                    whole_modules: entry == Some(Entry::Module),
                    decision: if removable {
                        UsageDecision::Remove
                    } else {
                        UsageDecision::Repoint(String::new())
                    },
                }),
            }
        }
    }
    editor.dialogs.push(ModalDialog::Delete(DeleteDialog {
        paths,
        gone,
        groups,
        error: None,
    }));
}

/// Every content file and media file that goes when `paths` do: each one itself, and what the
/// folders among them hold.
fn gone_with(index: &FolderIndex, paths: &[String]) -> Vec<String> {
    let mut gone = Vec::new();
    for path in paths {
        if index.folders.contains(path) {
            let inside = format!("{path}/");
            gone.extend(
                index
                    .content
                    .values()
                    .flatten()
                    .chain(&index.media)
                    .filter(|file| file.starts_with(&inside))
                    .cloned(),
            );
        } else {
            gone.push(path.clone());
        }
    }
    gone.sort();
    gone.dedup();
    gone
}

/// What deleting `paths` is called: one file by its name, or how many files go.
pub fn delete_title(dialog: &DeleteDialog) -> String {
    match dialog.paths.as_slice() {
        [one] if dialog.gone.len() == 1 && dialog.gone[0] == *one => {
            format!("Delete {}", file_title(one))
        }
        [one] => format!(
            "Delete folder {} and its {} file{}",
            moves::file_name(one),
            dialog.gone.len(),
            widgets::plural(dialog.gone.len())
        ),
        _ => format!(
            "Delete {} file{}",
            dialog.gone.len(),
            widgets::plural(dialog.gone.len())
        ),
    }
}

pub struct UsageSummary {
    pub table: String,
    pub field: String,
    pub keys: Vec<String>,
}

pub fn usage_groups(project: &Project, path: &str) -> Vec<UsageSummary> {
    let mut groups: Vec<UsageSummary> = Vec::new();
    for usage in project.usages.of_content(path) {
        let Some(other_key) = content_holding(&usage.file) else {
            continue;
        };
        let other_table = table_of(other_key).unwrap_or_default();
        let field = field_of(project, &usage.file, &usage.pointer);
        match groups
            .iter_mut()
            .find(|group| group.table == other_table && group.field == field)
        {
            Some(group) => {
                if !group.keys.iter().any(|k| k == other_key) {
                    group.keys.push(other_key.to_owned());
                }
            }
            None => groups.push(UsageSummary {
                table: other_table.to_owned(),
                field,
                keys: vec![other_key.to_owned()],
            }),
        }
    }
    groups
}

pub fn field_of(project: &Project, file: &str, pointer: &str) -> String {
    if is_beside(file) {
        let name = file.rsplit('/').next().unwrap_or(file);
        return name
            .split_once('.')
            .map_or(name, |(stem, _)| stem)
            .to_owned();
    }
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    if is_scene(file)
        && let Some(row) = project.files.json(file)
        && let Some(kind) = row
            .pointer(&crate::scene_graph::node_pointer(pointer))
            .and_then(|node| node["type"].as_str())
    {
        return kind.to_owned();
    }
    if segments.first() == Some(&"modules")
        && let Some(index) = segments.get(1)
        && let Some(row) = project.files.json(file)
        && let Some(kind) =
            row["modules"][index.parse::<usize>().unwrap_or(usize::MAX)]["type"].as_str()
    {
        return kind.to_owned();
    }
    segments
        .first()
        .map(|s| (*s).to_owned())
        .unwrap_or_default()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Entry {
    List,
    Module,
}

struct UsageKind {
    table: String,
    kind: String,
    entry: Option<Entry>,
}

fn kind_of(project: &Project, file: &str, pointer: &str) -> UsageKind {
    let table = content_holding(file)
        .and_then(table_of)
        .unwrap_or("game")
        .to_owned();
    let kind = field_of(project, file, pointer);
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let slot = (!is_beside(file) && !segments.contains(&"nodes"))
        .then(|| list_slot(pointer))
        .flatten();
    let entry = match slot {
        None => None,
        Some(_) if is_scene(file) => Some(Entry::Module),
        Some((parent, index)) if parent.ends_with("/modules") => {
            let any_number = project
                .files
                .json(file)
                .and_then(|row| row.pointer(&parent)?.get(index).cloned())
                .and_then(|module| registry().module_rule(&table, &module))
                == Some(ModuleRule::AnyNumber);
            any_number.then_some(Entry::Module)
        }
        Some(_) => Some(Entry::List),
    };
    UsageKind { table, kind, entry }
}

fn list_slot(pointer: &str) -> Option<(String, usize)> {
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let at = segments
        .iter()
        .rposition(|segment| segment.parse::<usize>().is_ok())?;
    let parent = if at == 0 {
        String::new()
    } else {
        format!("/{}", segments[..at].join("/"))
    };
    Some((parent, segments[at].parse().ok()?))
}

fn usage_detail(project: &Project, file: &str, pointer: &str) -> String {
    let (Some(row), Some(table)) = (
        project.files.json(file),
        content_holding(file).and_then(table_of),
    ) else {
        return String::new();
    };
    let parent = pointer
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let Some(at) = row.pointer(parent) else {
        return String::new();
    };
    let Some(entry) = at.as_object() else {
        return String::new();
    };
    let root = project.shapes.shape_of(table);
    let shape = schema::at_pointer(root, root, &row, parent).unwrap_or(&Value::Null);
    let mut parts: Vec<String> = Vec::new();
    for (name, value) in entry {
        if format!("{parent}/{name}") == pointer || name == "type" {
            continue;
        }
        let text = match value {
            Value::Number(number) => {
                let number = number.as_f64().unwrap_or(0.0);
                schema::number_shorthand(root, &shape["properties"][name], number)
                    .unwrap_or_else(|| format!("{name} {number}"))
            }
            Value::String(text) => format!("{name} {text}"),
            Value::Bool(true) => name.clone(),
            _ => continue,
        };
        parts.push(text);
    }
    parts.extend(
        schema::blank_meaning(shape, at)
            .into_iter()
            .map(str::to_owned),
    );
    parts.join(" · ")
}

/// Whether `file` is a scene graph, whose nodes nest in folders' children.
fn is_scene(file: &str) -> bool {
    file.rsplit('/').next() == Some(SCENE_FILE)
}

/// Whether `file` is a part of a bundle that names content in a format of its own, not JSON.
fn is_beside(file: &str) -> bool {
    !file.ends_with(".json")
}

pub fn delete_body(editor: &mut Editor, ui: &mut Ui, dialog: &mut DeleteDialog) {
    let Some(project) = &editor.project else {
        return;
    };
    let index = project.files.index();
    let total: usize = dialog.groups.iter().map(|group| group.usages.len()).sum();
    let rows: usize = {
        let mut files: Vec<&String> = dialog
            .groups
            .iter()
            .flat_map(|group| group.usages.iter().map(|usage| &usage.file))
            .collect();
        files.sort();
        files.dedup();
        files.len()
    };
    if dialog.groups.is_empty() {
        ui.label(theme::muted("Nothing names it."));
    } else {
        let used = format!(
            "Used in {total} place{} in {rows} file{}. Nothing is deleted until every group has an answer.",
            widgets::plural(total),
            widgets::plural(rows)
        );
        ui.label(theme::muted(used));
    }
    let candidates = |target: &str| -> Vec<String> {
        let all: Vec<&String> = match target {
            MEDIA => index.media.iter().collect(),
            table => index.content.get(table).into_iter().flatten().collect(),
        };
        all.into_iter()
            .filter(|path| !dialog.gone.contains(path))
            .cloned()
            .collect()
    };
    let details: Vec<Vec<(String, String)>> = dialog
        .groups
        .iter()
        .map(|group| {
            let mut lines: Vec<(String, String, usize)> = Vec::new();
            for usage in &group.usages {
                let row = content_holding(&usage.file)
                    .unwrap_or(&usage.file)
                    .to_owned();
                let mut detail = usage_detail(project, &usage.file, &usage.pointer);
                let line = if !group.removable {
                    let field = field_of(project, &usage.file, &usage.pointer);
                    detail = if detail.is_empty() {
                        field
                    } else {
                        format!("{field}  {detail}")
                    };
                    (String::new(), detail)
                } else {
                    (row, detail)
                };
                match lines
                    .iter_mut()
                    .find(|(r, d, _)| *r == line.0 && *d == line.1)
                {
                    Some((_, _, n)) => *n += 1,
                    None => lines.push((line.0, line.1, 1)),
                }
            }
            lines
                .into_iter()
                .map(|(row, detail, n)| {
                    if n > 1 {
                        (
                            row,
                            if detail.is_empty() {
                                format!("× {n}")
                            } else {
                                format!("{detail} × {n}")
                            },
                        )
                    } else {
                        (row, detail)
                    }
                })
                .collect()
        })
        .collect();
    ui.add_space(6.0);
    egui::ScrollArea::vertical()
        .max_height(440.0)
        .show(ui, |ui| {
            for (index, group) in dialog.groups.iter_mut().enumerate() {
                let title = group_title(project, group);
                widgets::card_frame(false).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        let badge = if group.kind.is_empty() {
                            &group.table
                        } else {
                            &group.kind
                        };
                        widgets::badge(ui, badge);
                        ui.label(theme::strong(&title));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let candidates = candidates(&group.target);
                            decision_picker(ui, &project.shapes, index, group, &candidates);
                        });
                    });
                    ui.add_space(2.0);
                    usage_lines(ui, index, &details[index]);
                });
                ui.add_space(4.0);
            }
        });
    let files_removed = dialog.gone.len();
    ui.add_space(4.0);
    let summary = if dialog.groups.is_empty() {
        format!(
            "{files_removed} deleted file{}, one undo step.",
            widgets::plural(files_removed)
        )
    } else {
        format!(
            "{total} edit{} in {rows} file{} and {files_removed} deleted file{}, one undo step.",
            widgets::plural(total),
            widgets::plural(rows),
            widgets::plural(files_removed)
        )
    };
    ui.label(theme::muted(summary).size(12.5));
    if let Some(error) = &dialog.error {
        ui.colored_label(theme::DANGER, error);
    }
}

fn group_title(project: &Project, group: &UsageGroup) -> String {
    let mut files: Vec<&String> = group.usages.iter().map(|usage| &usage.file).collect();
    files.sort();
    files.dedup();
    let mut kinds: Vec<String> = group
        .usages
        .iter()
        .map(|usage| field_of(project, &usage.file, &usage.pointer))
        .collect();
    kinds.sort();
    kinds.dedup();
    if files.len() != 1 {
        return format!(
            "{} · {} {}s",
            group.kind.replace('_', " "),
            files.len(),
            group.table
        );
    }
    let row = content_holding(files[0])
        .map(|path| file_title(path).to_owned())
        .unwrap_or_else(|| files[0].clone());
    match kinds.as_slice() {
        [kind] if !kind.is_empty() && *kind != group.table => {
            format!("{row} · {}", kind.replace('_', " "))
        }
        _ => row,
    }
}

fn decision_picker(
    ui: &mut Ui,
    shapes: &SchemaShapes,
    index: usize,
    group: &mut UsageGroup,
    candidates: &[String],
) {
    let table = group.target.as_str();
    let mut repoint = matches!(group.decision, UsageDecision::Repoint(_)) || !group.removable;
    if group.removable {
        let remove_label = if group.whole_modules {
            format!("Remove the {} modules", group.kind.replace('_', " "))
        } else {
            format!("Remove {}", usage_phrase(shapes, &group.table, &group.kind))
        };
        let unpackable = table == BlueprintDef::TABLE && group.whole_modules;
        let label = match group.decision {
            UsageDecision::Repoint(_) => "Replace with…".to_owned(),
            UsageDecision::Unpack => "Unpack into scenery".to_owned(),
            _ => remove_label.clone(),
        };
        widgets::combo(("decision", index))
            .selected_text(theme::mono(label).size(13.0))
            .show_ui(ui, |ui| {
                if unpackable
                    && ui
                        .selectable_label(
                            group.decision == UsageDecision::Unpack,
                            "Unpack into scenery",
                        )
                        .on_hover_text(
                            "Each placement becomes its parts, placed, and looks exactly the same",
                        )
                        .clicked()
                {
                    group.decision = UsageDecision::Unpack;
                    repoint = false;
                }
                if ui
                    .selectable_label(
                        matches!(group.decision, UsageDecision::Remove),
                        &remove_label,
                    )
                    .clicked()
                {
                    group.decision = UsageDecision::Remove;
                    repoint = false;
                }
                if ui.selectable_label(repoint, "Replace with…").clicked() && !repoint {
                    group.decision = UsageDecision::Repoint(String::new());
                    repoint = true;
                }
            });
    }
    if !repoint {
        return;
    }
    let mut picked = match &group.decision {
        UsageDecision::Repoint(key) => key.clone(),
        _ => String::new(),
    };
    let selected = if picked.is_empty() {
        theme::muted("pick a replacement…").size(13.0)
    } else {
        theme::code(file_title(&picked).to_owned()).size(13.0)
    };
    ui.allocate_ui_with_layout(
        egui::vec2(170.0, ui.spacing().interact_size.y),
        egui::Layout::left_to_right(egui::Align::Center),
        |ui| {
            widgets::combo(("repoint", index))
                .width(160.0)
                .selected_text(selected)
                .show_ui(ui, |ui| {
                    for candidate in candidates {
                        if ui
                            .selectable_label(picked == *candidate, theme::mono(candidate))
                            .on_hover_text(candidate.as_str())
                            .clicked()
                        {
                            picked = candidate.clone();
                        }
                    }
                });
        },
    );
    if !picked.is_empty() && group.decision != UsageDecision::Repoint(picked.clone()) {
        group.decision = UsageDecision::Repoint(picked);
    }
    ui.label(theme::muted("Replace with").size(12.5));
}

fn usage_lines(ui: &mut Ui, index: usize, lines: &[(String, String)]) {
    egui::Grid::new(("usages", index))
        .num_columns(2)
        .spacing([14.0, 2.0])
        .show(ui, |ui| {
            for (row, detail) in lines {
                if row.is_empty() {
                    ui.label(theme::mono(detail).size(12.5).color(theme::TEXT));
                    ui.label("");
                } else {
                    ui.label(theme::mono(row).size(12.5).color(theme::TEXT));
                    ui.label(theme::muted(detail).monospace().size(12.5));
                }
                ui.end_row();
            }
        });
}

fn usage_phrase(shapes: &SchemaShapes, table: &str, field: &str) -> String {
    shapes
        .tables
        .get(table)
        .and_then(|table| table.shape["properties"][field]["x-usage"].as_str())
        .unwrap_or("the entries")
        .to_owned()
}

pub fn delete(editor: &mut Editor, dialog: &DeleteDialog) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(group) = dialog
        .groups
        .iter()
        .find(|group| group.decision == UsageDecision::Undecided)
    {
        return Err(format!("decide what happens to {}", group.kind));
    }
    let label = delete_title(dialog);
    let mut edit = ContentEdit::new(label.clone());
    let mut by_file: BTreeMap<String, Vec<(&ContentUsage, &UsageGroup)>> = Default::default();
    for group in &dialog.groups {
        for usage in &group.usages {
            by_file
                .entry(usage.file.clone())
                .or_default()
                .push((usage, group));
        }
    }
    for (file, mut entries) in by_file {
        if is_beside(&file) {
            for (_, group) in &entries {
                if let UsageDecision::Repoint(to) = &group.decision {
                    for gone in dialog
                        .gone
                        .iter()
                        .filter(|gone| table_of(gone) == Some(&group.target))
                    {
                        edit.rename_beside(&project.files, &file, &group.target, gone, to);
                    }
                }
            }
            continue;
        }
        let Some(mut value) = project.files.json_owned(&file) else {
            continue;
        };
        entries.sort_by(|a, b| b.0.pointer.cmp(&a.0.pointer));
        for (usage, group) in entries {
            match &group.decision {
                UsageDecision::Repoint(to) => {
                    moves::rewrite(&mut value, usage, &project.usages, &file, to)
                }
                UsageDecision::Remove => remove_entry(&mut value, &usage.pointer),
                UsageDecision::Unpack => unpack_entry(project, &file, &mut value, &usage.pointer),
                UsageDecision::Undecided => {}
            }
        }
        edit.write_json(file, &value);
    }
    for path in &dialog.paths {
        let inside = folder_entry(path);
        let entries: Vec<String> = if project.files.index().folders.contains(path) {
            project.files.paths_under(&inside).cloned().collect()
        } else {
            project.files.files_of(path)
        };
        for entry in entries {
            edit.remove(entry);
        }
        moves::keep_folder(&project.files, &mut edit, parent_of(path));
    }
    editor.try_apply(edit)?;
    for path in &dialog.gone {
        close_tabs(editor, path);
    }
    let gone = |key: &String| {
        dialog.gone.contains(key)
            || dialog
                .paths
                .iter()
                .any(|path| key.starts_with(&format!("{path}/")))
    };
    editor.selection.keys.retain(|key| !gone(key));
    editor.toast(label.replacen("Delete", "Deleted", 1));
    Ok(())
}

/// Puts in place of the placement a usage at `pointer` of the scene file `file` names what it
/// places, as nodes of that scene.
fn unpack_entry(project: &Project, file: &str, value: &mut Value, pointer: &str) {
    let Some(bundle) = file.strip_suffix(&format!("/{SCENE_FILE}")) else {
        return;
    };
    let node = scene_graph::node_pointer(pointer);
    let Some((parent, index)) = list_slot(&node) else {
        return;
    };
    let reader = project.reader();
    let unpacked = area::nodes::bundle_in(project, bundle).and_then(|read| {
        let placement = area::nodes::placement_of(area::nodes::node(read.nodes(), &node)?)?;
        let place = placement::AreaPlacement::of(project, &node, placement)?;
        let nodes = placement::unpacked(&reader, &place)?;
        area::nodes::CopiedNodes::of(&reader, &nodes)
    });
    let Some(parts) = unpacked.and_then(|copied| copied.into_json().as_array().cloned()) else {
        return;
    };
    let Some(list) = value.pointer_mut(&parent).and_then(Value::as_array_mut) else {
        return;
    };
    if index >= list.len() {
        return;
    }
    list.remove(index);
    for (offset, part) in parts.into_iter().enumerate() {
        list.insert(index + offset, part);
    }
}

fn remove_entry(value: &mut Value, pointer: &str) {
    if let Some((parent, index)) = list_slot(pointer)
        && let Some(list) = value.pointer_mut(&parent).and_then(Value::as_array_mut)
        && index < list.len()
    {
        list.remove(index);
    }
}

pub fn close_tabs(editor: &mut Editor, path: &str) {
    let gone: Vec<EditorTab> = editor
        .dock
        .iter_all_tabs()
        .map(|(_, tab)| tab.clone())
        .filter(|tab| {
            tab.row().is_some_and(|(_, key)| key == path)
                || *tab
                    == EditorTab::Asset {
                        path: path.to_owned(),
                    }
        })
        .collect();
    for tab in gone {
        if let Some(path) = editor.dock.find_tab(&tab) {
            editor.dock.remove_tab(path);
        }
    }
}
