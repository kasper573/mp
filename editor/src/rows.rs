use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use egui::{RichText, Ui};
use engine::core::content::id::LeafKind;
use engine::core::content::{
    ContentRow, GAME_FILE, ModuleRule, OWNER_FIELD, RowFolder, RowName, load, locate, row_file,
    row_folder, row_holding, row_of,
};
use engine::core::vfx::{VfxShaderDef, shader_file};
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::registry;
use serde_json::Value;

use crate::app::{DeleteDialog, DuplicateDialog, Editor, ModalDialog, NewRowDialog};
use crate::folders;
use crate::project::{ContentEdit, Project, ProjectFiles};
use crate::schema::{self, SchemaShapes};
use crate::tabs::EditorTab;
use crate::ui::{theme, widgets};
use crate::usages::{self, ContentUsage};
use crate::views::area::placement;
use crate::views::world;

#[derive(Clone, Debug)]
pub struct UsageGroup {
    /// The table of the deleted rows the group's uses name.
    pub target: String,
    pub table: String,
    pub kind: String,
    pub usages: Vec<ContentUsage>,
    pub removable: bool,
    pub whole_modules: bool,
    pub decision: UsageDecision,
}

#[derive(Clone, Debug, PartialEq)]
pub enum UsageDecision {
    Undecided,
    Remove,
    Repoint(String),
    Unpack,
}

pub fn key_problem(files: &ProjectFiles, table: &str, key: &str) -> Option<String> {
    key_problem_besides(files, table, key, None)
}

/// Why `key` can't name a row of the table, leaving out the row keyed `own` that is being renamed.
fn key_problem_besides(
    files: &ProjectFiles,
    table: &str,
    key: &str,
    own: Option<&str>,
) -> Option<String> {
    if !load::valid_key(key) {
        return Some(format!("a key is {}", load::KEY_RULE));
    }
    files
        .keys_of(table)
        .filter(|other| Some(*other) != own)
        .find(|other| other.eq_ignore_ascii_case(key))
        .map(|other| format!("{table}/{other} already exists (keys ignore case)"))
}

/// `row` with an owner line naming `owner` first, as a local row's file is written.
pub fn owned_row(owner: &RowName, row: &Value) -> Value {
    let mut fields = serde_json::Map::new();
    fields.insert(OWNER_FIELD.to_owned(), Value::String(owner.to_string()));
    for (name, value) in row.as_object().into_iter().flatten() {
        if name != OWNER_FIELD {
            fields.insert(name.clone(), value.clone());
        }
    }
    Value::Object(fields)
}

pub fn key_from_name(name: &str) -> String {
    name.trim().to_lowercase().replace(' ', "_")
}

pub fn free_key(files: &ProjectFiles, table: &str, wanted: &str) -> String {
    let taken: HashSet<String> = files.keys_of(table).map(str::to_owned).collect();
    free_name(wanted, &taken)
}

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

pub fn new_row_dialog(
    editor: &mut Editor,
    table: &str,
    owner: Option<RowName>,
    folder: Option<RowFolder>,
) {
    new_row(editor, table, owner, folder, None);
}

pub fn new_row_into(
    editor: &mut Editor,
    table: &str,
    owner: Option<RowName>,
    into: Option<(String, String)>,
) {
    new_row(editor, table, owner, None, into);
}

fn new_row(
    editor: &mut Editor,
    table: &str,
    owner: Option<RowName>,
    folder: Option<RowFolder>,
    into: Option<(String, String)>,
) {
    let Some(project) = &editor.project else {
        return;
    };
    let Some(shape) = editor.shapes.table(table) else {
        return;
    };
    let value = schema::template(&shape.shape, &shape.shape);
    let key = free_key(&project.files, table, &format!("new_{table}"));
    editor.dialogs.push(ModalDialog::NewRow(NewRowDialog {
        table: table.to_owned(),
        key,
        value,
        error: None,
        into,
        owner,
        folder,
    }));
}

