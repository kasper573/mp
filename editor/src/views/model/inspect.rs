use egui::{Color32, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::{ACTIONS, CueKind, DIRECTIONS, FrameData, MAX_FRAME_MS, Page, strip::SetBy, strip_of};
use crate::app::Editor;
use crate::forms::{FormAction, FormCx};
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
    let page = editor.views.model.views[&key].page;
    if let Some(rest) = part.strip_prefix("/sprites/actions/") {
        let bits: Vec<&str> = rest.split('/').collect();
        let (Some(action), Some(direction)) = (
            bits.first()
                .and_then(|a| ACTIONS.iter().position(|n| n == a)),
            bits.get(1)
                .and_then(|d| DIRECTIONS.iter().position(|n| n == d)),
        ) else {
            return;
        };
        let frames = strip_of(&row, ACTIONS[action], DIRECTIONS[direction]);
        let crumb = format!(
            "model/{key} › {} · {}",
            ACTIONS[action], DIRECTIONS[direction]
        );
        egui::ScrollArea::vertical()
            .id_salt(("model-inspect", &key))
            .show(ui, |ui| {
                if page == Page::Matrix {
                    crate::ui::inspector::show_row(editor, ui, super::TABLE, &key);
                    ui.add_space(8.0);
                }
                match (
                    bits.get(2).and_then(|i| i.parse::<usize>().ok()),
                    bits.get(3),
                ) {
                    (Some(index), Some(cue)) => {
                        if let Some(kind) = CueKind::of(cue) {
                            ui.label(
                                theme::mono(format!("{crumb} › frame {}", index + 1))
                                    .color(theme::CODE)
                                    .size(12.0),
                            );
                            cue_card(editor, ui, &key, &frames, action, direction, index, kind);
                        }
                    }
                    (Some(index), None) if selection.parts.len() == 1 => {
                        widgets::section(
                            ui,
                            &format!(
                                "{} · {} · frame {}",
                                ACTIONS[action],
                                DIRECTIONS[direction],
                                index + 1
                            ),
                        );
                        frame_card(editor, ui, &key, &frames, action, direction, index);
                        keys_card(ui);
                    }
                    (Some(_), None) => {
                        let indices: Vec<usize> = selection
                            .parts
                            .iter()
                            .filter_map(|part| part.rsplit('/').next()?.parse().ok())
                            .collect();
                        ui.label(
                            theme::mono(format!(
                                "{crumb} › frames {}",
                                indices
                                    .iter()
                                    .map(|i| (i + 1).to_string())
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ))
                            .color(theme::CODE)
                            .size(12.0),
                        );
                        frames_card(editor, ui, &key, &frames, action, direction, &indices);
                        keys_card(ui);
                    }
                    _ => {
                        strip_card(editor, ui, &key, &row, &frames, action, direction);
                    }
                }
            });
        return;
    }
    if part == "/hitbox" {
        egui::ScrollArea::vertical()
            .id_salt(("model-inspect", &key))
            .show(ui, |ui| {
                crate::ui::inspector::show_row(editor, ui, super::TABLE, &key);
            });
        return;
    }
    if part.starts_with("/modules/") {
        let faces = super::busts::faces(&row);
        if let Some(face) = faces.iter().find(|face| face.pointer == part).cloned() {
            egui::ScrollArea::vertical()
                .id_salt(("model-inspect", &key))
                .show(ui, |ui| {
                    face_card(editor, ui, &key, &row, &face, &faces);
                });
        }
    }
}

