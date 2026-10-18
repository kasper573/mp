//! The sheet: a parchment window. Vellum, the double rule, the title band, the cross and the
//! curl, with the index tabs and section headings cut into the page.

use egui::epaint::{Mesh, Shadow};
use egui::layers::ShapeIdx;
use egui::{
    Align2, Color32, ColorImage, CornerRadius, Id, InnerResponse, Margin, Painter, Pos2, Rect,
    Response, Sense, Shape, Stroke, StrokeKind, TextureHandle, TextureOptions, Ui, Vec2,
    WidgetInfo, WidgetType,
};

use crate::face::TextRole;
use crate::{controls, ink};

pub const RULE_INSET: f32 = 7.0;
pub const SMALL_RULE_INSET: f32 = 4.0;
pub const TITLE_BAND: f32 = 36.0;
pub const CROSS: f32 = 24.0;
pub const SMALL_CROSS: f32 = 16.0;
pub const CURL: f32 = 24.0;
pub const FILLER: f32 = 34.0;
/// A sheet narrower or shorter than this drops its fillers and shrinks its cross and rule.
pub const SMALL_SHEET: f32 = 160.0;

/// How far back in the stack a sheet lies, which shortens its shadow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Depth {
    Front,
    Behind,
}

pub struct Sheet<'a> {
    pub title: Option<&'a str>,
    pub closable: bool,
    pub curl: bool,
    pub depth: Depth,
}

/// Where a sheet's parts landed, for the interaction laid over them.
pub struct SheetParts {
    pub band: Rect,
    pub cross: Option<Rect>,
    pub curl: Option<Rect>,
    pub body: Rect,
}

impl Sheet<'_> {
    pub fn paint(&self, painter: &Painter, rect: Rect) -> SheetParts {
        self.paint_at(
            painter,
            rect,
            shadow(self.depth),
            ink::wash(Color32::WHITE, 1.0),
        )
    }

    /// Painted with its own shadow and a tint over the whole sheet, for a sheet in motion.
    pub fn paint_at(
        &self,
        painter: &Painter,
        rect: Rect,
        shadow: Shadow,
        tint: Color32,
    ) -> SheetParts {
        let small = rect.width() < SMALL_SHEET || rect.height() < SMALL_SHEET;
        painter.add(shadow.as_shape(rect, CornerRadius::ZERO));
        let painter = painter.with_clip_rect(rect.intersect(painter.clip_rect()));
        vellum(&painter, rect);
        let inset = if small { SMALL_RULE_INSET } else { RULE_INSET };
        rule(&painter, rect, inset);
        let band = Rect::from_min_size(rect.min, Vec2::new(rect.width(), TITLE_BAND));
        let cross_size = if small { SMALL_CROSS } else { CROSS };
        let cross = self.closable.then(|| {
            Rect::from_min_size(
                Pos2::new(rect.max.x - 10.0 - cross_size, rect.min.y + 6.0),
                Vec2::splat(cross_size),
            )
        });
        if let Some(title) = self.title {
            let room = band.shrink2(Vec2::new(cross_size + 14.0, 0.0));
            title_band(&painter, room, title, !small);
        }
        let curl = self
            .curl
            .then(|| Rect::from_min_max(rect.max - Vec2::splat(CURL), rect.max));
        if let Some(curl) = curl {
            paint_curl(&painter, curl);
        }
        let top = if self.title.is_some() {
            band.max.y
        } else {
            rect.min.y + inset + 4.0
        };
        let body = Rect::from_min_max(
            Pos2::new(rect.min.x + inset + 4.0, top),
            rect.max - Vec2::splat(inset + 4.0),
        );
        if tint != Color32::WHITE {
            painter.rect_filled(rect, CornerRadius::ZERO, tint);
        }
        SheetParts {
            band,
            cross,
            curl,
            body,
        }
    }
}

