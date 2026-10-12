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

use std::collections::{HashMap, HashSet};

use bevy::prelude::World;
use egui::{Color32, Pos2, Rect as ERect, RichText, Sense, Ui, Vec2};
use game::core::content::Content;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{CellPos, TilePos, TileSize, Tiles};
use game::systems::area::{self, AreaModuleKind};
use serde_json::Value;

use crate::app::Editor;
use crate::project::{CameraState, Edit, Selection, row_file};
use crate::tabs::Tab;
use crate::value::RowValue;

use self::overlays::{
    overlay_blueprint_ghost, overlay_grid, overlay_modules, overlay_populations,
    overlay_selected_scenery, overlay_sort_lines, overlay_soundscape_reach, overlay_surfaces,
    overlay_walk,
};
use self::status::status_bar;
pub use blueprint::{
    DeleteBlueprintDialog, MakeBlueprintDialog, delete_blueprint_dialog, make_blueprint_dialog,
};
pub use resize::ResizeDialog;

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

fn camera_key(project: &crate::project::Project, view_key: &str) -> String {
    format!("{}:{view_key}", project.root.display())
}

#[derive(Default)]
pub struct AreaViews {
    pub scenes: scene::Scenes,
    pub requests: Vec<scene::SceneRequest>,
    pub views: HashMap<String, ViewState>,
    pub hover: Option<Hover>,
    pub generation: u64,
}

#[derive(Clone, Debug)]
pub struct Hover {
    pub area: String,
    pub tile: Pos<Tiles>,
}

#[derive(Clone, Debug)]
pub enum Deferred {
    Copy,
    Duplicate,
    Unpack(usize),
    Replace(usize),
    Split(usize),
    ReturnDoor(usize),
    AdoptBlocks(usize),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    Select,
    Paint,
    Terrain,
    Fill,
    Erase,
    Eyedropper,
    Stamp,
    Module,
}

impl Tool {
    pub const ALL: [Tool; 8] = [
        Tool::Select,
        Tool::Paint,
        Tool::Terrain,
        Tool::Fill,
        Tool::Erase,
        Tool::Eyedropper,
        Tool::Stamp,
        Tool::Module,
    ];

    pub fn key(self) -> egui::Key {
        match self {
            Tool::Select => egui::Key::V,
            Tool::Paint => egui::Key::B,
            Tool::Terrain => egui::Key::T,
            Tool::Fill => egui::Key::G,
            Tool::Erase => egui::Key::E,
            Tool::Eyedropper => egui::Key::I,
            Tool::Stamp => egui::Key::S,
            Tool::Module => egui::Key::M,
        }
    }

    pub fn bottom_tab(self) -> Option<crate::app::BottomTab> {
        match self {
            Tool::Paint | Tool::Terrain | Tool::Fill | Tool::Eyedropper => {
                Some(crate::app::BottomTab::Palette)
            }
            Tool::Stamp => Some(crate::app::BottomTab::Blueprints),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Tool::Select => "Select",
            Tool::Paint => "Paint",
            Tool::Terrain => "Terrain",
            Tool::Fill => "Fill",
            Tool::Erase => "Erase",
            Tool::Eyedropper => "Eyedropper",
            Tool::Stamp => "Stamp",
            Tool::Module => "Module",
        }
    }

    pub fn icon(self) -> &'static str {
        match self {
            Tool::Select => "V",
            Tool::Paint => "B",
            Tool::Terrain => "T",
            Tool::Fill => "G",
            Tool::Erase => "E",
            Tool::Eyedropper => "I",
            Tool::Stamp => "S",
            Tool::Module => "M",
        }
    }
}

#[derive(Clone, Debug)]
pub struct InPlace {
    pub blueprint: String,
    pub module: usize,
    pub at: Pos<Tiles>,
    pub flip: area::Flip,
    pub values: Value,
}

