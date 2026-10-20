use std::collections::BTreeMap;
use std::io;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::grid::{AreaGrids, Flip, LayerGrid, PaletteEntry};
use super::scene::{self, SCENE_FILE, SCENE_PARTS, Scene, SceneNode, module_json, scene_file};
use super::{AreaId, AreaModule, ObjectShape, Tilemap};
use crate::core::audio::soundscape::SoundscapeShape;
use crate::core::content::id::{Leaf, nearest, nearest_path};
use crate::core::content::load::{ParseError, shape_problem};
use crate::core::content::locate::escape;
use crate::core::content::{
    Bundle, CONFIG_FILE, Content, ContentFile, ContentId, ContentProblem, ContentScope, FileWriter,
    PartSpec, Parts, RowCheck, Shape, serial, valid_key, with_content,
};
use crate::core::math::{Pos, Rect, Size};
use crate::core::script::{VarValue, Variable, VariableType, Vocabulary};
use crate::core::tiling::{Cell, CellPos, GridDims, TilePos, Tiles};
use crate::systems::script::{RiftScripting, ScriptModule};

pub type BlueprintId = ContentId<BlueprintDef>;

/// Placements nest at most this deep.
pub const MAX_DEPTH: usize = 8;
pub const MAX_PARTS: usize = 4096;
pub const MAX_AREA_PARTS: usize = 65_536;
pub const MAX_VARIABLES: usize = 32;

/// A reusable piece of an area: a box of ground with a scene graph of modules on it, placed as one
/// node of an area or of another blueprint. Its variables are holes in its modules that each
/// placement fills.
#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlueprintDef {
    pub map: Tilemap,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub variables: BTreeMap<String, Variable<RiftScripting>>,
    #[serde(skip)]
    pub scene: Scene,
}

impl ContentFile for BlueprintDef {
    const TABLE: &'static str = "blueprint";
    const SHAPE: Shape = Shape::Bundle;

    fn check(&self, cx: &mut RowCheck) {
        self.map.check("/map", 1, cx);
        cx.count(
            "/variables",
            self.variables.len(),
            0,
            MAX_VARIABLES,
            "variables",
        );
        for name in self.variables.keys() {
            if !(1..=40).contains(&name.len()) || !valid_key(name) {
                cx.error(
                    format!("/variables/{}", escape(name)),
                    "out of range",
                    format!("{name:?}"),
                    "a variable name of 1 to 40 key characters",
                );
            }
        }
    }
}

impl Bundle for BlueprintDef {
    const PARTS: &'static [PartSpec] = SCENE_PARTS;

    fn read_parts(&mut self, parts: &mut Parts) {
        scene::read(&mut self.scene, &self.map, &self.variables, parts);
        let used = scene::holes(&self.scene.nodes);
        for name in self.variables.keys() {
            if !used.contains(name) {
                parts.json_error(
                    CONFIG_FILE,
                    &format!("/variables/{}", escape(name)),
                    ContentProblem::new(
                        "unused variable",
                        name,
                        "a variable some hole in the scene names",
                    ),
                );
            }
        }
    }

    fn write_parts(&self, bundle: &str, writer: &mut FileWriter) -> io::Result<()> {
        scene::write(&self.scene, &self.map, bundle, writer)
    }
}

/// What a hole without a value reads as while its module is read for references: a path no file
/// has, whose reference is left out.
pub(super) const HOLE: &str = "\u{1}hole";

