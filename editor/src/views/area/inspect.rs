use design_tokens::controls;
use design_tokens::glyph::{self, Mark};
use egui::{Align, Layout, RichText, Sense, Ui, Vec2};
use engine::core::content::{Content, ContentFile, table_of};
use engine::core::math::Rng;
use engine::core::script::VariableType;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::scene::scene_file;
use engine::systems::area::{self, AreaDef, AreaModuleKind};
use serde_json::Value;

use super::placement::{self, placement_extras};
use super::population::from_npc;
use super::preview::{clipboard_panel, pick_preview};
use super::scenery::{scenery_extras, scenery_rows};
use super::soundscape::soundscape_extras;
use super::{AreaTool, AreaViewState, brush, grid, nodes, scene_tree, stamp, terrain};
use crate::app::Editor;
use crate::forms::{self, FormCx};
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::tabs::file_title;
use crate::ui::{patterns, row_form, sidebar, theme, widgets};
use crate::user::BrushSettings;
use crate::value::{self, RowValue};
use crate::{picker, schema};

/// The view's inspector: a paste or a pick under way, the selected nodes, the blueprint parts
/// edited in place, or else the card of the tool in hand.
pub fn sidebar(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    if !editor.views.area.views.contains_key(view_key) {
        return;
    }
    if editor.views.area.view(view_key).paste.is_some() {
        clipboard_panel(editor, ui);
        return;
    }
    if editor.pick.is_some() {
        pick_preview(editor, ui);
        return;
    }
    let Some(snapshot) = super::AreaSnapshot::for_view(editor, view_key) else {
        return;
    };
    let selection = editor.selection.clone();
    let in_place = snapshot
        .in_place
        .last()
        .map(|place| place.blueprint.clone());
    if in_place.is_some()
        && selection.keys.first() == in_place.as_ref()
        && !selection.parts.is_empty()
    {
        show_parts(editor, ui, view_key, &selection);
        return;
    }
    let parts: Vec<String> = super::selected_parts_of(editor, &snapshot.bundle)
        .into_iter()
        .cloned()
        .collect();
    let node = |part: &String| snapshot.scene.pointer(part);
    match parts.as_slice() {
        [walk] if walk == super::WALK_ROW => {
            walk_card(editor, ui, view_key, &snapshot);
            overlays_legend(ui);
        }
        [layer] if node(layer).is_some_and(nodes::is_layer) => {
            layer_card(editor, ui, &snapshot, layer);
            ui.add_space(6.0);
            tool(editor, ui, view_key, &snapshot);
        }
        [folder] if node(folder).is_some_and(nodes::is_folder) => {
            folder_card(editor, ui, &snapshot, folder);
        }
        [] => tool(editor, ui, view_key, &snapshot),
        _ => show_parts(editor, ui, view_key, &selection),
    }
}

fn tool(editor: &mut Editor, ui: &mut Ui, view_key: &str, snapshot: &super::AreaSnapshot) {
    let content = snapshot.content.clone();
    match editor.views.area.view(view_key).tool {
        AreaTool::Paint | AreaTool::Fill | AreaTool::Erase | AreaTool::Eyedropper => {
            paint_card(editor, ui, view_key);
        }
        AreaTool::Terrain => terrain_card(editor, ui, view_key, snapshot),
        AreaTool::Stamp => stamp_card(editor, ui, view_key, &content),
        AreaTool::Select | AreaTool::Module => sidebar::nothing_selected(
            ui,
            "Select nodes in the scene or on the map, or take a tool with settings, to inspect them here.",
        ),
    }
}

