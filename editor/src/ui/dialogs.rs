use design_tokens::face::TextRole;
use design_tokens::glyph::{self, Mark};
use design_tokens::sheet;
use std::path::{Path, PathBuf};

use egui::{Context, RichText, Ui};
use engine::core::content::version;
use strum::VariantArray;

use super::{theme, widgets};
use crate::app::{
    CloseThen, ConfirmAction, Editor, ModalDialog, NewGameDialog, NewGameSource, RenameDialog,
    RenameTarget,
};
use crate::keymap::{EditorKey, KeyScope};
use crate::project::ContentEdit;
use crate::rows::{UsageDecision, UsageSummary};
use crate::templates::GameTemplate;
use crate::ui::start;
use crate::views::area::{layers, pick, resize};
use crate::views::script::inspect;
use crate::views::{area, script, world};
use crate::{import, play, rows, templates, ui};
use engine::core::content::{GAME_FILE, row_file, row_of};

pub fn show(editor: &mut Editor, ctx: &Context) {
    import::show_readings(editor, ctx);
    let mut dialogs = std::mem::take(&mut editor.dialogs);
    let mut keep = Vec::new();
    for dialog in dialogs.drain(..) {
        if let Some(dialog) = one(editor, ctx, dialog) {
            keep.push(dialog);
        }
    }
    keep.extend(std::mem::take(&mut editor.dialogs));
    editor.dialogs = keep;
}

fn window(ctx: &Context, title: &str, body: impl FnOnce(&mut egui::Ui)) {
    let mut under = None;
    let shown = egui::Window::new(title)
        .title_bar(false)
        .collapsible(false)
        .resizable(true)
        .frame(egui::Frame::new().inner_margin(NOTE_PADDING))
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .show(ctx, |ui| {
            under = Some(ui.painter().add(egui::Shape::Noop));
            ui.label(TextRole::NoteTitle.rich(title).color(theme::TEXT));
            ui.add_space(6.0);
            body(ui);
        });
    if let Some((shown, under)) = shown.zip(under) {
        let painter = ctx.layer_painter(shown.response.layer_id);
        sheet::paint_note(&painter, under, shown.response.rect);
    }
}

const NOTE_PADDING: i8 = 20;

#[derive(Default)]
pub struct DialogKeys {
    pub enter: bool,
    pub escape: bool,
}

