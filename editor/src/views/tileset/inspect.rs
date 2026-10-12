use egui::{Color32, RichText, Ui};
use serde_json::Value;

use super::{Mode, TilesetDialog, set_tile_field, tile_data};
use crate::app::Editor;
use crate::forms::{Changed, FormCx};
use crate::project::Selection;
use crate::ui::{theme, widgets};

pub fn show(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    let Some(key) = selection.keys.first().cloned() else {
        return;
    };
    let Some(part) = selection.parts.first().cloned() else {
        return;
    };
    let Some(row) = editor.row_value(super::TABLE, &key) else {
        return;
    };
    super::ensure_view(editor, &key);
    let ctx = ui.ctx().clone();
    let grid = super::grid_of(editor, &ctx, &row);
    egui::ScrollArea::vertical()
        .id_salt(("tileset-inspect", &key))
        .show(ui, |ui| {
            if let Some(tile) = part
                .strip_prefix("/tiles/")
                .and_then(|t| t.parse::<u32>().ok())
            {
                tile_card(editor, ui, &key, &row, &grid, tile);
                selection_card(editor, ui, &key, &grid);
                let mode = editor.views.tileset.views[&key].mode;
                if mode == Mode::Surface {
                    let surface = tile_data(&row, tile)["surface"]
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| editor.views.tileset.views[&key].surface.clone());
                    if let Some(surface) = surface {
                        ui.add_space(8.0);
                        super::surfaces::card(editor, ui, &surface);
                    }
                } else {
                    ui.add_space(8.0);
                    crate::ui::inspector::show_row(editor, ui, super::TABLE, &key);
                }
                used_by(editor, ui, &key);
            } else if part == "/terrains" {
                terrains_cards(editor, ui, &key, &row);
            } else if part == "/animation" {
                super::animation::card(editor, ui, &key, &row, &grid);
            }
        });
}