/// A ground layer's card: its name, where it draws among the others, what it holds, and its eye
/// and padlock.
fn layer_card(editor: &mut Editor, ui: &mut Ui, snapshot: &super::AreaSnapshot, pointer: &str) {
    let Some(node) = snapshot.scene.pointer(pointer).cloned() else {
        return;
    };
    let name = node["name"].as_str().unwrap_or_default().to_owned();
    let mut order: Vec<String> = Vec::new();
    nodes::walk(&snapshot.scene, &mut |_, node| {
        if nodes::is_layer(node) {
            order.push(node["name"].as_str().unwrap_or_default().to_owned());
        }
    });
    let at = order.iter().position(|layer| *layer == name).unwrap_or(0);
    let (under, over) = (&order[..at], &order[at + 1..]);
    let painted = grid::GridDraft::own(&snapshot.content, &snapshot.bundle)
        .and_then(|draft| {
            let layer = draft.layer_index(&name)?;
            Some(draft.ground[layer].cells.iter().flatten().count())
        })
        .unwrap_or(0);
    let flags = snapshot.flags.row(pointer);
    let mut toggled = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        let state = if flags.hidden.on() { "hidden" } else { "" };
        widgets::card_header(ui, &format!("ground layer {name}"), state, |_| {});
        ui.add_space(4.0);
        widgets::kv_text(ui, "file", format!("layers/{name}.csv"));
        let listed = |names: &[String]| match names {
            [] => "nothing".to_owned(),
            names => names.join(" and "),
        };
        widgets::kv_text(
            ui,
            "draws",
            format!("over {}, under {}", listed(under), listed(over)),
        );
        widgets::kv_text(ui, "painted", format!("{painted} cells"));
        widgets::kv(ui, "shown", |ui| {
            if ui.checkbox(&mut !flags.hidden.on(), "").clicked() {
                toggled = Some(scene_tree::Toggle::Hide);
            }
        });
        widgets::kv(ui, "locked", |ui| {
            if ui.checkbox(&mut flags.locked.on(), "").clicked() {
                toggled = Some(scene_tree::Toggle::Lock);
            }
        });
    });
    if let Some(toggle) = toggled {
        scene_tree::toggle(editor, &snapshot.bundle, &[pointer.to_owned()], toggle);
    }
}

/// A folder's card: what it holds by kind, its eye and padlock, and what can be made of it.
fn folder_card(editor: &mut Editor, ui: &mut Ui, snapshot: &super::AreaSnapshot, pointer: &str) {
    let Some(node) = snapshot.scene.pointer(pointer).cloned() else {
        return;
    };
    let label = node["label"].as_str().unwrap_or_default().to_owned();
    let mut counts: std::collections::BTreeMap<String, usize> = Default::default();
    nodes::walk(&node["children"], &mut |_, child| {
        if !nodes::is_folder(child) {
            *counts
                .entry(child["type"].as_str().unwrap_or("module").to_owned())
                .or_default() += 1;
        }
    });
    let flags = snapshot.flags.row(pointer);
    let mut action = None;
    ui.label(
        theme::muted(format!("{} › {label}", file_title(&snapshot.bundle)))
            .monospace()
            .size(13.0),
    );
    ui.add_space(4.0);
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        let state = if flags.hidden.on() { "hidden" } else { "" };
        widgets::card_header(ui, &format!("folder {label}"), state, |_| {});
        ui.add_space(4.0);
        if counts.is_empty() {
            ui.label(theme::muted("Empty").size(12.5));
        }
        for (kind, count) in &counts {
            ui.horizontal(|ui| {
                widgets::badge(ui, kind);
                ui.label(theme::mono(format!("{count} × {}", schema::title(kind))).size(13.0));
            });
        }
        ui.add_space(4.0);
        widgets::kv(ui, "shown", |ui| {
            if ui.checkbox(&mut !flags.hidden.on(), "").clicked() {
                action = Some(FolderAction::Toggle(scene_tree::Toggle::Hide));
            }
        });
        widgets::kv(ui, "locked", |ui| {
            if ui.checkbox(&mut flags.locked.on(), "").clicked() {
                action = Some(FolderAction::Toggle(scene_tree::Toggle::Lock));
            }
        });
    });
    ui.add_space(6.0);
    ui.horizontal_wrapped(|ui| {
        if controls::marked(ui, Mark::Copy, "Make blueprint").clicked() {
            action = Some(FolderAction::MakeBlueprint);
        }
        if ui.button("Ungroup").clicked() {
            action = Some(FolderAction::Ungroup);
        }
        if ui.button("Select what's inside").clicked() {
            action = Some(FolderAction::SelectInside);
        }
    });
    let bundle = snapshot.bundle.clone();
    match action {
        Some(FolderAction::Toggle(toggle)) => {
            scene_tree::toggle(editor, &bundle, &[pointer.to_owned()], toggle);
        }
        Some(FolderAction::MakeBlueprint) => {
            if let Some(snapshot) = super::AreaSnapshot::for_bundle(editor, &bundle) {
                super::run_action(editor, &snapshot, super::AreaAction::MakeBlueprint);
            }
        }
        Some(FolderAction::Ungroup) => scene_tree::ungroup(editor, &bundle, &[pointer.to_owned()]),
        Some(FolderAction::SelectInside) => {
            let mut inside = Vec::new();
            nodes::walk(&node["children"], &mut |at, child| {
                if nodes::is_module(child) {
                    inside.push(format!("{pointer}/children{at}"));
                }
            });
            nodes::select(editor, &bundle, inside);
        }
        None => {}
    }
}

