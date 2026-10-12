use std::str::FromStr;

use egui::{Align, Layout, RichText, Sense, Ui, Vec2};
use game::core::content::Content;
use game::systems::area::{self, AreaModuleKind};
use serde_json::Value;

use super::grid;
use super::placement::placement_extras;
use super::population::from_npc;
use super::preview::{clipboard_panel, drop_preview, pick_preview};
use super::scenery::{scenery_extras, scenery_rows};
use super::soundscape::soundscape_extras;
use super::{Tool, pins};
use super::{brush, placement, resize, stamp};
use crate::app::{Dialog, Editor};
use crate::forms::FormCx;
use crate::project::{Edit, Selection, row_file, row_of};
use crate::tabs::Tab;
use crate::ui::{theme, widgets};
use crate::value::RowValue;

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let view_key = super::area_view_key(key);
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        return;
    };
    let Some(area_id) = content.by_key::<area::AreaDef>(key) else {
        return;
    };
    if !editor.views.area.views.contains_key(&view_key) {
        return;
    }
    let tool = editor.views.area.views[&view_key].tool;
    let walk = editor.views.area.views[&view_key].walk_overlay;
    if editor.views.area.views[&view_key].paste.is_some() {
        clipboard_panel(editor, ui);
        return;
    }
    if let Some((table, row_key, tile)) = editor.views.area.views[&view_key].drag_hover.clone() {
        drop_preview(editor, ui, key, &table, &row_key, tile);
        return;
    }
    if editor.pick.is_some() {
        pick_preview(editor, ui);
        return;
    }
    ui.label(theme::muted(format!("area/{key}")).monospace().size(13.0));
    ui.add_space(4.0);
    match tool {
        Tool::Paint if walk => {
            walk_card(editor, ui, &view_key);
            overlays_legend(ui);
        }
        Tool::Paint | Tool::Fill | Tool::Erase | Tool::Eyedropper => {
            paint_card(editor, ui, &view_key, content, area_id);
            palette_summary(ui, content, area_id);
        }
        Tool::Terrain => {
            terrain_card(editor, ui, &view_key, content, area_id);
        }
        Tool::Stamp => {
            stamp_card(editor, ui, &view_key, content);
        }
        Tool::Module => {
            area_card(editor, ui, key, content, area_id);
            module_counts(editor, ui, &view_key, key);
        }
        Tool::Select => {
            area_card(editor, ui, key, content, area_id);
            spawn_card(editor, ui, key, content);
            ways_in(editor, ui, key);
        }
    }
}

fn tool_card(ui: &mut Ui, title: &str, body: impl FnOnce(&mut Ui)) {
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.label(theme::faint("≡"));
            ui.label(theme::strong(title).monospace());
        });
        ui.add_space(4.0);
        body(ui);
    });
}

fn paint_card(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    area_id: area::Id,
) {
    let title = match editor.views.area.views[view_key].tool {
        Tool::Fill => "Fill",
        Tool::Erase => "Erase",
        Tool::Eyedropper => "Eyedropper",
        _ => "Paint",
    };
    let layers: Vec<String> = area::load(&content, area_id)
        .grids
        .ground
        .iter()
        .map(|layer| layer.name.clone())
        .collect();
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    let picked = {
        let view = &editor.views.area.views[view_key];
        if view.pick.random.is_empty() {
            view.pick.block.iter().map(Vec::len).sum::<usize>()
        } else {
            view.pick.random.len()
        }
    };
    tool_card(ui, title, |ui| {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        widgets::kv(ui, "layer", |ui| {
            let current = layers.get(view.layer).cloned().unwrap_or_default();
            egui::ComboBox::from_id_salt((view_key, "layer"))
                .selected_text(theme::mono(current))
                .width(ui.available_width())
                .show_ui(ui, |ui| {
                    for (index, name) in layers.iter().enumerate() {
                        if ui
                            .selectable_label(view.layer == index, theme::mono(name))
                            .clicked()
                        {
                            view.layer = index;
                        }
                    }
                });
        });
        widgets::kv(ui, "brush", |ui| {
            let mut size = brush.size;
            let response = crate::forms::boxed_input(ui, Some("tiles"), |ui| {
                let mut text = format!("{size} × {size}");
                let response = ui.add(
                    egui::TextEdit::singleline(&mut text)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(f32::INFINITY),
                );
                if response.changed()
                    && let Some(first) = text
                        .split(['×', 'x', ' '])
                        .next()
                        .and_then(|n| n.trim().parse::<u32>().ok())
                {
                    size = first.clamp(1, 9);
                }
                response
            });
            if response.changed() && size != brush.size {
                brush.size = size;
                changed = true;
            }
        });
        widgets::kv(ui, "random", |ui| {
            changed |= widgets::toggle(ui, &mut brush.random).changed();
            ui.label(
                theme::muted(if brush.random {
                    format!("from the {picked} selected tiles")
                } else {
                    "the picked tile or block".to_owned()
                })
                .size(12.5),
            );
        });
        widgets::kv(ui, "flip", |ui| {
            if flip_chip(ui, "X", brush.flip_x) {
                brush.flip_x = !brush.flip_x;
                changed = true;
            }
            if flip_chip(ui, "Y", brush.flip_y) {
                brush.flip_y = !brush.flip_y;
                changed = true;
            }
        });
    });
    if changed {
        editor.settings.brush = brush;
        editor.save_settings();
    }
}

