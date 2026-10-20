use engine::systems::area::scene::{SceneNode, module_json, scene_file, walk};
use serde_json::Value;

use crate::project::ProjectFiles;

/// The scene graph of the area or blueprint bundle at `bundle`, as its files hold it now; empty
/// when it has none or it doesn't read.
pub fn nodes_of(files: &ProjectFiles, bundle: &str) -> Vec<SceneNode> {
    files
        .json(&scene_file(bundle))
        .and_then(|scene| serde_json::from_value((*scene).clone()).ok())
        .unwrap_or_default()
}

/// Every module of a scene graph in tree order, by its JSON pointer in the scene file, without
/// its node's label and flags.
pub fn modules_of(files: &ProjectFiles, bundle: &str) -> Vec<(String, Value)> {
    scene_modules(&nodes_of(files, bundle))
}

/// Every module of `nodes` in tree order, by its JSON pointer in the scene, without its node's
/// label and flags.
pub fn scene_modules(nodes: &[SceneNode]) -> Vec<(String, Value)> {
    let mut modules = Vec::new();
    walk(nodes, &mut |pointer, node, _| {
        if let SceneNode::Module(module) = node {
            modules.push((pointer.to_owned(), module_json(module)));
        }
    });
    modules
}

/// The pointer of the module a pointer into a file is within: an entry of a `modules` list, or a
/// node of a scene graph.
pub fn module_pointer(pointer: &str) -> Option<String> {
    if let Some(rest) = pointer.strip_prefix("/modules/") {
        let index = rest.split('/').next()?;
        index.parse::<usize>().ok()?;
        return Some(format!("/modules/{index}"));
    }
    let node = node_pointer(pointer);
    (!node.is_empty()).then_some(node)
}

/// The pointer of the scene node a pointer into a scene graph is within, through its folders.
pub fn node_pointer(pointer: &str) -> String {
    let segments: Vec<&str> = pointer.split('/').skip(1).collect();
    let mut node = String::new();
    let mut at = 0;
    while let Some(index) = segments.get(at).filter(|s| s.parse::<usize>().is_ok()) {
        node.push('/');
        node.push_str(index);
        if segments.get(at + 1) != Some(&"children")
            || segments
                .get(at + 2)
                .is_none_or(|s| s.parse::<usize>().is_err())
        {
            break;
        }
        node.push_str("/children");
        at += 2;
    }
    node
}
