use engine::core::content::{ContentFile, name_of, numbered, table_of};
use engine::systems::area::AreaDef;
use engine::systems::area::scene::scene_file;
use serde_json::Value;

use crate::app::Editor;
use crate::project::{ContentEdit, RowSelection};

/// A module node of a scene: its JSON pointer in the scene file and its JSON as the file holds it,
/// its node's label and flags included.
#[derive(Clone, Debug)]
pub struct SceneModule {
    pub pointer: String,
    pub json: Value,
}

/// The scene graph of the area or blueprint bundle `bundle` as the editor holds it now: the array
/// of its top-level nodes, empty when it has none.
pub fn scene_of(editor: &Editor, bundle: &str) -> Value {
    editor
        .project
        .as_ref()
        .and_then(|project| project.files.json_owned(&scene_file(bundle)))
        .filter(Value::is_array)
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

/// Every module node of `scene` in tree order, through its folders.
pub fn modules(scene: &Value) -> Vec<SceneModule> {
    let mut found = Vec::new();
    walk(scene, &mut |pointer, node| {
        if is_module(node) {
            found.push(SceneModule {
                pointer: pointer.to_owned(),
                json: node.clone(),
            });
        }
    });
    found
}

/// Every node of `scene` in tree order with its pointer, folders before what they hold.
pub fn walk(scene: &Value, visit: &mut impl FnMut(&str, &Value)) {
    fn inner(nodes: &Value, prefix: &str, visit: &mut impl FnMut(&str, &Value)) {
        for (index, node) in nodes.as_array().into_iter().flatten().enumerate() {
            let pointer = format!("{prefix}/{index}");
            visit(&pointer, node);
            if is_folder(node) {
                inner(&node["children"], &format!("{pointer}/children"), visit);
            }
        }
    }
    inner(scene, "", visit);
}

pub fn is_folder(node: &Value) -> bool {
    node["type"] == "folder"
}

pub fn is_layer(node: &Value) -> bool {
    node["type"] == "ground_layer"
}

pub fn is_module(node: &Value) -> bool {
    !is_folder(node) && !is_layer(node)
}

/// The folder holding the node at `pointer`, `""` for the top level, and the node's index in it.
pub fn place_of(pointer: &str) -> Option<(&str, usize)> {
    let cut = pointer.rfind('/')?;
    let index = pointer[cut + 1..].parse().ok()?;
    let folder = pointer[..cut].strip_suffix("/children").unwrap_or("");
    Some((folder, index))
}

/// The nodes of `folder`, `""` for the top level, made when a folder holds none yet.
pub fn children_mut<'a>(scene: &'a mut Value, folder: &str) -> Option<&'a mut Vec<Value>> {
    if folder.is_empty() {
        return scene.as_array_mut();
    }
    let node = scene.pointer_mut(folder)?;
    if !is_folder(node) {
        return None;
    }
    node.as_object_mut()?
        .entry("children")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
}

/// Takes the nodes at `pointers` out of `scene`, in the order given; those missing are skipped.
pub fn remove(scene: &mut Value, pointers: &[String]) -> Vec<Value> {
    let mut order: Vec<usize> = (0..pointers.len()).collect();
    order.sort_by(|&a, &b| indices(&pointers[b]).cmp(&indices(&pointers[a])));
    let mut taken: Vec<Option<Value>> = vec![None; pointers.len()];
    for at in order {
        let Some((folder, index)) = place_of(&pointers[at]) else {
            continue;
        };
        let Some(nodes) = children_mut(scene, folder) else {
            continue;
        };
        if index < nodes.len() {
            taken[at] = Some(nodes.remove(index));
        }
    }
    taken.into_iter().flatten().collect()
}

/// Puts a copy of each node at `pointers` right after it, made by `copy` and labelled apart from
/// its siblings. Answers where the copies landed, in tree order.
pub fn duplicate(
    scene: &mut Value,
    pointers: &[String],
    mut copy: impl FnMut(&Value) -> Value,
) -> Vec<String> {
    const COPY: &str = "\u{1}copy";
    let mut order: Vec<&String> = pointers.iter().collect();
    order.sort_by_key(|pointer| std::cmp::Reverse(indices(pointer)));
    for pointer in order {
        let Some((folder, index)) = place_of(pointer) else {
            continue;
        };
        let Some(siblings) = children_mut(scene, folder) else {
            continue;
        };
        let Some(node) = siblings.get(index) else {
            continue;
        };
        let mut made = copy(node);
        if let Some(label) = node["label"].as_str() {
            made["label"] = Value::String(free_label(label, siblings));
        }
        made[COPY] = Value::Bool(true);
        siblings.insert(index + 1, made);
    }
    let mut made = Vec::new();
    walk(scene, &mut |pointer, node| {
        if node.get(COPY).is_some() {
            made.push(pointer.to_owned());
        }
    });
    for pointer in &made {
        if let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) {
            node.shift_remove(COPY);
        }
    }
    made
}

