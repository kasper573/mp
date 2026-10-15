use std::sync::Arc;

use egui::{Align, Color32, Layout, RichText, Sense, Ui, Vec2};
use game::systems::area::{self, AreaDef, AreaModule};
use game::systems::npc::{self, NpcDef};
use game::systems::script::{OwnerKind, RiftScripts};
use serde_json::Value;

use crate::forms::{FormAction, FormCx, clear_draft, draft_of, set_draft};
use crate::project::{ProjectFiles, row_file, row_of};
use crate::thumbs;
use crate::ui::{theme, widgets};
use crate::value::RowValue;

const PICTURE_TABLES: [&str; 6] = [
    "model",
    "item",
    "tileset",
    "attention",
    "interface_icon",
    "cursor",
];

pub fn row(ui: &mut Ui, cx: &mut FormCx, table: &str, key: &mut String, path: &str) -> bool {
    let id = ui.id().with(path).with("picker");
    let mut changed = false;
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
        if !key.is_empty()
            && ui
                .add(
                    egui::Button::new(RichText::new("→").color(Color32::WHITE))
                        .fill(theme::ACCENT)
                        .min_size(Vec2::new(26.0, 22.0)),
                )
                .on_hover_text(format!("Open {table}/{key}"))
                .clicked()
        {
            cx.actions.push(FormAction::OpenRow {
                table: table.to_owned(),
                key: key.clone(),
            });
        }
        let response = chip(ui, cx, table, key);
        let popup = egui::Popup::from_toggle_button_response(&response)
            .id(id)
            .width(440.0);
        popup.show(|ui| {
            if picker_body(ui, cx, table, key, path, id) {
                changed = true;
            }
        });
    });
    changed
}

fn chip(ui: &mut Ui, cx: &mut FormCx, table: &str, key: &str) -> egui::Response {
    let empty = key.is_empty();
    egui::Frame::new()
        .fill(if empty {
            theme::INPUT
        } else {
            theme::ACCENT_SOFT
        })
        .stroke(egui::Stroke::new(
            1.0,
            if empty { theme::BORDER } else { theme::ACCENT },
        ))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(6, 2))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                if empty {
                    ui.label(theme::muted(format!("pick {}…", table.replace('_', " "))));
                    return;
                }
                thumbnail(ui, cx, table, key, 18.0);
                ui.label(theme::muted(format!("{table}/")).monospace().size(13.0));
                ui.add(egui::Label::new(theme::mono(key).size(13.0).color(theme::CODE)).truncate());
            });
        })
        .response
        .interact(Sense::click())
}

