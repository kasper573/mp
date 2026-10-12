use std::collections::BTreeMap;

/// An area, its distance from the spawn in warps, and its card's position and size.
type DistanceRow<'a> = (&'a String, u32, Option<&'a ((f64, f64), f64)>);

use egui::{Align, Color32, Layout as EguiLayout, Rect, RichText, Stroke, Ui, Vec2};
use game::core::tiling::TilePos;
use serde_json::Value;

use super::atlas::{Atlas, Source};
use super::canvas::{self, line_steps, viridis};
use super::toolbar::{LayerCounts, number_fields};
use super::{
    AREA_ZOOM, ColourOf, ColourShow, Layout, Part, REGION_COLOURS, layout_of, region_colour,
    select, with_defaults, write_layout, write_layout_merging,
};
use crate::app::Editor;
use crate::project::Selection;
use crate::tabs::Tab;
use crate::ui::{theme, widgets};

/// The inspector while the World tab is open and nothing on the map is selected: the tile under the
/// pointer when zoomed in, else whatever lens is on, else the world itself.
pub fn inspect_world(editor: &mut Editor, ui: &mut Ui) {
    let Some(atlas) = editor.views.world.atlas.clone() else {
        return;
    };
    let layout = with_defaults(&atlas, layout_of(editor));
    let hover = editor
        .views
        .world
        .menu_target
        .clone()
        .or_else(|| editor.views.world.hover.clone());
    if editor.views.world.zoom >= AREA_ZOOM
        && let Some((area, tile)) = hover
    {
        tile_panel(editor, ui, &atlas, &area, tile);
        return;
    }
    if editor.views.world.route.is_some() {
        route_panel(editor, ui, &atlas);
    } else if editor.views.world.quest_line.is_some() {
        line_panel(editor, ui, &atlas);
    } else if editor.views.world.colour.is_some() {
        colour_panel(editor, ui, &atlas);
    } else if !editor.views.world.lenses.is_empty() {
        lens_panel(editor, ui, &atlas);
    } else {
        overview(editor, ui, &atlas, &layout);
    }
}

fn crumb(ui: &mut Ui, tail: &str) {
    ui.label(
        theme::mono(format!("World · {tail}"))
            .size(12.5)
            .color(theme::MUTED),
    );
    ui.add_space(6.0);
}

fn overview(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas, layout: &Layout) {
    crumb(ui, "world_map/world");
    widgets::section(ui, "Layers");
    let counts = LayerCounts::of(atlas, layout);
    let layers = &mut editor.views.world.layers;
    for (on, label, count) in [
        (&mut layers.warps, "warps", counts.warps),
        (&mut layers.residents, "residents", counts.residents),
        (&mut layers.populations, "populations", counts.populations),
        (&mut layers.givers, "quest givers", counts.givers),
        (&mut layers.regions, "regions and notes", counts.regions),
    ] {
        ui.horizontal(|ui| {
            widgets::toggle(ui, on);
            ui.label(RichText::new(label).size(13.0));
            ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
                ui.label(theme::faint(count.to_string()).monospace().size(12.0));
            });
        });
    }
    ui.add_space(8.0);
    widgets::section(ui, "This world");
    let one_way = atlas
        .warps
        .iter()
        .filter(|warp| !atlas.both_ways(&warp.from, &warp.to))
        .count();
    let unreached = atlas
        .areas
        .keys()
        .filter(|key| !atlas.distances.contains_key(*key))
        .count();
    let furthest = atlas.distances.values().copied().max().unwrap_or(0);
    widgets::kv_text(ui, "areas", atlas.areas.len().to_string());
    widgets::kv_text(
        ui,
        "warps",
        if one_way == 0 {
            format!("{}, each with a way back", atlas.warps.len())
        } else {
            format!("{}, {one_way} one way", atlas.warps.len())
        },
    );
    widgets::kv_text(
        ui,
        "from the spawn",
        if unreached == 0 {
            format!("every area, at most {furthest} warps away")
        } else {
            format!("{unreached} areas unreached")
        },
    );
    widgets::kv_text(
        ui,
        "npcs placed",
        format!(
            "{} residents, {} populations",
            counts.residents, counts.populations
        ),
    );
    ui.add_space(8.0);
    widgets::hint(
        ui,
        "Double-click an area to open it. Right-click a spot to play there.",
    );
}

