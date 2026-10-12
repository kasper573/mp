pub mod blueprint;
pub mod grid;
pub mod inspect;
pub mod layers;
pub mod palette;
pub mod pins;
pub mod scene;
pub mod shapes;
pub mod terrain;
pub mod tools;

use std::collections::{HashMap, HashSet};

use bevy::prelude::World;
use egui::{Color32, Pos2, Rect as ERect, RichText, Sense, Stroke as EStroke, Ui, Vec2};
use game::core::content::Content;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, CellPos, TilePos, TileRect, TileSize, Tiles};
use game::systems::area;
use serde_json::Value;

use crate::app::Editor;
use crate::project::{Edit, Selection, row_file};
use crate::tabs::Tab;

pub use blueprint::{
    DeleteBlueprintDialog, MakeBlueprintDialog, delete_blueprint_dialog, make_blueprint_dialog,
};
pub use tools::ResizeDialog;

pub const TILE_PX: f32 = 16.0;
pub const MIN_ZOOM: f32 = 0.125;
pub const MAX_ZOOM: f32 = 16.0;

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

/// Work the inspector asks of the canvas, done on its next frame where the area is in hand.
#[derive(Clone, Debug)]
pub enum Deferred {
    AddWithRow {
        kind: String,
        field: String,
        key: String,
        at: Pos<Tiles>,
    },
    Copy,
    Duplicate,
    Unpack(usize),
    Replace(usize),
    Split(usize),
    ReturnDoor(usize),
    AdoptBlocks(usize),
}

/// A row dropped where several module kinds take it: the menu that asks which, at the drop.
#[derive(Clone, Debug)]
pub struct DropMenu {
    pub table: String,
    pub key: String,
    pub at: Pos<Tiles>,
    pub screen: Pos2,
    pub candidates: Vec<(String, String)>,
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

    /// The bottom panel a tool works from, if it has one.
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

/// A placement opened in place: its blueprint and where it sits in the area, so part edits map
/// back to blueprint space.
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
    pub stroke: Option<tools::Stroke>,
    pub pick: tools::TilePick,
    pub terrain: tools::TerrainPick,
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
    pub ghost: Option<Pos<Tiles>>,
    pub drop_menu: Option<DropMenu>,
    pub drag_hover: Option<(String, String, Pos<Tiles>)>,
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
            pick: tools::TilePick::default(),
            terrain: tools::TerrainPick::default(),
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
            ghost: None,
            drop_menu: None,
            drag_hover: None,
            population_hidden: HashSet::new(),
            population_seed: HashMap::new(),
            walk_value: Some(false),
            preview_area: None,
            skipped: None,
            fitted: false,
        }
    }

    /// The layers panel floats over painting tools unless toggled by hand.
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

    /// Where blueprint space's origin lands on the canvas.
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

/// The canvas geometry of one frame: how tiles map to screen points.
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

    pub fn camera_state(&self) -> Option<(String, [f32; 3])> {
        let hover = self.hover.as_ref()?;
        let view = self.views.get(&format!("area:{}", hover.area))?;
        Some((
            hover.area.clone(),
            [view.center.x, view.center.y, view.zoom],
        ))
    }

    pub fn restore_camera(&mut self, key: &str, state: [f32; 3]) {
        if let Some(view) = self.views.get_mut(&format!("area:{key}")) {
            view.center = Pos::new(state[0], state[1]);
            view.zoom = state[2];
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
    edit.remove(format!("tables/area/{area}/{layer}.csv"));
    if editor.apply(edit)
        && let Some(view) = editor.views.area.views.get_mut(&format!("area:{area}"))
    {
        view.layer = view.layer.saturating_sub(1);
    }
}

/// The area tab: tool rail, canvas and the tool's panel.
pub fn show(
    editor: &mut Editor,
    ui: &mut Ui,
    _world: &mut World,
    key: &str,
    _in_place: Option<String>,
) {
    let view_key = format!("area:{key}");
    show_canvas(editor, ui, &view_key, key, None);
    crate::play::banner(editor, ui);
}

/// The bottom panel of an area or blueprint tab: the palette to paint from, or the blueprints to stamp.
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
            blueprint::stamp_panel(editor, ui, view_key, content, area_id)
        }
        _ => {}
    }
}

