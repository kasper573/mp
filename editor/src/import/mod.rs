pub mod formats;
pub mod model;
mod model_ui;
pub mod records;
pub mod tileset;
mod tileset_ui;

use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, channel};

use egui::Context;

pub use model_ui::{
    ModelReimport, inspect_reimport as inspect_model_reimport, show_reimport as show_model_reimport,
};
pub use records::{ImportRecord, Imports, recorded_lengths};
pub use tileset_ui::{
    TilesetReimport, inspect_reimport as inspect_tileset_reimport,
    show_reimport as show_tileset_reimport,
};

use crate::app::{Dialog, Editor};
use crate::tabs::Tab;
use crate::ui::theme;
use formats::{Dropped, Export};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Target {
    Model(String),
    NewModel,
    Tileset(String),
    NewTileset,
    Animation(String),
}

pub struct Reading {
    pub id: u64,
    pub target: Target,
    pub dropped: Dropped,
    pub again: Option<records::Due>,
    receiver: Mutex<Receiver<Result<Export, String>>>,
}

pub enum ImportDialog {
    Reading(u64),
    Model(Box<model_ui::ModelDialog>),
    Tileset(Box<tileset_ui::TilesetDialog>),
    Animation(Box<tileset_ui::AnimationDialog>),
}

fn is_reading(dialog: &Dialog, id: u64) -> bool {
    matches!(dialog, Dialog::Import(import) if matches!(**import, ImportDialog::Reading(seen) if seen == id))
}

#[derive(Default)]
pub struct Jobs {
    pub reading: Vec<Reading>,
    pub script: std::collections::VecDeque<String>,
    next_id: u64,
}

