use std::collections::BTreeMap;

use egui::{Color32, Pos2, Rect as ERect, RichText, Sense, Stroke, Ui, Vec2};
use serde_json::Value;

use super::{Grid, TilesetDialog, set_tile_field, tile_data};
use crate::app::Editor;
use crate::ui::{theme, widgets};
use crate::views::area::palette::terrain_colour;

const CLOSEUP: f32 = 192.0;
pub const CORNERS: [&str; 4] = ["nw", "ne", "sw", "se"];

pub fn terrains_of(row: &Value, set: &str) -> Vec<String> {
    row["terrains"][set]
        .as_array()
        .map(|terrains| {
            terrains
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub fn sets_of(row: &Value) -> Vec<String> {
    row["terrains"]
        .as_object()
        .map(|sets| sets.keys().cloned().collect())
        .unwrap_or_default()
}

pub fn corners_of(row: &Value, tile: u32, set: &str) -> Option<[String; 4]> {
    let data = tile_data(row, tile);
    let corners = data["corners"][set].as_array()?;
    let names: Vec<String> = corners
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    (names.len() == 4).then(|| {
        [
            names[0].clone(),
            names[1].clone(),
            names[2].clone(),
            names[3].clone(),
        ]
    })
}

/// The set a view paints, defaulting to the first the row declares.
pub fn current_set(editor: &mut Editor, key: &str, row: &Value) -> Option<String> {
    let sets = sets_of(row);
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    if view.set.as_ref().is_none_or(|set| !sets.contains(set)) {
        view.set = sets.first().cloned();
        view.terrain = 1;
    }
    view.set.clone()
}

pub fn legend(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let sets = sets_of(row);
    let Some(set) = current_set(editor, key, row) else {
        widgets::hint(ui, "no terrain sets yet");
        return;
    };
    let terrains = terrains_of(row, &set);
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    egui::ComboBox::from_id_salt(("terrain-set", key))
        .selected_text(theme::mono(&set))
        .width(110.0)
        .show_ui(ui, |ui| {
            for option in &sets {
                if ui
                    .selectable_label(*option == set, theme::mono(option))
                    .clicked()
                {
                    view.set = Some(option.clone());
                    view.terrain = 1;
                }
            }
        });
    ui.add_space(8.0);
    for (index, terrain) in terrains.iter().enumerate() {
        let on = view.terrain == index;
        let response = ui
            .horizontal(|ui| {
                let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
                shape(ui.painter(), swatch.center(), 6.0, index, true);
                if on {
                    ui.painter().rect_stroke(
                        swatch,
                        2.0,
                        Stroke::new(1.5, Color32::WHITE),
                        egui::StrokeKind::Outside,
                    );
                }
                ui.label(if on {
                    theme::strong(terrain)
                } else {
                    theme::muted(terrain)
                });
                if index == 0 {
                    ui.label(theme::faint("base").size(11.0));
                }
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            view.terrain = index;
        }
    }
    ui.horizontal(|ui| {
        let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
        ui.painter()
            .circle_stroke(swatch.center(), 5.0, Stroke::new(1.0, theme::MUTED));
        ui.label(theme::muted("another set"));
    });
}

/// A terrain's mark: a shape per index in its colour, so sets read without colour too.
pub fn shape(painter: &egui::Painter, center: Pos2, radius: f32, index: usize, filled: bool) {
    let colour = terrain_colour(index);
    let stroke = Stroke::new(1.5, colour);
    match index % 4 {
        0 => {
            let rect = ERect::from_center_size(center, Vec2::splat(radius * 1.6));
            if filled {
                painter.rect_filled(rect, 1.0, colour);
            } else {
                painter.rect_stroke(rect, 1.0, stroke, egui::StrokeKind::Inside);
            }
        }
        1 => {
            if filled {
                painter.circle_filled(center, radius * 0.85, colour);
            } else {
                painter.circle_stroke(center, radius * 0.85, stroke);
            }
        }
        2 => {
            let points = vec![
                center + Vec2::new(0.0, -radius),
                center + Vec2::new(radius, radius * 0.8),
                center + Vec2::new(-radius, radius * 0.8),
            ];
            painter.add(egui::Shape::convex_polygon(
                points,
                if filled { colour } else { Color32::TRANSPARENT },
                stroke,
            ));
        }
        _ => {
            let points = vec![
                center + Vec2::new(0.0, -radius),
                center + Vec2::new(radius, 0.0),
                center + Vec2::new(0.0, radius),
                center + Vec2::new(-radius, 0.0),
            ];
            painter.add(egui::Shape::convex_polygon(
                points,
                if filled { colour } else { Color32::TRANSPARENT },
                stroke,
            ));
        }
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let Some(set) = current_set(editor, key, row) else {
        widgets::hint(
            ui,
            "This tileset declares no terrain set. Add one in the inspector to mark corners.",
        );
        return;
    };
    let terrains = terrains_of(row, &set);
    let in_other_sets: BTreeMap<u32, ()> = row["tiles"]
        .as_object()
        .into_iter()
        .flat_map(|tiles| tiles.iter())
        .filter(|(_, data)| {
            data["corners"]
                .as_object()
                .is_some_and(|sets| sets.keys().any(|s| *s != set))
        })
        .filter_map(|(tile, _)| tile.parse::<u32>().ok().map(|t| (t, ())))
        .collect();
    let closeup = editor.views.tileset.views[key].closeup;
    let height = ui.available_height();
    let sheet_h = (height - CLOSEUP - 80.0).max(120.0);
    let mut clicked_corner: Option<(u32, usize)> = None;
    ui.allocate_ui(Vec2::new(ui.available_width(), sheet_h), |ui| {
        let canvas = super::sheet::canvas(editor, ui, key, grid, |painter, tile, cell| {
            let corners = corners_of(row, tile, &set);
            match corners {
                Some(corners) => {
                    painter.rect_stroke(
                        cell,
                        0.0,
                        Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 80)),
                        egui::StrokeKind::Inside,
                    );
                    let quarter = cell.width() / 4.0;
                    for (corner, terrain) in corners.iter().enumerate() {
                        let Some(index) = terrains.iter().position(|t| t == terrain) else {
                            continue;
                        };
                        let center = cell.min
                            + match corner {
                                0 => Vec2::new(quarter, quarter),
                                1 => Vec2::new(quarter * 3.0, quarter),
                                2 => Vec2::new(quarter, quarter * 3.0),
                                _ => Vec2::new(quarter * 3.0, quarter * 3.0),
                            };
                        shape(painter, center, (quarter * 0.6).max(2.0), index, index != 0);
                    }
                    if closeup == Some(tile) {
                        painter.rect_stroke(
                            cell,
                            0.0,
                            Stroke::new(2.0, theme::SELECTION),
                            egui::StrokeKind::Inside,
                        );
                    }
                }
                None => {
                    painter.rect_filled(cell, 0.0, Color32::from_rgba_unmultiplied(0, 0, 0, 120));
                    if in_other_sets.contains_key(&tile) {
                        painter.circle_stroke(
                            cell.center(),
                            (cell.width() * 0.2).max(2.0),
                            Stroke::new(1.0, theme::MUTED),
                        );
                    }
                }
            }
        });
        if canvas.response.clicked()
            && let Some(pos) = canvas.response.interact_pointer_pos()
            && let Some(tile) = canvas.tile_at(grid, pos)
        {
            let cell = canvas.cell(grid, tile);
            let corner = corner_at(cell, pos);
            clicked_corner = Some((tile, corner));
        }
    });
    if let Some((tile, corner)) = clicked_corner {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.closeup = Some(tile);
        view.tile = Some(tile);
        set_corner(
            editor,
            key,
            row,
            tile,
            &set,
            corner,
            editor.views.tileset.views[key].terrain,
        );
        super::select_parts(editor, key, vec!["/terrains".to_owned()]);
    }
    keys(editor, ui, key, &terrains);
    ui.add_space(6.0);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        ui.label(theme::muted(
            "Clicking a corner sets the terrain picked above;",
        ));
        for index in 0..terrains.len().min(9) {
            widgets::key_hint(ui, &(index + 1).to_string());
        }
        ui.label(theme::muted(
            "pick one. The area brush reads these corners.",
        ));
    });
    ui.add_space(10.0);
    close_up(editor, ui, key, row, grid, &set, &terrains);
}

fn corner_at(cell: ERect, pos: Pos2) -> usize {
    let right = pos.x >= cell.center().x;
    let bottom = pos.y >= cell.center().y;
    match (right, bottom) {
        (false, false) => 0,
        (true, false) => 1,
        (false, true) => 2,
        (true, true) => 3,
    }
}

fn keys(editor: &mut Editor, ui: &Ui, key: &str, terrains: &[String]) {
    if ui.ctx().egui_wants_keyboard_input() {
        return;
    }
    let digits = [
        egui::Key::Num1,
        egui::Key::Num2,
        egui::Key::Num3,
        egui::Key::Num4,
        egui::Key::Num5,
        egui::Key::Num6,
        egui::Key::Num7,
        egui::Key::Num8,
        egui::Key::Num9,
    ];
    let pressed = ui.input(|i| digits.iter().position(|key| i.key_pressed(*key)));
    if let Some(index) = pressed
        && index < terrains.len()
    {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.terrain = index;
    }
}

/// Sets one corner of a tile in a set, starting from all-base when the tile had no corners.
pub fn set_corner(
    editor: &mut Editor,
    key: &str,
    row: &Value,
    tile: u32,
    set: &str,
    corner: usize,
    terrain: usize,
) {
    let terrains = terrains_of(row, set);
    let Some(name) = terrains.get(terrain).cloned() else {
        return;
    };
    let base = terrains.first().cloned().unwrap_or_default();
    let mut corners =
        corners_of(row, tile, set).unwrap_or([base.clone(), base.clone(), base.clone(), base]);
    if corners[corner] == name {
        return;
    }
    corners[corner] = name.clone();
    let mut changed = editor.row_value(super::TABLE, key).unwrap_or(row.clone());
    let mut all = tile_data(row, tile)["corners"].clone();
    if !all.is_object() {
        all = Value::Object(serde_json::Map::new());
    }
    all[set] = Value::Array(corners.iter().map(|c| Value::String(c.clone())).collect());
    set_tile_field(&mut changed, tile, "corners", all);
    super::write_row(
        editor,
        key,
        &changed,
        format!(
            "Corner {} of tile {tile} is {name} in {set} of {key}",
            CORNERS[corner]
        ),
        false,
    );
}

fn close_up(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    grid: &Grid,
    set: &str,
    terrains: &[String],
) {
    let Some(tile) = editor.views.tileset.views[key].closeup else {
        widgets::hint(ui, "Click a tile's corner to see it close up here.");
        return;
    };
    let corners = corners_of(row, tile, set);
    let mut clicked = None;
    ui.horizontal_top(|ui| {
        let (rect, response) = ui.allocate_exact_size(Vec2::splat(CLOSEUP), Sense::click());
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 0.0, theme::INPUT);
        grid.draw(&painter, rect, tile);
        let quarter = CLOSEUP / 4.0;
        for (corner, name) in CORNERS.iter().enumerate() {
            let center = rect.min
                + match corner {
                    0 => Vec2::new(quarter * 0.5, quarter * 0.5),
                    1 => Vec2::new(CLOSEUP - quarter * 0.5, quarter * 0.5),
                    2 => Vec2::new(quarter * 0.5, CLOSEUP - quarter * 0.5),
                    _ => Vec2::new(CLOSEUP - quarter * 0.5, CLOSEUP - quarter * 0.5),
                };
            let index = corners
                .as_ref()
                .and_then(|corners| terrains.iter().position(|t| *t == corners[corner]))
                .unwrap_or(0);
            painter.circle_filled(center, 13.0, Color32::from_rgba_unmultiplied(0, 0, 0, 120));
            shape(&painter, center, 9.0, index, index != 0);
            let label = Pos2::new(
                if corner % 2 == 0 {
                    center.x + 18.0
                } else {
                    center.x - 18.0
                },
                center.y,
            );
            painter.text(
                label,
                if corner % 2 == 0 {
                    egui::Align2::LEFT_CENTER
                } else {
                    egui::Align2::RIGHT_CENTER
                },
                name,
                egui::FontId::monospace(11.0),
                Color32::from_rgba_unmultiplied(255, 255, 255, 160),
            );
        }
        painter.rect_stroke(
            rect,
            0.0,
            Stroke::new(1.0, theme::BORDER),
            egui::StrokeKind::Inside,
        );
        if response.clicked()
            && let Some(pos) = response.interact_pointer_pos()
        {
            clicked = Some(corner_at(rect, pos));
        }
        ui.add_space(16.0);
        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            ui.horizontal_wrapped(|ui| {
                ui.label(theme::strong(format!("tile {tile}, close up.")));
                ui.label(theme::muted(sentence(corners.as_ref(), terrains)));
                ui.label(theme::muted("Click a corner here or above to set it."));
            });
        });
    });
    if let Some(corner) = clicked {
        let terrain = editor.views.tileset.views[key].terrain;
        set_corner(editor, key, row, tile, set, corner, terrain);
    }
}