/// The blueprint tab: its parts over a preview area's ground, the origin at the preview's centre.
pub fn show_blueprint(editor: &mut Editor, ui: &mut Ui, _world: &mut World, key: &str) {
    let view_key = format!("blueprint:{key}");
    let preview = editor
        .views
        .area
        .views
        .get(&view_key)
        .and_then(|view| view.preview_area.clone())
        .or_else(|| blueprint::first_area_using(editor, key))
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
                * 0.94;
            view.zoom = fit.clamp(0.1, 4.0);
            view.fitted = true;
            if let Some(camera) = editor
                .settings
                .cameras
                .get(&format!("{}:{view_key}", project.root.display()))
            {
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
    drop_menu(editor, ui, view_key);
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

/// What floats at the canvas top-left: the in-place editing banner with its breadcrumb, or the
/// blueprint tab's preview ground.
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
                    if count == 1 { "" } else { "s" }
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

/// The drop menu of a dragged row: which module kind it becomes, at the drop point.
fn drop_menu(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    use crate::ui::{theme, widgets};
    let Some(menu) = editor.views.area.views[view_key].drop_menu.clone() else {
        return;
    };
    let mut choice: Option<(String, String)> = None;
    let mut cancel = ui.input(|i| i.key_pressed(egui::Key::Escape));
    egui::Area::new(ui.id().with((view_key, "drop-menu")))
        .fixed_pos(menu.screen + Vec2::new(12.0, 12.0))
        .order(egui::Order::Foreground)
        .show(ui.ctx(), |ui| {
            egui::Frame::new()
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(6.0)
                .inner_margin(8.0)
                .show(ui, |ui| {
                    ui.set_width(280.0);
                    ui.label(
                        RichText::new(format!(
                            "DROP {}/{} AS",
                            menu.table.to_uppercase(),
                            menu.key.to_uppercase()
                        ))
                        .size(11.0)
                        .color(theme::MUTED)
                        .family(egui::FontFamily::Name("medium".into())),
                    );
                    for (kind, field) in &menu.candidates {
                        let description = match kind.as_str() {
                            "population" => "roams a rect · count 1 to start",
                            "resident" => "stands at this spot",
                            "blueprint" => "a copy at this spot",
                            "soundscape" => "plays it over a rect",
                            "object" => "an object running that script",
                            _ => "",
                        };
                        let full = ui.available_rect_before_wrap();
                        let (rect, response) =
                            ui.allocate_exact_size(Vec2::new(full.width(), 38.0), Sense::click());
                        if response.hovered() {
                            ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
                        }
                        let mut child = ui.new_child(
                            egui::UiBuilder::new()
                                .max_rect(rect.shrink2(Vec2::new(6.0, 3.0)))
                                .layout(egui::Layout::left_to_right(egui::Align::Center)),
                        );
                        widgets::badge(&mut child, kind);
                        child.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 0.0;
                            ui.label(RichText::new(kind).monospace().color(theme::TEXT));
                            ui.label(RichText::new(description).size(11.5).color(theme::MUTED));
                        });
                        if response.clicked() {
                            choice = Some((kind.clone(), field.clone()));
                        }
                    }
                    ui.separator();
                    ui.horizontal(|ui| {
                        if ui.button("Cancel").clicked() {
                            cancel = true;
                        }
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            widgets::key_hint(ui, "Esc")
                        });
                    });
                });
        });
    if choice.is_some() || cancel {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        view.drop_menu = None;
        if let Some((kind, field)) = choice {
            view.deferred.push(Deferred::AddWithRow {
                kind,
                field,
                key: menu.key.clone(),
                at: menu.at,
            });
        }
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
    let placement_bounds = blueprint::placement_bounds(content, area_id);
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
            Deferred::AddWithRow {
                kind,
                field,
                key,
                at,
            } => blueprint::add_with_row(editor, view_key, &frame, &kind, &field, &key, at),
            Deferred::Copy => tools::copy_selection(editor, &frame),
            Deferred::Duplicate => tools::duplicate_selection(editor, &frame),
            Deferred::Unpack(index) => blueprint::unpack(editor, &frame, index),
            Deferred::Replace(index) => blueprint::replace_dialog(editor, &frame, index),
            Deferred::Split(index) => blueprint::split_scenery(editor, &frame, index),
            Deferred::ReturnDoor(index) => blueprint::return_door(editor, &frame, index),
            Deferred::AdoptBlocks(index) => inspect::adopt_blocks(editor, &frame, index),
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
        blueprint::overlay_in_place(editor, &painter, &frame, &place);
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

/// Everything a tool needs to read the canvas this frame.
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
            if self.modules[index]["type"] == "population" && self.modules[index]["roams"].is_null()
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

fn overlay_grid(painter: &egui::Painter, frame: &Frame, area: &area::Area, lines: bool) {
    let canvas = frame.canvas;
    let bounds = Rect::new(Pos::new(-0.5, -0.5), area.size);
    painter.rect_stroke(
        canvas.rect(bounds),
        0.0,
        EStroke::new(1.0, Color32::from_gray(120)),
        egui::StrokeKind::Outside,
    );
    if !lines || canvas.scale() < 6.0 {
        return;
    }
    let visible = canvas.visible();
    let x0 = visible.min().x.floor().max(-0.5) as i32;
    let x1 = visible.max().x.ceil().min(area.size.width - 0.5) as i32;
    let y0 = visible.min().y.floor().max(-0.5) as i32;
    let y1 = visible.max().y.ceil().min(area.size.height - 0.5) as i32;
    let color = Color32::from_rgba_unmultiplied(255, 255, 255, 28);
    for x in x0..=x1 {
        let sx = canvas.to_screen(Pos::new(x as f32 - 0.5, 0.0)).x;
        painter.line_segment(
            [
                Pos2::new(sx, canvas.rect(bounds).min.y),
                Pos2::new(sx, canvas.rect(bounds).max.y),
            ],
            EStroke::new(1.0, color),
        );
    }
    for y in y0..=y1 {
        let sy = canvas.to_screen(Pos::new(0.0, y as f32 - 0.5)).y;
        painter.line_segment(
            [
                Pos2::new(canvas.rect(bounds).min.x, sy),
                Pos2::new(canvas.rect(bounds).max.x, sy),
            ],
            EStroke::new(1.0, color),
        );
    }
}

/// Hatches every cell the walk rule refuses, drawn from the server's own grids.
fn overlay_walk(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    let visible = canvas.visible();
    let size = area.size.grid();
    let grids = area.grids;
    for cell in size_cells(size) {
        let bounds = cell.bounds();
        if !visible.intersects(&bounds) {
            continue;
        }
        let Some(index) = cell.index(size) else {
            continue;
        };
        let rect = canvas.rect(bounds);
        if !area.grid.walkable(cell.center()) {
            hatch(
                painter,
                rect,
                Color32::from_rgba_unmultiplied(220, 60, 60, 110),
                canvas.scale(),
            );
        } else if !area.wild_grid.walkable(cell.center()) {
            painter.rect_filled(rect, 0.0, Color32::from_rgba_unmultiplied(80, 120, 220, 40));
        }
        if grids.walk[index].is_some() && canvas.scale() >= 8.0 {
            let mark =
                ERect::from_min_size(rect.min, Vec2::splat((canvas.scale() * 0.25).max(2.0)));
            let color = if grids.walk[index] == Some(true) {
                Color32::from_rgb(90, 200, 120)
            } else {
                Color32::from_rgb(220, 90, 90)
            };
            painter.rect_filled(mark, 0.0, color);
        }
    }
}

pub fn hatch(painter: &egui::Painter, rect: ERect, color: Color32, scale: f32) {
    painter.rect_filled(
        rect,
        0.0,
        Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), color.a() / 3),
    );
    let step = (scale / 2.0).clamp(3.0, 12.0);
    let mut x = rect.min.x - rect.height();
    while x < rect.max.x {
        let a = Pos2::new(x, rect.max.y);
        let b = Pos2::new(x + rect.height(), rect.min.y);
        let clipped = clip_line(a, b, rect);
        if let Some((a, b)) = clipped {
            painter.line_segment([a, b], EStroke::new(1.0, color));
        }
        x += step;
    }
}

