use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use egui::{Align2, Color32, FontId, Pos2, Rect, Sense, Shape, Stroke, StrokeKind, Ui, Vec2};
use game::core::content::Content;
use game::core::math::Pos;

use super::atlas::{self, Atlas, Source};
use super::{
    AREA_ZOOM, ColourBy, ColourOf, ColourShow, Layout, Lens, MAX_ZOOM, MIN_ZOOM, Part, card_rect,
    interact, region_colour, region_rect,
};
use crate::app::Editor;
use crate::ui::theme;
use crate::views::area::{TILE_PX, scene};

const LABEL: f32 = 16.0;
const PAD: f32 = 3.0;
const ROUTE: Color32 = Color32::from_rgb(90, 160, 255);
const WARP: Color32 = Color32::from_rgb(150, 150, 170);
const DIM: Color32 = Color32::from_rgb(70, 70, 78);

pub struct Frame {
    pub rect: Rect,
    pub center: Pos2,
    pub zoom: f32,
}

impl Frame {
    pub fn to_screen(&self, p: Pos2) -> Pos2 {
        self.rect.center() + (p - self.center) * self.zoom
    }

    pub fn to_map(&self, p: Pos2) -> Pos2 {
        self.center + (p - self.rect.center()) / self.zoom
    }

    pub fn rect(&self, r: Rect) -> Rect {
        Rect::from_min_max(self.to_screen(r.min), self.to_screen(r.max))
    }
}

/// Where a card sits on screen this frame: the map rectangle, the art drawn from it and the frame
/// around both art and name. Small cards grow to a readable minimum.
pub struct Placed {
    pub key: String,
    pub frame: Rect,
    pub art: Rect,
    pub compact: bool,
}

pub fn place(atlas: &Atlas, layout: &Layout, frame: &Frame) -> Vec<Placed> {
    let mut out = Vec::new();
    for (key, card) in &layout.cards {
        let (Some(map), Some(art_map)) = (
            card_rect(atlas, key, card),
            super::art_rect(atlas, key, card),
        ) else {
            continue;
        };
        let art = frame.rect(art_map);
        let placed = if frame.zoom >= AREA_ZOOM {
            Placed {
                key: key.clone(),
                frame: art,
                art,
                compact: false,
            }
        } else {
            let outer = frame.rect(map);
            let room = Vec2::new(
                outer.width() - 2.0 * PAD,
                outer.height() - LABEL - 2.0 * PAD,
            );
            let scale = (room.x / art.width().max(1.0))
                .min(room.y / art.height().max(1.0))
                .min(1.0);
            let shown = art.size() * scale;
            let fitted = Rect::from_min_size(
                Pos2::new(
                    outer.center().x - shown.x / 2.0,
                    outer.min.y + PAD + (room.y - shown.y) / 2.0,
                ),
                shown,
            );
            Placed {
                key: key.clone(),
                frame: outer,
                art: fitted,
                compact: fitted.width() < 64.0 || fitted.height() < 30.0,
            }
        };
        out.push(placed);
    }
    out
}

pub fn card_at(placed: &[Placed], p: Pos2) -> Option<String> {
    placed
        .iter()
        .filter(|card| card.frame.contains(p))
        .min_by(|a, b| {
            a.frame
                .area()
                .partial_cmp(&b.frame.area())
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|card| card.key.clone())
}

pub fn placed_of<'a>(placed: &'a [Placed], key: &str) -> Option<&'a Placed> {
    placed.iter().find(|card| card.key == key)
}

/// The tile under a screen point, through the card's art.
pub fn tile_at(
    atlas: &Atlas,
    placed: &[Placed],
    p: Pos2,
) -> Option<(String, Pos<game::core::tiling::Tiles>)> {
    let key = card_at(placed, p)?;
    let card = placed_of(placed, &key)?;
    let info = atlas.areas.get(&key)?;
    let rel = (p - card.art.min) / card.art.size().max(Vec2::splat(1.0));
    Some((
        key,
        Pos::new(rel.x * info.size.width, rel.y * info.size.height),
    ))
}