/// "South-west is floor, the rest rug."
fn sentence(corners: Option<&[String; 4]>, terrains: &[String]) -> String {
    let Some(corners) = corners else {
        return "Not in this set: every corner reads as the base.".to_owned();
    };
    let names = ["North-west", "North-east", "South-west", "South-east"];
    let mut tally: Vec<(String, Vec<&str>)> = Vec::new();
    for (corner, terrain) in corners.iter().enumerate() {
        match tally.iter_mut().find(|(t, _)| t == terrain) {
            Some((_, list)) => list.push(names[corner]),
            None => tally.push((terrain.clone(), vec![names[corner]])),
        }
    }
    if tally.len() == 1 {
        return format!("Every corner is {}.", tally[0].0);
    }
    tally.sort_by_key(|(_, list)| list.len());
    let mut parts: Vec<String> = Vec::new();
    for (terrain, list) in tally.iter().take(tally.len() - 1) {
        parts.push(format!(
            "{} {} {terrain}",
            list.join(" and "),
            if list.len() == 1 { "is" } else { "are" }
        ));
    }
    let last = &tally[tally.len() - 1].0;
    let _ = terrains;
    format!("{}, the rest {last}.", parts.join(", "))
}

/// Every mix the set can need, as the brush sees it: the tile that draws it, or that none does.
pub fn mixes(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value, grid: &Grid) {
    let Some(set) = current_set(editor, key, row) else {
        widgets::hint(ui, "no terrain set");
        return;
    };
    let terrains = terrains_of(row, &set);
    if terrains.is_empty() {
        return;
    }
    let letters: Vec<String> = terrains
        .iter()
        .map(|terrain| terrain.chars().next().unwrap_or('?').to_string())
        .collect();
    let by_mix = tiles_by_mix(row, &set);
    ui.add_space(6.0);
    ui.horizontal_wrapped(|ui| {
        ui.label(theme::strong(&set));
        ui.label(theme::muted(format!(
            "· every mix of {}, corners read nw ne sw se",
            terrains
                .iter()
                .zip(&letters)
                .map(|(terrain, letter)| format!("{terrain} ({letter})"))
                .collect::<Vec<_>>()
                .join(" and ")
        )));
    });
    ui.add_space(4.0);
    let total = terrains.len().pow(4);
    let per_row = ((ui.available_width() - 16.0) / 58.0).floor().max(1.0) as usize;
    egui::ScrollArea::vertical()
        .id_salt(("mixes", key))
        .show(ui, |ui| {
            egui::Grid::new(("mixes-grid", key))
                .spacing(Vec2::new(8.0, 6.0))
                .show(ui, |ui| {
                    for index in 0..total {
                        let mix = mix_of(index, terrains.len());
                        let names: Vec<&String> = mix.iter().map(|i| &terrains[*i]).collect();
                        let code: String = mix.iter().map(|i| letters[*i].clone()).collect();
                        let tiles = by_mix.get(&[
                            names[0].clone(),
                            names[1].clone(),
                            names[2].clone(),
                            names[3].clone(),
                        ]);
                        ui.vertical(|ui| {
                            let (rect, _) =
                                ui.allocate_exact_size(Vec2::splat(44.0), Sense::hover());
                            let painter = ui.painter_at(rect);
                            painter.rect_filled(rect, 3.0, theme::INPUT);
                            if mix.iter().all(|i| *i == 0) {
                                painter.text(
                                    rect.center(),
                                    egui::Align2::CENTER_CENTER,
                                    "base",
                                    egui::FontId::proportional(11.0),
                                    theme::MUTED,
                                );
                            } else if let Some(tiles) = tiles {
                                grid.draw(&painter, rect.shrink(2.0), tiles[0]);
                                if tiles.len() > 1 {
                                    painter.text(
                                        rect.right_bottom() - Vec2::new(2.0, 2.0),
                                        egui::Align2::RIGHT_BOTTOM,
                                        format!("×{}", tiles.len()),
                                        egui::FontId::proportional(10.0),
                                        Color32::WHITE,
                                    );
                                }
                            } else {
                                painter.rect_stroke(
                                    rect,
                                    3.0,
                                    Stroke::new(1.0, theme::DANGER),
                                    egui::StrokeKind::Inside,
                                );
                                painter.text(
                                    rect.center(),
                                    egui::Align2::CENTER_CENTER,
                                    "–",
                                    egui::FontId::proportional(14.0),
                                    theme::DANGER,
                                );
                            }
                            ui.label(theme::faint(code).size(10.5).monospace());
                        });
                        if (index + 1) % per_row == 0 {
                            ui.end_row();
                        }
                    }
                });
        });
}

