use engine::core::audio::playback::{SfxDef, SfxScalar};
use engine::systems::actor::ModelDef;
use engine::systems::area::tileset::SurfaceDef;
use ui::egui;
use ui::egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use ui::form;
use ui::glyph::Mark;
use ui::input;
use ui::theme;

use crate::app::Editor;
use crate::audio::Waveform;
use crate::project::ContentEdit;

pub fn wave_of_sfx(editor: &mut Editor, ctx: &egui::Context, sfx: &str) -> Option<Waveform> {
    let path = sfx_file(editor, sfx)?;
    let Editor { project, views, .. } = editor;
    let project = project.as_ref()?;
    views.model.bank.wave(ctx, &project.files, &path)
}

/// The clip the sfx at `sfx` plays.
pub fn sfx_file(editor: &Editor, sfx: &str) -> Option<String> {
    let sfx = editor.read::<SfxDef>(sfx)?.ok()?;
    Some(sfx.file.as_str().to_owned())
}

pub fn draw_wave(painter: &egui::Painter, rect: ERect, bins: &[f32], color: Color32) {
    if bins.is_empty() || rect.width() <= 0.0 {
        return;
    }
    let mid = rect.center().y;
    let half = rect.height() / 2.0;
    let mut top = Vec::with_capacity(bins.len());
    let mut bottom = Vec::with_capacity(bins.len());
    for (index, amplitude) in bins.iter().enumerate() {
        let x = rect.min.x + rect.width() * index as f32 / (bins.len() - 1).max(1) as f32;
        let h = (amplitude.min(1.0) * half).max(0.5);
        top.push(egui::pos2(x, mid - h));
        bottom.push(egui::pos2(x, mid + h));
    }
    bottom.reverse();
    top.extend(bottom);
    painter.add(egui::Shape::convex_polygon(
        top,
        color.gamma_multiply(0.85),
        egui::Stroke::NONE,
    ));
}

pub fn first_sfx(editor: &Editor) -> Option<String> {
    sfx_keys(editor).into_iter().next()
}

pub fn sfx_keys(editor: &Editor) -> Vec<String> {
    editor
        .reader()
        .map(|reader| reader.paths_of::<SfxDef>().to_vec())
        .unwrap_or_default()
}

pub struct FootstepSurface {
    pub key: String,
    pub name: String,
    pub footstep: String,
}

pub fn surfaces(editor: &Editor) -> Vec<FootstepSurface> {
    let Some(reader) = editor.reader() else {
        return Vec::new();
    };
    reader
        .paths_of::<SurfaceDef>()
        .iter()
        .filter_map(|key| {
            let surface = editor.read::<SurfaceDef>(key)?.ok()?;
            Some(FootstepSurface {
                name: surface.name.clone(),
                key: key.clone(),
                footstep: reader.path_of(surface.footstep)?.to_owned(),
            })
        })
        .collect()
}

