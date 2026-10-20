use std::collections::BTreeSet;

use design_tokens::glyph::{self, Mark};
use egui::Ui;
use engine::core::content::{ContentFile, fields_file};
use engine::core::script::{NodeKind, RunnerKindDef};
use engine::systems::area::blueprint::holes;
use engine::systems::memory::MemoryDef;
use engine::systems::npc::NpcDef;
use engine::systems::script::{RiftEffectKind, ScriptDef};
use serde_json::Value;

use super::graph::ScriptGraphAction;
use super::nodes::{self, LineSpeaker};
use super::{RenameNodeDialog, ScriptDoc, ScriptRef, select_nodes, write};
use crate::app::{BottomTab, Editor, ModalDialog};
use crate::forms::{self, FormAction, FormChange, FormCx};
use crate::keymap::EditorKey;
use crate::project::files::content_of;
use crate::project::{ContentEdit, RowSelection, catalogue_of};
use crate::ui::browser::{self, RowMenu};
use crate::ui::{row_form, sidebar, theme, widgets};
use crate::value::RowValue;
use crate::{condition, picker, spans, thumbs};

pub fn show(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, selection: &RowSelection) {
    super::sync_with_content(editor);
    let names = selected_nodes(doc, selection);
    let choice: Option<(String, usize)> = selection
        .parts
        .iter()
        .find_map(|part| part.strip_prefix("choice:"))
        .and_then(|rest| rest.rsplit_once('#'))
        .and_then(|(name, index)| Some((name.to_owned(), index.parse().ok()?)));
    egui::ScrollArea::vertical()
        .id_salt(("script-inspector", doc.at.slug()))
        .show(ui, |ui| match names.as_slice() {
            [] => {
                if !super::run::inspector(editor, ui, doc) {
                    sidebar::nothing_selected(ui, "Select a node to inspect it here.");
                }
            }
            [name] => {
                let name = name.clone();
                match &choice {
                    Some((node, index)) if *node == name => {
                        choice_inspector(editor, ui, doc, &name, *index)
                    }
                    _ => node_inspector(editor, ui, doc, &name),
                }
            }
            many => {
                breadcrumb(ui, &format!("{} › {} nodes", doc.at.title(), many.len()));
                widgets::card_frame(true).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    widgets::card_title(ui, &format!("{} nodes", many.len()));
                    for name in many {
                        if let Some(node) = doc.nodes().get(name) {
                            let summary =
                                nodes::summary(node, catalogue_of(editor.project.as_ref()));
                            ui.horizontal(|ui| {
                                ui.label(theme::mono(name).size(12.5));
                                ui.label(theme::muted(widgets::clip(&summary, 50)).size(12.5));
                            });
                        }
                    }
                    ui.add_space(6.0);
                    if widgets::danger(ui, "Delete these nodes").clicked() {
                        super::delete_nodes(editor, doc, many.to_vec());
                    }
                });
            }
        });
}

fn breadcrumb(ui: &mut Ui, text: &str) {
    ui.label(theme::muted(text).monospace().size(13.0));
    ui.add_space(4.0);
}

fn selected_nodes(doc: &ScriptDoc, selection: &RowSelection) -> Vec<String> {
    selection
        .parts
        .iter()
        .filter_map(|part| part.strip_prefix("node:").map(str::to_owned))
        .filter(|name| doc.nodes().contains_key(name))
        .collect()
}