fn flip_chip(ui: &mut Ui, axis: &str, on: bool) -> bool {
    let fill = if on { theme::ACCENT } else { theme::INPUT };
    let ink = if on {
        egui::Color32::WHITE
    } else {
        theme::TEXT
    };
    let response = egui::Frame::new()
        .fill(fill)
        .stroke(egui::Stroke::new(
            1.0,
            if on { theme::ACCENT } else { theme::BORDER },
        ))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(7, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(RichText::new(axis).color(ink).size(13.0));
                widgets::key_hint(ui, axis);
            });
        })
        .response
        .interact(Sense::click());
    response.clicked()
}

fn palette_summary(ui: &mut Ui, content: Content, area_id: area::Id) {
    let grids = &area::load(&content, area_id).grids;
    let tilesets: std::collections::HashSet<&String> =
        grids.palette_keys.iter().map(|row| &row.tileset).collect();
    widgets::section(ui, "Palette of this area");
    widgets::hint(
        ui,
        &format!(
            "{} tiles from {} tilesets. Painting adds a tile; unused ones drop out on save.",
            thousands(grids.palette.len()),
            tilesets.len()
        ),
    );
}

fn thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn terrain_card(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    area_id: area::Id,
) {
    let tile_px = area::load(&content, area_id).tile;
    let layers: Vec<String> = area::load(&content, area_id)
        .grids
        .ground
        .iter()
        .map(|layer| layer.name.clone())
        .collect();
    let sets: Vec<(String, String, Vec<String>, usize, usize)> = content
        .table::<area::tileset::TilesetDef>()
        .iter()
        .filter(|(_, def)| def.tile == tile_px)
        .flat_map(|(id, def)| {
            let key = id.key(&content).to_owned();
            def.terrains.iter().map(move |(set, terrains)| {
                let (have, total) = super::terrain::completeness(def, set, terrains);
                (key.clone(), set.clone(), terrains.clone(), have, total)
            })
        })
        .collect();
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    tool_card(ui, "Terrain brush", |ui| {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        widgets::kv(ui, "layer", |ui| {
            let current = layers.get(view.layer).cloned().unwrap_or_default();
            egui::ComboBox::from_id_salt((view_key, "terrain-layer"))
                .selected_text(theme::mono(current))
                .width(ui.available_width())
                .show_ui(ui, |ui| {
                    for (index, name) in layers.iter().enumerate() {
                        if ui
                            .selectable_label(view.layer == index, theme::mono(name))
                            .clicked()
                        {
                            view.layer = index;
                        }
                    }
                });
        });
        widgets::kv(ui, "terrains", |ui| {
            let current = view
                .terrain
                .set
                .clone()
                .unwrap_or_else(|| "pick a set".to_owned());
            egui::ComboBox::from_id_salt((view_key, "terrain-set"))
                .selected_text(theme::mono(current))
                .width(ui.available_width())
                .show_ui(ui, |ui| {
                    for (tileset, set, _, have, total) in &sets {
                        let picked = view.terrain.tileset.as_deref() == Some(tileset)
                            && view.terrain.set.as_deref() == Some(set);
                        if ui
                            .selectable_label(
                                picked,
                                theme::mono(format!("{set} · {tileset} · {have} of {total}")),
                            )
                            .clicked()
                        {
                            view.terrain = brush::TerrainPick {
                                tileset: Some(tileset.clone()),
                                set: Some(set.clone()),
                                terrain: 0,
                            };
                        }
                    }
                });
        });
        if let Some((_, _, terrains, _, _)) = sets.iter().find(|(tileset, set, ..)| {
            view.terrain.tileset.as_deref() == Some(tileset)
                && view.terrain.set.as_deref() == Some(set)
        }) {
            widgets::kv(ui, "paint", |ui| {
                ui.horizontal_wrapped(|ui| {
                    for (index, terrain) in terrains.iter().enumerate() {
                        let on = view.terrain.terrain == index;
                        if widgets::chip_coloured(
                            ui,
                            terrain,
                            if on { theme::ACCENT } else { theme::INPUT },
                            if on {
                                egui::Color32::WHITE
                            } else {
                                theme::TEXT
                            },
                        )
                        .clicked()
                        {
                            view.terrain.terrain = index;
                        }
                    }
                });
            });
        }
        widgets::kv(ui, "brush", |ui| {
            crate::forms::boxed_input(
                ui,
                Some(if brush.size == 1 { "corner" } else { "corners" }),
                |ui| {
                    let mut text = brush.size.to_string();
                    let response = ui.add(
                        egui::TextEdit::singleline(&mut text)
                            .frame(egui::Frame::NONE)
                            .font(egui::TextStyle::Monospace)
                            .desired_width(f32::INFINITY),
                    );
                    if response.changed()
                        && let Ok(size) = text.trim().parse::<u32>()
                        && size != brush.size
                    {
                        brush.size = size.clamp(1, 9);
                        changed = true;
                    }
                    response
                },
            );
        });
    });
    if changed {
        editor.settings.brush = brush;
        editor.save_settings();
    }
    widgets::section(ui, "Terrains of this area's tilesets");
    let used: std::collections::HashSet<String> = area::load(&content, area_id)
        .grids
        .palette_keys
        .iter()
        .map(|row| row.tileset.clone())
        .collect();
    let mut own: Vec<&(String, String, Vec<String>, usize, usize)> = sets
        .iter()
        .filter(|(tileset, ..)| used.contains(tileset))
        .collect();
    let others = sets.len() - own.len();
    if own.is_empty() {
        ui.label(theme::muted("None of this area's tilesets names terrains.").size(12.5));
    }
    own.truncate(6);
    for (tileset, set, terrains, have, total) in own {
        ui.horizontal(|ui| {
            ui.label(theme::faint("▣").size(12.0));
            ui.label(theme::mono(set).size(13.0));
            ui.label(theme::muted(terrains.join(" · ")).size(12.5));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(
                    theme::muted(format!("{have} of {total}"))
                        .monospace()
                        .size(12.0),
                );
            });
        })
        .response
        .on_hover_text(tileset);
    }
    if others > 0 {
        ui.label(theme::faint(format!("… {others} more in other tilesets")).size(12.5));
    }
    widgets::hint(
        ui,
        "A missing mix is named where needed; that cell keeps its tile.",
    );
    let picked = {
        let view = &editor.views.area.views[view_key];
        view.terrain
            .tileset
            .clone()
            .zip(view.terrain.set.clone())
            .map(|(tileset, set)| (tileset, set, view.layer))
    };
    if let Some((tileset, set, layer)) = picked {
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui
                .button(format!("▣ Repaint with {set}"))
                .on_hover_text("Re-picks a tile for every cell of this layer painted from the set, as the set is now")
                .clicked()
            {
                repaint_layer(editor, content, area_id, &tileset, &set, layer);
            }
        });
    }
}

