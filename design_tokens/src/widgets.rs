use egui::{
    Color32, CornerRadius, FontId, Response, RichText, Sense, Stroke, StrokeKind, Ui, Vec2,
    WidgetInfo, WidgetType,
};

use crate::{CHIP_RADIUS, HAIRLINE, color, family};

pub fn section(ui: &mut Ui, text: &str) {
    ui.add_space(6.0);
    ui.label(
        RichText::new(text.to_uppercase())
            .size(11.0)
            .color(color::MUTED)
            .family(family::medium()),
    );
    ui.add_space(1.0);
}

/// One row of tabs with the active one underlined. Each tab tells the accessibility tree its own
/// label, as written, though it is drawn in capitals.
pub fn tab_strip<T: PartialEq + Copy>(ui: &mut Ui, tabs: &[(T, String)], active: &mut T) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;
        for (tab, label) in tabs {
            let selected = *tab == *active;
            let caps = label.to_uppercase();
            let font = FontId::new(11.5, family::medium());
            let galley = ui
                .painter()
                .layout_no_wrap(caps.clone(), font.clone(), Color32::WHITE);
            let size = Vec2::new(galley.size().x + 24.0, 30.0);
            let (rect, response) = ui.allocate_exact_size(size, Sense::click());
            response.widget_info(|| {
                WidgetInfo::selected(WidgetType::SelectableLabel, true, selected, label)
            });
            if response.hovered() && !selected {
                ui.painter().rect_filled(
                    rect,
                    CornerRadius::ZERO,
                    Color32::from_rgba_unmultiplied(255, 255, 255, 8),
                );
            }
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                caps,
                font,
                if selected { color::TEXT } else { color::MUTED },
            );
            if selected {
                ui.painter().line_segment(
                    [
                        rect.left_bottom() + Vec2::new(0.0, -1.0),
                        rect.right_bottom() + Vec2::new(0.0, -1.0),
                    ],
                    Stroke::new(2.0, color::ACCENT),
                );
            }
            if response.has_focus() {
                focus_ring(ui, rect, CornerRadius::ZERO);
            }
            if response.clicked() {
                *active = *tab;
            }
        }
    });
    let rect = ui.max_rect();
    let y = ui.cursor().min.y - 1.0;
    ui.painter().line_segment(
        [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
        HAIRLINE,
    );
}

pub fn key_hint(ui: &mut Ui, keys: &str) {
    let text = RichText::new(keys)
        .monospace()
        .size(11.0)
        .color(color::MUTED);
    egui::Frame::new()
        .fill(color::INPUT)
        .stroke(HAIRLINE)
        .corner_radius(3.0)
        .inner_margin(egui::Margin::symmetric(5, 1))
        .show(ui, |ui| {
            ui.label(text);
        });
}

pub fn toggle(ui: &mut Ui, on: &mut bool) -> Response {
    let size = Vec2::new(30.0, 16.0);
    let (rect, mut response) = ui.allocate_exact_size(size, Sense::click());
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }
    let checked = *on;
    response.widget_info(|| WidgetInfo::selected(WidgetType::Checkbox, true, checked, ""));
    let t = ui.ctx().animate_bool(response.id, *on);
    let fill = if *on { color::ACCENT } else { color::INPUT };
    ui.painter().rect(
        rect,
        8.0,
        fill,
        Stroke::new(1.0, if *on { color::ACCENT } else { color::BORDER }),
        StrokeKind::Inside,
    );
    let knob = egui::pos2(rect.min.x + 8.0 + t * (size.x - 16.0), rect.center().y);
    ui.painter().circle_filled(knob, 5.5, Color32::WHITE);
    if response.has_focus() {
        focus_ring(ui, rect, CornerRadius::same(8));
    }
    response
}

pub fn chip(ui: &mut Ui, text: &str) -> Response {
    chip_coloured(ui, text, color::RAISED, color::TEXT)
}

pub fn chip_coloured(ui: &mut Ui, text: &str, fill: Color32, ink: Color32) -> Response {
    let response = egui::Frame::new()
        .fill(fill)
        .stroke(HAIRLINE)
        .corner_radius(CHIP_RADIUS)
        .inner_margin(egui::Margin::symmetric(8, 2))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.5).color(ink));
        })
        .response;
    response.interact(Sense::click())
}

pub fn pill(ui: &mut Ui, text: &str, colour: Color32) -> Response {
    egui::Frame::new()
        .fill(Color32::from_rgba_unmultiplied(
            colour.r(),
            colour.g(),
            colour.b(),
            40,
        ))
        .stroke(Stroke::new(
            1.0,
            Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 120),
        ))
        .corner_radius(12.0)
        .inner_margin(egui::Margin::symmetric(10, 3))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(13.0).color(colour).monospace());
        })
        .response
}

pub fn primary(ui: &mut Ui, text: &str) -> Response {
    let response = ui.add(
        egui::Button::new(
            RichText::new(text)
                .color(Color32::WHITE)
                .family(family::medium()),
        )
        .fill(color::ACCENT)
        .stroke(Stroke::NONE),
    );
    if response.has_focus() {
        focus_ring(
            ui,
            response.rect,
            ui.visuals().widgets.inactive.corner_radius,
        );
    }
    response
}

pub fn danger(ui: &mut Ui, text: &str) -> Response {
    let response = ui.add(
        egui::Button::new(RichText::new(text).color(color::DANGER))
            .stroke(Stroke::new(1.0, color::DANGER)),
    );
    if response.has_focus() {
        focus_ring(
            ui,
            response.rect,
            ui.visuals().widgets.inactive.corner_radius,
        );
    }
    response
}

pub fn card_frame(selected: bool) -> egui::Frame {
    egui::Frame::new()
        .fill(color::RAISED)
        .stroke(Stroke::new(
            1.0,
            if selected {
                color::ACCENT
            } else {
                color::BORDER
            },
        ))
        .corner_radius(6.0)
        .inner_margin(egui::Margin::symmetric(10, 8))
}

fn focus_ring(ui: &Ui, rect: egui::Rect, corner_radius: CornerRadius) {
    ui.painter().rect_stroke(
        rect.expand(2.0),
        corner_radius,
        Stroke::new(1.5, color::SELECTION),
        StrokeKind::Outside,
    );
}
