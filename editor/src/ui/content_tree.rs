use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use design_tokens::glyph::Mark;
use egui::{Color32, Ui};
use engine::core::assets::AssetKind;
use engine::core::content::ContentFile;
use engine::core::content::{SETTINGS_FILE, name_of, parent_of, table_of};
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::registry;

use super::browser::{self, BrowserAction, RowMenu};
use super::tree::{self, TreeDrop, TreeRow, TreeSource, TreeState};
use super::{theme, widgets};
use crate::app::{BottomTab, Editor, ModalDialog, PickRowDialog, PickRowThen};
use crate::keymap::EditorKey;
use crate::moves::{file_name, fixed_place};
use crate::picker::Dragged;
use crate::project::Project;
use crate::project::files::{FolderIndex, content_holding};
use crate::rows;
use crate::tabs::EditorTab;
use crate::user::{TreeView, UserFolder};
use design_tokens::controls;

/// The content panel's tree of the game folder, and what it was asked to do.
#[derive(Default)]
pub struct ContentTree {
    pub search: String,
    pub focus_search: bool,
    pub only_unsaved: bool,
    pub only_unused: bool,
    pub tree: TreeState,
    /// The type New made last, which Ctrl N makes again.
    pub last_new: Option<String>,
    /// What Ctrl C copied, which Paste copies into a folder.
    pub copied: Vec<String>,
    /// The file of the tab last revealed, so a tab is revealed once each time it becomes active.
    revealed: Option<String>,
}

/// The folder new things land in: the folder selected in the tree, or the one holding what is
/// selected, or the top of the game folder.
pub fn current_folder(editor: &Editor) -> String {
    let Some(project) = &editor.project else {
        return String::new();
    };
    match editor.content_tree.tree.selected().first() {
        Some(path) if project.files.index().folders.contains(path) => path.clone(),
        Some(path) => parent_of(path).to_owned(),
        None => String::new(),
    }
}

pub fn focus_search(editor: &mut Editor) {
    editor.content_tree.focus_search = true;
}

/// Opens the folders above `path`, selects it and scrolls it into view.
pub fn reveal(editor: &mut Editor, path: &str) {
    editor.content_tree.tree.reveal(path);
}

/// Reveals `path` with its name in an edit box, ready to type over.
pub fn begin_rename(editor: &mut Editor, path: &str) {
    editor.content_tree.tree.begin_rename(path, name_of(path));
}

/// Asks which folder the files at `paths` go into.
pub fn move_to_dialog(editor: &mut Editor, paths: Vec<String>) {
    let Some(project) = &editor.project else {
        return;
    };
    if let Some((path, reason)) = paths
        .iter()
        .find_map(|path| fixed_place(path).map(|reason| (path, reason)))
    {
        editor.toast(format!("{path} stays: {reason}"));
        return;
    }
    let options: Vec<String> = std::iter::once(String::new())
        .chain(project.files.index().folders.iter().cloned())
        .filter(|folder| {
            !paths
                .iter()
                .any(|path| folder == path || folder.starts_with(&format!("{path}/")))
        })
        .collect();
    let title = match paths.as_slice() {
        [one] => format!("Move {} to…", file_name(one)),
        many => format!("Move {} files to…", many.len()),
    };
    editor.dialogs.push(ModalDialog::PickRow(PickRowDialog {
        title,
        table: String::new(),
        search: String::new(),
        picked: None,
        options,
        then: PickRowThen::MoveInto { paths },
    }));
}

/// Asks which type of content file to make in `folder`, among every type a game may add.
pub fn new_of_type_dialog(editor: &mut Editor, folder: String) {
    let registry = registry();
    let options: Vec<String> = editor
        .shapes
        .order
        .iter()
        .filter(|table| !registry.closed(table))
        .cloned()
        .collect();
    editor.dialogs.push(ModalDialog::PickRow(PickRowDialog {
        title: "New content file".to_owned(),
        table: String::new(),
        search: String::new(),
        picked: None,
        options,
        then: PickRowThen::NewFile { folder },
    }));
}

/// Makes a content file of `table` in `folder`, as New ▸ does: no question asked, its name ready
/// to type over.
pub fn new_file(editor: &mut Editor, folder: &str, table: &str) {
    match rows::new_file(editor, folder, table) {
        Ok(path) => {
            editor.content_tree.last_new = Some(table.to_owned());
            editor.toast(format!(
                "Made {path} with the default {table}; Ctrl Z takes it back"
            ));
            begin_rename(editor, &path);
        }
        Err(error) => editor.toast(error),
    }
}

