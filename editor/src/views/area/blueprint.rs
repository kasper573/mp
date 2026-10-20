use engine::core::content::{CONFIG_FILE, Content, ContentFile, name_of, parent_of};
use engine::core::math::{Pos, Rect};
use engine::core::tiling::Tiles;
use engine::systems::area::AreaModuleKind;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::scene::scene_file;
use serde_json::{Value, json};

use super::grid::{GridDraft, blueprint_of};
use super::{AreaSnapshot, nodes, placement, shapes};
use crate::app::Editor;
use crate::moves::free_path;
use crate::project::ContentEdit;
use crate::rows;
use crate::tabs::file_title;
use crate::value::RowValue;

/// Makes a blueprint of the selection at once: a new bundle beside the one being edited holds the
/// selected nodes, or what a selected folder holds, and one placement of it takes their place. The
/// blueprint is named after the folder or node, and starts with the ground layers of the scene it
/// came from, so what it paints lands in layers of the same name.
pub fn make_blueprint_from_selection(editor: &mut Editor, frame: &AreaSnapshot) {
    let bundle = frame.bundle.clone();
    let scene = nodes::scene_of(editor, &bundle);
    let selected = selected_nodes(editor, &bundle, &scene);
    let Some(first) = selected.first().cloned() else {
        editor.toast("Select modules or a folder to make a blueprint of");
        return;
    };
    let node = |pointer: &str| scene.pointer(pointer).cloned().unwrap_or(Value::Null);
    let held: Vec<Value> = match selected.as_slice() {
        [only] if nodes::is_folder(&node(only)) => node(only)["children"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
        many => many.iter().map(|pointer| node(pointer)).collect(),
    };
    let label = match selected.as_slice() {
        [only] => node(only)["label"]
            .as_str()
            .map_or_else(|| shapes::label(&node(only)), str::to_owned),
        _ => "blueprint".to_owned(),
    };
    let Some(bounds) = covered(&frame.content, &held) else {
        editor.toast("The selection has no place on the map");
        return;
    };
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let name = Some(rows::name_from(&label))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "blueprint".to_owned());
    let path = free_path(
        &project.files,
        parent_of(&bundle),
        &format!("{name}.{}", BlueprintDef::TABLE),
        &[],
    );
    let origin: Pos<Tiles> = Pos::new(
        (bounds.min().x + 0.5).floor(),
        (bounds.min().y + 0.5).floor(),
    );
    let mut shifted = held;
    for node in &mut shifted {
        shift_tree(node, -origin.x, -origin.y);
    }
    let content = frame.content.clone();
    let tile = blueprint_of(&content, &bundle).map_or(16, |own| own.map.tile);
    let layers: Vec<Value> = GridDraft::own(&content, &bundle)
        .map(|draft| draft.layer_names())
        .unwrap_or_default()
        .into_iter()
        .map(|layer| json!({ "type": "ground_layer", "name": layer }))
        .collect();
    let blueprint_scene: Vec<Value> = layers.into_iter().chain(shifted).collect();
    let count = nodes::modules(&Value::Array(blueprint_scene.clone())).len();
    let config = json!({
        "map": {
            "size": {
                "width": (bounds.max().x - origin.x + 0.5).ceil().max(1.0) as u32,
                "height": (bounds.max().y - origin.y + 0.5).ceil().max(1.0) as u32,
            },
            "tile": tile,
        }
    });
    let placement = json!({
        "type": "blueprint",
        "label": label,
        "blueprint": path,
        "at": { "x": origin.x, "y": origin.y },
    });
    let mut changed = scene;
    let Some(slot) = changed.pointer_mut(&first) else {
        return;
    };
    *slot = placement;
    nodes::remove(&mut changed, &selected[1..]);
    let mut edit = ContentEdit::new(format!("Make blueprint {}", name_of(&path)));
    edit.write_json(format!("{path}/{CONFIG_FILE}"), &config);
    edit.write_json(scene_file(&path), &Value::Array(blueprint_scene));
    edit.write_json(scene_file(&bundle), &changed);
    if let Err(error) = editor.try_apply(edit) {
        editor.toast(error);
        return;
    }
    nodes::select(editor, &bundle, vec![first]);
    editor.toast(format!(
        "Made {} holding {count} module{}; Ctrl Z takes it back",
        file_title(&path),
        crate::ui::widgets::plural(count)
    ));
}

/// The nodes of `bundle` selected, ground layers aside, in tree order and without any held by
/// another selected folder.
fn selected_nodes(editor: &Editor, bundle: &str, scene: &Value) -> Vec<String> {
    let selected = super::selected_parts(editor, bundle);
    let mut found: Vec<String> = Vec::new();
    nodes::walk(scene, &mut |pointer, node| {
        let inside_found = found
            .iter()
            .any(|folder| pointer.starts_with(&format!("{folder}/")));
        if selected.contains(pointer) && !nodes::is_layer(node) && !inside_found {
            found.push(pointer.to_owned());
        }
    });
    found
}

/// What the modules among `nodes` cover on the map, through their folders, a placement by what
/// its blueprint holds.
pub(super) fn covered(content: &Content, nodes: &[Value]) -> Option<Rect<Tiles>> {
    nodes::modules(&Value::Array(nodes.to_vec()))
        .iter()
        .filter_map(|module| match module.json.module_kind() {
            Some(AreaModuleKind::Blueprint) => {
                placement::nested_bounds(content, module.json.text("blueprint"), &module.json)
            }
            _ => shapes::bounds(&module.json, None),
        })
        .reduce(|a, b| a.union(&b))
}

pub(super) fn shift_tree(node: &mut Value, dx: f32, dy: f32) {
    if nodes::is_folder(node) {
        for child in node["children"].as_array_mut().into_iter().flatten() {
            shift_tree(child, dx, dy);
        }
    } else if nodes::is_module(node) {
        shapes::shift(node, dx, dy);
    }
}

/// Where the modules of `modules` start on the map: the top-left of what they cover.
pub fn selection_origin(modules: &[Value]) -> Option<Pos<Tiles>> {
    modules
        .iter()
        .filter_map(|m| shapes::bounds(m, None))
        .reduce(|a, b| a.union(&b))
        .map(|r| r.min())
}