pub fn script_row(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc) {
    super::sync_with_content(editor);
    let key = doc.at.key.clone();
    if let Some(folder) = crate::ui::breadcrumb::show(ui, &key) {
        crate::ui::content_tree::reveal(editor, &folder);
    }
    ui.add_space(4.0);
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(ScriptDef::TABLE);
    let runner_schema = root
        .pointer("/properties/runs_on")
        .cloned()
        .unwrap_or(Value::Null);
    let mut script = doc.script.clone();
    let mut actions = Vec::new();
    let what = "script";
    let mut picked = None;
    let changed = {
        let mut cx = doc.form_cx(editor, root, &mut actions);
        widgets::card_frame(false)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &key, what, |ui| {
                    let menu = RowMenu::of(&key);
                    picked = browser::row_menu(ui, &menu, false);
                });
                let mut changed = FormChange::default();
                widgets::kv(ui, "runs on", |ui| {
                    let mut runner = script["runs_on"].clone();
                    if forms::value(ui, &mut cx, &runner_schema, &mut runner, "/runs_on").is_some()
                    {
                        script["runs_on"] = runner;
                        changed = FormChange::at("/runs_on");
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
                    nodes::kind_of(node) == NodeKind::Return
                        && node.get("value").is_some_and(|v| !v.is_null())
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
    if let Some(action) = picked {
        browser::act(editor, ScriptDef::TABLE, &key, action);
    }
    events_section(editor, ui, doc);
    variables_section(editor, ui, doc);
    run_by_section(editor, ui, doc);
    action_buttons(editor, ui, doc);
}

pub fn names_of(map: &Value) -> String {
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

fn nodes_line(doc: &ScriptDoc) -> String {
    let count = doc.nodes().len();
    let dialogue = doc
        .nodes()
        .values()
        .filter(|node| nodes::is_dialogue(node))
        .count();
    if dialogue > 0 {
        format!("{count} · {dialogue} dialogue")
    } else {
        count.to_string()
    }
}

fn events_section(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc) {
    widgets::section(ui, "Events");
    let mut go: Option<String> = None;
    let mut any = false;
    for (name, node) in doc.nodes() {
        if !nodes::is_event(node) {
            continue;
        }
        any = true;
        let event = nodes::event_of(node).unwrap_or("?").to_owned();
        let pieces = nodes::pieces(node, catalogue_of(editor.project.as_ref()));
        let detail = pieces
            .first()
            .map(|line| line.iter().map(|p| p.text.clone()).collect::<String>())
            .unwrap_or_default();
        let response = ui
            .horizontal(|ui| {
                glyph::show(ui, Mark::ChevronRight, 12.0, theme::FAINT);
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
            &format!(
                "No event yet: {} opens the palette with the events this owner answers.",
                EditorKey::Palette.name()
            ),
        );
    }
    if let Some(name) = go {
        select_nodes(editor, doc, &[name]);
    }
}

fn variables_section(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc) {
    let key = doc.at.key.clone();
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
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(ScriptDef::TABLE);
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
                .of_content(&key)
                .iter()
                .filter(|u| ScriptRef::parse(&u.pointer).node.is_none())
                .count()
        })
        .unwrap_or(0);
    let mut script = doc.script.clone();
    let mut actions = Vec::new();
    let mut changed = FormChange::default();
    {
        let mut cx = doc.form_cx(editor, root, &mut actions);
        for (name, variable) in &variables {
            let filled: Vec<String> = doc
                .nodes()
                .iter()
                .filter(|(_, node)| {
                    let mut names = Vec::new();
                    holes(node, &mut names);
                    names.contains(name)
                })
                .map(|(node_name, _)| node_name.clone())
                .collect();
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, name, "", |ui| {
                    if ui.button("Remove the variable").clicked() {
                        script["variables"].remove_field(name);
                        changed = FormChange::at("/variables");
                        ui.close();
                    }
                });
                let path = format!("/variables/{name}");
                let mut draft = variable.clone();
                if forms::object_without(
                    ui,
                    &mut cx,
                    &variable_schema,
                    &mut draft,
                    &path,
                    &["default"],
                )
                .is_some()
                {
                    script["variables"][name] = draft.clone();
                    changed = FormChange::at(&path);
                }
                widgets::kv(ui, "default", |ui| match draft.get("default") {
                    Some(default) if !default.is_null() => {
                        let mut value = default.clone();
                        let schema = variable_schema
                            .pointer("/properties/default")
                            .cloned()
                            .unwrap_or(Value::Null);
                        if forms::value(
                            ui,
                            &mut cx,
                            &schema,
                            &mut value,
                            &format!("{path}/default"),
                        )
                        .is_some()
                        {
                            script["variables"][name]["default"] = value;
                            changed = FormChange::at(&path);
                        }
                        if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove")
                            .on_hover_text("Drop the default")
                            .clicked()
                        {
                            script["variables"][name]
                                .as_object_mut()
                                .map(|m| m.remove("default"));
                            changed = FormChange::at(&path);
                        }
                    }
                    _ => {
                        ui.label(theme::muted("none").size(13.0));
                        if ui.button("+ Add default").clicked() {
                            script["variables"][name]["default"] = Value::Null;
                            changed = FormChange::at(&path);
                        }
                    }
                });
                widgets::kv_text(
                    ui,
                    "holes",
                    match filled.as_slice() {
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
}

struct Caller {
    row: String,
    node: String,
}

fn run_by_section(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc) {
    let key = doc.at.key.clone();
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let callers: Vec<Caller> = project
        .usages
        .of_content(&key)
        .iter()
        .filter_map(|usage| {
            let (table, row_key) = content_of(&usage.file)?;
            let at = ScriptRef::parse(&usage.pointer);
            Some(Caller {
                row: format!("{table}/{row_key}"),
                node: at.node?,
            })
        })
        .collect();
    if !callers.is_empty() {
        widgets::section_count(ui, "Run by", callers.len());
        let mut open: Option<String> = None;
        for caller in &callers {
            let response = ui
                .horizontal(|ui| {
                    widgets::badge(ui, "script");
                    ui.label(theme::strong(&caller.row).monospace().size(13.0));
                    ui.label(
                        theme::muted(format!("from run · {}", caller.node))
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
                open = Some(caller.row.clone());
            }
        }
        if let Some((table, row_key)) = open.as_deref().and_then(|row| row.split_once('/')) {
            editor.open_row(table, row_key);
        }
    }
    let speakers: BTreeSet<String> = doc
        .nodes()
        .values()
        .flat_map(|node| node["lines"].as_array().cloned().unwrap_or_default())
        .filter_map(|line| LineSpeaker::of(&line["by"]))
        .filter_map(|speaker| speaker.npc().map(str::to_owned))
        .collect();
    if !speakers.is_empty() {
        widgets::section(ui, "Speaks for");
        for npc in &speakers {
            ui.horizontal(|ui| {
                widgets::badge(ui, "npc");
                ui.label(theme::strong(format!("npc/{npc}")).monospace().size(13.0));
                let through = callers
                    .iter()
                    .any(|caller| caller.row == format!("npc/{npc}"));
                ui.label(
                    theme::muted(if through {
                        "through its script"
                    } else {
                        "in its lines"
                    })
                    .monospace()
                    .size(12.5),
                );
            });
        }
    }
}

fn action_buttons(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc) {
    ui.add_space(8.0);
    let outline = editor
        .views
        .script
        .view(&doc.at)
        .is_some_and(|view| view.outline);
    let mut fire = false;
    let mut toggle_outline = false;
    ui.horizontal(|ui| {
        if widgets::keyed_button(ui, "▶ Run", Some(EditorKey::RunScript), true).clicked() {
            fire = true;
        }
        if widgets::keyed_button(
            ui,
            if outline { "Canvas" } else { "Outline" },
            Some(EditorKey::Outline),
            true,
        )
        .clicked()
        {
            toggle_outline = true;
        }
    });
    if fire {
        editor.panels.bottom = BottomTab::Run;
        editor.views.script.fire(&doc.at);
    }
    if toggle_outline {
        editor
            .views
            .script
            .view_mut(&doc.at, &editor.user, editor.project.as_ref())
            .toggle_outline();
    }
}

fn node_inspector(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, name: &str) {
    let Some(node) = doc.nodes().get(name).cloned() else {
        return;
    };
    let kind = node.kind().to_owned();
    breadcrumb(ui, &format!("{} › {name}", doc.at.title()));
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(ScriptDef::TABLE);
    let path = format!("/nodes/{name}");
    let (outs, unwired, ins, blurb) = {
        let catalogue = catalogue_of(editor.project.as_ref());
        let ins: Vec<(String, String)> = nodes::arrows_into(doc.nodes(), name, catalogue)
            .into_iter()
            .map(|(from, field)| {
                let label = nodes::port_label(doc.nodes(), catalogue, &from, &field);
                (from, label)
            })
            .collect();
        let entry = catalogue.entry(&kind);
        let outs = nodes::ports(&node, catalogue);
        let unwired = outs
            .iter()
            .map(|port| catalogue.unwired(&kind, &port.label))
            .collect::<Vec<_>>();
        (
            outs,
            unwired,
            ins,
            entry.map_or(String::new(), |e| e.blurb.clone()),
        )
    };
    let mut draft = node.clone();
    let mut actions = Vec::new();
    let mut label = format!("Edit {name} in {}", doc.at.title());
    let mut rename = false;
    let mut delete = false;
    let mut duplicate = false;
    let title = super::graph::card_title(name, &node);
    let changed = {
        let mut cx = doc.form_cx(editor, root, &mut actions);
        widgets::card_frame(true)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &title, "", |ui| {
                    if ui
                        .add(widgets::shortcut_button("Rename…", EditorKey::Rename))
                        .clicked()
                    {
                        rename = true;
                        ui.close();
                    }
                    if ui
                        .add(widgets::shortcut_button("Duplicate", EditorKey::Duplicate))
                        .clicked()
                    {
                        duplicate = true;
                        ui.close();
                    }
                    if ui
                        .add(widgets::shortcut_button("Delete", EditorKey::Delete))
                        .clicked()
                    {
                        delete = true;
                        ui.close();
                    }
                });
                let mut changed = FormChange::default();
                match nodes::kind_of(&draft) {
                    NodeKind::On => {
                        changed = on_form(ui, &mut cx, root, &mut draft, &path);
                    }
                    NodeKind::Dialogue => {}
                    _ => {
                        if let Some((schema, hidden)) = nodes::form_fields(root, &draft) {
                            let hidden: Vec<&str> = hidden.iter().map(String::as_str).collect();
                            changed = forms::object_without(
                                ui, &mut cx, schema, &mut draft, &path, &hidden,
                            );
                        }
                    }
                }
                if !nodes::is_dialogue(&node) {
                    arrows_rows(ui, &mut cx, &outs, &unwired);
                }
                changed
            })
            .inner
    };
    let mut go_to = act_but_go(editor, actions, doc);
    if nodes::is_dialogue(&node) {
        let mut draft_dialogue = draft.clone();
        let mut dialogue_actions = Vec::new();
        let dialogue_changed = {
            let mut cx = doc.form_cx(editor, root, &mut dialogue_actions);
            dialogue_form(
                ui,
                &mut cx,
                root,
                &mut draft_dialogue,
                &path,
                doc,
                &mut label,
            )
        };
        go_to = act_but_go(editor, dialogue_actions, doc).or(go_to);
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
                blurb: &blurb,
            },
        );
    }
    if let Some(callout) = editor
        .views
        .script
        .callout
        .as_ref()
        .filter(|callout| callout.live(&doc.at) && callout.node == name)
    {
        ui.label(theme::strong(&callout.rule).size(13.0).color(theme::DANGER));
        ui.label(theme::muted(&callout.text).size(12.5));
    }
    if let Some(target) = go_to {
        select_nodes(editor, doc, &[target]);
        return;
    }
    if rename {
        editor
            .dialogs
            .push(ModalDialog::RenameNode(RenameNodeDialog {
                at: doc.at.clone(),
                old: name.to_owned(),
                draft: name.to_owned(),
            }));
    }
    if duplicate {
        super::act(editor, doc, ScriptGraphAction::Duplicate(name.to_owned()));
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

fn arrows_rows(ui: &mut Ui, cx: &mut FormCx, outs: &[nodes::NodePort], unwired: &[String]) {
    let mut go: Option<String> = None;
    for (port, unwired) in outs.iter().zip(unwired) {
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
                ui.add(egui::Label::new(theme::muted(unwired).size(13.0)).wrap());
            }
        });
    }
    if let Some(name) = go {
        cx.actions.push(FormAction::OpenNode { name });
    }
}

struct Shown<'a> {
    name: &'a str,
    node: &'a Value,
    kind: &'a str,
    ins: &'a [(String, String)],
    blurb: &'a str,
}

fn node_extras(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, shown: Shown) {
    let Shown {
        name,
        node,
        kind,
        ins,
        blurb,
    } = shown;
    match (nodes::kind_of(node), kind.parse()) {
        (NodeKind::Repeat, _) => bounds_card(editor, ui, doc, name, node),
        (NodeKind::Effect, Ok(RiftEffectKind::Remember | RiftEffectKind::Forget)) => {
            let memory = node["memory"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| node["memories"][0].as_str().map(str::to_owned));
            if let Some(memory) = memory {
                memory_row_card(editor, ui, doc, &memory);
            }
            keeps_cards(ui, doc);
        }
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
    }
}

fn memory_row_card(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, memory: &str) {
    let Some(mut row) = editor.row_value(memory) else {
        return;
    };
    let shapes = editor.shapes.clone();
    let schema = shapes.shape_of(MemoryDef::TABLE);
    let mut actions = Vec::new();
    let changed = {
        let mut cx = doc.form_cx(editor, schema, &mut actions);
        widgets::card_frame(false)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &format!("memory/{memory}"), "row", |ui| {
                    if ui.button("Open the row").clicked() {
                        cx.actions.push(FormAction::OpenRow {
                            table: MemoryDef::TABLE.to_owned(),
                            key: memory.to_owned(),
                        });
                        ui.close();
                    }
                });
                forms::object_without(ui, &mut cx, schema, &mut row, "", &["modules"])
            })
            .inner
    };
    for action in actions {
        act(editor, action, doc);
    }
    if changed.is_some() {
        let mut edit = ContentEdit::new(format!("Edit memory/{memory}"));
        edit.write_json(fields_file(memory), &row);
        editor.apply(edit);
    }
}

