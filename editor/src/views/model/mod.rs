pub mod busts;
pub mod cues;
pub mod hitbox;
pub mod inspect;
pub mod matrix;
pub mod preview;
pub mod sheet;
pub mod sounds;
pub mod strip;

use std::collections::HashMap;
use std::path::PathBuf;

use egui::{Color32, Rect as ERect, Ui, Vec2};
use engine::core::content::{ContentFile, FolderReader};
use engine::core::math::Direction;
use engine::systems::actor::model::SheetFrame;
use engine::systems::actor::{Action, ModelDef};
use engine::systems::npc::NpcDef;
use engine::systems::player::PlayerDef;
use serde::Deserialize;
use strum::{EnumDiscriminants, EnumString, IntoStaticStr, VariantArray};

use crate::app::{BottomTab, Editor};
use crate::audio::WaveformCache;
use crate::import;
use crate::keymap::EditorKey;
use crate::project::files::content_of;
use crate::project::{ContentEdit, RowSelection};
use crate::tabs::shown_path;
use crate::thumbs::{self, Thumbnail};
use crate::ui::{row_form, sidebar, theme, widgets};

#[derive(Default)]
pub struct ModelViews {
    pub views: HashMap<String, ModelView>,
    pub bank: WaveformCache,
    pub drops: Vec<PathBuf>,
    pub reimports: HashMap<String, import::ModelReimport>,
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum ModelPage {
    #[default]
    Matrix,
    Timing,
    Cues,
    Hitbox,
    Busts,
}

/// What a strip frame marks: the apex of an action, a sound it plays, or a footstep.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, EnumDiscriminants)]
#[strum_discriminants(
    name(FrameCueKind),
    derive(EnumString, IntoStaticStr, VariantArray, Deserialize),
    strum(serialize_all = "lowercase"),
    serde(rename_all = "lowercase")
)]
pub enum FrameCue {
    Apex,
    Sound(String),
    Step,
}

impl FrameCue {
    pub fn label(&self) -> String {
        match self {
            FrameCue::Sound(sound) => sound.clone(),
            other => FrameCueKind::from(other).key().to_owned(),
        }
    }
}

impl FrameCueKind {
    pub fn key(self) -> &'static str {
        self.into()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct ModelStrip {
    pub action: Action,
    pub direction: Direction,
}

impl ModelStrip {
    pub fn parse(action: &str, direction: &str) -> Option<ModelStrip> {
        Some(ModelStrip {
            action: action.parse().ok()?,
            direction: direction.parse().ok()?,
        })
    }

    pub fn all() -> impl Iterator<Item = ModelStrip> {
        Action::VARIANTS.iter().flat_map(|&action| {
            Direction::VARIANTS
                .iter()
                .map(move |&direction| ModelStrip { action, direction })
        })
    }

    pub fn name(self) -> String {
        format!("{} · {}", self.action.as_ref(), self.direction.as_ref())
    }

    pub fn pointer(self) -> String {
        format!(
            "/sprites/actions/{}/{}",
            self.action.as_ref(),
            self.direction.as_ref()
        )
    }

    pub fn record_key(self) -> String {
        format!("{}_{}", self.action.as_ref(), self.direction.as_ref())
    }
}

#[derive(Default)]
pub struct ModelView {
    pub page: ModelPage,
    pub strip: ModelStrip,
    pub frames: Vec<usize>,
    pub cue: Option<(usize, FrameCueKind)>,
    pub preview: preview::StripPreview,
    pub timing: strip::TimingDraft,
    pub edge_drag: Option<strip::FrameEdgeDrag>,
    pub surface: Option<String>,
    pub sheet_pick: Option<u32>,
    pub face: Option<String>,
    pub hitbox_drag: Option<hitbox::HitboxHandle>,
    pub sound_search: String,
    pub sound_role: Option<String>,
    pub last_sound: Option<String>,
    pub confirm: Option<strip::StripConfirm>,
    pub removing: Option<FaceRemoval>,
}

impl ModelViews {
    pub fn view(&self, key: &str) -> &ModelView {
        self.views
            .get(key)
            .expect("ensure_view ran before the model view was read")
    }

