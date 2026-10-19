pub mod blueprint;
pub mod brush;
pub mod grid;
pub mod holes;
pub mod inspect;
pub mod layers;
pub mod modules;
pub mod overlays;
pub mod palette;
pub mod parts;
pub mod pick;
pub mod pins;
pub mod placement;
pub mod population;
pub mod preview;
pub mod resize;
pub mod scene;
pub mod scenery;
pub mod select;
pub mod shapes;
pub mod soundscape;
pub mod stamp;
pub mod status;
pub mod terrain;
pub mod tools;

pub use blueprint::{MakeBlueprintDialog, make_blueprint_dialog};
pub use resize::ResizeDialog;

use std::collections::{HashMap, HashSet};
use std::ops::Deref;

use bevy::prelude::World;
use design_tokens::glyph::{self, Mark};
use egui::{Color32, Pos2, Rect as ERect, Sense, Ui, Vec2};
use engine::core::content::{Content, ContentRow, row_file};
use engine::core::math::{Pos, Rect, Size};
use engine::core::tiling::{CellPos, TilePos, TileSize, Tiles};
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::{self, AreaDef, AreaId, AreaModuleKind};
use serde_json::Value;

use self::overlays::{
    AreaLabels, overlay_blueprint_ghost, overlay_grid, overlay_modules, overlay_populations,
    overlay_selected_scenery, overlay_sort_lines, overlay_soundscape_reach, overlay_surfaces,
    overlay_walk,
};
use self::status::status_bar;
use crate::app::{BottomTab, Editor};
use crate::keymap::EditorKey;
use crate::project::{AreaCameraState, ContentEdit, Project, RowSelection};
use crate::tabs::EditorTab;
use crate::ui::{sidebar, theme, widgets};
use crate::value::RowValue;
use crate::views::navigation::{self, Viewport};
use crate::{play, user};

pub const TILE_PX: f32 = 16.0;
pub const MIN_ZOOM: f32 = 0.125;
pub const MAX_ZOOM: f32 = 16.0;
const MAX_FIT_ZOOM: f32 = 4.0;
const FIT_MARGIN: f32 = 0.94;

pub fn area_view_key(area: &str) -> String {
    format!("area:{area}")
}

pub fn blueprint_view_key(blueprint: &str) -> String {
    format!("blueprint:{blueprint}")
}

fn camera_key(project: &Project, view_key: &str) -> String {
    format!("{}:{view_key}", project.root.display())
}

#[derive(Default)]
pub struct AreaViews {
    pub scenes: scene::AreaScenes,
    pub requests: Vec<scene::AreaSceneRequest>,
    pub views: HashMap<String, AreaViewState>,
    pub hover: Option<AreaHover>,
    pub active: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AreaHover {
    pub area: String,
    pub tile: Pos<Tiles>,
}

#[derive(Clone, Debug)]
pub enum AreaAction {
    Copy,
    Duplicate,
    Delete,
    OpenBlueprint(String),
    MakeBlueprint,
    GoTo(String, Pos<Tiles>),
    Unpack(usize),
    Replace(usize),
    Split(usize),
    ReturnDoor(usize),
    AdoptBlocks(usize),
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AreaTool {
    #[default]
    Select,
    Paint,
    Terrain,
    Fill,
    Erase,
    Eyedropper,
    Stamp,
    Module,
}

impl AreaTool {
    pub const ALL: [AreaTool; 8] = [
        AreaTool::Select,
        AreaTool::Paint,
        AreaTool::Terrain,
        AreaTool::Fill,
        AreaTool::Erase,
        AreaTool::Eyedropper,
        AreaTool::Stamp,
        AreaTool::Module,
    ];

    pub fn key(self) -> EditorKey {
        match self {
            AreaTool::Select => EditorKey::SelectTool,
            AreaTool::Paint => EditorKey::PaintTool,
            AreaTool::Terrain => EditorKey::TerrainTool,
            AreaTool::Fill => EditorKey::FillTool,
            AreaTool::Erase => EditorKey::EraseTool,
            AreaTool::Eyedropper => EditorKey::EyedropperTool,
            AreaTool::Stamp => EditorKey::StampTool,
            AreaTool::Module => EditorKey::ModuleTool,
        }
    }