fn keeps_cards(ui: &mut Ui, doc: &ScriptDoc) {
    let runner = doc.kind.name();
    for (title, field, sentence) in [
        (
            "state",
            "state",
            format!("its {runner}'s, shared by its flows"),
        ),
        ("locals", "locals", "values that last one flow".to_owned()),
    ] {
        widgets::card_frame(false).show(ui, |ui| {
            ui.set_width(ui.available_width());
            widgets::card_title(ui, title);
            let names = names_of(&doc.script[field]);
            ui.label(theme::muted(format!("{names} · {sentence}")).size(13.0));
        });
    }
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_title(ui, "variables");
        let text = format!(
            "{} · each runner's values",
            names_of(&doc.script["variables"])
        );
        ui.label(theme::muted(text).size(13.0));
    });
}

fn bounds_card(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, name: &str, node: &Value) {
    let catalogue = catalogue_of(editor.project.as_ref());
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
        .filter(|n| nodes::kind_of(n) == NodeKind::Wait)
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
        .any(|n| catalogue.entry(n.kind()).is_some_and(|e| e.pauses));
    let steps = if pauses {
        body.len() + 1
    } else {
        (body.len() + 1) * at_most as usize
    };
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "bounds", "compiler", |_| {});
        widgets::kv_text(ui, "steps", format!("at most {steps} between two waits"));
        widgets::kv_text(
            ui,
            "waits",
            match waits.as_slice() {
                [] => "none in a pass".to_owned(),
                [one] => format!("at most {} · {} s in all", at_most as i64, one * at_most),
                many => format!(
                    "at most {} · {} s in all",
                    at_most as i64 * many.len() as i64,
                    many.iter().sum::<f64>() * at_most
                ),
            },
        );
    });
}