#[allow(clippy::too_many_arguments)]
pub fn show(
    editor: &mut Editor,
    ui: &mut Ui,
    content: Content,
    atlas: &Arc<Atlas>,
    stored: Layout,
    generation: u64,
) {
    let (rect, response) = ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
    let rect = rect.intersect(ui.clip_rect());
    editor.views.world.canvas = rect.size();
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, theme::CANVAS);
    if !editor.views.world.fitted {
        fit(editor, atlas, &stored, rect);
    }
    let typing = ui.ctx().text_edit_focused();
    navigate(editor, ui, &response, rect);
    let frame = Frame {
        rect,
        center: editor.views.world.center,
        zoom: editor.views.world.zoom,
    };
    dots(&painter, &frame);
    let shown = editor
        .views
        .world
        .preview
        .clone()
        .unwrap_or_else(|| stored.clone());
    let placed = place(atlas, &shown, &frame);
    let pointer = response.hover_pos();
    let hovered = pointer.and_then(|p| card_at(&placed, p));
    let lit = lit_areas(editor, content, atlas);
    let colours = colour_ranges(editor, atlas);
    let route = route_of(editor, atlas);
    let selected: HashSet<Part> = editor.views.world.selected.iter().cloned().collect();
    let layers = editor.views.world.layers;
    let zoomed = frame.zoom >= AREA_ZOOM;
    if layers.regions {
        draw_regions(&painter, &frame, atlas, &shown, &selected);
    }
    if layers.warps {
        draw_warps(&painter, atlas, &placed, &route);
    }
    let ppp = ui.ctx().pixels_per_point();
    let mut requests = Vec::new();
    let settings = content.built::<game::systems::GameSettings>();
    let bench = settings.bench.key(&content);
    for card in &placed {
        if !card.frame.intersects(rect) {
            continue;
        }
        let key = &card.key;
        let info = &atlas.areas[key];
        let stored_card = shown.cards[key];
        let is_selected = selected.contains(&Part::Card(key.clone()));
        let is_lit = lit.as_ref().map(|lit| lit.contains_key(key));
        let dimmed = is_lit == Some(false);
        if !zoomed {
            painter.rect_filled(
                card.frame,
                4.0,
                if dimmed { theme::PANEL } else { theme::RAISED },
            );
        }
        let px_per_tile = card.art.width() / info.size.width.max(1.0);
        let scene_key = format!("world:{key}");
        requests.push(scene::SceneRequest {
            key: scene_key.clone(),
            spec: scene::SceneSpec {
                ground: key.clone(),
                scenery: scene::SceneryOf::Area,
                hidden_ground: Vec::new(),
                show_blueprints: true,
                show_scenery: true,
            },
            width: (card.art.width() * ppp).round().clamp(1.0, 4096.0) as u32,
            height: (card.art.height() * ppp).round().clamp(1.0, 4096.0) as u32,
            center: Pos::new(info.size.width / 2.0, info.size.height / 2.0),
            zoom: px_per_tile / TILE_PX * ppp,
            generation,
        });
        painter.rect_filled(card.art, 2.0, theme::INPUT);
        if let Some(scene) = editor.views.area.scenes.by_key.get(&scene_key) {
            let uv = Rect::from_min_max(
                Pos2::ZERO,
                Pos2::new(
                    scene.shown[0] as f32 / scene.alloc[0] as f32,
                    scene.shown[1] as f32 / scene.alloc[1] as f32,
                ),
            );
            painter.image(
                scene.texture,
                card.art,
                uv,
                if dimmed { DIM } else { Color32::WHITE },
            );
        }
        if let Some((ranges, low, high, _)) = &colours {
            match ranges.get(key) {
                Some(((lo, hi), value)) => {
                    let colour = viridis(((*value - low) / (high - low).max(1e-9)) as f32);
                    painter.rect_filled(
                        card.art,
                        2.0,
                        Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 150),
                    );
                    if !card.compact {
                        let text = if lo == hi {
                            format!("{lo}")
                        } else {
                            format!("{lo}–{hi}")
                        };
                        chip(
                            &painter,
                            card.art.center(),
                            Align2::CENTER_CENTER,
                            &text,
                            Color32::from_rgba_unmultiplied(20, 20, 24, 200),
                            Color32::WHITE,
                            12.0,
                        );
                    }
                }
                None => {
                    painter.rect_filled(
                        card.art,
                        2.0,
                        Color32::from_rgba_unmultiplied(60, 60, 66, 170),
                    );
                }
            }
        }
        if zoomed {
            for door in &info.doors {
                let at = card.art.min + Vec2::new(door.at.x, door.at.y) * px_per_tile;
                painter.rect_stroke(
                    Rect::from_center_size(at, Vec2::splat(px_per_tile.max(4.0))),
                    1.0,
                    Stroke::new(1.5, ROUTE),
                    StrokeKind::Outside,
                );
            }
        }
        if layers.residents {
            for npc in &info.residents {
                let at = card.art.min + Vec2::new(npc.at.x, npc.at.y) * px_per_tile;
                painter.circle(at, 3.0, theme::OK, Stroke::new(1.0, Color32::BLACK));
            }
        }
        if layers.populations {
            for npc in &info.populations {
                let at = card.art.min + Vec2::new(npc.at.x, npc.at.y) * px_per_tile;
                painter.circle(
                    at,
                    4.0,
                    Color32::from_rgb(240, 140, 60),
                    Stroke::new(1.0, Color32::BLACK),
                );
                if !card.compact {
                    painter.text(
                        at + Vec2::new(5.0, 0.0),
                        Align2::LEFT_CENTER,
                        format!("×{}", npc.count),
                        FontId::proportional(10.0),
                        Color32::WHITE,
                    );
                }
            }
        }
        if layers.givers {
            for giver in atlas.givers(key) {
                let at = giver
                    .at
                    .map(|at| card.art.min + Vec2::new(at.x, at.y) * px_per_tile)
                    .unwrap_or(card.art.center());
                painter.circle(at, 5.0, theme::WARN, Stroke::new(1.0, Color32::BLACK));
                painter.text(
                    at,
                    Align2::CENTER_CENTER,
                    "!",
                    FontId::proportional(9.0),
                    Color32::BLACK,
                );
            }
        }
        if stored_card.pinned {
            painter.text(
                card.art.right_top() + Vec2::new(-3.0, 2.0),
                Align2::RIGHT_TOP,
                "📍",
                FontId::proportional(11.0),
                Color32::WHITE,
            );
        }
        if route.is_some() {
            let text = match atlas.distances.get(key) {
                Some(d) => d.to_string(),
                None => "–".to_owned(),
            };
            let at = card.art.center();
            painter.circle_filled(at, 9.0, Color32::from_rgba_unmultiplied(20, 20, 24, 210));
            painter.text(
                at,
                Align2::CENTER_CENTER,
                text,
                FontId::monospace(11.0),
                Color32::WHITE,
            );
        }
        if !zoomed {
            let ink = if dimmed { theme::FAINT } else { theme::TEXT };
            if card.compact {
                let lines = split_name(key);
                let top = card.art.max.y + 2.0;
                for (i, line) in lines.iter().enumerate() {
                    painter.text(
                        Pos2::new(card.frame.center().x, top + 10.0 * i as f32),
                        Align2::CENTER_TOP,
                        line,
                        FontId::monospace(10.0),
                        ink,
                    );
                }
            } else {
                painter.text(
                    Pos2::new(card.frame.center().x, card.art.max.y + 2.0),
                    Align2::CENTER_TOP,
                    key,
                    FontId::monospace(11.0),
                    ink,
                );
            }
        }
        let stroke = if is_selected {
            Stroke::new(2.0, theme::SELECTION)
        } else if is_lit == Some(true) {
            Stroke::new(2.0, theme::WARN)
        } else if hovered.as_deref() == Some(key.as_str()) {
            Stroke::new(1.0, theme::MUTED)
        } else {
            Stroke::new(1.0, theme::BORDER)
        };
        if !zoomed || is_selected {
            painter.rect_stroke(card.frame, 4.0, stroke, StrokeKind::Outside);
        }
        if let Some(lit) = &lit
            && let Some(sources) = lit.get(key)
            && !sources.is_empty()
        {
            chip(
                &painter,
                card.frame.right_top() + Vec2::new(-4.0, -4.0),
                Align2::RIGHT_BOTTOM,
                &tag_line(sources),
                theme::WARN,
                Color32::BLACK,
                11.0,
            );
        }
        if key == &atlas.spawn {
            let text = if key == bench {
                "⚑ spawn · bench".to_owned()
            } else {
                "⚑ spawn".to_owned()
            };
            chip(
                &painter,
                card.frame.left_top() + Vec2::new(0.0, -6.0),
                Align2::LEFT_BOTTOM,
                &text,
                theme::PANEL,
                theme::OK,
                11.0,
            );
        }
        if is_selected && selected.len() == 1 {
            for corner in [
                card.frame.left_top(),
                card.frame.right_top(),
                card.frame.left_bottom(),
                card.frame.right_bottom(),
            ] {
                painter.rect_filled(
                    Rect::from_center_size(corner, Vec2::splat(7.0)),
                    1.0,
                    theme::SELECTION,
                );
            }
        }
    }
    editor.views.area.requests.extend(requests);
    if layers.warps && route.is_some() {
        draw_route(&painter, &placed, &route);
    }
    if let Some(line) = editor.views.world.quest_line.clone() {
        draw_quest_line(&painter, atlas, &placed, &line);
    }
    if layers.regions {
        draw_region_labels(&painter, &frame, atlas, &shown);
        draw_notes(&painter, &frame, &shown, &selected);
    }
    if zoomed {
        draw_edge_tags(&painter, atlas, &placed, &frame, rect);
    }
    if let Some(interact::Drag::Box { from }) = &editor.views.world.drag
        && let Some(p) = pointer
    {
        let r = Rect::from_two_pos(*from, p);
        painter.rect_filled(r, 0.0, Color32::from_rgba_unmultiplied(120, 170, 250, 30));
        painter.rect_stroke(
            r,
            0.0,
            Stroke::new(1.0, theme::SELECTION),
            StrokeKind::Outside,
        );
    }
    if let Some(interact::Drag::Resize {
        key, start_size, ..
    }) = &editor.views.world.drag
        && let Some(card) = placed_of(&placed, key)
        && let Some(origin) = stored
            .cards
            .get(key)
            .and_then(|c| super::art_rect(atlas, key, c))
    {
        let ghost = frame.rect(origin);
        painter.add(Shape::dashed_line(
            &[
                ghost.left_top(),
                ghost.right_top(),
                ghost.right_bottom(),
                ghost.left_bottom(),
                ghost.left_top(),
            ],
            Stroke::new(1.0, theme::MUTED),
            4.0,
            3.0,
        ));
        let info = &atlas.areas[key];
        chip(
            &painter,
            card.frame.left_bottom() + Vec2::new(0.0, 6.0),
            Align2::LEFT_TOP,
            &format!(
                "{}% · {} × {} tiles",
                shown.cards[key].size, info.size.width, info.size.height
            ),
            theme::ACCENT_SOFT,
            Color32::WHITE,
            11.0,
        );
        chip(
            &painter,
            ghost.right_bottom() + Vec2::new(8.0, 6.0),
            Align2::LEFT_TOP,
            &format!("was {start_size}%"),
            theme::PANEL,
            theme::MUTED,
            11.0,
        );
    }
    if let Some(note) = editor.views.world.drag_note.clone()
        && let Some(p) = pointer
    {
        chip(
            &painter,
            p + Vec2::new(16.0, 16.0),
            Align2::LEFT_TOP,
            &note,
            theme::ACCENT_SOFT,
            Color32::WHITE,
            11.0,
        );
    }
    if layers.warps && !zoomed {
        legend(&painter, rect);
    }
    minimap(&painter, atlas, &shown, &frame, rect);
    if lit.as_ref().is_some_and(|lit| lit.is_empty()) {
        painter.text(
            rect.center_top() + Vec2::new(0.0, 8.0),
            Align2::CENTER_TOP,
            "Nothing matches",
            FontId::proportional(14.0),
            theme::DANGER,
        );
    }
    interact::run(
        editor,
        ui,
        &response,
        atlas,
        &stored,
        &frame,
        &placed,
        hovered.clone(),
        typing,
        content,
    );
    status(
        editor,
        atlas,
        &stored,
        &frame,
        &placed,
        Overlays {
            lit: &lit,
            colours: &colours,
            route: &route,
        },
        pointer,
    );
}

