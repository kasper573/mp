use std::collections::HashMap;

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

/// Where moved nodes land among what a folder holds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Landing {
    First,
    End,
    Before(String),
    After(String),
}

/// Where each node of a scene went in a change to it, by its pointer before and after.
pub type Remap = HashMap<String, String>;

/// Makes `change` to `scene` and answers where every node went, by pointer, so whatever names
/// nodes by their pointers can follow them.
pub fn restructure<R>(scene: &mut Value, change: impl FnOnce(&mut Value) -> R) -> (R, Remap) {
    const AT: &str = "\u{1}at";
    let mut tagged = Vec::new();
    walk(scene, &mut |pointer, _| tagged.push(pointer.to_owned()));
    for pointer in &tagged {
        if let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) {
            node.insert(AT.to_owned(), Value::String(pointer.clone()));
        }
    }
    let out = change(scene);
    let mut remap = Remap::new();
    let mut now = Vec::new();
    walk(scene, &mut |pointer, node| {
        if let Some(was) = node.get(AT).and_then(Value::as_str) {
            remap.insert(was.to_owned(), pointer.to_owned());
        }
        now.push(pointer.to_owned());
    });
    for pointer in now {
        if let Some(node) = scene.pointer_mut(&pointer).and_then(Value::as_object_mut) {
            node.shift_remove(AT);
        }
    }
    (out, remap)
}

/// Where `pointer` names a node after a change, following the nearest node above it that moved.
pub fn remapped(remap: &Remap, pointer: &str) -> Option<String> {
    if let Some(now) = remap.get(pointer) {
        return Some(now.clone());
    }
    let (folder, index) = place_of(pointer)?;
    let folder = remapped(remap, folder).filter(|_| !folder.is_empty())?;
    Some(format!("{folder}/children/{index}"))
}

/// Moves the nodes at `pointers` into `folder`, "" for the top level, landing as `at` says, in
/// tree order; a label a sibling there has already gets the next free number. Answers where they
/// landed, or `None` when the folder or the node it lands beside is among those moved.
pub fn move_nodes(
    scene: &mut Value,
    pointers: &[String],
    folder: &str,
    at: &Landing,
) -> Option<Vec<String>> {
    const MOVED: &str = "\u{1}moved";
    const TARGET: &str = "\u{1}target";
    const ANCHOR: &str = "\u{1}anchor";
    let inside = |pointer: &str, of: &str| pointer == of || pointer.starts_with(&format!("{of}/"));
    if pointers.iter().any(|moved| inside(folder, moved)) {
        return None;
    }
    let anchor = match at {
        Landing::Before(pointer) | Landing::After(pointer) => Some(pointer.as_str()),
        _ => None,
    };
    if anchor.is_some_and(|anchor| pointers.iter().any(|moved| moved == anchor)) {
        return None;
    }
    let mut marked = |pointer: &str, mark: &str| {
        if let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) {
            node.insert(mark.to_owned(), Value::Bool(true));
        }
    };
    if !folder.is_empty() {
        marked(folder, TARGET);
    }
    if let Some(anchor) = anchor {
        marked(anchor, ANCHOR);
    }
    let mut ordered: Vec<String> = pointers.to_vec();
    ordered.sort_by_key(|pointer| indices(pointer));
    ordered.dedup();
    ordered.retain(|pointer| {
        !pointers
            .iter()
            .any(|other| other != pointer && pointer.starts_with(&format!("{other}/")))
    });
    let taken = remove(scene, &ordered);
    let mut target = String::new();
    let mut anchor_at = None;
    let mut marks = Vec::new();
    walk(scene, &mut |pointer, node| {
        if node.get(TARGET).is_some() {
            target = pointer.to_owned();
            marks.push(pointer.to_owned());
        }
        if node.get(ANCHOR).is_some() {
            anchor_at = place_of(pointer).map(|(_, index)| index);
            marks.push(pointer.to_owned());
        }
    });
    for pointer in &marks {
        if let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) {
            node.shift_remove(TARGET);
            node.shift_remove(ANCHOR);
        }
    }
    let siblings = children_mut(scene, &target)?;
    let start = match (at, anchor_at) {
        (Landing::First, _) => 0,
        (Landing::Before(_), Some(index)) => index,
        (Landing::After(_), Some(index)) => index + 1,
        _ => siblings.len(),
    };
    for (index, mut node) in (start..).zip(taken) {
        if let Some(label) = node["label"].as_str() {
            node["label"] = Value::String(free_label(label, siblings));
        }
        if let Some(object) = node.as_object_mut() {
            object.insert(MOVED.to_owned(), Value::Bool(true));
        }
        siblings.insert(index, node);
    }
    let mut landed = Vec::new();
    walk(scene, &mut |pointer, node| {
        if node.get(MOVED).is_some() {
            landed.push(pointer.to_owned());
        }
    });
    for pointer in &landed {
        if let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) {
            node.shift_remove(MOVED);
        }
    }
    Some(landed)
}

