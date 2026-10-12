use egui::{Align, Layout, RichText, Sense, Ui, Vec2};
use game::core::content::Content;
use game::core::tiling::TileRect;
use game::systems::area;
use serde_json::Value;

use super::{Tool, blueprint, pins, tools};
use crate::app::{Dialog, Editor};
use crate::forms::FormCx;
use crate::project::{Edit, Selection, row_file, row_of};
use crate::tabs::Tab;
use crate::ui::{theme, widgets};

/// The inspector of an area tab with nothing placed selected: the tool's card, then the area
/// itself, the game's spawn and the ways in, or the module counts when adding.
pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let view_key = format!("area:{key}");
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
        grids.palette_keys.iter().map(|(set, _, _)| set).collect();
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
                            view.terrain = tools::TerrainPick {
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
        .map(|(set, _, _)| set.clone())
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
            super::hatch(ui.painter(), rect, colour, 4.0);
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
            let mut cx = FormCx {
                root: &root,
                content: project.content,
                files: &project.files,
                usages: &project.usages,
                shapes,
                state: form,
                actions: &mut actions,
                speaker: None,
                owner_table: Some("area".to_owned()),
                owner_key: None,
            };
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
            let size = blueprint::stamp_footprint(editor, content, &stamp, &values);
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
                let mut cx = FormCx {
                    root: &root,
                    content: project.content,
                    files: &project.files,
                    usages: &project.usages,
                    shapes,
                    state: form,
                    actions: &mut actions,
                    speaker: None,
                    owner_table: Some("area".to_owned()),
                    owner_key: None,
                };
                for (name, variable) in &variables {
                    widgets::kv(ui, name, |ui| {
                        let mut value = values.get(name).cloned().unwrap_or_else(|| {
                            variable
                                .default
                                .as_ref()
                                .and_then(|d| serde_json::to_value(d).ok())
                                .unwrap_or_else(|| blueprint::variable_template(variable))
                        });
                        if variable.ty == game::core::script::VariableType::Name {
                            ui.label(theme::muted("named per copy").size(12.5));
                            return;
                        }
                        let edited = blueprint::variable_field(
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

/// The area's own card: name, and the map as the files describe it.
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
        Some("resize") => editor.dialogs.push(Dialog::Resize(tools::ResizeDialog {
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

/// The game's spawn, which lives once in game.json, with a pick on this area.
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
            let mut cx = FormCx {
                root: &root,
                content: project.content,
                files: &project.files,
                usages: &project.usages,
                shapes,
                state: form,
                actions: &mut actions,
                speaker: None,
                owner_table: None,
                owner_key: None,
            };
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
            .and_then(|p| p.files.json("game.json"))
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

/// Every place leading into the area, from the scripts' May do and the test starts.
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

/// Who leads in: the row and, inside it, the named module the place belongs to.
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

/// What the area holds, by module kind, and the add button of the module tool.
fn module_counts(editor: &mut Editor, ui: &mut Ui, view_key: &str, key: &str) {
    let Some(row) = editor.row_value("area", key) else {
        return;
    };
    let mut counts: Vec<(String, usize)> = Vec::new();
    for module in row["modules"].as_array().into_iter().flatten() {
        let kind = module["type"].as_str().unwrap_or("module").to_owned();
        match counts.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, n)) => *n += 1,
            None => counts.push((kind, 1)),
        }
    }
    let order = [
        "object",
        "safe_zone",
        "soundscape",
        "population",
        "resident",
        "blueprint",
        "scenery",
        "inline_script",
        "shared_script",
    ];
    counts.sort_by_key(|(kind, _)| order.iter().position(|k| k == kind).unwrap_or(order.len()));
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

/// The inspector of placed modules: one module as its card with what its kind adds, or the
/// shared values of several.
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
    let mut extras: Vec<blueprint::Extra> = Vec::new();
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
        let mut cx = FormCx {
            root: &shape,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: None,
            owner_table: Some("area".to_owned()),
            owner_key: Some(area_key.clone()),
        };
        if indices.len() == 1 {
            let index = indices[0];
            let view = views.area.views.get_mut(&format!("area:{area_key}"));
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
                            extras.push(blueprint::Extra::RemoveAll);
                            ui.close();
                        }
                    },
                );
                ui.add_space(4.0);
                changed |= blueprint::shared_values(ui, &mut cx, &mut row, &indices);
            });
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                if ui.button("⧉ Make blueprint…").clicked() {
                    extras.push(blueprint::Extra::MakeBlueprint);
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
        blueprint::act(editor, extra, &area_key, &indices);
    }
    if let Some(view) = editor.views.area.views.get_mut(&format!("area:{area_key}")) {
        view.deferred.extend(deferred);
    }
    if editor.pick.is_some() {
        ui.add_space(6.0);
        pick_preview(editor, ui);
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
    extras: &mut Vec<blueprint::Extra>,
    deferred: &mut Vec<super::Deferred>,
) -> bool {
    let path = format!("/modules/{index}");
    let kind = row["modules"][index]["type"]
        .as_str()
        .unwrap_or("module")
        .to_owned();
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
                extras.push(blueprint::Extra::RemoveAll);
                ui.close();
            }
        });
        ui.add_space(4.0);
        let module = &mut row["modules"][index];
        match crate::schema::variant_of(variants, module) {
            Some(variant) => {
                let mut schema = crate::ui::inspector::without_field(variant.schema, "type");
                for field in hidden_fields(&kind) {
                    schema = crate::ui::inspector::without_field(&schema, field);
                }
                changed |= crate::forms::object(ui, cx, &schema, module, &path).is_some();
            }
            None => {
                changed |= crate::forms::raw_json(ui, cx, module, &path).is_some();
            }
        }
        match kind.as_str() {
            "scenery" => changed |= scenery_rows(ui, module, &path),
            "population" => {
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
    match kind.as_str() {
        "scenery" => scenery_extras(ui, cx, module, extras, deferred, index),
        "blueprint" => {
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
                    changed |= blueprint::placement_card(ui, cx, content, module, &path, extras);
                });
            }
            placement_extras(ui, cx, module, extras, deferred, index);
        }
        "population" | "resident" => from_npc(ui, cx, module),
        "object" => {
            ui.add_space(4.0);
            changed |= crate::ui::inspector::script_cards(ui, cx, "area", module, "scripts", &path)
                .is_some();
            object_extras(ui, module, extras, deferred, index);
        }
        "soundscape" => changed |= soundscape_extras(ui, cx, module, &path),
        _ => {}
    }
    changed
}

