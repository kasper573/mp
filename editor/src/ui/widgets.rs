pub use design_tokens::controls::{combo, danger, key_hint, primary};
pub use design_tokens::sheet::{section, section_with, tabs};

use std::fmt::Display;

use design_tokens::face::{Face, TextRole};
use design_tokens::glyph::{self, Mark};
use design_tokens::ink;
use egui::{Align, Color32, FontId, Layout, Rect, Response, RichText, Sense, Stroke, Ui, Vec2};
use engine::core::time::{Seconds, UnixMillis};

use super::theme;
use crate::keymap::EditorKey;

pub fn section_heading(text: &str) -> RichText {
    RichText::new(text)
        .font(Face::SmallCapsBold.id(TextRole::Section.size()))
        .color(ink::RUBRIC)
}

pub fn chip(ui: &mut Ui, text: &str) -> Response {
    chip_colored(ui, text, theme::RAISED, theme::TEXT)
}

pub fn chip_colored(ui: &mut Ui, text: &str, fill: Color32, ink: Color32) -> Response {
    egui::Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(3.0)
        .inner_margin(egui::Margin::symmetric(8, 2))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.5).color(ink));
        })
        .response
        .interact(Sense::click())
}

pub fn card_frame(selected: bool) -> egui::Frame {
    egui::Frame::new()
        .fill(if selected {
            theme::ACCENT_SOFT
        } else {
            ink::ink_wash(0.03)
        })
        .stroke(Stroke::new(
            1.0,
            if selected {
                theme::ACCENT
            } else {
                theme::BORDER
            },
        ))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(10, 8))
}

pub fn section_count(ui: &mut Ui, text: &str, count: impl Display) {
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

pub fn verdict(ui: &mut Ui, ok: bool, text: &str) {
    ui.horizontal_wrapped(|ui| {
        let (mark, color) = if ok {
            (Mark::Tick, theme::OK)
        } else {
            (Mark::Warning, theme::WARN)
        };
        glyph::show(ui, mark, 13.0, color);
        ui.label(RichText::new(text).size(12.5));
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

pub fn keyed_button(ui: &mut Ui, label: &str, key: Option<EditorKey>, enabled: bool) -> Response {
    let keys = key.map(|key| key.name());
    let label_width = ui
        .painter()
        .layout_no_wrap(label.to_owned(), FontId::proportional(14.0), theme::TEXT)
        .size()
        .x;
    let keys_width = keys.as_ref().map_or(0.0, |keys| {
        ui.painter()
            .layout_no_wrap(keys.clone(), FontId::monospace(11.0), theme::TEXT)
            .size()
            .x
            + 18.0
    });
    let size = Vec2::new(label_width + keys_width + 18.0, 26.0);
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
        FontId::new(14.0, theme::medium()),
        ink,
    );
    if let Some(keys) = keys {
        x += label_width + 8.0;
        let cap = Rect::from_min_size(
            egui::pos2(x, rect.center().y - 9.0),
            Vec2::new(keys_width - 8.0, 18.0),
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
    }
    if enabled {
        response.on_hover_cursor(egui::CursorIcon::PointingHand)
    } else {
        response
    }
}

pub fn shortcut_button<'a>(label: impl Into<egui::WidgetText>, key: EditorKey) -> egui::Button<'a> {
    egui::Button::new(label).shortcut_text(key.name())
}

pub fn key_chip(ui: &mut Ui, key: EditorKey) -> Response {
    key_hint(ui, &key.name())
}

pub fn key_hint_text(ui: &mut Ui, key: EditorKey, text: &str) {
    ui.horizontal(|ui| {
        key_chip(ui, key);
        ui.label(theme::muted(text));
    });
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
                if glyph::button(ui, Mark::Cross, 11.0, theme::MUTED, "Remove").clicked() {
                    closed = true;
                }
            });
        })
        .response;
    (response.interact(Sense::click()), closed)
}

pub const BADGE_SIZE: f32 = 16.0;

