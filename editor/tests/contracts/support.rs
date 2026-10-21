use std::path::{Path, PathBuf};

use engine::core::math::Pos;
use engine::systems::area::AreaModule;
use engine::systems::area::object::{ObjectDef, ObjectShape};
use engine::systems::area::scene::{ModuleNode, SceneFolder, SceneNode};
use serde_json::json;
use testkit::{Game, Map};

/// The area every game of the editor's tests starts in.
pub const AREA: &str = "start";

/// The path of the area every game of the editor's tests starts in.
pub fn area() -> String {
    testkit::path("area", AREA)
}

/// A whole game of nothing but a field to start in and the rows the engine itself requires,
/// written to `folder`, which it returns.
pub fn game_folder(folder: PathBuf) -> PathBuf {
    game().write_to(&folder);
    folder
}

pub fn game() -> Game {
    Game::new()
        .area(AREA, &Map::open(8, 8), json!([]))
        .hero(AREA, 1.0, 1.0)
        .engine_rows()
        .whole()
}

pub fn game_name(folder: &Path) -> String {
    let text = std::fs::read_to_string(folder.join(engine::core::content::SETTINGS_FILE))
        .expect("the settings");
    let game: serde_json::Value = serde_json::from_str(&text).expect("json");
    game["name"].as_str().expect("a name").to_owned()
}

/// An object named `name` at a point of the map.
pub fn object(name: &str) -> SceneNode {
    SceneNode::Module(ModuleNode::new(AreaModule::Object(ObjectDef {
        name: Some(name.to_owned()),
        title: None,
        shape: ObjectShape::Point(Pos::new(1.5, 1.5)),
        look: None,
        shown: None,
        scripts: Vec::new(),
    })))
}

/// A folder labelled `label` holding `children`.
pub fn folder(label: &str, children: Vec<SceneNode>) -> SceneNode {
    SceneNode::Folder(SceneFolder {
        label: label.to_owned(),
        hidden: false,
        locked: false,
        children,
    })
}

/// What names each node of `nodes`, depth first: an object's name, a folder's label, a layer's
/// name.
pub fn names(nodes: &[SceneNode]) -> Vec<String> {
    let mut found = Vec::new();
    editor::views::area::nodes::walk(nodes, &mut |_, node| {
        let name = match node {
            SceneNode::Module(ModuleNode {
                module: AreaModule::Object(object),
                ..
            }) => object.name.clone(),
            SceneNode::GroundLayer(layer) => Some(layer.name.clone()),
            node => node.label().map(str::to_owned),
        };
        found.push(name.unwrap_or_default());
    });
    found
}