/// What the canvas drew over the cards this frame, for the status line to describe.
struct Overlays<'a> {
    lit: &'a Option<BTreeMap<String, Vec<Source>>>,
    colours: &'a Option<Ranges>,
    route: &'a Option<Vec<atlas::Warp>>,
}

fn status(
    editor: &mut Editor,
    atlas: &Atlas,
    layout: &Layout,
    frame: &Frame,
    placed: &[Placed],
    overlays: Overlays,
    pointer: Option<Pos2>,
) {
    let Overlays {
        lit,
        colours,
        route,
    } = overlays;
    let view = &editor.views.world;
    let mut left: Vec<String> = Vec::new();
    match &view.drag {
        Some(interact::Drag::Cards { moved: true, .. }) => {
            let count = view
                .selected
                .iter()
                .filter(|part| matches!(part, Part::Card(_)))
                .count();
            let note = view.drag_note.clone().unwrap_or_default();
            left.push(format!(
                "moving {count} card{}{}",
                if count == 1 { "" } else { "s" },
                if note.is_empty() {
                    String::new()
                } else {
                    format!(" · {note}")
                }
            ));
            left.push("Alt moves without snapping · P pins".to_owned());
        }
        Some(interact::Drag::Resize { key, .. }) => {
            let size = view
                .preview
                .as_ref()
                .and_then(|p| p.cards.get(key))
                .map(|c| c.size)
                .unwrap_or(100);
            let info = &atlas.areas[key];
            left.push(format!(
                "resizing {key} · {size}% · {} × {} tiles",
                info.size.width, info.size.height
            ));
            left.push("Shift steps by 1% · Esc cancels".to_owned());
        }
        _ => {
            let hover = pointer.and_then(|p| tile_at(atlas, placed, p));
            if frame.zoom >= AREA_ZOOM {
                match hover {
                    Some((key, tile)) => left.push(format!(
                        "World · zoom {:.0}% · {key} {}, {}",
                        frame.zoom * 100.0,
                        tile.x.floor(),
                        tile.y.floor()
                    )),
                    None => left.push(format!("World · zoom {:.0}%", frame.zoom * 100.0)),
                }
                left.push("right-click a tile to play there".to_owned());
            } else if let Some((from, to)) = &view.route {
                match route {
                    Some(route) => left.push(format!(
                        "World · route {from} → {to} · {} warps",
                        route.len()
                    )),
                    None => left.push(format!(
                        "World · route {from} → {to} · no chain of warps leads there"
                    )),
                }
            } else if let Some(line) = &view.quest_line {
                let quests = atlas
                    .lines
                    .iter()
                    .find(|l| &l.category == line)
                    .map(|l| l.quests.len())
                    .unwrap_or(0);
                let areas = quest_line_areas(atlas, line).len();
                left.push(format!(
                    "World · quest line {line} · {areas} areas, {quests} quests"
                ));
            } else if let (Some(colour), Some(_)) = (&view.colour, colours) {
                left.push(format!("World · {}", colour.sentence()));
            } else if let (Some(lit), Some(lens)) = (lit, view.lenses.first()) {
                let sources: usize = lit.values().map(Vec::len).sum();
                left.push(format!(
                    "World · {} · {sources} sources in {} areas",
                    lens.chip(),
                    lit.len()
                ));
            } else {
                left.push(format!("World · {} areas", layout.cards.len()));
                left.push("drag to arrange · scroll to zoom · Space drag to pan".to_owned());
            }
        }
    }
    editor.status.left = left;
}

