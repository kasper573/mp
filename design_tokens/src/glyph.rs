//! The marks the interface draws instead of symbol glyphs: a card's kind pips, and the ticks,
//! crosses, flags, padlocks and chevrons painted beside words.

use egui::{
    Align2, Color32, ColorImage, Id, Painter, Pos2, Rect, Response, Sense, Shape, Stroke,
    TextureHandle, TextureId, TextureOptions, Ui, Vec2, WidgetInfo, WidgetType,
};

use crate::ink;

/// What a card describes; its glyph, word and art ground follow from it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    Equipment,
    Usable,
    Resource,
    Quest,
    Active,
    Passive,
}

impl Kind {
    pub const ALL: [Kind; 6] = [
        Kind::Equipment,
        Kind::Usable,
        Kind::Resource,
        Kind::Quest,
        Kind::Active,
        Kind::Passive,
    ];

    pub fn word(self) -> &'static str {
        match self {
            Kind::Equipment => "equipment",
            Kind::Usable => "usable",
            Kind::Resource => "resource",
            Kind::Quest => "quest",
            Kind::Active => "active skill",
            Kind::Passive => "passive skill",
        }
    }

    /// The art window's ground, top to bottom.
    pub fn ground(self) -> [Color32; 2] {
        match self {
            Kind::Equipment => [Color32::from_rgb(0x3A, 0x5E, 0xA3), ink::AZURE],
            Kind::Usable | Kind::Active => [Color32::from_rgb(0xC8, 0x30, 0x2A), ink::WAX],
            Kind::Resource => [
                Color32::from_rgb(0xE3, 0xB3, 0x35),
                Color32::from_rgb(0xC4, 0x92, 0x1E),
            ],
            Kind::Quest => [ink::TYRIAN, Color32::from_rgb(0x4F, 0x2A, 0x5C)],
            Kind::Passive => [
                Color32::from_rgb(0x4A, 0x94, 0x60),
                Color32::from_rgb(0x3F, 0x7A, 0x58),
            ],
        }
    }

    pub fn texture(self, ctx: &egui::Context) -> TextureId {
        let id = Id::new(("kind glyph", self));
        if let Some(texture) = ctx.data(|data| data.get_temp::<TextureHandle>(id)) {
            return texture.id();
        }
        let texture = load(ctx, self.word(), self.png());
        ctx.data_mut(|data| data.insert_temp(id, texture.clone()));
        texture.id()
    }

    /// The glyph filling `rect` in `color`, turned upside down when asked.
    pub fn paint(self, painter: &Painter, rect: Rect, color: Color32, upside_down: bool) {
        let uv = if upside_down {
            Rect::from_min_max(Pos2::new(1.0, 1.0), Pos2::ZERO)
        } else {
            Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0))
        };
        painter.add(Shape::image(self.texture(painter.ctx()), rect, uv, color));
    }

    fn png(self) -> &'static [u8] {
        match self {
            Kind::Equipment => include_bytes!("../glyphs/equipment.png"),
            Kind::Usable => include_bytes!("../glyphs/usable.png"),
            Kind::Resource => include_bytes!("../glyphs/resource.png"),
            Kind::Quest => include_bytes!("../glyphs/quest.png"),
            Kind::Active => include_bytes!("../glyphs/active.png"),
            Kind::Passive => include_bytes!("../glyphs/passive.png"),
        }
    }
}

/// A mark painted as lines and polygons, sized to the rect it is given.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Mark {
    Tick,
    Cross,
    Flag,
    Padlock,
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Warning,
    Play,
    Pause,
    Stop,
    Skip,
    Dot,
    Plus,
    Minus,
    Glass,
    Note,
    Reload,
    Undo,
    Pin,
    Eye,
    Gear,
    Bell,
    Speaker,
    Mute,
    Fork,
    Spark,
    Asterisk,
    Move,
    Page,
    Copy,
    Target,
    Grid,
    Tag,
    Ellipsis,
    Shift,
    Arrow,
    Bump,
}