pub fn new_row_body(editor: &mut Editor, ui: &mut Ui, dialog: &mut NewRowDialog) {
    ui.horizontal(|ui| {
        ui.label("Key");
        let response = ui.text_edit_singleline(&mut dialog.key);
        widgets::default_focus(ui, &response);
    });
    if let Some(project) = &editor.project
        && let Some(problem) = key_problem(&project.files, &dialog.table, dialog.key.trim())
    {
        ui.label(RichText::new(problem).weak());
    }
    if let Some(name) = dialog
        .value
        .get_mut("name")
        .and_then(|name| name.as_str().map(str::to_owned))
    {
        let mut draft = name;
        ui.horizontal(|ui| {
            ui.label("Name");
            if ui.text_edit_singleline(&mut draft).changed() {
                dialog.value["name"] = Value::String(draft);
            }
        });
    }
    if let Some(owner) = &dialog.owner {
        ui.label(
            RichText::new(format!(
                "File {} · owner {owner}",
                row_file(&dialog.table, dialog.key.trim())
            ))
            .weak()
            .small(),
        );
    }
    if let Some(folder) = &dialog.folder {
        ui.label(RichText::new(format!("In folder {folder}")).weak().small());
    }
    if let Some((file, pointer)) = &dialog.into {
        ui.label(
            RichText::new(format!("Written into {file} at {pointer}"))
                .weak()
                .small(),
        );
    }
    if let Some(error) = &dialog.error {
        ui.colored_label(theme::DANGER, error);
    }
}

pub fn create(editor: &mut Editor, dialog: &NewRowDialog) -> Result<(), String> {
    let key = dialog.key.trim().to_owned();
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(problem) = key_problem(&project.files, &dialog.table, &key) {
        return Err(problem);
    }
    let mut edit = ContentEdit::new(format!("New {} {key}", dialog.table));
    let row = match &dialog.owner {
        Some(owner) => owned_row(owner, &dialog.value),
        None => dialog.value.clone(),
    };
    let row = match &dialog.folder {
        Some(folder) => folders::with_folder(&row, Some(folder)),
        None => row,
    };
    edit.write_json(row_file(&dialog.table, &key), &row);
    if let Some(file) = companion_file(&dialog.table, &key) {
        edit.write(file, Arc::from(NEW_SHADER.as_bytes()));
    }
    if let Some((file, pointer)) = &dialog.into
        && let Some(mut target) = project.files.json_owned(file)
    {
        if let Some(slot) = target.pointer_mut(pointer) {
            *slot = Value::String(key.clone());
        }
        edit.write_json(file, &target);
    }
    editor.try_apply(edit)?;
    editor.open_row(&dialog.table, &key);
    Ok(())
}

/// Duplicates a row on the spot, or asks for the copy's key first when rows local to it are copied
/// along under new keys.
pub fn duplicate(editor: &mut Editor, table: &str, key: &str) {
    let Some(project) = &editor.project else {
        return;
    };
    let row = RowName::new(table, key);
    let copy = free_key(&project.files, table, &format!("{key}_2"));
    if project.files.owners().held_by(&row).is_empty() {
        if let Err(error) = duplicate_as(editor, &row, &copy) {
            editor.toast(error);
        }
    } else {
        editor.dialogs.push(ModalDialog::Duplicate(DuplicateDialog {
            row,
            draft: copy,
            error: None,
        }));
    }
}

