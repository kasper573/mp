use std::collections::HashMap;

use egui::{ColorImage, TextureHandle, TextureOptions};
use engine::core::assets::ImageRef;
use engine::core::content::asset_file;
use engine::core::gui::{GuiImage, ImageSource};
use image::RgbaImage;
use image::imageops::FilterType;

use crate::project::ProjectFiles;

#[derive(Default)]
pub struct Thumbnails {
    entries: HashMap<String, Entry>,
}

enum Entry {
    Decoded(Thumbnail),
    Undecodable { hash: String },
}

#[derive(Clone)]
pub struct Thumbnail {
    pub texture: TextureHandle,
    /// The picture's own size in pixels, which a texture too big for the GPU is drawn down from.
    pub size: [usize; 2],
    pub hash: String,
}

/// A project's pictures, for drawing the engine's own gui in the editor.
pub struct ProjectImages<'a> {
    pub ctx: &'a egui::Context,
    pub files: &'a ProjectFiles,
    pub thumbnails: &'a mut Thumbnails,
}

impl ImageSource for ProjectImages<'_> {
    fn image(&mut self, asset: &ImageRef) -> Option<GuiImage> {
        let thumb = self
            .thumbnails
            .image(self.ctx, self.files, asset.as_str())?;
        Some(GuiImage {
            texture: thumb.texture.id(),
            size: thumb.texture.size_vec2(),
            path: asset.as_str().to_owned(),
        })
    }
}

pub const ICON: u32 = 32;
pub const FULL_UV: egui::Rect = egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0));

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
        let file = asset_file(path);
        self.load(ctx, files, file.clone(), file, budget, |image| image)
    }

    pub fn icon(
        &mut self,
        ctx: &egui::Context,
        files: &ProjectFiles,
        path: &str,
        budget: &mut u32,
    ) -> Option<Thumbnail> {
        let file = asset_file(path);
        let key = format!("icon:{file}");
        self.load(ctx, files, key, file, budget, |image| shrink(image, ICON))
    }

    fn load(
        &mut self,
        ctx: &egui::Context,
        files: &ProjectFiles,
        key: String,
        file: String,
        budget: &mut u32,
        prepare: impl FnOnce(RgbaImage) -> RgbaImage,
    ) -> Option<Thumbnail> {
        let bytes = files.get(&file)?;
        let hash = files.hash_of(&file)?.to_owned();
        match self.entries.get(&key) {
            Some(Entry::Decoded(thumb)) if thumb.hash == hash => return Some(thumb.clone()),
            Some(Entry::Undecodable { hash: known }) if *known == hash => return None,
            _ => {}
        }
        if *budget == 0 {
            ctx.request_repaint();
            return None;
        }
        *budget -= 1;
        let max_side = ctx.input(|i| i.max_texture_side) as u32;
        let thumb = decode(bytes).map(|image| {
            let image = prepare(image);
            let size = [image.width() as usize, image.height() as usize];
            let image = to_color_image(shrink(image, max_side));
            Thumbnail {
                texture: ctx.load_texture(key.clone(), image, TextureOptions::NEAREST),
                size,
                hash: hash.clone(),
            }
        });
        let entry = match &thumb {
            Some(thumb) => Entry::Decoded(thumb.clone()),
            None => Entry::Undecodable { hash },
        };
        self.entries.insert(key, entry);
        thumb
    }
}

pub struct SpriteFrame {
    pub uv: egui::Rect,
    pub size: egui::Vec2,
}

pub fn sprite_frame(size: (u32, u32), frame: u32, thumb: &Thumbnail) -> SpriteFrame {
    let (w, h) = (size.0 as f32, size.1 as f32);
    let frame = frame as f32;
    let columns = (thumb.size[0] as f32 / w).floor().max(1.0);
    let x = (frame % columns) * w;
    let y = (frame / columns).floor() * h;
    SpriteFrame {
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

fn decode(bytes: &[u8]) -> Option<RgbaImage> {
    image::load_from_memory(bytes)
        .ok()
        .map(|image| image.into_rgba8())
}

fn to_color_image(image: RgbaImage) -> ColorImage {
    let size = [image.width() as usize, image.height() as usize];
    ColorImage::from_rgba_unmultiplied(size, image.as_raw())
}

fn shrink(image: RgbaImage, longest: u32) -> RgbaImage {
    let (w, h) = image.dimensions();
    if w <= longest && h <= longest {
        return image;
    }
    let scale = longest as f64 / w.max(h) as f64;
    let sw = ((w as f64 * scale).round() as u32).max(1);
    let sh = ((h as f64 * scale).round() as u32).max(1);
    image::imageops::resize(&image, sw, sh, FilterType::Nearest)
}
