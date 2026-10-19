use std::collections::{BTreeMap, HashSet};

use egui::{Color32, Pos2, Rect as ERect, Stroke as EStroke, Ui, Vec2};
use engine::core::content::{Content, ContentRow, RowName, row_file};
use engine::core::math::{Pos, Rect, Size};
use engine::core::script::VariableType;
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::{self, AreaDef, AreaId, Flip};
use engine::systems::script::Variable;
use serde_json::Value;

use super::holes::fill_holes;
use super::{AreaFrame, modules, select, shapes};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::ContentEdit;
use crate::ui::{theme, widgets};
use crate::{rows, thumbs, value};

pub fn placement_json(blueprint: &str, at: Pos<Tiles>, flip: Flip, values: &Value) -> Value {
    let mut module = serde_json::json!({ "type": "blueprint", "blueprint": blueprint, "at": { "x": at.x, "y": at.y } });
    if !flip.is_none() {
        module["flip"] = serde_json::json!(flip);
    }
    if values.as_object().is_some_and(|values| !values.is_empty()) {
        module["values"] = values.clone();
    }
    module
}

pub fn placement_module(
    content: &Content,
    blueprint: &str,
    at: Pos<Tiles>,
    flip: Flip,
    values: &Value,
) -> Option<area::AreaModule> {
    value::typed(content, placement_json(blueprint, at, flip, values))
}

pub fn placed_part(
    content: &Content,
    part: &Value,
    values: &Value,
    variables: &BTreeMap<String, Variable>,
    at: Pos<Tiles>,
    flip: Flip,
) -> Option<Value> {
    let mut json = part.clone();
    fill_holes(&mut json, values, variables);
    let mut module: area::AreaModule = value::typed(content, json)?;
    area::blueprint::place(&mut module, at, flip);
    value::untyped(content, &module)
}

pub fn stamp_panel(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: &Content,
    area_id: AreaId,
) {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for placement in area::placements(content, area_id) {
        if placement.chain.len() <= 1 {
            *counts
                .entry(placement.blueprint.key(content).to_owned())
                .or_default() += 1;
        }
    }
    let area_key = area_id.key(content).to_owned();
    let area_row = RowName::new(AreaDef::TABLE, &area_key);
    let owners = editor
        .project
        .as_ref()
        .map(|project| project.files.owners())
        .unwrap_or_default();
    let keys = content.table::<BlueprintDef>().keys();
    let local: Vec<&String> = keys
        .iter()
        .filter(|key| owners.owner(BlueprintDef::TABLE, key) == Some(&area_row))
        .collect();
    let global: Vec<&String> = keys
        .iter()
        .filter(|key| !owners.is_local(BlueprintDef::TABLE, key))
        .collect();
    let (show_global, needle) = {
        let view = editor.views.area.view_mut(view_key);
        let show_global = view.blueprints_global || local.is_empty();
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.scope(|ui| {
                ui.set_width(220.0);
                crate::ui::widgets::search_box(
                    ui,
                    &mut view.blueprint_search,
                    "Search blueprints",
                    None,
                );
            });
            ui.add_space(8.0);
            for (value, label) in [
                (false, format!("{area_key}'s · {}", local.len())),
                (true, format!("global · {}", global.len())),
            ] {
                if widgets::toggle_chip(ui, &label, show_global == value).clicked() {
                    view.blueprints_global = value;
                }
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(
                    theme::muted(format!(
                        "one blueprint at a time · {} makes one from the selection, local to \
                         {area_key}",
                        EditorKey::MakeBlueprint.name()
                    ))
                    .size(12.0),
                );
            });
        });
        (show_global, view.blueprint_search.to_lowercase())
    };
    let scope = if show_global { &global } else { &local };
    let mut listed: Vec<(String, usize)> = scope
        .iter()
        .filter(|k| needle.is_empty() || k.to_lowercase().contains(&needle))
        .map(|k| ((*k).clone(), counts.get(*k).copied().unwrap_or(0)))
        .collect();
    listed.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    ui.add_space(6.0);
    let card = Vec2::new(72.0, 80.0);
    let gap = 8.0;
    let fit = ((ui.available_width() + gap) / (card.x + gap))
        .floor()
        .max(1.0) as usize;
    let shown = if listed.len() > fit {
        fit - 1
    } else {
        listed.len()
    };
    let mut picked: Option<String> = None;
    let mut copy_into: Option<String> = None;
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = gap;
        for (key, count) in listed.iter().take(shown) {
            let selected = editor.views.area.view(view_key).stamp.as_deref() == Some(key);
            let response = blueprint_card(editor, ui, content, key, *count, selected, card);
            if response.clicked() {
                picked = Some(key.clone());
            }
            if show_global {
                response.context_menu(|ui| {
                    if ui.button(format!("Copy into {area_key}")).clicked() {
                        copy_into = Some(key.clone());
                        ui.close();
                    }
                });
            }
        }
        if listed.len() > shown {
            let (rect, _) = ui.allocate_exact_size(card, egui::Sense::hover());
            ui.painter().rect_stroke(
                rect,
                4.0,
                EStroke::new(1.0, theme::BORDER),
                egui::StrokeKind::Inside,
            );
            let text = format!(
                "{} more{}",
                listed.len() - shown,
                if show_global { "" } else { " here" }
            );
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                text,
                egui::FontId::proportional(12.0),
                theme::MUTED,
            );
        }
    });
    if let Some(key) = copy_into {
        picked = local_copy(editor, &key, &area_row);
        editor.views.area.view_mut(view_key).blueprints_global = false;
    }
    if let Some(key) = picked {
        let view = editor.views.area.view_mut(view_key);
        view.set_tool(super::AreaTool::Stamp);
        view.stamp = Some(key);
    }
}

