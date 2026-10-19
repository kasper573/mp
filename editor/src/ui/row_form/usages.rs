use egui::{Align, Layout, Sense, Ui};
use engine::core::assets::FileSize;
use engine::core::content::{RowName, asset_file, row_of};

use super::{theme, widgets};
use crate::app::Editor;
use crate::moves::ScopeMoves;
use crate::ui::move_dialogs;

pub fn show_usages_grouped(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str, titled: bool) {
    let Some(project) = &editor.project else {
        return;
    };
    let mut groups: Vec<UsageGroup> = Vec::new();
    let mut total = 0;
    for usage in project.usages.of_row(table, key) {
        total += 1;
        let field = crate::rows::field_of(project, &usage.file, &usage.pointer);
        match groups
            .iter_mut()
            .find(|group| group.file == usage.file && group.field == field)
        {
            Some(group) => group.count += 1,
            None => groups.push(UsageGroup {
                file: usage.file.clone(),
                field,
                count: 1,
            }),
        }
    }
    let heading = if titled {
        format!("Used by · {key}")
    } else {
        "Used by".to_owned()
    };
    let owners = project.files.owners();
    let row = RowName::new(table, key);
    match owners.owner(table, key) {
        Some(owner) => widgets::section_with(ui, &format!("{heading} · {total}"), |ui| {
            ui.label(
                theme::faint(format!("only {owner} and its local rows can use it"))
                    .italics()
                    .size(12.0),
            );
        }),
        None => widgets::section_count(ui, &heading, total),
    }
    if groups.is_empty() {
        widgets::hint(ui, "nothing names this row");
    }
    let mut open = None;
    for group in &groups {
        let row = row_of(&group.file);
        let name = row.map_or_else(
            || group.file.clone(),
            |(table, key)| format!("{table}/{key}"),
        );
        let response = ui
            .horizontal(|ui| {
                let badge = if group.field.is_empty() {
                    row.map_or(group.file.as_str(), |(table, _)| table)
                } else {
                    group.field.as_str()
                };
                widgets::badge(ui, badge);
                if !group.field.is_empty() && group.field != name {
                    ui.label(theme::mono(&group.field).size(13.0));
                    ui.label(theme::faint("·"));
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if group.count > 1 {
                        ui.label(
                            theme::muted(format!("× {}", group.count))
                                .monospace()
                                .size(12.0),
                        );
                    }
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                        let local = row.and_then(|(table, key)| owners.owner(table, key));
                        let name = match local {
                            Some(owner) => format!("{name} · local to {owner}"),
                            None => name.clone(),
                        };
                        ui.add(
                            egui::Label::new(theme::mono(name).size(13.0).color(theme::CODE))
                                .truncate(),
                        );
                    });
                });
            })
            .response
            .interact(Sense::click());
        if response.clicked() {
            open = row;
        }
    }
    let suggestion = local_suggestion(editor, &row);
    if let Some((table, key)) = open {
        editor.open_row(table, key);
    }
    if let Some((home, users)) = suggestion {
        suggest_local(editor, ui, row, home, users);
    }
}

/// The owner a global row could become local to, and the users that make it so, unless the
/// suggestion was turned down while those users stayed the same.
fn local_suggestion(editor: &Editor, row: &RowName) -> Option<(RowName, Vec<RowName>)> {
    let project = editor.project.as_ref()?;
    if editor.shapes.is_fixture(&row.table, &row.key) {
        return None;
    }
    let moves = ScopeMoves::of(project);
    if moves.owner(row).is_some() {
        return None;
    }
    let home = moves.home(row).ok()?;
    let users: Vec<RowName> = moves.users(row).rows.into_iter().collect();
    (editor.views.declined.get(row) != Some(&users)).then_some((home, users))
}

fn suggest_local(
    editor: &mut Editor,
    ui: &mut Ui,
    row: RowName,
    home: RowName,
    users: Vec<RowName>,
) {
    ui.add_space(6.0);
    let mut make = false;
    let mut decline = false;
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(10, 6))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                let who = if users == [home.clone()] {
                    format!("Only {home} uses")
                } else {
                    format!("Only {home} and its local rows use")
                };
                ui.label(format!("{who} {}. Make it local there?", row.key));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    decline = ui.button("Not now").clicked();
                    make = ui.button("Make local…").clicked();
                });
            });
        });
    if decline {
        editor.views.declined.insert(row, users);
    } else if make {
        move_dialogs::make_local(editor, row);
    }
}

pub fn show_asset(editor: &mut Editor, ui: &mut Ui, path: &str) {
    ui.label(theme::mono(asset_file(path)).color(theme::CODE));
    let ctx = ui.ctx().clone();
    let (thumb, size) = {
        let Editor { project, form, .. } = editor;
        let Some(project) = project.as_ref() else {
            return;
        };
        let bytes = project
            .files
            .get(&asset_file(path))
            .map(|bytes| bytes.len())
            .unwrap_or(0);
        let thumb = if path.to_lowercase().ends_with(".png") {
            form.thumbnails.image(&ctx, &project.files, path)
        } else {
            None
        };
        (thumb, bytes)
    };
    ui.label(theme::muted(FileSize(size).to_string()));
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
        editor.open_row(table, key);
    }
}

/// The usages one file makes of a row from the same field.
struct UsageGroup {
    file: String,
    field: String,
    count: usize,
}