fn repaint_layer(
    editor: &mut Editor,
    content: Content,
    area_id: area::Id,
    tileset: &str,
    set: &str,
    layer: usize,
) {
    let Some(def) = content
        .by_key::<area::tileset::TilesetDef>(tileset)
        .map(|id| id.get(&content))
    else {
        return;
    };
    let area = area::load(&content, area_id);
    let key = area_id.key(&content).to_owned();
    let mut draft = grid::GridDraft::of(&key, area.grids);
    let mut rng = game::core::math::Rng::new(editor.frame);
    let (changed, kept) = super::terrain::repaint(&mut draft, layer, def, tileset, set, &mut rng);
    if changed == 0 {
        editor.toast(format!(
            "Nothing to repaint: no cell of this layer is painted from {set}"
        ));
        return;
    }
    let mut edit = Edit::new(format!("Repaint {changed} cells with {set} in {key}"));
    draft.write_into(&mut edit);
    editor.apply(edit);
    if kept > 0 {
        editor.toast(format!("{kept} cells kept: no tile for their mix"));
    }
}

fn walk_card(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    tool_card(ui, "Paint walkability", |ui| {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        widgets::kv(ui, "paint", |ui| {
            for (value, label, colour) in [
                (Some(false), "blocked", theme::DANGER),
                (Some(true), "walkable", theme::OK),
                (None, "clear", theme::MUTED),
            ] {
                let on = view.walk_value == value;
                if widgets::chip_coloured(
                    ui,
                    label,
                    if on { colour } else { theme::INPUT },
                    if on { egui::Color32::WHITE } else { colour },
                )
                .clicked()
                {
                    view.walk_value = value;
                }
            }
        });
        widgets::kv(ui, "brush", |ui| {
            crate::forms::boxed_input(ui, Some("tiles"), |ui| {
                let mut text = format!("{} × {}", brush.size, brush.size);
                let response = ui.add(
                    egui::TextEdit::singleline(&mut text)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(f32::INFINITY),
                );
                if response.changed()
                    && let Some(first) = text
                        .split(['×', 'x', ' '])
                        .next()
                        .and_then(|n| n.trim().parse::<u32>().ok())
                    && first != brush.size
                {
                    brush.size = first.clamp(1, 9);
                    changed = true;
                }
                response
            });
        });
        widgets::kv(ui, "overlay", |ui| {
            widgets::toggle(ui, &mut view.walk_overlay);
            widgets::key_hint_text(ui, "W", "toggles");
        });
    });
    if changed {
        editor.settings.brush = brush;
        editor.save_settings();
    }
}