/// Copies a global blueprint into a variant local to `area`, to edit freely, and answers its key.
fn local_copy(editor: &mut Editor, key: &str, area: &RowName) -> Option<String> {
    let project = editor.project.as_ref()?;
    let value = project.files.json(&row_file(BlueprintDef::TABLE, key))?;
    let copy = rows::free_key(
        &project.files,
        BlueprintDef::TABLE,
        &format!("{}_{key}", area.key),
    );
    let mut edit = ContentEdit::new(format!("Copy blueprint/{key} into {area} as {copy}"));
    edit.write_json(
        row_file(BlueprintDef::TABLE, &copy),
        &rows::owned_row(area, &value),
    );
    editor.try_apply(edit).ok()?;
    Some(copy)
}

pub(super) fn stamp_values(editor: &Editor, stamp: Option<&str>) -> Value {
    let values = stamp
        .and_then(|stamp| editor.settings.stamps.get(stamp))
        .map(|settings| settings.values.clone())
        .unwrap_or_default();
    Value::Object(values.into_iter().collect())
}

pub(super) fn blueprint_card(
    editor: &mut Editor,
    ui: &mut Ui,
    content: &Content,
    key: &str,
    count: usize,
    selected: bool,
    card: Vec2,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(card, egui::Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, theme::RAISED);
    let stroke = if selected {
        EStroke::new(2.0, theme::ACCENT)
    } else {
        EStroke::new(1.0, theme::BORDER)
    };
    painter.rect_stroke(rect, 4.0, stroke, egui::StrokeKind::Inside);
    let art = ERect::from_min_size(
        rect.min + Vec2::new(6.0, 6.0),
        Vec2::new(card.x - 12.0, card.x - 12.0),
    );
    draw_blueprint_art(editor, ui, content, key, art);
    if count > 0 {
        painter.text(
            Pos2::new(rect.center().x, rect.max.y - 10.0),
            egui::Align2::CENTER_CENTER,
            format!("×{count}"),
            egui::FontId::monospace(11.0),
            theme::MUTED,
        );
    }
    response.on_hover_text(key)
}

