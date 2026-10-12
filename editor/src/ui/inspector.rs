use std::collections::BTreeMap;

use egui::{Align, Color32, Layout, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::{theme, widgets};
use crate::app::{Compare, ConfirmAction, ConfirmDialog, Dialog, Editor, RightTab};
use crate::forms::{Changed, FormAction, FormCx};
use crate::project::{Edit, Selection, row_file, row_of};
use crate::schema::{self, Kind};
use crate::tabs::Tab;

const WIDE: f32 = 760.0;
const LEFT_COLUMN: f32 = 390.0;

/// What the preview tab plays: the action, the direction and whether it runs.
pub struct PreviewState {
    pub action: String,
    pub direction: String,
    pub playing: bool,
    pub started: f64,
}

impl Default for PreviewState {
    fn default() -> PreviewState {
        PreviewState {
            action: "idle".to_owned(),
            direction: "s".to_owned(),
            playing: true,
            started: 0.0,
        }
    }
}

/// The inspector panel: the selection as a form, a module of it, or an asset.
pub fn show(editor: &mut Editor, ui: &mut Ui) {
    if editor.panels.bottom == crate::app::BottomTab::History && editor.history_focus.is_some() {
        super::history::step_card(editor, ui);
        ui.add_space(8.0);
    }
    if editor.play.failure.is_some() {
        crate::play::failures_card(ui);
        ui.add_space(8.0);
    }
    let selection = editor.selection.clone();
    if editor.project.is_none() {
        return;
    }
    if selection.keys.is_empty() {
        if matches!(super::active_tab(editor), Some(Tab::World)) {
            crate::views::world::inspect_world(editor, ui);
            return;
        }
        ui.label(theme::muted(
            "Select a row, a module or a result to see it here.",
        ));
        return;
    }
    if selection.table == "asset" {
        show_asset(editor, ui, &selection.keys[0]);
        return;
    }
    let module_part = selection.parts.len() == 1
        && selection.parts[0]
            .strip_prefix("/modules/")
            .is_some_and(|rest| rest.parse::<usize>().is_ok())
        && !matches!(selection.table.as_str(), "area" | "blueprint");
    if !selection.parts.is_empty() && !module_part {
        crate::views::inspect_parts(editor, ui, &selection);
        return;
    }
    if selection.keys.len() == 1 {
        let (table, key) = (selection.table.clone(), selection.keys[0].clone());
        if table == "script" {
            crate::views::script::inspect_row(editor, ui, &key);
            return;
        }
        if let Some(Tab::Script(owner)) = super::active_tab(editor)
            && owner.is_row(&table, &key)
        {
            crate::views::script::inspect_parts(editor, ui, &selection);
            return;
        }
        if table == "area"
            && matches!(super::active_tab(editor), Some(Tab::Area { key: open }) if open == key)
        {
            crate::views::area::inspect::show(editor, ui, &key);
            return;
        }
        if table == "blueprint" {
            egui::ScrollArea::vertical()
                .id_salt(("inspector-blueprint", &key))
                .show(ui, |ui| {
                    crate::views::area::inspect::show_blueprint(editor, ui, &key, &[]);
                });
            return;
        }
        egui::ScrollArea::vertical()
            .id_salt(("inspector", &table, &key))
            .show(ui, |ui| {
                row_form(editor, ui, &table, &key, false);
            });
    } else {
        egui::ScrollArea::vertical()
            .id_salt(("inspector-rows", &selection.table))
            .show(ui, |ui| {
                show_rows(editor, ui, &selection, false);
            });
    }
}

/// The tabs the right panel offers for the selection.
pub fn right_tabs(editor: &Editor) -> Vec<(RightTab, String)> {
    let selection = &editor.selection;
    let mut tabs = Vec::new();
    let shown_in_centre = selection.parts.is_empty()
        && match super::active_tab(editor) {
            Some(Tab::Row { table, key }) => {
                selection.keys.len() == 1 && table == selection.table && key == selection.keys[0]
            }
            Some(Tab::Rows { table, keys }) => table == selection.table && keys == selection.keys,
            _ => false,
        };
    if selection.table == "input" && selection.parts.is_empty() && !selection.keys.is_empty() {
        tabs.push((RightTab::Conflicts, "Conflicts".to_owned()));
        if !shown_in_centre {
            tabs.push((RightTab::Inspector, "Inspector".to_owned()));
        }
    } else if has_preview(editor) {
        tabs.push((
            RightTab::Preview,
            if selection.table == "quest" {
                "Quest log".to_owned()
            } else {
                "Preview".to_owned()
            },
        ));
        if !shown_in_centre {
            tabs.push((RightTab::Inspector, "Inspector".to_owned()));
        }
    } else {
        tabs.push((RightTab::Inspector, "Inspector".to_owned()));
    }
    tabs.push((RightTab::UsedBy, "Used by".to_owned()));
    tabs
}

/// Whether the right panel offers a preview of the selection: rows drawn by a model.
pub fn has_preview(editor: &Editor) -> bool {
    let selection = &editor.selection;
    !selection.keys.is_empty()
        && selection.parts.is_empty()
        && matches!(
            selection.table.as_str(),
            "npc" | "player" | "model" | "item" | "quest" | "test_character"
        )
}

/// A row opened in its own tab: the first-class card beside its modules when there is room.
pub fn show_row_tab(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str) {
    egui::ScrollArea::vertical()
        .id_salt(("row-tab", table, key))
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(16, 10))
                .show(ui, |ui| {
                    row_form(editor, ui, table, key, ui.available_width() >= WIDE);
                });
        });
}

/// Several rows opened as one tab: their shared form.
pub fn show_rows_tab(editor: &mut Editor, ui: &mut Ui, table: &str, keys: &[String]) {
    egui::ScrollArea::vertical()
        .id_salt(("rows-tab", table))
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(16, 10))
                .show(ui, |ui| {
                    let selection = Selection::rows(table, keys.to_vec());
                    show_rows(editor, ui, &selection, ui.available_width() >= WIDE);
                });
        });
}

/// The same form in the panel: one column.
pub fn show_row(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str) {
    row_form(editor, ui, table, key, false);
}

fn row_form(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str, wide: bool) {
    let file = row_file(table, key);
    let Some(mut value) = editor.row_value(table, key) else {
        ui.label(theme::muted(format!("{file} is gone")));
        return;
    };
    let fixture = editor.shapes.is_fixture(table, key);
    let selected_module: Option<usize> = editor
        .selection
        .parts
        .first()
        .and_then(|part| part.strip_prefix("/modules/"))
        .and_then(|index| index.parse().ok());
    ui.horizontal(|ui| {
        ui.label(
            theme::muted(format!("{table}/{key}"))
                .monospace()
                .size(13.0),
        );
        if fixture {
            ui.label(theme::faint("🔒 fixture").size(12.0));
        }
        if !wide && !matches!(table, "world_map") {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui
                    .small_button("open")
                    .on_hover_text("Open in a tab")
                    .clicked()
                {
                    editor.open_tab(Tab::for_row(table, key));
                }
            });
        }
    });
    ui.add_space(4.0);
    let Some(shape) = editor.shapes.table(table) else {
        return;
    };
    let root = shape.shape.clone();
    let has_modules = root
        .get("properties")
        .and_then(|p| p.get("modules"))
        .is_some();
    let second_column = has_modules || table == "input";
    if fixture {
        editor.status.left.push(format!("{table}/{key}"));
        editor
            .status
            .left
            .push("fixture · required by the engine".to_owned());
    }
    let mut actions = Vec::new();
    let mut changed = Changed::default();
    let mut module_ops: Vec<ModuleOp> = Vec::new();
    let mut status: Option<String> = None;
    {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx {
            root: &root,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: speaker_of(table, key),
            owner_table: Some(table.to_owned()),
            owner_key: Some(key.to_owned()),
        };
        ui.push_id(("row", table, key), |ui| {
            let first_class = strip_modules(&root);
            if wide && second_column {
                ui.horizontal_top(|ui| {
                    ui.vertical(|ui| {
                        ui.set_width(LEFT_COLUMN);
                        changed = std::mem::take(&mut changed).or(first_class_card(
                            ui,
                            &mut cx,
                            table,
                            key,
                            fixture,
                            &first_class,
                            &mut value,
                        ));
                    });
                    ui.add_space(16.0);
                    ui.vertical(|ui| {
                        ui.set_width(ui.available_width().min(420.0));
                        if table == "input" {
                            changed = std::mem::take(&mut changed)
                                .or(bindings_section(ui, &mut cx, &mut value));
                        } else {
                            changed = std::mem::take(&mut changed).or(modules_column(
                                ui,
                                &mut cx,
                                table,
                                &mut value,
                                &mut module_ops,
                                selected_module,
                                &mut status,
                            ));
                        }
                    });
                });
            } else {
                changed = std::mem::take(&mut changed).or(first_class_card(
                    ui,
                    &mut cx,
                    table,
                    key,
                    fixture,
                    &first_class,
                    &mut value,
                ));
                if table == "input" {
                    ui.add_space(10.0);
                    changed =
                        std::mem::take(&mut changed).or(bindings_section(ui, &mut cx, &mut value));
                }
                if has_modules {
                    ui.add_space(10.0);
                    changed = std::mem::take(&mut changed).or(modules_column(
                        ui,
                        &mut cx,
                        table,
                        &mut value,
                        &mut module_ops,
                        selected_module,
                        &mut status,
                    ));
                }
            }
        });
    }
    if let Some(status) = status {
        editor.status.left.push(format!("{table}/{key}"));
        editor.status.left.push(status);
    }
    if !editor.form.status.is_empty() {
        editor
            .status
            .left
            .push(format!("{table}/{key} › {}", editor.form.status.remove(0)));
        editor.status.left.append(&mut editor.form.status);
    }
    for op in module_ops {
        match op {
            ModuleOp::Copy(index) => {
                let module = value["modules"][index].clone();
                editor.clipboard = Some(
                    serde_json::json!({ "rift": "modules", "table": table, "from": key, "modules": [module] }),
                );
                editor.toast("Module copied");
            }
            ModuleOp::Paste => paste_modules(editor, table, key, &mut value, &mut changed),
        }
    }
    if changed.is_some() {
        let what = changed.0.clone().unwrap_or_default();
        let label = format!(
            "Edit {table}/{key}{}",
            if what.is_empty() {
                String::new()
            } else {
                format!(" {}", what.trim_start_matches('/'))
            }
        );
        let mut edit = Edit::new(label);
        edit.write_json(&file, &value);
        editor.apply(edit);
    }
    for action in actions {
        act(editor, action, table, key);
    }
}