pub fn badge(ui: &mut Ui, kind: &str) {
    let color = theme::badge_color(kind);
    let letter = theme::badge_letter(kind);
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(BADGE_SIZE), Sense::hover());
    ui.painter().rect_filled(rect, 3.0, color);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        letter,
        FontId::monospace(11.0),
        ink::CREAM,
    );
}

/// An open menu's "Move up" and "Move down" entries for the entry at `index` of `count`: the two
/// indices to swap, once one is picked.
pub fn move_entries(ui: &mut Ui, index: usize, count: usize) -> Option<(usize, usize)> {
    let mut swap = None;
    if index > 0 && ui.button("Move up").clicked() {
        swap = Some((index, index - 1));
    }
    if index + 1 < count && ui.button("Move down").clicked() {
        swap = Some((index, index + 1));
    }
    if swap.is_some() {
        ui.close();
    }
    swap
}

pub fn card_header(
    ui: &mut Ui,
    title: &str,
    subtitle: &str,
    menu: impl FnOnce(&mut Ui),
) -> Response {
    card_header_with(
        ui,
        |ui| {
            ui.label(theme::strong(title).monospace());
        },
        subtitle,
        menu,
    )
}

/// A card's header whose title is drawn by `title`, for one that is more than a name.
pub fn card_header_with(
    ui: &mut Ui,
    title: impl FnOnce(&mut Ui),
    subtitle: &str,
    menu: impl FnOnce(&mut Ui),
) -> Response {
    card_heading(ui, title, subtitle, |ui| {
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.menu_button(theme::faint("…"), menu);
        });
    })
}

pub fn card_title(ui: &mut Ui, title: &str) -> Response {
    card_heading(
        ui,
        |ui| {
            ui.label(theme::strong(title).monospace());
        },
        "",
        |_| {},
    )
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
    key: Option<EditorKey>,
) -> Response {
    let key = key.map(|key| key.name());
    let mut inner = None;
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(6, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                glyph::show(ui, Mark::Glass, 13.0, theme::MUTED);
                let width = ui.available_width()
                    - key.as_ref().map_or(0.0, |k| 14.0 + 7.0 * k.len() as f32);
                let response = ui.add(
                    egui::TextEdit::singleline(text)
                        .hint_text(placeholder)
                        .frame(egui::Frame::NONE)
                        .desired_width(width.max(40.0)),
                );
                if let Some(key) = &key {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| key_hint(ui, key));
                }
                inner = Some(response);
            });
        });
    inner.expect("search field")
}

/// A button in a menu that opens `content` beside it, marked with the editor's own chevron.
pub fn submenu<R>(
    ui: &mut Ui,
    text: impl Into<egui::WidgetText>,
    content: impl FnOnce(&mut Ui) -> R,
) -> Option<R> {
    let button = egui::Button::new(text.into()).right_text("   ");
    let (response, inner) =
        egui::containers::menu::SubMenuButton::from_button(button).ui(ui, content);
    let at = response.rect.right_center() - Vec2::new(10.0, 0.0);
    glyph::paint(
        ui.painter(),
        Mark::ChevronRight,
        Rect::from_center_size(at, Vec2::splat(9.0)),
        theme::MUTED,
    );
    inner.map(|inner| inner.inner)
}

pub fn plural<N: PartialEq + From<u8>>(count: N) -> &'static str {
    if count == N::from(1) { "" } else { "s" }
}

pub fn toggle_chip(ui: &mut Ui, text: &str, on: bool) -> Response {
    let (fill, ink) = if on {
        (theme::ACCENT_SOFT, theme::TEXT)
    } else {
        (theme::RAISED, theme::MUTED)
    };
    chip_colored(ui, text, fill, ink)
}

pub fn mode_chip(ui: &mut Ui, text: &str, on: bool) -> Response {
    let (fill, ink) = if on {
        (ink::LIGHT, ink::RUBRIC)
    } else {
        (ink::ink_wash(0.05), ink::INK2)
    };
    chip_colored(ui, text, fill, ink)
}