/// Fields a kind shows in its own way instead of as plain form fields.
fn hidden_fields(kind: &str) -> &'static [&'static str] {
    match kind {
        "scenery" => &["tiles", "sort", "blocks"],
        "blueprint" => &["values"],
        "object" => &["scripts"],
        "soundscape" => &["channels"],
        _ => &[],
    }
}

fn scenery_rows(ui: &mut Ui, module: &mut Value, path: &str) -> bool {
    let rows = module["tiles"].as_array().cloned().unwrap_or_default();
    let height = rows.len();
    let width = rows
        .iter()
        .map(|r| r.as_array().map_or(0, Vec::len))
        .max()
        .unwrap_or(0);
    let count: usize = rows
        .iter()
        .map(|r| {
            r.as_array()
                .map_or(0, |cells| cells.iter().filter(|c| !c.is_null()).count())
        })
        .sum();
    widgets::kv_text(ui, "size", format!("{width} × {height} tiles · {count}"));
    let mut changed = false;
    widgets::kv(ui, "sort", |ui| {
        let current = module["sort"].as_f64();
        let id = ui.id().with((path, "sort"));
        let mut draft = ui
            .ctx()
            .data(|d| d.get_temp::<String>(id))
            .unwrap_or_else(|| {
                current
                    .map(crate::forms::trim_number)
                    .unwrap_or_else(|| "flat".to_owned())
            });
        let response = crate::forms::boxed_input(
            ui,
            Some(&format!("tiles from the top · of {height}")),
            |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut draft)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(48.0),
                )
            },
        );
        if response.changed() {
            ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
        }
        if crate::forms::committed(ui, &response) {
            ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
            let parsed = draft.trim().parse::<f64>().ok();
            if parsed != current {
                match parsed {
                    Some(sort) => module["sort"] = Value::from(sort),
                    None => {
                        module.as_object_mut().map(|m| m.remove("sort"));
                    }
                }
                changed = true;
            }
        }
    });
    let blocks = module["blocks"].as_array().map_or(0, Vec::len);
    widgets::kv_text(
        ui,
        "blocks",
        if blocks == 0 {
            "none of its own".to_owned()
        } else {
            format!("{blocks} cells of its own")
        },
    );
    changed
}

fn scenery_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &Value,
    extras: &mut Vec<blueprint::Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let under = cx
        .owner_key
        .as_deref()
        .and_then(|key| blocked_under(cx, key, module))
        .unwrap_or(0);
    ui.add_space(4.0);
    if under > 0 {
        widgets::hint(
            ui,
            &format!(
                "{under} cells under it are blocked on the walk grid and stay put if it moves."
            ),
        );
        if ui
            .button(format!("⧉ Make the {under} blocked cells its own"))
            .clicked()
        {
            deferred.push(super::Deferred::AdoptBlocks(index));
        }
    } else {
        widgets::hint(ui, "Nothing under it is blocked on the walk grid.");
    }
    ui.horizontal(|ui| {
        if ui.button("▣ Make blueprint…").clicked() {
            extras.push(blueprint::Extra::MakeBlueprint);
        }
        if ui.button("Split into tiles").clicked() {
            deferred.push(super::Deferred::Split(index));
        }
    });
}

/// Walk-grid cells painted blocked inside the scenery's footprint.
fn blocked_under(cx: &FormCx, area_key: &str, module: &Value) -> Option<usize> {
    let content = cx.content?;
    let area_id = content.by_key::<area::AreaDef>(area_key)?;
    let grids = area::load(&content, area_id).grids;
    let rect = super::shapes::scenery_rect(module)?;
    let size = grids.size;
    let mut count = 0;
    for cell in rect.tiles() {
        if cell.x < 0 || cell.y < 0 || cell.x >= size.width as i32 || cell.y >= size.height as i32 {
            continue;
        }
        if grids.walk[cell.y as usize * size.width as usize + cell.x as usize] == Some(false) {
            count += 1;
        }
    }
    Some(count)
}

fn placement_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &Value,
    extras: &mut Vec<blueprint::Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let Some(key) = module["blueprint"].as_str().map(str::to_owned) else {
        return;
    };
    ui.add_space(4.0);
    if let Some(content) = cx.content {
        widgets::hint(ui, &blueprint::placement_count(content, &key));
    }
    ui.horizontal_wrapped(|ui| {
        if ui.button("▣ Edit blueprint").clicked() {
            extras.push(blueprint::Extra::OpenBlueprint(key.clone()));
        }
        if ui.button("Unpack into scenery").clicked() {
            deferred.push(super::Deferred::Unpack(index));
        }
        if ui.button("Replace with…").clicked() {
            deferred.push(super::Deferred::Replace(index));
        }
    });
    widgets::key_hint_text(ui, "Enter", "edits the blueprint in place");
}

fn object_extras(
    ui: &mut Ui,
    module: &Value,
    extras: &mut Vec<blueprint::Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let destinations = blueprint::warp_destinations(module);
    if destinations.is_empty() {
        return;
    }
    ui.add_space(4.0);
    ui.horizontal_wrapped(|ui| {
        for (area, at) in &destinations {
            if ui.button("→ Go to destination").on_hover_text(format!("{area} · {}, {}", crate::forms::tiles(at.x), crate::forms::tiles(at.y))).clicked() {
                extras.push(blueprint::Extra::GoTo(area.clone(), *at));
            }
        }
        if ui.button("← Return door").on_hover_text("An object with script/warp leading back here, on the nearest walkable cell outside the destination").clicked() {
            deferred.push(super::Deferred::ReturnDoor(index));
        }
    });
}