pub fn keys(ui: &Ui) -> DialogKeys {
    ui.ctx().input(|i| DialogKeys {
        enter: EditorKey::Confirm.pressed(i),
        escape: EditorKey::Cancel.pressed(i),
    })
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DialogAnswer {
    Confirm,
    Cancel,
}

pub fn answer_row(ui: &mut Ui, confirm: &str) -> Option<DialogAnswer> {
    let pressed = keys(ui);
    let mut answer = None;
    ui.horizontal(|ui| {
        if widgets::primary(ui, confirm).clicked() || pressed.enter {
            answer = Some(DialogAnswer::Confirm);
        }
        if ui.button("Cancel").clicked() || pressed.escape {
            answer = Some(DialogAnswer::Cancel);
        }
    });
    answer
}

pub fn card(ctx: &Context, id: &str, width: f32, body: impl FnOnce(&mut egui::Ui)) {
    egui::Area::new(egui::Id::new(id))
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .order(egui::Order::Middle)
        .show(ctx, |ui| {
            sheet::note(ui, egui::Margin::same(NOTE_PADDING), |ui| {
                ui.set_width(width);
                body(ui);
            });
        });
}

fn new_game(editor: &mut Editor, ctx: &Context, mut dialog: NewGameDialog) -> Option<ModalDialog> {
    let mut outcome = None;
    let templates = templates::list();
    let mut pressed = DialogKeys::default();
    let copy_source = match &dialog.source {
        NewGameSource::Copy(folder) => Some(folder.clone()),
        NewGameSource::Template(_) => None,
    };
    let title = match &copy_source {
        Some(folder) => format!("+ New game from {}", start::game_name(folder)),
        None => "+ New game".to_owned(),
    };
    card(
        ctx,
        "new-game",
        if copy_source.is_some() { 600.0 } else { 1080.0 },
        |ui| {
            pressed = keys(ui);
            ui.label(RichText::new(&title).strong().size(18.0));
            ui.add_space(8.0);
            match &mut dialog.source {
                NewGameSource::Template(picked) => {
                    ui.horizontal_top(|ui| {
                        template_cards(ui, picked, &templates);
                        ui.add_space(20.0);
                        if let Some(template) = templates.iter().find(|t| t.key == *picked) {
                            template_summary(ui, editor, template);
                        }
                    });
                }
                NewGameSource::Copy(source) => {
                    widgets::kv_code(ui, "from", ui::pretty_path(source));
                }
            }
            ui.add_space(10.0);
            ui.separator();
            widgets::kv(ui, "name", |ui| {
                let response =
                    ui.add(egui::TextEdit::singleline(&mut dialog.name).desired_width(360.0));
                if response.changed() && !dialog.folder_touched {
                    let base = Path::new(&dialog.folder)
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_default();
                    dialog.folder = base.join(start::slug(&dialog.name)).display().to_string();
                }
                ui.label(theme::muted(format!("written into the new {GAME_FILE}")));
            });
            widgets::kv(ui, "folder", |ui| {
                if ui
                    .add(
                        egui::TextEdit::singleline(&mut dialog.folder)
                            .desired_width(300.0)
                            .font(egui::TextStyle::Monospace),
                    )
                    .changed()
                {
                    dialog.folder_touched = true;
                }
                if ui.button("pick…").clicked()
                    && let Some(folder) = rfd::FileDialog::new()
                        .set_title("Folder for the new game (new or empty)")
                        .pick_folder()
                {
                    dialog.folder = folder.display().to_string();
                    dialog.folder_touched = true;
                }
                ui.label(theme::muted("new, or empty"));
            });
            if let Some(source) = &copy_source {
                ui.add_space(6.0);
                ui.horizontal_top(|ui| {
                    ui.vertical(|ui| {
                        ui.set_width(300.0);
                        widgets::section(ui, "Copied");
                        let rows: usize = std::fs::read_dir(source.join("tables"))
                            .map(|tables| {
                                tables
                                    .flatten()
                                    .map(|t| {
                                        std::fs::read_dir(t.path()).map(|r| r.count()).unwrap_or(0)
                                    })
                                    .sum()
                            })
                            .unwrap_or(0);
                        let assets = count_files_in(&source.join("assets"));
                        ui.label(theme::mono(format!("{GAME_FILE}   name → {}", dialog.name)));
                        ui.label(theme::mono(format!("tables/     {rows} rows")));
                        ui.label(theme::mono(format!("assets/     {assets} files")));
                    });
                    ui.vertical(|ui| {
                        widgets::section(ui, "Stays behind");
                        let mut others: Vec<String> = std::fs::read_dir(source)
                            .map(|entries| {
                                entries
                                    .flatten()
                                    .filter_map(|entry| {
                                        let name = entry.file_name().to_string_lossy().into_owned();
                                        (!matches!(name.as_str(), GAME_FILE | "tables" | "assets"))
                                            .then(|| {
                                                if entry.path().is_dir() {
                                                    format!("{name}/")
                                                } else {
                                                    name.clone()
                                                }
                                            })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        others.sort();
                        if others.is_empty() {
                            ui.label(theme::muted("nothing"));
                        }
                        for other in others {
                            ui.label(theme::muted(other).monospace());
                        }
                    });
                });
                ui.add_space(6.0);
                ui.label(theme::muted(format!(
                    "{} isn't touched. Nothing links the two afterwards.",
                    start::game_name(source)
                )));
            } else {
                ui.add_space(6.0);
                let name = templates
                    .iter()
                    .find(|t| matches!(&dialog.source, NewGameSource::Template(k) if *k == t.key))
                    .map(|t| t.name.clone())
                    .unwrap_or_default();
                ui.label(theme::muted(format!(
                    "Create writes {name}'s files into {} and opens it. Nothing links the game to its template.",
                    ui::pretty_path(Path::new(&dialog.folder))
                )));
            }
            if let Some(error) = &dialog.error {
                ui.colored_label(theme::DANGER, error);
            }
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                let label = if copy_source.is_some() {
                    "Create and open"
                } else {
                    "Create"
                };
                if widgets::primary(ui, label).clicked() {
                    outcome = Some(true);
                }
                if ui.button("Cancel").clicked() {
                    outcome = Some(false);
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(
                        theme::faint(format!(
                            "{} picks · {} creates · {} cancels",
                            EditorKey::Move.name(),
                            EditorKey::Confirm.name(),
                            EditorKey::Cancel.name()
                        ))
                        .size(12.0),
                    );
                });
            });
        },
    );
    if pressed.enter && !ctx.egui_wants_keyboard_input() {
        outcome = Some(true);
    }
    if pressed.escape {
        outcome = Some(false);
    }
    match outcome {
        Some(true) => {
            let folder = PathBuf::from(dialog.folder.trim());
            let result = match &dialog.source {
                NewGameSource::Template(template) => {
                    templates::new_game(template, dialog.name.trim(), &folder)
                }
                NewGameSource::Copy(source) => {
                    templates::new_game_from(source, dialog.name.trim(), &folder)
                }
            };
            match result {
                Ok(()) => {
                    editor.say(format!("Created {}", folder.display()));
                    if editor.has_unsaved() {
                        ui::request_close(editor, CloseThen::Open(folder));
                    } else {
                        editor.open_folder(&folder);
                    }
                    None
                }
                Err(error) => {
                    dialog.error = Some(error);
                    Some(ModalDialog::NewGame(dialog))
                }
            }
        }
        Some(false) => None,
        None => Some(ModalDialog::NewGame(dialog)),
    }
}

fn template_cards(ui: &mut Ui, picked: &mut String, templates: &[GameTemplate]) {
    if !ui.ctx().egui_wants_keyboard_input()
        && let Some([_, step]) = ui.input(|i| EditorKey::Move.arrow(i))
        && let Some(at) = templates.iter().position(|t| t.key == *picked)
    {
        let next = at
            .saturating_add_signed(step as isize)
            .min(templates.len() - 1);
        *picked = templates[next].key.clone();
    }
    ui.vertical(|ui| {
        ui.set_width(460.0);
        widgets::section(ui, "Built into this editor");
        for template in templates {
            let selected = *picked == template.key;
            let response = egui::Frame::new()
                .fill(if selected {
                    theme::ACCENT_SOFT
                } else {
                    theme::PANEL
                })
                .stroke(egui::Stroke::new(
                    1.0,
                    if selected {
                        theme::ACCENT
                    } else {
                        theme::BORDER
                    },
                ))
                .corner_radius(6.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.horizontal(|ui| {
                                ui.label(theme::strong(&template.name));
                                ui.label(theme::muted(&template.key).monospace());
                            });
                            ui.label(theme::muted(template_counts(template)));
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                theme::faint(format!("build {}", version::build()))
                                    .monospace()
                                    .size(12.0),
                            );
                        });
                    });
                })
                .response
                .interact(egui::Sense::click());
            if response.clicked() {
                *picked = template.key.clone();
            }
        }
    });
}

