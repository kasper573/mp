use std::sync::Arc;

use egui::{Key, Pos2, Rect, Ui, Vec2};
use game::core::content::Content;
use game::core::math::Pos;
use game::core::tiling::{TilePos, Tiles};

use super::atlas::Atlas;
use super::canvas::{
    Frame, Placed, card_at, edge_at, edge_segments, note_rect, placed_of, tile_at,
};
use super::{
    Layout, Part, card_rect, round2, select, tidy_regions, write_layout, write_layout_merging,
};
use crate::app::Editor;
use crate::views::area as area_view;

const SNAP_PX: f32 = 8.0;

pub enum Drag {
    Cards {
        from: Pos2,
        origin: Layout,
        moved: bool,
    },
    Note {
        index: usize,
        from: Pos2,
        origin: Pos2,
    },
    Resize {
        key: String,
        start_size: u32,
        from: Pos2,
        center: Pos2,
    },
    Box {
        from: Pos2,
    },
}

#[allow(clippy::too_many_arguments)]
pub fn run(
    editor: &mut Editor,
    ui: &mut Ui,
    response: &egui::Response,
    atlas: &Arc<Atlas>,
    stored: &Layout,
    frame: &Frame,
    placed: &[Placed],
    hovered: Option<String>,
    typing: bool,
    content: Content,
) {
    let modifiers = ui.input(|i| i.modifiers);
    let space = ui.input(|i| i.key_down(Key::Space));
    let pointer = response.hover_pos();
    let selected = editor.views.world.selected.clone();
    if ui.input(|i| i.key_pressed(Key::Escape)) && editor.views.world.drag.is_some() {
        editor.views.world.drag = None;
        editor.views.world.preview = None;
        editor.views.world.drag_note = None;
    }
    if response.drag_started_by(egui::PointerButton::Primary) && !space {
        let from = ui
            .input(|i| i.pointer.press_origin())
            .or_else(|| response.interact_pointer_pos())
            .unwrap_or_default();
        if let Some((key, center)) = corner_at(placed, &selected, from) {
            let start_size = stored.cards[&key].size;
            editor.views.world.drag = Some(Drag::Resize {
                key,
                start_size,
                from,
                center,
            });
        } else if let Some(index) = note_at(stored, frame, from) {
            let note = &stored.notes[index];
            select(editor, vec![Part::Note(index)]);
            editor.views.world.drag = Some(Drag::Note {
                index,
                from,
                origin: Pos2::new(note.x, note.y),
            });
        } else if let Some(key) = card_at(placed, from) {
            let part = Part::Card(key);
            if !editor.views.world.selected.contains(&part) {
                select(editor, vec![part]);
            }
            editor.views.world.drag = Some(Drag::Cards {
                from,
                origin: stored.clone(),
                moved: false,
            });
        } else if let Some((a, b)) = edge_at(&edge_segments(atlas, placed), from) {
            select(editor, vec![Part::Edge(a, b)]);
            editor.views.world.drag = None;
        } else if let Some(index) = region_label_at(atlas, stored, frame, from) {
            let keys = stored.regions[index]
                .cards
                .iter()
                .map(|key| Part::Card(key.clone()))
                .collect();
            select(editor, keys);
            editor.views.world.drag = Some(Drag::Cards {
                from,
                origin: stored.clone(),
                moved: false,
            });
        } else {
            editor.views.world.drag = Some(Drag::Box { from });
        }
    }
    if response.dragged_by(egui::PointerButton::Primary)
        && let Some(p) = pointer.or_else(|| response.interact_pointer_pos())
    {
        match editor.views.world.drag.take() {
            Some(Drag::Cards {
                from,
                origin,
                moved,
            }) => {
                let moved = moved || (p - from).length() > 3.0;
                let keys: Vec<String> = editor
                    .views
                    .world
                    .selected
                    .iter()
                    .filter_map(|part| match part {
                        Part::Card(key) => Some(key.clone()),
                        _ => None,
                    })
                    .collect();
                let delta = (p - from) / frame.zoom;
                let (snapped, note) = if modifiers.alt {
                    (delta, None)
                } else {
                    snap_delta(atlas, &origin, &keys, delta, frame.zoom)
                };
                let mut next = origin.clone();
                for key in &keys {
                    if let (Some(card), Some(was)) =
                        (next.cards.get_mut(key), origin.cards.get(key))
                    {
                        card.x = round2(was.x + snapped.x);
                        card.y = round2(was.y + snapped.y);
                    }
                }
                editor.views.world.preview = moved.then_some(next);
                editor.views.world.drag_note = note;
                editor.views.world.drag = Some(Drag::Cards {
                    from,
                    origin,
                    moved,
                });
            }
            Some(Drag::Note {
                index,
                from,
                origin,
            }) => {
                let delta = (p - from) / frame.zoom;
                let mut next = stored.clone();
                if let Some(note) = next.notes.get_mut(index) {
                    note.x = round2(origin.x + delta.x);
                    note.y = round2(origin.y + delta.y);
                }
                editor.views.world.preview = Some(next);
                editor.views.world.drag = Some(Drag::Note {
                    index,
                    from,
                    origin,
                });
            }
            Some(Drag::Resize {
                key,
                start_size,
                from,
                center,
            }) => {
                let was = (from - center).length().max(1.0);
                let now = (p - center).length();
                let raw = start_size as f32 * now / was;
                let size = if modifiers.shift {
                    raw.round()
                } else {
                    (raw / 5.0).round() * 5.0
                };
                let size = (size as u32).clamp(10, 400);
                let mut next = stored.clone();
                if let Some(card) = next.cards.get_mut(&key) {
                    card.size = size;
                }
                editor.views.world.preview = Some(next);
                editor.views.world.drag = Some(Drag::Resize {
                    key,
                    start_size,
                    from,
                    center,
                });
            }
            other => editor.views.world.drag = other,
        }
    }
    if response.drag_stopped()
        || (editor.views.world.drag.is_some() && ui.input(|i| i.pointer.any_released()))
    {
        editor.views.world.drag_note = None;
        match editor.views.world.drag.take() {
            Some(Drag::Cards { moved, .. }) => {
                if moved && let Some(next) = editor.views.world.preview.take() {
                    let keys: Vec<String> = editor
                        .views
                        .world
                        .selected
                        .iter()
                        .filter_map(|part| match part {
                            Part::Card(key) => Some(key.clone()),
                            _ => None,
                        })
                        .collect();
                    let label = match keys.as_slice() {
                        [one] => format!("Move {one} on the world map"),
                        _ => format!("Move {} world map cards", keys.len()),
                    };
                    write_layout(editor, next, label);
                }
                editor.views.world.preview = None;
            }
            Some(Drag::Note { .. }) => {
                if let Some(next) = editor.views.world.preview.take() {
                    write_layout(editor, next, "Move a note".to_owned());
                }
            }
            Some(Drag::Resize { key, .. }) => {
                if let Some(next) = editor.views.world.preview.take() {
                    write_layout(editor, next, format!("Resize {key} on the world map"));
                }
            }
            Some(Drag::Box { from }) => {
                if let Some(p) = pointer.or_else(|| response.interact_pointer_pos()) {
                    let r = Rect::from_two_pos(from, p);
                    let mut parts: Vec<Part> = placed
                        .iter()
                        .filter(|card| r.intersects(card.frame))
                        .map(|card| Part::Card(card.key.clone()))
                        .collect();
                    if modifiers.shift || modifiers.command {
                        for part in &selected {
                            if !parts.contains(part) {
                                parts.push(part.clone());
                            }
                        }
                    }
                    select(editor, parts);
                }
            }
            None => {}
        }
    }
    if response.clicked_by(egui::PointerButton::Primary) && !space {
        let p = response.interact_pointer_pos().unwrap_or_default();
        if modifiers.alt
            && let Some(key) = hovered.clone()
        {
            match editor.views.world.route_from.take() {
                Some(from) if from != key => {
                    editor.views.world.route = Some((from, key));
                }
                _ => {
                    editor.views.world.route_from = Some(key.clone());
                    editor.toast(format!("route from {key} · Alt-click where it goes"));
                }
            }
        } else {
            let part = note_at(stored, frame, p)
                .map(Part::Note)
                .or_else(|| hovered.clone().map(Part::Card));
            match part {
                Some(part) => {
                    let mut next = if modifiers.shift || modifiers.command {
                        selected.clone()
                    } else {
                        Vec::new()
                    };
                    if modifiers.command && next.contains(&part) {
                        next.retain(|known| *known != part);
                    } else if !next.contains(&part) {
                        next.push(part);
                    }
                    select(editor, next);
                }
                None => {
                    if !(modifiers.shift || modifiers.command) {
                        let region = region_at(atlas, stored, frame, p);
                        select(editor, region.map(Part::Region).into_iter().collect());
                    }
                }
            }
        }
    }
    if response.double_clicked()
        && let Some(key) = &hovered
    {
        area_view::open_area_at(editor, key, None, None);
    }
    let hover_tile = pointer.and_then(|p| tile_at(atlas, placed, p));
    editor.views.world.hover = hover_tile.clone();
    if response.secondary_clicked() {
        editor.views.world.menu_target = hover_tile.clone();
    }
    let menu_target = editor.views.world.menu_target.clone();
    response.context_menu(|ui| {
        ui.set_min_width(240.0);
        match &menu_target {
            Some((area, tile)) => card_menu(editor, ui, atlas, stored, content, area, *tile),
            None => {
                if ui.button("Add note here").clicked() {
                    let at = ui
                        .input(|i| i.pointer.latest_pos())
                        .map(|p| frame.to_map(p))
                        .unwrap_or(frame.center);
                    super::add_note(editor, stored, at);
                    ui.close();
                }
                if ui.button("Region from selection").clicked() {
                    super::region_from_selection(editor, stored);
                    ui.close();
                }
                if ui.button("Arrange…").clicked() {
                    super::arrange::open(editor);
                    ui.close();
                }
            }
        }
    });
    if response.hovered() && !typing {
        keys(
            editor, ui, atlas, stored, placed, &hovered, hover_tile, content,
        );
    }
}

