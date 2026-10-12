use std::collections::BTreeMap;

use egui::{Color32, Rect as ERect, RichText, Sense, Stroke, Ui, Vec2};
use serde_json::Value;

use super::{Grid, TileRect, set_tile_field, tile_data};
use crate::app::Editor;
use crate::ui::{theme, widgets};
use crate::views::model::FrameData;
use crate::views::model::preview;

pub const MAX_FRAMES: usize = 256;
const PREVIEW_W: f32 = 224.0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Offsets {
    pub offsets: Vec<i64>,
    pub ms: Vec<u32>,
}

pub fn offsets_of(row: &Value, tile: u32) -> Option<Offsets> {
    let data = tile_data(row, tile);
    let frames = data["animation"].as_array()?;
    if frames.is_empty() {
        return None;
    }
    Some(Offsets {
        offsets: frames
            .iter()
            .map(|frame| frame["tile"].as_i64().unwrap_or(0) - tile as i64)
            .collect(),
        ms: frames
            .iter()
            .map(|frame| frame["ms"].as_u64().unwrap_or(100) as u32)
            .collect(),
    })
}

pub struct Common {
    pub offsets: Offsets,
    pub tiles: Vec<u32>,
    pub odd: Vec<(u32, usize)>,
    pub still: Vec<u32>,
}

pub fn common_of(row: &Value, selection: &TileRect, grid: &Grid) -> Option<Common> {
    let tiles: Vec<u32> = selection
        .tiles(grid.columns)
        .into_iter()
        .flatten()
        .collect();
    let mut tally: Vec<(Offsets, Vec<u32>)> = Vec::new();
    let mut still = Vec::new();
    for tile in &tiles {
        match offsets_of(row, *tile) {
            Some(offsets) => match tally
                .iter_mut()
                .find(|(seen, _)| seen.offsets == offsets.offsets)
            {
                Some((_, list)) => list.push(*tile),
                None => tally.push((offsets, vec![*tile])),
            },
            None => still.push(*tile),
        }
    }
    let (offsets, animated) = tally.iter().max_by_key(|(_, list)| list.len())?.clone();
    let odd = tally
        .iter()
        .filter(|(seen, _)| seen.offsets != offsets.offsets)
        .flat_map(|(seen, list)| list.iter().map(move |tile| (*tile, seen.offsets.len())))
        .collect();
    Some(Common {
        offsets,
        tiles: animated,
        odd,
        still,
    })
}

