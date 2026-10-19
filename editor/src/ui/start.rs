use std::path::{Path, PathBuf};

use egui::{Align, Context, Layout, RichText, Ui};
use engine::core::content::{GAME_FILE, row_of, version};

use super::report::{self, ReportAction};
use super::{theme, widgets};
use crate::app::{CloseThen, Editor, ModalDialog, NewGameDialog, NewGameSource, content_version};
use crate::keymap::EditorKey;
use crate::project::journal::RecoveryJournal;
use crate::templates;
use crate::ui::{self, dialogs};

pub fn show(editor: &mut Editor, root: &mut egui::Ui) {
    let ctx = root.ctx().clone();
    let ctx = &ctx;
    egui::CentralPanel::default()
        .frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(60, 40)))
        .show(root, |ui| {
            ui.horizontal_top(|ui| {
                ui.vertical(|ui| {
                    ui.set_width(560.0);
                    ui.label(RichText::new("Open a game").strong().size(26.0));
                    ui.add_space(24.0);
                    recent_list(editor, ui);
                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if widgets::primary(ui, "Open folder…").clicked() {
                            pick_folder(editor);
                        }
                        if ui.button("+ New game…").clicked() {
                            new_game_dialog(editor, None);
                        }
                    });
                    ui.add_space(24.0);
                    ui.label(
                        theme::faint(format!(
                            "build {} · content version {}",
                            version::build(),
                            content_version()
                        ))
                        .size(12.0),
                    );
                });
                ui.add_space(40.0);
                if let Some((folder, text)) = editor.start.report.clone() {
                    ui.vertical(|ui| {
                        match report::panel(ui, &super::pretty_path(&folder), &text, true) {
                            ReportAction::LoadAgain => editor.open_folder(&folder),
                            ReportAction::Close => {
                                editor.start.report = None;
                                editor.start.watch = None;
                            }
                            ReportAction::None => {}
                        }
                    });
                } else if let Some((folder, reason)) = editor.start.failed.clone() {
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new(format!("{} did not open", super::pretty_path(&folder)))
                                .strong(),
                        );
                        ui.label(theme::muted(reason));
                        if ui.button("Close").clicked() {
                            editor.start.failed = None;
                        }
                    });
                }
            });
        });
    recover_dialog(editor, ctx);
}

fn recent_list(editor: &mut Editor, ui: &mut egui::Ui) {
    let recent = editor.settings.recent.clone();
    if recent.is_empty() {
        ui.label(theme::muted(
            "None yet. Open a content folder, or start a new game.",
        ));
        return;
    }
    if editor
        .start
        .names
        .iter()
        .map(|(folder, _)| folder)
        .ne(recent.iter())
    {
        editor.start.names = recent
            .iter()
            .map(|folder| (folder.clone(), game_name(folder)))
            .collect();
    }
    let names = editor.start.names.clone();
    let mut picks = FolderPicks::default();
    for (folder, name) in &names {
        let path = super::pretty_path(folder);
        let ago = editor.settings.opened_ago(folder);
        let response = ui
            .scope_builder(egui::UiBuilder::new().sense(egui::Sense::click()), |ui| {
                egui::Frame::new()
                    .inner_margin(egui::Margin::symmetric(10, 8))
                    .corner_radius(4.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.horizontal(|ui| {
                            ui.label(theme::strong(name));
                            ui.label(theme::muted(path).monospace().size(12.5));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                ui.menu_button(theme::faint("…"), |ui| {
                                    folder_menu(ui, folder, &mut picks);
                                });
                                ui.label(theme::faint(ago).monospace().size(12.0));
                            });
                        });
                    });
            })
            .response;
        if response.hovered() {
            ui.painter()
                .rect_filled(response.rect, 0.0, design_tokens::ink::gold_wash(0.2));
            ui.input_mut(|i| {
                if EditorKey::Confirm.consume(i) {
                    picks.open = Some(folder.clone());
                }
                if EditorKey::Duplicate.consume(i) {
                    picks.copy = Some(folder.clone());
                }
                if EditorKey::Delete.consume(i) {
                    picks.forget = Some(folder.clone());
                }
            });
        }
        if response.double_clicked() {
            picks.open = Some(folder.clone());
        }
        response.context_menu(|ui| folder_menu(ui, folder, &mut picks));
        let line = ui.cursor().min.y;
        ui.painter().hline(
            ui.max_rect().x_range(),
            line,
            egui::Stroke::new(1.0, theme::BORDER),
        );
    }
    if let Some(folder) = picks.open {
        editor.open_folder(&folder);
    }
    if let Some(folder) = picks.copy {
        new_game_dialog(editor, Some(folder));
    }
    if let Some(folder) = picks.forget {
        editor.settings.forget(&folder);
        editor.save_settings();
    }
}

