use std::collections::HashMap;

use egui::Ui;
use engine::core::content::RowName;

use super::content_list::{self, ContentSource};
use super::{Edge, divide, panel_body, theme, widgets};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::RowSelection;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RightPanelTab {
    #[default]
    Inspector,
    LocalContent,
}

/// Which tab each view's right panel shows, and the selection it last saw, so a pick made in the
/// view brings its Inspector forward.
#[derive(Default)]
pub struct RightPanels {
    tabs: HashMap<String, RightPanelTab>,
    seen: HashMap<String, RowSelection>,
}

/// A view's right panel: the inspector of what is selected inside it and, when the view edits a
/// row, that row's local content beside it. A resizable column on the right of its window.
pub fn inspector(
    editor: &mut Editor,
    ui: &mut Ui,
    id: &str,
    row: Option<RowName>,
    body: impl FnOnce(&mut Editor, &mut Ui),
) {
    let Some(row) = row else {
        column(ui, ("inspector", id), Side::Right, |ui| {
            scrolled(ui, |ui| body(editor, ui))
        });
        return;
    };
    let mut tab = picked_tab(editor, ui, id, &row);
    column(ui, ("inspector", id), Side::Right, |ui| {
        let count = content_list::count(editor, &ContentSource::LocalTo(row.clone()));
        let tabs = [
            (RightPanelTab::Inspector, "Inspector".to_owned()),
            (
                RightPanelTab::LocalContent,
                format!("Local content {count}"),
            ),
        ];
        widgets::tabs(ui, &tabs, &mut tab);
        match tab {
            RightPanelTab::Inspector => scrolled(ui, |ui| body(editor, ui)),
            RightPanelTab::LocalContent => local_list(editor, ui, &row),
        }
    });
    editor.views.right.tabs.insert(id.to_owned(), tab);
}

/// The right panel of a view without an inspector: the local content of the row it edits.
pub fn local_content(editor: &mut Editor, ui: &mut Ui, id: &str, row: RowName) {
    column(ui, ("inspector", id), Side::Right, |ui| {
        let count = content_list::count(editor, &ContentSource::LocalTo(row.clone()));
        let mut tab = RightPanelTab::LocalContent;
        widgets::tabs(ui, &[(tab, format!("Local content {count}"))], &mut tab);
        local_list(editor, ui, &row);
    });
}

/// What an inspector says while nothing inside its view is picked: how to pick something.
pub fn nothing_selected(ui: &mut Ui, call_to_action: &str) {
    ui.add_space(24.0);
    ui.vertical_centered(|ui| {
        ui.label(theme::muted(call_to_action).size(13.0));
    });
}

/// The row a view works on, laid out on the left of its window.
pub fn row(ui: &mut Ui, id: &str, body: impl FnOnce(&mut Ui)) {
    column(ui, ("row", id), Side::Left, |ui| scrolled(ui, body));
}

fn picked_tab(editor: &mut Editor, ui: &Ui, id: &str, row: &RowName) -> RightPanelTab {
    let panels = &mut editor.views.right;
    let mut tab = panels.tabs.get(id).copied().unwrap_or_default();
    let selection = &editor.selection;
    let picked_inside = !selection.parts.is_empty()
        && selection.table == row.table
        && selection.keys.contains(&row.key);
    if panels.seen.get(id) != Some(selection) {
        if picked_inside {
            tab = RightPanelTab::Inspector;
        }
        panels.seen.insert(id.to_owned(), selection.clone());
    }
    let active = super::active_tab(editor).and_then(|tab| tab.row());
    if active.is_some_and(|(table, key)| row.is(&table, &key))
        && ui.input_mut(|i| EditorKey::SwitchPanelTab.consume(i))
    {
        tab = match tab {
            RightPanelTab::Inspector => RightPanelTab::LocalContent,
            RightPanelTab::LocalContent => RightPanelTab::Inspector,
        };
    }
    tab
}

fn local_list(editor: &mut Editor, ui: &mut Ui, row: &RowName) {
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(10, 8))
        .show(ui, |ui| {
            content_list::show(editor, ui, &ContentSource::LocalTo(row.clone()));
        });
}

fn scrolled(ui: &mut Ui, body: impl FnOnce(&mut Ui)) {
    egui::ScrollArea::vertical()
        .id_salt("sidebar")
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Frame::new()
                .inner_margin(egui::Margin::symmetric(10, 8))
                .show(ui, body);
        });
}

enum Side {
    Left,
    Right,
}

fn column(ui: &mut Ui, id: (&str, &str), side: Side, body: impl FnOnce(&mut Ui)) {
    let id = egui::Id::new(("sidebar", id));
    let (panel, divider) = match side {
        Side::Left => (egui::Panel::left(id), Edge::Right),
        Side::Right => (egui::Panel::right(id), Edge::Left),
    };
    let column = panel
        .resizable(true)
        .default_size(360.0)
        .size_range(260.0..=720.0)
        .show_separator_line(false)
        .frame(egui::Frame::new())
        .show(ui, |ui| panel_body(ui, body));
    divide(ui, column.response.rect, divider);
}