pub fn legend(ui: &mut Ui) {
    ui.horizontal(|ui| {
        let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
        ui.painter().rect_stroke(
            swatch,
            2.0,
            Stroke::new(1.5, Color32::WHITE),
            egui::StrokeKind::Inside,
        );
        ui.painter()
            .rect_filled(swatch.shrink(4.0), 1.0, Color32::WHITE);
        ui.label(theme::muted("animated"));
        let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
        ui.painter().extend(egui::Shape::dashed_line(
            &[
                swatch.left_top(),
                swatch.right_top(),
                swatch.right_bottom(),
                swatch.left_bottom(),
                swatch.left_top(),
            ],
            Stroke::new(1.0, theme::SELECTION),
            3.0,
            2.0,
        ));
        ui.label(theme::muted("its frames"));
    });
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let selection = editor.views.tileset.views[key].selection;
    let common = selection.and_then(|selection| common_of(row, &selection, grid));
    let odd: BTreeMap<u32, usize> = common
        .as_ref()
        .map(|common| common.odd.iter().copied().collect())
        .unwrap_or_default();
    let canvas = super::sheet::canvas(editor, ui, key, grid, |painter, tile, cell| {
        let animated = tile_data(row, tile)["animation"]
            .as_array()
            .is_some_and(|a| !a.is_empty());
        if animated {
            painter.rect_stroke(
                cell,
                0.0,
                Stroke::new(1.5, Color32::from_rgba_unmultiplied(255, 255, 255, 200)),
                egui::StrokeKind::Inside,
            );
            let dot =
                ERect::from_center_size(cell.right_top() + Vec2::new(-5.0, 5.0), Vec2::splat(5.0));
            painter.rect_filled(dot, 1.0, Color32::WHITE);
        }
        if let Some(frames) = odd.get(&tile) {
            let badge = cell.center();
            painter.circle_filled(badge, (cell.width() * 0.22).max(6.0), theme::WARN);
            painter.text(
                badge,
                egui::Align2::CENTER_CENTER,
                "!",
                egui::FontId::proportional((cell.width() * 0.3).max(9.0)),
                Color32::BLACK,
            );
            let _ = frames;
        }
    });
    super::sheet::select(editor, ui, key, grid, &canvas);
    super::sheet::draw_selection(editor, ui, key, grid, &canvas);
    if let (Some(selection), Some(common)) = (selection, &common) {
        let painter = ui.painter_at(canvas.rect.expand(24.0));
        for (index, offset) in common.offsets.offsets.iter().enumerate() {
            let (dx, dy) = (
                offset.rem_euclid(grid.columns as i64),
                offset.div_euclid(grid.columns as i64),
            );
            let rect = ERect::from_min_size(
                canvas.rect.min
                    + Vec2::new(
                        (selection.x as i64 + dx) as f32 * canvas.shown,
                        (selection.y as i64 + dy) as f32 * canvas.shown,
                    ),
                Vec2::new(
                    selection.w as f32 * canvas.shown,
                    selection.h as f32 * canvas.shown,
                ),
            );
            if index > 0 {
                painter.extend(egui::Shape::dashed_line(
                    &[
                        rect.left_top(),
                        rect.right_top(),
                        rect.right_bottom(),
                        rect.left_bottom(),
                        rect.left_top(),
                    ],
                    Stroke::new(1.5, theme::SELECTION),
                    6.0,
                    4.0,
                ));
            }
            let label = if index == 0 {
                format!("frame +0 · {} tiles", common.tiles.len())
            } else {
                format!("frame {}", signed(*offset))
            };
            let galley =
                painter.layout_no_wrap(label, egui::FontId::monospace(11.0), Color32::WHITE);
            let chip = ERect::from_min_size(
                egui::pos2(
                    rect.center().x - galley.size().x / 2.0 - 5.0,
                    rect.max.y + 3.0,
                ),
                galley.size() + Vec2::new(10.0, 4.0),
            );
            painter.rect_filled(chip, 3.0, Color32::from_rgba_unmultiplied(0, 0, 0, 200));
            painter.galley(chip.min + Vec2::new(5.0, 2.0), galley, Color32::WHITE);
        }
    }
    let frames = reference_frames(common.as_ref());
    let dt = ui.input(|i| i.stable_dt).min(0.1);
    {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        preview::keys(ui, &mut view.preview, &frames);
        preview::tick(&mut view.preview, dt, &frames, "idle");
    }
    keys(editor, ui, key, row, grid);
    ui.ctx().request_repaint();
}

fn signed(offset: i64) -> String {
    if offset >= 0 {
        format!("+{offset}")
    } else {
        offset.to_string()
    }
}