/// The rows the tree lists inside `folder` ("" for the top) as it would show them now, with the
/// search, the chips and the user's Show ▾ applied.
pub fn listed(editor: &Editor, folder: &str) -> Vec<(String, TreeRow)> {
    let Some(project) = &editor.project else {
        return Vec::new();
    };
    let view = editor
        .settings
        .content_trees
        .get(&UserFolder::folder_key(&project.root))
        .cloned()
        .unwrap_or_default();
    let source = GameFolder::new(project, &editor.content_tree, &view);
    source
        .children(folder)
        .into_iter()
        .map(|path| {
            let row = source.row(&path);
            (path, row)
        })
        .collect()
}

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    let Some(project) = &editor.project else {
        return;
    };
    let folder_key = UserFolder::folder_key(&project.root);
    reveal_active_tab(editor);
    let open_first = filters(editor, ui, &folder_key);
    ui.add_space(4.0);
    let Editor {
        project,
        content_tree,
        settings,
        ..
    } = editor;
    let project = project.as_ref().expect("a project");
    let view = settings.content_trees.entry(folder_key).or_default();
    let source = GameFolder::new(project, content_tree, view);
    let first_hit = open_first.then(|| first_file(&source, "")).flatten();
    let mut open = view.open.clone();
    let (response, changed) = egui::ScrollArea::vertical()
        .id_salt("content tree")
        .auto_shrink([false, false])
        .show(ui, |ui| {
            tree::show(
                ui,
                egui::Id::new("content tree"),
                &mut content_tree.tree,
                &source,
                &mut open,
            )
        })
        .inner;
    let hovered = ui.ui_contains_pointer();
    drop(source);
    if changed {
        view.open = open;
        editor.save_settings();
    }
    if let Some(hit) = first_hit {
        open_path(editor, &hit, false);
        reveal(editor, &hit);
    }
    if let Some(selected) = &response.selected
        && let [one] = selected.as_slice()
    {
        open_path(editor, one, false);
    }
    for path in &response.activated {
        open_path(editor, path, true);
    }
    if let Some((paths, drop)) = response.dropped
        && let Err(error) = rows::move_into(editor, &paths, &drop.folder)
    {
        editor.toast(error);
    }
    if let Some((path, name)) = response.renamed
        && name != name_of(&path)
        && let Err(error) = rows::rename(editor, &path, &name)
    {
        editor.toast(error);
    }
    if let Some(action) = response.action {
        act(editor, action);
    }
    if (response.focused || hovered) && !ui.ctx().text_edit_focused() {
        keys(editor, ui);
    }
}

/// What the tree's menus and keys ask for.
enum TreeAction {
    New { folder: String, table: String },
    OtherType(String),
    NewFolder(String),
    NewNote(String),
    ImportMedia(String),
    File(String, BrowserAction),
    ReplaceWith(String),
    MoveTo(Vec<String>),
    Delete(Vec<String>),
    Rename(String),
    ShowInFileManager(String),
    Paste(String),
    OpenAll,
    CloseAll,
    ShowGameFolder,
    MakeFixture(String),
}

fn act(editor: &mut Editor, action: TreeAction) {
    match action {
        TreeAction::New { folder, table } => new_file(editor, &folder, &table),
        TreeAction::OtherType(folder) => new_of_type_dialog(editor, folder),
        TreeAction::NewFolder(parent) => match rows::new_folder(editor, &parent) {
            Ok(path) => begin_rename(editor, &path),
            Err(error) => editor.toast(error),
        },
        TreeAction::NewNote(folder) => match rows::new_note(editor, &folder) {
            Ok(path) => {
                open_path(editor, &path, false);
                begin_rename(editor, &path);
            }
            Err(error) => editor.toast(error),
        },
        TreeAction::ImportMedia(folder) => {
            let Some(sources) = rfd::FileDialog::new()
                .set_title("Import media")
                .add_filter("media", &media_extensions())
                .pick_files()
            else {
                return;
            };
            match rows::import_media(editor, &folder, &sources) {
                Ok(made) => {
                    if let Some(first) = made.first() {
                        reveal(editor, first);
                    }
                    editor.toast(format!(
                        "Imported {} file{} into {}",
                        made.len(),
                        widgets::plural(made.len()),
                        folder_title(&folder)
                    ));
                }
                Err(error) => editor.toast(error),
            }
        }
        TreeAction::File(path, action) => match table_of(&path) {
            Some(table) if content_holding(&path).is_some() => {
                let table = table.to_owned();
                browser::act(editor, &table, &path, action);
            }
            _ => media_act(editor, &path, action),
        },
        TreeAction::ReplaceWith(path) => {
            let Some(source) = rfd::FileDialog::new()
                .set_title(format!("Replace {path} with…"))
                .pick_file()
            else {
                return;
            };
            if let Err(error) = rows::replace_media(editor, &path, &source) {
                editor.toast(error);
            }
        }
        TreeAction::MoveTo(paths) => move_to_dialog(editor, paths),
        TreeAction::Delete(paths) => rows::delete_dialog(editor, paths),
        TreeAction::Rename(path) => match fixed_place(&path) {
            Some(reason) => editor.toast(format!("{path} stays: {reason}")),
            None => begin_rename(editor, &path),
        },
        TreeAction::ShowInFileManager(path) => {
            if let Some(project) = &editor.project {
                let _ = opener::open(project.root.join(&path));
            }
        }
        TreeAction::Paste(folder) => {
            let copied = editor.content_tree.copied.clone();
            let label = format!("Paste {} into {}", copied.len(), folder_title(&folder));
            match rows::copy_into(editor, &copied, &folder, label) {
                Ok(copies) => editor.content_tree.tree.select(copies),
                Err(error) => editor.toast(error),
            }
        }
        TreeAction::OpenAll | TreeAction::CloseAll => {
            let Some(project) = &editor.project else {
                return;
            };
            let open = matches!(action, TreeAction::OpenAll);
            let folders: Vec<String> = project.files.index().folders.iter().cloned().collect();
            let folder_key = UserFolder::folder_key(&project.root);
            editor.content_tree.tree.set_open(folders.clone(), open);
            let view = editor.settings.content_trees.entry(folder_key).or_default();
            view.open = if open {
                folders.into_iter().collect()
            } else {
                BTreeSet::new()
            };
            editor.save_settings();
        }
        TreeAction::ShowGameFolder => {
            if let Some(project) = &editor.project {
                let _ = opener::open(&project.root);
            }
        }
        TreeAction::MakeFixture(path) => {
            if let Err(error) = rows::make_fixture(editor, &path) {
                editor.toast(error);
            }
        }
    }
}

