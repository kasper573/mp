use egui::{RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::TilesetDialog;
use crate::app::Editor;
use crate::project::{Edit, row_file};
use crate::ui::{theme, widgets};
use crate::views::model::sounds;

const CARD: Vec2 = Vec2::new(190.0, 120.0);

/// The SURFACES tab: every surface with its footstep's shape, tile count and loudness.
pub fn bottom(editor: &mut Editor, ui: &mut Ui, key: &str, _row: &Value) {
    let surfaces = sounds::surfaces(editor);
    let brush = editor.views.tileset.views[key].surface.clone();
    let mut pick = None;
    let mut play = None;
    let mut new = false;
    ui.add_space(6.0);
    ui.horizontal_top(|ui| {
        ui.spacing_mut().item_spacing = Vec2::new(10.0, 10.0);
        for (surface, name, footstep) in &surfaces {
            let on = brush.as_deref() == Some(surface);
            let wave = sounds::wave_of_sfx(editor, footstep);
            let (tiles, tilesets) = editor
                .views
                .tileset
                .counts
                .as_ref()
                .and_then(|counts| counts.surfaces.get(surface))
                .map(|(tiles, tilesets)| (*tiles, tilesets.len()))
                .unwrap_or((0, 0));
            let (volume, gain) = sounds::volume_of(editor, footstep);
            let _ = volume;
            let response = widgets::card_frame(on)
                .show(ui, |ui| {
                    ui.vertical(|ui| {
                        ui.set_width(CARD.x);
                        ui.set_min_height(CARD.y);
                        ui.horizontal(|ui| {
                            ui.label(theme::strong(name.to_lowercase()));
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if widgets::chip(ui, "▶").clicked() {
                                        play = Some(footstep.clone());
                                    }
                                },
                            );
                        });
                        let (rect, _) =
                            ui.allocate_exact_size(Vec2::new(CARD.x - 8.0, 30.0), Sense::hover());
                        if let Some(wave) = &wave {
                            sounds::draw_wave(ui.painter(), rect, &wave.bins, theme::WARN);
                        }
                        ui.label(
                            theme::muted(format!(
                                "{} tiles in {tilesets} tilesets",
                                thousands(tiles)
                            ))
                            .size(12.0),
                        );
                        let loudness = wave
                            .as_ref()
                            .and_then(|wave| wave.loudness)
                            .map(|loudness| {
                                let level =
                                    loudness.loudest + 20.0 * (gain as f64).max(1e-6).log10();
                                format!("{level:.1} LUFS")
                            })
                            .unwrap_or_else(|| "not measured".to_owned());
                        ui.label(theme::faint(format!("{footstep} · {loudness}")).size(11.5));
                    });
                })
                .response
                .interact(Sense::click());
            if response.clicked() {
                pick = Some(surface.clone());
            }
        }
    });
    ui.add_space(6.0);
    if ui.button("+ New surface").clicked() {
        new = true;
    }
    if let Some(surface) = pick {
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.surface = Some(surface);
    }
    if let Some(footstep) = play {
        editor
            .views
            .model
            .play
            .push(sounds::PlayRequest::Sfx(footstep));
    }
    if new {
        let footstep = sounds::first_sfx(editor).unwrap_or_default();
        let view = editor
            .views
            .tileset
            .views
            .get_mut(key)
            .expect("the view exists");
        view.dialog = Some(TilesetDialog::NewSurface {
            name: String::new(),
            footstep,
            error: None,
        });
    }
}

/// A surface's card: its name, footstep and how its loudest moment sits in the mix.
pub fn card(editor: &mut Editor, ui: &mut Ui, surface: &str) {
    let Some(mut row) = editor.row_value("surface", surface) else {
        return;
    };
    widgets::section(ui, &format!("surface/{surface}"));
    let name = row["name"].as_str().unwrap_or_default().to_owned();
    let footstep = row["footstep"].as_str().unwrap_or_default().to_owned();
    let mut new_name = None;
    let mut new_footstep: Option<String> = None;
    let mut play = false;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "surface", &name, "first-class", |_| {});
        ui.add_space(4.0);
        widgets::kv(ui, "name", |ui| {
            let id = ui.id().with(("surface-name", surface));
            let mut draft = ui
                .memory(|m| m.data.get_temp::<String>(id))
                .unwrap_or_else(|| name.clone());
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(egui::TextEdit::singleline(&mut draft).desired_width(160.0))
            });
            if crate::forms::committed(ui, &response) {
                if draft.trim() != name && !draft.trim().is_empty() {
                    new_name = Some(draft.trim().to_owned());
                }
                ui.memory_mut(|m| m.data.remove::<String>(id));
            } else if response.has_focus() {
                ui.memory_mut(|m| m.data.insert_temp(id, draft));
            } else {
                ui.memory_mut(|m| m.data.remove::<String>(id));
            }
        });
        widgets::kv(ui, "footstep", |ui| {
            if widgets::chip(ui, "▶").clicked() {
                play = true;
            }
            let mut picked = footstep.clone();
            if sfx_picker(editor, ui, surface, &mut picked)
                && !picked.is_empty()
                && picked != footstep
            {
                new_footstep = Some(picked);
            }
        });
    });
    let wave = sounds::wave_of_sfx(editor, &footstep);
    let (rect, _) =
        ui.allocate_exact_size(Vec2::new(ui.available_width() - 8.0, 36.0), Sense::hover());
    if let Some(wave) = &wave {
        sounds::draw_wave(ui.painter(), rect, &wave.bins, theme::WARN);
    }
    let (_, gain) = sounds::volume_of(editor, &footstep);
    match wave.as_ref().and_then(|wave| wave.loudness) {
        Some(loudness) => {
            let verdict = sounds::verdict(loudness, gain, sounds::Role::Movement);
            ui.horizontal_top(|ui| {
                ui.add_sized(
                    Vec2::new(96.0, ui.spacing().interact_size.y),
                    egui::Label::new(theme::muted("loudness")),
                );
                ui.vertical(|ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal_wrapped(|ui| {
                        ui.label(
                            RichText::new(if verdict.ok { "✓" } else { "!" })
                                .color(if verdict.ok { theme::OK } else { theme::WARN }),
                        );
                        ui.label(RichText::new(&verdict.loudness).size(12.5));
                    });
                });
            });
        }
        None => widgets::kv_text(ui, "loudness", "not measured"),
    }
    let (tiles, tilesets) = editor
        .views
        .tileset
        .counts
        .as_ref()
        .and_then(|counts| counts.surfaces.get(surface))
        .map(|(tiles, tilesets)| (*tiles, tilesets.len()))
        .unwrap_or((0, 0));
    widgets::kv_text(
        ui,
        "used on",
        format!("{} tiles in {tilesets} tilesets", thousands(tiles)),
    );
    if play {
        editor
            .views
            .model
            .play
            .push(sounds::PlayRequest::Sfx(footstep.clone()));
    }
    if let Some(name) = new_name {
        row["name"] = Value::String(name.clone());
        let mut edit = Edit::new(format!("Name surface {surface} {name}"));
        edit.write_json(row_file("surface", surface), &row);
        editor.apply(edit);
    }
    if let Some(footstep) = new_footstep {
        row["footstep"] = Value::String(footstep.clone());
        let mut edit = Edit::new(format!("Footstep {footstep} for surface {surface}"));
        edit.write_json(row_file("surface", surface), &row);
        editor.apply(edit);
    }
}