fn strip_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    frames: &[FrameData],
    action: usize,
    direction: usize,
) {
    let timing = super::action_timing(row, ACTIONS[action]);
    widgets::section(
        ui,
        &format!("{} · {}", ACTIONS[action], DIRECTIONS[direction]),
    );
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::kv_text(ui, "frames", frames.len().to_string());
        widgets::kv_text(ui, "lasts", format!("{} ms", super::total_ms(frames)));
        widgets::kv_text(ui, "plays", super::play_rule_long(ACTIONS[action]));
        let cues: Vec<String> = frames
            .iter()
            .enumerate()
            .flat_map(|(index, frame)| {
                frame.cues().into_iter().map(move |cue| match cue {
                    CueKind::Sound => format!(
                        "{} on frame {}",
                        frame.sound.clone().unwrap_or_default(),
                        index + 1
                    ),
                    other => format!("{} on frame {}", other.key(), index + 1),
                })
            })
            .collect();
        widgets::kv_text(
            ui,
            "cues",
            if cues.is_empty() {
                "none".to_owned()
            } else {
                cues.join(" · ")
            },
        );
        if timing.differing.contains(&direction) && timing.differing.len() < DIRECTIONS.len() {
            ui.horizontal(|ui| {
                ui.label(RichText::new("!").color(theme::WARN).strong());
                ui.label(theme::muted(format!(
                    "out of step: the action's other directions last {} ms over {} frames",
                    timing.common.iter().sum::<u32>(),
                    timing.common.len()
                )));
            });
        }
        ui.add_space(4.0);
        if widgets::keyed_button(ui, "Open in the animation editor", "Enter", true).clicked() {
            super::matrix::open_strip(editor, key, action, direction);
        }
    });
}