pub fn rule(ui: &Ui) {
    let rect = ui.max_rect();
    let y = ui.cursor().min.y;
    ui.painter().line_segment(
        [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
        Stroke::new(1.0, theme::BORDER),
    );
}

pub fn dashed_rect(painter: &egui::Painter, rect: Rect, stroke: Stroke, dash: f32, gap: f32) {
    painter.extend(egui::Shape::dashed_line(
        &[
            rect.left_top(),
            rect.right_top(),
            rect.right_bottom(),
            rect.left_bottom(),
            rect.left_top(),
        ],
        stroke,
        dash,
        gap,
    ));
}

pub fn floating_chip(
    painter: &egui::Painter,
    at: egui::Pos2,
    anchor: egui::Align2,
    text: &str,
    fill: Color32,
    ink: Color32,
    size: f32,
) -> Rect {
    let galley = painter.layout_no_wrap(text.to_owned(), FontId::proportional(size), ink);
    let rect = anchor.anchor_size(at, galley.size() + Vec2::new(10.0, 4.0));
    painter.rect_filled(rect, 3.0, fill);
    painter.rect_stroke(
        rect,
        3.0,
        Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    painter.galley(rect.min + Vec2::new(5.0, 2.0), galley, ink);
    rect
}

pub fn text_within(
    painter: &egui::Painter,
    at: egui::Pos2,
    anchor: egui::Align2,
    text: &str,
    font: FontId,
    ink: Color32,
    width: f32,
) -> Rect {
    let mut job = egui::text::LayoutJob::simple_singleline(text.to_owned(), font, ink);
    job.wrap = egui::text::TextWrapping::truncate_at_width(width);
    let galley = painter.layout_job(job);
    let rect = anchor.anchor_size(at, galley.size());
    painter.galley(rect.min, galley, ink);
    rect
}

pub fn default_focus(ui: &Ui, response: &Response) {
    if ui.memory(|memory| memory.focused().is_none()) {
        response.request_focus();
    }
}

pub fn clip(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

pub fn article(word: &str) -> &'static str {
    if word.starts_with(['a', 'e', 'i', 'o', 'u']) {
        "an"
    } else {
        "a"
    }
}

pub fn join_and(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [one] => one.clone(),
        [head @ .., last] => format!("{} and {last}", head.join(", ")),
    }
}

pub fn thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

pub fn clock(at: UnixMillis, with_seconds: bool) -> String {
    let seconds = (at.0 / 1000) % 86_400;
    let (hours, minutes) = (seconds / 3600, (seconds % 3600) / 60);
    if with_seconds {
        format!("{hours:02}:{minutes:02}:{:02}", seconds % 60)
    } else {
        format!("{hours:02}:{minutes:02} UTC")
    }
}

pub fn ago(elapsed: Seconds) -> String {
    let seconds = elapsed.0.max(0.0) as u64;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let days = hours / 24;
    if seconds < 60 {
        "just now".to_owned()
    } else if minutes < 60 {
        format!("{minutes} min ago")
    } else if hours < 24 {
        format!("{hours} h ago")
    } else if days == 1 {
        "yesterday".to_owned()
    } else if days < 7 {
        format!("{days} days ago")
    } else if days < 14 {
        "last week".to_owned()
    } else if days < 31 {
        format!("{} weeks ago", days / 7)
    } else {
        format!("{} months ago", days / 30)
    }
}

fn card_heading(
    ui: &mut Ui,
    title: impl FnOnce(&mut Ui),
    subtitle: &str,
    trailing: impl FnOnce(&mut Ui),
) -> Response {
    let response = ui
        .horizontal(|ui| {
            ui.set_min_height(ui.spacing().interact_size.y);
            title(ui);
            if !subtitle.is_empty() {
                ui.label(TextRole::Band.widget_text(subtitle, theme::MUTED));
            }
            trailing(ui);
        })
        .response;
    response.interact(Sense::click())
}
