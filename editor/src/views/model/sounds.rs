use std::collections::HashMap;

use bevy::prelude::World;
use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use serde_json::Value;

use crate::app::Editor;
use crate::project::row_file;
use crate::ui::{theme, widgets};
use crate::views::sound::Decoded;

const BINS: usize = 160;
const LOUDEST_WINDOW_MS: u32 = 100;
pub const PEAK_CEILING_DBFS: f64 = -12.0;

pub enum PlayRequest {
    Sfx(String),
}

#[derive(Clone)]
pub struct Wave {
    pub bins: Vec<f32>,
    pub ms: u32,
    pub loudness: Option<EffectLoudness>,
}

#[derive(Clone, Copy, Debug)]
pub struct EffectLoudness {
    pub loudest: f64,
    pub peak_dbfs: f64,
}

#[derive(Default)]
pub struct SoundBank {
    waves: HashMap<String, (String, Option<Wave>)>,
}

impl SoundBank {
    pub fn wave(&mut self, files: &crate::project::Files, path: &str) -> Option<Wave> {
        let file = format!("assets/{path}");
        let bytes = files.get(&file)?;
        let hash = crate::project::hash(bytes);
        if let Some((seen, wave)) = self.waves.get(&file)
            && *seen == hash
        {
            return wave.clone();
        }
        let wave = analyse(bytes);
        self.waves.insert(file, (hash, wave.clone()));
        wave
    }
}

fn analyse(bytes: &[u8]) -> Option<Wave> {
    let decoded = crate::views::sound::decode(bytes)?;
    let channels = decoded.channels.max(1) as usize;
    let frames = decoded.samples.len() / channels;
    let ms = (frames as f64 * 1000.0 / decoded.rate.max(1) as f64).round() as u32;
    let mut bins = vec![0.0f32; BINS];
    for (index, sample) in decoded.samples.iter().enumerate() {
        let bin = (index / channels) * BINS / frames.max(1);
        let bin = bin.min(BINS - 1);
        bins[bin] = bins[bin].max(sample.abs());
    }
    let peak = bins.iter().cloned().fold(0.0f32, f32::max).max(1e-6);
    for bin in &mut bins {
        *bin /= peak;
    }
    Some(Wave {
        bins,
        ms,
        loudness: measure(&decoded),
    })
}

fn measure(decoded: &Decoded) -> Option<EffectLoudness> {
    let mut meter = ebur128::EbuR128::new(
        decoded.channels,
        decoded.rate,
        ebur128::Mode::M | ebur128::Mode::TRUE_PEAK,
    )
    .ok()?;
    meter.set_max_window(LOUDEST_WINDOW_MS.max(400)).ok()?;
    let chunk = (decoded.rate as usize / 100).max(1) * decoded.channels as usize;
    let mut loudest = f64::NEG_INFINITY;
    for samples in decoded.samples.chunks(chunk) {
        meter.add_frames_f32(samples).ok()?;
        if let Ok(window) = meter.loudness_window(LOUDEST_WINDOW_MS)
            && window.is_finite()
        {
            loudest = loudest.max(window);
        }
    }
    let mut peak: f64 = 0.0;
    for channel in 0..decoded.channels {
        if let Ok(p) = meter.true_peak(channel) {
            peak = peak.max(p);
        }
    }
    Some(EffectLoudness {
        loudest,
        peak_dbfs: 20.0 * peak.max(1e-9).log10(),
    })
}

pub fn wave_of_sfx(editor: &mut Editor, sfx: &str) -> Option<Wave> {
    let path = sfx_file(editor, sfx)?;
    let Editor { project, views, .. } = editor;
    let project = project.as_ref()?;
    views.model.bank.wave(&project.files, &path)
}

pub fn sfx_file(editor: &Editor, sfx: &str) -> Option<String> {
    editor
        .row_value("sfx", sfx)
        .and_then(|row| row["file"].as_str().map(str::to_owned))
}

pub fn draw_wave(painter: &egui::Painter, rect: ERect, bins: &[f32], colour: Color32) {
    if bins.is_empty() || rect.width() <= 0.0 {
        return;
    }
    let mid = rect.center().y;
    let half = rect.height() / 2.0;
    let mut top = Vec::with_capacity(bins.len());
    let mut bottom = Vec::with_capacity(bins.len());
    for (index, amplitude) in bins.iter().enumerate() {
        let x = rect.min.x + rect.width() * index as f32 / (bins.len() - 1).max(1) as f32;
        let h = (amplitude.min(1.0) * half).max(0.5);
        top.push(egui::pos2(x, mid - h));
        bottom.push(egui::pos2(x, mid + h));
    }
    bottom.reverse();
    top.extend(bottom);
    painter.add(egui::Shape::convex_polygon(
        top,
        colour.gamma_multiply(0.85),
        egui::Stroke::NONE,
    ));
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Combat,
    Movement,
    Items,
    Interface,
    Ambient,
    Other,
}