fn fit(editor: &mut Editor, atlas: &Atlas, layout: &Layout, rect: Rect) {
    let bounds = layout
        .cards
        .iter()
        .filter_map(|(key, card)| card_rect(atlas, key, card))
        .reduce(|a, b| a.union(b));
    let view = &mut editor.views.world;
    match bounds {
        Some(bounds) => {
            view.center = bounds.center();
            view.zoom = ((rect.width() - 80.0) / bounds.width().max(1.0))
                .min((rect.height() - 80.0) / bounds.height().max(1.0))
                .clamp(MIN_ZOOM, MAX_ZOOM);
        }
        None => {
            view.center = Pos2::ZERO;
            view.zoom = 0.1;
        }
    }
    view.fitted = true;
}

fn navigate(editor: &mut Editor, ui: &Ui, response: &egui::Response, rect: Rect) {
    let scroll = ui.input(|i| i.smooth_scroll_delta);
    let zoom_delta = ui.input(|i| i.zoom_delta());
    let view = &mut editor.views.world;
    if response.hovered() && (scroll.y != 0.0 || zoom_delta != 1.0) {
        let factor = if zoom_delta != 1.0 {
            zoom_delta
        } else {
            (scroll.y / 240.0).exp2()
        };
        let before = view.zoom;
        view.zoom = (view.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
        if let Some(p) = response.hover_pos() {
            let frame = Frame {
                rect,
                center: view.center,
                zoom: before,
            };
            let at = frame.to_map(p);
            view.center = at + (view.center - at) * (before / view.zoom);
        }
    }
    let space = ui.input(|i| i.key_down(egui::Key::Space));
    let panning = response.dragged_by(egui::PointerButton::Middle)
        || (space && response.dragged_by(egui::PointerButton::Primary));
    if panning {
        let delta = response.drag_delta();
        view.center -= delta / view.zoom;
    }
}

fn dots(painter: &egui::Painter, frame: &Frame) {
    let step = 32.0;
    let origin = frame.to_screen(Pos2::ZERO);
    let start_x = origin.x + ((frame.rect.min.x - origin.x) / step).floor() * step;
    let start_y = origin.y + ((frame.rect.min.y - origin.y) / step).floor() * step;
    let colour = Color32::from_rgb(34, 34, 40);
    let mut y = start_y;
    while y < frame.rect.max.y {
        let mut x = start_x;
        while x < frame.rect.max.x {
            painter.rect_filled(
                Rect::from_center_size(Pos2::new(x, y), Vec2::splat(1.5)),
                0.0,
                colour,
            );
            x += step;
        }
        y += step;
    }
}

fn split_name(key: &str) -> Vec<String> {
    if key.chars().count() <= 12 {
        return vec![key.to_owned()];
    }
    match key.rfind('_') {
        Some(at) => vec![key[..=at].to_owned(), key[at + 1..].to_owned()],
        None => vec![key.to_owned()],
    }
}

pub fn chip(
    painter: &egui::Painter,
    at: Pos2,
    anchor: Align2,
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
        StrokeKind::Outside,
    );
    painter.galley(rect.min + Vec2::new(5.0, 2.0), galley, ink);
    rect
}