pub fn draw_blueprint_art(
    editor: &mut Editor,
    ui: &mut Ui,
    content: &Content,
    key: &str,
    into: ERect,
) {
    let sceneries = super::scene::parts_scenery(
        content,
        key,
        Pos::new(0.0, 0.0),
        &Value::Object(Default::default()),
    );
    if sceneries.is_empty() {
        ui.painter_at(into).text(
            into.center(),
            egui::Align2::CENTER_CENTER,
            "no art",
            egui::FontId::proportional(11.0),
            theme::FAINT,
        );
        return;
    }
    let extent = super::scene::scenery_extent(&sceneries).unwrap_or_default();
    let (min, max) = (extent.min(), extent.max());
    let span = (max.x - min.x).max(max.y - min.y).max(1.0);
    let scale = (into.width() / span).min(into.height() / span);
    let origin =
        into.center() - Vec2::new((max.x - min.x) * scale / 2.0, (max.y - min.y) * scale / 2.0);
    let ctx = ui.ctx().clone();
    let painter = ui.painter_at(into);
    for scenery in &sceneries {
        let def = scenery.tileset.get(content);
        let image = def.image.as_str().to_owned();
        let Some(project) = editor.project.as_ref() else {
            return;
        };
        let Some(thumb) = editor.form.thumbnails.image(&ctx, &project.files, &image) else {
            continue;
        };
        let grid = def.grid(thumb.size[0] as u32, thumb.size[1] as u32);
        for (row, tiles) in scenery.tiles.iter().enumerate() {
            for (column, tile) in tiles.iter().enumerate() {
                let Some(tile) = tile else {
                    continue;
                };
                let region = grid.region(tile.tile);
                let mut uv = thumbs::uv(
                    thumb.size,
                    region.min().x,
                    region.min().y,
                    region.size.width,
                    region.size.height,
                );
                let flip = Flip::of(
                    tile.flip.horizontal() != scenery.flip.horizontal(),
                    tile.flip.vertical() != scenery.flip.vertical(),
                );
                if flip.horizontal() {
                    uv = ERect::from_min_max(
                        Pos2::new(uv.max.x, uv.min.y),
                        Pos2::new(uv.min.x, uv.max.y),
                    );
                }
                if flip.vertical() {
                    uv = ERect::from_min_max(
                        Pos2::new(uv.min.x, uv.max.y),
                        Pos2::new(uv.max.x, uv.min.y),
                    );
                }
                let x = scenery.at.x + column as f32 - min.x;
                let y = scenery.at.y + row as f32 - min.y;
                let cell = ERect::from_min_size(
                    origin + Vec2::new(x * scale, y * scale),
                    Vec2::splat(scale + 0.5),
                );
                painter.image(thumb.texture.id(), cell, uv, Color32::WHITE);
            }
        }
    }
}

pub fn flip_stamp(editor: &mut Editor, view_key: &str, horizontal: bool) {
    let Some(stamp) = editor.views.area.view(view_key).stamp.clone() else {
        return;
    };
    let settings = editor.settings.stamps.entry(stamp).or_default();
    if horizontal {
        settings.flip_x = !settings.flip_x;
    } else {
        settings.flip_y = !settings.flip_y;
    }
    editor.save_settings();
}

pub(super) fn stamp_flip(editor: &Editor, stamp: &str) -> Flip {
    let settings = editor
        .settings
        .stamps
        .get(stamp)
        .cloned()
        .unwrap_or_default();
    Flip::of(settings.flip_x, settings.flip_y)
}

pub fn stamp_footprint(
    editor: &Editor,
    content: &Content,
    stamp: &str,
    values: &Value,
) -> Size<Tiles> {
    let flip = stamp_flip(editor, stamp);
    let Some(module) = placement_module(content, stamp, Pos::new(0.0, 0.0), flip, values) else {
        return Size::splat(1.0);
    };
    let mut errors = Vec::new();
    let flattening = area::blueprint::flatten(content, &[module], &mut errors);
    let mut bounds: Option<Rect<Tiles>> = None;
    for placed in flattening.modules {
        if let Ok(json) = value::json(&placed.module)
            && let Some(b) = shapes::bounds(&json, None)
        {
            bounds = Some(bounds.map_or(b, |known| known.union(&b)));
        }
    }
    bounds.map_or(Size::splat(1.0), |b| {
        Size::new(b.size.width.max(1.0), b.size.height.max(1.0))
    })
}