enum FolderAction {
    Toggle(scene_tree::Toggle),
    MakeBlueprint,
    Ungroup,
    SelectInside,
}

fn tool_card(ui: &mut Ui, title: &str, body: impl FnOnce(&mut Ui)) {
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.label(theme::strong(title).monospace());
        });
        ui.add_space(4.0);
        body(ui);
    });
}

fn paint_card(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    let title = match editor.views.area.view(view_key).tool {
        AreaTool::Fill => "Fill",
        AreaTool::Erase => "Erase",
        AreaTool::Eyedropper => "Eyedropper",
        _ => "Paint",
    };
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    let picked = {
        let view = editor.views.area.view(view_key);
        if view.pick.random.is_empty() {
            view.pick.block.iter().map(Vec::len).sum::<usize>()
        } else {
            view.pick.random.len()
        }
    };
    tool_card(ui, title, |ui| {
        widgets::kv(ui, "brush", |ui| {
            changed |= brush_size_field(ui, &mut brush, true);
        });
        widgets::kv(ui, "random", |ui| {
            changed |= ui.checkbox(&mut brush.random, "").changed();
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
            if flip_chip(ui, "X", EditorKey::FlipHorizontal, brush.flip_x) {
                brush.flip_x = !brush.flip_x;
                changed = true;
            }
            if flip_chip(ui, "Y", EditorKey::FlipVertical, brush.flip_y) {
                brush.flip_y = !brush.flip_y;
                changed = true;
            }
        });
    });
    if changed {
        editor.set_brush(brush);
    }
}

fn flip_chip(ui: &mut Ui, axis: &str, key: EditorKey, on: bool) -> bool {
    let fill = if on { theme::SELECTION } else { theme::INPUT };
    let ink = theme::TEXT;
    let response = egui::Frame::new()
        .fill(fill)
        .stroke(egui::Stroke::new(
            1.0,
            if on { theme::TEXT } else { theme::BORDER },
        ))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(7, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(RichText::new(axis).color(ink).size(13.0));
                widgets::key_chip(ui, key);
            });
        })
        .response
        .interact(Sense::click());
    response.clicked()
}

