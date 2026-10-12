use egui::{RichText, Ui};
use serde_json::Value;

use crate::app::{DeleteDialog, Dialog, Editor, NewRowDialog};
use crate::project::{Edit, Selection, row_file, row_of};
use crate::schema;
use crate::tabs::Tab;
use crate::usages::Usage;

pub const KEY_MAX: usize = 64;

#[derive(Clone, Debug)]
pub struct UsageGroup {
    pub table: String,
    pub kind: String,
    pub usages: Vec<Usage>,
    pub removable: bool,
    pub whole_modules: bool,
    pub decision: Decision,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Decision {
    Undecided,
    Remove,
    Repoint(String),
    Unpack,
}

pub fn key_problem(files: &crate::project::Files, table: &str, key: &str) -> Option<String> {
    if key.is_empty() || key.len() > KEY_MAX {
        return Some(format!("a key is 1 to {KEY_MAX} characters"));
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Some("a key uses letters, digits, _ and - only".to_owned());
    }
    let lower = key.to_lowercase();
    let clash = files
        .paths_under(&format!("tables/{table}/"))
        .filter_map(|file| row_of(file).map(|(_, other)| other.to_owned()))
        .find(|other| other.to_lowercase() == lower);
    clash.map(|other| format!("{table}/{other} already exists (keys ignore case)"))
}

pub fn free_key(files: &crate::project::Files, table: &str, wanted: &str) -> String {
    let base = wanted.trim_end_matches(|c: char| c.is_ascii_digit() || c == '_');
    let base = if base.is_empty() { "row" } else { base };
    if key_problem(files, table, wanted).is_none() {
        return wanted.to_owned();
    }
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|candidate| key_problem(files, table, candidate).is_none())
        .expect("some free key")
}

pub fn new_row_dialog(editor: &mut Editor, table: &str) {
    new_row_into(editor, table, None);
}

pub fn new_row_into(editor: &mut Editor, table: &str, into: Option<(String, String)>) {
    let Some(project) = &editor.project else {
        return;
    };
    let Some(shape) = editor.shapes.table(table) else {
        return;
    };
    let value = schema::template(&shape.shape, &shape.shape);
    let key = free_key(&project.files, table, &format!("new_{table}"));
    editor.dialogs.push(Dialog::NewRow(NewRowDialog {
        table: table.to_owned(),
        key,
        value,
        error: None,
        into,
    }));
}