/// Fills each hole with its variable's default, or with a stand-in of the variable's type, so the
/// rest of the module reads as a module would.
pub(super) fn stand_in_holes(
    json: &mut Value,
    variables: &BTreeMap<String, Variable<RiftScripting>>,
) {
    if let Some(name) = hole_name(json) {
        let variable = variables.get(name);
        let default = variable
            .and_then(|variable| variable.default.as_ref())
            .and_then(|default| serde_json::to_value(default).ok());
        *json = default.unwrap_or_else(|| match variable.map(|variable| variable.ty) {
            Some(VariableType::Integer | VariableType::Number) => Value::from(0),
            Some(VariableType::Boolean) => Value::Bool(false),
            Some(VariableType::Condition) => Value::Bool(true),
            Some(VariableType::Text | VariableType::Name) => Value::String(String::new()),
            Some(VariableType::Place) => serde_json::json!({ "area": HOLE, "x": 0, "y": 0 }),
            Some(VariableType::Row | VariableType::Audio) | None => Value::String(HOLE.to_owned()),
        });
        return;
    }
    match json {
        Value::Object(map) => map
            .values_mut()
            .for_each(|value| stand_in_holes(value, variables)),
        Value::Array(items) => items
            .iter_mut()
            .for_each(|item| stand_in_holes(item, variables)),
        _ => {}
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    pub blueprint: BlueprintId,
    #[schemars(with = "serial::PosRow")]
    #[serde(serialize_with = "serial::pos", deserialize_with = "serial::pos_from")]
    pub at: Pos<Tiles>,
    #[serde(default, skip_serializing_if = "Flip::is_none")]
    pub flip: Flip,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub values: BTreeMap<String, VarValue<RiftScripting>>,
}

/// A module of an area once its scene is flattened: folders dissolved and placed blueprints
/// expanded.
#[derive(Clone)]
pub struct Flattened {
    pub module: AreaModule,
    /// The path of the node in the area's scene that is the module or brings it.
    pub origin: String,
    /// The placed blueprints it came through, each with the path of the node in that blueprint's
    /// scene that is the module or places the next one.
    pub chain: Vec<(BlueprintId, String)>,
}

impl Flattened {
    /// The file and JSON pointer of the node the module was written as.
    pub fn site(&self, content: &Content, area: AreaId) -> (String, String) {
        match self.chain.last() {
            None => (scene_file(area.path(content)), self.origin.clone()),
            Some((blueprint, pointer)) => (scene_file(blueprint.path(content)), pointer.clone()),
        }
    }

    pub fn describe(&self, content: &Content) -> String {
        match self.chain.last() {
            None => format!("node {}", self.origin),
            Some((blueprint, pointer)) => {
                let through: Vec<&str> = self.chain[..self.chain.len() - 1]
                    .iter()
                    .map(|(blueprint, _)| blueprint.name(content))
                    .collect();
                let mut text = format!("node {pointer} of {}", blueprint.name(content));
                if !through.is_empty() {
                    text.push_str(&format!(", through {}", through.join(" → ")));
                }
                text
            }
        }
    }
}

/// A blueprint placed in an area, at any depth: where its cells and modules land, and the scripts
/// that run once for it.
pub struct PlacedBlueprint {
    pub blueprint: BlueprintId,
    pub origin: String,
    pub chain: Vec<(BlueprintId, String)>,
    pub at: Pos<Tiles>,
    pub flip: Flip,
    pub values: BTreeMap<String, Value>,
    /// Each script with the path of its node in the blueprint's scene.
    pub scripts: Vec<(String, ScriptModule)>,
}

pub struct Flattening {
    pub modules: Vec<Flattened>,
    pub placements: Vec<PlacedBlueprint>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FlattenAt {
    /// A JSON pointer in the area's scene.
    Area(String),
    /// A JSON part of a blueprint and a pointer in it.
    Blueprint(BlueprintId, &'static str, String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FlattenError {
    pub at: FlattenAt,
    pub problem: ContentProblem,
}

/// The modules an area's scene adds up to, in tree order: folders dissolve, ground layers are left to
/// the grids, and each placement brings its blueprint's modules, placed.
pub fn flatten(
    content: &Content,
    nodes: &[SceneNode],
    errors: &mut Vec<FlattenError>,
) -> Flattening {
    let mut out = Vec::new();
    let mut placements = Vec::new();
    let mut found = Vec::new();
    scene::walk(nodes, &mut |pointer, node, _| {
        if let SceneNode::Module(module) = node {
            found.push((pointer.to_owned(), module));
        }
    });
    for (pointer, module) in found {
        let module = with_content(ContentScope::of(content), || {
            serde_path_to_error::deserialize::<_, AreaModule>(module_json(module))
        })
        .0;
        match module {
            Ok(AreaModule::Blueprint(placement)) => {
                let mut cx = Expansion {
                    content,
                    errors: &mut *errors,
                    out: &mut out,
                    placements: &mut placements,
                    origin: pointer.clone(),
                    values_at: FlattenAt::Area(format!("{pointer}/values")),
                    chain: Vec::new(),
                };
                cx.expand(&placement, placement.at, placement.flip, &placement.values);
            }
            Ok(module) => out.push(Flattened {
                module,
                origin: pointer,
                chain: Vec::new(),
            }),
            Err(error) => errors.push(misread(FlattenAt::Area(pointer), error)),
        }
    }
    if out.len() > MAX_AREA_PARTS {
        errors.push(FlattenError {
            at: FlattenAt::Area(String::new()),
            problem: ContentProblem::new(
                "too many parts",
                format!("{} modules after flattening", out.len()),
                format!("at most {MAX_AREA_PARTS} per area"),
            ),
        });
    }
    Flattening {
        modules: out,
        placements,
    }
}

fn misread(at: FlattenAt, error: serde_path_to_error::Error<serde_json::Error>) -> FlattenError {
    let error = ParseError::from(error);
    let at = match at {
        FlattenAt::Area(pointer) => FlattenAt::Area(format!("{pointer}{}", error.pointer)),
        FlattenAt::Blueprint(id, part, pointer) => {
            FlattenAt::Blueprint(id, part, format!("{pointer}{}", error.pointer))
        }
    };
    FlattenError {
        at,
        problem: shape_problem(&error),
    }
}

struct Expansion<'a> {
    content: &'a Content,
    errors: &'a mut Vec<FlattenError>,
    out: &'a mut Vec<Flattened>,
    placements: &'a mut Vec<PlacedBlueprint>,
    origin: String,
    /// Where the values the placement being expanded gives are written.
    values_at: FlattenAt,
    chain: Vec<(BlueprintId, String)>,
}

impl Expansion<'_> {
    fn error(&mut self, at: FlattenAt, rule: &'static str, found: String, expected: String) {
        self.errors.push(FlattenError {
            at,
            problem: ContentProblem::new(rule, found, expected),
        });
    }

    /// Where the placement being expanded is written: in the area's scene at the top, or in the
    /// scene of the blueprint that places it.
    fn placed_at(&self) -> FlattenAt {
        match self.chain.last() {
            None => FlattenAt::Area(self.origin.clone()),
            Some((blueprint, pointer)) => {
                FlattenAt::Blueprint(*blueprint, SCENE_FILE, pointer.clone())
            }
        }
    }

    fn values_pointer(&self, name: &str) -> FlattenAt {
        match &self.values_at {
            FlattenAt::Area(pointer) => FlattenAt::Area(format!("{pointer}/{}", escape(name))),
            FlattenAt::Blueprint(id, part, pointer) => {
                FlattenAt::Blueprint(*id, part, format!("{pointer}/{}", escape(name)))
            }
        }
    }

    fn expand(
        &mut self,
        placement: &Placement,
        at: Pos<Tiles>,
        flip: Flip,
        values: &BTreeMap<String, VarValue<RiftScripting>>,
    ) {
        let content = self.content.clone();
        let Some(def) = content.table::<BlueprintDef>().get(placement.blueprint) else {
            return;
        };
        if self.chain.len() + 1 > MAX_DEPTH {
            let chain = self.chain_text(Some(placement.blueprint));
            let at = self.placed_at();
            self.error(
                at,
                "nested too deep",
                format!("depth {} through {chain}", self.chain.len() + 1),
                format!("at most {MAX_DEPTH} levels of placements"),
            );
            return;
        }
        if self
            .chain
            .iter()
            .any(|(blueprint, _)| *blueprint == placement.blueprint)
        {
            let chain = self.chain_text(Some(placement.blueprint));
            self.error(
                FlattenAt::Blueprint(placement.blueprint, SCENE_FILE, String::new()),
                "blueprint holds itself",
                chain,
                "a blueprint that never contains itself, at any depth".to_owned(),
            );
            return;
        }
        let mut filled: BTreeMap<String, Value> = BTreeMap::new();
        let mut supplied: Vec<String> = Vec::new();
        let mut missing = false;
        for name in values.keys() {
            if !def.variables.contains_key(name) {
                let at = self.values_pointer(name);
                self.unknown_variable(at, placement.blueprint, def, name);
            }
        }
        for (name, variable) in &def.variables {
            let (value, own) = match values.get(name) {
                Some(value) => (value, true),
                None => match &variable.default {
                    Some(default) => (default, false),
                    None => {
                        missing = true;
                        let at = self.values_at.clone();
                        self.error(
                            at,
                            "missing value",
                            format!("no value for {name}"),
                            format!(
                                "a {} value for {name}, which has no default",
                                variable.ty.name()
                            ),
                        );
                        continue;
                    }
                },
            };
            match typed_value(&content, variable, value) {
                Ok(json) => {
                    if own {
                        strings(&json, &mut supplied);
                    }
                    filled.insert(name.clone(), json);
                }
                Err(problem) => {
                    let at = if own {
                        self.values_pointer(name)
                    } else {
                        FlattenAt::Blueprint(
                            placement.blueprint,
                            CONFIG_FILE,
                            format!("/variables/{}/default", escape(name)),
                        )
                    };
                    self.errors.push(FlattenError { at, problem });
                }
            }
        }
        if missing {
            return;
        }
        let placed = self.placements.len();
        self.placements.push(PlacedBlueprint {
            blueprint: placement.blueprint,
            origin: self.origin.clone(),
            chain: self.chain.clone(),
            at,
            flip,
            values: filled.clone(),
            scripts: Vec::new(),
        });
        let start = self.out.len();
        let mut nodes = Vec::new();
        scene::walk(&def.scene.nodes, &mut |pointer, node, _| {
            if let SceneNode::Module(module) = node {
                nodes.push((pointer.to_owned(), module));
            }
        });
        for (pointer, node) in nodes {
            let mut json = module_json(node);
            let mut unknown: Vec<(String, String)> = Vec::new();
            fill(&mut json, &filled, &def.variables, &pointer, &mut unknown);
            for (pointer, name) in unknown {
                let at = FlattenAt::Blueprint(placement.blueprint, SCENE_FILE, pointer);
                self.unknown_variable(at, placement.blueprint, def, &name);
            }
            let site = FlattenAt::Blueprint(placement.blueprint, SCENE_FILE, pointer.clone());
            let module = {
                let (result, scope) = with_content(ContentScope::of(&content), || {
                    serde_path_to_error::deserialize::<_, AreaModule>(json)
                });
                let from_placement = scope
                    .leaves()
                    .iter()
                    .filter(|leaf| supplied.contains(&leaf.value));
                for problem in from_placement.filter_map(Leaf::reported) {
                    self.errors.push(FlattenError {
                        at: site.clone(),
                        problem,
                    });
                }
                match result {
                    Ok(module) => module,
                    Err(error) => {
                        self.errors.push(misread(site, error));
                        continue;
                    }
                }
            };
            let mut chain = self.chain.clone();
            chain.push((placement.blueprint, pointer.clone()));
            match module {
                AreaModule::Script(script) => {
                    self.placements[placed].scripts.push((pointer, script))
                }
                AreaModule::Blueprint(nested) => {
                    let nested_at = at_of(at, flip, nested.at);
                    let nested_flip = nested.flip.compose(flip);
                    let values_at = FlattenAt::Blueprint(
                        placement.blueprint,
                        SCENE_FILE,
                        format!("{pointer}/values"),
                    );
                    let mut inner = Expansion {
                        content: self.content,
                        errors: self.errors,
                        out: self.out,
                        placements: self.placements,
                        origin: self.origin.clone(),
                        values_at,
                        chain,
                    };
                    inner.expand(&nested, nested_at, nested_flip, &nested.values);
                }
                mut module => {
                    place(&mut module, at, flip);
                    self.out.push(Flattened {
                        module,
                        origin: self.origin.clone(),
                        chain,
                    });
                }
            }
        }
        if self.out.len() - start > MAX_PARTS {
            self.error(
                FlattenAt::Blueprint(placement.blueprint, SCENE_FILE, String::new()),
                "too many parts",
                format!(
                    "{}: {}",
                    placement.blueprint.name(&content),
                    self.out.len() - start
                ),
                format!("at most {MAX_PARTS} flattened parts per blueprint"),
            );
        }
    }

    fn unknown_variable(
        &mut self,
        at: FlattenAt,
        blueprint: BlueprintId,
        def: &BlueprintDef,
        name: &str,
    ) {
        self.errors.push(FlattenError {
            at,
            problem: ContentProblem::new(
                "unknown variable",
                format!("{name:?}"),
                format!("a variable {} declares", blueprint.name(self.content)),
            )
            .near(nearest(def.variables.keys(), name).map(|n| format!("{n:?}"))),
        });
    }

    fn chain_text(&self, last: Option<BlueprintId>) -> String {
        let content = self.content;
        let mut names: Vec<&str> = self
            .chain
            .iter()
            .map(|(blueprint, _)| blueprint.path(content))
            .collect();
        if let Some(last) = last {
            names.push(last.path(content));
        }
        names.join(" → ")
    }
}

/// Where a point given in a placed blueprint's own coordinates lands.
fn at_of(at: Pos<Tiles>, flip: Flip, point: Pos<Tiles>) -> Pos<Tiles> {
    at + flip.apply(point).to_vector()
}

/// The ground an area shows once every placed blueprint painted into it: layer by layer of the same
/// name, each placement's cells over what's under them in tree order, a placement's own blueprint
/// under the placements inside it. Forced walk cells merge the same way, and each placement's
/// palette entries join the area's, flipped as the placement is.
pub fn stamp<'a>(
    area: &AreaGrids,
    placements: &[PlacedBlueprint],
    grids_of: impl Fn(BlueprintId) -> Option<(&'a BlueprintDef, &'a AreaGrids)>,
    content: &Content,
    errors: &mut Vec<FlattenError>,
) -> AreaGrids {
    let mut out = area.clone();
    let size = out.size;
    for placement in placements {
        let Some((def, grids)) = grids_of(placement.blueprint) else {
            continue;
        };
        let site = match placement.chain.last() {
            None => FlattenAt::Area(placement.origin.clone()),
            Some((blueprint, pointer)) => {
                FlattenAt::Blueprint(*blueprint, SCENE_FILE, pointer.clone())
            }
        };
        let cells: Vec<(usize, CellPos)> = def
            .map
            .size
            .grid()
            .cells()
            .enumerate()
            .map(|(index, cell)| {
                let square = Rect::new(Pos::new(cell.x as f32, cell.y as f32), Size::splat(1.0));
                (
                    index,
                    placement.flip.place(square, placement.at).origin.cell(),
                )
            })
            .collect();
        let mut off_edge = false;
        for layer in &grids.ground {
            if layer.cells.iter().all(Option::is_none) {
                continue;
            }
            let Some(target) = out.ground.iter().position(|known| known.name == layer.name) else {
                errors.push(FlattenError {
                    at: site.clone(),
                    problem: ContentProblem::new(
                        "missing layer",
                        format!(
                            "{} paints layer {}, which the area has none of",
                            placement.blueprint.name(content),
                            layer.name
                        ),
                        format!("a ground layer named {} in the area", layer.name),
                    ),
                });
                continue;
            };
            for &(index, cell) in &cells {
                let Some(tile) = layer.cells[index] else {
                    continue;
                };
                let Some(to) = cell.index(size) else {
                    off_edge = true;
                    continue;
                };
                let Some(entry) = grids.palette.get(tile as usize) else {
                    continue;
                };
                let entry = PaletteEntry {
                    flip: entry.flip.compose(placement.flip),
                    ..*entry
                };
                let at = out.palette_index(entry, content);
                out.ground[target].cells[to] = Some(at);
            }
        }
        for &(index, cell) in &cells {
            let Some(forced) = grids.walk.get(index).copied().flatten() else {
                continue;
            };
            match cell.index(size) {
                Some(to) => out.walk[to] = Some(forced),
                None => off_edge = true,
            }
        }
        if off_edge {
            errors.push(FlattenError {
                at: site,
                problem: ContentProblem::new(
                    "outside the map",
                    format!(
                        "cells of {} land outside the map",
                        placement.blueprint.name(content)
                    ),
                    format!(
                        "every painted cell inside the {} × {} map",
                        size.width, size.height
                    ),
                ),
            });
        }
    }
    out
}