fn first_class_card(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    key: &str,
    fixture: bool,
    schema: &Value,
    value: &mut Value,
) -> Changed {
    let mut changed = Changed::default();
    let title = ["name", "title", "label"]
        .iter()
        .find_map(|field| value[*field].as_str().map(str::to_owned))
        .unwrap_or_else(|| key.to_owned());
    let title = if table == "input" {
        key.to_owned()
    } else {
        title
    };
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(
            ui,
            table,
            &title,
            if fixture { "fixture" } else { "first-class" },
            |ui| {
                if ui.button("Copy as JSON").clicked() {
                    ui.ctx()
                        .copy_text(serde_json::to_string_pretty(&*value).unwrap_or_default());
                    ui.close();
                }
                if ui.button("Duplicate").clicked() {
                    cx.actions
                        .push(FormAction::RowAction(crate::ui::browser::Action::Duplicate));
                    ui.close();
                }
                if !fixture
                    && ui
                        .add(egui::Button::new("Rename key…").shortcut_text("F2"))
                        .clicked()
                {
                    cx.actions
                        .push(FormAction::RowAction(crate::ui::browser::Action::Rename));
                    ui.close();
                }
                if ui.button("Show usages").clicked() {
                    cx.actions
                        .push(FormAction::RowAction(crate::ui::browser::Action::Usages));
                    ui.close();
                }
                if !fixture {
                    ui.separator();
                    if ui
                        .add(egui::Button::new("Delete…").shortcut_text("Del"))
                        .clicked()
                    {
                        cx.actions
                            .push(FormAction::RowAction(crate::ui::browser::Action::Delete));
                        ui.close();
                    }
                }
            },
        );
        ui.add_space(4.0);
        if fixture {
            ui.horizontal(|ui| {
                ui.allocate_ui_with_layout(
                    Vec2::new(crate::forms::LABEL_WIDTH, ui.spacing().interact_size.y),
                    Layout::left_to_right(Align::Center),
                    |ui| {
                        ui.label(theme::muted("key"));
                    },
                );
                egui::Frame::new()
                    .fill(theme::INPUT)
                    .stroke(egui::Stroke::new(1.0, theme::BORDER))
                    .corner_radius(4.0)
                    .inner_margin(egui::Margin::symmetric(6, 2))
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width() - 12.0);
                        ui.horizontal(|ui| {
                            ui.label(theme::faint("🔒"));
                            ui.label(theme::mono(key));
                        });
                    });
            });
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                ui.label(theme::muted("Named in code as").size(12.0));
                egui::Frame::new()
                    .fill(theme::INPUT)
                    .corner_radius(3.0)
                    .inner_margin(egui::Margin::symmetric(4, 1))
                    .show(ui, |ui| {
                        ui.label(theme::code(code_name(table, key)).size(12.0));
                    });
                ui.label(theme::muted(". Editable, never renamed or deleted.").size(12.0));
            });
        }
        if table == crate::views::model::TABLE {
            changed = crate::views::model::inspect::first_class_body(ui, cx, value);
            return;
        }
        if table == crate::views::tileset::TABLE {
            changed = crate::views::tileset::inspect::first_class_body(ui, cx, value);
            return;
        }
        let mut schema = schema.clone();
        if table == "input"
            && let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut)
        {
            properties.remove("bindings");
        }
        changed = crate::forms::object(ui, cx, &schema, value, "");
    });
    changed
}

/// An owner, its script and the node that offers or takes back a quest, with the owner's kind.
type Party = (String, String, String, String);

fn quest_parties(editor: &Editor, quest: &str) -> (Vec<Party>, Vec<Party>) {
    let mut givers = Vec::new();
    let mut turn_ins = Vec::new();
    let Some(project) = editor.project.as_ref() else {
        return (givers, turn_ins);
    };
    let files = &project.files;
    let mut scan = |table: &str, owner: String, module: &Value| {
        let (script_label, nodes) = match module["type"].as_str() {
            Some("inline_script") => ("inline script".to_owned(), module["nodes"].clone()),
            Some("shared_script") => {
                let name = module["script"].as_str().unwrap_or("").to_owned();
                (
                    format!("script/{name}"),
                    files
                        .json(&crate::project::row_file("script", &name))
                        .map(|row| row["nodes"].clone())
                        .unwrap_or(Value::Null),
                )
            }
            _ => return,
        };
        for (name, node) in nodes.as_object().into_iter().flatten() {
            let named = match &node["quest"] {
                Value::String(key) => Some(key.clone()),
                Value::Object(var) => var
                    .get("var")
                    .and_then(Value::as_str)
                    .and_then(|var| module["values"][var].as_str().map(str::to_owned)),
                _ => None,
            };
            if named.as_deref() != Some(quest) {
                continue;
            }
            let entry = (
                table.to_owned(),
                owner.clone(),
                script_label.clone(),
                name.clone(),
            );
            match node["type"].as_str() {
                Some("offer_quest") | Some("accept_quest") => givers.push(entry),
                Some("turn_in") => turn_ins.push(entry),
                _ => {}
            }
        }
    };
    let paths: Vec<String> = files.paths_under("tables/").cloned().collect();
    for path in paths {
        let Some((table, key)) = crate::project::row_of(&path) else {
            continue;
        };
        if table == "script" || table == "test_character" {
            continue;
        }
        let Some(row) = files.json(&path) else {
            continue;
        };
        for module in row["modules"].as_array().into_iter().flatten() {
            scan(table, format!("{table}/{key}"), module);
            if table == "area" {
                let object = module["name"]
                    .as_str()
                    .or(module["label"].as_str())
                    .unwrap_or("object");
                for script in module["scripts"].as_array().into_iter().flatten() {
                    scan("object", format!("{table}/{key} · {object}"), script);
                }
            }
        }
    }
    (givers, turn_ins)
}

/// GIVEN BY and TURNED IN AT, worked out from the scripts, under a quest's log card.
fn quest_parties_sections(editor: &mut Editor, ui: &mut Ui, quest: &str) {
    let (givers, turn_ins) = quest_parties(editor, quest);
    let mut open: Option<(String, String)> = None;
    for (title, rows, none) in [
        ("Given by · worked out", &givers, "no script offers it yet"),
        (
            "Turned in at · worked out",
            &turn_ins,
            "no script takes it back yet",
        ),
    ] {
        widgets::section(ui, title);
        if rows.is_empty() {
            ui.label(theme::muted(none).size(13.0));
        }
        for (table, owner, script, node) in rows {
            ui.horizontal(|ui| {
                widgets::badge(ui, table);
                let (owner_key, rest) = owner
                    .split_once(" · ")
                    .map(|(key, rest)| (key.to_owned(), Some(rest.to_owned())))
                    .unwrap_or((owner.clone(), None));
                if ui
                    .add(egui::Label::new(theme::mono(&owner_key).size(13.0)).sense(Sense::click()))
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    open = Some(
                        owner_key
                            .split_once('/')
                            .map(|(t, k)| (t.to_owned(), k.to_owned()))
                            .unwrap_or_default(),
                    );
                }
                if let Some(rest) = rest {
                    ui.label(theme::muted(rest).size(13.0));
                }
                ui.label(
                    theme::faint(format!("{script} · {node}"))
                        .size(12.5)
                        .monospace(),
                );
            });
        }
    }
    widgets::hint(
        ui,
        "A quest no script offers, or none takes back, doesn't load.",
    );
    if let Some((table, key)) = open.filter(|(table, _)| !table.is_empty()) {
        editor.select(crate::project::Selection::row(&table, &key));
        editor.open_tab(Tab::for_row(&table, &key));
    }
}

/// How the engine names a fixture row in code, for the lock's explanation.
fn code_name(table: &str, key: &str) -> String {
    fn pascal(text: &str) -> String {
        text.split(['_', '-'])
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    None => String::new(),
                }
            })
            .collect()
    }
    let kind = match table {
        "input" => "InputAction".to_owned(),
        _ => pascal(table),
    };
    format!("{kind}::{}", pascal(key))
}

enum ModuleOp {
    Copy(usize),
    Paste,
}

fn modules_column(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    value: &mut Value,
    ops: &mut Vec<ModuleOp>,
    selected: Option<usize>,
    status: &mut Option<String>,
) -> Changed {
    let Some(items) = cx.shapes.modules_of(table).cloned() else {
        return Changed::default();
    };
    let variants = match schema::kind(cx.root, &items) {
        Kind::Union(variants) => variants,
        _ => Vec::new(),
    };
    if !value["modules"].is_array() {
        value["modules"] = Value::Array(Vec::new());
    }
    let mut changed = Changed::default();
    let scripts_only = table == "area";
    let count = value["modules"].as_array().map_or(0, Vec::len);
    let shown = if scripts_only {
        value["modules"].as_array().map_or(0, |list| {
            list.iter()
                .filter(|m| m["type"].as_str().is_some_and(|t| t.ends_with("_script")))
                .count()
        })
    } else {
        count
    };
    ui.horizontal(|ui| {
        widgets::section_count(
            ui,
            if scripts_only {
                "Area scripts"
            } else {
                "Modules"
            },
            shown,
        );
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            let button = ui.add(
                egui::Button::new(RichText::new("+ Add module").color(Color32::WHITE))
                    .fill(theme::ACCENT)
                    .stroke(egui::Stroke::NONE),
            );
            let popup = egui::Popup::from_toggle_button_response(&button)
                .id(ui.id().with("add-module"))
                .width(330.0);
            popup.show(|ui| {
                if let Some(template) = add_module_popup(
                    ui,
                    cx,
                    table,
                    &variants,
                    value["modules"].as_array().expect("modules"),
                    scripts_only,
                    status,
                ) {
                    let list = value["modules"].as_array_mut().expect("modules");
                    list.push(template);
                    let path = format!("{table}/modules/{}", list.len() - 1);
                    cx.state.folded.remove(&path);
                    changed = Changed::at("/modules");
                    ui.close();
                }
            });
            if ui
                .small_button("Paste")
                .on_hover_text("Paste copied modules")
                .clicked()
            {
                ops.push(ModuleOp::Paste);
            }
        });
    });
    let free = free_singles(cx, table, &variants, value);
    if !free.is_empty() {
        ui.horizontal(|ui| {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(theme::faint(format!("{} still free", free.join(", "))).size(12.0));
            });
        });
    }
    if scripts_only {
        module_counts(ui, value);
    }
    let mut remove = None;
    let mut swap = None;
    let mut duplicate = None;
    let mut objectives = 0;
    for index in 0..count {
        let path = format!("/modules/{index}");
        let module = &mut value["modules"][index];
        let tag = module["type"].as_str().unwrap_or("module").to_owned();
        if scripts_only && !tag.ends_with("_script") {
            continue;
        }
        let is_script = tag.ends_with("_script");
        let summary = if is_script {
            script_summary(module)
        } else if table == "quest" && is_objective(&tag) {
            objectives += 1;
            format!("objective {objectives}")
        } else if let Some(condition) = module.get("condition") {
            let blocks = ["all", "any"]
                .iter()
                .find_map(|op| condition[op].as_array().map(Vec::len))
                .unwrap_or(1);
            format!(
                "condition · {blocks} {}",
                if blocks == 1 { "block" } else { "blocks" }
            )
        } else {
            summary_of(module)
        };
        let folded_key = format!("{table}{path}");
        let folded = match (
            cx.state.folded.contains(&folded_key),
            cx.state.unfolded.contains(&folded_key),
        ) {
            (true, _) => true,
            (false, true) => false,
            (false, false) => is_script && selected != Some(index),
        };
        let is_selected = selected == Some(index);
        widgets::card_frame(is_selected).show(ui, |ui| {
            ui.set_width(ui.available_width());
            let header = ui
                .horizontal(|ui| {
                    ui.label(theme::faint("≡"));
                    widgets::badge(ui, &tag);
                    ui.label(
                        theme::strong(if is_script {
                            tag.replace('_', " ")
                        } else {
                            tag.clone()
                        })
                        .monospace(),
                    );
                    if folded || !is_script {
                        ui.add(
                            egui::Label::new(
                                RichText::new(summary.to_uppercase())
                                    .size(11.0)
                                    .color(theme::MUTED),
                            )
                            .truncate(),
                        );
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.menu_button(theme::faint("…"), |ui| {
                            if ui.button("Copy").clicked() {
                                ops.push(ModuleOp::Copy(index));
                                ui.close();
                            }
                            if ui.button("Duplicate").clicked() {
                                duplicate = Some(index);
                                ui.close();
                            }
                            ui.separator();
                            if index > 0 && ui.button("Move up").clicked() {
                                swap = Some((index, index - 1));
                                ui.close();
                            }
                            if index + 1 < count && ui.button("Move down").clicked() {
                                swap = Some((index, index + 1));
                                ui.close();
                            }
                            ui.separator();
                            if ui.button("Remove").clicked() {
                                remove = Some(index);
                                ui.close();
                            }
                        });
                        ui.label(theme::faint(if folded { "▸" } else { "▾" }).size(11.0));
                    });
                })
                .response
                .interact(Sense::click());
            if header.clicked() {
                if folded {
                    cx.state.folded.remove(&folded_key);
                    cx.state.unfolded.insert(folded_key.clone());
                } else {
                    cx.state.unfolded.remove(&folded_key);
                    cx.state.folded.insert(folded_key.clone());
                }
            }
            if !folded {
                changed = std::mem::take(&mut changed)
                    .or(card_body(ui, cx, table, &variants, module, &path));
            }
        });
        if !folded && tag == "inline_script" {
            outline_block(ui, cx, &value["modules"][index]);
        }
        ui.add_space(2.0);
    }
    let list = value["modules"].as_array_mut().expect("modules");
    if let Some(index) = remove {
        list.remove(index);
        changed = Changed::at("/modules");
    }
    if let Some((a, b)) = swap {
        list.swap(a, b);
        changed = Changed::at("/modules");
    }
    if let Some(index) = duplicate {
        let copy = list[index].clone();
        list.insert(index + 1, copy);
        changed = Changed::at("/modules");
    }
    changed
}