fn edge_point(rect: Rect, toward: Pos2) -> Pos2 {
    let c = rect.center();
    let d = toward - c;
    if d == Vec2::ZERO {
        return c;
    }
    let tx = if d.x.abs() > 1e-6 {
        (rect.width() / 2.0) / d.x.abs()
    } else {
        f32::INFINITY
    };
    let ty = if d.y.abs() > 1e-6 {
        (rect.height() / 2.0) / d.y.abs()
    } else {
        f32::INFINITY
    };
    c + d * tx.min(ty)
}

fn draw_regions(
    painter: &egui::Painter,
    frame: &Frame,
    atlas: &Atlas,
    layout: &Layout,
    selected: &HashSet<Part>,
) {
    for (index, region) in layout.regions.iter().enumerate() {
        let Some(r) = region_rect(atlas, layout, region) else {
            continue;
        };
        let screen = frame.rect(r);
        let lit = selected.contains(&Part::Region(index));
        let colour = region_colour(region.colour.as_deref());
        painter.rect_filled(
            screen,
            6.0,
            Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 14),
        );
        let stroke = Stroke::new(
            if lit { 2.0 } else { 1.0 },
            if lit { theme::SELECTION } else { colour },
        );
        painter.add(Shape::dashed_line(
            &[
                screen.left_top(),
                screen.right_top(),
                screen.right_bottom(),
                screen.left_bottom(),
                screen.left_top(),
            ],
            stroke,
            6.0,
            4.0,
        ));
    }
}

fn draw_region_labels(painter: &egui::Painter, frame: &Frame, atlas: &Atlas, layout: &Layout) {
    for region in &layout.regions {
        let Some(r) = region_rect(atlas, layout, region) else {
            continue;
        };
        let screen = frame.rect(r);
        chip(
            painter,
            screen.left_top() + Vec2::new(8.0, 0.0),
            Align2::LEFT_CENTER,
            &region.name,
            theme::PANEL,
            region_colour(region.colour.as_deref()),
            11.0,
        );
    }
}

fn draw_warps(
    painter: &egui::Painter,
    atlas: &Atlas,
    placed: &[Placed],
    route: &Option<Vec<atlas::Warp>>,
) {
    let mut drawn: HashSet<(String, String)> = HashSet::new();
    for warp in &atlas.warps {
        if warp.from == warp.to {
            continue;
        }
        let pair = (warp.from.clone(), warp.to.clone());
        if drawn.contains(&pair) || drawn.contains(&(pair.1.clone(), pair.0.clone())) {
            continue;
        }
        drawn.insert(pair);
        let (Some(from), Some(to)) = (placed_of(placed, &warp.from), placed_of(placed, &warp.to))
        else {
            continue;
        };
        let a = edge_point(from.frame, to.frame.center());
        let b = edge_point(to.frame, from.frame.center());
        let on_route = route.as_ref().is_some_and(|route| {
            route.iter().any(|step| {
                step.from == warp.from && step.to == warp.to
                    || step.from == warp.to && step.to == warp.from
            })
        });
        let both = atlas.both_ways(&warp.from, &warp.to);
        let stroke = if on_route {
            Stroke::new(3.0, ROUTE)
        } else {
            Stroke::new(1.5, WARP)
        };
        if both {
            painter.line_segment([a, b], stroke);
            arrow_head(painter, b, b - a, stroke);
            arrow_head(painter, a, a - b, stroke);
        } else {
            let stroke = if on_route {
                stroke
            } else {
                Stroke::new(1.5, theme::WARN)
            };
            painter.add(Shape::dashed_line(&[a, b], stroke, 6.0, 4.0));
            arrow_head(painter, b, b - a, stroke);
        }
    }
}

fn draw_route(painter: &egui::Painter, placed: &[Placed], route: &Option<Vec<atlas::Warp>>) {
    for step in route.iter().flatten() {
        let (Some(from), Some(to)) = (placed_of(placed, &step.from), placed_of(placed, &step.to))
        else {
            continue;
        };
        let a = edge_point(from.frame, to.frame.center());
        let b = edge_point(to.frame, from.frame.center());
        let stroke = Stroke::new(3.0, ROUTE);
        painter.line_segment([a, b], stroke);
        arrow_head(painter, b, b - a, stroke);
    }
}

fn arrow_head(painter: &egui::Painter, tip: Pos2, direction: Vec2, stroke: Stroke) {
    let dir = direction.normalized();
    let side = Vec2::new(-dir.y, dir.x);
    let base = tip - dir * 8.0;
    painter.add(Shape::convex_polygon(
        vec![tip, base + side * 4.5, base - side * 4.5],
        stroke.color,
        Stroke::NONE,
    ));
}

/// The steps of a quest line in order: numbered along the main chain, lettered for branches.
pub struct LineStep {
    pub badge: String,
    pub label: String,
    pub areas: Vec<String>,
    pub branch: bool,
}