/// The layers of `grids` in tree order with the cells painted in each.
pub fn layer_grids(def_scene: &Scene, map: &Tilemap) -> Vec<LayerGrid> {
    scene::layers(&def_scene.nodes)
        .into_iter()
        .map(|layer| LayerGrid {
            name: layer.name.clone(),
            cells: def_scene.grids.layer(&layer.name, map),
        })
        .collect()
}

fn typed_value(
    content: &Content,
    variable: &Variable<RiftScripting>,
    value: &VarValue<RiftScripting>,
) -> Result<Value, ContentProblem> {
    let wrong = |expected: &str| {
        ContentProblem::new(
            "wrong type",
            format!("a {} value", value.kind()),
            format!("a {expected} value"),
        )
    };
    let json = |value: &VarValue<RiftScripting>| {
        with_content(ContentScope::of(content), || serde_json::to_value(value))
            .0
            .map_err(|error| ContentProblem::new("wrong type", error, "a JSON value"))
    };
    match (variable.ty, value) {
        (VariableType::Integer, VarValue::Integer(_))
        | (VariableType::Number, VarValue::Integer(_) | VarValue::Number(_))
        | (VariableType::Boolean, VarValue::Boolean(_))
        | (VariableType::Text | VariableType::Name | VariableType::Audio, VarValue::Str(_))
        | (VariableType::Place, VarValue::Place(_))
        | (VariableType::Condition, VarValue::Condition(_) | VarValue::Boolean(_)) => json(value),
        (VariableType::Row, VarValue::Str(key)) => {
            let table = variable.table.as_deref().unwrap_or("");
            match RiftScripting::row_value(content, table, key) {
                Some(_) => json(value),
                None => Err(ContentProblem::unknown_row(
                    table,
                    key,
                    content
                        .table_named(table)
                        .and_then(|files| nearest_path(files.paths(), key))
                        .as_deref(),
                )),
            }
        }
        _ => Err(wrong(variable.ty.name())),
    }
}

