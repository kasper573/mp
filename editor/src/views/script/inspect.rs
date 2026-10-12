use std::collections::BTreeMap;

use egui::{RichText, Ui};
use game::core::script::OwnerKind;
use serde_json::{Map, Value};

use super::nodes;
use super::{Doc, ScriptOwner, select_nodes, write};
use crate::app::{Dialog, Editor};
use crate::forms::{Changed, FormAction, FormCx};
use crate::project::{Edit, Selection, row_file, row_of};
use crate::schema;
use crate::tabs::Tab;
use crate::ui::{theme, widgets};

/// The inspector of a script tab: the script's own card, one node's card, or what several share.
pub fn show(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    let Some(owner) = editor.views.script.focus.clone() else {
        ui.label(theme::muted("No script in view"));
        return;
    };
    let Some(doc) = Doc::load(editor, &owner) else {
        ui.label(theme::muted(format!("{} is gone", owner.title())));
        return;
    };
    let _ = super::catalogue(editor);
    let names: Vec<String> = selection
        .parts
        .iter()
        .filter_map(|part| part.strip_prefix("node:").map(str::to_owned))
        .filter(|name| doc.nodes().contains_key(name))
        .collect();
    let choice: Option<(String, usize)> = selection
        .parts
        .iter()
        .find_map(|part| part.strip_prefix("choice:"))
        .and_then(|rest| rest.rsplit_once('#'))
        .and_then(|(name, index)| Some((name.to_owned(), index.parse().ok()?)));
    let outline = editor
        .views
        .script
        .views
        .get(&owner)
        .is_some_and(|view| view.layout.outline);
    egui::ScrollArea::vertical()
        .id_salt(("script-inspector", owner.slug()))
        .show(ui, |ui| match names.as_slice() {
            [] => script_inspector(editor, ui, &doc),
            [name] => {
                let name = name.clone();
                match &choice {
                    Some((node, index)) if *node == name => {
                        choice_inspector(editor, ui, &doc, &name, *index)
                    }
                    _ => node_inspector(editor, ui, &doc, &name),
                }
                if outline {
                    keys_card(ui);
                }
            }
            many => {
                breadcrumb(
                    ui,
                    &format!("{} › {} nodes", owner_short(editor, &doc), many.len()),
                );
                widgets::card_frame(true).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    widgets::card_header(
                        ui,
                        "script",
                        &format!("{} nodes", many.len()),
                        "",
                        |_| {},
                    );
                    for name in many {
                        if let Some(node) = doc.nodes().get(name) {
                            ui.horizontal(|ui| {
                                ui.label(theme::mono(name).size(12.5));
                                ui.label(
                                    theme::muted(nodes::clip(&nodes::summary(node), 50)).size(12.5),
                                );
                            });
                        }
                    }
                    ui.add_space(6.0);
                    if widgets::danger(ui, "Delete these nodes").clicked() {
                        super::delete_nodes(editor, &doc, many.to_vec());
                    }
                });
                widgets::hint(
                    ui,
                    "Drag moves them together. Del removes them and the arrows into them.",
                );
            }
        });
}

fn breadcrumb(ui: &mut Ui, text: &str) {
    ui.label(theme::muted(text).monospace().size(13.0));
    ui.add_space(4.0);
}

/// "npc/mara" or "tide_chest": the owner as a breadcrumb names it.
fn owner_short(editor: &Editor, doc: &Doc) -> String {
    let label = super::owner_label(editor, doc);
    match label.rsplit_once(" · object ") {
        Some((_, object)) => object.to_owned(),
        None => label,
    }
}

fn form_cx<'a>(
    editor: &'a mut Editor,
    root: &'a Value,
    actions: &'a mut Vec<FormAction>,
    doc: &Doc,
) -> FormCx<'a> {
    let Editor {
        project,
        form,
        shapes,
        ..
    } = editor;
    let project = project.as_ref().expect("a project");
    FormCx {
        root,
        content: project.content,
        files: &project.files,
        usages: &project.usages,
        shapes,
        state: form,
        actions,
        speaker: match (&doc.kind, &doc.owner) {
            (OwnerKind::Npc, ScriptOwner::Inline { key, .. }) => Some(key.clone()),
            _ => None,
        },
        owner_table: Some(doc.owner.table().to_owned()),
        owner_key: None,
    }
}

/// The script's own card: owner, state, locals and nodes; its events; the owner's other scripts;
/// Run, Outline and Make shared. A shared script shows its variables and who runs it instead.
pub fn script_inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let _ = super::catalogue(editor);
    if super::run::inspector(editor, ui, doc) {
        return;
    }
    if doc.is_shared() {
        shared_inspector(editor, ui, doc);
    } else {
        inline_inspector(editor, ui, doc);
    }
}

pub fn names_text(map: &Value) -> String {
    names_of(map)
}

fn names_of(map: &Value) -> String {
    let names: Vec<&str> = map
        .as_object()
        .into_iter()
        .flatten()
        .map(|(name, _)| name.as_str())
        .collect();
    if names.is_empty() {
        "none".to_owned()
    } else {
        names.join(" · ")
    }
}

fn nodes_line(doc: &Doc) -> String {
    let count = doc.nodes().len();
    let dialogue = doc
        .nodes()
        .values()
        .filter(|node| nodes::kind(node) == "dialogue")
        .count();
    if dialogue > 0 {
        format!("{count} · {dialogue} dialogue")
    } else {
        count.to_string()
    }
}

fn inline_inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let owner_key = super::owner_label(editor, doc)
        .split(" · ")
        .next()
        .unwrap_or("")
        .to_owned();
    breadcrumb(ui, &format!("{} › inline script", owner_short(editor, doc)));
    let mut open_owner = false;
    let mut make = false;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(
            ui,
            "inline_script",
            "inline script",
            "in its owner's row",
            |ui| {
                if ui.button("Open the owner's row").clicked() {
                    open_owner = true;
                    ui.close();
                }
                if ui.button("Make shared…").clicked() {
                    make = true;
                    ui.close();
                }
            },
        );
        widgets::kv(ui, "owner", |ui| {
            if ui
                .add(
                    egui::Label::new(theme::mono(&owner_key).size(13.0))
                        .sense(egui::Sense::click()),
                )
                .on_hover_text("Open the row")
                .clicked()
            {
                open_owner = true;
            }
        });
        widgets::kv_text(ui, "state", names_of(&doc.script["state"]));
        widgets::kv_text(ui, "locals", names_of(&doc.script["locals"]));
        widgets::kv_text(ui, "nodes", nodes_line(doc));
    });
    events_section(editor, ui, doc);
    other_scripts_section(editor, ui, doc);
    owner_section(editor, ui, doc);
    action_buttons(editor, ui, doc);
    if open_owner {
        editor.select(Selection::row(doc.owner.table(), doc.owner.key()));
        editor.open_tab(Tab::for_row(doc.owner.table(), doc.owner.key()));
    }
    if make {
        make_shared_dialog(editor, doc);
    }
}

fn shared_inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let key = doc.owner.key().to_owned();
    breadcrumb(ui, &format!("script/{key}"));
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let owner_schema = root
        .pointer("/properties/owner")
        .cloned()
        .unwrap_or(Value::Null);
    let mut script = doc.script.clone();
    let mut actions = Vec::new();
    let mut make = false;
    let changed = {
        let mut cx = form_cx(editor, &root, &mut actions, doc);
        widgets::card_frame(false)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, "script", &key, "shared script", |ui| {
                    if ui.button("Make inline…").clicked() {
                        make = true;
                        ui.close();
                    }
                });
                let mut changed = Changed::default();
                widgets::kv(ui, "owner", |ui| {
                    let mut owner = script["owner"].clone();
                    if crate::forms::value(ui, &mut cx, &owner_schema, &mut owner, "/owner")
                        .is_some()
                    {
                        script["owner"] = owner;
                        changed = Changed::at("/owner");
                    }
                });
                let variables = script["variables"].as_object().map_or(0, |v| v.len());
                widgets::kv_text(
                    ui,
                    "variables",
                    if variables == 0 {
                        "none".to_owned()
                    } else {
                        variables.to_string()
                    },
                );
                if script["state"].as_object().is_some_and(|m| !m.is_empty()) {
                    widgets::kv_text(ui, "state", names_of(&script["state"]));
                }
                widgets::kv_text(ui, "locals", names_of(&script["locals"]));
                let returns = doc.nodes().values().any(|node| {
                    nodes::kind(node) == "return" && node.get("value").is_some_and(|v| !v.is_null())
                });
                widgets::kv_text(ui, "returns", if returns { "a value" } else { "nothing" });
                widgets::kv_text(ui, "nodes", nodes_line(doc));
                changed
            })
            .inner
    };
    for action in actions {
        act(editor, action, doc);
    }
    if changed.is_some() {
        write(editor, doc, script, format!("Edit script/{key}"));
    }
    variables_section(editor, ui, doc);
    run_by_section(editor, ui, doc);
    if editor.shapes.is_fixture("script", &key) {
        widgets::section(ui, "From the New Game template");
        widgets::hint(
            ui,
            "Every game made from New Game starts with it; another game may change or drop it.",
        );
    }
    action_buttons(editor, ui, doc);
    if make {
        make_inline_dialog(editor, doc);
    }
}