pub fn duplicate_as(editor: &mut Editor, row: &RowName, copy: &str) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(problem) = key_problem(&project.files, &row.table, copy) {
        return Err(problem);
    }
    let copies = copied_keys(&project.files, row, copy);
    let mut label = format!("Duplicate {row} as {copy}");
    if copies.len() > 1 {
        label.push_str(&format!(
            " with {} local row{}",
            copies.len() - 1,
            widgets::plural(copies.len() - 1)
        ));
    }
    let mut edit = ContentEdit::new(label);
    let new_name = |name: &RowName| {
        copies
            .iter()
            .find(|(old, _)| old == name)
            .map(|(_, key)| RowName::new(&name.table, key))
    };
    for (old, key) in &copies {
        let Some(mut value) = project.files.json_owned(&row_file(&old.table, &old.key)) else {
            continue;
        };
        let file = row_file(&old.table, &old.key);
        let mut references: Vec<_> = project
            .usages
            .in_file(&file)
            .iter()
            .filter_map(|reference| match reference.kind {
                LeafKind::Row(table) => Some((
                    ContentUsage {
                        file: file.clone(),
                        pointer: reference.pointer.clone(),
                        known: reference.known,
                    },
                    new_name(&RowName::new(table, &reference.value))?,
                )),
                LeafKind::Asset => None,
            })
            .collect();
        references.sort_by(|a, b| b.0.pointer.cmp(&a.0.pointer));
        for (usage, to) in &references {
            rewrite(&mut value, usage, &project.usages, &file, to);
        }
        if let Some(owner) = project.files.owners().owner(&old.table, &old.key)
            && let Some(copied) = new_name(owner)
        {
            value = owned_row(&copied, &value);
        }
        edit.write_json(row_file(&old.table, key), &value);
        for (from, to) in beside_row(project, &old.table, &old.key, key) {
            if let Some(bytes) = project.files.get(&from) {
                edit.write(to, bytes.clone());
            }
        }
        if old.table == AreaDef::TABLE {
            world::card_beside(project, &mut edit, &old.key, key);
        }
    }
    editor.try_apply(edit)?;
    editor.open_row(&row.table, copy);
    Ok(())
}

/// `row` and every row local to it, at any depth, each with the key its copy gets when `row`'s
/// copy is keyed `copy`: a key starting with `row`'s takes `copy` in its place, any other gets
/// `copy` in front, and either is made free in its table.
pub fn copied_keys(files: &ProjectFiles, row: &RowName, copy: &str) -> Vec<(RowName, String)> {
    let prefix = format!("{}_", row.key);
    let mut taken: BTreeMap<String, HashSet<String>> = BTreeMap::new();
    let mut copies = vec![(row.clone(), copy.to_owned())];
    for local in files.owners().held_within(row) {
        let wanted = match local.key.strip_prefix(&prefix) {
            Some(rest) => format!("{copy}_{rest}"),
            None => format!("{copy}_{}", local.key),
        };
        let taken = taken
            .entry(local.table.clone())
            .or_insert_with(|| files.keys_of(&local.table).map(str::to_owned).collect());
        let key = free_name(&wanted, taken);
        taken.insert(key.clone());
        copies.push((local, key));
    }
    copies
}

pub fn rename(
    editor: &mut Editor,
    table: &str,
    key: &str,
    new_key: &str,
    local_keys: bool,
) -> Result<(), String> {
    if new_key == key {
        return Ok(());
    }
    if editor.shapes.is_fixture(table, key) {
        return Err("fixtures keep their key".to_owned());
    }
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let row = RowName::new(table, key);
    let mut renames = vec![(row.clone(), new_key.to_owned())];
    if local_keys {
        renames.extend(prefixed_local_keys(&project.files, &row, new_key));
    }
    for (index, (row, to)) in renames.iter().enumerate() {
        if let Some(problem) = key_problem_besides(&project.files, &row.table, to, Some(&row.key)) {
            return Err(problem);
        }
        if renames[..index]
            .iter()
            .any(|(other, other_to)| other.table == row.table && other_to == to)
        {
            return Err(format!("{}/{to} would be named twice", row.table));
        }
    }
    let edit = rename_edit(
        project,
        &renames,
        format!("Rename {table}/{key} to {new_key}"),
    )?;
    let count = edit.changes.len();
    editor.try_apply(edit)?;
    editor.toast(format!(
        "Renamed {table}/{key} to {new_key}: {count} files rewritten"
    ));
    for (row, to) in &renames {
        retarget_tabs(editor, &row.table, &row.key, to);
        if editor.selection.table == row.table {
            for selected in &mut editor.selection.keys {
                if *selected == row.key {
                    selected.clone_from(to);
                }
            }
        }
    }
    Ok(())
}

/// The rows local to `row`, at any depth, whose keys start with its key and an underscore, each
/// with the key it gets when `row` is keyed `new_key`.
pub fn prefixed_local_keys(
    files: &ProjectFiles,
    row: &RowName,
    new_key: &str,
) -> Vec<(RowName, String)> {
    let prefix = format!("{}_", row.key);
    files
        .owners()
        .held_within(row)
        .into_iter()
        .filter_map(|local| {
            let rest = local.key.strip_prefix(&prefix)?.to_owned();
            Some((local, format!("{new_key}_{rest}")))
        })
        .collect()
}