impl Mark {
    /// The word the accessibility tree hears for the mark.
    pub fn word(self) -> &'static str {
        match self {
            Mark::Tick => "yes",
            Mark::Cross => "no",
            Mark::Flag => "flag",
            Mark::Padlock => "locked",
            Mark::ChevronUp => "up",
            Mark::ChevronDown => "down",
            Mark::ChevronLeft => "left",
            Mark::ChevronRight => "right",
            Mark::Warning => "warning",
            Mark::Play => "play",
            Mark::Pause => "pause",
            Mark::Stop => "stop",
            Mark::Skip => "skip",
            Mark::Dot => "dot",
            Mark::Plus => "add",
            Mark::Minus => "remove",
            Mark::Glass => "search",
            Mark::Note => "sound",
            Mark::Reload => "reload",
            Mark::Undo => "undo",
            Mark::Pin => "pin",
            Mark::Eye => "shown",
            Mark::Gear => "settings",
            Mark::Bell => "bell",
            Mark::Speaker => "sound on",
            Mark::Mute => "sound off",
            Mark::Fork => "duplicate",
            Mark::Spark => "paint",
            Mark::Asterisk => "edit",
            Mark::Move => "move",
            Mark::Page => "page",
            Mark::Copy => "copy",
            Mark::Target => "pick",
            Mark::Grid => "tiles",
            Mark::Tag => "rename",
            Mark::Ellipsis => "more",
            Mark::Shift => "Shift",
            Mark::Arrow => "arrow",
            Mark::Bump => "above",
        }
    }
}