/// EVENTS: one row per on node, each a click away.
fn events_section(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    widgets::section(ui, "Events");
    let mut go: Option<String> = None;
    let mut any = false;
    for (name, node) in doc.nodes() {
        if nodes::kind(node) != "on" {
            continue;
        }
        any = true;
        let event = nodes::event_of(node).unwrap_or("?").to_owned();
        let pieces = nodes::pieces(
            node,
            editor.views.script.catalogue.as_ref().expect("catalogue"),
        );
        let detail = pieces
            .first()
            .map(|line| line.iter().map(|p| p.text.clone()).collect::<String>())
            .unwrap_or_default();
        let response = ui
            .horizontal(|ui| {
                ui.label(theme::faint("▸").size(12.0));
                ui.label(theme::strong(&event).monospace().size(13.0));
                ui.label(
                    theme::muted(detail.replace(" tiles", ""))
                        .monospace()
                        .size(12.5),
                );
            })
            .response
            .interact(egui::Sense::click());
        if response
            .on_hover_cursor(egui::CursorIcon::PointingHand)
            .clicked()
        {
            go = Some(name.clone());
        }
    }
    if !any {
        widgets::hint(
            ui,
            "No event yet: Tab opens the palette with the events this owner answers.",
        );
    }
    if let Some(name) = go {
        select_nodes(editor, doc, &[name]);
    }
}

/// The owner's other script modules, so the whole behaviour is one glance away.
fn other_scripts_section(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let ScriptOwner::Inline {
        table,
        key,
        pointer,
    } = &doc.owner
    else {
        return;
    };
    let Some(row) = editor.row_value(table, key) else {
        return;
    };
    let display = row["name"]
        .as_str()
        .or(row["title"].as_str())
        .or(row["label"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| key.clone());
    let possessive = if display.ends_with('s') {
        format!("{display}'")
    } else {
        format!("{display}'s")
    };
    widgets::section(ui, &format!("{possessive} other scripts"));
    let (holder, scripts_field) = match object_index_of(pointer) {
        Some(index) => (row["modules"][index].clone(), "scripts"),
        None => (row.clone(), "modules"),
    };
    let mut open: Option<ScriptOwner> = None;
    let mut any = false;
    for (index, module) in holder[scripts_field]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
    {
        let tag = module["type"].as_str().unwrap_or("");
        if !tag.ends_with("_script") {
            continue;
        }
        let module_pointer = match object_index_of(pointer) {
            Some(object) => format!("/modules/{object}/scripts/{index}"),
            None => format!("/modules/{index}"),
        };
        if module_pointer == *pointer {
            continue;
        }
        any = true;
        let (word, name, detail) = if tag == "shared_script" {
            let script = module["script"].as_str().unwrap_or("?").to_owned();
            let values = module["values"]
                .as_object()
                .map(|v| {
                    v.iter()
                        .map(|(k, v)| format!("{k} {}", crate::condition::summary(v)))
                        .collect::<Vec<_>>()
                        .join(" · ")
                })
                .unwrap_or_default();
            ("shared", script, values)
        } else {
            let count = module["nodes"].as_object().map_or(0, |n| n.len());
            ("inline", format!("{count} nodes"), String::new())
        };
        let response = ui
            .horizontal(|ui| {
                widgets::badge(ui, "script");
                ui.label(theme::muted(word).monospace().size(13.0));
                ui.label(theme::strong(&name).monospace().size(13.0));
                if !detail.is_empty() {
                    ui.label(theme::muted(detail).monospace().size(12.5));
                }
            })
            .response
            .interact(egui::Sense::click());
        if response
            .on_hover_cursor(egui::CursorIcon::PointingHand)
            .clicked()
        {
            open = Some(if tag == "shared_script" {
                ScriptOwner::Shared {
                    key: module["script"].as_str().unwrap_or("").to_owned(),
                }
            } else {
                ScriptOwner::inline(table, key, &module_pointer)
            });
        }
    }
    if !any {
        ui.horizontal(|ui| {
            widgets::badge(ui, "script");
            ui.label(theme::strong("none").monospace().size(13.0));
            let stands = match doc.kind {
                OwnerKind::Npc => "stands where it spawns",
                OwnerKind::Object => "does nothing else",
                _ => "nothing else",
            };
            ui.label(theme::muted(stands).monospace().size(12.5));
        });
    }
    if let Some(owner) = open {
        editor.open_tab(Tab::Script(owner));
    }
}

fn object_index_of(pointer: &str) -> Option<usize> {
    let rest = pointer.strip_prefix("/modules/")?;
    let (module, tail) = rest.split_once('/')?;
    tail.starts_with("scripts/")
        .then(|| module.parse().ok())
        .flatten()
}

/// OWNER for an object's script: the area and object, and what state means for it.
fn owner_section(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let ScriptOwner::Inline {
        table,
        key,
        pointer,
    } = &doc.owner
    else {
        return;
    };
    let mut open = false;
    match object_index_of(pointer) {
        Some(index) => {
            let row = editor.row_value(table, key).unwrap_or(Value::Null);
            let module = &row["modules"][index];
            let name = module["name"].as_str().unwrap_or("object").to_owned();
            let label = module["label"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_default();
            widgets::section(ui, "Owner");
            let response = ui
                .horizontal(|ui| {
                    widgets::badge(ui, "object");
                    ui.label(
                        theme::strong(format!("{table}/{key}"))
                            .monospace()
                            .size(13.0),
                    );
                    ui.label(theme::muted("·").size(13.0));
                    ui.label(theme::strong(&name).monospace().size(13.0));
                    if !label.is_empty() {
                        ui.label(theme::muted(label).monospace().size(12.5));
                    }
                })
                .response
                .interact(egui::Sense::click());
            if response
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .clicked()
            {
                open = true;
            }
            let state = doc.script["state"]
                .as_object()
                .is_some_and(|m| !m.is_empty());
            widgets::hint(
                ui,
                if state {
                    "State is the object's own, shared by its flows."
                } else {
                    "State none: what it remembers is each subject's."
                },
            );
        }
        None if doc.kind == OwnerKind::Npc => {
            let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
                return;
            };
            let placed: Vec<String> = content
                .ids::<game::systems::area::AreaDef>()
                .filter(|area| {
                    game::systems::area::placed(&content, *area)
                        .iter()
                        .any(|place| matches!(&place.module, game::systems::area::AreaModule::Resident(resident) if resident.npc.key(&content) == key))
                })
                .map(|area| area.key(&content).to_owned())
                .collect();
            widgets::section(
                ui,
                &format!(
                    "Owner · placed {}",
                    match placed.len() {
                        0 => "nowhere".to_owned(),
                        1 => "once".to_owned(),
                        n => format!("{n} times"),
                    }
                ),
            );
            let response = ui
                .horizontal(|ui| {
                    widgets::badge(ui, "npc");
                    ui.label(theme::strong(format!("npc/{key}")).monospace().size(13.0));
                    match placed.as_slice() {
                        [] => ui.label(theme::muted("no resident yet").monospace().size(12.5)),
                        [one] => ui.label(
                            theme::muted(format!("resident of area/{one}"))
                                .monospace()
                                .size(12.5),
                        ),
                        many => ui.label(
                            theme::muted(format!("resident of {} areas", many.len()))
                                .monospace()
                                .size(12.5),
                        ),
                    };
                })
                .response
                .interact(egui::Sense::click());
            if response
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .clicked()
            {
                open = true;
            }
        }
        None => {}
    }
    if open {
        editor.select(Selection::row(table, key));
        editor.open_tab(Tab::for_row(table, key));
    }
}

/// VARIABLES of a shared script: a card each with type, default, holes and who gives values.
fn variables_section(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let key = doc.owner.key().to_owned();
    let variables: Vec<(String, Value)> = doc.script["variables"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if variables.is_empty() {
        return;
    }
    widgets::section_count(ui, "Variables", variables.len());
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let variable_schema = root
        .pointer("/properties/variables/additionalProperties")
        .cloned()
        .unwrap_or(Value::Null);
    let users = editor
        .project
        .as_ref()
        .map(|project| {
            project
                .usages
                .of_row("script", &key)
                .iter()
                .filter(|u| !u.pointer.contains("/nodes/"))
                .count()
        })
        .unwrap_or(0);
    let mut script = doc.script.clone();
    let mut actions = Vec::new();
    let mut changed = Changed::default();
    {
        let mut cx = form_cx(editor, &root, &mut actions, doc);
        for (name, variable) in &variables {
            let holes: Vec<String> = doc
                .nodes()
                .iter()
                .filter(|(_, node)| {
                    node.to_string()
                        .contains(&format!("{{\"var\":\"{name}\"}}"))
                })
                .map(|(node_name, _)| node_name.clone())
                .collect();
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, "script", name, "", |ui| {
                    if ui.button("Remove the variable").clicked() {
                        script["variables"].as_object_mut().map(|m| m.remove(name));
                        changed = Changed::at("/variables");
                        ui.close();
                    }
                });
                let path = format!("/variables/{name}");
                let mut draft = variable.clone();
                let mut form = variable_schema.clone();
                if let Some(properties) = form.get_mut("properties").and_then(Value::as_object_mut)
                {
                    properties.remove("default");
                }
                if crate::forms::object(ui, &mut cx, &form, &mut draft, &path).is_some() {
                    script["variables"][name] = draft.clone();
                    changed = Changed::at(&path);
                }
                widgets::kv(ui, "default", |ui| match draft.get("default") {
                    Some(default) if !default.is_null() => {
                        let mut value = default.clone();
                        let schema = variable_schema
                            .pointer("/properties/default")
                            .cloned()
                            .unwrap_or(Value::Null);
                        if crate::forms::value(
                            ui,
                            &mut cx,
                            &schema,
                            &mut value,
                            &format!("{path}/default"),
                        )
                        .is_some()
                        {
                            script["variables"][name]["default"] = value;
                            changed = Changed::at(&path);
                        }
                        if ui
                            .add(
                                egui::Label::new(theme::faint("✕").size(11.0))
                                    .sense(egui::Sense::click()),
                            )
                            .on_hover_text("Drop the default")
                            .clicked()
                        {
                            script["variables"][name]
                                .as_object_mut()
                                .map(|m| m.remove("default"));
                            changed = Changed::at(&path);
                        }
                    }
                    _ => {
                        ui.label(theme::muted("none").size(13.0));
                        if ui.button("+ Add default").clicked() {
                            script["variables"][name]["default"] = Value::Null;
                            changed = Changed::at(&path);
                        }
                    }
                });
                widgets::kv_text(
                    ui,
                    "holes",
                    match holes.as_slice() {
                        [] => "none yet".to_owned(),
                        [one] => format!("1 · in {one}"),
                        many => format!("{} · in {}", many.len(), many.join(", ")),
                    },
                );
                widgets::kv_text(
                    ui,
                    "values",
                    match users {
                        0 => "no owner names this script".to_owned(),
                        1 => "1 owner gives its own".to_owned(),
                        n => format!("{n} {} give their own", doc.kind.name().to_owned() + "s"),
                    },
                );
            });
        }
    }
    for action in actions {
        act(editor, action, doc);
    }
    if changed.is_some() {
        write(
            editor,
            doc,
            script,
            format!("Edit the variables of script/{key}"),
        );
    }
    widgets::hint(
        ui,
        "Same card and types as a blueprint's variables: declared here, valued by each owner.",
    );
}

