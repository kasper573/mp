use std::collections::HashSet;

use egui::{Align2, Key, Pos2, Ui};
use game::core::script::OwnerKindDef;

use super::graph::NodePaletteOpen;
use super::nodes::{NodeCatalogue, NodeEntry};
use super::{ScriptDoc, add_node, nodes};
use crate::app::Editor;
use crate::project::catalogue_of;
use crate::ui::{theme, widgets};

pub struct NodePalette {
    open: NodePaletteOpen,
    search: String,
    frames: u32,
    cursor: usize,
    unfolded: HashSet<&'static str>,
}

impl NodePalette {
    pub fn new(open: NodePaletteOpen) -> NodePalette {
        NodePalette {
            open,
            search: String::new(),
            frames: 0,
            cursor: 0,
            unfolded: HashSet::from(["flow"]),
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

struct Refused {
    system: &'static str,
    count: usize,
    reason: String,
}

pub fn show(editor: &mut Editor, ui: &Ui, doc: &ScriptDoc) {
    let owner = doc.owner.clone();
    let Some(mut palette) = editor
        .views
        .script
        .view_mut(&owner, &editor.user, editor.project.as_ref())
        .palette
        .take()
    else {
        return;
    };
    let catalogue = catalogue_of(editor.project.as_ref());
    let needle = palette.search.trim().to_lowercase();
    let linking = palette.open.link.is_some();
    let (fits, refused) = sorted(catalogue, doc, linking);
    let total = catalogue.entries.len();
    let rows = if needle.is_empty() {
        grouped(&fits, &palette.unfolded)
    } else {
        searched(&fits, &needle)
    };
    let refused_groups = refused_groups(&refused);
    let refused_matches: Vec<String> = if needle.is_empty() {
        Vec::new()
    } else {
        refused
            .iter()
            .filter(|(entry, _)| {
                entry.kind.replace('_', " ").contains(&needle)
                    || entry.blurb.to_lowercase().contains(&needle)
            })
            .map(|(entry, reason)| {
                format!(
                    "{} · {} · {reason}",
                    entry.kind.replace('_', " "),
                    entry.system.replace('_', " ")
                )
            })
            .take(4)
            .collect()
    };
    let entries = rows
        .iter()
        .filter(|row| matches!(row, Row::Entry { .. }))
        .count();
    palette.cursor = palette.cursor.min(rows.len().saturating_sub(1));
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
    match rows.get(palette.cursor) {
        Some(Row::Group { system, .. }) => {
            if right {
                toggle = Some((system, true));
            }
            if left {
                toggle = Some((system, false));
            }
            if enter {
                toggle = Some((system, !palette.unfolded.contains(system)));
            }
        }
        Some(Row::Entry { kind, .. }) if enter => picked = Some(kind.clone()),
        _ => {}
    }
    let pos = Pos2::new(
        palette
            .open
            .at
            .x
            .min(ui.max_rect().right() - WIDTH - 12.0)
            .max(ui.max_rect().left() + 4.0),
        palette.open.at.y.max(ui.max_rect().top() + 4.0),
    );
    let owner_word = doc.kind.name();
    let article = widgets::article(owner_word);
    let mut clicked_row: Option<usize> = None;
    let list_height = ui.max_rect().height() * 0.55;
    let hint = match &palette.open.link {
        Some((from, field)) => format!(
            "add after {from} {}",
            nodes::port_label(doc.nodes(), catalogue, from, field)
        ),
        None => "type to search".to_owned(),
    };
    let count = if !linking {
        "ON STARTS A NEW FLOW · SELECT A NODE TO ADD AFTER IT".to_owned()
    } else if needle.is_empty() {
        format!(
            "{} OF {total} NODES FIT {} {}",
            fits.len(),
            article.to_uppercase(),
            owner_word.to_uppercase()
        )
    } else {
        format!("{entries} OF {total} NODES THAT FIT HERE")
    };
    let by_system = (needle.is_empty() && linking).then(|| {
        let flow = fits.iter().filter(|e| e.system == "flow").count();
        let dialogue = fits.iter().filter(|e| e.system == "dialogue").count();
        format!(
            "FLOW {flow} · DIALOGUE {dialogue} · BY SYSTEM {}",
            fits.len() - flow - dialogue
        )
    });
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
                .shadow(theme::SHADOW)
                .show(ui, |ui| {
                    ui.set_width(WIDTH);
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 4.0);
                    let response = widgets::search_box(ui, &mut palette.search, &hint, None);
                    if palette.frames == 0 {
                        response.request_focus();
                    }
                    if response.changed() {
                        palette.cursor = 0;
                    }
                    ui.add_space(2.0);
                    ui.label(theme::faint(count).size(11.0).monospace());
                    if let Some(by_system) = by_system {
                        ui.label(theme::faint(by_system).size(11.0).monospace());
                    }
                    ui.add_space(2.0);
                    egui::ScrollArea::vertical()
                        .max_height(list_height)
                        .show(ui, |ui| {
                            for (index, row) in rows.iter().enumerate() {
                                let selected = index == palette.cursor;
                                let response = match row {
                                    Row::Group {
                                        system,
                                        count,
                                        kinds,
                                    } => group_row(
                                        ui,
                                        system,
                                        *count,
                                        kinds,
                                        palette.unfolded.contains(system),
                                        selected,
                                    ),
                                    Row::Entry {
                                        kind,
                                        system,
                                        detail,
                                    } => entry_row(ui, kind, system, detail, selected),
                                };
                                if selected && (up || down || right || left) {
                                    response.scroll_to_me(None);
                                }
                                if response.clicked() {
                                    clicked_row = Some(index);
                                }
                            }
                            if rows.is_empty() {
                                ui.label(
                                    theme::muted(
                                        "nothing matches · words, names and systems all count",
                                    )
                                    .size(12.0),
                                );
                            }
                        });
                    ui.add_space(2.0);
                    ui.separator();
                    if needle.is_empty() {
                        for group in &refused_groups {
                            ui.label(
                                theme::faint(format!(
                                    "{} · {} · {}",
                                    group.system.replace('_', " "),
                                    group.count,
                                    group.reason
                                ))
                                .size(11.5),
                            );
                        }
                        if refused_groups.is_empty() {
                            ui.label(theme::faint("every node fits this owner").size(11.5));
                        }
                    } else {
                        for line in &refused_matches {
                            ui.label(theme::faint(line).size(11.5));
                        }
                        ui.label(
                            theme::faint(
                                "↑↓ choose · Enter places it at the arrow · words, names and systems all match",
                            )
                            .size(11.5),
                        );
                    }
                    if ui.input(|i| i.key_pressed(Key::Escape)) {
                        close = true;
                    }
                });
        });
    if let Some(index) = clicked_row {
        match &rows[index] {
            Row::Group { system, .. } => {
                toggle = Some((system, !palette.unfolded.contains(system)));
            }
            Row::Entry { kind, .. } => picked = Some(kind.clone()),
        }
        palette.cursor = index;
    }
    if let Some((system, open)) = toggle {
        if open {
            palette.unfolded.insert(system);
        } else {
            palette.unfolded.remove(system);
        }
    }
    if palette.frames > 0 && area.response.clicked_elsewhere() {
        close = true;
    }
    palette.frames += 1;
    if let Some(kind) = picked {
        let at = palette.open.placed.then_some(palette.open.at);
        add_node(editor, doc, &kind, at, palette.open.link.clone());
        return;
    }
    if !close {
        editor
            .views
            .script
            .view_mut(&owner, &editor.user, editor.project.as_ref())
            .palette = Some(palette);
    }
}