    pub fn bottom_tab(self) -> Option<BottomTab> {
        match self {
            AreaTool::Paint | AreaTool::Terrain | AreaTool::Fill | AreaTool::Eyedropper => {
                Some(BottomTab::Palette)
            }
            AreaTool::Stamp => Some(BottomTab::Blueprints),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            AreaTool::Select => "Select",
            AreaTool::Paint => "Paint",
            AreaTool::Terrain => "Terrain",
            AreaTool::Fill => "Fill",
            AreaTool::Erase => "Erase",
            AreaTool::Eyedropper => "Eyedropper",
            AreaTool::Stamp => "Stamp",
            AreaTool::Module => "Module",
        }
    }
}

#[derive(Default)]
pub struct AreaViewState {
    pub area: String,
    pub blueprint: Option<String>,
    pub in_place: Vec<usize>,
    pub center: Pos<Tiles>,
    pub zoom: f32,
    pub tool: AreaTool,
    pub layer: usize,
    pub walk_overlay: bool,
    pub grid_lines: bool,
    pub layers_open: Option<bool>,
    pub hidden_ground: HashSet<String>,
    pub show_blueprints: bool,
    pub show_scenery: bool,
    pub overlay_modules: bool,
    pub overlay_surfaces: bool,
    pub overlay_sort_lines: bool,
    pub gesture: Option<Gesture>,
    pub pick: brush::TilePick,
    pub terrain: brush::TerrainPick,
    pub stamp: Option<String>,
    pub listener: Option<Pos<Tiles>>,
    pub paste: Option<PasteGhost>,
    pub cursor_cell: Option<CellPos>,
    pub tileset_search: String,
    pub blueprint_search: String,
    pub blueprint_everywhere: bool,
    pub palette_lens: palette::PaletteLens,
    pub menu: Option<modules::AreaMenuAnchor>,
    pub ghost: Option<Pos<Tiles>>,
    pub population_previews: HashMap<String, PopulationPreview>,
    pub walk_value: Option<bool>,
    pub preview_area: Option<String>,
    pub skipped: Option<String>,
    fitted: bool,
}

impl AreaViewState {
    fn new(area: &str) -> AreaViewState {
        AreaViewState {
            area: area.to_owned(),
            zoom: 2.0,
            show_blueprints: true,
            show_scenery: true,
            overlay_modules: true,
            walk_value: Some(false),
            ..AreaViewState::default()
        }
    }

    pub fn layers_shown(&self) -> bool {
        self.layers_open.unwrap_or(matches!(
            self.tool,
            AreaTool::Paint
                | AreaTool::Terrain
                | AreaTool::Fill
                | AreaTool::Erase
                | AreaTool::Eyedropper
        ))
    }

    pub fn drag(&self) -> Option<&AreaDrag> {
        match &self.gesture {
            Some(Gesture::Drag(drag)) => Some(drag),
            _ => None,
        }
    }

    pub fn drag_mut(&mut self) -> Option<&mut AreaDrag> {
        match &mut self.gesture {
            Some(Gesture::Drag(drag)) => Some(drag),
            _ => None,
        }
    }

    pub fn set_drag(&mut self, drag: AreaDrag) {
        self.gesture = Some(Gesture::Drag(drag));
    }

    pub fn set_tool(&mut self, tool: AreaTool) {
        self.tool = tool;
        self.cancel_gesture();
    }

    pub fn cancel_gesture(&mut self) -> bool {
        self.gesture.take().is_some()
    }

    pub fn take_drag(&mut self) -> Option<AreaDrag> {
        match self.gesture.take() {
            Some(Gesture::Drag(drag)) => Some(drag),
            other => {
                self.gesture = other;
                None
            }
        }
    }

    pub fn stroke(&self) -> Option<&brush::BrushStroke> {
        match &self.gesture {
            Some(Gesture::Stroke(stroke)) => Some(stroke),
            _ => None,
        }
    }

    pub fn stroke_mut(&mut self) -> Option<&mut brush::BrushStroke> {
        match &mut self.gesture {
            Some(Gesture::Stroke(stroke)) => Some(stroke),
            _ => None,
        }
    }

