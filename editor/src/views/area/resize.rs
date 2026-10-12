use egui::{RichText, Vec2};
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::TileSize;
use game::systems::area::{self};
use serde_json::Value;

use super::shapes;
use crate::app::Editor;
use crate::project::{Edit, row_file};

pub struct ResizeDialog {
    pub area: String,
    pub width: u32,
    pub height: u32,
    pub anchor: (i8, i8),
    pub error: Option<String>,
}

pub fn resize_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: ResizeDialog,
) -> Option<ResizeDialog> {
    use crate::ui::{theme, widgets};
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let old = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .and_then(|c| {
            c.by_key::<area::AreaDef>(&dialog.area)
                .map(|id| area::load(&c, id).size)
        })
        .map(|size| (size.width as u32, size.height as u32))
        .unwrap_or((dialog.width, dialog.height));
    crate::ui::dialogs::card(ctx, "resize", 480.0, |ui| {
        ui.label(
            RichText::new(format!("Resize area/{}", dialog.area))
                .strong()
                .size(18.0),
        );
        ui.add_space(8.0);
        for (name, value, was) in [
            ("width", &mut dialog.width, old.0),
            ("height", &mut dialog.height, old.1),
        ] {
            widgets::kv(ui, name, |ui| {
                ui.scope(|ui| {
                    ui.set_width(120.0);
                    let id = ui.id().with((name, "resize"));
                    let mut draft = ui
                        .ctx()
                        .data(|d| d.get_temp::<String>(id))
                        .unwrap_or_else(|| value.to_string());
                    let response =
                        crate::forms::boxed_input(ui, Some(&format!("was {was}")), |ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut draft)
                                    .frame(egui::Frame::NONE)
                                    .font(egui::TextStyle::Monospace)
                                    .desired_width(f32::INFINITY),
                            )
                        });
                    if response.changed() {
                        ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
                        if let Ok(parsed) = draft.trim().parse::<u32>() {
                            *value = parsed.clamp(area::MIN_SIDE, area::MAX_SIDE);
                        }
                    }
                    if response.lost_focus() {
                        ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
                    }
                });
            });
        }
        widgets::kv(ui, "anchor", |ui| {
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing = Vec2::splat(4.0);
                for row in [-1i8, 0, 1] {
                    ui.horizontal(|ui| {
                        for column in [-1i8, 0, 1] {
                            let picked = dialog.anchor == (column, row);
                            let (rect, response) =
                                ui.allocate_exact_size(Vec2::splat(18.0), egui::Sense::click());
                            ui.painter().rect_filled(
                                rect,
                                3.0,
                                if picked { theme::ACCENT } else { theme::INPUT },
                            );
                            ui.painter().rect_stroke(
                                rect,
                                3.0,
                                egui::Stroke::new(
                                    1.0,
                                    if picked { theme::ACCENT } else { theme::BORDER },
                                ),
                                egui::StrokeKind::Inside,
                            );
                            if response.clicked() {
                                dialog.anchor = (column, row);
                            }
                        }
                    });
                }
            });
        });
        ui.add_space(6.0);
        ui.label(
            theme::muted(resize_description(
                old,
                (dialog.width, dialog.height),
                dialog.anchor,
            ))
            .size(13.0),
        );
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Resize").clicked() || enter {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || escape {
                outcome = Some(false);
            }
        });
    });
    match outcome {
        Some(true) => match resize_area(editor, &dialog) {
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

pub(super) fn resize_description(old: (u32, u32), new: (u32, u32), anchor: (i8, i8)) -> String {
    let mut parts = Vec::new();
    let side = |delta: i32, axis_anchor: i8, unit: &str, sides: (&str, &str)| -> Option<String> {
        if delta == 0 {
            return None;
        }
        let n = delta.unsigned_abs();
        let where_ = match axis_anchor {
            -1 => format!("on the {}", sides.1),
            1 => format!("on the {}", sides.0),
            _ => "on both sides".to_owned(),
        };
        Some(if delta > 0 {
            format!(
                "Adds {n} empty {unit}{} {where_}",
                if n == 1 { "" } else { "s" }
            )
        } else {
            format!("Clips {n} {unit}{} {where_}", if n == 1 { "" } else { "s" })
        })
    };
    if let Some(text) = side(
        new.0 as i32 - old.0 as i32,
        anchor.0,
        "column",
        ("left", "right"),
    ) {
        parts.push(text);
    }
    if let Some(text) = side(
        new.1 as i32 - old.1 as i32,
        anchor.1,
        "row",
        ("top", "bottom"),
    ) {
        parts.push(text);
    }
    if parts.is_empty() {
        return "The size stays as it is.".to_owned();
    }
    let shift = |axis_anchor: i8, delta: i32| -> i32 {
        match axis_anchor {
            -1 => 0,
            0 => delta / 2,
            _ => delta,
        }
    };
    let (dx, dy) = (
        shift(anchor.0, new.0 as i32 - old.0 as i32),
        shift(anchor.1, new.1 as i32 - old.1 as i32),
    );
    let shifting = if dx == 0 && dy == 0 {
        "With this anchor nothing shifts.".to_owned()
    } else {
        format!(
            "With this anchor everything shifts by {dx}, {dy}: positions, and every place leading in."
        )
    };
    format!(
        "{} of every ground layer and the walk grid. {shifting}",
        parts.join(" and ")
    )
}

pub fn resize_area(editor: &mut Editor, dialog: &ResizeDialog) -> Result<(), String> {
    let content = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .ok_or("the folder does not load")?;
    let id = content
        .by_key::<area::AreaDef>(&dialog.area)
        .ok_or("the area is gone")?;
    let area = area::load(&content, id);
    let old = area.size.grid();
    let new = game::core::tiling::GridSize::new(dialog.width, dialog.height);
    let shift_for = |anchor: i8, old: u32, new: u32| -> i32 {
        match anchor {
            -1 => 0,
            0 => (new as i32 - old as i32) / 2,
            _ => new as i32 - old as i32,
        }
    };
    let shift = (
        shift_for(dialog.anchor.0, old.width, new.width),
        shift_for(dialog.anchor.1, old.height, new.height),
    );
    let draft = super::grid::GridDraft::of(&dialog.area, area.grids);
    let (resized, clipped) = draft.resized(new, shift);
    let mut row = editor
        .row_value("area", &dialog.area)
        .ok_or("the area is gone")?;
    row["map"]["size"]["width"] = Value::from(dialog.width);
    row["map"]["size"]["height"] = Value::from(dialog.height);
    let (dx, dy) = (shift.0 as f32, shift.1 as f32);
    let bounds = Rect::new(
        Pos::new(-0.5, -0.5),
        Size::new(dialog.width as f32, dialog.height as f32),
    );
    let mut outside = Vec::new();
    for (index, module) in row["modules"]
        .as_array_mut()
        .into_iter()
        .flatten()
        .enumerate()
    {
        shapes::shift(module, dx, dy);
        if let Some(b) = shapes::bounds(module, None)
            && !bounds.contains_rect(&b)
        {
            match module["type"].as_str() {
                Some("safe_zone") | Some("soundscape") | Some("population") => {}
                _ => outside.push(format!("module {index} ({})", shapes::label(module))),
            }
        }
    }
    if !outside.is_empty() {
        return Err(format!(
            "{} left outside the map: {}",
            outside.len(),
            outside.join(", ")
        ));
    }
    let mut edit = Edit::new(format!(
        "Resize {} to {} × {} ({clipped} cells clipped)",
        dialog.area, dialog.width, dialog.height
    ));
    edit.write_json(row_file("area", &dialog.area), &row);
    resized.write_all_into(&mut edit);
    if dx != 0.0 || dy != 0.0 {
        let project = editor.project.as_ref().ok_or("no folder")?;
        for usage in project.usages.of_row("area", &dialog.area) {
            let Some(parent) = usage.pointer.strip_suffix("/area") else {
                continue;
            };
            let mut json = if usage.file == row_file("area", &dialog.area) {
                row.clone()
            } else {
                project.files.json(&usage.file).ok_or("a file is gone")?
            };
            let Some(place) = json.pointer_mut(parent) else {
                continue;
            };
            let (Some(x), Some(y)) = (place["x"].as_f64(), place["y"].as_f64()) else {
                continue;
            };
            place["x"] = serde_json::json!(x as f32 + dx);
            place["y"] = serde_json::json!(y as f32 + dy);
            if usage.file == row_file("area", &dialog.area) {
                row = json.clone();
                edit.write_json(usage.file.clone(), &row);
            } else {
                edit.write_json(usage.file.clone(), &json);
            }
        }
    }
    if editor.apply(edit) {
        Ok(())
    } else {
        Err("refused; see the output".to_owned())
    }
}
