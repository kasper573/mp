use std::collections::BTreeMap;

use design_tokens::glyph::{self, Mark};
use egui::{RichText, Ui};
use engine::core::content::{Content, ContentRow, row_file};
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::{AreaDef, AreaModuleKind, Flip};
use serde_json::Value;

use super::{AreaSnapshot, shapes};
use crate::app::{Editor, ModalDialog};
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::ui::{dialogs, theme, widgets};
use crate::value::{self, RowValue};
use crate::{forms, rows};

pub fn open_make_blueprint(editor: &mut Editor, area_key: &str, indices: Vec<usize>) {
    let Some(row) = editor.row_value(AreaDef::TABLE, area_key) else {
        return;
    };
    let modules = selected_modules(&row, &indices);
    if modules.is_empty()
        || modules
            .iter()
            .any(|m| m.module_kind() == Some(AreaModuleKind::Script))
    {
        editor.toast("A blueprint takes any selection but area scripts");
        return;
    }
    let (Some(project), Some(content)) = (
        editor.project.as_ref(),
        editor.project.as_ref().and_then(|p| p.content.clone()),
    ) else {
        return;
    };
    let name = rows::free_key(&project.files, BlueprintDef::TABLE, "new_blueprint");
    let matches = matching_groups(&content, area_key, &modules, &indices);
    editor
        .dialogs
        .push(ModalDialog::MakeBlueprint(MakeBlueprintDialog {
            area: area_key.to_owned(),
            indices,
            name,
            matches,
            take_matches: true,
            error: None,
        }));
}

pub fn make_blueprint_from_selection(editor: &mut Editor, frame: &AreaSnapshot) {
    let mut indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| super::module_index(p))
        .collect();
    indices.sort_unstable();
    open_make_blueprint(editor, &frame.area_key, indices);
}