/// What a population or resident takes from its npc row, read-only, with the way there.
fn from_npc(ui: &mut Ui, cx: &mut FormCx, module: &Value) {
    let Some(npc) = module["npc"].as_str().map(str::to_owned) else {
        return;
    };
    let Some(row) = cx.files.json(&row_file("npc", &npc)) else {
        return;
    };
    widgets::section(ui, &format!("From npc/{npc}"));
    let modules = row["modules"].as_array().cloned().unwrap_or_default();
    let respawn = modules
        .iter()
        .find(|m| m["type"] == "respawn")
        .and_then(|m| m["after"].as_f64());
    widgets::kv_text(
        ui,
        "respawn",
        respawn.map_or("never".to_owned(), |after| {
            format!("{} s", crate::forms::trim_number(after))
        }),
    );
    let scripts: Vec<String> = modules
        .iter()
        .filter(|m| m["type"].as_str().is_some_and(|t| t.ends_with("_script")))
        .map(|m| match m["script"].as_str() {
            Some(script) => {
                let values: Vec<String> = m["values"]
                    .as_object()
                    .into_iter()
                    .flat_map(|v| v.iter())
                    .map(|(k, v)| {
                        format!(
                            "{k} {}",
                            v.as_f64()
                                .map(crate::forms::trim_number)
                                .unwrap_or_else(|| v
                                    .as_str()
                                    .map(str::to_owned)
                                    .unwrap_or_else(|| v.to_string()))
                        )
                    })
                    .collect();
                if values.is_empty() {
                    script.to_owned()
                } else {
                    format!("{script} · {}", values.join(" · "))
                }
            }
            None => "inline script".to_owned(),
        })
        .collect();
    widgets::kv_text(
        ui,
        "script",
        if scripts.is_empty() {
            "none".to_owned()
        } else {
            scripts.join(", ")
        },
    );
    if let Some(health) = row["stats"]["health"]
        .as_f64()
        .or(row["stats"]["Health"].as_f64())
    {
        widgets::kv_text(ui, "health", crate::forms::trim_number(health));
    }
    ui.add_space(4.0);
    if widgets::chip_coloured(ui, &format!("npc/ {npc} →"), theme::INPUT, theme::CODE).clicked() {
        cx.actions.push(crate::forms::FormAction::OpenRow {
            table: "npc".to_owned(),
            key: npc.clone(),
        });
    }
}

/// The soundscape's channels as rows, then how each file sits against the mix targets at the
/// default settings.
fn soundscape_extras(ui: &mut Ui, cx: &mut FormCx, module: &mut Value, path: &str) -> bool {
    let mut changed = false;
    widgets::section(ui, "Channels");
    if !module["channels"].is_array() {
        module["channels"] = Value::Array(Vec::new());
    }
    let count = module["channels"].as_array().map_or(0, Vec::len);
    let mut remove = None;
    for index in 0..count {
        let channel_path = format!("{path}/channels/{index}");
        let channel = &mut module["channels"][index];
        let number = channel["channel"].as_u64().unwrap_or(0);
        widgets::kv(ui, &format!("channel {number}"), |ui| {
            let mut file = channel["file"].as_str().unwrap_or_default().to_owned();
            if crate::picker::asset(ui, cx, &mut file, &format!("{channel_path}/file")) {
                channel["file"] = Value::String(file);
                changed = true;
            }
        });
        widgets::kv(ui, "volume", |ui| {
            ui.scope(|ui| {
                ui.set_max_width(96.0);
                let mut volume = channel.get("volume").cloned().unwrap_or(Value::from(1.0));
                if crate::forms::value(
                    ui,
                    cx,
                    &serde_json::json!({ "type": "number", "minimum": 0.0, "maximum": 1.0 }),
                    &mut volume,
                    &format!("{channel_path}/volume"),
                )
                .is_some()
                {
                    channel["volume"] = volume;
                    changed = true;
                }
            });
            ui.scope(|ui| {
                ui.set_max_width(72.0);
                let mut renumber = Value::from(number);
                if crate::forms::value(
                    ui,
                    cx,
                    &serde_json::json!({ "type": "integer", "minimum": 1, "x-unit": "ch" }),
                    &mut renumber,
                    &format!("{channel_path}/channel"),
                )
                .is_some()
                {
                    channel["channel"] = renumber;
                    changed = true;
                }
            });
            if ui
                .add(egui::Label::new(theme::faint("✕").size(11.0)).sense(Sense::click()))
                .on_hover_text("Remove the channel")
                .clicked()
            {
                remove = Some(index);
            }
        });
    }
    if let Some(index) = remove {
        module["channels"]
            .as_array_mut()
            .expect("channels")
            .remove(index);
        changed = true;
    }
    if ui.button("+ channel").clicked() {
        let next = module["channels"].as_array().map_or(1, |list| {
            list.iter()
                .filter_map(|c| c["channel"].as_u64())
                .max()
                .unwrap_or(0)
                + 1
        });
        module["channels"]
            .as_array_mut()
            .expect("channels")
            .push(serde_json::json!({ "channel": next, "file": "" }));
        changed = true;
    }
    let channels = module["channels"].as_array().cloned().unwrap_or_default();
    if channels.is_empty() {
        return changed;
    }
    widgets::section(ui, "At the default mix");
    for channel in &channels {
        let Some(file) = channel["file"].as_str() else {
            continue;
        };
        let number = channel["channel"].as_u64().unwrap_or(0);
        let volume = channel["volume"].as_f64().unwrap_or(1.0);
        let loudness = cx
            .files
            .get(&format!("assets/{file}"))
            .cloned()
            .and_then(|bytes| crate::views::sound::measure(&bytes));
        ui.label(theme::mono(format!("{number} · {file}")).size(12.5));
        let Some(loudness) = loudness else {
            widgets::hint(ui, "not measured: the file does not decode");
            continue;
        };
        let effective = loudness.integrated + 20.0 * volume.max(1e-6).log10();
        let (low, high, band) = if number == 1 {
            (-33.0, -27.0, "music band -33 to -27 LUFS")
        } else {
            (-37.0, -33.0, "ambience band -37 to -33 LUFS")
        };
        meter(
            ui,
            "loudness",
            effective,
            -60.0,
            0.0,
            Some((low, high)),
            &format!("{effective:.1} LUFS"),
        );
        ui.label(theme::faint(band).size(11.5));
        meter(
            ui,
            "true peak",
            loudness.peak_dbfs,
            -60.0,
            0.0,
            Some((-60.0, -12.0)),
            &format!("{:.1} dBFS", loudness.peak_dbfs),
        );
        ui.label(theme::faint("limit -12 dBFS").size(11.5));
        ui.add_space(4.0);
    }
    changed
}