fn card_menu(
    editor: &mut Editor,
    ui: &mut Ui,
    atlas: &Atlas,
    stored: &Layout,
    content: Content,
    area: &str,
    tile: Pos<Tiles>,
) {
    let Some(info) = atlas.areas.get(area) else {
        return;
    };
    let cell = tile.snap();
    let walkable = game::systems::area::load(&content, info.id)
        .grid
        .walkable(cell);
    let place = game::systems::script::Place {
        area: info.id,
        at: cell,
    };
    if walkable {
        let character = editor
            .views
            .world
            .play_character
            .clone()
            .or_else(|| crate::play::current_character(editor))
            .unwrap_or_else(|| "…".to_owned());
        if ui
            .add(egui::Button::new(format!("▸ Play here as {character}")).shortcut_text("F6"))
            .clicked()
        {
            editor.play.character = Some(character);
            crate::play::start(editor, Some(place));
            ui.close();
        }
        ui.menu_button("Play here as…", |ui| {
            for test in crate::play::test_characters(editor) {
                if ui
                    .button(format!("{} · level {}", test.key, test.level))
                    .clicked()
                {
                    editor.play.character = Some(test.key.clone());
                    editor.views.world.play_character = Some(test.key);
                    crate::play::start(editor, Some(place));
                    ui.close();
                }
            }
        });
        ui.separator();
    }
    if ui
        .add(egui::Button::new(format!("Open {area} at this tile")).shortcut_text("Enter"))
        .clicked()
    {
        area_view::open_area_at(editor, area, Some(cell), None);
        ui.close();
    }
    if ui
        .button(format!("Copy position {}, {}", cell.x, cell.y))
        .clicked()
    {
        ui.ctx().copy_text(format!("{}, {}", cell.x, cell.y));
        ui.close();
    }
    ui.separator();
    let pinned = stored.cards.get(area).is_some_and(|card| card.pinned);
    if ui
        .add(egui::Button::new(if pinned { "Unpin" } else { "Pin" }).shortcut_text("P"))
        .clicked()
    {
        let mut next = stored.clone();
        if let Some(card) = next.cards.get_mut(area) {
            card.pinned = !pinned;
        }
        write_layout(
            editor,
            next,
            format!("{} {area}", if pinned { "Unpin" } else { "Pin" }),
        );
        ui.close();
    }
    if ui.button("Route from here").clicked() {
        editor.views.world.route_from = Some(area.to_owned());
        editor.toast(format!("route from {area} · Alt-click where it goes"));
        ui.close();
    }
    if let Some(from) = editor.views.world.route_from.clone()
        && from != area
        && ui.button(format!("Route from {from} to here")).clicked()
    {
        editor.views.world.route = Some((from, area.to_owned()));
        editor.views.world.route_from = None;
        ui.close();
    }
    if ui.button("Remove card").clicked() {
        let mut next = stored.clone();
        next.cards.remove(area);
        tidy_regions(&mut next);
        write_layout(editor, next, format!("Remove {area} from the world map"));
        ui.close();
    }
}