fn lens_panel(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas) {
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        return;
    };
    let Some(lit) = canvas::lit_areas(editor, content, atlas) else {
        return;
    };
    let lenses = editor.views.world.lenses.clone();
    crumb(
        ui,
        &lenses
            .iter()
            .map(|lens| lens.chip().replace(": ", "/"))
            .collect::<Vec<_>>()
            .join(" · "),
    );
    let mut by_kind: BTreeMap<&str, Vec<(&Source, &String)>> = BTreeMap::new();
    for (area, sources) in &lit {
        for source in sources {
            by_kind.entry(source.kind).or_default().push((source, area));
        }
    }
    if by_kind.is_empty() {
        ui.label(theme::muted("Nothing on the map matches."));
        return;
    }
    let mut go: Option<String> = None;
    for (kind, rows) in &by_kind {
        let (title, noun) = match *kind {
            "drop" => ("Dropped by", "npc"),
            "shop" => ("Sold in", "shop"),
            "quest" => ("Rewarded by", "quest"),
            "script" => ("Given by", "script"),
            "placed" => ("Placed in", "area"),
            "offers" => ("Offered by", "owner"),
            "accepts" => ("Accepted at", "owner"),
            "turns in" => ("Turned in at", "owner"),
            "fails" => ("Failed by", "owner"),
            "completes a task of" => ("Tasks completed by", "owner"),
            "warp" => ("Warped to from", "owner"),
            "module" => ("Has the module", "area"),
            "mention" => ("Mentioned in", "area"),
            "remembers" => ("Remembered by", "owner"),
            "reads" => ("Read in", "area"),
            other => (other, "row"),
        };
        widgets::section(
            ui,
            &format!(
                "{title} · {} {noun}{}",
                rows.len(),
                if rows.len() == 1 { "" } else { "s" }
            ),
        );
        for (source, area) in rows {
            ui.horizontal(|ui| {
                let name = source
                    .label
                    .split(' ')
                    .next()
                    .unwrap_or(&source.label)
                    .to_owned();
                if ui
                    .add(
                        egui::Label::new(theme::mono(&name).size(12.5)).sense(egui::Sense::click()),
                    )
                    .on_hover_text(&source.label)
                    .clicked()
                {
                    go = Some((*area).clone());
                }
                ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
                    ui.label(theme::faint(area.as_str()).monospace().size(12.0));
                });
            });
        }
        ui.add_space(6.0);
    }
    widgets::hint(
        ui,
        "Click a source to go to its area. Works for any row, module type or field value.",
    );
    if let Some(area) = go {
        let layout = with_defaults(atlas, layout_of(editor));
        let zoom = editor.views.world.zoom;
        select(editor, vec![Part::Card(area.clone())]);
        editor.views.world.look_at(atlas, &layout, &area, zoom);
    }
}

