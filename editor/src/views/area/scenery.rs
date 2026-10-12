use egui::Ui;
use game::core::math::Pos;
use game::core::tiling::{Cell, TilePos, TileRect, Tiles};
use game::systems::area::{self, AreaModuleKind, Flip};
use serde_json::Value;

use super::holes::suffixed;
use super::placement::warp_destinations;
use super::stamp::object_names;
use super::{Frame, shapes};
use super::{modules, placement};
use crate::app::Editor;
use crate::forms::FormCx;
use crate::project::{Edit, row_file};
use crate::ui::widgets;
use crate::value::RowValue;

pub fn join_scenery(editor: &mut Editor, view_key: &str, frame: &Frame) {
    let indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| p.strip_prefix("/modules/")?.parse().ok())
        .collect();
    let sceneries: Vec<&Value> = indices
        .iter()
        .filter_map(|&i| frame.modules.get(i))
        .filter(|m| m.is_module(AreaModuleKind::Scenery))
        .collect();
    if sceneries.len() < 2 {
        editor.toast("Select two or more sceneries of one tileset to join (Ctrl G)");
        let _ = view_key;
        return;
    }
    let tileset = sceneries[0].text("tileset").to_owned();
    if sceneries
        .iter()
        .any(|s| s["tileset"].as_str() != Some(tileset.as_str()))
    {
        editor.toast("Joined sceneries share one tileset");
        return;
    }
    let bounds = sceneries
        .iter()
        .filter_map(|s| shapes::scenery_rect(s))
        .reduce(shapes::rect_union)
        .expect("bounds");
    let width = bounds.size.width.ceil() as usize;
    let height = bounds.size.height.ceil() as usize;
    let mut tiles: Vec<Vec<Value>> = vec![vec![Value::Null; width]; height];
    let mut blocks: Vec<Value> = Vec::new();
    for scenery in &sceneries {
        let Some(rect) = shapes::scenery_rect(scenery) else {
            continue;
        };
        let flip = Flip::parse(scenery.text("flip")).unwrap_or(Flip::None);
        let rows = scenery["tiles"].as_array().cloned().unwrap_or_default();
        let h = rows.len();
        for (r, row) in rows.iter().enumerate() {
            let w = row.as_array().map_or(0, Vec::len);
            for (c, tile) in row.as_array().into_iter().flatten().enumerate() {
                if tile.is_null() {
                    continue;
                }
                let (cc, rr) = (
                    if flip.horizontal() { w - 1 - c } else { c },
                    if flip.vertical() { h - 1 - r } else { r },
                );
                let x = (rect.min().x - bounds.min().x).round() as usize + cc;
                let y = (rect.min().y - bounds.min().y).round() as usize + rr;
                if y < height && x < width {
                    let mut placed = tile.clone();
                    if !flip.is_none() {
                        let own = Flip::parse(tile.text("flip"))
                            .unwrap_or(Flip::None)
                            .compose(flip);
                        let number = tile.as_u64().or_else(|| tile["tile"].as_u64()).unwrap_or(0);
                        placed = if own.is_none() {
                            Value::from(number)
                        } else {
                            serde_json::json!({ "tile": number, "flip": own.csv() })
                        };
                    }
                    tiles[y][x] = placed;
                }
            }
        }
        for block in scenery["blocks"].as_array().into_iter().flatten() {
            let (Some(bx), Some(by)) = (block[0].as_i64(), block[1].as_i64()) else {
                continue;
            };
            let center = Pos::new(bx as f32 + 0.5, by as f32 + 0.5);
            let at = shapes::pos_of(&scenery["at"]).unwrap_or(Pos::new(0.0, 0.0));
            let abs = at + flip.apply(center).to_vector();
            blocks.push(serde_json::json!([
                (abs.x - bounds.min().x).floor() as i32,
                (abs.y - bounds.min().y).floor() as i32
            ]));
        }
    }
    let mut joined = serde_json::json!({ "type": "scenery", "at": { "x": bounds.min().x, "y": bounds.min().y }, "tileset": tileset, "tiles": tiles });
    if let Some(sort) = sceneries
        .iter()
        .filter_map(|s| s["sort"].as_f64())
        .reduce(f64::max)
    {
        joined["sort"] = serde_json::json!(sort);
    }
    if !blocks.is_empty() {
        joined["blocks"] = Value::Array(blocks);
    }
    let mut modules = frame.modules.clone();
    let mut sorted = indices.clone();
    sorted.sort_unstable();
    for i in sorted.iter().rev() {
        if frame.modules[*i].is_module(AreaModuleKind::Scenery) {
            modules.remove(*i);
        }
    }
    let at = sorted[0].min(modules.len());
    modules.insert(at, joined);
    if modules::write_modules(
        editor,
        &frame.area_key,
        modules,
        &format!("Join {} sceneries in {}", sceneries.len(), frame.area_key),
    ) {
        editor.selection.parts = vec![format!("/modules/{at}")];
    }
}