pub struct ViewState {
    pub area: String,
    pub blueprint: Option<String>,
    pub in_place: Vec<InPlace>,
    pub center: Pos<Tiles>,
    pub zoom: f32,
    pub tool: Tool,
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
    pub drag: Option<Drag>,
    pub stroke: Option<brush::Stroke>,
    pub pick: brush::TilePick,
    pub terrain: brush::TerrainPick,
    pub stamp: Option<String>,
    pub stamp_values: Value,
    pub listener: Option<Pos<Tiles>>,
    pub paste: Option<PasteGhost>,
    pub cursor_cell: Option<CellPos>,
    pub tileset_search: String,
    pub blueprint_search: String,
    pub blueprint_everywhere: bool,
    pub palette_lens: palette::Lens,
    pub deferred: Vec<Deferred>,
    pub menu: Option<modules::MenuAnchor>,
    pub ghost: Option<Pos<Tiles>>,
    pub population_hidden: HashSet<usize>,
    pub population_seed: HashMap<usize, u64>,
    pub walk_value: Option<bool>,
    pub preview_area: Option<String>,
    pub skipped: Option<String>,
    fitted: bool,
}

impl ViewState {
    fn new(area: &str) -> ViewState {
        ViewState {
            area: area.to_owned(),
            blueprint: None,
            in_place: Vec::new(),
            center: Pos::new(0.0, 0.0),
            zoom: 2.0,
            tool: Tool::Select,
            layer: 0,
            walk_overlay: false,
            grid_lines: false,
            layers_open: None,
            hidden_ground: HashSet::new(),
            show_blueprints: true,
            show_scenery: true,
            overlay_modules: true,
            overlay_surfaces: false,
            overlay_sort_lines: false,
            drag: None,
            stroke: None,
            pick: brush::TilePick::default(),
            terrain: brush::TerrainPick::default(),
            stamp: None,
            stamp_values: Value::Object(Default::default()),
            listener: None,
            paste: None,
            cursor_cell: None,
            tileset_search: String::new(),
            blueprint_search: String::new(),
            blueprint_everywhere: false,
            palette_lens: palette::Lens::Tiles,
            deferred: Vec::new(),
            menu: None,
            ghost: None,
            population_hidden: HashSet::new(),
            population_seed: HashMap::new(),
            walk_value: Some(false),
            preview_area: None,
            skipped: None,
            fitted: false,
        }
    }

    pub fn layers_shown(&self) -> bool {
        self.layers_open.unwrap_or(matches!(
            self.tool,
            Tool::Paint | Tool::Terrain | Tool::Fill | Tool::Erase | Tool::Eyedropper
        ))
    }

    pub fn editing_blueprint(&self) -> Option<&str> {
        self.in_place
            .last()
            .map(|place| place.blueprint.as_str())
            .or(self.blueprint.as_deref())
    }

    pub fn origin(&self) -> (Pos<Tiles>, area::Flip) {
        match self.in_place.last() {
            Some(place) => (place.at, place.flip),
            None => (self.center_of_preview(), area::Flip::None),
        }
    }

    fn center_of_preview(&self) -> Pos<Tiles> {
        Pos::new(self.center.x.round(), self.center.y.round())
    }
}

#[derive(Clone, Debug)]
pub enum Drag {
    Pan {
        last: Pos2,
    },
    Box {
        from: Pos<Tiles>,
    },
    Move {
        from: Pos<Tiles>,
        moved: bool,
    },
    Resize {
        part: String,
        corner: Corner,
        start: Rect<Tiles>,
    },
    Pin {
        file: String,
        pointer: String,
    },
    Spawn,
    Stamp {
        placed: Vec<Pos<Tiles>>,
        last: Pos<Tiles>,
    },
    Listener,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Clone, Debug)]
pub struct PasteGhost {
    pub modules: Vec<Value>,
    pub at: Option<Pos<Tiles>>,
}

#[derive(Clone, Copy)]
pub struct Canvas {
    pub rect: ERect,
    pub center: Pos<Tiles>,
    pub zoom: f32,
}

impl Canvas {
    pub fn scale(&self) -> f32 {
        TILE_PX * self.zoom
    }