pub struct MakeBlueprintDialog {
    pub area: String,
    pub indices: Vec<usize>,
    pub name: String,
    pub matches: Vec<BlueprintMatch>,
    pub take_matches: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BlueprintMatch {
    pub area: String,
    pub indices: Vec<usize>,
    pub origin: Pos<Tiles>,
    pub flip: Flip,
}

fn matching_groups(
    content: &Content,
    own_area: &str,
    modules: &[Value],
    own_indices: &[usize],
) -> Vec<BlueprintMatch> {
    let Some(origin) = selection_origin(modules) else {
        return Vec::new();
    };
    let mut relative: Vec<Value> = modules.to_vec();
    for module in &mut relative {
        shapes::shift(module, -origin.x, -origin.y);
    }
    let signature = |modules: &[Value]| -> Vec<String> {
        let mut texts: Vec<String> = modules.iter().map(|m| canonical(m).to_string()).collect();
        texts.sort();
        texts
    };
    let wanted = signature(&relative);
    let mut out = Vec::new();
    for area_id in content.ids::<AreaDef>() {
        let key = area_id.key(content);
        let Ok(row) = value::json(area_id.get(content)) else {
            continue;
        };
        let all: Vec<Value> = row["modules"].as_array().cloned().unwrap_or_default();
        let anchors: Vec<usize> = all
            .iter()
            .enumerate()
            .filter(|(index, m)| {
                m["type"] == modules[0]["type"] && !(key == own_area && own_indices.contains(index))
            })
            .map(|(index, _)| index)
            .collect();
        let Some(first_bounds) = shapes::bounds(&modules[0], None) else {
            continue;
        };
        for anchor in anchors {
            let Some(anchor_bounds) = shapes::bounds(&all[anchor], None) else {
                continue;
            };
            let candidate_origin = Pos::new(
                anchor_bounds.min().x - (first_bounds.min().x - origin.x),
                anchor_bounds.min().y - (first_bounds.min().y - origin.y),
            );
            let mut group: Vec<usize> = Vec::new();
            let mut ok = true;
            for wanted_module in &relative {
                let mut target = wanted_module.clone();
                shapes::shift(&mut target, candidate_origin.x, candidate_origin.y);
                let target = canonical(&target);
                match all.iter().enumerate().find(|(index, m)| {
                    !(group.contains(index) || (key == own_area && own_indices.contains(index)))
                        && canonical(m) == target
                }) {
                    Some((index, _)) => group.push(index),
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok
                && signature(
                    &group
                        .iter()
                        .map(|&i| {
                            let mut m = all[i].clone();
                            shapes::shift(&mut m, -candidate_origin.x, -candidate_origin.y);
                            m
                        })
                        .collect::<Vec<_>>(),
                ) == wanted
            {
                group.sort_unstable();
                if !out
                    .iter()
                    .any(|g: &BlueprintMatch| g.area == key && g.indices == group)
                {
                    out.push(BlueprintMatch {
                        area: key.to_owned(),
                        indices: group,
                        origin: candidate_origin,
                        flip: Flip::None,
                    });
                }
            }
        }
    }
    out
}

fn canonical(module: &Value) -> Value {
    let mut out = module.clone();
    if let Some(map) = out.as_object_mut() {
        map.remove("name");
    }
    out
}

pub fn selection_origin(modules: &[Value]) -> Option<Pos<Tiles>> {
    modules
        .iter()
        .filter_map(|m| shapes::bounds(m, None))
        .reduce(|a, b| a.union(&b))
        .map(|r| r.min())
}

pub fn make_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: MakeBlueprintDialog,
) -> Option<MakeBlueprintDialog> {
    let mut outcome = None;
    let row = editor
        .row_value(AreaDef::TABLE, &dialog.area)
        .unwrap_or(Value::Null);
    let modules = selected_modules(&row, &dialog.indices);
    let origin = selection_origin(&modules);
    let holds = holds_text(&modules);
    let placements = 1 + if dialog.take_matches {
        dialog.matches.len()
    } else {
        0
    };
    dialogs::card(ctx, "make-blueprint", 560.0, |ui| {
        let pressed = dialogs::keys(ui);
        ui.horizontal(|ui| {
            glyph::show(ui, Mark::Grid, 16.0, theme::WARN);
            ui.label(
                RichText::new(format!(
                    "Make blueprint from {} placement{}",
                    modules.len(),
                    widgets::plural(modules.len())
                ))
                .strong()
                .size(18.0),
            );
        });
        widgets::key_chip(ui, EditorKey::MakeBlueprint);
        ui.add_space(8.0);
        widgets::kv(ui, "name", |ui| {
            let response = forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut dialog.name)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(f32::INFINITY),
                )
            });
            widgets::default_focus(ui, &response);
        });
        widgets::kv(ui, "holds", |ui| {
            ui.add(egui::Label::new(theme::mono(&holds).size(13.0)).wrap());
        });
        ui.add_space(4.0);
        if let Some(origin) = origin {
            ui.label(
                theme::muted(format!(
                    "The selection becomes one placement at {}, {}. Nothing looks or plays differently.",
                    forms::tiles(origin.x),
                    forms::tiles(origin.y)
                ))
                .size(13.0),
            );
        }
        if !dialog.matches.is_empty() {
            ui.add_space(8.0);
            matches_card(ui, &mut dialog);
        }
        ui.add_space(8.0);
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(
                ui,
                format!(
                    "Make blueprint · {placements} placement{}",
                    widgets::plural(placements)
                ),
            )
            .clicked()
                || pressed.enter
            {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || pressed.escape {
                outcome = Some(false);
            }
        });
    });
    match outcome {
        Some(true) => match make_blueprint(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(dialog)
            }
        },
        Some(false) => None,
        None => Some(dialog),
    }
}

fn selected_modules(row: &Value, indices: &[usize]) -> Vec<Value> {
    indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect()
}