fn colour_panel(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas) {
    crumb(ui, "colour by");
    let fields = number_fields(editor);
    let Some(ranges) = canvas::colour_ranges(editor, atlas) else {
        return;
    };
    let colour = editor.views.world.colour.as_mut().expect("colour");
    let table = colour
        .value
        .split_once('.')
        .map(|(table, _)| table.to_owned())
        .unwrap_or_else(|| colour.value.clone());
    widgets::kv(ui, "value", |ui| {
        let shown = colour.value.replace('.', " · ");
        egui::ComboBox::from_id_salt("colour-value")
            .width(ui.available_width() - 8.0)
            .selected_text(theme::mono(shown).size(12.5))
            .show_ui(ui, |ui| {
                for field in &fields {
                    ui.selectable_value(
                        &mut colour.value,
                        field.clone(),
                        theme::mono(field.replace('.', " · ")),
                    );
                }
            });
    });
    if table == "npc" {
        widgets::kv(ui, "of", |ui| {
            egui::ComboBox::from_id_salt("colour-of")
                .width(ui.available_width() - 8.0)
                .selected_text(
                    theme::mono(match colour.of {
                        ColourOf::Placed => "npcs placed here",
                        ColourOf::Hostile => "hostile npcs placed here",
                    })
                    .size(12.5),
                )
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut colour.of, ColourOf::Placed, "npcs placed here");
                    ui.selectable_value(
                        &mut colour.of,
                        ColourOf::Hostile,
                        "hostile npcs placed here",
                    );
                });
        });
    }
    widgets::kv(ui, "show", |ui| {
        egui::ComboBox::from_id_salt("colour-show")
            .width(ui.available_width() - 8.0)
            .selected_text(
                theme::mono(match colour.show {
                    ColourShow::Highest => "the highest",
                    ColourShow::Lowest => "the lowest",
                })
                .size(12.5),
            )
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut colour.show, ColourShow::Highest, "the highest");
                ui.selectable_value(&mut colour.show, ColourShow::Lowest, "the lowest");
            });
    });
    let (per_area, low, high, unit) = ranges;
    ui.add_space(6.0);
    let (bar, _) =
        ui.allocate_exact_size(Vec2::new(ui.available_width(), 10.0), egui::Sense::hover());
    let painter = ui.painter();
    let steps = 40;
    for i in 0..steps {
        let t0 = i as f32 / steps as f32;
        let t1 = (i + 1) as f32 / steps as f32;
        let r = Rect::from_min_max(
            egui::pos2(bar.min.x + bar.width() * t0, bar.min.y),
            egui::pos2(bar.min.x + bar.width() * t1, bar.max.y),
        );
        painter.rect_filled(r, 0.0, viridis(t0));
    }
    ui.horizontal(|ui| {
        ui.label(theme::faint(trim(low)).monospace().size(11.0));
        ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
            ui.label(
                theme::faint(format!("{} {unit}", trim(high)))
                    .monospace()
                    .size(11.0),
            );
            ui.label(
                theme::faint(trim((low + high) / 2.0))
                    .monospace()
                    .size(11.0),
            );
        });
    });
    ui.add_space(8.0);
    widgets::section(ui, "By distance from the spawn");
    let mut rows: Vec<DistanceRow> = atlas
        .areas
        .keys()
        .map(|key| {
            (
                key,
                atlas.distances.get(key).copied().unwrap_or(u32::MAX),
                per_area.get(key),
            )
        })
        .collect();
    rows.retain(|(_, _, range)| range.is_some());
    rows.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(b.0)));
    let mut bumps = Vec::new();
    for (index, (key, distance, range)) in rows.iter().enumerate() {
        let value = range.map(|(_, value)| *value).unwrap_or(0.0);
        let above = rows
            .iter()
            .skip(index + 1)
            .any(|(_, other_distance, other)| {
                other_distance > distance && other.is_some_and(|(_, v)| *v < value)
            });
        if above {
            bumps.push((*key).clone());
        }
    }
    egui::Grid::new("colour-rows")
        .num_columns(3)
        .spacing([12.0, 3.0])
        .show(ui, |ui| {
            ui.label(theme::faint("area").size(11.0));
            ui.label(theme::faint("warps").size(11.0));
            ui.label(theme::faint(&unit).size(11.0));
            ui.end_row();
            for (key, distance, range) in &rows {
                let marked = bumps.contains(key);
                ui.label(
                    theme::mono(format!("{key}{}", if marked { " ▲" } else { "" }))
                        .size(12.5)
                        .color(if marked { theme::WARN } else { theme::TEXT }),
                );
                ui.label(
                    theme::mono(if *distance == u32::MAX {
                        "–".to_owned()
                    } else {
                        distance.to_string()
                    })
                    .size(12.5),
                );
                let ((lo, hi), _) = range.expect("range");
                ui.label(
                    theme::mono(if lo == hi {
                        trim(*lo)
                    } else {
                        format!("{}–{}", trim(*lo), trim(*hi))
                    })
                    .size(12.5),
                );
                ui.end_row();
            }
        });
    if !bumps.is_empty() {
        ui.add_space(6.0);
        ui.label(theme::muted("▲ above the curve: stronger than areas further out.").size(12.0));
    }
}

fn trim(value: f64) -> String {
    crate::forms::trim_number(value)
}

