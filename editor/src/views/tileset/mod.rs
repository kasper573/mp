pub mod animation;
pub mod inspect;
pub mod sheet;
pub mod surfaces;
pub mod terrain;

use std::collections::{BTreeMap, HashMap, HashSet};

use egui::{Color32, Ui};
use serde_json::Value;

use crate::app::{BottomTab, Editor};
use crate::project::{Edit, Selection, row_file};
use crate::thumbs::Thumb;
use crate::ui::{theme, widgets};

pub const TABLE: &str = "tileset";

#[derive(Default)]
pub struct TilesetViews {
    pub views: HashMap<String, TilesetView>,
    pub reimports: HashMap<String, crate::import::TilesetReimport>,
    pub counts: Option<Counts>,
}

/// What every tileset says together, rebuilt when the folder changes.
pub struct Counts {
    pub generation: u64,
    pub surfaces: HashMap<String, (usize, HashSet<String>)>,
    pub with_surface: usize,
    pub areas_using: HashMap<String, Vec<String>>,
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum Mode {
    #[default]
    Walk,
    Surface,
    Terrain,
    Animation,
}

impl Mode {
    pub const ALL: [Mode; 4] = [Mode::Walk, Mode::Surface, Mode::Terrain, Mode::Animation];

    pub fn label(self) -> &'static str {
        match self {
            Mode::Walk => "walk",
            Mode::Surface => "surface",
            Mode::Terrain => "terrain",
            Mode::Animation => "animation",
        }
    }

    pub fn of(name: &str) -> Option<Mode> {
        Mode::ALL.into_iter().find(|mode| mode.label() == name)
    }
}

/// What the walk brush paints: a value, or nothing said.
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum WalkBrush {
    Walkable,
    #[default]
    Blocks,
    Nothing,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TileRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl TileRect {
    pub fn tiles(&self, columns: u32) -> Vec<Vec<u32>> {
        (self.y..self.y + self.h)
            .map(|row| {
                (self.x..self.x + self.w)
                    .map(|col| row * columns + col)
                    .collect()
            })
            .collect()
    }

    pub fn contains(&self, tile: u32, columns: u32) -> bool {
        let (x, y) = (tile % columns, tile / columns);
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }

    pub fn count(&self) -> u32 {
        self.w * self.h
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum TilesetDialog {
    MakeBlueprint {
        name: String,
        error: Option<String>,
    },
    NewSurface {
        name: String,
        footstep: String,
        error: Option<String>,
    },
    NewTerrainSet {
        name: String,
        terrains: String,
        error: Option<String>,
    },
}

pub struct TilesetView {
    pub mode: Mode,
    pub zoom: f32,
    pub walk: WalkBrush,
    pub surface: Option<String>,
    pub set: Option<String>,
    pub terrain: usize,
    pub selection: Option<TileRect>,
    pub anchor: Option<(u32, u32)>,
    pub tile: Option<u32>,
    pub closeup: Option<u32>,
    pub stroke: Vec<u32>,
    pub painting: bool,
    pub selecting: bool,
    pub dialog: Option<TilesetDialog>,
    pub preview: crate::views::model::preview::Preview,
    pub frame: Option<usize>,
    pub each_draft: String,
}

impl Default for TilesetView {
    fn default() -> TilesetView {
        TilesetView {
            mode: Mode::Walk,
            zoom: 1.0,
            walk: WalkBrush::Blocks,
            surface: None,
            set: None,
            terrain: 1,
            selection: None,
            anchor: None,
            tile: None,
            closeup: None,
            stroke: Vec::new(),
            painting: false,
            selecting: false,
            dialog: None,
            preview: crate::views::model::preview::Preview::default(),
            frame: None,
            each_draft: String::new(),
        }
    }
}

/// A tileset's image cut into its grid.
#[derive(Clone)]
pub struct Grid {
    pub tile_px: u32,
    pub columns: u32,
    pub rows: u32,
    pub thumb: Option<Thumb>,
}

impl Grid {
    pub fn count(&self) -> u32 {
        self.columns * self.rows
    }

    pub fn uv(&self, tile: u32) -> egui::Rect {
        let Some(thumb) = &self.thumb else {
            return egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0));
        };
        crate::thumbs::uv(
            thumb.size,
            (tile % self.columns * self.tile_px) as f32,
            (tile / self.columns * self.tile_px) as f32,
            self.tile_px as f32,
            self.tile_px as f32,
        )
    }

    pub fn draw(&self, painter: &egui::Painter, rect: egui::Rect, tile: u32) {
        if let Some(thumb) = &self.thumb {
            painter.image(thumb.texture.id(), rect, self.uv(tile), Color32::WHITE);
        }
    }

    pub fn xy(&self, tile: u32) -> (u32, u32) {
        (tile % self.columns, tile / self.columns)
    }
}

pub fn grid_of(editor: &mut Editor, ctx: &egui::Context, row: &Value) -> Grid {
    let image = row["image"].as_str().unwrap_or("").to_owned();
    let tile_px = row["tile"].as_u64().unwrap_or(16).max(1) as u32;
    let Editor { project, form, .. } = editor;
    let thumb = project
        .as_ref()
        .and_then(|project| form.thumbnails.image(ctx, &project.files, &image));
    let (columns, rows) = thumb
        .as_ref()
        .map(|thumb| {
            (
                (thumb.size[0] as u32 / tile_px).max(1),
                (thumb.size[1] as u32 / tile_px).max(1),
            )
        })
        .unwrap_or((1, 1));
    Grid {
        tile_px,
        columns,
        rows,
        thumb,
    }
}

pub fn ensure_view(editor: &mut Editor, key: &str) {
    if !editor.views.tileset.views.contains_key(key) {
        editor
            .views
            .tileset
            .views
            .insert(key.to_owned(), TilesetView::default());
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(TABLE, key) else {
        ui.label(theme::muted(format!("tileset/{key} is gone")));
        return;
    };
    ensure_view(editor, key);
    refresh_counts(editor);
    let ctx = ui.ctx().clone();
    let grid = grid_of(editor, &ctx, &row);
    dialogs(editor, &ctx, key, &row, &grid);
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(12, 8))
        .show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            if editor.views.tileset.reimports.contains_key(key) {
                crate::import::show_tileset_reimport(editor, ui, key);
                return;
            }
            header(editor, ui, key, &row);
            ui.add_space(6.0);
            let mode = editor.views.tileset.views[key].mode;
            match mode {
                Mode::Terrain => terrain::show(editor, ui, key, &row, &grid),
                Mode::Animation => animation::show(editor, ui, key, &row, &grid),
                _ => {
                    sheet::show(editor, ui, key, &row, &grid);
                }
            }
        });
    if !editor.views.tileset.reimports.contains_key(key) {
        status(editor, key, &row, &grid);
    }
}