fn template_counts(template: &GameTemplate) -> String {
    let rows_in = |table: &str| {
        template
            .tables
            .iter()
            .find(|(t, _)| t == table)
            .map_or(0, |(_, keys)| keys.len())
    };
    let players = rows_in("player");
    let scripts = rows_in("script");
    format!(
        "{} area{} · {players} player{} · {scripts} shared script{}",
        template.areas.len(),
        widgets::plural(template.areas.len()),
        widgets::plural(players),
        widgets::plural(scripts)
    )
}

fn template_summary(ui: &mut Ui, editor: &Editor, template: &GameTemplate) {
    ui.vertical(|ui| {
        ui.set_width(560.0);
        widgets::kv(ui, "name", |ui| {
            ui.label(theme::strong(&template.name));
            ui.label(theme::muted(format!("from {GAME_FILE}")));
        });
        widgets::kv_code(ui, "initial spawn", &template.initial_spawn);
        widgets::kv(ui, "holds", |ui| {
            let mut parts: Vec<String> = vec![GAME_FILE.to_owned(), "every fixture".to_owned()];
            for (table, keys) in &template.tables {
                let own: Vec<&str> = keys
                    .iter()
                    .map(String::as_str)
                    .filter(|key| !editor.shapes.is_fixture(table, key))
                    .collect();
                if !own.is_empty() {
                    parts.push(format!("{}/{}", table, own.join(", ")));
                }
            }
            ui.add(egui::Label::new(theme::muted(parts.join(" · "))).wrap());
        });
    });
}