fn terrain_card(editor: &mut Editor, ui: &mut Ui, view_key: &str, snapshot: &super::AreaSnapshot) {
    let content = &snapshot.content;
    let tile_px = snapshot.area().tile;
    let sets = terrain::sets_for(content, tile_px);
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    tool_card(ui, "Terrain brush", |ui| {
        let view = editor.views.area.view_mut(view_key);
        widgets::kv(ui, "terrains", |ui| {
            let current = view
                .terrain
                .set
                .clone()
                .unwrap_or_else(|| "pick a set".to_owned());
            widgets::combo((view_key, "terrain-set"))
                .selected_text(theme::mono(current))
                .width(ui.available_width())
                .show_ui(ui, |ui| {
                    for set in &sets {
                        let picked = view.terrain.tileset.as_deref() == Some(&set.tileset)
                            && view.terrain.set.as_deref() == Some(&set.set);
                        if ui
                            .selectable_label(
                                picked,
                                theme::mono(format!(
                                    "{} · {} · {} of {}",
                                    set.set, set.tileset, set.have, set.total
                                )),
                            )
                            .clicked()
                        {
                            view.terrain = brush::TerrainPick {
                                tileset: Some(set.tileset.clone()),
                                set: Some(set.set.clone()),
                                terrain: 0,
                            };
                        }
                    }
                });
        });
        if let Some(picked) = sets.iter().find(|set| {
            view.terrain.tileset.as_deref() == Some(&set.tileset)
                && view.terrain.set.as_deref() == Some(&set.set)
        }) {
            widgets::kv(ui, "paint", |ui| {
                ui.horizontal_wrapped(|ui| {
                    for (index, terrain) in picked.terrains.iter().enumerate() {
                        let on = view.terrain.terrain == index;
                        if widgets::mode_chip(ui, terrain, on).clicked() {
                            view.terrain.terrain = index;
                        }
                    }
                });
            });
        }
        widgets::kv(ui, "brush", |ui| {
            changed |= brush_size_field(ui, &mut brush, false);
        });
    });
    if changed {
        editor.set_brush(brush);
    }
    widgets::section(ui, "Terrains of these tilesets");
    let used = snapshot.picture.ground.tilesets();
    let mut own: Vec<&terrain::TerrainSetCoverage> = sets
        .iter()
        .filter(|set| used.contains(&set.tileset))
        .collect();
    let others = sets.len() - own.len();
    if own.is_empty() {
        ui.label(theme::muted("None of this area's tilesets names terrains.").size(12.5));
    }
    own.truncate(6);
    for set in own {
        ui.horizontal(|ui| {
            glyph::show(ui, Mark::Grid, 12.0, theme::FAINT);
            ui.label(theme::mono(&set.set).size(13.0));
            ui.label(theme::muted(set.terrains.join(" · ")).size(12.5));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(
                    theme::muted(format!("{} of {}", set.have, set.total))
                        .monospace()
                        .size(12.0),
                );
            });
        })
        .response
        .on_hover_text(&set.tileset);
    }
    if others > 0 {
        ui.label(theme::faint(format!("… {others} more in other tilesets")).size(12.5));
    }
    let picked = {
        let view = editor.views.area.view(view_key);
        view.terrain.tileset.clone().zip(view.terrain.set.clone())
    };
    let layer = grid::GridDraft::own(content, &snapshot.bundle)
        .and_then(|draft| brush::target_layer(editor, snapshot, &draft));
    if let (Some((tileset, set)), Some(layer)) = (picked, layer) {
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui
                .button(format!("Repaint with {set}"))
                .on_hover_text("Re-picks a tile for every cell of this layer painted from the set, as the set is now")
                .clicked()
            {
                repaint_layer(editor, content, &snapshot.bundle, &tileset, &set, layer);
            }
        });
    }
}

fn repaint_layer(
    editor: &mut Editor,
    content: &Content,
    key: &str,
    tileset: &str,
    set: &str,
    layer: usize,
) {
    let Some(def) = content
        .by_path::<area::tileset::TilesetDef>(tileset)
        .map(|id| id.get(content))
    else {
        return;
    };
    let Some(mut draft) = grid::GridDraft::own(content, key) else {
        return;
    };
    let mut rng = Rng::new(editor.frame);
    let (changed, kept) = super::terrain::repaint(&mut draft, layer, def, tileset, set, &mut rng);
    if changed == 0 {
        editor.toast(format!(
            "Nothing to repaint: no cell of this layer is painted from {set}"
        ));
        return;
    }
    let mut edit = ContentEdit::new(format!("Repaint {changed} cells with {set} in {key}"));
    draft.write_into(&mut edit);
    editor.apply(edit);
    if kept > 0 {
        editor.toast(format!("{kept} cells kept: no tile for their mix"));
    }
}

