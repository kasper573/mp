use engine::core::audio::playback::SfxDef;
use engine::core::babble::{BabbleBankDef, LETTERS};
use engine::core::content::{CONFIG_FILE, ContentFile, Shape, content_path};
use engine::core::vfx::VfxShaderDef;
use engine::systems::actor::model::ModelDef;
use engine::systems::area::AreaDef;
use engine::systems::area::scene::SCENE_FILE;
use engine::systems::area::tileset::TilesetDef;
use engine::systems::registry;
use include_dir::{Dir, include_dir};
use serde_json::json;

use crate::project::{FileBytes, json_bytes};
use crate::schema::{self, SchemaShapes};

static DEFAULTS: Dir = include_dir!("$CARGO_MANIFEST_DIR/defaults");

/// A content file about to be made, whole: its path and every file it is kept in.
pub struct MadeFile {
    pub path: String,
    pub files: Vec<(String, FileBytes)>,
}

/// A new content file of `table` named `name` in `folder`, holding the type's default fields and,
/// for a bundle, the parts it can't load without, blank: a clip of short silence, an empty image.
pub fn content_file(shapes: &SchemaShapes, table: &str, folder: &str, name: &str) -> MadeFile {
    let shape = registry().shape_of(table).unwrap_or(Shape::Json);
    let path = content_path(folder, name, table, shape);
    let fields = shapes
        .table(table)
        .map(|table| schema::template(&table.shape, &table.shape))
        .unwrap_or_else(|| json!({}));
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
        AreaDef::TABLE => vec![(
            SCENE_FILE.to_owned(),
            json_bytes(&json!([{ "type": "ground_layer", "name": "ground" }])),
        )],
        _ => Vec::new(),
    }
}

fn default(name: &str) -> FileBytes {
    let file = DEFAULTS
        .get_file(name)
        .unwrap_or_else(|| panic!("the editor ships defaults/{name}"));
    FileBytes::from(file.contents())
}
