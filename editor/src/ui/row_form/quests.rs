use egui::{Sense, Ui};
use engine::core::content::{ContentRow, TABLES_DIR, row_file, row_of};
use engine::systems::area::{AreaDef, AreaModuleKind};
use engine::systems::player::snapshot::CharacterSnapshot;
use engine::systems::script::{Fill, RiftEffectKind, ScriptDef};
use serde::Deserialize;
use serde_json::Value;

use super::{theme, widgets};
use crate::app::Editor;
use crate::value::RowValue;

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
                widgets::badge(
                    ui,
                    if party.object.is_some() {
                        "object"
                    } else {
                        &party.table
                    },
                );
                let row = format!("{}/{}", party.table, party.key);
                if ui
                    .add(egui::Label::new(theme::mono(&row).size(13.0)).sense(Sense::click()))
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    open = Some((party.table.clone(), party.key.clone()));
                }
                if let Some(object) = &party.object {
                    ui.label(theme::muted(object).size(13.0));
                }
                ui.label(
                    theme::faint(format!("{} · {}", party.script, party.node))
                        .size(12.5)
                        .monospace(),
                );
            });
        }
    }
    if let Some((table, key)) = open {
        editor.open_row(&table, &key);
    }
}

/// A row whose script offers, takes or turns in a quest: an object of an area's when `object`
/// names one.
struct Party {
    table: String,
    key: String,
    object: Option<String>,
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
    let mut scan = |table: &str, key: &str, object: Option<&str>, module: &Value| {
        let (script_label, nodes) = match module.module_kind() {
            Some(AreaModuleKind::Script) => {
                let name = module.text("script").to_owned();
                (
                    format!("script/{name}"),
                    files
                        .json(&row_file(ScriptDef::TABLE, &name))
                        .map(|row| row["nodes"].clone())
                        .unwrap_or(Value::Null),
                )
            }
            _ => return,
        };
        for (name, node) in nodes.as_object().into_iter().flatten() {
            let named = match Fill::<String>::deserialize(&node["quest"]) {
                Ok(Fill::Const(quest)) => Some(quest),
                Ok(Fill::Var { var }) => module["values"][&var].as_str().map(str::to_owned),
                Err(_) => None,
            };
            if named.as_deref() != Some(quest) {
                continue;
            }
            let entry = Party {
                table: table.to_owned(),
                key: key.to_owned(),
                object: object.map(str::to_owned),
                script: script_label.clone(),
                node: name.clone(),
            };
            match node.kind().parse() {
                Ok(RiftEffectKind::OfferQuest | RiftEffectKind::AcceptQuest) => givers.push(entry),
                Ok(RiftEffectKind::TurnIn) => turn_ins.push(entry),
                _ => {}
            }
        }
    };
    let paths: Vec<String> = files
        .paths_under(&format!("{TABLES_DIR}/"))
        .cloned()
        .collect();
    for path in paths {
        let Some((table, key)) = row_of(&path) else {
            continue;
        };
        if table == ScriptDef::TABLE || table == CharacterSnapshot::TABLE {
            continue;
        }
        let Some(row) = files.json(&path) else {
            continue;
        };
        for module in row["modules"].as_array().into_iter().flatten() {
            scan(table, key, None, module);
            if table == AreaDef::TABLE {
                let object = module["name"]
                    .as_str()
                    .or(module["label"].as_str())
                    .unwrap_or("object");
                for script in module["scripts"].as_array().into_iter().flatten() {
                    scan(table, key, Some(object), script);
                }
            }
        }
    }
    (givers, turn_ins)
}