fn meter(
    ui: &mut Ui,
    name: &str,
    value: f64,
    min: f64,
    max: f64,
    band: Option<(f64, f64)>,
    text: &str,
) {
    ui.horizontal(|ui| {
        ui.label(theme::muted(name).size(12.5));
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.label(theme::strong(text).monospace().size(12.5));
        });
    });
    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 8.0), Sense::hover());
    let painter = ui.painter();
    painter.rect_filled(rect, 2.0, theme::INPUT);
    let at = |v: f64| rect.min.x + ((v - min) / (max - min)).clamp(0.0, 1.0) as f32 * rect.width();
    let in_band = band.is_none_or(|(low, high)| value >= low && value <= high);
    if let Some((low, high)) = band {
        painter.rect_filled(
            egui::Rect::from_min_max(
                egui::pos2(at(low), rect.min.y),
                egui::pos2(at(high), rect.max.y),
            ),
            2.0,
            theme::OK.gamma_multiply(0.35),
        );
    }
    painter.rect_filled(
        egui::Rect::from_min_max(rect.min, egui::pos2(at(value), rect.max.y)),
        2.0,
        if in_band { theme::OK } else { theme::WARN },
    );
    painter.line_segment(
        [
            egui::pos2(at(value), rect.min.y - 2.0),
            egui::pos2(at(value), rect.max.y + 2.0),
        ],
        egui::Stroke::new(2.0, egui::Color32::WHITE),
    );
}

/// Moves the walk-grid cells blocked under a scenery into its own blocks, one step.
pub fn adopt_blocks(editor: &mut Editor, frame: &super::Frame, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = super::shapes::scenery_rect(module) else {
        return;
    };
    let Some(at) = super::shapes::pos_of(&module["at"]) else {
        return;
    };
    let grids = frame.area().grids;
    let mut draft = super::grid::GridDraft::of(&frame.area_key, grids);
    let mut adopted: Vec<Value> = module["blocks"].as_array().cloned().unwrap_or_default();
    let mut count = 0;
    for cell in rect.tiles() {
        if draft.walk_at(cell) == Some(false) {
            draft.set_walk(cell, None);
            adopted.push(serde_json::json!([
                cell.x - at.x.round() as i32,
                cell.y - at.y.round() as i32
            ]));
            count += 1;
        }
    }
    if count == 0 {
        editor.toast("Nothing under the scenery is blocked on the walk grid");
        return;
    }
    let mut modules = frame.modules.clone();
    modules[index]["blocks"] = Value::Array(adopted);
    let Some(mut row) = editor.row_value("area", &frame.area_key) else {
        return;
    };
    row["modules"] = Value::Array(modules);
    let mut edit = Edit::new(format!(
        "Give {count} blocked cells to the scenery in {}",
        frame.area_key
    ));
    edit.write_json(row_file("area", &frame.area_key), &row);
    draft.write_into(&mut edit);
    editor.apply(edit);
}

/// Where a population's npcs would stand: the count drawn from the wild walk cells inside its
/// rect, as the server draws them, from a seed the re-roll advances.
pub fn population_places(
    area: &area::Area,
    module: &Value,
    seed: u64,
) -> Vec<game::core::math::Pos<game::core::tiling::Tiles>> {
    let count = module["count"].as_u64().unwrap_or(0) as usize;
    let nodes: Vec<game::core::math::Pos<game::core::tiling::Tiles>> =
        match super::shapes::rect_of(&module["roams"]) {
            Some(bounds) => area
                .wild_grid
                .nodes()
                .iter()
                .copied()
                .filter(|p| bounds.contains(*p))
                .collect(),
            None => area.wild_grid.nodes().to_vec(),
        };
    if nodes.is_empty() {
        return Vec::new();
    }
    let mut rng = game::core::math::Rng::new(
        seed.wrapping_mul(0x9E37_79B9_7F4A_7C15)
            .wrapping_add(module["count"].as_u64().unwrap_or(0)),
    );
    (0..count)
        .map(|_| nodes[rng.rand_range(0..nodes.len() as u32) as usize])
        .collect()
}

/// An npc's idle frame facing south, from its model's sheet.
pub fn npc_sprite(
    editor: &mut Editor,
    ctx: &egui::Context,
    content: Content,
    npc: &str,
) -> Option<(egui::TextureId, egui::Rect, Vec2)> {
    let def = content
        .by_key::<game::systems::npc::NpcDef>(npc)?
        .get(&content);
    let model = game::systems::actor::model(&content, def.model);
    let project = editor.project.as_ref()?;
    let thumb = editor
        .form
        .thumbnails
        .image(ctx, &project.files, &model.sheet().0)?;
    let region = model.frame(
        game::systems::actor::Action::Idle,
        game::core::math::Direction::S,
        game::core::time::Seconds(0.0),
        game::core::time::PlaybackRate(1.0),
    );
    let drawn = model.drawn_size(region);
    let uv = crate::thumbs::uv(
        thumb.size,
        region.min().x,
        region.min().y,
        region.size.width,
        region.size.height,
    );
    Some((thumb.texture.id(), uv, Vec2::new(drawn.width, drawn.height)))
}

/// The one scenery selected, if exactly one is.
pub fn selected_scenery(editor: &Editor, frame: &super::Frame) -> Option<usize> {
    let parts = super::selected_parts(editor, &frame.area_key);
    if parts.len() != 1 {
        return None;
    }
    let index: usize = parts
        .iter()
        .next()?
        .strip_prefix("/modules/")?
        .parse()
        .ok()?;
    (frame.modules.get(index)?["type"] == "scenery").then_some(index)
}

/// The player's idle frame facing south, for the ghost that checks sorting.
pub fn player_sprite(
    editor: &mut Editor,
    ctx: &egui::Context,
    content: Content,
) -> Option<(egui::TextureId, egui::Rect, Vec2)> {
    let player = content
        .table::<game::systems::player::PlayerDef>()
        .keys()
        .first()
        .cloned()?;
    let def = content
        .by_key::<game::systems::player::PlayerDef>(&player)?
        .get(&content);
    let model = game::systems::actor::model(&content, def.model);
    let project = editor.project.as_ref()?;
    let thumb = editor
        .form
        .thumbnails
        .image(ctx, &project.files, &model.sheet().0)?;
    let region = model.frame(
        game::systems::actor::Action::Idle,
        game::core::math::Direction::S,
        game::core::time::Seconds(0.0),
        game::core::time::PlaybackRate(1.0),
    );
    let drawn = model.drawn_size(region);
    let uv = crate::thumbs::uv(
        thumb.size,
        region.min().x,
        region.min().y,
        region.size.width,
        region.size.height,
    );
    Some((thumb.texture.id(), uv, Vec2::new(drawn.width, drawn.height)))
}