/// Adds `nodes` at the end of `folder`, answering where each landed.
pub fn append(scene: &mut Value, folder: &str, nodes: Vec<Value>) -> Vec<String> {
    let Some(list) = children_mut(scene, folder) else {
        return Vec::new();
    };
    let start = list.len();
    let count = nodes.len();
    list.extend(nodes);
    let prefix = match folder {
        "" => String::new(),
        folder => format!("{folder}/children"),
    };
    (start..start + count)
        .map(|index| format!("{prefix}/{index}"))
        .collect()
}

/// A label for a new node among `siblings`: `base`, or `base (1)`, `base (2)`, the next free
/// number, when a sibling has it already.
pub fn free_label(base: &str, siblings: &[Value]) -> String {
    let taken = |label: &str| {
        siblings
            .iter()
            .filter_map(|node| node["label"].as_str())
            .any(|known| known.eq_ignore_ascii_case(label))
    };
    let base = numbered(base).map_or(base, |(base, _)| base);
    if !taken(base) {
        return base.to_owned();
    }
    (1..)
        .map(|n| format!("{base} ({n})"))
        .find(|label| !taken(label))
        .expect("a free number")
}

/// Labels each placement among `nodes` that has none with its blueprint's name, numbered past
/// what `folder` of `scene` holds, as a new placement is labelled.
pub fn label_placements(scene: &Value, folder: &str, nodes: &mut [Value]) {
    let mut siblings: Vec<Value> = match folder {
        "" => scene.as_array().cloned().unwrap_or_default(),
        folder => scene
            .pointer(&format!("{folder}/children"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    };
    for node in nodes {
        if node["type"] != "blueprint" || node["label"].is_string() {
            continue;
        }
        let name = name_of(node["blueprint"].as_str().unwrap_or_default()).to_owned();
        node["label"] = Value::String(free_label(&name, &siblings));
        siblings.push(node.clone());
    }
}

/// Where new nodes of `bundle` go: the selected folder, or the folder holding the selected node,
/// and otherwise the top level.
pub fn insertion_folder(editor: &Editor, bundle: &str) -> String {
    let selection = &editor.selection;
    if selection.keys.first().map(String::as_str) != Some(bundle) || selection.parts.len() != 1 {
        return String::new();
    }
    let pointer = &selection.parts[0];
    let scene = scene_of(editor, bundle);
    match scene.pointer(pointer) {
        Some(node) if is_folder(node) => pointer.clone(),
        Some(_) => place_of(pointer).map_or_else(String::new, |(folder, _)| folder.to_owned()),
        None => String::new(),
    }
}

/// An edit of `bundle`'s scene: `change` changes it and names the step, or answers `None` to make
/// no step.
pub fn scene_edit(
    editor: &Editor,
    bundle: &str,
    change: impl FnOnce(&mut Value) -> Option<String>,
) -> Option<ContentEdit> {
    let mut scene = scene_of(editor, bundle);
    let label = change(&mut scene)?;
    let mut edit = ContentEdit::new(label);
    edit.write_json(scene_file(bundle), &scene);
    Some(edit)
}

pub fn change_scene(
    editor: &mut Editor,
    bundle: &str,
    change: impl FnOnce(&mut Value) -> Option<String>,
) -> bool {
    scene_edit(editor, bundle, change).is_some_and(|edit| editor.apply(edit))
}

/// Adds `new` to the insertion folder of `bundle` as one step, and selects what it added.
pub fn add(editor: &mut Editor, bundle: &str, new: Vec<Value>, label: &str) -> bool {
    let folder = insertion_folder(editor, bundle);
    let mut added = Vec::new();
    let applied = change_scene(editor, bundle, |scene| {
        let mut new = new;
        label_placements(scene, &folder, &mut new);
        added = append(scene, &folder, new);
        Some(label.to_owned())
    });
    if applied {
        select(editor, bundle, added);
    }
    applied
}

pub fn select(editor: &mut Editor, bundle: &str, pointers: Vec<String>) {
    editor.selection =
        RowSelection::parts(table_of(bundle).unwrap_or(AreaDef::TABLE), bundle, pointers);
}

/// The pointer in a bundle's config of the box an area or a blueprint is painted in.
pub fn map_pointer(bundle: &str) -> &'static str {
    match table_of(bundle) {
        Some(AreaDef::TABLE) => "/blueprint/map",
        _ => "/map",
    }
}

fn indices(pointer: &str) -> Vec<usize> {
    pointer
        .split('/')
        .filter_map(|segment| segment.parse().ok())
        .collect()
}