/// Renames each row to its new key in one edit: its file and the files beside it move, and every
/// use of it, owner lines included, is rewritten.
fn rename_edit(
    project: &Project,
    renames: &[(RowName, String)],
    label: String,
) -> Result<ContentEdit, String> {
    let mut edit = ContentEdit::new(label);
    let mut by_file: BTreeMap<String, Vec<(ContentUsage, &RowName, RowName)>> = Default::default();
    for (row, to) in renames {
        for usage in project.usages.of_row(&row.table, &row.key) {
            by_file.entry(usage.file.clone()).or_default().push((
                usage.clone(),
                row,
                RowName::new(&row.table, to),
            ));
        }
    }
    for (file, mut uses) in by_file {
        if is_beside(&file) {
            for (_, from, to) in &uses {
                edit.rename_beside(&project.files, &file, &from.table, &from.key, &to.key);
            }
            continue;
        }
        uses.sort_by(|a, b| b.0.pointer.cmp(&a.0.pointer));
        edit.update_json(&project.files, &file, |value| {
            for (usage, _, to) in &uses {
                rewrite(value, usage, &project.usages, &file, to);
            }
            Some(())
        });
    }
    for (row, to) in renames {
        let own = row_file(&row.table, &row.key);
        let value = edit
            .pending_json(&project.files, &own)
            .ok_or("the row is gone")?;
        edit.write_json(row_file(&row.table, to), &value);
        edit.remove(own);
        for (from, moved) in beside_row(project, &row.table, &row.key, to) {
            if let Some(bytes) = edit.pending_bytes(&project.files, &from) {
                edit.write(moved, bytes);
                edit.remove(from);
            }
        }
    }
    Ok(edit)
}

fn rewrite(
    value: &mut Value,
    usage: &ContentUsage,
    usages: &usages::ContentUsages,
    file: &str,
    to: &RowName,
) {
    if usage.is_owner_line() {
        value[OWNER_FIELD] = Value::String(to.to_string());
        return;
    }
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
            map.insert(to.key.clone(), entry);
        }
    } else if let Some(slot) = value.pointer_mut(pointer) {
        *slot = Value::String(to.key.clone());
    }
}

/// Whether `file` is one beside a row, which names rows in its own format rather than JSON.
fn is_beside(file: &str) -> bool {
    file != GAME_FILE && row_of(file).is_none()
}

fn split_pointer(pointer: &str) -> (&str, String) {
    let cut = pointer.rfind('/').unwrap_or(0);
    let name = locate::unescape(&pointer[cut + 1..]);
    (&pointer[..cut], name)
}

fn retarget_tabs(editor: &mut Editor, table: &str, key: &str, new_key: &str) {
    editor.rename_tabs(|tab| match tab {
        EditorTab::Script(owner) => owner.renamed(table, key, new_key).map(EditorTab::Script),
        other if other.is_row(table, key) => Some(EditorTab::for_row(table, new_key)),
        _ => None,
    });
}

/// The file a row owns by convention besides its own, which follows the row through a copy, a
/// rename and a deletion: a shader's WGSL.
pub fn companion_file(table: &str, key: &str) -> Option<String> {
    (table == VfxShaderDef::TABLE).then(|| shader_file(key))
}

const NEW_SHADER: &str =
    "fn vfx(uv: vec2<f32>) -> vec4<f32> {\n    return sample(site_uv(uv));\n}\n";

pub fn folder_files(project: &Project, table: &str, key: &str) -> Vec<String> {
    project
        .files
        .paths_under(&format!("{}/", row_folder(table, key)))
        .cloned()
        .collect()
}

/// The files a row keeps beside its own, each with where it lands when the row is keyed `to`.
fn beside_row(project: &Project, table: &str, key: &str, to: &str) -> Vec<(String, String)> {
    let (from_folder, to_folder) = (row_folder(table, key), row_folder(table, to));
    let companion = companion_file(table, key).zip(companion_file(table, to));
    companion
        .into_iter()
        .chain(folder_files(project, table, key).into_iter().map(|file| {
            let moved = file.replacen(&from_folder, &to_folder, 1);
            (file, moved)
        }))
        .collect()
}

