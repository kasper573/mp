use std::collections::BTreeMap;
use std::io;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::blueprint::BlueprintDef;
use super::blueprint::{HOLE, stand_in_holes};
use super::grid::{
    GridFile, PaletteRow, palette_cell, read_grid, read_palette, walk_cell, write_grid_cells,
    write_palette, write_walk,
};
use super::{AreaModule, MAX_GROUND_LAYERS, Tilemap};
use crate::core::content::id::read_aside;
use crate::core::content::load::{JsonPart, ParseError, parse_value, shape_problem};
use crate::core::content::locate::escape;
use crate::core::content::{
    Content, ContentProblem, ErrorPlace, FileWriter, PartSpec, Parts, serial, valid_name,
};
use crate::core::script::Variable;
use crate::systems::script::RiftScripting;

pub const SCENE_FILE: &str = "scene.json";
pub const PALETTE_FILE: &str = "palette.csv";
pub const WALK_FILE: &str = "walk.csv";
pub const LAYERS_FOLDER: &str = "layers";

pub const SCENE: PartSpec = PartSpec::File {
    name: "scene",
    exts: &["json"],
};
pub const PALETTE: PartSpec = PartSpec::File {
    name: "palette",
    exts: &["csv"],
};
pub const WALK: PartSpec = PartSpec::File {
    name: "walk",
    exts: &["csv"],
};
pub const LAYERS: PartSpec = PartSpec::Keyed {
    folder: LAYERS_FOLDER,
    exts: &["csv"],
};

/// What an area's or a blueprint's bundle keeps besides its config: its scene graph and the grids
/// its ground layers, walk and palette are painted in.
pub const SCENE_PARTS: &[PartSpec] = &[SCENE, PALETTE, WALK, LAYERS];

/// Folders of a scene nest at most this deep.
pub const MAX_FOLDER_DEPTH: usize = 16;

/// The fields a module node keeps beside its module's own: its label in the editor and its hide and
/// lock flags. The game never reads them.
pub const NODE_FIELDS: [&str; 3] = ["label", "hidden", "locked"];

/// One node of a scene graph. Folders only organize and ground layers name the grids their cells
/// are painted in; every other node is a module, kept as JSON so a blueprint's holes stay until a
/// placement fills them.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SceneNode {
    Folder(SceneFolder),
    GroundLayer(GroundLayer),
    #[serde(untagged)]
    Module(Value),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SceneFolder {
    pub label: String,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub locked: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<SceneNode>,
}

/// A layer of ground, painted in `layers/<name>.csv` of its bundle. Layers draw under every module,
/// later ones in the tree over earlier ones, and placed blueprints paint into the layer of the same
/// name.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroundLayer {
    pub name: String,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub locked: bool,
}

impl SceneNode {
    pub fn label(&self) -> Option<&str> {
        match self {
            SceneNode::Folder(folder) => Some(&folder.label),
            SceneNode::GroundLayer(_) => None,
            SceneNode::Module(module) => module.get("label").and_then(Value::as_str),
        }
    }

    pub fn hidden(&self) -> bool {
        match self {
            SceneNode::Folder(folder) => folder.hidden,
            SceneNode::GroundLayer(layer) => layer.hidden,
            SceneNode::Module(module) => flag(module, "hidden"),
        }
    }

    pub fn locked(&self) -> bool {
        match self {
            SceneNode::Folder(folder) => folder.locked,
            SceneNode::GroundLayer(layer) => layer.locked,
            SceneNode::Module(module) => flag(module, "locked"),
        }
    }

    /// The module's kind, `"blueprint"` for a placement.
    pub fn kind(&self) -> &str {
        match self {
            SceneNode::Folder(_) => "folder",
            SceneNode::GroundLayer(_) => "ground_layer",
            SceneNode::Module(module) => module.get("type").and_then(Value::as_str).unwrap_or(""),
        }
    }
}

fn flag(module: &Value, field: &str) -> bool {
    module.get(field).and_then(Value::as_bool).unwrap_or(false)
}

/// What a module node's module reads: its JSON without the node's label and flags.
pub fn module_json(node: &Value) -> Value {
    let mut json = node.clone();
    if let Some(fields) = json.as_object_mut() {
        for field in NODE_FIELDS {
            fields.shift_remove(field);
        }
    }
    json
}

