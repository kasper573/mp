use std::io::Cursor;
use std::time::Duration;

use bevy::asset::io::Reader;
use bevy::asset::{AssetLoader, LoadContext};
use bevy::platform::time::Instant;
use bevy::reflect::TypePath;
use bevy_kira_audio::AudioSource;
use bevy_kira_audio::prelude::{Frame, StaticSoundData, StaticSoundSettings};
use futures_timer::Delay;
use symphonia::core::audio::GenericAudioBufferRef;
use symphonia::core::codecs::CodecParameters;
use symphonia::core::errors::Error;
use symphonia::core::formats::TrackType;
use symphonia::core::io::MediaSourceStream;

// Decoding a whole track at once holds the thread for hundreds of milliseconds, and on the web that
// thread also feeds the audio output and runs the frame that asked for the sound, so decoding hands
// the thread back before every slice, the first included. Waiting on a timer rather than merely
// yielding is what returns control to the browser's event loop.
const SLICE: Duration = Duration::from_millis(4);

#[derive(TypePath)]
pub struct AudioLoader;

impl AssetLoader for AudioLoader {
    type Asset = AudioSource;
    type Settings = ();
    type Error = Error;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _load_context: &mut LoadContext<'_>,
    ) -> Result<AudioSource, Error> {
        let mut encoded = Vec::new();
        reader.read_to_end(&mut encoded).await?;
        let stream = MediaSourceStream::new(Box::new(Cursor::new(encoded)), Default::default());
        let mut format = symphonia::default::get_probe().probe(
            &Default::default(),
            stream,
            Default::default(),
            Default::default(),
        )?;
        let track = format
            .default_track(TrackType::Audio)
            .ok_or(Error::Unsupported("no audio track"))?;
        let track_id = track.id;
        let Some(CodecParameters::Audio(params)) = track.codec_params.clone() else {
            return Err(Error::Unsupported("unknown audio codec"));
        };
        let sample_rate = params
            .sample_rate
            .ok_or(Error::Unsupported("unknown sample rate"))?;
        let mut frames = Vec::with_capacity(track.num_frames.unwrap_or_default() as usize);
        let codec = symphonia::default::get_codecs()
            .get_audio_decoder(params.codec)
            .ok_or(Error::Unsupported("no decoder for the audio codec"))?;
        let mut decoder = (codec.factory)(&params, &Default::default())?;
        let mut slice_end = Instant::now();
        while let Some(packet) = format.next_packet()? {
            if Instant::now() >= slice_end {
                Delay::new(Duration::ZERO).await;
                slice_end = Instant::now() + SLICE;
            }
            if packet.track_id == track_id {
                append_frames(&mut frames, decoder.decode(&packet)?)?;
            }
        }
        Ok(AudioSource {
            sound: StaticSoundData {
                sample_rate,
                frames: frames.into(),
                settings: StaticSoundSettings::default(),
                slice: None,
            },
        })
    }

    fn extensions(&self) -> &[&str] {
        &["flac", "wav"]
    }
}

fn append_frames(frames: &mut Vec<Frame>, decoded: GenericAudioBufferRef<'_>) -> Result<(), Error> {
    let channels = decoded.spec().channels().count();
    let mut samples: Vec<f32> = Vec::with_capacity(decoded.frames() * channels);
    decoded.copy_to_vec_interleaved(&mut samples);
    match channels {
        1 => frames.extend(samples.iter().map(|&sample| Frame::from_mono(sample))),
        2 => frames.extend(
            samples
                .as_chunks::<2>()
                .0
                .iter()
                .map(|&[left, right]| Frame::new(left, right)),
        ),
        _ => return Err(Error::Unsupported("more than two channels")),
    }
    Ok(())
}