fn frame_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    index: usize,
) {
    let Some(frame) = frames.get(index).cloned() else {
        return;
    };
    let mut changed = frame.clone();
    let mut label = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "frame", "frame", "", |_| {});
        ui.add_space(4.0);
        widgets::kv(ui, "lasts", |ui| {
            let mut text = frame.ms.to_string();
            let response = crate::forms::boxed_input(ui, Some("ms"), |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut text)
                        .desired_width(60.0)
                        .font(egui::TextStyle::Monospace),
                )
            });
            if crate::forms::committed(ui, &response)
                && let Ok(ms) = text.trim().parse::<u32>()
                && (1..=MAX_FRAME_MS).contains(&ms)
                && ms != frame.ms
            {
                changed.ms = ms;
                label = Some(format!(
                    "Retime frame {} of {} · {} of {key}",
                    index + 1,
                    ACTIONS[action],
                    DIRECTIONS[direction]
                ));
            }
        });
        widgets::kv(ui, "apex", |ui| {
            let mut on = frame.apex;
            if widgets::toggle(ui, &mut on).changed() {
                changed.apex = on;
                label = Some(if on {
                    format!(
                        "Apex on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                } else {
                    format!(
                        "No apex on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                });
            }
            ui.label(theme::muted(if ACTIONS[action] == "attack" {
                "the hit lands here"
            } else {
                "only attack strips land a hit"
            }));
        });
        widgets::kv(ui, "sound", |ui| {
            let mut sound = frame.sound.clone().unwrap_or_default();
            if sound_picker(
                editor,
                ui,
                key,
                &mut sound,
                &format!(
                    "/sprites/actions/{}/{}/{index}/sound",
                    ACTIONS[action], DIRECTIONS[direction]
                ),
            ) {
                changed.sound = (!sound.is_empty()).then_some(sound.clone());
                label = Some(if sound.is_empty() {
                    format!(
                        "No sound on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                } else {
                    format!(
                        "Sound {sound} on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                });
            }
        });
        widgets::kv(ui, "step", |ui| {
            let mut on = frame.step;
            if widgets::toggle(ui, &mut on).changed() {
                changed.step = on;
                label = Some(if on {
                    format!(
                        "Step on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                } else {
                    format!(
                        "No step on frame {} of {} · {} of {key}",
                        index + 1,
                        ACTIONS[action],
                        DIRECTIONS[direction]
                    )
                });
            }
        });
    });
    if let Some(label) = label {
        let mut written = frames.to_vec();
        if changed.apex && !frame.apex {
            for other in &mut written {
                other.apex = false;
            }
        }
        written[index] = changed;
        super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &written,
            label,
            false,
        );
    }
}

fn frames_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    indices: &[usize],
) {
    let (set_by, text) = {
        let view = &editor.views.model.views[key];
        (view.timing.set_by, view.timing.text.clone())
    };
    let mut new_set_by = set_by;
    let mut new_text = text.clone();
    let mut apply = false;
    let planned = plan(frames, indices, set_by, &text);
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(
            ui,
            "frame",
            &format!("{} frames", indices.len()),
            "",
            |_| {},
        );
        ui.add_space(4.0);
        widgets::kv(ui, "set by", |ui| {
            for (option, label) in [
                (SetBy::Ms, "ms each"),
                (SetBy::Fps, "fps"),
                (SetBy::Scale, "scale"),
            ] {
                let on = set_by == option;
                let (fill, ink) = if on {
                    (theme::ACCENT, Color32::WHITE)
                } else {
                    (theme::RAISED, theme::TEXT)
                };
                if widgets::chip_coloured(ui, label, fill, ink).clicked() {
                    new_set_by = option;
                    new_text.clear();
                }
            }
        });
        let (name, unit) = match set_by {
            SetBy::Ms => ("ms each", "ms"),
            SetBy::Fps => ("fps", "fps"),
            SetBy::Scale => ("scale", "×"),
        };
        widgets::kv(ui, name, |ui| {
            let response = crate::forms::boxed_input(ui, Some(unit), |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut new_text)
                        .desired_width(80.0)
                        .font(egui::TextStyle::Monospace)
                        .hint_text(match set_by {
                            SetBy::Ms => "100",
                            SetBy::Fps => "10",
                            SetBy::Scale => "1.25",
                        }),
                )
            });
            if crate::forms::committed(ui, &response) {
                apply = true;
            }
        });
        for index in indices {
            if let Some(frame) = frames.get(*index) {
                let after = planned.as_ref().and_then(|p| p.get(index)).copied();
                widgets::kv_text(
                    ui,
                    &format!("frame {}", index + 1),
                    match after {
                        Some(after) if after != frame.ms => format!("{} → {after} ms", frame.ms),
                        _ => format!("{} ms", frame.ms),
                    },
                );
            }
        }
        let before = super::total_ms(frames);
        let after = planned.as_ref().map(|p| {
            frames
                .iter()
                .enumerate()
                .map(|(i, frame)| p.get(&i).copied().unwrap_or(frame.ms))
                .sum::<u32>()
        });
        widgets::kv_text(
            ui,
            "strip",
            match after {
                Some(after) if after != before => format!("{before} → {after} ms"),
                _ => format!("{before} ms"),
            },
        );
    });
    if apply && let Some(planned) = plan(frames, indices, set_by, &new_text) {
        let mut written = frames.to_vec();
        for (index, ms) in &planned {
            if let Some(frame) = written.get_mut(*index) {
                frame.ms = *ms;
            }
        }
        if super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &written,
            format!(
                "Retime frames {} of {} · {} of {key}",
                indices
                    .iter()
                    .map(|i| (i + 1).to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                ACTIONS[action],
                DIRECTIONS[direction]
            ),
            false,
        ) {
            new_text.clear();
        }
    }
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    view.timing.set_by = new_set_by;
    view.timing.text = new_text;
}

fn plan(
    frames: &[FrameData],
    indices: &[usize],
    set_by: SetBy,
    text: &str,
) -> Option<std::collections::HashMap<usize, u32>> {
    let value: f64 = text.trim().trim_start_matches('×').trim().parse().ok()?;
    if value <= 0.0 {
        return None;
    }
    let mut out = std::collections::HashMap::new();
    for index in indices {
        let frame = frames.get(*index)?;
        let ms = match set_by {
            SetBy::Ms => value.round(),
            SetBy::Fps => (1000.0 / value + 0.5).floor(),
            SetBy::Scale => (frame.ms as f64 * value).round(),
        };
        out.insert(*index, (ms.max(1.0) as u32).min(MAX_FRAME_MS));
    }
    Some(out)
}

