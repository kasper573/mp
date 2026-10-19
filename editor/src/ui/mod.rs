pub mod assets;
pub mod browser;
pub mod dialogs;
pub mod history;
pub mod output;
pub mod patterns;
pub mod report;
pub mod row_form;
pub mod sidebar;
pub mod start;
pub mod theme;
pub mod tree;
pub mod widgets;

use std::mem;
use std::path::Path;
use std::time::Duration;

use design_tokens::controls::{self, Pill};
use design_tokens::face::TextRole;
use design_tokens::{face, ink, sheet, slip};
use egui::{Align, Context, Layout};
use egui_dock::{DockArea, DockState, TabViewer};

use crate::app::{BottomTab, CloseDialog, CloseThen, Editor, LeftTab, ModalDialog};
use crate::keymap::EditorKey;
use crate::project::{self, EditRefusal, RowSelection};
use crate::tabs::{CloseTabs, EditorTab};
use crate::views::script::ScriptKeys;
use crate::views::{area, character, class, model, script, spreadsheet, tileset, vfx, world};
use crate::{import, play, views};
use engine::core::content::{LoadReport, row_file};

pub fn show(editor: &mut Editor, ctx: &Context) {
    editor.status.right.clear();
    shortcuts(editor, ctx);
    play::status(editor);
    let mut root = egui::Ui::new(
        ctx.clone(),
        "viewport".into(),
        egui::UiBuilder::new()
            .layer_id(egui::LayerId::background())
            .max_rect(ctx.viewport_rect()),
    );
    sheet::vellum(root.painter(), ctx.viewport_rect());
    top_bar(editor, &mut root);
    for tab in mem::take(&mut editor.open_tabs) {
        focus_tab(&mut editor.dock, tab);
    }
    if editor.project.is_some() {
        workspace(editor, &mut root);
        report::not_loaded(editor, ctx);
        import::tick(editor, ctx);
    } else {
        start::show(editor, &mut root);
    }
    dialogs::show(editor, ctx);
    toast(editor, ctx);
    if ctx.input(|i| i.viewport().close_requested()) && !editor.quit {
        if editor.has_unsaved() {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            editor.dialogs.push(ModalDialog::Close(CloseDialog {
                then: CloseThen::Quit,
            }));
        } else {
            editor.close_project();
            editor.quit = true;
        }
    }
}

pub fn panel_body(ui: &mut egui::Ui, body: impl FnOnce(&mut egui::Ui)) {
    let rect = ui.available_rect_before_wrap();
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    child.set_clip_rect(rect.intersect(ui.clip_rect()));
    body(&mut child);
    ui.allocate_rect(rect, egui::Sense::hover());
}

pub fn focus_tab(dock: &mut DockState<EditorTab>, tab: EditorTab) {
    if let EditorTab::Rows { table, .. } = &tab {
        let replaced = dock
            .iter_all_tabs_mut()
            .map(|(_, existing)| existing)
            .find(|existing| matches!(existing, EditorTab::Rows { table: t, .. } if t == table))
            .map(|existing| {
                *existing = tab.clone();
            })
            .is_some();
        if replaced {
            if let Some(path) = dock.find_tab(&tab) {
                let _ = dock.set_active_tab(path);
            }
            return;
        }
    }
    if let Some(path) = dock.find_tab(&tab) {
        let _ = dock.set_active_tab(path);
        return;
    }
    if dock.iter_all_tabs().next().is_none() {
        *dock = DockState::new(vec![tab]);
        return;
    }
    if dock.focused_leaf().is_none() {
        let first = dock
            .main_surface()
            .iter()
            .enumerate()
            .find(|(_, node)| node.is_leaf())
            .map(|(index, _)| egui_dock::NodeIndex(index));
        if let Some(index) = first {
            dock.main_surface_mut().set_focused_node(index);
        }
    }
    dock.push_to_focused_leaf(tab);
}