pub fn delete_dialog(editor: &mut Editor, table: &str, keys: Vec<String>) {
    let keys: Vec<String> = keys
        .into_iter()
        .filter(|key| {
            if editor.shapes.is_fixture(table, key) {
                editor
                    .output
                    .say("editor", format!("{table}/{key} is a fixture and stays"));
                false
            } else {
                true
            }
        })
        .collect();
    if keys.is_empty() {
        editor.toast("Fixtures can't be deleted");
        return;
    }
    let Some(project) = &editor.project else {
        return;
    };
    let owners = project.files.owners();
    let named: Vec<RowName> = keys.iter().map(|key| RowName::new(table, key)).collect();
    let mut along: Vec<RowName> = Vec::new();
    for row in &named {
        for local in owners.held_within(row) {
            if !named.contains(&local) && !along.contains(&local) {
                along.push(local);
            }
        }
    }
    let own: Vec<String> = named
        .iter()
        .chain(&along)
        .map(|row| row_file(&row.table, &row.key))
        .collect();
    let mut groups: Vec<UsageGroup> = Vec::new();
    for row in named.iter().chain(&along) {
        for usage in project.usages.of_row(&row.table, &row.key) {
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
                group.target == row.table
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
                    target: row.table.clone(),
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
        table: table.to_owned(),
        keys,
        along,
        groups,
        error: None,
    }));
}

pub struct UsageSummary {
    pub table: String,
    pub field: String,
    pub keys: Vec<String>,
}