    pub fn set_stroke(&mut self, stroke: brush::BrushStroke) {
        self.gesture = Some(Gesture::Stroke(stroke));
    }

    pub fn take_stroke(&mut self) -> Option<brush::BrushStroke> {
        match self.gesture.take() {
            Some(Gesture::Stroke(stroke)) => Some(stroke),
            other => {
                self.gesture = other;
                None
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PopulationPreview {
    pub hidden: bool,
    pub seed: u64,
}

pub enum Gesture {
    Drag(AreaDrag),
    Stroke(brush::BrushStroke),
}

#[derive(Clone, Debug)]
pub enum AreaDrag {
    Box {
        from: Pos<Tiles>,
    },
    Move {
        from: Pos<Tiles>,
        moved: bool,
    },
    Resize {
        part: String,
        corner: ResizeCorner,
        start: Rect<Tiles>,
    },
    Pin {
        file: String,
        pointer: String,
    },
    InitialSpawn,
    Stamp {
        placed: Vec<Pos<Tiles>>,
        last: Pos<Tiles>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResizeCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Clone, Debug)]
pub struct PasteGhost {
    pub modules: Vec<Value>,
}

impl AreaViews {
    pub fn close(&mut self) {
        self.views.clear();
        self.requests.clear();
        self.active = None;
    }

    pub fn camera_state(&self) -> Option<AreaCameraState> {
        let area = self.active.as_ref()?;
        let view = self.views.get(&area_view_key(area))?;
        Some(AreaCameraState {
            area: area.clone(),
            center: view.center,
            zoom: view.zoom,
        })
    }

    pub fn restore_camera(&mut self, camera: &AreaCameraState) {
        if let Some(view) = self.views.get_mut(&area_view_key(&camera.area)) {
            view.center = camera.center;
            view.zoom = camera.zoom;
        }
    }

    pub fn content_changed(&mut self) {
        for view in self.views.values_mut() {
            if matches!(view.gesture, Some(Gesture::Stroke(_))) {
                view.gesture = None;
            }
        }
    }

    pub fn ensure_view(&mut self, key: &str, area: &str) -> &mut AreaViewState {
        self.views
            .entry(key.to_owned())
            .or_insert_with(|| AreaViewState::new(area))
    }

    pub fn view(&self, key: &str) -> &AreaViewState {
        &self.views[key]
    }

    pub fn view_mut(&mut self, key: &str) -> &mut AreaViewState {
        self.views.get_mut(key).expect("an open area view")
    }
}

pub fn sync(editor: &mut Editor, world: &mut World) {
    let requests = std::mem::take(&mut editor.views.area.requests);
    let (content, files) = match &editor.project {
        Some(project) => (project.content.clone(), &project.files),
        None => {
            scene::clear(&mut editor.views.area.scenes, world);
            return;
        }
    };
    let Editor { views, .. } = editor;
    scene::sync(
        &mut views.area.scenes,
        requests,
        content.as_ref(),
        files,
        world,
    );
}

pub fn remove_layer(editor: &mut Editor, area: &str, layer: &str) {
    let Some(mut row) = editor.row_value(AreaDef::TABLE, area) else {
        return;
    };
    let Some(layers) = row["map"]["ground"].as_array_mut() else {
        return;
    };
    let removed = layers.iter().position(|name| name.as_str() == Some(layer));
    layers.retain(|name| name.as_str() != Some(layer));
    let remaining = layers.len();
    let mut edit = ContentEdit::new(format!("Remove layer {layer} of {area}"));
    edit.write_json(row_file(AreaDef::TABLE, area), &row);
    edit.remove(format!(
        "{}/{}",
        area::grid::folder(area),
        area::grid::layer_file(layer)
    ));
    if editor.apply(edit) {
        for view in editor
            .views
            .area
            .views
            .values_mut()
            .filter(|view| view.area == area)
        {
            view.hidden_ground.remove(layer);
            if removed.is_some_and(|index| index < view.layer) {
                view.layer -= 1;
            }
            view.layer = view.layer.min(remaining.saturating_sub(1));
        }
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let view_key = area_view_key(key);
    sidebar::row(ui, "area", |ui| inspect::row(editor, ui, key));
    sidebar::inspector(ui, "area", |ui| inspect::sidebar(editor, ui, key));
    show_canvas(editor, ui, &view_key, key, None);
    play::banner(editor, ui);
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, view_key: &str, tab: BottomTab) {
    let Some(content) = editor
        .project
        .as_ref()
        .and_then(|project| project.content.clone())
    else {
        ui.label(theme::muted("The folder does not load."));
        return;
    };
    let Some(area_key) = editor
        .views
        .area
        .views
        .get(view_key)
        .map(|view| view.area.clone())
    else {
        return;
    };
    let Some(area_id) = content.by_key::<AreaDef>(&area_key) else {
        return;
    };
    match tab {
        BottomTab::Palette => palette::show(editor, ui, view_key, &content, area_id),
        BottomTab::Blueprints => stamp::stamp_panel(editor, ui, view_key, &content, area_id),
        _ => {}
    }
}

pub fn show_blueprint(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let view_key = blueprint_view_key(key);
    let preview = editor
        .views
        .area
        .views
        .get(&view_key)
        .and_then(|view| view.preview_area.clone())
        .or_else(|| placement::first_area_using(editor, key))
        .or_else(|| {
            editor
                .project
                .as_ref()
                .and_then(|p| p.content.clone())
                .and_then(|c| c.table::<AreaDef>().keys().first().cloned())
        });
    let Some(preview) = preview else {
        ui.label("No area to preview the blueprint on");
        return;
    };
    let selection = editor.selection.clone();
    let indices: Vec<usize> = if selection.table == BlueprintDef::TABLE
        && selection.keys.first().is_some_and(|k| k == key)
    {
        selection
            .parts
            .iter()
            .filter_map(|p| blueprint_part_index(p))
            .collect()
    } else {
        Vec::new()
    };
    sidebar::row(ui, "blueprint", |ui| {
        parts::blueprint_row(editor, ui, key, &indices)
    });
    sidebar::inspector(ui, "blueprint", |ui| {
        if indices.is_empty() {
            sidebar::nothing_selected(ui, "Select a part to inspect it here.");
        } else {
            parts::selected_parts(editor, ui, key, &indices);
        }
    });
    show_canvas(editor, ui, &view_key, &preview, Some(key));
}

fn show_canvas(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    area_key: &str,
    blueprint: Option<&str>,
) {
    let Some(project) = &editor.project else {
        return;
    };
    let Some(content) = project.content.clone() else {
        ui.label(
            egui::RichText::new("The folder does not load; the area view waits for it.").weak(),
        );
        return;
    };
    let Some(area_id) = content.by_key::<AreaDef>(area_key) else {
        ui.label(format!("area {area_key} is gone"));
        return;
    };
    let generation = project.generation;
    let rail_width = 44.0;
    let full = ui.available_rect_before_wrap();
    let rail = ERect::from_min_size(full.min, Vec2::new(rail_width, full.height()));
    let canvas_rect = ERect::from_min_max(Pos2::new(rail.max.x, full.min.y), full.max);
    {
        let view = editor.views.area.ensure_view(view_key, area_key);
        view.area = area_key.to_owned();
        view.blueprint = blueprint.map(str::to_owned);
        if !view.fitted {
            let size = area::load(&content, area_id).size;
            view.center = Pos::new(size.width / 2.0, size.height / 2.0);
            let fit = navigation::fit_zoom(
                canvas_rect.size(),
                Vec2::new(size.width, size.height),
                TILE_PX,
            ) * FIT_MARGIN;
            view.zoom = fit.clamp(MIN_ZOOM, MAX_FIT_ZOOM);
            view.fitted = true;
            if let Some(camera) = editor.settings.cameras.get(&camera_key(project, view_key)) {
                view.center = Pos::new(camera.x, camera.y);
                view.zoom = camera.zoom;
            }
        }
    }
    let in_place = resolve_in_place(editor, &content, view_key, area_key);
    let mut canvas_ui = ui.new_child(egui::UiBuilder::new().max_rect(canvas_rect));
    canvas(
        editor,
        &mut canvas_ui,
        view_key,
        &content,
        area_id,
        generation,
        in_place.clone(),
    );
    banners(editor, ui, view_key, &content, canvas_rect, &in_place);
    let mut rail_ui = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rail)
            .layout(egui::Layout::top_down(egui::Align::Center)),
    );
    rail_ui.painter().rect_filled(rail, 0.0, theme::PANEL);
    tools::rail(editor, &mut rail_ui, view_key);
    if editor.views.area.view(view_key).layers_shown() {
        let mut layers_ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(canvas_rect)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        layers::popover(
            editor,
            &mut layers_ui,
            view_key,
            &content,
            area_id,
            canvas_rect,
        );
    }
}

fn resolve_in_place(
    editor: &mut Editor,
    content: &Content,
    view_key: &str,
    area_key: &str,
) -> Vec<placement::Placement> {
    let path = editor.views.area.view(view_key).in_place.clone();
    if path.is_empty() {
        return Vec::new();
    }
    let modules = modules::area_modules(editor, area_key);
    match placement::resolve_in_place(content, &modules, &path) {
        Some(chain) => chain,
        None => {
            editor.views.area.view_mut(view_key).in_place.clear();
            Vec::new()
        }
    }
}

fn banners(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: &Content,
    canvas_rect: ERect,
    in_place: &[placement::Placement],
) {
    let (blueprint, area_key, preview_area) = {
        let view = editor.views.area.view(view_key);
        (
            view.blueprint.clone(),
            view.area.clone(),
            view.preview_area.clone(),
        )
    };
    if in_place.is_empty() && blueprint.is_none() {
        return;
    }
    let origin = canvas_rect.min + Vec2::new(8.0, 8.0);
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(ERect::from_min_max(origin, canvas_rect.max))
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    let chip = |ui: &mut Ui, body: &mut dyn FnMut(&mut Ui)| {
        design_tokens::slip::show(ui, |ui| {
            ui.horizontal(|ui| body(ui));
        });
    };
    let mut done = false;
    if let Some(place) = in_place.last() {
        let count = content
            .by_key::<BlueprintDef>(&place.blueprint)
            .map(|id| {
                content
                    .ids::<AreaDef>()
                    .flat_map(|a| {
                        area::placements(content, a)
                            .iter()
                            .filter(|p| p.blueprint == id && p.chain.len() <= 1)
                    })
                    .count()
            })
            .unwrap_or(0);
        let name = place.blueprint.clone();
        chip(&mut child, &mut |ui| {
            glyph::show(ui, Mark::Grid, 14.0, theme::WARN);
            ui.label(
                theme::mono(format!(
                    "Editing blueprint {name} · {count} placement{} on {area_key} change with it",
                    widgets::plural(count)
                ))
                .size(13.0)
                .color(theme::TEXT),
            );
            if widgets::primary(ui, "Done").clicked() {
                done = true;
            }
            widgets::key_chip(ui, EditorKey::Cancel);
        });
        child.add_space(4.0);
        let crumbs: Vec<String> = std::iter::once(area_key.clone())
            .chain(in_place.iter().map(|p| p.blueprint.clone()))
            .collect();
        chip(&mut child, &mut |ui| {
            ui.label(
                theme::mono(crumbs.join(" › "))
                    .size(13.0)
                    .color(theme::TEXT),
            );
        });
    } else if blueprint.is_some() {
        let areas: Vec<String> = content.table::<AreaDef>().keys().to_vec();
        let mut picked = preview_area.clone().unwrap_or(area_key.clone());
        chip(&mut child, &mut |ui| {
            glyph::show(ui, Mark::Eye, 13.0, theme::MUTED);
            ui.label(theme::mono("preview ground:").size(13.0).color(theme::TEXT));
            widgets::combo((view_key, "preview-ground"))
                .selected_text(theme::mono(&picked).size(13.0))
                .show_ui(ui, |ui| {
                    for area in &areas {
                        if ui
                            .selectable_label(picked == *area, theme::mono(area))
                            .clicked()
                        {
                            picked = area.clone();
                        }
                    }
                });
            ui.label(theme::muted("· not saved").size(12.5));
        });
        if Some(&picked) != preview_area.as_ref() && picked != area_key {
            editor.views.area.view_mut(view_key).preview_area = Some(picked);
        }
    }
    if done {
        let view = editor.views.area.view_mut(view_key);
        view.in_place.pop();
        editor.selection.parts.clear();
    }
}

fn canvas(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: &Content,
    area_id: AreaId,
    generation: u64,
    in_place: Vec<placement::Placement>,
) {
    let (rect, response) = ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, theme::CANVAS);
    let area = area::load(content, area_id);
    let area_key = area_id.key(content).to_owned();
    let ppp = ui.ctx().pixels_per_point();
    let (center, zoom, spec, texture) = {
        let view = editor.views.area.views.get(view_key).expect("the view");
        let mut hidden_ground: Vec<String> = view.hidden_ground.iter().cloned().collect();
        hidden_ground.sort();
        let spec = match &view.blueprint {
            Some(blueprint) => scene::AreaSceneSpec {
                ground: area_key.clone(),
                scenery: scene::SceneryOf::Parts {
                    blueprint: blueprint.clone(),
                    at: origin_of(view.center, &in_place).0,
                    values: stamp::stamp_values(editor, view.stamp.as_deref()),
                },
                hidden_ground,
                show_blueprints: true,
                show_scenery: true,
            },
            None => scene::AreaSceneSpec {
                ground: area_key.clone(),
                scenery: scene::SceneryOf::Area,
                hidden_ground,
                show_blueprints: view.show_blueprints,
                show_scenery: view.show_scenery,
            },
        };
        let texture = editor
            .views
            .area
            .scenes
            .by_key
            .get(view_key)
            .map(|scene| (scene.texture, scene.uv()));
        (view.center, view.zoom, spec, texture)
    };
    let width = (rect.width() * ppp).round().max(1.0) as u32;
    let height = (rect.height() * ppp).round().max(1.0) as u32;
    editor.views.area.requests.push(scene::AreaSceneRequest {
        key: view_key.to_owned(),
        spec,
        width,
        height,
        center,
        zoom: zoom * ppp,
        generation,
        live: true,
    });
    if let Some((texture, uv)) = texture {
        painter.image(texture, rect, uv, Color32::WHITE);
    }
    let canvas = Viewport {
        screen: rect,
        center,
        zoom,
    };
    let hovered = response.hover_pos().filter(|_| response.hovered());
    let pointer_tile = hovered.map(|p| canvas.to_tile(p));
    if let Some(tile) = pointer_tile {
        editor.views.area.hover = Some(AreaHover {
            area: area_key.clone(),
            tile,
        });
    }
    let snapshot = AreaSnapshot::of(editor, content, area_id, &area_key, in_place);
    let frame = AreaFrame {
        snapshot,
        canvas,
        pointer: hovered,
        pointer_tile,
        response: &response,
        labels: AreaLabels::default(),
    };
    overlay_grid(
        &painter,
        &frame,
        area,
        editor.views.area.view(view_key).grid_lines,
    );
    tools::input(editor, ui, &painter, view_key, &frame);
    let blueprint_tab = editor.views.area.view(view_key).blueprint.is_some();
    if !blueprint_tab {
        editor.views.area.active = Some(area_key.clone());
    }
    if !blueprint_tab {
        overlay_populations(editor, ui, &painter, view_key, &frame, area);
    }
    overlay_selected_scenery(editor, ui, &painter, view_key, &frame, area);
    overlay_soundscape_reach(editor, &painter, &frame);
    overlay_blueprint_ghost(editor, ui, &painter, view_key, &frame);
    let view = editor.views.area.view(view_key);
    if view.overlay_surfaces {
        overlay_surfaces(&painter, &frame, area);
    }
    if view.walk_overlay {
        overlay_walk(&painter, &frame, area);
    }
    if view.overlay_sort_lines {
        overlay_sort_lines(&painter, &frame, area);
    }
    if !blueprint_tab && (view.overlay_modules || !editor.selection.parts.is_empty()) {
        overlay_modules(editor, &painter, view_key, &frame);
    }
    if let Some(place) = frame.in_place.last() {
        placement::overlay_in_place(editor, &painter, &frame, place);
    }
    if !blueprint_tab {
        pins::draw_arrivals(editor, &painter, &frame);
    }
    tools::overlay(editor, &painter, view_key, &frame);
    frame.labels.draw(&painter);
    status_bar(editor, &painter, view_key, &frame);
    if response.hovered() && !ui.ctx().text_edit_focused() {
        tools::keys(editor, ui, view_key, &frame);
    }
    remember_camera(editor, view_key);
}

pub struct AreaSnapshot {
    pub content: Content,
    pub area_id: AreaId,
    pub area_key: String,
    pub modules: Vec<Value>,
    pub in_place: Vec<placement::Placement>,
    pub placement_bounds: HashMap<usize, Rect<Tiles>>,
}

pub struct AreaFrame<'a> {
    pub snapshot: AreaSnapshot,
    pub canvas: Viewport<Tiles>,
    pub pointer: Option<Pos2>,
    pub pointer_tile: Option<Pos<Tiles>>,
    pub response: &'a egui::Response,
    pub labels: AreaLabels,
}

impl Deref for AreaFrame<'_> {
    type Target = AreaSnapshot;

