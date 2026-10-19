use egui::{Sense, Ui};
use engine::systems::area::AreaModuleKind;
use serde_json::Value;

use super::{theme, widgets};
use crate::app::Editor;
use crate::project::RowSelection;
use crate::tabs::EditorTab;
use crate::value::RowValue;
use engine::core::content::{row_file, row_of};

pub(super) fn quest_parties_sections(editor: &mut Editor, ui: &mut Ui, quest: &str) {
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
        for party in rows {
            ui.horizontal(|ui| {
                widgets::badge(ui, &party.table);
                let (owner_key, rest) = party
                    .owner
                    .split_once(" · ")
                    .map(|(key, rest)| (key.to_owned(), Some(rest.to_owned())))
                    .unwrap_or((party.owner.clone(), None));
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
                    theme::faint(format!("{} · {}", party.script, party.node))
                        .size(12.5)
                        .monospace(),
                );
            });
        }
    }
    if let Some((table, key)) = open.filter(|(table, _)| !table.is_empty()) {
        editor.select(RowSelection::row(&table, &key));
        editor.open_tab(EditorTab::for_row(&table, &key));
    }
}

struct Party {
    table: String,
    owner: String,
    script: String,
    node: String,
}

fn quest_parties(editor: &Editor, quest: &str) -> (Vec<Party>, Vec<Party>) {
    let mut givers = Vec::new();
    let mut turn_ins = Vec::new();
    let Some(project) = editor.project.as_ref() else {
        return (givers, turn_ins);
    };
    let files = &project.files;
    let mut scan = |table: &str, owner: String, module: &Value| {
        let (script_label, nodes) = match module.module_kind() {
            Some(AreaModuleKind::InlineScript) => {
                ("inline script".to_owned(), module["nodes"].clone())
            }
            Some(AreaModuleKind::SharedScript) => {
                let name = module.text("script").to_owned();
                (
                    format!("script/{name}"),
                    files
                        .json(&row_file("script", &name))
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
            let entry = Party {
                table: table.to_owned(),
                owner: owner.clone(),
                script: script_label.clone(),
                node: name.clone(),
            };
            match node["type"].as_str() {
                Some("offer_quest") | Some("accept_quest") => givers.push(entry),
                Some("turn_in") => turn_ins.push(entry),
                _ => {}
            }
        }
    };
    let paths: Vec<String> = files.paths_under("tables/").cloned().collect();
    for path in paths {
        let Some((table, key)) = row_of(&path) else {
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