#[allow(clippy::too_many_arguments)]
fn keys(
    editor: &mut Editor,
    ui: &Ui,
    atlas: &Atlas,
    stored: &Layout,
    placed: &[Placed],
    hovered: &Option<String>,
    hover_tile: Option<(String, Pos<Tiles>)>,
    content: Content,
) {
    let (left, right, up, down, minus, equals, delete, pin, all, enter, play, escape, shift) = ui
        .input(|i| {
            (
                i.key_pressed(Key::ArrowLeft),
                i.key_pressed(Key::ArrowRight),
                i.key_pressed(Key::ArrowUp),
                i.key_pressed(Key::ArrowDown),
                i.key_pressed(Key::Minus),
                i.key_pressed(Key::Equals) || i.key_pressed(Key::Plus),
                i.key_pressed(Key::Delete) || i.key_pressed(Key::Backspace),
                i.key_pressed(Key::P),
                i.modifiers.command && i.key_pressed(Key::A),
                i.key_pressed(Key::Enter),
                i.key_pressed(Key::F6),
                i.key_pressed(Key::Escape),
                i.modifiers.shift,
            )
        });
    let keys: Vec<String> = editor
        .views
        .world
        .selected
        .iter()
        .filter_map(|part| match part {
            Part::Card(key) => Some(key.clone()),
            _ => None,
        })
        .collect();
    let step = if shift { 1.0 } else { 10.0 };
    let delta = Vec2::new(
        if left {
            -step
        } else if right {
            step
        } else {
            0.0
        },
        if up {
            -step
        } else if down {
            step
        } else {
            0.0
        },
    );
    if delta != Vec2::ZERO && !keys.is_empty() {
        let mut next = stored.clone();
        for key in &keys {
            if let Some(card) = next.cards.get_mut(key) {
                card.x = round2(card.x + delta.x);
                card.y = round2(card.y + delta.y);
            }
        }
        write_layout_merging(editor, next, format!("Move {} world map cards", keys.len()));
    }
    if (minus || equals) && !keys.is_empty() {
        let by: i32 = if shift { 1 } else { 10 } * if minus { -1 } else { 1 };
        let mut next = stored.clone();
        for key in &keys {
            if let Some(card) = next.cards.get_mut(key) {
                card.size = (card.size as i32 + by).clamp(10, 400) as u32;
            }
        }
        write_layout_merging(
            editor,
            next,
            format!("Resize {} world map cards", keys.len()),
        );
    }
    if pin && !keys.is_empty() {
        let pinned = !keys.iter().all(|key| stored.cards[key].pinned);
        let mut next = stored.clone();
        for key in &keys {
            if let Some(card) = next.cards.get_mut(key) {
                card.pinned = pinned;
            }
        }
        write_layout(
            editor,
            next,
            format!(
                "{} {} cards",
                if pinned { "Pin" } else { "Unpin" },
                keys.len()
            ),
        );
    }
    if all {
        let parts = placed
            .iter()
            .map(|card| Part::Card(card.key.clone()))
            .collect();
        select(editor, parts);
    }
    if enter && let Some((area, tile)) = &hover_tile {
        area_view::open_area_at(editor, area, Some(tile.snap()), None);
    } else if enter && let Some(key) = hovered {
        area_view::open_area_at(editor, key, None, None);
    }
    if play
        && let Some((area, tile)) = &hover_tile
        && let Some(info) = atlas.areas.get(area)
        && game::systems::area::load(&content, info.id)
            .grid
            .walkable(tile.snap())
    {
        crate::play::start(
            editor,
            Some(game::systems::script::Place {
                area: info.id,
                at: tile.snap(),
            }),
        );
    }
    if escape {
        editor.views.world.route_from = None;
        if editor.views.world.drag.is_none() {
            select(editor, Vec::new());
        }
    }
    if delete && !editor.views.world.selected.is_empty() {
        let mut next = stored.clone();
        let parts = editor.views.world.selected.clone();
        let mut notes: Vec<usize> = Vec::new();
        let mut regions: Vec<usize> = Vec::new();
        for part in &parts {
            match part {
                Part::Card(key) => {
                    next.cards.remove(key);
                }
                Part::Note(index) => notes.push(*index),
                Part::Region(index) => regions.push(*index),
                Part::Edge(..) => {}
            }
        }
        notes.sort_unstable_by(|a, b| b.cmp(a));
        regions.sort_unstable_by(|a, b| b.cmp(a));
        for index in notes {
            if index < next.notes.len() {
                next.notes.remove(index);
            }
        }
        for index in regions {
            if index < next.regions.len() {
                next.regions.remove(index);
            }
        }
        tidy_regions(&mut next);
        if write_layout(
            editor,
            next,
            format!("Remove {} from the world map", parts.len()),
        ) {
            select(editor, Vec::new());
        }
    }
}