fn tile_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    grid: &super::Grid,
    tile: u32,
) {
    let (x, y) = grid.xy(tile);
    ui.label(
        theme::mono(format!("tileset/{key} › tile {tile}"))
            .color(theme::CODE)
            .size(12.0),
    );
    ui.add_space(4.0);
    let data = tile_data(row, tile);
    let mode = editor.views.tileset.views[key].mode;
    let surfaces = crate::views::model::sounds::surfaces(editor);
    let mut new_walk: Option<Option<String>> = None;
    let mut new_surface: Option<Option<String>> = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "tile", &format!("tile {tile} · {x}, {y}"), "", |_| {});
        ui.add_space(4.0);
        let walk = data["walk"].as_str().map(str::to_owned);
        let surface = data["surface"].as_str().map(str::to_owned);
        let walk_row = |ui: &mut Ui, new_walk: &mut Option<Option<String>>| {
            widgets::kv(ui, "walk", |ui| {
                let label = walk.clone().unwrap_or_else(|| "says nothing".to_owned());
                egui::ComboBox::from_id_salt(("tile-walk", key, tile))
                    .selected_text(theme::mono(label))
                    .width(ui.available_width() - 8.0)
                    .show_ui(ui, |ui| {
                        for option in [Some("walkable"), Some("blocks"), None] {
                            let text = option.unwrap_or("says nothing");
                            if ui
                                .selectable_label(walk.as_deref() == option, theme::mono(text))
                                .clicked()
                            {
                                *new_walk = Some(option.map(str::to_owned));
                            }
                        }
                    });
            });
        };
        let surface_row = |ui: &mut Ui, new_surface: &mut Option<Option<String>>| {
            widgets::kv(ui, "surface", |ui| {
                let label = surface.clone().unwrap_or_else(|| "none".to_owned());
                egui::ComboBox::from_id_salt(("tile-surface", key, tile))
                    .selected_text(theme::mono(label))
                    .width(ui.available_width() - 8.0)
                    .show_ui(ui, |ui| {
                        for (option, name, _) in &surfaces {
                            if ui
                                .selectable_label(
                                    surface.as_deref() == Some(option),
                                    theme::mono(name.to_lowercase()),
                                )
                                .clicked()
                            {
                                *new_surface = Some(Some(option.clone()));
                            }
                        }
                        if ui
                            .selectable_label(surface.is_none(), theme::mono("none"))
                            .clicked()
                        {
                            *new_surface = Some(None);
                        }
                    });
            });
        };
        if mode == Mode::Surface {
            surface_row(ui, &mut new_surface);
            widgets::kv_text(
                ui,
                "walk",
                walk.clone().unwrap_or_else(|| "says nothing".to_owned()),
            );
        } else {
            walk_row(ui, &mut new_walk);
            widgets::kv_text(
                ui,
                "surface",
                surface.clone().unwrap_or_else(|| "none".to_owned()),
            );
            let corners = data["corners"]
                .as_object()
                .filter(|sets| !sets.is_empty())
                .map(|sets| {
                    sets.iter()
                        .map(|(set, corners)| {
                            format!(
                                "{set}: {}",
                                corners
                                    .as_array()
                                    .map(|c| c
                                        .iter()
                                        .filter_map(Value::as_str)
                                        .collect::<Vec<_>>()
                                        .join(" "))
                                    .unwrap_or_default()
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(" · ")
                })
                .unwrap_or_else(|| "none".to_owned());
            widgets::kv_text(ui, "corners", corners);
            let animation = data["animation"]
                .as_array()
                .filter(|frames| !frames.is_empty())
                .map(|frames| {
                    format!(
                        "{} frames · {} ms",
                        frames.len(),
                        frames
                            .iter()
                            .map(|f| f["ms"].as_u64().unwrap_or(0))
                            .sum::<u64>()
                    )
                })
                .unwrap_or_else(|| "none".to_owned());
            widgets::kv_text(ui, "animation", animation);
        }
    });
    if let Some(walk) = new_walk {
        let mut changed = row.clone();
        let label = walk.clone().unwrap_or_else(|| "nothing".to_owned());
        set_tile_field(
            &mut changed,
            tile,
            "walk",
            walk.map(Value::String).unwrap_or(Value::Null),
        );
        super::write_row(
            editor,
            key,
            &changed,
            format!("Walk: {label} on tile {tile} of {key}"),
            false,
        );
    }
    if let Some(surface) = new_surface {
        let mut changed = row.clone();
        let label = surface.clone().unwrap_or_else(|| "none".to_owned());
        set_tile_field(
            &mut changed,
            tile,
            "surface",
            surface.map(Value::String).unwrap_or(Value::Null),
        );
        super::write_row(
            editor,
            key,
            &changed,
            format!("Surface: {label} on tile {tile} of {key}"),
            false,
        );
    }
}

fn selection_card(editor: &mut Editor, ui: &mut Ui, key: &str, grid: &super::Grid) {
    let Some(selection) = editor.views.tileset.views[key].selection else {
        return;
    };
    widgets::section(
        ui,
        &format!(
            "Selection · {} tiles · {}, {} · {} × {}",
            selection.count(),
            selection.x,
            selection.y,
            selection.w,
            selection.h
        ),
    );
    ui.horizontal(|ui| {
        if ui.button("▣ Make blueprint from these tiles…").clicked() {
            let view = editor
                .views
                .tileset
                .views
                .get_mut(key)
                .expect("the view exists");
            view.dialog = Some(TilesetDialog::MakeBlueprint {
                name: format!("{key}_{}_{}", selection.x, selection.y),
                error: None,
            });
        }
        if ui
            .small_button("✕")
            .on_hover_text("Clear the selection")
            .clicked()
        {
            let view = editor
                .views
                .tileset
                .views
                .get_mut(key)
                .expect("the view exists");
            view.selection = None;
        }
    });
    let _ = grid;
}