fn overlays_legend(ui: &mut Ui) {
    widgets::section(ui, "Overlays");
    let swatch = |ui: &mut Ui, colour: egui::Color32, hatch: bool| {
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
        ui.painter().rect_stroke(
            rect,
            2.0,
            egui::Stroke::new(1.0, colour),
            egui::StrokeKind::Inside,
        );
        if hatch {
            super::overlays::hatch(ui.painter(), rect, colour, 4.0);
        } else {
            ui.painter().rect_filled(rect.shrink(3.0), 1.0, colour);
        }
    };
    ui.horizontal(|ui| {
        swatch(ui, theme::DANGER, true);
        ui.label(theme::muted("blocked").size(12.5));
    });
    ui.horizontal(|ui| {
        swatch(ui, theme::OK, false);
        ui.label(theme::muted("painted walkable over a blocking tile").size(12.5));
    });
    ui.horizontal(|ui| {
        swatch(ui, theme::WARN, false);
        ui.label(theme::muted("surface: a band per footstep sound").size(12.5));
    });
    ui.horizontal(|ui| {
        ui.label(
            RichText::new("– ·")
                .color(egui::Color32::from_rgb(120, 170, 255))
                .size(12.5),
        );
        ui.label(theme::muted("sort lines").size(12.5));
    });
}

fn stamp_card(editor: &mut Editor, ui: &mut Ui, view_key: &str, content: Content) {
    let stamp = editor.views.area.views[view_key].stamp.clone();
    let mut save = false;
    tool_card(ui, "Stamp", |ui| {
        let mut picked = stamp.clone().unwrap_or_default();
        let mut actions = Vec::new();
        {
            let Editor {
                project,
                form,
                shapes,
                ..
            } = editor;
            let project = project.as_ref().expect("project");
            let root = Value::Null;
            let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
            cx.owner_table = Some("area".to_owned());
            widgets::kv(ui, "blueprint", |ui| {
                if crate::picker::row(ui, &mut cx, "blueprint", &mut picked, "/stamp/blueprint")
                    && !picked.is_empty()
                {
                    let view = editor.views.area.views.get_mut(view_key).expect("view");
                    view.stamp = Some(picked.clone());
                    let stored = editor
                        .settings
                        .stamps
                        .get(&picked)
                        .cloned()
                        .unwrap_or_default();
                    view.stamp_values = Value::Object(stored.values.into_iter().collect());
                }
            });
        }
        for action in actions {
            crate::ui::inspector::act(editor, action, "area", "");
        }
        let Some(stamp) = editor.views.area.views[view_key].stamp.clone() else {
            widgets::hint(
                ui,
                "Pick a blueprint below, then click to place one or drag a line.",
            );
            return;
        };
        let footprint = {
            let values = editor.views.area.views[view_key].stamp_values.clone();
            let size = stamp::stamp_footprint(editor, content, &stamp, &values);
            (
                size.width.round().max(1.0) as u32,
                size.height.round().max(1.0) as u32,
            )
        };
        let settings = editor.settings.stamps.entry(stamp.clone()).or_default();
        widgets::kv(ui, "flip", |ui| {
            if flip_chip(ui, "X", settings.flip_x) {
                settings.flip_x = !settings.flip_x;
                save = true;
            }
            if flip_chip(ui, "Y", settings.flip_y) {
                settings.flip_y = !settings.flip_y;
                save = true;
            }
        });
        widgets::kv(ui, "spacing", |ui| {
            let label = match settings.spacing {
                None => format!("footprint · {} × {}", footprint.0, footprint.1),
                Some(n) => format!("{n} tiles"),
            };
            egui::ComboBox::from_id_salt((view_key, "spacing"))
                .selected_text(theme::mono(label))
                .width(ui.available_width())
                .show_ui(ui, |ui| {
                    if ui
                        .selectable_label(
                            settings.spacing.is_none(),
                            theme::mono(format!("footprint · {} × {}", footprint.0, footprint.1)),
                        )
                        .clicked()
                    {
                        settings.spacing = None;
                        save = true;
                    }
                    for n in [1u32, 2, 4, 8, 16, 32] {
                        if ui
                            .selectable_label(
                                settings.spacing == Some(n),
                                theme::mono(format!("{n} tiles")),
                            )
                            .clicked()
                        {
                            settings.spacing = Some(n);
                            save = true;
                        }
                    }
                });
        });
        widgets::kv(ui, "snap", |ui| {
            ui.label(theme::muted("whole tiles").size(12.5));
            widgets::key_hint_text(ui, "Alt", "for 1/16");
        });
        let variables = content
            .by_key::<area::blueprint::BlueprintDef>(&stamp)
            .map(|id| id.get(&content).variables.clone())
            .unwrap_or_default();
        if variables.is_empty() {
            widgets::kv_text(ui, "values", "none: no variables");
        } else {
            let mut values = Value::Object(settings.values.clone().into_iter().collect());
            let mut values_changed = false;
            {
                let Editor {
                    project,
                    form,
                    shapes,
                    ..
                } = editor;
                let project = project.as_ref().expect("project");
                let mut actions = Vec::new();
                let root = Value::Null;
                let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
                cx.owner_table = Some("area".to_owned());
                for (name, variable) in &variables {
                    widgets::kv(ui, name, |ui| {
                        let mut value = values.get(name).cloned().unwrap_or_else(|| {
                            variable
                                .default
                                .as_ref()
                                .and_then(|d| crate::value::json(d).ok())
                                .unwrap_or_else(|| placement::variable_template(variable))
                        });
                        if variable.ty == game::core::script::VariableType::Name {
                            ui.label(theme::muted("named per copy").size(12.5));
                            return;
                        }
                        let edited = placement::variable_field(
                            ui,
                            &mut cx,
                            variable,
                            &mut value,
                            &format!("/stamp/{stamp}/{name}"),
                        );
                        if edited || (values.get(name).is_none() && variable.default.is_none()) {
                            values[name] = value;
                            values_changed = true;
                        }
                    });
                }
            }
            if values_changed {
                let settings = editor.settings.stamps.entry(stamp.clone()).or_default();
                settings.values = values
                    .as_object()
                    .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                    .unwrap_or_default();
                save = true;
            }
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .stamp_values = values;
        }
    });
    if save {
        editor.save_settings();
    }
}

