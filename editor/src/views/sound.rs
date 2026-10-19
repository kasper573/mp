use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use bevy::asset::{AssetPath, AssetServer};
use bevy::prelude::{Entity, World};
use egui::Ui;
use engine::core::assets::SyncedFiles;
use engine::core::audio::playback::{self, PlaySfx, SfxDef, SfxPlace};
use engine::core::babble::{BabbleDef, BabbleRank, Babbling};
use engine::core::content::Content;
use engine::core::math::Pos;
use engine::core::text::{StyledLine, Typewriter};
use engine::core::tiling::Tiles;
use engine::systems::area::{self, AreaId};

use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::ui::theme;

pub const BABBLE_SAMPLE: &str = "The quick brown fox jumps over the lazy dog";

#[derive(Clone, Debug, Default)]
pub struct ListeningPoint {
    pub area: String,
    pub at: (f32, f32),
    pub heard: Vec<HeardModule>,
}

#[derive(Clone, Debug)]
pub struct HeardModule {
    pub module: usize,
    pub gain: f32,
    pub outside: f32,
    pub channels: Vec<(u32, String, f32)>,
}

pub fn listen(editor: &mut Editor, content: &Content, area_id: AreaId, at: Pos<Tiles>) {
    let area = area::load(content, area_id);
    let key = area_id.key(content).to_owned();
    let mut heard = Vec::new();
    for (index, zone) in area.soundscape.iter().enumerate() {
        let Some(positional) = zone.heard_from(at) else {
            continue;
        };
        let outside = ((at - zone.shape.nearest(at)).length() - zone.emit.0).max(0.0);
        let channels = zone
            .channels
            .iter()
            .map(|(channel, layer)| (channel.0, layer.src.as_str().to_owned(), layer.volume))
            .collect();
        heard.push(HeardModule {
            module: index,
            gain: positional.proximity,
            outside,
            channels,
        });
    }
    editor.views.sound.listening = Some(ListeningPoint {
        area: key,
        at: (at.x, at.y),
        heard,
    });
}

/// What a babble preview says, for the engine to speak in a babble's voice.
pub struct BabbleRequest {
    pub babble: String,
    pub text: String,
}

pub struct SoundViews {
    pub listening: Option<ListeningPoint>,
    /// Sfx rows asked to play this frame, and to stop.
    pub play: Vec<String>,
    pub stop: Vec<String>,
    /// Sfx rows still sounding, as of the last sync.
    pub sounding: HashSet<String>,
    pub babble: Option<BabbleRequest>,
    pub stop_babble: bool,
    pub babble_text: String,
    babbler: Option<Entity>,
    /// The content generation the engine's asset files and content were last taken from, with
    /// the hash of each asset file then.
    synced: Option<(u64, HashMap<String, String>)>,
}

impl SoundViews {
    pub fn babbling(&self) -> bool {
        self.babbler.is_some()
    }
}

impl Default for SoundViews {
    fn default() -> SoundViews {
        SoundViews {
            listening: None,
            play: Vec::new(),
            stop: Vec::new(),
            sounding: HashSet::new(),
            babble: None,
            stop_babble: false,
            babble_text: BABBLE_SAMPLE.to_owned(),
            babbler: None,
            synced: None,
        }
    }
}

/// Hands the project's assets and content to the engine's audio as they change, then plays what
/// the windows asked for through it: sfx rows as the game plays them, and a babble speaking a
/// line through the game's own typewriter.
pub fn sync(editor: &mut Editor, world: &mut World) {
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let views = &mut editor.views.sound;
    if views.synced.as_ref().map(|(generation, _)| *generation) != Some(project.generation) {
        let hashes: HashMap<String, String> = project
            .files
            .paths_under("assets/")
            .filter_map(|path| Some((path.clone(), project.files.hash_of(path)?.to_owned())))
            .collect();
        let assets: HashMap<String, Arc<[u8]>> = hashes
            .keys()
            .filter_map(|path| Some((path.clone(), project.files.get(path)?.clone())))
            .collect();
        world.resource::<SyncedFiles>().replace(assets);
        if let Some((_, before)) = &views.synced {
            let server = world.resource::<AssetServer>();
            for (path, hash) in &hashes {
                let asset = AssetPath::from(path.clone());
                if before.get(path) != Some(hash) && server.get_path_id(asset.clone()).is_some() {
                    server.reload(asset);
                }
            }
        }
        views.synced = Some((project.generation, hashes));
        if let Some(content) = &project.content {
            world.insert_resource(content.clone());
        }
    }
    let Some(content) = &project.content else {
        return;
    };
    for key in std::mem::take(&mut views.play) {
        if let Some(id) = content.by_key::<SfxDef>(&key) {
            playback::play(
                world,
                PlaySfx {
                    id,
                    place: SfxPlace::Interface,
                },
            );
            views.sounding.insert(key);
        }
    }
    for key in std::mem::take(&mut views.stop) {
        if let Some(id) = content.by_key::<SfxDef>(&key) {
            playback::stop(world, id);
            views.sounding.remove(&key);
        }
    }
    let still: Vec<String> = views
        .sounding
        .iter()
        .filter(|key| {
            content
                .by_key::<SfxDef>(key)
                .is_some_and(|id| playback::is_sounding(world, id))
        })
        .cloned()
        .collect();
    views.sounding = still.into_iter().collect();
    if std::mem::take(&mut views.stop_babble)
        && let Some(previous) = views.babbler.take()
    {
        world.despawn(previous);
    }
    if let Some(request) = views.babble.take()
        && let Some(babble) = content.by_key::<BabbleDef>(&request.babble)
    {
        if let Some(previous) = views.babbler.take() {
            world.despawn(previous);
        }
        let speaker = world
            .spawn((
                Typewriter::default(),
                StyledLine::plain_text(request.text),
                Babbling {
                    babble,
                    place: SfxPlace::Interface,
                    rank: BabbleRank::Foremost,
                },
            ))
            .id();
        views.babbler = Some(speaker);
    }
    if let Some(speaker) = views.babbler
        && world
            .get::<Typewriter>(speaker)
            .is_none_or(Typewriter::is_finished)
    {
        world.despawn(speaker);
        views.babbler = None;
    }
}

pub fn panel(editor: &Editor, ui: &mut Ui) {
    let Some(listening) = &editor.views.sound.listening else {
        return;
    };
    ui.label(theme::muted(format!(
        "Listening at {:.1}, {:.1} in {} · what a player there hears at the default settings · {} click moves the listener",
        listening.at.0,
        listening.at.1,
        listening.area,
        EditorKey::Listen.name()
    )));
    ui.add_space(6.0);
    if listening.heard.is_empty() {
        ui.label(theme::muted("Silence: no soundscape reaches this spot."));
        return;
    }
    let mut rows: Vec<(u32, String, String, String)> = Vec::new();
    for heard in &listening.heard {
        let from = soundscape_name(editor, &listening.area, heard.module);
        for (channel, file, volume) in &heard.channels {
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