pub fn split_scenery(editor: &mut Editor, frame: &Frame, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let tileset = module.text("tileset").to_owned();
    let flip = Flip::parse(module.text("flip")).unwrap_or(Flip::None);
    let grids = frame.area().grids;
    let mut draft = super::grid::GridDraft::of(&frame.area_key, grids);
    let layer = editor
        .views
        .area
        .views
        .get(&super::area_view_key(&frame.area_key))
        .map_or(0, |v| v.layer);
    let rows = module["tiles"].as_array().cloned().unwrap_or_default();
    let h = rows.len();
    let mut placed = 0;
    let mut kept: Vec<Vec<Value>> = rows
        .iter()
        .map(|r| r.as_array().cloned().unwrap_or_default())
        .collect();
    for (r, row) in rows.iter().enumerate() {
        let w = row.as_array().map_or(0, Vec::len);
        for (c, tile) in row.as_array().into_iter().flatten().enumerate() {
            if tile.is_null() {
                continue;
            }
            let (cc, rr) = (
                if flip.horizontal() { w - 1 - c } else { c },
                if flip.vertical() { h - 1 - r } else { r },
            );
            let cell = Pos::<Tiles>::new(
                rect.min().x + cc as f32 + 0.5,
                rect.min().y + rr as f32 + 0.5,
            )
            .cell();
            if draft.get(layer, cell).is_some() || cell.index(draft.size).is_none() {
                continue;
            }
            let number = tile.as_u64().or_else(|| tile["tile"].as_u64()).unwrap_or(0) as u32;
            let own = Flip::parse(tile.text("flip"))
                .unwrap_or(Flip::None)
                .compose(flip);
            let entry = draft.intern(&tileset, number, own);
            draft.set(layer, cell, Some(entry));
            kept[r][c] = Value::Null;
            placed += 1;
        }
    }
    if placed == 0 {
        editor.toast("No free cell under the scenery on the active layer");
        return;
    }
    let mut modules = frame.modules.clone();
    let all_gone = kept.iter().all(|row| row.iter().all(Value::is_null));
    if all_gone {
        modules.remove(index);
    } else {
        modules[index]["tiles"] = Value::Array(kept.into_iter().map(Value::Array).collect());
    }
    let Some(mut row) = editor.row_value("area", &frame.area_key) else {
        return;
    };
    row["modules"] = Value::Array(modules);
    let mut edit = Edit::new(format!(
        "Split scenery into {placed} tiles in {}",
        frame.area_key
    ));
    edit.write_json(row_file("area", &frame.area_key), &row);
    draft.write_into(&mut edit);
    if editor.apply(edit) && all_gone {
        editor.selection.parts.clear();
    }
}

pub fn return_door(editor: &mut Editor, frame: &Frame, index: usize) {
    return_door_from(editor, &frame.area_key, &frame.modules, index);
}