    pub fn view_mut(&mut self, key: &str) -> &mut ModelView {
        self.views.entry(key.to_owned()).or_default()
    }
}

#[derive(Clone)]
pub struct FaceRemoval {
    pub face: busts::BustFace,
    pub replacement: String,
    pub uses: usize,
}

/// A frame of `frame` on the sheet, shown `ms` long, with no cues.
pub fn plain_frame(frame: u32, ms: u32) -> SheetFrame {
    SheetFrame {
        frame,
        ms,
        step: false,
        apex: false,
        sound: None,
    }
}

/// The cues on `frame`, its sound named by its path among `reader`'s files.
pub fn cues_of(frame: &SheetFrame, reader: &FolderReader) -> Vec<FrameCue> {
    let mut cues = Vec::new();
    if frame.apex {
        cues.push(FrameCue::Apex);
    }
    cues.extend(
        frame
            .sound
            .and_then(|sound| reader.path_of(sound))
            .map(|sound| FrameCue::Sound(sound.to_owned())),
    );
    if frame.step {
        cues.push(FrameCue::Step);
    }
    cues
}

/// Puts `cue` on `frame`; a sound no file of `reader`'s has stays off.
pub fn mark(frame: &mut SheetFrame, cue: &FrameCue, reader: &FolderReader) {
    match cue {
        FrameCue::Apex => frame.apex = true,
        FrameCue::Sound(sound) => frame.sound = reader.id_of(sound).or(frame.sound),
        FrameCue::Step => frame.step = true,
    }
}

pub fn has_cue(frame: &SheetFrame, kind: FrameCueKind) -> bool {
    match kind {
        FrameCueKind::Apex => frame.apex,
        FrameCueKind::Sound => frame.sound.is_some(),
        FrameCueKind::Step => frame.step,
    }
}

#[derive(Clone)]
pub struct ModelSheet {
    pub image: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub columns: u32,
    pub rows: u32,
    pub thumb: Option<Thumbnail>,
}

impl ModelSheet {
    pub fn frames(&self) -> u32 {
        self.columns * self.rows
    }

    pub fn uv(&self, frame: u32) -> ERect {
        let Some(thumb) = &self.thumb else {
            return thumbs::FULL_UV;
        };
        let columns = self.columns.max(1);
        thumbs::uv(
            thumb.size,
            (frame % columns * self.frame_width) as f32,
            (frame / columns * self.frame_height) as f32,
            self.frame_width as f32,
            self.frame_height as f32,
        )
    }

    pub fn draw(&self, painter: &egui::Painter, rect: ERect, frame: u32, tint: Color32) {
        let Some(thumb) = &self.thumb else {
            return;
        };
        let (w, h) = (self.frame_width as f32, self.frame_height as f32);
        let fit = (rect.width() / w).min(rect.height() / h);
        let scale = if fit >= 1.0 { fit.floor() } else { fit };
        let shown = Vec2::new(w * scale, h * scale);
        painter.image(
            thumb.texture.id(),
            ERect::from_center_size(rect.center(), shown),
            self.uv(frame),
            tint,
        );
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = super::read_shown::<ModelDef>(editor, ui, key) else {
        return;
    };
    ensure_view(editor, key);
    let ctx = ui.ctx().clone();
    inspect::remove_face_dialog(editor, &ctx, key);
    let page = editor.views.model.view(key).page;
    sidebar::row(ui, "model", |ui| {
        row_form::show_row(editor, ui, ModelDef::TABLE, key)
    });
    let selection = editor.selection.clone();
    sidebar::inspector(editor, ui, "model", |editor, ui| {
        if selection.table == ModelDef::TABLE
            && selection.keys.first().is_some_and(|k| k == key)
            && !selection.parts.is_empty()
        {
            inspect_parts(editor, ui, &selection);
        } else {
            sidebar::nothing_selected(ui, "Select a strip, frame or face to inspect it here.");
        }
    });
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(12, 8))
        .show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            if editor.views.model.reimports.contains_key(key) {
                import::show_model_reimport(editor, ui, key);
                return;
            }
            page_bar(editor, ui, key, page);
            ui.add_space(4.0);
            egui::ScrollArea::both()
                .id_salt(("model-page", key))
                .auto_shrink([false, false])
                .show(ui, |ui| match page {
                    ModelPage::Matrix => matrix::show(editor, ui, key, &row),
                    ModelPage::Timing => strip::show(editor, ui, key, &row),
                    ModelPage::Cues => cues::show(editor, ui, key, &row),
                    ModelPage::Hitbox => hitbox::show(editor, ui, key, &row),
                    ModelPage::Busts => busts::show(editor, ui, key, &row),
                });
        });
}