fn keys_card(ui: &mut Ui) {
    widgets::section(ui, "Keys");
    widgets::key_hint_text(ui, "Alt ← →", "10 ms shorter or longer");
    widgets::key_hint_text(ui, "Shift Alt ← →", "1 ms");
    widgets::key_hint_text(ui, "Ctrl ← →", "move the frame");
    widgets::key_hint_text(ui, "Ctrl D", "duplicate it");
    widgets::key_hint_text(ui, "Del", "remove it; the step names its cues");
    widgets::key_hint_text(ui, "A · S · T", "apex, sound, step on the frame");
}

#[allow(clippy::too_many_arguments)]
fn cue_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    frames: &[FrameData],
    action: usize,
    direction: usize,
    index: usize,
    kind: CueKind,
) {
    let Some(frame) = frames.get(index).cloned() else {
        return;
    };
    let starts = super::starts_at(frames, index);
    let total = super::total_ms(frames);
    let mut remove = false;
    let mut new_sound: Option<String> = None;
    let mut play = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "cue", kind.key(), "", |ui| {
            if ui.button("Remove this cue").clicked() {
                remove = true;
                ui.close();
            }
        });
        ui.add_space(4.0);
        match kind {
            CueKind::Sound => {
                let sound = frame.sound.clone().unwrap_or_default();
                widgets::kv(ui, "sound", |ui| {
                    if widgets::chip(ui, "▶").on_hover_text("Play the sound at its row's volume").clicked() {
                        play = Some(sound.clone());
                    }
                    let mut picked = sound.clone();
                    if sound_picker(editor, ui, key, &mut picked, &format!("/sprites/actions/{}/{}/{index}/sound", ACTIONS[action], DIRECTIONS[direction])) && !picked.is_empty() {
                        new_sound = Some(picked);
                    }
                });
                widgets::kv_text(ui, "on frame", format!("{} · starts at {starts} ms", index + 1));
                let (volume_text, gain) = super::sounds::volume_of(editor, &sound);
                widgets::kv_text(ui, "volume", volume_text);
                widgets::kv_text(ui, "pitch", super::sounds::pitch_of(editor, &sound));
                let wave = super::sounds::wave_of_sfx(editor, &sound);
                ui.add_space(4.0);
                let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width() - 8.0, 44.0), Sense::hover());
                match &wave {
                    Some(wave) => {
                        super::sounds::draw_wave(ui.painter(), rect, &wave.bins, theme::ACCENT);
                    }
                    None => {
                        ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, "no file to measure", egui::FontId::proportional(12.0), theme::MUTED);
                    }
                }
                widgets::section(ui, "Against the mix, at its loudest");
                let file = super::sounds::sfx_file(editor, &sound).unwrap_or_default();
                let role = super::sounds::Role::of_path(&file);
                match wave.as_ref().and_then(|wave| wave.loudness) {
                    Some(loudness) => {
                        let verdict = super::sounds::verdict(loudness, gain, role);
                        verdict_row(ui, "loudness", verdict.ok, &verdict.loudness);
                        verdict_row(ui, "peak", verdict.peak_ok, &verdict.peak);
                    }
                    None => widgets::kv_text(ui, "loudness", "not measured"),
                }
                if let Some(wave) = &wave {
                    let left = total.saturating_sub(starts);
                    let heard = if wave.ms > left {
                        format!("{left} of its {} ms, past the strip's end", wave.ms)
                    } else {
                        format!("all of its {} ms, within the strip", wave.ms)
                    };
                    kv_wrapped(ui, "heard for", &heard);
                }
            }
            CueKind::Apex => {
                widgets::kv_text(ui, "on frame", format!("{} · {starts} ms into the swing", index + 1));
                widgets::kv_text(ui, "lands", "the hit, on server and client, when the swing reaches this frame");
                if ACTIONS[action] != "attack" {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("!").color(theme::WARN).strong());
                        ui.label(theme::muted("an apex belongs in attack strips only; the folder will not load with it here"));
                    });
                }
            }
            CueKind::Step => {
                widgets::kv_text(ui, "on frame", format!("{} · {starts} ms in", index + 1));
                widgets::kv_text(ui, "plays", "the footstep of the surface underfoot; one per update however many steps pass");
                ui.add_space(4.0);
                ui.label(theme::muted("hear it on").size(12.0));
                let chosen = editor.views.model.views[key].surface.clone();
                let surfaces = super::sounds::surfaces(editor);
                let mut pick_surface = None;
                for (surface, name, footstep) in &surfaces {
                    ui.horizontal(|ui| {
                        let on = chosen.as_deref() == Some(surface);
                        let (fill, ink) = if on { (theme::ACCENT, Color32::WHITE) } else { (theme::RAISED, theme::TEXT) };
                        if widgets::chip_coloured(ui, "▶", fill, ink).clicked() {
                            pick_surface = Some((surface.clone(), footstep.clone()));
                        }
                        ui.label(theme::mono(name.to_lowercase()).size(12.5));
                    });
                }
                if let Some((surface, footstep)) = pick_surface {
                    let view = editor.views.model.views.get_mut(key).expect("the view exists");
                    view.surface = Some(surface);
                    play = Some(footstep);
                }
            }
        }
    });
    ui.add_space(8.0);
    if ui.button("Copy cues to the other 7 directions…").clicked() {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.confirm = Some(super::strip::Confirm::Cues);
    }
    if let Some(sound) = play {
        editor
            .views
            .model
            .play
            .push(super::sounds::PlayRequest::Sfx(sound));
    }
    if let Some(sound) = new_sound {
        let mut written = frames.to_vec();
        written[index].sound = Some(sound.clone());
        if super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &written,
            format!(
                "Sound {sound} on frame {} of {} · {} of {key}",
                index + 1,
                ACTIONS[action],
                DIRECTIONS[direction]
            ),
            false,
        ) {
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
            view.last_sound = Some(sound);
        }
    }
    if remove {
        let mut written = frames.to_vec();
        match kind {
            CueKind::Apex => written[index].apex = false,
            CueKind::Sound => written[index].sound = None,
            CueKind::Step => written[index].step = false,
        }
        if super::write_strip(
            editor,
            key,
            ACTIONS[action],
            DIRECTIONS[direction],
            &written,
            format!(
                "No {} on frame {} of {} · {} of {key}",
                kind.key(),
                index + 1,
                ACTIONS[action],
                DIRECTIONS[direction]
            ),
            false,
        ) {
            let view = editor
                .views
                .model
                .views
                .get_mut(key)
                .expect("the view exists");
            view.cue = None;
            super::select_frames(editor, key, action, direction);
        }
    }
}

