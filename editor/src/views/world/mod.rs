pub mod arrange;
pub mod atlas;
mod canvas;
mod inspect;
mod interact;
mod toolbar;

use std::collections::BTreeMap;
use std::sync::Arc;

use bevy::prelude::World;
use egui::{Pos2, Rect, Ui, Vec2};
use game::core::math::Pos;
use game::core::tiling::Tiles;
use serde::{Deserialize, Serialize};

pub use arrange::{ArrangeDialog, dialog as arrange_dialog};
use atlas::Atlas;
pub use inspect::{inspect_parts, inspect_world};

use crate::app::Editor;
use crate::project::{Edit, Project, Selection, row_file};
use crate::ui::theme;

pub const TABLE: &str = "world_map";
pub const ROW_KEY: &str = "world";
pub const TILE_UNITS: f32 = 16.0;
pub const AREA_ZOOM: f32 = 0.35;
const REGION_PAD: f32 = 20.0;
const GAP: f32 = 48.0;
const MIN_ZOOM: f32 = 0.01;
const MAX_ZOOM: f32 = 8.0;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Layout {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub cards: BTreeMap<String, Card>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub regions: Vec<Region>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<Note>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Card {
    pub x: f32,
    pub y: f32,
    pub size: u32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub pinned: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Region {
    pub name: String,
    pub cards: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colour: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub text: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Part {
    Card(String),
    Edge(String, String),
    Region(usize),
    Note(usize),
}

impl Part {
    pub fn parse(text: &str) -> Option<Part> {
        let (kind, rest) = text.split_once(':')?;
        match kind {
            "card" => Some(Part::Card(rest.to_owned())),
            "edge" => rest
                .split_once('/')
                .map(|(a, b)| Part::Edge(a.to_owned(), b.to_owned())),
            "region" => rest.parse().ok().map(Part::Region),
            "note" => rest.parse().ok().map(Part::Note),
            _ => None,
        }
    }

    fn text(&self) -> String {
        match self {
            Part::Card(key) => format!("card:{key}"),
            Part::Edge(a, b) => format!("edge:{a}/{b}"),
            Part::Region(index) => format!("region:{index}"),
            Part::Note(index) => format!("note:{index}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Lens {
    Row { table: String, key: String },
    Module(String),
    Text(String),
}

impl Lens {
    fn kind(&self) -> &'static str {
        match self {
            Lens::Row { table, .. } => match table.as_str() {
                "npc" => "people",
                "item" => "items",
                "quest" => "quests",
                "area" => "areas",
                _ => "rows",
            },
            Lens::Module(_) => "modules",
            Lens::Text(_) => "text",
        }
    }

    pub fn chip(&self) -> String {
        match self {
            Lens::Row { table, key } => format!("{table}: {key}"),
            Lens::Module(module) => format!("module: {module}"),
            Lens::Text(text) => format!("text: {text}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ColourBy {
    pub value: String,
    pub of: ColourOf,
    pub show: ColourShow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColourOf {
    Placed,
    Hostile,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColourShow {
    Highest,
    Lowest,
}

impl ColourBy {
    pub fn chip(&self) -> String {
        let (table, field) = self
            .value
            .split_once('.')
            .unwrap_or((self.value.as_str(), ""));
        let field = field.rsplit('.').next().unwrap_or(field);
        match (table, self.of) {
            ("npc", ColourOf::Hostile) => format!("colour: hostile npc {field}"),
            _ => format!("colour: {table} {field}"),
        }
    }

    pub fn sentence(&self) -> String {
        let (table, field) = self
            .value
            .split_once('.')
            .unwrap_or((self.value.as_str(), ""));
        let field = field.rsplit('.').next().unwrap_or(field);
        let which = match self.show {
            ColourShow::Highest => "the highest",
            ColourShow::Lowest => "the lowest",
        };
        let of = match (table, self.of) {
            ("npc", ColourOf::Hostile) => "hostile npcs".to_owned(),
            _ => format!("{table}s"),
        };
        format!("coloured by {which} {field} of {of}")
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Layers {
    pub warps: bool,
    pub residents: bool,
    pub populations: bool,
    pub givers: bool,
    pub regions: bool,
}

impl Default for Layers {
    fn default() -> Layers {
        Layers {
            warps: true,
            residents: false,
            populations: false,
            givers: false,
            regions: true,
        }
    }
}

#[derive(Default)]
pub struct WorldView {
    pub center: Pos2,
    pub zoom: f32,
    pub fitted: bool,
    pub selected: Vec<Part>,
    pub lenses: Vec<Lens>,
    pub search: String,
    pub colour: Option<ColourBy>,
    pub route: Option<(String, String)>,
    pub route_from: Option<String>,
    pub quest_line: Option<String>,
    pub layers: Layers,
    pub atlas: Option<Arc<Atlas>>,
    pub atlas_for: Option<u64>,
    pub hover: Option<(String, Pos<Tiles>)>,
    pub preview: Option<Layout>,
    pub menu_target: Option<(String, Pos<Tiles>)>,
    pub play_character: Option<String>,
    pub pending_look: Option<(String, f32)>,
    pub canvas: Vec2,
    drag: Option<interact::Drag>,
    drag_note: Option<String>,
}

impl WorldView {
    pub fn content_changed(&mut self) {
        self.atlas_for = None;
    }

    pub fn look_at(&mut self, atlas: &Atlas, layout: &Layout, key: &str, zoom: f32) {
        if let Some(card) = layout.cards.get(key)
            && let Some(rect) = card_rect(atlas, key, card)
        {
            self.center = rect.center();
            self.zoom = zoom;
            self.fitted = true;
        }
    }
}

pub fn layout_of(editor: &Editor) -> Layout {
    editor
        .project
        .as_ref()
        .and_then(|project| project.files.json_owned(&row_file("world_map", ROW_KEY)))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn with_defaults(atlas: &Atlas, mut layout: Layout) -> Layout {
    let missing: Vec<String> = atlas
        .areas
        .keys()
        .filter(|key| !layout.cards.contains_key(*key))
        .cloned()
        .collect();
    for key in missing {
        let beside = atlas.neighbours(&key).into_iter().find_map(|other| {
            layout
                .cards
                .get(other)
                .copied()
                .and_then(|card| card_rect(atlas, other, &card))
        });
        let at = match beside {
            Some(rect) => {
                let width = (atlas.areas[&key].size.width * TILE_UNITS).max(MIN_FOOTPRINT.x);
                Pos2::new(rect.max.x + GAP + width / 2.0, rect.center().y)
            }
            None => {
                let bounds = layout
                    .cards
                    .iter()
                    .filter_map(|(k, card)| card_rect(atlas, k, card))
                    .reduce(|a, b| a.union(b));
                let width = (atlas.areas[&key].size.width * TILE_UNITS).max(MIN_FOOTPRINT.x);
                match bounds {
                    Some(bounds) => Pos2::new(
                        bounds.max.x + GAP + width / 2.0,
                        bounds.min.y + atlas.areas[&key].size.height * TILE_UNITS / 2.0,
                    ),
                    None => Pos2::ZERO,
                }
            }
        };
        layout.cards.insert(
            key,
            Card {
                x: round2(at.x),
                y: round2(at.y),
                size: 100,
                pinned: false,
            },
        );
    }
    layout
}

pub const MIN_FOOTPRINT: Vec2 = Vec2::new(1000.0, 620.0);

pub fn card_rect(atlas: &Atlas, key: &str, card: &Card) -> Option<Rect> {
    let info = atlas.areas.get(key)?;
    let scale = card.size as f32 / 100.0 * TILE_UNITS;
    let size = Vec2::new(info.size.width * scale, info.size.height * scale).max(MIN_FOOTPRINT);
    Some(Rect::from_center_size(Pos2::new(card.x, card.y), size))
}

pub fn art_rect(atlas: &Atlas, key: &str, card: &Card) -> Option<Rect> {
    let info = atlas.areas.get(key)?;
    let scale = card.size as f32 / 100.0 * TILE_UNITS;
    let size = Vec2::new(info.size.width * scale, info.size.height * scale);
    Some(Rect::from_center_size(Pos2::new(card.x, card.y), size))
}

pub fn card_beside(project: &Project, edit: &mut Edit, key: &str, copy: &str) {
    let Some(value) = project.files.json_owned(&row_file("world_map", ROW_KEY)) else {
        return;
    };
    let Ok(mut layout) = serde_json::from_value::<Layout>(value) else {
        return;
    };
    let Some(original) = layout.cards.get(key).copied() else {
        return;
    };
    let width = project
        .content
        .and_then(|content| {
            content
                .by_key::<game::systems::area::AreaDef>(key)
                .map(|id| game::systems::area::load(&content, id).size.width)
        })
        .unwrap_or(32.0);
    layout.cards.insert(
        copy.to_owned(),
        Card {
            x: original.x + width * TILE_UNITS * original.size as f32 / 100.0 + GAP,
            y: original.y,
            size: 100,
            pinned: false,
        },
    );
    edit.write_json(
        row_file("world_map", ROW_KEY),
        &crate::value::json(&layout).unwrap_or_default(),
    );
}

pub fn show(editor: &mut Editor, ui: &mut Ui, _world: &mut World) {
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        ui.label(theme::muted(
            "The folder does not load; the map shows the last layout once it does.",
        ));
        return;
    };
    let generation = editor
        .project
        .as_ref()
        .map(|project| project.generation)
        .unwrap_or(0);
    if editor.views.world.atlas_for != Some(generation) {
        let files = &editor.project.as_ref().expect("project").files;
        editor.views.world.atlas = Some(Arc::new(Atlas::build(content, files)));
        editor.views.world.atlas_for = Some(generation);
    }
    let atlas = editor.views.world.atlas.clone().expect("atlas");
    let layout = with_defaults(&atlas, layout_of(editor));
    if let Some((area, zoom)) = editor.views.world.pending_look.take() {
        editor.views.world.look_at(&atlas, &layout, &area, zoom);
    }
    toolbar::show(editor, ui, &atlas, &layout);
    canvas::show(editor, ui, content, &atlas, layout, generation);
}

pub fn region_colour(name: Option<&str>) -> egui::Color32 {
    match name.unwrap_or("grey") {
        "amber" => egui::Color32::from_rgb(242, 176, 62),
        "green" => egui::Color32::from_rgb(86, 196, 124),
        "blue" => egui::Color32::from_rgb(90, 160, 255),
        "red" => egui::Color32::from_rgb(226, 90, 90),
        "violet" => egui::Color32::from_rgb(170, 120, 240),
        _ => egui::Color32::from_rgb(150, 150, 170),
    }
}

pub const REGION_COLOURS: [&str; 6] = ["grey", "amber", "green", "blue", "red", "violet"];

fn round2(value: f32) -> f32 {
    (value * 100.0).round() / 100.0
}

pub fn select(editor: &mut Editor, parts: Vec<Part>) {
    editor.views.world.selected = parts.clone();
    editor.select(Selection {
        table: "world_map".to_owned(),
        keys: vec![ROW_KEY.to_owned()],
        parts: parts.iter().map(Part::text).collect(),
    });
}

fn write_layout(editor: &mut Editor, layout: Layout, label: String) -> bool {
    let mut edit = Edit::new(label);
    edit.write_json(
        row_file("world_map", ROW_KEY),
        &crate::value::json(&layout).unwrap_or_default(),
    );
    editor.apply(edit)
}

fn write_layout_merging(editor: &mut Editor, layout: Layout, label: String) -> bool {
    let mut edit = Edit::new(label).merging();
    edit.write_json(
        row_file("world_map", ROW_KEY),
        &crate::value::json(&layout).unwrap_or_default(),
    );
    editor.apply(edit)
}

fn tidy_regions(layout: &mut Layout) {
    let cards: Vec<String> = layout.cards.keys().cloned().collect();
    for region in &mut layout.regions {
        region.cards.retain(|key| cards.contains(key));
    }
    layout.regions.retain(|region| !region.cards.is_empty());
}

fn region_from_selection(editor: &mut Editor, layout: &Layout) {
    let keys: Vec<String> = editor
        .views
        .world
        .selected
        .iter()
        .filter_map(|part| match part {
            Part::Card(key) => Some(key.clone()),
            _ => None,
        })
        .collect();
    if keys.is_empty() {
        editor.toast("Select the cards the region holds first");
        return;
    }
    let mut next = layout.clone();
    for region in &mut next.regions {
        region.cards.retain(|key| !keys.contains(key));
    }
    next.regions.retain(|region| !region.cards.is_empty());
    let name = format!("Region {}", next.regions.len() + 1);
    next.regions.push(Region {
        name: name.clone(),
        cards: keys,
        colour: None,
    });
    let index = next.regions.len() - 1;
    if write_layout(editor, next, format!("Add {name} to the world map")) {
        select(editor, vec![Part::Region(index)]);
    }
}

fn add_note(editor: &mut Editor, layout: &Layout, at: Pos2) {
    let mut next = layout.clone();
    next.notes.push(Note {
        text: "Note".to_owned(),
        x: round2(at.x),
        y: round2(at.y),
    });
    let index = next.notes.len() - 1;
    if write_layout(editor, next, "Add a note".to_owned()) {
        select(editor, vec![Part::Note(index)]);
    }
}

fn region_rect(atlas: &Atlas, layout: &Layout, region: &Region) -> Option<Rect> {
    region
        .cards
        .iter()
        .filter_map(|key| {
            layout
                .cards
                .get(key)
                .and_then(|card| card_rect(atlas, key, card))
        })
        .reduce(|a, b| a.union(b))
        .map(|r| r.expand(REGION_PAD))
}