fn area_card(editor: &mut Editor, ui: &mut Ui, key: &str, content: Content, area_id: area::Id) {
    let Some(mut row) = editor.row_value("area", key) else {
        return;
    };
    let area = area::load(&content, area_id);
    let name_id = ui.id().with(("area-name", key));
    let mut draft = editor
        .form
        .drafts
        .get(&name_id)
        .cloned()
        .unwrap_or_else(|| row["name"].as_str().unwrap_or_default().to_owned());
    let mut rename = None;
    let mut menu_action: Option<&'static str> = None;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(
            ui,
            "area",
            row["name"].as_str().unwrap_or(key),
            "first-class",
            |ui| {
                if ui.button("Resize…").clicked() {
                    menu_action = Some("resize");
                    ui.close();
                }
                if ui
                    .add(egui::Button::new("Play here").shortcut_text("F6"))
                    .clicked()
                {
                    menu_action = Some("play");
                    ui.close();
                }
                if ui.button("Open as row").clicked() {
                    menu_action = Some("row");
                    ui.close();
                }
            },
        );
        ui.add_space(4.0);
        widgets::kv(ui, "name", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut draft)
                        .frame(egui::Frame::NONE)
                        .desired_width(f32::INFINITY),
                )
            });
            if response.changed() {
                editor.form.drafts.insert(name_id, draft.clone());
            }
            if crate::forms::committed(ui, &response) {
                editor.form.drafts.remove(&name_id);
                if row["name"].as_str() != Some(draft.as_str()) {
                    rename = Some(draft.clone());
                }
            }
        });
        widgets::kv(ui, "size", |ui| {
            crate::forms::boxed_input(ui, Some("tiles"), |ui| {
                ui.label(theme::mono(format!(
                    "{} × {}",
                    area.size.width, area.size.height
                )))
            });
        });
        widgets::kv(ui, "tile", |ui| {
            crate::forms::boxed_input(ui, Some("px"), |ui| {
                ui.label(theme::mono(area.tile.to_string()))
            });
        });
        widgets::kv(ui, "ground", |ui| {
            crate::forms::boxed_input(ui, None, |ui| {
                ui.label(theme::mono(format!(
                    "{} layers · under everyone",
                    area.grids.ground.len()
                )))
            });
        });
        widgets::kv_text(
            ui,
            "palette",
            format!(
                "{} tiles · kept by the editor",
                thousands(area.grids.palette.len())
            ),
        );
        widgets::kv_text(
            ui,
            "walk",
            if area.grids.walk.iter().any(Option::is_some) {
                "its own grid · painted"
            } else {
                "its own grid · nothing painted"
            },
        );
    });
    if let Some(name) = rename {
        row["name"] = Value::String(name);
        let mut edit = Edit::new(format!("Rename area {key}"));
        edit.write_json(row_file("area", key), &row);
        editor.apply(edit);
    }
    match menu_action {
        Some("resize") => editor.dialogs.push(Dialog::Resize(resize::ResizeDialog {
            area: key.to_owned(),
            width: area.size.width as u32,
            height: area.size.height as u32,
            anchor: (-1, -1),
            error: None,
        })),
        Some("play") => crate::views::play_here(editor),
        Some("row") => editor.open_tab(Tab::Row {
            table: "area".to_owned(),
            key: key.to_owned(),
        }),
        _ => {}
    }
}

