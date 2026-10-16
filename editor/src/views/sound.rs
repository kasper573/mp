use egui::Ui;
use engine::core::content::Content;
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems::area::{self, AreaId};

use crate::app::Editor;
use crate::ui::theme;

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

#[derive(Default)]
pub struct SoundViews {
    pub listening: Option<ListeningPoint>,
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
