use std::collections::BTreeMap;
use std::io;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::blueprint::{self, BlueprintDef};
use super::grid::{
    GridFile, PaletteRow, palette_cell, read_grid, read_palette, walk_cell, write_grid_cells,
    write_palette, write_walk,
};
use super::{AreaModule, AreaModuleKind, MAX_GROUND_LAYERS, Tilemap};
use crate::core::content::load::{JsonPart, ParseError, parse_value, shape_problem};
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

/// One node of a scene graph. Folders only organize and ground layers name the grids their cells
/// are painted in; every other node is a module.
#[derive(Clone)]
pub enum SceneNode {
    Folder(SceneFolder),
    GroundLayer(GroundLayer),
    Module(ModuleNode),
}

#[derive(Clone)]
pub struct SceneFolder {
    pub label: String,
    pub hidden: bool,
    pub locked: bool,
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

/// A module of a scene, with the label and flags the editor keeps for its node; the game never
/// reads them.
#[derive(Clone)]
pub struct ModuleNode {
    pub label: Option<String>,
    pub hidden: bool,
    pub locked: bool,
    pub module: AreaModule,
    pub holes: Holes,
}

/// The holes a blueprint leaves in a module for each placement to fill, by their JSON pointer in
/// the module, each with the name of the variable that fills it. The module holds a stand-in of
/// the variable's type at each: its default, or any value of the type.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Holes(pub BTreeMap<String, String>);

impl SceneNode {
    pub fn label(&self) -> Option<&str> {
        match self {
            SceneNode::Folder(folder) => Some(&folder.label),
            SceneNode::GroundLayer(_) => None,
            SceneNode::Module(node) => node.label.as_deref(),
        }
    }

    pub fn hidden(&self) -> bool {
        match self {
            SceneNode::Folder(folder) => folder.hidden,
            SceneNode::GroundLayer(layer) => layer.hidden,
            SceneNode::Module(node) => node.hidden,
        }
    }

    pub fn locked(&self) -> bool {
        match self {
            SceneNode::Folder(folder) => folder.locked,
            SceneNode::GroundLayer(layer) => layer.locked,
            SceneNode::Module(node) => node.locked,
        }
    }
}

impl ModuleNode {
    pub fn new(module: AreaModule) -> ModuleNode {
        ModuleNode {
            label: None,
            hidden: false,
            locked: false,
            module,
            holes: Holes::default(),
        }
    }
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
#[derive(Clone, Default)]
pub struct Scene {
    pub nodes: Vec<SceneNode>,
    pub grids: SceneGrids,
}

/// The grids of a bundle as written: its palette's rows, its forced walk cells and the cells of
/// each ground layer by name, one per cell of the map, empty where nothing is painted. Only the
/// layers the scene's nodes name are written.
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
    let mut read = None;
    parts.json::<Vec<NodeFile>>(file, |files| read = Some(nodes_of(files, "", variables)));
    let Some(Read { nodes, problems }) = read else {
        return;
    };
    let read_whole = problems.is_empty();
    for (pointer, problem) in problems {
        parts.json_error(SCENE_FILE, &pointer, problem);
    }
    if !read_whole {
        return;
    }
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
    let files = files_of(&scene.nodes).map_err(io::Error::other)?;
    writer.json(&format!("{bundle}/{SCENE_FILE}"), &files)?;
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
    for layer in layers(&scene.nodes) {
        let Some(cells) = grids.layers.get(&layer.name) else {
            continue;
        };
        if cells.iter().any(Option::is_some) {
            writer.file(
                &format!("{bundle}/{LAYERS_FOLDER}/{}.csv", layer.name),
                write_grid_cells(size, cells).as_bytes(),
            )?;
        }
    }
    Ok(())
}

/// `nodes` as a scene file holds them, in the scope being written in: how nodes travel apart from
/// their bundle, copied to be pasted elsewhere.
pub fn write_nodes(nodes: &[SceneNode]) -> Result<Value, serde_json::Error> {
    serde_json::to_value(files_of(nodes)?)
}

/// The nodes `json` holds as a scene file does, read as a blueprint declaring `variables` reads
/// its own, in the scope being read in; each problem at its pointer.
pub fn read_nodes(
    json: &Value,
    variables: &BTreeMap<String, Variable<RiftScripting>>,
) -> Result<Vec<SceneNode>, Vec<(String, ContentProblem)>> {
    let files = parse_value::<Vec<NodeFile>>(json)
        .map_err(|error| vec![(error.pointer.clone(), shape_problem(&error))])?;
    let read = nodes_of(&files, "", variables);
    match read.problems.is_empty() {
        true => Ok(read.nodes),
        false => Err(read.problems),
    }
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
    let files = parse_value::<Vec<NodeFile>>(value)?;
    let variables = content
        .by_path::<BlueprintDef>(bundle)
        .map(|blueprint| blueprint.get(content).variables.clone())
        .unwrap_or_default();
    nodes_of(&files, "", &variables);
    Ok(())
}

/// A scene's nodes as its file holds them, read.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum NodeFile {
    Folder(FolderFile<NodeFile>),
    GroundLayer(GroundLayer),
    #[serde(untagged)]
    Module(ModuleFile),
}