fn line_panel(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas) {
    crumb(ui, "quest line");
    let Some(category) = editor.views.world.quest_line.clone() else {
        return;
    };
    let steps = line_steps(atlas, &category);
    let quests = atlas
        .lines
        .iter()
        .find(|line| line.category == category)
        .map(|line| line.quests.len())
        .unwrap_or(0);
    widgets::section(ui, &format!("{category} · {quests} quests"));
    let mut go: Option<String> = None;
    for step in &steps {
        ui.horizontal_top(|ui| {
            let (rect, _) = ui.allocate_exact_size(Vec2::splat(18.0), egui::Sense::hover());
            let (fill, ink) = if step.branch {
                (theme::DANGER, Color32::WHITE)
            } else {
                (theme::WARN, Color32::BLACK)
            };
            ui.painter()
                .circle(rect.center(), 9.0, fill, Stroke::new(1.0, Color32::BLACK));
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                &step.badge,
                egui::FontId::proportional(11.0),
                ink,
            );
            ui.vertical(|ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing.x = 4.0;
                    ui.label(RichText::new(&step.label).size(12.5));
                    ui.label(theme::faint("·").size(12.0));
                    for area in &step.areas {
                        if ui
                            .add(
                                egui::Label::new(theme::faint(area).monospace().size(12.0))
                                    .sense(egui::Sense::click()),
                            )
                            .clicked()
                        {
                            go = Some(area.clone());
                        }
                    }
                });
            });
        });
    }
    ui.add_space(8.0);
    widgets::section(ui, "Other quest lines");
    for line in atlas.lines.iter().filter(|line| line.category != category) {
        ui.horizontal(|ui| {
            if ui
                .add(
                    egui::Label::new(RichText::new(&line.category).size(12.5))
                        .sense(egui::Sense::click()),
                )
                .clicked()
            {
                editor.views.world.quest_line = Some(line.category.clone());
            }
            ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
                ui.label(
                    theme::mono(line.quests.join(" → "))
                        .size(11.5)
                        .color(theme::MUTED),
                );
            });
        });
    }
    if let Some(area) = go {
        let layout = with_defaults(atlas, layout_of(editor));
        let zoom = editor.views.world.zoom;
        editor.views.world.look_at(atlas, &layout, &area, zoom);
    }
}