/// What a content file's menu does to media and notes, which have no table.
fn media_act(editor: &mut Editor, path: &str, action: BrowserAction) {
    match action {
        BrowserAction::Open | BrowserAction::OpenTab => open_path(editor, path, true),
        BrowserAction::Usages => {
            open_path(editor, path, false);
            editor.panels.bottom = BottomTab::UsedBy;
        }
        BrowserAction::CopyPath => editor.copy_text(path),
        BrowserAction::Rename => begin_rename(editor, path),
        BrowserAction::Duplicate => {
            let label = format!("Duplicate {path}");
            match rows::copy_into(editor, &[path.to_owned()], parent_of(path), label) {
                Ok(copies) => editor.content_tree.tree.select(copies),
                Err(error) => editor.toast(error),
            }
        }
        BrowserAction::MoveTo => move_to_dialog(editor, vec![path.to_owned()]),
        BrowserAction::Delete => rows::delete_dialog(editor, vec![path.to_owned()]),
        BrowserAction::ShowInTree => reveal(editor, path),
        BrowserAction::OpenTable => {}
    }
}

/// Opens what is at `path` in its tab: a preview while browsing, kept when `keep`.
fn open_path(editor: &mut Editor, path: &str, keep: bool) {
    let Some(project) = &editor.project else {
        return;
    };
    let index = project.files.index();
    let tab = if path == SETTINGS_FILE {
        EditorTab::Game
    } else if index.is_content(path) {
        let table = table_of(path).unwrap_or_default();
        editor.select(crate::project::RowSelection::row(table, path));
        EditorTab::for_row(table, path)
    } else if index.media.contains(path) || index.notes.contains(path) {
        editor.select(crate::project::RowSelection::row("asset", path));
        EditorTab::Asset {
            path: path.to_owned(),
        }
    } else {
        return;
    };
    editor.content_tree.revealed = Some(path.to_owned());
    if keep {
        editor.open_tab(tab);
    } else {
        editor.preview_tab(tab);
    }
}

fn keys(editor: &mut Editor, ui: &mut Ui) {
    let selected = editor.content_tree.tree.selected().to_vec();
    let folder = current_folder(editor);
    let pressed = ui.input_mut(|i| {
        [
            EditorKey::Rename,
            EditorKey::Duplicate,
            EditorKey::Delete,
            EditorKey::CopyPath,
            EditorKey::Copy,
            EditorKey::Paste,
            EditorKey::NewAgain,
            EditorKey::Usages,
        ]
        .into_iter()
        .find(|key| key.consume(i))
    });
    let action = match (pressed, selected.as_slice()) {
        (Some(EditorKey::Rename), [one]) => TreeAction::Rename(one.clone()),
        (Some(EditorKey::Duplicate), [one]) => {
            TreeAction::File(one.clone(), BrowserAction::Duplicate)
        }
        (Some(EditorKey::Usages), [one]) => TreeAction::File(one.clone(), BrowserAction::Usages),
        (Some(EditorKey::CopyPath), [one]) => {
            TreeAction::File(one.clone(), BrowserAction::CopyPath)
        }
        (Some(EditorKey::Delete), many) if !many.is_empty() => TreeAction::Delete(many.to_vec()),
        (Some(EditorKey::Copy), many) if !many.is_empty() => {
            editor.content_tree.copied = many.to_vec();
            editor.toast(format!(
                "Copied {} file{}; Ctrl V copies them into a folder",
                many.len(),
                widgets::plural(many.len())
            ));
            return;
        }
        (Some(EditorKey::Paste), _) if !editor.content_tree.copied.is_empty() => {
            TreeAction::Paste(folder)
        }
        (Some(EditorKey::NewAgain), _) => match editor.content_tree.last_new.clone() {
            Some(table) => TreeAction::New { folder, table },
            None => TreeAction::OtherType(folder),
        },
        _ => return,
    };
    act(editor, action);
}