fn walk_card(editor: &mut Editor, ui: &mut Ui, view_key: &str, snapshot: &super::AreaSnapshot) {
    let mut brush = editor.settings.brush.clone();
    let mut changed = false;
    let forced = snapshot
        .picture
        .ground
        .walk
        .iter()
        .filter(|cell| cell.is_some())
        .count();
    tool_card(ui, "Paint walkability", |ui| {
        widgets::kv_text(ui, "forced", format!("{forced} cells"));
        let view = editor.views.area.view_mut(view_key);
        widgets::kv(ui, "paint", |ui| {
            for (value, label, color) in [
                (Some(false), "blocked", theme::DANGER),
                (Some(true), "walkable", theme::OK),
                (None, "clear", theme::MUTED),
            ] {
                let on = view.walk_value == value;
                if widgets::chip_colored(
                    ui,
                    label,
                    if on {
                        design_tokens::ink::wash(color, 0.2)
                    } else {
                        theme::INPUT
                    },
                    color,
                )
                .clicked()
                {
                    view.walk_value = value;
                }
            }
        });
        widgets::kv(ui, "brush", |ui| {
            changed |= brush_size_field(ui, &mut brush, true);
        });
        widgets::kv(ui, "overlay", |ui| {
            ui.checkbox(&mut view.walk_overlay, "");
            widgets::key_hint_text(ui, EditorKey::WalkOverlay, "toggles");
        });
        widgets::kv(ui, "locked", |ui| {
            ui.checkbox(&mut view.walk_locked, "");
        });
    });
    if changed {
        editor.set_brush(brush);
    }
}

fn overlays_legend(ui: &mut Ui) {
    widgets::section(ui, "Overlays");
    let swatch = |ui: &mut Ui, color: egui::Color32, hatch: bool| {
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(14.0), Sense::hover());
        ui.painter().rect_stroke(
            rect,
            2.0,
            egui::Stroke::new(1.0, color),
            egui::StrokeKind::Inside,
        );
        if hatch {
            patterns::hatch(ui.painter(), rect, color, 4.0);
        } else {
            ui.painter().rect_filled(rect.shrink(3.0), 1.0, color);
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
        ui.label(RichText::new("– ·").color(theme::SORT_LINE).size(12.5));
        ui.label(theme::muted("sort lines").size(12.5));
    });
}

fn stamp_card(editor: &mut Editor, ui: &mut Ui, view_key: &str, content: &Content) {
    let stamp = editor.views.area.view(view_key).stamp.clone();
    let viewed = super::viewed_bundle(view_key)
        .expect("an area or blueprint view")
        .to_owned();
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
            let mut cx = FormCx::new(project, &root, shapes, form, &mut actions)
                .editing(table_of(&viewed).unwrap_or_default(), Some(&viewed));
            widgets::kv(ui, "blueprint", |ui| {
                if picker::row(
                    ui,
                    &mut cx,
                    BlueprintDef::TABLE,
                    &mut picked,
                    "/stamp/blueprint",
                ) && !picked.is_empty()
                {
                    editor.views.area.view_mut(view_key).stamp = Some(picked.clone());
                }
            });
        }
        for action in actions {
            row_form::act(editor, action, AreaDef::TABLE, "");
        }
        let Some(stamp) = editor.views.area.view(view_key).stamp.clone() else {
            widgets::hint(
                ui,
                "Pick a blueprint below, then click to place one or drag a line.",
            );
            return;
        };
        let footprint = {
            let values = stamp::stamp_values(editor, Some(&stamp));
            let size = stamp::stamp_footprint(editor, content, &stamp, &values);
            (
                size.width.round().max(1.0) as u32,
                size.height.round().max(1.0) as u32,
            )
        };
        let settings = editor.settings.stamps.entry(stamp.clone()).or_default();
        widgets::kv(ui, "flip", |ui| {
            if flip_chip(ui, "X", EditorKey::FlipHorizontal, settings.flip_x) {
                settings.flip_x = !settings.flip_x;
                save = true;
            }
            if flip_chip(ui, "Y", EditorKey::FlipVertical, settings.flip_y) {
                settings.flip_y = !settings.flip_y;
                save = true;
            }
        });
        widgets::kv(ui, "spacing", |ui| {
            let label = match settings.spacing {
                None => format!("footprint · {} × {}", footprint.0, footprint.1),
                Some(n) => format!("{n} tiles"),
            };
            widgets::combo((view_key, "spacing"))
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
            widgets::key_hint_text(ui, EditorKey::Unsnapped, "for 1/16");
        });
        let variables = content
            .by_path::<BlueprintDef>(&stamp)
            .map(|id| id.get(content).variables.clone())
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
                let mut cx = FormCx::new(project, &root, shapes, form, &mut actions)
                    .editing(table_of(&viewed).unwrap_or_default(), Some(&viewed));
                for (name, variable) in &variables {
                    widgets::kv(ui, name, |ui| {
                        let mut value = values.get(name).cloned().unwrap_or_else(|| {
                            variable
                                .default
                                .as_ref()
                                .and_then(|d| value::json(d).ok())
                                .unwrap_or_else(|| placement::variable_template(variable))
                        });
                        if variable.ty == VariableType::Name {
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
        }
    });
    if save {
        editor.save_settings();
    }
}