fn header(editor: &mut Editor, ui: &mut Ui, key: &str, row: &Value) {
    let mode = editor.views.tileset.views[key].mode;
    let mut picked = None;
    let mut import = None;
    ui.horizontal(|ui| {
        ui.label(theme::mono(format!("tileset/{key}")).color(theme::CODE));
        ui.add_space(8.0);
        for option in Mode::ALL {
            let on = option == mode;
            let (fill, ink) = if on {
                (theme::ACCENT, Color32::WHITE)
            } else {
                (theme::RAISED, theme::TEXT)
            };
            if widgets::chip_coloured(ui, option.label(), fill, ink).clicked() {
                picked = Some(option);
            }
        }
        ui.add_space(12.0);
        match mode {
            Mode::Walk => sheet::walk_legend(editor, ui, key),
            Mode::Surface => sheet::surface_legend(editor, ui, key),
            Mode::Terrain => terrain::legend(editor, ui, key, row),
            Mode::Animation => animation::legend(ui),
        }
        if ui.available_width() > 120.0 {
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.menu_button("🗋 Import ▾", |ui| {
                    if ui.button("Onto this tileset…").clicked() {
                        import = Some(true);
                        ui.close();
                    }
                    if ui.button("An animation onto its tiles…").clicked() {
                        import = Some(false);
                        ui.close();
                    }
                });
            });
        }
    });
    if let Some(mode) = picked {
        set_mode(editor, key, mode);
    }
    match import {
        Some(true) => crate::import::start_for_tileset(editor, key),
        Some(false) => crate::import::start_animation(editor, key),
        None => {}
    }
}

pub fn set_mode(editor: &mut Editor, key: &str, mode: Mode) {
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    view.mode = mode;
    view.anchor = None;
    view.painting = false;
    match mode {
        Mode::Terrain => select_parts(editor, key, vec!["/terrains".to_owned()]),
        Mode::Animation => select_parts(editor, key, vec!["/animation".to_owned()]),
        _ => {
            let tile = editor.views.tileset.views[key].tile;
            match tile {
                Some(tile) => select_tile(editor, key, tile),
                None => editor.select(Selection::row(TABLE, key)),
            }
        }
    }
}

pub fn select_tile(editor: &mut Editor, key: &str, tile: u32) {
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    view.tile = Some(tile);
    select_parts(editor, key, vec![format!("/tiles/{tile}")]);
}