impl Role {
    pub fn of_path(path: &str) -> Role {
        let lower = path.to_lowercase();
        if lower.contains("combat") {
            Role::Combat
        } else if lower.contains("step") || lower.contains("movement") {
            Role::Movement
        } else if lower.contains("item") || lower.contains("pickup") || lower.contains("trade") {
            Role::Items
        } else if lower.contains("interface") || lower.contains("ui") {
            Role::Interface
        } else if lower.contains("ambien") {
            Role::Ambient
        } else {
            Role::Other
        }
    }

    pub fn target_lufs(self) -> f64 {
        match self {
            Role::Combat | Role::Other => -23.0,
            Role::Items | Role::Interface => -28.0,
            Role::Movement => -33.0,
            Role::Ambient => -35.0,
        }
    }

    pub fn place(self) -> &'static str {
        match self {
            Role::Combat | Role::Other => "level with voices",
            Role::Items => "below the voices, where items sit",
            Role::Interface => "below the voices, where the interface sits",
            Role::Movement => "lowest, where footsteps sit",
            Role::Ambient => "under the music",
        }
    }
}

pub struct Verdict {
    pub ok: bool,
    pub loudness: String,
    pub peak_ok: bool,
    pub peak: String,
}

pub fn verdict(loudness: EffectLoudness, gain: f32, role: Role) -> Verdict {
    let gain_db = 20.0 * (gain as f64).max(1e-6).log10();
    let level = loudness.loudest + gain_db;
    let target = role.target_lufs();
    let off = level - target;
    let ok = off.abs() <= 1.0;
    let loudness_text = if ok {
        format!(
            "{level:.1} LUFS over its loudest {LOUDEST_WINDOW_MS} ms, {}",
            role.place()
        )
    } else if off > 0.0 {
        format!(
            "{level:.1} LUFS over its loudest {LOUDEST_WINDOW_MS} ms, {off:.1} LU over {target:.0}",
        )
    } else {
        format!(
            "{level:.1} LUFS over its loudest {LOUDEST_WINDOW_MS} ms, {:.1} LU under {target:.0}",
            -off
        )
    };
    let peak = loudness.peak_dbfs + gain_db;
    let peak_ok = peak <= PEAK_CEILING_DBFS;
    let peak_text = if peak_ok {
        format!("{peak:.1} dBFS, under the {PEAK_CEILING_DBFS:.0} ceiling")
    } else {
        format!("{peak:.1} dBFS, over the {PEAK_CEILING_DBFS:.0} ceiling")
    };
    Verdict {
        ok,
        loudness: loudness_text,
        peak_ok,
        peak: peak_text,
    }
}

pub fn first_sfx(editor: &Editor) -> Option<String> {
    sfx_keys(editor).into_iter().next()
}

pub fn sfx_keys(editor: &Editor) -> Vec<String> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    let mut keys: Vec<String> = project
        .files
        .paths_under("tables/sfx/")
        .filter_map(|path| crate::project::row_of(path).map(|(_, key)| key.to_owned()))
        .collect();
    keys.sort();
    keys
}

pub fn surfaces(editor: &Editor) -> Vec<(String, String, String)> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    let mut rows: Vec<(String, String, String)> = project
        .files
        .paths_under("tables/surface/")
        .filter_map(|path| crate::project::row_of(path).map(|(_, key)| key.to_owned()))
        .filter_map(|key| {
            let row = project.files.json(&row_file("surface", &key))?;
            Some((
                key.clone(),
                row["name"].as_str().unwrap_or(&key).to_owned(),
                row["footstep"].as_str()?.to_owned(),
            ))
        })
        .collect();
    rows.sort();
    rows
}

