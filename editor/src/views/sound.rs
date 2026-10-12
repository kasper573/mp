use egui::{RichText, Ui};
use game::core::content::Content;
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::area;

use crate::app::Editor;

/// What a player at one spot hears: each soundscape within reach with its channels and loudness.
#[derive(Clone, Debug, Default)]
pub struct Listening {
    pub area: String,
    pub at: (f32, f32),
    pub heard: Vec<Heard>,
}

#[derive(Clone, Debug)]
pub struct Heard {
    pub module: usize,
    pub gain: f32,
    pub channels: Vec<(u32, String, f32, Option<Loudness>)>,
}

#[derive(Clone, Copy, Debug)]
pub struct Loudness {
    pub integrated: f64,
    pub peak_dbfs: f64,
}

pub const FALLOFF: f32 = 4.0;

pub fn listen(editor: &mut Editor, content: Content, area_id: area::Id, at: Pos<Tiles>) {
    let area = area::load(&content, area_id);
    let key = area_id.key(&content).to_owned();
    let mut heard = Vec::new();
    for (index, zone) in area.soundscape.iter().enumerate() {
        let gain = zone_gain(zone, at);
        if gain <= 0.0 {
            continue;
        }
        let channels = zone
            .channels
            .iter()
            .map(|(channel, layer)| {
                let loudness = editor
                    .project
                    .as_ref()
                    .and_then(|p| {
                        p.files
                            .get(&format!("assets/{}", layer.src.as_str()))
                            .cloned()
                    })
                    .and_then(|bytes| measure(&bytes));
                (
                    channel.0,
                    layer.src.as_str().to_owned(),
                    layer.volume,
                    loudness,
                )
            })
            .collect();
        heard.push(Heard {
            module: index,
            gain,
            channels,
        });
    }
    editor.views.sound.listening = Some(Listening {
        area: key,
        at: (at.x, at.y),
        heard,
    });
}

/// How loud a zone plays at a point: full inside, fading to silence over the falloff past emit.
pub fn zone_gain(zone: &game::core::audio::soundscape::SoundscapeZone, at: Pos<Tiles>) -> f32 {
    use game::core::audio::soundscape::SoundscapeShape;
    let distance = match zone.shape {
        SoundscapeShape::Rect(rect) => {
            let dx = (rect.min().x - at.x).max(at.x - rect.max().x).max(0.0);
            let dy = (rect.min().y - at.y).max(at.y - rect.max().y).max(0.0);
            (dx * dx + dy * dy).sqrt()
        }
        SoundscapeShape::Ellipse(rect) => {
            let c = rect.center();
            let (rx, ry) = (rect.size.width / 2.0, rect.size.height / 2.0);
            if rx <= 0.0 || ry <= 0.0 {
                return 0.0;
            }
            let n = ((at.x - c.x) / rx).powi(2) + ((at.y - c.y) / ry).powi(2);
            if n <= 1.0 {
                0.0
            } else {
                (n.sqrt() - 1.0) * rx.min(ry)
            }
        }
    };
    let reach = zone.emit.0;
    if distance <= reach {
        1.0
    } else if distance >= reach + FALLOFF {
        0.0
    } else {
        1.0 - (distance - reach) / FALLOFF
    }
}

/// Integrated loudness and true peak of a sound file, decoded with symphonia and measured with
/// ebur128 at authored volume.
pub fn measure(bytes: &[u8]) -> Option<Loudness> {
    let decoded = decode(bytes)?;
    let mut meter = ebur128::EbuR128::new(
        decoded.channels,
        decoded.rate,
        ebur128::Mode::I | ebur128::Mode::TRUE_PEAK,
    )
    .ok()?;
    meter.add_frames_f32(&decoded.samples).ok()?;
    let integrated = meter.loudness_global().ok()?;
    let mut peak: f64 = f64::NEG_INFINITY;
    for channel in 0..decoded.channels {
        if let Ok(p) = meter.true_peak(channel) {
            peak = peak.max(p);
        }
    }
    Some(Loudness {
        integrated,
        peak_dbfs: 20.0 * peak.max(1e-9).log10(),
    })
}

pub struct Decoded {
    pub channels: u32,
    pub rate: u32,
    pub samples: Vec<f32>,
}

pub fn decode(bytes: &[u8]) -> Option<Decoded> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::io::MediaSourceStream;
    let stream = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes.to_vec())),
        Default::default(),
    );
    let probed = symphonia::default::get_probe()
        .format(
            &Default::default(),
            stream,
            &Default::default(),
            &Default::default(),
        )
        .ok()?;
    let mut format = probed.format;
    let track = format.default_track()?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .ok()?;
    let mut samples = Vec::new();
    let mut channels = 0;
    let mut rate = 0;
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let Ok(audio) = decoder.decode(&packet) else {
            continue;
        };
        let spec = *audio.spec();
        channels = spec.channels.count() as u32;
        rate = spec.rate;
        let mut buffer = SampleBuffer::<f32>::new(audio.capacity() as u64, spec);
        buffer.copy_interleaved_ref(audio);
        samples.extend_from_slice(buffer.samples());
    }
    (channels > 0 && !samples.is_empty()).then_some(Decoded {
        channels,
        rate,
        samples,
    })
}

#[derive(Default)]
pub struct SoundViews {
    pub listening: Option<Listening>,
}

/// The listening card: what plays at the listener, each file's loudness against the mix targets.
pub fn panel(editor: &Editor, ui: &mut Ui) {
    let Some(listening) = &editor.views.sound.listening else {
        return;
    };
    ui.label(
        RichText::new(format!(
            "Listening at {} {}, {}",
            listening.area, listening.at.0, listening.at.1
        ))
        .strong(),
    );
    if listening.heard.is_empty() {
        ui.label(RichText::new("silence").weak());
    }
    for heard in &listening.heard {
        ui.label(format!(
            "soundscape {} · {:.0}%",
            heard.module,
            heard.gain * 100.0
        ));
        for (channel, file, volume, loudness) in &heard.channels {
            let target = if *channel == 1 { -30.0 } else { -35.0 };
            let text = match loudness {
                Some(l) => {
                    let effective = l.integrated + 20.0 * (*volume as f64).max(1e-6).log10();
                    let band = if (effective - target).abs() <= 3.0 {
                        "in band"
                    } else if effective > target {
                        "loud"
                    } else {
                        "quiet"
                    };
                    let peak = if l.peak_dbfs > -12.0 {
                        " · peaks over -12 dBFS"
                    } else {
                        ""
                    };
                    format!("ch {channel} {file} · {effective:.1} LUFS ({band}){peak}")
                }
                None => format!("ch {channel} {file} · not measured"),
            };
            ui.label(RichText::new(text).small());
        }
    }
}