fn page_bar(editor: &mut Editor, ui: &mut Ui, key: &str, page: ModelPage) {
    let view = editor.views.model.view_mut(key);
    let in_strip = matches!(page, ModelPage::Timing | ModelPage::Cues);
    ui.horizontal(|ui| {
        ui.label(theme::mono(shown_path(key)).color(theme::CODE));
        ui.add_space(8.0);
        for (target, label) in [
            (ModelPage::Matrix, "strips"),
            (ModelPage::Hitbox, "hitbox"),
            (ModelPage::Busts, "busts"),
        ] {
            let on = page == target || (target == ModelPage::Matrix && in_strip);
            if widgets::mode_chip(ui, label, on).clicked() {
                view.page = target;
            }
        }
        if in_strip {
            ui.add_space(8.0);
            ui.label(theme::faint("›"));
            for (target, label) in [(ModelPage::Timing, "timing"), (ModelPage::Cues, "cues")] {
                let on = page == target;
                if widgets::toggle_chip(ui, label, on).clicked() {
                    view.page = target;
                }
            }
            if widgets::keyed_button(ui, "‹ all strips", Some(EditorKey::Cancel), true).clicked()
            {
                view.page = ModelPage::Matrix;
            }
        }
    });
}

pub fn ensure_view(editor: &mut Editor, key: &str) {
    if editor.views.model.views.contains_key(key) {
        return;
    }
    editor.views.model.view_mut(key);
    if let Some(Ok(model)) = editor.read::<ModelDef>(key)
        && let Some(index) = busts::module_index(&model)
    {
        let path = format!("{}/modules/{index}", ModelDef::TABLE);
        if !editor.form.unfolded.contains(&path) {
            editor.form.folded.insert(path);
        }
    }
}

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &RowSelection) {
    if selection
        .parts
        .first()
        .is_some_and(|part| part == import::IMPORT_PART)
        && let Some(key) = selection.keys.first()
    {
        let key = key.clone();
        egui::ScrollArea::vertical()
            .id_salt(("model-import", &key))
            .show(ui, |ui| import::inspect_model_reimport(editor, ui, &key));
        return;
    }
    inspect::show(editor, ui, selection);
}

pub fn bottom_tabs(editor: &Editor, key: &str) -> Vec<BottomTab> {
    match editor.views.model.views.get(key).map(|view| view.page) {
        Some(ModelPage::Timing) => vec![BottomTab::Sheet],
        Some(ModelPage::Cues) => vec![BottomTab::Sounds, BottomTab::Sheet],
        Some(ModelPage::Busts) => Vec::new(),
        _ => vec![BottomTab::Timeline],
    }
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, key: &str, tab: BottomTab) {
    let Some(row) = super::read_shown::<ModelDef>(editor, ui, key) else {
        return;
    };
    ensure_view(editor, key);
    match tab {
        BottomTab::Timeline => matrix::timeline(editor, ui, key, &row),
        BottomTab::Sheet => sheet::show(editor, ui, key, &row),
        BottomTab::Sounds => sounds::bottom(editor, ui, key),
        _ => {}
    }
}

pub fn strip_of(model: &ModelDef, strip: ModelStrip) -> Vec<SheetFrame> {
    model
        .sprites
        .actions
        .get(&strip.action)
        .and_then(|strips| strips.get(&strip.direction))
        .cloned()
        .unwrap_or_default()
}

pub fn set_strip(model: &mut ModelDef, strip: ModelStrip, frames: Vec<SheetFrame>) {
    model
        .sprites
        .actions
        .entry(strip.action)
        .or_default()
        .insert(strip.direction, frames);
}

pub fn frame_size(model: &ModelDef) -> Option<(u32, u32)> {
    let size = model.sprites.frame_size;
    (size.width > 0 && size.height > 0).then_some((size.width, size.height))
}

pub fn shifted<T: Copy + PartialEq>(all: &[T], current: T, by: isize) -> T {
    let at = all.iter().position(|item| *item == current).unwrap_or(0) as isize;
    all[(at + by).clamp(0, all.len() as isize - 1) as usize]
}

pub fn total_ms(frames: &[SheetFrame]) -> u32 {
    frames.iter().map(|frame| frame.ms).sum()
}

pub fn starts_at(frames: &[SheetFrame], index: usize) -> u32 {
    frames.iter().take(index).map(|frame| frame.ms).sum()
}

pub fn lengths(frames: &[SheetFrame]) -> Vec<u32> {
    frames.iter().map(|frame| frame.ms).collect()
}

pub struct ActionTiming {
    pub common: Vec<u32>,
    pub differing: Vec<Direction>,
}

