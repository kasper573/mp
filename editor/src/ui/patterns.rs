use egui::{Color32, Painter, Pos2, Rect, Stroke};

use super::theme;

pub fn hatch(painter: &Painter, rect: Rect, colour: Color32, scale: f32) {
    painter.rect_filled(rect, 0.0, theme::alpha(colour, colour.a() / 3));
    let step = (scale / 2.0).clamp(3.0, 12.0);
    let mut x = rect.min.x - rect.height();
    while x < rect.max.x {
        let a = Pos2::new(x, rect.max.y);
        let b = Pos2::new(x + rect.height(), rect.min.y);
        if let Some((a, b)) = clip_line(a, b, rect) {
            painter.line_segment([a, b], Stroke::new(1.0, colour));
        }
        x += step;
    }
}

pub fn dots(painter: &Painter, rect: Rect, colour: Color32) {
    painter.rect_filled(rect, 0.0, theme::alpha(colour, 60));
    let step = (rect.width() / 4.0).max(3.0);
    let mut y = rect.min.y + step / 2.0;
    while y < rect.max.y {
        let mut x = rect.min.x + step / 2.0;
        while x < rect.max.x {
            painter.circle_filled(Pos2::new(x, y), (step / 5.0).max(1.0), colour);
            x += step;
        }
        y += step;
    }
}

pub fn grid_lines(painter: &Painter, rect: Rect, colour: Color32) {
    painter.rect_filled(rect, 0.0, theme::alpha(colour, 50));
    let step = (rect.width() / 3.0).max(3.0);
    let stroke = Stroke::new(1.0, colour);
    let mut x = rect.min.x + step;
    while x < rect.max.x {
        painter.line_segment([Pos2::new(x, rect.min.y), Pos2::new(x, rect.max.y)], stroke);
        x += step;
    }
    let mut y = rect.min.y + step;
    while y < rect.max.y {
        painter.line_segment([Pos2::new(rect.min.x, y), Pos2::new(rect.max.x, y)], stroke);
        y += step;
    }
}

pub fn stripes(painter: &Painter, rect: Rect, colour: Color32) {
    painter.rect_filled(rect, 0.0, theme::alpha(colour, 50));
    let step = (rect.height() / 4.0).max(3.0);
    let stroke = Stroke::new(1.0, colour);
    let mut y = rect.min.y + step / 2.0;
    while y < rect.max.y {
        painter.line_segment([Pos2::new(rect.min.x, y), Pos2::new(rect.max.x, y)], stroke);
        y += step;
    }
}

fn clip_line(a: Pos2, b: Pos2, rect: Rect) -> Option<(Pos2, Pos2)> {
    let mut t0 = 0.0f32;
    let mut t1 = 1.0f32;
    let d = b - a;
    for (p, q) in [
        (-d.x, a.x - rect.min.x),
        (d.x, rect.max.x - a.x),
        (-d.y, a.y - rect.min.y),
        (d.y, rect.max.y - a.y),
    ] {
        if p == 0.0 {
            if q < 0.0 {
                return None;
            }
            continue;
        }
        let r = q / p;
        if p < 0.0 {
            t0 = t0.max(r);
        } else {
            t1 = t1.min(r);
        }
        if t0 > t1 {
            return None;
        }
    }
    Some((a + d * t0, a + d * t1))
}