fn sfx_picker(editor: &mut Editor, ui: &mut Ui, surface: &str, sound: &mut String) -> bool {
    let Some(root) = editor.row_value("surface", surface) else {
        return false;
    };
    let mut actions = Vec::new();
    let changed = {
        let Editor {
            project,
            form,
            shapes,
            ..
        } = editor;
        let Some(project) = project.as_ref() else {
            return false;
        };
        let mut cx = crate::forms::FormCx {
            root: &root,
            content: project.content,
            files: &project.files,
            usages: &project.usages,
            shapes,
            state: form,
            actions: &mut actions,
            speaker: None,
            owner_table: Some("surface".to_owned()),
            owner_key: Some(surface.to_owned()),
        };
        crate::picker::row(ui, &mut cx, "sfx", sound, "/footstep")
    };
    for action in actions {
        if let crate::forms::FormAction::OpenRow { table, key } = action {
            editor.select(crate::project::Selection::row(&table, &key));
            editor.open_tab(crate::tabs::Tab::for_row(&table, &key));
        }
    }
    changed
}

#[allow(clippy::too_many_arguments)]
pub fn new_surface_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    key: &str,
    mut name: String,
    mut footstep: String,
    error: Option<String>,
    next: &mut Option<TilesetDialog>,
) {
    let sounds = sounds::sfx_keys(editor);
    let mut decision = None;
    crate::ui::dialogs::card(ctx, "new-surface", 400.0, |ui| {
        ui.label(RichText::new("New surface").size(16.0).strong());
        ui.add_space(6.0);
        ui.label(theme::muted(
            "A name and a footstep: every tile painted with it sounds like this.",
        ));
        ui.add_space(8.0);
        widgets::kv(ui, "name", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(egui::TextEdit::singleline(&mut name).desired_width(200.0))
            });
            response.request_focus();
        });
        widgets::kv(ui, "footstep", |ui| {
            egui::ComboBox::from_id_salt("new-surface-footstep")
                .selected_text(theme::mono(&footstep))
                .width(200.0)
                .show_ui(ui, |ui| {
                    for sfx in &sounds {
                        ui.selectable_value(&mut footstep, sfx.clone(), theme::mono(sfx));
                    }
                });
        });
        if let Some(error) = &error {
            ui.label(RichText::new(error).color(theme::DANGER).size(12.5));
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Add surface").clicked() {
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
            *next = Some(TilesetDialog::NewSurface {
                name,
                footstep,
                error,
            })
        }
        Some(false) => *next = None,
        Some(true) => {
            let wanted = name.trim().to_lowercase().replace(' ', "_");
            let problem = editor
                .project
                .as_ref()
                .and_then(|project| crate::rows::key_problem(&project.files, "surface", &wanted));
            if let Some(problem) = problem {
                *next = Some(TilesetDialog::NewSurface {
                    name,
                    footstep,
                    error: Some(problem),
                });
                return;
            }
            let row = serde_json::json!({ "name": name.trim(), "footstep": footstep });
            let mut edit = Edit::new(format!("New surface {wanted}"));
            edit.write_json(row_file("surface", &wanted), &row);
            if editor.apply(edit) {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(key)
                    .expect("the view exists");
                view.surface = Some(wanted);
                *next = None;
            } else {
                *next = Some(TilesetDialog::NewSurface {
                    name,
                    footstep,
                    error: Some("the folder refused it".to_owned()),
                });
            }
        }
    }
}

pub fn thousands(n: usize) -> String {
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
