use std::collections::HashMap;

use egui::{ColorImage, TextureHandle, TextureOptions};

use crate::project::ProjectFiles;

#[derive(Default)]
pub struct Thumbnails {
    textures: HashMap<String, Option<Thumbnail>>,
}

#[derive(Clone)]
pub struct Thumbnail {
    pub texture: TextureHandle,
    pub size: [usize; 2],
    pub hash: String,
}

impl Thumbnails {
    pub fn image(
        &mut self,
        ctx: &egui::Context,
        files: &ProjectFiles,
        path: &str,
    ) -> Option<Thumbnail> {
        let mut unlimited = u32::MAX;
        self.image_within(ctx, files, path, &mut unlimited)
    }

    pub fn image_within(
        &mut self,
        ctx: &egui::Context,
        files: &ProjectFiles,
        path: &str,
        budget: &mut u32,
    ) -> Option<Thumbnail> {
        let file = format!("assets/{path}");
        let bytes = files.get(&file)?;
        let hash = files.hash_of(&file)?.to_owned();
        if let Some(Some(thumb)) = self.textures.get(&file)
            && thumb.hash == hash
        {
            return Some(thumb.clone());
        }
        if *budget == 0 {
            ctx.request_repaint();
            return None;
        }
        *budget -= 1;
        let decoded = decode(bytes).map(|image| {
            let size = image.size;
            Thumbnail {
                texture: ctx.load_texture(file.clone(), image, TextureOptions::NEAREST),
                size,
                hash,
            }
        });
        self.textures.insert(file, decoded.clone());
        decoded
    }

    pub fn icon(
        &mut self,
        ctx: &egui::Context,
        files: &ProjectFiles,
        path: &str,
        budget: &mut u32,
    ) -> Option<Thumbnail> {
        let file = format!("assets/{path}");
        let key = format!("icon:{file}");
        let hash = files.hash_of(&file)?.to_owned();
        if let Some(Some(thumb)) = self.textures.get(&key)
            && thumb.hash == hash
        {
            return Some(thumb.clone());
        }
        if *budget == 0 {
            ctx.request_repaint();
            return None;
        }
        *budget -= 1;
        let decoded = decode(files.get(&file)?).map(|image| {
            let image = shrink(image, ICON);
            let size = image.size;
            Thumbnail {
                texture: ctx.load_texture(key.clone(), image, TextureOptions::NEAREST),
                size,
                hash,
            }
        });
        self.textures.insert(key, decoded.clone());
        decoded
    }

    pub fn forget(&mut self, path: &str) {
        self.textures.remove(&format!("assets/{path}"));
        self.textures.remove(&format!("icon:assets/{path}"));
    }
}

pub const ICON: usize = 32;

fn shrink(image: ColorImage, longest: usize) -> ColorImage {
    let [w, h] = image.size;
    if w <= longest && h <= longest {
        return image;
    }
    let scale = longest as f32 / w.max(h) as f32;
    let (sw, sh) = (
        ((w as f32 * scale).round() as usize).max(1),
        ((h as f32 * scale).round() as usize).max(1),
    );
    let pixels = (0..sh)
        .flat_map(|y| {
            let sy = ((y as f32 + 0.5) / scale) as usize;
            (0..sw).map(move |x| {
                let sx = ((x as f32 + 0.5) / scale) as usize;
                (sx.min(w - 1), sy.min(h - 1))
            })
        })
        .map(|(sx, sy)| image.pixels[sy * w + sx])
        .collect();
    ColorImage {
        size: [sw, sh],
        pixels,
        source_size: egui::Vec2::new(sw as f32, sh as f32),
    }
}

pub fn decode(bytes: &[u8]) -> Option<ColorImage> {
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let size = [image.width() as usize, image.height() as usize];
    Some(ColorImage::from_rgba_unmultiplied(size, image.as_raw()))
}

pub struct ModelFrame {
    pub uv: egui::Rect,
    pub size: egui::Vec2,
}

pub fn model_frame(model: &serde_json::Value, thumb: &Thumbnail) -> ModelFrame {
    let sprites = &model["sprites"];
    let w = sprites["frame_size"]["width"].as_f64().unwrap_or(16.0) as f32;
    let h = sprites["frame_size"]["height"].as_f64().unwrap_or(16.0) as f32;
    let frame = sprites["actions"]["idle"]["s"][0]["frame"]
        .as_u64()
        .unwrap_or(0) as f32;
    let columns = (thumb.size[0] as f32 / w).floor().max(1.0);
    let x = (frame % columns) * w;
    let y = (frame / columns).floor() * h;
    ModelFrame {
        uv: uv(thumb.size, x, y, w, h),
        size: egui::vec2(w, h),
    }
}

pub fn uv(size: [usize; 2], x: f32, y: f32, w: f32, h: f32) -> egui::Rect {
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    egui::Rect::from_min_max(
        egui::pos2(x / sw, y / sh),
        egui::pos2((x + w) / sw, (y + h) / sh),
    )
}

pub fn square_uv(size: [usize; 2]) -> egui::Rect {
    let (w, h) = (size[0] as f32, size[1] as f32);
    if h >= w {
        egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, w / h))
    } else {
        let margin = (1.0 - h / w) / 2.0;
        egui::Rect::from_min_max(egui::pos2(margin, 0.0), egui::pos2(1.0 - margin, 1.0))
    }
}

pub fn flip_uv(uv: egui::Rect, horizontal: bool, vertical: bool) -> egui::Rect {
    let (mut min, mut max) = (uv.min, uv.max);
    if horizontal {
        std::mem::swap(&mut min.x, &mut max.x);
    }
    if vertical {
        std::mem::swap(&mut min.y, &mut max.y);
    }
    egui::Rect::from_min_max(min, max)
}
