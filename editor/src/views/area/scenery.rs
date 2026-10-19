use design_tokens::controls;
use design_tokens::glyph::Mark;
use egui::Ui;
use engine::core::content::{ContentRow, row_file};
use engine::core::math::Pos;
use engine::core::tiling::{Cell, TilePos, TileRect, Tiles};
use engine::systems::area::{self, AreaDef, AreaModuleKind, Flip, SceneryTile};
use serde_json::Value;

use super::inspect::Followups;
use super::placement::{self, warp_destinations};
use super::stamp::object_names;
use super::{AreaFrame, AreaSnapshot, modules, shapes};
use crate::forms::{self, FormCx};
use crate::keymap::EditorKey;
use crate::project::ContentEdit;
use crate::ui::widgets;
use crate::value::{self, RowValue};
use crate::{app::Editor, rows};

pub struct PlacedTile {
    pub column: usize,
    pub row: usize,
    pub offset: (usize, usize),
    pub tile: SceneryTile,
}

pub fn tiles_of(module: &Value) -> Vec<PlacedTile> {
    let flip: Flip = serde_json::from_value(module["flip"].clone()).unwrap_or_default();
    let rows: Vec<&Vec<Value>> = module["tiles"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_array)
        .collect();
    let height = rows.len();
    rows.iter()
        .enumerate()
        .flat_map(|(row, cells)| {
            let width = cells.len();
            cells.iter().enumerate().filter_map(move |(column, json)| {
                let tile: SceneryTile = serde_json::from_value(json.clone()).ok()?;
                Some(PlacedTile {
                    column,
                    row,
                    offset: (
                        if flip.horizontal() {
                            width - 1 - column
                        } else {
                            column
                        },
                        if flip.vertical() {
                            height - 1 - row
                        } else {
                            row
                        },
                    ),
                    tile: SceneryTile {
                        tile: tile.tile,
                        flip: tile.flip.compose(flip),
                    },
                })
            })
        })
        .collect()
}

pub fn tile_count(module: &Value) -> usize {
    tiles_of(module).len()
}