fn count_files_in(folder: &Path) -> usize {
    std::fs::read_dir(folder)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| {
                    if entry.path().is_dir() {
                        count_files_in(&entry.path())
                    } else {
                        1
                    }
                })
                .sum()
        })
        .unwrap_or(0)
}

fn rename(editor: &mut Editor, ctx: &Context, mut dialog: RenameDialog) -> Option<ModalDialog> {
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    let groups: Vec<UsageSummary> = match (&dialog.target, &editor.project) {
        (RenameTarget::Row { table, key }, Some(project)) => {
            rows::usage_groups(project, table, key)
        }
        _ => Vec::new(),
    };
    let rows: usize = groups.iter().map(|group| group.keys.len()).sum();
    let title = match &dialog.target {
        RenameTarget::Row { table, key } => format!("Rename {table}/{key}"),
        RenameTarget::Layer { area, layer } => format!("Rename layer {layer} of {area}"),
    };
    card(ctx, "rename", 600.0, |ui| {
        pressed = keys(ui);
        ui.label(RichText::new(title).strong().size(18.0));
        ui.add_space(8.0);
        let response = ui.add(
            egui::TextEdit::singleline(&mut dialog.draft)
                .desired_width(f32::INFINITY)
                .font(egui::TextStyle::Monospace),
        );
        widgets::default_focus(ui, &response);
        ui.add_space(6.0);
        if let RenameTarget::Layer { .. } = &dialog.target {
            ui.label(theme::muted(
                "The layer's grid file and every palette entry naming it change as one undo step.",
            ));
        } else if let RenameTarget::Row { table, key } = &dialog.target {
            ui.label(theme::muted(if rows == 0 {
                "Nothing names it. Only the file changes.".to_owned()
            } else {
                format!(
                    "{rows} row{} name it. The file and those rows change as one undo step.",
                    widgets::plural(rows)
                )
            }));
            if !groups.is_empty() {
                ui.add_space(4.0);
                egui::Frame::new()
                    .fill(theme::INPUT)
                    .stroke(egui::Stroke::new(1.0, theme::BORDER))
                    .corner_radius(4.0)
                    .inner_margin(10.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(
                            theme::mono(format!(
                                "{}  →  {}.json",
                                row_file(table, key),
                                dialog.draft.trim()
                            ))
                            .color(theme::CODE),
                        );
                        for group in &groups {
                            let shown: Vec<&str> =
                                group.keys.iter().take(4).map(String::as_str).collect();
                            let more = if group.keys.len() > 4 { ", …" } else { "" };
                            ui.horizontal(|ui| {
                                ui.label(theme::code(format!("{} · {}", group.table, group.field)));
                                ui.label(
                                    theme::mono(format!(
                                        "{} · {}{more}",
                                        group.keys.len(),
                                        shown.join(", ")
                                    ))
                                    .color(theme::MUTED),
                                );
                            });
                        }
                    });
            }
        }
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            let label = if matches!(dialog.target, RenameTarget::Layer { .. }) || rows == 0 {
                "Rename".to_owned()
            } else {
                format!("Rename and update {rows} row{}", widgets::plural(rows))
            };
            if widgets::primary(ui, &label).clicked() {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() {
                outcome = Some(false);
            }
        });
    });
    if pressed.enter {
        outcome = Some(true);
    }
    if pressed.escape {
        outcome = Some(false);
    }
    match outcome {
        Some(true) => {
            let renamed = match &dialog.target {
                RenameTarget::Layer { area, layer } => {
                    layers::rename_layer(editor, area, layer, dialog.draft.trim())
                }
                RenameTarget::Row { table, key } => {
                    rows::rename(editor, table, key, dialog.draft.trim())
                }
            };
            match renamed {
                Ok(()) => None,
                Err(error) => {
                    dialog.error = Some(error);
                    Some(ModalDialog::Rename(dialog))
                }
            }
        }
        Some(false) => None,
        None => Some(ModalDialog::Rename(dialog)),
    }
}