fn fill(
    json: &mut Value,
    values: &BTreeMap<String, Value>,
    declared: &BTreeMap<String, Variable<RiftScripting>>,
    pointer: &str,
    unknown: &mut Vec<(String, String)>,
) {
    if let Some(name) = hole_name(json).map(str::to_owned) {
        match values.get(&name) {
            Some(value) => *json = value.clone(),
            None if !declared.contains_key(&name) => unknown.push((format!("{pointer}/var"), name)),
            None => {}
        }
        return;
    }
    match json {
        Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                let pointer = format!("{pointer}/{}", escape(key));
                fill(value, values, declared, &pointer, unknown);
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter_mut().enumerate() {
                fill(
                    item,
                    values,
                    declared,
                    &format!("{pointer}/{index}"),
                    unknown,
                );
            }
        }
        _ => {}
    }
}

pub fn hole_name(json: &Value) -> Option<&str> {
    let map = json.as_object()?;
    if map.len() != 1 {
        return None;
    }
    map.get("var")?.as_str()
}

fn strings(json: &Value, into: &mut Vec<String>) {
    match json {
        Value::String(text) => into.push(text.clone()),
        Value::Object(map) => map.values().for_each(|value| strings(value, into)),
        Value::Array(items) => items.iter().for_each(|item| strings(item, into)),
        _ => {}
    }
}