/// The mark drawn to fill `rect` in `color`.
pub fn paint(painter: &Painter, mark: Mark, rect: Rect, color: Color32) {
    let size = rect.width().min(rect.height());
    let rect = Rect::from_center_size(rect.center(), Vec2::splat(size));
    let c = rect.center();
    let s = size;
    let u = |x: f32, y: f32| Pos2::new(rect.min.x + x * s, rect.min.y + y * s);
    let thin = Stroke::new((s / 9.0).max(1.0), color);
    let line = |points: Vec<Pos2>| painter.add(Shape::line(points, thin));
    match mark {
        Mark::Tick => {
            line(vec![u(0.12, 0.55), u(0.4, 0.82), u(0.9, 0.2)]);
        }
        Mark::Cross => {
            painter.line_segment([u(0.18, 0.18), u(0.82, 0.82)], thin);
            painter.line_segment([u(0.82, 0.18), u(0.18, 0.82)], thin);
        }
        Mark::Flag => {
            painter.line_segment([u(0.2, 0.05), u(0.2, 0.98)], thin);
            painter.add(Shape::convex_polygon(
                vec![u(0.2, 0.08), u(0.9, 0.3), u(0.2, 0.55)],
                color,
                Stroke::NONE,
            ));
        }
        Mark::Padlock => padlock(painter, c, s * 0.8, color),
        Mark::ChevronUp => {
            line(vec![u(0.2, 0.65), u(0.5, 0.33), u(0.8, 0.65)]);
        }
        Mark::ChevronDown => {
            line(vec![u(0.2, 0.35), u(0.5, 0.67), u(0.8, 0.35)]);
        }
        Mark::ChevronLeft => {
            line(vec![u(0.65, 0.2), u(0.33, 0.5), u(0.65, 0.8)]);
        }
        Mark::ChevronRight => {
            line(vec![u(0.35, 0.2), u(0.67, 0.5), u(0.35, 0.8)]);
        }
        Mark::Warning => {
            painter.add(Shape::closed_line(
                vec![u(0.5, 0.08), u(0.95, 0.9), u(0.05, 0.9)],
                thin,
            ));
            painter.line_segment([u(0.5, 0.38), u(0.5, 0.62)], thin);
            painter.circle_filled(u(0.5, 0.76), thin.width * 0.8, color);
        }
        Mark::Play => {
            painter.add(Shape::convex_polygon(
                vec![u(0.22, 0.1), u(0.9, 0.5), u(0.22, 0.9)],
                color,
                Stroke::NONE,
            ));
        }
        Mark::Pause => {
            painter.rect_filled(Rect::from_min_max(u(0.2, 0.12), u(0.42, 0.88)), 1.0, color);
            painter.rect_filled(Rect::from_min_max(u(0.58, 0.12), u(0.8, 0.88)), 1.0, color);
        }
        Mark::Stop => {
            painter.rect_filled(Rect::from_min_max(u(0.18, 0.18), u(0.82, 0.82)), 1.0, color);
        }
        Mark::Skip => {
            painter.add(Shape::convex_polygon(
                vec![u(0.1, 0.15), u(0.5, 0.5), u(0.1, 0.85)],
                color,
                Stroke::NONE,
            ));
            painter.add(Shape::convex_polygon(
                vec![u(0.5, 0.15), u(0.9, 0.5), u(0.5, 0.85)],
                color,
                Stroke::NONE,
            ));
        }
        Mark::Dot => {
            painter.circle_filled(c, s * 0.22, color);
        }
        Mark::Plus => {
            painter.line_segment([u(0.5, 0.15), u(0.5, 0.85)], thin);
            painter.line_segment([u(0.15, 0.5), u(0.85, 0.5)], thin);
        }
        Mark::Minus => {
            painter.line_segment([u(0.15, 0.5), u(0.85, 0.5)], thin);
        }
        Mark::Glass => {
            painter.circle_stroke(u(0.42, 0.42), s * 0.28, thin);
            painter.line_segment([u(0.63, 0.63), u(0.92, 0.92)], thin);
        }
        Mark::Note => {
            painter.line_segment([u(0.62, 0.12), u(0.62, 0.72)], thin);
            painter.line_segment([u(0.62, 0.12), u(0.85, 0.25)], thin);
            painter.circle_filled(u(0.47, 0.75), s * 0.17, color);
        }
        Mark::Reload => {
            arc(painter, c, s * 0.34, 0.3, 5.6, thin);
            arrow_head(
                painter,
                u(0.78, 0.22),
                Vec2::new(-0.3, 1.0),
                s * 0.22,
                color,
            );
        }
        Mark::Undo => {
            arc(painter, c, s * 0.34, 3.5, 8.8, thin);
            arrow_head(painter, u(0.22, 0.22), Vec2::new(0.3, 1.0), s * 0.22, color);
        }
        Mark::Pin => {
            painter.circle_stroke(u(0.5, 0.36), s * 0.24, thin);
            painter.line_segment([u(0.5, 0.6), u(0.5, 0.95)], thin);
        }
        Mark::Eye => {
            painter.add(Shape::closed_line(
                vec![
                    u(0.05, 0.5),
                    u(0.3, 0.25),
                    u(0.7, 0.25),
                    u(0.95, 0.5),
                    u(0.7, 0.75),
                    u(0.3, 0.75),
                ],
                thin,
            ));
            painter.circle_filled(c, s * 0.14, color);
        }
        Mark::Gear => {
            for step in 0..8 {
                let angle = step as f32 * std::f32::consts::TAU / 8.0;
                let dir = Vec2::new(angle.cos(), angle.sin());
                painter.line_segment([c + dir * s * 0.22, c + dir * s * 0.44], thin);
            }
            painter.circle_stroke(c, s * 0.22, thin);
        }
        Mark::Bell => {
            painter.add(Shape::closed_line(
                vec![
                    u(0.15, 0.72),
                    u(0.25, 0.6),
                    u(0.28, 0.32),
                    u(0.5, 0.12),
                    u(0.72, 0.32),
                    u(0.75, 0.6),
                    u(0.85, 0.72),
                ],
                thin,
            ));
            painter.circle_filled(u(0.5, 0.86), thin.width, color);
        }
        Mark::Speaker | Mark::Mute => {
            painter.add(Shape::convex_polygon(
                vec![
                    u(0.1, 0.38),
                    u(0.3, 0.38),
                    u(0.55, 0.15),
                    u(0.55, 0.85),
                    u(0.3, 0.62),
                    u(0.1, 0.62),
                ],
                color,
                Stroke::NONE,
            ));
            if mark == Mark::Speaker {
                arc(painter, u(0.55, 0.5), s * 0.25, -0.9, 0.9, thin);
            } else {
                painter.line_segment([u(0.65, 0.35), u(0.92, 0.65)], thin);
                painter.line_segment([u(0.92, 0.35), u(0.65, 0.65)], thin);
            }
        }
        Mark::Fork => {
            painter.line_segment([u(0.5, 0.1), u(0.5, 0.9)], thin);
            line(vec![u(0.5, 0.5), u(0.82, 0.3), u(0.82, 0.12)]);
            painter.circle_filled(u(0.5, 0.9), thin.width, color);
        }
        Mark::Spark => {
            for step in 0..4 {
                let angle = step as f32 * std::f32::consts::FRAC_PI_4;
                let dir = Vec2::new(angle.cos(), angle.sin()) * s * 0.4;
                painter.line_segment([c - dir, c + dir], thin);
            }
        }
        Mark::Asterisk => {
            for step in 0..3 {
                let angle = step as f32 * std::f32::consts::FRAC_PI_3 + std::f32::consts::FRAC_PI_2;
                let dir = Vec2::new(angle.cos(), angle.sin()) * s * 0.36;
                painter.line_segment([c - dir, c + dir], thin);
            }
        }
        Mark::Move => {
            painter.line_segment([u(0.15, 0.85), u(0.8, 0.2)], thin);
            arrow_head(
                painter,
                u(0.85, 0.15),
                Vec2::new(1.0, -1.0),
                s * 0.26,
                color,
            );
        }
        Mark::Page => {
            painter.add(Shape::closed_line(
                vec![
                    u(0.22, 0.08),
                    u(0.62, 0.08),
                    u(0.78, 0.26),
                    u(0.78, 0.92),
                    u(0.22, 0.92),
                ],
                thin,
            ));
            painter.line_segment([u(0.62, 0.08), u(0.62, 0.26)], thin);
            painter.line_segment([u(0.62, 0.26), u(0.78, 0.26)], thin);
        }
        Mark::Copy => {
            painter.rect_stroke(
                Rect::from_min_max(u(0.12, 0.12), u(0.64, 0.64)),
                1.0,
                thin,
                egui::StrokeKind::Middle,
            );
            painter.rect_stroke(
                Rect::from_min_max(u(0.36, 0.36), u(0.88, 0.88)),
                1.0,
                thin,
                egui::StrokeKind::Middle,
            );
        }
        Mark::Target => {
            painter.circle_stroke(c, s * 0.3, thin);
            painter.line_segment([u(0.5, 0.05), u(0.5, 0.32)], thin);
            painter.line_segment([u(0.5, 0.68), u(0.5, 0.95)], thin);
            painter.line_segment([u(0.05, 0.5), u(0.32, 0.5)], thin);
            painter.line_segment([u(0.68, 0.5), u(0.95, 0.5)], thin);
        }
        Mark::Grid => {
            painter.rect_stroke(
                Rect::from_min_max(u(0.12, 0.12), u(0.88, 0.88)),
                0.0,
                thin,
                egui::StrokeKind::Middle,
            );
            painter.line_segment([u(0.5, 0.12), u(0.5, 0.88)], thin);
            painter.line_segment([u(0.12, 0.5), u(0.88, 0.5)], thin);
        }
        Mark::Tag => {
            painter.add(Shape::closed_line(
                vec![
                    u(0.1, 0.3),
                    u(0.6, 0.3),
                    u(0.92, 0.5),
                    u(0.6, 0.7),
                    u(0.1, 0.7),
                ],
                thin,
            ));
            painter.circle_filled(u(0.25, 0.5), thin.width * 0.8, color);
        }
        Mark::Ellipsis => {
            for x in [0.2, 0.5, 0.8] {
                painter.circle_filled(u(x, 0.5), s * 0.09, color);
            }
        }
        Mark::Shift => {
            painter.add(Shape::closed_line(
                vec![
                    u(0.5, 0.08),
                    u(0.92, 0.5),
                    u(0.68, 0.5),
                    u(0.68, 0.9),
                    u(0.32, 0.9),
                    u(0.32, 0.5),
                    u(0.08, 0.5),
                ],
                thin,
            ));
        }
        Mark::Arrow => {
            painter.line_segment([u(0.1, 0.5), u(0.75, 0.5)], thin);
            arrow_head(painter, u(0.92, 0.5), Vec2::new(1.0, 0.0), s * 0.3, color);
        }
        Mark::Bump => {
            painter.add(Shape::convex_polygon(
                vec![u(0.5, 0.15), u(0.9, 0.85), u(0.1, 0.85)],
                color,
                Stroke::NONE,
            ));
        }
    }
}