fn clip_line(a: Pos2, b: Pos2, rect: ERect) -> Option<(Pos2, Pos2)> {
    let mut t0 = 0.0f32;
    let mut t1 = 1.0f32;
    let d = b - a;
    for (p, q) in [
        (-d.x, a.x - rect.min.x),
        (d.x, rect.max.x - a.x),
        (-d.y, a.y - rect.min.y),
        (d.y, rect.max.y - a.y),
    ] {
        if p == 0.0 {
            if q < 0.0 {
                return None;
            }
            continue;
        }
        let r = q / p;
        if p < 0.0 {
            t0 = t0.max(r);
        } else {
            t1 = t1.min(r);
        }
        if t0 > t1 {
            return None;
        }
    }
    Some((a + d * t0, a + d * t1))
}

pub fn size_cells(size: game::core::tiling::GridSize) -> impl Iterator<Item = CellPos> {
    let (w, h) = (size.width as i32, size.height as i32);
    (0..h).flat_map(move |y| (0..w).map(move |x| CellPos::new(x, y)))
}

pub fn module_color(kind: &str) -> Color32 {
    match kind {
        "object" => Color32::from_rgb(255, 200, 80),
        "safe_zone" => Color32::from_rgb(90, 160, 255),
        "soundscape" => Color32::from_rgb(170, 110, 255),
        "scenery" => Color32::from_rgb(140, 220, 140),
        "blueprint" => Color32::from_rgb(90, 220, 220),
        "population" => Color32::from_rgb(255, 120, 120),
        "resident" => Color32::from_rgb(255, 160, 200),
        _ => Color32::from_gray(200),
    }
}