pub fn mix_of(index: usize, terrains: usize) -> [usize; 4] {
    let mut rest = index;
    let mut mix = [0; 4];
    for slot in (0..4).rev() {
        mix[slot] = rest % terrains;
        rest /= terrains;
    }
    mix
}

pub fn tiles_by_mix(row: &Value, set: &str) -> BTreeMap<[String; 4], Vec<u32>> {
    let mut by_mix: BTreeMap<[String; 4], Vec<u32>> = BTreeMap::new();
    for (tile, _) in row["tiles"]
        .as_object()
        .into_iter()
        .flat_map(|tiles| tiles.iter())
    {
        let Ok(tile) = tile.parse::<u32>() else {
            continue;
        };
        if let Some(corners) = corners_of(row, tile, set) {
            by_mix.entry(corners).or_default().push(tile);
        }
    }
    by_mix
}

/// How many non-base mixes have a tile, how many there are, and the mixes missing.
pub fn completeness(row: &Value, set: &str) -> (usize, usize, Vec<String>) {
    let terrains = terrains_of(row, set);
    if terrains.is_empty() {
        return (0, 0, Vec::new());
    }
    let letters: Vec<String> = terrains
        .iter()
        .map(|terrain| terrain.chars().next().unwrap_or('?').to_string())
        .collect();
    let by_mix = tiles_by_mix(row, set);
    let total = terrains.len().pow(4) - 1;
    let mut have = 0;
    let mut missing = Vec::new();
    for index in 1..=total {
        let mix = mix_of(index, terrains.len());
        let names = [
            terrains[mix[0]].clone(),
            terrains[mix[1]].clone(),
            terrains[mix[2]].clone(),
            terrains[mix[3]].clone(),
        ];
        if by_mix.contains_key(&names) {
            have += 1;
        } else {
            missing.push(mix.iter().map(|i| letters[*i].clone()).collect::<String>());
        }
    }
    (have, total, missing)
}

