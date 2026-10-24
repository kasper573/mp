use engine::systems::area::tileset::TILESET_IMAGE;

/// The image a tileset bundle keeps its tiles in.
pub fn tileset_image(tileset: &str) -> String {
    format!("{tileset}/{}", TILESET_IMAGE.named("", "png"))
}
