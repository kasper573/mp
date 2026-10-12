pub mod assets;
pub mod browser;
pub mod dialogs;
pub mod history;
pub mod inspector;
pub mod output;
pub mod report;
pub mod start;
pub mod theme;
pub mod tree;
pub mod widgets;

use bevy::prelude::World;
use egui::{Align, Context, Key, Layout, Modifiers, RichText};
use egui_dock::{DockArea, DockState, TabViewer};

use crate::app::{BottomTab, CloseDialog, CloseThen, Dialog, Editor, LeftTab, RightTab};
use crate::tabs::Tab;

pub fn show(editor: &mut Editor, ctx: &Context, world: &mut World) {
    if !editor.themed {
        theme::apply(ctx);
        editor.themed = true;
        ctx.request_repaint();
        return;
    }
    editor.status.right.clear();
    shortcuts(editor, ctx);
    let mut root = egui::Ui::new(
        ctx.clone(),
        "viewport".into(),
        egui::UiBuilder::new()
            .layer_id(egui::LayerId::background())
            .max_rect(ctx.viewport_rect()),
    );
    top_bar(editor, &mut root);
    for tab in std::mem::take(&mut editor.open_tabs) {
        focus_tab(&mut editor.dock, tab);
    }
    if editor.project.is_some() {
        workspace(editor, &mut root, world);
        report::not_loaded(editor, ctx);
        crate::import::tick(editor, ctx);
    } else {
        start::show(editor, &mut root);
    }
    dialogs::show(editor, ctx);
    toast(editor, ctx);
    if ctx.input(|i| i.viewport().close_requested()) && !editor.quit {
        if editor.has_unsaved() {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            editor.dialogs.push(Dialog::Close(CloseDialog {
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

pub fn focus_tab(dock: &mut DockState<Tab>, tab: Tab) {
    if let Tab::Rows { table, .. } = &tab {
        let replaced = dock
            .iter_all_tabs_mut()
            .map(|(_, existing)| existing)
            .find(|existing| matches!(existing, Tab::Rows { table: t, .. } if t == table))
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

pub fn active_tab(editor: &Editor) -> Option<Tab> {
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
    let script_tab = matches!(active_tab(editor), Some(Tab::Script(_)));
    let script_hovered = editor
        .views
        .script
        .shown_rect
        .zip(ctx.pointer_hover_pos())
        .is_some_and(|(rect, pos)| rect.contains(pos));
    if script_tab || script_hovered {
        editor.views.script.keys = crate::views::script::ScriptKeys::take(ctx);
    }
    let (save, undo, redo, search, quit, close) = ctx.input_mut(|i| {
        (
            i.consume_key(Modifiers::COMMAND, Key::S),
            i.consume_key(Modifiers::COMMAND, Key::Z),
            i.consume_key(Modifiers::COMMAND | Modifiers::SHIFT, Key::Z),
            i.consume_key(Modifiers::COMMAND, Key::P),
            i.consume_key(Modifiers::COMMAND, Key::Q),
            i.consume_key(Modifiers::COMMAND, Key::W),
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
    if ctx.input_mut(|i| i.consume_key(Modifiers::NONE, Key::F1))
        && !editor
            .dialogs
            .iter()
            .any(|dialog| matches!(dialog, Dialog::Keys))
    {
        editor.dialogs.push(Dialog::Keys);
    }
    let (f5, shift_f5, f6, ctrl_t) = ctx.input_mut(|i| {
        (
            i.consume_key(Modifiers::NONE, Key::F5),
            i.consume_key(Modifiers::SHIFT, Key::F5),
            i.consume_key(Modifiers::NONE, Key::F6),
            i.consume_key(Modifiers::COMMAND, Key::T),
        )
    });
    if f5 {
        crate::play::start(editor, None);
    }
    if shift_f5 {
        crate::play::stop(editor);
    }
    if f6 {
        crate::views::play_here(editor);
    }
    if ctrl_t && let Some(key) = crate::play::current_character(editor) {
        editor.select(crate::project::Selection::row("test_character", &key));
        editor.open_tab(Tab::for_row("test_character", &key));
    }
    if editor.play.running.is_some() {
        ctx.request_repaint_after(std::time::Duration::from_millis(100));
    }
    crate::play::status(editor);
}

pub fn request_close(editor: &mut Editor, then: CloseThen) {
    if editor.has_unsaved() {
        editor.dialogs.push(Dialog::Close(CloseDialog { then }));
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
    egui::Panel::top("top")
        .frame(
            egui::Frame::new()
                .fill(theme::BG)
                .inner_margin(egui::Margin::symmetric(10, 8)),
        )
        .show(root, |ui| {
            ui.horizontal(|ui| {
                ui.menu_button(RichText::new("Rift editor").strong().size(15.0), |ui| {
                    if ui.button("New game…").clicked() {
                        start::new_game_dialog(editor, None);
                        ui.close();
                    }
                    if ui.button("Open folder…").clicked() {
                        start::pick_folder(editor);
                        ui.close();
                    }
                    let has_project = editor.project.is_some();
                    if ui
                        .add_enabled(
                            has_project,
                            egui::Button::new("Save").shortcut_text("Ctrl S"),
                        )
                        .clicked()
                    {
                        editor.save();
                        ui.close();
                    }
                    if ui
                        .add_enabled(has_project, egui::Button::new("Close folder"))
                        .clicked()
                    {
                        request_close(editor, CloseThen::Close);
                        ui.close();
                    }
                    ui.separator();
                    if has_project {
                        ui.menu_button("Tables as spreadsheets", |ui| {
                            for table in editor.shapes.order.clone() {
                                if ui.button(&table).clicked() {
                                    editor.open_tab(Tab::Sheet { table });
                                    ui.close();
                                }
                            }
                        });
                        if ui.button("World map").clicked() {
                            editor.open_tab(Tab::World);
                            ui.close();
                        }
                        ui.separator();
                    }
                    if ui.button("Game binaries…").clicked() {
                        editor.dialogs.push(Dialog::Binaries);
                        ui.close();
                    }
                    if ui
                        .add(egui::Button::new("Keys").shortcut_text("F1"))
                        .clicked()
                    {
                        editor.dialogs.push(Dialog::Keys);
                        ui.close();
                    }
                    if ui
                        .add(egui::Button::new("Quit").shortcut_text("Ctrl Q"))
                        .clicked()
                    {
                        request_close(editor, CloseThen::Quit);
                        ui.close();
                    }
                });
                if let Some(project) = &editor.project {
                    ui.label(
                        theme::muted(pretty_path(&project.root))
                            .monospace()
                            .size(13.0),
                    );
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if editor.project.is_none() {
                        return;
                    }
                    crate::play::top_bar(editor, ui);
                    let (can_undo, can_redo) = editor
                        .project
                        .as_ref()
                        .map(|project| (project.history.can_undo(), project.history.can_redo()))
                        .unwrap_or((false, false));
                    if widgets::keyed_button(ui, "Redo", "Ctrl ⇧ Z", can_redo).clicked() {
                        editor.redo();
                    }
                    if widgets::keyed_button(ui, "← Undo", "Ctrl Z", can_undo).clicked() {
                        editor.undo();
                    }
                    if let Some(project) = &editor.project {
                        let unsaved = project.unsaved().len();
                        if let Some(reason) = &project.read_only {
                            widgets::pill(ui, "read-only", theme::WARN).on_hover_text(reason);
                        } else if unsaved > 0 {
                            widgets::pill(ui, &format!("{unsaved} unsaved"), theme::TEXT);
                        } else if project.report.is_some() {
                            widgets::pill(ui, "does not load", theme::DANGER);
                        } else {
                            widgets::pill(ui, "✔ saved", theme::OK);
                        }
                    }
                });
            });
        });
}

pub fn pretty_path(path: &std::path::Path) -> String {
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

fn workspace(editor: &mut Editor, root: &mut egui::Ui, world: &mut World) {
    status_bar(editor, root);
    egui::Panel::left("content")
        .resizable(true)
        .default_size(270.0)
        .size_range(200.0..=520.0)
        .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(0.0))
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
    egui::Panel::right("inspector")
        .resizable(true)
        .default_size(360.0)
        .size_range(260.0..=720.0)
        .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(0.0))
        .show(root, |ui| {
            let tabs = inspector::right_tabs(editor);
            if !tabs.iter().any(|(tab, _)| *tab == editor.panels.right) {
                editor.panels.right = tabs
                    .first()
                    .map(|(tab, _)| *tab)
                    .unwrap_or(RightTab::Inspector);
            }
            widgets::tab_strip(ui, &tabs, &mut editor.panels.right);
            panel_body(ui, |ui| {
                egui::ScrollArea::vertical()
                    .id_salt("right-panel")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        egui::Frame::new()
                            .inner_margin(egui::Margin::symmetric(10, 8))
                            .show(ui, |ui| match editor.panels.right {
                                RightTab::Inspector => inspector::show(editor, ui),
                                RightTab::UsedBy => inspector::usages::show_used_by(editor, ui),
                                RightTab::Preview => inspector::preview::show_preview(editor, ui),
                                RightTab::Conflicts => {
                                    inspector::bindings::show_conflicts(editor, ui)
                                }
                            });
                    });
            });
        });
    let bottom_tabs = crate::views::bottom_tabs(editor);
    if !bottom_tabs
        .iter()
        .any(|(tab, _)| *tab == editor.panels.bottom)
    {
        editor.panels.bottom = bottom_tabs
            .first()
            .map(|(tab, _)| *tab)
            .unwrap_or(BottomTab::History);
    }
    egui::Panel::bottom("bottom")
        .resizable(true)
        .default_size(200.0)
        .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(0.0))
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
                            other => crate::views::bottom_show(editor, ui, other),
                        }
                    });
            });
        });
    let mut dock = std::mem::replace(&mut editor.dock, DockState::new(Vec::new()));
    egui::CentralPanel::default()
        .frame(egui::Frame::new().fill(theme::BG).inner_margin(0.0))
        .show(root, |ui| {
            if dock.iter_all_tabs().next().is_none() {
                empty_centre(ui);
                return;
            }
            let mut style = egui_dock::Style::from_egui(ui.style());
            style.tab_bar.fill_tab_bar = false;
            style.tab_bar.height = 30.0;
            style.tab_bar.bg_fill = theme::PANEL;
            style.tab.active.bg_fill = theme::BG;
            style.tab.active.text_color = theme::TEXT;
            style.tab.inactive.bg_fill = theme::PANEL;
            style.tab.inactive.text_color = theme::MUTED;
            style.tab.hovered.bg_fill = theme::RAISED;
            style.tab.focused.bg_fill = theme::BG;
            style.tab.focused.text_color = theme::TEXT;
            style.tab.tab_body.bg_fill = theme::BG;
            style.tab.tab_body.inner_margin = egui::Margin::ZERO;
            style.tab.tab_body.stroke = egui::Stroke::NONE;
            let mut viewer = Viewer { editor, world };
            DockArea::new(&mut dock)
                .style(style)
                .show_leaf_close_all_buttons(false)
                .show_leaf_collapse_buttons(false)
                .show_inside(ui, &mut viewer);
        });
    editor.dock = dock;
}