/// How many tiles a set marks, and how many share a mix with another.
pub fn tile_counts(row: &Value, set: &str) -> (usize, usize) {
    let by_mix = tiles_by_mix(row, set);
    let tiles: usize = by_mix.values().map(Vec::len).sum();
    let twins: usize = by_mix
        .values()
        .filter(|tiles| tiles.len() > 1)
        .map(Vec::len)
        .sum();
    (tiles, twins)
}

#[allow(clippy::too_many_arguments)]
pub fn new_set_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    key: &str,
    row: &Value,
    mut name: String,
    mut terrains: String,
    error: Option<String>,
    next: &mut Option<TilesetDialog>,
) {
    let mut decision = None;
    crate::ui::dialogs::card(ctx, "new-terrain-set", 420.0, |ui| {
        ui.label(RichText::new("New terrain set").size(16.0).strong());
        ui.add_space(6.0);
        ui.label(theme::muted(
            "Two to eight terrains; the first is the base an empty cell reads as.",
        ));
        ui.add_space(8.0);
        widgets::kv(ui, "set", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut name)
                        .desired_width(220.0)
                        .font(egui::TextStyle::Monospace),
                )
            });
            response.request_focus();
        });
        widgets::kv(ui, "terrains", |ui| {
            crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut terrains)
                        .desired_width(220.0)
                        .font(egui::TextStyle::Monospace)
                        .hint_text("floor, rug"),
                )
            });
        });
        if let Some(error) = &error {
            ui.label(RichText::new(error).color(theme::DANGER).size(12.5));
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Add set").clicked() {
                decision = Some(true);
            }
            if ui.button("Cancel").clicked() {
                decision = Some(false);
            }
        });
        let (enter, escape) = ui.input(|i| {
            (
                i.key_pressed(egui::Key::Enter),
                i.key_pressed(egui::Key::Escape),
            )
        });
        if enter {
            decision = Some(true);
        }
        if escape {
            decision = Some(false);
        }
    });
    match decision {
        None => {
            *next = Some(TilesetDialog::NewTerrainSet {
                name,
                terrains,
                error,
            })
        }
        Some(false) => *next = None,
        Some(true) => {
            let set = name.trim().to_lowercase().replace(' ', "_");
            let list: Vec<String> = terrains
                .split(',')
                .map(|t| t.trim().to_lowercase().replace(' ', "_"))
                .filter(|t| !t.is_empty())
                .collect();
            let problem = if set.is_empty() {
                Some("a set needs a name".to_owned())
            } else if sets_of(row).contains(&set) {
                Some(format!("{set} is already a set of this tileset"))
            } else if list.len() < 2 || list.len() > 8 {
                Some("two to eight terrains, separated by commas".to_owned())
            } else {
                None
            };
            if let Some(problem) = problem {
                *next = Some(TilesetDialog::NewTerrainSet {
                    name,
                    terrains,
                    error: Some(problem),
                });
                return;
            }
            let mut changed = row.clone();
            if !changed["terrains"].is_object() {
                changed["terrains"] = Value::Object(serde_json::Map::new());
            }
            changed["terrains"][&set] =
                Value::Array(list.iter().map(|t| Value::String(t.clone())).collect());
            if super::write_row(
                editor,
                key,
                &changed,
                format!("New terrain set {set} on {key}"),
                false,
            ) {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.set = Some(set);
                view.terrain = 1;
                *next = None;
            } else {
                *next = Some(TilesetDialog::NewTerrainSet {
                    name,
                    terrains,
                    error: Some("the folder refused it".to_owned()),
                });
            }
        }
    }
}