pub fn return_door_from(editor: &mut Editor, area_key: &str, modules: &[Value], index: usize) {
    let index = if index == usize::MAX {
        editor
            .selection
            .parts
            .first()
            .and_then(|p| p.strip_prefix("/modules/")?.parse().ok())
            .unwrap_or(0)
    } else {
        index
    };
    let Some(module) = modules.get(index) else {
        return;
    };
    let Some((target_area, target_at)) = warp_destinations(module).into_iter().next() else {
        editor.toast("The object has no warp to return from");
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let Some(here_id) = content.by_key::<area::AreaDef>(area_key) else {
        return;
    };
    let Some(there_id) = content.by_key::<area::AreaDef>(&target_area) else {
        return;
    };
    let here = area::load(&content, here_id);
    let there = area::load(&content, there_id);
    let Some(door_bounds) = shapes::bounds(module, None) else {
        return;
    };
    let back_to = here
        .grid
        .nodes()
        .iter()
        .filter(|cell| !door_bounds.contains(**cell))
        .min_by(|a, b| {
            a.distance(door_bounds.center())
                .0
                .total_cmp(&b.distance(door_bounds.center()).0)
        })
        .copied();
    let Some(back_to) = back_to else {
        editor.toast("No walkable cell outside the door to come back to");
        return;
    };
    let Some(_) = there.grid.nearest_walkable(target_at) else {
        editor.toast("The destination has no walkable cell");
        return;
    };
    let mut names = object_names(content, there_id);
    let name = suffixed(&format!("{}_back", module.text_or("name", "door")), &names);
    names.insert(name.clone());
    let cell = target_at.cell();
    let door = serde_json::json!({
        "type": "object",
        "name": name,
        "shape": { "type": "point", "x": cell.x as f32, "y": cell.y as f32 },
        "scripts": [{ "type": "shared_script", "script": "warp", "values": { "to": { "area": area_key, "x": back_to.x, "y": back_to.y } } }]
    });
    let Some(mut there_row) = editor.row_value("area", &target_area) else {
        return;
    };
    if let Some(m) = there_row["modules"].as_array_mut() {
        m.push(door);
    }
    let mut edit = Edit::new(format!("Return door from {target_area} to {area_key}"));
    edit.write_json(row_file("area", &target_area), &there_row);
    if editor.apply(edit) {
        editor.toast(format!(
            "Added a door back in {target_area} at {}, {}",
            cell.x, cell.y
        ));
    }
}

pub(super) fn scenery_rows(ui: &mut Ui, module: &mut Value, path: &str) -> bool {
    let rows = module["tiles"].as_array().cloned().unwrap_or_default();
    let height = rows.len();
    let width = rows
        .iter()
        .map(|r| r.as_array().map_or(0, Vec::len))
        .max()
        .unwrap_or(0);
    let count: usize = rows
        .iter()
        .map(|r| {
            r.as_array()
                .map_or(0, |cells| cells.iter().filter(|c| !c.is_null()).count())
        })
        .sum();
    widgets::kv_text(ui, "size", format!("{width} × {height} tiles · {count}"));
    let mut changed = false;
    widgets::kv(ui, "sort", |ui| {
        let current = module["sort"].as_f64();
        let id = ui.id().with((path, "sort"));
        let mut draft = ui
            .ctx()
            .data(|d| d.get_temp::<String>(id))
            .unwrap_or_else(|| {
                current
                    .map(crate::forms::trim_number)
                    .unwrap_or_else(|| "flat".to_owned())
            });
        let response = crate::forms::boxed_input(
            ui,
            Some(&format!("tiles from the top · of {height}")),
            |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut draft)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(48.0),
                )
            },
        );
        if response.changed() {
            ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
        }
        if crate::forms::committed(ui, &response) {
            ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
            let parsed = draft.trim().parse::<f64>().ok();
            if parsed != current {
                match parsed {
                    Some(sort) => module["sort"] = Value::from(sort),
                    None => {
                        module.as_object_mut().map(|m| m.remove("sort"));
                    }
                }
                changed = true;
            }
        }
    });
    let blocks = module["blocks"].as_array().map_or(0, Vec::len);
    widgets::kv_text(
        ui,
        "blocks",
        if blocks == 0 {
            "none of its own".to_owned()
        } else {
            format!("{blocks} cells of its own")
        },
    );
    changed
}

