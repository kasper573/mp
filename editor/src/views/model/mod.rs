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
use std::time::Instant;

use egui::{Color32, Rect as ERect, Ui, Vec2};
use serde_json::Value;

use crate::app::{BottomTab, Editor};
use crate::project::{Edit, Selection, row_file};
use crate::thumbs::Thumb;
use crate::ui::theme;
use crate::value::RowValue;

pub const TABLE: &str = "model";
pub const ACTIONS: [&str; 5] = ["idle", "walk", "run", "attack", "death"];
pub const DIRECTIONS: [&str; 8] = ["s", "sw", "nw", "n", "ne", "se", "e", "w"];
pub const MAX_FRAMES: usize = 256;
pub const MAX_FRAME_MS: u32 = 60_000;

#[derive(Default)]
pub struct ModelViews {
    pub views: HashMap<String, ModelView>,
    pub bank: sounds::SoundBank,
    pub play: Vec<sounds::PlayRequest>,
    pub drops: Vec<std::path::PathBuf>,
    pub reimports: HashMap<String, crate::import::ModelReimport>,
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum Page {
    #[default]
    Matrix,
    Timing,
    Cues,
    Hitbox,
    Busts,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CueKind {
    Apex,
    Sound,
    Step,
}

impl CueKind {
    pub fn key(self) -> &'static str {
        match self {
            CueKind::Apex => "apex",
            CueKind::Sound => "sound",
            CueKind::Step => "step",
        }
    }

    pub fn of(key: &str) -> Option<CueKind> {
        match key {
            "apex" => Some(CueKind::Apex),
            "sound" => Some(CueKind::Sound),
            "step" => Some(CueKind::Step),
            _ => None,
        }
    }
}

#[derive(Default)]
pub struct ModelView {
    pub page: Page,
    pub action: usize,
    pub direction: usize,
    pub frames: Vec<usize>,
    pub cue: Option<(usize, CueKind)>,
    pub preview: preview::Preview,
    pub timing: strip::TimingDraft,
    pub edge_drag: Option<strip::EdgeDrag>,
    pub last_nudge: Option<Instant>,
    pub surface: Option<String>,
    pub sheet_pick: Option<u32>,
    pub face: Option<String>,
    pub hitbox_drag: Option<hitbox::Handle>,
    pub sound_search: String,
    pub sound_filter: sounds::Filter,
    pub last_sound: Option<String>,
    pub confirm: Option<strip::Confirm>,
    pub removing: Option<RemoveFace>,
}

#[derive(Clone)]
pub struct RemoveFace {
    pub face: busts::Face,
    pub replacement: String,
    pub uses: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FrameData {
    pub frame: u32,
    pub ms: u32,
    pub apex: bool,
    pub step: bool,
    pub sound: Option<String>,
}

impl FrameData {
    pub fn to_value(&self) -> Value {
        let mut value = serde_json::json!({ "frame": self.frame, "ms": self.ms });
        if self.apex {
            value["apex"] = Value::Bool(true);
        }
        if self.step {
            value["step"] = Value::Bool(true);
        }
        if let Some(sound) = &self.sound {
            value["sound"] = Value::String(sound.clone());
        }
        value
    }

    pub fn of(value: &Value) -> FrameData {
        FrameData {
            frame: value["frame"].as_u64().unwrap_or(0) as u32,
            ms: value["ms"].as_u64().unwrap_or(100) as u32,
            apex: value["apex"].as_bool().unwrap_or(false),
            step: value["step"].as_bool().unwrap_or(false),
            sound: value["sound"].as_str().map(str::to_owned),
        }
    }

    pub fn cues(&self) -> Vec<CueKind> {
        let mut cues = Vec::new();
        if self.apex {
            cues.push(CueKind::Apex);
        }
        if self.sound.is_some() {
            cues.push(CueKind::Sound);
        }
        if self.step {
            cues.push(CueKind::Step);
        }
        cues
    }
}

#[derive(Clone)]
pub struct SheetInfo {
    pub image: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub columns: u32,
    pub rows: u32,
    pub thumb: Option<Thumb>,
}

impl SheetInfo {
    pub fn frames(&self) -> u32 {
        self.columns * self.rows
    }