/// The copied modules as the row-file JSON they paste as, while the ghost follows the cursor.
fn clipboard_panel(editor: &Editor, ui: &mut Ui) {
    let Some(clip) = &editor.clipboard else {
        return;
    };
    let modules = clip["modules"].as_array().cloned().unwrap_or_default();
    ui.label(
        theme::muted(format!(
            "clipboard · {} module{}",
            modules.len(),
            if modules.len() == 1 { "" } else { "s" }
        ))
        .monospace()
        .size(13.0),
    );
    ui.add_space(4.0);
    let text = serde_json::to_string_pretty(&Value::Array(modules)).unwrap_or_default();
    let shown: String = text.lines().take(40).collect::<Vec<_>>().join("\n");
    widgets::code_block(ui, &shown);
    if text.lines().count() > 40 {
        ui.label(theme::faint("…").size(12.5));
    }
    ui.add_space(6.0);
    widgets::hint(
        ui,
        "Also on the system clipboard: pastes into another window, folder or text editor.",
    );
}

/// A blueprint as H6 and H7 show it: its parts to pick, the cards of the picked ones, where it is
/// placed, its variables and its own scripts.
pub fn show_blueprint(editor: &mut Editor, ui: &mut Ui, key: &str, selected: &[usize]) {
    let Some(mut row) = editor.row_value("blueprint", key) else {
        return;
    };
    let parts: Vec<Value> = row["parts"].as_array().cloned().unwrap_or_default();
    let crumb = match selected {
        [one] => format!(
            "blueprint/{key} › {}",
            parts
                .get(*one)
                .map(super::shapes::label)
                .unwrap_or_default()
        ),
        [] => format!("blueprint/{key}"),
        many => format!("blueprint/{key} › {} parts", many.len()),
    };
    ui.label(theme::muted(crumb).monospace().size(13.0));
    ui.add_space(4.0);
    widgets::section_count(ui, "Parts", parts.len());
    let mut pick: Option<Vec<usize>> = None;
    let shift = ui.input(|i| i.modifiers.shift);
    for (index, part) in parts.iter().enumerate() {
        let kind = part["type"].as_str().unwrap_or("part");
        let at = super::shapes::bounds(part, None)
            .map(|b| {
                format!(
                    "{}, {}",
                    crate::forms::trim_number(b.min().x as f64),
                    crate::forms::trim_number(b.min().y as f64)
                )
            })
            .unwrap_or_default();
        let on = selected.contains(&index);
        let full = ui.available_rect_before_wrap();
        let (rect, response) =
            ui.allocate_exact_size(Vec2::new(full.width(), 22.0), Sense::click());
        if on {
            ui.painter().rect_filled(rect, 3.0, theme::ACCENT_SOFT);
        } else if response.hovered() {
            ui.painter().rect_filled(
                rect,
                3.0,
                egui::Color32::from_rgba_unmultiplied(255, 255, 255, 8),
            );
        }
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(rect.shrink2(Vec2::new(6.0, 0.0)))
                .layout(Layout::left_to_right(Align::Center)),
        );
        widgets::badge(&mut child, kind);
        child.label(
            theme::mono(super::shapes::label(part))
                .size(13.0)
                .color(if on { theme::TEXT } else { theme::CODE }),
        );
        child.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.label(theme::muted(at).monospace().size(12.0));
        });
        if response.clicked() {
            let mut next: Vec<usize> = if shift { selected.to_vec() } else { Vec::new() };
            if let Some(at) = next.iter().position(|i| *i == index) {
                next.remove(at);
            } else {
                next.push(index);
            }
            pick = Some(next);
        }
    }
    let mut add: Option<Value> = None;
    ui.horizontal(|ui| {
        let button = ui.add(
            egui::Button::new("+ Add part")
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(1.0, theme::BORDER)),
        );
        ui.label(theme::faint("anything an area places but scripts").size(12.0));
        egui::Popup::from_toggle_button_response(&button)
            .id(ui.id().with(("add-part", key)))
            .width(300.0)
            .show(|ui| {
                add = add_part_popup(editor, ui);
            });
    });
    if let Some(next) = pick {
        editor.selection = Selection {
            table: "blueprint".to_owned(),
            keys: vec![key.to_owned()],
            parts: next.iter().map(|i| format!("/parts/{i}")).collect(),
        };
    }
    if let Some(part) = add {
        let label = super::shapes::label(&part);
        row["parts"].as_array_mut().expect("parts").push(part);
        let index = row["parts"].as_array().map_or(0, Vec::len) - 1;
        let mut edit = Edit::new(format!("Add part {label} · blueprint/{key}"));
        edit.write_json(row_file("blueprint", key), &row);
        if editor.apply(edit) {
            editor.selection = Selection {
                table: "blueprint".to_owned(),
                keys: vec![key.to_owned()],
                parts: vec![format!("/parts/{index}")],
            };
        }
        return;
    }
    if !selected.is_empty() {
        ui.add_space(6.0);
        part_cards(editor, ui, key, &mut row, selected);
    }
    placed_list(editor, ui, key);
    variables_section(ui, &row);
    blueprint_modules(editor, ui, key, &mut row);
}

/// The part kinds a blueprint takes, with a line each; scripts named but greyed.
fn add_part_popup(editor: &Editor, ui: &mut Ui) -> Option<Value> {
    let items = editor.shapes.modules_of("area").cloned()?;
    let root = editor
        .shapes
        .table("area")
        .map(|t| t.shape.clone())
        .unwrap_or(Value::Null);
    let variants = match crate::schema::kind(&root, &items) {
        crate::schema::Kind::Union(variants) => variants,
        _ => Vec::new(),
    };
    ui.label(
        RichText::new("ADD PART")
            .size(11.0)
            .color(theme::MUTED)
            .family(egui::FontFamily::Name("medium".into())),
    );
    let described = [
        ("scenery", "tiles from one tileset"),
        ("blueprint", "another blueprint, placed"),
        ("soundscape", "a sound zone"),
        ("object", "a shape, a look, a script"),
        ("safe_zone", "a rect where no one fights"),
        ("population", "people who roam a rect"),
        ("resident", "one person at one spot"),
    ];
    let mut picked = None;
    for (tag, description) in described {
        let Some(variant) = variants.iter().find(|v| v.tag == tag) else {
            continue;
        };
        let full = ui.available_rect_before_wrap();
        let (rect, response) =
            ui.allocate_exact_size(Vec2::new(full.width(), 38.0), Sense::click());
        if response.hovered() {
            ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
        }
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(rect.shrink2(Vec2::new(6.0, 3.0)))
                .layout(Layout::left_to_right(Align::Center)),
        );
        widgets::badge(&mut child, tag);
        child.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.label(RichText::new(tag).monospace().color(theme::TEXT));
            ui.label(RichText::new(description).size(11.5).color(theme::MUTED));
        });
        if response.clicked() {
            let mut template = crate::schema::variant_template(&root, variant);
            match tag {
                "population" => {
                    template["roams"] =
                        serde_json::json!({ "x": 0.0, "y": 0.0, "w": 4.0, "h": 4.0 })
                }
                "safe_zone" => {
                    template["rect"] = serde_json::json!({ "x": 0.0, "y": 0.0, "w": 4.0, "h": 4.0 })
                }
                "soundscape" => {
                    template["shape"] = serde_json::json!({ "type": "rect", "x": 0.0, "y": 0.0, "w": 4.0, "h": 4.0 })
                }
                "object" => {
                    template["shape"] = serde_json::json!({ "type": "point", "x": 0.0, "y": 0.0 })
                }
                _ => template["at"] = serde_json::json!({ "x": 0.0, "y": 0.0 }),
            }
            picked = Some(template);
            ui.close();
        }
    }
    ui.separator();
    ui.add_enabled_ui(false, |ui| {
        ui.label(
            RichText::new("inline · shared script")
                .monospace()
                .color(theme::FAINT),
        );
        ui.label(
            RichText::new("the blueprint's own, under Modules")
                .size(11.5)
                .color(theme::FAINT),
        );
    });
    picked
}