pub fn holes(json: &Value, into: &mut Vec<String>) {
    if let Some(name) = hole_name(json) {
        if !into.iter().any(|known| known == name) {
            into.push(name.to_owned());
        }
        return;
    }
    match json {
        Value::Object(map) => {
            for value in map.values() {
                holes(value, into);
            }
        }
        Value::Array(items) => {
            for item in items {
                holes(item, into);
            }
        }
        _ => {}
    }
}

pub fn place(module: &mut AreaModule, at: Pos<Tiles>, flip: Flip) {
    let point = |p: Pos<Tiles>| at + flip.apply(p).to_vector();
    let rect = |r: Rect<Tiles>| flip.place(r, at);
    match module {
        AreaModule::Object(object) => {
            object.shape = match object.shape {
                ObjectShape::Point(p) => ObjectShape::Point(point(p)),
                ObjectShape::Rect(r) => ObjectShape::Rect(rect(r)),
            };
        }
        AreaModule::SafeZone(zone) => zone.rect = rect(zone.rect),
        AreaModule::Soundscape(soundscape) => {
            soundscape.shape = match soundscape.shape {
                SoundscapeShape::Rect(r) => SoundscapeShape::Rect(rect(r)),
                SoundscapeShape::Ellipse(r) => SoundscapeShape::Ellipse(rect(r)),
            };
        }
        AreaModule::Scenery(scenery) => {
            scenery.at = point(scenery.at);
            scenery.flip = scenery.flip.compose(flip);
        }
        AreaModule::Population(population) => {
            population.roams = population.roams.map(rect);
        }
        AreaModule::Resident(resident) => resident.at = point(resident.at),
        AreaModule::Blueprint(_) | AreaModule::Script(_) => {}
    }
}