/// The search field, the unsaved and unused chips, and Show ▾. Answers whether Enter was pressed
/// in the search.
fn filters(editor: &mut Editor, ui: &mut Ui, folder_key: &str) -> bool {
    let tree = &mut editor.content_tree;
    let response = widgets::search_box(
        ui,
        &mut tree.search,
        "Search files and paths",
        Some(EditorKey::Search),
    );
    if std::mem::take(&mut tree.focus_search) {
        response.request_focus();
    }
    let entered = response.lost_focus() && ui.input(|i| EditorKey::Confirm.pressed(i));
    if response.has_focus() && ui.input(|i| EditorKey::Cancel.pressed(i)) {
        tree.search.clear();
    }
    let kinds = kinds(editor);
    let view = editor
        .settings
        .content_trees
        .entry(folder_key.to_owned())
        .or_default();
    let tree = &mut editor.content_tree;
    let mut changed = false;
    ui.horizontal(|ui| {
        if widgets::toggle_chip(ui, "unsaved", tree.only_unsaved).clicked() {
            tree.only_unsaved = !tree.only_unsaved;
        }
        if widgets::toggle_chip(ui, "unused", tree.only_unused).clicked() {
            tree.only_unused = !tree.only_unused;
        }
        changed = show_menu(ui, view, &kinds);
    });
    if changed {
        editor.save_settings();
    }
    entered
}

/// The first file the tree lists inside `folder`, at any depth.
fn first_file(source: &GameFolder, folder: &str) -> Option<String> {
    source.children(folder).into_iter().find_map(|path| {
        if source.is_folder(&path) {
            first_file(source, &path)
        } else {
            Some(path)
        }
    })
}

/// Show ▾: which kinds of file the tree lists, and whether folders with nothing shown stay.
fn show_menu(ui: &mut Ui, view: &mut TreeView, kinds: &[String]) -> bool {
    let shown = kinds
        .iter()
        .filter(|kind| !view.hidden_kinds.contains(*kind))
        .count();
    let label = if shown == kinds.len() {
        "Show".to_owned()
    } else {
        format!("Show {shown} of {}", kinds.len())
    };
    let mut changed = false;
    let button = controls::marked(ui, Mark::ChevronDown, label);
    let menu = egui::Popup::from_toggle_button_response(&button)
        .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside);
    menu.show(|ui| {
        let mut all = shown == kinds.len();
        if ui.checkbox(&mut all, "All").changed() {
            view.hidden_kinds = if all {
                BTreeSet::new()
            } else {
                kinds.iter().cloned().collect()
            };
            changed = true;
        }
        ui.separator();
        egui::ScrollArea::vertical()
            .max_height(360.0)
            .show(ui, |ui| {
                for kind in kinds {
                    let mut on = !view.hidden_kinds.contains(kind);
                    if ui.checkbox(&mut on, kind).changed() {
                        if on {
                            view.hidden_kinds.remove(kind);
                        } else {
                            view.hidden_kinds.insert(kind.clone());
                        }
                        changed = true;
                    }
                }
            });
        ui.separator();
        changed |= ui
            .checkbox(&mut view.hide_empty_folders, "Hide empty folders")
            .changed();
    });
    changed
}

const MEDIA_KIND: &str = "media";
const NOTES_KIND: &str = "notes";

/// Every kind of file Show ▾ offers: every type of content the game can hold, media and notes.
fn kinds(editor: &Editor) -> Vec<String> {
    let registry = registry();
    editor
        .shapes
        .order
        .iter()
        .filter(|table| !registry.closed(table))
        .cloned()
        .chain([MEDIA_KIND.to_owned(), NOTES_KIND.to_owned()])
        .collect()
}

fn media_extensions() -> Vec<&'static str> {
    use strum::VariantArray;
    AssetKind::VARIANTS
        .iter()
        .flat_map(|kind| kind.extensions().iter().copied())
        .collect()
}

fn folder_title(folder: &str) -> &str {
    if folder.is_empty() {
        "the game folder"
    } else {
        folder
    }
}

