use egui::{Align2, Key, Pos2, Ui};

use super::graph::GraphAction;
use super::nodes::Catalogue;
use super::{Doc, add_node, nodes};
use crate::app::Editor;
use crate::ui::{theme, widgets};

/// The command palette: every node kind this owner may use, by system, searched by name, blurb
/// and system, chosen by the keys.
pub struct Palette {
    pub at: Option<Pos2>,
    pub place: Option<Pos2>,
    pub link: Option<(String, String)>,
    pub search: String,
    pub fresh: bool,
    pub age: u32,
    cursor: usize,
    open: Vec<&'static str>,
}

impl Palette {
    pub fn new(at: Option<Pos2>, place: Option<Pos2>, link: Option<(String, String)>) -> Palette {
        Palette {
            at,
            place,
            link,
            search: String::new(),
            fresh: true,
            age: 0,
            cursor: 0,
            open: vec!["flow"],
        }
    }
}

const WIDTH: f32 = 292.0;

enum Row {
    Group {
        system: &'static str,
        count: usize,
        kinds: Vec<String>,
    },
    Entry {
        kind: String,
        system: &'static str,
        detail: String,
    },
}

pub fn show(editor: &mut Editor, ui: &Ui, doc: &Doc, _actions: &mut [GraphAction]) {
    let owner = doc.owner.clone();
    let Some(mut palette) = editor
        .views
        .script
        .views
        .get_mut(&owner)
        .and_then(|view| view.palette.take())
    else {
        return;
    };
    let catalogue = editor.views.script.catalogue.as_ref().expect("catalogue");
    let needle = palette.search.trim().to_lowercase();
    let linking = palette.link.is_some();
    let fits: Vec<&nodes::Entry> = catalogue
        .entries
        .iter()
        .filter(|entry| (entry.kind == "on") != linking)
        .filter(|entry| catalogue.refusal(&entry.kind, doc.kind).is_none())
        .collect();
    let total = catalogue.entries.len();
    let rows = if needle.is_empty() {
        grouped(&fits, &palette.open)
    } else {
        searched(&fits, &needle)
    };
    let refused = refused_groups(catalogue, doc, linking);
    let refused_matches: Vec<String> = if needle.is_empty() {
        Vec::new()
    } else {
        catalogue
            .entries
            .iter()
            .filter(|entry| linking != (entry.kind == "on"))
            .filter(|entry| {
                entry.kind.replace('_', " ").contains(&needle)
                    || entry.blurb.to_lowercase().contains(&needle)
            })
            .filter_map(|entry| {
                catalogue.refusal(&entry.kind, doc.kind).map(|reason| {
                    format!(
                        "{} · {} · {}",
                        entry.kind.replace('_', " "),
                        entry.system.replace('_', " "),
                        only_for(&reason)
                    )
                })
            })
            .take(4)
            .collect()
    };
    let entries = rows
        .iter()
        .filter(|row| matches!(row, Row::Entry { .. }))
        .count();
    if rows.is_empty() {
        palette.cursor = 0;
    } else {
        palette.cursor = palette.cursor.min(rows.len() - 1);
    }
    let mut picked: Option<String> = None;
    let mut close = false;
    let (up, down, right, left, enter) = ui.input(|i| {
        (
            i.key_pressed(Key::ArrowUp),
            i.key_pressed(Key::ArrowDown),
            i.key_pressed(Key::ArrowRight),
            i.key_pressed(Key::ArrowLeft),
            i.key_pressed(Key::Enter),
        )
    });
    if down && !rows.is_empty() {
        palette.cursor = (palette.cursor + 1).min(rows.len() - 1);
    }
    if up {
        palette.cursor = palette.cursor.saturating_sub(1);
    }
    let mut toggle: Option<(&'static str, bool)> = None;
    if let Some(Row::Group { system, .. }) = rows.get(palette.cursor) {
        if right {
            toggle = Some((system, true));
        }
        if left {
            toggle = Some((system, false));
        }
        if enter {
            toggle = Some((system, !palette.open.contains(system)));
        }
    } else if let Some(Row::Entry { kind, .. }) = rows.get(palette.cursor)
        && enter
    {
        picked = Some(kind.clone());
    }
    let pos = palette
        .at
        .unwrap_or_else(|| ui.max_rect().center() - egui::vec2(WIDTH / 2.0, 200.0));
    let pos = Pos2::new(
        pos.x
            .min(ui.max_rect().right() - WIDTH - 12.0)
            .max(ui.max_rect().left() + 4.0),
        pos.y.max(ui.max_rect().top() + 4.0),
    );
    let owner_word = doc.kind.name();
    let article = if owner_word.starts_with(['a', 'e', 'i', 'o', 'u']) {
        "an"
    } else {
        "a"
    };
    let mut clicked_row: Option<usize> = None;
    let list_height = ui.max_rect().height() * 0.55;
    let area = egui::Area::new(ui.id().with("palette"))
        .order(egui::Order::Foreground)
        .fixed_pos(pos)
        .pivot(Align2::LEFT_TOP)
        .show(ui.ctx(), |ui| {
            egui::Frame::new()
                .fill(theme::PANEL)
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(6.0)
                .inner_margin(egui::Margin::same(8))
                .shadow(egui::epaint::Shadow { offset: [0, 6], blur: 18, spread: 0, color: egui::Color32::from_black_alpha(140) })
                .show(ui, |ui| {
                    ui.set_width(WIDTH);
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 4.0);
                    let hint = match &palette.link {
                        Some((from, field)) => format!("add after {from} {}", nodes::port_label(doc.nodes(), catalogue, from, field)),
                        None => "type to search".to_owned(),
                    };
                    let response = widgets::search_box(ui, &mut palette.search, &hint, None);
                    if palette.fresh {
                        response.request_focus();
                        palette.fresh = false;
                    }
                    if response.changed() {
                        palette.cursor = 0;
                    }
                    ui.add_space(2.0);
                    let count = if !linking {
                        "ON STARTS A NEW FLOW · SELECT A NODE TO ADD AFTER IT".to_owned()
                    } else if needle.is_empty() {
                        format!("{} OF {total} NODES FIT {} {}", fits.len(), article.to_uppercase(), owner_word.to_uppercase())
                    } else {
                        format!("{entries} OF {total} NODES THAT FIT HERE")
                    };
                    ui.label(theme::faint(count).size(11.0).monospace());
                    if needle.is_empty() && linking {
                        let flow = fits.iter().filter(|e| e.system == "flow").count();
                        let dialogue = fits.iter().filter(|e| e.system == "dialogue").count();
                        let by_system = fits.len() - flow - dialogue;
                        ui.label(theme::faint(format!("FLOW {flow} · DIALOGUE {dialogue} · BY SYSTEM {by_system}")).size(11.0).monospace());
                    }
                    ui.add_space(2.0);
                    egui::ScrollArea::vertical().max_height(list_height).show(ui, |ui| {
                        for (index, row) in rows.iter().enumerate() {
                            let selected = index == palette.cursor;
                            let response = match row {
                                Row::Group { system, count, kinds } => group_row(ui, system, *count, kinds, palette.open.contains(system), selected),
                                Row::Entry { kind, system, detail } => entry_row(ui, kind, system, detail, selected),
                            };
                            if selected && (up || down || right || left) {
                                response.scroll_to_me(None);
                            }
                            if response.clicked() {
                                clicked_row = Some(index);
                            }
                        }
                        if rows.is_empty() {
                            ui.label(theme::muted("nothing matches · words, names and systems all count").size(12.0));
                        }
                    });
                    ui.add_space(2.0);
                    ui.separator();
                    if needle.is_empty() {
                        for (system, count, reason) in &refused {
                            ui.label(theme::faint(format!("{} · {count} · {reason}", system.replace('_', " "))).size(11.5));
                        }
                        if refused.is_empty() {
                            ui.label(theme::faint("every node fits this owner").size(11.5));
                        }
                    } else {
                        for line in &refused_matches {
                            ui.label(theme::faint(line).size(11.5));
                        }
                        ui.label(theme::faint("↑↓ choose · Enter places it at the arrow · words, names and systems all match").size(11.5));
                    }
                    if ui.input(|i| i.key_pressed(Key::Escape)) {
                        close = true;
                    }
                });
        });
    if let Some(index) = clicked_row {
        match &rows[index] {
            Row::Group { system, .. } => toggle = Some((system, !palette.open.contains(system))),
            Row::Entry { kind, .. } => picked = Some(kind.clone()),
        }
        palette.cursor = index;
    }
    if let Some((system, open)) = toggle {
        palette.open.retain(|s| *s != system);
        if open {
            palette.open.push(system);
        }
    }
    if palette.age > 0 && area.response.clicked_elsewhere() {
        close = true;
    }
    palette.age += 1;
    if let Some(kind) = picked {
        let place = palette.place;
        let link = palette.link.clone();
        add_node(editor, doc, &kind, place, link);
        return;
    }
    if !close && let Some(view) = editor.views.script.views.get_mut(&owner) {
        view.palette = Some(palette);
    }
}

