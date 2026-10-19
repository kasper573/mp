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
use engine::core::math::Direction;
use engine::systems::actor::Action;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum::{EnumString, IntoStaticStr, VariantArray};

use crate::app::{BottomTab, Editor};
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::thumbs::Thumbnail;
use crate::ui::{row_form, sidebar, theme, widgets};
use crate::value::RowValue;
use crate::{import, thumbs, value};
use engine::core::content::{row_file, row_of};

pub const TABLE: &str = "model";
pub const MAX_FRAMES: usize = 256;
pub const MAX_FRAME_MS: u32 = 60_000;

#[derive(Default)]
pub struct ModelViews {
    pub views: HashMap<String, ModelView>,
    pub bank: crate::audio::WaveformCache,
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

#[derive(
    Clone, Copy, PartialEq, Eq, Debug, EnumString, IntoStaticStr, VariantArray, Deserialize,
)]
#[strum(serialize_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum FrameCueKind {
    Apex,
    Sound,
    Step,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct StripFrame {
    pub frame: u32,
    pub ms: u32,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub step: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub apex: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sound: Option<String>,
}

impl Default for StripFrame {
    fn default() -> StripFrame {
        StripFrame {
            frame: 0,
            ms: 100,
            step: false,
            apex: false,
            sound: None,
        }
    }
}

impl StripFrame {
    pub fn cues(&self) -> Vec<FrameCueKind> {
        FrameCueKind::VARIANTS
            .iter()
            .copied()
            .filter(|kind| self.has(*kind))
            .collect()
    }

    pub fn has(&self, kind: FrameCueKind) -> bool {
        match kind {
            FrameCueKind::Apex => self.apex,
            FrameCueKind::Sound => self.sound.is_some(),
            FrameCueKind::Step => self.step,
        }
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
            return ERect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0));
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
    let Some(row) = editor.row_value(TABLE, key) else {
        ui.label(theme::muted(format!("model/{key} is gone")));
        return;
    };
    ensure_view(editor, key);
    let ctx = ui.ctx().clone();
    inspect::remove_face_dialog(editor, &ctx, key);
    let page = editor.views.model.view(key).page;
    sidebar::row(ui, "model", |ui| row_form::show_row(editor, ui, TABLE, key));
    let selection = editor.selection.clone();
    sidebar::inspector(ui, "model", |ui| {
        if selection.table == TABLE
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
        ui.label(theme::mono(format!("model/{key}")).color(theme::CODE));
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
    if let Some(row) = editor.row_value(TABLE, key)
        && let Some(index) = busts::module_index(&row)
    {
        let path = format!("{TABLE}/modules/{index}");
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
    let Some(row) = editor.row_value(TABLE, key) else {
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

pub fn strip_of(row: &Value, strip: ModelStrip) -> Vec<StripFrame> {
    row["sprites"]["actions"][strip.action.as_ref()][strip.direction.as_ref()]
        .as_array()
        .map(|frames| {
            frames
                .iter()
                .map(|frame| serde_json::from_value(frame.clone()).unwrap_or_default())
                .collect()
        })
        .unwrap_or_default()
}

pub fn frames_json(frames: &[StripFrame]) -> Value {
    Value::Array(
        frames
            .iter()
            .filter_map(|frame| value::json(frame).ok())
            .collect(),
    )
}

pub fn shifted<T: Copy + PartialEq>(all: &[T], current: T, by: isize) -> T {
    let at = all.iter().position(|item| *item == current).unwrap_or(0) as isize;
    all[(at + by).clamp(0, all.len() as isize - 1) as usize]
}

pub fn total_ms(frames: &[StripFrame]) -> u32 {
    frames.iter().map(|frame| frame.ms).sum()
}

pub fn starts_at(frames: &[StripFrame], index: usize) -> u32 {
    frames.iter().take(index).map(|frame| frame.ms).sum()
}

pub fn lengths(frames: &[StripFrame]) -> Vec<u32> {
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

pub fn action_timing(row: &Value, action: Action) -> ActionTiming {
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

pub fn sheet_info(editor: &mut Editor, ctx: &egui::Context, row: &Value) -> ModelSheet {
    let image = row["sprites"].text("image").to_owned();
    let frame_width = row["sprites"]["frame_size"]["width"]
        .as_u64()
        .unwrap_or(1)
        .max(1) as u32;
    let frame_height = row["sprites"]["frame_size"]["height"]
        .as_u64()
        .unwrap_or(1)
        .max(1) as u32;
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
    frames: &[StripFrame],
    edit: ContentEdit,
) -> bool {
    let Some(mut row) = editor.row_value(TABLE, key) else {
        return false;
    };
    row["sprites"]["actions"][strip.action.as_ref()][strip.direction.as_ref()] =
        frames_json(frames);
    write_row(editor, key, &row, edit)
}

pub fn write_row(editor: &mut Editor, key: &str, row: &Value, mut edit: ContentEdit) -> bool {
    edit.write_json(row_file(TABLE, key), row);
    editor.apply(edit)
}

pub fn select_strip(editor: &mut Editor, key: &str, strip: ModelStrip) {
    editor.select(RowSelection::parts(TABLE, key, vec![strip.pointer()]));
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
        TABLE,
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
        TABLE,
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
        .of_row(TABLE, key)
        .iter()
        .filter_map(|usage| row_of(&usage.file))
        .filter(|(table, _)| matches!(*table, "npc" | "player"))
        .map(|(table, key)| (table.to_owned(), key.to_owned()))
        .collect()
}

pub fn keyboard_free(ui: &Ui) -> bool {
    !ui.ctx().egui_wants_keyboard_input()
}