    pub fn uv(&self, frame: u32) -> ERect {
        let Some(thumb) = &self.thumb else {
            return ERect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0));
        };
        let columns = self.columns.max(1);
        crate::thumbs::uv(
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
    let page = editor.views.model.views[key].page;
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(12, 8))
        .show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            if editor.views.model.reimports.contains_key(key) {
                crate::import::show_model_reimport(editor, ui, key);
                return;
            }
            page_bar(editor, ui, key, page);
            ui.add_space(4.0);
            match page {
                Page::Matrix => matrix::show(editor, ui, key, &row),
                Page::Timing => strip::show(editor, ui, key, &row),
                Page::Cues => cues::show(editor, ui, key, &row),
                Page::Hitbox => hitbox::show(editor, ui, key, &row),
                Page::Busts => busts::show(editor, ui, key, &row),
            }
        });
}

fn page_bar(editor: &mut Editor, ui: &mut Ui, key: &str, page: Page) {
    let view = editor
        .views
        .model
        .views
        .get_mut(key)
        .expect("the view exists");
    let in_strip = matches!(page, Page::Timing | Page::Cues);
    ui.horizontal(|ui| {
        ui.label(theme::mono(format!("model/{key}")).color(theme::CODE));
        ui.add_space(8.0);
        for (target, label) in [
            (Page::Matrix, "strips"),
            (Page::Hitbox, "hitbox"),
            (Page::Busts, "busts"),
        ] {
            let on = page == target || (target == Page::Matrix && in_strip);
            let (fill, ink) = if on {
                (theme::ACCENT, Color32::WHITE)
            } else {
                (theme::RAISED, theme::TEXT)
            };
            if crate::ui::widgets::chip_coloured(ui, label, fill, ink).clicked() {
                view.page = target;
            }
        }
        if in_strip {
            ui.add_space(8.0);
            ui.label(theme::faint("›"));
            for (target, label) in [(Page::Timing, "timing"), (Page::Cues, "cues")] {
                let on = page == target;
                let (fill, ink) = if on {
                    (theme::ACCENT_SOFT, theme::TEXT)
                } else {
                    (theme::RAISED, theme::MUTED)
                };
                if crate::ui::widgets::chip_coloured(ui, label, fill, ink).clicked() {
                    view.page = target;
                }
            }
            if crate::ui::widgets::keyed_button(ui, "‹ all strips", "Esc", true).clicked() {
                view.page = Page::Matrix;
            }
        }
    });
}

pub fn ensure_view(editor: &mut Editor, key: &str) {
    if editor.views.model.views.contains_key(key) {
        return;
    }
    editor
        .views
        .model
        .views
        .insert(key.to_owned(), ModelView::default());
    if let Some(row) = editor.row_value(TABLE, key)
        && let Some(index) = busts::module_index(&row)
    {
        let path = format!("{TABLE}/modules/{index}");
        if !editor.form.unfolded.contains(&path) {
            editor.form.folded.insert(path);
        }
    }
}

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    if selection
        .parts
        .first()
        .is_some_and(|part| part == "/import")
        && let Some(key) = selection.keys.first()
    {
        let key = key.clone();
        egui::ScrollArea::vertical()
            .id_salt(("model-import", &key))
            .show(ui, |ui| {
                crate::import::inspect_model_reimport(editor, ui, &key)
            });
        return;
    }
    inspect::show(editor, ui, selection);
}

pub fn bottom_tabs(editor: &Editor, key: &str) -> Vec<BottomTab> {
    match editor.views.model.views.get(key).map(|view| view.page) {
        Some(Page::Timing) => vec![BottomTab::Sheet],
        Some(Page::Cues) => vec![BottomTab::Sounds, BottomTab::Sheet],
        Some(Page::Busts) => Vec::new(),
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
        BottomTab::Sounds => sounds::bottom(editor, ui, key, &row),
        _ => {}
    }
}

pub fn strip_of(row: &Value, action: &str, direction: &str) -> Vec<FrameData> {
    row["sprites"]["actions"][action][direction]
        .as_array()
        .map(|frames| frames.iter().map(FrameData::of).collect())
        .unwrap_or_default()
}

pub fn total_ms(frames: &[FrameData]) -> u32 {
    frames.iter().map(|frame| frame.ms).sum()
}

pub fn starts_at(frames: &[FrameData], index: usize) -> u32 {
    frames.iter().take(index).map(|frame| frame.ms).sum()
}

pub fn lengths(frames: &[FrameData]) -> Vec<u32> {
    frames.iter().map(|frame| frame.ms).collect()
}

pub struct ActionTiming {
    pub common: Vec<u32>,
    pub differing: Vec<usize>,
}