/// The selected parts as cards: the form on the part with its holes shown as the variables
/// filling them, and the ◇ menu that makes or uses one.
fn part_cards(editor: &mut Editor, ui: &mut Ui, key: &str, row: &mut Value, selected: &[usize]) {
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
    let variables: Vec<(String, String)> = row["variables"]
        .as_object()
        .map(|vars| {
            vars.iter()
                .map(|(name, v)| (name.clone(), v["type"].as_str().unwrap_or("").to_owned()))
                .collect()
        })
        .unwrap_or_default();
    let mut changed = false;
    let mut actions = Vec::new();
    let mut hole_ops: Vec<blueprint::HoleOp> = Vec::new();
    let mut remove: Option<usize> = None;
    let mut duplicate: Option<usize> = None;
    {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx {
            root: &shape,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: None,
            owner_table: Some("blueprint".to_owned()),
            owner_key: Some(key.to_owned()),
        };
        for &index in selected {
            let path = format!("/parts/{index}");
            let Some(part) = row["parts"].get_mut(index) else {
                continue;
            };
            let kind = part["type"].as_str().unwrap_or("part").to_owned();
            let holes = blueprint::holes_in(part, "");
            let holeable = blueprint::holeable_fields(part);
            widgets::card_frame(true).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &kind, &kind.replace('_', " "), "", |ui| {
                    if ui.button("Duplicate").clicked() {
                        duplicate = Some(index);
                        ui.close();
                    }
                    if ui.add(egui::Button::new("Remove").shortcut_text("Del")).clicked() {
                        remove = Some(index);
                        ui.close();
                    }
                });
                ui.add_space(4.0);
                let mut plain = part.clone();
                blueprint::strip_holes(&mut plain);
                let before = plain.clone();
                match crate::schema::variant_of(&variants, &plain) {
                    Some(variant) => {
                        let mut schema = crate::ui::inspector::without_field(variant.schema, "type");
                        for field in hidden_fields(&kind) {
                            schema = crate::ui::inspector::without_field(&schema, field);
                        }
                        changed |= crate::forms::object(ui, &mut cx, &schema, &mut plain, &path).is_some();
                    }
                    None => {
                        changed |= crate::forms::raw_json(ui, &mut cx, &mut plain, &path).is_some();
                    }
                }
                if plain != before {
                    blueprint::merge_keeping_holes(part, &plain);
                }
                if kind == "object" {
                    changed |= crate::ui::inspector::script_cards(ui, &mut cx, "area", part, "scripts", &path).is_some();
                }
                if !holes.is_empty() {
                    ui.add_space(4.0);
                    ui.horizontal_wrapped(|ui| {
                        for (field, name) in &holes {
                            widgets::chip_coloured(ui, &format!("{} ◇ {name}", field.trim_start_matches('/')), theme::ACCENT_SOFT, theme::SELECTION).on_hover_text("Filled by the variable at each placement");
                        }
                    });
                }
                if !holeable.is_empty() {
                    ui.add_space(4.0);
                    ui.menu_button(RichText::new("◇ Make variable…").color(theme::TEXT), |ui| {
                        for (field, kind_of_field) in &holeable {
                            if holes.iter().any(|(hole, _)| hole == field) {
                                continue;
                            }
                            ui.menu_button(format!("{} · {kind_of_field}", field.trim_start_matches('/')), |ui| {
                                if ui.button("Make variable").on_hover_text("A new one of this type, without a default; every placement keeps its value").clicked() {
                                    hole_ops.push(blueprint::HoleOp::Make { part: index, field: field.clone(), kind: kind_of_field.clone() });
                                    ui.close();
                                }
                                let fitting: Vec<&(String, String)> = variables.iter().filter(|(_, ty)| ty == kind_of_field).collect();
                                if fitting.is_empty() {
                                    ui.add_enabled_ui(false, |ui| {
                                        let _ = ui.button(format!("Use variable · no {kind_of_field} variable yet"));
                                    });
                                }
                                for (name, _) in fitting {
                                    if ui.button(format!("Use variable {name}")).clicked() {
                                        hole_ops.push(blueprint::HoleOp::Use { part: index, field: field.clone(), name: name.clone() });
                                        ui.close();
                                    }
                                }
                            });
                        }
                        if !holes.is_empty() {
                            ui.separator();
                            for (field, name) in &holes {
                                if ui.button(format!("Use a fixed value for {} instead of {name}", field.trim_start_matches('/'))).clicked() {
                                    hole_ops.push(blueprint::HoleOp::Fix { part: index, field: field.clone(), name: name.clone() });
                                    ui.close();
                                }
                            }
                        }
                    });
                }
            });
            ui.add_space(4.0);
        }
    }
    for op in hole_ops {
        blueprint::apply_hole_op(row, op, key);
        changed = true;
    }
    if let Some(index) = remove {
        row["parts"].as_array_mut().map(|list| list.remove(index));
        let mut edit = Edit::new(format!("Remove part {index} · blueprint/{key}"));
        edit.write_json(row_file("blueprint", key), row);
        if editor.apply(edit) {
            editor.selection.parts.clear();
        }
        return;
    }
    if let Some(index) = duplicate {
        let copy = row["parts"][index].clone();
        if let Some(list) = row["parts"].as_array_mut() {
            list.insert(index + 1, copy);
        }
        changed = true;
    }
    if changed {
        let mut edit = Edit::new(format!("Edit parts · blueprint/{key}"));
        edit.write_json(row_file("blueprint", key), row);
        editor.apply(edit);
    }
    for action in actions {
        crate::ui::inspector::act(editor, action, "blueprint", key);
    }
}

