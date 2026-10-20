use design_tokens::controls;
use design_tokens::glyph::Mark;
use egui::Ui;
use engine::core::math::Pos;
use engine::core::tiling::{Cell, TilePos, TileRect, Tiles};
use engine::systems::area::{self, AreaDef, AreaModuleKind, Flip, SceneryTile};
use serde_json::Value;

use super::grid::GridDraft;
use super::inspect::Followups;
use super::placement::{self, warp_destinations};
use super::stamp::object_names;
use super::{AreaFrame, AreaSnapshot, nodes, shapes};
use crate::forms::{self, FormCx};
use crate::tabs::file_title;
use crate::ui::widgets;
use crate::value::RowValue;
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

pub fn split_scenery(editor: &mut Editor, frame: &AreaSnapshot, node: &str) {
    let Some(module) = frame.module(node) else {
        return;
    };
    let Some(rect) = shapes::scenery_rect(module) else {
        return;
    };
    let tileset = module.text("tileset").to_owned();
    let Some(mut draft) = GridDraft::own(&frame.content, &frame.area_key) else {
        return;
    };
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
    let Some(mut edit) = nodes::scene_edit(editor, &frame.area_key, |scene| {
        if all_gone {
            nodes::remove(scene, &[node.to_owned()]).first()?;
        } else {
            scene.pointer_mut(node)?["tiles"] =
                Value::Array(kept.into_iter().map(Value::Array).collect());
        }
        Some(format!("Split scenery into {placed} tiles"))
    }) else {
        return;
    };
    draft.write_into(&mut edit);
    if editor.apply(edit) && all_gone {
        editor.selection.parts.clear();
    }
}

pub fn return_door(editor: &mut Editor, frame: &AreaSnapshot, node: &str) {
    let area_key = &frame.area_key;
    let Some(module) = frame.module(node) else {
        return;
    };
    let Some((target_area, target_at)) = warp_destinations(module).into_iter().next() else {
        editor.toast("The object has no warp to return from");
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content.clone()) else {
        return;
    };
    let Some(here_id) = content.by_path::<AreaDef>(area_key) else {
        return;
    };
    let Some(there_id) = content.by_path::<AreaDef>(&target_area) else {
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
    let applied = nodes::change_scene(editor, &target_area, |scene| {
        nodes::append(scene, "", vec![door]);
        Some(format!(
            "Return door from {} to {}",
            file_title(&target_area),
            file_title(area_key)
        ))
    });
    if applied {
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
    node: &str,
) {
    let under = cx
        .row_key
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
            out.actions
                .push(super::AreaAction::AdoptBlocks(node.to_owned()));
        }
    } else {
        widgets::hint(ui, "No cells under it are blocked");
    }
    ui.horizontal(|ui| {
        if controls::marked(ui, Mark::Grid, "Make blueprint…").clicked() {
            out.actions.push(super::AreaAction::MakeBlueprint);
        }
        if ui.button("Split into tiles").clicked() {
            out.actions.push(super::AreaAction::Split(node.to_owned()));
        }
    });
}

pub(super) fn blocked_under(cx: &FormCx, area_key: &str, module: &Value) -> Option<usize> {
    let content = cx.content.clone()?;
    let area_id = content.by_path::<AreaDef>(area_key)?;
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

pub fn adopt_blocks(editor: &mut Editor, frame: &AreaSnapshot, node: &str) {
    let Some(module) = frame.module(node) else {
        return;
    };
    let Some(rect) = super::shapes::scenery_rect(module) else {
        return;
    };
    let Some(at) = super::shapes::pos_of(&module["at"]) else {
        return;
    };
    let Some(mut draft) = GridDraft::own(&frame.content, &frame.area_key) else {
        return;
    };
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
    let Some(mut edit) = nodes::scene_edit(editor, &frame.area_key, |scene| {
        scene.pointer_mut(node)?["blocks"] = Value::Array(adopted);
        Some(format!("Give {count} blocked cells to the scenery"))
    }) else {
        return;
    };
    draft.write_into(&mut edit);
    editor.apply(edit);
}

pub fn selected_scenery(editor: &Editor, frame: &AreaFrame) -> Option<String> {
    let parts = super::selected_parts(editor, &frame.area_key);
    if parts.len() != 1 {
        return None;
    }
    let node = parts.into_iter().next()?;
    (frame.module(&node)?.is_module(AreaModuleKind::Scenery)).then_some(node)
}