/// Draws every placed module's outline, the selection brighter with handles.
fn overlay_modules(editor: &mut Editor, painter: &egui::Painter, view_key: &str, frame: &Frame) {
    let canvas = frame.canvas;
    let selected: HashSet<String> = selected_parts(editor, &frame.area_key);
    let view = &editor.views.area.views[view_key];
    let editing = view.in_place.last().map(|p| p.module);
    let visible = canvas.visible();
    let hovered = match view.tool {
        Tool::Select | Tool::Module => frame.pointer_tile.and_then(|tile| frame.hit(tile)),
        _ => None,
    };
    for (index, module) in frame.modules.iter().enumerate() {
        let Some(bounds) = frame.module_bounds(index) else {
            continue;
        };
        if !visible.intersects(&bounds) {
            continue;
        }
        let kind = module["type"].as_str().unwrap_or("");
        if kind == "population" && module["roams"].is_null() {
            continue;
        }
        let part = format!("/modules/{index}");
        let is_selected = selected.contains(&part);
        let is_hovered = hovered == Some(index);
        if matches!(kind, "blueprint" | "scenery") && !is_selected && !is_hovered {
            continue;
        }
        let color = module_color(kind);
        let rect = canvas.rect(bounds);
        let dim = editing.is_some_and(|e| e != index);
        let alpha = if dim {
            60
        } else if is_selected {
            255
        } else {
            170
        };
        let color = Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), alpha);
        let width = if is_selected { 2.0 } else { 1.0 };
        match kind {
            "soundscape" if module["shape"]["type"] == "ellipse" => {
                let center = rect.center();
                let radius = rect.size() / 2.0;
                let points: Vec<Pos2> = (0..48)
                    .map(|i| {
                        let t = i as f32 / 48.0 * std::f32::consts::TAU;
                        Pos2::new(center.x + radius.x * t.cos(), center.y + radius.y * t.sin())
                    })
                    .collect();
                painter.add(egui::Shape::closed_line(points, EStroke::new(width, color)));
            }
            "resident" | "object" if shapes::is_point(module) => {
                painter.circle_stroke(
                    rect.center(),
                    (canvas.scale() * 0.35).max(3.0),
                    EStroke::new(width, color),
                );
            }
            _ => {
                painter.rect_stroke(
                    rect,
                    0.0,
                    EStroke::new(width, color),
                    egui::StrokeKind::Inside,
                );
            }
        }
        if is_selected || is_hovered || (kind == "population" && canvas.scale() >= 2.0) {
            label_chip(
                painter,
                rect.min + Vec2::new(0.0, -4.0),
                &shapes::label(module),
                color,
            );
        }
        if is_selected && shapes::has_size(module) {
            for corner in [
                rect.min,
                Pos2::new(rect.max.x, rect.min.y),
                Pos2::new(rect.min.x, rect.max.y),
                rect.max,
            ] {
                painter.rect_filled(
                    ERect::from_center_size(corner, Vec2::splat(6.0)),
                    0.0,
                    color,
                );
            }
        }
    }
    if let Some(place) = view.in_place.last() {
        let shade = Color32::from_rgba_unmultiplied(0, 0, 0, 150);
        if let Some(bounds) = frame.module_bounds(place.module) {
            let r = canvas.rect(bounds);
            let full = canvas.rect;
            painter.rect_filled(
                ERect::from_min_max(full.min, Pos2::new(full.max.x, r.min.y)),
                0.0,
                shade,
            );
            painter.rect_filled(
                ERect::from_min_max(Pos2::new(full.min.x, r.max.y), full.max),
                0.0,
                shade,
            );
            painter.rect_filled(
                ERect::from_min_max(Pos2::new(full.min.x, r.min.y), Pos2::new(r.min.x, r.max.y)),
                0.0,
                shade,
            );
            painter.rect_filled(
                ERect::from_min_max(Pos2::new(r.max.x, r.min.y), Pos2::new(full.max.x, r.max.y)),
                0.0,
                shade,
            );
        }
    }
    if view.blueprint.is_some() {
        let (origin, _) = view.origin();
        let at = canvas.to_screen(origin);
        let color = Color32::from_rgb(90, 220, 220);
        painter.line_segment(
            [at - Vec2::new(10.0, 0.0), at + Vec2::new(10.0, 0.0)],
            EStroke::new(1.0, color),
        );
        painter.line_segment(
            [at - Vec2::new(0.0, 10.0), at + Vec2::new(0.0, 10.0)],
            EStroke::new(1.0, color),
        );
        label_chip(painter, at + Vec2::new(8.0, -8.0), "0, 0 · top-left", color);
    }
}