pub fn new_row_body(editor: &mut Editor, ui: &mut Ui, dialog: &mut NewRowDialog) {
    ui.horizontal(|ui| {
        ui.label("Key");
        ui.text_edit_singleline(&mut dialog.key);
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
    if let Some((file, pointer)) = &dialog.into {
        ui.label(
            RichText::new(format!("Written into {file} at {pointer}"))
                .weak()
                .small(),
        );
    }
    if let Some(error) = &dialog.error {
        ui.colored_label(egui::Color32::from_rgb(220, 80, 80), error);
    }
}

pub fn create(editor: &mut Editor, dialog: &NewRowDialog) -> Result<(), String> {
    let key = dialog.key.trim().to_owned();
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(problem) = key_problem(&project.files, &dialog.table, &key) {
        return Err(problem);
    }
    let mut edit = Edit::new(format!("New {} {key}", dialog.table));
    edit.write_json(row_file(&dialog.table, &key), &dialog.value);
    if let Some((file, pointer)) = &dialog.into
        && let Some(mut target) = project.files.json(file)
    {
        if let Some(slot) = target.pointer_mut(pointer) {
            *slot = Value::String(key.clone());
        }
        edit.write_json(file, &target);
    }
    if !editor.apply(edit) {
        return Err("the folder refused the new row; see the output".to_owned());
    }
    editor.select(Selection::row(&dialog.table, &key));
    editor.open_tab(Tab::for_row(&dialog.table, &key));
    Ok(())
}

pub fn duplicate(editor: &mut Editor, table: &str, key: &str) {
    let Some(project) = &editor.project else {
        return;
    };
    let Some(value) = project.files.json(&row_file(table, key)) else {
        return;
    };
    let copy = free_key(&project.files, table, &format!("{key}_2"));
    let mut edit = Edit::new(format!("Duplicate {table}/{key} as {copy}"));
    edit.write_json(row_file(table, &copy), &value);
    for file in folder_files(project, table, key) {
        if let Some(bytes) = project.files.get(&file) {
            edit.write(
                file.replacen(
                    &format!("tables/{table}/{key}/"),
                    &format!("tables/{table}/{copy}/"),
                    1,
                ),
                bytes.clone(),
            );
        }
    }
    if table == "area" {
        crate::views::world::card_beside(project, &mut edit, key, &copy);
    }
    if editor.apply(edit) {
        editor.select(Selection::row(table, &copy));
        editor.open_tab(Tab::for_row(table, &copy));
    }
}

pub fn rename(editor: &mut Editor, table: &str, key: &str, new_key: &str) -> Result<(), String> {
    if new_key == key {
        return Ok(());
    }
    if editor.shapes.is_fixture(table, key) {
        return Err("fixtures keep their key: the engine names it in code".to_owned());
    }
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(problem) = key_problem(&project.files, table, new_key)
        && !(new_key.to_lowercase() == key.to_lowercase() && new_key.len() <= KEY_MAX)
    {
        return Err(problem);
    }
    let mut edit = Edit::new(format!("Rename {table}/{key} to {new_key}"));
    let usages = project.usages.of_row(table, key).to_vec();
    let mut by_file: std::collections::BTreeMap<String, Vec<Usage>> = Default::default();
    for usage in usages {
        by_file.entry(usage.file.clone()).or_default().push(usage);
    }
    let own = row_file(table, key);
    for (file, usages) in by_file {
        let Some(mut value) = project.files.json(&file) else {
            continue;
        };
        for usage in usages {
            rewrite(&mut value, &usage.pointer, &project.usages, &file, new_key);
        }
        if file == own {
            edit.write_json(row_file(table, new_key), &value);
        } else {
            edit.write_json(file, &value);
        }
    }
    if !edit
        .changes
        .iter()
        .any(|change| change.file == row_file(table, new_key))
    {
        let value = project.files.json(&own).ok_or("the row is gone")?;
        edit.write_json(row_file(table, new_key), &value);
    }
    edit.remove(own);
    for file in folder_files(project, table, key) {
        if let Some(bytes) = project.files.get(&file) {
            edit.write(
                file.replacen(
                    &format!("tables/{table}/{key}/"),
                    &format!("tables/{table}/{new_key}/"),
                    1,
                ),
                bytes.clone(),
            );
            edit.remove(file);
        }
    }
    let count = edit.changes.len();
    if !editor.apply(edit) {
        return Err("the rename was refused; see the output".to_owned());
    }
    editor.toast(format!(
        "Renamed {table}/{key} to {new_key}: {count} files rewritten"
    ));
    retarget_tabs(editor, table, key, new_key);
    if editor.selection.table == table {
        for selected in &mut editor.selection.keys {
            if selected == key {
                *selected = new_key.to_owned();
            }
        }
    }
    Ok(())
}

fn rewrite(
    value: &mut Value,
    pointer: &str,
    usages: &crate::usages::Usages,
    file: &str,
    new_key: &str,
) {
    let is_key = usages
        .in_file(file)
        .iter()
        .any(|reference| reference.pointer == pointer && reference.key);
    if is_key {
        let (parent, name) = split_pointer(pointer);
        if let Some(map) = value.pointer_mut(parent).and_then(Value::as_object_mut)
            && let Some(entry) = map.remove(&name)
        {
            map.insert(new_key.to_owned(), entry);
        }
    } else if let Some(slot) = value.pointer_mut(pointer) {
        *slot = Value::String(new_key.to_owned());
    }
}

fn split_pointer(pointer: &str) -> (&str, String) {
    let cut = pointer.rfind('/').unwrap_or(0);
    let name = pointer[cut + 1..].replace("~1", "/").replace("~0", "~");
    (&pointer[..cut], name)
}

fn retarget_tabs(editor: &mut Editor, table: &str, key: &str, new_key: &str) {
    for (_, tab) in editor.dock.iter_all_tabs_mut() {
        let fresh = match tab {
            Tab::Row { table: t, key: k } if t == table && k == key => Some(Tab::Row {
                table: t.clone(),
                key: new_key.to_owned(),
            }),
            Tab::Area { key: k } if table == "area" && k == key => Some(Tab::Area {
                key: new_key.to_owned(),
            }),
            Tab::Blueprint { key: k } if table == "blueprint" && k == key => Some(Tab::Blueprint {
                key: new_key.to_owned(),
            }),
            Tab::Model { key: k } if table == "model" && k == key => Some(Tab::Model {
                key: new_key.to_owned(),
            }),
            Tab::Tileset { key: k } if table == "tileset" && k == key => Some(Tab::Tileset {
                key: new_key.to_owned(),
            }),
            Tab::Script(owner) => owner.renamed(table, key, new_key).map(Tab::Script),
            _ => None,
        };
        if let Some(fresh) = fresh {
            *tab = fresh;
        }
    }
}

pub fn folder_files(project: &crate::project::Project, table: &str, key: &str) -> Vec<String> {
    project
        .files
        .paths_under(&format!("tables/{table}/{key}/"))
        .cloned()
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
        editor.toast("Fixture rows can't be deleted: the engine names them in code");
        return;
    }
    let Some(project) = &editor.project else {
        return;
    };
    let own: Vec<String> = keys.iter().map(|key| row_file(table, key)).collect();
    let mut groups: Vec<UsageGroup> = Vec::new();
    for key in &keys {
        for usage in project.usages.of_row(table, key) {
            if own.contains(&usage.file) {
                continue;
            }
            let (other_table, kind, entry) = kind_of(project, &usage.file, &usage.pointer);
            let removable = entry.is_some();
            let same_group = |group: &&mut UsageGroup| {
                group.table == other_table
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
                    table: other_table,
                    kind,
                    usages: vec![usage.clone()],
                    removable,
                    whole_modules: entry == Some(Entry::Module),
                    decision: if removable {
                        Decision::Remove
                    } else {
                        Decision::Repoint(String::new())
                    },
                }),
            }
        }
    }
    editor.dialogs.push(Dialog::Delete(DeleteDialog {
        table: table.to_owned(),
        keys,
        groups,
        error: None,
    }));
}