pub fn reference_frames(common: Option<&Common>) -> Vec<FrameData> {
    common
        .map(|common| {
            common
                .offsets
                .offsets
                .iter()
                .zip(&common.offsets.ms)
                .map(|(offset, ms)| FrameData {
                    frame: *offset as u32,
                    ms: *ms,
                    apex: false,
                    step: false,
                    sound: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn keys(editor: &mut Editor, ui: &Ui, key: &str, row: &Value, grid: &Grid) {
    if ui.ctx().egui_wants_keyboard_input() {
        return;
    }
    let (left, right, alt, shift, del) = ui.input(|i| {
        (
            i.key_pressed(egui::Key::ArrowLeft),
            i.key_pressed(egui::Key::ArrowRight),
            i.modifiers.alt,
            i.modifiers.shift,
            i.key_pressed(egui::Key::Delete),
        )
    });
    let (selection, frame) = {
        let view = &editor.views.tileset.views[key];
        (view.selection, view.frame)
    };
    let Some(selection) = selection else {
        return;
    };
    let Some(common) = common_of(row, &selection, grid) else {
        return;
    };
    if alt
        && (left || right)
        && let Some(index) = frame
        && index < common.offsets.ms.len()
    {
        let delta = if shift { 1 } else { 10 };
        let mut offsets = common.offsets.clone();
        offsets.ms[index] = if right {
            (offsets.ms[index] + delta).min(60_000)
        } else {
            offsets.ms[index].saturating_sub(delta).max(1)
        };
        apply(
            editor,
            key,
            row,
            &common.tiles,
            &offsets,
            format!(
                "Retime frame {} of {} animated tiles of {key}",
                signed(offsets.offsets[index]),
                common.tiles.len()
            ),
            true,
        );
    }
    if del && let Some(index) = frame {
        remove_frame(editor, key, row, &common, index);
    }
}

pub fn apply(
    editor: &mut Editor,
    key: &str,
    row: &Value,
    tiles: &[u32],
    offsets: &Offsets,
    label: String,
    merge: bool,
) -> bool {
    let mut changed = editor.row_value(super::TABLE, key).unwrap_or(row.clone());
    for tile in tiles {
        let frames: Vec<Value> = offsets
            .offsets
            .iter()
            .zip(&offsets.ms)
            .map(|(offset, ms)| serde_json::json!({ "tile": (*tile as i64 + offset).max(0), "ms": ms }))
            .collect();
        set_tile_field(&mut changed, *tile, "animation", Value::Array(frames));
    }
    super::write_row(editor, key, &changed, label, merge)
}

pub fn remove_frame(editor: &mut Editor, key: &str, row: &Value, common: &Common, index: usize) {
    if common.offsets.offsets.len() <= 2 {
        editor.toast("A tile animation keeps at least two frames");
        return;
    }
    let mut offsets = common.offsets.clone();
    let removed = offsets.offsets.remove(index);
    offsets.ms.remove(index);
    if apply(
        editor,
        key,
        row,
        &common.tiles,
        &offsets,
        format!(
            "Remove frame {} from {} animated tiles of {key}",
            signed(removed),
            common.tiles.len()
        ),
        false,
    ) {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.frame = None;
    }
}

pub fn card(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let Some(selection) = editor.views.tileset.views[key].selection else {
        widgets::hint(
            ui,
            "Drag over tiles to select them; their frames show as offsets over the block.",
        );
        return;
    };
    let common = common_of(row, &selection, grid);
    ui.label(
        theme::mono(format!("tileset/{key} › {} tiles", selection.count()))
            .color(theme::CODE)
            .size(12.0),
    );
    ui.add_space(4.0);
    let Some(common) = common else {
        widgets::card_frame(true).show(ui, |ui| {
            ui.set_width(ui.available_width());
            widgets::card_header(ui, "animation", "animation", "", |_| {});
            ui.add_space(4.0);
            widgets::hint(ui, "None of these tiles animates yet.");
            if ui.button("+ Animate with a second frame").clicked() {
                let tiles: Vec<u32> = selection
                    .tiles(grid.columns)
                    .into_iter()
                    .flatten()
                    .collect();
                let offsets = Offsets {
                    offsets: vec![0, selection.w as i64],
                    ms: vec![250, 250],
                };
                apply(
                    editor,
                    key,
                    row,
                    &tiles,
                    &offsets,
                    format!("Animate {} tiles of {key}: 2 frames", tiles.len()),
                    false,
                );
            }
        });
        return;
    };
    let frame = editor.views.tileset.views[key].frame;
    let by_rows = editor.views.tileset.views[key]
        .each_draft
        .starts_with("rows:");
    let mut pick_frame = None;
    let mut add = false;
    let mut each: Option<u32> = None;
    let mut unit_rows = by_rows;
    let mut fix_odd: Option<(u32, usize)> = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "animation", "animation", "", |_| {});
        ui.add_space(4.0);
        widgets::kv(ui, "frames", |ui| {
            ui.spacing_mut().item_spacing.x = 4.0;
            for (index, offset) in common.offsets.offsets.iter().enumerate() {
                let text = if unit_rows && *offset % grid.columns as i64 == 0 {
                    format!("{} rows", signed(offset / grid.columns as i64))
                } else {
                    signed(*offset)
                };
                let on = frame == Some(index);
                let (fill, ink) = if on {
                    (theme::ACCENT, Color32::WHITE)
                } else {
                    (theme::RAISED, theme::TEXT)
                };
                if widgets::chip_coloured(ui, &text, fill, ink).clicked() {
                    pick_frame = Some(index);
                }
            }
            if common.offsets.offsets.len() < MAX_FRAMES
                && widgets::chip(ui, "+")
                    .on_hover_text("another frame, one step further")
                    .clicked()
            {
                add = true;
            }
        });
        widgets::kv(ui, "offset by", |ui| {
            egui::ComboBox::from_id_salt(("offset-unit", key))
                .selected_text(if unit_rows { "rows" } else { "columns" })
                .width(140.0)
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut unit_rows, false, "columns");
                    ui.selectable_value(&mut unit_rows, true, "rows");
                });
        });
        let same = common
            .offsets
            .ms
            .iter()
            .all(|ms| *ms == common.offsets.ms[0]);
        widgets::kv(
            ui,
            if let Some(index) = frame {
                if index < common.offsets.ms.len() {
                    "this frame"
                } else {
                    "each"
                }
            } else {
                "each"
            },
            |ui| {
                let current = match frame {
                    Some(index) if index < common.offsets.ms.len() => {
                        common.offsets.ms[index].to_string()
                    }
                    _ if same => common.offsets.ms[0].to_string(),
                    _ => String::new(),
                };
                let id = ui.id().with(("each-ms", key));
                let mut draft = ui
                    .memory(|m| m.data.get_temp::<String>(id))
                    .unwrap_or(current.clone());
                let response = crate::forms::boxed_input(ui, Some("ms"), |ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut draft)
                            .desired_width(70.0)
                            .font(egui::TextStyle::Monospace)
                            .hint_text("mixed"),
                    )
                });
                if crate::forms::committed(ui, &response) {
                    if let Ok(ms) = draft.trim().parse::<u32>()
                        && ms >= 1
                        && draft.trim() != current
                    {
                        each = Some(ms);
                    }
                    ui.memory_mut(|m| m.data.remove::<String>(id));
                } else if response.has_focus() {
                    ui.memory_mut(|m| m.data.insert_temp(id, draft));
                } else {
                    ui.memory_mut(|m| m.data.remove::<String>(id));
                }
            },
        );
        widgets::kv_text(ui, "plays", "loops, as every tile animation");
    });
    if !common.odd.is_empty() {
        ui.add_space(6.0);
        let (tile, frames) = common.odd[0];
        let last = offsets_of(row, tile)
            .and_then(|offsets| offsets.offsets.last().copied())
            .unwrap_or(0);
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new("⚠").color(theme::WARN));
            ui.label(
                theme::muted(format!(
                    "Tile {tile} has {frames} frames, +0 to {}; the other {} have {}.",
                    signed(last),
                    common.tiles.len(),
                    common.offsets.offsets.len()
                ))
                .size(12.5),
            );
        });
        if ui
            .button(format!(
                "Give tile {tile} the same {} frames",
                common.offsets.offsets.len()
            ))
            .clicked()
        {
            fix_odd = Some((tile, frames));
        }
        if common.odd.len() > 1 {
            widgets::hint(
                ui,
                &format!("… and {} more out of step", common.odd.len() - 1),
            );
        }
    }
    if !common.still.is_empty() {
        widgets::hint(
            ui,
            &format!(
                "{} of the selected tiles do not animate.",
                common.still.len()
            ),
        );
    }
    ui.add_space(6.0);
    widgets::section(ui, "Preview");
    let frames = reference_frames(Some(&common));
    let index = preview::index_at(
        &frames,
        editor.views.tileset.views[key].preview.position,
        false,
    );
    let shown = (PREVIEW_W / selection.w as f32).clamp(4.0, 48.0).floor();
    let (rect, _) = ui.allocate_exact_size(
        Vec2::new(selection.w as f32 * shown, selection.h as f32 * shown),
        Sense::hover(),
    );
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, theme::CANVAS);
    for (ry, line) in selection.tiles(grid.columns).iter().enumerate() {
        for (rx, tile) in line.iter().enumerate() {
            let cell = ERect::from_min_size(
                rect.min + Vec2::new(rx as f32 * shown, ry as f32 * shown),
                Vec2::splat(shown),
            );
            let shown_tile = offsets_of(row, *tile)
                .and_then(|offsets| {
                    offsets
                        .offsets
                        .get(index)
                        .map(|offset| (*tile as i64 + offset).max(0) as u32)
                })
                .unwrap_or(*tile);
            grid.draw(&painter, cell, shown_tile);
        }
    }
    ui.horizontal(|ui| {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        if widgets::chip(ui, if view.preview.playing { "⏸" } else { "▶" }).clicked() {
            view.preview.playing = !view.preview.playing;
        }
        widgets::chip(ui, &format!("frame {} / {}", index + 1, frames.len()));
    });
    if let Some(index) = pick_frame {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.frame = if view.frame == Some(index) {
            None
        } else {
            Some(index)
        };
    }
    if unit_rows != by_rows {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.each_draft = if unit_rows {
            "rows:".to_owned()
        } else {
            String::new()
        };
    }
    if add {
        let mut offsets = common.offsets.clone();
        let n = offsets.offsets.len();
        let step = if n >= 2 {
            offsets.offsets[n - 1] - offsets.offsets[n - 2]
        } else {
            selection.w as i64
        };
        offsets.offsets.push(offsets.offsets[n - 1] + step);
        offsets.ms.push(*offsets.ms.last().unwrap_or(&250));
        apply(
            editor,
            key,
            row,
            &common.tiles,
            &offsets,
            format!(
                "Add frame {} to {} animated tiles of {key}",
                signed(offsets.offsets[n]),
                common.tiles.len()
            ),
            false,
        );
    }
    if let Some(ms) = each {
        let mut offsets = common.offsets.clone();
        let label = match frame {
            Some(index) if index < offsets.ms.len() => {
                offsets.ms[index] = ms;
                format!(
                    "Frame {} lasts {ms} ms on {} tiles of {key}",
                    signed(offsets.offsets[index]),
                    common.tiles.len()
                )
            }
            _ => {
                for each in &mut offsets.ms {
                    *each = ms;
                }
                format!(
                    "Every frame lasts {ms} ms on {} tiles of {key}",
                    common.tiles.len()
                )
            }
        };
        apply(editor, key, row, &common.tiles, &offsets, label, false);
    }
    if let Some((tile, _)) = fix_odd {
        apply(
            editor,
            key,
            row,
            &[tile],
            &common.offsets,
            format!(
                "Give tile {tile} the same {} frames on {key}",
                common.offsets.offsets.len()
            ),
            false,
        );
    }
}