fn route_panel(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas) {
    crumb(ui, "route");
    let Some((from, to)) = editor.views.world.route.clone() else {
        return;
    };
    match atlas.route(&from, &to) {
        Some(route) => {
            widgets::section(ui, &format!("{from} → {to} · {} warps", route.len()));
            for step in &route {
                ui.horizontal(|ui| {
                    ui.label(theme::mono(&step.from).size(12.5));
                    ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
                        let door = step
                            .owner
                            .rsplit(" › ")
                            .next()
                            .unwrap_or(&step.owner)
                            .to_owned();
                        ui.label(theme::faint(door).monospace().size(12.0));
                    });
                });
            }
        }
        None => {
            widgets::section(ui, &format!("{from} → {to}"));
            ui.label(theme::muted("No chain of warps leads there."));
        }
    }
    ui.add_space(8.0);
    widgets::section(ui, "Reach");
    let unreached: Vec<&String> = atlas
        .areas
        .keys()
        .filter(|key| !atlas.distances.contains_key(*key))
        .collect();
    let one_way: Vec<&super::atlas::Warp> = atlas
        .warps
        .iter()
        .filter(|warp| !atlas.both_ways(&warp.from, &warp.to))
        .collect();
    check(
        ui,
        unreached.is_empty(),
        &if unreached.is_empty() {
            format!(
                "all {} areas can be reached from the spawn",
                atlas.areas.len()
            )
        } else {
            format!(
                "{} areas no warp reaches: {}",
                unreached.len(),
                unreached
                    .iter()
                    .map(|k| k.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        },
    );
    check(
        ui,
        one_way.is_empty(),
        &if one_way.is_empty() {
            "no one-way warps".to_owned()
        } else {
            format!(
                "{} one-way warps: {}",
                one_way.len(),
                one_way
                    .iter()
                    .map(|w| format!("{} → {}", w.from, w.to))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        },
    );
    ui.add_space(8.0);
    widgets::hint(
        ui,
        "Numbers on the cards are warps from the spawn. Alt-click two areas for the route between them.",
    );
}

fn check(ui: &mut Ui, ok: bool, text: &str) {
    ui.horizontal_wrapped(|ui| {
        ui.label(RichText::new(if ok { "✓" } else { "·" }).color(if ok {
            theme::OK
        } else {
            theme::WARN
        }));
        ui.label(RichText::new(text).size(12.5));
    });
}

fn tile_panel(
    editor: &mut Editor,
    ui: &mut Ui,
    atlas: &Atlas,
    area: &str,
    tile: game::core::math::Pos<game::core::tiling::Tiles>,
) {
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        return;
    };
    let Some(info) = atlas.areas.get(area) else {
        return;
    };
    let cell = tile.snap();
    crumb(ui, &format!("{area} · tile {}, {}", cell.x, cell.y));
    let loaded = game::systems::area::load(&content, info.id);
    let walkable = loaded.grid.walkable(cell);
    let safe = loaded.safe_zones.iter().any(|zone| zone.contains(cell));
    widgets::kv_text(ui, "walkable", if walkable { "yes" } else { "no" });
    widgets::kv_text(
        ui,
        "safe zone",
        if safe { "inside one" } else { "none here" },
    );
    let nearest_npc = info
        .residents
        .iter()
        .chain(info.populations.iter())
        .map(|npc| (npc, npc.at.distance(cell).0))
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    widgets::kv_text(
        ui,
        "nearest npc",
        nearest_npc
            .map(|(npc, d)| format!("{}, {} tiles", npc.npc, d.round()))
            .unwrap_or_else(|| "none placed".to_owned()),
    );
    let nearest_door = info
        .doors
        .iter()
        .map(|door| (door, door.at.distance(cell).0))
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    widgets::kv_text(
        ui,
        "nearest door",
        nearest_door
            .map(|(door, d)| {
                format!(
                    "{}, {} tiles",
                    door.label.rsplit(" › ").next().unwrap_or(&door.label),
                    d.round()
                )
            })
            .unwrap_or_else(|| "none".to_owned()),
    );
    ui.add_space(8.0);
    widgets::section(ui, "Test character");
    let characters = crate::play::test_characters(editor);
    let current = editor
        .views
        .world
        .play_character
        .clone()
        .or_else(|| crate::play::current_character(editor))
        .unwrap_or_default();
    let shown = characters
        .iter()
        .find(|c| c.key == current)
        .map(|c| format!("{} · level {}", c.key, c.level))
        .unwrap_or_else(|| "none".to_owned());
    let mut picked = current.clone();
    egui::ComboBox::from_id_salt("world-play-character")
        .width(ui.available_width() - 8.0)
        .selected_text(theme::mono(shown).size(12.5))
        .show_ui(ui, |ui| {
            for character in &characters {
                ui.selectable_value(
                    &mut picked,
                    character.key.clone(),
                    format!("{} · level {}", character.key, character.level),
                );
            }
        });
    if picked != current {
        editor.views.world.play_character = Some(picked.clone());
        editor.play.character = Some(picked);
    }
    ui.add_space(6.0);
    widgets::hint(
        ui,
        "Play here changes only where the test character starts.",
    );
}

/// The inspector for what is selected on the map: cards, a region or a note.
pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    let parts: Vec<Part> = selection
        .parts
        .iter()
        .filter_map(|part| Part::parse(part))
        .collect();
    let Some(atlas) = editor.views.world.atlas.clone() else {
        return;
    };
    let layout = with_defaults(&atlas, layout_of(editor));
    let cards: Vec<String> = parts
        .iter()
        .filter_map(|part| match part {
            Part::Card(key) => Some(key.clone()),
            _ => None,
        })
        .filter(|key| layout.cards.contains_key(key))
        .collect();
    if !cards.is_empty() {
        inspect_cards(editor, ui, &atlas, &layout, &cards);
        return;
    }
    if let Some(Part::Region(index)) = parts.first().cloned()
        && index < layout.regions.len()
    {
        inspect_region(editor, ui, &layout, index);
        return;
    }
    if let Some(Part::Note(index)) = parts.first().cloned()
        && index < layout.notes.len()
    {
        inspect_note(editor, ui, &layout, index);
        return;
    }
    inspect_world(editor, ui);
}