    pub fn to_screen(self, p: Pos<Tiles>) -> Pos2 {
        let c = self.rect.center();
        Pos2::new(
            c.x + (p.x - self.center.x) * self.scale(),
            c.y + (p.y - self.center.y) * self.scale(),
        )
    }

    pub fn to_tile(self, p: Pos2) -> Pos<Tiles> {
        let c = self.rect.center();
        Pos::new(
            self.center.x + (p.x - c.x) / self.scale(),
            self.center.y + (p.y - c.y) / self.scale(),
        )
    }

    pub fn rect(&self, r: Rect<Tiles>) -> ERect {
        ERect::from_min_max(self.to_screen(r.min()), self.to_screen(r.max()))
    }

    pub fn visible(&self) -> Rect<Tiles> {
        let min = self.to_tile(self.rect.min);
        let max = self.to_tile(self.rect.max);
        Rect::new(min, Size::new(max.x - min.x, max.y - min.y))
    }
}

impl AreaViews {
    pub fn close(&mut self) {
        self.views.clear();
        self.requests.clear();
    }

    pub fn camera_state(&self) -> Option<CameraState> {
        let hover = self.hover.as_ref()?;
        let view = self.views.get(&area_view_key(&hover.area))?;
        Some(CameraState {
            area: hover.area.clone(),
            center: view.center,
            zoom: view.zoom,
        })
    }

    pub fn restore_camera(&mut self, camera: &CameraState) {
        if let Some(view) = self.views.get_mut(&area_view_key(&camera.area)) {
            view.center = camera.center;
            view.zoom = camera.zoom;
        }
    }

    pub fn content_changed(&mut self) {
        self.generation += 1;
    }

    pub fn view_mut(&mut self, key: &str, area: &str) -> &mut ViewState {
        self.views
            .entry(key.to_owned())
            .or_insert_with(|| ViewState::new(area))
    }
}

pub fn sync(editor: &mut Editor, world: &mut World) {
    let requests = std::mem::take(&mut editor.views.area.requests);
    let (content, files) = match &editor.project {
        Some(project) => (project.content, &project.files),
        None => {
            scene::clear(&mut editor.views.area.scenes, world);
            return;
        }
    };
    let Editor { views, .. } = editor;
    scene::sync(&mut views.area.scenes, requests, content, files, world);
}

pub fn remove_layer(editor: &mut Editor, area: &str, layer: &str) {
    let Some(mut row) = editor.row_value("area", area) else {
        return;
    };
    let Some(layers) = row["map"]["ground"].as_array_mut() else {
        return;
    };
    layers.retain(|name| name.as_str() != Some(layer));
    let mut edit = Edit::new(format!("Remove layer {layer} of {area}"));
    edit.write_json(row_file("area", area), &row);
    edit.remove(format!(
        "{}/{}",
        area::grid::folder(area),
        area::grid::layer_file(layer)
    ));
    if editor.apply(edit)
        && let Some(view) = editor.views.area.views.get_mut(&area_view_key(area))
    {
        view.layer = view.layer.saturating_sub(1);
    }
}

pub fn show(
    editor: &mut Editor,
    ui: &mut Ui,
    _world: &mut World,
    key: &str,
    _in_place: Option<String>,
) {
    let view_key = area_view_key(key);
    show_canvas(editor, ui, &view_key, key, None);
    crate::play::banner(editor, ui);
}

pub fn bottom(editor: &mut Editor, ui: &mut Ui, view_key: &str, tab: crate::app::BottomTab) {
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        ui.label(crate::ui::theme::muted("The folder does not load."));
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
    let Some(area_id) = content.by_key::<area::AreaDef>(&area_key) else {
        return;
    };
    match tab {
        crate::app::BottomTab::Palette => palette::show(editor, ui, view_key, content, area_id),
        crate::app::BottomTab::Blueprints => {
            stamp::stamp_panel(editor, ui, view_key, content, area_id)
        }
        _ => {}
    }
}