fn grouped(fits: &[&nodes::Entry], open: &[&'static str]) -> Vec<Row> {
    let mut systems: Vec<&'static str> = Vec::new();
    for entry in fits {
        if !systems.contains(&entry.system) {
            systems.push(entry.system);
        }
    }
    let mut rows = Vec::new();
    for system in systems {
        let members: Vec<&&nodes::Entry> =
            fits.iter().filter(|entry| entry.system == system).collect();
        rows.push(Row::Group {
            system,
            count: members.len(),
            kinds: members.iter().map(|entry| entry.kind.clone()).collect(),
        });
        if open.contains(&system) {
            rows.extend(members.iter().map(|entry| entry_of(entry)));
        }
    }
    rows
}

fn searched(fits: &[&nodes::Entry], needle: &str) -> Vec<Row> {
    let mut scored: Vec<(u8, &&nodes::Entry)> = fits
        .iter()
        .filter_map(|entry| {
            let name = entry.kind.replace('_', " ");
            let score = if name.starts_with(needle) {
                0
            } else if name.contains(needle) {
                1
            } else if entry.system.contains(needle) {
                2
            } else if entry.blurb.to_lowercase().contains(needle)
                || entry.fields.iter().any(|(field, _)| field.contains(needle))
            {
                3
            } else {
                return None;
            };
            Some((score, entry))
        })
        .collect();
    scored.sort_by_key(|(score, _)| *score);
    scored
        .into_iter()
        .map(|(_, entry)| entry_of(entry))
        .collect()
}

fn entry_of(entry: &nodes::Entry) -> Row {
    let fields: Vec<&str> = entry
        .fields
        .iter()
        .map(|(field, _)| field.as_str())
        .collect();
    let mut detail = fields.join(", ");
    if !entry.outputs.is_empty() {
        if !detail.is_empty() {
            detail.push(' ');
        }
        detail.push_str("→ ");
        detail.push_str(&entry.outputs.join(" · "));
    }
    if detail.is_empty() {
        detail = entry.blurb.to_owned();
    }
    Row::Entry {
        kind: entry.kind.clone(),
        system: entry.system,
        detail,
    }
}

/// The systems whose nodes this owner may not use, with the reason, for the palette's foot.
fn refused_groups(
    catalogue: &Catalogue,
    doc: &Doc,
    linking: bool,
) -> Vec<(&'static str, usize, String)> {
    let mut groups: Vec<(&'static str, usize, String)> = Vec::new();
    for entry in catalogue
        .entries
        .iter()
        .filter(|entry| linking != (entry.kind == "on"))
    {
        let Some(reason) = catalogue.refusal(&entry.kind, doc.kind) else {
            continue;
        };
        let reason = only_for(&reason);
        match groups
            .iter_mut()
            .find(|(system, _, _)| *system == entry.system)
        {
            Some((_, count, _)) => *count += 1,
            None => groups.push((entry.system, 1, reason)),
        }
    }
    groups
}

fn only_for(reason: &str) -> String {
    reason
        .split_once("only ")
        .map(|(_, only)| {
            format!(
                "only for {} owner",
                article_of(only.split(',').next().unwrap_or(only).trim())
            )
        })
        .unwrap_or_else(|| reason.to_owned())
}

fn article_of(word: &str) -> String {
    if word.starts_with(['a', 'e', 'i', 'o', 'u']) {
        format!("an {word}")
    } else {
        format!("a {word}")
    }
}

fn group_row(
    ui: &mut Ui,
    system: &str,
    count: usize,
    kinds: &[String],
    open: bool,
    selected: bool,
) -> egui::Response {
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 22.0), egui::Sense::click());
    if selected {
        ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
    } else if response.hovered() {
        ui.painter().rect_filled(rect, 4.0, theme::RAISED);
    }
    let font = egui::FontId::monospace(12.5);
    let ink = if selected { theme::TEXT } else { theme::MUTED };
    ui.painter().text(
        rect.left_center() + egui::vec2(6.0, 0.0),
        Align2::LEFT_CENTER,
        if open { "▾" } else { "▸" },
        egui::FontId::proportional(11.0),
        theme::FAINT,
    );
    let name = ui.painter().text(
        rect.left_center() + egui::vec2(22.0, 0.0),
        Align2::LEFT_CENTER,
        system.replace('_', " "),
        font.clone(),
        if selected { theme::TEXT } else { theme::CODE },
    );
    let count_text = ui.painter().text(
        rect.right_center() - egui::vec2(6.0, 0.0),
        Align2::RIGHT_CENTER,
        count.to_string(),
        font.clone(),
        theme::FAINT,
    );
    if !open {
        let room = count_text.min.x - name.max.x - 16.0;
        let mut preview = kinds.join(" · ");
        let glyph = 7.2;
        if preview.len() as f32 * glyph > room {
            let keep = ((room / glyph) as usize).saturating_sub(2);
            preview = format!(
                "{} …",
                preview
                    .chars()
                    .take(keep)
                    .collect::<String>()
                    .trim_end_matches([' ', '·'])
            );
        }
        ui.painter().text(
            egui::pos2(name.max.x + 12.0, rect.center().y),
            Align2::LEFT_CENTER,
            preview,
            egui::FontId::proportional(12.0),
            ink.gamma_multiply(0.8),
        );
    }
    response
}

fn entry_row(
    ui: &mut Ui,
    kind: &str,
    system: &str,
    detail: &str,
    selected: bool,
) -> egui::Response {
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 36.0), egui::Sense::click());
    if selected {
        ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
    } else if response.hovered() {
        ui.painter().rect_filled(rect, 4.0, theme::RAISED);
    }
    let ink = if selected {
        theme::TEXT
    } else {
        theme::TEXT.gamma_multiply(0.9)
    };
    ui.painter().text(
        rect.left_top() + egui::vec2(8.0, 5.0),
        Align2::LEFT_TOP,
        kind.replace('_', " "),
        egui::FontId::monospace(13.0),
        ink,
    );
    ui.painter().text(
        rect.right_top() + egui::vec2(-8.0, 6.0),
        Align2::RIGHT_TOP,
        system.replace('_', " "),
        egui::FontId::monospace(11.0),
        theme::FAINT,
    );
    ui.painter().text(
        rect.left_bottom() + egui::vec2(8.0, -5.0),
        Align2::LEFT_BOTTOM,
        detail,
        egui::FontId::proportional(11.5),
        if selected {
            theme::MUTED.gamma_multiply(1.3)
        } else {
            theme::FAINT
        },
    );
    response
}