/// A selected scenery as H3 shows it: its sort line to drag, the walk cells blocked under it
/// hatched, and the player's ghost to drag across the line.
fn overlay_selected_scenery(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    area: &area::Area,
) {
    let Some(index) = inspect::selected_scenery(editor, frame) else {
        return;
    };
    let module = &frame.modules[index];
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let canvas = frame.canvas;
    let grids = area.grids;
    let size = area.size.grid();
    for cell in rect.tiles() {
        if let Some(cell_index) = cell.index(size)
            && grids.walk[cell_index] == Some(false)
        {
            hatch(
                painter,
                canvas.rect(cell.bounds()),
                Color32::from_rgba_unmultiplied(220, 60, 60, 140),
                canvas.scale(),
            );
        }
    }
    let at = shapes::pos_of(&module["at"]).unwrap_or(rect.min());
    for block in module["blocks"].as_array().into_iter().flatten() {
        if let (Some(dx), Some(dy)) = (block[0].as_i64(), block[1].as_i64()) {
            let cell = CellPos::new(
                at.x.round() as i32 + dx as i32,
                at.y.round() as i32 + dy as i32,
            );
            hatch(
                painter,
                canvas.rect(cell.bounds()),
                Color32::from_rgba_unmultiplied(220, 120, 60, 140),
                canvas.scale(),
            );
        }
    }
    let height = rect.size.height;
    let sort = module["sort"]
        .as_f64()
        .map(|s| s as f32)
        .unwrap_or(height - 1.0);
    let line_y = rect.min().y + sort;
    let a = canvas.to_screen(Pos::new(rect.min().x, line_y));
    let b = canvas.to_screen(Pos::new(rect.max().x, line_y));
    painter.add(egui::Shape::dashed_line(
        &[a, b],
        EStroke::new(2.0, Color32::from_rgb(120, 170, 255)),
        8.0,
        5.0,
    ));
    let handle = ERect::from_center_size(b + Vec2::new(10.0, 0.0), Vec2::splat(10.0));
    painter.rect_filled(handle, 2.0, Color32::from_rgb(120, 170, 255));
    label_chip(
        painter,
        a + Vec2::new(4.0, -6.0),
        "sort line",
        Color32::from_rgb(120, 170, 255),
    );
    let grab = ui.interact(
        ERect::from_min_max(a, b).expand2(Vec2::new(16.0, 6.0)),
        ui.id().with((view_key, "sort-line")),
        Sense::drag(),
    );
    if grab.hovered() || grab.dragged() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeVertical);
    }
    if grab.drag_stopped()
        && let Some(pointer) = grab.interact_pointer_pos()
    {
        let shift = ui.input(|i| i.modifiers.shift);
        let tile_y = canvas.to_tile(pointer).y - rect.min().y;
        let snapped = if shift {
            (tile_y * 16.0).round() / 16.0
        } else {
            tile_y.round()
        };
        let new_sort = snapped.clamp(0.0, height);
        if (new_sort - sort).abs() > f32::EPSILON {
            let mut modules = frame.modules.clone();
            modules[index]["sort"] = Value::from(new_sort as f64);
            tools::write_modules(
                editor,
                &frame.area_key,
                modules,
                &format!("Move the sort line of the scenery in {}", frame.area_key),
            );
        }
    }
    let ctx = ui.ctx().clone();
    let Some((texture, uv, drawn)) = inspect::player_sprite(editor, &ctx, frame.content) else {
        return;
    };
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let feet_tile = view
        .ghost
        .unwrap_or(Pos::new(rect.center().x, line_y + 1.0));
    let scale = canvas.scale() / TILE_PX;
    let shown = drawn * scale;
    let feet = canvas.to_screen(feet_tile) + Vec2::new(0.0, canvas.scale() * 0.5);
    let sprite = ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, shown.y),
        feet + Vec2::new(shown.x / 2.0, 0.0),
    );
    let in_front = feet_tile.y + 0.5 >= line_y;
    painter.add(egui::Shape::ellipse_filled(
        feet,
        Vec2::new(shown.x * 0.35, shown.x * 0.12),
        Color32::from_rgba_unmultiplied(0, 0, 0, 70),
    ));
    painter.image(
        texture,
        sprite,
        uv,
        Color32::from_rgba_unmultiplied(255, 255, 255, if in_front { 230 } else { 120 }),
    );
    label_chip(
        painter,
        sprite.left_bottom() + Vec2::new(0.0, 22.0),
        if in_front {
            "ghost · in front"
        } else {
            "ghost · behind"
        },
        Color32::WHITE,
    );
    let drag = ui.interact(sprite, ui.id().with((view_key, "ghost")), Sense::drag());
    if drag.dragged()
        && let Some(pointer) = drag.interact_pointer_pos()
    {
        let tile = canvas.to_tile(pointer);
        view.ghost = Some(Pos::new(tile.x, tile.y - 0.5));
    }
    let tiles: usize = module["tiles"].as_array().map_or(0, |rows| {
        rows.iter()
            .map(|r| {
                r.as_array()
                    .map_or(0, |cells| cells.iter().filter(|c| !c.is_null()).count())
            })
            .sum()
    });
    editor.status.left.push(format!(
        "scenery · {} · {tiles} tiles",
        module["tileset"].as_str().unwrap_or("")
    ));
    editor
        .status
        .left
        .push("drag the sort line · ⇧ snaps to 1/16 · drag the ghost to check sorting".to_owned());
}

/// A selected soundscape's hearing outline: emit plus the client's falloff past its shape.
fn overlay_soundscape_reach(editor: &Editor, painter: &egui::Painter, frame: &Frame) {
    let canvas = frame.canvas;
    for part in selected_parts(editor, &frame.area_key) {
        let Some(index) = part
            .strip_prefix("/modules/")
            .and_then(|i| i.parse::<usize>().ok())
        else {
            continue;
        };
        let Some(module) = frame.modules.get(index) else {
            continue;
        };
        if module["type"] != "soundscape" {
            continue;
        }
        let Some(bounds) = shapes::bounds(module, None) else {
            continue;
        };
        let reach = module["emit"].as_f64().unwrap_or(0.0) as f32 + crate::views::sound::FALLOFF;
        let outer = bounds.inflate(reach, reach);
        let rect = canvas.rect(outer);
        let color = Color32::from_rgba_unmultiplied(170, 110, 255, 120);
        if module["shape"]["type"] == "ellipse" {
            let center = rect.center();
            let radius = rect.size() / 2.0;
            let points: Vec<Pos2> = (0..64)
                .map(|i| {
                    let t = i as f32 / 64.0 * std::f32::consts::TAU;
                    Pos2::new(center.x + radius.x * t.cos(), center.y + radius.y * t.sin())
                })
                .collect();
            painter.add(egui::Shape::dashed_line(
                &points,
                EStroke::new(1.0, color),
                6.0,
                6.0,
            ));
        } else {
            painter.add(egui::Shape::dashed_line(
                &[
                    rect.left_top(),
                    rect.right_top(),
                    rect.right_bottom(),
                    rect.left_bottom(),
                    rect.left_top(),
                ],
                EStroke::new(1.0, color),
                6.0,
                6.0,
            ));
        }
        label_chip(
            painter,
            rect.left_bottom() + Vec2::new(0.0, 22.0),
            &format!("♪ reach {} tiles", crate::forms::tiles(reach)),
            Color32::from_rgb(190, 150, 255),
        );
    }
}

