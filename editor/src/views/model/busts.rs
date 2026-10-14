use std::collections::HashSet;
use std::path::{Path, PathBuf};

use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use game::systems::actor::model::GenericExpression;
use serde_json::Value;
use strum::VariantArray;

use crate::app::Editor;
use crate::project::{ContentEdit, RowSelection, row_file, row_of};
use crate::ui::{theme, widgets};
use crate::{rows, thumbs};

const CARD: Vec2 = Vec2::new(178.0, 165.0);

pub fn generic() -> impl Iterator<Item = &'static str> {
    GenericExpression::VARIANTS.iter().map(|face| face.as_ref())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BustFace {
    pub name: String,
    pub file: String,
    pub own: Option<usize>,
    pub pointer: String,
}

pub fn module_index(row: &Value) -> Option<usize> {
    row["modules"]
        .as_array()?
        .iter()
        .position(|module| module["type"] == "bust")
}

pub fn faces(row: &Value) -> Vec<BustFace> {
    let Some(index) = module_index(row) else {
        return Vec::new();
    };
    let module = &row["modules"][index];
    let mut faces: Vec<BustFace> = generic()
        .map(|name| BustFace {
            name: name.to_owned(),
            file: module[name].as_str().unwrap_or_default().to_owned(),
            own: None,
            pointer: format!("/modules/{index}/{name}"),
        })
        .collect();
    for (j, own) in module["own"].as_array().into_iter().flatten().enumerate() {
        faces.push(BustFace {
            name: own["name"].as_str().unwrap_or_default().to_owned(),
            file: own["file"].as_str().unwrap_or_default().to_owned(),
            own: Some(j),
            pointer: format!("/modules/{index}/own/{j}"),
        });
    }
    faces
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let ctx = ui.ctx().clone();
    let faces = faces(row);
    let title = super::users(editor, key)
        .first()
        .and_then(|(table, user)| {
            editor
                .row_value(table, user)
                .and_then(|row| row["name"].as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| key.to_owned());
    widgets::section(ui, &format!("Bust · {title}"));
    if module_index(row).is_none() {
        ui.add_space(6.0);
        widgets::hint(ui, "No bust module: this model never speaks.");
        editor.status.left.push(format!("model/{key} · no bust"));
        return;
    }
    let drops = std::mem::take(&mut editor.views.model.drops);
    let pointer = ui.input(|i| i.pointer.hover_pos());
    let selected = editor.views.model.view(key).face.clone();
    let mut pick = None;
    let mut replace: Option<(BustFace, PathBuf)> = None;
    let mut add: Vec<PathBuf> = Vec::new();
    let mut browse = false;
    let per_row = ((ui.available_width() + 12.0) / (CARD.x + 12.0))
        .floor()
        .max(1.0) as usize;
    ui.add_space(4.0);
    egui::Grid::new(("busts", key))
        .spacing(Vec2::new(12.0, 12.0))
        .show(ui, |ui| {
            for (index, face) in faces.iter().enumerate() {
                let thumb = editor.thumb(&ctx, &face.file);
                let is_selected = selected.as_deref() == Some(&face.name);
                let response = card(ui, face, thumb.as_ref(), is_selected, key);
                if response.clicked() {
                    pick = Some(face.clone());
                }
                if !drops.is_empty()
                    && let Some(at) = pointer
                    && response.rect.contains(at)
                    && let Some(path) = drops.first()
                {
                    replace = Some((face.clone(), path.clone()));
                }
                if (index + 1) % per_row == 0 {
                    ui.end_row();
                }
            }
            let (rect, response) = ui.allocate_exact_size(CARD, Sense::click());
            let painter = ui.painter_at(rect);
            painter.rect_filled(rect, 4.0, theme::SELECTION.gamma_multiply(0.5));
            widgets::dashed_rect(
                &painter,
                rect,
                egui::Stroke::new(1.0, theme::ACCENT),
                4.0,
                4.0,
            );
            painter.text(
                rect.center() - Vec2::new(0.0, 10.0),
                egui::Align2::CENTER_CENTER,
                "+",
                egui::FontId::proportional(20.0),
                theme::ACCENT,
            );
            painter.text(
                rect.center() + Vec2::new(0.0, 12.0),
                egui::Align2::CENTER_CENTER,
                "drop to add an expression",
                egui::FontId::proportional(12.5),
                theme::ACCENT,
            );
            if response.clicked() {
                browse = true;
            }
            response.on_hover_text("Drop a PNG here, or click to browse for one");
            ui.end_row();
        });
    if replace.is_none() && !drops.is_empty() {
        add = drops.clone();
    }
    if browse
        && let Some(path) = rfd::FileDialog::new()
            .add_filter("PNG", &["png"])
            .pick_file()
    {
        add.push(path);
    }
    if let Some(face) = pick {
        let view = editor.views.model.view_mut(key);
        view.face = Some(face.name.clone());
        editor.select(RowSelection::parts(super::TABLE, key, vec![face.pointer]));
    }
    if let Some((face, path)) = replace {
        replace_file(editor, key, &face, &path);
    }
    for path in add {
        add_expression(editor, key, row, &path);
    }
    editor
        .status
        .left
        .push(format!("model/{key} · bust · {} expressions", faces.len()));
    editor
        .status
        .left
        .push("drop PNG files onto slots to add or replace".to_owned());
}

fn card(
    ui: &mut Ui,
    face: &BustFace,
    thumb: Option<&thumbs::Thumbnail>,
    selected: bool,
    key: &str,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(CARD, Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect(
        rect,
        4.0,
        theme::INPUT,
        egui::Stroke::new(
            if selected { 2.0 } else { 1.0 },
            if selected {
                theme::ACCENT
            } else {
                theme::BORDER
            },
        ),
        egui::StrokeKind::Inside,
    );
    let art = ERect::from_min_max(
        rect.min + Vec2::new(4.0, 4.0),
        rect.right_bottom() - Vec2::new(4.0, 28.0),
    );
    match thumb {
        Some(thumb) => {
            let (w, h) = (thumb.size[0] as f32, thumb.size[1] as f32);
            let scale = (art.width() / w).min(art.height() / h);
            let shown = Vec2::new(w * scale, h * scale);
            painter.image(
                thumb.texture.id(),
                ERect::from_center_size(art.center(), shown),
                ERect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                Color32::WHITE,
            );
        }
        None => {
            painter.text(
                art.center(),
                egui::Align2::CENTER_CENTER,
                "missing file",
                egui::FontId::proportional(12.0),
                theme::DANGER,
            );
        }
    }
    painter.text(
        egui::pos2(rect.min.x + 8.0, rect.max.y - 14.0),
        egui::Align2::LEFT_CENTER,
        &face.name,
        egui::FontId::proportional(13.0),
        theme::TEXT,
    );
    painter.text(
        egui::pos2(rect.max.x - 8.0, rect.max.y - 14.0),
        egui::Align2::RIGHT_CENTER,
        if face.own.is_some() {
            format!("{key} only")
        } else {
            "generic".to_owned()
        },
        egui::FontId::proportional(11.0),
        theme::MUTED,
    );
    response
}

fn png_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    if !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err(format!("{} is not a PNG", path.display()));
    }
    Ok(bytes)
}

fn replace_file(editor: &mut Editor, key: &str, face: &BustFace, path: &Path) {
    let bytes = match png_bytes(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            editor.toast(error);
            return;
        }
    };
    let mut edit = ContentEdit::new(format!("Replace {} of {key}'s bust", face.name));
    edit.write(format!("assets/{}", face.file), bytes.into());
    editor.apply(edit);
}