fn kv_wrapped(ui: &mut Ui, label: &str, text: &str) {
    ui.horizontal_top(|ui| {
        ui.add_sized(
            Vec2::new(96.0, ui.spacing().interact_size.y),
            egui::Label::new(theme::muted(label)),
        );
        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(text).size(12.5));
        });
    });
}

fn verdict_row(ui: &mut Ui, label: &str, ok: bool, text: &str) {
    ui.horizontal_top(|ui| {
        ui.add_sized(
            Vec2::new(96.0, ui.spacing().interact_size.y),
            egui::Label::new(theme::muted(label)),
        );
        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            ui.horizontal_wrapped(|ui| {
                ui.label(RichText::new(if ok { "✓" } else { "!" }).color(if ok {
                    theme::OK
                } else {
                    theme::WARN
                }));
                ui.label(RichText::new(text).size(12.5));
            });
        });
    });
}

fn sound_picker(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    sound: &mut String,
    path: &str,
) -> bool {
    let Some(root) = editor.row_value(super::TABLE, key) else {
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
        let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
        cx.owner_table = Some(super::TABLE.to_owned());
        cx.owner_key = Some(key.to_owned());
        crate::picker::row(ui, &mut cx, "sfx", sound, path)
    };
    for action in actions {
        if let FormAction::OpenRow {
            table,
            key: row_key,
        } = action
        {
            editor.select(Selection::row(&table, &row_key));
            editor.open_tab(crate::tabs::Tab::for_row(&table, &row_key));
        }
    }
    changed
}

