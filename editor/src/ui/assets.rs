use egui::{RichText, Ui};

use super::{theme, widgets};
use crate::app::{Editor, RightTab};
use crate::project::Selection;

#[derive(Default)]
pub struct AssetsState {
    pub search: String,
    pub open: std::collections::HashSet<String>,
}

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    let Some(project) = &editor.project else {
        return;
    };
    let state = &mut editor.views.assets;
    widgets::search_box(ui, &mut state.search, "Search files", None);
    let needle = state.search.to_lowercase();
    let mut folders: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for path in project.files.paths_under("assets/") {
        let relative = path.trim_start_matches("assets/");
        if !needle.is_empty() && !relative.to_lowercase().contains(&needle) {
            continue;
        }
        let folder = relative
            .rsplit_once('/')
            .map(|(folder, _)| folder.to_owned())
            .unwrap_or_default();
        folders.entry(folder).or_default().push(relative.to_owned());
    }
    let total: usize = folders.values().map(Vec::len).sum();
    let mut clicked: Option<String> = None;
    let open = state.open.clone();
    let mut toggle: Option<String> = None;
    egui::ScrollArea::vertical()
        .id_salt("assets")
        .show(ui, |ui| {
            for (folder, files) in &folders {
                let expanded = !needle.is_empty() || open.contains(folder);
                let header = ui.add(
                    egui::Label::new(
                        theme::mono(format!(
                            "{} {}/  {}",
                            if expanded { "▾" } else { "▸" },
                            folder,
                            files.len()
                        ))
                        .color(theme::TEXT),
                    )
                    .sense(egui::Sense::click()),
                );
                if header.clicked() {
                    toggle = Some(folder.clone());
                }
                if !expanded {
                    continue;
                }
                for file in files {
                    let name = file.rsplit('/').next().unwrap_or(file);
                    let selected = editor.selection.table == "asset"
                        && editor.selection.keys.first().map(String::as_str) == Some(file.as_str());
                    let icon = match name
                        .rsplit_once('.')
                        .map(|(_, ext)| ext.to_lowercase())
                        .as_deref()
                    {
                        Some("png") => "▣",
                        Some("wav") | Some("flac") => "♪",
                        Some("ttf") | Some("otf") => "A",
                        _ => "▫",
                    };
                    let response = ui.horizontal(|ui| {
                        ui.add_space(14.0);
                        ui.label(theme::muted(icon));
                        ui.add(
                            egui::Label::new(
                                RichText::new(name)
                                    .monospace()
                                    .size(13.0)
                                    .color(if selected { theme::CODE } else { theme::TEXT }),
                            )
                            .sense(egui::Sense::click()),
                        )
                    });
                    if response.inner.clicked() {
                        clicked = Some(file.clone());
                    }
                }
            }
            if folders.is_empty() {
                ui.label(theme::muted("no files match"));
            }
        });
    if let Some(folder) = toggle {
        let open = &mut editor.views.assets.open;
        if !open.remove(&folder) {
            open.insert(folder);
        }
    }
    if let Some(file) = clicked {
        editor.select(Selection::row("asset", &file));
        editor.panels.right = RightTab::Inspector;
    }
    if !needle.is_empty() {
        editor.status.left.push(format!(
            "{total} files for \"{}\"",
            editor.views.assets.search
        ));
    }
}