/// A module card's fields under its header: the typed form, a shared script's declared values,
/// and what a script adds.
fn card_body(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    variants: &[schema::Variant],
    module: &mut Value,
    path: &str,
) -> Changed {
    ui.add_space(4.0);
    let mut changed = Changed::default();
    if let Some(variant) = schema::variant_of(variants, module) {
        let schema = match variant.tag.as_str() {
            "inline_script" => without_field(variant.schema, "nodes"),
            "shared_script" => without_field(variant.schema, "values"),
            _ => variant.schema.clone(),
        };
        let fieldless = schema["properties"]
            .as_object()
            .is_none_or(|fields| fields.keys().all(|name| name == "type"));
        if fieldless {
            widgets::hint(ui, fieldless_note(table, &variant.tag));
        } else {
            changed = changed.or(crate::forms::object(ui, cx, &schema, module, path));
        }
        if variant.tag == "shared_script" {
            changed = changed.or(script_values(ui, cx, module, path));
        }
    } else {
        changed = changed.or(crate::forms::raw_json(ui, cx, module, path));
    }
    script_extras(ui, cx, table, module, path);
    changed
}

/// The scripts of a placed object, each its own card, with a menu to add one.
pub fn script_cards(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    owner: &mut Value,
    field: &str,
    path: &str,
) -> Changed {
    let Some(items) = cx.shapes.modules_of(table).cloned() else {
        return Changed::default();
    };
    let variants: Vec<schema::Variant> = match schema::kind(cx.root, &items) {
        Kind::Union(variants) => variants
            .into_iter()
            .filter(|v| v.tag.ends_with("_script"))
            .collect(),
        _ => Vec::new(),
    };
    if !owner[field].is_array() {
        owner[field] = Value::Array(Vec::new());
    }
    let mut changed = Changed::default();
    let count = owner[field].as_array().map_or(0, Vec::len);
    let mut remove = None;
    let mut duplicate = None;
    for index in 0..count {
        let module_path = format!("{path}/{field}/{index}");
        let module = &mut owner[field][index];
        let tag = module["type"].as_str().unwrap_or("script").to_owned();
        widgets::card_frame(true).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label(theme::faint("≡"));
                widgets::badge(ui, &tag);
                ui.label(theme::strong(tag.replace('_', " ")).monospace());
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.menu_button(theme::faint("…"), |ui| {
                        if ui.button("Duplicate").clicked() {
                            duplicate = Some(index);
                            ui.close();
                        }
                        if ui.button("Remove").clicked() {
                            remove = Some(index);
                            ui.close();
                        }
                    });
                });
            });
            changed = std::mem::take(&mut changed).or(card_body(
                ui,
                cx,
                table,
                &variants,
                module,
                &module_path,
            ));
        });
        if tag == "inline_script" {
            outline_block(ui, cx, &owner[field][index]);
        }
        ui.add_space(2.0);
    }
    ui.horizontal(|ui| {
        let button = ui.add(
            egui::Button::new(RichText::new("+ Add script").color(theme::TEXT))
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(1.0, theme::BORDER)),
        );
        egui::Popup::from_toggle_button_response(&button)
            .id(ui.id().with(("add-script", path)))
            .width(300.0)
            .show(|ui| {
                for variant in &variants {
                    let description = match variant.tag.as_str() {
                        "inline_script" => "its nodes on this object",
                        _ => "names a script row",
                    };
                    if ui
                        .add(
                            egui::Button::new(format!(
                                "{}  ·  {description}",
                                variant.tag.replace('_', " ")
                            ))
                            .frame(false),
                        )
                        .clicked()
                    {
                        let template = schema::variant_template(cx.root, variant);
                        owner[field].as_array_mut().expect("scripts").push(template);
                        changed = Changed::at(&format!("{path}/{field}"));
                        ui.close();
                    }
                }
            });
    });
    let list = owner[field].as_array_mut().expect("scripts");
    if let Some(index) = remove {
        list.remove(index);
        changed = Changed::at(&format!("{path}/{field}"));
    }
    if let Some(index) = duplicate {
        let copy = list[index].clone();
        list.insert(index + 1, copy);
        changed = Changed::at(&format!("{path}/{field}"));
    }
    changed
}

fn module_counts(ui: &mut Ui, value: &Value) {
    let mut counts: BTreeMap<String, usize> = Default::default();
    for module in value["modules"].as_array().into_iter().flatten() {
        let kind = module["type"].as_str().unwrap_or("module");
        if kind.ends_with("_script") {
            continue;
        }
        *counts.entry(kind.to_owned()).or_default() += 1;
    }
    let text: Vec<String> = counts
        .iter()
        .map(|(kind, count)| format!("{count} {}", kind.replace('_', " ")))
        .collect();
    widgets::hint(
        ui,
        &format!(
            "Placed modules edit in the area view: {}.",
            if text.is_empty() {
                "none yet".to_owned()
            } else {
                text.join(", ")
            }
        ),
    );
}

/// The add-module menu: every module type the table takes, with a one-line description, the
/// at-most-one ones already present greyed with the reason; typing filters.
fn add_module_popup(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    variants: &[schema::Variant],
    list: &[Value],
    scripts_only: bool,
    status: &mut Option<String>,
) -> Option<Value> {
    let registry = game::systems::registry();
    let id = ui.id().with("add-module-filter");
    let mut filter = cx.state.drafts.get(&id).cloned().unwrap_or_default();
    let response = widgets::search_box(ui, &mut filter, "filter", None);
    if response.changed() {
        cx.state.drafts.insert(id, filter.clone());
    }
    if ui
        .ctx()
        .data(|d| d.get_temp::<bool>(id.with("fresh")))
        .is_none()
    {
        response.request_focus();
        ui.ctx().data_mut(|d| d.insert_temp(id.with("fresh"), true));
    }
    let needle = filter.to_lowercase();
    let mut picked = None;
    let mut blocked_count = 0;
    let mut offered = 0;
    egui::ScrollArea::vertical()
        .max_height(360.0)
        .show(ui, |ui| {
            for variant in variants {
                if scripts_only && !variant.tag.ends_with("_script") {
                    continue;
                }
                offered += 1;
                let template = schema::variant_template(cx.root, variant);
                let rule = registry.module_rule(table, &template);
                let present = list
                    .iter()
                    .any(|module| module["type"].as_str() == Some(variant.tag.as_str()));
                let at_most_one = rule == Some(game::core::content::ModuleRule::AtMostOne);
                let blocked = present && at_most_one;
                if blocked {
                    blocked_count += 1;
                }
                let title = variant.tag.replace('_', " ");
                if !needle.is_empty() && !variant.tag.contains(&needle) && !title.contains(&needle)
                {
                    continue;
                }
                let description = variant.schema["description"]
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| match variant.tag.as_str() {
                        "inline_script" => "any number · nodes in this row".to_owned(),
                        "shared_script" => "any number · names a script row".to_owned(),
                        _ if at_most_one => "at most one".to_owned(),
                        _ => "any number".to_owned(),
                    });
                let line = if blocked {
                    "at most one · already added".to_owned()
                } else {
                    description
                };
                let full = ui.available_rect_before_wrap();
                let (rect, response) = ui.allocate_exact_size(
                    Vec2::new(full.width(), 38.0),
                    if blocked {
                        Sense::hover()
                    } else {
                        Sense::click()
                    },
                );
                if response.hovered() && !blocked {
                    ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
                }
                let mut child = ui.new_child(
                    egui::UiBuilder::new()
                        .max_rect(rect.shrink2(Vec2::new(6.0, 3.0)))
                        .layout(Layout::left_to_right(Align::Center)),
                );
                if blocked {
                    child.add_enabled_ui(false, |ui| widgets::badge(ui, &variant.tag));
                } else {
                    widgets::badge(&mut child, &variant.tag);
                }
                child.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    ui.label(RichText::new(title).monospace().color(if blocked {
                        theme::FAINT
                    } else {
                        theme::TEXT
                    }));
                    ui.label(RichText::new(line).size(11.5).color(if blocked {
                        theme::FAINT
                    } else {
                        theme::MUTED
                    }));
                });
                if response.clicked() {
                    picked = Some(template);
                }
            }
        });
    *status = Some(format!(
        "{offered} module types for {table}{}",
        if blocked_count > 0 {
            format!(" · {blocked_count} at most one, already used")
        } else {
            String::new()
        }
    ));
    if picked.is_some() || ui.input(|i| i.key_pressed(egui::Key::Escape)) {
        cx.state.drafts.remove(&id);
        ui.ctx()
            .data_mut(|d| d.remove_temp::<bool>(id.with("fresh")));
        if picked.is_none() {
            ui.close();
        }
    }
    picked
}

