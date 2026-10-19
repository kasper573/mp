use egui::Ui;
use engine::core::content::RowName;

use super::tree::IconImage;
use super::{move_dialogs, widgets};
use crate::app::{BottomTab, Editor, ModalDialog, RenameDialog, RenameTarget};
use crate::keymap::EditorKey;
use crate::moves::ScopeMoves;
use crate::picker::{self, PictureFrame};
use crate::project::{Project, ProjectFiles, RowSelection};
use crate::tabs::EditorTab;
use crate::usages::ContentUsages;
use crate::{forms, rows, thumbs};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserAction {
    Open,
    OpenTab,
    Duplicate,
    Rename,
    Usages,
    MakeLocal,
    MakeGlobal,
    MoveTo,
    Delete,
}

/// What a row's menu offers: a fixture keeps its key and stays global, a local row can go global
/// or move, and a global row can become local unless its uses are spread over several rows.
pub struct RowMenu {
    fixture: bool,
    local: bool,
    stays_global: Option<String>,
}

impl RowMenu {
    pub fn of(
        files: &ProjectFiles,
        usages: &ContentUsages,
        fixture: bool,
        row: &RowName,
    ) -> RowMenu {
        let moves = ScopeMoves::new(files, usages);
        let local = moves.owner(row).is_some();
        RowMenu {
            fixture,
            local,
            stays_global: (!local)
                .then(|| moves.home(row).err())
                .flatten()
                .map(|reason| move_dialogs::stays_global_text(row, &reason)),
        }
    }
}

/// The menu of what can be done to one row, each with its shortcut; `opening` adds the ways to
/// open it. Answers the one picked.
pub fn row_menu(ui: &mut Ui, menu: &RowMenu, opening: bool) -> Option<BrowserAction> {
    use BrowserAction::*;
    let opens: &[BrowserAction] = if opening { &[Open, OpenTab] } else { &[] };
    let scope: &[BrowserAction] = match (menu.fixture, menu.local) {
        (true, _) => &[],
        (false, true) => &[MakeGlobal, MoveTo],
        (false, false) => &[MakeLocal],
    };
    let groups = [opens, &[Duplicate, Rename, Usages], scope, &[Delete]];
    let mut picked = None;
    let mut drawn = false;
    for group in groups {
        let allowed: Vec<BrowserAction> = group
            .iter()
            .copied()
            .filter(|action| !menu.fixture || action.suits_fixtures())
            .collect();
        if allowed.is_empty() {
            continue;
        }
        if drawn {
            ui.separator();
        }
        drawn = true;
        for action in allowed {
            let refusal = match action {
                MakeLocal => menu.stays_global.as_deref(),
                _ => None,
            };
            let button = match action.key() {
                Some(key) => widgets::shortcut_button(action.label(), key),
                None => egui::Button::new(action.label()),
            };
            let response = ui.add_enabled(refusal.is_none(), button);
            let response = match refusal {
                Some(refusal) => response.on_disabled_hover_text(refusal),
                None => response,
            };
            if response.clicked() {
                picked = Some(action);
                ui.close();
            }
        }
    }
    picked
}

pub fn row_icon(
    ctx: &egui::Context,
    form: &mut forms::FormState,
    project: &Project,
    table: &str,
    key: &str,
    budget: &mut u32,
) -> Option<IconImage> {
    let picture = picker::picture_of(&project.files, table, key)?;
    match picture.frame {
        PictureFrame::Sprite { size, frame } => {
            let thumb = form
                .thumbnails
                .image_within(ctx, &project.files, &picture.path, budget)?;
            let frame = thumbs::sprite_frame(size, frame, &thumb);
            let scale = 18.0 / frame.size.y;
            Some(IconImage {
                texture: thumb.texture.id(),
                uv: frame.uv,
                size: frame.size * scale,
            })
        }
        PictureFrame::Whole => {
            let thumb = form
                .thumbnails
                .icon(ctx, &project.files, &picture.path, budget)?;
            Some(super::assets::icon_image(&thumb))
        }
        PictureFrame::Tile(_) => None,
    }
}

pub fn row_keys(editor: &mut Editor, ui: &mut Ui) {
    let over_browser = ui.ui_contains_pointer();
    let on_row_form = matches!(super::active_tab(editor), Some(EditorTab::Row { .. }));
    if (!over_browser && !on_row_form) || ui.ctx().text_edit_focused() {
        return;
    }
    let selection = editor.selection.clone();
    if selection.keys.len() != 1
        || !selection.parts.is_empty()
        || selection.table.is_empty()
        || selection.is_game()
    {
        return;
    }
    let pressed = ui.input_mut(|i| {
        [
            BrowserAction::Rename,
            BrowserAction::Usages,
            BrowserAction::Duplicate,
            BrowserAction::Delete,
            BrowserAction::OpenTab,
        ]
        .into_iter()
        .find(|action| action.key().is_some_and(|key| key.consume(i)))
    });
    if let Some(action) = pressed {
        act(editor, &selection.table, &selection.keys[0], action);
    }
}