    fn deref(&self) -> &AreaSnapshot {
        &self.snapshot
    }
}

impl AreaSnapshot {
    pub fn of(
        editor: &Editor,
        content: &Content,
        area_id: AreaId,
        area_key: &str,
        in_place: Vec<placement::Placement>,
    ) -> Self {
        let own = editor
            .row_value(AreaDef::TABLE, area_key)
            .unwrap_or(Value::Null);
        Self {
            content: content.clone(),
            area_id,
            area_key: area_key.to_owned(),
            modules: own["modules"].as_array().cloned().unwrap_or_default(),
            in_place,
            placement_bounds: placement::placement_bounds(content, area_id),
        }
    }

    pub fn for_area(editor: &mut Editor, area_key: &str) -> Option<Self> {
        let content = editor.project.as_ref()?.content.clone()?;
        let area_id = content.by_key::<AreaDef>(area_key)?;
        let view_key = area_view_key(area_key);
        let in_place = if editor.views.area.views.contains_key(&view_key) {
            resolve_in_place(editor, &content, &view_key, area_key)
        } else {
            Vec::new()
        };
        Some(Self::of(editor, &content, area_id, area_key, in_place))
    }

    pub fn area(&self) -> &area::Area {
        area::load(&self.content, self.area_id)
    }