pub fn select_parts(editor: &mut Editor, key: &str, parts: Vec<String>) {
    editor.select(Selection {
        table: TABLE.to_owned(),
        keys: vec![key.to_owned()],
        parts,
    });
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
            .id_salt(("tileset-import", &key))
            .show(ui, |ui| {
                crate::import::inspect_tileset_reimport(editor, ui, &key)
            });
        return;
    }
    inspect::show(editor, ui, selection);
}

pub fn bottom_tabs(editor: &Editor, key: &str) -> Vec<BottomTab> {
    match editor.views.tileset.views.get(key).map(|view| view.mode) {
        Some(Mode::Surface) => vec![BottomTab::Surfaces],
        Some(Mode::Terrain) => vec![BottomTab::Mixes],
        Some(Mode::Animation) => vec![BottomTab::Timeline],
        _ => Vec::new(),
    }
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, key: &str, tab: BottomTab) {
    let Some(row) = editor.row_value(TABLE, key) else {
        return;
    };
    ensure_view(editor, key);
    let ctx = ui.ctx().clone();
    let grid = grid_of(editor, &ctx, &row);
    match tab {
        BottomTab::Surfaces => surfaces::bottom(editor, ui, key, &row),
        BottomTab::Mixes => terrain::mixes(editor, ui, key, &row, &grid),
        BottomTab::Timeline => animation::timeline(editor, ui, key, &row, &grid),
        _ => {}
    }
}

/// The data of one tile as the row stores it.
pub fn tile_data(row: &Value, tile: u32) -> Value {
    row["tiles"][tile.to_string()].clone()
}

