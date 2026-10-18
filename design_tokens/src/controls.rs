use std::ops::RangeInclusive;
use std::sync::Arc;

use egui::emath::GuiRounding;
use egui::emath::Rot2;
use egui::epaint::{Mesh, Shadow, TextShape};
use egui::{
    Align, Align2, Color32, CornerRadius, InnerResponse, Key, Margin, Painter, Pos2, Rangef, Rect,
    Response, Sense, Shape, Stroke, StrokeKind, Ui, UiBuilder, Vec2, WidgetInfo, WidgetText,
    WidgetType,
};

use crate::face::{Face, TextRole};
use crate::glyph::{self, Mark};
use crate::{ink, sheet};

/// Every control stands this tall, so an icon-only button lines up with the text buttons beside it.
pub const CONTROL_HEIGHT: f32 = 26.0;
pub const BUTTON_PADDING: Vec2 = Vec2::new(12.0, 4.0);
pub const RADIUS: f32 = 4.0;
pub const SLOT: f32 = 36.0;
pub const SLOT_ICON: f32 = 30.0;
pub const PILL_HEIGHT: f32 = 20.0;
const BEAD: f32 = 6.0;
const LIFT: Shadow = Shadow {
    offset: [0, 2],
    blur: 4,
    spread: 0,
    color: Color32::from_black_alpha(70),
};

pub fn button(ui: &mut Ui, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), None, Look::Outline)
}

pub fn primary(ui: &mut Ui, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), None, Look::Primary)
}

pub fn danger(ui: &mut Ui, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), None, Look::Danger)
}

pub fn faded(ui: &mut Ui, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), None, Look::Faded)
}

pub fn marked(ui: &mut Ui, mark: Mark, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), Some(mark), Look::Outline)
}

pub fn marked_primary(ui: &mut Ui, mark: Mark, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), Some(mark), Look::Primary)
}

pub fn marked_danger(ui: &mut Ui, mark: Mark, text: impl Into<WidgetText>) -> Response {
    button_look(ui, text.into(), Some(mark), Look::Danger)
}

pub fn checkbox(ui: &mut Ui, on: &mut bool, text: impl Into<WidgetText>) -> Response {
    ui.checkbox(on, text)
}

pub fn slider(ui: &mut Ui, value: &mut f32, range: RangeInclusive<f32>) -> Response {
    let width = ui.spacing().slider_width;
    let (rect, mut response) =
        ui.allocate_exact_size(Vec2::new(width, CONTROL_HEIGHT), Sense::click_and_drag());
    let (low, high) = (*range.start(), *range.end());
    let span = (high - low).max(f32::EPSILON);
    let rail = Rangef::new(rect.min.x + BEAD, rect.max.x - BEAD);
    let mut wanted = *value;
    if (response.dragged() || response.is_pointer_button_down_on())
        && let Some(pointer) = response.interact_pointer_pos()
    {
        let t = ((pointer.x - rail.min) / rail.span()).clamp(0.0, 1.0);
        wanted = low + t * span;
    }
    if response.has_focus() {
        let step = span / 100.0;
        let (left, right) = ui.input(|input| {
            (
                input.key_pressed(Key::ArrowLeft),
                input.key_pressed(Key::ArrowRight),
            )
        });
        if left {
            wanted -= step;
        }
        if right {
            wanted += step;
        }
    }
    let wanted = wanted.clamp(low.min(high), high.max(low));
    if wanted != *value {
        *value = wanted;
        response.mark_changed();
    }
    let shown = *value;
    response.widget_info(|| WidgetInfo::slider(ui.is_enabled(), f64::from(shown), ""));
    let t = ((shown - low) / span).clamp(0.0, 1.0);
    let y = rect.center().y;
    let at = Pos2::new(rail.min + rail.span() * t, y);
    let painter = ui.painter();
    painter.hline(rail, y, Stroke::new(1.0, ink::ink_wash(0.35)));
    painter.line_segment([Pos2::new(rail.min, y), at], Stroke::new(2.0, ink::RUBRIC));
    painter.circle(at, BEAD, ink::GOLD, Stroke::new(1.0, ink::INK));
    if response.has_focus() {
        focus_ring(
            painter,
            Rect::from_center_size(at, Vec2::splat(BEAD * 2.0)),
            BEAD,
        );
    }
    response
}

