//! The vfx views: a vfx row beside its preview, and a shader row beside its code and preview.

mod params;
mod preview;
mod shader_code;

use std::sync::Arc;

use egui::{Color32, FontId, Ui, Vec2 as EVec2};
use engine::core::content::{Content, ContentScope, ErrorPlace, with_content};
use engine::core::time::Seconds;
use engine::core::vfx::{ParamFill, VfxDef, VfxLayer, VfxShaderDef, shader_file};
use serde_json::Value;

pub use params::{ParamSpec, param_fill, params_of, shader_params};
pub use preview::{Target, VfxViews};

use self::preview::preview;
use crate::app::Editor;
use crate::project::ContentEdit;
use crate::ui::{row_form, theme, widgets};
use engine::core::content::row_file;

pub const TABLE: &str = "vfx";
pub const SHADER_TABLE: &str = "vfx_shader";

const FORM_WIDTH: f32 = 440.0;
const COLUMN_GAP: f32 = 16.0;
const MIN_CODE_WIDTH: f32 = 260.0;
const HEADING_HEIGHT: f32 = 24.0;
const MIN_TITLE_WIDTH: f32 = 60.0;

pub fn show_vfx(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(TABLE, key) else {
        ui.label(theme::muted(format!("{} is gone", row_file(TABLE, key))));
        return;
    };
    let (layers, inside) = editor.loaded().map_or((Vec::new(), None), |content| {
        let layers = layers_of(&content, &row);
        let inside = row["on_actors_inside"].as_str().map(|inner| {
            if inner == key {
                layers.clone()
            } else {
                content
                    .by_key::<VfxDef>(inner)
                    .map_or_else(Vec::new, |id| id.get(&content).layers.clone())
            }
        });
        (layers, inside)
    });
    let specs = editor
        .project
        .as_ref()
        .map(|project| params_of(&project.files, TABLE, key))
        .unwrap_or_default();
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(FORM_WIDTH);
            egui::ScrollArea::vertical()
                .id_salt(("vfx-form", key))
                .auto_shrink([false, false])
                .show(ui, |ui| row_form::show_row(editor, ui, TABLE, key));
        });
        ui.add_space(16.0);
        ui.vertical(|ui| {
            widgets::section(ui, "preview");
            preview(
                editor,
                ui,
                &format!("{TABLE}/{key}"),
                layers,
                inside,
                &specs,
                &[],
            );
        });
    });
}

pub fn show_shader(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(SHADER_TABLE, key) else {
        ui.label(theme::muted(format!(
            "{} is gone",
            row_file(SHADER_TABLE, key)
        )));
        return;
    };
    let def: Option<VfxShaderDef> = serde_json::from_value(row.clone()).ok();
    let file = shader_file(key);
    let current = editor
        .project
        .as_ref()
        .and_then(|project| project.files.text(&file))
        .unwrap_or_default();
    let room = ui.available_width() - 2.0 * COLUMN_GAP;
    let preview_width = crate::stage::preview_width(room - FORM_WIDTH - MIN_CODE_WIDTH);
    let code_width = (room - FORM_WIDTH - preview_width).max(MIN_CODE_WIDTH);
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(FORM_WIDTH);
            egui::ScrollArea::vertical()
                .id_salt(("shader-form", key))
                .auto_shrink([false, false])
                .show(ui, |ui| row_form::show_row(editor, ui, SHADER_TABLE, key));
        });
        ui.add_space(COLUMN_GAP);
        ui.vertical(|ui| {
            ui.set_width(code_width);
            match def.as_ref() {
                Some(def) => code_pane(editor, ui, def, key, &file, &current),
                None => {
                    widgets::section(ui, &format!("code · {file}"));
                    ui.label(theme::warn("the row does not parse as a shader yet"));
                }
            }
        });
        ui.add_space(COLUMN_GAP);
        ui.vertical(|ui| {
            ui.set_width(preview_width);
            widgets::section(ui, "preview");
            let Some((def, shader)) = def.as_ref().zip(
                editor
                    .loaded()
                    .and_then(|content| content.by_key::<VfxShaderDef>(key)),
            ) else {
                return;
            };
            let layer = VfxLayer::Shader {
                shader,
                params: def
                    .params
                    .iter()
                    .map(|param| {
                        let fill = ParamFill::Param {
                            param: param.name.clone(),
                        };
                        (param.name.clone(), fill)
                    })
                    .collect(),
                duration: Seconds(1.0),
                delay: Seconds(0.0),
            };
            let specs: Vec<ParamSpec> = def.params.iter().map(ParamSpec::from).collect();
            let drafts = [(key.to_owned(), current.clone())];
            preview(
                editor,
                ui,
                &format!("{SHADER_TABLE}/{key}"),
                vec![layer],
                None,
                &specs,
                &drafts,
            );
        });
    });
}

/// The shader's code, edited in place: every change is a step in the editor's history, merged with
/// the last, so the preview follows the typing and undo takes it back.
fn code_pane(
    editor: &mut Editor,
    ui: &mut Ui,
    def: &VfxShaderDef,
    key: &str,
    file: &str,
    current: &str,
) {
    let heading_slot = ui.available_rect_before_wrap();
    ui.add_space(HEADING_HEIGHT);
    let height = ui.available_height();
    let mut text = current.to_owned();
    let id = egui::Id::new(("shader-code", key));
    let (response, verdict) = shader_code::show(ui, id, &mut text, def, height);
    if response.changed() {
        let mut edit = ContentEdit::new(format!("Edit shader {key}")).merging();
        edit.write(file.to_owned(), Arc::from(text.as_bytes()));
        editor.apply(edit);
    }
    let status = match &verdict {
        Ok(()) => theme::ok("compiles"),
        Err(error) => {
            let place = match error.place {
                ErrorPlace::Text { line, column } => format!("line {line}:{column} · "),
                _ => String::new(),
            };
            theme::warn(format!("{place}{}", error.message))
        }
    };
    let heading = egui::Rect::from_min_size(
        heading_slot.min,
        EVec2::new(heading_slot.width(), HEADING_HEIGHT),
    );
    ui.scope_builder(
        egui::UiBuilder::new()
            .max_rect(heading)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
        |ui| {
            let status = status.size(11.0);
            let status_width = ui.fonts_mut(|fonts| {
                fonts
                    .layout_no_wrap(
                        status.text().to_owned(),
                        FontId::proportional(11.0),
                        Color32::WHITE,
                    )
                    .size()
                    .x
            });
            let title_room = ui.available_width() - status_width - ui.spacing().item_spacing.x;
            ui.scope(|ui| {
                ui.set_max_width(title_room.max(MIN_TITLE_WIDTH));
                ui.add(
                    egui::Label::new(widgets::section_heading(&format!("code · {file} · ")))
                        .truncate(),
                );
            });
            ui.add(egui::Label::new(status).truncate());
        },
    );
}

/// The row's layers that parse, each against the content that last loaded, so a row being worked
/// on still previews the layers that are whole.
fn layers_of(content: &Content, row: &Value) -> Vec<VfxLayer> {
    let layers = row["layers"].as_array().cloned().unwrap_or_default();
    with_content(ContentScope::of(content), || {
        layers
            .into_iter()
            .filter_map(|layer| serde_json::from_value(layer).ok())
            .collect()
    })
    .0
}