pub fn action_timing(row: &Value, action: &str) -> ActionTiming {
    let strips: Vec<Vec<u32>> = DIRECTIONS
        .iter()
        .map(|direction| lengths(&strip_of(row, action, direction)))
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
    let differing = strips
        .iter()
        .enumerate()
        .filter(|(_, strip)| **strip != common)
        .map(|(index, _)| index)
        .collect();
    ActionTiming { common, differing }
}

pub fn play_rule(action: &str) -> &'static str {
    match action {
        "attack" => "once per swing",
        "death" => "once, then holds",
        _ => "loops",
    }
}

pub fn play_rule_long(action: &str) -> &'static str {
    match action {
        "attack" => "once per swing · at attack speed · the hit lands at the apex",
        "death" => "once, then holds · cues fire once",
        _ => "loops",
    }
}

pub fn sheet_info(editor: &mut Editor, ctx: &egui::Context, row: &Value) -> SheetInfo {
    let image = row["sprites"].text("image").to_owned();
    let frame_width = row["sprites"]["frame_size"]["width"]
        .as_u64()
        .unwrap_or(1)
        .max(1) as u32;
    let frame_height = row["sprites"]["frame_size"]["height"]
        .as_u64()
        .unwrap_or(1)
        .max(1) as u32;
    let Editor { project, form, .. } = editor;
    let thumb = project
        .as_ref()
        .and_then(|project| form.thumbnails.image(ctx, &project.files, &image));
    let (columns, rows) = thumb
        .as_ref()
        .map(|thumb| {
            (
                (thumb.size[0] as u32 / frame_width).max(1),
                (thumb.size[1] as u32 / frame_height).max(1),
            )
        })
        .unwrap_or((1, 1));
    SheetInfo {
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
    action: &str,
    direction: &str,
    frames: &[FrameData],
    label: impl Into<String>,
    merge: bool,
) -> bool {
    let Some(mut row) = editor.row_value(TABLE, key) else {
        return false;
    };
    row["sprites"]["actions"][action][direction] =
        Value::Array(frames.iter().map(FrameData::to_value).collect());
    write_row(editor, key, &row, label, merge)
}

pub fn write_row(
    editor: &mut Editor,
    key: &str,
    row: &Value,
    label: impl Into<String>,
    merge: bool,
) -> bool {
    let mut edit = Edit::new(label);
    if merge {
        edit = edit.merging();
    }
    edit.write_json(row_file(TABLE, key), row);
    editor.apply(edit)
}

pub fn select_strip(editor: &mut Editor, key: &str, action: usize, direction: usize) {
    editor.select(Selection {
        table: TABLE.to_owned(),
        keys: vec![key.to_owned()],
        parts: vec![format!(
            "/sprites/actions/{}/{}",
            ACTIONS[action], DIRECTIONS[direction]
        )],
    });
}

pub fn select_frames(editor: &mut Editor, key: &str, action: usize, direction: usize) {
    let frames = editor
        .views
        .model
        .views
        .get(key)
        .map(|view| view.frames.clone())
        .unwrap_or_default();
    if frames.is_empty() {
        select_strip(editor, key, action, direction);
        return;
    }
    editor.select(Selection {
        table: TABLE.to_owned(),
        keys: vec![key.to_owned()],
        parts: frames
            .iter()
            .map(|index| {
                format!(
                    "/sprites/actions/{}/{}/{index}",
                    ACTIONS[action], DIRECTIONS[direction]
                )
            })
            .collect(),
    });
}

pub fn select_cue(
    editor: &mut Editor,
    key: &str,
    action: usize,
    direction: usize,
    frame: usize,
    cue: CueKind,
) {
    editor.select(Selection {
        table: TABLE.to_owned(),
        keys: vec![key.to_owned()],
        parts: vec![format!(
            "/sprites/actions/{}/{}/{frame}/{}",
            ACTIONS[action],
            DIRECTIONS[direction],
            cue.key()
        )],
    });
}

pub fn users(editor: &Editor, key: &str) -> Vec<(String, String)> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    project
        .usages
        .of_row(TABLE, key)
        .iter()
        .filter_map(|usage| crate::project::row_of(&usage.file))
        .filter(|(table, _)| matches!(*table, "npc" | "player"))
        .map(|(table, key)| (table.to_owned(), key.to_owned()))
        .collect()
}

pub fn keyboard_free(ui: &Ui) -> bool {
    !ui.ctx().egui_wants_keyboard_input()
}
