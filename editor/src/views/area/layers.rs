use std::collections::BTreeSet;

use engine::core::content::{ContentFile, numbered, table_of, valid_name};
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::scene::{SCENE_FILE, scene_file};
use serde_json::Value;

use super::grid::{GridDraft, layer_file};
use super::nodes;
use crate::app::Editor;
use crate::project::{ContentEdit, Project};
use crate::tabs::file_title;
use crate::ui::widgets;
use crate::value::RowValue;

/// Adds a ground layer at the end of `folder` of `bundle`'s scene, named apart from every layer
/// there, and selects it; answers its pointer.
pub fn add(editor: &mut Editor, bundle: &str, folder: &str) -> Option<String> {
    let scene = nodes::scene_of(editor, bundle);
    let name = free_name("layer", &names(&scene));
    let mut made = Vec::new();
    nodes::change_scene(editor, bundle, |scene| {
        made = nodes::append(
            scene,
            folder,
            vec![serde_json::json!({ "type": "ground_layer", "name": name })],
        );
        Some(format!("Add ground layer {name}"))
    });
    let pointer = made.first()?.clone();
    nodes::select(editor, bundle, vec![pointer.clone()]);
    Some(pointer)
}

/// Copies the layer at `pointer` right after it, its cells too, under a free name.
pub fn duplicate(editor: &mut Editor, bundle: &str, pointer: &str) {
    let mut scene = nodes::scene_of(editor, bundle);
    let Some(name) = scene
        .pointer(pointer)
        .and_then(|node| node["name"].as_str())
        .map(str::to_owned)
    else {
        return;
    };
    let fresh = free_name(&name, &names(&scene));
    let made = nodes::duplicate(&mut scene, &[pointer.to_owned()], |node| {
        let mut copy = node.clone();
        copy["name"] = Value::String(fresh.clone());
        copy
    });
    let mut edit = ContentEdit::new(format!("Duplicate ground layer {name} as {fresh}"));
    edit.write_json(scene_file(bundle), &scene);
    if let Some(bytes) = editor
        .project
        .as_ref()
        .and_then(|project| project.files.get(&layer_file(bundle, &name)).cloned())
    {
        edit.write(layer_file(bundle, &fresh), bytes);
    }
    if editor.apply(edit) {
        nodes::select(editor, bundle, made);
    }
}

/// Clears every forced walk cell of `bundle` in one step, handing each back to its tiles.
pub fn clear_forced(editor: &mut Editor, bundle: &str) {
    let Some(content) = editor.project.as_ref().and_then(|p| p.content.clone()) else {
        return;
    };
    let Some(mut draft) = GridDraft::own(&content, bundle) else {
        return;
    };
    let cells: Vec<_> = draft.cells().collect();
    let mut cleared = 0;
    for cell in cells {
        cleared += usize::from(draft.set_walk(cell, None));
    }
    if cleared == 0 {
        editor.toast("No walk cell is forced");
        return;
    }
    let mut edit = ContentEdit::new(format!(
        "Clear {cleared} forced walk cells in {}",
        file_title(bundle)
    ));
    draft.write_into(&mut edit);
    editor.apply(edit);
}

/// Renames the layer `old` of `bundle` to `new`, and in every area and blueprint joined to it
/// through placements, in both directions and at any depth, since placed cells land in the layer of
/// the same name: as one step.
pub fn rename(editor: &mut Editor, bundle: &str, old: &str, new: &str) -> Result<(), String> {
    if !valid_name(new) {
        return Err(format!(
            "{new} can't name a layer: lowercase letters, digits, _ and - only"
        ));
    }
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let joined = joined(project, bundle, old);
    if let Some(clash) = joined
        .iter()
        .find(|other| names(&scene(project, other)).contains(&new.to_owned()))
    {
        return Err(format!(
            "{} already has a layer named {new}",
            file_title(clash)
        ));
    }
    let mut edit = ContentEdit::new(format!("Rename ground layer {old} to {new}"));
    for other in &joined {
        let mut scene = scene(project, other);
        let mut renamed = false;
        nodes::walk(&scene.clone(), &mut |pointer, node| {
            if nodes::is_layer(node)
                && node["name"] == old
                && let Some(node) = scene.pointer_mut(pointer)
            {
                node["name"] = Value::String(new.to_owned());
                renamed = true;
            }
        });
        if !renamed {
            continue;
        }
        edit.write_json(scene_file(other), &scene);
        if let Some(bytes) = project.files.get(&layer_file(other, old)).cloned() {
            edit.remove(layer_file(other, old));
            edit.write(layer_file(other, new), bytes);
        }
    }
    let others: Vec<String> = joined
        .iter()
        .filter(|other| *other != bundle)
        .map(|other| file_title(other).to_owned())
        .collect();
    editor.try_apply(edit)?;
    let said = match others.as_slice() {
        [] => format!("Renamed the layer {old} to {new}"),
        others => format!(
            "Renamed the layer {old} to {new} in {} and in {}, which paint{} into it; Ctrl Z undoes {}",
            file_title(bundle),
            others.join(", "),
            if others.len() == 1 { "s" } else { "" },
            if others.len() == 1 { "both" } else { "all" },
        ),
    };
    editor.toast(said);
    Ok(())
}

