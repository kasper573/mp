use std::collections::{BTreeMap, BTreeSet, HashMap};

use egui::{Color32, Pos2, Rect, RichText, Stroke, Ui, Vec2};

use super::atlas::Atlas;
use super::{Layout, card_rect};
use crate::app::{Dialog, Editor};
use crate::project::{Edit, row_file};
use crate::ui::{dialogs, theme, widgets};

const GAP: f32 = 300.0;
const MARGIN: f32 = 200.0;
const ITERATIONS: usize = 200;
const SETTLED: f32 = 0.0001;

pub struct ArrangeDialog {
    pub everything: bool,
    pub keep_regions: bool,
    pub doors_hint: bool,
    pub before: Layout,
    pub selected: Vec<String>,
    pub after: Option<Layout>,
}

impl ArrangeDialog {
    pub fn new(before: Layout, selected: Vec<String>) -> ArrangeDialog {
        ArrangeDialog {
            everything: true,
            keep_regions: true,
            doors_hint: true,
            before,
            selected,
            after: None,
        }
    }
}

pub fn open(editor: &mut Editor) {
    let layout = match editor.views.world.atlas.clone() {
        Some(atlas) => super::with_defaults(&atlas, super::layout_of(editor)),
        None => super::layout_of(editor),
    };
    let selected = editor
        .views
        .world
        .selected
        .iter()
        .filter_map(|part| match part {
            super::Part::Card(key) => Some(key.clone()),
            _ => None,
        })
        .collect();
    editor
        .dialogs
        .push(Dialog::Arrange(ArrangeDialog::new(layout, selected)));
}

pub fn dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: ArrangeDialog,
) -> Option<ArrangeDialog> {
    let atlas = editor.views.world.atlas.clone()?;
    let pinned_now = |dialog: &ArrangeDialog| -> Layout {
        let mut before = dialog.before.clone();
        if !dialog.everything {
            for (key, card) in &mut before.cards {
                if !dialog.selected.contains(key) {
                    card.pinned = true;
                }
            }
        }
        before
    };
    if dialog.after.is_none() {
        let mut after = solve(
            &pinned_now(&dialog),
            &atlas,
            dialog.keep_regions,
            dialog.doors_hint,
        );
        for (key, card) in &mut after.cards {
            card.pinned = dialog.before.cards.get(key).is_some_and(|c| c.pinned);
        }
        dialog.after = Some(after);
    }
    let mut outcome: Option<bool> = None;
    let unpinned = dialog
        .before
        .cards
        .values()
        .filter(|card| !card.pinned)
        .count();
    let pinned = dialog.before.cards.len() - unpinned;
    let moved = dialog
        .after
        .as_ref()
        .map(|after| {
            after
                .cards
                .iter()
                .filter(|(key, card)| {
                    dialog
                        .before
                        .cards
                        .get(*key)
                        .is_some_and(|before| (before.x, before.y) != (card.x, card.y))
                })
                .count()
        })
        .unwrap_or(0);
    dialogs::card(ctx, "arrange-world", 720.0, |ui| {
        ui.label(RichText::new("✲ Arrange the world map").size(17.0).strong());
        ui.add_space(8.0);
        let mut changed = false;
        let selected = dialog.selected.len();
        let everything_label = format!("Arrange the {unpinned} unpinned cards");
        let everything_note = if pinned == 0 {
            "nothing is pinned".to_owned()
        } else {
            format!("{pinned} pinned stay put")
        };
        changed |= toggle_row(
            ui,
            &mut dialog.everything,
            &everything_label,
            &everything_note,
        );
        if !dialog.everything {
            ui.label(
                theme::faint(if selected == 0 {
                    "nothing is selected, so nothing moves".to_owned()
                } else {
                    format!("only the {selected} selected cards move")
                })
                .size(12.0),
            );
        }
        changed |= toggle_row(
            ui,
            &mut dialog.keep_regions,
            "Keep each region's cards together",
            "",
        );
        changed |= toggle_row(
            ui,
            &mut dialog.doors_hint,
            "Let doors hint at direction",
            "a door on the east edge pulls its area east",
        );
        if changed {
            dialog.after = None;
        }
        ui.add_space(10.0);
        ui.horizontal_top(|ui| {
            ui.vertical(|ui| {
                widgets::section(ui, "Now");
                preview(ui, &dialog.before, &atlas);
            });
            ui.add_space(12.0);
            ui.vertical(|ui| {
                widgets::section(ui, "After");
                match &dialog.after {
                    Some(after) => preview(ui, after, &atlas),
                    None => {
                        ui.allocate_exact_size(Vec2::new(330.0, 250.0), egui::Sense::hover());
                    }
                }
            });
        });
        ui.add_space(10.0);
        ui.label(RichText::new(format!("This replaces the positions of {moved} cards. Ctrl Z brings your current layout back.")).size(13.0));
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if ui
                .add_enabled(
                    moved > 0,
                    egui::Button::new(
                        RichText::new(format!("Arrange {moved} cards")).color(Color32::WHITE),
                    )
                    .fill(theme::ACCENT),
                )
                .clicked()
                || (moved > 0 && ui.input(|i| i.key_pressed(egui::Key::Enter)))
            {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || ui.input(|i| i.key_pressed(egui::Key::Escape)) {
                outcome = Some(false);
            }
        });
    });
    editor.status.left = vec!["World · arrange preview".to_owned()];
    match outcome {
        Some(true) => {
            if let Some(after) = dialog.after.take() {
                let mut edit = Edit::new(format!("Arrange {moved} world map cards"));
                edit.write_json(
                    row_file("world_map", super::ROW_KEY),
                    &crate::value::json(&after).unwrap_or_default(),
                );
                editor.apply(edit);
                editor.views.world.fitted = false;
            }
            None
        }
        Some(false) => None,
        None => Some(dialog),
    }
}

