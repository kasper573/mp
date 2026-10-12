use std::io::{BufWriter, Cursor};
use std::path::{Path, PathBuf};

use image::{GenericImage, RgbaImage};
use serde_json::json;

pub fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("rift-import-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a temp dir");
    dir
}

fn bbox(image: &RgbaImage) -> (u32, u32, u32, u32) {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0, 0);
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] != 0 {
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x + 1);
            y1 = y1.max(y + 1);
        }
    }
    if x0 == u32::MAX {
        return (0, 0, 1, 1);
    }
    (x0, y0, x1 - x0, y1 - y0)
}

fn save(path: &Path, image: &RgbaImage) {
    image.save(path).expect("saves");
}

/// An Aseprite export: hash-keyed frames, trimmed when asked, frameTags per strip.
pub fn aseprite(
    dir: &Path,
    name: &str,
    strips: &[(String, Vec<(RgbaImage, u32)>)],
    trimmed: bool,
) -> Vec<PathBuf> {
    let mut frames = serde_json::Map::new();
    let mut tags = Vec::new();
    let mut sheet = RgbaImage::new(512, 2048);
    let (mut x, mut y, mut shelf) = (0, 0, 0);
    let mut index = 0;
    for (tag, strip) in strips {
        let from = index;
        for (image, ms) in strip {
            let (bx, by, bw, bh) = match trimmed {
                true => bbox(image),
                false => (0, 0, image.width(), image.height()),
            };
            if x + bw > sheet.width() {
                x = 0;
                y += shelf;
                shelf = 0;
            }
            let cut = image::imageops::crop_imm(image, bx, by, bw, bh).to_image();
            sheet.copy_from(&cut, x, y).unwrap();
            frames.insert(
                format!("{name} {index}.aseprite"),
                json!({
                    "frame": { "x": x, "y": y, "w": bw, "h": bh },
                    "rotated": false,
                    "trimmed": trimmed,
                    "spriteSourceSize": { "x": bx, "y": by, "w": bw, "h": bh },
                    "sourceSize": { "w": image.width(), "h": image.height() },
                    "duration": ms,
                }),
            );
            x += bw;
            shelf = shelf.max(bh);
            index += 1;
        }
        tags.push(json!({ "name": tag, "from": from, "to": index - 1, "direction": "forward" }));
    }
    let sheet = image::imageops::crop_imm(&sheet, 0, 0, 512, y + shelf).to_image();
    let png = dir.join(format!("{name}.png"));
    save(&png, &sheet);
    let json = dir.join(format!("{name}.json"));
    std::fs::write(
        &json,
        serde_json::to_vec_pretty(&json!({
            "frames": frames,
            "meta": { "app": "https://www.aseprite.org/", "image": format!("{name}.png"), "frameTags": tags },
        }))
        .unwrap(),
    )
    .unwrap();
    vec![png, json]
}

/// A TexturePacker export: an array of named frames, every other one rotated, no durations.
pub fn texturepacker(
    dir: &Path,
    name: &str,
    strips: &[(String, Vec<(RgbaImage, u32)>)],
) -> Vec<PathBuf> {
    let mut frames = Vec::new();
    let mut sheet = RgbaImage::new(512, 2048);
    let (mut x, mut y, mut shelf) = (0, 0, 0);
    let mut index = 0;
    for (tag, strip) in strips {
        for (number, (image, _)) in strip.iter().enumerate() {
            let (bx, by, bw, bh) = bbox(image);
            let cut = image::imageops::crop_imm(image, bx, by, bw, bh).to_image();
            let rotated = index % 2 == 1;
            let placed = match rotated {
                true => image::imageops::rotate90(&cut),
                false => cut,
            };
            if x + placed.width() > sheet.width() {
                x = 0;
                y += shelf;
                shelf = 0;
            }
            sheet.copy_from(&placed, x, y).unwrap();
            frames.push(json!({
                "filename": format!("{tag}_{:02}.png", number + 1),
                "frame": { "x": x, "y": y, "w": bw, "h": bh },
                "rotated": rotated,
                "trimmed": true,
                "spriteSourceSize": { "x": bx, "y": by, "w": bw, "h": bh },
                "sourceSize": { "w": image.width(), "h": image.height() },
            }));
            x += placed.width();
            shelf = shelf.max(placed.height());
            index += 1;
        }
    }
    let sheet = image::imageops::crop_imm(&sheet, 0, 0, 512, y + shelf).to_image();
    let png = dir.join(format!("{name}.png"));
    save(&png, &sheet);
    let json = dir.join(format!("{name}.json"));
    std::fs::write(
        &json,
        serde_json::to_vec_pretty(&json!({
            "frames": frames,
            "meta": { "app": "https://www.codeandweb.com/texturepacker", "image": format!("{name}.png") },
        }))
        .unwrap(),
    )
    .unwrap();
    vec![png, json]
}

