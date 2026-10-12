use std::collections::BTreeMap;

use egui::{Align, Layout, RichText, Ui, Vec2};
use serde_json::Value;

use super::scripts::strip_modules;
use super::{LEFT_COLUMN, act, add_module_popup, without_field};
use super::{theme, widgets};
use crate::app::Editor;
use crate::forms::{FormAction, FormCx};
use crate::project::{Edit, Selection, row_file};
use crate::schema::{self, Kind};
use crate::value::RowValue;

pub(super) fn show_rows(editor: &mut Editor, ui: &mut Ui, selection: &Selection, wide: bool) {
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
        let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
        cx.owner_table = Some(table.clone());
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
                                .position(|m| m.kind() == tag)
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
                                .entry(module.text_or("script", "?").to_owned())
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
        let tag = template.kind_or("module").to_owned();
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
pub(super) fn shared_field(
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

pub(super) fn fieldless_note(table: &str, tag: &str) -> &'static str {
    match (table, tag) {
        ("model", "airborne") => {
            "No fields. Walks ignore blocked cells; wild ones keep out of safe zones."
        }
        _ => "No fields: having it is the setting.",
    }
}

pub(super) fn free_singles(
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
                    .any(|module| module.kind() == variant.tag.as_str())
        })
        .map(|variant| variant.tag.replace('_', " "))
        .collect()
}