/// Puts the nodes at `pointers` into a new folder labelled `label`, in the deepest folder holding
/// them all, where the first of them is. Answers the new folder's pointer.
pub fn group(scene: &mut Value, pointers: &[String], label: &str) -> Option<String> {
    let mut ordered: Vec<String> = pointers.to_vec();
    ordered.sort_by_key(|pointer| indices(pointer));
    let first = ordered.first()?.clone();
    let folder = holding_all(&ordered)?;
    let anchor = child_holding(&folder, &first)?;
    let (_, index) = place_of(&anchor)?;
    let siblings = children_mut(scene, &folder)?.clone();
    let made = serde_json::json!({
        "type": "folder",
        "label": free_label(label, &siblings),
        "children": [],
    });
    let (_, remap) = restructure(scene, |scene| {
        children_mut(scene, &folder)?.insert(index, made);
        Some(())
    });
    let moved: Vec<String> = ordered
        .iter()
        .filter_map(|pointer| remapped(&remap, pointer))
        .collect();
    let new_folder = match folder.as_str() {
        "" => format!("/{index}"),
        folder => format!("{}/children/{index}", remapped(&remap, folder)?),
    };
    let landed = move_nodes(scene, &moved, &new_folder, &Landing::End)?;
    landed
        .first()
        .and_then(|pointer| place_of(pointer).map(|(folder, _)| folder.to_owned()))
}

/// The deepest folder holding every node at `pointers`, "" for the top level.
fn holding_all(pointers: &[String]) -> Option<String> {
    let (mut folder, _) = place_of(pointers.first()?)?;
    while !pointers
        .iter()
        .all(|pointer| folder.is_empty() || pointer.starts_with(&format!("{folder}/")))
    {
        folder = place_of(folder)?.0;
    }
    Some(folder.to_owned())
}

/// The node directly in `folder` that is `pointer` or holds it.
fn child_holding(folder: &str, pointer: &str) -> Option<String> {
    let prefix = match folder {
        "" => "/".to_owned(),
        folder => format!("{folder}/children/"),
    };
    let rest = pointer.strip_prefix(&prefix)?;
    let index = rest.split('/').next()?;
    Some(format!("{prefix}{index}"))
}

/// Takes away the folders at `pointers`, what each held taking its place in order.
pub fn ungroup(scene: &mut Value, pointers: &[String]) {
    let mut ordered: Vec<String> = pointers
        .iter()
        .filter(|pointer| scene.pointer(pointer).is_some_and(is_folder))
        .cloned()
        .collect();
    ordered.sort_by_key(|pointer| std::cmp::Reverse(indices(pointer)));
    for pointer in ordered {
        let Some((folder, index)) = place_of(&pointer) else {
            continue;
        };
        let folder = folder.to_owned();
        let Some(siblings) = children_mut(scene, &folder) else {
            continue;
        };
        if index >= siblings.len() {
            continue;
        }
        let taken = siblings.remove(index);
        let held = taken["children"].as_array().cloned().unwrap_or_default();
        for (offset, mut node) in held.into_iter().enumerate() {
            if let Some(label) = node["label"].as_str() {
                node["label"] = Value::String(free_label(label, siblings));
            }
            siblings.insert(index + offset, node);
        }
    }
}

/// Moves each node at `pointers` one place up (`-1`) or down (`1`) among its siblings, keeping
/// them apart from each other's way.
pub fn reorder(scene: &mut Value, pointers: &[String], step: i32) {
    let mut ordered: Vec<String> = pointers.to_vec();
    ordered.sort_by_key(|pointer| indices(pointer));
    if step > 0 {
        ordered.reverse();
    }
    let mut taken: Vec<(String, usize)> = Vec::new();
    for pointer in ordered {
        let Some((folder, index)) = place_of(&pointer) else {
            continue;
        };
        let Some(siblings) = children_mut(scene, folder) else {
            continue;
        };
        let Some(to) = index.checked_add_signed(step as isize) else {
            continue;
        };
        let blocked = taken.iter().any(|(other, at)| other == folder && *at == to);
        if to >= siblings.len() || blocked {
            taken.push((folder.to_owned(), index));
            continue;
        }
        siblings.swap(index, to);
        taken.push((folder.to_owned(), to));
    }
}

/// How many folders hold the node at `pointer`.
pub fn depth(pointer: &str) -> usize {
    pointer.matches("/children/").count()
}

/// How deep the folders inside `node` go, 0 when it holds none.
pub fn folders_inside(node: &Value) -> usize {
    node["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|child| is_folder(child))
        .map(|child| 1 + folders_inside(child))
        .max()
        .unwrap_or(0)
}

/// Sets the flag `field` of every node at `pointers`, leaving it out of the file when off.
pub fn set_flag(scene: &mut Value, pointers: &[String], field: &str, on: bool) {
    for pointer in pointers {
        let Some(node) = scene.pointer_mut(pointer).and_then(Value::as_object_mut) else {
            continue;
        };
        if on {
            node.insert(field.to_owned(), Value::Bool(true));
        } else {
            node.shift_remove(field);
        }
    }
}

/// Clears the flag `field` on every node of `scene`; answers how many had it.
pub fn clear_flag(scene: &mut Value, field: &str) -> usize {
    let mut set = Vec::new();
    walk(scene, &mut |pointer, node| {
        if node[field].as_bool() == Some(true) {
            set.push(pointer.to_owned());
        }
    });
    set_flag(scene, &set, field, false);
    set.len()
}

fn indices(pointer: &str) -> Vec<usize> {
    pointer
        .split('/')
        .filter_map(|segment| segment.parse().ok())
        .collect()
}