fn sorted<'a>(
    catalogue: &'a NodeCatalogue,
    doc: &ScriptDoc,
    linking: bool,
) -> (Vec<&'a NodeEntry>, Vec<(&'a NodeEntry, String)>) {
    let mut fits = Vec::new();
    let mut refused = Vec::new();
    for entry in catalogue.entries.iter().filter(|entry| entry.fits(linking)) {
        match catalogue.refusal(&entry.kind, doc.kind) {
            Some(refusal) => refused.push((entry, refusal.only_for())),
            None => fits.push(entry),
        }
    }
    (fits, refused)
}

fn grouped(fits: &[&NodeEntry], unfolded: &HashSet<&'static str>) -> Vec<Row> {
    let mut systems: Vec<&'static str> = Vec::new();
    for entry in fits {
        if !systems.contains(&entry.system) {
            systems.push(entry.system);
        }
    }
    let mut rows = Vec::new();
    for system in systems {
        let members: Vec<&&NodeEntry> =
            fits.iter().filter(|entry| entry.system == system).collect();
        rows.push(Row::Group {
            system,
            count: members.len(),
            kinds: members.iter().map(|entry| entry.kind.clone()).collect(),
        });
        if unfolded.contains(system) {
            rows.extend(members.iter().map(|entry| entry_of(entry)));
        }
    }
    rows
}

fn searched(fits: &[&NodeEntry], needle: &str) -> Vec<Row> {
    let mut scored: Vec<(u8, &&NodeEntry)> = fits
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

fn entry_of(entry: &NodeEntry) -> Row {
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

fn refused_groups(refused: &[(&NodeEntry, String)]) -> Vec<Refused> {
    let mut groups: Vec<Refused> = Vec::new();
    for (entry, reason) in refused {
        match groups.iter_mut().find(|group| group.system == entry.system) {
            Some(group) => group.count += 1,
            None => groups.push(Refused {
                system: entry.system,
                count: 1,
                reason: reason.clone(),
            }),
        }
    }
    groups
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
        widgets::text_within(
            ui.painter(),
            egui::pos2(name.max.x + 12.0, rect.center().y),
            Align2::LEFT_CENTER,
            &kinds.join(" · "),
            egui::FontId::proportional(12.0),
            ink.gamma_multiply(0.8),
            count_text.min.x - name.max.x - 16.0,
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