/// On the blueprint tab, the player's ghost beside the origin: drag it to see what it hears and
/// how parts sort around it.
fn overlay_blueprint_ghost(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
) {
    let canvas = frame.canvas;
    let (origin, blueprint) = {
        let view = &editor.views.area.views[view_key];
        let Some(blueprint) = view.blueprint.clone() else {
            return;
        };
        (view.origin().0, blueprint)
    };
    let ctx = ui.ctx().clone();
    let Some((texture, uv, drawn)) = inspect::player_sprite(editor, &ctx, frame.content) else {
        return;
    };
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let feet_tile = view
        .ghost
        .unwrap_or(Pos::new(origin.x + 4.0, origin.y + 2.0));
    let scale = canvas.scale() / TILE_PX;
    let shown = drawn * scale;
    let feet = canvas.to_screen(feet_tile) + Vec2::new(0.0, canvas.scale() * 0.5);
    let sprite = ERect::from_min_max(
        feet - Vec2::new(shown.x / 2.0, shown.y),
        feet + Vec2::new(shown.x / 2.0, 0.0),
    );
    painter.add(egui::Shape::ellipse_filled(
        feet,
        Vec2::new(shown.x * 0.35, shown.x * 0.12),
        Color32::from_rgba_unmultiplied(0, 0, 0, 70),
    ));
    painter.image(
        texture,
        sprite,
        uv,
        Color32::from_rgba_unmultiplied(255, 255, 255, 230),
    );
    let heard: Vec<String> = frame
        .modules
        .iter()
        .filter(|m| m["type"] == "soundscape")
        .filter_map(|m| {
            let bounds = shapes::bounds(m, None)?;
            let emit = m["emit"].as_f64().unwrap_or(0.0) as f32;
            let inside = bounds.inflate(emit, emit);
            let outer = bounds.inflate(
                emit + crate::views::sound::FALLOFF,
                emit + crate::views::sound::FALLOFF,
            );
            if !outer.contains(feet_tile) {
                return None;
            }
            let gain = if inside.contains(feet_tile) {
                1.0
            } else {
                let dx = (inside.min().x - feet_tile.x)
                    .max(feet_tile.x - inside.max().x)
                    .max(0.0);
                let dy = (inside.min().y - feet_tile.y)
                    .max(feet_tile.y - inside.max().y)
                    .max(0.0);
                (1.0 - (dx.max(dy) / crate::views::sound::FALLOFF)).clamp(0.0, 1.0)
            };
            let file = m["channels"]
                .as_array()
                .and_then(|c| c.first())
                .and_then(|c| c["file"].as_str())
                .and_then(|f| f.rsplit('/').next())
                .map(|f| {
                    f.trim_end_matches(".flac")
                        .trim_end_matches(".ogg")
                        .to_owned()
                })
                .unwrap_or_else(|| "soundscape".to_owned());
            Some(format!("hears {file} {:.2}", gain))
        })
        .collect();
    let text = if heard.is_empty() {
        "ghost".to_owned()
    } else {
        format!("ghost · {}", heard.join(" · "))
    };
    label_chip(
        painter,
        sprite.right_bottom() + Vec2::new(8.0, 0.0),
        &text,
        Color32::WHITE,
    );
    let drag = ui.interact(sprite, ui.id().with((view_key, "ghost")), Sense::drag());
    if drag.dragged()
        && let Some(pointer) = drag.interact_pointer_pos()
    {
        let tile = canvas.to_tile(pointer);
        view.ghost = Some(Pos::new(tile.x, tile.y - 0.5));
    }
    let _ = blueprint;
}