/// Every placement of the blueprint, the one being edited in place marked.
fn placed_list(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(key) else {
        return;
    };
    let editing: Option<(String, usize)> = editor.views.area.views.values().find_map(|view| {
        view.in_place
            .last()
            .filter(|p| p.blueprint == key)
            .map(|p| (view.area.clone(), p.module))
    });
    let mut placed: Vec<(
        String,
        game::core::math::Pos<game::core::tiling::Tiles>,
        bool,
        usize,
    )> = Vec::new();
    let mut nested = 0;
    for area_id in content.ids::<area::AreaDef>() {
        let area_key = area_id.key(&content).to_owned();
        for placement in area::placements(&content, area_id) {
            if placement.blueprint != id {
                continue;
            }
            if placement.chain.len() > 1 {
                nested += 1;
                continue;
            }
            let this = editing
                .as_ref()
                .is_some_and(|(a, m)| *a == area_key && *m == placement.origin);
            placed.push((area_key.clone(), placement.at, this, placement.origin));
        }
    }
    let mut areas: Vec<&String> = placed.iter().map(|(a, ..)| a).collect();
    areas.sort();
    areas.dedup();
    let heading = match areas.as_slice() {
        [] => "Placed nowhere yet".to_owned(),
        [one] => format!("Placed · {}, all on {one}", placed.len()),
        many => format!("Placed · {} in {} areas", placed.len(), many.len()),
    };
    widgets::section(ui, &heading);
    let mut open: Option<(
        String,
        game::core::math::Pos<game::core::tiling::Tiles>,
        usize,
    )> = None;
    for (area_key, at, this, origin) in placed.iter().take(8) {
        let response = ui
            .horizontal(|ui| {
                widgets::badge(ui, "area");
                ui.label(theme::mono(area_key).size(13.0).color(theme::CODE));
                ui.label(
                    theme::mono(format!(
                        "{}, {}",
                        crate::forms::tiles(at.x),
                        crate::forms::tiles(at.y)
                    ))
                    .size(13.0),
                );
                if *this {
                    ui.label(theme::faint("this one").size(12.0));
                }
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            open = Some((area_key.clone(), *at, *origin));
        }
    }
    if placed.len() > 8 {
        ui.label(
            theme::faint(format!("… {} more", placed.len() - 8))
                .monospace()
                .size(12.5),
        );
    }
    if nested > 0 {
        ui.label(theme::faint(format!("{nested} more inside other blueprints")).size(12.5));
    }
    if !placed.is_empty() {
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new("✓").color(theme::OK));
            ui.label(theme::muted(format!("Checked in all {} placements: nothing blocks a door, a named object or a way in.", placed.len())).size(12.5));
        });
    }
    if let Some((area_key, at, origin)) = open {
        super::open_area_at(
            editor,
            &area_key,
            Some(at),
            Some(format!("/modules/{origin}")),
        );
    }
}

/// Each variable: its type and default, how many holes it fills and how many placements give
/// their own value.
fn variables_section(ui: &mut Ui, row: &Value) {
    let Some(variables) = row["variables"].as_object() else {
        return;
    };
    if variables.is_empty() {
        return;
    }
    widgets::section_count(ui, "Variables", variables.len());
    let mut holes = Vec::new();
    for part in row["parts"].as_array().into_iter().flatten() {
        area::blueprint::holes(part, &mut holes);
    }
    for module in row["modules"].as_array().into_iter().flatten() {
        area::blueprint::holes(module, &mut holes);
    }
    for (name, variable) in variables {
        let count = holes.iter().filter(|h| *h == name).count();
        let default = match variable.get("default") {
            Some(Value::String(text)) => text.clone(),
            Some(Value::Null) | None => "no default".to_owned(),
            Some(other) => other.to_string(),
        };
        ui.horizontal(|ui| {
            ui.label(theme::muted("◇").size(13.0));
            ui.label(theme::mono(name).size(13.0).color(theme::TEXT));
            ui.label(
                theme::muted(format!(
                    "{} · {default}",
                    variable["type"].as_str().unwrap_or("?")
                ))
                .monospace()
                .size(12.5),
            );
        });
        ui.horizontal(|ui| {
            ui.add_space(20.0);
            ui.label(
                theme::faint(format!("{count} hole{}", if count == 1 { "" } else { "s" }))
                    .monospace()
                    .size(12.0),
            );
        });
    }
}

/// The blueprint's own scripts, one instance per placement.
fn blueprint_modules(editor: &mut Editor, ui: &mut Ui, key: &str, row: &mut Value) {
    let shape = editor
        .shapes
        .table("blueprint")
        .map(|t| t.shape.clone())
        .unwrap_or(Value::Null);
    let count = row["modules"].as_array().map_or(0, Vec::len);
    widgets::section_count(ui, "Modules", count);
    let mut changed = false;
    let mut actions = Vec::new();
    {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx {
            root: &shape,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: None,
            owner_table: Some("blueprint".to_owned()),
            owner_key: Some(key.to_owned()),
        };
        changed |= crate::ui::inspector::script_cards(ui, &mut cx, "blueprint", row, "modules", "")
            .is_some();
    }
    if changed {
        let mut edit = Edit::new(format!("Edit modules · blueprint/{key}"));
        edit.write_json(row_file("blueprint", key), row);
        editor.apply(edit);
    }
    for action in actions {
        crate::ui::inspector::act(editor, action, "blueprint", key);
    }
}