/// How many bundles a rename of the layer `name` of `bundle` would reach besides it.
pub fn joined_count(project: &Project, bundle: &str, name: &str) -> usize {
    joined(project, bundle, name).len().saturating_sub(1)
}

/// `bundle` and every area or blueprint with a layer named `name` joined to it through placements:
/// what one places at any depth, and what places it at any depth.
fn joined(project: &Project, bundle: &str, name: &str) -> BTreeSet<String> {
    let has = |bundle: &str| {
        names(&scene(project, bundle))
            .iter()
            .any(|layer| layer == name)
    };
    let mut found: BTreeSet<String> = BTreeSet::from([bundle.to_owned()]);
    let mut queue = vec![bundle.to_owned()];
    while let Some(at) = queue.pop() {
        let reached = placed_by(project, &at)
            .into_iter()
            .chain(placing(project, &at));
        for other in reached {
            if has(&other) && found.insert(other.clone()) {
                queue.push(other);
            }
        }
    }
    found
}

/// Every blueprint `bundle` places, at any depth.
fn placed_by(project: &Project, bundle: &str) -> BTreeSet<String> {
    let mut seen = BTreeSet::new();
    let mut queue = vec![bundle.to_owned()];
    while let Some(at) = queue.pop() {
        for module in nodes::modules(&scene(project, &at)) {
            let blueprint = module.json.text("blueprint");
            if module.json["type"] == "blueprint" && seen.insert(blueprint.to_owned()) {
                queue.push(blueprint.to_owned());
            }
        }
    }
    seen
}

/// Every area and blueprint that places `bundle`, at any depth.
fn placing(project: &Project, bundle: &str) -> BTreeSet<String> {
    let mut seen = BTreeSet::new();
    let mut queue = vec![bundle.to_owned()];
    while let Some(at) = queue.pop() {
        for usage in project.usages.of_content(&at) {
            let Some(owner) = usage.file.strip_suffix(&format!("/{SCENE_FILE}")) else {
                continue;
            };
            let bundle = matches!(table_of(owner), Some(AreaDef::TABLE | BlueprintDef::TABLE));
            if bundle && seen.insert(owner.to_owned()) {
                queue.push(owner.to_owned());
            }
        }
    }
    seen
}

fn scene(project: &Project, bundle: &str) -> Value {
    project
        .files
        .json_owned(&scene_file(bundle))
        .filter(Value::is_array)
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

/// The names of the ground layers of `scene`, in tree order.
pub fn names(scene: &Value) -> Vec<String> {
    let mut found = Vec::new();
    nodes::walk(scene, &mut |_, node| {
        if nodes::is_layer(node) {
            found.push(node["name"].as_str().unwrap_or_default().to_owned());
        }
    });
    found
}

/// `base`, or `base (1)`, `base (2)`, the next free number, among `taken`.
fn free_name(base: &str, taken: &[String]) -> String {
    let base = numbered(base).map_or(base, |(base, _)| base);
    if !taken.iter().any(|name| name == base) {
        return base.to_owned();
    }
    (1..)
        .map(|n| format!("{base} ({n})"))
        .find(|name| !taken.contains(name))
        .expect("a free number")
}

/// What deleting the layer named `name` of `bundle` takes: its node and its grid, as one step.
pub fn delete_into(edit: &mut ContentEdit, bundle: &str, name: &str) {
    edit.remove(layer_file(bundle, name));
}

/// How many cells a layer of `draft` holds.
pub fn cell_count(draft: &GridDraft, name: &str) -> usize {
    draft.layer_index(name).map_or(0, |layer| {
        draft.ground[layer].cells.iter().flatten().count()
    })
}

pub fn cells_said(count: usize) -> String {
    format!("{count} cell{}", widgets::plural(count))
}