pub fn show_parts(editor: &mut Editor, ui: &mut Ui, view_key: &str, selection: &RowSelection) {
    let Some(bundle) = selection.keys.first().cloned() else {
        return;
    };
    let mut scene = nodes::scene_of(editor, &bundle);
    let selected: Vec<String> = selection
        .parts
        .iter()
        .filter(|part| scene.pointer(part).is_some_and(nodes::is_module))
        .cloned()
        .collect();
    if selected.is_empty() {
        return;
    }
    let shapes = editor.shapes.clone();
    let shape = &shapes.scene_module;
    let table = table_of(&bundle).unwrap_or(AreaDef::TABLE).to_owned();
    let mut changed = false;
    let mut actions = Vec::new();
    let mut out = Followups::default();
    let mut group = false;
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
        let mut cx = FormCx::new(project, shape, shapes, form, &mut actions)
            .editing(&table, Some(&bundle))
            .errors_of(&scene_file(&bundle));
        if let [node] = selected.as_slice() {
            let view = views.area.views.get_mut(&super::view_key(&bundle));
            label = super::shapes::label(scene.pointer(node).unwrap_or(&Value::Null));
            changed = module_inspector(ui, &mut cx, view, &bundle, &mut scene, node, &mut out);
        } else {
            label = format!("{} modules", selected.len());
            ui.label(
                theme::muted(format!(
                    "{} › {} modules",
                    file_title(&bundle),
                    selected.len()
                ))
                .monospace()
                .size(13.0),
            );
            ui.label(theme::muted(spans(&scene, &selected)).size(12.5));
            ui.add_space(4.0);
            widgets::card_frame(true).show(ui, |ui| {
                ui.set_width(ui.available_width());
                widgets::card_header(ui, &format!("{} modules", selected.len()), "", |ui| {
                    if ui.button("Copy as JSON").clicked() {
                        out.actions.push(super::AreaAction::Copy);
                        ui.close();
                    }
                    if ui.button("Duplicate").clicked() {
                        out.actions.push(super::AreaAction::Duplicate);
                        ui.close();
                    }
                    if ui
                        .add(widgets::shortcut_button("Remove all", EditorKey::Delete))
                        .clicked()
                    {
                        out.actions.push(super::AreaAction::Delete);
                        ui.close();
                    }
                });
                ui.add_space(4.0);
                changed |= placement::shared_values(ui, &mut cx, &mut scene, &selected);
            });
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                if ui
                    .add(widgets::shortcut_button(
                        "Group into folder",
                        EditorKey::Group,
                    ))
                    .clicked()
                {
                    group = true;
                }
                if controls::marked(ui, Mark::Copy, "Make blueprint").clicked() {
                    out.actions.push(super::AreaAction::MakeBlueprint);
                }
            });
            widgets::key_hint_text(
                ui,
                EditorKey::MakeBlueprint,
                "makes a blueprint of the selection",
            );
        }
    }
    if changed {
        let mut edit = ContentEdit::new(format!("Edit {label}"));
        edit.write_json(scene_file(&bundle), &scene);
        editor.apply(edit);
    }
    for action in actions {
        row_form::act(editor, action, &table, &bundle);
    }
    if group {
        let ids = super::AreaSnapshot::for_view(editor, view_key)
            .map(|snapshot| scene_tree::selected_ids(&snapshot, &editor.selection))
            .unwrap_or_default();
        editor.views.area.view_mut(view_key).scene.queued =
            Some(scene_tree::SceneAction::Group(ids));
    }
    for action in out.actions {
        if let Some(snapshot) = super::AreaSnapshot::for_bundle(editor, &bundle) {
            super::run_action(editor, &snapshot, action);
        }
    }
    if editor.pick.is_some() {
        ui.add_space(6.0);
        pick_preview(editor, ui);
    }
}

