use egui::{
    Color32, Context, FontData, FontDefinitions, FontFamily, FontId, RichText, Stroke, TextStyle,
};

pub const BG: Color32 = Color32::from_rgb(24, 24, 27);
pub const PANEL: Color32 = Color32::from_rgb(29, 29, 33);
pub const RAISED: Color32 = Color32::from_rgb(38, 38, 43);
pub const INPUT: Color32 = Color32::from_rgb(20, 20, 23);
pub const BORDER: Color32 = Color32::from_rgb(50, 50, 57);
pub const TEXT: Color32 = Color32::from_rgb(228, 228, 232);
pub const MUTED: Color32 = Color32::from_rgb(142, 144, 156);
pub const FAINT: Color32 = Color32::from_rgb(96, 98, 110);
pub const ACCENT: Color32 = Color32::from_rgb(46, 110, 235);
pub const ACCENT_SOFT: Color32 = Color32::from_rgb(30, 50, 96);
pub const CODE: Color32 = Color32::from_rgb(132, 172, 240);
pub const WARN: Color32 = Color32::from_rgb(242, 176, 62);
pub const DANGER: Color32 = Color32::from_rgb(226, 90, 90);
pub const VARIABLE: Color32 = Color32::from_rgb(176, 140, 230);
pub const VARIABLE_FILL: Color32 = Color32::from_rgba_premultiplied(21, 16, 27, 30);
pub const OK: Color32 = Color32::from_rgb(86, 196, 124);
pub const SELECTION: Color32 = Color32::from_rgb(120, 170, 250);
pub const CANVAS: Color32 = Color32::from_rgb(20, 20, 24);

pub fn apply(ctx: &Context) {
    let mut fonts = FontDefinitions::default();
    fonts.font_data.insert(
        "circular".to_owned(),
        FontData::from_static(include_bytes!(
            "../../templates/new_game/assets/fonts/circular-400-normal.ttf"
        ))
        .into(),
    );
    fonts.font_data.insert(
        "circular-medium".to_owned(),
        FontData::from_static(include_bytes!(
            "../../templates/new_game/assets/fonts/circular-500-normal.ttf"
        ))
        .into(),
    );
    fonts.font_data.insert(
        "symbols".to_owned(),
        FontData::from_static(include_bytes!("../../assets/DejaVuSans.ttf")).into(),
    );
    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .insert(0, "circular".to_owned());
    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .push("symbols".to_owned());
    fonts
        .families
        .entry(FontFamily::Monospace)
        .or_default()
        .push("symbols".to_owned());
    fonts.families.insert(
        FontFamily::Name("medium".into()),
        vec![
            "circular-medium".to_owned(),
            "circular".to_owned(),
            "symbols".to_owned(),
        ],
    );
    ctx.set_fonts(fonts);
    ctx.set_theme(egui::Theme::Dark);
    let mut style = (*ctx.global_style()).clone();
    style
        .text_styles
        .insert(TextStyle::Body, FontId::proportional(14.0));
    style
        .text_styles
        .insert(TextStyle::Button, FontId::proportional(14.0));
    style
        .text_styles
        .insert(TextStyle::Small, FontId::proportional(11.5));
    style.text_styles.insert(
        TextStyle::Heading,
        FontId::new(17.0, FontFamily::Name("medium".into())),
    );
    style
        .text_styles
        .insert(TextStyle::Monospace, FontId::monospace(13.0));
    style.spacing.item_spacing = egui::vec2(6.0, 5.0);
    style.spacing.button_padding = egui::vec2(8.0, 4.0);
    style.spacing.interact_size.y = 22.0;
    let visuals = &mut style.visuals;
    visuals.dark_mode = true;
    visuals.override_text_color = Some(TEXT);
    visuals.panel_fill = PANEL;
    visuals.window_fill = RAISED;
    visuals.window_stroke = Stroke::new(1.0, BORDER);
    visuals.extreme_bg_color = INPUT;
    visuals.faint_bg_color = RAISED;
    visuals.code_bg_color = INPUT;
    visuals.hyperlink_color = CODE;
    visuals.selection.bg_fill = ACCENT_SOFT;
    visuals.selection.stroke = Stroke::new(1.0, SELECTION);
    visuals.widgets.noninteractive.bg_fill = PANEL;
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER);
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, TEXT);
    visuals.widgets.inactive.bg_fill = RAISED;
    visuals.widgets.inactive.weak_bg_fill = RAISED;
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, TEXT);
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(48, 48, 54);
    visuals.widgets.hovered.weak_bg_fill = Color32::from_rgb(48, 48, 54);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, Color32::from_rgb(80, 80, 90));
    visuals.widgets.active.bg_fill = ACCENT_SOFT;
    visuals.widgets.active.weak_bg_fill = ACCENT_SOFT;
    visuals.widgets.active.bg_stroke = Stroke::new(1.0, ACCENT);
    visuals.widgets.open.bg_fill = RAISED;
    visuals.widgets.open.weak_bg_fill = RAISED;
    visuals.window_corner_radius = 6.0.into();
    visuals.menu_corner_radius = 6.0.into();
    for widget in [
        &mut visuals.widgets.noninteractive,
        &mut visuals.widgets.inactive,
        &mut visuals.widgets.hovered,
        &mut visuals.widgets.active,
        &mut visuals.widgets.open,
    ] {
        widget.corner_radius = 4.0.into();
    }
    ctx.all_styles_mut(|target| *target = style.clone());
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

pub fn strong(text: impl Into<String>) -> RichText {
    RichText::new(text)
        .family(FontFamily::Name("medium".into()))
        .color(TEXT)
}

pub fn badge_colour(kind: &str) -> Color32 {
    match kind {
        "population" | "resident" | "npc" | "player" | "nameplate" | "tint" | "voice" => {
            Color32::from_rgb(214, 168, 42)
        }
        "object" | "safe_zone" | "area" | "walk" => Color32::from_rgb(76, 170, 96),
        "shared_script" | "inline_script" | "script" | "shown" | "requires" => {
            Color32::from_rgb(204, 96, 164)
        }
        "soundscape" | "sfx" | "babble" | "step" => Color32::from_rgb(134, 110, 220),
        "loot" | "item" | "stack" | "reward" | "hold" | "deliver" | "offer" | "shop" => {
            Color32::from_rgb(52, 160, 184)
        }
        "blueprint" | "scenery" | "tileset" | "model" | "bust" => Color32::from_rgb(96, 128, 196),
        "respawn" | "quest" | "defeat" | "hand_in" | "task" | "decide" | "pick_one" => {
            Color32::from_rgb(222, 112, 96)
        }
        _ => Color32::from_rgb(120, 124, 136),
    }
}

pub fn badge_letter(kind: &str) -> String {
    match kind {
        "shared_script" | "inline_script" | "script" => "S".to_owned(),
        "population" | "resident" | "npc" => "N".to_owned(),
        "object" => "P".to_owned(),
        "safe_zone" => "Z".to_owned(),
        "soundscape" => "♪".to_owned(),
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