fn empty_centre(ui: &mut egui::Ui) {
    ui.vertical_centered(|ui| {
        ui.add_space(ui.available_height() * 0.08);
        ui.label(RichText::new("Ctrl P searches everything").strong().size(20.0));
        ui.add_space(6.0);
        ui.set_max_width(460.0);
        ui.label(theme::muted("Keys, object names, display names, module types and file names. Enter opens the first result."));
    });
}

const STATUS_HEIGHT: f32 = 28.0;

fn status_bar(editor: &mut Editor, root: &mut egui::Ui) {
    let mut left = std::mem::take(&mut editor.status.left);
    if let Some(project) = &editor.project
        && project.report.is_some()
    {
        left = vec![
            pretty_path(&project.root),
            "not loaded".to_owned(),
            "loads again by itself when a file changes".to_owned(),
        ];
    } else if left.is_empty() {
        let selection = &editor.selection;
        if selection.keys.len() == 1 && selection.parts.is_empty() {
            let (table, key) = (&selection.table, &selection.keys[0]);
            left.push(format!("{table}/{key}"));
            left.push(crate::project::row_file(table, key));
        }
    }
    let right = std::mem::take(&mut editor.status.right);
    egui::Panel::bottom("status")
        .exact_size(STATUS_HEIGHT)
        .frame(
            egui::Frame::new()
                .fill(theme::BG)
                .inner_margin(egui::Margin::symmetric(10, 4)),
        )
        .show(root, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 14.0;
                for segment in &left {
                    ui.label(
                        RichText::new(segment)
                            .monospace()
                            .size(12.5)
                            .color(theme::MUTED),
                    );
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.spacing_mut().item_spacing.x = 14.0;
                    for segment in right.iter().rev() {
                        ui.label(
                            RichText::new(segment)
                                .monospace()
                                .size(12.5)
                                .color(theme::MUTED),
                        );
                    }
                });
            });
        });
}