    pub fn size(&self) -> Size<Tiles> {
        self.area().size
    }

    pub fn in_map(&self, tile: Pos<Tiles>) -> bool {
        area::walk::in_map(self.size().grid(), tile)
    }

    pub fn module_bounds(&self, index: usize) -> Option<Rect<Tiles>> {
        let module = self.modules.get(index)?;
        shapes::bounds(module, self.placement_bounds.get(&index).copied())
    }

    pub fn hit(&self, tile: Pos<Tiles>) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for index in 0..self.modules.len() {
            let Some(bounds) = self.module_bounds(index) else {
                continue;
            };
            if !is_selectable(&self.modules[index]) {
                continue;
            }
            if bounds.contains(tile) {
                let size = bounds.area();
                if best.is_none_or(|(_, area)| size < area) {
                    best = Some((index, size));
                }
            }
        }
        best.map(|(index, _)| index)
    }
}

impl AreaFrame<'_> {
    pub fn origin(&self) -> (Pos<Tiles>, area::Flip) {
        origin_of(self.canvas.center, &self.in_place)
    }

    pub fn pointer_cell(&self) -> Option<CellPos> {
        self.pointer_tile.map(|t| t.cell())
    }

    pub fn drag_tile(&self) -> Option<Pos<Tiles>> {
        self.pointer_tile.or_else(|| {
            self.response
                .interact_pointer_pos()
                .map(|p| self.canvas.to_tile(p))
        })
    }
}