/// Writes one tile's data, dropping the entry when nothing is left to say.
pub fn set_tile_field(row: &mut Value, tile: u32, field: &str, value: Value) {
    if !row["tiles"].is_object() {
        row["tiles"] = Value::Object(serde_json::Map::new());
    }
    let key = tile.to_string();
    let tiles = row["tiles"].as_object_mut().expect("an object");
    let entry = tiles
        .entry(key.clone())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    match value {
        Value::Null => {
            if let Some(object) = entry.as_object_mut() {
                object.remove(field);
            }
        }
        other => entry[field] = other,
    }
    let empty = entry.as_object().is_none_or(|object| {
        object.is_empty()
            || object.values().all(|value| match value {
                Value::Null => true,
                Value::Array(items) => items.is_empty(),
                Value::Object(fields) => fields.is_empty(),
                _ => false,
            })
    });
    if empty {
        tiles.remove(&key);
    }
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

/// Every tileset's surfaces and every area's tilesets, for the counts the views show.
fn refresh_counts(editor: &mut Editor) {
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    if editor
        .views
        .tileset
        .counts
        .as_ref()
        .is_some_and(|counts| counts.generation == project.generation)
    {
        return;
    }
    let mut surfaces: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut with_surface = 0;
    for path in project.files.paths_under("tables/tileset/") {
        let Some((_, key)) = crate::project::row_of(path) else {
            continue;
        };
        let Some(row) = project.files.json(path) else {
            continue;
        };
        for data in row["tiles"]
            .as_object()
            .into_iter()
            .flat_map(|tiles| tiles.values())
        {
            if let Some(surface) = data["surface"].as_str() {
                with_surface += 1;
                let entry = surfaces.entry(surface.to_owned()).or_default();
                entry.0 += 1;
                entry.1.insert(key.to_owned());
            }
        }
    }
    let mut areas_using: HashMap<String, Vec<String>> = HashMap::new();
    for path in project.files.paths_under("tables/area/") {
        if !path.ends_with("/palette.csv") {
            continue;
        }
        let Some(area) = path
            .strip_prefix("tables/area/")
            .and_then(|rest| rest.strip_suffix("/palette.csv"))
        else {
            continue;
        };
        let Some(text) = project.files.text(path) else {
            continue;
        };
        let mut seen: BTreeMap<String, ()> = BTreeMap::new();
        for line in text.lines().skip(1) {
            if let Some((tileset, _)) = line.split_once(',') {
                seen.insert(tileset.to_owned(), ());
            }
        }
        for tileset in seen.keys() {
            areas_using
                .entry(tileset.clone())
                .or_default()
                .push(area.to_owned());
        }
    }
    for areas in areas_using.values_mut() {
        areas.sort();
    }
    editor.views.tileset.counts = Some(Counts {
        generation: project.generation,
        surfaces,
        with_surface,
        areas_using,
    });
}

pub fn areas_using(editor: &Editor, key: &str) -> Vec<String> {
    editor
        .views
        .tileset
        .counts
        .as_ref()
        .and_then(|counts| counts.areas_using.get(key).cloned())
        .unwrap_or_default()
}

fn status(editor: &mut Editor, key: &str, row: &Value, grid: &Grid) {
    let view = &editor.views.tileset.views[key];
    let mut left = Vec::new();
    if let Some(tile) = view.tile {
        let (x, y) = grid.xy(tile);
        left.push(format!("tile {tile} · {x}, {y}"));
    }
    let tiles = row["tiles"].as_object();
    let walk_said = tiles.map_or(0, |tiles| {
        tiles.values().filter(|d| d["walk"].is_string()).count()
    });
    let with_surface = tiles.map_or(0, |tiles| {
        tiles.values().filter(|d| d["surface"].is_string()).count()
    });
    match view.mode {
        Mode::Walk => {
            left.push(format!(
                "painting walk: {}",
                match view.walk {
                    WalkBrush::Walkable => "walkable",
                    WalkBrush::Blocks => "blocks",
                    WalkBrush::Nothing => "says nothing",
                }
            ));
            left.push(format!(
                "{} tiles · {walk_said} say walkable or blocks · {with_surface} have a surface",
                grid.count()
            ));
        }
        Mode::Surface => {
            if let Some(tile) = view.tile {
                let surface = tile_data(row, tile)["surface"]
                    .as_str()
                    .unwrap_or("none")
                    .to_owned();
                left.push(format!("surface: {surface}"));
            }
            left.push(format!(
                "brush: {}",
                view.surface.clone().unwrap_or_else(|| "none".to_owned())
            ));
            let counts = editor.views.tileset.counts.as_ref();
            left.push(format!(
                "{} surfaces · {} tiles have one",
                crate::views::model::sounds::surfaces(editor).len(),
                surfaces::thousands(counts.map_or(0, |counts| counts.with_surface))
            ));
        }
        Mode::Terrain => {
            let sets = row["terrains"].as_object().map_or(0, |sets| sets.len());
            let with_corners = tiles.map_or(0, |tiles| {
                tiles
                    .values()
                    .filter(|d| {
                        d["corners"].is_object()
                            && !d["corners"].as_object().expect("an object").is_empty()
                    })
                    .count()
            });
            if let Some(set) = &view.set {
                let terrains = terrain::terrains_of(row, set);
                left.push(format!(
                    "terrain: {} · painting {}",
                    set,
                    terrains.get(view.terrain).cloned().unwrap_or_default()
                ));
            }
            left.push(format!(
                "{sets} terrain sets · {with_corners} tiles with corners"
            ));
        }
        Mode::Animation => {
            if let Some(selection) = view.selection {
                let animated = selection
                    .tiles(grid.columns)
                    .into_iter()
                    .flatten()
                    .filter(|tile| {
                        tile_data(row, *tile)["animation"]
                            .as_array()
                            .is_some_and(|a| !a.is_empty())
                    })
                    .count();
                left.push(format!(
                    "{animated} animated tiles selected · {}, {} to {}, {}",
                    selection.x,
                    selection.y,
                    selection.x + selection.w - 1,
                    selection.y + selection.h - 1
                ));
            }
            let animated = tiles.map_or(0, |tiles| {
                tiles
                    .values()
                    .filter(|d| d["animation"].as_array().is_some_and(|a| !a.is_empty()))
                    .count()
            });
            left.push(format!("{animated} animated tiles in this tileset"));
        }
    }
    editor.status.left.extend(left);
}

fn dialogs(editor: &mut Editor, ctx: &egui::Context, key: &str, row: &Value, grid: &Grid) {
    let Some(dialog) = editor.views.tileset.views[key].dialog.clone() else {
        return;
    };
    let mut next = Some(dialog.clone());
    match dialog {
        TilesetDialog::MakeBlueprint { name, error } => {
            sheet::make_blueprint_dialog(editor, ctx, key, grid, name, error, &mut next);
        }
        TilesetDialog::NewSurface {
            name,
            footstep,
            error,
        } => {
            surfaces::new_surface_dialog(editor, ctx, key, name, footstep, error, &mut next);
        }
        TilesetDialog::NewTerrainSet {
            name,
            terrains,
            error,
        } => {
            terrain::new_set_dialog(editor, ctx, key, row, name, terrains, error, &mut next);
        }
    }
    let view = editor
        .views
        .tileset
        .views
        .get_mut(key)
        .expect("the view exists");
    view.dialog = next;
}
