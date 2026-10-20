use egui::Context;
use engine::core::content::RowFolder;

use super::dialogs::{DialogKeys, card, keys};
use super::move_dialogs::{answer, error_line, title};
use super::{content_list, theme, widgets};
use crate::app::{Editor, ModalDialog, NewFolderDialog, RenameDialog, RenameTarget};
use crate::folders;
use crate::project::ContentEdit;

pub fn new_folder(editor: &mut Editor, table: String, parent: Option<RowFolder>) {
    editor.dialogs.push(ModalDialog::NewFolder(NewFolderDialog {
        table,
        parent,
        draft: String::new(),
        error: None,
    }));
}

pub fn rename_folder(editor: &mut Editor, table: String, folder: RowFolder) {
    editor.dialogs.push(ModalDialog::Rename(RenameDialog {
        draft: folder.name().to_owned(),
        target: RenameTarget::Folder { table, folder },
        local_keys: false,
        error: None,
    }));
}

/// Removes a folder of `table`: what it held moves up into the folder holding it, in one undo
/// step.
pub fn remove_folder(editor: &mut Editor, table: &str, folder: &RowFolder) {
    let Some(project) = &editor.project else {
        return;
    };
    let label = format!("Remove folder {folder} from {table}");
    let mut edit = ContentEdit::new(label.clone());
    folders::remove(&mut edit, &project.files, table, folder);
    if !edit.changes.is_empty()
        && let Err(error) = editor.try_apply(edit)
    {
        editor.toast(error);
        return;
    }
    let parent = folder.parent();
    regroup_kept(editor, table, folder, |rest| match (&parent, rest) {
        (Some(parent), Some(rest)) => parent.join(rest).ok(),
        (None, Some(rest)) => RowFolder::try_from(rest.to_owned()).ok(),
        (_, None) => None,
    });
    editor.toast(label);
}

pub fn new_folder_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: NewFolderDialog,
) -> Option<ModalDialog> {
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    let place = match &dialog.parent {
        Some(parent) => format!("{} › {parent}", dialog.table),
        None => dialog.table.clone(),
    };
    card(ctx, "new-folder", 480.0, |ui| {
        pressed = keys(ui);
        title(ui, &format!("New folder in {place}"));
        let response = ui.add(
            egui::TextEdit::singleline(&mut dialog.draft)
                .hint_text("folder name")
                .desired_width(f32::INFINITY)
                .font(egui::TextStyle::Monospace),
        );
        widgets::default_focus(ui, &response);
        ui.add_space(6.0);
        ui.label(theme::muted(format!(
            "Drag {} rows onto it to list them there. Folders only sort the list: keys and files \
             stay as they are.",
            dialog.table
        )));
        error_line(ui, &dialog.error);
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Create folder").clicked() {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() {
                outcome = Some(false);
            }
        });
    });
    match answer(outcome, &pressed) {
        Some(true) => match create(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(ModalDialog::NewFolder(dialog))
            }
        },
        Some(false) => None,
        None => Some(ModalDialog::NewFolder(dialog)),
    }
}

/// Renames `folder` of `table` to `name`, inside the folder holding it, with the rows and folders
/// in it, in one undo step.
pub fn rename(
    editor: &mut Editor,
    table: &str,
    folder: &RowFolder,
    name: &str,
) -> Result<(), String> {
    let to = named(folder.parent().as_ref(), name)?;
    if to == *folder {
        return Ok(());
    }
    if exists(editor, table, &to) {
        return Err(format!("{table} already has a folder {to}"));
    }
    let project = editor.project.as_ref().ok_or("no folder is open")?;
    let label = format!("Rename folder {folder} of {table} to {to}");
    let mut edit = ContentEdit::new(label.clone());
    folders::rename(&mut edit, &project.files, table, folder, &to);
    if !edit.changes.is_empty() {
        editor.try_apply(edit)?;
    }
    regroup_kept(editor, table, folder, |rest| match rest {
        Some(rest) => to.join(rest).ok(),
        None => Some(to.clone()),
    });
    editor.toast(label);
    Ok(())
}

fn create(editor: &mut Editor, dialog: &NewFolderDialog) -> Result<(), String> {
    let folder = named(dialog.parent.as_ref(), dialog.draft.trim())?;
    if exists(editor, &dialog.table, &folder) {
        return Err(format!("{} already has a folder {folder}", dialog.table));
    }
    let root = project_key(editor).ok_or("no folder is open")?;
    editor
        .settings
        .folders
        .entry(root)
        .or_default()
        .insert(format!("{}/{folder}", dialog.table));
    for folds in editor.settings.content_folds.values_mut() {
        folds.tables.insert(dialog.table.clone());
        let mut at = folder.parent();
        while let Some(parent) = at {
            folds
                .tables
                .insert(content_list::folder_id(&dialog.table, &parent));
            at = parent.parent();
        }
    }
    editor.save_settings();
    Ok(())
}

fn named(parent: Option<&RowFolder>, name: &str) -> Result<RowFolder, String> {
    if name.contains('/') {
        return Err("a folder's name has no /; make a folder inside it instead".to_owned());
    }
    match parent {
        Some(parent) => parent.join(name),
        None => RowFolder::try_from(name.to_owned()),
    }
}

fn exists(editor: &Editor, table: &str, folder: &RowFolder) -> bool {
    let Some(project) = &editor.project else {
        return false;
    };
    let kept = format!("{table}/{folder}");
    folders::folders_of(&project.files, table).contains(folder)
        || project_key(editor).is_some_and(|root| {
            editor
                .settings
                .folders
                .get(&root)
                .is_some_and(|folders| folders.contains(&kept))
        })
}

fn project_key(editor: &Editor) -> Option<String> {
    Some(editor.project.as_ref()?.root.display().to_string())
}

/// Moves the folders kept empty in this project, and which folders are unfolded, from `folder` of
/// `table` where `moved` says, given the rest of their path below it; `None` forgets one.
fn regroup_kept(
    editor: &mut Editor,
    table: &str,
    folder: &RowFolder,
    moved: impl Fn(Option<&str>) -> Option<RowFolder>,
) {
    for folds in editor.settings.content_folds.values_mut() {
        let unfolded: Vec<RowFolder> = folds
            .tables
            .iter()
            .filter_map(|id| content_list::folder_of_id(id))
            .filter(|(of, _)| *of == table)
            .map(|(_, unfolded)| unfolded)
            .filter(|unfolded| unfolded == folder || below(unfolded, folder).is_some())
            .collect();
        for unfolded in unfolded {
            folds
                .tables
                .remove(&content_list::folder_id(table, &unfolded));
            if let Some(to) = moved(below(&unfolded, folder)) {
                folds.tables.insert(content_list::folder_id(table, &to));
            }
        }
    }
    if let Some(root) = project_key(editor)
        && let Some(kept) = editor.settings.folders.get_mut(&root)
    {
        let own = format!("{table}/{folder}");
        let inside = format!("{own}/");
        let affected: Vec<String> = kept
            .iter()
            .filter(|entry| **entry == own || entry.starts_with(&inside))
            .cloned()
            .collect();
        for entry in affected {
            kept.remove(&entry);
            if let Some(to) = moved(entry.strip_prefix(&inside)) {
                kept.insert(format!("{table}/{to}"));
            }
        }
    }
    editor.save_settings();
}

/// The rest of `inner`'s path below `outer`, when `outer` holds it.
fn below<'a>(inner: &'a RowFolder, outer: &RowFolder) -> Option<&'a str> {
    inner
        .as_str()
        .strip_prefix(outer.as_str())?
        .strip_prefix('/')
}