fn toggle_row(ui: &mut Ui, on: &mut bool, label: &str, note: &str) -> bool {
    let mut changed = false;
    ui.horizontal(|ui| {
        changed = widgets::toggle(ui, on).changed();
        ui.label(RichText::new(label).size(13.0));
        if !note.is_empty() {
            ui.label(theme::faint(format!("· {note}")).size(12.0));
        }
    });
    changed
}

fn preview(ui: &mut Ui, layout: &Layout, atlas: &Atlas) {
    let (rect, _) = ui.allocate_exact_size(Vec2::new(330.0, 250.0), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, theme::CANVAS);
    painter.rect_stroke(
        rect,
        4.0,
        Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    let rects: Vec<Rect> = layout
        .cards
        .iter()
        .filter_map(|(key, card)| card_rect(atlas, key, card))
        .collect();
    let Some(bounds) = rects.iter().copied().reduce(|a, b| a.union(b)) else {
        return;
    };
    let scale = ((rect.width() - 24.0) / bounds.width().max(1.0))
        .min((rect.height() - 24.0) / bounds.height().max(1.0));
    let to_screen = |p: Pos2| rect.center() + (p - bounds.center()) * scale;
    for warp in &atlas.warps {
        let (Some(a), Some(b)) = (layout.cards.get(&warp.from), layout.cards.get(&warp.to)) else {
            continue;
        };
        painter.line_segment(
            [
                to_screen(Pos2::new(a.x, a.y)),
                to_screen(Pos2::new(b.x, b.y)),
            ],
            Stroke::new(1.0, Color32::from_rgba_unmultiplied(200, 200, 220, 110)),
        );
    }
    for (key, card) in &layout.cards {
        let Some(r) = card_rect(atlas, key, card) else {
            continue;
        };
        let shown = Rect::from_min_max(to_screen(r.min), to_screen(r.max)).expand(1.5);
        painter.rect_filled(
            shown,
            2.0,
            if card.pinned {
                Color32::from_rgb(120, 160, 230)
            } else {
                Color32::from_rgb(110, 118, 140)
            },
        );
    }
}

pub fn solve(layout: &Layout, atlas: &Atlas, keep_regions: bool, doors_hint: bool) -> Layout {
    let keys: Vec<String> = layout.cards.keys().cloned().collect();
    let index: HashMap<&str, usize> = keys
        .iter()
        .enumerate()
        .map(|(i, key)| (key.as_str(), i))
        .collect();
    let n = keys.len();
    if n == 0 {
        return layout.clone();
    }
    let sizes: Vec<Vec2> = keys
        .iter()
        .map(|key| {
            card_rect(atlas, key, &layout.cards[key]).map_or(Vec2::splat(32.0), |r| r.size())
        })
        .collect();
    let mut links: BTreeSet<(usize, usize)> = BTreeSet::new();
    let mut hints: HashMap<(usize, usize), Vec2> = HashMap::new();
    for warp in &atlas.warps {
        let (Some(&a), Some(&b)) = (index.get(warp.from.as_str()), index.get(warp.to.as_str()))
        else {
            continue;
        };
        if a == b {
            continue;
        }
        links.insert((a.min(b), a.max(b)));
        if doors_hint && let (Some(at), Some(info)) = (warp.at, atlas.areas.get(&warp.from)) {
            let half = Vec2::new(info.size.width, info.size.height) / 2.0;
            let rel = Vec2::new(at.x - half.x, at.y - half.y);
            let side = if rel.x.abs() / half.x.max(1.0) > rel.y.abs() / half.y.max(1.0) {
                Vec2::new(rel.x.signum(), 0.0)
            } else {
                Vec2::new(0.0, rel.y.signum())
            };
            *hints.entry((a, b)).or_insert(Vec2::ZERO) += side;
        }
    }
    if keep_regions {
        for region in &layout.regions {
            let members: Vec<usize> = region
                .cards
                .iter()
                .filter_map(|key| index.get(key.as_str()).copied())
                .collect();
            for window in members.windows(2) {
                links.insert((window[0].min(window[1]), window[0].max(window[1])));
            }
        }
    }
    let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); n];
    for &(a, b) in &links {
        adjacency[a].push(b);
        adjacency[b].push(a);
    }
    let mut positions: Vec<Vec2> = keys
        .iter()
        .map(|key| Vec2::new(layout.cards[key].x, layout.cards[key].y))
        .collect();
    let pinned: Vec<bool> = keys.iter().map(|key| layout.cards[key].pinned).collect();
    let components = components(&adjacency);
    let ideal = |a: usize, b: usize, hops: f32| -> f32 {
        let span = (sizes[a].x + sizes[b].x + sizes[a].y + sizes[b].y) / 4.0;
        hops.powf(0.7) * (span + GAP)
    };
    for component in &components {
        if component.len() < 2 {
            continue;
        }
        let hops = hop_distances(&adjacency, component);
        let bbox = component
            .iter()
            .fold(0.0f32, |acc, &i| acc.max(sizes[i].x).max(sizes[i].y))
            .max(1.0);
        for _ in 0..ITERATIONS {
            let mut moved: f32 = 0.0;
            for &i in component {
                if pinned[i] {
                    continue;
                }
                let mut sum = Vec2::ZERO;
                let mut weight = 0.0;
                for &j in component {
                    if i == j {
                        continue;
                    }
                    let Some(&d) = hops.get(&(i.min(j), i.max(j))) else {
                        continue;
                    };
                    let d = d as f32;
                    let w = 1.0 / (d * d);
                    let delta = positions[i] - positions[j];
                    let length = delta.length().max(0.001);
                    let mut direction = delta / length;
                    if d == 1.0 {
                        let mut pull = Vec2::ZERO;
                        if let Some(hint) = hints.get(&(j, i)) {
                            pull += *hint;
                        }
                        if let Some(hint) = hints.get(&(i, j)) {
                            pull -= *hint;
                        }
                        if pull != Vec2::ZERO {
                            direction = (direction + pull.normalized() * 0.5).normalized();
                        }
                    }
                    sum += w * (positions[j] + ideal(i, j, d) * direction);
                    weight += w;
                }
                if weight > 0.0 {
                    let next = sum / weight;
                    moved = moved.max((next - positions[i]).length());
                    positions[i] = next;
                }
            }
            if moved / bbox < SETTLED {
                break;
            }
        }
    }
    push_apart(&mut positions, &sizes, &pinned);
    place_components(&keys, &components, &mut positions, &sizes, &pinned);
    let mut out = layout.clone();
    for (i, key) in keys.iter().enumerate() {
        let card = out.cards.get_mut(key).expect("card");
        card.x = (positions[i].x * 100.0).round() / 100.0;
        card.y = (positions[i].y * 100.0).round() / 100.0;
    }
    out
}