fn spawn_card(editor: &mut Editor, ui: &mut Ui, key: &str, content: Content) {
    let Some((spawn_area, at)) = editor
        .project
        .as_ref()
        .and_then(|project| pins::spawn_place(&project.files))
    else {
        return;
    };
    widgets::section(ui, "The game's spawn · game.json");
    let mut picked = spawn_area.clone();
    let mut actions = Vec::new();
    let mut go = false;
    let mut pick = false;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "place", "spawn", "", |_| {});
        ui.add_space(4.0);
        {
            let Editor {
                project,
                form,
                shapes,
                ..
            } = editor;
            let project = project.as_ref().expect("project");
            let root = Value::Null;
            let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
            widgets::kv(ui, "spawn", |ui| {
                crate::picker::row(ui, &mut cx, "area", &mut picked, "/spawn/area");
            });
        }
        widgets::kv(ui, "at", |ui| {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui
                    .button("⌖ pick")
                    .on_hover_text("Click a walkable cell on the area")
                    .clicked()
                {
                    pick = true;
                }
                crate::forms::boxed_input(ui, Some("tiles"), |ui| {
                    ui.label(theme::mono(format!(
                        "{}, {}",
                        crate::forms::tiles(at.x),
                        crate::forms::tiles(at.y)
                    )))
                })
            });
        });
        if spawn_area != key && ui.button("→ Go to").clicked() {
            go = true;
        }
    });
    widgets::hint(ui, "New characters appear here. One per game.");
    if picked != spawn_area
        && let Some(target) = content.by_key::<area::AreaDef>(&picked)
    {
        let size = area::load(&content, target).size;
        let mut game = editor
            .project
            .as_ref()
            .and_then(|p| p.files.json_owned("game.json"))
            .unwrap_or(Value::Null);
        game["spawn"] = pins::place_json(
            &picked,
            game::core::math::Pos::new(
                (size.width / 2.0).floor() + 0.5,
                (size.height / 2.0).floor() + 0.5,
            ),
        );
        let mut edit = Edit::new(format!("Move the spawn to {picked}"));
        edit.write_json("game.json", &game);
        editor.apply(edit);
    }
    for action in actions {
        crate::ui::inspector::act(editor, action, "area", key);
    }
    if pick {
        editor.pick = Some(crate::app::PickRequest {
            what: crate::app::PickWhat::Place {
                file: "game.json".to_owned(),
                pointer: "/spawn".to_owned(),
            },
            area: Some(key.to_owned()),
        });
        editor.toast("Click a walkable cell to put the spawn there (Alt-click for any point)");
    }
    if go {
        super::open_area_at(editor, &spawn_area, Some(at), None);
    }
}

fn ways_in(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let arrivals: Vec<pins::Arrival> = pins::arrivals(editor, key)
        .into_iter()
        .filter(|arrival| !arrival.spawn)
        .collect();
    let name = editor
        .row_value("area", key)
        .and_then(|row| row["name"].as_str().map(str::to_owned))
        .unwrap_or_else(|| key.to_owned());
    widgets::section_count(ui, &format!("Ways into {name}"), arrivals.len());
    let mut open: Option<pins::Arrival> = None;
    for arrival in arrivals.iter().take(3) {
        let (owner, spot) = arrival_names(editor, arrival);
        let response = ui
            .horizontal(|ui| {
                widgets::badge(ui, "place");
                ui.label(theme::mono(&owner).size(13.0).color(theme::CODE));
                if !spot.is_empty() {
                    ui.label(theme::faint("·"));
                    ui.label(theme::mono(&spot).size(13.0));
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.label(
                        theme::muted(format!(
                            "{}, {}",
                            crate::forms::tiles(arrival.at.x),
                            crate::forms::tiles(arrival.at.y)
                        ))
                        .monospace()
                        .size(12.0),
                    );
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            open = Some(arrival.clone());
        }
    }
    if arrivals.len() > 3 {
        ui.label(
            theme::faint(format!("… {} more", arrivals.len() - 3))
                .monospace()
                .size(12.5),
        );
    }
    widgets::hint(
        ui,
        &format!("The dead come back where they last entered {name} (C6)."),
    );
    if let Some(arrival) = open {
        pins::open_pin(
            editor,
            pins::PinHit::Place {
                file: arrival.file,
                pointer: arrival.pointer,
            },
        );
    }
}

fn arrival_names(editor: &Editor, arrival: &pins::Arrival) -> (String, String) {
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
        })
        .unwrap_or_default();
    (owner, spot)
}

