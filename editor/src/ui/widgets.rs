use egui::{
    Align, Color32, CornerRadius, FontId, Layout, Response, RichText, Sense, Stroke, Ui, Vec2,
};

use super::theme;

pub fn section(ui: &mut Ui, text: &str) {
    ui.add_space(6.0);
    ui.label(
        RichText::new(text.to_uppercase())
            .size(11.0)
            .color(theme::MUTED)
            .family(egui::FontFamily::Name("medium".into())),
    );
    ui.add_space(1.0);
}

pub fn section_count(ui: &mut Ui, text: &str, count: impl std::fmt::Display) {
    section(ui, &format!("{text} · {count}"));
}

pub fn kv(ui: &mut Ui, key: &str, value: impl FnOnce(&mut Ui)) {
    ui.horizontal(|ui| {
        ui.add_sized(
            Vec2::new(96.0, ui.spacing().interact_size.y),
            egui::Label::new(theme::muted(key)),
        );
        value(ui);
    });
}

pub fn kv_text(ui: &mut Ui, key: &str, value: impl Into<String>) {
    kv(ui, key, |ui| {
        ui.label(value.into());
    });
}

pub fn kv_code(ui: &mut Ui, key: &str, value: impl Into<String>) {
    kv(ui, key, |ui| {
        ui.label(theme::mono(value.into()));
    });
}

pub fn tab_strip<T: PartialEq + Copy>(ui: &mut Ui, tabs: &[(T, String)], active: &mut T) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;
        for (tab, label) in tabs {
            let selected = *tab == *active;
            let text = RichText::new(label.to_uppercase())
                .size(11.5)
                .family(egui::FontFamily::Name("medium".into()))
                .color(if selected { theme::TEXT } else { theme::MUTED });
            let galley = ui.painter().layout_no_wrap(
                text.text().to_owned(),
                FontId::new(11.5, egui::FontFamily::Name("medium".into())),
                Color32::WHITE,
            );
            let size = Vec2::new(galley.size().x + 24.0, 30.0);
            let (rect, response) = ui.allocate_exact_size(size, Sense::click());
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
                text.text(),
                FontId::new(11.5, egui::FontFamily::Name("medium".into())),
                if selected { theme::TEXT } else { theme::MUTED },
            );
            if selected {
                ui.painter().line_segment(
                    [
                        rect.left_bottom() + Vec2::new(0.0, -1.0),
                        rect.right_bottom() + Vec2::new(0.0, -1.0),
                    ],
                    Stroke::new(2.0, theme::ACCENT),
                );
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
        Stroke::new(1.0, theme::BORDER),
    );
}

pub fn key_hint(ui: &mut Ui, keys: &str) {
    let text = RichText::new(keys)
        .monospace()
        .size(11.0)
        .color(theme::MUTED);
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(3.0)
        .inner_margin(egui::Margin::symmetric(5, 1))
        .show(ui, |ui| {
            ui.label(text);
        });
}

pub fn keyed_button(ui: &mut Ui, label: &str, keys: &str, enabled: bool) -> Response {
    let label_width = ui
        .painter()
        .layout_no_wrap(label.to_owned(), FontId::proportional(14.0), theme::TEXT)
        .size()
        .x;
    let keys_width = ui
        .painter()
        .layout_no_wrap(keys.to_owned(), FontId::monospace(11.0), theme::TEXT)
        .size()
        .x;
    let size = Vec2::new(label_width + keys_width + 36.0, 26.0);
    let (rect, response) = ui.allocate_exact_size(
        size,
        if enabled {
            Sense::click()
        } else {
            Sense::hover()
        },
    );
    let ink = if enabled { theme::TEXT } else { theme::FAINT };
    let fill = if enabled && response.hovered() {
        theme::INPUT
    } else {
        theme::RAISED
    };
    ui.painter().rect(
        rect,
        4.0,
        fill,
        Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    let mut x = rect.min.x + 8.0;
    ui.painter().text(
        egui::pos2(x, rect.center().y),
        egui::Align2::LEFT_CENTER,
        label,
        FontId::new(14.0, egui::FontFamily::Name("medium".into())),
        ink,
    );
    x += label_width + 8.0;
    let cap = egui::Rect::from_min_size(
        egui::pos2(x, rect.center().y - 9.0),
        Vec2::new(keys_width + 10.0, 18.0),
    );
    ui.painter().rect(
        cap,
        3.0,
        theme::INPUT,
        Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        cap.center(),
        egui::Align2::CENTER_CENTER,
        keys,
        FontId::monospace(11.0),
        if enabled { theme::MUTED } else { theme::FAINT },
    );
    if enabled {
        response.on_hover_cursor(egui::CursorIcon::PointingHand)
    } else {
        response
    }
}

pub fn key_hint_text(ui: &mut Ui, keys: &str, text: &str) {
    ui.horizontal(|ui| {
        key_hint(ui, keys);
        ui.label(theme::muted(text));
    });
}

pub fn toggle(ui: &mut Ui, on: &mut bool) -> Response {
    let size = Vec2::new(30.0, 16.0);
    let (rect, mut response) = ui.allocate_exact_size(size, Sense::click());
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }
    let t = ui.ctx().animate_bool(response.id, *on);
    let fill = if *on { theme::ACCENT } else { theme::INPUT };
    ui.painter().rect(
        rect,
        8.0,
        fill,
        Stroke::new(1.0, if *on { theme::ACCENT } else { theme::BORDER }),
        egui::StrokeKind::Inside,
    );
    let knob = egui::pos2(rect.min.x + 8.0 + t * (size.x - 16.0), rect.center().y);
    ui.painter().circle_filled(knob, 5.5, Color32::WHITE);
    response
}