fn corner_at(placed: &[Placed], selected: &[Part], p: Pos2) -> Option<(String, Pos2)> {
    let [Part::Card(key)] = selected else {
        return None;
    };
    let card = placed_of(placed, key)?;
    let screen = card.frame;
    for corner in [
        screen.left_top(),
        screen.right_top(),
        screen.left_bottom(),
        screen.right_bottom(),
    ] {
        if (corner - p).length() <= 8.0 {
            return Some((key.clone(), screen.center()));
        }
    }
    None
}

fn note_at(layout: &Layout, frame: &Frame, p: Pos2) -> Option<usize> {
    layout
        .notes
        .iter()
        .position(|note| note_rect(frame, note).contains(p))
}

fn region_at(atlas: &Atlas, layout: &Layout, frame: &Frame, p: Pos2) -> Option<usize> {
    layout
        .regions
        .iter()
        .enumerate()
        .find(|(_, region)| {
            super::region_rect(atlas, layout, region).is_some_and(|r| frame.rect(r).contains(p))
        })
        .map(|(index, _)| index)
}

fn region_label_at(atlas: &Atlas, layout: &Layout, frame: &Frame, p: Pos2) -> Option<usize> {
    layout
        .regions
        .iter()
        .enumerate()
        .find(|(_, region)| {
            super::region_rect(atlas, layout, region).is_some_and(|r| {
                let screen = frame.rect(r);
                Rect::from_min_size(
                    screen.left_top() + Vec2::new(0.0, -10.0),
                    Vec2::new(16.0 + region.name.chars().count() as f32 * 7.0, 20.0),
                )
                .contains(p)
            })
        })
        .map(|(index, _)| index)
}