pub fn active_tab(editor: &Editor) -> Option<EditorTab> {
    editor
        .dock
        .focused_leaf()
        .and_then(|path| editor.dock.leaf(path).ok())
        .and_then(|leaf| leaf.tabs().get(leaf.active.0).cloned())
        .or_else(|| {
            editor
                .dock
                .iter_leaves()
                .next()
                .and_then(|(_, leaf)| leaf.tabs.get(leaf.active.0).cloned())
        })
}

fn shortcuts(editor: &mut Editor, ctx: &Context) {
    if ctx.text_edit_focused() {
        return;
    }
    let script_tab = matches!(active_tab(editor), Some(EditorTab::Script(_)));
    let script_hovered = editor
        .views
        .script
        .shown_rect
        .zip(ctx.pointer_hover_pos())
        .is_some_and(|(rect, pos)| rect.contains(pos));
    if (script_tab || script_hovered) && editor.dialogs.is_empty() {
        editor.views.script.keys = ScriptKeys::take(ctx);
    }
    let (save, undo, redo, search, quit, close) = ctx.input_mut(|i| {
        (
            EditorKey::Save.consume(i),
            EditorKey::Undo.consume(i),
            EditorKey::Redo.consume(i),
            EditorKey::Search.consume(i),
            EditorKey::Quit.consume(i),
            EditorKey::CloseTab.consume(i),
        )
    });
    if save {
        editor.save();
    }
    if redo {
        editor.redo();
    } else if undo {
        editor.undo();
    }
    if search {
        editor.panels.left = LeftTab::Content;
        browser::focus_search(editor);
    }
    if quit {
        request_close(editor, CloseThen::Quit);
    }
    if close
        && let Some(path) = editor.dock.focused_leaf()
        && let Ok(leaf) = editor.dock.leaf(path)
        && leaf.tabs().get(leaf.active.0).is_some()
    {
        editor
            .dock
            .remove_tab(egui_dock::TabPath::from((path, leaf.active)));
    }
    if ctx.input_mut(|i| EditorKey::KeySheet.consume(i))
        && !editor
            .dialogs
            .iter()
            .any(|dialog| matches!(dialog, ModalDialog::Keys))
    {
        editor.dialogs.push(ModalDialog::Keys);
    }
    let (play_from_start, stop, play_here, played) = ctx.input_mut(|i| {
        (
            EditorKey::PlayFromStart.consume(i),
            EditorKey::StopPlay.consume(i),
            EditorKey::PlayHere.consume(i),
            EditorKey::PlayedCharacter.consume(i),
        )
    });
    if play_from_start {
        play::start(editor, None);
    }
    if stop {
        play::stop(editor);
    }
    if play_here {
        views::play_here(editor);
    }
    if played && let Some(key) = play::current_character(editor) {
        editor.select(RowSelection::row("test_character", &key));
        editor.open_tab(EditorTab::for_row("test_character", &key));
    }
    if editor.play.running.is_some() {
        ctx.request_repaint_after(Duration::from_millis(100));
    }
}

pub fn request_close(editor: &mut Editor, then: CloseThen) {
    if editor.has_unsaved() {
        editor
            .dialogs
            .push(ModalDialog::Close(CloseDialog { then }));
    } else {
        finish_close(editor, then);
    }
}

pub fn finish_close(editor: &mut Editor, then: CloseThen) {
    match then {
        CloseThen::Quit => {
            editor.close_project();
            editor.quit = true;
        }
        CloseThen::Close => editor.close_project(),
        CloseThen::Open(folder) => editor.open_folder(&folder),
    }
}

