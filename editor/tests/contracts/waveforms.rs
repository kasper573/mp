use std::time::{Duration, Instant};

use editor::audio::{WaveState, WaveformCache};
use editor::project::{FileBytes, ProjectFiles};

/// What the cache knows of `path` once its measuring has ended.
fn measured(cache: &mut WaveformCache, files: &ProjectFiles, path: &str) -> WaveState {
    let ctx = egui::Context::default();
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        match cache.state(&ctx, files, path) {
            WaveState::Measuring if Instant::now() < until => {
                std::thread::sleep(Duration::from_millis(5))
            }
            state => return state,
        }
    }
}

#[test]
fn a_sound_reads_as_its_current_bytes_and_one_that_is_not_there_is_unreadable() {
    let mut files = ProjectFiles::default();
    files.insert("hit.wav".to_owned(), FileBytes::from(testkit::wav()));
    let mut cache = WaveformCache::default();

    let WaveState::Ready(wave) = measured(&mut cache, &files, "hit.wav") else {
        panic!("a wav decodes");
    };
    assert_eq!(wave.ms, 1);

    files.insert("hit.wav".to_owned(), FileBytes::from(&b"not a sound"[..]));
    assert!(matches!(
        measured(&mut cache, &files, "hit.wav"),
        WaveState::Unreadable
    ));
    assert!(matches!(
        measured(&mut cache, &files, "gone.wav"),
        WaveState::Unreadable
    ));
}