pub fn line_steps(atlas: &Atlas, category: &str) -> Vec<LineStep> {
    use atlas::LinkHow;
    let Some(line) = atlas.lines.iter().find(|line| line.category == category) else {
        return Vec::new();
    };
    let infos: Vec<&atlas::QuestInfo> = line
        .quests
        .iter()
        .filter_map(|key| atlas.quests.iter().find(|q| q.key == *key))
        .collect();
    let done_required: HashSet<&String> = infos
        .iter()
        .flat_map(|q| q.after.iter())
        .filter(|link| link.how == LinkHow::Done)
        .map(|link| &link.quest)
        .collect();
    let mut out = Vec::new();
    let mut number = 0;
    let mut letter = b'A';
    for (index, info) in infos.iter().enumerate() {
        let giver = info.giver.clone().unwrap_or_else(|| "someone".to_owned());
        let branch = index > 0
            && !info.after.is_empty()
            && info.after.iter().all(|link| link.how != LinkHow::Done)
            && !done_required.contains(&info.key);
        if branch {
            letter += 1;
            let offered = info.steps.first().filter(|step| step.label == "offered");
            let link = &info.after[0];
            let label = match &link.how {
                LinkHow::During => {
                    format!("while {} is open, {giver} offers {}", link.quest, info.key)
                }
                LinkHow::Memory(memory) => format!("after {memory}, {giver} offers {}", info.key),
                LinkHow::Failed => format!("failing {}, {giver} offers {}", link.quest, info.key),
                LinkHow::Done => format!("{giver} offers {}", info.key),
            };
            out.push(LineStep {
                badge: (letter as char).to_string(),
                label,
                areas: offered.map(|step| step.areas.clone()).unwrap_or_default(),
                branch: true,
            });
            continue;
        }
        for step in info.steps.iter().filter(|step| step.label != "failed") {
            number += 1;
            let label = match step.label.as_str() {
                "offered" => match &info.requires {
                    Some(condition) => format!("{giver} offers {} · {condition}", info.key),
                    None => format!("{giver} offers {}", info.key),
                },
                "turned in" => format!(
                    "hand in to {}",
                    step.who.clone().unwrap_or_else(|| giver.clone())
                ),
                other => other.to_owned(),
            };
            out.push(LineStep {
                badge: number.to_string(),
                label,
                areas: step.areas.clone(),
                branch: false,
            });
        }
    }
    out
}

pub fn quest_line_areas(atlas: &Atlas, category: &str) -> Vec<String> {
    let mut areas: Vec<String> = line_steps(atlas, category)
        .into_iter()
        .flat_map(|step| step.areas)
        .collect();
    areas.sort();
    areas.dedup();
    areas
}

fn draw_quest_line(painter: &egui::Painter, atlas: &Atlas, placed: &[Placed], category: &str) {
    let steps = line_steps(atlas, category);
    let mut used: BTreeMap<String, usize> = BTreeMap::new();
    let mut previous: Vec<Pos2> = Vec::new();
    for step in &steps {
        let mut here = Vec::new();
        for area in &step.areas {
            let Some(card) = placed_of(placed, area) else {
                continue;
            };
            let slot = used.entry(area.clone()).or_default();
            let at = card.art.left_bottom()
                + Vec2::new(
                    12.0 + 22.0 * (*slot % 4) as f32,
                    -12.0 - 22.0 * (*slot / 4) as f32,
                );
            *slot += 1;
            here.push(at);
            let (fill, ink) = if step.branch {
                (theme::DANGER, Color32::WHITE)
            } else {
                (theme::WARN, Color32::BLACK)
            };
            painter.circle(at, 9.0, fill, Stroke::new(1.0, Color32::BLACK));
            painter.text(
                at,
                Align2::CENTER_CENTER,
                &step.badge,
                FontId::proportional(11.0),
                ink,
            );
        }
        if !step.branch {
            for from in &previous {
                for to in &here {
                    if (*to - *from).length() > 30.0 {
                        let mid = Pos2::new((from.x + to.x) / 2.0, (from.y + to.y) / 2.0)
                            + Vec2::new(0.0, -40.0);
                        let points: Vec<Pos2> = (0..=16)
                            .map(|i| bezier(*from, mid, *to, i as f32 / 16.0))
                            .collect();
                        painter.add(Shape::dashed_line(
                            &points,
                            Stroke::new(2.0, theme::WARN),
                            6.0,
                            5.0,
                        ));
                        arrow_head(
                            painter,
                            *to,
                            *to - points[14],
                            Stroke::new(2.0, theme::WARN),
                        );
                    }
                }
            }
            if !here.is_empty() {
                previous = here;
            }
        }
    }
}

fn bezier(a: Pos2, b: Pos2, c: Pos2, t: f32) -> Pos2 {
    let ab = a + (b - a) * t;
    let bc = b + (c - b) * t;
    ab + (bc - ab) * t
}

pub fn note_rect(frame: &Frame, note: &super::Note) -> Rect {
    let at = frame.to_screen(Pos2::new(note.x, note.y));
    let width = (note.text.chars().count() as f32 * 6.5).clamp(80.0, 200.0);
    let lines = (note.text.chars().count() as f32 / 30.0).ceil().max(1.0);
    Rect::from_min_size(at, Vec2::new(width + 12.0, 15.0 * lines + 12.0))
}