pub fn footstep_of(editor: &Editor, surface: Option<&str>) -> Option<String> {
    let surfaces = surfaces(editor);
    let chosen = match surface {
        Some(key) => surfaces.iter().find(|s| s.key == key),
        None => surfaces.first(),
    };
    chosen.map(|surface| surface.footstep.clone())
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let keys = sfx_keys(editor);
    let search = editor.views.model.view(key).sound_search.clone();
    let mut search_text = search.clone();
    ui.add_space(6.0);
    ui.horizontal(|ui| {
        ui.add_space(8.0);
        ui.allocate_ui(Vec2::new(220.0, 26.0), |ui| {
            input::search(ui, &mut search_text, "Search sounds", None);
        });
    });
    let mut listed: Vec<(String, Option<Waveform>)> = Vec::new();
    for sfx in keys
        .iter()
        .filter(|sfx| search.is_empty() || sfx.contains(&search.to_lowercase()))
    {
        if sfx_file(editor, sfx).is_none() {
            continue;
        }
        listed.push((sfx.clone(), wave_of_sfx(editor, ui.ctx(), sfx)));
    }
    let view = editor.views.model.view(key);
    let (selected_cue, strip) = (view.cue, view.strip);
    let current_sound = selected_cue
        .filter(|(_, kind)| *kind == super::FrameCueKind::Sound)
        .and_then(|(index, _)| {
            let model = editor.read::<ModelDef>(key)?.ok()?;
            let sound = super::strip_of(&model, strip).get(index)?.sound?;
            Some(editor.reader()?.path_of(sound)?.to_owned())
        });
    let mut play = None;
    let mut choose = None;
    egui::ScrollArea::vertical()
        .id_salt(("sounds", key))
        .show(ui, |ui| {
            ui.add_space(4.0);
            let columns = ((ui.available_width() - 16.0) / 360.0).floor().max(1.0) as usize;
            egui::Grid::new(("sound-rows", key))
                .spacing(Vec2::new(16.0, 4.0))
                .show(ui, |ui| {
                    for (index, (sfx, wave)) in listed.iter().enumerate() {
                        let on = current_sound.as_deref() == Some(sfx);
                        let response = sound_row(ui, sfx, wave.as_ref(), on, &mut play);
                        if response.clicked() {
                            choose = Some(sfx.clone());
                        }
                        if (index + 1) % columns == 0 {
                            ui.end_row();
                        }
                    }
                });
            if listed.is_empty() {
                ui.add_space(8.0);
                form::hint(ui, "No sound rows match.");
            }
        });
    {
        editor.views.model.view_mut(key).sound_search = search_text;
    }
    if let Some(sfx) = play {
        editor.views.sound.play.push(sfx);
    }
    if let Some(sfx) = choose {
        let view = editor.views.model.view_mut(key);
        view.last_sound = Some(sfx.clone());
        if let Some((index, super::FrameCueKind::Sound)) = selected_cue
            && let Some(Ok(model)) = editor.read::<ModelDef>(key)
            && let Some(id) = editor
                .reader()
                .and_then(|reader| reader.id_of::<SfxDef>(&sfx))
        {
            let mut frames = super::strip_of(&model, strip);
            if let Some(frame) = frames.get_mut(index) {
                frame.sound = Some(id);
                let label = format!(
                    "Sound {sfx} on frame {} of {} of {key}",
                    index + 1,
                    strip.name()
                );
                super::write_strip(editor, key, strip, &frames, ContentEdit::new(label));
            }
        } else {
            editor.toast(format!("{sfx} goes on the next sound cue (S on a frame)"));
        }
    }
}

fn sound_row(
    ui: &mut Ui,
    sfx: &str,
    wave: Option<&Waveform>,
    on: bool,
    play: &mut Option<String>,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(344.0, 24.0), Sense::click());
    let painter = ui.painter_at(rect);
    if on {
        painter.rect_filled(rect, 3.0, theme::SELECTION);
    } else if response.hovered() {
        painter.rect_filled(rect, 3.0, theme::RAISED);
    }
    let button = ERect::from_min_size(rect.min + Vec2::new(2.0, 2.0), Vec2::new(26.0, 20.0));
    painter.rect(
        button,
        3.0,
        theme::RAISED,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    Mark::Play.paint(
        &painter,
        ERect::from_center_size(button.center(), Vec2::splat(12.0)),
        theme::TEXT,
    );
    if ui
        .interact(button, response.id.with("play"), Sense::click())
        .clicked()
    {
        *play = Some(sfx.to_owned());
    }
    painter.text(
        egui::pos2(rect.min.x + 36.0, rect.center().y),
        egui::Align2::LEFT_CENTER,
        sfx,
        egui::FontId::monospace(12.5),
        theme::TEXT,
    );
    let wave_rect = ERect::from_min_max(
        egui::pos2(rect.min.x + 130.0, rect.min.y + 4.0),
        egui::pos2(rect.max.x - 60.0, rect.max.y - 4.0),
    );
    if let Some(wave) = wave {
        draw_wave(&painter, wave_rect, &wave.bins, theme::ACCENT);
        painter.text(
            egui::pos2(rect.max.x - 6.0, rect.center().y),
            egui::Align2::RIGHT_CENTER,
            format!("{} ms", wave.ms),
            egui::FontId::monospace(11.0),
            theme::MUTED,
        );
    }
    response
}

pub fn volume_of(editor: &Editor, sfx: &str) -> String {
    scalar_text(scalar_of(editor, sfx, |sfx| sfx.volume))
}

pub fn pitch_of(editor: &Editor, sfx: &str) -> String {
    scalar_text(scalar_of(editor, sfx, |sfx| sfx.pitch))
}

fn scalar_of(editor: &Editor, sfx: &str, field: impl Fn(&SfxDef) -> SfxScalar) -> SfxScalar {
    editor
        .read::<SfxDef>(sfx)
        .and_then(Result::ok)
        .map(|sfx| field(&sfx))
        .unwrap_or_default()
}

fn scalar_text(scalar: SfxScalar) -> String {
    match scalar {
        SfxScalar::Fixed(fixed) => format!("{fixed} · the row's"),
        SfxScalar::Random { min, max } => format!("{min} to {max}, at random · the row's"),
    }
}
