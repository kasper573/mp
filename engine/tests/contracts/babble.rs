use std::time::Duration;

use bevy::asset::io::AssetSourceId;
use bevy::asset::{AssetApp, AssetPlugin};
use bevy::prelude::*;
use bevy::time::TimeUpdateStrategy;
use bevy_kira_audio::AudioSource;
use engine::core::assets::SyncedFiles;
use engine::core::audio::playback::{PlayClip, SfxPlace};
use engine::core::babble::{BabbleId, BabblePlugin, BabbleRank, Babbling};
use engine::core::text::{StyledLine, TextPlugin, Typewriter, TypewriterSpeed};
use testkit::{content, row};

const FRAME: Duration = Duration::from_millis(50);
const TEN_PER_SECOND: TypewriterSpeed = TypewriterSpeed(Some(10.0));

#[test]
fn a_babbling_line_speaks_a_clip_per_letter_as_it_types() {
    let mut app = voice_app();
    let babble: BabbleId = row("bram");
    app.world_mut().spawn((
        Typewriter::default(),
        StyledLine::plain_text("The quick brown fox"),
        Babbling {
            babble,
            place: SfxPlace::Interface,
            rank: BabbleRank::Foremost,
        },
    ));

    for _ in 0..80 {
        app.update();
    }

    let heard = app.world().resource::<Heard>().0;
    assert_eq!(heard, 16, "a clip for each of the sixteen letters");
}

#[test]
fn a_line_babbles_the_same_letters_whatever_the_frame_rate() {
    let sixty = spoken_at(
        Duration::from_millis(16),
        "The quick brown fox jumps over the lazy dog!",
    );
    let five = spoken_at(
        Duration::from_millis(200),
        "The quick brown fox jumps over the lazy dog!",
    );
    assert!(sixty.len() > 4, "{} clips", sixty.len());
    assert_eq!(sixty, five);
}

/// The clips a line is spoken with when every frame lasts `frame`: each clip's file and pitch.
fn spoken_at(frame: Duration, line: &str) -> Vec<(String, u32)> {
    let mut app = voice_app();
    app.insert_resource(TimeUpdateStrategy::ManualDuration(frame))
        .insert_resource(TypewriterSpeed(Some(45.0)))
        .init_resource::<Spoken>()
        .add_systems(Last, note_clips);
    let babble: BabbleId = row("bram");
    app.world_mut().spawn((
        Typewriter::default(),
        StyledLine::plain_text(line.to_owned()),
        Babbling {
            babble,
            place: SfxPlace::Interface,
            rank: BabbleRank::Foremost,
        },
    ));
    let frames = (Duration::from_secs(4).as_secs_f32() / frame.as_secs_f32()) as usize;
    for _ in 0..frames {
        app.update();
    }
    app.world().resource::<Spoken>().0.clone()
}

#[derive(Resource, Default)]
struct Spoken(Vec<(String, u32)>);

fn note_clips(mut clips: MessageReader<PlayClip>, mut spoken: ResMut<Spoken>) {
    for clip in clips.read() {
        let file = clip
            .clip
            .path()
            .map(|path| path.to_string())
            .unwrap_or_default();
        spoken
            .0
            .push((file, (clip.tune.pitch.0 * 1000.0).round() as u32));
    }
}

#[derive(Resource, Default)]
struct Heard(usize);

fn voice_app() -> App {
    let mut app = App::new();
    let files = SyncedFiles::default();
    app.insert_resource(files.clone());
    AssetApp::register_asset_source(&mut app, AssetSourceId::Default, files.source());
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin::default(),
        TextPlugin,
        BabblePlugin,
    ))
    .init_asset::<AudioSource>()
    .add_message::<PlayClip>()
    .insert_resource(TimeUpdateStrategy::ManualDuration(FRAME))
    .insert_resource(TEN_PER_SECOND)
    .insert_resource(content().clone())
    .init_resource::<Heard>()
    .add_systems(Last, count_clips);
    app
}

fn count_clips(mut clips: MessageReader<PlayClip>, mut heard: ResMut<Heard>) {
    heard.0 += clips.read().count();
}