/// Where a sheet's content goes: inside the rule, under the title band when there is one.
pub fn body(rect: Rect, titled: bool) -> Rect {
    let small = rect.width() < SMALL_SHEET || rect.height() < SMALL_SHEET;
    let margin = if small { SMALL_RULE_INSET } else { RULE_INSET } + 4.0;
    let top = if titled {
        rect.min.y + TITLE_BAND
    } else {
        rect.min.y + margin
    };
    Rect::from_min_max(
        Pos2::new(rect.min.x + margin, top),
        rect.max - Vec2::splat(margin),
    )
    .intersect(rect)
}

/// What a full-size sheet adds around its body.
pub fn chrome(titled: bool) -> Vec2 {
    let rect = Rect::from_min_size(Pos2::ZERO, Vec2::splat(4.0 * SMALL_SHEET));
    rect.size() - body(rect, titled).size()
}

pub const fn shadow(depth: Depth) -> Shadow {
    match depth {
        Depth::Front => Shadow {
            offset: [0, 12],
            blur: 18,
            spread: 0,
            color: Color32::from_black_alpha(128),
        },
        Depth::Behind => Shadow {
            offset: [0, 6],
            blur: 10,
            spread: 0,
            color: Color32::from_black_alpha(90),
        },
    }
}

pub const CONTACT_SHADOW: Shadow = Shadow {
    offset: [0, 2],
    blur: 3,
    spread: 0,
    color: Color32::from_black_alpha(90),
};

/// Cream, lighter at the centre and darker toward the edges, under a faint fibre grain.
pub fn vellum(painter: &Painter, rect: Rect) {
    painter.add(Shape::Vec(vellum_shapes(painter.ctx(), rect)));
}

pub fn vellum_shapes(ctx: &egui::Context, rect: Rect) -> Vec<Shape> {
    let mut shapes = vec![Shape::mesh(vignette(rect))];
    let grain = grain(ctx);
    let tile = grain.size_vec2();
    let mut y = rect.min.y;
    while y < rect.max.y {
        let mut x = rect.min.x;
        while x < rect.max.x {
            let cell = Rect::from_min_size(Pos2::new(x, y), tile).intersect(rect);
            let uv = Rect::from_min_max(
                Pos2::ZERO,
                Pos2::new(cell.width() / tile.x, cell.height() / tile.y),
            );
            shapes.push(Shape::image(grain.id(), cell, uv, Color32::WHITE));
            x += tile.x;
        }
        y += tile.y;
    }
    shapes
}

/// A note laid around `add`, as a confirm note is: vellum under a front shadow, and the rule, with
/// no title band, cross or curl.
pub fn note<R>(ui: &mut Ui, padding: Margin, add: impl FnOnce(&mut Ui) -> R) -> InnerResponse<R> {
    let under = ui.painter().add(Shape::Noop);
    let framed = egui::Frame::new().inner_margin(padding).show(ui, add);
    paint_note(ui.painter(), under, framed.response.rect);
    framed
}

/// The note's sheet over `rect`, set into the place `under` kept beneath what was laid on it.
pub fn paint_note(painter: &Painter, under: ShapeIdx, rect: Rect) {
    let mut shapes = vec![
        Shape::Rect(shadow(Depth::Front).as_shape(rect, CornerRadius::ZERO)),
        Shape::Rect(CONTACT_SHADOW.as_shape(rect, CornerRadius::ZERO)),
    ];
    shapes.extend(vellum_shapes(painter.ctx(), rect));
    painter.set(under, Shape::Vec(shapes));
    rule(painter, rect, RULE_INSET);
}

/// The double hairline inside the edge: ink at 50% `inset` in, and at 16% two further.
pub fn rule(painter: &Painter, rect: Rect, inset: f32) {
    painter.rect_stroke(
        rect.shrink(inset),
        CornerRadius::ZERO,
        Stroke::new(1.0, ink::ink_wash(0.5)),
        StrokeKind::Inside,
    );
    painter.rect_stroke(
        rect.shrink(inset + 2.0),
        CornerRadius::ZERO,
        Stroke::new(1.0, ink::ink_wash(0.16)),
        StrokeKind::Inside,
    );
}