/// A plain grid: one strip per row, as many columns as the longest strip.
pub fn grid(
    dir: &Path,
    name: &str,
    strips: &[(String, Vec<(RgbaImage, u32)>)],
    frame: (u32, u32),
) -> PathBuf {
    let columns = strips.iter().map(|(_, s)| s.len()).max().unwrap_or(1) as u32;
    let mut sheet = RgbaImage::new(columns * frame.0, strips.len() as u32 * frame.1);
    for (row, (_, strip)) in strips.iter().enumerate() {
        for (column, (image, _)) in strip.iter().enumerate() {
            sheet
                .copy_from(image, column as u32 * frame.0, row as u32 * frame.1)
                .unwrap();
        }
    }
    let png = dir.join(format!("{name}.png"));
    save(&png, &sheet);
    png
}

/// Numbered files, `<tag>_<n>.png`.
pub fn sequence(dir: &Path, strips: &[(String, Vec<(RgbaImage, u32)>)]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for (tag, strip) in strips {
        for (number, (image, _)) in strip.iter().enumerate() {
            let png = dir.join(format!("{tag}_{}.png", number + 1));
            save(&png, image);
            files.push(png);
        }
    }
    files
}

/// An animated GIF with one delay, in hundredths of a second.
pub fn gif(dir: &Path, name: &str, frames: &[RgbaImage], delay: u16) -> PathBuf {
    let path = dir.join(format!("{name}.gif"));
    let file = std::fs::File::create(&path).unwrap();
    let mut encoder = image::codecs::gif::GifEncoder::new(BufWriter::new(file));
    encoder
        .set_repeat(image::codecs::gif::Repeat::Infinite)
        .unwrap();
    for frame in frames {
        let frame = image::Frame::from_parts(
            frame.clone(),
            0,
            0,
            image::Delay::from_numer_denom_ms(u32::from(delay) * 10, 1),
        );
        encoder.encode_frame(frame).unwrap();
    }
    path
}

/// An APNG with one delay as a fraction of a second.
pub fn apng(dir: &Path, name: &str, frames: &[RgbaImage], delay: (u16, u16)) -> PathBuf {
    let path = dir.join(format!("{name}.png"));
    let (width, height) = frames[0].dimensions();
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(Cursor::new(&mut bytes), width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_animated(frames.len() as u32, 0).unwrap();
        encoder.set_frame_delay(delay.0, delay.1).unwrap();
        let mut writer = encoder.write_header().unwrap();
        for frame in frames {
            writer.write_image_data(frame.as_raw()).unwrap();
        }
        writer.finish().unwrap();
    }
    std::fs::write(&path, bytes).unwrap();
    path
}

/// A tileset export with a margin, spacing and extruded edges around every tile.
pub fn spaced_grid(
    dir: &Path,
    name: &str,
    packed: &RgbaImage,
    tile: u32,
    margin: u32,
    spacing: u32,
    extruded: u32,
) -> PathBuf {
    let columns = packed.width() / tile;
    let rows = packed.height() / tile;
    let cell = tile + 2 * extruded;
    let mut out = RgbaImage::new(
        2 * margin + columns * cell + (columns - 1) * spacing,
        2 * margin + rows * cell + (rows - 1) * spacing,
    );
    for row in 0..rows {
        for column in 0..columns {
            let cut =
                image::imageops::crop_imm(packed, column * tile, row * tile, tile, tile).to_image();
            let x = margin + column * (cell + spacing);
            let y = margin + row * (cell + spacing);
            for dy in 0..cell {
                for dx in 0..cell {
                    let sx = dx.saturating_sub(extruded).min(tile - 1);
                    let sy = dy.saturating_sub(extruded).min(tile - 1);
                    out.put_pixel(x + dx, y + dy, *cut.get_pixel(sx, sy));
                }
            }
        }
    }
    let path = dir.join(format!("{name}.png"));
    save(&path, &out);
    path
}