pub fn game_name(folder: &Path) -> String {
    std::fs::read_to_string(folder.join(GAME_FILE))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|game| game["name"].as_str().map(str::to_owned))
        .unwrap_or_else(|| {
            folder
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
}

fn recover_dialog(editor: &mut Editor, ctx: &Context) {
    let Some((folder, data)) = editor.start.recover.take() else {
        return;
    };
    let mut keep = Some((folder.clone(), data));
    dialogs::card(ctx, "recover", 520.0, |ui| {
        let (folder, data) = keep.as_ref().expect("kept");
        let when = widgets::clock(data.written, false);
        ui.label(
            egui::RichText::new("Recover unsaved work?")
                .strong()
                .size(18.0),
        );
        ui.add_space(6.0);
        ui.label(
            theme::muted(format!(
                "The editor closed at {when} with {} unsaved {} of {}, kept in its journal outside the content folder.",
                data.files.len(),
                if data.files.len() == 1 { "row" } else { "rows" },
                super::pretty_path(folder)
            ))
            .size(13.5),
        );
        ui.add_space(8.0);
        egui::Frame::new()
            .fill(theme::INPUT)
            .stroke(egui::Stroke::new(1.0, theme::BORDER))
            .corner_radius(4.0)
            .inner_margin(10.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                egui::ScrollArea::vertical()
                    .max_height(220.0)
                    .show(ui, |ui| {
                        for file in &data.files {
                            ui.horizontal(|ui| {
                                let name = row_of(&file.path)
                                    .map(|(table, key)| format!("{table}/{key}"))
                                    .unwrap_or_else(|| file.path.clone());
                                ui.add_sized(
                                    egui::vec2(220.0, 18.0),
                                    egui::Label::new(theme::mono(name).size(13.0)),
                                );
                                ui.label(
                                    theme::faint(if file.bytes.is_some() {
                                        "unsaved edits"
                                    } else {
                                        "deleted here"
                                    })
                                    .monospace()
                                    .size(12.0),
                                );
                            });
                        }
                    });
            });
        let same_version = data.content_version == content_version();
        if !same_version {
            ui.add_space(6.0);
            ui.colored_label(
                theme::WARN,
                format!(
                    "Written for content version {}; this editor reads {}. They are set aside.",
                    data.content_version,
                    content_version()
                ),
            );
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            let pressed = dialogs::keys(ui);
            if same_version
                && (widgets::primary(ui, "Recover as unsaved").clicked() || pressed.enter)
            {
                let (folder, data) = keep.take().expect("kept");
                editor.open_now(&folder, data.files);
            }
            if keep.is_some() && (widgets::danger(ui, "Discard").clicked() || pressed.escape) {
                let (folder, _) = keep.take().expect("kept");
                RecoveryJournal::set_aside(&editor.user, &folder);
                editor.open_now(&folder, Vec::new());
            }
        });
    });
    if let Some(kept) = keep
        && editor.project.is_none()
    {
        editor.start.recover = Some(kept);
    }
}

pub fn pick_folder(editor: &mut Editor) {
    let start = editor
        .settings
        .recent
        .first()
        .and_then(|folder| folder.parent().map(Path::to_path_buf));
    let mut dialog = rfd::FileDialog::new().set_title("Open a content folder");
    if let Some(start) = start {
        dialog = dialog.set_directory(start);
    }
    if let Some(folder) = dialog.pick_folder() {
        if editor.has_unsaved() {
            ui::request_close(editor, CloseThen::Open(folder));
        } else {
            editor.open_folder(&folder);
        }
    }
}

pub fn new_game_dialog(editor: &mut Editor, copy: Option<PathBuf>) {
    let base = editor
        .settings
        .recent
        .first()
        .and_then(|folder| folder.parent().map(Path::to_path_buf))
        .or_else(dirs::home_dir)
        .unwrap_or_default();
    let (source, name) = match copy {
        Some(folder) => {
            let name = format!("{} copy", game_name(&folder));
            (NewGameSource::Copy(folder), name)
        }
        None => {
            let key = templates::list()
                .first()
                .map(|template| template.key.clone())
                .unwrap_or_else(|| "new_game".to_owned());
            (NewGameSource::Template(key), "My game".to_owned())
        }
    };
    let folder = base.join(slug(&name)).display().to_string();
    editor.dialogs.push(ModalDialog::NewGame(NewGameDialog {
        source,
        name,
        folder,
        folder_touched: false,
        error: None,
    }));
}

pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_owned();
    if out.is_empty() {
        "game".to_owned()
    } else {
        out
    }
}

#[derive(Default)]
struct FolderPicks {
    open: Option<PathBuf>,
    copy: Option<PathBuf>,
    forget: Option<PathBuf>,
}

fn folder_menu(ui: &mut Ui, folder: &Path, picks: &mut FolderPicks) {
    if ui
        .add(widgets::shortcut_button("Open", EditorKey::Confirm))
        .clicked()
    {
        picks.open = Some(folder.to_path_buf());
        ui.close();
    }
    if ui
        .add(widgets::shortcut_button(
            "+ New game from this…",
            EditorKey::Duplicate,
        ))
        .clicked()
    {
        picks.copy = Some(folder.to_path_buf());
        ui.close();
    }
    if ui.button("Show folder").clicked() {
        let _ = opener::open(folder);
        ui.close();
    }
    ui.separator();
    if ui
        .add(widgets::shortcut_button(
            "Remove from list",
            EditorKey::Delete,
        ))
        .clicked()
    {
        picks.forget = Some(folder.to_path_buf());
        ui.close();
    }
}