fn add_expression(editor: &mut Editor, key: &str, row: &Value, path: &Path) {
    let bytes = match png_bytes(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            editor.toast(error);
            return;
        }
    };
    let Some(index) = module_index(row) else {
        return;
    };
    let stem = path
        .file_stem()
        .map(|stem| {
            stem.to_string_lossy()
                .to_lowercase()
                .replace([' ', '-'], "_")
        })
        .unwrap_or_else(|| "expression".to_owned());
    let taken: HashSet<String> = faces(row).into_iter().map(|face| face.name).collect();
    let name = rows::free_name(&stem, &taken);
    let file = format!("busts/{key}/{name}.png");
    let mut changed = row.clone();
    let own = &mut changed["modules"][index]["own"];
    if !own.is_array() {
        *own = Value::Array(Vec::new());
    }
    own.as_array_mut()
        .expect("an array")
        .push(serde_json::json!({ "name": name, "file": file }));
    let mut edit = ContentEdit::new(format!("Add expression {name} to {key}'s bust"));
    edit.write(format!("assets/{file}"), bytes.into());
    edit.write_json(row_file(super::TABLE, key), &changed);
    if editor.apply(edit) {
        let view = editor.views.model.view_mut(key);
        view.face = Some(name.clone());
        let j = changed["modules"][index]["own"]
            .as_array()
            .map_or(0, |own| own.len().saturating_sub(1));
        editor.select(RowSelection::parts(
            super::TABLE,
            key,
            vec![format!("/modules/{index}/own/{j}")],
        ));
    }
}

#[derive(Clone, Debug)]
pub struct FaceLine {
    pub file: String,
    pub node: String,
    pub face: String,
}