/// What a script card adds under its fields: the events it answers, what it may do, and the
/// buttons to open or convert it; an inline script's outline, read-only.
fn script_extras(ui: &mut Ui, cx: &mut FormCx, table: &str, module: &Value, path: &str) {
    let tag = module["type"].as_str().unwrap_or("");
    if tag != "inline_script" && tag != "shared_script" {
        return;
    }
    let Some(pointer) = path.find("/modules/").map(|at| path[at..].to_owned()) else {
        return;
    };
    let key = cx.speaker.clone();
    let inline = tag == "inline_script";
    if inline {
        let count = module["nodes"].as_object().map_or(0, |nodes| nodes.len());
        let dialogue = module["nodes"].as_object().map_or(0, |nodes| {
            nodes.values().filter(|n| n["type"] == "dialogue").count()
        });
        widgets::kv_text(
            ui,
            "nodes",
            if dialogue > 0 {
                format!("{count} · {dialogue} dialogue")
            } else {
                count.to_string()
            },
        );
        let events: Vec<String> = module["nodes"]
            .as_object()
            .into_iter()
            .flat_map(|nodes| nodes.values())
            .filter(|node| node["type"] == "on")
            .filter_map(|node| node["event"].as_str().map(str::to_owned))
            .collect();
        widgets::kv_text(
            ui,
            "answers",
            if events.is_empty() {
                "nothing yet".to_owned()
            } else {
                events.join(" · ")
            },
        );
    }
    if let (Some(content), Some(owner_key)) =
        (cx.content, key.as_deref().or(path_owner_key(cx, table)))
        && content.has_built::<game::systems::script::RiftScripts>()
        && let Some(bound) =
            crate::views::script::panel::owner_row(&content, table, owner_key, &pointer)
    {
        let may = content
            .built::<game::systems::script::RiftScripts>()
            .may_do(bound.row);
        if !inline {
            let answers: Vec<&str> = may.answers.iter().map(|kind| kind.name()).collect();
            widgets::kv_text(
                ui,
                "answers",
                if answers.is_empty() {
                    "nothing".to_owned()
                } else {
                    answers.join(" · ")
                },
            );
        }
        let mut lines: Vec<String> = may
            .reaches
            .iter()
            .map(|reach| crate::views::script::panel::describe_reach(&content, reach))
            .collect();
        lines.sort();
        lines.dedup();
        if !may.dialogue.is_empty() {
            lines.push(format!("speaks {}", may.dialogue.join(", ")));
        }
        if !may.calls.is_empty() {
            lines.push(format!("runs {}", may.calls.join(", ")));
        }
        widgets::kv(ui, "may do", |ui| {
            ui.add(
                egui::Label::new(if lines.is_empty() {
                    theme::faint("nothing yet")
                } else {
                    theme::muted(lines.join(" · "))
                })
                .wrap(),
            );
        });
    }
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        if inline {
            if ui.button("→ Open script").clicked() {
                cx.actions.push(FormAction::OpenScript {
                    pointer: pointer.clone(),
                });
            }
            if ui
                .button("Make shared…")
                .on_hover_text("Move these nodes into a new script row")
                .clicked()
            {
                cx.actions.push(FormAction::OpenScript {
                    pointer: pointer.clone(),
                });
            }
        } else if let Some(script) = module["script"].as_str() {
            if ui.button("→ Open script").clicked() {
                cx.actions.push(FormAction::OpenRow {
                    table: "script".to_owned(),
                    key: script.to_owned(),
                });
            }
            if ui
                .button("Make inline")
                .on_hover_text("Copy the script's nodes into this row")
                .clicked()
            {
                cx.actions.push(FormAction::OpenRow {
                    table: "script".to_owned(),
                    key: script.to_owned(),
                });
            }
        }
    });
}

/// An inline script's nodes as a read-only outline under its card.
fn outline_block(ui: &mut Ui, cx: &mut FormCx, module: &Value) {
    let Some(nodes) = module["nodes"]
        .as_object()
        .filter(|nodes| !nodes.is_empty())
    else {
        return;
    };
    ui.add_space(4.0);
    widgets::section(ui, "Outline · read-only");
    let catalogue = crate::views::script::nodes::Catalogue::build(cx.root, cx.content);
    let rows = crate::views::script::nodes::outline(nodes, &catalogue);
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(8.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.spacing_mut().item_spacing.y = 2.0;
            for row in rows.iter().take(40) {
                let node = &nodes[&row.name];
                let kind = crate::views::script::nodes::kind(node);
                let summary = crate::views::script::nodes::summary(node);
                ui.horizontal(|ui| {
                    ui.add_space(14.0 * row.depth as f32);
                    if let Some(via) = &row.via {
                        ui.label(theme::code(format!("{via} →")).size(12.0));
                    }
                    let (glyph, colour) = node_glyph(kind);
                    ui.label(RichText::new(glyph).color(colour).size(12.0));
                    ui.label(theme::mono(kind).size(12.5).strong());
                    ui.label(theme::mono(&row.name).size(12.5).color(theme::CODE));
                    if !summary.is_empty() {
                        ui.label(
                            theme::muted(format!(
                                "· {}",
                                crate::views::script::nodes::clip(&summary, 60)
                            ))
                            .size(12.0),
                        );
                    }
                });
            }
            if rows.len() > 40 {
                ui.label(theme::faint(format!("… {} more", rows.len() - 40)));
            }
        });
}

/// How the outline marks a node: events as a dot, branches as a diamond, effects as a square.
fn node_glyph(kind: &str) -> (&'static str, Color32) {
    match kind {
        "on" => ("●", theme::WARN),
        "if" | "random" | "repeat" => ("◆", theme::ACCENT),
        "dialogue" => ("■", theme::CODE),
        "wait" | "set" | "run" | "return" => ("■", theme::MUTED),
        _ => ("■", theme::OK),
    }
}

/// A folded script card's summary: shared · its values, or the events an inline one answers · nodes.
fn script_summary(module: &Value) -> String {
    if module["type"] == "shared_script" {
        let mut parts = vec!["shared".to_owned()];
        if let Some(values) = module["values"]
            .as_object()
            .or_else(|| module["variables"].as_object())
        {
            for (name, value) in values {
                parts.push(format!(
                    "{name} {}",
                    value
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| value.as_f64().map(crate::forms::trim_number))
                        .unwrap_or_else(|| value.to_string())
                ));
            }
        } else if let Some(script) = module["script"].as_str() {
            parts.push(script.to_owned());
        }
        return parts.join(" · ");
    }
    let nodes = module["nodes"].as_object();
    let events: Vec<String> = nodes
        .into_iter()
        .flat_map(|nodes| nodes.values())
        .filter(|node| node["type"] == "on")
        .filter_map(|node| node["event"].as_str().map(str::to_owned))
        .collect();
    let count = nodes.map_or(0, |nodes| nodes.len());
    if events.is_empty() {
        format!("{count} nodes")
    } else {
        format!("{} · {count} nodes", events.join(", "))
    }
}

/// The key of the row a form edits, for owners that are not npcs: read back from the file path
/// the form was opened with.
fn path_owner_key<'a>(cx: &'a FormCx, _table: &str) -> Option<&'a str> {
    cx.owner_key.as_deref()
}