/// Every node under `nodes`, depth first in tree order, with its JSON pointer in the scene and how
/// many folders hold it.
pub fn walk<'a>(nodes: &'a [SceneNode], visit: &mut impl FnMut(&str, &'a SceneNode, usize)) {
    fn inner<'a>(
        nodes: &'a [SceneNode],
        prefix: &str,
        depth: usize,
        visit: &mut impl FnMut(&str, &'a SceneNode, usize),
    ) {
        for (index, node) in nodes.iter().enumerate() {
            let pointer = format!("{prefix}/{index}");
            visit(&pointer, node, depth);
            if let SceneNode::Folder(folder) = node {
                inner(
                    &folder.children,
                    &format!("{pointer}/children"),
                    depth + 1,
                    visit,
                );
            }
        }
    }
    inner(nodes, "", 0, visit);
}

/// The scene's ground layers in tree order, which is the order they draw in.
pub fn layers(nodes: &[SceneNode]) -> Vec<&GroundLayer> {
    let mut layers = Vec::new();
    walk(nodes, &mut |_, node, _| {
        if let SceneNode::GroundLayer(layer) = node {
            layers.push(layer);
        }
    });
    layers
}

/// A scene and the grids painted for it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Scene {
    pub nodes: Vec<SceneNode>,
    pub grids: SceneGrids,
}

/// The grids of a bundle as written: its palette's rows, its forced walk cells and the cells of
/// each ground layer by name, one per cell of the map, empty where nothing is painted.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SceneGrids {
    pub palette: Vec<PaletteRow>,
    pub walk: Vec<Option<bool>>,
    pub layers: BTreeMap<String, Vec<Option<u32>>>,
}

impl SceneGrids {
    pub fn empty(map: &Tilemap) -> SceneGrids {
        SceneGrids {
            palette: Vec::new(),
            walk: vec![None; map.size.grid().area() as usize],
            layers: BTreeMap::new(),
        }
    }

    /// The cells of the layer named `name`, empty when nothing is painted in it.
    pub fn layer(&self, name: &str, map: &Tilemap) -> Vec<Option<u32>> {
        self.layers
            .get(name)
            .cloned()
            .unwrap_or_else(|| vec![None; map.size.grid().area() as usize])
    }
}

/// Reads the scene and the grids of the bundle `parts` holds, reporting every problem with its
/// structure at its node.
pub fn read(
    scene: &mut Scene,
    map: &Tilemap,
    variables: &BTreeMap<String, Variable<RiftScripting>>,
    parts: &mut Parts,
) {
    scene.grids = SceneGrids::empty(map);
    let Some(file) = parts.required(SCENE) else {
        return;
    };
    let Some(nodes) = parts.json::<Vec<SceneNode>>(file, |nodes| read_held(nodes, variables))
    else {
        return;
    };
    check(&nodes, parts);
    scene.grids = read_grids(&nodes, map, parts);
    scene.nodes = nodes;
}

pub fn write(
    scene: &Scene,
    map: &Tilemap,
    bundle: &str,
    writer: &mut FileWriter,
) -> io::Result<()> {
    writer.json(&format!("{bundle}/{SCENE_FILE}"), &scene.nodes)?;
    let size = map.size.grid();
    let grids = &scene.grids;
    if !grids.palette.is_empty() {
        writer.file(
            &format!("{bundle}/{PALETTE_FILE}"),
            write_palette(&grids.palette).as_bytes(),
        )?;
    }
    if grids.walk.iter().any(Option::is_some) {
        writer.file(
            &format!("{bundle}/{WALK_FILE}"),
            write_walk(size, &grids.walk).as_bytes(),
        )?;
    }
    for (name, cells) in &grids.layers {
        if cells.iter().any(Option::is_some) {
            writer.file(
                &format!("{bundle}/{LAYERS_FOLDER}/{name}.csv"),
                write_grid_cells(size, cells).as_bytes(),
            )?;
        }
    }
    Ok(())
}

