use egui::{Color32, Pos2, Stroke as EStroke, Vec2};
use game::core::content::Content;
use game::core::math::Pos;
use game::core::script::{OwnerKind, OwnerRow};
use game::core::tiling::Tiles;
use game::systems::area::{self, ObjectShape};
use game::systems::script::{Reach, RiftScripts};
use serde_json::Value;

use super::Frame;
use crate::app::Editor;
use crate::project::{Edit, Selection, row_of};
use crate::tabs::Tab;

/// A place pointing into the area: where a warp, the game's spawn or a test start lands.
#[derive(Clone, Debug)]
pub struct Arrival {
    pub file: String,
    pub pointer: String,
    pub at: Pos<Tiles>,
    pub spawn: bool,
}

#[derive(Clone, Debug)]
pub enum PinHit {
    Spawn,
    Place { file: String, pointer: String },
}

pub fn arrivals(editor: &Editor, area_key: &str) -> Vec<Arrival> {
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
        let spawn = usage.file == "game.json" && parent == "/spawn";
        out.push(Arrival {
            file: usage.file.clone(),
            pointer: parent.to_owned(),
            at: Pos::new(x as f32, y as f32),
            spawn,
        });
    }
    out
}

pub fn warp_objects(content: Content, area_id: area::Id) -> Vec<ObjectShape> {
    if !content.has_built::<RiftScripts>() {
        return Vec::new();
    }
    let scripts = content.built::<RiftScripts>();
    area::objects(area::placed(&content, area_id))
        .filter(|(index, _)| {
            scripts
                .may_do(OwnerRow {
                    kind: OwnerKind::Object,
                    row: area_id.raw(),
                    object: Some(*index),
                })
                .reaches
                .iter()
                .any(|reach| matches!(reach, Reach::Warp(_)))
        })
        .map(|(_, object)| object.shape)
        .collect()
}

pub fn overlay(editor: &mut Editor, painter: &egui::Painter, _view_key: &str, frame: &Frame) {
    draw_arrivals(editor, painter, frame);
}

pub fn draw_arrivals(editor: &Editor, painter: &egui::Painter, frame: &Frame) {
    let canvas = frame.canvas;
    for arrival in arrivals(editor, &frame.area_key) {
        let at = canvas.to_screen(arrival.at);
        let color = if arrival.spawn {
            Color32::from_rgb(120, 255, 160)
        } else {
            Color32::from_rgb(255, 190, 90)
        };
        pin(painter, at, color);
        if canvas.scale() >= 4.0 {
            let text = if arrival.spawn {
                "⚑ spawn".to_owned()
            } else {
                format!("⚑ {}", chip_label(editor, &arrival))
            };
            let galley =
                painter.layout_no_wrap(text, egui::FontId::monospace(11.5), Color32::WHITE);
            let origin = at + Vec2::new(8.0, -30.0);
            let back = egui::Rect::from_min_size(origin, galley.size() + Vec2::new(10.0, 6.0));
            painter.rect_filled(back, 4.0, Color32::from_rgba_unmultiplied(20, 22, 26, 225));
            painter.galley(origin + Vec2::new(5.0, 3.0), galley, Color32::WHITE);
        }
    }
}

/// "← forest · bloomvale_road": the row the place sits in and the named module it belongs to.
fn chip_label(editor: &Editor, arrival: &Arrival) -> String {
    let owner = row_of(&arrival.file)
        .map(|(_, key)| key.to_owned())
        .unwrap_or_else(|| arrival.file.clone());
    let spot = editor
        .project
        .as_ref()
        .and_then(|project| project.files.json(&arrival.file))
        .and_then(|json| {
            let segments: Vec<&str> = arrival.pointer.split('/').skip(1).collect();
            if segments.first() == Some(&"modules") && segments.len() >= 2 {
                json.pointer(&format!("/modules/{}", segments[1]))?["name"]
                    .as_str()
                    .map(str::to_owned)
            } else {
                None
            }
        });
    match spot {
        Some(spot) => format!("← {owner} · {spot}"),
        None => format!("← {owner}"),
    }
}

fn pin(painter: &egui::Painter, at: Pos2, color: Color32) {
    painter.circle_filled(at, 4.0, color);
    painter.circle_stroke(at, 4.0, EStroke::new(1.0, Color32::BLACK));
}

pub fn pin_at(editor: &Editor, frame: &Frame, pointer: Pos2) -> Option<PinHit> {
    for arrival in arrivals(editor, &frame.area_key) {
        let at = frame.canvas.to_screen(arrival.at);
        let hit = egui::Rect::from_min_max(at + Vec2::new(-8.0, -20.0), at + Vec2::new(8.0, 2.0));
        if hit.contains(pointer) {
            return Some(if arrival.spawn {
                PinHit::Spawn
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
        PinHit::Spawn => {
            editor.toast("The game's spawn: set in game.json; drag the pin to move it")
        }
        PinHit::Place { file, pointer } => {
            if let Some((table, key)) = row_of(&file) {
                let (table, key) = (table.to_owned(), key.to_owned());
                editor.select(Selection::row(&table, &key));
                editor.open_tab(Tab::for_row(&table, &key));
                editor.toast(format!("{table}/{key} {pointer}"));
            }
        }
    }
}

pub fn move_pin(editor: &mut Editor, frame: &Frame, file: &str, pointer: &str, at: Pos<Tiles>) {
    let Some(mut json) = editor.project.as_ref().and_then(|p| p.files.json(file)) else {
        return;
    };
    let Some(place) = json.pointer_mut(pointer) else {
        return;
    };
    place["x"] = serde_json::json!(at.x);
    place["y"] = serde_json::json!(at.y);
    let mut edit = Edit::new(format!(
        "Move arrival in {} to {}, {}",
        frame.area_key, at.x, at.y
    ));
    edit.write_json(file.to_owned(), &json);
    editor.apply(edit);
}

pub fn set_spawn(editor: &mut Editor, frame: &Frame, at: Pos<Tiles>) {
    let Some(mut game) = editor
        .project
        .as_ref()
        .and_then(|p| p.files.json("game.json"))
    else {
        return;
    };
    game["spawn"] = serde_json::json!({ "area": frame.area_key, "x": at.x, "y": at.y });
    let mut edit = Edit::new(format!(
        "Set the spawn to {} {}, {}",
        frame.area_key, at.x, at.y
    ));
    edit.write_json("game.json", &game);
    editor.apply(edit);
}

pub fn spawn_place(files: &crate::project::Files) -> Option<(String, Pos<Tiles>)> {
    let game = files.json("game.json")?;
    let area = game["spawn"]["area"].as_str()?.to_owned();
    let at = Pos::new(
        game["spawn"]["x"].as_f64()? as f32,
        game["spawn"]["y"].as_f64()? as f32,
    );
    Some((area, at))
}

pub fn place_json(area: &str, at: Pos<Tiles>) -> Value {
    serde_json::json!({ "area": area, "x": at.x, "y": at.y })
}