fn face_card(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    row: &Value,
    face: &super::busts::Face,
    faces: &[super::busts::Face],
) {
    ui.label(
        theme::mono(format!("model/{key} › bust › {}", face.name))
            .color(theme::CODE)
            .size(12.0),
    );
    ui.add_space(4.0);
    let ctx = ui.ctx().clone();
    let sizes: Vec<(String, Option<[usize; 2]>)> = faces
        .iter()
        .map(|other| {
            let Editor { project, form, .. } = editor;
            let size = project
                .as_ref()
                .and_then(|project| form.thumbnails.image(&ctx, &project.files, &other.file))
                .map(|thumb| thumb.size);
            (other.name.clone(), size)
        })
        .collect();
    let own_size = sizes
        .iter()
        .find(|(name, _)| *name == face.name)
        .and_then(|(_, size)| *size);
    let mut rename_to: Option<String> = None;
    let mut remove_with: Option<String> = None;
    let mut new_file: Option<String> = None;
    let lines = super::busts::lines(editor, key);
    let uses_of_face = lines.iter().filter(|line| line.face == face.name).count();
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "bust", &face.name, if face.own.is_some() { "" } else { "generic" }, |ui| {
            if face.own.is_some() && ui.button("Remove this face…").clicked() {
                remove_with = Some(String::new());
                ui.close();
            }
        });
        ui.add_space(4.0);
        widgets::kv(ui, "name", |ui| {
            if face.own.is_some() {
                let id = ui.id().with(("face-name", &face.pointer));
                let mut draft = ui.memory(|m| m.data.get_temp::<String>(id)).unwrap_or_else(|| face.name.clone());
                let response = crate::forms::boxed_input(ui, None, |ui| {
                    ui.add(egui::TextEdit::singleline(&mut draft).desired_width(140.0).font(egui::TextStyle::Monospace))
                });
                if crate::forms::committed(ui, &response) {
                    let wanted = draft.trim().to_owned();
                    if !wanted.is_empty() && wanted != face.name {
                        rename_to = Some(wanted);
                    }
                    ui.memory_mut(|m| m.data.remove::<String>(id));
                } else if response.has_focus() {
                    ui.memory_mut(|m| m.data.insert_temp(id, draft));
                } else {
                    ui.memory_mut(|m| m.data.remove::<String>(id));
                }
            } else {
                ui.label(theme::mono(&face.name));
                ui.label(theme::faint("one of the six every bust has"));
            }
        });
        widgets::kv(ui, "file", |ui| {
            let mut file = face.file.clone();
            if asset_picker(editor, ui, key, &mut file, &format!("{}/file", face.pointer)) && file != face.file {
                new_file = Some(file);
            }
        });
        widgets::kv_text(
            ui,
            "size",
            match own_size {
                Some(size) => {
                    let others: Vec<&(String, Option<[usize; 2]>)> = sizes
                        .iter()
                        .filter(|(name, other)| *name != face.name && other.is_some())
                        .collect();
                    let same = others.iter().all(|(_, other)| *other == Some(size));
                    if others.is_empty() {
                        format!("{} × {}", size[0], size[1])
                    } else if same {
                        format!("{} × {} · same as the others", size[0], size[1])
                    } else {
                        let (name, other) = others.iter().find(|(_, other)| *other != Some(size)).expect("one differs");
                        let other = other.expect("a size");
                        format!("{} × {} · differs from {name} ({} × {}); every bust of one model is one size", size[0], size[1], other[0], other[1])
                    }
                }
                None => "missing file".to_owned(),
            },
        );
    });
    let own_lines: Vec<&super::busts::FaceLine> = lines
        .iter()
        .filter(|line| faces.iter().any(|f| f.own.is_some() && f.name == line.face))
        .collect();
    let title = super::users(editor, key)
        .first()
        .and_then(|(table, user)| {
            editor
                .row_value(table, user)
                .and_then(|row| row["name"].as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| key.to_owned());
    widgets::section_count(
        ui,
        &format!("Lines with {title}'s own faces"),
        own_lines.len(),
    );
    let shown = 6;
    let mut open = None;
    for line in own_lines.iter().take(shown) {
        ui.horizontal(|ui| {
            let (table, row_key) = crate::project::row_of(&line.file).unwrap_or(("", ""));
            widgets::badge(ui, table);
            if ui
                .link(theme::mono(format!("{table}/{row_key}")).size(12.5))
                .clicked()
            {
                open = Some((table.to_owned(), row_key.to_owned()));
            }
            ui.label(theme::muted("›").size(12.0));
            ui.label(theme::mono(&line.node).size(12.5));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(theme::faint(&line.face).size(12.0));
            });
        });
    }
    if own_lines.len() > shown {
        ui.label(theme::faint(format!("… {} more", own_lines.len() - shown)));
    }
    if own_lines.is_empty() {
        widgets::hint(ui, "no line asks for an own face yet");
    }
    if let Some((table, row_key)) = open {
        editor.select(Selection::row(&table, &row_key));
        editor.open_tab(crate::tabs::Tab::for_row(&table, &row_key));
    }
    if let Some(wanted) = rename_to
        && super::busts::rename(editor, key, face, &wanted)
    {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.face = Some(wanted);
    }
    if let Some(file) = new_file {
        let mut changed = row.clone();
        let pointer = if face.own.is_some() {
            format!("{}/file", face.pointer)
        } else {
            face.pointer.clone()
        };
        if let Some(target) = changed.pointer_mut(&pointer) {
            *target = Value::String(file.clone());
        }
        super::write_row(
            editor,
            key,
            &changed,
            format!("File {file} for face {} of {key}", face.name),
            false,
        );
    }
    if remove_with.is_some() {
        remove_dialog(editor, ui, key, face, faces, uses_of_face);
    }
}