pub fn usage_groups(
    project: &crate::project::Project,
    table: &str,
    key: &str,
) -> Vec<(String, String, Vec<String>)> {
    let mut groups: Vec<(String, String, Vec<String>)> = Vec::new();
    for usage in project.usages.of_row(table, key) {
        let Some((other_table, other_key)) = row_of(&usage.file) else {
            continue;
        };
        let field = field_of(project, &usage.file, &usage.pointer);
        match groups
            .iter_mut()
            .find(|(t, f, _)| *t == other_table && *f == field)
        {
            Some((_, _, keys)) => {
                if !keys.iter().any(|k| k == other_key) {
                    keys.push(other_key.to_owned());
                }
            }
            None => groups.push((other_table.to_owned(), field, vec![other_key.to_owned()])),
        }
    }
    groups
}

pub fn field_of(project: &crate::project::Project, file: &str, pointer: &str) -> String {
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

fn kind_of(
    project: &crate::project::Project,
    file: &str,
    pointer: &str,
) -> (String, String, Option<Entry>) {
    let table = row_of(file)
        .map(|(table, _)| table)
        .unwrap_or("game")
        .to_owned();
    let kind = field_of(project, file, pointer);
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    if segments.contains(&"nodes") {
        return (table, kind, None);
    }
    let Some(at) = segments
        .iter()
        .rposition(|segment| segment.parse::<usize>().is_ok())
    else {
        return (table, kind, None);
    };
    if at == 0 {
        return (table, kind, Some(Entry::List));
    }
    if segments[at - 1] != "modules" {
        return (table, kind, Some(Entry::List));
    }
    let any_number = project
        .files
        .json(file)
        .and_then(|row| {
            row["modules"]
                .get(segments[at].parse::<usize>().unwrap_or(usize::MAX))
                .cloned()
        })
        .and_then(|module| game::systems::registry().module_rule(&table, &module))
        == Some(game::core::content::ModuleRule::AnyNumber);
    (table, kind, any_number.then_some(Entry::Module))
}

fn usage_detail(project: &crate::project::Project, file: &str, pointer: &str) -> String {
    let Some(row) = project.files.json(file) else {
        return String::new();
    };
    let parent = pointer
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let Some(entry) = row.pointer(parent).and_then(Value::as_object) else {
        return String::new();
    };
    let mut parts: Vec<String> = Vec::new();
    for (name, value) in entry {
        if format!("{parent}/{name}") == pointer || name == "type" {
            continue;
        }
        let text = match value {
            Value::Number(number) => match name.as_str() {
                "chance" => format!(
                    "{}%",
                    crate::forms::trim_number(number.as_f64().unwrap_or(0.0))
                ),
                "amount" | "count" | "times" => format!(
                    "× {}",
                    crate::forms::trim_number(number.as_f64().unwrap_or(0.0))
                ),
                _ => format!(
                    "{name} {}",
                    crate::forms::trim_number(number.as_f64().unwrap_or(0.0))
                ),
            },
            Value::String(text) => format!("{name} {text}"),
            Value::Bool(true) => name.clone(),
            _ => continue,
        };
        parts.push(text);
    }
    if entry.get("chance").is_none() && entry.contains_key("item") {
        parts.push("always".to_owned());
    }
    parts.join(" · ")
}

pub fn delete_body(editor: &mut Editor, ui: &mut Ui, dialog: &mut DeleteDialog) {
    use crate::ui::{theme, widgets};
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
        ui.label(theme::muted(format!("Used in {total} place{} in {rows} row{}. Nothing is deleted until every group has an answer.", plural(total), plural(rows))));
    }
    let candidates: Vec<String> = project
        .files
        .paths_under(&format!("tables/{}/", dialog.table))
        .filter_map(|file| row_of(file).map(|(_, key)| key.to_owned()))
        .filter(|key| !dialog.keys.contains(key))
        .collect();
    let details: Vec<Vec<(String, String)>> = dialog
        .groups
        .iter()
        .map(|group| {
            let mut lines: Vec<(String, String, usize)> = Vec::new();
            for usage in &group.usages {
                let row = row_of(&usage.file)
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
    egui::ScrollArea::vertical().max_height(440.0).show(ui, |ui| {
        for (index, group) in dialog.groups.iter_mut().enumerate() {
            let mut files: Vec<&String> = group.usages.iter().map(|usage| &usage.file).collect();
            files.sort();
            files.dedup();
            let kinds: Vec<String> = {
                let mut kinds: Vec<String> = group.usages.iter().map(|usage| field_of(project, &usage.file, &usage.pointer)).collect();
                kinds.sort();
                kinds.dedup();
                kinds
            };
            let title = if files.len() == 1 {
                let row = row_of(files[0]).map(|(t, k)| format!("{t}/{k}")).unwrap_or_else(|| files[0].clone());
                if kinds.len() == 1 && !kinds[0].is_empty() && kinds[0] != group.table { format!("{row} · {}", kinds[0].replace('_', " ")) } else { row }
            } else {
                format!("{} · {} {}s", group.kind.replace('_', " "), files.len(), group.table)
            };
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    widgets::badge(ui, if group.kind.is_empty() { &group.table } else { &group.kind });
                    ui.label(theme::strong(&title));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let mut repoint = matches!(group.decision, Decision::Repoint(_)) || !group.removable;
                        if group.removable {
                            let remove_label = if group.whole_modules {
                                format!("Remove the {} modules", group.kind.replace('_', " "))
                            } else if entries_word(&group.kind) == "from the bag" {
                                "Remove from the bag".to_owned()
                            } else {
                                format!("Remove the {}", entries_word(&group.kind))
                            };
                            let unpackable = dialog.table == "blueprint" && group.whole_modules;
                            let label = match group.decision {
                                Decision::Repoint(_) => "Replace with…".to_owned(),
                                Decision::Unpack => "Unpack into scenery".to_owned(),
                                _ => remove_label.clone(),
                            };
                            egui::ComboBox::from_id_salt(("decision", index)).selected_text(theme::mono(label).size(13.0)).show_ui(ui, |ui| {
                                if unpackable && ui.selectable_label(group.decision == Decision::Unpack, "Unpack into scenery").on_hover_text("Each placement becomes its parts, placed, and looks exactly the same").clicked() {
                                    group.decision = Decision::Unpack;
                                    repoint = false;
                                }
                                if ui.selectable_label(matches!(group.decision, Decision::Remove), &remove_label).clicked() {
                                    group.decision = Decision::Remove;
                                    repoint = false;
                                }
                                if ui.selectable_label(repoint, "Replace with…").clicked() && !repoint {
                                    group.decision = Decision::Repoint(String::new());
                                    repoint = true;
                                }
                            });
                        }
                        if repoint {
                            let mut picked = match &group.decision {
                                Decision::Repoint(key) => key.clone(),
                                _ => String::new(),
                            };
                            ui.allocate_ui_with_layout(egui::vec2(170.0, ui.spacing().interact_size.y), egui::Layout::left_to_right(egui::Align::Center), |ui| {
                                egui::ComboBox::from_id_salt(("repoint", index))
                                    .width(160.0)
                                    .selected_text(if picked.is_empty() { theme::muted("pick a replacement…").size(13.0) } else { theme::code(format!("{}/ {picked}", dialog.table)).size(13.0) })
                                    .show_ui(ui, |ui| {
                                        for candidate in &candidates {
                                            if ui.selectable_label(picked == *candidate, theme::mono(candidate)).clicked() {
                                                picked = candidate.clone();
                                            }
                                        }
                                    });
                            });
                            if !picked.is_empty() && group.decision != Decision::Repoint(picked.clone()) {
                                group.decision = Decision::Repoint(picked);
                            }
                            ui.label(theme::muted("Replace with").size(12.5));
                        }
                    });
                });
                ui.add_space(2.0);
                egui::Grid::new(("usages", index)).num_columns(2).spacing([14.0, 2.0]).show(ui, |ui| {
                    for (row, detail) in &details[index] {
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
            });
            ui.add_space(4.0);
        }
    });
    let files_removed = dialog.keys.len();
    let assets_named = dialog.keys.iter().any(|key| {
        project
            .usages
            .in_file(&row_file(&dialog.table, key))
            .iter()
            .any(|reference| reference.kind == game::core::content::id::LeafKind::Asset)
    });
    ui.add_space(4.0);
    let mut summary = format!(
        "{total} edit{} in {rows} row{} and {files_removed} deleted file{}, one undo step.",
        plural(total),
        plural(rows),
        plural(files_removed)
    );
    if dialog.groups.is_empty() {
        summary = format!(
            "{files_removed} deleted file{}, one undo step.",
            plural(files_removed)
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

fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}

fn entries_word(kind: &str) -> &'static str {
    match kind {
        "buys" | "sells" | "offers" | "stock" => "offers",
        "bag" | "inventory" | "start" => "from the bag",
        _ => "entries",
    }
}

pub fn delete(editor: &mut Editor, dialog: &DeleteDialog) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    if let Some(group) = dialog
        .groups
        .iter()
        .find(|group| group.decision == Decision::Undecided)
    {
        return Err(format!("decide what happens to {}", group.kind));
    }
    let mut edit = Edit::new(format!(
        "Delete {} {}",
        dialog.table,
        dialog.keys.join(", ")
    ));
    let mut by_file: std::collections::BTreeMap<String, Vec<(&Usage, &Decision)>> =
        Default::default();
    for group in &dialog.groups {
        for usage in &group.usages {
            by_file
                .entry(usage.file.clone())
                .or_default()
                .push((usage, &group.decision));
        }
    }
    for (file, mut entries) in by_file {
        let Some(mut value) = project.files.json(&file) else {
            continue;
        };
        entries.sort_by(|a, b| b.0.pointer.cmp(&a.0.pointer));
        for (usage, decision) in entries {
            match decision {
                Decision::Repoint(key) => {
                    rewrite(&mut value, &usage.pointer, &project.usages, &file, key)
                }
                Decision::Remove => remove_entry(&mut value, &usage.pointer),
                Decision::Unpack => unpack_entry(project, &mut value, &usage.pointer),
                Decision::Undecided => {}
            }
        }
        edit.write_json(file, &value);
    }
    for key in &dialog.keys {
        edit.remove(row_file(&dialog.table, key));
        for file in folder_files(project, &dialog.table, key) {
            edit.remove(file);
        }
    }
    if !editor.apply(edit) {
        return Err("the deletion was refused; see the output".to_owned());
    }
    for key in &dialog.keys {
        close_tabs(editor, &dialog.table, key);
    }
    if editor.selection.table == dialog.table {
        editor
            .selection
            .keys
            .retain(|key| !dialog.keys.contains(key));
    }
    editor.toast(format!(
        "Deleted {} {}",
        dialog.table,
        dialog.keys.join(", ")
    ));
    Ok(())
}

