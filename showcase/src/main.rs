mod chapters;
mod film;
mod shoot;

use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Deserialize;

use crate::chapters::{CHAPTERS, Chapter};
use crate::shoot::{Binaries, Shoot};

// Records the chapters named on the command line, each to a video of its own, as many at once as the
// machine has cores for. With none named it records every chapter, and stitches them in order into the
// whole showcase.
fn main() {
    let config: ShowcaseConfig = envy::prefixed("RIFT_SHOWCASE_")
        .from_env()
        .expect("RIFT_SHOWCASE_* environment");
    let named: Vec<String> = std::env::args().skip(1).collect();
    for name in &named {
        assert!(
            CHAPTERS.iter().any(|chapter| chapter.name == name),
            "no chapter named {name}; the chapters are {}",
            CHAPTERS
                .iter()
                .map(|chapter| chapter.name)
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    let chosen: Vec<(usize, &Chapter)> = CHAPTERS
        .iter()
        .enumerate()
        .filter(|(_, chapter)| named.is_empty() || named.iter().any(|name| name == chapter.name))
        .collect();
    std::fs::create_dir_all(&config.out_dir).expect("a folder for the showcase");
    let binaries = beside_me();
    let cores = std::thread::available_parallelism().map_or(1, usize::from);
    let at_once = (cores / config.cores_per_chapter.get()).max(1);
    let queue = Mutex::new(chosen.into_iter());
    let failed = Mutex::new(Vec::new());
    std::thread::scope(|scope| {
        for _ in 0..at_once {
            scope.spawn(|| {
                loop {
                    let next = queue.lock().expect("the chapters to record").next();
                    let Some((index, chapter)) = next else {
                        return;
                    };
                    let video = config.out_dir.join(file_name(index, chapter));
                    let scratch = config.out_dir.join("takes").join(chapter.name);
                    let (binaries, content) = (&binaries, config.content_dir.as_path());
                    let take = std::thread::Builder::new()
                        .name(chapter.name.to_owned())
                        .spawn_scoped(scope, move || {
                            let mut shoot =
                                Shoot::start(chapter, video, binaries, content, scratch);
                            (chapter.play)(&mut shoot);
                        })
                        .expect("a thread for the chapter");
                    if take.join().is_err() {
                        failed
                            .lock()
                            .expect("the failed chapters")
                            .push(chapter.name);
                    }
                }
            });
        }
    });
    let _ = std::fs::remove_dir(config.out_dir.join("takes"));
    let failed = failed.into_inner().expect("the failed chapters");
    assert!(failed.is_empty(), "chapters failed: {}", failed.join(", "));
    if named.is_empty() {
        stitch(&config.out_dir);
    }
}

#[derive(Deserialize)]
struct ShowcaseConfig {
    content_dir: PathBuf,
    out_dir: PathBuf,
    // Each chapter plays on a game server of its own, with a client drawing as fast as it can and a
    // recording for each player: chapters that outnumber the cores slow each other down until nothing
    // runs smoothly.
    cores_per_chapter: NonZeroUsize,
}

// Its position in the showcase leads the file's name, so the files list in order.
fn file_name(index: usize, chapter: &Chapter) -> String {
    format!("{:02}-{}.mp4", index + 1, chapter.name)
}

// The game's binaries ship beside this one.
fn beside_me() -> Binaries {
    let me = std::env::current_exe().expect("the showcase knows where it is");
    let folder = me.parent().expect("the showcase sits in a folder");
    let binary = |name: &str| folder.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    Binaries {
        server: binary("game-server"),
        client: binary("desktop-client"),
    }
}

fn stitch(out: &Path) {
    let list = out.join("chapters.txt");
    let lines: String = CHAPTERS
        .iter()
        .enumerate()
        .map(|(index, chapter)| {
            format!("file '{}'\n", out.join(file_name(index, chapter)).display())
        })
        .collect();
    std::fs::write(&list, lines).expect("a list of the chapters");
    let showcase = out.join("showcase.mp4");
    let status = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
        ])
        .arg(&list)
        .args(["-c", "copy"])
        .arg(&showcase)
        .status()
        .expect("ffmpeg runs");
    assert!(status.success(), "ffmpeg could not stitch the showcase");
    let _ = std::fs::remove_file(list);
    println!("recorded {}", showcase.display());
}