/// Each population's npcs where the server would put them, unless its preview is off.
fn overlay_populations(
    editor: &mut Editor,
    ui: &Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    area: &area::Area,
) {
    let canvas = frame.canvas;
    let ctx = ui.ctx().clone();
    let hidden = editor.views.area.views[view_key].population_hidden.clone();
    let seeds = editor.views.area.views[view_key].population_seed.clone();
    for (index, module) in frame.modules.iter().enumerate() {
        if module["type"] != "population" || hidden.contains(&index) {
            continue;
        }
        let Some(npc) = module["npc"].as_str() else {
            continue;
        };
        let Some((texture, uv, drawn)) = inspect::npc_sprite(editor, &ctx, frame.content, npc)
        else {
            continue;
        };
        let scale = canvas.scale() / TILE_PX;
        for at in inspect::population_places(area, module, seeds.get(&index).copied().unwrap_or(0))
        {
            let feet = canvas.to_screen(at) + Vec2::new(0.0, canvas.scale() * 0.5);
            let shown = drawn * scale;
            let sprite = ERect::from_min_max(
                feet - Vec2::new(shown.x / 2.0, shown.y),
                feet + Vec2::new(shown.x / 2.0, 0.0),
            );
            painter.add(egui::Shape::ellipse_filled(
                feet,
                Vec2::new(shown.x * 0.35, shown.x * 0.12),
                Color32::from_rgba_unmultiplied(0, 0, 0, 70),
            ));
            painter.image(
                texture,
                sprite,
                uv,
                Color32::from_rgba_unmultiplied(255, 255, 255, 200),
            );
        }
    }
}

/// A dark chip above a module, in the module's colour, so it reads over any art.
pub fn label_chip(painter: &egui::Painter, bottom_left: Pos2, text: &str, color: Color32) {
    let galley = painter.layout_no_wrap(text.to_owned(), egui::FontId::monospace(11.5), color);
    let size = galley.size() + Vec2::new(10.0, 6.0);
    let back = ERect::from_min_size(bottom_left - Vec2::new(0.0, size.y), size);
    painter.rect_filled(back, 4.0, Color32::from_rgba_unmultiplied(20, 22, 26, 225));
    painter.galley(back.min + Vec2::new(5.0, 3.0), galley, color);
}

pub fn selected_parts(editor: &Editor, area_key: &str) -> HashSet<String> {
    if editor.selection.table == "area" && editor.selection.keys.iter().any(|k| k == area_key) {
        editor.selection.parts.iter().cloned().collect()
    } else {
        HashSet::new()
    }
}

/// What the status bar says about the canvas: the tile under the pointer, what the tool holds,
/// the stroke so far; the zoom on the right. A map chip sits in the corner when it all fits.
fn status_bar(editor: &mut Editor, painter: &egui::Painter, view_key: &str, frame: &Frame) {
    let view = &editor.views.area.views[view_key];
    let mut left: Vec<String> = Vec::new();
    if let Some(place) = view.in_place.last() {
        let parts = frame
            .content
            .by_key::<area::blueprint::BlueprintDef>(&place.blueprint)
            .map_or(0, |id| id.get(&frame.content).parts.len());
        let picked = blueprint::selected_part_indices(editor, &place.blueprint);
        match picked.as_slice() {
            [one] => left.push(format!("{} · part {} of {parts}", place.blueprint, one + 1)),
            _ => left.push(format!("{} · {parts} parts", place.blueprint)),
        }
        left.push("double-click a part to open it · Esc goes up one level".to_owned());
    } else if let Some(blueprint) = &view.blueprint {
        let parts = frame
            .content
            .by_key::<area::blueprint::BlueprintDef>(blueprint)
            .map_or(0, |id| id.get(&frame.content).parts.len());
        left.push(format!(
            "blueprint/{blueprint} · {parts} part{}",
            if parts == 1 { "" } else { "s" }
        ));
        left.push(
            blueprint::placement_count(frame.content, blueprint)
                .trim_end_matches('.')
                .to_lowercase(),
        );
        left.push("S stamps it, or drag it from the browser onto an area".to_owned());
    }
    if let Some(tile) = frame.pointer_tile {
        let cell = tile.cell();
        if view.walk_overlay && view.tool == Tool::Paint {
            left.push(format!("cell {}, {}", cell.x, cell.y));
            if frame.in_map(tile) {
                let area = frame.area();
                let grid = area
                    .grids
                    .walk
                    .get((cell.y as usize) * area.grids.size.width as usize + cell.x as usize)
                    .copied()
                    .flatten();
                left.push(format!(
                    "walk grid · {} · {}",
                    grid.map_or("–".to_owned(), |v| if v {
                        "1".to_owned()
                    } else {
                        "0".to_owned()
                    }),
                    if area.grid.walkable(tile) {
                        "walkable"
                    } else {
                        "blocked"
                    }
                ));
            }
        } else if view.tool == Tool::Terrain {
            left.push(format!("corner {}, {}", cell.x, cell.y));
            if let (Some(tileset), Some(set)) = (&view.terrain.tileset, &view.terrain.set) {
                left.push(format!("{set} · {tileset}"));
            }
        } else {
            left.push(format!("tile {}, {}", cell.x, cell.y));
            if matches!(
                view.tool,
                Tool::Paint | Tool::Fill | Tool::Erase | Tool::Eyedropper
            ) && let Some(tileset) = &view.pick.tileset
            {
                let layer = frame
                    .area()
                    .grids
                    .ground
                    .get(view.layer)
                    .map(|l| l.name.clone())
                    .unwrap_or_default();
                let picked = view
                    .pick
                    .block
                    .first()
                    .and_then(|row| row.first())
                    .map(|t| format!(" #{t}"))
                    .unwrap_or_default();
                left.push(format!("{layer} · {tileset}{picked}"));
            } else if frame.in_map(tile) {
                let area = frame.area();
                let mut what = if area.grid.walkable(tile) {
                    "walkable".to_owned()
                } else {
                    "blocked".to_owned()
                };
                if let Some(surface) = area.footstep_at(cell) {
                    what.push_str(&format!(" · {}", surface.key(&frame.content)));
                }
                left.push(what);
            }
        }
    }
    if let Some(stroke) = &view.stroke {
        left.push(format!(
            "stroke: {} {}",
            stroke.cells.len(),
            if view.tool == Tool::Terrain {
                "corners"
            } else {
                "cells"
            }
        ));
    }
    if let Some(skipped) = &view.skipped {
        left.push(skipped.clone());
    }
    let zoom = view.zoom;
    editor
        .status
        .right
        .push(format!("zoom {}%", (zoom * 100.0).round()));
    if !left.is_empty() {
        editor.status.left.append(&mut left);
    }
    let whole_map_visible = {
        let visible = frame.canvas.visible();
        let size = frame.size();
        visible.min().x <= 0.0
            && visible.min().y <= 0.0
            && visible.max().x >= size.width
            && visible.max().y >= size.height
    };
    if whole_map_visible && view.in_place.is_empty() && view.blueprint.is_none() {
        let size = frame.size();
        let text = format!(
            "area/{} · {} × {} · zoom {}%",
            frame.area_key,
            size.width,
            size.height,
            (zoom * 100.0).round()
        );
        let galley =
            painter.layout_no_wrap(text, egui::FontId::monospace(12.0), crate::ui::theme::TEXT);
        let at = frame.canvas.rect.min + Vec2::new(16.0, 12.0);
        let back = ERect::from_min_size(at, galley.size() + Vec2::new(12.0, 6.0));
        painter.rect_filled(back, 4.0, Color32::from_rgba_unmultiplied(20, 22, 26, 220));
        painter.galley(at + Vec2::new(6.0, 3.0), galley, crate::ui::theme::TEXT);
    }
}

