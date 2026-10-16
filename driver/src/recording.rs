use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use engine::core::time::Seconds;

// A screen and its speakers, recorded apart so neither waits on the other. Both keep the wall clock,
// so the footage of several screens, and whatever was noted while they ran, line up afterwards.
pub struct Recording {
    picture: Child,
    sound: Child,
    sound_started: JoinHandle<Option<SystemTime>>,
    folder: PathBuf,
}

pub struct Footage {
    picture: PathBuf,
    sound: PathBuf,
    pub picture_started: SystemTime,
    sound_started: SystemTime,
}

// What a film lays over footage, timed in seconds from `origin`, where the video starts.
pub struct FootageOverlay {
    pub origin: SystemTime,
    pub subtitles: PathBuf,
    pub blur_until: Seconds,
    pub insets: Vec<InsetCut>,
}

// Another screen's footage, scaled down into a framed corner of this one's.
pub struct InsetCut {
    pub footage: Footage,
    pub from: Seconds,
    pub until: Seconds,
    pub at: (u32, u32),
    pub size: (u32, u32),
}

const INSET_BORDER: u32 = 3;

impl Recording {
    pub fn start(display: &str, size: (u32, u32), monitor: &str, folder: &Path) -> Recording {
        let picture = Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(["-use_wallclock_as_timestamps", "1"])
            .args(["-f", "x11grab", "-framerate", RECORDED_FPS, "-video_size"])
            .arg(format!("{}x{}", size.0, size.1))
            .args(["-i", display])
            .args([
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
            ])
            .args(["-copyts"])
            .arg(folder.join(PICTURE))
            .stdin(Stdio::piped())
            .spawn()
            .expect("ffmpeg runs");
        let mut sound = Command::new("parecord")
            .args(["--raw", "--format=s16le", "--latency-msec=10"])
            .arg(format!("--channels={CHANNELS}"))
            .arg(format!("--rate={SAMPLE_RATE}"))
            .arg(format!("--device={monitor}"))
            .stdout(Stdio::piped())
            .spawn()
            .expect("parecord runs");
        let samples = sound.stdout.take().expect("a piped stdout");
        let file = File::create(folder.join(SOUND)).expect("a sound recording");
        Recording {
            picture,
            sound,
            sound_started: std::thread::spawn(move || keep_sound(samples, file)),
            folder: folder.to_path_buf(),
        }
    }

    pub fn finish(mut self) -> Option<Footage> {
        if let Some(mut stop) = self.picture.stdin.take() {
            let _ = stop.write_all(b"q");
        }
        let _ = self.picture.wait();
        let _ = self.sound.kill();
        let _ = self.sound.wait();
        let sound_started = self.sound_started.join().ok().flatten()?;
        let picture = self.folder.join(PICTURE);
        Some(Footage {
            picture_started: first_frame(&picture)?,
            picture,
            sound: self.folder.join(SOUND),
            sound_started,
        })
    }
}

impl Footage {
    // Picture and sound in one file, with whatever a film lays over them.
    pub fn render(&self, out: &Path, overlay: Option<&FootageOverlay>) {
        let mut ffmpeg = Command::new("ffmpeg");
        ffmpeg
            .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
            .arg(&self.picture)
            .args(["-f", "s16le", "-ac", CHANNELS, "-ar", SAMPLE_RATE, "-i"])
            .arg(&self.sound);
        match overlay {
            None => {
                let sound = shift_sound(seconds(self.sound_started, self.picture_started));
                ffmpeg.args(["-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", &sound]);
            }
            Some(overlay) => {
                for inset in &overlay.insets {
                    ffmpeg.arg("-i").arg(&inset.footage.picture);
                }
                // The capture is stamped by the wall clock, which names no rate: left to guess one,
                // ffmpeg would drop frames to its default.
                ffmpeg
                    .args(["-filter_complex", &self.graph(overlay)])
                    .args(["-map", "[video]", "-map", "[sound]", "-r", RECORDED_FPS])
                    .args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"])
                    .args(["-pix_fmt", "yuv420p"]);
            }
        }
        let status = ffmpeg
            .args([
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-shortest",
                "-movflags",
                "+faststart",
            ])
            .arg(out)
            .status();
        if !status.is_ok_and(|status| status.success()) {
            eprintln!("ffmpeg could not render {}", out.display());
        }
    }