fn on_form(ui: &mut Ui, cx: &mut FormCx, root: &Value, node: &mut Value, path: &str) -> FormChange {
    let mut changed = FormChange::default();
    let events = nodes::event_variants(root);
    let current = nodes::event_of(node).unwrap_or("").to_owned();
    let mut picked = current.clone();
    widgets::kv(ui, "event", |ui| {
        widgets::combo(ui.id().with(path).with("event"))
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
        changed = FormChange::at(path);
    }
    if let Some(schema) = nodes::event_variant(root, nodes::event_of(node).unwrap_or("")) {
        changed |= forms::object_without(ui, cx, schema, node, path, &["event"]);
    }
    changed
}

fn dialogue_form(
    ui: &mut Ui,
    cx: &mut FormCx,
    root: &Value,
    node: &mut Value,
    path: &str,
    doc: &ScriptDoc,
    label: &mut String,
) -> FormChange {
    let mut changed = FormChange::default();
    let Some(schema) = nodes::variant_schema(root, NodeKind::Dialogue.name()) else {
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
            widgets::card_header(ui, &format!("line {}", index + 1), "", |ui| {
                swap_line = widgets::move_entries(ui, index, count).or(swap_line);
                if count > 1 && ui.button("Remove the line").clicked() {
                    remove_line = Some(index);
                    ui.close();
                }
            });
            changed |= speaker_rows(
                ui,
                cx,
                &by_schema,
                &mut line["by"],
                &format!("{line_path}/by"),
                doc,
            );
            changed |= spans::line_field(ui, cx, &mut line["text"], &format!("{line_path}/text"));
        });
    }
    if let Some(index) = remove_line
        && let Some(lines) = node["lines"].as_array_mut()
        && lines.len() > 1
    {
        lines.remove(index);
        changed = FormChange::at(path);
        *label = format!("Remove a line in {}", doc.at.title());
    }
    if let Some((a, b)) = swap_line
        && let Some(lines) = node["lines"].as_array_mut()
    {
        lines.swap(a, b);
        changed = FormChange::at(path);
    }
    if ui
        .button("+ line")
        .on_hover_text(format!("{} on the card", EditorKey::Confirm.name()))
        .clicked()
    {
        if let Some(lines) = node["lines"].as_array_mut() {
            lines.push(doc.default_speaker().blank_line());
        }
        changed = FormChange::at(path);
        *label = format!("Add a line in {}", doc.at.title());
    }
    widgets::section(ui, "Choices");
    let mut go: Option<String> = None;
    let count = node["choices"].as_array().map_or(0, Vec::len);
    let mut menu = ChoiceMenu::default();
    for index in 0..count {
        let at = ChoiceAt {
            schema: &choice_schema,
            path,
            index,
            count,
            doc,
        };
        let outcome = choice_card(ui, cx, &mut node["choices"][index], &at);
        changed |= outcome.changed;
        menu = menu.or(outcome.menu);
        go = go.or(outcome.go);
    }
    if let Some(index) = menu.remove
        && let Some(choices) = node["choices"].as_array_mut()
    {
        choices.remove(index);
        changed = FormChange::at(path);
        *label = format!("Remove a choice in {}", doc.at.title());
    }
    if let Some((a, b)) = menu.swap
        && let Some(choices) = node["choices"].as_array_mut()
    {
        choices.swap(a, b);
        changed = FormChange::at(path);
    }
    if ui
        .button("+ choice")
        .on_hover_text(format!("{} on the card", EditorKey::AddChoice.name()))
        .clicked()
    {
        super::add_choice(node);
        changed = FormChange::at(path);
        *label = format!("Add a choice in {}", doc.at.title());
    }
    if let Some(name) = go {
        cx.actions.push(FormAction::OpenNode { name });
    }
    changed
}