/// The scene of each bundle of `table`, read for the content its modules name.
pub fn json_part(table: &'static str) -> JsonPart {
    JsonPart {
        table,
        name: SCENE_FILE,
        read: read_part,
    }
}

fn read_part(content: &Content, bundle: &str, value: &Value) -> Result<(), ParseError> {
    let nodes = parse_value::<Vec<SceneNode>>(value)?;
    let variables = content
        .by_path::<BlueprintDef>(bundle)
        .map(|blueprint| blueprint.get(content).variables.clone())
        .unwrap_or_default();
    read_held(&nodes, &variables);
    Ok(())
}

/// Reads, as the modules they make, the nodes a scene holds as JSON, standing in for each hole, so
/// the content they name counts as the bundle's references.
fn read_held(nodes: &[SceneNode], variables: &BTreeMap<String, Variable<RiftScripting>>) {
    walk(nodes, &mut |_, node, _| {
        if let SceneNode::Module(module) = node {
            let mut json = module_json(module);
            stand_in_holes(&mut json, variables);
            read_aside(
                || serde_json::from_value::<AreaModule>(json).ok(),
                |leaf| leaf.value != HOLE,
            );
        }
    });
}

fn check(nodes: &[SceneNode], parts: &mut Parts) {
    let mut layers: Vec<(String, String)> = Vec::new();
    walk(nodes, &mut |pointer, node, depth| {
        if depth >= MAX_FOLDER_DEPTH && matches!(node, SceneNode::Folder(_)) {
            parts.json_error(
                SCENE_FILE,
                pointer,
                ContentProblem::new(
                    "nested too deep",
                    format!("a folder {} deep", depth + 1),
                    format!("folders nested at most {MAX_FOLDER_DEPTH} deep"),
                ),
            );
        }
        match node {
            SceneNode::GroundLayer(layer) => {
                if !valid_name(&layer.name) {
                    parts.json_error(
                        SCENE_FILE,
                        &format!("{pointer}/name"),
                        ContentProblem::new(
                            "invalid name",
                            format!("{:?}", layer.name),
                            crate::core::content::files::NAME_RULE,
                        ),
                    );
                }
                if let Some((_, first)) = layers
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(&layer.name))
                {
                    parts.json_error(
                        SCENE_FILE,
                        &format!("{pointer}/name"),
                        ContentProblem::new(
                            "duplicate name",
                            format!("layer {} at {first} and {pointer}", layer.name),
                            "ground layer names unique in the scene",
                        ),
                    );
                }
                layers.push((layer.name.clone(), pointer.to_owned()));
            }
            SceneNode::Module(module) => check_module(pointer, module, parts),
            SceneNode::Folder(_) => {}
        }
    });
    if layers.len() > MAX_GROUND_LAYERS {
        parts.json_error(
            SCENE_FILE,
            "",
            ContentProblem::new(
                "out of range",
                format!("{} ground layers", layers.len()),
                format!("at most {MAX_GROUND_LAYERS} ground layers"),
            ),
        );
    }
    check_labels(nodes, "", parts);
}

fn check_module(pointer: &str, module: &Value, parts: &mut Parts) {
    // A folder or a layer node that didn't read as one falls to the module catch-all; reading it as
    // what it says it is tells what is wrong with it.
    let kind = module.get("type").and_then(Value::as_str).unwrap_or("");
    let mut fields = module.clone();
    if let Some(fields) = fields.as_object_mut() {
        fields.shift_remove("type");
    }
    let misread = match kind {
        "folder" => parse_value::<SceneFolder>(&fields).err(),
        "ground_layer" => parse_value::<GroundLayer>(&fields).err(),
        _ => None,
    };
    if let Some(error) = misread {
        parts.json_error(
            SCENE_FILE,
            &format!("{pointer}{}", error.pointer),
            shape_problem(&error),
        );
        return;
    }
    let label = module.get("label");
    if label.is_some_and(|label| !label.as_str().is_some_and(|label| !label.is_empty())) {
        parts.json_error(
            SCENE_FILE,
            &format!("{pointer}/label"),
            ContentProblem::new("wrong type", "a label that isn't text", "a label of text"),
        );
    }
    if kind == "blueprint" && label.is_none() {
        parts.json_error(
            SCENE_FILE,
            pointer,
            ContentProblem::new(
                "missing field",
                "a placement without a label",
                "a label on every placement, its name in the editor",
            ),
        );
    }
    for flag in ["hidden", "locked"] {
        if module.get(flag).is_some_and(|value| !value.is_boolean()) {
            parts.json_error(
                SCENE_FILE,
                &format!("{pointer}/{}", escape(flag)),
                ContentProblem::new(
                    "wrong type",
                    "a flag that isn't true or false",
                    "true or false",
                ),
            );
        }
    }
}