/// An input row's bindings: each as a key cap, and a field that captures the next key or click.
fn bindings_section(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> Changed {
    let mut changed = Changed::default();
    widgets::section(ui, "Bindings");
    if !value["bindings"].is_array() {
        value["bindings"] = Value::Array(Vec::new());
    }
    let mut remove = None;
    ui.horizontal_wrapped(|ui| {
        for (index, binding) in value["bindings"]
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
        {
            let (keys, kind) = binding_label(binding);
            egui::Frame::new()
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(4.0)
                .inner_margin(egui::Margin::symmetric(6, 3))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        widgets::key_hint(ui, &keys);
                        ui.label(theme::mono(kind).size(12.5));
                        if ui
                            .add(egui::Label::new(theme::faint("✕")).sense(Sense::click()))
                            .clicked()
                        {
                            remove = Some(index);
                        }
                    });
                });
        }
    });
    if let Some(index) = remove {
        value["bindings"]
            .as_array_mut()
            .expect("bindings")
            .remove(index);
        changed = Changed::at("/bindings");
    }
    let id = ui.id().with("capture");
    let capturing = ui.ctx().data(|d| d.get_temp::<bool>(id)).unwrap_or(false);
    ui.horizontal(|ui| {
        let response = egui::Frame::new()
            .fill(theme::INPUT)
            .stroke(egui::Stroke::new(
                1.0,
                if capturing {
                    theme::ACCENT
                } else {
                    theme::BORDER
                },
            ))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(8, 4))
            .show(ui, |ui| {
                ui.set_width(ui.available_width() - 60.0);
                ui.label(
                    theme::mono(if capturing {
                        "press a key or click…"
                    } else {
                        "+ add a binding"
                    })
                    .color(if capturing { theme::TEXT } else { theme::MUTED }),
                );
            })
            .response
            .interact(Sense::click());
        if response.clicked() && !capturing {
            ui.ctx().data_mut(|d| d.insert_temp(id, true));
        }
        if capturing && ui.button("Esc").clicked() {
            ui.ctx().data_mut(|d| d.insert_temp(id, false));
        }
    });
    if capturing {
        widgets::hint(ui, "Modifiers count: Ctrl I is a different binding from I.");
        let captured = ui.input(|i| {
            if i.key_pressed(egui::Key::Escape) {
                return Some(None);
            }
            for event in &i.events {
                match event {
                    egui::Event::Key {
                        key,
                        pressed: true,
                        modifiers,
                        ..
                    } => {
                        let name = key_code_name(*key);
                        return Some(Some(binding_json(
                            "key",
                            modifiers,
                            serde_json::json!({ "key": name }),
                        )));
                    }
                    egui::Event::PointerButton {
                        button,
                        pressed: true,
                        modifiers,
                        ..
                    } => {
                        let name = match button {
                            egui::PointerButton::Primary => "Left",
                            egui::PointerButton::Secondary => "Right",
                            egui::PointerButton::Middle => "Middle",
                            _ => "Left",
                        };
                        return Some(Some(binding_json(
                            "click",
                            modifiers,
                            serde_json::json!({ "button": name, "times": 1 }),
                        )));
                    }
                    _ => {}
                }
            }
            None
        });
        match captured {
            Some(Some(binding)) => {
                let list = value["bindings"].as_array_mut().expect("bindings");
                if !list.contains(&binding) {
                    list.push(binding);
                    changed = Changed::at("/bindings");
                }
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            Some(None) => {
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            None => {}
        }
    }
    let _ = cx;
    changed
}

fn binding_json(kind: &str, modifiers: &egui::Modifiers, mut fields: Value) -> Value {
    fields["type"] = Value::String(kind.to_owned());
    if modifiers.ctrl || modifiers.command {
        fields["ctrl"] = Value::Bool(true);
    }
    if modifiers.shift {
        fields["shift"] = Value::Bool(true);
    }
    if modifiers.alt {
        fields["alt"] = Value::Bool(true);
    }
    fields
}

/// A binding as a key cap and its kind: ("Ctrl I", "key"), ("Left", "click").
pub fn binding_label(binding: &Value) -> (String, String) {
    let mut parts: Vec<String> = Vec::new();
    if binding["ctrl"].as_bool().unwrap_or(false) {
        parts.push("Ctrl".to_owned());
    }
    if binding["shift"].as_bool().unwrap_or(false) {
        parts.push("Shift".to_owned());
    }
    if binding["alt"].as_bool().unwrap_or(false) {
        parts.push("Alt".to_owned());
    }
    let kind = binding["type"].as_str().unwrap_or("key").to_owned();
    let main = match kind.as_str() {
        "key" => binding["key"]
            .as_str()
            .unwrap_or("?")
            .trim_start_matches("Key")
            .trim_start_matches("Digit")
            .to_owned(),
        "any_key" => "any key".to_owned(),
        "mouse" | "click" | "drag" => binding["button"].as_str().unwrap_or("?").to_owned(),
        _ => "?".to_owned(),
    };
    parts.push(main);
    let kind = if kind == "click" && binding["times"].as_u64().unwrap_or(1) > 1 {
        "double click".to_owned()
    } else {
        kind.replace('_', " ")
    };
    (parts.join(" "), kind)
}

/// The engine's name for a key egui reports.
fn key_code_name(key: egui::Key) -> String {
    use egui::Key;
    let name = key.name();
    match key {
        Key::ArrowDown => "ArrowDown".to_owned(),
        Key::ArrowLeft => "ArrowLeft".to_owned(),
        Key::ArrowRight => "ArrowRight".to_owned(),
        Key::ArrowUp => "ArrowUp".to_owned(),
        Key::Escape => "Escape".to_owned(),
        Key::Tab => "Tab".to_owned(),
        Key::Backspace => "Backspace".to_owned(),
        Key::Enter => "Enter".to_owned(),
        Key::Space => "Space".to_owned(),
        Key::Insert => "Insert".to_owned(),
        Key::Delete => "Delete".to_owned(),
        Key::Home => "Home".to_owned(),
        Key::End => "End".to_owned(),
        Key::PageUp => "PageUp".to_owned(),
        Key::PageDown => "PageDown".to_owned(),
        Key::Comma => "Comma".to_owned(),
        Key::Period => "Period".to_owned(),
        Key::Minus => "Minus".to_owned(),
        Key::Equals => "Equal".to_owned(),
        Key::Semicolon => "Semicolon".to_owned(),
        Key::Quote => "Quote".to_owned(),
        Key::Slash => "Slash".to_owned(),
        Key::Backslash => "Backslash".to_owned(),
        Key::Backtick => "Backquote".to_owned(),
        Key::OpenBracket => "BracketLeft".to_owned(),
        Key::CloseBracket => "BracketRight".to_owned(),
        _ => {
            if name.len() == 1 && name.chars().all(|c| c.is_ascii_alphabetic()) {
                format!("Key{}", name.to_uppercase())
            } else if name.len() == 1 && name.chars().all(|c| c.is_ascii_digit()) {
                format!("Digit{name}")
            } else {
                name.to_owned()
            }
        }
    }
}

/// The Conflicts tab of an input row: other inputs bound to the same keys, and why the row is locked.
pub fn show_conflicts(editor: &mut Editor, ui: &mut Ui) {
    let selection = editor.selection.clone();
    let Some(key) = selection.keys.first() else {
        return;
    };
    let Some(value) = editor.row_value("input", key) else {
        return;
    };
    let Some(project) = &editor.project else {
        return;
    };
    for binding in value["bindings"].as_array().into_iter().flatten() {
        let (label, _) = binding_label(binding);
        widgets::section(ui, &format!("Also bound to {label}"));
        let others: Vec<String> = project
            .files
            .paths_under("tables/input/")
            .filter_map(|file| row_of(file).map(|(_, other)| (file.clone(), other.to_owned())))
            .filter(|(_, other)| other != key)
            .filter(|(file, _)| {
                project.files.json(file).is_some_and(|row| {
                    row["bindings"]
                        .as_array()
                        .is_some_and(|list| list.contains(binding))
                })
            })
            .map(|(_, other)| other)
            .collect();
        if others.is_empty() {
            widgets::hint(ui, &format!("No other input uses {label}."));
        } else {
            for other in others {
                ui.label(theme::mono(format!("input/{other}")).color(theme::WARN));
            }
            widgets::hint(ui, "Actions share a binding only where priority picks one.");
        }
    }
    if editor.shapes.is_fixture("input", key) {
        widgets::section(ui, "Why it is locked");
        widgets::hint(
            ui,
            "The engine reads this row by key, so every game must provide it. New Game ships one.",
        );
    }
}

/// The preview tab: the selected rows drawn by their model, any action and direction.
pub fn show_preview(editor: &mut Editor, ui: &mut Ui) {
    let selection = editor.selection.clone();
    let keys: Vec<String> = selection.keys.clone();
    if keys.is_empty() {
        return;
    }
    let several = keys.len() > 1;
    let columns = if several { 2 } else { 1 };
    let width = (ui.available_width() - if several { 8.0 } else { 0.0 }) / columns as f32;
    let height = if several { width * 0.7 } else { width * 0.72 };
    let now = ui.input(|i| i.time);
    let state = &editor.views.preview;
    let elapsed = if state.playing {
        now - state.started
    } else {
        0.0
    };
    let (action, direction) = (state.action.clone(), state.direction.clone());
    let mut nameplates: Vec<String> = Vec::new();
    egui::Grid::new("previews")
        .num_columns(columns)
        .spacing([8.0, 8.0])
        .show(ui, |ui| {
            for (index, key) in keys.iter().enumerate() {
                let Some(value) = editor.row_value(&selection.table, key) else {
                    continue;
                };
                draw_preview(
                    editor,
                    ui,
                    &selection.table,
                    key,
                    &value,
                    Vec2::new(width, height),
                    &action,
                    &direction,
                    elapsed as f32,
                    &mut nameplates,
                );
                if (index + 1) % columns == 0 {
                    ui.end_row();
                }
            }
        });
    if selection.table == "quest" && keys.len() == 1 {
        quest_parties_sections(editor, ui, &keys[0]);
    }
    if selection.table == "test_character" && keys.len() == 1 {
        crate::views::character::preview_extras(editor, ui, &keys[0]);
    }
    if matches!(selection.table.as_str(), "npc" | "player" | "model") {
        ui.horizontal(|ui| {
            let state = &mut editor.views.preview;
            egui::ComboBox::from_id_salt("preview-action")
                .selected_text(&state.action)
                .width(80.0)
                .show_ui(ui, |ui| {
                    for action in ["idle", "walk", "run", "attack", "death"] {
                        ui.selectable_value(&mut state.action, action.to_owned(), action);
                    }
                });
            egui::ComboBox::from_id_salt("preview-direction")
                .selected_text(&state.direction)
                .width(56.0)
                .show_ui(ui, |ui| {
                    for direction in ["s", "sw", "w", "nw", "n", "ne", "e", "se"] {
                        ui.selectable_value(&mut state.direction, direction.to_owned(), direction);
                    }
                });
            if ui.button(if state.playing { "⏸" } else { "▸" }).clicked() {
                state.playing = !state.playing;
                state.started = now;
            }
        });
        if editor.views.preview.playing {
            ui.ctx().request_repaint();
        }
    }
    ui.add_space(6.0);
    for key in &keys {
        show_usages_grouped(editor, ui, &selection.table, key, several);
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_preview(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    key: &str,
    value: &Value,
    size: Vec2,
    action: &str,
    direction: &str,
    elapsed: f32,
    nameplates: &mut Vec<String>,
) {
    let ctx = ui.ctx().clone();
    let Editor { project, form, .. } = editor;
    let Some(project) = project.as_ref() else {
        return;
    };
    let Some(content) = project.content else {
        return;
    };
    if table == "quest" {
        ui.vertical(|ui| {
            ui.set_width(size.x);
            quest_card(ui, &ctx, form, &project.files, content, key, size.x);
        });
        return;
    }
    let (rect, _) = ui.allocate_exact_size(size, Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 6.0, Color32::from_rgb(78, 128, 52));
    painter.rect_stroke(
        rect,
        6.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    if table == "item" {
        if let Some(path) = value["icon"].as_str()
            && let Some(thumb) = form.thumbnails.image(&ctx, &project.files, path)
        {
            let scale = (size.y * 0.5 / thumb.size[1].max(1) as f32).clamp(1.0, 6.0);
            let shown = Vec2::new(thumb.size[0] as f32 * scale, thumb.size[1] as f32 * scale);
            painter.image(
                thumb.texture.id(),
                egui::Rect::from_center_size(rect.center(), shown),
                egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                Color32::WHITE,
            );
        }
        return;
    }
    let model_key = match table {
        "model" => Some(key.to_owned()),
        "test_character" => Some(
            content
                .built::<game::systems::GameSettings>()
                .player
                .get(&content)
                .model
                .key(&content)
                .to_owned(),
        ),
        _ => value["model"].as_str().map(str::to_owned),
    };
    let Some(id) = model_key
        .and_then(|model_key| content.by_key::<game::systems::actor::bust::ModelDef>(&model_key))
    else {
        return;
    };
    let model = game::systems::actor::model(&content, id);
    let Some(thumb) = form
        .thumbnails
        .image(&ctx, &project.files, &model.sheet().0)
    else {
        return;
    };
    let action = match action {
        "walk" => game::systems::actor::Action::Walk,
        "run" => game::systems::actor::Action::Run,
        "attack" => game::systems::actor::Action::Attack,
        "death" => game::systems::actor::Action::Dead,
        _ => game::systems::actor::Action::Idle,
    };
    let dir = match direction {
        "sw" => game::core::math::Direction::SW,
        "w" => game::core::math::Direction::W,
        "nw" => game::core::math::Direction::NW,
        "n" => game::core::math::Direction::N,
        "ne" => game::core::math::Direction::NE,
        "e" => game::core::math::Direction::E,
        "se" => game::core::math::Direction::SE,
        _ => game::core::math::Direction::S,
    };
    let region = model.frame(
        action,
        dir,
        game::core::time::Seconds(elapsed),
        game::core::time::PlaybackRate(1.0),
    );
    let drawn = model.drawn_size(region);
    let scale = (size.y * 0.6 / drawn.height.max(1.0))
        .clamp(1.0, 4.0)
        .floor();
    let shown = Vec2::new(drawn.width * scale, drawn.height * scale);
    let feet = rect.center() + Vec2::new(0.0, size.y * 0.22);
    painter.add(egui::Shape::ellipse_filled(
        feet,
        Vec2::new(shown.x * 0.35, shown.x * 0.12),
        Color32::from_rgba_unmultiplied(0, 0, 0, 70),
    ));
    let sprite = egui::Rect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, shown.y * 5.0 / 6.0),
        feet + Vec2::new(shown.x / 2.0, shown.y / 6.0),
    );
    let tint = value["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|m| m["type"] == "tint")
        .and_then(|m| {
            m["rgba"].as_array().map(|rgba| {
                Color32::from_rgba_unmultiplied(
                    rgba[0].as_u64().unwrap_or(255) as u8,
                    rgba[1].as_u64().unwrap_or(255) as u8,
                    rgba[2].as_u64().unwrap_or(255) as u8,
                    rgba[3].as_u64().unwrap_or(255) as u8,
                )
            })
        })
        .unwrap_or(Color32::WHITE);
    let uv = crate::thumbs::uv(
        thumb.size,
        region.min().x,
        region.min().y,
        region.size.width,
        region.size.height,
    );
    painter.image(thumb.texture.id(), sprite, uv, tint);
    if let Some(name) = value["name"].as_str() {
        let colour = match attitude(Some(content), table, key, value) {
            Some(true) => game_colour(ui::tokens::palette::CRIMSON_80),
            _ => Color32::WHITE,
        };
        painter.text(
            sprite.center_top() - Vec2::new(0.0, 8.0),
            egui::Align2::CENTER_BOTTOM,
            name,
            egui::FontId::proportional(13.0),
            colour,
        );
        nameplates.push(name.to_owned());
    }
}

fn game_colour(colour: bevy::prelude::Color) -> Color32 {
    let srgba = colour.to_srgba();
    Color32::from_rgba_unmultiplied(
        (srgba.red * 255.0) as u8,
        (srgba.green * 255.0) as u8,
        (srgba.blue * 255.0) as u8,
        (srgba.alpha * 255.0) as u8,
    )
}

/// A quest as the game's quest card lays it out: icon and title, kinds and meta, objectives
/// with their counts, then the rewards it reveals.
fn quest_card(
    ui: &mut Ui,
    ctx: &egui::Context,
    form: &mut crate::forms::FormState,
    files: &crate::project::Files,
    content: game::core::content::Content,
    key: &str,
    width: f32,
) {
    use game::core::script::dialogue::Reveal;
    use game::systems::quest::{ActiveQuest, Parties, QuestDef};
    let Some(id) = content.by_key::<QuestDef>(key) else {
        return;
    };
    if !content.has_built::<game::systems::script::RiftScripts>() {
        return;
    }
    let def = id.get(&content);
    let parties = Parties::of(
        &content,
        content.built::<game::systems::script::RiftScripts>(),
    );
    let progress = def.progress(&content, &parties, &ActiveQuest::fresh(&content, id), None);
    let ink = Color32::from_rgb(236, 230, 214);
    let soft = Color32::from_rgba_unmultiplied(236, 230, 214, 150);
    let mut icon = |ui: &mut Ui, path: &str, size: f32| {
        if let Some(thumb) = form.thumbnails.image(ctx, files, path) {
            ui.add(egui::Image::from_texture((
                thumb.texture.id(),
                Vec2::splat(size),
            )));
        } else {
            ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
        }
    };
    egui::Frame::new()
        .fill(Color32::from_rgb(38, 32, 28))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(120, 96, 60)))
        .corner_radius(8.0)
        .inner_margin(14.0)
        .show(ui, |ui| {
            ui.set_width(width - 28.0);
            ui.spacing_mut().item_spacing.y = 8.0;
            ui.horizontal(|ui| {
                icon(ui, &def.icon(&content).0, 28.0);
                ui.label(RichText::new(&def.title).size(17.0).color(ink).strong());
            });
            ui.label(
                RichText::new(format!("{} · {}", def.kinds(), def.meta(&parties, id)))
                    .size(12.0)
                    .color(soft),
            );
            ui.label(RichText::new(&def.blurb).size(13.0).color(ink));
            ui.label(RichText::new("OBJECTIVES").size(11.0).color(soft));
            for (objective, progress) in def.objectives().zip(&progress) {
                ui.horizontal(|ui| {
                    icon(ui, &objective.icon(&content).0, 20.0);
                    ui.label(RichText::new(&progress.label).size(13.0).color(ink));
                    if progress.counted {
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            ui.label(
                                RichText::new(format!("{} / {}", progress.have, progress.need))
                                    .size(12.5)
                                    .color(ink),
                            );
                        });
                    }
                });
            }
            if def.reveals(Reveal::Gains) {
                ui.label(RichText::new("REWARDS").size(11.0).color(soft));
                ui.horizontal_wrapped(|ui| {
                    if def.xp > 0 {
                        widgets::chip_coloured(
                            ui,
                            &format!("{} XP", def.xp),
                            Color32::TRANSPARENT,
                            ink,
                        );
                    }
                    for stack in def.rewards() {
                        let item = stack.item.get(&content);
                        ui.horizontal(|ui| {
                            icon(ui, &item.icon.0, 16.0);
                            let label = if stack.count == 1 {
                                item.name.clone()
                            } else {
                                format!("{} ×{}", item.name, stack.count)
                            };
                            widgets::chip_coloured(ui, &label, Color32::TRANSPARENT, ink);
                        });
                    }
                });
                if !def.pick_one().is_empty() {
                    ui.label(
                        RichText::new("PICK ONE WHEN YOU RETURN")
                            .size(11.0)
                            .color(soft),
                    );
                    ui.horizontal(|ui| {
                        for stack in def.pick_one() {
                            icon(ui, &stack.item.get(&content).icon.0, 28.0);
                        }
                    });
                }
            }
            ui.label(
                RichText::new("Accept or decline in the conversation")
                    .size(12.0)
                    .color(soft),
            );
        });
    widgets::hint(ui, "Laid out as the game's quest card, from the same data.");
}