fn components(adjacency: &[Vec<usize>]) -> Vec<Vec<usize>> {
    let mut seen = vec![false; adjacency.len()];
    let mut out = Vec::new();
    for start in 0..adjacency.len() {
        if seen[start] {
            continue;
        }
        let mut stack = vec![start];
        let mut component = Vec::new();
        seen[start] = true;
        while let Some(node) = stack.pop() {
            component.push(node);
            for &next in &adjacency[node] {
                if !seen[next] {
                    seen[next] = true;
                    stack.push(next);
                }
            }
        }
        component.sort();
        out.push(component);
    }
    out
}

fn hop_distances(adjacency: &[Vec<usize>], component: &[usize]) -> BTreeMap<(usize, usize), u32> {
    let mut out = BTreeMap::new();
    for &start in component {
        let mut distance: HashMap<usize, u32> = HashMap::new();
        distance.insert(start, 0);
        let mut queue = std::collections::VecDeque::from([start]);
        while let Some(node) = queue.pop_front() {
            let here = distance[&node];
            for &next in &adjacency[node] {
                if let std::collections::hash_map::Entry::Vacant(slot) = distance.entry(next) {
                    slot.insert(here + 1);
                    queue.push_back(next);
                }
            }
        }
        for (&node, &d) in &distance {
            if node > start {
                out.insert((start, node), d);
            }
        }
    }
    out
}