fn inspect_cards(
    editor: &mut Editor,
    ui: &mut Ui,
    atlas: &Atlas,
    layout: &Layout,
    cards: &[String],
) {
    let first = &cards[0];
    let card = layout.cards[first];
    crumb(
        ui,
        &if cards.len() == 1 {
            format!("card · {first}")
        } else {
            format!("{} cards", cards.len())
        },
    );
    let mut next = layout.clone();
    let mut label: Option<String> = None;
    let mut open: Option<String> = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(
            ui,
            "area",
            &if cards.len() == 1 {
                first.clone()
            } else {
                format!("{} cards", cards.len())
            },
            "",
            |_| {},
        );
        if cards.len() == 1 {
            widgets::kv(ui, "area", |ui| {
                if widgets::keyed_button(ui, &format!("area/ {first}"), "→", true).clicked() {
                    open = Some(first.clone());
                }
            });
            widgets::kv(ui, "at", |ui| {
                let (mut x, mut y) = (card.x, card.y);
                let response = crate::forms::boxed_input(ui, Some("canvas"), |ui| {
                    ui.with_layout(EguiLayout::left_to_right(Align::Center), |ui| {
                        let a = ui.add(egui::DragValue::new(&mut x).speed(1.0).fixed_decimals(0));
                        ui.label(theme::faint(","));
                        let b = ui.add(egui::DragValue::new(&mut y).speed(1.0).fixed_decimals(0));
                        a | b
                    })
                    .inner
                });
                if response.changed() {
                    let c = next.cards.get_mut(first).expect("card");
                    c.x = super::round2(x);
                    c.y = super::round2(y);
                    label = Some(format!("Move {first} on the world map"));
                }
            });
        }
        widgets::kv(ui, "size", |ui| {
            let mut size = card.size;
            let response = crate::forms::boxed_input(ui, Some("%"), |ui| {
                ui.add(egui::DragValue::new(&mut size).range(10..=400).speed(1.0))
            });
            let mut by: i32 = 0;
            if ui.small_button("−").clicked() {
                by = -10;
            }
            if ui.small_button("+").clicked() {
                by = 10;
            }
            if response.changed() || by != 0 {
                let size = (size as i32 + by).clamp(10, 400) as u32;
                for key in cards {
                    if let Some(c) = next.cards.get_mut(key) {
                        c.size = size;
                    }
                }
                label = Some(format!(
                    "Resize {} on the world map",
                    if cards.len() == 1 {
                        first.clone()
                    } else {
                        format!("{} cards", cards.len())
                    }
                ));
            }
        });
        widgets::kv(ui, "pinned", |ui| {
            let mut pinned = cards.iter().all(|key| layout.cards[key].pinned);
            if widgets::toggle(ui, &mut pinned).changed() {
                for key in cards {
                    if let Some(c) = next.cards.get_mut(key) {
                        c.pinned = pinned;
                    }
                }
                label = Some(format!(
                    "{} {}",
                    if pinned { "Pin" } else { "Unpin" },
                    if cards.len() == 1 {
                        first.clone()
                    } else {
                        format!("{} cards", cards.len())
                    }
                ));
            }
        });
        if let Some(region) = layout
            .regions
            .iter()
            .find(|region| region.cards.contains(first))
        {
            widgets::kv_text(ui, "region", region.name.clone());
        }
    });
    if let Some(label) = label {
        write_layout_merging(editor, next, label);
    }
    if let Some(key) = open {
        editor.open_tab(Tab::Area { key });
    }
    ui.add_space(8.0);
    widgets::section(ui, "Keys");
    for (keys, text) in [
        ("− =", "size of every selected card, 10% a step"),
        ("Shift with them", "1% a step"),
        ("← → ↑ ↓", "move the selection"),
        ("Ctrl A", "select every card"),
        ("P", "pin or unpin"),
    ] {
        widgets::key_hint_text(ui, keys, text);
    }
    if cards.len() == 1 {
        ui.add_space(8.0);
        widgets::section(ui, "Stored in world_map/world.json");
        let json = serde_json::to_string_pretty(&serde_json::to_value(card).unwrap_or(Value::Null))
            .unwrap_or_default();
        widgets::code_block(ui, &format!("\"{first}\": {json}"));
        if let Some(info) = atlas.areas.get(first) {
            ui.add_space(4.0);
            ui.label(
                theme::faint(format!(
                    "{} · {} × {} tiles · {}",
                    info.name,
                    info.size.width,
                    info.size.height,
                    match atlas.distances.get(first) {
                        Some(0) => "the spawn".to_owned(),
                        Some(d) => format!("{d} warps from the spawn"),
                        None => "no warp reaches it".to_owned(),
                    }
                ))
                .size(11.5),
            );
        }
    }
}