fn module_inspector(
    ui: &mut Ui,
    cx: &mut FormCx,
    view: Option<&mut AreaViewState>,
    bundle: &str,
    scene: &mut Value,
    node: &str,
    out: &mut Followups,
) -> bool {
    let variants = cx.shapes.scene_variants();
    let path = node.to_owned();
    let Some(module) = scene.pointer(node) else {
        return false;
    };
    let kind = module["type"].as_str().unwrap_or("module").to_owned();
    let module_kind = module.module_kind();
    let shown_kind = kind.replace('_', " ");
    let crumbs: Vec<String> = std::iter::once(file_title(bundle).to_owned())
        .chain(folders_above(scene, node))
        .chain(std::iter::once(shown_kind.clone()))
        .collect();
    ui.label(theme::muted(crumbs.join(" › ")).monospace().size(13.0));
    let Some(module) = scene.pointer_mut(node) else {
        return false;
    };
    ui.add_space(4.0);
    let mut changed = false;
    let content = cx.content.clone();
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, &shown_kind, "", |ui| {
            if ui.button("Copy as JSON").clicked() {
                out.actions.push(super::AreaAction::Copy);
                ui.close();
            }
            if ui.button("Duplicate").clicked() {
                out.actions.push(super::AreaAction::Duplicate);
                ui.close();
            }
            ui.separator();
            if ui
                .add(widgets::shortcut_button("Remove", EditorKey::Delete))
                .clicked()
            {
                out.actions.push(super::AreaAction::Delete);
                ui.close();
            }
        });
        ui.add_space(4.0);
        match schema::variant_of(&variants, module) {
            Some(variant) => {
                changed |= forms::object_without(
                    ui,
                    cx,
                    variant.schema,
                    module,
                    &path,
                    hidden_fields(module_kind),
                )
                .is_some();
            }
            None => {
                changed |= forms::raw_json(ui, cx, module, &path).is_some();
            }
        }
        match module_kind {
            Some(AreaModuleKind::Scenery) => changed |= scenery_rows(ui, module, &path),
            Some(AreaModuleKind::Population) => {
                if let Some(view) = view {
                    let preview = view
                        .population_previews
                        .entry(module.to_string())
                        .or_default();
                    widgets::kv(ui, "preview", |ui| {
                        let mut shown = !preview.hidden;
                        if ui.checkbox(&mut shown, "").changed() {
                            preview.hidden = !shown;
                        }
                        if controls::marked(ui, Mark::Reload, "Re-roll").clicked() {
                            preview.seed = preview.seed.wrapping_add(1);
                        }
                    });
                }
            }
            _ => {}
        }
    });
    match module_kind {
        Some(AreaModuleKind::Scenery) => scenery_extras(ui, cx, module, out, node),
        Some(AreaModuleKind::Blueprint) => {
            if let Some(blueprint) = module["blueprint"].as_str().map(str::to_owned)
                && content
                    .as_ref()
                    .and_then(|c| {
                        c.by_path::<BlueprintDef>(&blueprint)
                            .map(|id| !id.get(c).variables.is_empty())
                    })
                    .unwrap_or(false)
            {
                widgets::section(ui, &format!("Values · {}", file_title(&blueprint)));
                widgets::card_frame(false).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    widgets::card_title(ui, "values");
                    ui.add_space(4.0);
                    changed |= placement::placement_card(ui, cx, content.as_ref(), module, &path);
                });
            }
            placement_extras(ui, cx, module, out, node);
        }
        Some(AreaModuleKind::Population | AreaModuleKind::Resident) => from_npc(ui, cx, module),
        Some(AreaModuleKind::Object) => {
            ui.add_space(4.0);
            changed |= crate::ui::row_form::scripts::script_cards(
                ui, cx, "area", module, "scripts", &path,
            )
            .is_some();
            object_extras(ui, module, out, node);
        }
        Some(AreaModuleKind::Soundscape) => changed |= soundscape_extras(ui, cx, module, &path),
        Some(AreaModuleKind::Script) if table_of(bundle) == Some(BlueprintDef::TABLE) => {
            widgets::hint(
                ui,
                "In a blueprint, this script runs once for each placement.",
            );
        }
        _ => {}
    }
    changed
}