fn unpack_entry(project: &crate::project::Project, value: &mut Value, pointer: &str) {
    let Some(content) = project.content else {
        return;
    };
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let Some(at) = segments
        .iter()
        .rposition(|segment| segment.parse::<usize>().is_ok())
    else {
        return;
    };
    let parent = if at == 0 {
        String::new()
    } else {
        format!("/{}", segments[..at].join("/"))
    };
    let index: usize = segments[at].parse().expect("an index");
    let Some(list) = value.pointer_mut(&parent).and_then(Value::as_array_mut) else {
        return;
    };
    if index >= list.len() {
        return;
    }
    let parts = crate::views::area::placement::unpacked(content, &list[index]);
    list.remove(index);
    for (offset, part) in parts.into_iter().enumerate() {
        list.insert(index + offset, part);
    }
}

fn remove_entry(value: &mut Value, pointer: &str) {
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let Some(at) = segments
        .iter()
        .rposition(|segment| segment.parse::<usize>().is_ok())
    else {
        return;
    };
    let parent = format!("/{}", segments[..at].join("/"));
    let parent = if at == 0 { String::new() } else { parent };
    let index: usize = segments[at].parse().expect("an index");
    if let Some(list) = value.pointer_mut(&parent).and_then(Value::as_array_mut)
        && index < list.len()
    {
        list.remove(index);
    }
}

pub fn close_tabs(editor: &mut Editor, table: &str, key: &str) {
    let gone: Vec<Tab> = editor
        .dock
        .iter_all_tabs()
        .map(|(_, tab)| tab.clone())
        .filter(|tab| match tab {
            Tab::Row { table: t, key: k } => t == table && k == key,
            Tab::Area { key: k } => table == "area" && k == key,
            Tab::Blueprint { key: k } => table == "blueprint" && k == key,
            Tab::Model { key: k } => table == "model" && k == key,
            Tab::Tileset { key: k } => table == "tileset" && k == key,
            Tab::Script(owner) => owner.is_row(table, key),
            _ => false,
        })
        .collect();
    for tab in gone {
        if let Some(path) = editor.dock.find_tab(&tab) {
            editor.dock.remove_tab(path);
        }
    }
}
