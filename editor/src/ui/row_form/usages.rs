use egui::{Align, Layout, Sense, Ui};
use engine::core::content::row_of;

use super::{theme, widgets};
use crate::app::Editor;
use crate::project::RowSelection;
use crate::tabs::EditorTab;

pub fn show_usages_grouped(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str, titled: bool) {
    let Some(project) = &editor.project else {
        return;
    };
    let mut groups: Vec<(String, String, usize)> = Vec::new();
    let mut total = 0;
    for usage in project.usages.of_row(table, key) {
        total += 1;
        let kind = crate::rows::field_of(project, &usage.file, &usage.pointer);
        let file = row_of(&usage.file)
            .map(|(t, k)| format!("{t}/{k}"))
            .unwrap_or_else(|| usage.file.clone());
        match groups.iter_mut().find(|(f, k, _)| *f == file && *k == kind) {
            Some((_, _, count)) => *count += 1,
            None => groups.push((file, kind, 1)),
        }
    }
    let heading = if titled {
        format!("Used by · {key}")
    } else {
        "Used by".to_owned()
    };
    widgets::section_count(ui, &heading, total);
    if groups.is_empty() {
        widgets::hint(ui, "nothing names this row");
    }
    let mut open = None;
    for (file, kind, count) in &groups {
        let response = ui
            .horizontal(|ui| {
                let (row_table, _) = file.split_once('/').unwrap_or((file.as_str(), ""));
                widgets::badge(ui, if kind.is_empty() { row_table } else { kind });
                if !kind.is_empty() && kind != file {
                    ui.label(theme::mono(kind).size(13.0));
                    ui.label(theme::faint("·"));
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if *count > 1 {
                        ui.label(theme::muted(format!("× {count}")).monospace().size(12.0));
                    }
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                        ui.add(
                            egui::Label::new(theme::mono(file).size(13.0).color(theme::CODE))
                                .truncate(),
                        );
                    });
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            open = Some(file.clone());
        }
    }
    if let Some(file) = open
        && let Some((table, key)) = file.split_once('/')
    {
        editor.select(RowSelection::row(table, key));
        editor.open_tab(EditorTab::for_row(table, key));
    }
}

pub fn show_asset(editor: &mut Editor, ui: &mut Ui, path: &str) {
    ui.label(theme::mono(format!("assets/{path}")).color(theme::CODE));
    let ctx = ui.ctx().clone();
    let (thumb, size) = {
        let Editor { project, form, .. } = editor;
        let Some(project) = project.as_ref() else {
            return;
        };
        let bytes = project
            .files
            .get(&format!("assets/{path}"))
            .map(|bytes| bytes.len())
            .unwrap_or(0);
        let thumb = if path.to_lowercase().ends_with(".png") {
            form.thumbnails.image(&ctx, &project.files, path)
        } else {
            None
        };
        (thumb, bytes)
    };
    ui.label(theme::muted(format!("{} KB", size / 1024)));
    if let Some(thumb) = thumb {
        let scale = ((ui.available_width() - 8.0) / thumb.size[0].max(1) as f32).min(4.0);
        ui.add(egui::Image::from_texture((
            thumb.texture.id(),
            egui::vec2(thumb.size[0] as f32 * scale, thumb.size[1] as f32 * scale),
        )));
        ui.label(theme::muted(format!(
            "{} × {} px",
            thumb.size[0], thumb.size[1]
        )));
    }
}

pub fn show_asset_usages(editor: &mut Editor, ui: &mut Ui, path: &str) {
    let usages: Vec<(String, String)> = editor
        .project
        .as_ref()
        .map(|project| {
            project
                .usages
                .of_asset(path)
                .iter()
                .map(|u| (u.file.clone(), u.pointer.clone()))
                .collect()
        })
        .unwrap_or_default();
    widgets::section_count(ui, "Used by", usages.len());
    if usages.is_empty() {
        widgets::hint(ui, "nothing names this file");
    }
    let mut open = None;
    for (file, pointer) in &usages {
        ui.horizontal(|ui| {
            if ui.link(theme::mono(file)).clicked() {
                open = Some(file.clone());
            }
            ui.label(theme::muted(pointer).monospace().size(12.0));
        });
    }
    if let Some(file) = open
        && let Some((table, key)) = row_of(&file)
    {
        editor.select(RowSelection::row(table, key));
        editor.open_tab(EditorTab::for_row(table, key));
    }
}