pub fn combo(id_salt: impl egui::AsIdSalt) -> egui::ComboBox {
    egui::ComboBox::from_id_salt(id_salt)
        .popup_style(egui::style::StyleModifier::from(
            crate::popup_style as fn(&mut egui::Style),
        ))
        .icon(|ui, rect, visuals, _open| {
            glyph::paint(
                ui.painter(),
                Mark::ChevronDown,
                rect,
                visuals.fg_stroke.color,
            );
        })
}

pub fn text_field(ui: &mut Ui, edit: egui::TextEdit<'_>) -> Response {
    let under = ui.painter().add(Shape::Noop);
    let response = ui.add(
        edit.frame(egui::Frame::new().inner_margin(Margin::symmetric(6, 4)))
            .background_color(Color32::TRANSPARENT),
    );
    let rect = response.rect;
    let focused = response.has_focus();
    let rule_y = rect.max.y - 0.5;
    ui.painter().set(
        under,
        Shape::Vec(vec![
            Shape::rect_filled(rect, 3.0, ink::ink_wash(0.04)),
            Shape::line_segment(
                [Pos2::new(rect.min.x, rule_y), Pos2::new(rect.max.x, rule_y)],
                Stroke::new(1.0, ink::ink_wash(if focused { 0.9 } else { 0.35 })),
            ),
        ]),
    );
    if focused {
        focus_ring(ui.painter(), rect, 3.0);
    }
    response
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pill {
    Gold,
    Rubric,
    Azure,
    Verdigris,
    Ink,
}

impl Pill {
    pub fn color(self) -> Color32 {
        match self {
            Pill::Gold => ink::GOLD,
            Pill::Rubric => ink::RUBRIC,
            Pill::Azure => ink::AZURE,
            Pill::Verdigris => ink::VERDIGRIS,
            Pill::Ink => ink::INK,
        }
    }
}

pub fn pill(ui: &mut Ui, text: &str, pill: Pill) -> Response {
    pill_with(ui, pill, |ui| {
        ui.add(egui::Label::new(text).selectable(false));
    })
    .response
}

pub fn pill_with<R>(ui: &mut Ui, pill: Pill, add: impl FnOnce(&mut Ui) -> R) -> InnerResponse<R> {
    let color = pill.color();
    egui::Frame::new()
        .fill(ink::white_wash(0.25))
        .stroke(Stroke::new(1.0, color))
        .corner_radius(PILL_HEIGHT / 2.0)
        .inner_margin(Margin::symmetric(8, 1))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 3.0;
                ui.style_mut().override_font_id = Some(Face::BookBold.id(12.0));
                ui.visuals_mut().override_text_color = Some(color);
                add(ui)
            })
            .inner
        })
}

pub fn key_hint(ui: &mut Ui, keys: &str) -> Response {
    egui::Frame::new()
        .stroke(Stroke::new(1.0, ink::ink_wash(0.35)))
        .corner_radius(3.0)
        .inner_margin(Margin::symmetric(5, 1))
        .show(ui, |ui| {
            ui.add(
                egui::Label::new(TextRole::KeyHint.rich(keys).color(ink::INK3)).selectable(false),
            );
        })
        .response
}

