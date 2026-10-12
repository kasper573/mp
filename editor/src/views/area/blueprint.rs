use std::collections::BTreeMap;

use egui::{Color32, RichText, Vec2};
use game::core::content::Content;
use game::core::math::Pos;
use game::core::tiling::Tiles;
use game::systems::area::{self, Flip};
use serde_json::Value;

use super::holes::fill_holes;
use super::stamp::place_json;
use super::{Frame, shapes};
use crate::app::{Dialog, Editor};
use crate::project::{Edit, Selection, row_file};
use crate::value::RowValue;

pub fn open_make_blueprint(editor: &mut Editor, area_key: &str, indices: Vec<usize>) {
    let Some(row) = editor.row_value("area", area_key) else {
        return;
    };
    let modules: Vec<Value> = indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    if modules.is_empty()
        || modules
            .iter()
            .any(|m| matches!(m.kind(), "shared_script" | "inline_script"))
    {
        editor.toast("A blueprint takes any selection but area scripts");
        return;
    }
    let (Some(project), Some(content)) = (
        editor.project.as_ref(),
        editor.project.as_ref().and_then(|p| p.content),
    ) else {
        return;
    };
    let name = crate::rows::free_key(&project.files, "blueprint", "new_blueprint");
    let matches = matching_groups(content, area_key, &modules, &indices);
    editor
        .dialogs
        .push(Dialog::MakeBlueprint(MakeBlueprintDialog {
            area: area_key.to_owned(),
            indices,
            name,
            matches,
            take_matches: true,
            error: None,
        }));
}

pub fn make_blueprint_from_selection(editor: &mut Editor, frame: &Frame) {
    let mut indices: Vec<usize> = super::selected_parts(editor, &frame.area_key)
        .iter()
        .filter_map(|p| p.strip_prefix("/modules/")?.parse().ok())
        .collect();
    indices.sort_unstable();
    open_make_blueprint(editor, &frame.area_key, indices);
}

