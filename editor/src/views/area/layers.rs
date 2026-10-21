use std::collections::BTreeSet;

use engine::core::content::{ContentFile, numbered, table_of, valid_name};
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::scene::{GroundLayer, SCENE_FILE, SceneNode};

use super::grid::GridDraft;
use super::nodes;
use crate::app::Editor;
use crate::project::{ContentEdit, Project};
use crate::tabs::file_title;
use crate::ui::widgets;

/// Adds a ground layer at the end of `folder` of `bundle`'s scene, named apart from every layer
/// there, and selects it; answers its pointer.
pub fn add(editor: &mut Editor, bundle: &str, folder: &str) -> Option<String> {
    let name = free_name("layer", &names(&nodes::scene_of(editor, bundle)));
    let mut made = Vec::new();
    nodes::change_scene(editor, bundle, |scene| {
        let layer = SceneNode::GroundLayer(GroundLayer {
            name: name.clone(),
            hidden: false,
            locked: false,
        });
        made = nodes::SceneTree::new(scene).append(folder, vec![layer]);
        Some(format!("Add ground layer {name}"))
    });
    let pointer = made.first()?.clone();
    nodes::select(editor, bundle, vec![pointer.clone()]);
    Some(pointer)
}

/// Copies the layer at `pointer` right after it, its cells too, under a free name.
pub fn duplicate(editor: &mut Editor, bundle: &str, pointer: &str) {
    let mut made = Vec::new();
    let applied = nodes::change_blueprint(editor, bundle, |blueprint| {
        let scene = &mut blueprint.scene;
        let name = nodes::layer_name(nodes::node(&scene.nodes, pointer)?)?.to_owned();
        let fresh = free_name(&name, &names(&scene.nodes));
        made = nodes::SceneTree::new(&mut scene.nodes).duplicate(&[pointer.to_owned()], |node| {
            let mut copy = node.clone();
            if let SceneNode::GroundLayer(layer) = &mut copy {
                layer.name = fresh.clone();
            }
            copy
        });
        if let Some(cells) = scene.grids.layers.get(&name).cloned() {
            scene.grids.layers.insert(fresh.clone(), cells);
        }
        Some(format!("Duplicate ground layer {name} as {fresh}"))
    });
    if applied {
        nodes::select(editor, bundle, made);
    }
}

/// Clears every forced walk cell of `bundle` in one step, handing each back to its tiles.
pub fn clear_forced(editor: &mut Editor, bundle: &str) {
    let Some(mut draft) = GridDraft::own(editor, bundle) else {
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
    nodes::change_blueprint(editor, bundle, |blueprint| {
        draft.apply_to(blueprint);
        Some(format!(
            "Clear {cleared} forced walk cells in {}",
            file_title(bundle)
        ))
    });
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
        let Some(read) = nodes::bundle_in(project, other) else {
            continue;
        };
        read.write(&mut edit, project, other, |blueprint| {
            rename_in(blueprint, old, new)
        })?;
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

/// Takes the layer named `name` out of `blueprint`'s scene: its node and its cells.
pub fn delete_in(blueprint: &mut BlueprintDef, name: &str) {
    let mut found = Vec::new();
    nodes::walk(&blueprint.scene.nodes, &mut |pointer, node| {
        if nodes::layer_name(node) == Some(name) {
            found.push(pointer.to_owned());
        }
    });
    nodes::SceneTree::new(&mut blueprint.scene.nodes).remove(&found);
    blueprint.scene.grids.layers.remove(name);
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
        let Some(read) = nodes::bundle_in(project, &at) else {
            continue;
        };
        let reader = project.reader();
        for module in nodes::modules(read.nodes()) {
            if let engine::systems::area::AreaModule::Blueprint(placement) = module.module()
                && let Some(blueprint) = reader.path_of(placement.blueprint)
                && seen.insert(blueprint.to_owned())
            {
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

fn scene(project: &Project, bundle: &str) -> Vec<SceneNode> {
    nodes::bundle_in(project, bundle).map_or_else(Vec::new, |read| read.nodes().to_vec())
}

/// The names of the ground layers of `scene`, in tree order.
pub fn names(scene: &[SceneNode]) -> Vec<String> {
    engine::systems::area::scene::layers(scene)
        .into_iter()
        .map(|layer| layer.name.clone())
        .collect()
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

/// How many cells a layer of `draft` holds.
pub fn cell_count(draft: &GridDraft, name: &str) -> usize {
    draft.layer_index(name).map_or(0, |layer| {
        draft.ground[layer].cells.iter().flatten().count()
    })
}

pub fn cells_said(count: usize) -> String {
    format!("{count} cell{}", widgets::plural(count))
}

fn rename_in(blueprint: &mut BlueprintDef, old: &str, new: &str) {
    let mut found = Vec::new();
    nodes::walk(&blueprint.scene.nodes, &mut |pointer, node| {
        if nodes::layer_name(node) == Some(old) {
            found.push(pointer.to_owned());
        }
    });
    for pointer in found {
        if let Some(SceneNode::GroundLayer(layer)) =
            nodes::node_mut(&mut blueprint.scene.nodes, &pointer)
        {
            layer.name = new.to_owned();
        }
    }
    if let Some(cells) = blueprint.scene.grids.layers.remove(old) {
        blueprint.scene.grids.layers.insert(new.to_owned(), cells);
    }
}