fn remove_dialog(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    face: &super::busts::Face,
    faces: &[super::busts::Face],
    uses: usize,
) {
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    view.removing = Some(super::RemoveFace {
        face: face.clone(),
        replacement: faces
            .iter()
            .find(|f| f.name != face.name)
            .map(|f| f.name.clone())
            .unwrap_or_default(),
        uses,
    });
    let _ = ui;
}

pub fn remove_face_dialog(editor: &mut Editor, ctx: &egui::Context, key: &str) {
    let Some(removing) = editor
        .views
        .model
        .views
        .get(key)
        .and_then(|view| view.removing.clone())
    else {
        return;
    };
    let faces = editor
        .row_value(super::TABLE, key)
        .map(|row| super::busts::faces(&row))
        .unwrap_or_default();
    let mut decision = None;
    let mut replacement = removing.replacement.clone();
    crate::ui::dialogs::card(ctx, "remove-face", 400.0, |ui| {
        ui.label(
            RichText::new(format!("Remove face {}", removing.face.name))
                .size(16.0)
                .strong(),
        );
        ui.add_space(6.0);
        if removing.uses > 0 {
            ui.label(format!(
                "{} lines ask for it. They take another face instead:",
                removing.uses
            ));
            egui::ComboBox::from_id_salt("face-replacement")
                .selected_text(replacement.clone())
                .show_ui(ui, |ui| {
                    for other in faces.iter().filter(|f| f.name != removing.face.name) {
                        ui.selectable_value(&mut replacement, other.name.clone(), &other.name);
                    }
                });
        } else {
            ui.label(theme::muted("No line asks for it."));
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if widgets::danger(ui, "Remove").clicked() {
                decision = Some(true);
            }
            if ui.button("Cancel").clicked() {
                decision = Some(false);
            }
        });
        if ui.input(|i| i.key_pressed(egui::Key::Escape)) {
            decision = Some(false);
        }
    });
    {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        if let Some(removing) = view.removing.as_mut() {
            removing.replacement = replacement.clone();
        }
    }
    let Some(apply) = decision else {
        return;
    };
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    view.removing = None;
    if apply && super::busts::remove(editor, key, &removing.face, &replacement) {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.face = None;
        editor.select(Selection::row(super::TABLE, key));
    }
}

