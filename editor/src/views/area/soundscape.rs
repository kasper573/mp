use egui::{Align, Layout, Sense, Ui, Vec2};
use serde_json::Value;

use crate::forms::FormCx;
use crate::ui::{theme, widgets};

pub(super) fn soundscape_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &mut Value,
    path: &str,
) -> bool {
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

pub(super) fn meter(
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
