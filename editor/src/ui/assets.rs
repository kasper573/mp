use design_tokens::glyph::Mark;
use std::convert::Infallible;

use egui::Ui;
use engine::core::assets::AssetKind;
use engine::core::content::{ASSETS_DIR, asset_file, asset_of};

use super::tree::{self, IconImage, TreeIcon, TreeNode, TreeState};
use super::{theme, widgets};
use crate::app::Editor;
use crate::picker::Dragged;
use crate::project::RowSelection;
use crate::tabs::EditorTab;
use crate::thumbs;

#[derive(Default)]
pub struct AssetsState {
    pub search: String,
    pub tree: TreeState,
}

pub const ICON_DECODES_PER_FRAME: u32 = 4;

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    let Some(project) = &editor.project else {
        return;
    };
    let state = &mut editor.views.assets;
    widgets::search_box(ui, &mut state.search, "Search files", None);
    let needle = state.search.to_lowercase();
    let paths: Vec<&str> = project
        .files
        .paths_under(&format!("{ASSETS_DIR}/"))
        .map(|file| asset_of(file))
        .filter(|path| AssetKind::of(path).is_some())
        .filter(|path| needle.is_empty() || path.to_lowercase().contains(&needle))
        .collect();
    let total = paths.len();
    let selected = (editor.selection.table == "asset")
        .then(|| editor.selection.keys.first().cloned())
        .flatten();
    let nodes: Vec<TreeNode<Infallible>> = tree::from_paths(
        paths.iter().copied(),
        &mut |path| {
            let name = path.rsplit('/').next().unwrap_or(path);
            let mut node = TreeNode::leaf(path, name);
            node.selected = selected.as_deref() == Some(path);
            node.unsaved = project.is_unsaved(&asset_file(path));
            node.drag = Some(Dragged::Asset(path.to_owned()));
            node.icon = match AssetKind::of(path)? {
                AssetKind::Image => TreeIcon::Thumb(path.to_owned()),
                AssetKind::Audio => TreeIcon::Mark(Mark::Note),
                AssetKind::Font => TreeIcon::Mark(Mark::Page),
            };
            Some(node)
        },
        &mut |_| {},
    );
    let mut budget = ICON_DECODES_PER_FRAME;
    let out = egui::ScrollArea::vertical()
        .id_salt("assets")
        .show(ui, |ui| {
            if nodes.is_empty() {
                ui.label(theme::muted("no files match"));
            }
            let Editor {
                project,
                form,
                views,
                ..
            } = editor;
            let files = &project.as_ref().expect("a project").files;
            tree::show(
                ui,
                &mut views.assets.tree,
                &nodes,
                !needle.is_empty(),
                tree::TreeHooks {
                    menu: None,
                    thumbs: Some(&mut |ctx, path| {
                        let thumb = form.thumbnails.icon(ctx, files, path, &mut budget)?;
                        Some(icon_image(&thumb))
                    }),
                },
            )
        })
        .inner;
    if let Some((path, _)) = out.clicked {
        editor.select(RowSelection::row("asset", &path));
        editor.open_tab(EditorTab::Asset { path });
    }
    if !needle.is_empty() {
        editor.status.left.push(format!(
            "{total} files for \"{}\"",
            editor.views.assets.search
        ));
    }
}

pub fn icon_image(thumb: &thumbs::Thumbnail) -> IconImage {
    let [w, h] = thumb.size;
    let scale = (16.0 / h.max(1) as f32).min(16.0 / w.max(1) as f32);
    IconImage {
        texture: thumb.texture.id(),
        uv: egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
        size: egui::vec2(w as f32 * scale, h as f32 * scale),
    }
}