pub fn footstep_of(editor: &Editor, surface: Option<&str>) -> Option<String> {
    let surfaces = surfaces(editor);
    match surface {
        Some(key) => surfaces
            .iter()
            .find(|(k, _, _)| k == key)
            .map(|(_, _, footstep)| footstep.clone()),
        None => surfaces.first().map(|(_, _, footstep)| footstep.clone()),
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum Filter {
    Combat,
    Movement,
    #[default]
    All,
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, key: &str, _row: &Value) {
    let keys = sfx_keys(editor);
    let (search, filter) = {
        let view = &editor.views.model.views[key];
        (view.sound_search.clone(), view.sound_filter)
    };
    let mut search_text = search.clone();
    let mut new_filter = filter;
    ui.add_space(6.0);
    ui.horizontal(|ui| {
        ui.add_space(8.0);
        ui.allocate_ui(Vec2::new(220.0, 26.0), |ui| {
            widgets::search_box(ui, &mut search_text, "Search sounds", None);
        });
        for (option, label) in [
            (Filter::Combat, "combat".to_owned()),
            (Filter::Movement, "movement".to_owned()),
            (Filter::All, format!("all · {}", keys.len())),
        ] {
            let on = filter == option;
            let (fill, ink) = if on {
                (theme::ACCENT_SOFT, theme::TEXT)
            } else {
                (theme::RAISED, theme::MUTED)
            };
            if widgets::chip_coloured(ui, &label, fill, ink).clicked() {
                new_filter = option;
            }
        }
    });
    let mut listed: Vec<(String, String, Option<Wave>, f32)> = Vec::new();
    for sfx in keys
        .iter()
        .filter(|sfx| search.is_empty() || sfx.contains(&search.to_lowercase()))
    {
        let Some(file) = sfx_file(editor, sfx) else {
            continue;
        };
        let role = Role::of_path(&file);
        let keep = match filter {
            Filter::Combat => role == Role::Combat,
            Filter::Movement => role == Role::Movement,
            Filter::All => true,
        };
        if !keep {
            continue;
        }
        let wave = wave_of_sfx(editor, sfx);
        let gain = volume_of(editor, sfx).1;
        listed.push((sfx.clone(), file, wave, gain));
    }
    let selected_cue = editor.views.model.views[key].cue;
    let current_sound = {
        let view = &editor.views.model.views[key];
        selected_cue
            .filter(|(_, kind)| *kind == super::CueKind::Sound)
            .and_then(|(index, _)| {
                editor
                    .row_value(super::TABLE, key)
                    .map(|row| {
                        super::strip_of(
                            &row,
                            super::ACTIONS[view.action],
                            super::DIRECTIONS[view.direction],
                        )
                    })
                    .and_then(|frames| frames.get(index).and_then(|frame| frame.sound.clone()))
            })
    };
    let mut play = None;
    let mut choose = None;
    egui::ScrollArea::vertical()
        .id_salt(("sounds", key))
        .show(ui, |ui| {
            ui.add_space(4.0);
            let columns = ((ui.available_width() - 16.0) / 360.0).floor().max(1.0) as usize;
            egui::Grid::new(("sound-rows", key))
                .spacing(Vec2::new(16.0, 4.0))
                .show(ui, |ui| {
                    for (index, (sfx, _file, wave, _gain)) in listed.iter().enumerate() {
                        let on = current_sound.as_deref() == Some(sfx);
                        let response = sound_row(ui, sfx, wave.as_ref(), on, &mut play);
                        if response.clicked() {
                            choose = Some(sfx.clone());
                        }
                        if (index + 1) % columns == 0 {
                            ui.end_row();
                        }
                    }
                });
            if listed.is_empty() {
                ui.add_space(8.0);
                widgets::hint(ui, "No sound rows match.");
            }
        });
    {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.sound_search = search_text;
        view.sound_filter = new_filter;
    }
    if let Some(sfx) = play {
        editor.views.model.play.push(PlayRequest::Sfx(sfx));
    }
    if let Some(sfx) = choose {
        let view = editor
            .views
            .model
            .views
            .get_mut(key)
            .expect("the view exists");
        view.last_sound = Some(sfx.clone());
        if let Some((index, super::CueKind::Sound)) = selected_cue {
            let (action, direction) = (view.action, view.direction);
            if let Some(row) = editor.row_value(super::TABLE, key) {
                let mut frames =
                    super::strip_of(&row, super::ACTIONS[action], super::DIRECTIONS[direction]);
                if let Some(frame) = frames.get_mut(index) {
                    frame.sound = Some(sfx.clone());
                    super::write_strip(
                        editor,
                        key,
                        super::ACTIONS[action],
                        super::DIRECTIONS[direction],
                        &frames,
                        format!(
                            "Sound {sfx} on frame {} of {} · {} of {key}",
                            index + 1,
                            super::ACTIONS[action],
                            super::DIRECTIONS[direction]
                        ),
                        false,
                    );
                }
            }
        } else {
            editor.toast(format!("{sfx} goes on the next sound cue (S on a frame)"));
        }
    }
}

fn sound_row(
    ui: &mut Ui,
    sfx: &str,
    wave: Option<&Wave>,
    on: bool,
    play: &mut Option<String>,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(344.0, 24.0), Sense::click());
    let painter = ui.painter_at(rect);
    if on {
        painter.rect_filled(rect, 3.0, theme::SELECTION);
    } else if response.hovered() {
        painter.rect_filled(rect, 3.0, theme::RAISED);
    }
    let button = ERect::from_min_size(rect.min + Vec2::new(2.0, 2.0), Vec2::new(26.0, 20.0));
    painter.rect(
        button,
        3.0,
        theme::RAISED,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    painter.text(
        button.center(),
        egui::Align2::CENTER_CENTER,
        "▶",
        egui::FontId::proportional(11.0),
        theme::TEXT,
    );
    if ui
        .interact(button, response.id.with("play"), Sense::click())
        .clicked()
    {
        *play = Some(sfx.to_owned());
    }
    painter.text(
        egui::pos2(rect.min.x + 36.0, rect.center().y),
        egui::Align2::LEFT_CENTER,
        sfx,
        egui::FontId::monospace(12.5),
        if on { Color32::WHITE } else { theme::TEXT },
    );
    let wave_rect = ERect::from_min_max(
        egui::pos2(rect.min.x + 130.0, rect.min.y + 4.0),
        egui::pos2(rect.max.x - 60.0, rect.max.y - 4.0),
    );
    if let Some(wave) = wave {
        draw_wave(&painter, wave_rect, &wave.bins, theme::ACCENT);
        painter.text(
            egui::pos2(rect.max.x - 6.0, rect.center().y),
            egui::Align2::RIGHT_CENTER,
            format!("{} ms", wave.ms),
            egui::FontId::monospace(11.0),
            theme::MUTED,
        );
    }
    response
}

pub fn volume_of(editor: &Editor, sfx: &str) -> (String, f32) {
    let row = editor.row_value("sfx", sfx).unwrap_or(Value::Null);
    scalar_text(&row["volume"])
}

pub fn pitch_of(editor: &Editor, sfx: &str) -> String {
    let row = editor.row_value("sfx", sfx).unwrap_or(Value::Null);
    scalar_text(&row["pitch"]).0
}

fn scalar_text(value: &Value) -> (String, f32) {
    if let Some(fixed) = value.as_f64() {
        return (
            format!("{} · the row's", crate::forms::trim_number(fixed)),
            fixed as f32,
        );
    }
    let min = value["min"].as_f64().unwrap_or(1.0);
    let max = value["max"].as_f64().unwrap_or(1.0);
    (
        format!(
            "{} to {}, at random · the row's",
            crate::forms::trim_number(min),
            crate::forms::trim_number(max)
        ),
        max as f32,
    )
}

fn resolve(value: &Value, seed: u64) -> f32 {
    if let Some(fixed) = value.as_f64() {
        return fixed as f32;
    }
    let min = value["min"].as_f64().unwrap_or(1.0) as f32;
    let max = value["max"].as_f64().unwrap_or(1.0) as f32;
    let unit = (seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407)
        >> 40) as f32
        / (1u64 << 24) as f32;
    min + (max - min) * unit
}

pub fn sync(editor: &mut Editor, world: &mut World) {
    let requests = std::mem::take(&mut editor.views.model.play);
    if requests.is_empty() {
        return;
    }
    use bevy_kira_audio::prelude::{
        Audio, AudioControl, AudioSource, Frame, StaticSoundData, StaticSoundSettings,
    };
    let gain = game::core::audio::mix::AudioMix::default()
        .gain(game::core::audio::mix::AudioCategory::Effects);
    for request in requests {
        let PlayRequest::Sfx(sfx) = request;
        let Some(row) = editor.row_value("sfx", &sfx) else {
            continue;
        };
        let Some(file) = row["file"].as_str() else {
            continue;
        };
        let Some(bytes) = editor
            .project
            .as_ref()
            .and_then(|project| project.files.get(&format!("assets/{file}")).cloned())
        else {
            continue;
        };
        let Some(decoded) = crate::views::sound::decode(&bytes) else {
            continue;
        };
        let frames: Vec<Frame> = match decoded.channels {
            1 => decoded
                .samples
                .iter()
                .map(|s| Frame::from_mono(*s))
                .collect(),
            _ => decoded
                .samples
                .chunks_exact(decoded.channels as usize)
                .map(|c| Frame::new(c[0], c[1]))
                .collect(),
        };
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(1);
        let volume = resolve(&row["volume"], seed) * gain;
        let pitch = resolve(&row["pitch"], seed.rotate_left(17));
        let source = AudioSource {
            sound: StaticSoundData {
                sample_rate: decoded.rate,
                frames: frames.into(),
                settings: StaticSoundSettings::default(),
                slice: None,
            },
        };
        let handle = world
            .resource_mut::<bevy::asset::Assets<AudioSource>>()
            .add(source);
        world
            .resource::<Audio>()
            .play(handle)
            .with_volume(game::core::audio::decibels(volume))
            .with_playback_rate(f64::from(pitch));
    }
}