#[derive(Default)]
struct ChoiceMenu {
    remove: Option<usize>,
    swap: Option<(usize, usize)>,
}

impl ChoiceMenu {
    fn or(self, other: ChoiceMenu) -> ChoiceMenu {
        ChoiceMenu {
            remove: self.remove.or(other.remove),
            swap: self.swap.or(other.swap),
        }
    }
}

struct ChoiceAt<'a> {
    schema: &'a Value,
    path: &'a str,
    index: usize,
    count: usize,
    doc: &'a ScriptDoc,
}

#[derive(Default)]
struct ChoiceOutcome {
    changed: FormChange,
    menu: ChoiceMenu,
    go: Option<String>,
}

fn choice_card(ui: &mut Ui, cx: &mut FormCx, choice: &mut Value, at: &ChoiceAt) -> ChoiceOutcome {
    let ChoiceAt {
        schema: choice_schema,
        path,
        index,
        count,
        doc,
    } = *at;
    let choice_path = &format!("{path}/choices/{index}");
    let mut changed = FormChange::default();
    let mut menu = ChoiceMenu::default();
    let mut go: Option<String> = None;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            let id = ui.id().with(choice_path).with("label");
            let edit = spans::line(
                ui,
                &choice["label"],
                id,
                egui::FontId::new(13.5, theme::medium()),
                "the choice",
            );
            if let Some(spans) = edit.spans {
                choice["label"] = spans;
                changed = FormChange::at(choice_path);
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
                    if condition::edit(
                        ui,
                        cx,
                        &schema,
                        &mut draft,
                        &format!("{choice_path}/requires"),
                    )
                    .is_some()
                    {
                        choice["requires"] = draft;
                        changed = FormChange::at(choice_path);
                    }
                    if ui
                        .add(
                            egui::Label::new(theme::faint("remove the condition").size(11.5))
                                .sense(egui::Sense::click()),
                        )
                        .clicked()
                    {
                        choice.remove_field("requires");
                        changed = FormChange::at(choice_path);
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
                    changed = FormChange::at(choice_path);
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
                    choice.remove_field("reveal");
                } else {
                    choice["reveal"] =
                        Value::Array(reveal.into_iter().map(Value::String).collect());
                }
                changed = FormChange::at(choice_path);
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
                    changed = FormChange::at(choice_path);
                }
            } else if forms::text(ui, cx, &mut warn, &format!("{choice_path}/warn")).is_some() {
                if warn.as_str().is_some_and(str::is_empty) {
                    choice.remove_field("warn");
                } else {
                    choice["warn"] = warn;
                }
                changed = FormChange::at(choice_path);
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
                    go = Some(target);
                }
            }
            None => {
                ui.label(theme::muted("none · ends the conversation").size(13.0));
            }
        });
    });
    ChoiceOutcome { changed, menu, go }
}