fn one(editor: &mut Editor, ctx: &Context, dialog: ModalDialog) -> Option<ModalDialog> {
    match dialog {
        ModalDialog::Error(title, text) => {
            let mut open = true;
            window(ctx, &title, |ui| {
                ui.label(&text);
                if ui.button("OK").clicked() {
                    open = false;
                }
            });
            open.then(|| ModalDialog::Error(title, text))
        }
        ModalDialog::Confirm(confirm) => {
            let mut outcome = None;
            let mut pressed = DialogKeys::default();
            card(
                ctx,
                "confirm",
                if confirm.compare.is_some() {
                    600.0
                } else {
                    440.0
                },
                |ui| {
                    pressed = keys(ui);
                    ui.label(RichText::new(&confirm.title).strong().size(18.0));
                    ui.add_space(6.0);
                    ui.label(theme::muted(&confirm.body));
                    if let Some(compare) = &confirm.compare {
                        ui.add_space(8.0);
                        ui.columns(2, |columns| {
                            widgets::section(&mut columns[0], &compare.left_title);
                            widgets::code_block(&mut columns[0], &compare.left);
                            widgets::section(&mut columns[1], &compare.right_title);
                            widgets::code_block(&mut columns[1], &compare.right);
                        });
                    }
                    ui.add_space(10.0);
                    ui.horizontal(|ui| {
                        let danger = confirm.label.starts_with("Delete")
                            || confirm.label.starts_with("Remove");
                        let clicked = if danger {
                            widgets::danger(ui, &confirm.label).clicked()
                        } else {
                            widgets::primary(ui, &confirm.label).clicked()
                        };
                        if clicked {
                            outcome = Some(true);
                        }
                        if ui.button("Cancel").clicked() {
                            outcome = Some(false);
                        }
                    });
                },
            );
            if pressed.enter {
                outcome = Some(true);
            }
            if pressed.escape {
                outcome = Some(false);
            }
            match outcome {
                Some(true) => {
                    confirmed(editor, confirm.action);
                    None
                }
                Some(false) => None,
                None => Some(ModalDialog::Confirm(confirm)),
            }
        }
        ModalDialog::Close(close) => {
            let mut outcome = None;
            window(ctx, "Unsaved changes", |ui| {
                let count = editor.project.as_ref().map_or(0, |p| p.unsaved().len());
                ui.label(format!("{count} files are unsaved."));
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        outcome = Some(Some(true));
                    }
                    if ui.button("Don't save").clicked() {
                        outcome = Some(Some(false));
                    }
                    if ui.button("Cancel").clicked() {
                        outcome = Some(None);
                    }
                });
            });
            match outcome {
                Some(Some(true)) => {
                    if editor.save() {
                        ui::finish_close(editor, close.then);
                    }
                    None
                }
                Some(Some(false)) => {
                    ui::finish_close(editor, close.then);
                    None
                }
                Some(None) => None,
                None => Some(ModalDialog::Close(close)),
            }
        }
        ModalDialog::NewGame(dialog) => new_game(editor, ctx, dialog),
        ModalDialog::Conflicts(mut conflicts) => {
            let conflict = conflicts.first().cloned()?;
            let name = row_of(&conflict.file)
                .map(|(table, key)| format!("{table}/{key}"))
                .unwrap_or_else(|| conflict.file.clone());
            let disk_text = conflict
                .disk
                .as_ref()
                .and_then(|bytes| String::from_utf8(bytes.to_vec()).ok());
            let mine_text = editor
                .project
                .as_ref()
                .and_then(|project| project.files.text(&conflict.file));
            let (disk_lines, mine_lines) =
                differing_lines(disk_text.as_deref(), mine_text.as_deref());
            let compare_id = egui::Id::new(("conflict-compare", &conflict.file));
            let mut compare = ctx
                .data(|d| d.get_temp::<bool>(compare_id))
                .unwrap_or(false);
            let mut decided: Option<bool> = None;
            card(
                ctx,
                "conflict",
                if compare { 1100.0 } else { 560.0 },
                |ui| {
                    ui.label(
                        RichText::new(format!("{name} changed on disk"))
                            .strong()
                            .size(18.0),
                    );
                    ui.add_space(6.0);
                    ui.label(
                        theme::muted(
                            "You have unsaved edits to this row, and the file on disk changed too.",
                        )
                        .size(13.5),
                    );
                    ui.add_space(8.0);
                    if compare {
                        ui.columns(2, |columns| {
                            for (column, title, text) in [
                                (0usize, "on disk", disk_text.as_deref()),
                                (1, "yours", mine_text.as_deref()),
                            ] {
                                let ui = &mut columns[column];
                                ui.label(theme::faint(title).monospace().size(12.0));
                                egui::ScrollArea::vertical()
                                    .id_salt(("compare", column))
                                    .max_height(420.0)
                                    .show(ui, |ui| {
                                        widgets::code_block(
                                            ui,
                                            text.unwrap_or("(the file is gone)"),
                                        );
                                    });
                            }
                        });
                    } else {
                        egui::Frame::new()
                            .fill(theme::INPUT)
                            .stroke(egui::Stroke::new(1.0, theme::BORDER))
                            .corner_radius(4.0)
                            .inner_margin(8.0)
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                for (title, lines) in
                                    [("on disk", &disk_lines), ("yours", &mine_lines)]
                                {
                                    ui.label(theme::faint(title).monospace().size(12.5));
                                    for line in lines {
                                        ui.label(
                                            RichText::new(format!("    {}", line.trim()))
                                                .monospace()
                                                .size(12.5)
                                                .color(theme::TEXT),
                                        );
                                    }
                                    if lines.is_empty() {
                                        ui.label(
                                            theme::faint("    (nothing)").monospace().size(12.5),
                                        );
                                    }
                                }
                            });
                    }
                    if conflicts.len() > 1 {
                        ui.add_space(4.0);
                        ui.label(
                            theme::faint(format!(
                                "{} more rows wait behind this one",
                                conflicts.len() - 1
                            ))
                            .size(12.0),
                        );
                    }
                    ui.add_space(10.0);
                    ui.horizontal(|ui| {
                        if widgets::primary(ui, "Keep mine")
                            .on_hover_text("The next save wins")
                            .clicked()
                        {
                            decided = Some(false);
                        }
                        if ui
                            .button("Take disk")
                            .on_hover_text("The edits go")
                            .clicked()
                        {
                            decided = Some(true);
                        }
                        if ui
                            .button(if compare {
                                "Back to the summary"
                            } else {
                                "Open both side by side"
                            })
                            .clicked()
                        {
                            compare = !compare;
                            ctx.data_mut(|d| d.insert_temp(compare_id, compare));
                        }
                    });
                },
            );
            let Some(take) = decided else {
                return Some(ModalDialog::Conflicts(conflicts));
            };
            ctx.data_mut(|d| d.remove_temp::<bool>(compare_id));
            conflicts.remove(0);
            if take {
                if let Some(project) = &mut editor.project {
                    project.take_disk(&conflict);
                }
                editor.views.content_changed();
            }
            (!conflicts.is_empty()).then_some(ModalDialog::Conflicts(conflicts))
        }
        ModalDialog::Rename(dialog) => rename(editor, ctx, dialog),
        ModalDialog::Delete(mut dialog) => {
            let mut outcome = None;
            let mut pressed = DialogKeys::default();
            card(ctx, "delete", 620.0, |ui| {
                pressed = keys(ui);
                ui.horizontal(|ui| {
                    glyph::show(ui, Mark::Cross, 16.0, theme::DANGER);
                    ui.label(
                        RichText::new(format!(
                            "Delete {}/{}",
                            dialog.table,
                            dialog.keys.join(", ")
                        ))
                        .strong()
                        .size(18.0),
                    );
                });
                ui.add_space(4.0);
                rows::delete_body(editor, ui, &mut dialog);
                ui.add_space(8.0);
                let edits: usize = dialog.groups.iter().map(|group| group.usages.len()).sum();
                let ready = dialog.groups.iter().all(|group| match &group.decision {
                    UsageDecision::Undecided => false,
                    UsageDecision::Repoint(key) => !key.is_empty(),
                    UsageDecision::Remove | UsageDecision::Unpack => true,
                });
                ui.horizontal(|ui| {
                    let unpacked: usize = dialog
                        .groups
                        .iter()
                        .filter(|group| group.decision == UsageDecision::Unpack)
                        .map(|group| group.usages.len())
                        .sum();
                    let label = if edits == 0 {
                        "Delete".to_owned()
                    } else if unpacked == edits {
                        format!(
                            "Delete and unpack {edits} placement{}",
                            widgets::plural(edits)
                        )
                    } else {
                        format!("Delete and apply {edits} edit{}", widgets::plural(edits))
                    };
                    ui.add_enabled_ui(ready, |ui| {
                        if widgets::danger(ui, &label).clicked() {
                            outcome = Some(true);
                        }
                    });
                    if ui.button("Cancel").clicked() {
                        outcome = Some(false);
                    }
                });
            });
            if pressed.escape {
                outcome = Some(false);
            }
            match outcome {
                Some(true) => match rows::delete(editor, &dialog) {
                    Ok(()) => None,
                    Err(error) => {
                        dialog.error = Some(error);
                        Some(ModalDialog::Delete(dialog))
                    }
                },
                Some(false) => None,
                None => Some(ModalDialog::Delete(dialog)),
            }
        }
        ModalDialog::NewRow(mut dialog) => {
            let mut outcome = None;
            window(ctx, &format!("New {}", dialog.table), |ui| {
                rows::new_row_body(editor, ui, &mut dialog);
                ui.horizontal(|ui| {
                    if ui.button("Create").clicked() {
                        outcome = Some(true);
                    }
                    if ui.button("Cancel").clicked() {
                        outcome = Some(false);
                    }
                });
            });
            match outcome {
                Some(true) => match rows::create(editor, &dialog) {
                    Ok(()) => None,
                    Err(error) => {
                        dialog.error = Some(error);
                        Some(ModalDialog::NewRow(dialog))
                    }
                },
                Some(false) => None,
                None => Some(ModalDialog::NewRow(dialog)),
            }
        }
        ModalDialog::Binaries => {
            let mut open = true;
            card(ctx, "binaries", 560.0, |ui| {
                if play::binaries_body(editor, ui) || keys(ui).escape {
                    open = false;
                }
            });
            open.then_some(ModalDialog::Binaries)
        }
        ModalDialog::Keys => {
            let mut open = true;
            let mut pressed = DialogKeys::default();
            card(ctx, "keys", 1200.0, |ui| {
                pressed = keys(ui);
                ui.horizontal(|ui| {
                    ui.label(RichText::new("Keys").strong().size(18.0));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Done").clicked() {
                            open = false;
                        }
                    });
                });
                ui.add_space(8.0);
                let columns = key_sheet_columns();
                let tallest = ctx.content_rect().height() * 0.75;
                egui::ScrollArea::vertical()
                    .min_scrolled_height(tallest)
                    .max_height(tallest)
                    .show(ui, |ui| {
                        ui.columns(columns.len(), |uis| {
                            for (ui, scopes) in uis.iter_mut().zip(&columns) {
                                for scope in scopes {
                                    super::widgets::section(ui, scope.title());
                                    egui::Grid::new(("keys", scope.title()))
                                        .num_columns(2)
                                        .spacing([14.0, 4.0])
                                        .show(ui, |ui| {
                                            for key in scope.keys() {
                                                super::widgets::key_chip(ui, key);
                                                ui.label(RichText::new(key.about()).size(13.0));
                                                ui.end_row();
                                            }
                                        });
                                    ui.add_space(10.0);
                                }
                            }
                        });
                    });
            });
            (open && !pressed.escape).then_some(ModalDialog::Keys)
        }
        ModalDialog::MakeBlueprint(dialog) => {
            area::make_blueprint_dialog(editor, ctx, dialog).map(ModalDialog::MakeBlueprint)
        }
        ModalDialog::Resize(dialog) => {
            resize::resize_dialog(editor, ctx, dialog).map(ModalDialog::Resize)
        }
        ModalDialog::DeleteBlueprint(dialog) => {
            area::delete_blueprint_dialog(editor, ctx, dialog).map(ModalDialog::DeleteBlueprint)
        }
        ModalDialog::Arrange(dialog) => {
            world::arrange_dialog(editor, ctx, dialog).map(ModalDialog::Arrange)
        }
        ModalDialog::Import(dialog) => {
            import::dialog(editor, ctx, *dialog).map(|next| ModalDialog::Import(Box::new(next)))
        }
        ModalDialog::MakeShared(dialog) => {
            inspect::make_shared_body(editor, ctx, dialog).map(ModalDialog::MakeShared)
        }
        ModalDialog::MakeInline(dialog) => {
            inspect::make_inline_body(editor, ctx, dialog).map(ModalDialog::MakeInline)
        }
        ModalDialog::RenameNode(dialog) => {
            script::rename_node_dialog(editor, ctx, dialog).map(ModalDialog::RenameNode)
        }
        ModalDialog::LinkNode(dialog) => {
            script::link_node_dialog(editor, ctx, dialog).map(ModalDialog::LinkNode)
        }
        ModalDialog::PickRow(mut dialog) => {
            let mut outcome = None;
            window(ctx, &dialog.title, |ui| {
                let keys: Vec<String> = if dialog.options.is_empty() {
                    editor
                        .project
                        .as_ref()
                        .map(|p| {
                            p.files
                                .paths_under(&format!("tables/{}/", dialog.table))
                                .filter_map(|f| row_of(f).map(|(_, k)| k.to_owned()))
                                .collect()
                        })
                        .unwrap_or_default()
                } else {
                    dialog.options.clone()
                };
                ui.add(egui::TextEdit::singleline(&mut dialog.search).hint_text("search"));
                let needle = dialog.search.to_lowercase();
                egui::ScrollArea::vertical()
                    .max_height(320.0)
                    .show(ui, |ui| {
                        for key in keys
                            .iter()
                            .filter(|k| needle.is_empty() || k.to_lowercase().contains(&needle))
                        {
                            let picked = dialog.picked.as_deref() == Some(key.as_str());
                            let response = ui.selectable_label(picked, key);
                            if response.clicked() {
                                dialog.picked = Some(key.clone());
                            }
                            if response.double_clicked() {
                                dialog.picked = Some(key.clone());
                                outcome = Some(true);
                            }
                        }
                    });
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(dialog.picked.is_some(), egui::Button::new("Pick"))
                        .clicked()
                    {
                        outcome = Some(true);
                    }
                    if ui.button("Cancel").clicked() {
                        outcome = Some(false);
                    }
                });
            });
            match outcome {
                Some(true) => {
                    let picked = dialog.picked.clone().unwrap_or_default();
                    pick::picked_row(editor, dialog.then, &picked);
                    None
                }
                Some(false) => None,
                None => Some(ModalDialog::PickRow(dialog)),
            }
        }
    }
}