fn asset_picker(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    file: &mut String,
    path: &str,
) -> bool {
    let Some(root) = editor.row_value(super::TABLE, key) else {
        return false;
    };
    let mut actions = Vec::new();
    let Editor {
        project,
        form,
        shapes,
        ..
    } = editor;
    let Some(project) = project.as_ref() else {
        return false;
    };
    let mut cx = FormCx::new(project, &root, shapes, form, &mut actions);
    cx.owner_table = Some(super::TABLE.to_owned());
    cx.owner_key = Some(key.to_owned());
    crate::picker::asset(ui, &mut cx, file, path)
}

pub fn first_class_body(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> crate::forms::Changed {
    let mut changed = crate::forms::Changed::default();
    let width = value["hitbox"]["width"].as_f64().unwrap_or(1.0);
    let height = value["hitbox"]["height"].as_f64().unwrap_or(1.0);
    widgets::kv(ui, "hitbox", |ui| {
        let id = ui.id().with("hitbox-draft");
        let shown = format!(
            "{} × {}",
            crate::forms::trim_number(width),
            crate::forms::trim_number(height)
        );
        let mut draft = ui
            .memory(|m| m.data.get_temp::<String>(id))
            .unwrap_or_else(|| shown.clone());
        let response = crate::forms::boxed_input(ui, Some("tiles"), |ui| {
            ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut draft)
                        .desired_width(110.0)
                        .font(egui::TextStyle::Monospace),
                )
            })
            .inner
        });
        if crate::forms::committed(ui, &response) {
            let parsed: Vec<f64> = draft
                .split(['×', 'x', 'X', ','])
                .filter_map(|part| part.trim().parse::<f64>().ok())
                .collect();
            if parsed.len() == 2
                && parsed.iter().all(|v| (0.1..=8.0).contains(v))
                && (parsed[0] != width || parsed[1] != height)
            {
                value["hitbox"]["width"] = serde_json::json!(parsed[0]);
                value["hitbox"]["height"] = serde_json::json!(parsed[1]);
                changed = crate::forms::Changed::at("/hitbox");
            }
            ui.memory_mut(|m| m.data.remove::<String>(id));
        } else if response.has_focus() {
            ui.memory_mut(|m| m.data.insert_temp(id, draft));
        } else {
            ui.memory_mut(|m| m.data.remove::<String>(id));
        }
    });
    widgets::kv(ui, "image", |ui| {
        let mut file = value["sprites"]["image"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        if crate::picker::asset(ui, cx, &mut file, "/sprites/image") {
            value["sprites"]["image"] = Value::String(file);
            changed = crate::forms::Changed::at("/sprites/image");
        }
    });
    widgets::kv_text(
        ui,
        "frame",
        format!(
            "{} × {} px, imported",
            value["sprites"]["frame_size"]["width"]
                .as_u64()
                .unwrap_or(0),
            value["sprites"]["frame_size"]["height"]
                .as_u64()
                .unwrap_or(0)
        ),
    );
    let strips: usize = ACTIONS
        .iter()
        .map(|action| {
            value["sprites"]["actions"][action]
                .as_object()
                .map_or(0, |d| d.len())
        })
        .sum();
    let frames: usize = ACTIONS
        .iter()
        .flat_map(|action| DIRECTIONS.iter().map(move |dir| (action, dir)))
        .map(|(action, dir)| {
            value["sprites"]["actions"][action][dir]
                .as_array()
                .map_or(0, Vec::len)
        })
        .sum();
    widgets::kv_text(ui, "strips", format!("{strips} · {frames} frames"));
    changed
}