pub fn stamp(painter: &Painter, center: Pos2, word: &str, color: Color32) {
    let galley = painter.layout_job(TextRole::Section.job(word, color));
    let angle = -8.0_f32.to_radians();
    let half = (galley.size() + Vec2::new(12.0, 4.0)) / 2.0;
    let rot = Rot2::from_angle(angle);
    let corners = vec![
        center + rot * Vec2::new(-half.x, -half.y),
        center + rot * Vec2::new(half.x, -half.y),
        center + rot * Vec2::new(half.x, half.y),
        center + rot * Vec2::new(-half.x, half.y),
    ];
    painter.add(Shape::closed_line(corners, Stroke::new(1.5, color)));
    painter.add(Shape::Text(
        TextShape::new(center, galley, color).with_angle_and_anchor(angle, Align2::CENTER_CENTER),
    ));
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RowLook {
    pub selected: bool,
    pub faint: bool,
    pub failed: bool,
}

pub fn row<R>(ui: &mut Ui, look: RowLook, add: impl FnOnce(&mut Ui) -> R) -> InnerResponse<R> {
    let under = ui.painter().add(Shape::Noop);
    let width = ui.available_width();
    let shown = ui.scope_builder(UiBuilder::new().sense(Sense::click()), |ui| {
        ui.set_width(width);
        if look.failed {
            ui.visuals_mut().override_text_color = Some(ink::RUBRIC);
        } else if look.faint {
            ui.visuals_mut().override_text_color = Some(ink::INK3);
        }
        egui::Frame::new()
            .inner_margin(Margin::symmetric(8, 5))
            .show(ui, add)
            .inner
    });
    let rect = shown.response.rect;
    let shapes = row_marks(rect, shown.response.hovered(), look.selected);
    ui.painter().set(under, shapes);
    if shown.response.has_focus() {
        focus_ring(ui.painter(), rect, 0.0);
    }
    shown
}

pub fn row_marks(rect: Rect, hovered: bool, selected: bool) -> Shape {
    let mut shapes = Vec::new();
    if hovered || selected {
        shapes.push(Shape::rect_filled(rect, 0.0, ink::gold_wash(0.2)));
    }
    if selected {
        shapes.push(Shape::rect_filled(
            Rect::from_min_size(rect.min, Vec2::new(3.0, rect.height())),
            0.0,
            ink::RUBRIC,
        ));
    }
    let y = rect.max.y - 0.5;
    shapes.push(Shape::line_segment(
        [Pos2::new(rect.min.x, y), Pos2::new(rect.max.x, y)],
        Stroke::new(1.0, ink::ink_wash(0.18)),
    ));
    Shape::Vec(shapes)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SlotLook {
    pub filled: bool,
    pub hovered: bool,
    pub refused: bool,
}

pub fn slot_frame(painter: &Painter, rect: Rect, look: SlotLook) {
    if look.hovered {
        painter.rect(
            rect,
            3.0,
            ink::gold_wash(0.28),
            Stroke::new(1.0, ink::OCHRE),
            StrokeKind::Inside,
        );
    } else if look.filled {
        sheet::sunk(painter, rect, 3.0);
        painter.line_segment(
            [
                rect.left_top() + Vec2::new(1.0, 1.5),
                rect.right_top() + Vec2::new(-1.0, 1.5),
            ],
            Stroke::new(1.0, ink::ink_wash(0.12)),
        );
    } else {
        dashed_border(painter, rect, ink::ink_wash(0.3));
    }
    if look.refused {
        glyph::hatch(painter, rect.shrink(1.0), ink::ink_wash(0.35));
    }
}

pub fn slot_count(painter: &Painter, rect: Rect, count: u32) {
    glyph::haloed(
        painter,
        rect.right_bottom() - Vec2::new(2.0, 1.0),
        Align2::RIGHT_BOTTOM,
        &count.to_string(),
        TextRole::Count.font_id(),
        ink::INK,
        glyph::Halo {
            color: ink::CREAM,
            width: 1.0,
        },
    );
}

pub fn slot_pill(painter: &Painter, rect: Rect, text: &str) {
    let galley = painter.layout_no_wrap(text.to_owned(), Face::BookBold.id(9.0), ink::GOLD);
    let size = galley.size() + Vec2::new(6.0, 1.0);
    let pill = Rect::from_min_size(rect.min + Vec2::new(1.0, 1.0), size);
    painter.rect(
        pill,
        size.y / 2.0,
        ink::wash(ink::CREAM, 0.9),
        Stroke::new(1.0, ink::GOLD),
        StrokeKind::Inside,
    );
    painter.galley(pill.center() - galley.size() / 2.0, galley, ink::GOLD);
}

pub fn slot_lozenge(painter: &Painter, rect: Rect) {
    let centre = rect.right_top() + Vec2::new(-6.0, 6.0);
    painter.add(Shape::convex_polygon(
        vec![
            centre + Vec2::new(0.0, -4.0),
            centre + Vec2::new(3.0, 0.0),
            centre + Vec2::new(0.0, 4.0),
            centre + Vec2::new(-3.0, 0.0),
        ],
        ink::GOLD,
        Stroke::new(1.0, ink::wash(ink::CREAM, 0.8)),
    ));
}

pub fn focus_ring(painter: &Painter, rect: Rect, corner_radius: impl Into<CornerRadius>) {
    painter.rect_stroke(
        rect.expand(2.0),
        corner_radius,
        Stroke::new(2.0, ink::GOLD),
        StrokeKind::Outside,
    );
}

const PRIMED_HUM_HZ: f64 = 1.6;
const PRIMED_TURNS_PER_SEC: f64 = 0.7;
const PRIMED_STEPS: usize = 96;
const PRIMED_TAIL: f32 = 0.32;

/// A slot armed and waiting on its target: a green outline humming in and out, with two glows
/// running round it.
pub fn primed_ring(painter: &Painter, rect: Rect, time: f64) {
    let ring = rect.expand(1.5);
    let hum = 0.5 + 0.5 * (time * PRIMED_HUM_HZ * std::f64::consts::TAU).sin() as f32;
    painter.rect_stroke(
        ring,
        3.0,
        Stroke::new(1.0, ink::wash(ink::SPRING, 0.3 + 0.3 * hum)),
        StrokeKind::Middle,
    );
    let turn = (time * PRIMED_TURNS_PER_SEC).fract() as f32;
    let points = perimeter(ring, PRIMED_STEPS);
    for (step, pair) in points.windows(2).enumerate() {
        let along = step as f32 / PRIMED_STEPS as f32;
        let glow: f32 = [turn, (turn + 0.5).fract()]
            .iter()
            .map(|head| {
                let behind = (head - along).rem_euclid(1.0);
                (1.0 - behind / PRIMED_TAIL).max(0.0).powi(2)
            })
            .sum::<f32>()
            .min(1.0);
        if glow <= 0.0 {
            continue;
        }
        let segment = [pair[0], pair[1]];
        let lift = 0.75 + 0.25 * hum;
        painter.line_segment(
            segment,
            Stroke::new(4.0, ink::wash(ink::SPRING, 0.3 * glow * lift)),
        );
        painter.line_segment(
            segment,
            Stroke::new(2.0, ink::wash(ink::SPRING, glow * lift)),
        );
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Look {
    Outline,
    Primary,
    Danger,
    Faded,
}

fn button_look(ui: &mut Ui, text: WidgetText, mark: Option<Mark>, look: Look) -> Response {
    let mut job = Arc::unwrap_or_clone(text.into_layout_job(
        ui.style(),
        TextRole::Button.font_id().into(),
        Align::Center,
    ));
    // The look decides the text's ink: a primary's cream would vanish under any ink the text brings.
    for section in &mut job.sections {
        section.format.color = Color32::PLACEHOLDER;
    }
    job.wrap.max_width = f32::INFINITY;
    let galley = ui.painter().layout_job(job);
    let mark_room = if mark.is_some() { 20.0 } else { 0.0 };
    let size = Vec2::new(
        galley.size().x + mark_room + BUTTON_PADDING.x * 2.0,
        CONTROL_HEIGHT,
    );
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    let label = galley.text().to_owned();
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Button, ui.is_enabled(), &label));
    if !ui.is_rect_visible(rect) {
        return response;
    }
    let enabled = ui.is_enabled();
    let hovered = enabled && response.hovered();
    let pressed = hovered && response.is_pointer_button_down_on();
    let drawn = if hovered && !pressed {
        rect.translate(Vec2::new(0.0, -1.0))
    } else {
        rect
    };
    let painter = ui.painter();
    if hovered && !pressed {
        painter.add(LIFT.as_shape(drawn, RADIUS));
    }
    let (fill, line, text_color) = match (look, enabled) {
        (_, false) | (Look::Faded, true) => (Color32::TRANSPARENT, ink::ink_wash(0.3), ink::INK3),
        (Look::Outline, true) => (
            if pressed {
                ink::ink_wash(0.08)
            } else {
                Color32::TRANSPARENT
            },
            ink::INK,
            ink::INK,
        ),
        (Look::Primary, true) => (
            if pressed { ink::INK2 } else { ink::INK },
            ink::INK,
            ink::CREAM,
        ),
        (Look::Danger, true) => (
            if pressed {
                ink::wash(ink::RUBRIC, 0.08)
            } else {
                Color32::TRANSPARENT
            },
            ink::RUBRIC,
            ink::RUBRIC,
        ),
    };
    painter.rect(
        drawn,
        RADIUS,
        fill,
        Stroke::new(1.0, line),
        StrokeKind::Inside,
    );
    let mut text_at = drawn.center() - galley.size() / 2.0;
    if let Some(mark) = mark {
        text_at.x += mark_room / 2.0;
        let mark_rect = Rect::from_center_size(
            Pos2::new(text_at.x - mark_room / 2.0 - 4.0, drawn.center().y),
            Vec2::splat(13.0),
        );
        glyph::paint(painter, mark, mark_rect, text_color);
    }
    painter.galley(text_at, galley, text_color);
    if response.has_focus() {
        focus_ring(painter, drawn, RADIUS);
    }
    response
}

/// Dashes as plain pixel quads in one mesh: an empty bag is dozens of these, and egui would feather
/// each dash of a dashed line as a stroke of its own.
fn dashed_border(painter: &Painter, rect: Rect, color: Color32) {
    const DASH: f32 = 3.0;
    let rect = rect.round_to_pixels(painter.pixels_per_point());
    let dashes =
        2.0 * ((rect.width() / (2.0 * DASH)).ceil() + (rect.height() / (2.0 * DASH)).ceil());
    let mut mesh = Mesh::default();
    mesh.reserve_vertices(4 * dashes as usize);
    mesh.reserve_triangles(2 * dashes as usize);
    let mut along = |from: Pos2, direction: Vec2, length: f32, thickness: Vec2| {
        let mut at = 0.0;
        while at < length {
            let dash = DASH.min(length - at);
            let start = from + direction * at;
            mesh.add_colored_rect(
                Rect::from_two_pos(start, start + direction * dash + thickness),
                color,
            );
            at += 2.0 * DASH;
        }
    };
    let (width, height) = (rect.width(), rect.height());
    along(rect.left_top(), Vec2::X, width, Vec2::Y);
    along(rect.left_bottom() - Vec2::Y, Vec2::X, width, Vec2::Y);
    along(rect.left_top(), Vec2::Y, height, Vec2::X);
    along(rect.right_top() - Vec2::X, Vec2::Y, height, Vec2::X);
    painter.add(Shape::mesh(mesh));
}

/// `steps + 1` points evenly spaced round the rectangle's edge, clockwise from its top left corner,
/// the last one back on the first.
fn perimeter(rect: Rect, steps: usize) -> Vec<Pos2> {
    let (width, height) = (rect.width(), rect.height());
    let length = 2.0 * (width + height);
    (0..=steps)
        .map(|step| {
            let reach = (step as f32 / steps as f32 * length) % length;
            if reach < width {
                Pos2::new(rect.min.x + reach, rect.min.y)
            } else if reach < width + height {
                Pos2::new(rect.max.x, rect.min.y + reach - width)
            } else if reach < 2.0 * width + height {
                Pos2::new(rect.max.x - (reach - width - height), rect.max.y)
            } else {
                Pos2::new(rect.min.x, rect.max.y - (reach - 2.0 * width - height))
            }
        })
        .collect()
}