fn is_selectable(module: &Value) -> bool {
    !(module.is_module(AreaModuleKind::Population) && module["roams"].is_null())
}

fn origin_of(center: Pos<Tiles>, in_place: &[placement::Placement]) -> (Pos<Tiles>, area::Flip) {
    match in_place.last() {
        Some(place) => (place.at, place.flip),
        None => (
            Pos::new(center.x.round(), center.y.round()),
            area::Flip::None,
        ),
    }
}

pub fn selected_parts(editor: &Editor, area_key: &str) -> HashSet<String> {
    if editor.selection.table == AreaDef::TABLE
        && editor.selection.keys.iter().any(|k| k == area_key)
    {
        editor.selection.parts.iter().cloned().collect()
    } else {
        HashSet::new()
    }
}

fn remember_camera(editor: &mut Editor, view_key: &str) {
    let Some(project) = &editor.project else {
        return;
    };
    let view = editor.views.area.view(view_key);
    let key = camera_key(project, view_key);
    let camera = user::CameraSettings {
        x: view.center.x,
        y: view.center.y,
        zoom: view.zoom,
    };
    let changed = editor.settings.cameras.get(&key).is_none_or(|known| {
        (known.x - camera.x).abs() > 0.01
            || (known.y - camera.y).abs() > 0.01
            || (known.zoom - camera.zoom).abs() > 0.001
    });
    if changed {
        editor.settings.cameras.insert(key, camera);
        if editor.frame.is_multiple_of(120) {
            editor.save_settings();
        }
    }
}

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &RowSelection) {
    if selection.table == BlueprintDef::TABLE {
        let Some(key) = selection.keys.first().cloned() else {
            return;
        };
        let indices: Vec<usize> = selection
            .parts
            .iter()
            .filter_map(|p| blueprint_part_index(p))
            .collect();
        parts::selected_parts(editor, ui, &key, &indices);
        return;
    }
    inspect::show_parts(editor, ui, selection);
}

