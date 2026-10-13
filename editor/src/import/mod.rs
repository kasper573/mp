pub mod formats;
pub mod model;
mod model_ui;
pub mod records;
pub mod tileset;
mod tileset_ui;

pub use model_ui::{
    ModelReimport, inspect_reimport as inspect_model_reimport, show_reimport as show_model_reimport,
};
pub use records::{ImportRecord, ImportRecords, recorded_lengths};
pub use tileset_ui::{
    TilesetReimport, inspect_reimport as inspect_tileset_reimport,
    show_reimport as show_tileset_reimport,
};

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;

use egui::Context;

use crate::app::{ChannelInbox, Editor, ModalDialog};
use crate::project::ContentEdit;
use crate::tabs::EditorTab;
use crate::ui::{active_tab, dialogs, theme};
use crate::views::model::{ModelPage, ModelStrip};
use crate::views::model::{strip_of, write_strip};
use formats::{AnimationExport, DroppedFiles};

pub const IMPORT_PART: &str = "/import";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ImportTarget {
    Model(String),
    NewModel,
    Tileset(String),
    NewTileset,
    Animation(String),
}

pub struct ImportReading {
    pub id: u64,
    pub target: ImportTarget,
    pub dropped: DroppedFiles,
    pub again: Option<records::DueReimport>,
    receiver: ChannelInbox<Result<AnimationExport, String>>,
}

pub enum ImportDialog {
    Reading(u64),
    Model(Box<model_ui::ModelDialog>),
    Tileset(Box<tileset_ui::TilesetDialog>),
    Animation(Box<tileset_ui::AnimationDialog>),
}

fn is_reading(dialog: &ModalDialog, id: u64) -> bool {
    matches!(dialog, ModalDialog::Import(import) if matches!(**import, ImportDialog::Reading(seen) if seen == id))
}

#[derive(Default)]
pub struct ImportJobs {
    pub reading: Vec<ImportReading>,
    pub script: VecDeque<String>,
    next_id: u64,
}

pub fn dialog(editor: &mut Editor, ctx: &Context, dialog: ImportDialog) -> Option<ImportDialog> {
    match dialog {
        ImportDialog::Reading(id) => {
            let job = editor.jobs.reading.iter().find(|job| job.id == id)?;
            let name = formats::names(&files_of(&job.dropped));
            let mut cancel = false;
            dialogs::card(ctx, "import-reading", 360.0, |ui| {
                ui.label(theme::strong(format!("Reading {name}…")));
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label(theme::muted("decoding the export off the interface thread"));
                });
                ui.add_space(10.0);
                if ui.button("Cancel").clicked() {
                    cancel = true;
                }
            });
            if cancel {
                editor.jobs.reading.retain(|job| job.id != id);
                return None;
            }
            Some(ImportDialog::Reading(id))
        }
        ImportDialog::Model(dialog) => {
            model_ui::dialog(editor, ctx, *dialog).map(|next| ImportDialog::Model(Box::new(next)))
        }
        ImportDialog::Tileset(dialog) => tileset_ui::dialog(editor, ctx, *dialog)
            .map(|next| ImportDialog::Tileset(Box::new(next))),
        ImportDialog::Animation(dialog) => tileset_ui::animation_dialog(editor, ctx, *dialog)
            .map(|next| ImportDialog::Animation(Box::new(next))),
    }
}

pub fn poll(editor: &mut Editor) {
    if editor.project.is_none() {
        return;
    }
    for due in editor.imports.poll() {
        start_again(editor, due);
    }
    let mut done = Vec::new();
    for (index, job) in editor.jobs.reading.iter().enumerate() {
        if let Ok(result) = job.receiver.try_recv() {
            done.push((index, result));
        }
    }
    for (index, result) in done.into_iter().rev() {
        let job = editor.jobs.reading.remove(index);
        match result {
            Ok(export) => land(editor, job, export),
            Err(error) => {
                if let Some(due) = job.again.clone() {
                    if !editor.imports.retry(due) {
                        editor.toast(format!("Could not read {}: {error}", names_of(&job)));
                    }
                } else {
                    editor.dialogs.retain(|dialog| !is_reading(dialog, job.id));
                    editor.toast(format!("Not imported: {error}"));
                }
            }
        }
    }
}

pub fn tick(editor: &mut Editor, ctx: &Context) {
    let dropped: Vec<PathBuf> = ctx.input(|i| {
        i.raw
            .dropped_files
            .iter()
            .map(|file| file.path().to_path_buf())
            .collect()
    });
    if !dropped.is_empty() {
        let busts = match active_tab(editor) {
            Some(EditorTab::Model { key }) => editor
                .views
                .model
                .views
                .get(&key)
                .is_some_and(|view| view.page == ModelPage::Busts),
            _ => false,
        };
        if busts {
            editor.views.model.drops = dropped;
        } else {
            self::dropped(editor, dropped);
        }
    }
    if !ctx.egui_wants_keyboard_input() {
        model_ui::apply_settled(editor);
    }
    scripted(editor);
}