pub fn stamp_input(editor: &mut Editor, ui: &mut Ui, view_key: &str, frame: &AreaFrame) {
    let response = frame.response;
    let Some(stamp) = editor.views.area.view(view_key).stamp.clone() else {
        return;
    };
    let alt = ui.input(|i| EditorKey::Unsnapped.held(i));
    let Some(tile) = frame.drag_tile() else {
        return;
    };
    let at = select::snap_to(tile, alt);
    let values = stamp_values(editor, Some(&stamp));
    let footprint = stamp_footprint(editor, &frame.content, &stamp, &values);
    let spacing = editor
        .settings
        .stamps
        .get(&stamp)
        .and_then(|s| s.spacing)
        .map(|s| s as f32);
    let step = spacing.unwrap_or(footprint.width.max(footprint.height).max(1.0));
    if response.drag_started_by(egui::PointerButton::Primary) || response.clicked() {
        let view = editor.views.area.view_mut(view_key);
        view.set_drag(super::AreaDrag::Stamp {
            placed: vec![at],
            last: at,
        });
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        let view = editor.views.area.view_mut(view_key);
        if let Some(super::AreaDrag::Stamp { placed, last }) = view.drag_mut()
            && last.distance(at).0 >= step
        {
            placed.push(at);
            *last = at;
        }
    }
    if response.drag_stopped_by(egui::PointerButton::Primary) || response.clicked() {
        let view = editor.views.area.view_mut(view_key);
        let Some(super::AreaDrag::Stamp { placed, .. }) = view.take_drag() else {
            return;
        };
        place_stamps(editor, frame, &stamp, &values, placed);
    }
}

pub(super) fn place_stamps(
    editor: &mut Editor,
    frame: &AreaFrame,
    stamp: &str,
    values: &Value,
    placed: Vec<Pos<Tiles>>,
) {
    let content = frame.content.clone();
    let Some(id) = content.by_key::<area::blueprint::BlueprintDef>(stamp) else {
        return;
    };
    let def = id.get(&content);
    let flip = stamp_flip(editor, stamp);
    let mut taken: HashSet<String> = object_names(&content, frame.area_id);
    let mut modules = Vec::new();
    for at in &placed {
        let mut own = values.clone();
        for (name, variable) in &def.variables {
            if variable.ty == VariableType::Name {
                let base = own
                    .get(name)
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                    .or_else(|| {
                        variable
                            .default
                            .as_ref()
                            .and_then(|d| value::json(d).ok())
                            .and_then(|v| v.as_str().map(str::to_owned))
                    })
                    .unwrap_or_else(|| name.clone());
                let fresh = rows::free_name(&base, &taken);
                taken.insert(fresh.clone());
                own[name] = Value::String(fresh);
            }
        }
        modules.push(placement_json(stamp, *at, flip, &own));
    }
    let count = modules.len();
    let label = if count == 1 {
        format!("Place {stamp} in {}", frame.area_key)
    } else {
        format!("Place {count} × {stamp} in {}", frame.area_key)
    };
    let area_key = frame.area_key.clone();
    let text = match modules::place_modules(editor, &area_key, modules, &label) {
        modules::PlaceOutcome::Whole => None,
        modules::PlaceOutcome::Partly { skipped, reason } => {
            Some(format!("{skipped} of {count} skipped: {reason}"))
        }
    };
    if let Some(text) = &text {
        editor.toast(text.clone());
    }
    if let Some(view) = editor
        .views
        .area
        .views
        .get_mut(&super::area_view_key(&area_key))
    {
        view.skipped = text;
    }
}

pub fn object_names(content: &Content, area_id: AreaId) -> HashSet<String> {
    area::objects(area::placed(content, area_id))
        .filter_map(|(_, object)| object.name.clone())
        .collect()
}

pub fn stamp_overlay(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &AreaFrame,
) {
    let canvas = frame.canvas;
    let view = editor.views.area.view(view_key);
    let Some(stamp) = view.stamp.clone() else {
        return;
    };
    let alt = painter.ctx().input(|i| EditorKey::Unsnapped.held(i));
    let values = stamp_values(editor, Some(&stamp));
    let footprint = stamp_footprint(editor, &frame.content, &stamp, &values);
    let color = Color32::from_rgb(90, 220, 220);
    let draw_ghost = |at: Pos<Tiles>| {
        let rect = Rect::new(Pos::new(at.x - 0.5, at.y - 0.5), footprint);
        painter.rect_stroke(
            canvas.rect(rect),
            0.0,
            EStroke::new(1.5, color),
            egui::StrokeKind::Inside,
        );
        painter.circle_filled(canvas.to_screen(at), 3.0, color);
    };
    if let Some(super::AreaDrag::Stamp { placed, .. }) = view.drag() {
        for at in placed {
            draw_ghost(*at);
        }
    }
    if let Some(tile) = frame.pointer_tile {
        let at = select::snap_to(tile, alt);
        draw_ghost(at);
        painter.text(
            canvas.to_screen(at) + Vec2::new(8.0, 8.0),
            egui::Align2::LEFT_TOP,
            &stamp,
            egui::FontId::proportional(11.0),
            color,
        );
    }
}
