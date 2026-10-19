use editor::import::model;
use image::{Rgba, RgbaImage};
use serde_json::{Value, json};

/// A frame of the walker's sheet, in pixels.
pub const FRAME: (u32, u32) = (12, 16);
pub const FRAMES_A_STRIP: u32 = 8;
/// How long each frame of the walker's attack lasts, in milliseconds.
pub const ATTACK_MS: [u32; 8] = [120, 110, 110, 100, 60, 70, 110, 120];

pub const TILE: u32 = 16;
pub const COLUMNS: u32 = 36;
pub const ROWS: u32 = 26;
/// The water's four frames lie side by side on the tileset, each a block this many tiles wide and
/// tall, the first at column 1, row 1, and each next nine columns on.
pub const WATER: u32 = 7;
/// Of the water's cells, the last this many in reading order look alike in every frame.
pub const STILL_WATER: u32 = 16;
/// A tile with a walk flag and a surface.
pub const PAVED: u32 = 450;
/// A transparent tile that carries data all the same.
pub const BLANK_WITH_DATA: u32 = COLUMNS * ROWS - 1;

/// A model row of every strip the importer knows, eight frames each laid out a strip a row:
/// footsteps on the first and fifth frame of its walks and runs, and an attack landing, with a
/// sound, on the sixth.
pub fn walker_row() -> Value {
    let mut actions = serde_json::Map::new();
    for (row, name) in model::strip_names().iter().enumerate() {
        let (action, direction) = name.split_once('_').expect("action_direction");
        let frames: Vec<Value> = (0..FRAMES_A_STRIP)
            .map(|column| {
                let mut frame = json!({ "frame": row as u32 * FRAMES_A_STRIP + column, "ms": 100 });
                match action {
                    "walk" | "run" if column == 0 || column == 4 => frame["step"] = json!(true),
                    "attack" => {
                        frame["ms"] = json!(ATTACK_MS[column as usize]);
                        if column == 5 {
                            frame["apex"] = json!(true);
                            frame["sound"] = json!("slash03");
                        }
                    }
                    _ => {}
                }
                frame
            })
            .collect();
        actions
            .entry(action)
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .expect("directions")
            .insert(direction.to_owned(), Value::Array(frames));
    }
    json!({
        "hitbox": { "width": 0.8, "height": 1.6 },
        "sprites": {
            "image": "models/walker.png",
            "frame_size": { "width": FRAME.0, "height": FRAME.1 },
            "actions": actions,
        },
        "modules": [],
    })
}

/// The walker's sheet: every frame a figure of its own colour on a transparent margin, so no two
/// frames look alike.
pub fn walker_sheet() -> RgbaImage {
    let strips = model::strip_names().len() as u32;
    let mut sheet = RgbaImage::new(FRAMES_A_STRIP * FRAME.0, strips * FRAME.1);
    for index in 0..strips * FRAMES_A_STRIP {
        let (x, y) = (
            (index % FRAMES_A_STRIP) * FRAME.0,
            (index / FRAMES_A_STRIP) * FRAME.1,
        );
        let color = [(index % 256) as u8, (index / 256) as u8, 200, 255];
        fill(&mut sheet, x + 2, y + 1, FRAME.0 - 4, FRAME.1 - 2, color);
    }
    sheet
}

/// A tileset row with a paved tile, a transparent tile carrying data, and the water's first block
/// animated through its four frames.
pub fn tileset_row() -> Value {
    let mut tiles = serde_json::Map::new();
    tiles.insert(
        PAVED.to_string(),
        json!({ "walk": "blocks", "surface": "sand" }),
    );
    tiles.insert(BLANK_WITH_DATA.to_string(), json!({ "walk": "blocks" }));
    let first = COLUMNS + 1;
    tiles.insert(
        first.to_string(),
        json!({
            "animation": (0..4).map(|k| json!({ "tile": first + 9 * k, "ms": 250 })).collect::<Vec<_>>(),
        }),
    );
    json!({ "image": "tilesets/beach.png", "tile": TILE, "tiles": tiles })
}

/// A tileset of solid tiles each of its own colour, its last row transparent, and the water's four
/// frames: blocks whose cells change colour from frame to frame, but for the still ones.
pub fn tileset() -> RgbaImage {
    let mut image = RgbaImage::new(COLUMNS * TILE, ROWS * TILE);
    for index in 0..COLUMNS * (ROWS - 1) {
        let color = [(index % 256) as u8, (index / 256) as u8, 100, 255];
        paint_tile(&mut image, index, color);
    }
    for frame in 0..4 {
        for cell in 0..WATER * WATER {
            if cell >= WATER * WATER - STILL_WATER {
                let (column, row) = (1 + 9 * frame + cell % WATER, 1 + cell / WATER);
                paint_tile(
                    &mut image,
                    row * COLUMNS + column,
                    [200, cell as u8, 50, 255],
                );
            }
        }
    }
    image
}

/// The water's four frames, cut from the tileset.
pub fn water(tileset: &RgbaImage) -> Vec<RgbaImage> {
    (0..4)
        .map(|k| {
            image::imageops::crop_imm(
                tileset,
                (1 + 9 * k) * TILE,
                TILE,
                WATER * TILE,
                WATER * TILE,
            )
            .to_image()
        })
        .collect()
}

/// A palette painting the paved tile, the water's first frame and another plain tile.
pub fn island_palette() -> String {
    format!(
        "tileset,tile,flip\nbeach,{PAVED},\nbeach,{},horizontal\nbeach,3,\n",
        COLUMNS + 1
    )
}

pub fn fill(image: &mut RgbaImage, x: u32, y: u32, w: u32, h: u32, color: [u8; 4]) {
    for dy in 0..h {
        for dx in 0..w {
            image.put_pixel(x + dx, y + dy, Rgba(color));
        }
    }
}

fn paint_tile(image: &mut RgbaImage, index: u32, color: [u8; 4]) {
    let (x, y) = ((index % COLUMNS) * TILE, (index / COLUMNS) * TILE);
    fill(image, x, y, TILE, TILE, color);
}