fn choice_inspector(editor: &mut Editor, ui: &mut Ui, doc: &ScriptDoc, name: &str, index: usize) {
    let Some(node) = doc.nodes().get(name).cloned() else {
        return;
    };
    let count = node["choices"].as_array().map_or(0, Vec::len);
    if index >= count {
        node_inspector(editor, ui, doc, name);
        return;
    }
    let label_text = spans::plain(&node["choices"][index]["label"]);
    breadcrumb(
        ui,
        &format!(
            "{} › {name} › {}",
            doc.at.title(),
            widgets::clip(&label_text, 40)
        ),
    );
    let shapes = editor.shapes.clone();
    let root = shapes.shape_of(ScriptDef::TABLE);
    let path = format!("/nodes/{name}");
    let choice_schema = nodes::variant_schema(root, NodeKind::Dialogue.name())
        .and_then(|schema| schema.pointer("/properties/choices/items").cloned())
        .unwrap_or(Value::Null);
    let mut draft = node.clone();
    let mut actions = Vec::new();
    let outcome = {
        let mut cx = doc.form_cx(editor, root, &mut actions);
        let at = ChoiceAt {
            schema: &choice_schema,
            path: &path,
            index,
            count,
            doc,
        };
        choice_card(ui, &mut cx, &mut draft["choices"][index], &at)
    };
    let ChoiceOutcome {
        mut changed,
        menu,
        go,
    } = outcome;
    for action in actions {
        act(editor, action, doc);
    }
    let mut label = format!("Edit a choice in {}", doc.at.title());
    if let Some(removed) = menu.remove
        && let Some(choices) = draft["choices"].as_array_mut()
    {
        choices.remove(removed);
        changed = FormChange::at(&path);
        label = format!("Remove a choice in {}", doc.at.title());
    }
    if let Some((a, b)) = menu.swap
        && let Some(choices) = draft["choices"].as_array_mut()
    {
        choices.swap(a, b);
        changed = FormChange::at(&path);
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

fn speaker_rows(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    by: &mut Value,
    path: &str,
    doc: &ScriptDoc,
) -> FormChange {
    let mut changed = FormChange::default();
    let current = LineSpeaker::of(by).unwrap_or(LineSpeaker::Narrator);
    let mut picked = current.kind();
    widgets::kv(ui, "by", |ui| {
        widgets::combo(ui.id().with(path).with("speaker"))
            .selected_text(theme::mono(current.kind()).size(13.0))
            .width(ui.available_width())
            .show_ui(ui, |ui| {
                for option in LineSpeaker::options(doc.kind) {
                    ui.selectable_value(&mut picked, option, *option);
                }
            });
    });
    if picked != current.kind() {
        let npc = cx.speaker.clone().unwrap_or_default();
        *by = LineSpeaker::named(picked, &npc).json();
        changed = FormChange::at(path);
    }
    let LineSpeaker::Npc { mut npc, face } = LineSpeaker::of(by).unwrap_or(LineSpeaker::Narrator)
    else {
        return changed;
    };
    widgets::kv(ui, "  npc", |ui| {
        if picker::row(ui, cx, NpcDef::TABLE, &mut npc, &format!("{path}/npc")) {
            by["npc"] = Value::String(npc.clone());
            changed = FormChange::at(path);
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
    let mut face_value = face.clone().map_or(Value::Null, Value::String);
    widgets::kv(ui, "  face", |ui| {
        let speaker = LineSpeaker::Npc {
            npc: npc.clone(),
            face,
        };
        let ctx = ui.ctx().clone();
        if let Some(file) = nodes::bust_file(cx.content.as_ref(), &speaker)
            && let Some(thumb) = cx.state.thumbnails.image(&ctx, cx.files, &file)
        {
            ui.add(
                egui::Image::from_texture((thumb.texture.id(), egui::vec2(26.0, 26.0)))
                    .uv(thumbs::square_uv(thumb.size))
                    .corner_radius(4.0),
            );
        }
        if forms::value(
            ui,
            cx,
            &face_schema,
            &mut face_value,
            &format!("{path}/face"),
        )
        .is_some()
        {
            match face_value.as_str().filter(|face| !face.is_empty()) {
                Some(face) => by["face"] = Value::String(face.to_owned()),
                None => by.remove_field("face"),
            }
            changed = FormChange::at(path);
        }
    });
    changed
}

fn act(editor: &mut Editor, action: FormAction, doc: &ScriptDoc) {
    row_form::act(editor, action, ScriptDef::TABLE, &doc.at.key);
}

/// Carries out what a node's card asked for, but for the node it asks to go to, which the card
/// goes to once it is done with the node it shows.
fn act_but_go(editor: &mut Editor, actions: Vec<FormAction>, doc: &ScriptDoc) -> Option<String> {
    let mut go_to = None;
    for action in actions {
        match action {
            FormAction::OpenNode { name } => go_to = Some(name),
            other => act(editor, other, doc),
        }
    }
    go_to
}