pub fn show_blueprint(editor: &mut Editor, ui: &mut Ui, _world: &mut World, key: &str) {
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
                .and_then(|p| p.content)
                .and_then(|c| c.table::<area::AreaDef>().keys().first().cloned())
        });
    let Some(preview) = preview else {
        ui.label("No area to preview the blueprint on");
        return;
    };
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
    let Some(content) = project.content else {
        ui.label(
            egui::RichText::new("The folder does not load; the area view waits for it.").weak(),
        );
        return;
    };
    let Some(area_id) = content.by_key::<area::AreaDef>(area_key) else {
        ui.label(format!("area {area_key} is gone"));
        return;
    };
    let generation = project.generation;
    let rail_width = 44.0;
    let full = ui.available_rect_before_wrap();
    let rail = ERect::from_min_size(full.min, Vec2::new(rail_width, full.height()));
    let canvas_rect = ERect::from_min_max(Pos2::new(rail.max.x, full.min.y), full.max);
    {
        let view = editor.views.area.view_mut(view_key, area_key);
        view.area = area_key.to_owned();
        view.blueprint = blueprint.map(str::to_owned);
        if !view.fitted {
            let size = area::load(&content, area_id).size;
            view.center = Pos::new(size.width / 2.0, size.height / 2.0);
            let fit = (canvas_rect.width() / (size.width * TILE_PX))
                .min(canvas_rect.height() / (size.height * TILE_PX))
                * FIT_MARGIN;
            view.zoom = fit.clamp(MIN_ZOOM, MAX_FIT_ZOOM);
            view.fitted = true;
            if let Some(camera) = editor.settings.cameras.get(&camera_key(project, view_key)) {
                view.center = Pos::new(camera.x, camera.y);
                view.zoom = camera.zoom;
            }
        }
    }
    let mut canvas_ui = ui.new_child(egui::UiBuilder::new().max_rect(canvas_rect));
    canvas(
        editor,
        &mut canvas_ui,
        view_key,
        content,
        area_id,
        generation,
    );
    banners(editor, ui, view_key, content, canvas_rect);
    let mut rail_ui = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rail)
            .layout(egui::Layout::top_down(egui::Align::Center)),
    );
    rail_ui
        .painter()
        .rect_filled(rail, 0.0, crate::ui::theme::PANEL);
    tools::rail(editor, &mut rail_ui, view_key);
    if editor.views.area.views[view_key].layers_shown() {
        let mut layers_ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(canvas_rect)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        layers::popover(
            editor,
            &mut layers_ui,
            view_key,
            content,
            area_id,
            canvas_rect,
        );
    }
}