/// A mark as a widget, `size` square, that tells the accessibility tree its word.
pub fn show(ui: &mut Ui, mark: Mark, size: f32, color: Color32) -> Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Label, true, mark.word()));
    if ui.is_rect_visible(rect) {
        paint(ui.painter(), mark, rect, color);
    }
    response
}

/// A mark that can be clicked, `size` square, telling the accessibility tree `label`.
pub fn button(ui: &mut Ui, mark: Mark, size: f32, color: Color32, label: &str) -> Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(size), Sense::click());
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Button, ui.is_enabled(), label));
    if ui.is_rect_visible(rect) {
        if response.hovered() {
            ui.painter().rect_filled(rect, 3.0, ink::ink_wash(0.1));
        }
        let color = if ui.is_enabled() { color } else { ink::INK3 };
        paint(ui.painter(), mark, rect.shrink(size * 0.15), color);
        if response.has_focus() {
            crate::controls::focus_ring(ui.painter(), rect, 3.0);
        }
    }
    response.on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// A padlock `width` across, centred at `at`.
pub fn padlock(painter: &Painter, at: Pos2, width: f32, color: Color32) {
    let body = Rect::from_center_size(
        at + Vec2::new(0.0, width * 0.25),
        Vec2::new(width, width * 0.75),
    );
    painter.rect_filled(body, width * 0.12, color);
    let shackle: Vec<Pos2> = (0..=10)
        .map(|step| {
            let angle = std::f32::consts::PI * step as f32 / 10.0;
            at + Vec2::new(
                -angle.cos() * width * 0.32,
                -width * 0.12 - angle.sin() * width * 0.42,
            )
        })
        .collect();
    painter.add(Shape::line(
        shackle,
        Stroke::new((width * 0.12).max(1.0), color),
    ));
}