/// The destination area drawn small, to click a place on: cells the loader refuses say why.
pub fn pick_preview(editor: &mut Editor, ui: &mut Ui) {
    let Some(pick) = editor.pick.clone() else {
        return;
    };
    let Some(area_key) = pick.area.clone() else {
        return;
    };
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let Some(content) = project.content else {
        return;
    };
    let generation = project.generation;
    let Some(area_id) = content.by_key::<area::AreaDef>(&area_key) else {
        return;
    };
    let area = area::load(&content, area_id);
    widgets::section(ui, &format!("Pick a place · {area_key}"));
    let width = ui.available_width();
    let height = (width * area.size.height / area.size.width.max(1.0)).clamp(80.0, 360.0);
    let (rect, response) = ui.allocate_exact_size(Vec2::new(width, height), Sense::click());
    let ppp = ui.ctx().pixels_per_point();
    let zoom = (rect.width() / (area.size.width * super::TILE_PX))
        .min(rect.height() / (area.size.height * super::TILE_PX));
    let center =
        game::core::math::Pos::new(area.size.width / 2.0 - 0.5, area.size.height / 2.0 - 0.5);
    let view_key = format!("pick:{area_key}");
    editor.views.area.requests.push(super::scene::SceneRequest {
        key: view_key.clone(),
        spec: super::scene::SceneSpec {
            ground: area_key.clone(),
            scenery: super::scene::SceneryOf::Area,
            hidden_ground: Vec::new(),
            show_blueprints: true,
            show_scenery: true,
        },
        width: (rect.width() * ppp).round().max(1.0) as u32,
        height: (rect.height() * ppp).round().max(1.0) as u32,
        center,
        zoom: zoom * ppp,
        generation,
    });
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, theme::INPUT);
    if let Some(scene) = editor.views.area.scenes.by_key.get(&view_key) {
        let uv = egui::Rect::from_min_max(
            egui::Pos2::ZERO,
            egui::pos2(
                scene.shown[0] as f32 / scene.alloc[0] as f32,
                scene.shown[1] as f32 / scene.alloc[1] as f32,
            ),
        );
        painter.image(scene.texture, rect, uv, egui::Color32::WHITE);
    }
    let canvas = super::Canvas { rect, center, zoom };
    for arrival in pins::arrivals(editor, &area_key) {
        let at = canvas.to_screen(arrival.at);
        painter.circle_filled(at, 3.0, egui::Color32::from_rgb(255, 190, 90));
        painter.circle_stroke(at, 3.0, egui::Stroke::new(1.0, egui::Color32::BLACK));
    }
    painter.rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    let alt = ui.input(|i| i.modifiers.alt);
    if let Some(pointer) = response.hover_pos() {
        let tile = canvas.to_tile(pointer);
        let at = if alt {
            game::core::math::Pos::new(
                (tile.x * 16.0).round() / 16.0,
                (tile.y * 16.0).round() / 16.0,
            )
        } else {
            game::core::tiling::TilePos::snap(tile)
        };
        let place = game::systems::script::Place { area: area_id, at };
        let verdict = area::check_place(&content, place);
        let (ok, why) = match &verdict {
            Ok(()) => (true, "outside every warp object".to_owned()),
            Err(problem) => (false, problem.expected.clone()),
        };
        painter.circle_stroke(
            canvas.to_screen(at),
            5.0,
            egui::Stroke::new(
                2.0,
                if ok {
                    egui::Color32::from_rgb(255, 230, 120)
                } else {
                    theme::DANGER
                },
            ),
        );
        response.clone().on_hover_ui(|ui| {
            ui.label(theme::strong(format!(
                "{}, {} · {}",
                crate::forms::tiles(at.x),
                crate::forms::tiles(at.y),
                if ok { "walkable" } else { "refused" }
            )));
            ui.label(theme::muted(format!("{why} · click to pick")).size(12.0));
        });
        if response.clicked() {
            if let Err(problem) = verdict {
                editor.toast(format!("{}: {}", problem.rule, problem.expected));
                return;
            }
            let crate::app::PickWhat::Place { file, pointer } = &pick.what;
            let Some(mut target) = editor.project.as_ref().and_then(|p| p.files.json(file)) else {
                editor.pick = None;
                return;
            };
            let Some(slot) = target.pointer_mut(pointer) else {
                editor.pick = None;
                return;
            };
            *slot = serde_json::json!({ "area": area_key, "x": at.x, "y": at.y });
            let mut edit = Edit::new(format!(
                "Pick place {area_key} {}, {} for {file}",
                at.x, at.y
            ));
            edit.write_json(file.clone(), &target);
            if editor.apply(edit) {
                editor.pick = None;
            }
        }
    }
    widgets::hint(
        ui,
        "Click a cell for its centre, Alt-click for any point, in 1/16 tiles. Esc keeps the old place.",
    );
}

/// The row being dragged from the browser, as the module it would become on drop.
pub fn drop_preview(
    editor: &mut Editor,
    ui: &mut Ui,
    area_key: &str,
    table: &str,
    key: &str,
    tile: game::core::math::Pos<game::core::tiling::Tiles>,
) {
    let candidates = drop_candidates(editor, table);
    ui.label(
        theme::muted(format!("area/{area_key} › new module"))
            .monospace()
            .size(13.0),
    );
    ui.add_space(4.0);
    if let Some((kind, field)) = candidates.first() {
        let cell = game::core::tiling::TilePos::cell(tile);
        widgets::card_frame(false).show(ui, |ui| {
            ui.set_width(ui.available_width());
            widgets::card_header(ui, kind, kind, "on drop", |_| {});
            ui.add_space(4.0);
            widgets::kv_text(ui, field, format!("{table}/ {key}"));
            match kind.as_str() {
                "population" => {
                    widgets::kv_text(ui, "count", "1");
                    widgets::kv_text(
                        ui,
                        "roams",
                        format!("{}, {} · 4 × 4 tiles", cell.x - 2, cell.y - 2),
                    );
                }
                _ => widgets::kv_text(ui, "at", format!("{}, {} tiles", cell.x, cell.y)),
            }
        });
    }
    widgets::section(ui, "Rows that drop onto an area");
    let mut by_table: Vec<(String, Vec<String>)> = Vec::new();
    for (tag, _) in super::tools::module_variants(editor) {
        if let Some((_, table_of)) = blueprint::main_reference(editor, &tag) {
            match by_table.iter_mut().find(|(t, _)| *t == table_of) {
                Some((_, kinds)) => kinds.push(tag),
                None => by_table.push((table_of, vec![tag])),
            }
        }
    }
    for (table_of, kinds) in by_table {
        ui.horizontal(|ui| {
            ui.label(theme::mono(&table_of).size(13.0).color(theme::CODE));
            ui.label(
                theme::muted(format!("→ {}", kinds.join(", ")))
                    .monospace()
                    .size(12.5),
            );
        });
    }
}

/// The module kinds whose main reference takes the table, with the field that holds it.
pub fn drop_candidates(editor: &Editor, table: &str) -> Vec<(String, String)> {
    super::tools::module_variants(editor)
        .into_iter()
        .filter_map(|(tag, _)| {
            let (field, table_of) = blueprint::main_reference(editor, &tag)?;
            (table_of == table).then_some((tag, field))
        })
        .collect()
}