fn top_bar(editor: &mut Editor, root: &mut egui::Ui) {
    let bar = egui::Panel::top("top")
        .exact_size(TOP_BAR_HEIGHT)
        .show_separator_line(false)
        .frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(12, 0)))
        .show(root, |ui| {
            ui.horizontal_centered(|ui| {
                ui.menu_button(face::bold("File"), |ui| {
                    let has_project = editor.project.is_some();
                    if ui
                        .add_enabled(
                            has_project,
                            widgets::shortcut_button("Save", EditorKey::Save),
                        )
                        .clicked()
                    {
                        editor.save();
                        ui.close();
                    }
                    if ui
                        .add_enabled(has_project, egui::Button::new("Close project"))
                        .clicked()
                    {
                        request_close(editor, CloseThen::Close);
                        ui.close();
                    }
                    ui.separator();
                    if ui.button("Game binaries…").clicked() {
                        editor.dialogs.push(ModalDialog::Binaries);
                        ui.close();
                    }
                    if ui
                        .add(widgets::shortcut_button("Keys", EditorKey::KeySheet))
                        .clicked()
                    {
                        editor.dialogs.push(ModalDialog::Keys);
                        ui.close();
                    }
                    if ui
                        .add(widgets::shortcut_button("Quit", EditorKey::Quit))
                        .clicked()
                    {
                        request_close(editor, CloseThen::Quit);
                        ui.close();
                    }
                });
                if let Some(project) = &editor.project {
                    ui.label(face::secondary(pretty_path(&project.root)));
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if editor.project.is_none() {
                        return;
                    }
                    play::top_bar(editor, ui);
                    if let Some(project) = &editor.project {
                        let unsaved = project.unsaved().len();
                        if let Some(reason) = &project.read_only {
                            controls::pill(ui, "read-only", Pill::Gold).on_hover_text(reason);
                        } else if project.loading() {
                            controls::pill(ui, "applying…", Pill::Ink);
                            ui.ctx().request_repaint_after(Duration::from_millis(50));
                        } else if let Some(report) = &project.report {
                            controls::pill(ui, "does not load", Pill::Rubric)
                                .on_hover_text(report_summary(report));
                        } else if unsaved > 0 {
                            controls::pill(ui, &format!("{unsaved} unsaved"), Pill::Ink);
                        } else {
                            controls::pill(ui, "saved", Pill::Verdigris);
                        }
                    }
                });
            });
        });
    divide(root, bar.response.rect, Edge::Bottom);
}

pub fn pretty_path(path: &Path) -> String {
    let text = path.display().to_string();
    match dirs::home_dir() {
        Some(home) if path.starts_with(&home) => format!(
            "~/{}",
            path.strip_prefix(&home)
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        ),
        _ => text,
    }
}

fn workspace(editor: &mut Editor, root: &mut egui::Ui) {
    status_bar(editor, root);
    let content = egui::Panel::left("content")
        .resizable(true)
        .default_size(270.0)
        .size_range(200.0..=520.0)
        .show_separator_line(false)
        .frame(egui::Frame::new())
        .show(root, |ui| {
            let tabs = [
                (LeftTab::Content, "Content".to_owned()),
                (LeftTab::Assets, "Assets".to_owned()),
            ];
            widgets::tab_strip(ui, &tabs, &mut editor.panels.left);
            panel_body(ui, |ui| {
                egui::Frame::new()
                    .inner_margin(egui::Margin::symmetric(10, 8))
                    .show(ui, |ui| match editor.panels.left {
                        LeftTab::Content => browser::show(editor, ui),
                        LeftTab::Assets => assets::show(editor, ui),
                    });
            });
        });
    divide(root, content.response.rect, Edge::Right);
    let bottom_tabs = views::bottom_tabs(editor);
    if !bottom_tabs
        .iter()
        .any(|(tab, _)| *tab == editor.panels.bottom)
    {
        editor.panels.bottom = bottom_tabs
            .first()
            .map(|(tab, _)| *tab)
            .unwrap_or(BottomTab::History);
    }
    let bottom = egui::Panel::bottom("bottom")
        .resizable(true)
        .default_size(200.0)
        .show_separator_line(false)
        .frame(egui::Frame::new().inner_margin(egui::Margin {
            top: 6,
            ..egui::Margin::ZERO
        }))
        .show(root, |ui| {
            widgets::tab_strip(ui, &bottom_tabs, &mut editor.panels.bottom);
            panel_body(ui, |ui| {
                egui::Frame::new()
                    .inner_margin(egui::Margin::symmetric(10, 8))
                    .show(ui, |ui| {
                        ui.set_min_height(ui.available_height());
                        match editor.panels.bottom {
                            BottomTab::History => history::show(editor, ui),
                            BottomTab::Output => output::show(editor, ui),
                            other => views::bottom_show(editor, ui, other),
                        }
                    });
            });
        });
    divide(root, bottom.response.rect, Edge::Top);
    let mut dock = mem::replace(&mut editor.dock, DockState::new(Vec::new()));
    egui::CentralPanel::default()
        .frame(egui::Frame::new())
        .show(root, |ui| {
            if dock.iter_all_tabs().next().is_none() {
                empty_centre(ui);
                return;
            }
            let style = dock_style(ui.style());
            let mut viewer = Viewer { editor };
            DockArea::new(&mut dock)
                .style(style)
                .show_leaf_close_all_buttons(false)
                .show_leaf_collapse_buttons(false)
                .show_inside(ui, &mut viewer);
        });
    if let Some(request) = editor.close_tabs.take() {
        close_tabs(&mut dock, request);
    }
    editor.dock = dock;
}