pub fn join_scenery(editor: &mut Editor, frame: &AreaFrame) {
    let indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| super::module_index(p))
        .collect();
    let sceneries: Vec<&Value> = indices
        .iter()
        .filter_map(|&i| frame.modules.get(i))
        .filter(|m| m.is_module(AreaModuleKind::Scenery))
        .collect();
    if sceneries.len() < 2 {
        editor.toast(format!(
            "Select two or more sceneries of one tileset to join ({})",
            EditorKey::JoinScenery.name()
        ));
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
        .reduce(|a, b| a.union(&b))
        .expect("bounds");
    let width = bounds.size.width.ceil() as usize;
    let height = bounds.size.height.ceil() as usize;
    let mut tiles: Vec<Vec<Value>> = vec![vec![Value::Null; width]; height];
    let mut blocks: Vec<Value> = Vec::new();
    for scenery in &sceneries {
        let Some(rect) = shapes::scenery_rect(scenery) else {
            continue;
        };
        let flip: Flip = serde_json::from_value(scenery["flip"].clone()).unwrap_or_default();
        for placed in tiles_of(scenery) {
            let x = (rect.min().x - bounds.min().x).round() as usize + placed.offset.0;
            let y = (rect.min().y - bounds.min().y).round() as usize + placed.offset.1;
            if y < height
                && x < width
                && let Ok(json) = value::json(&placed.tile)
            {
                tiles[y][x] = json;
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
    let mut sorted = indices.clone();
    sorted.sort_unstable();
    let mut at = 0;
    let applied = modules::change_modules(editor, &frame.area_key, |modules| {
        let mut position = 0;
        modules.retain(|module| {
            position += 1;
            !(sorted.contains(&(position - 1)) && module.is_module(AreaModuleKind::Scenery))
        });
        at = sorted[0].min(modules.len());
        modules.insert(at, joined);
        Some(format!(
            "Join {} sceneries in {}",
            sceneries.len(),
            frame.area_key
        ))
    });
    if applied {
        editor.selection.parts = vec![super::module_part(at)];
    }
}

pub fn split_scenery(editor: &mut Editor, frame: &AreaSnapshot, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let tileset = module.text("tileset").to_owned();
    let grids = frame.area().grids.clone();
    let mut draft = super::grid::GridDraft::of(&frame.area_key, &grids);
    let layer = editor
        .views
        .area
        .views
        .get(&super::area_view_key(&frame.area_key))
        .map_or(0, |v| v.layer);
    let rows = module["tiles"].as_array().cloned().unwrap_or_default();
    let mut kept: Vec<Vec<Value>> = rows
        .iter()
        .map(|r| r.as_array().cloned().unwrap_or_default())
        .collect();
    let mut placed = 0;
    for tile in tiles_of(module) {
        let cell = Pos::<Tiles>::new(
            rect.min().x + tile.offset.0 as f32 + 0.5,
            rect.min().y + tile.offset.1 as f32 + 0.5,
        )
        .cell();
        if draft.get(layer, cell).is_some() || cell.index(draft.size).is_none() {
            continue;
        }
        let entry = draft.intern(&tileset, tile.tile.tile, tile.tile.flip);
        draft.set(layer, cell, Some(entry));
        kept[tile.row][tile.column] = Value::Null;
        placed += 1;
    }
    if placed == 0 {
        editor.toast("No free cell under the scenery on the active layer");
        return;
    }
    let all_gone = kept.iter().all(|row| row.iter().all(Value::is_null));
    let Some(mut edit) = modules::module_edit(editor, &frame.area_key, |modules| {
        modules.get(index)?;
        if all_gone {
            modules.remove(index);
        } else {
            modules[index]["tiles"] = Value::Array(kept.into_iter().map(Value::Array).collect());
        }
        Some(format!(
            "Split scenery into {placed} tiles in {}",
            frame.area_key
        ))
    }) else {
        return;
    };
    draft.write_into(&mut edit);
    if editor.apply(edit) && all_gone {
        editor.selection.parts.clear();
    }
}

pub fn return_door(editor: &mut Editor, frame: &AreaSnapshot, index: usize) {
    let area_key = &frame.area_key;
    let modules = &frame.modules;
    let Some(module) = modules.get(index) else {
        return;
    };
    let Some((target_area, target_at)) = warp_destinations(module).into_iter().next() else {
        editor.toast("The object has no warp to return from");
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content.clone()) else {
        return;
    };
    let Some(here_id) = content.by_key::<AreaDef>(area_key) else {
        return;
    };
    let Some(there_id) = content.by_key::<AreaDef>(&target_area) else {
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
    if there.grid.nearest_walkable(target_at).is_none() {
        editor.toast("The destination has no walkable cell");
        return;
    };
    let mut names = object_names(&content, there_id);
    let name = rows::free_name(&format!("{}_back", module.text_or("name", "door")), &names);
    names.insert(name.clone());
    let cell = target_at.cell();
    let mut scripts = module["scripts"].clone();
    placement::redirect_places(
        &mut scripts,
        &serde_json::json!({ "area": area_key, "x": back_to.x, "y": back_to.y }),
    );
    let door = serde_json::json!({
        "type": "object",
        "name": name,
        "shape": { "type": "point", "x": cell.x as f32, "y": cell.y as f32 },
        "scripts": scripts,
    });
    let Some(mut there_row) = editor.row_value(AreaDef::TABLE, &target_area) else {
        return;
    };
    if let Some(m) = there_row["modules"].as_array_mut() {
        m.push(door);
    }
    let mut edit = ContentEdit::new(format!("Return door from {target_area} to {area_key}"));
    edit.write_json(row_file(AreaDef::TABLE, &target_area), &there_row);
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
    let count = tile_count(module);
    widgets::kv_text(ui, "size", format!("{width} × {height} tiles · {count}"));
    let mut changed = false;
    widgets::kv(ui, "sort", |ui| {
        let current = module["sort"].as_f64();
        let id = ui.id().with((path, "sort"));
        let shown = current
            .map(|number| number.to_string())
            .unwrap_or_else(|| "flat".to_owned());
        let typed = forms::drafted(ui, id, &shown, |ui, draft| {
            forms::boxed_input(
                ui,
                Some(&format!("tiles from the top · of {height}")),
                |ui| {
                    ui.add(
                        egui::TextEdit::singleline(draft)
                            .frame(egui::Frame::NONE)
                            .font(egui::TextStyle::Monospace)
                            .desired_width(48.0),
                    )
                },
            )
        });
        if let Some(typed) = typed {
            let parsed = typed.trim().parse::<f64>().ok();
            if parsed != current {
                match parsed {
                    Some(sort) => module["sort"] = Value::from(sort),
                    None => {
                        module.remove_field("sort");
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
    out: &mut Followups,
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
            .button(format!("Make the {under} blocked cells its own"))
            .clicked()
        {
            out.actions.push(super::AreaAction::AdoptBlocks(index));
        }
    } else {
        widgets::hint(ui, "No cells under it are blocked");
    }
    ui.horizontal(|ui| {
        if controls::marked(ui, Mark::Grid, "Make blueprint…").clicked() {
            out.actions.push(super::AreaAction::MakeBlueprint);
        }
        if ui.button("Split into tiles").clicked() {
            out.actions.push(super::AreaAction::Split(index));
        }
    });
}

pub(super) fn blocked_under(cx: &FormCx, area_key: &str, module: &Value) -> Option<usize> {
    let content = cx.content.clone()?;
    let area_id = content.by_key::<AreaDef>(area_key)?;
    let grids = area::load(&content, area_id).grids.clone();
    let rect = shapes::scenery_rect(module)?;
    let size = grids.size;
    Some(
        rect.tiles()
            .filter(|cell| {
                cell.index(size)
                    .is_some_and(|index| grids.walk[index] == Some(false))
            })
            .count(),
    )
}

pub fn adopt_blocks(editor: &mut Editor, frame: &AreaSnapshot, index: usize) {
    let module = &frame.modules[index];
    let Some(rect) = super::shapes::scenery_rect(module) else {
        return;
    };
    let Some(at) = super::shapes::pos_of(&module["at"]) else {
        return;
    };
    let grids = frame.area().grids.clone();
    let mut draft = super::grid::GridDraft::of(&frame.area_key, &grids);
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
    let Some(mut edit) = modules::module_edit(editor, &frame.area_key, |modules| {
        modules.get_mut(index)?["blocks"] = Value::Array(adopted);
        Some(format!(
            "Give {count} blocked cells to the scenery in {}",
            frame.area_key
        ))
    }) else {
        return;
    };
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub fn selected_scenery(editor: &Editor, frame: &AreaFrame) -> Option<usize> {
    let parts = super::selected_parts(editor, &frame.area_key);
    if parts.len() != 1 {
        return None;
    }
    let index = super::module_index(parts.iter().next()?)?;
    (frame.modules.get(index)?.is_module(AreaModuleKind::Scenery)).then_some(index)
}