pub fn usage_groups(project: &Project, table: &str, key: &str) -> Vec<UsageSummary> {
    let mut groups: Vec<UsageSummary> = Vec::new();
    for usage in project.usages.of_row(table, key) {
        let Some((other_table, other_key)) = row_holding(&usage.file) else {
            continue;
        };
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
    let table = row_holding(file)
        .map(|(table, _)| table)
        .unwrap_or("game")
        .to_owned();
    let kind = field_of(project, file, pointer);
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let slot = (!is_beside(file) && !segments.contains(&"nodes"))
        .then(|| list_slot(pointer))
        .flatten();
    let entry = match slot {
        None => None,
        Some((parent, index)) if parent.ends_with("/modules") => {
            let any_number = project
                .files
                .json(file)
                .and_then(|row| row["modules"].get(index).cloned())
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
    let (Some(row), Some((table, _))) = (project.files.json(file), row_of(file)) else {
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

pub fn delete_body(editor: &mut Editor, ui: &mut Ui, dialog: &mut DeleteDialog) {
    let Some(project) = &editor.project else {
        return;
    };
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
        ui.label(theme::muted(
            "Nothing names it. The file goes; its assets stay until nothing names them.",
        ));
    } else {
        let used = format!(
            "Used in {total} place{} in {rows} row{}. Nothing is deleted until every group has an answer.",
            widgets::plural(total),
            widgets::plural(rows)
        );
        ui.label(theme::muted(used));
    }
    if !dialog.along.is_empty() {
        ui.add_space(4.0);
        widgets::section_count(ui, "Deleted with it", dialog.along.len());
        ui.add(egui::Label::new(theme::muted(along_summary(&dialog.along)).size(12.5)).wrap());
    }
    let candidates = |target: &str| -> Vec<String> {
        project
            .files
            .keys_of(target)
            .filter(|key| {
                !(target == dialog.table && dialog.keys.iter().any(|deleted| deleted == key))
                    && !dialog.along.iter().any(|row| row.is(target, key))
            })
            .map(str::to_owned)
            .collect()
    };
    let details: Vec<Vec<(String, String)>> = dialog
        .groups
        .iter()
        .map(|group| {
            let mut lines: Vec<(String, String, usize)> = Vec::new();
            for usage in &group.usages {
                let row = row_holding(&usage.file)
                    .map(|(t, k)| format!("{t}/{k}"))
                    .unwrap_or_else(|| usage.file.clone());
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
    let files_removed = dialog.keys.len() + dialog.along.len();
    let assets_named = dialog.keys.iter().any(|key| {
        project
            .usages
            .in_file(&row_file(&dialog.table, key))
            .iter()
            .any(|reference| reference.kind == LeafKind::Asset)
    });
    ui.add_space(4.0);
    let mut summary = format!(
        "{total} edit{} in {rows} row{} and {files_removed} deleted file{}, one undo step.",
        widgets::plural(total),
        widgets::plural(rows),
        widgets::plural(files_removed)
    );
    if dialog.groups.is_empty() {
        summary = format!(
            "{files_removed} deleted file{}, one undo step.",
            widgets::plural(files_removed)
        );
    }
    if assets_named {
        summary.push_str(" Its files stay in assets/ until nothing names them.");
    }
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
    let row = row_holding(files[0])
        .map(|(t, k)| format!("{t}/{k}"))
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
        theme::code(format!("{table}/ {picked}")).size(13.0)
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
    let mut label = format!("Delete {} {}", dialog.table, dialog.keys.join(", "));
    if !dialog.along.is_empty() {
        label.push_str(&format!(
            " with {} local row{}",
            dialog.along.len(),
            widgets::plural(dialog.along.len())
        ));
    }
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
                if let UsageDecision::Repoint(key) = &group.decision {
                    let deleted = dialog
                        .keys
                        .iter()
                        .map(|key| RowName::new(&dialog.table, key))
                        .chain(dialog.along.iter().cloned());
                    for row in deleted {
                        if row.table == group.target {
                            edit.rename_beside(&project.files, &file, &row.table, &row.key, key);
                        }
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
                UsageDecision::Repoint(key) => rewrite(
                    &mut value,
                    usage,
                    &project.usages,
                    &file,
                    &RowName::new(&group.target, key),
                ),
                UsageDecision::Remove => remove_entry(&mut value, &usage.pointer),
                UsageDecision::Unpack => unpack_entry(project, &mut value, &usage.pointer),
                UsageDecision::Undecided => {}
            }
        }
        edit.write_json(file, &value);
    }
    let deleted: Vec<RowName> = dialog
        .keys
        .iter()
        .map(|key| RowName::new(&dialog.table, key))
        .chain(dialog.along.iter().cloned())
        .collect();
    for row in &deleted {
        edit.remove(row_file(&row.table, &row.key));
        if let Some(file) = companion_file(&row.table, &row.key)
            && project.files.contains(&file)
        {
            edit.remove(file);
        }
        for file in folder_files(project, &row.table, &row.key) {
            edit.remove(file);
        }
    }
    editor.try_apply(edit)?;
    for row in &deleted {
        close_tabs(editor, &row.table, &row.key);
        if editor.selection.table == row.table {
            editor.selection.keys.retain(|key| *key != row.key);
        }
    }
    editor.toast(label.replacen("Delete", "Deleted", 1));
    Ok(())
}

/// The rows going along with an owner, by table: "npc bram, wren · memory 5".
pub fn along_summary(rows: &[RowName]) -> String {
    let mut by_table: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for row in rows {
        by_table.entry(&row.table).or_default().push(&row.key);
    }
    by_table
        .into_iter()
        .map(|(table, keys)| {
            if keys.len() <= 6 {
                format!("{table} {}", keys.join(", "))
            } else {
                format!("{table} {}", keys.len())
            }
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

fn unpack_entry(project: &Project, value: &mut Value, pointer: &str) {
    let Some(content) = project.content.clone() else {
        return;
    };
    let Some((parent, index)) = list_slot(pointer) else {
        return;
    };
    let Some(list) = value.pointer_mut(&parent).and_then(Value::as_array_mut) else {
        return;
    };
    if index >= list.len() {
        return;
    }
    let Some(parts) = placement::unpacked(&content, &list[index]) else {
        return;
    };
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

pub fn close_tabs(editor: &mut Editor, table: &str, key: &str) {
    let gone: Vec<EditorTab> = editor
        .dock
        .iter_all_tabs()
        .map(|(_, tab)| tab.clone())
        .filter(|tab| tab.is_row(table, key))
        .collect();
    for tab in gone {
        if let Some(path) = editor.dock.find_tab(&tab) {
            editor.dock.remove_tab(path);
        }
    }
}