fn banners(editor: &mut Editor, ui: &mut Ui, view_key: &str, content: Content, canvas_rect: ERect) {
    use crate::ui::{theme, widgets};
    let (in_place, blueprint, area_key, preview_area) = {
        let view = &editor.views.area.views[view_key];
        (
            view.in_place.clone(),
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
        egui::Frame::new()
            .fill(Color32::from_rgba_unmultiplied(20, 22, 26, 230))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(8, 4))
            .show(ui, |ui| {
                ui.horizontal(|ui| body(ui));
            });
    };
    let mut done = false;
    if let Some(place) = in_place.last() {
        let count = content
            .by_key::<area::blueprint::BlueprintDef>(&place.blueprint)
            .map(|id| {
                content
                    .ids::<area::AreaDef>()
                    .flat_map(|a| {
                        area::placements(&content, a)
                            .iter()
                            .filter(|p| p.blueprint == id && p.chain.len() <= 1)
                    })
                    .count()
            })
            .unwrap_or(0);
        let name = place.blueprint.clone();
        chip(&mut child, &mut |ui| {
            ui.label(RichText::new("▣").color(theme::WARN));
            ui.label(
                theme::mono(format!(
                    "Editing blueprint {name} · {count} placement{} on {area_key} change with it",
                    crate::ui::widgets::plural(count)
                ))
                .size(13.0)
                .color(Color32::WHITE),
            );
            if widgets::primary(ui, "Done").clicked() {
                done = true;
            }
            widgets::key_hint(ui, "Esc");
        });
        child.add_space(4.0);
        let crumbs: Vec<String> = std::iter::once(area_key.clone())
            .chain(in_place.iter().map(|p| p.blueprint.clone()))
            .collect();
        chip(&mut child, &mut |ui| {
            ui.label(
                theme::mono(crumbs.join(" › "))
                    .size(13.0)
                    .color(Color32::WHITE),
            );
        });
    } else if blueprint.is_some() {
        let areas: Vec<String> = content.table::<area::AreaDef>().keys().to_vec();
        let mut picked = preview_area.clone().unwrap_or(area_key.clone());
        chip(&mut child, &mut |ui| {
            ui.label(theme::muted("👁"));
            ui.label(
                theme::mono("preview ground:")
                    .size(13.0)
                    .color(Color32::WHITE),
            );
            egui::ComboBox::from_id_salt((view_key, "preview-ground"))
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
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .preview_area = Some(picked);
        }
    }
    if done {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        view.in_place.pop();
        editor.selection.parts.clear();
    }
}

fn canvas(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    area_id: area::Id,
    generation: u64,
) {
    let (rect, response) = ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, Color32::from_rgb(20, 20, 24));
    let area = area::load(&content, area_id);
    let area_key = area_id.key(&content).to_owned();
    let ppp = ui.ctx().pixels_per_point();
    let (center, zoom, spec, texture) = {
        let view = editor.views.area.views.get(view_key).expect("the view");
        let mut hidden_ground: Vec<String> = view.hidden_ground.iter().cloned().collect();
        hidden_ground.sort();
        let spec = match &view.blueprint {
            Some(blueprint) => scene::SceneSpec {
                ground: area_key.clone(),
                scenery: scene::SceneryOf::Parts {
                    blueprint: blueprint.clone(),
                    at: view.origin().0,
                    values: view.stamp_values.clone(),
                },
                hidden_ground,
                show_blueprints: true,
                show_scenery: true,
            },
            None => scene::SceneSpec {
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
            .map(|scene| (scene.texture, scene.alloc, scene.shown));
        (view.center, view.zoom, spec, texture)
    };
    let width = (rect.width() * ppp).round().max(1.0) as u32;
    let height = (rect.height() * ppp).round().max(1.0) as u32;
    editor.views.area.requests.push(scene::SceneRequest {
        key: view_key.to_owned(),
        spec,
        width,
        height,
        center,
        zoom: zoom * ppp,
        generation,
        live: true,
    });
    if let Some((texture, alloc, shown)) = texture {
        let uv = ERect::from_min_max(
            Pos2::ZERO,
            Pos2::new(
                shown[0] as f32 / alloc[0] as f32,
                shown[1] as f32 / alloc[1] as f32,
            ),
        );
        painter.image(texture, rect, uv, Color32::WHITE);
    }
    let canvas = Canvas { rect, center, zoom };
    let hovered = response.hover_pos().filter(|_| response.hovered());
    let pointer_tile = hovered.map(|p| canvas.to_tile(p));
    if let Some(tile) = pointer_tile {
        editor.views.area.hover = Some(Hover {
            area: area_key.clone(),
            tile,
        });
    }
    let own = editor.row_value("area", &area_key).unwrap_or(Value::Null);
    let modules: Vec<Value> = own["modules"].as_array().cloned().unwrap_or_default();
    let placement_bounds = placement::placement_bounds(content, area_id);
    let frame = Frame {
        canvas,
        content,
        area_id,
        area_key: area_key.clone(),
        modules,
        placement_bounds,
        pointer: hovered,
        pointer_tile,
        response: &response,
    };
    overlay_grid(
        &painter,
        &frame,
        area,
        editor.views.area.views[view_key].grid_lines,
    );
    tools::input(editor, ui, &painter, view_key, &frame);
    let blueprint_tab = editor.views.area.views[view_key].blueprint.is_some();
    for deferred in std::mem::take(
        &mut editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .deferred,
    ) {
        match deferred {
            Deferred::Copy => select::copy_selection(editor, &frame),
            Deferred::Duplicate => select::duplicate_selection(editor, &frame),
            Deferred::Unpack(index) => placement::unpack(editor, &frame, index),
            Deferred::Replace(index) => placement::replace_dialog(editor, &frame, index),
            Deferred::Split(index) => scenery::split_scenery(editor, &frame, index),
            Deferred::ReturnDoor(index) => scenery::return_door(editor, &frame, index),
            Deferred::AdoptBlocks(index) => scenery::adopt_blocks(editor, &frame, index),
        }
    }
    if !blueprint_tab {
        overlay_populations(editor, ui, &painter, view_key, &frame, area);
    }
    overlay_selected_scenery(editor, ui, &painter, view_key, &frame, area);
    overlay_soundscape_reach(editor, &painter, &frame);
    overlay_blueprint_ghost(editor, ui, &painter, view_key, &frame);
    let view = &editor.views.area.views[view_key];
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
    if let Some(place) = editor.views.area.views[view_key].in_place.last().cloned() {
        placement::overlay_in_place(editor, &painter, &frame, &place);
    }
    if !blueprint_tab {
        pins::overlay(editor, &painter, view_key, &frame);
    }
    tools::overlay(editor, &painter, view_key, &frame);
    status_bar(editor, &painter, view_key, &frame);
    if response.hovered() && !ui.ctx().text_edit_focused() {
        tools::keys(editor, ui, view_key, &frame);
    }
    remember_camera(editor, view_key);
}

pub struct Frame<'a> {
    pub canvas: Canvas,
    pub content: Content,
    pub area_id: area::Id,
    pub area_key: String,
    pub modules: Vec<Value>,
    pub placement_bounds: HashMap<usize, Rect<Tiles>>,
    pub pointer: Option<Pos2>,
    pub pointer_tile: Option<Pos<Tiles>>,
    pub response: &'a egui::Response,
}

impl Frame<'_> {
    pub fn area(&self) -> &'static area::Area {
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
            if self.modules[index].is_module(AreaModuleKind::Population)
                && self.modules[index]["roams"].is_null()
            {
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

    pub fn pointer_cell(&self) -> Option<CellPos> {
        self.pointer_tile.map(|t| t.cell())
    }
}

pub fn size_cells(size: game::core::tiling::GridSize) -> impl Iterator<Item = CellPos> {
    let (w, h) = (size.width as i32, size.height as i32);
    (0..h).flat_map(move |y| (0..w).map(move |x| CellPos::new(x, y)))
}

pub fn selected_parts(editor: &Editor, area_key: &str) -> HashSet<String> {
    if editor.selection.table == "area" && editor.selection.keys.iter().any(|k| k == area_key) {
        editor.selection.parts.iter().cloned().collect()
    } else {
        HashSet::new()
    }
}

fn remember_camera(editor: &mut Editor, view_key: &str) {
    let Some(project) = &editor.project else {
        return;
    };
    let view = &editor.views.area.views[view_key];
    let key = camera_key(project, view_key);
    let camera = crate::user::CameraSettings {
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

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    if selection.table == "blueprint" {
        let Some(key) = selection.keys.first().cloned() else {
            return;
        };
        let indices: Vec<usize> = selection
            .parts
            .iter()
            .filter_map(|p| p.strip_prefix("/parts/")?.parse().ok())
            .collect();
        parts::show_blueprint(editor, ui, &key, &indices);
        return;
    }
    inspect::show_parts(editor, ui, selection);
}

pub fn open_area_at(editor: &mut Editor, area: &str, at: Option<Pos<Tiles>>, part: Option<String>) {
    editor.open_tab(Tab::Area {
        key: area.to_owned(),
    });
    let view = editor.views.area.view_mut(&area_view_key(area), area);
    if let Some(at) = at {
        view.center = at;
        view.fitted = true;
    }
    if let Some(part) = part {
        editor.selection = Selection {
            table: "area".to_owned(),
            keys: vec![area.to_owned()],
            parts: vec![part],
        };
    }
}