/// The title centred in rubric small caps, with a line filler fading out on each side.
pub fn title_band(painter: &Painter, band: Rect, title: &str, fillers: bool) {
    let galley = painter.layout_job(TextRole::Title.job(title, ink::RUBRIC));
    let width = galley.size().x.min(band.width());
    let at = Pos2::new(
        band.center().x - width / 2.0,
        band.center().y - galley.size().y / 2.0,
    );
    let painter = painter.with_clip_rect(band.intersect(painter.clip_rect()));
    painter.galley(at, galley, ink::RUBRIC);
    if !fillers {
        return;
    }
    let y = band.center().y;
    let gap = 10.0;
    let left = Pos2::new(at.x - gap, y);
    let right = Pos2::new(at.x + width + gap, y);
    fading_line(
        &painter,
        left,
        left - Vec2::new(FILLER, 0.0),
        ink::RUBRIC,
        1.0,
    );
    fading_line(
        &painter,
        right,
        right + Vec2::new(FILLER, 0.0),
        ink::RUBRIC,
        1.0,
    );
}

/// A line from `from`, where it is `color`, to `to`, where it has faded out.
pub fn fading_line(painter: &Painter, from: Pos2, to: Pos2, color: Color32, width: f32) {
    let along = to - from;
    if along.length() <= f32::EPSILON {
        return;
    }
    let side = Vec2::new(-along.y, along.x).normalized() * (width / 2.0);
    let clear = ink::wash(color, 0.0);
    let mut mesh = Mesh::default();
    mesh.colored_vertex(from - side, color);
    mesh.colored_vertex(from + side, color);
    mesh.colored_vertex(to + side, clear);
    mesh.colored_vertex(to - side, clear);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    painter.add(Shape::mesh(mesh));
}

/// An ink cross of two bars at ±45°, with a faint wash behind it while hovered.
pub fn cross(painter: &Painter, rect: Rect, hovered: bool) {
    if hovered {
        painter.rect_filled(rect, 3.0, ink::ink_wash(0.1));
    }
    let bar = rect.width() * (16.0 / 24.0) / 2.0;
    let width = if rect.width() < CROSS { 1.5 } else { 2.0 };
    let centre = rect.center();
    let arm = Vec2::splat(bar * std::f32::consts::FRAC_1_SQRT_2);
    let stroke = Stroke::new(width, ink::INK);
    painter.line_segment([centre - arm, centre + arm], stroke);
    painter.line_segment(
        [
            centre + Vec2::new(-arm.x, arm.y),
            centre + Vec2::new(arm.x, -arm.y),
        ],
        stroke,
    );
}