fn picker_body(
    ui: &mut Ui,
    cx: &mut FormCx,
    table: &str,
    key: &mut String,
    path: &str,
    id: egui::Id,
) -> bool {
    let mut changed = false;
    let field = path.rsplit('/').next().unwrap_or(table);
    cx.state.status = vec![
        field.to_owned(),
        if key.is_empty() {
            "↑ ↓ ← → move · Enter picks · Esc closes".to_owned()
        } else {
            format!("↑ ↓ ← → move · Enter picks · Esc keeps {key}")
        },
    ];
    let search_id = id.with("search");
    let mut search = draft_of(ui, search_id).unwrap_or_default();
    let total = cx.files.paths_under(&format!("tables/{table}/")).count();
    let needle = search.to_lowercase();
    let blocked = pick_block(cx, table, path);
    let mut keys: Vec<(String, String, Option<String>)> = cx
        .files
        .paths_under(&format!("tables/{table}/"))
        .filter_map(|file| row_of(file).map(|(_, key)| key.to_owned()))
        .map(|row_key| {
            let name = display_name(cx, table, &row_key);
            let reason = blocked
                .as_ref()
                .and_then(|block| (block.reason)(cx, &row_key));
            (row_key, name, reason)
        })
        .filter(|(row_key, name, _)| {
            needle.is_empty()
                || row_key.to_lowercase().contains(&needle)
                || name.to_lowercase().contains(&needle)
        })
        .collect();
    keys.sort_by(|a, b| {
        a.2.is_some()
            .cmp(&b.2.is_some())
            .then((a.0 != *key).cmp(&(b.0 != *key)))
            .then(a.0.cmp(&b.0))
    });
    let pickable = keys
        .iter()
        .filter(|(_, _, reason)| reason.is_none())
        .count();
    let highlight_id = id.with("highlight");
    let mut highlight: usize = ui.ctx().data(|d| d.get_temp(highlight_id)).unwrap_or(0);
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(6, 3))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(theme::muted("🔍"));
                let response = ui.add(
                    egui::TextEdit::singleline(&mut search)
                        .frame(egui::Frame::NONE)
                        .hint_text(filter_hint(cx, table))
                        .desired_width(ui.available_width() - 120.0),
                );
                widgets::default_focus(ui, &response);
                if response.changed() {
                    set_draft(ui, search_id, &search.clone());
                    highlight = 0;
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let counted = match &blocked {
                        Some(block) => format!("{table} · {pickable} {}", block.rule),
                        None => format!("{table} · {} of {total}", keys.len()),
                    };
                    ui.label(theme::muted(counted).monospace().size(11.5));
                });
            });
        });
    let (up, down, enter, escape) = ui.input(|i| {
        (
            i.key_pressed(egui::Key::ArrowUp),
            i.key_pressed(egui::Key::ArrowDown),
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let pictures = PICTURE_TABLES.contains(&table);
    let columns = if pictures { 5 } else { 1 };
    if down {
        highlight = (highlight + columns).min(keys.len().saturating_sub(1));
    }
    if up {
        highlight = highlight.saturating_sub(columns);
    }
    if pictures {
        let (left, right) = ui.input(|i| {
            (
                i.key_pressed(egui::Key::ArrowLeft),
                i.key_pressed(egui::Key::ArrowRight),
            )
        });
        if right {
            highlight = (highlight + 1).min(keys.len().saturating_sub(1));
        }
        if left {
            highlight = highlight.saturating_sub(1);
        }
    }
    let mut picked: Option<String> = None;
    egui::ScrollArea::vertical()
        .max_height(300.0)
        .id_salt(id.with("list"))
        .show(ui, |ui| {
            if pictures {
                egui::Grid::new(id.with("grid"))
                    .num_columns(columns)
                    .spacing([4.0, 4.0])
                    .show(ui, |ui| {
                        for (index, (row_key, _, reason)) in keys.iter().enumerate() {
                            let lit = index == highlight;
                            let current = row_key == key;
                            let response = egui::Frame::new()
                                .fill(if lit {
                                    theme::ACCENT_SOFT
                                } else if current {
                                    theme::RAISED
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .corner_radius(4.0)
                                .inner_margin(4.0)
                                .show(ui, |ui| {
                                    ui.set_width(72.0);
                                    ui.vertical_centered(|ui| {
                                        ui.add_enabled_ui(reason.is_none(), |ui| {
                                            thumbnail(ui, cx, table, row_key, 48.0);
                                            ui.label(
                                                RichText::new(row_key)
                                                    .monospace()
                                                    .size(11.0)
                                                    .color(if reason.is_some() {
                                                        theme::FAINT
                                                    } else {
                                                        theme::TEXT
                                                    }),
                                            );
                                        });
                                    });
                                })
                                .response
                                .interact(Sense::click());
                            let response = match reason {
                                Some(reason) => response.on_hover_text(reason),
                                None => response,
                            };
                            if response.clicked() && reason.is_none() {
                                picked = Some(row_key.clone());
                            }
                            if (index + 1) % columns == 0 {
                                ui.end_row();
                            }
                        }
                    });
            } else {
                for (index, (row_key, name, reason)) in keys.iter().enumerate() {
                    let lit = index == highlight;
                    let hint = pick_hint(cx, table, row_key);
                    let full = ui.available_rect_before_wrap();
                    let (rect, response) =
                        ui.allocate_exact_size(Vec2::new(full.width(), 36.0), Sense::click());
                    if lit {
                        ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
                    } else if response.hovered() {
                        ui.painter().rect_filled(
                            rect,
                            4.0,
                            Color32::from_rgba_unmultiplied(255, 255, 255, 8),
                        );
                    }
                    let mut child = ui.new_child(
                        egui::UiBuilder::new()
                            .max_rect(rect.shrink2(Vec2::new(6.0, 2.0)))
                            .layout(Layout::left_to_right(Align::Center)),
                    );
                    thumbnail(&mut child, cx, table, row_key, 24.0);
                    child.vertical(|ui| {
                        ui.spacing_mut().item_spacing.y = 0.0;
                        let ink = if reason.is_some() {
                            theme::FAINT
                        } else {
                            theme::TEXT
                        };
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(row_key).monospace().size(13.0).color(ink));
                            if !name.is_empty() && name != row_key {
                                ui.label(theme::muted(name).size(12.0));
                            }
                        });
                        let line = match reason {
                            Some(reason) => reason.clone(),
                            None => {
                                let mut line = hint;
                                if row_key == key {
                                    line.push_str(if line.is_empty() {
                                        "this one"
                                    } else {
                                        " · this one"
                                    });
                                }
                                line
                            }
                        };
                        ui.label(theme::muted(line).size(11.5));
                    });
                    if response.clicked() && reason.is_none() {
                        picked = Some(row_key.clone());
                    }
                }
            }
            if keys.is_empty() {
                ui.label(theme::muted("nothing matches"));
            }
        });
    if enter && let Some((row_key, _, None)) = keys.get(highlight) {
        picked = Some(row_key.clone());
    }
    ui.separator();
    if !key.is_empty() {
        let uses = cx.usages.of_row(table, key).len();
        let mut footer = format!("{table}/{key}");
        if let Some(file) = picture_file(cx, table, key) {
            footer.push_str(&format!(" · {file}"));
        }
        footer.push_str(&format!(" · used by {uses}"));
        ui.label(theme::muted(footer).monospace().size(11.5));
    }
    if !cx.shapes.has_fixtures(table) {
        let response = ui
            .horizontal(|ui| {
                ui.label(theme::code("+"));
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    ui.label(format!("New {}…", table.replace('_', " ")));
                    ui.label(theme::muted("creates the row and picks it, as one step").size(11.5));
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            cx.actions.push(FormAction::NewRow {
                table: table.to_owned(),
                path: path.to_owned(),
            });
            ui.close();
        }
    }
    ui.ctx()
        .data_mut(|d| d.insert_temp(highlight_id, highlight));
    if let Some(row_key) = picked {
        if row_key != *key {
            *key = row_key;
            changed = true;
        }
        close_picker(ui, id, search_id);
    }
    if escape {
        close_picker(ui, id, search_id);
    }
    changed
}

fn close_picker(ui: &mut Ui, id: egui::Id, search_id: egui::Id) {
    clear_draft(ui, search_id);
    ui.ctx()
        .data_mut(|d| d.remove_temp::<usize>(id.with("highlight")));
    ui.close();
}

fn filter_hint(cx: &FormCx, table: &str) -> String {
    match (table, &cx.owner_table) {
        ("script", Some(owner)) => format!("filter · owner {owner}"),
        _ => "filter".to_owned(),
    }
}

type BlockReason = Box<dyn Fn(&FormCx, &str) -> Option<String>>;

struct Block {
    reason: BlockReason,
    rule: &'static str,
}

fn pick_block(cx: &FormCx, table: &str, path: &str) -> Option<Block> {
    if table == "script" {
        let owner = cx.owner_table.clone()?;
        let kind = owner.parse::<OwnerKind>().unwrap_or(OwnerKind::Any);
        return Some(Block {
            reason: Box::new(move |cx, key| {
                let row = cx.files.json(&row_file("script", key))?;
                let script_owner = row.text("owner");
                (script_owner.parse::<OwnerKind>().unwrap_or(OwnerKind::Any) != kind)
                    .then(|| format!("owner {script_owner}"))
            }),
            rule: "fit the owner",
        });
    }
    if table == "npc" && cx.owner_table.as_deref() == Some("quest") && path.ends_with("/npc") {
        let content = cx.content?;
        if !content.has_built::<RiftScripts>() {
            return None;
        }
        return Some(Block {
            reason: Box::new(move |_, key| {
                let id = content.by_key::<NpcDef>(key)?;
                (!npc::can_be_fought(content.built::<RiftScripts>(), id))
                    .then(|| "no script sets it hostile".to_owned())
            }),
            rule: "can be defeated",
        });
    }
    None
}

fn pick_hint(cx: &FormCx, table: &str, key: &str) -> String {
    match table {
        "npc" => {
            let Some(content) = cx.content else {
                return String::new();
            };
            let Some(id) = content.by_key::<NpcDef>(key) else {
                return String::new();
            };
            let mut places: Vec<String> = Vec::new();
            for area in content.ids::<AreaDef>() {
                let count: u32 = area::placed(&content, area)
                    .iter()
                    .map(|placed| match &placed.module {
                        AreaModule::Resident(resident) if resident.npc == id => 1,
                        AreaModule::Population(population) if population.npc == id => {
                            population.count
                        }
                        _ => 0,
                    })
                    .sum();
                if count > 0 {
                    places.push(format!("{} × {count}", area.key(&content)));
                }
            }
            if places.is_empty() {
                "placed nowhere".to_owned()
            } else {
                places.join(" · ")
            }
        }
        "script" => {
            let owner = cx
                .files
                .json(&row_file("script", key))
                .and_then(|row| row["owner"].as_str().map(str::to_owned))
                .unwrap_or_default();
            let uses = cx.usages.of_row("script", key).len();
            format!("{owner} · used by {uses}")
        }
        _ => {
            let uses = cx.usages.of_row(table, key).len();
            format!("used by {uses}")
        }
    }
}

pub fn display_name(cx: &FormCx, table: &str, key: &str) -> String {
    let Some(row) = cx.files.json(&row_file(table, key)) else {
        return String::new();
    };
    ["name", "title", "label"]
        .iter()
        .find_map(|field| row[field].as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn picture_file(cx: &FormCx, table: &str, key: &str) -> Option<String> {
    picture_of(cx.files, table, key).map(|picture| picture.path)
}

pub struct Picture {
    pub path: String,
    pub frame: PictureFrame,
}

pub enum PictureFrame {
    Sprite(Arc<Value>),
    Whole,
    Tile(f32),
}

pub fn picture_of(files: &ProjectFiles, table: &str, key: &str) -> Option<Picture> {
    let row = files.json(&row_file(table, key))?;
    let (path, frame) = match table {
        "model" => (sprite_image(&row)?, PictureFrame::Sprite(row)),
        "npc" | "player" => {
            let model = files.json(&row_file("model", row["model"].as_str()?))?;
            (sprite_image(&model)?, PictureFrame::Sprite(model))
        }
        "item" | "attention" | "interface_icon" | "cursor" => {
            let path = row["icon"].as_str().or(row["image"].as_str())?;
            (path.to_owned(), PictureFrame::Whole)
        }
        "tileset" => {
            let tile = row["tile"].as_f64().unwrap_or(16.0) as f32;
            (row["image"].as_str()?.to_owned(), PictureFrame::Tile(tile))
        }
        _ => return None,
    };
    Some(Picture { path, frame })
}

fn sprite_image(model: &Value) -> Option<String> {
    model["sprites"]["image"].as_str().map(str::to_owned)
}

pub fn thumbnail(ui: &mut Ui, cx: &mut FormCx, table: &str, key: &str, size: f32) {
    let Some(picture) = picture_of(cx.files, table, key) else {
        return;
    };
    let ctx = ui.ctx().clone();
    let Some(thumb) = cx.state.thumbnails.image(&ctx, cx.files, &picture.path) else {
        return;
    };
    match picture.frame {
        PictureFrame::Sprite(model) => {
            let frame = thumbs::model_frame(&model, &thumb);
            let scale = size / frame.size.y.max(1.0);
            ui.add(
                egui::Image::from_texture((thumb.texture.id(), frame.size * scale)).uv(frame.uv),
            );
        }
        PictureFrame::Whole => {
            ui.add(
                egui::Image::from_texture((thumb.texture.id(), egui::vec2(size, size)))
                    .fit_to_exact_size(egui::vec2(size, size)),
            );
        }
        PictureFrame::Tile(tile) => {
            let uv = thumbs::uv(thumb.size, 0.0, 0.0, tile * 2.0, tile * 2.0);
            ui.add(egui::Image::from_texture((thumb.texture.id(), egui::vec2(size, size))).uv(uv));
        }
    }
}

pub fn asset(ui: &mut Ui, cx: &mut FormCx, file: &mut String, path: &str) -> bool {
    let id = ui.id().with(path).with("asset");
    let mut changed = false;
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
        let empty = file.is_empty();
        if !empty
            && let Some(thumb) = {
                let ctx = ui.ctx().clone();
                if file.to_lowercase().ends_with(".png") {
                    cx.state.thumbnails.image(&ctx, cx.files, file)
                } else {
                    None
                }
            }
        {
            let scale = (40.0 / thumb.size[1].max(1) as f32).min(1.0);
            ui.add(egui::Image::from_texture((
                thumb.texture.id(),
                egui::vec2(thumb.size[0] as f32 * scale, thumb.size[1] as f32 * scale),
            )));
        }
        let response = egui::Frame::new()
            .fill(if empty {
                theme::INPUT
            } else {
                theme::ACCENT_SOFT
            })
            .stroke(egui::Stroke::new(
                1.0,
                if empty { theme::BORDER } else { theme::ACCENT },
            ))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(6, 2))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                    if empty {
                        ui.label(theme::muted("pick file…"));
                    } else {
                        ui.label(theme::muted("assets/").monospace().size(13.0));
                        ui.add(
                            egui::Label::new(
                                theme::mono(file.as_str()).size(13.0).color(theme::CODE),
                            )
                            .truncate(),
                        );
                    }
                });
            })
            .response
            .interact(Sense::click());
        egui::Popup::from_toggle_button_response(&response)
            .id(id)
            .width(420.0)
            .show(|ui| {
                let search_id = id.with("search");
                let mut search = draft_of(ui, search_id).unwrap_or_default();
                if ui
                    .add(egui::TextEdit::singleline(&mut search).hint_text("search assets/"))
                    .changed()
                {
                    set_draft(ui, search_id, &search.clone());
                }
                let needle = search.to_lowercase();
                let paths: Vec<String> = cx
                    .files
                    .paths_under("assets/")
                    .filter_map(|p| p.strip_prefix("assets/"))
                    .filter(|p| needle.is_empty() || p.to_lowercase().contains(&needle))
                    .map(str::to_owned)
                    .collect();
                ui.label(theme::muted(format!("{} files", paths.len())).size(11.5));
                egui::ScrollArea::vertical()
                    .max_height(280.0)
                    .show(ui, |ui| {
                        for candidate in &paths {
                            if ui
                                .selectable_label(
                                    candidate == file,
                                    theme::mono(candidate).size(12.5),
                                )
                                .clicked()
                            {
                                *file = candidate.clone();
                                changed = true;
                                ui.close();
                            }
                        }
                    });
            });
    });
    changed
}