pub fn timeline(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let Some(selection) = editor.views.tileset.views[key].selection else {
        ui.add_space(8.0);
        widgets::hint(ui, "Select animated tiles to see their frames here.");
        return;
    };
    let Some(common) = common_of(row, &selection, grid) else {
        ui.add_space(8.0);
        widgets::hint(ui, "None of the selected tiles animates.");
        return;
    };
    let frame = editor.views.tileset.views[key].frame;
    let total: u32 = common.offsets.ms.iter().sum();
    let mut pick = None;
    ui.add_space(6.0);
    ui.horizontal_top(|ui| {
        ui.add_space(8.0);
        ui.spacing_mut().item_spacing.x = 6.0;
        for (index, (offset, ms)) in common.offsets.offsets.iter().zip(&common.offsets.ms).enumerate() {
            let on = frame == Some(index);
            let (rect, response) = ui.allocate_exact_size(Vec2::new(136.0, 132.0), Sense::click());
            let painter = ui.painter_at(rect);
            painter.rect(rect, 3.0, if on { theme::ACCENT_SOFT } else { theme::INPUT }, Stroke::new(1.0, if on { theme::ACCENT } else { theme::BORDER }), egui::StrokeKind::Inside);
            let art = ERect::from_min_max(rect.min + Vec2::new(8.0, 6.0), rect.right_bottom() - Vec2::new(8.0, 26.0));
            let shown = (art.width() / selection.w as f32).min(art.height() / selection.h as f32).floor().max(1.0);
            let block = ERect::from_center_size(art.center(), Vec2::new(selection.w as f32 * shown, selection.h as f32 * shown));
            for (ry, line) in selection.tiles(grid.columns).iter().enumerate() {
                for (rx, tile) in line.iter().enumerate() {
                    let cell = ERect::from_min_size(block.min + Vec2::new(rx as f32 * shown, ry as f32 * shown), Vec2::splat(shown));
                    let shown_tile = offsets_of(row, *tile)
                        .and_then(|offsets| offsets.offsets.get(index).map(|o| (*tile as i64 + o).max(0) as u32))
                        .unwrap_or(*tile);
                    grid.draw(&painter, cell, shown_tile);
                }
            }
            painter.text(
                egui::pos2(rect.center().x, rect.max.y - 12.0),
                egui::Align2::CENTER_CENTER,
                format!("{} · {ms} ms", signed(*offset)),
                egui::FontId::monospace(12.0),
                if on { Color32::WHITE } else { theme::TEXT },
            );
            if response.clicked() {
                pick = Some(index);
            }
        }
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.set_width(200.0);
            ui.add_space(40.0);
            ui.label(theme::muted(format!("{total} ms in all. Timing edits as a model's do: pick a frame, then Alt ← → or its length in the inspector.")).size(12.5));
        });
    });
    if let Some(index) = pick {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.frame = if view.frame == Some(index) {
            None
        } else {
            Some(index)
        };
    }
}