fn close_tabs(dock: &mut DockState<EditorTab>, request: CloseTabs) {
    match request {
        CloseTabs::All => dock.retain_tabs(|_| false),
        CloseTabs::Others(kept) => dock.retain_tabs(|tab| *tab == kept),
        CloseTabs::ToTheRight(from) => {
            let Some(path) = dock.find_tab(&from) else {
                return;
            };
            let Ok(leaf) = dock.leaf_mut(egui_dock::NodePath {
                surface: path.surface,
                node: path.node,
            }) else {
                return;
            };
            leaf.tabs.truncate(path.tab.0 + 1);
            leaf.active = path.tab;
        }
    }
}

fn empty_centre(ui: &mut egui::Ui) {
    ui.vertical_centered(|ui| {
        ui.add_space(ui.available_height() * 0.3);
        ui.label(theme::muted("Nothing is open").size(20.0));
        ui.add_space(8.0);
        ui.label(theme::muted(
            "Pick a row or a file on the left, or search them all",
        ));
        ui.add_space(8.0);
        widgets::key_chip(ui, EditorKey::Search);
    });
}

const TOP_BAR_HEIGHT: f32 = 42.0;
const STATUS_HEIGHT: f32 = 24.0;

#[derive(Clone, Copy)]
pub enum Edge {
    Top,
    Bottom,
    Left,
    Right,
}

pub fn divide(ui: &egui::Ui, panel: egui::Rect, edge: Edge) {
    let stroke = egui::Stroke::new(1.0, ink::ink_wash(0.35));
    let painter = ui.painter();
    match edge {
        Edge::Top => painter.hline(panel.x_range(), panel.top() + 0.5, stroke),
        Edge::Bottom => painter.hline(panel.x_range(), panel.bottom() - 0.5, stroke),
        Edge::Left => painter.vline(panel.left() + 0.5, panel.y_range(), stroke),
        Edge::Right => painter.vline(panel.right() - 0.5, panel.y_range(), stroke),
    };
}