/// RUN BY and SPEAKS FOR of a shared script, and what is worked out from it.
fn run_by_section(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let key = doc.owner.key().to_owned();
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let content = project.content;
    let mut callers: Vec<(String, String, String)> = Vec::new();
    for usage in project.usages.of_row("script", &key) {
        let Some((table, row_key)) = row_of(&usage.file) else {
            continue;
        };
        if let Some(at) = usage.pointer.find("/nodes/") {
            let node = usage.pointer[at + 7..]
                .split('/')
                .next()
                .unwrap_or("")
                .to_owned();
            let kind = if usage.pointer.contains("/scripts/") || usage.pointer.contains("/modules/")
            {
                "inline"
            } else {
                "shared"
            };
            callers.push((format!("{table}/{row_key}"), kind.to_owned(), node));
        }
    }
    if !callers.is_empty() {
        widgets::section_count(ui, "Run by", callers.len());
        let mut open: Option<(String, String)> = None;
        for (owner, kind, node) in &callers {
            let response = ui
                .horizontal(|ui| {
                    widgets::badge(ui, "script");
                    ui.label(theme::strong(owner).monospace().size(13.0));
                    ui.label(theme::muted(format!("· {kind}")).monospace().size(12.5));
                    ui.label(
                        theme::muted(format!("from run · {node}"))
                            .monospace()
                            .size(12.5),
                    );
                })
                .response
                .interact(egui::Sense::click());
            if response
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .clicked()
                && let Some((table, row_key)) = owner.split_once('/')
            {
                open = Some((table.to_owned(), row_key.to_owned()));
            }
        }
        if let Some((table, row_key)) = open {
            editor.select(Selection::row(&table, &row_key));
            editor.open_tab(Tab::for_row(&table, &row_key));
        }
    }
    let speakers: Vec<String> = doc
        .nodes()
        .values()
        .flat_map(|node| node["lines"].as_array().cloned().unwrap_or_default())
        .filter_map(|line| line["by"]["npc"].as_str().map(str::to_owned))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    if !speakers.is_empty() {
        widgets::section(ui, "Speaks for");
        for npc in &speakers {
            ui.horizontal(|ui| {
                widgets::badge(ui, "npc");
                ui.label(theme::strong(format!("npc/{npc}")).monospace().size(13.0));
                let through = callers
                    .iter()
                    .find(|(owner, _, _)| owner == &format!("npc/{npc}"))
                    .map(|(_, kind, _)| format!("through its {kind} script"));
                ui.label(
                    theme::muted(through.unwrap_or_else(|| "in its lines".to_owned()))
                        .monospace()
                        .size(12.5),
                );
            });
        }
    }
    if let Some(content) = content
        && content.has_built::<game::systems::script::RiftScripts>()
    {
        let quests: Vec<String> = doc
            .nodes()
            .values()
            .filter(|node| {
                matches!(
                    nodes::kind(node),
                    "offer_quest" | "accept_quest" | "turn_in"
                )
            })
            .filter_map(|node| node["quest"].as_str().map(str::to_owned))
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        if !quests.is_empty() {
            widgets::section(ui, "Worked out");
            let who = callers
                .first()
                .map(|(owner, _, _)| owner.clone())
                .unwrap_or_else(|| "its owner".to_owned());
            let gives = doc
                .nodes()
                .values()
                .any(|node| matches!(nodes::kind(node), "offer_quest" | "accept_quest"));
            let takes = doc
                .nodes()
                .values()
                .any(|node| nodes::kind(node) == "turn_in");
            for quest in &quests {
                let verbs = match (gives, takes) {
                    (true, true) => "gives and takes back",
                    (true, false) => "gives",
                    _ => "takes back",
                };
                widgets::hint(
                    ui,
                    &format!(
                        "{who} {verbs} quest/{quest}, so its quest marks and its quest log entry name {who}."
                    ),
                );
            }
        }
    }
}

/// Run F8 · Outline O · Make shared… / Make inline…
fn action_buttons(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    ui.add_space(8.0);
    let outline = editor
        .views
        .script
        .views
        .get(&doc.owner)
        .is_some_and(|view| view.layout.outline);
    let mut fire = false;
    let mut toggle_outline = false;
    let mut make = false;
    ui.horizontal(|ui| {
        if widgets::keyed_button(ui, "▶ Run", "F8", true).clicked() {
            fire = true;
        }
        if widgets::keyed_button(ui, if outline { "Canvas" } else { "Outline" }, "O", true)
            .clicked()
        {
            toggle_outline = true;
        }
        if ui
            .button(if doc.is_shared() {
                "Make inline…"
            } else {
                "Make shared…"
            })
            .clicked()
        {
            make = true;
        }
    });
    if fire {
        editor.panels.bottom = crate::app::BottomTab::Run;
        editor.views.script.fire = Some(doc.owner.clone());
    }
    if toggle_outline && let Some(view) = editor.views.script.views.get_mut(&doc.owner) {
        view.layout.outline = !view.layout.outline;
        view.layout_dirty = true;
    }
    if make {
        if doc.is_shared() {
            make_inline_dialog(editor, doc);
        } else {
            make_shared_dialog(editor, doc);
        }
    }
}