/// Labels are unique among siblings ignoring case, as file names are in a folder.
fn check_labels(nodes: &[SceneNode], prefix: &str, parts: &mut Parts) {
    let mut seen: Vec<&str> = Vec::new();
    for (index, node) in nodes.iter().enumerate() {
        let pointer = format!("{prefix}/{index}");
        if let Some(label) = node.label() {
            if seen.iter().any(|known| known.eq_ignore_ascii_case(label)) {
                parts.json_error(
                    SCENE_FILE,
                    &format!("{pointer}/label"),
                    ContentProblem::new(
                        "duplicate name",
                        format!("{label:?} twice in one folder"),
                        "labels unique among their siblings",
                    ),
                );
            }
            seen.push(label);
        }
        if let SceneNode::Folder(folder) = node {
            check_labels(&folder.children, &format!("{pointer}/children"), parts);
        }
    }
}

fn read_grids(nodes: &[SceneNode], map: &Tilemap, parts: &mut Parts) -> SceneGrids {
    let mut grids = SceneGrids::empty(map);
    let size = map.size.grid();
    if let Some(file) = parts.file(PALETTE)
        && let Some(text) = parts.text(file)
    {
        let path = parts.path(file);
        grids.palette = read_palette(
            GridFile {
                path: &path,
                text: &text,
            },
            parts.errors(),
        )
        .unwrap_or_default();
    }
    if let Some(file) = parts.file(WALK)
        && let Some(text) = parts.text(file)
    {
        let path = parts.path(file);
        if let Some(walk) = read_grid(
            GridFile {
                path: &path,
                text: &text,
            },
            size,
            walk_cell,
            parts.errors(),
        ) {
            grids.walk = walk;
        }
    }
    let names: Vec<String> = layers(nodes)
        .iter()
        .map(|layer| layer.name.clone())
        .collect();
    for (name, file) in parts.keyed(LAYERS) {
        if !names.iter().any(|known| known == name) {
            parts.error(
                file,
                ErrorPlace::WholeFile,
                ContentProblem::new(
                    "unknown part",
                    format!("file {file}"),
                    "a grid for a ground layer node of the scene",
                ),
            );
            continue;
        }
        let Some(text) = parts.text(file) else {
            continue;
        };
        let path = parts.path(file);
        let entries = grids.palette.len();
        if let Some(cells) = read_grid(
            GridFile {
                path: &path,
                text: &text,
            },
            size,
            |field| palette_cell(field, entries),
            parts.errors(),
        ) {
            grids.layers.insert(name.to_owned(), cells);
        }
    }
    grids
}

/// The holes of every module node, by the variable each names.
pub fn holes(nodes: &[SceneNode]) -> Vec<String> {
    let mut found = Vec::new();
    walk(nodes, &mut |_, node, _| {
        if let SceneNode::Module(module) = node {
            super::blueprint::holes(&module_json(module), &mut found);
        }
    });
    found
}

/// The path of a bundle's scene file.
pub fn scene_file(bundle: &str) -> String {
    format!("{bundle}/{SCENE_FILE}")
}

/// A label for a new node among `siblings`: `base`, or `base (1)`, `base (2)`, the next free number,
/// when a sibling has it already.
pub fn free_label(base: &str, siblings: &[SceneNode]) -> String {
    let taken = |label: &str| {
        siblings
            .iter()
            .filter_map(SceneNode::label)
            .any(|known| known.eq_ignore_ascii_case(label))
    };
    if !taken(base) {
        return base.to_owned();
    }
    (1..)
        .map(|n| format!("{base} ({n})"))
        .find(|label| !taken(label))
        .expect("a free number")
}