fn inspect_region(editor: &mut Editor, ui: &mut Ui, layout: &Layout, index: usize) {
    crumb(ui, "region");
    let region = layout.regions[index].clone();
    let mut next = layout.clone();
    let mut label: Option<String> = None;
    widgets::card_frame(true).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::card_header(ui, "region", &region.name, "", |_| {});
        widgets::kv(ui, "name", |ui| {
            let id = ui.id().with(("region-name", index));
            let mut draft: String = ui
                .ctx()
                .data(|d| d.get_temp(id))
                .unwrap_or_else(|| region.name.clone());
            let response = ui.add(
                egui::TextEdit::singleline(&mut draft).desired_width(ui.available_width() - 8.0),
            );
            if response.changed() {
                ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
            }
            if crate::forms::committed(ui, &response) {
                ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
                if draft.trim() != region.name && !draft.trim().is_empty() {
                    next.regions[index].name = draft.trim().to_owned();
                    label = Some(format!("Rename region to {}", draft.trim()));
                }
            }
        });
        widgets::kv(ui, "colour", |ui| {
            let current = region.colour.clone().unwrap_or_else(|| "grey".to_owned());
            let mut picked = current.clone();
            egui::ComboBox::from_id_salt(("region-colour", index))
                .width(ui.available_width() - 8.0)
                .selected_text(
                    theme::mono(&current)
                        .size(12.5)
                        .color(region_colour(Some(&current))),
                )
                .show_ui(ui, |ui| {
                    for colour in REGION_COLOURS {
                        ui.selectable_value(
                            &mut picked,
                            colour.to_owned(),
                            RichText::new(colour).color(region_colour(Some(colour))),
                        );
                    }
                });
            if picked != current {
                next.regions[index].colour = (picked != "grey").then_some(picked);
                label = Some(format!("Colour region {}", region.name));
            }
        });
        widgets::kv_text(
            ui,
            "holds",
            format!("{} cards: {}", region.cards.len(), region.cards.join(", ")),
        );
    });
    if let Some(label) = label {
        write_layout(editor, next, label);
        return;
    }
    ui.add_space(8.0);
    widgets::hint(
        ui,
        "Dragging a region's label moves its cards. Regions and notes live in the world_map row.",
    );
    ui.add_space(6.0);
    if widgets::danger(ui, "Delete region").clicked() {
        let mut next = layout.clone();
        next.regions.remove(index);
        if write_layout(editor, next, format!("Delete region {}", region.name)) {
            select(editor, Vec::new());
        }
    }
}

fn inspect_note(editor: &mut Editor, ui: &mut Ui, layout: &Layout, index: usize) {
    crumb(ui, "note");
    let note = &layout.notes[index];
    widgets::section(ui, "Note");
    let id = ui.id().with(("note-text", index));
    let mut draft: String = ui
        .ctx()
        .data(|d| d.get_temp(id))
        .unwrap_or_else(|| note.text.clone());
    let response = ui.add(
        egui::TextEdit::multiline(&mut draft)
            .desired_rows(4)
            .desired_width(ui.available_width())
            .char_limit(280),
    );
    if response.changed() {
        ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
    }
    ui.label(theme::faint(format!("{} of 280 characters", draft.chars().count())).size(11.5));
    if crate::forms::committed(ui, &response) {
        ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
        if draft != note.text && !draft.trim().is_empty() {
            let mut next = layout.clone();
            next.notes[index].text = draft.clone();
            write_layout(editor, next, "Edit a note".to_owned());
            return;
        }
    }
    ui.add_space(6.0);
    widgets::hint(
        ui,
        "Notes hold the team's open questions and plans, where they matter.",
    );
    ui.add_space(6.0);
    if widgets::danger(ui, "Delete note").clicked() {
        let mut next = layout.clone();
        next.notes.remove(index);
        if write_layout(editor, next, "Delete a note".to_owned()) {
            select(editor, Vec::new());
        }
    }
}