/// One node's card: its fields as rows, its arrows, and what its kind brings along.
fn node_inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc, name: &str) {
    let Some(node) = doc.nodes().get(name).cloned() else {
        return;
    };
    let kind = nodes::kind(&node).to_owned();
    breadcrumb(ui, &format!("{} › {name}", owner_short(editor, doc)));
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let path = format!("{}/nodes/{name}", doc.owner.pointer());
    let (outs, ins, system, blurb) = {
        let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
        let ins: Vec<(String, String)> = nodes::arrows_into(doc.nodes(), name, catalogue)
            .into_iter()
            .map(|(from, field)| {
                let label = nodes::port_label(doc.nodes(), catalogue, &from, &field);
                (from, label)
            })
            .collect();
        let entry = catalogue.entry(&kind);
        (
            nodes::ports(&node, catalogue),
            ins,
            entry.map(|e| e.system).unwrap_or(""),
            entry.map(|e| e.blurb).unwrap_or(""),
        )
    };
    let mut draft = node.clone();
    let mut actions = Vec::new();
    let mut label = format!("Edit {name} in {}", doc.owner.title());
    let mut rename = false;
    let mut delete = false;
    let mut duplicate = false;
    let badge_kind = badge_of(&kind, system);
    let title = super::graph::card_title(name, &node);
    let changed = {
        let mut cx = form_cx(editor, &root, &mut actions, doc);
        widgets::card_frame(true)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &badge_kind, &title, "", |ui| {
                    if ui.button("Rename…  F2").clicked() {
                        rename = true;
                        ui.close();
                    }
                    if ui.button("Duplicate  Ctrl D").clicked() {
                        duplicate = true;
                        ui.close();
                    }
                    if ui.button("Delete  Del").clicked() {
                        delete = true;
                        ui.close();
                    }
                });
                let mut changed = Changed::default();
                match kind.as_str() {
                    "on" => changed = on_form(ui, &mut cx, &root, &mut draft, &path),
                    "dialogue" => {}
                    _ => {
                        if let Some(schema) = nodes::form_schema(&root, &draft) {
                            changed = crate::forms::object(ui, &mut cx, &schema, &mut draft, &path);
                        }
                    }
                }
                if kind != "dialogue" {
                    arrows_rows(ui, &mut cx, &outs, &kind);
                }
                changed
            })
            .inner
    };
    let mut go_to: Option<String> = None;
    for action in actions {
        if let FormAction::OpenRow { table, key } = &action
            && table == "node"
        {
            go_to = Some(key.clone());
            continue;
        }
        act(editor, action, doc);
    }
    if kind == "dialogue" {
        let mut draft_dialogue = draft.clone();
        let mut dialogue_actions = Vec::new();
        let dialogue_changed = {
            let mut cx = form_cx(editor, &root, &mut dialogue_actions, doc);
            dialogue_form(
                ui,
                &mut cx,
                &root,
                &mut draft_dialogue,
                &path,
                doc,
                &mut label,
            )
        };
        for action in dialogue_actions {
            if let FormAction::OpenRow { table, key } = &action
                && table == "node"
            {
                go_to = Some(key.clone());
                continue;
            }
            act(editor, action, doc);
        }
        if dialogue_changed.is_some() {
            let mut script = doc.script.clone();
            script["nodes"][name] = draft_dialogue;
            write(editor, doc, script, label.clone());
            return;
        }
    } else {
        node_extras(
            editor,
            ui,
            doc,
            Shown {
                name,
                node: &node,
                kind: &kind,
                ins: &ins,
                blurb,
            },
        );
    }
    if let Some(callout) = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(&doc.owner) && callout.node == name)
    {
        widgets::section(ui, "Checked on every edit");
        ui.label(theme::strong(&callout.rule).size(13.0).color(theme::DANGER));
        ui.label(theme::muted(&callout.text).size(12.5));
        widgets::hint(
            ui,
            "Tried against the whole folder as if saved and loaded; anything the load report would name is refused.",
        );
    }
    if let Some(target) = go_to {
        select_nodes(editor, doc, &[target]);
        return;
    }
    if rename && let Some(view) = editor.views.script.views.get_mut(&doc.owner) {
        view.rename = Some((name.to_owned(), name.to_owned()));
    }
    if duplicate {
        super::act_now(
            editor,
            doc,
            super::graph::GraphAction::Duplicate(name.to_owned()),
        );
    }
    if delete {
        super::delete_nodes(editor, doc, vec![name.to_owned()]);
        return;
    }
    if changed.is_some() {
        let mut script = doc.script.clone();
        script["nodes"][name] = draft;
        write(editor, doc, script, label);
    }
}

/// The badge a node kind wears: its system's letter, flow and dialogue as scripts.
fn badge_of(kind: &str, system: &str) -> String {
    match kind {
        "on" | "if" | "random" | "repeat" | "wait" | "set" | "run" | "return" | "dialogue" => {
            "script".to_owned()
        }
        _ => match system {
            "item" => "item".to_owned(),
            "memory" => "quest".to_owned(),
            "area" => "object".to_owned(),
            "npc body" | "npc" => "npc".to_owned(),
            "quest" => "quest".to_owned(),
            "shop" => "shop".to_owned(),
            "audio" => "sfx".to_owned(),
            "notification" | "chat" => "npc".to_owned(),
            "stat" | "job" => "respawn".to_owned(),
            other => other.to_owned(),
        },
    }
}

/// The arrows a node leaves by: linked ones as a jump, free ones as what ending means here.
fn arrows_rows(ui: &mut Ui, cx: &mut FormCx, outs: &[nodes::Port], kind: &str) {
    let mut go: Option<String> = None;
    for port in outs {
        widgets::kv(ui, &port.label, |ui| match &port.target {
            Some(target) => {
                ui.label(theme::muted("→").size(13.0));
                if ui
                    .add(
                        egui::Label::new(theme::mono(target).size(13.0))
                            .sense(egui::Sense::click()),
                    )
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    go = Some(target.clone());
                }
            }
            None => {
                let meaning = free_arrow_meaning(kind, &port.label);
                ui.add(egui::Label::new(theme::muted(meaning).size(13.0)).wrap());
            }
        });
    }
    if let Some(target) = go {
        cx.actions.push(FormAction::OpenRow {
            table: "node".to_owned(),
            key: target,
        });
    }
}

fn free_arrow_meaning(kind: &str, label: &str) -> String {
    match (kind, label) {
        ("items", "refused") => "no arrow: the flow ends and the player is told why".to_owned(),
        ("walk_to", "arrived") => "there".to_owned(),
        ("walk_to", "blocked") => "no way there".to_owned(),
        (_, "interrupted") => "another flow took the body".to_owned(),
        ("wait", "next") => "ends the pass".to_owned(),
        ("turn_in", "refused") => "objectives unmet: the flow ends".to_owned(),
        ("turn_in", "cancelled") => "the card was closed: the flow ends".to_owned(),
        (_, "left") => "the subject walked away: the flow ends".to_owned(),
        _ => "no arrow · ends the flow".to_owned(),
    }
}

/// What a kind brings along under its card: a memory row, compiled bounds, one body, the arrows in.
/// The node a card shows: its name, value, kind, the arrows into it and its blurb.
struct Shown<'a> {
    name: &'a str,
    node: &'a Value,
    kind: &'a str,
    ins: &'a [(String, String)],
    blurb: &'a str,
}

fn node_extras(editor: &mut Editor, ui: &mut Ui, doc: &Doc, shown: Shown) {
    let Shown {
        name,
        node,
        kind,
        ins,
        blurb,
    } = shown;
    match kind {
        "remember" | "forget" => {
            let memory = node["memory"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| node["memories"][0].as_str().map(str::to_owned));
            if let Some(memory) = memory {
                memory_row_card(editor, ui, doc, &memory);
            }
            keeps_cards(ui, doc);
        }
        "repeat" => bounds_card(editor, ui, doc, name, node),
        "walk_to" | "wander" | "attack" | "stop" | "face" => {
            widgets::section(ui, "One body");
            widgets::hint(
                ui,
                "One thing at a time: equal or higher priority interrupts; lower waits until the body is free.",
            );
        }
        "warp" => widgets::hint(ui, "Also sets the spawn point."),
        "spawn_ground_items" => {
            let seconds = node["seconds"].as_f64().unwrap_or(60.0);
            widgets::hint(
                ui,
                &format!("Reserved to the subject for {seconds} s, as dropped loot is."),
            );
        }
        "wait" => {
            let at_most = node["at_most"].as_f64().unwrap_or(3600.0);
            widgets::hint(
                ui,
                &format!(
                    "at most: a constant, up to 3,600 s; here {at_most} s. 0 pauses one tick."
                ),
            );
        }
        "random" => widgets::hint(
            ui,
            "Picked by weight on the server. May do lists every output; Run lets you choose.",
        ),
        "run" => widgets::hint(
            ui,
            "The caller waits, then goes on. Owner and subject carry over; calls nest 8 deep, never recursively.",
        ),
        _ => {
            if !blurb.is_empty() {
                widgets::hint(ui, blurb);
            }
        }
    }
    if ins.len() > 1 {
        widgets::section(ui, "Arrows in");
        for (from, label) in ins {
            ui.horizontal(|ui| {
                ui.label(theme::mono(from).size(12.5));
                ui.label(theme::muted(label).size(12.5));
            });
        }
        widgets::hint(ui, "Two arrows may lead into one node.");
    }
}

/// The memory row a remember node sets, editable in place.
fn memory_row_card(editor: &mut Editor, ui: &mut Ui, doc: &Doc, memory: &str) {
    let Some(mut row) = editor.row_value("memory", memory) else {
        return;
    };
    let Some(schema) = editor
        .shapes
        .table("memory")
        .map(|shape| shape.shape.clone())
    else {
        return;
    };
    let mut actions = Vec::new();
    let changed = {
        let mut cx = form_cx(editor, &schema, &mut actions, doc);
        widgets::card_frame(false)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, "quest", &format!("memory/{memory}"), "row", |ui| {
                    if ui.button("Open the row").clicked() {
                        cx.actions.push(FormAction::OpenRow {
                            table: "memory".to_owned(),
                            key: memory.to_owned(),
                        });
                        ui.close();
                    }
                });
                let form = crate::ui::inspector::without_field(&schema, "modules");
                crate::forms::object(ui, &mut cx, &form, &mut row, "")
            })
            .inner
    };
    for action in actions {
        act(editor, action, doc);
    }
    if changed.is_some() {
        let mut edit = Edit::new(format!("Edit memory/{memory}"));
        edit.write_json(row_file("memory", memory), &row);
        editor.apply(edit);
    }
}

/// Who keeps what: state is the owner's, locals one flow's, variables each owner's values.
fn keeps_cards(ui: &mut Ui, doc: &Doc) {
    let owner = doc.owner.key().to_owned();
    for (title, field, sentence) in [
        ("state", "state", format!("{owner}'s, shared by its flows")),
        ("locals", "locals", "values that last one flow".to_owned()),
    ] {
        widgets::card_frame(false).show(ui, |ui| {
            ui.set_width(ui.available_width());
            widgets::card_header(ui, "script", title, "", |_| {});
            let names = names_of(&doc.script[field]);
            ui.label(theme::muted(format!("{names} · {sentence}")).size(13.0));
        });
    }
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "script", "variables", "", |_| {});
        let text = if doc.is_shared() {
            format!(
                "{} · each owner's values",
                names_of(&doc.script["variables"])
            )
        } else {
            "only in a shared script: each owner's values".to_owned()
        };
        ui.label(theme::muted(text).size(13.0));
    });
}