#[derive(Default)]
pub(super) struct Followups {
    pub actions: Vec<super::AreaAction>,
}

pub(super) fn hidden_fields(kind: Option<AreaModuleKind>) -> &'static [&'static str] {
    match kind {
        Some(AreaModuleKind::Scenery) => &["type", "tiles", "sort", "blocks"],
        Some(AreaModuleKind::Blueprint) => &["type", "values"],
        Some(AreaModuleKind::Object) => &["type", "scripts"],
        Some(AreaModuleKind::Soundscape) => &["type", "channels"],
        _ => &["type"],
    }
}

fn object_extras(ui: &mut Ui, module: &Value, out: &mut Followups, node: &str) {
    let destinations = placement::warp_destinations(module);
    if destinations.is_empty() {
        return;
    }
    ui.add_space(4.0);
    ui.horizontal_wrapped(|ui| {
        for (area, at) in &destinations {
            let where_ = format!("{area} · {}, {}", forms::tiles(at.x), forms::tiles(at.y));
            if ui
                .button("→ Go to destination")
                .on_hover_text(where_)
                .clicked()
            {
                out.actions.push(super::AreaAction::GoTo(area.clone(), *at));
            }
        }
        let hint = "An object with script/warp leading back here, on the nearest walkable cell outside the destination";
        if ui.button("← Return door").on_hover_text(hint).clicked() {
            out.actions.push(super::AreaAction::ReturnDoor(node.to_owned()));
        }
    });
}

fn brush_size_field(ui: &mut Ui, brush: &mut BrushSettings, square: bool) -> bool {
    let mut changed = false;
    let unit = match (square, brush.size) {
        (true, _) => "tiles",
        (false, 1) => "corner",
        (false, _) => "corners",
    };
    forms::boxed_input(ui, Some(unit), |ui| {
        let mut text = if square {
            format!("{} × {}", brush.size, brush.size)
        } else {
            brush.size.to_string()
        };
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
            let size = first.clamp(1, 9);
            if size != brush.size {
                brush.size = size;
                changed = true;
            }
        }
        response
    });
    changed
}

/// The labels of the folders above the node at `pointer`, outermost first.
fn folders_above(scene: &Value, pointer: &str) -> Vec<String> {
    let mut labels: Vec<String> = std::iter::successors(nodes::place_of(pointer), |(folder, _)| {
        nodes::place_of(folder)
    })
    .map(|(folder, _)| folder)
    .take_while(|folder| !folder.is_empty())
    .filter_map(|folder| scene.pointer(folder).map(super::shapes::node_label))
    .collect();
    labels.reverse();
    labels
}

/// Which folders the modules at `pointers` sit in, said in a line.
fn spans(scene: &Value, pointers: &[String]) -> String {
    let mut folders: Vec<String> = Vec::new();
    for pointer in pointers {
        let folder = nodes::place_of(pointer).map_or("", |(folder, _)| folder);
        let label = match folder {
            "" => "the top level".to_owned(),
            folder => scene
                .pointer(folder)
                .map(super::shapes::node_label)
                .unwrap_or_default(),
        };
        if !folders.contains(&label) {
            folders.push(label);
        }
    }
    let shown = match folders.as_slice() {
        [] => String::new(),
        [one] => one.clone(),
        [first @ .., last] if folders.len() <= 3 => format!("{} and {last}", first.join(", ")),
        [a, b, rest @ ..] => format!("{a}, {b} and {} more folders", rest.len()),
    };
    format!("In {shown}")
}