fn confirmed(editor: &mut Editor, action: ConfirmAction) {
    match action {
        ConfirmAction::ReplaceModule {
            table,
            key,
            index,
            module,
        } => {
            if let Some(mut value) = editor.row_value(&table, &key) {
                value["modules"][index] = module;
                let mut edit = ContentEdit::new(format!("Replace module {index} of {table}/{key}"));
                edit.write_json(row_file(&table, &key), &value);
                editor.apply(edit);
            }
        }
        ConfirmAction::RemoveLayer { area, layer } => area::remove_layer(editor, &area, &layer),
        ConfirmAction::DeleteScriptNodes { owner, names } => {
            script::delete_nodes_now(editor, &owner, names)
        }
        ConfirmAction::RestartPlay { start } => play::start(editor, start),
    }
}

fn differing_lines(a: Option<&str>, b: Option<&str>) -> (Vec<String>, Vec<String>) {
    let a: Vec<&str> = a.unwrap_or("").lines().collect();
    let b: Vec<&str> = b.unwrap_or("").lines().collect();
    let only_in = |from: &[&str], other: &[&str]| -> Vec<String> {
        from.iter()
            .filter(|line| !other.contains(line))
            .take(6)
            .map(|line| (*line).to_owned())
            .collect()
    };
    (only_in(&a, &b), only_in(&b, &a))
}

fn key_sheet_columns() -> Vec<Vec<KeyScope>> {
    let mut columns: Vec<(usize, Vec<KeyScope>)> = vec![(0, Vec::new()); KEY_SHEET_COLUMNS];
    for scope in KeyScope::VARIANTS {
        let shortest = columns
            .iter_mut()
            .min_by_key(|(rows, _)| *rows)
            .expect("a column");
        shortest.0 += scope.keys().count() + 1;
        shortest.1.push(*scope);
    }
    columns.into_iter().map(|(_, scopes)| scopes).collect()
}

const KEY_SHEET_COLUMNS: usize = 3;