/// The bounds the compiler proves for a repeat: steps and waits per pass.
fn bounds_card(editor: &mut Editor, ui: &mut Ui, doc: &Doc, name: &str, node: &Value) {
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let at_most = node["at_most"].as_f64().unwrap_or(1.0);
    let mut body: Vec<String> = Vec::new();
    let mut queue: Vec<String> = node["each"]
        .as_str()
        .map(|s| vec![s.to_owned()])
        .unwrap_or_default();
    while let Some(next) = queue.pop() {
        if next == name || body.contains(&next) {
            continue;
        }
        body.push(next.clone());
        if let Some(inner) = doc.nodes().get(&next) {
            for port in nodes::ports(inner, catalogue) {
                if let Some(target) = port.target {
                    queue.push(target);
                }
            }
        }
    }
    let waits: Vec<f64> = body
        .iter()
        .filter_map(|n| doc.nodes().get(n))
        .filter(|n| nodes::kind(n) == "wait")
        .map(|n| {
            n["at_most"]
                .as_f64()
                .or(n["seconds"].as_f64())
                .unwrap_or(0.0)
        })
        .collect();
    let pauses = body
        .iter()
        .filter_map(|n| doc.nodes().get(n))
        .any(|n| catalogue.entry(nodes::kind(n)).is_some_and(|e| e.pauses));
    let steps = if pauses {
        body.len() + 1
    } else {
        (body.len() + 1) * at_most as usize
    };
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "quest", "bounds", "compiler", |_| {});
        widgets::kv_text(ui, "steps", format!("at most {steps} between two waits"));
        widgets::kv_text(
            ui,
            "waits",
            match waits.as_slice() {
                [] => "none in a pass".to_owned(),
                [one] => format!("at most {} · {} s in all", at_most as i64, one * at_most),
                many => format!("at most {} · {} s in all", at_most as i64 * many.len() as i64, many.iter().sum::<f64>() * at_most),
            },
        );
        widgets::hint(ui, "Proven when the script compiles. Past 10,000 steps between pauses, the folder doesn't load.");
    });
}

fn on_form(ui: &mut Ui, cx: &mut FormCx, root: &Value, node: &mut Value, path: &str) -> Changed {
    let mut changed = Changed::default();
    let events = nodes::event_variants(root);
    let current = nodes::event_of(node).unwrap_or("").to_owned();
    let mut picked = current.clone();
    widgets::kv(ui, "event", |ui| {
        egui::ComboBox::from_id_salt(ui.id().with(path).with("event"))
            .selected_text(&current)
            .show_ui(ui, |ui| {
                for variant in &events {
                    ui.selectable_value(&mut picked, variant.tag.clone(), &variant.tag);
                }
            });
    });
    if picked != current
        && let Some(fresh) = nodes::template_event(root, &picked)
    {
        let next = node.get("next").cloned();
        *node = fresh;
        if let Some(next) = next {
            node["next"] = next;
        }
        changed = Changed::at(path);
    }
    if let Some(schema) = nodes::event_form_schema(root, nodes::event_of(node).unwrap_or("")) {
        changed = changed.or(crate::forms::object(ui, cx, &schema, node, path));
    }
    changed
}

/// LINES and CHOICES of a dialogue node, a card each.
fn dialogue_form(
    ui: &mut Ui,
    cx: &mut FormCx,
    root: &Value,
    node: &mut Value,
    path: &str,
    doc: &Doc,
    label: &mut String,
) -> Changed {
    let mut changed = Changed::default();
    let Some(schema) = nodes::variant_schema(root, "dialogue") else {
        return changed;
    };
    let line_schema = schema
        .pointer("/properties/lines/items")
        .cloned()
        .unwrap_or(Value::Null);
    let by_schema = line_schema
        .pointer("/properties/by")
        .cloned()
        .unwrap_or(Value::Null);
    let choice_schema = schema
        .pointer("/properties/choices/items")
        .cloned()
        .unwrap_or(Value::Null);
    widgets::section(ui, "Lines");
    let mut remove_line = None;
    let mut swap_line = None;
    let count = node["lines"].as_array().map_or(0, Vec::len);
    for index in 0..count {
        let line_path = format!("{path}/lines/{index}");
        let line = &mut node["lines"][index];
        widgets::card_frame(false).show(ui, |ui| {
            ui.set_width(ui.available_width());
            widgets::card_header(ui, "script", &format!("line {}", index + 1), "", |ui| {
                if index > 0 && ui.button("Move up").clicked() {
                    swap_line = Some((index, index - 1));
                    ui.close();
                }
                if index + 1 < count && ui.button("Move down").clicked() {
                    swap_line = Some((index, index + 1));
                    ui.close();
                }
                if count > 1 && ui.button("Remove the line").clicked() {
                    remove_line = Some(index);
                    ui.close();
                }
            });
            changed = std::mem::take(&mut changed).or(speaker_rows(
                ui,
                cx,
                &by_schema,
                &mut line["by"],
                &format!("{line_path}/by"),
                doc,
            ));
            changed = std::mem::take(&mut changed).or(crate::spans::line_field(
                ui,
                cx,
                &mut line["text"],
                &format!("{line_path}/text"),
            ));
        });
    }
    if let Some(index) = remove_line
        && let Some(lines) = node["lines"].as_array_mut()
        && lines.len() > 1
    {
        lines.remove(index);
        changed = Changed::at(path);
        *label = format!("Remove a line in {}", doc.owner.title());
    }
    if let Some((a, b)) = swap_line
        && let Some(lines) = node["lines"].as_array_mut()
    {
        lines.swap(a, b);
        changed = Changed::at(path);
    }
    if ui
        .button("+ line")
        .on_hover_text("Enter on the card")
        .clicked()
    {
        let speaker = super::default_speaker(doc);
        if let Some(lines) = node["lines"].as_array_mut() {
            lines.push(serde_json::json!({ "by": speaker, "text": [""] }));
        }
        changed = Changed::at(path);
        *label = format!("Add a line in {}", doc.owner.title());
    }
    widgets::section(ui, "Choices");
    let mut go: Option<String> = None;
    let count = node["choices"].as_array().map_or(0, Vec::len);
    let mut menu = ChoiceMenu::default();
    for index in 0..count {
        let choice_path = format!("{path}/choices/{index}");
        changed = std::mem::take(&mut changed).or(choice_card(
            ui,
            cx,
            &choice_schema,
            &mut node["choices"][index],
            &choice_path,
            index,
            count,
            doc,
            &mut menu,
            &mut go,
        ));
    }
    let remove_choice = menu.remove;
    let swap_choice = menu.swap;
    if let Some(index) = remove_choice
        && let Some(choices) = node["choices"].as_array_mut()
    {
        choices.remove(index);
        changed = Changed::at(path);
        *label = format!("Remove a choice in {}", doc.owner.title());
    }
    if let Some((a, b)) = swap_choice
        && let Some(choices) = node["choices"].as_array_mut()
    {
        choices.swap(a, b);
        changed = Changed::at(path);
    }
    if ui
        .button("+ choice")
        .on_hover_text("Ctrl Enter on the card")
        .clicked()
    {
        if node.get("choices").is_none_or(Value::is_null) {
            node["choices"] = Value::Array(Vec::new());
        }
        if let Some(map) = node.as_object_mut() {
            map.remove("next");
        }
        if let Some(choices) = node["choices"].as_array_mut() {
            choices.push(serde_json::json!({ "label": ["…"] }));
        }
        changed = Changed::at(path);
        *label = format!("Add a choice in {}", doc.owner.title());
    }
    if count == 0 {
        widgets::hint(
            ui,
            "Without choices the node goes on by next; with them, each choice leaves by its own arrow.",
        );
    }
    if let Some(target) = go {
        cx.actions.push(FormAction::OpenRow {
            table: "node".to_owned(),
            key: target,
        });
    }
    changed
}

#[derive(Default)]
struct ChoiceMenu {
    remove: Option<usize>,
    swap: Option<(usize, usize)>,
}