/// Index tabs cut into the page, the active one lifted to `light` with a lip over the baseline.
/// Each tab tells the accessibility tree its label as written.
pub fn tabs<T: PartialEq + Copy>(ui: &mut Ui, tabs: &[(T, String)], active: &mut T) {
    let baseline = ui.painter().add(Shape::Noop);
    let mut lip = None;
    let row = ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        for (tab, label) in tabs {
            let selected = *tab == *active;
            let color = if selected { ink::RUBRIC } else { ink::INK2 };
            let galley = ui.painter().layout_job(TextRole::Tab.job(label, color));
            let size = galley.size() + Vec2::new(24.0, 10.0);
            let (rect, response) = ui.allocate_exact_size(size, Sense::click());
            response.widget_info(|| {
                WidgetInfo::selected(WidgetType::SelectableLabel, true, selected, label)
            });
            let radius = CornerRadius {
                nw: 4,
                ne: 4,
                sw: 0,
                se: 0,
            };
            let fill = if selected {
                ink::LIGHT
            } else if response.hovered() {
                ink::gold_wash(0.2)
            } else {
                ink::ink_wash(0.05)
            };
            let border = ink::ink_wash(if selected { 0.5 } else { 0.35 });
            ui.painter().rect(
                rect,
                radius,
                fill,
                Stroke::new(1.0, border),
                StrokeKind::Inside,
            );
            ui.painter()
                .galley(rect.center() - galley.size() / 2.0, galley, color);
            if response.has_focus() {
                controls::focus_ring(ui.painter(), rect, radius);
            }
            if selected {
                lip = Some(rect);
            }
            if response.clicked() {
                *active = *tab;
            }
        }
    });
    let y = row.response.rect.bottom() - 0.5;
    let span = ui.max_rect().x_range();
    ui.painter().set(
        baseline,
        Shape::line_segment(
            [Pos2::new(span.min, y), Pos2::new(span.max, y)],
            Stroke::new(1.0, ink::ink_wash(0.35)),
        ),
    );
    if let Some(lip) = lip {
        ui.painter().line_segment(
            [Pos2::new(lip.min.x + 1.0, y), Pos2::new(lip.max.x - 1.0, y)],
            Stroke::new(1.0, ink::LIGHT),
        );
    }
    ui.add_space(6.0);
}

/// A rubric small-caps heading followed by a rule fading to the right. The accessibility tree
/// hears the label as written.
pub fn section(ui: &mut Ui, text: &str) {
    ui.add_space(6.0);
    let galley = ui
        .painter()
        .layout_job(TextRole::Section.job(text, ink::RUBRIC));
    let width = ui.available_width();
    let (rect, response) =
        ui.allocate_exact_size(Vec2::new(width, galley.size().y + 2.0), Sense::hover());
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Label, true, text));
    let at = Pos2::new(rect.min.x, rect.center().y - galley.size().y / 2.0);
    let text_width = galley.size().x;
    ui.painter().galley(at, galley, ink::RUBRIC);
    let y = rect.center().y + 0.5;
    fading_line(
        ui.painter(),
        Pos2::new(rect.min.x + text_width + 8.0, y),
        Pos2::new(rect.max.x, y),
        ink::RUBRIC,
        1.0,
    );
    ui.add_space(4.0);
}

/// A scroll area whose thumb is rubric in a faint ink track, the content keeping its own look.
pub fn scroll<R>(
    ui: &mut Ui,
    area: egui::ScrollArea,
    add: impl FnOnce(&mut Ui) -> R,
) -> egui::scroll_area::ScrollAreaOutput<R> {
    let kept = ui.visuals().clone();
    let visuals = ui.visuals_mut();
    for widget in [
        &mut visuals.widgets.inactive,
        &mut visuals.widgets.hovered,
        &mut visuals.widgets.active,
    ] {
        widget.bg_fill = ink::wash(ink::RUBRIC, 0.85);
    }
    visuals.extreme_bg_color = ink::ink_wash(0.1);
    let shown = area.show(ui, |ui| {
        *ui.visuals_mut() = kept.clone();
        add(ui)
    });
    *ui.visuals_mut() = kept;
    shown
}

/// A square ink-ruled box that lies on a sheet: a text field's or a slot's ground.
pub fn sunk(painter: &Painter, rect: Rect, radius: f32) {
    painter.rect(
        rect,
        radius,
        ink::ink_wash(0.06),
        Stroke::new(1.0, ink::ink_wash(0.55)),
        StrokeKind::Inside,
    );
}

const GRAIN: usize = 192;

fn grain(ctx: &egui::Context) -> TextureHandle {
    let id = Id::new("vellum grain");
    if let Some(texture) = ctx.data(|data| data.get_temp::<TextureHandle>(id)) {
        return texture;
    }
    let mut pixels = Vec::with_capacity(GRAIN * GRAIN);
    for y in 0..GRAIN {
        for x in 0..GRAIN {
            let fibre = noise(x as u32, y as u32) % 24;
            let streak = noise(x as u32 / 3, y as u32 * 7) % 9;
            pixels.push(ink::ink_wash((fibre + streak) as f32 / 255.0 * 0.6));
        }
    }
    let texture = ctx.load_texture(
        "vellum grain",
        ColorImage::new([GRAIN, GRAIN], pixels),
        TextureOptions::NEAREST,
    );
    ctx.data_mut(|data| data.insert_temp(id, texture.clone()));
    texture
}

