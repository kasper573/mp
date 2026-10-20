use std::path::{Path, PathBuf};

use design_tokens::face::TextRole;
use design_tokens::glyph::{self, Mark};
use design_tokens::sheet;
use egui::{Context, RichText, Ui};
use engine::core::content::{ContentFile, SETTINGS_FILE, fields_file, version};
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::player::PlayerDef;
use engine::systems::script::ScriptDef;
use strum::VariantArray;

use super::{content_tree, theme, unused_dialog, widgets};
use crate::app::{
    CloseThen, ConfirmAction, Editor, ModalDialog, NewGameDialog, NewGameSource, PickRowThen,
};
use crate::keymap::{EditorKey, KeyScope};
use crate::project::{ContentEdit, files};
use crate::rows::{self, UsageDecision};
use crate::templates::{self, GameTemplate};
use crate::ui::{self, start};
use crate::views::area::{pick, placement, resize};
use crate::views::script;
use crate::views::world;
use crate::{import, play};

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

fn window(ctx: &Context, title: &str, body: impl FnOnce(&mut Ui)) {
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

pub fn card(ctx: &Context, id: &str, width: f32, body: impl FnOnce(&mut Ui)) {
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
                ui.label(theme::muted(format!(
                    "written into the new {SETTINGS_FILE}"
                )));
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
                        let files = files::content_files(source).unwrap_or_default();
                        ui.label(theme::mono(format!(
                            "{SETTINGS_FILE}   name → {}",
                            dialog.name
                        )));
                        ui.label(theme::mono(format!(
                            "every other file · {}",
                            files.len() - 1
                        )));
                    });
                    ui.vertical(|ui| {
                        widgets::section(ui, "Stays behind");
                        ui.label(theme::muted(
                            "files and folders whose names start with a dot",
                        ));
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
                    ui::request_close(editor, CloseThen::Open(folder));
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
    let areas = template.rows_in(AreaDef::TABLE);
    let players = template.rows_in(PlayerDef::TABLE);
    let scripts = template.rows_in(ScriptDef::TABLE);
    format!(
        "{areas} area{} · {players} player{} · {scripts} script{}",
        widgets::plural(areas),
        widgets::plural(players),
        widgets::plural(scripts)
    )
}

fn template_summary(ui: &mut Ui, editor: &Editor, template: &GameTemplate) {
    ui.vertical(|ui| {
        ui.set_width(560.0);
        widgets::kv(ui, "name", |ui| {
            ui.label(theme::strong(&template.name));
            ui.label(theme::muted(format!("from {SETTINGS_FILE}")));
        });
        widgets::kv_code(ui, "initial spawn", &template.initial_spawn);
        widgets::kv(ui, "holds", |ui| {
            let mut parts: Vec<String> = vec![SETTINGS_FILE.to_owned(), "every fixture".to_owned()];
            for (table, keys) in &template.rows {
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

fn one(editor: &mut Editor, ctx: &Context, dialog: ModalDialog) -> Option<ModalDialog> {
    match dialog {
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
                        let clicked = if confirm.action.destroys() {
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
            let name = conflict.file.clone();
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
        ModalDialog::Delete(mut dialog) => {
            let mut outcome = None;
            let mut pressed = DialogKeys::default();
            card(ctx, "delete", 620.0, |ui| {
                pressed = keys(ui);
                ui.horizontal(|ui| {
                    glyph::show(ui, Mark::Cross, 16.0, theme::DANGER);
                    ui.label(
                        RichText::new(rows::delete_title(&dialog))
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
                    let deleted = dialog.gone.len();
                    let label = if edits == 0 && deleted <= 1 {
                        "Delete".to_owned()
                    } else if edits == 0 {
                        format!("Delete {deleted} files")
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
        ModalDialog::FindUnused(dialog) => unused_dialog::find_unused_dialog(editor, ctx, dialog),
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
        ModalDialog::Resize(dialog) => {
            resize::resize_dialog(editor, ctx, dialog).map(ModalDialog::Resize)
        }
        ModalDialog::Arrange(dialog) => {
            world::arrange_dialog(editor, ctx, dialog).map(ModalDialog::Arrange)
        }
        ModalDialog::Import(dialog) => {
            import::dialog(editor, ctx, *dialog).map(|next| ModalDialog::Import(Box::new(next)))
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
                let mut keys: Vec<String> = if dialog.options.is_empty() {
                    editor
                        .project
                        .as_ref()
                        .map(|p| p.files.paths_of(&dialog.table))
                        .unwrap_or_default()
                } else {
                    dialog.options.clone()
                };
                let editing = dialog.then.editing();
                keys.sort_by_cached_key(|key| {
                    (crate::forms::seen_from(editing, key).0, key.clone())
                });
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
                            let shown = match (key.as_str(), editing) {
                                ("", _) => "the game folder".to_owned(),
                                (key, Some(_)) => crate::forms::seen_from(editing, key).1,
                                (key, None) => key.to_owned(),
                            };
                            let refused = editing
                                .filter(|_| dialog.table == BlueprintDef::TABLE)
                                .zip(editor.project.as_ref())
                                .and_then(|(into, project)| {
                                    placement::holds_itself(&project.files, into, key)
                                });
                            if let Some(reason) = refused {
                                ui.add_enabled(
                                    false,
                                    egui::Button::selectable(false, format!("{shown} · {reason}")),
                                );
                                continue;
                            }
                            let response = ui.selectable_label(picked, shown).on_hover_text(key);
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
                    match dialog.then {
                        PickRowThen::NewFile { folder } => {
                            content_tree::new_file(editor, &folder, &picked)
                        }
                        PickRowThen::MoveNodes {
                            bundle,
                            ids,
                            folders,
                        } => crate::views::area::panel::move_into_picked(
                            editor, &bundle, &ids, &folders, &picked,
                        ),
                        PickRowThen::MoveInto { paths } => {
                            if let Err(error) = rows::move_into(editor, &paths, &picked) {
                                editor.toast(error);
                            }
                        }
                        PickRowThen::AddModule {
                            area,
                            module,
                            field,
                        } => pick::add_picked(editor, &area, module, &field, &picked),
                        PickRowThen::ReplaceBlueprint { area, node } => {
                            placement::replace_with(editor, &area, &node, &picked)
                        }
                    }
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
            if let Some(mut value) = editor.row_value(&key) {
                value["modules"][index] = module;
                let mut edit = ContentEdit::new(format!("Replace module {index} of {table}/{key}"));
                edit.write_json(fields_file(&key), &value);
                editor.apply(edit);
            }
        }
        ConfirmAction::DeleteScriptNodes { script, names } => {
            script::delete_nodes_now(editor, &script, names)
        }
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

pub(super) fn title(ui: &mut Ui, text: &str) {
    ui.label(RichText::new(text).strong().size(18.0));
    ui.add_space(8.0);
}

pub(super) fn error_line(ui: &mut Ui, error: &Option<String>) {
    if let Some(error) = error {
        ui.colored_label(theme::DANGER, error);
    }
}

pub(super) fn answer(outcome: Option<bool>, pressed: &DialogKeys) -> Option<bool> {
    if pressed.escape {
        Some(false)
    } else if pressed.enter {
        Some(true)
    } else {
        outcome
    }
}