/// Faint diagonal hatching over a rect, for something held out of use.
pub fn hatch(painter: &Painter, rect: Rect, color: Color32) {
    let stroke = Stroke::new(1.0, color);
    let span = rect.width() + rect.height();
    let mut offset = 0.0;
    while offset < span {
        let start = Pos2::new(
            (rect.min.x + offset).min(rect.max.x),
            rect.min.y + (offset - rect.width()).max(0.0),
        );
        let end = Pos2::new(
            rect.min.x + (offset - rect.height()).max(0.0),
            (rect.min.y + offset).min(rect.max.y),
        );
        painter.line_segment([start, end], stroke);
        offset += 6.0;
    }
}

/// A line from `from` ending in an arrowhead at `to`, dashed when asked.
pub fn arrow(painter: &Painter, from: Pos2, to: Pos2, stroke: Stroke, dashed: bool) {
    let delta = to - from;
    let length = delta.length();
    if length <= f32::EPSILON {
        return;
    }
    let dir = delta / length;
    if dashed {
        painter.add(Shape::dashed_line(&[from, to], stroke, 6.0, 4.0));
    } else {
        painter.line_segment([from, to], stroke);
    }
    arrow_head(painter, to, dir, 7.0, stroke.color);
}

pub fn dashed_circle(painter: &Painter, center: Pos2, radius: f32, stroke: Stroke) {
    let points: Vec<Pos2> = (0..=48)
        .map(|step| {
            let angle = std::f32::consts::TAU * step as f32 / 48.0;
            center + Vec2::new(angle.cos(), angle.sin()) * radius
        })
        .collect();
    painter.add(Shape::dashed_line(&points, stroke, 4.0, 3.0));
}

/// A small text tag on a sunk plate, with its `anchor` corner or centre at `at`.
pub fn badge(painter: &Painter, at: Pos2, anchor: Align2, text: &str, color: Color32) {
    let galley = painter.layout_no_wrap(
        text.to_owned(),
        crate::face::TextRole::Count.font_id(),
        color,
    );
    let size = galley.size() + Vec2::new(6.0, 2.0);
    let rect = anchor.anchor_size(at, size);
    painter.rect(
        rect,
        3.0,
        ink::wash(ink::CREAM, 0.9),
        Stroke::new(1.0, ink::ink_wash(0.45)),
        egui::StrokeKind::Inside,
    );
    painter.galley(rect.center() - galley.size() / 2.0, galley, color);
}

fn arrow_head(painter: &Painter, tip: Pos2, dir: Vec2, size: f32, color: Color32) {
    let dir = dir.normalized();
    let side = Vec2::new(-dir.y, dir.x);
    painter.add(Shape::convex_polygon(
        vec![
            tip,
            tip - dir * size + side * size * 0.55,
            tip - dir * size - side * size * 0.55,
        ],
        color,
        Stroke::NONE,
    ));
}

fn arc(painter: &Painter, center: Pos2, radius: f32, from: f32, to: f32, stroke: Stroke) {
    let steps = 24;
    let points: Vec<Pos2> = (0..=steps)
        .map(|step| {
            let angle = from + (to - from) * step as f32 / steps as f32;
            center + Vec2::new(angle.cos(), angle.sin()) * radius
        })
        .collect();
    painter.add(Shape::line(points, stroke));
}

fn load(ctx: &egui::Context, name: &str, png: &[u8]) -> TextureHandle {
    let decoded = image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .unwrap_or_else(|error| panic!("the {name} glyph is not a png: {error}"))
        .to_rgba8();
    let size = [decoded.width() as usize, decoded.height() as usize];
    let pixels = ColorImage::from_rgba_unmultiplied(size, decoded.as_raw());
    ctx.load_texture(format!("kind glyph {name}"), pixels, TextureOptions::LINEAR)
}