fn used_by(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let areas = super::areas_using(editor, key);
    widgets::section_count(ui, "Used by", format!("{} areas", areas.len()));
    if areas.is_empty() {
        widgets::hint(ui, "no area's palette names this tileset");
    }
    let mut open = None;
    for area in &areas {
        ui.horizontal(|ui| {
            widgets::badge(ui, "area");
            if ui.link(theme::mono(area)).clicked() {
                open = Some(area.clone());
            }
        });
    }
    if let Some(area) = open {
        editor.select(Selection::row("area", &area));
        editor.open_tab(crate::tabs::Tab::Area { key: area });
    }
}

pub fn first_class_body(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> Changed {
    let mut changed = Changed::default();
    widgets::kv(ui, "image", |ui| {
        let mut file = value["image"].as_str().unwrap_or_default().to_owned();
        if crate::picker::asset(ui, cx, &mut file, "/image") {
            value["image"] = Value::String(file);
            changed = Changed::at("/image");
        }
    });
    let tile = value["tile"].as_u64().unwrap_or(16);
    let columns = value["image"]
        .as_str()
        .and_then(|image| {
            let ctx = ui.ctx().clone();
            cx.state.thumbnails.image(&ctx, cx.files, image)
        })
        .map(|thumb| thumb.size[0] as u64 / tile.max(1));
    widgets::kv_text(
        ui,
        "tile",
        match columns {
            Some(columns) => format!("{tile} × {tile} px · {columns} columns, imported"),
            None => format!("{tile} × {tile} px, imported"),
        },
    );
    let tiles = value["tiles"].as_object().map_or(0, |tiles| tiles.len());
    widgets::kv_text(ui, "tiles", format!("{tiles} with data"));
    let sets: Vec<String> = value["terrains"]
        .as_object()
        .map(|sets| sets.keys().cloned().collect())
        .unwrap_or_default();
    if !sets.is_empty() {
        widgets::kv_text(ui, "terrains", sets.join(" · "));
    }
    changed
}

fn terrains_cards(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    ui.label(
        theme::mono(format!("tileset/{key} › terrains"))
            .color(theme::CODE)
            .size(12.0),
    );
    ui.add_space(4.0);
    let sets = super::terrain::sets_of(row);
    let current = editor.views.tileset.views[key].set.clone();
    let show_missing_id = ui.id().with(("missing", key));
    let mut pick_set = None;
    let mut remove_set = None;
    for set in &sets {
        let terrains = super::terrain::terrains_of(row, set);
        let (tiles, twins) = super::terrain::tile_counts(row, set);
        let (have, total, missing) = super::terrain::completeness(row, set);
        let on = current.as_deref() == Some(set);
        let response = widgets::card_frame(on)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, "terrain", set, "", |ui| {
                    if ui.button("Remove this set").clicked() {
                        remove_set = Some(set.clone());
                        ui.close();
                    }
                });
                ui.add_space(4.0);
                widgets::kv(ui, "terrains", |ui| {
                    ui.horizontal_wrapped(|ui| {
                        for (index, terrain) in terrains.iter().enumerate() {
                            ui.label(
                                theme::mono(terrain)
                                    .color(crate::views::area::palette::terrain_colour(index)),
                            );
                            if index == 0 {
                                ui.label(theme::faint("base").size(11.0));
                            }
                            if index + 1 < terrains.len() {
                                ui.label(theme::faint("·"));
                            }
                        }
                    });
                });
                widgets::kv_text(
                    ui,
                    "tiles",
                    if twins > 0 {
                        format!("{tiles}, {} of them twins", number_word(twins))
                    } else {
                        tiles.to_string()
                    },
                );
                widgets::kv(ui, "mixes", |ui| {
                    if have >= total {
                        ui.label(RichText::new("✓").color(theme::OK));
                        ui.label(format!("all {total} beyond its base"));
                    } else {
                        ui.label(format!("{have} of {total} ·"));
                        let open = ui
                            .memory(|m| m.data.get_temp::<bool>(show_missing_id.with(set)))
                            .unwrap_or(false);
                        if ui
                            .link(if open {
                                "hide the missing".to_owned()
                            } else {
                                format!("show the {} missing", missing.len())
                            })
                            .clicked()
                        {
                            ui.memory_mut(|m| m.data.insert_temp(show_missing_id.with(set), !open));
                        }
                    }
                });
                let open = ui
                    .memory(|m| m.data.get_temp::<bool>(show_missing_id.with(set)))
                    .unwrap_or(false);
                if open && !missing.is_empty() {
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing.x = 4.0;
                        for code in &missing {
                            ui.label(theme::mono(code).size(11.5).color(theme::MUTED));
                        }
                    });
                }
            })
            .response
            .interact(egui::Sense::click());
        if response.clicked() {
            pick_set = Some(set.clone());
        }
        ui.add_space(4.0);
    }
    if ui.button("+ New terrain set").clicked() {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.dialog = Some(TilesetDialog::NewTerrainSet {
            name: String::new(),
            terrains: String::new(),
            error: None,
        });
    }
    if let Some(set) = pick_set {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.set = Some(set);
        view.terrain = 1;
    }
    if let Some(set) = remove_set {
        let mut changed = row.clone();
        if let Some(sets) = changed["terrains"].as_object_mut() {
            sets.remove(&set);
        }
        if let Some(tiles) = changed["tiles"].as_object_mut() {
            for data in tiles.values_mut() {
                if let Some(corners) = data["corners"].as_object_mut() {
                    corners.remove(&set);
                }
            }
            tiles.retain(|_, data| {
                data.as_object().is_some_and(|d| {
                    let only_empty_corners = d.len() == 1
                        && d.get("corners")
                            .and_then(Value::as_object)
                            .is_some_and(|c| c.is_empty());
                    !(d.is_empty() || only_empty_corners)
                })
            });
        }
        super::write_row(
            editor,
            key,
            &changed,
            format!("Remove terrain set {set} from {key}"),
            false,
        );
    }
    let closeup = editor.views.tileset.views[key].closeup;
    let set = editor.views.tileset.views[key].set.clone();
    if let (Some(tile), Some(set)) = (closeup, set) {
        let terrains = super::terrain::terrains_of(row, &set);
        let corners = super::terrain::corners_of(row, tile, &set);
        widgets::section(ui, &format!("Tile {tile} · corners"));
        let mut set_corner = None;
        egui::Grid::new(("corners", key, tile))
            .spacing(egui::vec2(8.0, 6.0))
            .show(ui, |ui| {
                for (corner, name) in super::terrain::CORNERS.iter().enumerate() {
                    ui.label(theme::muted(*name));
                    let current = corners
                        .as_ref()
                        .map(|c| c[corner].clone())
                        .unwrap_or_else(|| terrains.first().cloned().unwrap_or_default());
                    egui::ComboBox::from_id_salt(("corner", key, tile, corner))
                        .selected_text(theme::mono(&current))
                        .width(90.0)
                        .show_ui(ui, |ui| {
                            for (index, terrain) in terrains.iter().enumerate() {
                                if ui
                                    .selectable_label(*terrain == current, theme::mono(terrain))
                                    .clicked()
                                {
                                    set_corner = Some((corner, index));
                                }
                            }
                        });
                    if corner % 2 == 1 {
                        ui.end_row();
                    }
                }
            });
        if let Some((corner, terrain)) = set_corner {
            super::terrain::set_corner(editor, key, row, tile, &set, corner, terrain);
        }
    }
    let _ = Color32::WHITE;
}

fn number_word(n: usize) -> String {
    match n {
        1 => "one".to_owned(),
        2 => "two".to_owned(),
        3 => "three".to_owned(),
        4 => "four".to_owned(),
        5 => "five".to_owned(),
        6 => "six".to_owned(),
        7 => "seven".to_owned(),
        8 => "eight".to_owned(),
        9 => "nine".to_owned(),
        _ => n.to_string(),
    }
}