/// Reveals the file of the active tab, once each time a tab becomes active.
fn reveal_active_tab(editor: &mut Editor) {
    let Some(tab) = super::active_tab(editor) else {
        return;
    };
    let path = match &tab {
        EditorTab::Game => Some(SETTINGS_FILE.to_owned()),
        EditorTab::Asset { path } => Some(path.clone()),
        other => other.row().map(|(_, key)| key),
    };
    let Some(path) = path else {
        return;
    };
    if editor.content_tree.revealed.as_ref() == Some(&path) {
        return;
    }
    editor.content_tree.revealed = Some(path.clone());
    reveal(editor, &path);
}

/// The game folder as the tree shows it.
struct GameFolder<'a> {
    project: &'a Project,
    index: Arc<FolderIndex>,
    /// Fixtures the engine looks for that aren't there, and the folders above them that aren't
    /// either, by the folder they belong in.
    missing: BTreeMap<String, BTreeSet<String>>,
    unsaved: HashSet<String>,
    problems: HashMap<String, String>,
    /// While anything narrows the tree: every row shown, and folders above them.
    shown: Option<HashSet<String>>,
    narrowed: bool,
    filtered: bool,
    copied: bool,
    last_new: Option<String>,
}

impl<'a> GameFolder<'a> {
    fn new(project: &'a Project, tree: &ContentTree, view: &TreeView) -> GameFolder<'a> {
        let index = project.files.index();
        let mut missing: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for fixture in registry().fixture_paths() {
            if index.is_content(fixture) {
                continue;
            }
            let mut child = fixture.to_owned();
            loop {
                let parent = parent_of(&child).to_owned();
                missing.entry(parent.clone()).or_default().insert(child);
                if parent.is_empty() || index.folders.contains(&parent) {
                    break;
                }
                child = parent;
            }
        }
        let mut unsaved = HashSet::new();
        for entry in project.unsaved() {
            let row = row_of(&entry);
            above(&row, &mut |folder| {
                unsaved.insert(folder.to_owned());
            });
            unsaved.insert(row);
        }
        let mut problems: HashMap<String, String> = HashMap::new();
        for error in project.report.iter().flat_map(|report| &report.errors) {
            let row = row_of(&error.file);
            let text = error.problem.to_string();
            above(&row, &mut |folder| {
                problems
                    .entry(folder.to_owned())
                    .or_insert_with(|| format!("a problem inside: {text}"));
            });
            problems.entry(row).or_insert(text);
        }
        for unknown in &index.unknown {
            problems
                .entry(unknown.clone())
                .or_insert_with(|| "the game holds no kind of file by this name".to_owned());
        }
        let needle = tree.search.trim().to_lowercase();
        let narrowed = !needle.is_empty() || tree.only_unsaved || tree.only_unused;
        let filtered = narrowed || !view.hidden_kinds.is_empty() || view.hide_empty_folders;
        let mut folder = GameFolder {
            project,
            index,
            missing,
            unsaved,
            problems,
            shown: None,
            narrowed,
            filtered,
            copied: !tree.copied.is_empty(),
            last_new: tree.last_new.clone(),
        };
        if filtered {
            folder.shown = Some(folder.shown_rows(tree, view, &needle));
        }
        folder
    }

    /// The rows left once the tree is narrowed and its kinds chosen: what passes, the folders
    /// above it, and every other folder unless it is hidden for showing nothing.
    fn shown_rows(&self, tree: &ContentTree, view: &TreeView, needle: &str) -> HashSet<String> {
        let unused = &self.project.unused;
        let mut shown = HashSet::new();
        let mut leaves: Vec<&str> = Vec::new();
        for held in self.index.children.values().chain(self.missing.values()) {
            leaves.extend(
                held.iter()
                    .map(String::as_str)
                    .filter(|path| !self.is_folder(path)),
            );
        }
        for path in leaves {
            let kind = self.kind_of(path);
            let passes = !view.hidden_kinds.contains(kind)
                && (needle.is_empty() || path.to_lowercase().contains(needle))
                && (!tree.only_unsaved || self.unsaved.contains(path))
                && (!tree.only_unused || unused.row(path).is_some() || unused.has_asset(path));
            if passes {
                above(path, &mut |folder| {
                    shown.insert(folder.to_owned());
                });
                shown.insert(path.to_owned());
            }
        }
        if !self.narrowed && !view.hide_empty_folders {
            shown.extend(self.index.folders.iter().cloned());
        }
        shown
    }

    fn is_folder(&self, path: &str) -> bool {
        self.index.folders.contains(path)
            || (self.missing.contains_key(path) && !self.index.is_content(path))
    }

    fn is_missing(&self, path: &str) -> bool {
        self.missing
            .get(parent_of(path))
            .is_some_and(|held| held.contains(path))
            && !self.index.folders.contains(path)
    }

    /// The kind Show ▾ lists a file under: its type, media or notes.
    fn kind_of<'p>(&self, path: &'p str) -> &'p str {
        if self.index.media.contains(path) {
            MEDIA_KIND
        } else if self.index.notes.contains(path) {
            NOTES_KIND
        } else {
            table_of(path).unwrap_or_default()
        }
    }

    fn folder_menu(&self, ui: &mut Ui, folder: &str) -> Option<TreeAction> {
        let mut picked = widgets::submenu(ui, "New", |ui| self.new_menu(ui, folder)).flatten();
        if !folder.is_empty() {
            ui.separator();
            let fixed = fixed_place(folder);
            let rename = ui
                .add_enabled(
                    fixed.is_none(),
                    widgets::shortcut_button("Rename", EditorKey::Rename),
                )
                .on_disabled_hover_text(fixed.unwrap_or_default());
            if rename.clicked() {
                picked = Some(TreeAction::Rename(folder.to_owned()));
            }
            let move_to = ui
                .add_enabled(fixed.is_none(), egui::Button::new("Move to…"))
                .on_disabled_hover_text(fixed.unwrap_or_default());
            if move_to.clicked() {
                picked = Some(TreeAction::MoveTo(vec![folder.to_owned()]));
            }
            if ui.button("Show in the file manager").clicked() {
                picked = Some(TreeAction::ShowInFileManager(folder.to_owned()));
            }
            ui.separator();
            let count = self.index.count_of(folder);
            let delete = ui
                .add_enabled(
                    fixed.is_none(),
                    widgets::shortcut_button(
                        format!(
                            "Delete folder and its {count} file{}",
                            widgets::plural(count)
                        ),
                        EditorKey::Delete,
                    ),
                )
                .on_disabled_hover_text(fixed.unwrap_or_default());
            if delete.clicked() {
                picked = Some(TreeAction::Delete(vec![folder.to_owned()]));
            }
        }
        if picked.is_some() {
            ui.close();
        }
        picked
    }

    /// New ▸: the types the folder already holds first, then any other, a folder, media and a
    /// note.
    fn new_menu(&self, ui: &mut Ui, folder: &str) -> Option<TreeAction> {
        let held: BTreeSet<&str> = self
            .index
            .children_of(folder)
            .filter(|path| self.index.is_content(path))
            .filter_map(table_of)
            .filter(|table| !registry().closed(table))
            .collect();
        let mut picked = None;
        for table in &held {
            let button = if self.last_new.as_deref() == Some(*table) {
                widgets::shortcut_button(*table, EditorKey::NewAgain)
            } else {
                egui::Button::new(*table)
            };
            if ui.add(button).clicked() {
                picked = Some(TreeAction::New {
                    folder: folder.to_owned(),
                    table: (*table).to_owned(),
                });
            }
        }
        if ui.button("Other type…").clicked() {
            picked = Some(TreeAction::OtherType(folder.to_owned()));
        }
        ui.separator();
        if ui.button("New folder").clicked() {
            picked = Some(TreeAction::NewFolder(folder.to_owned()));
        }
        if ui.button("Import media…").clicked() {
            picked = Some(TreeAction::ImportMedia(folder.to_owned()));
        }
        if ui.button("New note").clicked() {
            picked = Some(TreeAction::NewNote(folder.to_owned()));
        }
        if picked.is_some() {
            ui.close();
        }
        picked
    }

    fn media_menu(&self, ui: &mut Ui, path: &str) -> Option<TreeAction> {
        let mut picked = None;
        let file = |action| Some(TreeAction::File(path.to_owned(), action));
        if ui
            .add(widgets::shortcut_button("Open", EditorKey::Confirm))
            .clicked()
        {
            picked = file(BrowserAction::Open);
        }
        if self.index.media.contains(path) && ui.button("Used by").clicked() {
            picked = file(BrowserAction::Usages);
        }
        if ui
            .add(widgets::shortcut_button("Copy path", EditorKey::CopyPath))
            .clicked()
        {
            picked = file(BrowserAction::CopyPath);
        }
        ui.separator();
        if ui
            .add(widgets::shortcut_button("Rename", EditorKey::Rename))
            .clicked()
        {
            picked = Some(TreeAction::Rename(path.to_owned()));
        }
        if ui.button("Move to…").clicked() {
            picked = Some(TreeAction::MoveTo(vec![path.to_owned()]));
        }
        if self.index.media.contains(path) && ui.button("Replace with…").clicked() {
            picked = Some(TreeAction::ReplaceWith(path.to_owned()));
        }
        ui.separator();
        if ui
            .add(widgets::shortcut_button("Delete…", EditorKey::Delete))
            .clicked()
        {
            picked = Some(TreeAction::Delete(vec![path.to_owned()]));
        }
        if picked.is_some() {
            ui.close();
        }
        picked
    }

    fn empty_space_menu(&self, ui: &mut Ui) -> Option<TreeAction> {
        let mut picked = widgets::submenu(ui, "New", |ui| self.new_menu(ui, "")).flatten();
        let paste = ui.add_enabled(
            self.copied,
            widgets::shortcut_button("Paste", EditorKey::Paste),
        );
        if paste.clicked() {
            picked = Some(TreeAction::Paste(String::new()));
        }
        ui.separator();
        if ui.button("Open all").clicked() {
            picked = Some(TreeAction::OpenAll);
        }
        if ui.button("Close all").clicked() {
            picked = Some(TreeAction::CloseAll);
        }
        if ui.button("Show the game folder").clicked() {
            picked = Some(TreeAction::ShowGameFolder);
        }
        if picked.is_some() {
            ui.close();
        }
        picked
    }

    fn many_menu(&self, ui: &mut Ui, paths: &[String]) -> Option<TreeAction> {
        let fixed = paths.iter().find_map(|path| fixed_place(path));
        let mut picked = None;
        let move_to = ui
            .add_enabled(fixed.is_none(), egui::Button::new("Move to…"))
            .on_disabled_hover_text(fixed.unwrap_or_default());
        if move_to.clicked() {
            picked = Some(TreeAction::MoveTo(paths.to_vec()));
        }
        ui.separator();
        let delete = ui
            .add_enabled(
                fixed.is_none(),
                widgets::shortcut_button(
                    format!("Delete {} files…", paths.len()),
                    EditorKey::Delete,
                ),
            )
            .on_disabled_hover_text(fixed.unwrap_or_default());
        if delete.clicked() {
            picked = Some(TreeAction::Delete(paths.to_vec()));
        }
        if picked.is_some() {
            ui.close();
        }
        picked
    }

    /// How many references to what is at `paths`, or inside it, a move rewrites.
    fn references_to(&self, paths: &[String]) -> usize {
        let usages = &self.project.usages;
        usages
            .content()
            .chain(usages.media())
            .filter(|(path, _)| {
                paths
                    .iter()
                    .any(|moved| path == moved || path.starts_with(&format!("{moved}/")))
            })
            .map(|(_, uses)| uses.len())
            .sum()
    }
}