fn draw_notes(painter: &egui::Painter, frame: &Frame, layout: &Layout, selected: &HashSet<Part>) {
    for (index, note) in layout.notes.iter().enumerate() {
        let r = note_rect(frame, note);
        let lit = selected.contains(&Part::Note(index));
        painter.rect_filled(r, 3.0, Color32::from_rgb(250, 230, 150));
        painter.rect_stroke(
            r,
            3.0,
            Stroke::new(
                if lit { 2.0 } else { 1.0 },
                if lit {
                    theme::SELECTION
                } else {
                    Color32::from_rgb(200, 180, 100)
                },
            ),
            StrokeKind::Outside,
        );
        let galley = painter.layout(
            note.text.clone(),
            FontId::proportional(12.0),
            Color32::from_rgb(40, 36, 20),
            r.width() - 12.0,
        );
        painter.galley(
            r.min + Vec2::new(6.0, 6.0),
            galley,
            Color32::from_rgb(40, 36, 20),
        );
    }
}

/// Zoomed in: the area under the view with its off-screen neighbours tagged at the edge.
fn draw_edge_tags(
    painter: &egui::Painter,
    atlas: &Atlas,
    placed: &[Placed],
    frame: &Frame,
    rect: Rect,
) {
    let centre = rect.center();
    let Some(card) = placed
        .iter()
        .filter(|card| card.frame.intersects(rect))
        .min_by(|a, b| {
            (a.frame.center() - centre)
                .length()
                .partial_cmp(&(b.frame.center() - centre).length())
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    else {
        return;
    };
    chip(
        painter,
        card.frame.left_bottom() + Vec2::new(0.0, 4.0),
        Align2::LEFT_TOP,
        &card.key,
        theme::PANEL,
        theme::TEXT,
        11.0,
    );
    let mut tagged: HashSet<String> = HashSet::new();
    for warp in atlas.warps.iter().filter(|warp| warp.from == card.key) {
        if !tagged.insert(warp.to.clone()) {
            continue;
        }
        let Some(other) = placed_of(placed, &warp.to) else {
            continue;
        };
        if other.frame.intersects(rect) {
            continue;
        }
        let origin = card.frame.center().clamp(rect.min, rect.max);
        let d = other.frame.center() - origin;
        let inset = rect.shrink2(Vec2::new(70.0, 14.0));
        let tx = if d.x.abs() > 1e-3 {
            ((if d.x > 0.0 { inset.max.x } else { inset.min.x }) - origin.x) / d.x
        } else {
            f32::INFINITY
        };
        let ty = if d.y.abs() > 1e-3 {
            ((if d.y > 0.0 { inset.max.y } else { inset.min.y }) - origin.y) / d.y
        } else {
            f32::INFINITY
        };
        let t = tx.min(ty).max(0.0);
        let at = (origin + d * t).clamp(inset.min, inset.max);
        let (text, anchor) = if tx < ty {
            if d.x > 0.0 {
                (format!("{} →", warp.to), Align2::RIGHT_CENTER)
            } else {
                (format!("← {}", warp.to), Align2::LEFT_CENTER)
            }
        } else if d.y > 0.0 {
            (format!("↓ {}", warp.to), Align2::CENTER_BOTTOM)
        } else {
            (format!("↑ {}", warp.to), Align2::CENTER_TOP)
        };
        let _ = frame;
        chip(painter, at, anchor, &text, theme::PANEL, theme::TEXT, 11.0);
    }
}

fn legend(painter: &egui::Painter, rect: Rect) {
    let r = Rect::from_min_size(
        rect.left_bottom() + Vec2::new(12.0, -62.0),
        Vec2::new(160.0, 50.0),
    );
    painter.rect_filled(r, 4.0, theme::PANEL);
    painter.rect_stroke(r, 4.0, Stroke::new(1.0, theme::BORDER), StrokeKind::Outside);
    let a = r.min + Vec2::new(12.0, 16.0);
    let b = a + Vec2::new(30.0, 0.0);
    let stroke = Stroke::new(1.5, WARP);
    painter.line_segment([a, b], stroke);
    arrow_head(painter, a, a - b, stroke);
    arrow_head(painter, b, b - a, stroke);
    painter.text(
        b + Vec2::new(10.0, 0.0),
        Align2::LEFT_CENTER,
        "warps both ways",
        FontId::monospace(11.0),
        theme::MUTED,
    );
    let a = r.min + Vec2::new(12.0, 36.0);
    let b = a + Vec2::new(30.0, 0.0);
    let stroke = Stroke::new(1.5, theme::WARN);
    painter.add(Shape::dashed_line(&[a, b], stroke, 5.0, 3.0));
    arrow_head(painter, b, b - a, stroke);
    painter.text(
        b + Vec2::new(10.0, 0.0),
        Align2::LEFT_CENTER,
        "one way",
        FontId::monospace(11.0),
        theme::MUTED,
    );
}

fn minimap(painter: &egui::Painter, atlas: &Atlas, layout: &Layout, frame: &Frame, rect: Rect) {
    let rects: Vec<Rect> = layout
        .cards
        .iter()
        .filter_map(|(key, card)| card_rect(atlas, key, card))
        .collect();
    let Some(bounds) = rects.iter().copied().reduce(|a, b| a.union(b)) else {
        return;
    };
    let view = Rect::from_min_max(frame.to_map(rect.min), frame.to_map(rect.max));
    if view.contains_rect(bounds) {
        return;
    }
    let bounds = bounds.union(view);
    let box_rect = Rect::from_min_size(
        rect.right_bottom() - Vec2::new(192.0, 132.0),
        Vec2::new(180.0, 120.0),
    );
    painter.rect_filled(box_rect, 3.0, Color32::from_rgba_unmultiplied(0, 0, 0, 170));
    painter.rect_stroke(
        box_rect,
        3.0,
        Stroke::new(1.0, theme::BORDER),
        StrokeKind::Outside,
    );
    let scale = ((box_rect.width() - 8.0) / bounds.width().max(1.0))
        .min((box_rect.height() - 8.0) / bounds.height().max(1.0));
    let to_box = |p: Pos2| box_rect.center() + (p - bounds.center()) * scale;
    for r in &rects {
        painter.rect_filled(
            Rect::from_min_max(to_box(r.min), to_box(r.max)).expand(1.0),
            0.0,
            Color32::from_rgb(140, 150, 180),
        );
    }
    painter.rect_stroke(
        Rect::from_min_max(to_box(view.min), to_box(view.max)),
        0.0,
        Stroke::new(1.0, theme::WARN),
        StrokeKind::Outside,
    );
}

pub fn route_of(editor: &Editor, atlas: &Atlas) -> Option<Vec<atlas::Warp>> {
    let (from, to) = editor.views.world.route.as_ref()?;
    atlas.route(from, to)
}

/// "drop · 2 shops · quest": each source kind and how many of it.
pub fn tag_line(sources: &[Source]) -> String {
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for source in sources {
        *counts.entry(source.kind).or_default() += 1;
    }
    counts
        .iter()
        .map(|(kind, count)| {
            if *count == 1 {
                (*kind).to_owned()
            } else {
                format!("{count} {kind}s")
            }
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

/// Which areas the lenses light, and why; `Some(empty)` means a lens is on and nothing matches.
pub fn lit_areas(
    editor: &Editor,
    content: Content,
    atlas: &Atlas,
) -> Option<BTreeMap<String, Vec<Source>>> {
    let lenses = &editor.views.world.lenses;
    if lenses.is_empty() {
        return None;
    }
    let files = &editor.project.as_ref()?.files;
    let mut kinds: BTreeMap<&str, Vec<&Lens>> = BTreeMap::new();
    for lens in lenses {
        kinds.entry(lens.kind()).or_default().push(lens);
    }
    let mut out = BTreeMap::new();
    for (area, info) in &atlas.areas {
        let mut sources = Vec::new();
        let mut every_kind = true;
        for group in kinds.values() {
            let mut any = false;
            for lens in group {
                let found: Vec<Source> = match lens {
                    Lens::Row { table, key } => atlas.sources(content, files, area, table, key),
                    Lens::Module(module) if info.modules.contains(module) => vec![Source {
                        kind: "module",
                        label: format!("has a {module}"),
                    }],
                    Lens::Text(text) if info.text.contains(text.as_str()) => vec![Source {
                        kind: "mention",
                        label: format!("mentions {text}"),
                    }],
                    Lens::Module(_) | Lens::Text(_) => Vec::new(),
                };
                if !found.is_empty() {
                    any = true;
                    sources.extend(found);
                }
            }
            every_kind &= any;
        }
        if every_kind {
            out.insert(area.clone(), sources);
        }
    }
    Some(out)
}

/// Per area: its (low, high) range and the value coloured; then the lowest and highest value over
/// the map and the unit of the field.
pub type Ranges = (BTreeMap<String, ((f64, f64), f64)>, f64, f64, String);

pub fn colour_ranges(editor: &Editor, atlas: &Atlas) -> Option<Ranges> {
    let colour = editor.views.world.colour.as_ref()?;
    let files = &editor.project.as_ref()?.files;
    let mut ranges = BTreeMap::new();
    let (mut low, mut high) = (f64::INFINITY, f64::NEG_INFINITY);
    for area in atlas.areas.keys() {
        if let Some(range) = range_for(atlas, files, area, colour) {
            let value = match colour.show {
                ColourShow::Highest => range.1,
                ColourShow::Lowest => range.0,
            };
            low = low.min(value);
            high = high.max(value);
            ranges.insert(area.clone(), (range, value));
        }
    }
    if ranges.is_empty() {
        (low, high) = (0.0, 1.0);
    }
    let unit = colour.value.rsplit('.').next().unwrap_or("").to_owned();
    Some((ranges, low, high, unit))
}

fn range_for(
    atlas: &Atlas,
    files: &crate::project::Files,
    area: &str,
    colour: &ColourBy,
) -> Option<(f64, f64)> {
    let (table, rest) = colour
        .value
        .split_once('.')
        .unwrap_or((colour.value.as_str(), ""));
    if table != "npc" {
        return atlas.number_range(files, area, &colour.value);
    }
    let info = atlas.areas.get(area)?;
    let mut range: Option<(f64, f64)> = None;
    for (npc, _) in &info.npcs {
        if colour.of == ColourOf::Hostile && !atlas.hostile(npc) {
            continue;
        }
        let Some(row) = files.json(&crate::project::row_file("npc", npc)) else {
            continue;
        };
        for value in atlas::numbers_at(&row, rest) {
            range = Some(match range {
                Some((lo, hi)) => (lo.min(value), hi.max(value)),
                None => (value, value),
            });
        }
    }
    range
}

pub fn viridis(t: f32) -> Color32 {
    const STOPS: [[u8; 3]; 9] = [
        [68, 1, 84],
        [72, 36, 117],
        [65, 68, 135],
        [53, 95, 141],
        [42, 120, 142],
        [33, 145, 140],
        [34, 168, 132],
        [122, 209, 81],
        [253, 231, 37],
    ];
    let t = t.clamp(0.0, 1.0) * (STOPS.len() - 1) as f32;
    let i = (t.floor() as usize).min(STOPS.len() - 2);
    let f = t - i as f32;
    let mix = |a: u8, b: u8| (a as f32 + (b as f32 - a as f32) * f).round() as u8;
    Color32::from_rgb(
        mix(STOPS[i][0], STOPS[i + 1][0]),
        mix(STOPS[i][1], STOPS[i + 1][1]),
        mix(STOPS[i][2], STOPS[i + 1][2]),
    )
}
