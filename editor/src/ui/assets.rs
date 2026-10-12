use egui::Ui;

use super::tree::{self, TreeIcon, TreeNode, TreeState};
use super::{theme, widgets};
use crate::app::{Editor, RightTab};
use crate::project::Selection;

#[derive(Default)]
pub struct AssetsState {
    pub search: String,
    pub tree: TreeState,
}

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    let Some(project) = &editor.project else {
        return;
    };
    let state = &mut editor.views.assets;
    widgets::search_box(ui, &mut state.search, "Search files", None);
    let needle = state.search.to_lowercase();
    let paths: Vec<&str> = project
        .files
        .paths_under("assets/")
        .map(|path| path.trim_start_matches("assets/"))
        .filter(|path| needle.is_empty() || path.to_lowercase().contains(&needle))
        .collect();
    let total = paths.len();
    let selected = (editor.selection.table == "asset")
        .then(|| editor.selection.keys.first().cloned())
        .flatten();
    let nodes = tree::from_paths(
        paths.iter().copied(),
        &mut |path| {
            let name = path.rsplit('/').next().unwrap_or(path);
            let mut node = TreeNode::leaf(path, name);
            node.selected = selected.as_deref() == Some(path);
            node.unsaved = project.is_unsaved(&format!("assets/{path}"));
            node.icon = TreeIcon::Glyph(glyph(name));
            Some(node)
        },
        &mut |_| {},
    );
    let out = egui::ScrollArea::vertical()
        .id_salt("assets")
        .show(ui, |ui| {
            if nodes.is_empty() {
                ui.label(theme::muted("no files match"));
            }
            tree::show(ui, &mut state.tree, &nodes, !needle.is_empty(), None)
        })
        .inner;
    if let Some((path, _)) = out.clicked {
        editor.select(Selection::row("asset", &path));
        editor.panels.right = RightTab::Inspector;
    }
    if !needle.is_empty() {
        editor.status.left.push(format!(
            "{total} files for \"{}\"",
            editor.views.assets.search
        ));
    }
}

fn glyph(name: &str) -> &'static str {
    match name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_lowercase())
        .as_deref()
    {
        Some("png") => "▣",
        Some("wav") | Some("flac") | Some("ogg") => "♪",
        Some("ttf") | Some("otf") => "A",
        _ => "▫",
    }
}
