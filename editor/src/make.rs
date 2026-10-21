use engine::core::audio::playback::SfxDef;
use engine::core::babble::{BabbleBankDef, LETTERS};
use engine::core::content::{CONFIG_FILE, ContentFile, Shape, content_path};
use engine::core::vfx::VfxShaderDef;
use engine::systems::actor::model::ModelDef;
use engine::systems::area::AreaDef;
use engine::systems::area::scene::{self, GroundLayer, SCENE_FILE, SceneNode};
use engine::systems::area::tileset::TilesetDef;
use engine::systems::registry;
use include_dir::{Dir, include_dir};
use serde_json::Value;

use crate::project::{FileBytes, ProjectFiles, json_bytes};
use crate::schema::{self, SchemaShapes};

static DEFAULTS: Dir = include_dir!("$CARGO_MANIFEST_DIR/defaults");

/// A content file about to be made, whole: its path and every file it is kept in.
pub struct MadeFile {
    pub path: String,
    pub files: Vec<(String, FileBytes)>,
}

/// A new content file of `table` named `name` in `folder`, holding the type's default fields and,
/// for a bundle, the parts it can't load without, blank: a clip of short silence, an empty image.
pub fn content_file(
    shapes: &SchemaShapes,
    files: &ProjectFiles,
    table: &str,
    folder: &str,
    name: &str,
) -> MadeFile {
    let shape = registry().shape_of(table).unwrap_or(Shape::Json);
    let path = content_path(folder, name, table, shape);
    let fields = shapes
        .table(table)
        .map(|table| {
            let nearby = schema::Nearby {
                files,
                from: Some(&path),
            };
            schema::template(&table.shape, &table.shape, nearby)
        })
        .unwrap_or_else(|| Value::Object(Default::default()));
    let files = match shape {
        Shape::Json => vec![(path.clone(), json_bytes(&fields))],
        Shape::Bundle => std::iter::once((CONFIG_FILE.to_owned(), json_bytes(&fields)))
            .chain(blank_parts(table))
            .map(|(part, bytes)| (format!("{path}/{part}"), bytes))
            .collect(),
    };
    MadeFile { path, files }
}

fn blank_parts(table: &str) -> Vec<(String, FileBytes)> {
    let silence = || default("silence.wav");
    match table {
        SfxDef::TABLE => vec![("clip.wav".to_owned(), silence())],
        BabbleBankDef::TABLE => LETTERS
            .chars()
            .map(|letter| (format!("letters/{letter}.wav"), silence()))
            .collect(),
        TilesetDef::TABLE => vec![("image.png".to_owned(), default("blank.png"))],
        ModelDef::TABLE => vec![("sprites.png".to_owned(), default("blank.png"))],
        VfxShaderDef::TABLE => vec![("shader.wgsl".to_owned(), default("shader.wgsl"))],
        AreaDef::TABLE => vec![(SCENE_FILE.to_owned(), json_bytes(&blank_scene()))],
        _ => Vec::new(),
    }
}

/// The scene of a new area: one ground layer to paint.
fn blank_scene() -> Value {
    let ground = SceneNode::GroundLayer(GroundLayer {
        name: "ground".to_owned(),
        hidden: false,
        locked: false,
    });
    scene::write_nodes(&[ground]).expect("a ground layer writes")
}

fn default(name: &str) -> FileBytes {
    let file = DEFAULTS
        .get_file(name)
        .unwrap_or_else(|| panic!("the editor ships defaults/{name}"));
    FileBytes::from(file.contents())
}
