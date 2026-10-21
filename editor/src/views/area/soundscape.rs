use design_tokens::glyph::{self, Mark};
use egui::{Align, Layout, Sense, Ui, Vec2};
use engine::core::assets::{AssetKind, AudioRef};
use engine::core::audio::{self, mix::AudioCategory};
use engine::systems::area::{SoundChannel, SoundscapeDef};

use crate::audio::WaveState;
use crate::forms::{self, FormCx};
use crate::picker;
use crate::ui::{theme, widgets};

/// The channels of `soundscape`, each edited as the game reads it, and how loud each plays at the
/// default mix.
pub(super) fn soundscape_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    soundscape: &mut SoundscapeDef,
    path: &str,
) -> bool {
    let mut changed = false;
    widgets::section(ui, "Channels");
    let mut remove = None;
    for (index, channel) in soundscape.channels.iter_mut().enumerate() {
        let channel_path = format!("{path}/channels/{index}");
        ui.horizontal(|ui| {
            ui.label(theme::strong(format!("channel {}", channel.channel)).monospace());
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove")
                    .on_hover_text("Remove the channel")
                    .clicked()
                {
                    remove = Some(index);
                }
            });
        });
        changed |= forms::of_type(ui, cx, channel, &channel_path).is_some();
    }
    if let Some(index) = remove {
        soundscape.channels.remove(index);
        changed = true;
    }
    widgets::kv(ui, "+ channel", |ui| {
        let mut file = String::new();
        let new_path = format!("{path}/channels/{}", soundscape.channels.len());
        if picker::asset_of(ui, cx, AssetKind::Audio, &mut file, &new_path) && !file.is_empty() {
            let next = soundscape
                .channels
                .iter()
                .map(|channel| channel.channel)
                .max()
                .unwrap_or(0)
                + 1;
            soundscape.channels.push(SoundChannel {
                channel: next,
                file: AudioRef::new(file),
                volume: 1.0,
                pan: 0.0,
                category: AudioCategory::Ambience,
            });
            changed = true;
        }
    });
    if soundscape.channels.is_empty() {
        return changed;
    }
    widgets::section(ui, "At the default mix");
    for channel in &soundscape.channels {
        let file = channel.file.as_str();
        let number = channel.channel;
        let state = cx.state.audio.state(ui.ctx(), cx.files, file);
        ui.label(theme::mono(format!("{number} · {file}")).size(12.5));
        let loudness = match state {
            WaveState::Measuring => {
                widgets::hint(ui, "measuring…");
                continue;
            }
            WaveState::Ready(wave) => wave.loudness,
            WaveState::Unreadable => None,
        };
        let Some(loudness) = loudness else {
            widgets::hint(ui, "not measured: the file does not decode");
            continue;
        };
        let Some(integrated) = loudness.integrated else {
            widgets::hint(ui, "not measured: the file does not decode");
            continue;
        };
        let effective = integrated + f64::from(audio::decibels(channel.volume).0);
        let band = if number == 1 {
            MUSIC_BAND
        } else {
            AMBIENCE_BAND
        };
        meter(
            ui,
            "loudness",
            &Meter {
                value: effective,
                band: Some(band.range),
                text: &format!("{effective:.1} LUFS"),
            },
        );
        ui.label(theme::faint(band.label).size(11.5));
        meter(
            ui,
            "true peak",
            &Meter {
                value: loudness.peak_dbfs,
                band: Some(PEAK_BAND.range),
                text: &format!("{:.1} dBFS", loudness.peak_dbfs),
            },
        );
        ui.label(theme::faint(PEAK_BAND.label).size(11.5));
        ui.add_space(4.0);
    }
    changed
}

pub(super) struct Band {
    pub range: (f64, f64),
    pub label: &'static str,
}

pub(super) const MUSIC_BAND: Band = Band {
    range: (-33.0, -27.0),
    label: "music band -33 to -27 LUFS",
};
pub(super) const AMBIENCE_BAND: Band = Band {
    range: (-37.0, -33.0),
    label: "ambience band -37 to -33 LUFS",
};
pub(super) const PEAK_BAND: Band = Band {
    range: (-60.0, -12.0),
    label: "limit -12 dBFS",
};

pub(super) struct Meter<'a> {
    pub value: f64,
    pub band: Option<(f64, f64)>,
    pub text: &'a str,
}

pub(super) fn meter(ui: &mut Ui, name: &str, meter: &Meter) {
    let Meter { value, band, text } = *meter;
    let (min, max) = (-60.0, 0.0);
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