pub fn open_area_at(editor: &mut Editor, area: &str, at: Option<Pos<Tiles>>, part: Option<String>) {
    editor.open_tab(EditorTab::Area {
        key: area.to_owned(),
    });
    let view = editor.views.area.ensure_view(&area_view_key(area), area);
    if let Some(at) = at {
        view.center = at;
        view.fitted = true;
    }
    if let Some(part) = part {
        editor.selection = RowSelection {
            table: AreaDef::TABLE.to_owned(),
            keys: vec![area.to_owned()],
            parts: vec![part],
        };
    }
}

pub fn run_action(editor: &mut Editor, frame: &AreaSnapshot, action: AreaAction) {
    match action {
        AreaAction::Copy => select::copy_selection(editor, frame),
        AreaAction::Duplicate => select::duplicate_selection(editor, frame),
        AreaAction::Delete => select::delete_selection(editor, frame),
        AreaAction::OpenBlueprint(key) => {
            editor.select(RowSelection::row(BlueprintDef::TABLE, &key));
            editor.open_tab(EditorTab::Blueprint { key });
        }
        AreaAction::MakeBlueprint => blueprint::make_blueprint_from_selection(editor, frame),
        AreaAction::GoTo(area, at) => open_area_at(editor, &area, Some(at), None),
        AreaAction::Unpack(index) => placement::unpack(editor, frame, index),
        AreaAction::Replace(index) => placement::replace_dialog(editor, frame, index),
        AreaAction::Split(index) => scenery::split_scenery(editor, frame, index),
        AreaAction::ReturnDoor(index) => scenery::return_door(editor, frame, index),
        AreaAction::AdoptBlocks(index) => scenery::adopt_blocks(editor, frame, index),
    }
}

fn module_part(index: usize) -> String {
    format!("/modules/{index}")
}

fn module_index(part: &str) -> Option<usize> {
    part.strip_prefix("/modules/")?.parse().ok()
}

fn blueprint_part(index: usize) -> String {
    format!("/parts/{index}")
}

fn blueprint_part_index(part: &str) -> Option<usize> {
    part.strip_prefix("/parts/")?.parse().ok()
}

fn remove_indices<T>(items: &mut Vec<T>, indices: &[usize]) {
    let mut position = 0;
    items.retain(|_| {
        position += 1;
        !indices.contains(&(position - 1))
    });
}