fn holds_text(modules: &[Value]) -> String {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for module in modules {
        let name = match module.module_kind() {
            Some(AreaModuleKind::Blueprint) => module["blueprint"]
                .as_str()
                .unwrap_or("blueprint")
                .to_owned(),
            Some(AreaModuleKind::Scenery) => {
                format!("scenery · {}", module.text("tileset"))
            }
            _ => shapes::label(module),
        };
        match counts.iter_mut().find(|(n, _)| *n == name) {
            Some((_, count)) => *count += 1,
            None => counts.push((name, 1)),
        }
    }
    counts
        .into_iter()
        .map(|(name, count)| {
            if count > 1 {
                format!("{name} × {count}")
            } else {
                name
            }
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

fn matches_card(ui: &mut Ui, dialog: &mut MakeBlueprintDialog) {
    let mut areas: Vec<&str> = dialog.matches.iter().map(|m| m.area.as_str()).collect();
    areas.sort_unstable();
    areas.dedup();
    let where_ = if areas.len() == 1 {
        format!("on {}", areas[0])
    } else {
        format!("in {} areas", areas.len())
    };
    let mut spots: Vec<String> = dialog
        .matches
        .iter()
        .take(6)
        .map(|m| format!("{}, {}", forms::tiles(m.origin.x), forms::tiles(m.origin.y)))
        .collect();
    if dialog.matches.len() > 6 {
        spots.push(format!("… {} more", dialog.matches.len() - 6));
    }
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.checkbox(&mut dialog.take_matches, "");
            ui.vertical(|ui| {
                ui.label(theme::strong(format!(
                    "{} identical arrangement{} {where_}",
                    dialog.matches.len(),
                    widgets::plural(dialog.matches.len())
                )));
                ui.label(
                    theme::muted(format!("at {}. Replace them too.", spots.join(" · "))).size(12.5),
                );
            });
        });
        ui.add_space(4.0);
        ui.label(theme::faint("Matched by their parts; anything else there stays.").size(12.0));
    });
}

fn make_blueprint(editor: &mut Editor, dialog: &MakeBlueprintDialog) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder")?;
    let key = dialog.name.trim().to_owned();
    if let Some(problem) = rows::key_problem(&project.files, BlueprintDef::TABLE, &key) {
        return Err(problem);
    }
    let row = project
        .files
        .json(&row_file(AreaDef::TABLE, &dialog.area))
        .ok_or("the area is gone")?;
    let modules = selected_modules(&row, &dialog.indices);
    let origin = selection_origin(&modules).ok_or("the selection has no place")?;
    let mut parts = modules.clone();
    for part in &mut parts {
        shapes::shift(part, -origin.x, -origin.y);
    }
    let blueprint = serde_json::json!({ "parts": parts });
    let mut edit = ContentEdit::new(format!(
        "Make blueprint {key} from {} modules of {}",
        modules.len(),
        dialog.area
    ));
    edit.write_json(row_file(BlueprintDef::TABLE, &key), &blueprint);
    let mut groups: Vec<BlueprintMatch> = vec![BlueprintMatch {
        area: dialog.area.clone(),
        indices: dialog.indices.clone(),
        origin,
        flip: Flip::None,
    }];
    if dialog.take_matches {
        groups.extend(dialog.matches.iter().cloned());
    }
    let mut by_area: BTreeMap<String, Vec<BlueprintMatch>> = BTreeMap::new();
    for group in groups {
        by_area.entry(group.area.clone()).or_default().push(group);
    }
    let mut first_placement: Option<usize> = None;
    for (area, groups) in by_area {
        let mut row = project
            .files
            .json_owned(&row_file(AreaDef::TABLE, &area))
            .ok_or("an area is gone")?;
        let mut list: Vec<Value> = row["modules"].as_array().cloned().unwrap_or_default();
        let mut remove: Vec<usize> = groups
            .iter()
            .flat_map(|g| g.indices.iter().copied())
            .collect();
        remove.sort_unstable();
        remove.dedup();
        for group in &groups {
            let mut placement = serde_json::json!({ "type": "blueprint", "blueprint": key, "at": { "x": group.origin.x, "y": group.origin.y } });
            if !group.flip.is_none() {
                placement["flip"] = serde_json::json!(group.flip);
            }
            let at = group.indices.iter().copied().min().unwrap_or(list.len());
            list.insert(at, placement);
            for index in &mut remove {
                if *index >= at {
                    *index += 1;
                }
            }
            if area == dialog.area && first_placement.is_none() {
                first_placement = Some(at);
            }
        }
        for index in remove.iter().rev() {
            list.remove(*index);
        }
        if let Some(first) = first_placement
            && area == dialog.area
        {
            let before = remove.iter().filter(|&&r| r < first).count();
            first_placement = Some(first - before);
        }
        row["modules"] = Value::Array(list);
        edit.write_json(row_file(AreaDef::TABLE, &area), &row);
    }
    editor.try_apply(edit)?;
    editor.selection = RowSelection {
        table: AreaDef::TABLE.to_owned(),
        keys: vec![dialog.area.clone()],
        parts: first_placement
            .map(super::module_part)
            .into_iter()
            .collect(),
    };
    editor.toast(format!("Made blueprint {key}"));
    Ok(())
}