fn scripted(editor: &mut Editor) {
    let Some(step) = editor.jobs.script.front().cloned() else {
        return;
    };
    if !editor.jobs.reading.is_empty() {
        return;
    }
    let (what, arg) = step.split_once(':').unwrap_or((step.as_str(), ""));
    match what {
        "files" => {
            let files = arg
                .split('|')
                .map(|path| match path.starts_with("art/") {
                    true => editor
                        .project
                        .as_ref()
                        .and_then(|project| project.root.parent())
                        .map(|parent| parent.join(path))
                        .unwrap_or_else(|| PathBuf::from(path)),
                    false => PathBuf::from(path),
                })
                .collect();
            editor.jobs.script.pop_front();
            dropped(editor, files);
        }
        "apply" => {
            let Some(index) = editor
                .dialogs
                .iter()
                .position(|dialog| matches!(dialog, ModalDialog::Import(_)))
            else {
                match active_tab(editor) {
                    Some(EditorTab::Model { key })
                        if editor.views.model.reimports.contains_key(&key) =>
                    {
                        editor.jobs.script.pop_front();
                        model_ui::apply_reimport(editor, &key, false);
                    }
                    Some(EditorTab::Tileset { key })
                        if editor.views.tileset.reimports.contains_key(&key) =>
                    {
                        editor.jobs.script.pop_front();
                        tileset_ui::apply_reimport(editor, &key);
                    }
                    _ => {}
                }
                return;
            };
            let ModalDialog::Import(dialog) = editor.dialogs.remove(index) else {
                return;
            };
            editor.jobs.script.pop_front();
            let kept = match *dialog {
                ImportDialog::Model(dialog) => {
                    model_ui::apply_now(editor, *dialog).map(|d| ImportDialog::Model(Box::new(d)))
                }
                ImportDialog::Tileset(dialog) => tileset_ui::apply_now(editor, *dialog)
                    .map(|d| ImportDialog::Tileset(Box::new(d))),
                ImportDialog::Animation(dialog) => tileset_ui::apply_animation_now(editor, *dialog)
                    .map(|d| ImportDialog::Animation(Box::new(d))),
                other => Some(other),
            };
            if let Some(kept) = kept {
                editor
                    .dialogs
                    .insert(index, ModalDialog::Import(Box::new(kept)));
            }
        }
        "retime" => {
            editor.jobs.script.pop_front();
            let Some((path, ms)) = arg.split_once('=') else {
                return;
            };
            let bits: Vec<&str> = path.split('/').collect();
            let (Some(action), Some(direction), Some(frame), Ok(ms)) = (
                bits.first(),
                bits.get(1),
                bits.get(2).and_then(|f| f.parse::<usize>().ok()),
                ms.parse::<u32>(),
            ) else {
                return;
            };
            let Some(EditorTab::Model { key }) = active_tab(editor) else {
                return;
            };
            let Some(row) = editor.row_value("model", &key) else {
                return;
            };
            let Some(strip) = ModelStrip::parse(action, direction) else {
                return;
            };
            let mut frames = strip_of(&row, strip);
            if let Some(target) = frames.get_mut(frame.saturating_sub(1)) {
                target.ms = ms;
            }
            let label = format!("Retime {} of {key}", strip.name());
            write_strip(editor, &key, strip, &frames, ContentEdit::new(label));
        }
        _ => {
            editor.jobs.script.pop_front();
        }
    }
}

pub fn dropped(editor: &mut Editor, files: Vec<PathBuf>) {
    if editor.project.is_none() {
        editor.toast("Open a content folder before importing");
        return;
    }
    let dropped = match formats::sort_out(&files) {
        Ok(dropped) => dropped,
        Err(reason) => {
            editor.toast(format!("Not imported: {reason}"));
            return;
        }
    };
    let target = match active_tab(editor) {
        Some(EditorTab::Model { key }) => ImportTarget::Model(key),
        Some(EditorTab::Tileset { key }) => match dropped {
            DroppedFiles::Png(_) => ImportTarget::Tileset(key),
            _ => ImportTarget::Animation(key),
        },
        _ => match dropped {
            DroppedFiles::Png(_) => ImportTarget::NewTileset,
            _ => ImportTarget::NewModel,
        },
    };
    begin(editor, target, dropped, None);
}

pub fn start_for_model(editor: &mut Editor, key: &str) {
    pick_files(editor, ImportTarget::Model(key.to_owned()));
}

pub fn start_for_tileset(editor: &mut Editor, key: &str) {
    pick_files(editor, ImportTarget::Tileset(key.to_owned()));
}

pub fn start_animation(editor: &mut Editor, key: &str) {
    pick_files(editor, ImportTarget::Animation(key.to_owned()));
}