impl TreeSource for GameFolder<'_> {
    type Action = TreeAction;

    fn children(&self, id: &str) -> Vec<String> {
        let mut children: Vec<String> = self
            .index
            .children_of(id)
            .map(str::to_owned)
            .chain(self.missing.get(id).into_iter().flatten().cloned())
            .filter(|path| self.shown.as_ref().is_none_or(|shown| shown.contains(path)))
            .collect::<BTreeSet<String>>()
            .into_iter()
            .collect();
        children.sort_by_cached_key(|path| (!self.is_folder(path), file_name(path).to_lowercase()));
        children
    }

    fn parent(&self, id: &str) -> String {
        parent_of(id).to_owned()
    }

    fn row(&self, id: &str) -> TreeRow {
        let file = file_name(id);
        let name = name_of(id).to_owned();
        let after_name = file.strip_prefix(name.as_str()).unwrap_or_default();
        let mut row = TreeRow {
            problem: self.problems.get(id).cloned(),
            unsaved: self.unsaved.contains(id),
            locked: fixed_place(id).map(str::to_owned),
            ..TreeRow::default()
        };
        if self.is_folder(id) {
            let count = self.index.count_of(id);
            row.folder = true;
            row.name = file.to_owned();
            row.detail = count.to_string();
            row.dim = self.filtered || !self.index.folders.contains(id);
            row.spoken = Some(format!("{file}, folder, {count} files"));
            return row;
        }
        row.name = name;
        if id == SETTINGS_FILE {
            row.icon = Some(Mark::Gear);
            row.suffix = Some((" settings".to_owned(), theme::FAINT));
            row.spoken = Some("the game's settings".to_owned());
        } else if self.is_missing(id) {
            let table = table_of(id).unwrap_or_default();
            row.icon = Some(Mark::Page);
            row.suffix = Some((format!(".{table}"), theme::FAINT));
            row.dim = true;
            row.problem = Some(format!(
                "the engine looks for this {table} here: Make it writes its default"
            ));
            row.spoken = Some(format!("{}, missing {table}", row.name));
        } else if self.index.is_content(id) {
            let table = table_of(id).unwrap_or_default();
            row.icon = Some(Mark::Page);
            row.suffix = Some((format!(".{table}"), theme::ACCENT));
            row.spoken = Some(format!("{}, {table}", row.name));
        } else if self.index.media.contains(id) {
            row.icon = Some(match AssetKind::of(id) {
                Some(AssetKind::Image) => Mark::Grid,
                Some(AssetKind::Audio) => Mark::Note,
                _ => Mark::Page,
            });
            row.suffix = Some((after_name.to_owned(), theme::FAINT));
            row.spoken = Some(format!("{file}, media"));
        } else if self.index.notes.contains(id) {
            row.icon = Some(Mark::Page);
            row.suffix = Some((after_name.to_owned(), theme::FAINT));
            row.spoken = Some(format!("{file}, note"));
        } else {
            row.icon = Some(Mark::Warning);
            row.name = file.to_owned();
        }
        if self.filtered && row.dim {
            row.suffix = row.suffix.map(|(text, _)| (text, Color32::GRAY));
        }
        row
    }

    fn menu(&self, ui: &mut Ui, ids: &[String]) -> Option<TreeAction> {
        match ids {
            [] => self.empty_space_menu(ui),
            [one] if self.is_missing(one) && !self.is_folder(one) => {
                let make = ui.button("Make it").clicked();
                if make {
                    ui.close();
                }
                make.then(|| TreeAction::MakeFixture(one.clone()))
            }
            [one] if self.is_folder(one) => self.folder_menu(ui, one),
            [one] if self.index.is_content(one) => browser::row_menu(ui, &RowMenu::of(one), true)
                .map(|action| TreeAction::File(one.clone(), action)),
            [one] if one == SETTINGS_FILE => {
                let open = ui
                    .add(widgets::shortcut_button("Open", EditorKey::Confirm))
                    .clicked();
                if open {
                    ui.close();
                }
                open.then(|| TreeAction::File(one.clone(), BrowserAction::Open))
            }
            [one] => self.media_menu(ui, one),
            many => self.many_menu(ui, many),
        }
    }

    fn drop_tip(&self, dragged: &[String], drop: &TreeDrop) -> Result<String, String> {
        let into = folder_title(&drop.folder);
        for path in dragged {
            if let Some(reason) = fixed_place(path) {
                return Err(format!("{} stays: {reason}", file_name(path)));
            }
            if drop.folder == *path || drop.folder.starts_with(&format!("{path}/")) {
                return Err(format!("{} can't go inside itself", file_name(path)));
            }
        }
        let moving: Vec<String> = dragged
            .iter()
            .filter(|path| parent_of(path) != drop.folder)
            .cloned()
            .collect();
        if moving.is_empty() {
            return Err(format!("already in {into}"));
        }
        let what = match moving.as_slice() {
            [one] => file_name(one).to_owned(),
            many => format!("{} files", many.len()),
        };
        let references = self.references_to(&moving);
        Ok(match references {
            0 => format!("Move {what} into {into}"),
            count => format!(
                "Move {what} into {into}; the {count} reference{} to {} follow",
                widgets::plural(count),
                if moving.len() == 1 { "it" } else { "them" }
            ),
        })
    }

    fn ordered(&self) -> bool {
        false
    }

    fn rename_tip(&self, id: &str) -> Option<String> {
        let usages = &self.project.usages;
        let inside = format!("{id}/");
        let naming: Vec<&str> = usages
            .content()
            .chain(usages.media())
            .filter(|(path, _)| *path == id || path.starts_with(&inside))
            .flat_map(|(_, uses)| uses.iter())
            .map(|usage| content_holding(&usage.file).unwrap_or(&usage.file))
            .collect();
        let holders: BTreeSet<&str> = naming.iter().copied().collect();
        let place = match holders.iter().next() {
            Some(one) if holders.len() == 1 => crate::tabs::file_title(one).to_owned(),
            _ => format!("{} files", holders.len()),
        };
        let what = if self.is_folder(id) {
            "what is inside"
        } else {
            "this file"
        };
        let keeping = if table_of(id) == Some(BlueprintDef::TABLE) {
            ", keeping their labels"
        } else {
            ""
        };
        (!naming.is_empty()).then(|| {
            format!(
                "{} reference{} in {place} name{} {what} and will follow{keeping}",
                naming.len(),
                widgets::plural(naming.len()),
                if naming.len() == 1 { "s" } else { "" },
            )
        })
    }

    fn narrowed(&self) -> bool {
        self.narrowed
    }

    fn carried(&self, ids: &[String]) -> Option<Dragged> {
        let [one] = ids else {
            return None;
        };
        if self.index.is_content(one) {
            Some(Dragged::Row {
                table: table_of(one)?.to_owned(),
                key: one.clone(),
            })
        } else if self.index.media.contains(one) {
            Some(Dragged::Asset(one.clone()))
        } else {
            None
        }
    }
}

/// The row of the tree a file of the game folder shows as: a bundle for its parts, a folder for
/// its entry, or the file itself.
fn row_of(file: &str) -> String {
    match content_holding(file) {
        Some(path) => path.to_owned(),
        None => file.trim_end_matches('/').to_owned(),
    }
}

/// Visits every folder above `path`, the nearest first, ending with the game folder's top.
fn above(path: &str, visit: &mut dyn FnMut(&str)) {
    let mut folder = parent_of(path);
    while !folder.is_empty() {
        visit(folder);
        folder = parent_of(folder);
    }
}