/// Whether the row's scripts may set it hostile (true) or friendly (false), by the engine's reading.
fn attitude(
    content: Option<game::core::content::Content>,
    table: &str,
    key: &str,
    value: &Value,
) -> Option<bool> {
    let content = content?;
    if !content.has_built::<game::systems::script::RiftScripts>() {
        return None;
    }
    let scripts = content.built::<game::systems::script::RiftScripts>();
    let mut friendly = false;
    for (index, module) in value["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
    {
        if !module["type"]
            .as_str()
            .is_some_and(|tag| tag.ends_with("_script"))
        {
            continue;
        }
        let Some(bound) = crate::views::script::panel::owner_row(
            &content,
            table,
            key,
            &format!("/modules/{index}"),
        ) else {
            continue;
        };
        for reach in scripts.may_do(bound.row).reaches {
            match reach {
                game::systems::script::Reach::Hostile => return Some(true),
                game::systems::script::Reach::Friendly => friendly = true,
                _ => {}
            }
        }
    }
    friendly.then_some(false)
}

/// The Used by tab: every row naming the selection, grouped by where it does.
pub fn show_used_by(editor: &mut Editor, ui: &mut Ui) {
    let selection = editor.selection.clone();
    if selection.table == "asset" {
        if let Some(path) = selection.keys.first() {
            show_asset_usages(editor, ui, path);
        }
        return;
    }
    let Some(key) = selection.keys.first().cloned() else {
        ui.label(theme::muted("Select a row to see who uses it."));
        return;
    };
    show_usages_grouped(editor, ui, &selection.table, &key, selection.keys.len() > 1);
}

/// "USED BY · 3": the rows naming a row, one line per file and module kind with a count.
pub fn show_usages_grouped(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str, titled: bool) {
    let Some(project) = &editor.project else {
        return;
    };
    let mut groups: Vec<(String, String, usize)> = Vec::new();
    let mut total = 0;
    for usage in project.usages.of_row(table, key) {
        total += 1;
        let kind = crate::rows::field_of(project, &usage.file, &usage.pointer);
        let file = row_of(&usage.file)
            .map(|(t, k)| format!("{t}/{k}"))
            .unwrap_or_else(|| usage.file.clone());
        match groups.iter_mut().find(|(f, k, _)| *f == file && *k == kind) {
            Some((_, _, count)) => *count += 1,
            None => groups.push((file, kind, 1)),
        }
    }
    let heading = if titled {
        format!("Used by · {key}")
    } else {
        "Used by".to_owned()
    };
    widgets::section_count(ui, &heading, total);
    if groups.is_empty() {
        widgets::hint(ui, "nothing names this row");
    }
    let mut open = None;
    for (file, kind, count) in &groups {
        let response = ui
            .horizontal(|ui| {
                let (row_table, _) = file.split_once('/').unwrap_or((file.as_str(), ""));
                widgets::badge(ui, if kind.is_empty() { row_table } else { kind });
                if !kind.is_empty() && kind != file {
                    ui.label(theme::mono(kind).size(13.0));
                    ui.label(theme::faint("·"));
                }
                if *count > 1 {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(theme::muted(format!("× {count}")).monospace().size(12.0));
                        ui.add(
                            egui::Label::new(theme::mono(file).size(13.0).color(theme::CODE))
                                .truncate(),
                        );
                    });
                } else {
                    ui.add(
                        egui::Label::new(theme::mono(file).size(13.0).color(theme::CODE))
                            .truncate(),
                    );
                }
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            open = Some(file.clone());
        }
    }
    if let Some(file) = open
        && let Some((table, key)) = file.split_once('/')
    {
        editor.select(Selection::row(table, key));
        editor.open_tab(Tab::for_row(table, key));
    }
}

fn show_asset(editor: &mut Editor, ui: &mut Ui, path: &str) {
    ui.label(theme::mono(format!("assets/{path}")).color(theme::CODE));
    let ctx = ui.ctx().clone();
    let (thumb, size) = {
        let Editor { project, form, .. } = editor;
        let Some(project) = project.as_ref() else {
            return;
        };
        let bytes = project
            .files
            .get(&format!("assets/{path}"))
            .map(|bytes| bytes.len())
            .unwrap_or(0);
        let thumb = if path.to_lowercase().ends_with(".png") {
            form.thumbnails.image(&ctx, &project.files, path)
        } else {
            None
        };
        (thumb, bytes)
    };
    ui.label(theme::muted(format!("{} KB", size / 1024)));
    if let Some(thumb) = thumb {
        let scale = ((ui.available_width() - 8.0) / thumb.size[0].max(1) as f32).min(4.0);
        ui.add(egui::Image::from_texture((
            thumb.texture.id(),
            egui::vec2(thumb.size[0] as f32 * scale, thumb.size[1] as f32 * scale),
        )));
        ui.label(theme::muted(format!(
            "{} × {} px",
            thumb.size[0], thumb.size[1]
        )));
    }
    ui.separator();
    show_asset_usages(editor, ui, path);
}