pub fn start_new_tileset(editor: &mut Editor) {
    pick_files(editor, ImportTarget::NewTileset);
}

fn pick_files(editor: &mut Editor, target: ImportTarget) {
    let title = match &target {
        ImportTarget::Model(key) => format!("Import onto model/{key}"),
        ImportTarget::NewModel => "Import a model".to_owned(),
        ImportTarget::Tileset(key) => format!("Import onto tileset/{key}"),
        ImportTarget::NewTileset => "Import a tileset".to_owned(),
        ImportTarget::Animation(key) => format!("Import an animation onto tileset/{key}"),
    };
    let mut picker = rfd::FileDialog::new()
        .set_title(&title)
        .add_filter("exports", &["png", "json", "gif"]);
    if let Some(dir) = art_dir(editor) {
        picker = picker.set_directory(dir);
    }
    let Some(files) = picker.pick_files() else {
        return;
    };
    match formats::sort_out(&files) {
        Ok(dropped) => begin(editor, target, dropped, None),
        Err(reason) => editor.toast(format!("Not imported: {reason}")),
    }
}

pub fn art_dir(editor: &Editor) -> Option<PathBuf> {
    let root = &editor.project.as_ref()?.root;
    let art = root.parent()?.join("art");
    art.is_dir().then_some(art)
}

pub fn show_path(editor: &Editor, file: &Path) -> String {
    editor
        .project
        .as_ref()
        .and_then(|project| project.root.parent())
        .and_then(|parent| file.strip_prefix(parent).ok())
        .map(|rest| rest.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| formats::name(file))
}

fn begin(
    editor: &mut Editor,
    target: ImportTarget,
    dropped: DroppedFiles,
    again: Option<records::DueReimport>,
) {
    let (sender, receiver) = channel();
    let job_dropped = dropped.clone();
    std::thread::spawn(move || {
        let _ = sender.send(formats::decode(&job_dropped));
    });
    editor.jobs.next_id += 1;
    let id = editor.jobs.next_id;
    let shown = again.is_none();
    editor.jobs.reading.push(ImportReading {
        id,
        target,
        dropped,
        again,
        receiver: ChannelInbox::new(receiver),
    });
    if shown {
        editor
            .dialogs
            .push(ModalDialog::Import(Box::new(ImportDialog::Reading(id))));
    }
}

fn start_again(editor: &mut Editor, due: records::DueReimport) {
    let Some(record) = editor
        .imports
        .record_with(&due.table, &due.key, &due.part)
        .cloned()
    else {
        return;
    };
    let files = record.files();
    let Ok(dropped) = formats::sort_out(&files) else {
        editor.toast(format!(
            "{} changed but no longer reads as an export",
            record.names()
        ));
        return;
    };
    let animation = !due.part.is_empty();
    let target = match (due.table.as_str(), animation) {
        ("model", _) => ImportTarget::Model(due.key.clone()),
        ("tileset", true) => ImportTarget::Animation(due.key.clone()),
        ("tileset", false) => ImportTarget::Tileset(due.key.clone()),
        _ => return,
    };
    if editor.row_value(&due.table, &due.key).is_none() {
        editor.imports.forget(&due.table, &due.key);
        return;
    }
    begin(editor, target, dropped, Some(due));
}

fn land(editor: &mut Editor, job: ImportReading, export: AnimationExport) {
    let next = match &job.target {
        ImportTarget::Model(key) => model_ui::land(editor, key, export, job.again.as_ref()),
        ImportTarget::NewModel => model_ui::land_new(editor, export),
        ImportTarget::Tileset(key) => tileset_ui::land(editor, key, export, job.again.as_ref()),
        ImportTarget::NewTileset => tileset_ui::land_new(editor, export),
        ImportTarget::Animation(key) => {
            tileset_ui::land_animation(editor, key, export, job.again.as_ref())
        }
    };
    let reading = editor
        .dialogs
        .iter()
        .position(|dialog| is_reading(dialog, job.id));
    match (reading, next) {
        (Some(index), Some(next)) => editor.dialogs[index] = ModalDialog::Import(Box::new(next)),
        (Some(index), None) => {
            editor.dialogs.remove(index);
        }
        (None, Some(next)) => editor.dialogs.push(ModalDialog::Import(Box::new(next))),
        (None, None) => {}
    }
}

fn files_of(dropped: &DroppedFiles) -> Vec<PathBuf> {
    match dropped {
        DroppedFiles::Sheet { image, json } => vec![image.clone(), json.clone()],
        DroppedFiles::Png(file) | DroppedFiles::Apng(file) | DroppedFiles::Gif(file) => {
            vec![file.clone()]
        }
        DroppedFiles::Sequence(files) => files.clone(),
    }
}

fn names_of(job: &ImportReading) -> String {
    formats::names(&files_of(&job.dropped))
}
