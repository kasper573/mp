use design_tokens::face::Face;
use design_tokens::ink;
use egui::{Color32, Context, FontFamily, RichText};

pub const TEXT: Color32 = ink::INK;
pub const MUTED: Color32 = ink::INK2;
pub const FAINT: Color32 = ink::INK3;
pub const CODE: Color32 = ink::INK2;
pub const DANGER: Color32 = ink::RUBRIC;
pub const OK: Color32 = ink::VERDIGRIS;
pub const WARN: Color32 = ink::OCHRE;
pub const ACCENT: Color32 = ink::RUBRIC;
pub const ACCENT_SOFT: Color32 = Color32::from_rgba_premultiplied(37, 29, 9, 51);
pub const SELECTION: Color32 = Color32::from_rgba_premultiplied(51, 40, 12, 71);
pub const BORDER: Color32 = Color32::from_rgba_premultiplied(15, 11, 7, 89);
pub const INPUT: Color32 = Color32::from_rgba_premultiplied(2, 1, 1, 10);
pub const PANEL: Color32 = ink::CREAM;
pub const RAISED: Color32 = ink::LIGHT;
pub const OVERLAY: Color32 = ink::CREAM;
pub const VARIABLE: Color32 = ink::TYRIAN;
pub const VARIABLE_FILL: Color32 = Color32::from_rgba_premultiplied(8, 5, 10, 20);
pub const CANVAS: Color32 = Color32::from_rgb(219, 207, 178);
pub const BLOCKED: Color32 = ink::RUBRIC;
pub const SORT_LINE: Color32 = ink::AZURE;

pub fn apply(ctx: &Context) {
    design_tokens::apply(ctx);
}

pub fn medium() -> FontFamily {
    Face::BookMedium.family()
}

pub fn ok(text: impl Into<String>) -> RichText {
    RichText::new(text).color(OK)
}

pub fn warn(text: impl Into<String>) -> RichText {
    RichText::new(text).color(WARN)
}

pub fn muted(text: impl Into<String>) -> RichText {
    RichText::new(text).color(MUTED)
}

pub fn faint(text: impl Into<String>) -> RichText {
    RichText::new(text).color(FAINT)
}

pub fn code(text: impl Into<String>) -> RichText {
    RichText::new(text).monospace().color(CODE)
}

pub fn mono(text: impl Into<String>) -> RichText {
    RichText::new(text).monospace()
}

pub fn alpha(color: Color32, alpha: u8) -> Color32 {
    Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), alpha)
}

pub fn strong(text: impl Into<String>) -> RichText {
    RichText::new(text).family(medium()).color(TEXT)
}

pub fn badge_color(kind: &str) -> Color32 {
    match kind {
        "population" | "resident" | "npc" | "player" | "nameplate" | "tint" | "voice" => ink::OCHRE,
        "object" | "safe_zone" | "area" | "walk" => ink::VERDIGRIS,
        "shared_script" | "inline_script" | "script" | "shown" | "requires" => ink::TYRIAN,
        "soundscape" | "sfx" | "babble" | "step" => ink::GOLD,
        "loot" | "item" | "stack" | "reward" | "hold" | "deliver" | "offer" | "shop" => ink::AZURE,
        "blueprint" | "scenery" | "tileset" | "model" | "bust" => ink::INK2,
        "respawn" | "quest" | "defeat" | "hand_in" | "task" | "decide" | "pick_one" => ink::RUBRIC,
        _ => ink::INK3,
    }
}

pub fn badge_letter(kind: &str) -> String {
    match kind {
        "shared_script" | "inline_script" | "script" => "S".to_owned(),
        "population" | "resident" | "npc" => "N".to_owned(),
        "object" => "P".to_owned(),
        "safe_zone" => "Z".to_owned(),
        "soundscape" => "A".to_owned(),
        "blueprint" | "scenery" => "L".to_owned(),
        "loot" | "item" => "I".to_owned(),
        "respawn" => "F".to_owned(),
        "quest" => "R".to_owned(),
        "tint" | "voice" | "nameplate" => "L".to_owned(),
        other => other
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase().to_string())
            .unwrap_or_default(),
    }
}

pub const TERRAIN: [Color32; 8] = [
    Color32::from_rgb(230, 160, 70),
    Color32::from_rgb(150, 110, 90),
    Color32::from_rgb(240, 240, 220),
    Color32::from_rgb(190, 200, 210),
    Color32::from_rgb(110, 180, 110),
    Color32::from_rgb(90, 150, 230),
    Color32::from_rgb(200, 110, 200),
    Color32::from_rgb(230, 90, 90),
];