fn show_asset_usages(editor: &mut Editor, ui: &mut Ui, path: &str) {
    let usages: Vec<(String, String)> = editor
        .project
        .as_ref()
        .map(|project| {
            project
                .usages
                .of_asset(path)
                .iter()
                .map(|u| (u.file.clone(), u.pointer.clone()))
                .collect()
        })
        .unwrap_or_default();
    widgets::section_count(ui, "Used by", usages.len());
    if usages.is_empty() {
        widgets::hint(ui, "nothing names this file");
    }
    let mut open = None;
    for (file, pointer) in &usages {
        ui.horizontal(|ui| {
            if ui.link(theme::mono(file)).clicked() {
                open = Some(file.clone());
            }
            ui.label(theme::muted(pointer).monospace().size(12.0));
        });
    }
    if let Some(file) = open
        && let Some((table, key)) = row_of(&file)
    {
        editor.select(Selection::row(table, key));
        editor.open_tab(Tab::for_row(table, key));
    }
}

pub fn act(editor: &mut Editor, action: FormAction, table: &str, key: &str) {
    match action {
        FormAction::OpenRow { table, key } => {
            editor.select(Selection::row(&table, &key));
            editor.open_tab(Tab::for_row(&table, &key));
        }
        FormAction::OpenScript { pointer } => {
            crate::views::script::open_inline(editor, table, key, &pointer);
        }
        FormAction::PickPlace { path } => {
            editor.pick = Some(crate::app::PickRequest {
                what: crate::app::PickWhat::Place {
                    file: row_file(table, key),
                    pointer: path,
                },
                area: None,
            });
            editor.toast(
                "Click a walkable cell on an area to pick the place (Alt-click for any point)",
            );
        }
        FormAction::NewRow {
            table: into_table,
            path,
        } => {
            crate::rows::new_row_into(editor, &into_table, Some((row_file(table, key), path)));
        }
        FormAction::RowAction(action) => crate::ui::browser::act(editor, table, key, action),
    }
}

/// A shared script's values as the typed fields its script row declares (L6): one per variable.
fn script_values(ui: &mut Ui, cx: &mut FormCx, module: &mut Value, path: &str) -> Changed {
    let Some(script) = module["script"].as_str().map(str::to_owned) else {
        return Changed::default();
    };
    let Some(row) = cx.files.json(&row_file("script", &script)) else {
        return Changed::default();
    };
    let Some(variables) = row["variables"].as_object() else {
        return Changed::default();
    };
    if variables.is_empty() {
        return Changed::default();
    }
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for (name, variable) in variables {
        let kind = match variable["type"].as_str().unwrap_or("text") {
            "number" => serde_json::json!({ "type": "number" }),
            "integer" => serde_json::json!({ "type": "integer" }),
            "boolean" => serde_json::json!({ "type": "boolean" }),
            "row" => {
                serde_json::json!({ "type": "string", "x-table": variable["table"].as_str().unwrap_or_default() })
            }
            "audio" => serde_json::json!({ "type": "string", "x-asset": "audio" }),
            "place" => {
                serde_json::json!({ "type": "object", "x-place": true, "properties": { "area": { "type": "string", "x-table": "area" }, "x": { "type": "number" }, "y": { "type": "number" } }, "required": ["area", "x", "y"] })
            }
            "condition" => serde_json::json!({ "x-condition": true }),
            _ => serde_json::json!({ "type": "string" }),
        };
        properties.insert(name.clone(), kind);
        if variable.get("default").is_none() {
            required.push(Value::String(name.clone()));
        }
    }
    let schema =
        serde_json::json!({ "type": "object", "properties": properties, "required": required });
    if !module["values"].is_object() {
        module["values"] = Value::Object(serde_json::Map::new());
    }
    crate::forms::object(
        ui,
        cx,
        &schema,
        &mut module["values"],
        &format!("{path}/values"),
    )
}

/// A card's schema without one field: an inline script's nodes belong to the script view, a
/// shared script's values to its declared variables.
pub fn without_field(schema: &Value, field: &str) -> Value {
    let mut copy = schema.clone();
    if let Some(properties) = copy.get_mut("properties").and_then(Value::as_object_mut) {
        properties.remove(field);
    }
    if let Some(required) = copy.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|name| name != field);
    }
    copy
}

fn speaker_of(table: &str, key: &str) -> Option<String> {
    (table == "npc").then(|| key.to_owned())
}

fn strip_modules(root: &Value) -> Value {
    let mut first = root.clone();
    if let Some(properties) = first.get_mut("properties").and_then(Value::as_object_mut) {
        properties.remove("modules");
    }
    if let Some(required) = first.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|name| name != "modules");
    }
    first
}

/// A folded module card's summary: its first few string and number fields.
/// A quest module that the game counts towards the quest, as against its conditions and rewards.
fn is_objective(tag: &str) -> bool {
    !matches!(
        tag,
        "shown"
            | "requires"
            | "grants"
            | "hand_in"
            | "hand_over"
            | "reward"
            | "pick_one"
            | "daily"
            | "time_limit"
            | "drop"
            | "inline_script"
            | "shared_script"
    )
}

pub fn summary_of(module: &Value) -> String {
    let Some(object) = module.as_object() else {
        return String::new();
    };
    let mut parts = Vec::new();
    if object.get("type").and_then(Value::as_str) == Some("bust") {
        let own = object
            .get("own")
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        return format!(
            "{} expressions",
            crate::views::model::busts::GENERIC.len() + own
        );
    }
    for (name, field) in object {
        if name == "type" {
            continue;
        }
        match field {
            Value::String(text) => parts.push(text.clone()),
            Value::Number(number) => parts.push(match name.as_str() {
                "count" | "amount" | "times" => format!(
                    "× {}",
                    crate::forms::trim_number(number.as_f64().unwrap_or(0.0))
                ),
                _ => format!(
                    "{name} {}",
                    crate::forms::trim_number(number.as_f64().unwrap_or(0.0))
                ),
            }),
            Value::Array(items) => parts.push(format!("{} {name}", items.len())),
            Value::Object(nodes) if name == "nodes" => parts.push(format!("{} nodes", nodes.len())),
            Value::Object(fields) if fields.contains_key("type") => {
                parts.push(crate::condition::summary(field))
            }
            _ => {}
        }
        if parts.len() >= 3 {
            break;
        }
    }
    parts.join(" · ")
}

/// A module as lines for a comparison: `xp 14`, then one line per list entry.
pub fn module_lines(module: &Value) -> String {
    fn scalar(name: &str, value: &Value) -> String {
        match value {
            Value::String(text) => text.clone(),
            Value::Number(number) => {
                let number = crate::forms::trim_number(number.as_f64().unwrap_or(0.0));
                if name == "chance" {
                    format!("{number}%")
                } else {
                    number
                }
            }
            other => other.to_string(),
        }
    }
    let mut lines: Vec<String> = Vec::new();
    for (name, field) in module.as_object().into_iter().flatten() {
        if name == "type" {
            continue;
        }
        match field {
            Value::Array(items) => {
                for item in items {
                    match item.as_object() {
                        Some(fields) => {
                            let mut cells: Vec<String> = fields
                                .iter()
                                .map(|(name, value)| scalar(name, value))
                                .collect();
                            if fields.contains_key("item") && !fields.contains_key("amount") {
                                cells.insert(1, "1".to_owned());
                            }
                            lines.push(cells.join("  "));
                        }
                        None => lines.push(item.to_string()),
                    }
                }
            }
            Value::Object(_) => lines.push(format!("{name} …")),
            other => lines.push(format!("{name} {}", scalar(name, other))),
        }
    }
    lines.join("\n")
}

fn paste_modules(
    editor: &mut Editor,
    table: &str,
    key: &str,
    value: &mut Value,
    changed: &mut Changed,
) {
    let Some(clip) = editor.clipboard.clone() else {
        editor.toast("Nothing copied");
        return;
    };
    if clip["rift"] != "modules" {
        editor.toast("The clipboard holds no modules");
        return;
    }
    let from = clip["from"].as_str().unwrap_or("the clipboard").to_owned();
    let registry = game::systems::registry();
    for module in clip["modules"].as_array().into_iter().flatten() {
        let tag = module["type"].as_str().unwrap_or("module").to_owned();
        let Some(rule) = registry.module_rule(table, module) else {
            editor.toast(format!("a {table} row takes no {tag} module"));
            continue;
        };
        let list = value["modules"].as_array_mut().expect("modules");
        let existing = list
            .iter()
            .position(|known| known["type"] == module["type"]);
        match (rule, existing) {
            (game::core::content::ModuleRule::AtMostOne, Some(index)) => {
                editor.dialogs.push(Dialog::Confirm(ConfirmDialog {
                    title: format!("{table}/{key} already has {tag}"),
                    body: format!(
                        "A {table} has at most one {tag} module. Replace it with {from}'s?"
                    ),
                    label: format!("Replace {tag}"),
                    compare: Some(Compare {
                        left_title: format!("{key} now"),
                        left: module_lines(&list[index]),
                        right_title: format!("copied from {from}"),
                        right: module_lines(module),
                    }),
                    action: ConfirmAction::ReplaceModule {
                        table: table.to_owned(),
                        key: key.to_owned(),
                        index,
                        module: module.clone(),
                    },
                }));
            }
            _ => {
                list.push(module.clone());
                *changed = Changed::at("/modules");
            }
        }
    }
}

