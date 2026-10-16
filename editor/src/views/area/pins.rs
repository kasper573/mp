use egui::{Color32, Pos2, Stroke as EStroke, Vec2};
use engine::core::content::Content;
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems::area::{self, AreaId, ObjectShape};

use super::AreaFrame;
use crate::app::{Editor, PlacePick};
use crate::project::{ContentEdit, GAME_FILE, ProjectFiles, RowSelection, row_of};
use crate::tabs::EditorTab;

pub const INITIAL_SPAWN: &str = "/initial_spawn";

#[derive(Clone, Debug)]
pub struct ArrivalPin {
    pub file: String,
    pub pointer: String,
    pub at: Pos<Tiles>,
    pub initial_spawn: bool,
}

#[derive(Clone, Debug)]
pub enum PinHit {
    InitialSpawn,
    Place { file: String, pointer: String },
}

pub fn arrivals(editor: &Editor, area_key: &str) -> Vec<ArrivalPin> {
    let Some(project) = &editor.project else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for usage in project.usages.of_row("area", area_key) {
        let Some(parent) = usage.pointer.strip_suffix("/area") else {
            continue;
        };
        let Some(json) = project.files.json(&usage.file) else {
            continue;
        };
        let Some(place) = json.pointer(parent) else {
            continue;
        };
        let (Some(x), Some(y)) = (place["x"].as_f64(), place["y"].as_f64()) else {
            continue;
        };
        let initial_spawn = usage.file == GAME_FILE && parent == INITIAL_SPAWN;
        out.push(ArrivalPin {
            file: usage.file.clone(),
            pointer: parent.to_owned(),
            at: Pos::new(x as f32, y as f32),
            initial_spawn,
        });
    }
    out
}

pub fn warp_objects(content: &Content, area_id: AreaId) -> Vec<ObjectShape> {
    area::warp_objects(content, area_id)
        .into_iter()
        .map(|(_, object)| object.shape)
        .collect()
}

impl ArrivalPin {
    pub fn names(&self, editor: &Editor) -> (String, Option<String>) {
        let owner = row_of(&self.file)
            .map(|(_, key)| key.to_owned())
            .unwrap_or_else(|| self.file.clone());
        let spot = editor
            .project
            .as_ref()
            .and_then(|project| project.files.json(&self.file))
            .and_then(|json| {
                let segments: Vec<&str> = self.pointer.split('/').skip(1).collect();
                if segments.first() == Some(&"modules") && segments.len() >= 2 {
                    json.pointer(&format!("/modules/{}", segments[1]))?["name"]
                        .as_str()
                        .map(str::to_owned)
                } else {
                    None
                }
            });
        (owner, spot)
    }
}

pub fn commit_pick(editor: &mut Editor, area_key: &str, at: Pos<Tiles>) {
    let Some(PlacePick { file, pointer, .. }) = editor.pick.clone() else {
        return;
    };
    let Some(mut target) = editor
        .project
        .as_ref()
        .and_then(|p| p.files.json_owned(&file))
    else {
        editor.pick = None;
        return;
    };
    let Some(slot) = target.pointer_mut(&pointer) else {
        editor.toast(format!("{pointer} is gone from {file}"));
        editor.pick = None;
        return;
    };
    *slot = place_json(area_key, at);
    let mut edit = ContentEdit::new(format!(
        "Pick place {area_key} {}, {} for {file}",
        at.x, at.y
    ));
    edit.write_json(file.clone(), &target);
    if editor.apply(edit) {
        editor.pick = None;
        editor.toast(format!("Picked {area_key} {}, {}", at.x, at.y));
    }
}

