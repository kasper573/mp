use std::collections::HashMap;

use egui::{ColorImage, TextureHandle, TextureOptions};

use crate::project::Files;

#[derive(Default)]
pub struct Thumbnails {
    textures: HashMap<String, Option<Thumb>>,
    generation: u64,
}

#[derive(Clone)]
pub struct Thumb {
    pub texture: TextureHandle,
    pub size: [usize; 2],
    pub hash: String,
}

impl Thumbnails {
    pub fn image(&mut self, ctx: &egui::Context, files: &Files, path: &str) -> Option<Thumb> {
        let file = format!("assets/{path}");
        let bytes = files.get(&file)?;
        let hash = crate::project::hash(bytes);
        if let Some(Some(thumb)) = self.textures.get(&file)
            && thumb.hash == hash
        {
            return Some(thumb.clone());
        }
        let decoded = decode(bytes).map(|image| {
            let size = image.size;
            Thumb {
                texture: ctx.load_texture(file.clone(), image, TextureOptions::NEAREST),
                size,
                hash,
            }
        });
        self.textures.insert(file, decoded.clone());
        decoded
    }

    pub fn forget(&mut self, path: &str) {
        self.textures.remove(&format!("assets/{path}"));
    }

    pub fn bump(&mut self) {
        self.generation += 1;
    }
}

pub fn decode(bytes: &[u8]) -> Option<ColorImage> {
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let size = [image.width() as usize, image.height() as usize];
    Some(ColorImage::from_rgba_unmultiplied(size, image.as_raw()))
}

pub fn uv(size: [usize; 2], x: f32, y: f32, w: f32, h: f32) -> egui::Rect {
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    egui::Rect::from_min_max(
        egui::pos2(x / sw, y / sh),
        egui::pos2((x + w) / sw, (y + h) / sh),
    )
}