/// One choice's card: its label, condition, what it reveals, a warning and the arrow it leaves by.
#[allow(clippy::too_many_arguments)]
fn choice_card(
    ui: &mut Ui,
    cx: &mut FormCx,
    choice_schema: &Value,
    choice: &mut Value,
    choice_path: &str,
    index: usize,
    count: usize,
    doc: &Doc,
    menu: &mut ChoiceMenu,
    go: &mut Option<String>,
) -> Changed {
    let mut changed = Changed::default();
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.label(theme::faint("≡"));
            widgets::badge(ui, "script");
            let id = ui.id().with(choice_path).with("label");
            let edit = crate::spans::line(
                ui,
                &mut cx.state.drafts,
                &choice["label"],
                id,
                egui::FontId::new(13.5, egui::FontFamily::Name("medium".into())),
                "the choice",
            );
            if let Some(spans) = edit.spans {
                choice["label"] = spans;
                changed = Changed::at(choice_path);
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.menu_button(theme::faint("…"), |ui| {
                    if index > 0 && ui.button("Move up").clicked() {
                        menu.swap = Some((index, index - 1));
                        ui.close();
                    }
                    if index + 1 < count && ui.button("Move down").clicked() {
                        menu.swap = Some((index, index + 1));
                        ui.close();
                    }
                    if ui.button("Remove the choice").clicked() {
                        menu.remove = Some(index);
                        ui.close();
                    }
                });
            });
        });
        widgets::kv(ui, "condition", |ui| match choice.get("requires") {
            Some(requires) if !requires.is_null() => {
                let schema = choice_schema
                    .pointer("/properties/requires")
                    .cloned()
                    .unwrap_or(serde_json::json!({ "x-condition": true }));
                let mut draft = requires.clone();
                ui.vertical(|ui| {
                    if crate::condition::edit(
                        ui,
                        cx,
                        &schema,
                        &mut draft,
                        &format!("{choice_path}/requires"),
                    )
                    .is_some()
                    {
                        choice["requires"] = draft;
                        changed = Changed::at(choice_path);
                    }
                    if ui
                        .add(
                            egui::Label::new(theme::faint("✕ no condition").size(11.5))
                                .sense(egui::Sense::click()),
                        )
                        .clicked()
                    {
                        choice.as_object_mut().map(|m| m.remove("requires"));
                        changed = Changed::at(choice_path);
                    }
                });
            }
            _ => {
                if ui
                    .add(
                        egui::Label::new(theme::muted("none").size(13.0))
                            .sense(egui::Sense::click()),
                    )
                    .on_hover_text("Add a condition")
                    .clicked()
                {
                    choice["requires"] = Value::Bool(true);
                    changed = Changed::at(choice_path);
                }
            }
        });
        widgets::kv(ui, "reveal", |ui| {
            let mut reveal: Vec<String> = choice["reveal"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect();
            let mut touched = false;
            ui.horizontal_wrapped(|ui| {
                for option in ["locked", "needs", "costs", "gains"] {
                    let on = reveal.iter().any(|r| r == option);
                    if ui
                        .selectable_label(on, theme::mono(option).size(12.0))
                        .clicked()
                    {
                        if on {
                            reveal.retain(|r| r != option);
                        } else {
                            reveal.push(option.to_owned());
                        }
                        touched = true;
                    }
                }
                if reveal.is_empty() {
                    ui.label(theme::muted("nothing").size(12.5));
                }
            });
            if touched {
                if reveal.is_empty() {
                    choice.as_object_mut().map(|m| m.remove("reveal"));
                } else {
                    choice["reveal"] =
                        Value::Array(reveal.into_iter().map(Value::String).collect());
                }
                changed = Changed::at(choice_path);
            }
        });
        widgets::kv(ui, "warning", |ui| {
            let mut warn = choice.get("warn").cloned().unwrap_or(Value::Null);
            if warn.is_null() {
                if ui
                    .add(
                        egui::Label::new(theme::muted("none").size(13.0))
                            .sense(egui::Sense::click()),
                    )
                    .on_hover_text("Warn before the choice")
                    .clicked()
                {
                    choice["warn"] = Value::String(String::new());
                    changed = Changed::at(choice_path);
                }
            } else if crate::forms::text(ui, cx, &mut warn, &format!("{choice_path}/warn"))
                .is_some()
            {
                if warn.as_str().is_some_and(str::is_empty) {
                    choice.as_object_mut().map(|m| m.remove("warn"));
                } else {
                    choice["warn"] = warn;
                }
                changed = Changed::at(choice_path);
            }
        });
        widgets::kv(ui, "arrow", |ui| match choice["to"].as_str() {
            Some(to) => {
                let target = to.to_owned();
                let what = doc
                    .nodes()
                    .get(&target)
                    .map(|n| super::graph::card_title(&target, n))
                    .unwrap_or_else(|| target.clone());
                if ui
                    .add(
                        egui::Label::new(theme::mono(format!("→ {what}")).size(13.0))
                            .sense(egui::Sense::click()),
                    )
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    *go = Some(target);
                }
            }
            None => {
                ui.label(theme::muted("none · ends the conversation").size(13.0));
            }
        });
    });
    changed
}

/// The inspector of one choice, as the outline selects it: the card alone, under its node.
fn choice_inspector(editor: &mut Editor, ui: &mut Ui, doc: &Doc, name: &str, index: usize) {
    let Some(node) = doc.nodes().get(name).cloned() else {
        return;
    };
    let count = node["choices"].as_array().map_or(0, Vec::len);
    if index >= count {
        node_inspector(editor, ui, doc, name);
        return;
    }
    let label_text = nodes::plain_text(&node["choices"][index]["label"]);
    breadcrumb(
        ui,
        &format!(
            "{} › {name} › {}",
            owner_short(editor, doc),
            nodes::clip(&label_text, 40)
        ),
    );
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let path = format!("{}/nodes/{name}", doc.owner.pointer());
    let choice_schema = nodes::variant_schema(&root, "dialogue")
        .and_then(|schema| schema.pointer("/properties/choices/items").cloned())
        .unwrap_or(Value::Null);
    let mut draft = node.clone();
    let mut actions = Vec::new();
    let mut menu = ChoiceMenu::default();
    let mut go: Option<String> = None;
    let mut changed = {
        let mut cx = form_cx(editor, &root, &mut actions, doc);
        choice_card(
            ui,
            &mut cx,
            &choice_schema,
            &mut draft["choices"][index],
            &format!("{path}/choices/{index}"),
            index,
            count,
            doc,
            &mut menu,
            &mut go,
        )
    };
    for action in actions {
        act(editor, action, doc);
    }
    let mut label = format!("Edit a choice in {}", doc.owner.title());
    if let Some(removed) = menu.remove
        && let Some(choices) = draft["choices"].as_array_mut()
    {
        choices.remove(removed);
        changed = Changed::at(&path);
        label = format!("Remove a choice in {}", doc.owner.title());
    }
    if let Some((a, b)) = menu.swap
        && let Some(choices) = draft["choices"].as_array_mut()
    {
        choices.swap(a, b);
        changed = Changed::at(&path);
    }
    if let Some(target) = go {
        select_nodes(editor, doc, &[target]);
        return;
    }
    if changed.is_some() {
        let mut script = doc.script.clone();
        script["nodes"][name] = draft;
        write(editor, doc, script, label);
    }
}

/// KEYS: what the outline answers, for the reader who has not learnt them.
fn keys_card(ui: &mut Ui) {
    widgets::section(ui, "Keys");
    for (keys, text) in [
        ("↑ ↓", "previous, next row"),
        ("← →", "fold, unfold"),
        ("Enter", "edit the row"),
        ("Tab", "add a node after"),
        ("Ctrl L", "link to a node by name"),
        ("O", "back to the canvas"),
    ] {
        ui.horizontal(|ui| {
            ui.allocate_ui_with_layout(
                egui::vec2(72.0, 20.0),
                egui::Layout::left_to_right(egui::Align::Center),
                |ui| widgets::key_hint(ui, keys),
            );
            ui.label(theme::muted(text).size(13.0));
        });
    }
}

/// Who speaks a line: an npc with a face from its busts, the owning object, or the narrator.
fn speaker_rows(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    by: &mut Value,
    path: &str,
    doc: &Doc,
) -> Changed {
    let mut changed = Changed::default();
    let current = by["type"].as_str().unwrap_or("narrator").to_owned();
    let mut picked = current.clone();
    let options: Vec<&str> = if doc.kind == OwnerKind::Object {
        vec!["npc", "object", "narrator"]
    } else {
        vec!["npc", "narrator"]
    };
    widgets::kv(ui, "by", |ui| {
        egui::ComboBox::from_id_salt(ui.id().with(path).with("speaker"))
            .selected_text(theme::mono(&current).size(13.0))
            .width(ui.available_width())
            .show_ui(ui, |ui| {
                for option in &options {
                    ui.selectable_value(&mut picked, (*option).to_owned(), *option);
                }
            });
    });
    if picked != current {
        *by = match picked.as_str() {
            "npc" => {
                serde_json::json!({ "type": "npc", "npc": cx.speaker.clone().unwrap_or_default() })
            }
            "object" => serde_json::json!({ "type": "object" }),
            _ => serde_json::json!({ "type": "narrator" }),
        };
        changed = Changed::at(path);
    }
    if by["type"] == "npc" {
        let mut npc = by["npc"].as_str().unwrap_or_default().to_owned();
        widgets::kv(ui, "└ npc", |ui| {
            if crate::picker::row(ui, cx, "npc", &mut npc, &format!("{path}/npc")) {
                by["npc"] = Value::String(npc.clone());
                changed = Changed::at(path);
            }
        });
        cx.speaker = Some(npc.clone());
        let face_schema = schema
            .get("oneOf")
            .and_then(Value::as_array)
            .and_then(|alts| {
                alts.iter().find(|alt| {
                    alt.pointer("/properties/type/const")
                        .and_then(Value::as_str)
                        == Some("npc")
                })
            })
            .and_then(|alt| alt.pointer("/properties/face"))
            .cloned()
            .unwrap_or(serde_json::json!({ "x-face": true, "type": ["string", "null"] }));
        let mut face = by.get("face").cloned().unwrap_or(Value::Null);
        widgets::kv(ui, "└ face", |ui| {
            let file = nodes::bust_file(cx.files, &npc, face.as_str());
            let ctx = ui.ctx().clone();
            if let Some(file) = file
                && let Some(thumb) = cx.state.thumbnails.image(&ctx, cx.files, &file)
            {
                let [w, h] = [thumb.size[0] as f32, thumb.size[1] as f32];
                let uv = if h >= w {
                    egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, w / h))
                } else {
                    egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(h / w, 1.0))
                };
                ui.add(
                    egui::Image::from_texture((thumb.texture.id(), egui::vec2(26.0, 26.0)))
                        .uv(uv)
                        .corner_radius(4.0),
                );
            }
            if crate::forms::value(ui, cx, &face_schema, &mut face, &format!("{path}/face"))
                .is_some()
            {
                if face.is_null() || face.as_str() == Some("") {
                    by.as_object_mut().map(|map| map.remove("face"));
                } else {
                    by["face"] = face.clone();
                }
                changed = Changed::at(path);
            }
        });
    }
    changed
}