fn snap_delta(
    atlas: &Atlas,
    origin: &Layout,
    moving: &[String],
    delta: Vec2,
    zoom: f32,
) -> (Vec2, Option<String>) {
    let threshold = SNAP_PX / zoom;
    let resting: Vec<(&String, Rect)> = origin
        .cards
        .iter()
        .filter(|(key, _)| !moving.contains(key))
        .filter_map(|(key, card)| card_rect(atlas, key, card).map(|r| (key, r)))
        .collect();
    let mut best_x: Option<(f32, f32, String)> = None;
    let mut best_y: Option<(f32, f32, String)> = None;
    for key in moving {
        let Some(card) = origin.cards.get(key) else {
            continue;
        };
        let Some(r) = card_rect(atlas, key, card) else {
            continue;
        };
        let r = r.translate(delta);
        for (other, o) in &resting {
            for (mine, theirs, how) in [
                (r.min.x, o.min.x, "aligned with"),
                (r.max.x, o.max.x, "aligned with"),
                (r.center().x, o.center().x, "centred on"),
                (r.min.x, o.max.x + super::GAP, "right of"),
                (r.max.x, o.min.x - super::GAP, "left of"),
            ] {
                let d = theirs - mine;
                if d.abs() <= threshold
                    && best_x.as_ref().is_none_or(|(_, best, _)| d.abs() < *best)
                {
                    best_x = Some((d, d.abs(), format!("{key} snapped {how} {other}")));
                }
            }
            for (mine, theirs, how) in [
                (r.min.y, o.min.y, "aligned with"),
                (r.max.y, o.max.y, "aligned with"),
                (r.center().y, o.center().y, "centred on"),
                (r.min.y, o.max.y + super::GAP, "under"),
                (r.max.y, o.min.y - super::GAP, "above"),
            ] {
                let d = theirs - mine;
                if d.abs() <= threshold
                    && best_y.as_ref().is_none_or(|(_, best, _)| d.abs() < *best)
                {
                    best_y = Some((d, d.abs(), format!("{key} snapped {how} {other}")));
                }
            }
        }
    }
    let note = best_y
        .as_ref()
        .map(|(_, _, note)| note.clone())
        .or_else(|| best_x.as_ref().map(|(_, _, note)| note.clone()));
    (
        Vec2::new(
            delta.x + best_x.map_or(0.0, |(d, _, _)| d),
            delta.y + best_y.map_or(0.0, |(d, _, _)| d),
        ),
        note,
    )
}