pub fn lines(editor: &Editor, key: &str) -> Vec<FaceLine> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    let speakers: Vec<String> = super::users(editor, key)
        .into_iter()
        .filter(|(table, _)| table == "npc")
        .map(|(_, key)| key)
        .collect();
    let mut found = Vec::new();
    let files: Vec<String> = project
        .files
        .paths_under("tables/")
        .filter(|path| path.ends_with(".json"))
        .cloned()
        .collect();
    for file in files {
        let Some((table, row_key)) = row_of(&file) else {
            continue;
        };
        let owners: Vec<String> = match table {
            "npc" => vec![row_key.to_owned()],
            "script" => project
                .usages
                .of_row("script", row_key)
                .iter()
                .filter_map(|usage| row_of(&usage.file))
                .filter(|(table, _)| *table == "npc")
                .map(|(_, key)| key.to_owned())
                .collect(),
            _ => Vec::new(),
        };
        let Some(row) = project.files.json(&file) else {
            continue;
        };
        let nodes = find_nodes(&row);
        for (node, value) in nodes {
            for line in value["lines"].as_array().into_iter().flatten() {
                let by = &line["by"];
                let Some(face) = by["face"].as_str() else {
                    continue;
                };
                let speaker: Vec<String> = match by["npc"].as_str() {
                    Some(npc) => vec![npc.to_owned()],
                    None => owners.clone(),
                };
                if speaker.iter().any(|npc| speakers.contains(npc)) {
                    found.push(FaceLine {
                        file: file.clone(),
                        node: node.clone(),
                        face: face.to_owned(),
                    });
                }
            }
        }
    }
    found
}

fn find_nodes(row: &Value) -> Vec<(String, Value)> {
    let mut out = Vec::new();
    for module in row["modules"].as_array().into_iter().flatten() {
        if let Some(nodes) = module["nodes"].as_object() {
            for (name, node) in nodes {
                if node["type"] == "dialogue" {
                    out.push((name.clone(), node.clone()));
                }
            }
        }
    }
    if let Some(nodes) = row["nodes"].as_object() {
        for (name, node) in nodes {
            if node["type"] == "dialogue" {
                out.push((name.clone(), node.clone()));
            }
        }
    }
    out
}

pub fn rename(editor: &mut Editor, key: &str, face: &BustFace, new_name: &str) -> bool {
    let Some(mut row) = editor.row_value(super::TABLE, key) else {
        return false;
    };
    let (Some(j), Some(index)) = (face.own, module_index(&row)) else {
        return false;
    };
    if faces(&row).iter().any(|other| other.name == new_name) {
        editor.toast(format!("{new_name} is already a face of this model"));
        return false;
    }
    row["modules"][index]["own"][j]["name"] = Value::String(new_name.to_owned());
    let mut edit = retarget_face(
        editor,
        key,
        &face.name,
        new_name,
        format!("Rename face {} of {key} to {new_name}", face.name),
    );
    edit.write_json(row_file(super::TABLE, key), &row);
    editor.apply(edit)
}

pub fn remove(editor: &mut Editor, key: &str, face: &BustFace, replacement: &str) -> bool {
    let Some(mut row) = editor.row_value(super::TABLE, key) else {
        return false;
    };
    let (Some(j), Some(index)) = (face.own, module_index(&row)) else {
        return false;
    };
    if let Some(own) = row["modules"][index]["own"].as_array_mut()
        && j < own.len()
    {
        own.remove(j);
    }
    let mut edit = retarget_face(
        editor,
        key,
        &face.name,
        replacement,
        format!("Remove face {} of {key}", face.name),
    );
    edit.write_json(row_file(super::TABLE, key), &row);
    edit.remove(format!("assets/{}", face.file));
    editor.apply(edit)
}

fn retarget_face(editor: &Editor, key: &str, from: &str, to: &str, label: String) -> ContentEdit {
    let mut edit = ContentEdit::new(label);
    let mut files: Vec<String> = lines(editor, key)
        .iter()
        .filter(|line| line.face == from)
        .map(|line| line.file.clone())
        .collect();
    files.sort();
    files.dedup();
    for file in files {
        let Some(mut value) = editor
            .project
            .as_ref()
            .and_then(|p| p.files.json_owned(&file))
        else {
            continue;
        };
        rewrite_faces(&mut value, from, to);
        edit.write_json(file, &value);
    }
    edit
}

fn rewrite_faces(value: &mut Value, from: &str, to: &str) {
    match value {
        Value::Object(map) => {
            if map.get("face").and_then(Value::as_str) == Some(from) {
                map.insert("face".to_owned(), Value::String(to.to_owned()));
            }
            for child in map.values_mut() {
                rewrite_faces(child, from, to);
            }
        }
        Value::Array(items) => {
            for child in items {
                rewrite_faces(child, from, to);
            }
        }
        _ => {}
    }
}