/// A scene's nodes as its file holds them, written: a module's kind first, then its node's label
/// and flags, then its own fields.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum NodeOut {
    Folder(FolderFile<NodeOut>),
    GroundLayer(GroundLayer),
    #[serde(untagged)]
    Module(ModuleOut),
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct FolderFile<Node> {
    label: String,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    hidden: bool,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    locked: bool,
    #[serde(default = "Vec::new", skip_serializing_if = "Vec::is_empty")]
    children: Vec<Node>,
}

#[derive(Serialize)]
struct ModuleOut {
    #[serde(rename = "type")]
    kind: AreaModuleKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    #[serde(skip_serializing_if = "serial::is_false")]
    hidden: bool,
    #[serde(skip_serializing_if = "serial::is_false")]
    locked: bool,
    #[serde(flatten)]
    fields: serde_json::Map<String, Value>,
}

#[derive(Serialize, Deserialize)]
struct ModuleFile {
    #[serde(flatten)]
    module: serde_json::Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label: Option<NonEmpty>,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    hidden: bool,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    locked: bool,
}

/// A label of text that isn't empty.
#[derive(Clone, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
struct NonEmpty(String);

impl TryFrom<String> for NonEmpty {
    type Error = &'static str;

    fn try_from(text: String) -> Result<NonEmpty, &'static str> {
        match text.is_empty() {
            true => Err("an empty label"),
            false => Ok(NonEmpty(text)),
        }
    }
}

impl From<NonEmpty> for String {
    fn from(label: NonEmpty) -> String {
        label.0
    }
}

/// What a node that isn't a module says it is, read apart so a folder or a layer node that fails
/// to read as one is reported as what it says it is rather than as an unknown module.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum StructureFile {
    Folder(FolderFile<NodeFile>),
    GroundLayer(GroundLayer),
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum StructureKind {
    Folder,
    GroundLayer,
}

#[derive(Deserialize)]
struct StructureTag {
    #[serde(rename = "type")]
    _kind: StructureKind,
}

struct Read {
    nodes: Vec<SceneNode>,
    problems: Vec<(String, ContentProblem)>,
}

/// The nodes `files` hold, read in the scope being read in, so the content their modules name
/// counts as the bundle's references.
fn nodes_of(
    files: &[NodeFile],
    prefix: &str,
    variables: &BTreeMap<String, Variable<RiftScripting>>,
) -> Read {
    let mut read = Read {
        nodes: Vec::new(),
        problems: Vec::new(),
    };
    for (index, file) in files.iter().enumerate() {
        read_node(file, &format!("{prefix}/{index}"), variables, &mut read);
    }
    read
}