/// Each walkable cell tinted by its footstep surface, a band pattern so it reads without colour.
fn overlay_surfaces(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    if canvas.scale() < 3.0 {
        return;
    }
    let visible = canvas.visible();
    let mut palette: Vec<(String, Color32)> = Vec::new();
    for cell in size_cells(area.size.grid()) {
        let tile = cell.center();
        if !visible.contains(tile) {
            continue;
        }
        let Some(surface) = area.footstep_at(cell) else {
            continue;
        };
        let key = surface.key(&frame.content);
        let colour = match palette.iter().find(|(k, _)| k == key) {
            Some((_, colour)) => *colour,
            None => {
                let hue = (palette.len() as f32 * 0.37) % 1.0;
                let colour = hsv(hue, 0.55, 0.95);
                palette.push((key.to_owned(), colour));
                colour
            }
        };
        let rect = canvas.rect(cell.bounds());
        painter.rect_filled(
            rect,
            0.0,
            Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 70),
        );
        painter.line_segment(
            [rect.left_bottom(), rect.right_top()],
            EStroke::new(
                1.0,
                Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 120),
            ),
        );
    }
}

pub fn hsv(h: f32, s: f32, v: f32) -> Color32 {
    let i = (h * 6.0).floor();
    let f = h * 6.0 - i;
    let (p, q, t) = (v * (1.0 - s), v * (1.0 - f * s), v * (1.0 - (1.0 - f) * s));
    let (r, g, b) = match i as i32 % 6 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    Color32::from_rgb((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

/// Every sorted scenery's sort line, dashed, as the renderer orders actors against it.
fn overlay_sort_lines(painter: &egui::Painter, frame: &Frame, area: &area::Area) {
    let canvas = frame.canvas;
    for scenery in &area.scenery {
        let Some(line) = scenery.sort_line() else {
            continue;
        };
        let width = scenery.tiles.first().map_or(0, Vec::len) as f32;
        let a = canvas.to_screen(Pos::new(scenery.at.x, line.0));
        let b = canvas.to_screen(Pos::new(scenery.at.x + width, line.0));
        painter.add(egui::Shape::dashed_line(
            &[a, b],
            EStroke::new(1.5, Color32::from_rgb(120, 170, 255)),
            6.0,
            4.0,
        ));
    }
}

fn remember_camera(editor: &mut Editor, view_key: &str) {
    let Some(project) = &editor.project else {
        return;
    };
    let view = &editor.views.area.views[view_key];
    let key = format!("{}:{view_key}", project.root.display());
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

/// The inspector for selected parts of an area: one module's card, or what several share.
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
        inspect::show_blueprint(editor, ui, &key, &indices);
        return;
    }
    inspect::show_parts(editor, ui, selection);
}

pub fn open_area_at(editor: &mut Editor, area: &str, at: Option<Pos<Tiles>>, part: Option<String>) {
    editor.open_tab(Tab::Area {
        key: area.to_owned(),
    });
    let view = editor.views.area.view_mut(&format!("area:{area}"), area);
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