struct Viewer<'a> {
    editor: &'a mut Editor,
    world: &'a mut World,
}

impl TabViewer for Viewer<'_> {
    type Tab = Tab;

    fn id(&mut self, tab: &mut Tab) -> egui::Id {
        egui::Id::new(tab.clone())
    }

    fn title(&mut self, tab: &mut Tab) -> egui::WidgetText {
        let title = tab.title();
        let unsaved =
            self.editor
                .project
                .as_ref()
                .zip(tab.row())
                .is_some_and(|(project, (table, key))| {
                    project.is_unsaved(&crate::project::row_file(&table, &key))
                });
        let mut job = egui::text::LayoutJob::default();
        job.append(
            &title,
            0.0,
            egui::TextFormat::simple(egui::FontId::proportional(13.5), theme::TEXT),
        );
        if unsaved {
            job.append(
                " ●",
                0.0,
                egui::TextFormat::simple(egui::FontId::proportional(11.0), theme::WARN),
            );
        }
        job.into()
    }

    fn ui(&mut self, ui: &mut egui::Ui, tab: &mut Tab) {
        match tab {
            Tab::World => crate::views::world::show(self.editor, ui, self.world),
            Tab::Row { table, key } if table == crate::views::character::TABLE => {
                crate::views::character::show(self.editor, ui, key)
            }
            Tab::Row { table, key } => inspector::show_row_tab(self.editor, ui, table, key),
            Tab::Rows { table, keys } => inspector::show_rows_tab(self.editor, ui, table, keys),
            Tab::Area { key } => crate::views::area::show(self.editor, ui, self.world, key, None),
            Tab::Blueprint { key } => {
                crate::views::area::show_blueprint(self.editor, ui, self.world, key)
            }
            Tab::Script(owner) => crate::views::script::show(self.editor, ui, owner),
            Tab::Model { key } => crate::views::model::show(self.editor, ui, key),
            Tab::Tileset { key } => crate::views::tileset::show(self.editor, ui, key),
            Tab::Sheet { table } => crate::views::sheet::show(self.editor, ui, table),
        }
    }

    fn scroll_bars(&self, tab: &Tab) -> [bool; 2] {
        match tab {
            Tab::Area { .. }
            | Tab::Blueprint { .. }
            | Tab::World
            | Tab::Script(_)
            | Tab::Model { .. }
            | Tab::Tileset { .. } => [false, false],
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
            egui::Frame::popup(ui.style())
                .fill(theme::RAISED)
                .show(ui, |ui| {
                    ui.label(text);
                });
        });
}
