//! Marks painted straight onto a widget, where a label would not fit: a padlock, a small badge,
//! hatching and a dashed ring.

use egui::{Align2, Color32, FontId, Painter, Pos2, Rect, Shape, Stroke, StrokeKind, Vec2};

use crate::{HAIRLINE, color};

const ARROW_HEAD: f32 = 7.0;

/// A padlock `width` across, centred at `at`.
pub fn padlock(painter: &Painter, at: Pos2, width: f32) {
    let body = Rect::from_center_size(
        at + Vec2::new(0.0, width * 0.25),
        Vec2::new(width, width * 0.75),
    );
    painter.rect_filled(body, 1.5, color::MUTED);
    let shackle: Vec<Pos2> = (0..=10)
        .map(|step| {
            let angle = std::f32::consts::PI * step as f32 / 10.0;
            at + Vec2::new(
                -angle.cos() * width * 0.32,
                -width * 0.12 - angle.sin() * width * 0.42,
            )
        })
        .collect();
    painter.add(Shape::line(shackle, Stroke::new(1.5, color::MUTED)));
}

/// A small monospace tag on an input-colored plate, with its `anchor` corner or centre at `at`.
pub fn badge(painter: &Painter, at: Pos2, anchor: Align2, text: &str, ink: Color32) {
    let galley = painter.layout_no_wrap(text.to_owned(), FontId::monospace(10.0), ink);
    let size = galley.size() + Vec2::new(6.0, 2.0);
    let rect = anchor.anchor_size(at, size);
    painter.rect(rect, 3.0, color::INPUT, HAIRLINE, StrokeKind::Inside);
    painter.galley(rect.center() - galley.size() / 2.0, galley, ink);
}

/// Faint diagonal hatching over a rect, for something held out of use.
pub fn hatch(painter: &Painter, rect: Rect) {
    let stroke = Stroke::new(1.0, Color32::from_white_alpha(28));
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
    let side = Vec2::new(-dir.y, dir.x);
    painter.add(Shape::convex_polygon(
        vec![
            to + dir * ARROW_HEAD,
            to - dir * 2.0 + side * ARROW_HEAD * 0.6,
            to - dir * 2.0 - side * ARROW_HEAD * 0.6,
        ],
        stroke.color,
        Stroke::NONE,
    ));
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