pub fn dialog(editor: &mut Editor, ctx: &Context, dialog: ImportDialog) -> Option<ImportDialog> {
    match dialog {
        ImportDialog::Reading(id) => {
            let job = editor.jobs.reading.iter().find(|job| job.id == id)?;
            let name = formats::names(&files_of(&job.dropped));
            let mut cancel = false;
            crate::ui::dialogs::card(ctx, "import-reading", 360.0, |ui| {
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
        let received = job
            .receiver
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .try_recv();
        if let Ok(result) = received {
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
            Some(Tab::Model { key }) => editor
                .views
                .model
                .views
                .get(&key)
                .is_some_and(|view| view.page == crate::views::model::Page::Busts),
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
                .position(|dialog| matches!(dialog, Dialog::Import(_)))
            else {
                match active_tab(editor) {
                    Some(Tab::Model { key }) if editor.views.model.reimports.contains_key(&key) => {
                        editor.jobs.script.pop_front();
                        model_ui::apply_reimport(editor, &key, false);
                    }
                    Some(Tab::Tileset { key })
                        if editor.views.tileset.reimports.contains_key(&key) =>
                    {
                        editor.jobs.script.pop_front();
                        tileset_ui::apply_reimport(editor, &key);
                    }
                    _ => {}
                }
                return;
            };
            let Dialog::Import(dialog) = editor.dialogs.remove(index) else {
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
                editor.dialogs.insert(index, Dialog::Import(Box::new(kept)));
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
            let Some(Tab::Model { key }) = active_tab(editor) else {
                return;
            };
            let Some(row) = editor.row_value("model", &key) else {
                return;
            };
            let mut frames = crate::views::model::strip_of(&row, action, direction);
            if let Some(target) = frames.get_mut(frame.saturating_sub(1)) {
                target.ms = ms;
            }
            crate::views::model::write_strip(
                editor,
                &key,
                action,
                direction,
                &frames,
                format!("Retime {action} · {direction} of {key}"),
                false,
            );
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
        Some(Tab::Model { key }) => Target::Model(key),
        Some(Tab::Tileset { key }) => match dropped {
            Dropped::Png(_) => Target::Tileset(key),
            _ => Target::Animation(key),
        },
        _ => match dropped {
            Dropped::Png(_) => Target::NewTileset,
            _ => Target::NewModel,
        },
    };
    begin(editor, target, dropped, None);
}

pub fn start_for_model(editor: &mut Editor, key: &str) {
    pick_files(editor, Target::Model(key.to_owned()));
}

pub fn start_for_tileset(editor: &mut Editor, key: &str) {
    pick_files(editor, Target::Tileset(key.to_owned()));
}

pub fn start_animation(editor: &mut Editor, key: &str) {
    pick_files(editor, Target::Animation(key.to_owned()));
}

pub fn start_new_tileset(editor: &mut Editor) {
    pick_files(editor, Target::NewTileset);
}

fn pick_files(editor: &mut Editor, target: Target) {
    let title = match &target {
        Target::Model(key) => format!("Import onto model/{key}"),
        Target::NewModel => "Import a model".to_owned(),
        Target::Tileset(key) => format!("Import onto tileset/{key}"),
        Target::NewTileset => "Import a tileset".to_owned(),
        Target::Animation(key) => format!("Import an animation onto tileset/{key}"),
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

pub fn show_path(editor: &Editor, file: &std::path::Path) -> String {
    editor
        .project
        .as_ref()
        .and_then(|project| project.root.parent())
        .and_then(|parent| file.strip_prefix(parent).ok())
        .map(|rest| rest.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| formats::name(file))
}

fn begin(editor: &mut Editor, target: Target, dropped: Dropped, again: Option<records::Due>) {
    let (sender, receiver) = channel();
    let job_dropped = dropped.clone();
    std::thread::spawn(move || {
        let _ = sender.send(formats::decode(&job_dropped));
    });
    editor.jobs.next_id += 1;
    let id = editor.jobs.next_id;
    let shown = again.is_none();
    editor.jobs.reading.push(Reading {
        id,
        target,
        dropped,
        again,
        receiver: Mutex::new(receiver),
    });
    if shown {
        editor
            .dialogs
            .push(Dialog::Import(Box::new(ImportDialog::Reading(id))));
    }
}

fn start_again(editor: &mut Editor, due: records::Due) {
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
        ("model", _) => Target::Model(due.key.clone()),
        ("tileset", true) => Target::Animation(due.key.clone()),
        ("tileset", false) => Target::Tileset(due.key.clone()),
        _ => return,
    };
    if editor.row_value(&due.table, &due.key).is_none() {
        editor.imports.forget(&due.table, &due.key);
        return;
    }
    begin(editor, target, dropped, Some(due));
}

fn land(editor: &mut Editor, job: Reading, export: Export) {
    let mut next = match &job.target {
        Target::Model(key) => model_ui::land(editor, key, export, job.again.as_ref()),
        Target::NewModel => model_ui::land_new(editor, export),
        Target::Tileset(key) => tileset_ui::land(editor, key, export, job.again.as_ref()),
        Target::NewTileset => tileset_ui::land_new(editor, export),
        Target::Animation(key) => {
            tileset_ui::land_animation(editor, key, export, job.again.as_ref())
        }
    };
    let mut replaced = false;
    for dialog in &mut editor.dialogs {
        if is_reading(dialog, job.id) {
            if let Some(next) = next.take() {
                *dialog = Dialog::Import(Box::new(next));
            }
            replaced = true;
        }
    }
    if replaced {
        editor.dialogs.retain(|dialog| !is_reading(dialog, job.id));
    } else if let Some(next) = next {
        editor.dialogs.push(Dialog::Import(Box::new(next)));
    }
}

fn files_of(dropped: &Dropped) -> Vec<PathBuf> {
    match dropped {
        Dropped::Sheet { image, json } => vec![image.clone(), json.clone()],
        Dropped::Png(file) | Dropped::Apng(file) | Dropped::Gif(file) => vec![file.clone()],
        Dropped::Sequence(files) => files.clone(),
    }
}

fn names_of(job: &Reading) -> String {
    formats::names(&files_of(&job.dropped))
}

fn active_tab(editor: &Editor) -> Option<Tab> {
    crate::ui::active_tab(editor)
}