fn dock_style(egui_style: &egui::Style) -> egui_dock::Style {
    let mut style = egui_dock::Style::from_egui(egui_style);
    let top = egui::CornerRadius {
        nw: 4,
        ne: 4,
        sw: 0,
        se: 0,
    };
    let tab = |fill, outline, text| egui_dock::TabInteractionStyle {
        outline_color: outline,
        corner_radius: top,
        bg_fill: fill,
        text_color: text,
    };
    let lifted = tab(ink::LIGHT, ink::ink_wash(0.5), ink::RUBRIC);
    let lying = tab(ink::ink_wash(0.05), ink::ink_wash(0.35), ink::INK2);
    style.main_surface_border_stroke = egui::Stroke::NONE;
    style.tab_bar.fill_tab_bar = false;
    style.tab_bar.height = 30.0;
    style.tab_bar.bg_fill = egui::Color32::TRANSPARENT;
    style.tab_bar.hline_color = ink::ink_wash(0.35);
    style.tab_bar.corner_radius = egui::CornerRadius::ZERO;
    style.tab.active = lifted.clone();
    style.tab.focused = lifted.clone();
    style.tab.active_with_kb_focus = lifted.clone();
    style.tab.focused_with_kb_focus = lifted;
    style.tab.inactive = lying.clone();
    style.tab.inactive_with_kb_focus = lying;
    style.tab.hovered = tab(ink::gold_wash(0.2), ink::ink_wash(0.35), ink::INK);
    style.tab.hline_below_active_tab_name = false;
    style.tab.spacing = 4.0;
    style.tab.tab_body.bg_fill = egui::Color32::TRANSPARENT;
    style.tab.tab_body.inner_margin = egui::Margin::ZERO;
    style.tab.tab_body.stroke = egui::Stroke::NONE;
    style.separator.width = 1.0;
    style.separator.color_idle = ink::ink_wash(0.35);
    style.separator.color_hovered = ink::INK;
    style.separator.color_dragged = ink::INK;
    style.buttons.close_tab_color = ink::INK3;
    style.buttons.close_tab_active_color = ink::INK;
    style.buttons.close_tab_bg_fill = ink::ink_wash(0.08);
    style
}

fn report_summary(report: &LoadReport) -> String {
    const SHOWN: usize = 8;
    let mut lines: Vec<String> = report
        .errors
        .iter()
        .take(SHOWN)
        .map(|error| {
            let place = project::problem_place(&error.file, error.at.pointer());
            format!("{place}: {}", error.problem)
        })
        .collect();
    if report.errors.len() > SHOWN {
        lines.push(format!("… and {} more", report.errors.len() - SHOWN));
    }
    lines.join("\n")
}

fn status_bar(editor: &mut Editor, root: &mut egui::Ui) {
    let mut left = mem::take(&mut editor.status.left);
    if let Some(project) = &editor.project
        && project.broken_on_disk()
    {
        left = vec![
            pretty_path(&project.root),
            "not loaded".to_owned(),
            "loads again by itself when a file changes".to_owned(),
        ];
    } else if let Some(report) = editor
        .project
        .as_ref()
        .and_then(|project| project.report.as_ref())
    {
        let first = EditRefusal::of(report);
        left = vec!["does not load".to_owned(), first.place(), first.sentence()];
    } else if left.is_empty() {
        let selection = &editor.selection;
        if selection.keys.len() == 1 && selection.parts.is_empty() {
            let (table, key) = (&selection.table, &selection.keys[0]);
            left.push(format!("{table}/{key}"));
            left.push(row_file(table, key));
        }
    }
    let right = mem::take(&mut editor.status.right);
    let status = egui::Panel::bottom("status")
        .exact_size(STATUS_HEIGHT)
        .show_separator_line(false)
        .frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(12, 0)))
        .show(root, |ui| {
            ui.horizontal_centered(|ui| {
                ui.spacing_mut().item_spacing.x = 14.0;
                for segment in &left {
                    ui.label(face::small_faint(segment));
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.spacing_mut().item_spacing.x = 14.0;
                    for segment in right.iter().rev() {
                        ui.label(face::small_faint(segment));
                    }
                });
            });
        });
    divide(root, status.response.rect, Edge::Top);
}

struct Viewer<'a> {
    editor: &'a mut Editor,
}

/// The gutter every tab's content keeps from the tab body's edge, so views line up.
pub const CONTENT_PADDING: egui::Margin = egui::Margin::symmetric(16, 10);

