use std::collections::HashMap;

use engine::core::audio;
use engine::core::audio::loader::{self, DecodedAudio};

use crate::project::ProjectFiles;

pub const BINS: usize = 160;
pub const LOUDEST_WINDOW_MS: u32 = 100;

#[derive(Clone)]
pub struct Waveform {
    pub bins: Vec<f32>,
    pub ms: u32,
    pub loudness: Option<Loudness>,
}

#[derive(Clone, Copy, Debug)]
pub struct Loudness {
    pub integrated: Option<f64>,
    pub loudest: f64,
    pub peak_dbfs: f64,
}

impl Loudness {
    pub fn loudest_at(self, gain: f32) -> f64 {
        self.loudest + gain_db(gain)
    }
}

pub fn gain_db(gain: f32) -> f64 {
    f64::from(audio::decibels(gain).0)
}

#[derive(Default)]
pub struct WaveformCache {
    waves: HashMap<String, (String, Option<Waveform>)>,
}

impl WaveformCache {
    pub fn wave(&mut self, files: &ProjectFiles, path: &str) -> Option<Waveform> {
        let file = format!("assets/{path}");
        let hash = files.hash_of(&file)?;
        if let Some((seen, wave)) = self.waves.get(&file)
            && seen == hash
        {
            return wave.clone();
        }
        let wave = files.get(&file).and_then(|bytes| analyse(bytes));
        self.waves.insert(file, (hash.to_owned(), wave.clone()));
        wave
    }
}

fn analyse(bytes: &[u8]) -> Option<Waveform> {
    let decoded = loader::decode(bytes.to_vec()).ok()?;
    let channels = decoded.channels.max(1);
    let frames = decoded.samples.len() / channels;
    let ms = (frames as f64 * 1000.0 / decoded.sample_rate.max(1) as f64).round() as u32;
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
    Some(Waveform {
        bins,
        ms,
        loudness: measure(&decoded),
    })
}

fn measure(decoded: &DecodedAudio) -> Option<Loudness> {
    let channels = decoded.channels as u32;
    let mut meter = ebur128::EbuR128::new(
        channels,
        decoded.sample_rate,
        ebur128::Mode::I | ebur128::Mode::M | ebur128::Mode::TRUE_PEAK,
    )
    .ok()?;
    meter.set_max_window(LOUDEST_WINDOW_MS.max(400)).ok()?;
    let chunk = (decoded.sample_rate as usize / 100).max(1) * decoded.channels;
    let mut loudest = f64::NEG_INFINITY;
    for samples in decoded.samples.chunks(chunk) {
        meter.add_frames_f32(samples).ok()?;
        if let Ok(window) = meter.loudness_window(LOUDEST_WINDOW_MS)
            && window.is_finite()
        {
            loudest = loudest.max(window);
        }
    }
    let integrated = meter.loudness_global().ok();
    let mut peak: f64 = 0.0;
    for channel in 0..channels {
        if let Ok(p) = meter.true_peak(channel) {
            peak = peak.max(p);
        }
    }
    Some(Loudness {
        integrated,
        loudest,
        peak_dbfs: 20.0 * peak.max(1e-9).log10(),
    })
}