/// Several rows of one table as one form: fields that agree edit together, modules every row has
/// edit together where they agree.
fn show_rows(editor: &mut Editor, ui: &mut Ui, selection: &Selection, wide: bool) {
    let table = selection.table.clone();
    let values: Vec<(String, Value)> = selection
        .keys
        .iter()
        .filter_map(|key| {
            editor
                .row_value(&table, key)
                .map(|value| (key.clone(), value))
        })
        .collect();
    let Some(shape) = editor.shapes.table(&table) else {
        return;
    };
    let root = shape.shape.clone();
    let first_class = strip_modules(&root);
    let mut edits: Vec<(String, Value)> = Vec::new();
    let mut actions = Vec::new();
    let mut add_to_all: Option<Value> = None;
    let mut status: Option<String> = None;
    ui.horizontal_wrapped(|ui| {
        for (key, _) in &values {
            let response = widgets::chip(ui, key);
            if response.clicked() {
                actions.push(FormAction::OpenRow {
                    table: table.clone(),
                    key: key.clone(),
                });
            }
        }
    });
    ui.add_space(6.0);
    {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx {
            root: &root,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: None,
            owner_table: Some(table.clone()),
            owner_key: None,
        };
        let shared_card = |ui: &mut Ui, cx: &mut FormCx, edits: &mut Vec<(String, Value)>| {
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(
                    ui,
                    &table,
                    &format!("{} {}s", values.len(), table),
                    "shared fields",
                    |_| {},
                );
                ui.add_space(4.0);
                for (name, field) in schema::properties(&first_class) {
                    let distinct: Vec<Value> = {
                        let mut seen: Vec<Value> = Vec::new();
                        for (_, value) in &values {
                            let v = value.get(name).cloned().unwrap_or(Value::Null);
                            if !seen.contains(&v) {
                                seen.push(v);
                            }
                        }
                        seen
                    };
                    let resolved = schema::resolve(cx.root, field);
                    if matches!(schema::kind(cx.root, resolved), Kind::Object)
                        && schema::marker(resolved).is_none()
                    {
                        widgets::section(ui, name);
                        for (sub_name, sub_field) in schema::properties(resolved) {
                            let distinct: Vec<Value> = {
                                let mut seen: Vec<Value> = Vec::new();
                                for (_, value) in &values {
                                    let v =
                                        value[name].get(sub_name).cloned().unwrap_or(Value::Null);
                                    if !seen.contains(&v) {
                                        seen.push(v);
                                    }
                                }
                                seen
                            };
                            shared_field(
                                ui,
                                cx,
                                &values,
                                &format!("/{name}/{sub_name}"),
                                sub_name,
                                sub_field,
                                &distinct,
                                edits,
                            );
                        }
                        continue;
                    }
                    shared_field(
                        ui,
                        cx,
                        &values,
                        &format!("/{name}"),
                        name,
                        field,
                        &distinct,
                        edits,
                    );
                }
            });
        };
        let modules_part = |ui: &mut Ui,
                            cx: &mut FormCx,
                            edits: &mut Vec<(String, Value)>,
                            add_to_all: &mut Option<Value>,
                            status: &mut Option<String>| {
            let Some(items) = cx.shapes.modules_of(&table).cloned() else {
                return;
            };
            let variants = match schema::kind(cx.root, &items) {
                Kind::Union(variants) => variants,
                _ => Vec::new(),
            };
            let tags = |value: &Value| -> Vec<String> {
                value["modules"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|m| m["type"].as_str().map(str::to_owned))
                    .collect()
            };
            let mut all: Option<Vec<String>> = None;
            let mut some: Vec<String> = Vec::new();
            for (_, value) in &values {
                let mine = tags(value);
                for tag in &mine {
                    if !some.contains(tag) {
                        some.push(tag.clone());
                    }
                }
                all = Some(match all {
                    None => mine,
                    Some(known) => known.into_iter().filter(|t| mine.contains(t)).collect(),
                });
            }
            let all = all.unwrap_or_default();
            widgets::section(ui, &format!("Modules in all {}", values.len()));
            for tag in &all {
                let firsts: Vec<(String, usize, Value)> = values
                    .iter()
                    .filter_map(|(key, value)| {
                        value["modules"].as_array().and_then(|list| {
                            list.iter()
                                .position(|m| m["type"].as_str() == Some(tag))
                                .map(|index| (key.clone(), index, list[index].clone()))
                        })
                    })
                    .collect();
                let agree = firsts.iter().all(|(_, _, module)| *module == firsts[0].2);
                widgets::card_frame(false).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    widgets::card_header(ui, tag, &tag.replace('_', " "), "", |_| {});
                    ui.add_space(4.0);
                    if agree {
                        let mut shared = firsts[0].2.clone();
                        let path = format!("/modules/{tag}");
                        let changed = match schema::variant_of(&variants, &shared) {
                            Some(variant) => crate::forms::object(
                                ui,
                                cx,
                                &without_field(variant.schema, "nodes"),
                                &mut shared,
                                &path,
                            ),
                            None => crate::forms::raw_json(ui, cx, &mut shared, &path),
                        };
                        if changed.is_some() {
                            for (key, index, _) in &firsts {
                                if let Some((_, value)) = values.iter().find(|(k, _)| k == key) {
                                    let mut next = value.clone();
                                    next["modules"][*index] = shared.clone();
                                    edits.push((key.clone(), next));
                                }
                            }
                        }
                    } else if tag == "shared_script" {
                        let mut by_script: BTreeMap<String, Vec<String>> = BTreeMap::new();
                        for (key, _, module) in &firsts {
                            by_script
                                .entry(module["script"].as_str().unwrap_or("?").to_owned())
                                .or_default()
                                .push(key.clone());
                        }
                        widgets::kv(ui, "script", |ui| {
                            ui.label(theme::muted(format!("{} values", by_script.len())).italics());
                        });
                        widgets::hint(
                            ui,
                            &by_script
                                .iter()
                                .map(|(script, keys)| format!("{script}: {}", keys.join(", ")))
                                .collect::<Vec<_>>()
                                .join(" · "),
                        );
                    } else {
                        widgets::hint(ui, "different in each row · open one row to edit its items");
                    }
                });
                ui.add_space(2.0);
            }
            if all.is_empty() {
                widgets::hint(ui, "none");
            }
            widgets::section(ui, "In some");
            let only_some: Vec<&String> = some.iter().filter(|tag| !all.contains(tag)).collect();
            if only_some.is_empty() {
                widgets::hint(ui, "none");
            } else {
                ui.horizontal_wrapped(|ui| {
                    for tag in only_some {
                        let holders = values
                            .iter()
                            .filter(|(_, value)| tags(value).contains(tag))
                            .count();
                        widgets::chip(ui, &format!("{tag} · {holders} of {}", values.len()));
                    }
                });
            }
            ui.add_space(6.0);
            let button = ui.button(format!("+ Add module to all {}", values.len()));
            egui::Popup::from_toggle_button_response(&button)
                .id(ui.id().with("add-all"))
                .width(330.0)
                .show(|ui| {
                    if let Some(template) =
                        add_module_popup(ui, cx, &table, &variants, &[], false, status)
                    {
                        *add_to_all = Some(template);
                        ui.close();
                    }
                });
        };
        if wide {
            ui.horizontal_top(|ui| {
                ui.vertical(|ui| {
                    ui.set_width(LEFT_COLUMN);
                    shared_card(ui, &mut cx, &mut edits);
                });
                ui.add_space(16.0);
                ui.vertical(|ui| {
                    ui.set_width(ui.available_width().min(420.0));
                    modules_part(ui, &mut cx, &mut edits, &mut add_to_all, &mut status);
                });
            });
        } else {
            shared_card(ui, &mut cx, &mut edits);
            ui.add_space(8.0);
            modules_part(ui, &mut cx, &mut edits, &mut add_to_all, &mut status);
        }
    }
    editor
        .status
        .left
        .push(format!("{} rows selected", values.len()));
    editor
        .status
        .left
        .push("an edit applies to every selected row".to_owned());
    if let Some(template) = add_to_all {
        let registry = game::systems::registry();
        let tag = template["type"].as_str().unwrap_or("module").to_owned();
        let mut skipped: Vec<String> = Vec::new();
        for (key, value) in &values {
            let present = value["modules"]
                .as_array()
                .is_some_and(|list| list.iter().any(|m| m["type"] == template["type"]));
            let blocked = present
                && registry.module_rule(&table, &template)
                    == Some(game::core::content::ModuleRule::AtMostOne);
            if blocked {
                skipped.push(key.clone());
                continue;
            }
            let mut next = value.clone();
            if !next["modules"].is_array() {
                next["modules"] = Value::Array(Vec::new());
            }
            next["modules"]
                .as_array_mut()
                .expect("modules")
                .push(template.clone());
            edits.push((key.clone(), next));
        }
        if !skipped.is_empty() {
            editor.toast(format!(
                "{tag} skipped on {}: already there, at most one",
                skipped.join(", ")
            ));
        }
    }
    if !edits.is_empty() {
        let mut edit = Edit::new(format!("Edit {} {table} rows", edits.len()));
        for (key, value) in &edits {
            edit.write_json(row_file(&table, key), value);
        }
        editor.apply(edit);
    }
    for action in actions {
        act(editor, action, &table, "");
    }
}

#[allow(clippy::too_many_arguments)]
fn shared_field(
    ui: &mut Ui,
    cx: &mut FormCx,
    values: &[(String, Value)],
    path: &str,
    name: &str,
    field: &Value,
    distinct: &[Value],
    edits: &mut Vec<(String, Value)>,
) {
    ui.horizontal(|ui| {
        ui.allocate_ui_with_layout(
            Vec2::new(crate::forms::LABEL_WIDTH, ui.spacing().interact_size.y),
            Layout::left_to_right(Align::Center),
            |ui| {
                ui.label(theme::muted(name).monospace().size(13.0));
            },
        );
        if distinct.len() == 1 {
            let mut shared = distinct[0].clone();
            ui.vertical(|ui| {
                ui.set_min_width(ui.available_width());
                if crate::forms::value(ui, cx, field, &mut shared, path).is_some() {
                    for (key, value) in values {
                        let mut next = value.clone();
                        if let Some(target) = next.pointer_mut(path) {
                            *target = shared.clone();
                        }
                        edits.push((key.clone(), next));
                    }
                }
            });
        } else {
            let listing: Vec<String> = values
                .iter()
                .map(|(key, value)| {
                    format!(
                        "{key}: {}",
                        value
                            .pointer(path)
                            .map(|v| v
                                .as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string()))
                            .unwrap_or_default()
                    )
                })
                .collect();
            let id = ui.id().with(path).with("set-all");
            let mut draft = cx.state.drafts.get(&id).cloned().unwrap_or_default();
            let response = egui::Frame::new()
                .fill(theme::INPUT)
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(4.0)
                .inner_margin(egui::Margin::symmetric(6, 2))
                .show(ui, |ui| {
                    ui.set_width(ui.available_width() - 12.0);
                    ui.add(
                        egui::TextEdit::singleline(&mut draft)
                            .frame(egui::Frame::NONE)
                            .hint_text(
                                RichText::new(format!("{} values", distinct.len())).italics(),
                            )
                            .desired_width(f32::INFINITY),
                    )
                });
            let response = response.inner.on_hover_text(listing.join("\n"));
            if response.changed() {
                cx.state.drafts.insert(id, draft.clone());
            }
            if crate::forms::committed(ui, &response) {
                cx.state.drafts.remove(&id);
                if !draft.trim().is_empty() {
                    let parsed: Value = serde_json::from_str(draft.trim())
                        .unwrap_or(Value::String(draft.trim().to_owned()));
                    for (key, value) in values {
                        let mut next = value.clone();
                        if let Some(target) = next.pointer_mut(path) {
                            *target = parsed.clone();
                        }
                        edits.push((key.clone(), next));
                    }
                }
            }
        }
    });
}

/// What a module without fields does: having it is the setting.
fn fieldless_note(table: &str, tag: &str) -> &'static str {
    match (table, tag) {
        ("model", "airborne") => {
            "No fields. Walks ignore blocked cells; wild ones keep out of safe zones."
        }
        _ => "No fields: having it is the setting.",
    }
}

/// The at-most-one modules a row could still add.
fn free_singles(
    cx: &FormCx,
    table: &str,
    variants: &[schema::Variant],
    value: &Value,
) -> Vec<String> {
    let registry = game::systems::registry();
    let list = value["modules"].as_array().cloned().unwrap_or_default();
    variants
        .iter()
        .filter(|variant| {
            let template = schema::variant_template(cx.root, variant);
            registry.module_rule(table, &template)
                == Some(game::core::content::ModuleRule::AtMostOne)
                && !list
                    .iter()
                    .any(|module| module["type"].as_str() == Some(variant.tag.as_str()))
        })
        .map(|variant| variant.tag.replace('_', " "))
        .collect()
}