fn module_counts(editor: &mut Editor, ui: &mut Ui, view_key: &str, key: &str) {
    let Some(row) = editor.row_value("area", key) else {
        return;
    };
    let mut counts: Vec<(String, usize)> = Vec::new();
    for module in row["modules"].as_array().into_iter().flatten() {
        let kind = module.kind_or("module").to_owned();
        match counts.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, n)) => *n += 1,
            None => counts.push((kind, 1)),
        }
    }
    counts.sort_by_key(|(kind, _)| {
        AreaModuleKind::from_str(kind).map_or(usize::MAX, |kind| kind as usize)
    });
    let total: usize = counts.iter().map(|(_, n)| n).sum();
    widgets::section_count(ui, "Modules", total);
    for (kind, count) in &counts {
        ui.horizontal(|ui| {
            widgets::badge(ui, kind);
            ui.label(theme::mono(kind).size(13.0));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(theme::muted(count.to_string()).monospace().size(12.0));
            });
        });
    }
    ui.add_space(4.0);
    let response = egui::Frame::new()
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(8, 4))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(theme::strong("+ Add module"));
                widgets::key_hint(ui, "M");
            });
        })
        .response
        .interact(Sense::click());
    if response.clicked() {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        view.tool = Tool::Module;
        editor.toast("Click the map to add a module there, or right-click anywhere");
    }
}

pub fn show_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    let Some(area_key) = selection.keys.first().cloned() else {
        return;
    };
    let Some(mut row) = editor.row_value("area", &area_key) else {
        return;
    };
    let indices: Vec<usize> = selection
        .parts
        .iter()
        .filter_map(|part| part.strip_prefix("/modules/")?.parse().ok())
        .collect();
    if indices.is_empty() {
        return;
    }
    let Some(items) = editor.shapes.modules_of("area").cloned() else {
        return;
    };
    let shape = editor
        .shapes
        .table("area")
        .map(|t| t.shape.clone())
        .unwrap_or(Value::Null);
    let variants = match crate::schema::kind(&shape, &items) {
        crate::schema::Kind::Union(variants) => variants,
        _ => Vec::new(),
    };
    let mut changed = false;
    let mut actions = Vec::new();
    let mut extras: Vec<placement::Extra> = Vec::new();
    let mut deferred: Vec<super::Deferred> = Vec::new();
    let label;
    {
        let Editor {
            project,
            form,
            shapes,
            views,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx::new(project, &shape, shapes, form, &mut actions);
        cx.owner_table = Some("area".to_owned());
        cx.owner_key = Some(area_key.clone());
        if indices.len() == 1 {
            let index = indices[0];
            let view = views.area.views.get_mut(&super::area_view_key(&area_key));
            label = super::shapes::label(&row["modules"][index]);
            changed = module_inspector(
                ui,
                &mut cx,
                view,
                &area_key,
                &mut row,
                index,
                &variants,
                &mut extras,
                &mut deferred,
            );
        } else {
            label = format!("{} modules", indices.len());
            ui.label(
                theme::muted(format!("area/{area_key} › {} modules", indices.len()))
                    .monospace()
                    .size(13.0),
            );
            ui.add_space(4.0);
            widgets::card_frame(true).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(
                    ui,
                    "modules",
                    &format!("{} modules", indices.len()),
                    "",
                    |ui| {
                        if ui.button("Copy as JSON").clicked() {
                            deferred.push(super::Deferred::Copy);
                            ui.close();
                        }
                        if ui.button("Duplicate").clicked() {
                            deferred.push(super::Deferred::Duplicate);
                            ui.close();
                        }
                        if ui
                            .add(egui::Button::new("Remove all").shortcut_text("Del"))
                            .clicked()
                        {
                            extras.push(placement::Extra::RemoveAll);
                            ui.close();
                        }
                    },
                );
                ui.add_space(4.0);
                changed |= placement::shared_values(ui, &mut cx, &mut row, &indices);
            });
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                if ui.button("⧉ Make blueprint…").clicked() {
                    extras.push(placement::Extra::MakeBlueprint);
                }
            });
            widgets::key_hint_text(ui, "Ctrl Alt B", "makes a blueprint of the selection");
        }
    }
    if changed {
        let mut edit = Edit::new(format!("Edit {label} of {area_key}"));
        edit.write_json(row_file("area", &area_key), &row);
        editor.apply(edit);
    }
    for action in actions {
        crate::ui::inspector::act(editor, action, "area", &area_key);
    }
    for extra in extras {
        placement::act(editor, extra, &area_key, &indices);
    }
    if let Some(view) = editor
        .views
        .area
        .views
        .get_mut(&super::area_view_key(&area_key))
    {
        view.deferred.extend(deferred);
    }
    if editor.pick.is_some() {
        ui.add_space(6.0);
        pick_preview(editor, ui);
    }
    if editor
        .views
        .area
        .views
        .contains_key(&super::area_view_key(&area_key))
    {
        ui.add_space(8.0);
        module_counts(editor, ui, &super::area_view_key(&area_key), &area_key);
    }
}