    pub fn discard(&self) {
        let _ = std::fs::remove_file(&self.picture);
        let _ = std::fs::remove_file(&self.sound);
    }

    fn graph(&self, overlay: &FootageOverlay) -> String {
        let mut graph = format!(
            "[0:v]{}[base0];[1:a]{}[sound];",
            shift_picture(seconds(self.picture_started, overlay.origin)),
            shift_sound(seconds(self.sound_started, overlay.origin)),
        );
        for (index, inset) in overlay.insets.iter().enumerate() {
            let (width, height) = inset.size;
            let framed = (width + 2 * INSET_BORDER, height + 2 * INSET_BORDER);
            graph += &format!(
                "[{input}:v]{shift},scale={width}:{height},pad={}:{}:{INSET_BORDER}:{INSET_BORDER}:color=white@0.85[inset{index}];\
                 [base{index}][inset{index}]overlay={}:{}:enable='between(t,{:.3},{:.3})':eof_action=pass[base{}];",
                framed.0,
                framed.1,
                inset.at.0,
                inset.at.1,
                inset.from.0,
                inset.until.0,
                index + 1,
                input = index + 2,
                shift = shift_picture(seconds(inset.footage.picture_started, overlay.origin)),
            );
        }
        graph
            + &format!(
                "[base{}]boxblur=10:2:enable='lt(t,{:.3})',subtitles=filename={}[video]",
                overlay.insets.len(),
                overlay.blur_until.0,
                filter_path(&overlay.subtitles),
            )
    }
}

// When it happened, counted from the origin: before it is negative.
pub fn seconds(at: SystemTime, origin: SystemTime) -> Seconds {
    match at.duration_since(origin) {
        Ok(after) => Seconds(after.as_secs_f32()),
        Err(before) => Seconds(-before.duration().as_secs_f32()),
    }
}

const RECORDED_FPS: &str = "30";
const SAMPLE_RATE: &str = "48000";
const CHANNELS: &str = "2";
const BYTES_PER_SECOND: f64 = 48_000.0 * 2.0 * 2.0;
const PICTURE: &str = "picture.mkv";
const SOUND: &str = "sound.pcm";

// Copies the sound to its file, and tells when its first samples were heard.
fn keep_sound(mut samples: impl Read, mut file: File) -> Option<SystemTime> {
    let mut chunk = vec![0u8; 16 * 1024];
    let mut started = None;
    while let Ok(read) = samples.read(&mut chunk) {
        if read == 0 || file.write_all(&chunk[..read]).is_err() {
            break;
        }
        let heard = Duration::from_secs_f64(read as f64 / BYTES_PER_SECOND);
        started.get_or_insert_with(|| SystemTime::now() - heard);
    }
    started
}

// The wall clock of the first frame, kept as its timestamp.
fn first_frame(picture: &Path) -> Option<SystemTime> {
    let probed = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=start_time",
            "-of",
            "csv=p=0",
        ])
        .arg(picture)
        .output()
        .ok()?;
    let seconds: f64 = String::from_utf8_lossy(&probed.stdout)
        .trim()
        .parse()
        .ok()?;
    Some(UNIX_EPOCH + Duration::from_secs_f64(seconds))
}

// A stream that starts `by` after the origin waits that long; one that started before it skips what
// it has from before.
fn shift_picture(Seconds(by): Seconds) -> String {
    if by >= 0.0 {
        format!("setpts=PTS-STARTPTS+{by:.3}/TB")
    } else {
        format!("trim=start={:.3},setpts=PTS-STARTPTS", -by)
    }
}

fn shift_sound(Seconds(by): Seconds) -> String {
    if by >= 0.0 {
        format!("adelay={}:all=1", (by * 1000.0).round())
    } else {
        format!("atrim=start={:.3},asetpts=PTS-STARTPTS", -by)
    }
}

// Escaped once as a filter's option value, and again as part of the filter graph.
fn filter_path(path: &Path) -> String {
    let escape = |text: &str, special: &[char]| -> String {
        text.chars()
            .flat_map(|c| special.contains(&c).then_some('\\').into_iter().chain([c]))
            .collect()
    };
    let value = escape(&path.to_string_lossy(), &['\\', '\'', ':']);
    escape(&value, &['\\', '\'', '[', ']', ',', ';'])
}