pub fn draw_arrivals(editor: &Editor, painter: &egui::Painter, frame: &AreaFrame) {
    let canvas = frame.canvas;
    for arrival in arrivals(editor, &frame.area_key) {
        let at = canvas.to_screen(arrival.at);
        let color = if arrival.initial_spawn {
            Color32::from_rgb(120, 255, 160)
        } else {
            Color32::from_rgb(255, 190, 90)
        };
        pin(painter, at, color);
        if canvas.scale() >= 4.0 {
            let text = if arrival.initial_spawn {
                "⚑ initial spawn".to_owned()
            } else {
                format!("⚑ {}", chip_label(editor, &arrival))
            };
            frame
                .labels
                .chip(at + Vec2::new(8.0, -10.0), text, Color32::WHITE);
        }
    }
}

fn chip_label(editor: &Editor, arrival: &ArrivalPin) -> String {
    let (owner, spot) = arrival.names(editor);
    match spot {
        Some(spot) => format!("← {owner} · {spot}"),
        None => format!("← {owner}"),
    }
}

fn pin(painter: &egui::Painter, at: Pos2, color: Color32) {
    painter.circle_filled(at, 4.0, color);
    painter.circle_stroke(at, 4.0, EStroke::new(1.0, Color32::BLACK));
}

pub fn pin_at(editor: &Editor, frame: &AreaFrame, pointer: Pos2) -> Option<PinHit> {
    for arrival in arrivals(editor, &frame.area_key) {
        let at = frame.canvas.to_screen(arrival.at);
        let hit = egui::Rect::from_min_max(at + Vec2::new(-8.0, -20.0), at + Vec2::new(8.0, 2.0));
        if hit.contains(pointer) {
            return Some(if arrival.initial_spawn {
                PinHit::InitialSpawn
            } else {
                PinHit::Place {
                    file: arrival.file,
                    pointer: arrival.pointer,
                }
            });
        }
    }
    None
}

pub fn open_pin(editor: &mut Editor, pin: PinHit) {
    match pin {
        PinHit::InitialSpawn => {
            editor.toast("The game's spawn: set in game.json; drag the pin to move it")
        }
        PinHit::Place { file, pointer } => {
            if let Some((table, key)) = row_of(&file) {
                let (table, key) = (table.to_owned(), key.to_owned());
                editor.select(RowSelection::row(&table, &key));
                editor.open_tab(EditorTab::for_row(&table, &key));
                editor.toast(format!("{table}/{key} {pointer}"));
            }
        }
    }
}

pub fn move_pin(editor: &mut Editor, frame: &AreaFrame, file: &str, pointer: &str, at: Pos<Tiles>) {
    let Some(mut json) = editor
        .project
        .as_ref()
        .and_then(|p| p.files.json_owned(file))
    else {
        return;
    };
    let Some(place) = json.pointer_mut(pointer) else {
        return;
    };
    place["x"] = serde_json::json!(at.x);
    place["y"] = serde_json::json!(at.y);
    let mut edit = ContentEdit::new(format!(
        "Move arrival in {} to {}, {}",
        frame.area_key, at.x, at.y
    ));
    edit.write_json(file.to_owned(), &json);
    editor.apply(edit);
}

pub fn set_spawn(editor: &mut Editor, area: &str, at: Pos<Tiles>) {
    let Some(mut game) = editor
        .project
        .as_ref()
        .and_then(|p| p.files.json_owned(GAME_FILE))
    else {
        return;
    };
    game["initial_spawn"] = place_json(area, at);
    let mut edit = ContentEdit::new(format!(
        "Set the initial spawn to {area} {}, {}",
        at.x, at.y
    ));
    edit.write_json(GAME_FILE, &game);
    editor.apply(edit);
}

pub fn initial_spawn_place(files: &ProjectFiles) -> Option<(String, Pos<Tiles>)> {
    let game = files.json(GAME_FILE)?;
    let area = game["initial_spawn"]["area"].as_str()?.to_owned();
    let at = Pos::new(
        game["initial_spawn"]["x"].as_f64()? as f32,
        game["initial_spawn"]["y"].as_f64()? as f32,
    );
    Some((area, at))
}

fn place_json(area: &str, at: Pos<Tiles>) -> serde_json::Value {
    serde_json::json!({ "area": area, "x": at.x, "y": at.y })
}