fn noise(x: u32, y: u32) -> u32 {
    let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA77);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^ (h >> 15)
}

const VIGNETTE_CELLS: usize = 12;

fn vignette(rect: Rect) -> Mesh {
    let mut mesh = Mesh::default();
    let cells = VIGNETTE_CELLS;
    for row in 0..=cells {
        for column in 0..=cells {
            let u = column as f32 / cells as f32;
            let v = row as f32 / cells as f32;
            let at = Pos2::new(
                rect.min.x + rect.width() * u,
                rect.min.y + rect.height() * v,
            );
            mesh.colored_vertex(at, tone(u * 2.0 - 1.0, v * 2.0 - 1.0));
        }
    }
    let stride = (cells + 1) as u32;
    for row in 0..cells as u32 {
        for column in 0..cells as u32 {
            let a = row * stride + column;
            mesh.add_triangle(a, a + 1, a + stride);
            mesh.add_triangle(a + 1, a + stride + 1, a + stride);
        }
    }
    mesh
}

fn tone(dx: f32, dy: f32) -> Color32 {
    let distance = (dx.powi(4) + dy.powi(4)).powf(0.25).min(1.0);
    let centre = ink::on(ink::LIGHT, ink::CREAM, smooth(0.0, 0.7, distance));
    let edge = ink::on(centre, ink::CREAM2, smooth(0.7, 1.0, distance));
    ink::on(edge, ink::HONEY, smooth(0.93, 1.0, distance) * 0.7)
}

fn smooth(from: f32, to: f32, at: f32) -> f32 {
    let t = ((at - from) / (to - from)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The corner curls up: the darker underside shows where the page lifts, and the folded flap lies
/// over it, lighter, creased along the fold.
fn paint_curl(painter: &Painter, corner: Rect) {
    let a = Pos2::new(corner.min.x, corner.max.y);
    let b = Pos2::new(corner.max.x, corner.min.y);
    let c = corner.max;
    painter.add(Shape::convex_polygon(
        vec![a, b, c],
        ink::HONEY2,
        Stroke::NONE,
    ));
    let tip = corner.min + Vec2::splat(3.0);
    painter.add(Shape::convex_polygon(
        vec![a, b, tip],
        ink::LIGHT,
        Stroke::new(1.0, ink::ink_wash(0.3)),
    ));
    painter.line_segment([a, b], Stroke::new(1.0, ink::ink_wash(0.45)));
    painter.add(Shape::convex_polygon(
        vec![a + Vec2::new(2.0, 0.0), b + Vec2::new(0.0, 2.0), c],
        ink::ink_wash(0.12),
        Stroke::NONE,
    ));
}

/// A faint wash behind something hovered, as the title band's cross takes.
pub fn hover_wash(painter: &Painter, rect: Rect) {
    painter.rect_filled(rect, 3.0, ink::ink_wash(0.1));
}

/// A label that tells the accessibility tree its text, drawn in a role and colour.
pub fn label(ui: &mut Ui, role: TextRole, text: &str, color: Color32) -> Response {
    ui.add(egui::Label::new(role.widget_text(text, color)).selectable(false))
}

/// Text anchored at a point in a role and colour, straight onto a painter.
pub fn text(
    painter: &Painter,
    at: Pos2,
    anchor: Align2,
    role: TextRole,
    text: &str,
    color: Color32,
) -> Rect {
    let galley = painter.layout_job(role.job(text, color));
    let rect = anchor.anchor_size(at, galley.size());
    painter.galley(rect.min, galley, color);
    rect
}