fn act(editor: &mut Editor, action: FormAction, doc: &Doc) {
    crate::ui::inspector::act(editor, action, doc.owner.table(), doc.owner.key());
}

/// A constant in a node that Make shared may turn into a variable.
#[derive(Clone, Debug)]
pub struct Constant {
    pub node: String,
    pub field: String,
    pub value: Value,
    pub ty: &'static str,
    pub table: Option<String>,
    pub name: String,
    pub ticked: bool,
}

pub struct MakeSharedDialog {
    pub owner: ScriptOwner,
    pub key: String,
    pub kind: String,
    pub constants: Vec<Constant>,
    pub error: Option<String>,
}

pub struct MakeInlineDialog {
    pub key: String,
    pub users: Vec<(String, String, String)>,
    pub picked: usize,
}

pub fn make_shared_dialog(editor: &mut Editor, doc: &Doc) {
    if doc.is_shared() {
        return;
    }
    let root = editor
        .shapes
        .table("script")
        .map(|shape| shape.shape.clone())
        .unwrap_or(Value::Null);
    let mut constants = Vec::new();
    let mut taken: BTreeMap<String, usize> = BTreeMap::new();
    for (name, node) in doc.nodes() {
        let kind = nodes::kind(node);
        let Some(schema) = nodes::variant_schema(&root, kind) else {
            continue;
        };
        for (field, field_schema) in schema::properties(schema) {
            if field == "type" {
                continue;
            }
            let Some(value) = node.get(field) else {
                continue;
            };
            let (ty, table) = match (schema::marker(field_schema), value) {
                (Some("x-table"), Value::String(_)) => {
                    ("row", schema::table_of(field_schema).map(str::to_owned))
                }
                (Some("x-place"), Value::Object(_)) => ("place", None),
                (None, Value::Number(n)) if n.is_i64() => ("integer", None),
                (None, Value::Number(_)) => ("number", None),
                (None, Value::Bool(_)) => ("boolean", None),
                (None, Value::String(_)) if schema::type_names(field_schema) == vec!["string"] => {
                    ("text", None)
                }
                _ => continue,
            };
            let base = field.clone();
            let count = taken.entry(base.clone()).or_default();
            *count += 1;
            let var_name = if *count == 1 {
                base
            } else {
                format!("{name}_{field}")
            };
            constants.push(Constant {
                node: name.clone(),
                field: field.clone(),
                value: value.clone(),
                ty,
                table,
                name: var_name,
                ticked: false,
            });
        }
    }
    let files = editor.project.as_ref().map(|p| &p.files);
    let key = files.map_or_else(
        || doc.owner.key().to_owned(),
        |files| crate::rows::free_key(files, "script", doc.owner.key()),
    );
    editor.dialogs.push(Dialog::MakeShared(MakeSharedDialog {
        owner: doc.owner.clone(),
        key,
        kind: doc.kind.name().to_owned(),
        constants,
        error: None,
    }));
}

pub fn make_shared_body(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: MakeSharedDialog,
) -> Option<MakeSharedDialog> {
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let owner = dialog
        .owner
        .title()
        .split(" › ")
        .next()
        .unwrap_or("")
        .to_owned();
    let count = Doc::load(editor, &dialog.owner).map_or(0, |doc| doc.nodes().len());
    let problem = editor
        .project
        .as_ref()
        .and_then(|project| crate::rows::key_problem(&project.files, "script", &dialog.key));
    let valid = problem
        .as_deref()
        .is_none_or(|problem| problem.contains("already exists"));
    let free = problem.is_none();
    crate::ui::dialogs::card(ctx, "make-shared", 620.0, |ui| {
        ui.label(RichText::new("Make shared").strong().size(18.0));
        ui.add_space(6.0);
        ui.label(
            theme::muted(format!(
                "The {count} nodes move into a new script row, which {owner} names in their place."
            ))
            .size(13.5),
        );
        ui.add_space(10.0);
        widgets::kv(ui, "key", |ui| {
            ui.scope(|ui| {
                ui.set_width(160.0);
                let response = crate::forms::boxed_input(ui, None, |ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut dialog.key)
                            .frame(egui::Frame::NONE)
                            .font(egui::TextStyle::Monospace)
                            .desired_width(f32::INFINITY),
                    )
                });
                if dialog.error.is_none() {
                    response.request_focus();
                }
            });
            let standing = if !valid {
                "letters, digits, _ and - only".to_owned()
            } else if free {
                format!("script/{} · free", dialog.key)
            } else {
                format!("script/{} · taken", dialog.key)
            };
            ui.label(theme::faint(standing).size(12.5).monospace());
        });
        widgets::kv(ui, "owner", |ui| {
            egui::ComboBox::from_id_salt("make-shared-kind")
                .width(ui.available_width() - 8.0)
                .selected_text(theme::mono(&dialog.kind).size(13.0))
                .show_ui(ui, |ui| {
                    for kind in [
                        "object",
                        "npc",
                        "item",
                        "area",
                        "quest",
                        "shop",
                        "blueprint",
                        "any",
                    ] {
                        ui.selectable_value(&mut dialog.kind, kind.to_owned(), kind);
                    }
                });
        });
        if !dialog.constants.is_empty() {
            ui.add_space(8.0);
            widgets::section(ui, "Turn constants into variables");
            egui::ScrollArea::vertical()
                .max_height(260.0)
                .show(ui, |ui| {
                    for constant in &mut dialog.constants {
                        ui.horizontal(|ui| {
                            widgets::toggle(ui, &mut constant.ticked);
                            ui.add_space(8.0);
                            ui.allocate_ui_with_layout(
                                egui::vec2(300.0, 20.0),
                                egui::Layout::left_to_right(egui::Align::Center),
                                |ui| {
                                    ui.label(theme::mono(&constant.field).size(13.0));
                                    let shown = match &constant.value {
                                        Value::String(text) => text.clone(),
                                        other => crate::condition::summary(other),
                                    };
                                    ui.label(theme::strong(nodes::clip(&shown, 32)).size(13.0));
                                },
                            );
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if constant.ticked {
                                        let what = match (&constant.table, constant.ty) {
                                            (Some(table), _) => format!("variable {} · row", table),
                                            (None, ty) => format!("variable {ty}"),
                                        };
                                        ui.add(
                                            egui::TextEdit::singleline(&mut constant.name)
                                                .desired_width(110.0)
                                                .font(egui::TextStyle::Monospace),
                                        );
                                        ui.label(theme::muted(what).size(12.5));
                                    } else {
                                        ui.label(theme::muted("stays a constant").size(12.5));
                                    }
                                },
                            );
                        });
                        let rect = ui.max_rect();
                        let y = ui.cursor().min.y + 2.0;
                        ui.painter().line_segment(
                            [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
                            egui::Stroke::new(1.0, theme::BORDER),
                        );
                        ui.add_space(4.0);
                    }
                });
            ui.add_space(6.0);
            ui.label(theme::muted(format!("Variables start without defaults; {owner} gives today's values. Make inline is the way back.")).size(13.0));
        }
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if ui
                .add_enabled(
                    valid && free,
                    egui::Button::new(
                        RichText::new("Make shared · one step")
                            .color(egui::Color32::WHITE)
                            .size(13.5),
                    )
                    .fill(theme::ACCENT)
                    .corner_radius(5.0)
                    .min_size(egui::vec2(0.0, 28.0)),
                )
                .clicked()
                || (enter && valid && free)
            {
                outcome = Some(true);
            }
            if ui
                .add(
                    egui::Button::new(RichText::new("Cancel").size(13.5))
                        .min_size(egui::vec2(0.0, 28.0))
                        .corner_radius(5.0),
                )
                .clicked()
                || escape
            {
                outcome = Some(false);
            }
        });
    });
    editor
        .status
        .left
        .push(format!("{owner} › inline script · make shared"));
    editor
        .status
        .right
        .push("Enter makes it · Esc cancels".to_owned());
    match outcome {
        Some(true) => match make_shared(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(dialog)
            }
        },
        Some(false) => None,
        None => Some(dialog),
    }
}