pub(super) fn scenery_extras(
    ui: &mut Ui,
    cx: &mut FormCx,
    module: &Value,
    extras: &mut Vec<placement::Extra>,
    deferred: &mut Vec<super::Deferred>,
    index: usize,
) {
    let under = cx
        .owner_key
        .as_deref()
        .and_then(|key| blocked_under(cx, key, module))
        .unwrap_or(0);
    ui.add_space(4.0);
    if under > 0 {
        widgets::hint(ui, &format!("{under} cells under it are blocked"));
        if ui
            .button(format!("⧉ Make the {under} blocked cells its own"))
            .clicked()
        {
            deferred.push(super::Deferred::AdoptBlocks(index));
        }
    } else {
        widgets::hint(ui, "No cells under it are blocked");
    }
    ui.horizontal(|ui| {
        if ui.button("▣ Make blueprint…").clicked() {
            extras.push(placement::Extra::MakeBlueprint);
        }
        if ui.button("Split into tiles").clicked() {
            deferred.push(super::Deferred::Split(index));
        }
    });
}

pub(super) fn blocked_under(cx: &FormCx, area_key: &str, module: &Value) -> Option<usize> {
    let content = cx.content?;
    let area_id = content.by_key::<area::AreaDef>(area_key)?;
    let grids = area::load(&content, area_id).grids;
    let rect = super::shapes::scenery_rect(module)?;
    let size = grids.size;
    let mut count = 0;
    for cell in rect.tiles() {
        if cell.x < 0 || cell.y < 0 || cell.x >= size.width as i32 || cell.y >= size.height as i32 {
            continue;
        }
        if grids.walk[cell.y as usize * size.width as usize + cell.x as usize] == Some(false) {
            count += 1;
        }
    }
    Some(count)
}

pub fn adopt_blocks(editor: &mut Editor, frame: &super::Frame, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = super::shapes::scenery_rect(module) else {
        return;
    };
    let Some(at) = super::shapes::pos_of(&module["at"]) else {
        return;
    };
    let grids = frame.area().grids;
    let mut draft = super::grid::GridDraft::of(&frame.area_key, grids);
    let mut adopted: Vec<Value> = module["blocks"].as_array().cloned().unwrap_or_default();
    let mut count = 0;
    for cell in rect.tiles() {
        if draft.walk_at(cell) == Some(false) {
            draft.set_walk(cell, None);
            adopted.push(serde_json::json!([
                cell.x - at.x.round() as i32,
                cell.y - at.y.round() as i32
            ]));
            count += 1;
        }
    }
    if count == 0 {
        editor.toast("Nothing under the scenery is blocked on the walk grid");
        return;
    }
    let mut modules = frame.modules.clone();
    modules[index]["blocks"] = Value::Array(adopted);
    let Some(mut row) = editor.row_value("area", &frame.area_key) else {
        return;
    };
    row["modules"] = Value::Array(modules);
    let mut edit = Edit::new(format!(
        "Give {count} blocked cells to the scenery in {}",
        frame.area_key
    ));
    edit.write_json(row_file("area", &frame.area_key), &row);
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub fn selected_scenery(editor: &Editor, frame: &super::Frame) -> Option<usize> {
    let parts = super::selected_parts(editor, &frame.area_key);
    if parts.len() != 1 {
        return None;
    }
    let index: usize = parts
        .iter()
        .next()?
        .strip_prefix("/modules/")?
        .parse()
        .ok()?;
    (frame.modules.get(index)?.is_module(AreaModuleKind::Scenery)).then_some(index)
}