fn read_node(
    file: &NodeFile,
    pointer: &str,
    variables: &BTreeMap<String, Variable<RiftScripting>>,
    read: &mut Read,
) {
    match file {
        NodeFile::Folder(folder) => {
            let inner = nodes_of(&folder.children, &format!("{pointer}/children"), variables);
            read.problems.extend(inner.problems);
            read.nodes.push(SceneNode::Folder(SceneFolder {
                label: folder.label.clone(),
                hidden: folder.hidden,
                locked: folder.locked,
                children: inner.nodes,
            }));
        }
        NodeFile::GroundLayer(layer) => read.nodes.push(SceneNode::GroundLayer(layer.clone())),
        NodeFile::Module(file) => {
            let json = Value::Object(file.module.clone());
            if parse_value::<StructureTag>(&json).is_ok() {
                let mut whole = json;
                if let Value::Object(map) = &mut whole {
                    map.extend(module_file_fields(file));
                }
                match parse_value::<StructureFile>(&whole) {
                    Ok(StructureFile::Folder(folder)) => {
                        read_node(&NodeFile::Folder(folder), pointer, variables, read)
                    }
                    Ok(StructureFile::GroundLayer(layer)) => {
                        read.nodes.push(SceneNode::GroundLayer(layer))
                    }
                    Err(error) => read
                        .problems
                        .push((format!("{pointer}{}", error.pointer), shape_problem(&error))),
                }
                return;
            }
            match blueprint::read_module(json, variables) {
                Ok((module, holes)) => read.nodes.push(SceneNode::Module(ModuleNode {
                    label: file.label.as_ref().map(|label| label.0.clone()),
                    hidden: file.hidden,
                    locked: file.locked,
                    module,
                    holes,
                })),
                Err((at, problem)) => read.problems.push((format!("{pointer}{at}"), problem)),
            }
        }
    }
}

/// The node fields of a module file, as the node writes them.
fn module_file_fields(file: &ModuleFile) -> serde_json::Map<String, Value> {
    let fields = ModuleFile {
        module: serde_json::Map::new(),
        label: file.label.as_ref().map(|label| NonEmpty(label.0.clone())),
        hidden: file.hidden,
        locked: file.locked,
    };
    match serde_json::to_value(fields) {
        Ok(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    }
}

/// The files `nodes` are written as, in the scope being written in.
fn files_of(nodes: &[SceneNode]) -> Result<Vec<NodeOut>, serde_json::Error> {
    nodes
        .iter()
        .map(|node| {
            Ok(match node {
                SceneNode::Folder(folder) => NodeOut::Folder(FolderFile {
                    label: folder.label.clone(),
                    hidden: folder.hidden,
                    locked: folder.locked,
                    children: files_of(&folder.children)?,
                }),
                SceneNode::GroundLayer(layer) => NodeOut::GroundLayer(layer.clone()),
                SceneNode::Module(node) => NodeOut::Module(ModuleOut {
                    kind: node.module.kind(),
                    label: node.label.clone(),
                    hidden: node.hidden,
                    locked: node.locked,
                    fields: blueprint::write_module(&node.module, &node.holes)?,
                }),
            })
        })
        .collect()
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
            SceneNode::Module(node)
                if matches!(node.module, AreaModule::Blueprint(_)) && node.label.is_none() =>
            {
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
            SceneNode::Module(_) | SceneNode::Folder(_) => {}
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

/// The variables the holes of every module node name.
pub fn holes(nodes: &[SceneNode]) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    walk(nodes, &mut |_, node, _| {
        if let SceneNode::Module(node) = node {
            for name in blueprint::variables_of(&node.holes) {
                if !found.iter().any(|known| known == name) {
                    found.push(name.to_owned());
                }
            }
        }
    });
    found
}

/// The path of a bundle's scene file.
pub fn scene_file(bundle: &str) -> String {
    format!("{bundle}/{SCENE_FILE}")
}
