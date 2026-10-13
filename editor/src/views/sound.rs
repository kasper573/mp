use egui::Ui;

use crate::ui::theme;
use game::core::content::Content;
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::area;

use crate::app::Editor;

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
    pub outside: f32,
    pub channels: Vec<(u32, String, f32, Option<Loudness>)>,
}

#[derive(Clone, Copy, Debug)]
pub struct Loudness {
    pub integrated: f64,
    pub peak_dbfs: f64,
}

pub fn listen(editor: &mut Editor, content: Content, area_id: area::Id, at: Pos<Tiles>) {
    let area = area::load(&content, area_id);
    let key = area_id.key(&content).to_owned();
    let mut heard = Vec::new();
    for (index, zone) in area.soundscape.iter().enumerate() {
        let Some(positional) = zone.heard_from(at) else {
            continue;
        };
        let outside = ((at - zone.shape.nearest(at)).length() - zone.emit.0).max(0.0);
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
            gain: positional.proximity,
            outside,
            channels,
        });
    }
    editor.views.sound.listening = Some(Listening {
        area: key,
        at: (at.x, at.y),
        heard,
    });
}

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
    use symphonia::core::codecs::CodecParameters;
    use symphonia::core::formats::TrackType;
    use symphonia::core::io::MediaSourceStream;
    let stream = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes.to_vec())),
        Default::default(),
    );
    let mut format = symphonia::default::get_probe()
        .probe(
            &Default::default(),
            stream,
            Default::default(),
            Default::default(),
        )
        .ok()?;
    let track = format.default_track(TrackType::Audio)?;
    let track_id = track.id;
    let Some(CodecParameters::Audio(params)) = track.codec_params.clone() else {
        return None;
    };
    let codec = symphonia::default::get_codecs().get_audio_decoder(params.codec)?;
    let mut decoder = (codec.factory)(&params, &Default::default()).ok()?;
    let mut samples = Vec::new();
    let mut channels = 0;
    let mut rate = 0;
    while let Ok(Some(packet)) = format.next_packet() {
        if packet.track_id != track_id {
            continue;
        }
        let Ok(audio) = decoder.decode(&packet) else {
            continue;
        };
        channels = audio.spec().channels().count() as u32;
        rate = audio.spec().rate();
        let mut buffer = Vec::with_capacity(audio.frames() * channels as usize);
        audio.copy_to_vec_interleaved(&mut buffer);
        samples.extend_from_slice(&buffer);
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

pub fn panel(editor: &Editor, ui: &mut Ui) {
    let Some(listening) = &editor.views.sound.listening else {
        return;
    };
    ui.label(theme::muted(format!(
        "Listening at {:.1}, {:.1} in {} · what a player there hears at the default settings · Alt-click moves the listener",
        listening.at.0, listening.at.1, listening.area
    )));
    ui.add_space(6.0);
    if listening.heard.is_empty() {
        ui.label(theme::muted("Silence: no soundscape reaches this spot."));
        return;
    }
    let mut rows: Vec<(u32, String, String, String)> = Vec::new();
    for heard in &listening.heard {
        let from = soundscape_name(editor, &listening.area, heard.module);
        for (channel, file, volume, _) in &heard.channels {
            let where_ = if heard.outside <= 0.0 {
                "inside".to_owned()
            } else {
                format!(
                    "{:.1} tiles out · {:.0}%",
                    heard.outside,
                    heard.gain * 100.0
                )
            };
            rows.push((
                *channel,
                format!("{file} · {volume:.2}"),
                from.clone(),
                where_,
            ));
        }
    }
    rows.sort_by_key(|row| row.0);
    egui::Grid::new("listen")
        .num_columns(4)
        .spacing([28.0, 6.0])
        .striped(true)
        .show(ui, |ui| {
            for head in ["ch", "plays here", "from", "heard"] {
                ui.label(theme::muted(head).monospace().size(12.0));
            }
            ui.end_row();
            for (channel, plays, from, heard) in rows {
                ui.label(theme::mono(channel.to_string()));
                ui.label(theme::mono(plays));
                ui.label(theme::mono(from));
                ui.label(theme::mono(heard));
                ui.end_row();
            }
        });
}

fn soundscape_name(editor: &Editor, area: &str, module: usize) -> String {
    let row = editor.row_value("area", area);
    let soundscape = row
        .as_ref()
        .and_then(|row| row["modules"].as_array())
        .into_iter()
        .flatten()
        .enumerate()
        .filter(|(_, m)| m["type"] == "soundscape")
        .nth(module);
    let Some((index, module)) = soundscape else {
        return "soundscape".to_owned();
    };
    let stem = module["channels"]
        .as_array()
        .and_then(|channels| channels.first())
        .and_then(|channel| channel["file"].as_str())
        .and_then(|file| std::path::Path::new(file).file_stem())
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    format!("soundscape {index} · {stem}")
}
