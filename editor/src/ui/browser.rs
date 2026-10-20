use egui::Ui;

use super::{content_tree, widgets};
use crate::app::{BottomTab, Editor};
use crate::keymap::EditorKey;
use crate::moves::fixed_place;
use crate::picker::{self, PictureFrame};
use crate::project::Project;
use crate::tabs::EditorTab;
use crate::{forms, rows, thumbs};
use engine::core::content::table_of;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserAction {
    Open,
    OpenTab,
    Duplicate,
    Rename,
    MoveTo,
    Usages,
    ShowInTree,
    OpenTable,
    CopyPath,
    Delete,
}

/// What a content file's menu offers: everything, except that a fixture stays where the engine
/// finds it, which the menu says rather than hiding.
pub struct RowMenu {
    table: String,
    fixed: Option<&'static str>,
}

impl RowMenu {
    pub fn of(path: &str) -> RowMenu {
        RowMenu {
            table: table_of(path).unwrap_or_default().to_owned(),
            fixed: fixed_place(path),
        }
    }
}

/// How many icons a list decodes in one frame, so opening a long list never stalls a frame.
pub const ICON_DECODES_PER_FRAME: u32 = 4;

#[derive(Clone, Copy)]
pub struct IconImage {
    pub texture: egui::TextureId,
    pub uv: egui::Rect,
    pub size: egui::Vec2,
}

/// The menu of what can be done to one content file, each with its shortcut. In the content tree
/// it opens the file; elsewhere it shows the file in the tree. Answers the one picked.
pub fn row_menu(ui: &mut Ui, menu: &RowMenu, in_tree: bool) -> Option<BrowserAction> {
    use BrowserAction::*;
    let finding = if in_tree { Open } else { ShowInTree };
    let groups = [
        &[finding, Usages, CopyPath, OpenTable][..],
        &[Rename, Duplicate, MoveTo][..],
        &[Delete][..],
    ];
    let mut picked = None;
    let mut drawn = false;
    for group in groups {
        if group.is_empty() {
            continue;
        }
        if drawn {
            ui.separator();
        }
        drawn = true;
        for &action in group {
            let refusal = menu.fixed.filter(|_| action.moves_the_file());
            let label = action.label(&menu.table);
            let button = match action.key() {
                Some(key) => widgets::shortcut_button(&label, key),
                None => egui::Button::new(label),
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
            Some(icon_image(&thumb))
        }
        PictureFrame::Tile(_) => None,
    }
}

pub fn icon_image(thumb: &thumbs::Thumbnail) -> IconImage {
    let [w, h] = thumb.size;
    let scale = (16.0 / h.max(1) as f32).min(16.0 / w.max(1) as f32);
    IconImage {
        texture: thumb.texture.id(),
        uv: thumbs::FULL_UV,
        size: egui::vec2(w as f32 * scale, h as f32 * scale),
    }
}

/// The shortcuts of a content file's menu, while its tab is the active one.
pub fn row_keys(editor: &mut Editor, ui: &mut Ui) {
    let on_row_form = matches!(super::active_tab(editor), Some(EditorTab::Row { .. }));
    if !on_row_form || ui.ctx().text_edit_focused() {
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
            BrowserAction::CopyPath,
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
    fn label(self, table: &str) -> String {
        match self {
            BrowserAction::Open => "Open".to_owned(),
            BrowserAction::OpenTab => "Open in new tab".to_owned(),
            BrowserAction::Duplicate => "Duplicate".to_owned(),
            BrowserAction::Rename => "Rename".to_owned(),
            BrowserAction::MoveTo => "Move to…".to_owned(),
            BrowserAction::Usages => "Used by".to_owned(),
            BrowserAction::ShowInTree => "Show in the content tree".to_owned(),
            BrowserAction::OpenTable => format!("Open the {table} table"),
            BrowserAction::CopyPath => "Copy path".to_owned(),
            BrowserAction::Delete => "Delete…".to_owned(),
        }
    }

    fn key(self) -> Option<EditorKey> {
        match self {
            BrowserAction::Open => Some(EditorKey::Confirm),
            BrowserAction::OpenTab => Some(EditorKey::OpenInNewTab),
            BrowserAction::Duplicate => Some(EditorKey::Duplicate),
            BrowserAction::Rename => Some(EditorKey::Rename),
            BrowserAction::Usages => Some(EditorKey::Usages),
            BrowserAction::CopyPath => Some(EditorKey::CopyPath),
            BrowserAction::Delete => Some(EditorKey::Delete),
            BrowserAction::ShowInTree | BrowserAction::OpenTable | BrowserAction::MoveTo => None,
        }
    }

    /// Whether the action moves, renames or removes the file, which a fixture refuses.
    fn moves_the_file(self) -> bool {
        matches!(
            self,
            BrowserAction::Rename | BrowserAction::MoveTo | BrowserAction::Delete
        )
    }
}

pub fn act(editor: &mut Editor, table: &str, key: &str, action: BrowserAction) {
    match action {
        BrowserAction::Open => editor.preview_row(table, key),
        BrowserAction::OpenTab => editor.open_row(table, key),
        BrowserAction::Rename => match fixed_place(key) {
            Some(reason) => editor.toast(format!("{key} stays: {reason}")),
            None => content_tree::begin_rename(editor, key),
        },
        BrowserAction::Duplicate => {
            if let Err(error) = rows::duplicate(editor, key) {
                editor.toast(error);
            }
        }
        BrowserAction::Usages => {
            editor.preview_row(table, key);
            editor.panels.bottom = BottomTab::UsedBy;
        }
        BrowserAction::ShowInTree => content_tree::reveal(editor, key),
        BrowserAction::OpenTable => editor.open_tab(EditorTab::Spreadsheet {
            table: table.to_owned(),
        }),
        BrowserAction::CopyPath => editor.copy_text(key),
        BrowserAction::MoveTo => content_tree::move_to_dialog(editor, vec![key.to_owned()]),
        BrowserAction::Delete => rows::delete_dialog(editor, vec![key.to_owned()]),
    }
}