impl ActionTiming {
    pub fn out_of_step(&self, direction: Direction) -> bool {
        self.differing.contains(&direction) && self.differing.len() < Direction::VARIANTS.len()
    }

    pub fn stragglers(&self) -> usize {
        if self.differing.len() < Direction::VARIANTS.len() {
            self.differing.len()
        } else {
            0
        }
    }
}

pub fn action_timing(row: &ModelDef, action: Action) -> ActionTiming {
    let strips: Vec<Vec<u32>> = Direction::VARIANTS
        .iter()
        .map(|&direction| lengths(&strip_of(row, ModelStrip { action, direction })))
        .collect();
    let mut tally: Vec<(Vec<u32>, usize)> = Vec::new();
    for strip in &strips {
        match tally.iter_mut().find(|(seen, _)| seen == strip) {
            Some((_, count)) => *count += 1,
            None => tally.push((strip.clone(), 1)),
        }
    }
    let common = tally
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(strip, _)| strip.clone())
        .unwrap_or_default();
    let differing = Direction::VARIANTS
        .iter()
        .zip(&strips)
        .filter(|(_, strip)| **strip != common)
        .map(|(direction, _)| *direction)
        .collect();
    ActionTiming { common, differing }
}

pub fn play_rule(action: Action) -> &'static str {
    match action {
        Action::Attack => "once per swing",
        Action::Dead => "once, then holds",
        _ => "loops",
    }
}

pub fn play_rule_long(action: Action) -> &'static str {
    match action {
        Action::Attack => "once per swing · at attack speed · the hit lands at the apex",
        Action::Dead => "once, then holds · cues fire once",
        _ => "loops",
    }
}

pub fn sheet_info(editor: &mut Editor, ctx: &egui::Context, model: &ModelDef) -> ModelSheet {
    let image = model.sprites.image.as_str().to_owned();
    let (frame_width, frame_height) = frame_size(model).unwrap_or((1, 1));
    let thumb = editor.thumb(ctx, &image);
    let (columns, rows) = thumb
        .as_ref()
        .map(|thumb| {
            (
                (thumb.size[0] as u32 / frame_width).max(1),
                (thumb.size[1] as u32 / frame_height).max(1),
            )
        })
        .unwrap_or((1, 1));
    ModelSheet {
        image,
        frame_width,
        frame_height,
        columns,
        rows,
        thumb,
    }
}

pub fn write_strip(
    editor: &mut Editor,
    key: &str,
    strip: ModelStrip,
    frames: &[SheetFrame],
    edit: ContentEdit,
) -> bool {
    let Some(Ok(model)) = editor.read::<ModelDef>(key) else {
        return false;
    };
    let mut model = (*model).clone();
    set_strip(&mut model, strip, frames.to_vec());
    editor.write_content_as(edit, key, &model)
}

pub fn select_strip(editor: &mut Editor, key: &str, strip: ModelStrip) {
    editor.select(RowSelection::parts(
        ModelDef::TABLE,
        key,
        vec![strip.pointer()],
    ));
}

pub fn select_frames(editor: &mut Editor, key: &str, strip: ModelStrip) {
    let frames = editor
        .views
        .model
        .views
        .get(key)
        .map(|view| view.frames.clone())
        .unwrap_or_default();
    if frames.is_empty() {
        select_strip(editor, key, strip);
        return;
    }
    let pointer = strip.pointer();
    editor.select(RowSelection::parts(
        ModelDef::TABLE,
        key,
        frames
            .iter()
            .map(|index| format!("{pointer}/{index}"))
            .collect(),
    ));
}

pub fn select_cue(
    editor: &mut Editor,
    key: &str,
    strip: ModelStrip,
    frame: usize,
    cue: FrameCueKind,
) {
    editor.select(RowSelection::parts(
        ModelDef::TABLE,
        key,
        vec![format!("{}/{frame}/{}", strip.pointer(), cue.key())],
    ));
}

pub fn users(editor: &Editor, key: &str) -> Vec<(String, String)> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    project
        .usages
        .of_content(key)
        .iter()
        .filter_map(|usage| content_of(&usage.file))
        .filter(|(table, _)| matches!(*table, NpcDef::TABLE | PlayerDef::TABLE))
        .map(|(table, key)| (table.to_owned(), key.to_owned()))
        .collect()
}

pub fn keyboard_free(ui: &Ui) -> bool {
    !ui.ctx().egui_wants_keyboard_input()
}