#[allow(clippy::too_many_arguments)]
fn module_inspector(
    ui: &mut Ui,
    cx: &mut FormCx,
    view: Option<&mut super::ViewState>,
    area_key: &str,
    row: &mut Value,
    index: usize,
    variants: &[crate::schema::Variant],
    extras: &mut Vec<placement::Extra>,
    deferred: &mut Vec<super::Deferred>,
) -> bool {
    let path = format!("/modules/{index}");
    let kind = row["modules"][index]["type"]
        .as_str()
        .unwrap_or("module")
        .to_owned();
    let module_kind = row["modules"][index].module_kind();
    let shown_kind = kind.replace('_', " ");
    ui.label(
        theme::muted(format!("area/{area_key} › {shown_kind}"))
            .monospace()
            .size(13.0),
    );
    ui.add_space(4.0);
    let mut changed = false;
    let content = cx.content;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, &kind, &shown_kind, "", |ui| {
            if ui.button("Copy as JSON").clicked() {
                deferred.push(super::Deferred::Copy);
                ui.close();
            }
            if ui.button("Duplicate").clicked() {
                deferred.push(super::Deferred::Duplicate);
                ui.close();
            }
            ui.separator();
            if ui
                .add(egui::Button::new("Remove").shortcut_text("Del"))
                .clicked()
            {
                extras.push(placement::Extra::RemoveAll);
                ui.close();
            }
        });
        ui.add_space(4.0);
        let module = &mut row["modules"][index];
        match crate::schema::variant_of(variants, module) {
            Some(variant) => {
                let schema = form_schema(variant, module_kind);
                changed |= crate::forms::object(ui, cx, &schema, module, &path).is_some();
            }
            None => {
                changed |= crate::forms::raw_json(ui, cx, module, &path).is_some();
            }
        }
        match module_kind {
            Some(AreaModuleKind::Scenery) => changed |= scenery_rows(ui, module, &path),
            Some(AreaModuleKind::Population) => {
                if let Some(view) = view {
                    widgets::kv(ui, "preview", |ui| {
                        let mut shown = !view.population_hidden.contains(&index);
                        if widgets::toggle(ui, &mut shown).changed() {
                            if shown {
                                view.population_hidden.remove(&index);
                            } else {
                                view.population_hidden.insert(index);
                            }
                        }
                        if ui.button("↻ Re-roll").clicked() {
                            let seed = view.population_seed.entry(index).or_default();
                            *seed = seed.wrapping_add(1);
                        }
                    });
                }
            }
            _ => {}
        }
    });
    let module = &mut row["modules"][index];
    match module_kind {
        Some(AreaModuleKind::Scenery) => scenery_extras(ui, cx, module, extras, deferred, index),
        Some(AreaModuleKind::Blueprint) => {
            if let Some(blueprint) = module["blueprint"].as_str().map(str::to_owned)
                && content
                    .and_then(|c| {
                        c.by_key::<area::blueprint::BlueprintDef>(&blueprint)
                            .map(|id| !id.get(&c).variables.is_empty())
                    })
                    .unwrap_or(false)
            {
                widgets::section(ui, &format!("Values · {blueprint}"));
                widgets::card_frame(false).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    widgets::card_header(ui, "values", "values", "", |_| {});
                    ui.add_space(4.0);
                    changed |= placement::placement_card(ui, cx, content, module, &path, extras);
                });
            }
            placement_extras(ui, cx, module, extras, deferred, index);
        }
        Some(AreaModuleKind::Population | AreaModuleKind::Resident) => from_npc(ui, cx, module),
        Some(AreaModuleKind::Object) => {
            ui.add_space(4.0);
            changed |= crate::ui::inspector::scripts::script_cards(
                ui, cx, "area", module, "scripts", &path,
            )
            .is_some();
            object_extras(ui, module, extras, deferred, index);
        }
        Some(AreaModuleKind::Soundscape) => changed |= soundscape_extras(ui, cx, module, &path),
        _ => {}
    }
    changed
}

pub(super) fn form_schema(variant: &crate::schema::Variant, kind: Option<AreaModuleKind>) -> Value {
    let mut schema = crate::ui::inspector::without_field(variant.schema, "type");
    for field in hidden_fields(kind) {
        schema = crate::ui::inspector::without_field(&schema, field);
    }
    schema
}

fn hidden_fields(kind: Option<AreaModuleKind>) -> &'static [&'static str] {
    match kind {
        Some(AreaModuleKind::Scenery) => &["tiles", "sort", "blocks"],
        Some(AreaModuleKind::Blueprint) => &["values"],
        Some(AreaModuleKind::Object) => &["scripts"],
        Some(AreaModuleKind::Soundscape) => &["channels"],
        _ => &[],
    }
}

fn object_extras(
    ui: &mut Ui,
    module: &Value,
    extras: &mut Vec<placement::Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let destinations = placement::warp_destinations(module);
    if destinations.is_empty() {
        return;
    }
    ui.add_space(4.0);
    ui.horizontal_wrapped(|ui| {
        for (area, at) in &destinations {
            if ui.button("→ Go to destination").on_hover_text(format!("{area} · {}, {}", crate::forms::tiles(at.x), crate::forms::tiles(at.y))).clicked() {
                extras.push(placement::Extra::GoTo(area.clone(), *at));
            }
        }
        if ui.button("← Return door").on_hover_text("An object with script/warp leading back here, on the nearest walkable cell outside the destination").clicked() {
            deferred.push(super::Deferred::ReturnDoor(index));
        }
    });
}