impl TabViewer for Viewer<'_> {
    type Tab = EditorTab;

    fn id(&mut self, tab: &mut EditorTab) -> egui::Id {
        egui::Id::new(tab.clone())
    }

    fn title(&mut self, tab: &mut EditorTab) -> egui::WidgetText {
        let title = tab.title();
        let unsaved = self
            .editor
            .project
            .as_ref()
            .zip(tab.row())
            .is_some_and(|(project, (table, key))| project.is_unsaved(&row_file(&table, &key)));
        let mut job = TextRole::Tab.job(&title, egui::Color32::PLACEHOLDER);
        if unsaved {
            job.append(" \u{2022}", 0.0, TextRole::Tab.format(ink::OCHRE));
        }
        job.into()
    }

    fn ui(&mut self, ui: &mut egui::Ui, tab: &mut EditorTab) {
        match tab {
            EditorTab::World => world::show(self.editor, ui),
            EditorTab::Area { key } => area::show(self.editor, ui, key),
            EditorTab::Blueprint { key } => area::show_blueprint(self.editor, ui, key),
            EditorTab::Script(owner) => script::show(self.editor, ui, owner),
            EditorTab::Model { key } => model::show(self.editor, ui, key),
            EditorTab::Tileset { key } => tileset::show(self.editor, ui, key),
            EditorTab::Row { table, key } if table == class::TABLE => {
                class::show(self.editor, ui, key)
            }
            EditorTab::Spreadsheet { table } => spreadsheet::show(self.editor, ui, table),
            EditorTab::Row { .. }
            | EditorTab::Rows { .. }
            | EditorTab::Game
            | EditorTab::Asset { .. } => {
                egui::Frame::new()
                    .inner_margin(CONTENT_PADDING)
                    .show(ui, |ui| {
                        ui.set_min_size(ui.available_size());
                        match tab {
                            EditorTab::Row { table, key } if table == character::TABLE => {
                                character::show(self.editor, ui, key)
                            }
                            EditorTab::Row { table, key } if table == vfx::TABLE => {
                                vfx::show_vfx(self.editor, ui, key)
                            }
                            EditorTab::Row { table, key } if table == vfx::SHADER_TABLE => {
                                vfx::show_shader(self.editor, ui, key)
                            }
                            EditorTab::Row { table, key } => {
                                row_form::show_row_tab(self.editor, ui, table, key)
                            }
                            EditorTab::Rows { table, keys } => {
                                row_form::show_rows_tab(self.editor, ui, table, keys)
                            }
                            EditorTab::Game => row_form::settings::show_game(self.editor, ui),
                            EditorTab::Asset { path } => {
                                row_form::usages::show_asset(self.editor, ui, path)
                            }
                            _ => {}
                        }
                    });
            }
        }
    }

    fn context_menu(&mut self, ui: &mut egui::Ui, tab: &mut EditorTab, _: egui_dock::NodePath) {
        if ui.button("Close all").clicked() {
            self.editor.close_tabs = Some(CloseTabs::All);
            ui.close();
        }
        if ui.button("Close other tabs").clicked() {
            self.editor.close_tabs = Some(CloseTabs::Others(tab.clone()));
            ui.close();
        }
        if ui.button("Close tabs to the right").clicked() {
            self.editor.close_tabs = Some(CloseTabs::ToTheRight(tab.clone()));
            ui.close();
        }
    }

    fn scroll_bars(&self, tab: &EditorTab) -> [bool; 2] {
        match tab {
            EditorTab::Area { .. }
            | EditorTab::Blueprint { .. }
            | EditorTab::World
            | EditorTab::Script(_)
            | EditorTab::Model { .. }
            | EditorTab::Tileset { .. }
            | EditorTab::Spreadsheet { .. } => [false, false],
            EditorTab::Row { table, key } if table == class::TABLE => [
                false,
                self.editor.views.class.page(key) == class::ClassPage::Levels,
            ],
            _ => [false, true],
        }
    }
}

fn toast(editor: &mut Editor, ctx: &Context) {
    let Some((text, since)) = &editor.toast else {
        return;
    };
    if since.elapsed().as_secs_f32() > 6.0 {
        editor.toast = None;
        return;
    }
    egui::Area::new(egui::Id::new("toast"))
        .anchor(egui::Align2::CENTER_BOTTOM, egui::vec2(0.0, -40.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            slip::show(ui, |ui| {
                ui.label(text);
            });
        });
}
