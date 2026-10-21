use engine::core::audio::playback::SFX_CLIP;
use engine::core::content::PartSpec;
use engine::core::vfx::shader::SHADER_SOURCE;
use engine::systems::actor::model::{MODEL_BUSTS, MODEL_SPRITES};
use engine::systems::area::tileset::TILESET_IMAGE;

use crate::project::ProjectFiles;

/// The image a tileset bundle keeps its tiles in.
pub fn tileset_image(tileset: &str) -> String {
    format!("{tileset}/{}", TILESET_IMAGE.named("", "png"))
}

/// The sprite sheet a model bundle keeps.
pub fn model_sprites(model: &str) -> String {
    format!("{model}/{}", MODEL_SPRITES.named("", "png"))
}

/// The bust a model bundle keeps for `expression`.
pub fn model_bust(model: &str, expression: &str) -> String {
    format!("{model}/{}", bust_part(expression))
}

/// Where in a model bundle its bust for `expression` is.
pub fn bust_part(expression: &str) -> String {
    MODEL_BUSTS.named(expression, "png")
}

/// The name of every bust a model bundle keeps, generic expressions and its own alike.
pub fn model_bust_names(files: &ProjectFiles, model: &str) -> Vec<String> {
    let PartSpec::Keyed { folder, exts } = MODEL_BUSTS else {
        return Vec::new();
    };
    let prefix = format!("{model}/{folder}/");
    files
        .paths_under(&prefix)
        .filter_map(|path| {
            let (name, ext) = path.strip_prefix(&prefix)?.rsplit_once('.')?;
            (exts.contains(&ext) && !name.contains('/')).then(|| name.to_owned())
        })
        .collect()
}

/// The WGSL source a shader bundle keeps.
pub fn shader_source(shader: &str) -> String {
    format!("{shader}/{}", SHADER_SOURCE.named("", "wgsl"))
}

/// The clip an sfx bundle keeps, in whichever of its formats it is.
pub fn sfx_clip(files: &ProjectFiles, sfx: &str) -> Option<String> {
    let PartSpec::File { exts, .. } = SFX_CLIP else {
        return None;
    };
    exts.iter()
        .map(|ext| format!("{sfx}/{}", SFX_CLIP.named("", ext)))
        .find(|clip| files.contains(clip))
}
