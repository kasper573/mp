use std::collections::{BTreeMap, HashSet};

use egui::{Align, Color32, Layout, Pos2, Rect as ERect, Sense, Stroke as EStroke, Ui, Vec2};
use game::core::content::Content;
use game::systems::area;
use game::systems::area::tileset::TilesetDef;

use super::brush::{TerrainPick, TilePick};
use crate::app::Editor;
use crate::ui::{theme, widgets};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Lens {
    #[default]
    Tiles,
    Terrains,
}

pub fn show(editor: &mut Editor, ui: &mut Ui, view_key: &str, content: Content, area_id: area::Id) {
    let tile_px = area::load(&content, area_id).tile;
    let tilesets: Vec<(String, &'static TilesetDef)> = content
        .table::<TilesetDef>()
        .iter()
        .filter(|(_, def)| def.tile == tile_px)
        .map(|(id, def)| (id.key(&content).to_owned(), def))
        .collect();
    let used: HashSet<String> = area::load(&content, area_id)
        .grids
        .palette_keys
        .iter()
        .map(|(set, _, _)| set.clone())
        .collect();
    let mut lens = editor.views.area.views[view_key].palette_lens;
    if editor.views.area.views[view_key].tool == super::Tool::Terrain {
        lens = Lens::Terrains;
    }
    ui.add_space(4.0);
    ui.horizontal_wrapped(|ui| {
        for (value, label) in [(Lens::Tiles, "tiles"), (Lens::Terrains, "terrains")] {
            let on = lens == value;
            if widgets::chip_coloured(
                ui,
                label,
                if on {
                    theme::ACCENT_SOFT
                } else {
                    theme::RAISED
                },
                if on { theme::SELECTION } else { theme::TEXT },
            )
            .clicked()
            {
                lens = value;
            }
        }
        ui.add_space(12.0);
        match lens {
            Lens::Tiles => tileset_chips(editor, ui, view_key, &tilesets, &used),
            Lens::Terrains => terrain_chips(editor, ui, view_key, &tilesets, &used),
        }
    });
    editor
        .views
        .area
        .views
        .get_mut(view_key)
        .expect("view")
        .palette_lens = lens;
    ui.add_space(6.0);
    match lens {
        Lens::Tiles => tile_sheet(editor, ui, view_key, content, &tilesets),
        Lens::Terrains => terrain_sheet(editor, ui, view_key, content, &tilesets),
    }
}

fn tileset_chips(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    tilesets: &[(String, &TilesetDef)],
    used: &HashSet<String>,
) {
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let mut own: Vec<&String> = tilesets
        .iter()
        .map(|(k, _)| k)
        .filter(|k| used.contains(*k))
        .collect();
    own.sort();
    let mut others: Vec<&String> = tilesets
        .iter()
        .map(|(k, _)| k)
        .filter(|k| !used.contains(*k))
        .collect();
    others.sort();
    if view.pick.tileset.is_none() {
        view.pick.tileset = own.first().or(others.first()).map(|k| (*k).clone());
    }
    let current = view.pick.tileset.clone();
    let mut picked: Option<String> = None;
    for key in &own {
        let on = current.as_deref() == Some(key.as_str());
        if lens_chip(ui, key, on).clicked() {
            picked = Some((*key).clone());
        }
    }
    if let Some(key) = current.as_ref().filter(|k| !own.contains(k)) {
        lens_chip(ui, key, true);
    }
    if !others.is_empty() {
        let response = widgets::chip(ui, &format!("+ {}", others.len()));
        egui::Popup::from_toggle_button_response(&response)
            .id(ui.make_persistent_id((view_key, "other tilesets")))
            .width(280.0)
            .show(|ui| {
                ui.set_min_width(240.0);
                widgets::search_box(ui, &mut view.tileset_search, "Search tilesets", None);
                let needle = view.tileset_search.to_lowercase();
                egui::ScrollArea::vertical()
                    .max_height(260.0)
                    .show(ui, |ui| {
                        for key in others
                            .iter()
                            .filter(|k| needle.is_empty() || k.to_lowercase().contains(&needle))
                        {
                            if ui.selectable_label(false, theme::mono(*key)).clicked() {
                                picked = Some((*key).clone());
                            }
                        }
                    });
            });
    }
    if let Some(key) = picked {
        view.pick = TilePick {
            tileset: Some(key),
            ..TilePick::default()
        };
    }
}

fn lens_chip(ui: &mut Ui, text: &str, on: bool) -> egui::Response {
    widgets::chip_coloured(
        ui,
        text,
        if on {
            theme::ACCENT_SOFT
        } else {
            theme::RAISED
        },
        if on { theme::SELECTION } else { theme::CODE },
    )
}

fn tile_sheet(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    tilesets: &[(String, &'static TilesetDef)],
) {
    let Some(tileset_key) = editor.views.area.views[view_key].pick.tileset.clone() else {
        widgets::hint(ui, "No tileset of this tile size.");
        return;
    };
    let Some(def) = tilesets
        .iter()
        .find(|(k, _)| *k == tileset_key)
        .map(|(_, d)| *d)
    else {
        return;
    };
    let random = editor.settings.brush.random;
    let Some(thumb) = sheet_image(editor, ui, def) else {
        return;
    };
    let tile_px = def.tile.max(1);
    let columns = (thumb.size[0] as u32 / tile_px).max(1);
    let rows = (thumb.size[1] as u32 / tile_px).max(1);
    let shown_tile = (ui.available_width() / columns as f32)
        .clamp(12.0, 34.0)
        .floor();
    let size = Vec2::new(columns as f32 * shown_tile, rows as f32 * shown_tile);
    egui::ScrollArea::vertical()
        .id_salt((view_key, "tiles"))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let (rect, response) = ui.allocate_exact_size(size, Sense::click_and_drag());
            let painter = ui.painter_at(rect);
            painter.image(
                thumb.texture.id(),
                rect,
                ERect::from_min_max(
                    Pos2::ZERO,
                    Pos2::new(
                        (columns * tile_px) as f32 / thumb.size[0] as f32,
                        (rows * tile_px) as f32 / thumb.size[1] as f32,
                    ),
                ),
                Color32::WHITE,
            );
            for x in 0..=columns {
                let sx = rect.min.x + x as f32 * shown_tile;
                painter.line_segment(
                    [Pos2::new(sx, rect.min.y), Pos2::new(sx, rect.max.y)],
                    EStroke::new(1.0, Color32::from_rgba_unmultiplied(0, 0, 0, 70)),
                );
            }
            for y in 0..=rows {
                let sy = rect.min.y + y as f32 * shown_tile;
                painter.line_segment(
                    [Pos2::new(rect.min.x, sy), Pos2::new(rect.max.x, sy)],
                    EStroke::new(1.0, Color32::from_rgba_unmultiplied(0, 0, 0, 70)),
                );
            }
            let tile_at = |p: Pos2| -> (u32, u32) {
                let x = ((p.x - rect.min.x) / shown_tile)
                    .floor()
                    .clamp(0.0, columns as f32 - 1.0) as u32;
                let y = ((p.y - rect.min.y) / shown_tile)
                    .floor()
                    .clamp(0.0, rows as f32 - 1.0) as u32;
                (x, y)
            };
            let view = editor.views.area.views.get_mut(view_key).expect("view");
            if let Some(p) = response.interact_pointer_pos() {
                let (x, y) = tile_at(p);
                let ctrl = ui.input(|i| i.modifiers.ctrl);
                if response.drag_started() || response.clicked() {
                    if random || ctrl {
                        let tile = y * columns + x;
                        if let Some(at) = view.pick.random.iter().position(|t| *t == tile) {
                            view.pick.random.remove(at);
                        } else {
                            view.pick.random.push(tile);
                        }
                        view.pick.block.clear();
                    } else {
                        view.pick.anchor = Some((x, y));
                        view.pick.block = vec![vec![y * columns + x]];
                        view.pick.random.clear();
                    }
                } else if response.dragged()
                    && !random
                    && !ctrl
                    && let Some((ax, ay)) = view.pick.anchor
                {
                    let (x0, x1) = (ax.min(x), ax.max(x));
                    let (y0, y1) = (ay.min(y), ay.max(y));
                    view.pick.block = (y0..=y1)
                        .map(|row| (x0..=x1).map(|col| row * columns + col).collect())
                        .collect();
                }
            }
            let highlight = |tile: u32| {
                let (x, y) = (tile % columns, tile / columns);
                ERect::from_min_size(
                    rect.min + Vec2::new(x as f32 * shown_tile, y as f32 * shown_tile),
                    Vec2::splat(shown_tile),
                )
            };
            let block: Vec<u32> = view.pick.block.iter().flatten().copied().collect();
            if let (Some(first), Some(last)) = (block.first(), block.last()) {
                painter.rect_stroke(
                    highlight(*first).union(highlight(*last)),
                    0.0,
                    EStroke::new(2.0, theme::ACCENT),
                    egui::StrokeKind::Inside,
                );
            }
            for tile in &view.pick.random {
                painter.rect_stroke(
                    highlight(*tile),
                    0.0,
                    EStroke::new(2.0, theme::ACCENT),
                    egui::StrokeKind::Inside,
                );
            }
            if let Some(p) = response.hover_pos() {
                let (x, y) = tile_at(p);
                let tile = y * columns + x;
                painter.rect_stroke(
                    highlight(tile),
                    0.0,
                    EStroke::new(1.0, Color32::WHITE),
                    egui::StrokeKind::Inside,
                );
                let mut info = format!("{tileset_key} #{tile}");
                if let Some(data) = def.data(tile) {
                    if let Some(walk) = data.walk {
                        info.push_str(&format!(" · {walk:?}").to_lowercase());
                    }
                    if let Some(surface) = data.surface {
                        info.push_str(&format!(" · {}", surface.key(&content)));
                    }
                    if !data.animation.is_empty() {
                        info.push_str(&format!(" · {} frames", data.animation.len()));
                    }
                }
                editor.status.left.push(info);
            }
        });
}

fn sheet_image(editor: &mut Editor, ui: &mut Ui, def: &TilesetDef) -> Option<crate::thumbs::Thumb> {
    let image = def.image.as_str().to_owned();
    let ctx = ui.ctx().clone();
    let project = editor.project.as_ref()?;
    let thumb = editor.form.thumbnails.image(&ctx, &project.files, &image);
    if thumb.is_none() {
        ui.label(theme::muted(format!("{image} is missing")));
    }
    thumb
}

fn terrain_sets(
    tilesets: &[(String, &'static TilesetDef)],
    used: &HashSet<String>,
) -> Vec<(String, String, Vec<String>)> {
    let mut sets: Vec<(String, String, Vec<String>)> = tilesets
        .iter()
        .flat_map(|(key, def)| {
            def.terrains
                .iter()
                .map(move |(set, terrains)| (key.clone(), set.clone(), terrains.clone()))
        })
        .collect();
    sets.sort_by_key(|(tileset, set, _)| (!used.contains(tileset), tileset.clone(), set.clone()));
    sets
}

fn terrain_chips(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    tilesets: &[(String, &'static TilesetDef)],
    used: &HashSet<String>,
) {
    let sets = terrain_sets(tilesets, used);
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    if view.terrain.set.is_none()
        && let Some((tileset, set, _)) = sets.first()
    {
        view.terrain = TerrainPick {
            tileset: Some(tileset.clone()),
            set: Some(set.clone()),
            terrain: 0,
        };
    }
    let mut picked: Option<(String, String)> = None;
    let own: Vec<&(String, String, Vec<String>)> = sets
        .iter()
        .filter(|(tileset, ..)| used.contains(tileset))
        .collect();
    let others: Vec<&(String, String, Vec<String>)> = sets
        .iter()
        .filter(|(tileset, ..)| !used.contains(tileset))
        .collect();
    for (tileset, set, _) in &own {
        let on = view.terrain.tileset.as_deref() == Some(tileset)
            && view.terrain.set.as_deref() == Some(set);
        if lens_chip(ui, &format!("{set} · {tileset}"), on).clicked() {
            picked = Some((tileset.clone(), set.clone()));
        }
    }
    if let (Some(tileset), Some(set)) = (&view.terrain.tileset, &view.terrain.set)
        && !own.iter().any(|(t, s, _)| t == tileset && s == set)
    {
        lens_chip(ui, &format!("{set} · {tileset}"), true);
    }
    if !others.is_empty() {
        let response = widgets::chip(ui, &format!("+ {}", others.len()));
        egui::Popup::from_toggle_button_response(&response)
            .id(ui.make_persistent_id((view_key, "other terrain sets")))
            .width(280.0)
            .show(|ui| {
                ui.set_min_width(280.0);
                widgets::search_box(ui, &mut view.tileset_search, "Search terrain sets", None);
                let needle = view.tileset_search.to_lowercase();
                egui::ScrollArea::vertical()
                    .max_height(260.0)
                    .show(ui, |ui| {
                        for (tileset, set, _) in others.iter().filter(|(t, s, _)| {
                            needle.is_empty()
                                || t.to_lowercase().contains(&needle)
                                || s.to_lowercase().contains(&needle)
                        }) {
                            if ui
                                .selectable_label(false, theme::mono(format!("{set} · {tileset}")))
                                .clicked()
                            {
                                picked = Some((tileset.clone(), set.clone()));
                            }
                        }
                    });
            });
    }
    if let Some((tileset, set)) = picked {
        view.terrain = TerrainPick {
            tileset: Some(tileset),
            set: Some(set),
            terrain: 0,
        };
    }
}

fn terrain_sheet(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    _content: Content,
    tilesets: &[(String, &'static TilesetDef)],
) {
    let pick = editor.views.area.views[view_key].terrain.clone();
    let (Some(tileset_key), Some(set)) = (pick.tileset.clone(), pick.set.clone()) else {
        widgets::hint(ui, "No tileset of this tile size names terrains.");
        return;
    };
    let Some(def) = tilesets
        .iter()
        .find(|(k, _)| *k == tileset_key)
        .map(|(_, d)| *d)
    else {
        return;
    };
    let Some(terrains) = def.terrains.get(&set).cloned() else {
        return;
    };
    let Some(thumb) = sheet_image(editor, ui, def) else {
        return;
    };
    let tile_px = def.tile.max(1);
    let columns = (thumb.size[0] as u32 / tile_px).max(1);
    let rows = (thumb.size[1] as u32 / tile_px).max(1);
    let legend_width = 150.0;
    let shown_tile = ((ui.available_width() - legend_width - 12.0) / columns as f32)
        .clamp(8.0, 34.0)
        .floor();
    let size = Vec2::new(columns as f32 * shown_tile, rows as f32 * shown_tile);
    let corners: BTreeMap<u32, [String; 4]> = def
        .tiles
        .iter()
        .filter_map(|(tile, data)| data.corners.get(&set).map(|c| (*tile, c.clone())))
        .collect();
    ui.horizontal_top(|ui| {
        egui::ScrollArea::vertical()
            .id_salt((view_key, "terrain sheet"))
            .auto_shrink([false, false])
            .max_width(size.x)
            .show(ui, |ui| {
                let (rect, response) = ui.allocate_exact_size(size, Sense::hover());
                let painter = ui.painter_at(rect);
                painter.image(
                    thumb.texture.id(),
                    rect,
                    ERect::from_min_max(
                        Pos2::ZERO,
                        Pos2::new(
                            (columns * tile_px) as f32 / thumb.size[0] as f32,
                            (rows * tile_px) as f32 / thumb.size[1] as f32,
                        ),
                    ),
                    Color32::WHITE,
                );
                painter.rect_filled(rect, 0.0, Color32::from_rgba_unmultiplied(0, 0, 0, 90));
                for (tile, mix) in &corners {
                    let (x, y) = (tile % columns, tile / columns);
                    let cell = ERect::from_min_size(
                        rect.min + Vec2::new(x as f32 * shown_tile, y as f32 * shown_tile),
                        Vec2::splat(shown_tile),
                    );
                    let half = shown_tile / 2.0;
                    for (corner, terrain) in mix.iter().enumerate() {
                        let Some(index) = terrains.iter().position(|t| t == terrain) else {
                            continue;
                        };
                        let offset = match corner {
                            0 => Vec2::ZERO,
                            1 => Vec2::new(half, 0.0),
                            2 => Vec2::new(0.0, half),
                            _ => Vec2::new(half, half),
                        };
                        let quarter = ERect::from_min_size(cell.min + offset, Vec2::splat(half));
                        let mut colour = terrain_colour(index);
                        colour = Color32::from_rgba_unmultiplied(
                            colour.r(),
                            colour.g(),
                            colour.b(),
                            110,
                        );
                        painter.rect_filled(quarter.shrink(0.5), 0.0, colour);
                    }
                    painter.rect_stroke(
                        cell,
                        0.0,
                        EStroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 60)),
                        egui::StrokeKind::Inside,
                    );
                }
                if let Some(p) = response.hover_pos() {
                    let x = ((p.x - rect.min.x) / shown_tile)
                        .floor()
                        .clamp(0.0, columns as f32 - 1.0) as u32;
                    let y = ((p.y - rect.min.y) / shown_tile)
                        .floor()
                        .clamp(0.0, rows as f32 - 1.0) as u32;
                    let tile = y * columns + x;
                    match corners.get(&tile) {
                        Some(mix) => editor
                            .status
                            .left
                            .push(format!("{tileset_key} #{tile} · {}", mix.join(" "))),
                        None => editor
                            .status
                            .left
                            .push(format!("{tileset_key} #{tile} · not in {set}")),
                    }
                }
            });
        ui.add_space(12.0);
        ui.vertical(|ui| {
            ui.set_width(legend_width);
            let view = editor.views.area.views.get_mut(view_key).expect("view");
            for (index, terrain) in terrains.iter().enumerate() {
                let on = view.terrain.terrain == index;
                let response = ui
                    .horizontal(|ui| {
                        let (swatch, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
                        ui.painter().rect_filled(swatch, 2.0, terrain_colour(index));
                        if on {
                            ui.painter().rect_stroke(
                                swatch,
                                2.0,
                                EStroke::new(1.5, Color32::WHITE),
                                egui::StrokeKind::Outside,
                            );
                        }
                        ui.label(if on {
                            theme::strong(terrain)
                        } else {
                            theme::muted(terrain)
                        });
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if index < 9 {
                                widgets::key_hint(ui, &(index + 1).to_string());
                            }
                        });
                    })
                    .response
                    .interact(Sense::click());
                if response.clicked() {
                    view.terrain.terrain = index;
                }
            }
            let (have, total) = super::terrain::completeness(def, &set, &terrains);
            ui.add_space(4.0);
            ui.label(theme::muted(format!("{have} of {total} mixes have a tile")).size(12.0));
        });
    });
}

pub fn terrain_colour(index: usize) -> Color32 {
    const COLOURS: [Color32; 8] = [
        Color32::from_rgb(230, 160, 70),
        Color32::from_rgb(150, 110, 90),
        Color32::from_rgb(240, 240, 220),
        Color32::from_rgb(190, 200, 210),
        Color32::from_rgb(110, 180, 110),
        Color32::from_rgb(90, 150, 230),
        Color32::from_rgb(200, 110, 200),
        Color32::from_rgb(230, 90, 90),
    ];
    COLOURS[index % COLOURS.len()]
}
