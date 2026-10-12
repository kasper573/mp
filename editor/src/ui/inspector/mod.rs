pub mod bindings;
pub mod preview;
pub mod quests;
pub mod rows;
pub mod scripts;
pub mod usages;

use std::collections::BTreeMap;

use egui::{Align, Color32, Layout, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use self::bindings::bindings_section;
use self::rows::{fieldless_note, free_singles, show_rows};
use self::scripts::{
    is_objective, module_lines, outline_block, script_extras, script_summary, script_values,
    speaker_of, summary_of,
};
use self::usages::show_asset;
use super::{theme, widgets};
use crate::app::{Compare, ConfirmAction, ConfirmDialog, Dialog, Editor, RightTab};
use crate::forms::{Changed, FormAction, FormCx};
use crate::project::{Edit, Selection, row_file};
use crate::schema::{self, Kind};
use crate::tabs::Tab;
use crate::value::RowValue;

const WIDE: f32 = 760.0;
pub(super) const LEFT_COLUMN: f32 = 390.0;
const SINGLE_COLUMN: f32 = 560.0;

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
    if selection.keys.is_empty() || selection.table == crate::views::world::TABLE {
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
                    crate::views::area::parts::show_blueprint(editor, ui, &key, &[]);
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

pub fn has_preview(editor: &Editor) -> bool {
    let selection = &editor.selection;
    !selection.keys.is_empty()
        && selection.parts.is_empty()
        && matches!(
            selection.table.as_str(),
            "npc" | "player" | "model" | "item" | "quest" | "test_character"
        )
}

pub fn show_row_tab(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str) {
    egui::ScrollArea::vertical()
        .id_salt(("row-tab", table, key))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(16, 10))
                .show(ui, |ui| {
                    row_form(editor, ui, table, key, ui.available_width() >= WIDE);
                });
        });
}

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
            ui.label(theme::faint("fixture").size(12.0));
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
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(table);
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
        let mut cx = FormCx::new(project, root, shapes, form, &mut actions);
        cx.speaker = speaker_of(table, key);
        cx.owner_table = Some(table.to_owned());
        cx.owner_key = Some(key.to_owned());
        ui.push_id(("row", table, key), |ui| {
            if wide && second_column {
                ui.horizontal_top(|ui| {
                    ui.vertical(|ui| {
                        ui.set_width(LEFT_COLUMN);
                        changed = std::mem::take(&mut changed).or(first_class_card(
                            ui, &mut cx, table, key, fixture, root, &mut value,
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
                if wide {
                    ui.set_max_width(SINGLE_COLUMN);
                }
                changed = std::mem::take(&mut changed).or(first_class_card(
                    ui, &mut cx, table, key, fixture, root, &mut value,
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
                            ui.label(theme::mono(key));
                            ui.label(theme::faint("fixture").size(12.0));
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
        let hidden: &[&str] = match table {
            "input" => &["modules", "bindings"],
            crate::views::job::TABLE => &["modules", "levels"],
            _ => &["modules"],
        };
        changed = crate::forms::object_without(ui, cx, schema, value, "", hidden);
        if table == crate::views::job::TABLE {
            changed = std::mem::take(&mut changed).or(crate::views::job::levels(ui, cx, value));
        }
    });
    changed
}

pub(super) type Party = (String, String, String, String);

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
    let shapes: &crate::schema::Shapes = cx.shapes;
    let Some(items) = shapes.modules_of(table) else {
        return Changed::default();
    };
    let variants = match schema::kind(cx.root, items) {
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
        let tag = module.kind_or("module").to_owned();
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

pub(super) fn card_body(
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
        let hidden: &[&str] = match variant.tag.as_str() {
            "inline_script" => &["nodes"],
            "shared_script" => &["values"],
            _ => &[],
        };
        let fieldless = variant.schema["properties"]
            .as_object()
            .is_none_or(|fields| {
                fields
                    .keys()
                    .all(|name| name == "type" || hidden.contains(&name.as_str()))
            });
        if fieldless {
            widgets::hint(ui, fieldless_note(table, &variant.tag));
        } else {
            changed = changed.or(crate::forms::object_without(
                ui,
                cx,
                variant.schema,
                module,
                path,
                hidden,
            ));
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

fn module_counts(ui: &mut Ui, value: &Value) {
    let mut counts: BTreeMap<String, usize> = Default::default();
    for module in value["modules"].as_array().into_iter().flatten() {
        let kind = module.kind_or("module");
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

pub(super) fn add_module_popup(
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
                    .any(|module| module.kind() == variant.tag.as_str());
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

pub(super) fn path_owner_key<'a>(cx: &'a FormCx, _table: &str) -> Option<&'a str> {
    cx.owner_key.as_deref()
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
    let from = clip.text_or("from", "the clipboard").to_owned();
    let registry = game::systems::registry();
    for module in clip["modules"].as_array().into_iter().flatten() {
        let tag = module.kind_or("module").to_owned();
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