fn push_apart(positions: &mut [Vec2], sizes: &[Vec2], pinned: &[bool]) {
    for _ in 0..200 {
        let mut any = false;
        for i in 0..positions.len() {
            for j in (i + 1)..positions.len() {
                if pinned[i] && pinned[j] {
                    continue;
                }
                let need = (sizes[i] + sizes[j]) / 2.0 + Vec2::splat(MARGIN);
                let delta = positions[j] - positions[i];
                let overlap = need - Vec2::new(delta.x.abs(), delta.y.abs());
                if overlap.x <= 0.0 || overlap.y <= 0.0 {
                    continue;
                }
                any = true;
                let push = if overlap.x < overlap.y {
                    Vec2::new(overlap.x * if delta.x >= 0.0 { 1.0 } else { -1.0 }, 0.0)
                } else {
                    Vec2::new(0.0, overlap.y * if delta.y >= 0.0 { 1.0 } else { -1.0 })
                };
                match (pinned[i], pinned[j]) {
                    (true, false) => positions[j] += push,
                    (false, true) => positions[i] -= push,
                    _ => {
                        positions[i] -= push / 2.0;
                        positions[j] += push / 2.0;
                    }
                }
            }
        }
        if !any {
            break;
        }
    }
}

fn place_components(
    keys: &[String],
    components: &[Vec<usize>],
    positions: &mut [Vec2],
    sizes: &[Vec2],
    pinned: &[bool],
) {
    let mut order: Vec<&Vec<usize>> = components.iter().collect();
    order.sort_by_key(|component| {
        component
            .iter()
            .map(|&i| keys[i].as_str())
            .min()
            .unwrap_or("")
    });
    let bounds = |component: &[usize], positions: &[Vec2]| -> Rect {
        component
            .iter()
            .map(|&i| Rect::from_center_size(positions[i].to_pos2(), sizes[i]))
            .reduce(|a, b| a.union(b))
            .unwrap_or(Rect::NOTHING)
    };
    let mut cursor: Option<f32> = None;
    let mut top: Option<f32> = None;
    for component in order {
        let anchored = component.iter().any(|&i| pinned[i]);
        let rect = bounds(component, positions);
        if anchored {
            cursor = Some(cursor.map_or(rect.max.x, |x| x.max(rect.max.x)));
            top = Some(top.map_or(rect.min.y, |y| y.min(rect.min.y)));
            continue;
        }
        let (Some(x), Some(y)) = (cursor, top) else {
            cursor = Some(rect.max.x);
            top = Some(rect.min.y);
            continue;
        };
        let shift = Vec2::new(x + GAP - rect.min.x, y - rect.min.y);
        for &i in component {
            positions[i] += shift;
        }
        cursor = Some(rect.max.x + shift.x);
    }
}