impl BrowserAction {
    fn label(self) -> &'static str {
        match self {
            BrowserAction::Open => "Open",
            BrowserAction::OpenTab => "Open in new tab",
            BrowserAction::Duplicate => "Duplicate",
            BrowserAction::Rename => "Rename key…",
            BrowserAction::Usages => "Show usages",
            BrowserAction::MakeLocal => "Make local…",
            BrowserAction::MakeGlobal => "Make global…",
            BrowserAction::MoveTo => "Move to…",
            BrowserAction::Delete => "Delete…",
        }
    }

    fn key(self) -> Option<EditorKey> {
        match self {
            BrowserAction::Open => Some(EditorKey::Confirm),
            BrowserAction::OpenTab => Some(EditorKey::OpenInNewTab),
            BrowserAction::Duplicate => Some(EditorKey::Duplicate),
            BrowserAction::Rename => Some(EditorKey::Rename),
            BrowserAction::Usages => Some(EditorKey::Usages),
            BrowserAction::Delete => Some(EditorKey::Delete),
            BrowserAction::MakeLocal | BrowserAction::MakeGlobal | BrowserAction::MoveTo => None,
        }
    }

    /// A fixture's key is one every game provides, so it is neither renamed nor deleted.
    fn suits_fixtures(self) -> bool {
        !matches!(self, BrowserAction::Rename | BrowserAction::Delete)
    }
}

/// A held selection key adds to a selection of rows, shown together in one window.
pub fn select_rows(editor: &mut Editor, table: &str, key: &str, toggle: bool, extend: bool) {
    let mut selection = if editor.selection.table == table {
        editor.selection.clone()
    } else {
        RowSelection::rows(table, Vec::new())
    };
    if toggle && selection.keys.contains(&key.to_owned()) {
        selection.keys.retain(|k| k != key);
    } else if extend && let Some(last) = selection.keys.last().cloned() {
        let keys: Vec<String> = editor
            .project
            .as_ref()
            .map(|project| project.files.keys_of(table).map(str::to_owned).collect())
            .unwrap_or_default();
        let (a, b) = (
            keys.iter().position(|k| *k == last).unwrap_or(0),
            keys.iter().position(|k| k == key).unwrap_or(0),
        );
        for k in &keys[a.min(b)..=a.max(b)] {
            if !selection.keys.contains(k) {
                selection.keys.push(k.clone());
            }
        }
    } else if !selection.keys.contains(&key.to_owned()) {
        selection.keys.push(key.to_owned());
    }
    let keys = selection.keys.clone();
    editor.select(selection);
    match keys.as_slice() {
        [] => {}
        [key] => editor.preview_tab(EditorTab::for_row(table, key)),
        _ => editor.preview_tab(EditorTab::Rows {
            table: table.to_owned(),
            keys,
        }),
    }
}

pub fn act(editor: &mut Editor, table: &str, key: &str, action: BrowserAction) {
    match action {
        BrowserAction::Open => editor.preview_row(table, key),
        BrowserAction::OpenTab => editor.open_row(table, key),
        BrowserAction::Rename => {
            if editor.shapes.is_fixture(table, key) {
                editor.toast(format!("{table}/{key} is a fixture and keeps its key"));
            } else {
                editor.dialogs.push(ModalDialog::Rename(RenameDialog {
                    target: RenameTarget::Row {
                        table: table.to_owned(),
                        key: key.to_owned(),
                    },
                    draft: key.to_owned(),
                    local_keys: false,
                    error: None,
                }));
            }
        }
        BrowserAction::Duplicate => rows::duplicate(editor, table, key),
        BrowserAction::Usages => {
            editor.preview_row(table, key);
            editor.panels.bottom = BottomTab::UsedBy;
        }
        BrowserAction::MakeLocal => move_dialogs::make_local(editor, RowName::new(table, key)),
        BrowserAction::MakeGlobal => move_dialogs::make_global(editor, RowName::new(table, key)),
        BrowserAction::MoveTo => move_dialogs::move_to(editor, RowName::new(table, key)),
        BrowserAction::Delete => rows::delete_dialog(editor, table, vec![key.to_owned()]),
    }
}
