use egui::Color32;

pub const CREAM: Color32 = Color32::from_rgb(0xEF, 0xE3, 0xC4);
pub const LIGHT: Color32 = Color32::from_rgb(0xF5, 0xEB, 0xD3);
pub const CREAM2: Color32 = Color32::from_rgb(0xE4, 0xD2, 0xA4);
pub const HONEY: Color32 = Color32::from_rgb(0xE2, 0xCB, 0x93);
pub const HONEY2: Color32 = Color32::from_rgb(0xD2, 0xB6, 0x76);
pub const INK: Color32 = Color32::from_rgb(0x2A, 0x1F, 0x15);
pub const FRAME: Color32 = Color32::from_rgb(0x2B, 0x21, 0x18);
pub const INK2: Color32 = Color32::from_rgb(0x5E, 0x4A, 0x33);
pub const INK3: Color32 = Color32::from_rgb(0x8E, 0x7B, 0x60);
pub const RUBRIC: Color32 = Color32::from_rgb(0x8E, 0x1F, 0x14);
pub const AZURE: Color32 = Color32::from_rgb(0x2D, 0x4E, 0x8C);
pub const VERDIGRIS: Color32 = Color32::from_rgb(0x2E, 0x62, 0x45);
pub const OCHRE: Color32 = Color32::from_rgb(0x7A, 0x52, 0x12);
pub const GOLD: Color32 = Color32::from_rgb(0xB8, 0x91, 0x2C);
pub const GOLD2: Color32 = Color32::from_rgb(0xE2, 0xC2, 0x5A);
pub const TYRIAN: Color32 = Color32::from_rgb(0x6B, 0x3A, 0x7A);
pub const WAX: Color32 = Color32::from_rgb(0xA8, 0x26, 0x1F);

pub const VEIL: Color32 = Color32::from_rgb(0x12, 0x12, 0x12);

pub const PLACE: Color32 = AZURE;
pub const NAME: Color32 = VERDIGRIS;
pub const ITEM: Color32 = GOLD;
pub const MAGIC: Color32 = TYRIAN;
pub const DANGER: Color32 = RUBRIC;

pub fn wash(color: Color32, alpha: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(
        color.r(),
        color.g(),
        color.b(),
        (alpha.clamp(0.0, 1.0) * 255.0).round() as u8,
    )
}

pub fn ink_wash(alpha: f32) -> Color32 {
    wash(INK, alpha)
}

pub fn white_wash(alpha: f32) -> Color32 {
    wash(Color32::WHITE, alpha)
}

pub fn gold_wash(alpha: f32) -> Color32 {
    wash(GOLD, alpha)
}

pub fn on(base: Color32, over: Color32, amount: f32) -> Color32 {
    let amount = amount.clamp(0.0, 1.0);
    let mix = |a: u8, b: u8| (f32::from(a) + (f32::from(b) - f32::from(a)) * amount).round() as u8;
    Color32::from_rgb(
        mix(base.r(), over.r()),
        mix(base.g(), over.g()),
        mix(base.b(), over.b()),
    )
}
