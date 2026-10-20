use egui::{RichText, Vec2};
use engine::core::content::{ContentFile, fields_file, table_of};
use engine::core::math::{Pos, Rect, Size};
use engine::core::tiling::GridSize;
use engine::systems::area::scene::scene_file;
use engine::systems::area::{self, AreaDef, AreaModuleKind};
use serde_json::Value;

use super::grid::GridDraft;
use super::{nodes, pins, shapes};
use crate::app::Editor;
use crate::forms;
use crate::project::ContentEdit;
use crate::tabs::file_title;
use crate::ui::{dialogs, theme, widgets};
use crate::value::RowValue;

pub struct ResizeDialog {
    /// The area or blueprint bundle resized.
    pub bundle: String,
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
    let mut outcome = None;
    let old = editor
        .project
        .as_ref()
        .and_then(|p| p.content.clone())
        .and_then(|c| GridDraft::own(&c, &dialog.bundle))
        .map(|draft| (draft.size.width, draft.size.height))
        .unwrap_or((dialog.width, dialog.height));
    let smallest = match table_of(&dialog.bundle) {
        Some(AreaDef::TABLE) => area::MIN_SIDE,
        _ => 1,
    };
    crate::ui::dialogs::card(ctx, "resize", 480.0, |ui| {
        let pressed = dialogs::keys(ui);
        ui.label(
            RichText::new(format!("Resize {}", file_title(&dialog.bundle)))
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
                    let response = forms::boxed_input(ui, Some(&format!("was {was}")), |ui| {
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
                            *value = parsed.clamp(smallest, area::MAX_SIDE);
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
            if widgets::primary(ui, "Resize").clicked() || pressed.enter {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || pressed.escape {
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
            format!("Adds {n} empty {unit}{} {where_}", widgets::plural(n))
        } else {
            format!("Clips {n} {unit}{} {where_}", widgets::plural(n))
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
    let (dx, dy) = (
        anchor_shift(anchor.0, old.0, new.0),
        anchor_shift(anchor.1, old.1, new.1),
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

fn anchor_shift(anchor: i8, old: u32, new: u32) -> i32 {
    let delta = new as i32 - old as i32;
    match anchor {
        -1 => 0,
        0 => delta / 2,
        _ => delta,
    }
}

pub fn resize_area(editor: &mut Editor, dialog: &ResizeDialog) -> Result<(), String> {
    let content = editor
        .project
        .as_ref()
        .and_then(|p| p.content.clone())
        .ok_or("the folder does not load")?;
    let bundle = &dialog.bundle;
    let draft = GridDraft::own(&content, bundle).ok_or("the bundle is gone")?;
    let old = draft.size;
    let new = GridSize::new(dialog.width, dialog.height);
    let shift = (
        anchor_shift(dialog.anchor.0, old.width, new.width),
        anchor_shift(dialog.anchor.1, old.height, new.height),
    );
    let (resized, clipped) = draft.resized(new, shift);
    let mut row = editor.row_value(bundle).ok_or("the bundle is gone")?;
    let map = row
        .pointer_mut(nodes::map_pointer(bundle))
        .ok_or("the bundle has no map")?;
    map["size"]["width"] = Value::from(dialog.width);
    map["size"]["height"] = Value::from(dialog.height);
    let (dx, dy) = (shift.0 as f32, shift.1 as f32);
    let bounds = Rect::new(
        Pos::new(-0.5, -0.5),
        Size::new(dialog.width as f32, dialog.height as f32),
    );
    let mut outside = Vec::new();
    let mut scene = nodes::scene_of(editor, bundle);
    let in_area = table_of(bundle) == Some(AreaDef::TABLE);
    for module in nodes::modules(&scene) {
        let Some(module) = scene.pointer_mut(&module.pointer) else {
            continue;
        };
        shapes::shift(module, dx, dy);
        if let Some(b) = shapes::bounds(module, None)
            && in_area
            && !bounds.contains_rect(&b)
        {
            match module.module_kind() {
                Some(AreaModuleKind::SafeZone)
                | Some(AreaModuleKind::Soundscape)
                | Some(AreaModuleKind::Population) => {}
                _ => outside.push(shapes::label(module)),
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
    let mut edit = ContentEdit::new(format!(
        "Resize {} to {} × {} ({clipped} cells clipped)",
        file_title(bundle),
        dialog.width,
        dialog.height
    ));
    edit.write_json(fields_file(bundle), &row);
    edit.write_json(scene_file(bundle), &scene);
    resized.write_all_into(&mut edit);
    if dx != 0.0 || dy != 0.0 {
        let files = &editor.project.as_ref().ok_or("no folder")?.files;
        for arrival in pins::arrivals(editor, bundle) {
            edit.update_json(files, &arrival.file, |json| {
                let place = json.pointer_mut(&arrival.pointer)?;
                place["x"] = serde_json::json!(arrival.at.x + dx);
                place["y"] = serde_json::json!(arrival.at.y + dy);
                Some(())
            });
        }
    }
    editor.try_apply(edit)
}