fn make_shared(editor: &mut Editor, dialog: &MakeSharedDialog) -> Result<(), String> {
    let doc = Doc::load(editor, &dialog.owner).ok_or("the script is gone")?;
    let files = &editor.project.as_ref().ok_or("no project")?.files;
    if let Some(problem) = crate::rows::key_problem(files, "script", &dialog.key) {
        return Err(problem);
    }
    let mut nodes_map = doc.nodes().clone();
    let mut variables = Map::new();
    let mut values = Map::new();
    for constant in dialog.constants.iter().filter(|c| c.ticked) {
        let name = constant.name.trim();
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(format!("{} is not a variable name", constant.name));
        }
        if let Some(node) = nodes_map.get_mut(&constant.node) {
            node[&constant.field] = serde_json::json!({ "var": name });
        }
        let mut declared = serde_json::json!({ "type": constant.ty });
        if let Some(table) = &constant.table {
            declared["table"] = Value::String(table.clone());
        }
        variables.insert(name.to_owned(), declared);
        values.insert(name.to_owned(), constant.value.clone());
    }
    let mut script = serde_json::json!({ "owner": dialog.kind });
    for field in ["state", "locals"] {
        if let Some(value) = doc.script.get(field) {
            script[field] = value.clone();
        }
    }
    if !variables.is_empty() {
        script["variables"] = Value::Object(variables);
    }
    script["nodes"] = Value::Object(nodes_map);
    let mut module = serde_json::json!({ "type": "shared_script", "script": dialog.key });
    if !values.is_empty() {
        module["values"] = Value::Object(values);
    }
    let row = doc.row_with(module);
    let mut edit = Edit::new(format!(
        "Make {} shared as script/{}",
        dialog.owner.title(),
        dialog.key
    ));
    edit.write_json(row_file("script", &dialog.key), &script);
    edit.write_json(doc.file.clone(), &row);
    if editor.apply(edit) {
        if let Some(view) = editor.views.script.views.remove(&dialog.owner) {
            let shared = ScriptOwner::Shared {
                key: dialog.key.clone(),
            };
            editor.views.script.views.insert(shared, view);
        }
        for (_, tab) in editor.dock.iter_all_tabs_mut() {
            if *tab == Tab::Script(dialog.owner.clone()) {
                *tab = Tab::Script(ScriptOwner::Shared {
                    key: dialog.key.clone(),
                });
            }
        }
        editor.select(Selection::row("script", &dialog.key));
        Ok(())
    } else {
        Err("refused; see the message".to_owned())
    }
}

pub fn make_inline_dialog(editor: &mut Editor, doc: &Doc) {
    let ScriptOwner::Shared { key } = &doc.owner else {
        return;
    };
    let Some(project) = &editor.project else {
        return;
    };
    let mut users = Vec::new();
    for usage in project.usages.of_row("script", key) {
        let Some((table, row_key)) = row_of(&usage.file) else {
            continue;
        };
        if table == "script" || usage.pointer.contains("/nodes/") {
            continue;
        }
        let pointer = usage.pointer.trim_end_matches("/script").to_owned();
        users.push((table.to_owned(), row_key.to_owned(), pointer));
    }
    if users.is_empty() {
        editor.toast("No owner names this script, so there is nowhere to copy it inline");
        return;
    }
    editor.dialogs.push(Dialog::MakeInline(MakeInlineDialog {
        key: key.clone(),
        users,
        picked: 0,
    }));
}

pub fn make_inline_body(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: MakeInlineDialog,
) -> Option<MakeInlineDialog> {
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let count = editor
        .row_value("script", &dialog.key)
        .map_or(0, |script| script["nodes"].as_object().map_or(0, Map::len));
    let variables = editor.row_value("script", &dialog.key).map_or(0, |script| {
        script["variables"].as_object().map_or(0, Map::len)
    });
    let names: Vec<String> = dialog
        .users
        .iter()
        .map(|(table, key, pointer)| {
            let module = pointer
                .split("/scripts/")
                .next()
                .unwrap_or(pointer)
                .to_owned();
            editor
                .row_value(table, key)
                .and_then(|row| {
                    row.pointer(&module)
                        .and_then(|m| m["name"].as_str().map(str::to_owned))
                })
                .unwrap_or_else(|| {
                    module
                        .strip_prefix("/modules/")
                        .map(|m| format!("module {m}"))
                        .unwrap_or(module)
                })
        })
        .collect();
    crate::ui::dialogs::card(ctx, "make-inline", 620.0, |ui| {
        ui.label(RichText::new("Make inline").strong().size(18.0));
        ui.add_space(6.0);
        ui.label(theme::muted(format!("The {count} nodes of script/{} are copied into one owner's row, its values written in. The script row stays.", dialog.key)).size(13.5));
        ui.add_space(10.0);
        widgets::section(ui, "Into which owner");
        egui::ScrollArea::vertical()
            .max_height(300.0)
            .show(ui, |ui| {
                for (index, (table, key, pointer)) in dialog.users.iter().enumerate() {
                    let picked = dialog.picked == index;
                    let module = names.get(index).cloned().unwrap_or_else(|| pointer.clone());
                    let response = egui::Frame::new()
                        .fill(if picked {
                            theme::ACCENT_SOFT
                        } else {
                            theme::PANEL
                        })
                        .stroke(egui::Stroke::new(
                            1.0,
                            if picked { theme::ACCENT } else { theme::BORDER },
                        ))
                        .corner_radius(5.0)
                        .inner_margin(egui::Margin::symmetric(10, 6))
                        .show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.horizontal(|ui| {
                                widgets::badge(ui, table);
                                ui.label(theme::mono(format!("{table}/{key}")).size(13.0));
                                ui.label(theme::muted(module).size(12.5));
                            });
                        })
                        .response
                        .interact(egui::Sense::click());
                    if response.clicked() {
                        dialog.picked = index;
                    }
                }
            });
        ui.add_space(6.0);
        ui.label(
            theme::muted(if variables == 0 {
                "No variables: the nodes copy as they are.".to_owned()
            } else {
                format!(
                    "{variables} {} take the owner's values, or the defaults where it gives none.",
                    if variables == 1 {
                        "variable"
                    } else {
                        "variables"
                    }
                )
            })
            .size(13.0),
        );
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if ui
                .add(
                    egui::Button::new(
                        RichText::new("Make inline · one step")
                            .color(egui::Color32::WHITE)
                            .size(13.5),
                    )
                    .fill(theme::ACCENT)
                    .corner_radius(5.0)
                    .min_size(egui::vec2(0.0, 28.0)),
                )
                .clicked()
                || enter
            {
                outcome = Some(true);
            }
            if ui
                .add(
                    egui::Button::new(RichText::new("Cancel").size(13.5))
                        .min_size(egui::vec2(0.0, 28.0))
                        .corner_radius(5.0),
                )
                .clicked()
                || escape
            {
                outcome = Some(false);
            }
        });
    });
    editor
        .status
        .left
        .push(format!("script/{} · make inline", dialog.key));
    editor
        .status
        .right
        .push("Enter makes it · Esc cancels".to_owned());
    match outcome {
        Some(true) => {
            make_inline(editor, &dialog);
            None
        }
        Some(false) => None,
        None => Some(dialog),
    }
}

fn make_inline(editor: &mut Editor, dialog: &MakeInlineDialog) {
    let Some((table, key, pointer)) = dialog.users.get(dialog.picked).cloned() else {
        return;
    };
    let Some(script) = editor.row_value("script", &dialog.key) else {
        return;
    };
    let Some(mut row) = editor.row_value(&table, &key) else {
        return;
    };
    let Some(module) = row.pointer(&pointer).cloned() else {
        return;
    };
    let mut values: Map<String, Value> = module["values"].as_object().cloned().unwrap_or_default();
    for (name, variable) in script["variables"].as_object().into_iter().flatten() {
        if !values.contains_key(name)
            && let Some(default) = variable.get("default")
        {
            values.insert(name.clone(), default.clone());
        }
    }
    let mut nodes_value = script["nodes"].clone();
    substitute(&mut nodes_value, &values);
    let mut inline = serde_json::json!({ "type": "inline_script", "nodes": nodes_value });
    for field in ["state", "locals"] {
        if let Some(value) = script.get(field)
            && !value.is_null()
        {
            inline[field] = value.clone();
        }
    }
    if let Some(slot) = row.pointer_mut(&pointer) {
        *slot = inline;
    }
    let mut edit = Edit::new(format!(
        "Make script/{} inline in {table}/{key}",
        dialog.key
    ));
    edit.write_json(row_file(&table, &key), &row);
    if editor.apply(edit) {
        let owner = ScriptOwner::inline(&table, &key, &pointer);
        editor.select(Selection::row(&table, &key));
        editor.open_tab(Tab::Script(owner));
    }
}

fn substitute(value: &mut Value, values: &Map<String, Value>) {
    match value {
        Value::Object(map) => {
            if map.len() == 1
                && let Some(name) = map.get("var").and_then(Value::as_str)
                && let Some(filled) = values.get(name)
            {
                *value = filled.clone();
                return;
            }
            for child in map.values_mut() {
                substitute(child, values);
            }
        }
        Value::Array(items) => {
            for item in items {
                substitute(item, values);
            }
        }
        _ => {}
    }
}