pub struct MakeBlueprintDialog {
    pub area: String,
    pub indices: Vec<usize>,
    pub name: String,
    pub matches: Vec<MatchGroup>,
    pub take_matches: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct MatchGroup {
    pub area: String,
    pub indices: Vec<usize>,
    pub origin: Pos<Tiles>,
    pub flip: Flip,
}

fn matching_groups(
    content: Content,
    own_area: &str,
    modules: &[Value],
    own_indices: &[usize],
) -> Vec<MatchGroup> {
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
    for area_id in content.ids::<area::AreaDef>() {
        let key = area_id.key(&content);
        let Ok(row) = crate::value::json(area_id.get(&content)) else {
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
        for anchor in anchors {
            let Some(anchor_bounds) = shapes::bounds(&all[anchor], None) else {
                continue;
            };
            let Some(first_bounds) = shapes::bounds(&modules[0], None) else {
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
                    .any(|g: &MatchGroup| g.area == key && g.indices == group)
                {
                    out.push(MatchGroup {
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
        .reduce(shapes::rect_union)
        .map(|r| r.min())
}

pub fn make_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: MakeBlueprintDialog,
) -> Option<MakeBlueprintDialog> {
    use crate::ui::{theme, widgets};
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let row = editor
        .row_value("area", &dialog.area)
        .unwrap_or(Value::Null);
    let modules: Vec<Value> = dialog
        .indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    let origin = selection_origin(&modules);
    let holds = {
        let mut counts: Vec<(String, usize)> = Vec::new();
        for module in &modules {
            let name = match module.kind() {
                "blueprint" => module["blueprint"]
                    .as_str()
                    .unwrap_or("blueprint")
                    .to_owned(),
                "scenery" => {
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
    };
    let placements = 1 + if dialog.take_matches {
        dialog.matches.len()
    } else {
        0
    };
    crate::ui::dialogs::card(ctx, "make-blueprint", 560.0, |ui| {
        ui.horizontal(|ui| {
            ui.label(RichText::new("▣").color(theme::WARN).size(16.0));
            ui.label(
                RichText::new(format!(
                    "Make blueprint from {} placement{}",
                    modules.len(),
                    if modules.len() == 1 { "" } else { "s" }
                ))
                .strong()
                .size(18.0),
            );
        });
        widgets::key_hint(ui, "Ctrl Alt B");
        ui.add_space(8.0);
        widgets::kv(ui, "name", |ui| {
            let response = crate::forms::boxed_input(ui, None, |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut dialog.name)
                        .frame(egui::Frame::NONE)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(f32::INFINITY),
                )
            });
            if ui
                .ctx()
                .data(|d| d.get_temp::<bool>(ui.id().with("focused")))
                .is_none()
            {
                response.request_focus();
                ui.ctx()
                    .data_mut(|d| d.insert_temp(ui.id().with("focused"), true));
            }
        });
        widgets::kv(ui, "holds", |ui| {
            ui.add(egui::Label::new(theme::mono(&holds).size(13.0)).wrap());
        });
        ui.add_space(4.0);
        if let Some(origin) = origin {
            ui.label(theme::muted(format!("The selection becomes one placement at {}, {}. Nothing looks or plays differently.", crate::forms::tiles(origin.x), crate::forms::tiles(origin.y))).size(13.0));
        }
        if !dialog.matches.is_empty() {
            ui.add_space(8.0);
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
                .map(|m| {
                    format!(
                        "{}, {}",
                        crate::forms::tiles(m.origin.x),
                        crate::forms::tiles(m.origin.y)
                    )
                })
                .collect();
            if dialog.matches.len() > 6 {
                spots.push(format!("… {} more", dialog.matches.len() - 6));
            }
            widgets::card_frame(false).show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    widgets::toggle(ui, &mut dialog.take_matches);
                    ui.vertical(|ui| {
                        ui.label(theme::strong(format!(
                            "{} identical arrangement{} {where_}",
                            dialog.matches.len(),
                            if dialog.matches.len() == 1 { "" } else { "s" }
                        )));
                        ui.label(
                            theme::muted(format!("at {}. Replace them too.", spots.join(" · ")))
                                .size(12.5),
                        );
                    });
                });
                ui.add_space(4.0);
                ui.label(
                    theme::faint("Matched by their parts; anything else there stays.").size(12.0),
                );
            });
        }
        ui.add_space(8.0);
        ui.label(theme::muted("Everything selected but ground tiles goes in, objects with their scripts. Names and values stay fixed until made variables.").size(12.5));
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(
                ui,
                &format!(
                    "Make blueprint · {placements} placement{}",
                    if placements == 1 { "" } else { "s" }
                ),
            )
            .clicked()
                || enter
            {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || escape {
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

fn make_blueprint(editor: &mut Editor, dialog: &MakeBlueprintDialog) -> Result<(), String> {
    let project = editor.project.as_ref().ok_or("no folder")?;
    let key = dialog.name.trim().to_owned();
    if let Some(problem) = crate::rows::key_problem(&project.files, "blueprint", &key) {
        return Err(problem);
    }
    let row = project
        .files
        .json(&row_file("area", &dialog.area))
        .ok_or("the area is gone")?;
    let modules: Vec<Value> = dialog
        .indices
        .iter()
        .filter_map(|&i| row["modules"].get(i).cloned())
        .collect();
    let origin = selection_origin(&modules).ok_or("the selection has no place")?;
    let mut parts = modules.clone();
    for part in &mut parts {
        shapes::shift(part, -origin.x, -origin.y);
    }
    let blueprint = serde_json::json!({ "parts": parts });
    let mut edit = Edit::new(format!(
        "Make blueprint {key} from {} modules of {}",
        modules.len(),
        dialog.area
    ));
    edit.write_json(row_file("blueprint", &key), &blueprint);
    let mut groups: Vec<MatchGroup> = vec![MatchGroup {
        area: dialog.area.clone(),
        indices: dialog.indices.clone(),
        origin,
        flip: Flip::None,
    }];
    if dialog.take_matches {
        groups.extend(dialog.matches.iter().cloned());
    }
    let mut by_area: BTreeMap<String, Vec<MatchGroup>> = BTreeMap::new();
    for group in groups {
        by_area.entry(group.area.clone()).or_default().push(group);
    }
    let mut first_placement: Option<usize> = None;
    for (area, groups) in by_area {
        let mut row = project
            .files
            .json(&row_file("area", &area))
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
                placement["flip"] = Value::String(group.flip.csv().to_owned());
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
        edit.write_json(row_file("area", &area), &row);
    }
    if !editor.apply(edit) {
        return Err("refused; see the output".to_owned());
    }
    editor.selection = Selection {
        table: "area".to_owned(),
        keys: vec![dialog.area.clone()],
        parts: first_placement
            .map(|i| format!("/modules/{i}"))
            .into_iter()
            .collect(),
    };
    editor.toast(format!("Made blueprint {key}"));
    Ok(())
}

pub struct DeleteBlueprintDialog {
    pub blueprint: String,
    pub users: Vec<BlueprintUser>,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BlueprintUser {
    pub file: String,
    pub pointer: String,
    pub label: String,
    pub choice: BlueprintChoice,
}

#[derive(Clone, Debug, PartialEq)]
pub enum BlueprintChoice {
    Unpack,
    Replace(String),
    Remove,
}

pub fn delete_blueprint_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: DeleteBlueprintDialog,
) -> Option<DeleteBlueprintDialog> {
    let mut outcome = None;
    let others: Vec<String> = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .map(|c| {
            c.table::<area::blueprint::BlueprintDef>()
                .keys()
                .iter()
                .filter(|k| **k != dialog.blueprint)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    egui::Window::new(format!("Delete blueprint {}", dialog.blueprint))
        .collapsible(false)
        .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
        .show(ctx, |ui| {
            if dialog.users.is_empty() {
                ui.label("Nothing places it.");
            } else {
                ui.label(format!("{} placements. Each: unpack into scenery and modules, replace with another blueprint, or remove.", dialog.users.len()));
            }
            egui::ScrollArea::vertical().max_height(320.0).show(ui, |ui| {
                for (index, user) in dialog.users.iter_mut().enumerate() {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(&user.label).monospace().small());
                        ui.radio_value(&mut user.choice, BlueprintChoice::Unpack, "Unpack");
                        ui.radio_value(&mut user.choice, BlueprintChoice::Remove, "Remove");
                        let mut picked = match &user.choice {
                            BlueprintChoice::Replace(k) => k.clone(),
                            _ => String::new(),
                        };
                        egui::ComboBox::from_id_salt(("replace", index))
                            .selected_text(if picked.is_empty() { "Replace with…".to_owned() } else { picked.clone() })
                            .show_ui(ui, |ui| {
                                for other in &others {
                                    if ui.selectable_label(picked == *other, other).clicked() {
                                        picked = other.clone();
                                    }
                                }
                            });
                        if !picked.is_empty() {
                            user.choice = BlueprintChoice::Replace(picked);
                        }
                    });
                }
            });
            if let Some(error) = &dialog.error {
                ui.colored_label(Color32::from_rgb(220, 80, 80), error);
            }
            ui.horizontal(|ui| {
                if ui.button("Delete").clicked() {
                    outcome = Some(true);
                }
                if ui.button("Cancel").clicked() {
                    outcome = Some(false);
                }
            });
        });
    match outcome {
        Some(true) => match delete_blueprint(editor, &dialog) {
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

fn delete_blueprint(editor: &mut Editor, dialog: &DeleteBlueprintDialog) -> Result<(), String> {
    let content = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .ok_or("the folder does not load")?;
    let id = content
        .by_key::<area::blueprint::BlueprintDef>(&dialog.blueprint)
        .ok_or("the blueprint is gone")?;
    let def = id.get(&content);
    let project = editor.project.as_ref().ok_or("no folder")?;
    let mut files: BTreeMap<String, Value> = BTreeMap::new();
    let mut by_file: BTreeMap<String, Vec<&BlueprintUser>> = BTreeMap::new();
    for user in &dialog.users {
        by_file.entry(user.file.clone()).or_default().push(user);
    }
    for (file, users) in by_file {
        let mut json = project.files.json(&file).ok_or("a file is gone")?;
        let mut users = users;
        users.sort_by(|a, b| b.pointer.cmp(&a.pointer));
        for user in users {
            let (parent, index) = {
                let cut = user.pointer.rfind('/').ok_or("a bad pointer")?;
                (
                    user.pointer[..cut].to_owned(),
                    user.pointer[cut + 1..]
                        .parse::<usize>()
                        .map_err(|_| "a bad pointer")?,
                )
            };
            let list = json
                .pointer_mut(&parent)
                .and_then(Value::as_array_mut)
                .ok_or("a bad pointer")?;
            match &user.choice {
                BlueprintChoice::Remove => {
                    list.remove(index);
                }
                BlueprintChoice::Replace(other) => {
                    list[index]["blueprint"] = Value::String(other.clone());
                }
                BlueprintChoice::Unpack => {
                    let placement = list.remove(index);
                    let at = shapes::pos_of(&placement["at"]).unwrap_or(Pos::new(0.0, 0.0));
                    let flip = Flip::parse(placement.text("flip")).unwrap_or(Flip::None);
                    for (offset, part) in def.parts.iter().enumerate() {
                        let mut part = part.clone();
                        fill_holes(&mut part, &placement["values"], &def.variables);
                        place_json(&mut part, at, flip);
                        list.insert(index + offset, part);
                    }
                }
            }
        }
        files.insert(file, json);
    }
    let mut edit = Edit::new(format!(
        "Delete blueprint {} ({} placements resolved)",
        dialog.blueprint,
        dialog.users.len()
    ));
    for (file, json) in files {
        edit.write_json(file, &json);
    }
    edit.remove(row_file("blueprint", &dialog.blueprint));
    if !editor.apply(edit) {
        return Err("refused; see the output".to_owned());
    }
    crate::rows::close_tabs(editor, "blueprint", &dialog.blueprint);
    Ok(())
}