pub fn chip(ui: &mut Ui, text: &str) -> Response {
    chip_coloured(ui, text, theme::RAISED, theme::TEXT)
}

pub fn chip_coloured(ui: &mut Ui, text: &str, fill: Color32, ink: Color32) -> Response {
    let response = egui::Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(10.0)
        .inner_margin(egui::Margin::symmetric(8, 2))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.5).color(ink));
        })
        .response;
    response.interact(Sense::click())
}

pub fn chip_closable(ui: &mut Ui, text: &str) -> (Response, bool) {
    let mut closed = false;
    let response = egui::Frame::new()
        .fill(theme::ACCENT_SOFT)
        .stroke(Stroke::new(1.0, theme::ACCENT))
        .corner_radius(10.0)
        .inner_margin(egui::Margin::symmetric(8, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                ui.label(RichText::new(text).size(12.5).monospace());
                if ui
                    .add(
                        egui::Label::new(RichText::new("✕").size(11.0).color(theme::MUTED))
                            .sense(Sense::click()),
                    )
                    .clicked()
                {
                    closed = true;
                }
            });
        })
        .response;
    (response.interact(Sense::click()), closed)
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

pub const BADGE_SIZE: f32 = 16.0;

pub fn badge(ui: &mut Ui, kind: &str) {
    let colour = theme::badge_colour(kind);
    let letter = theme::badge_letter(kind);
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(BADGE_SIZE), Sense::hover());
    ui.painter().rect_filled(rect, 3.0, colour);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        letter,
        FontId::monospace(11.0),
        Color32::BLACK,
    );
}

pub fn primary(ui: &mut Ui, text: &str) -> Response {
    ui.add(
        egui::Button::new(
            RichText::new(text)
                .color(Color32::WHITE)
                .family(egui::FontFamily::Name("medium".into())),
        )
        .fill(theme::ACCENT)
        .stroke(Stroke::NONE),
    )
}

pub fn danger(ui: &mut Ui, text: &str) -> Response {
    ui.add(
        egui::Button::new(RichText::new(text).color(theme::DANGER))
            .stroke(Stroke::new(1.0, theme::DANGER)),
    )
}

pub fn card_frame(selected: bool) -> egui::Frame {
    egui::Frame::new()
        .fill(theme::RAISED)
        .stroke(Stroke::new(
            1.0,
            if selected {
                theme::ACCENT
            } else {
                theme::BORDER
            },
        ))
        .corner_radius(6.0)
        .inner_margin(egui::Margin::symmetric(10, 8))
}

pub fn card_header(
    ui: &mut Ui,
    kind: &str,
    title: &str,
    subtitle: &str,
    menu: impl FnOnce(&mut Ui),
) -> Response {
    let response = ui
        .horizontal(|ui| {
            ui.label(theme::faint("≡"));
            badge(ui, kind);
            ui.label(theme::strong(title).monospace());
            if !subtitle.is_empty() {
                ui.label(
                    RichText::new(subtitle.to_uppercase())
                        .size(11.0)
                        .color(theme::MUTED),
                );
            }
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.menu_button(theme::faint("…"), menu);
            });
        })
        .response;
    response.interact(Sense::click())
}

pub fn code_block(ui: &mut Ui, text: &str) {
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(8.0)
        .show(ui, |ui| {
            ui.add(egui::Label::new(RichText::new(text).monospace().size(12.5)).selectable(true));
        });
}

pub fn hint(ui: &mut Ui, text: &str) {
    ui.label(RichText::new(text).color(theme::MUTED).size(12.5));
}

pub fn search_box(
    ui: &mut Ui,
    text: &mut String,
    placeholder: &str,
    key: Option<&str>,
) -> Response {
    let mut inner = None;
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(6, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(theme::muted("🔍"));
                let width = ui.available_width() - key.map_or(0.0, |k| 14.0 + 7.0 * k.len() as f32);
                let response = ui.add(
                    egui::TextEdit::singleline(text)
                        .hint_text(placeholder)
                        .frame(egui::Frame::NONE)
                        .desired_width(width.max(40.0)),
                );
                if let Some(key) = key {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| key_hint(ui, key));
                }
                inner = Some(response);
            });
        });
    inner.expect("search field")
}

pub fn plural<N: PartialEq + From<u8>>(count: N) -> &'static str {
    if count == N::from(1) { "" } else { "s" }
}
