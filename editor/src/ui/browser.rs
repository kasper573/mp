use egui::{Align, Layout, RichText, Sense, Ui};

use super::{theme, widgets};
use crate::app::{Dialog, Editor, RenameDialog, RightTab};
use crate::project::{Selection, row_of};
use crate::tabs::Tab;

const GROUPS: [(&str, &[&str]); 7] = [
    ("World", &["area", "world_map"]),
    ("People", &["npc", "model", "player", "job"]),
    ("Things", &["item", "shop"]),
    ("Story", &["script", "quest", "memory", "notification"]),
    ("Art", &["tileset", "blueprint", "surface"]),
    ("Sound", &["sfx", "babble", "babble_bank"]),
    (
        "Game",
        &[
            "attention",
            "cursor",
            "font",
            "input",
            "interface_icon",
            "test_character",
        ],
    ),
];

const SHOWN_ROWS: usize = 7;

/// A row dragged from the browser onto a view.
#[derive(Clone, Debug)]
pub struct RowDrag {
    pub table: String,
    pub key: String,
}

pub struct BrowserState {
    pub search: String,
    pub only_unsaved: bool,
    pub only_fixtures: bool,
    pub focus_search: bool,
    pub open: std::collections::HashSet<String>,
    pub expanded: std::collections::HashSet<String>,
}

impl Default for BrowserState {
    fn default() -> BrowserState {
        BrowserState {
            search: String::new(),
            only_unsaved: false,
            only_fixtures: false,
            focus_search: false,
            open: ["area".to_owned()].into_iter().collect(),
            expanded: Default::default(),
        }
    }
}

enum Hit {
    Row {
        table: String,
        key: String,
    },
    Module {
        table: String,
        key: String,
        index: usize,
        kind: String,
        name: Option<String>,
    },
    File {
        path: String,
        folder: bool,
    },
}

pub enum Action {
    Open,
    OpenTab,
    Duplicate,
    Rename,
    Usages,
    Delete,
}

pub fn focus_search(editor: &mut Editor) {
    editor.views.browser.focus_search = true;
}

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    if editor.project.is_none() {
        return;
    }
    let state = &mut editor.views.browser;
    let response = widgets::search_box(
        ui,
        &mut state.search,
        "Search rows, keys, files",
        Some("Ctrl P"),
    );
    if state.focus_search {
        response.request_focus();
        state.focus_search = false;
    }
    let enter = response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
    if response.has_focus() && ui.input(|i| i.key_pressed(egui::Key::Escape)) {
        state.search.clear();
    }
    let searching = !state.search.trim().is_empty();
    if searching || state.only_unsaved || state.only_fixtures {
        ui.horizontal(|ui| {
            let unsaved = widgets::chip_coloured(
                ui,
                "● unsaved",
                if state.only_unsaved {
                    theme::ACCENT_SOFT
                } else {
                    theme::RAISED
                },
                if state.only_unsaved {
                    theme::TEXT
                } else {
                    theme::MUTED
                },
            );
            if unsaved.clicked() {
                state.only_unsaved = !state.only_unsaved;
            }
            let fixtures = widgets::chip_coloured(
                ui,
                "🔒 fixtures",
                if state.only_fixtures {
                    theme::ACCENT_SOFT
                } else {
                    theme::RAISED
                },
                if state.only_fixtures {
                    theme::TEXT
                } else {
                    theme::MUTED
                },
            );
            if fixtures.clicked() {
                state.only_fixtures = !state.only_fixtures;
            }
        });
    }
    ui.add_space(4.0);
    if searching {
        results(editor, ui, enter);
    } else {
        groups(editor, ui);
    }
}

fn groups(editor: &mut Editor, ui: &mut Ui) {
    let listed = editor.shapes.order.clone();
    let only_unsaved = editor.views.browser.only_unsaved;
    let only_fixtures = editor.views.browser.only_fixtures;
    let grouped: Vec<(&str, Vec<String>)> = GROUPS
        .iter()
        .map(|(group, tables)| {
            let mut names: Vec<String> = tables.iter().map(|t| (*t).to_owned()).collect();
            if *group == "Game" {
                names.extend(
                    listed
                        .iter()
                        .filter(|t| !GROUPS.iter().any(|(_, ts)| ts.contains(&t.as_str())))
                        .cloned(),
                );
            }
            names.retain(|table| listed.contains(table));
            (*group, names)
        })
        .collect();
    let mut clicked: Option<(String, String, bool, bool)> = None;
    let mut action: Option<(String, String, Action)> = None;
    let mut new_row: Option<String> = None;
    let mut toggle_table: Option<String> = None;
    let mut expand: Option<String> = None;
    egui::ScrollArea::vertical()
        .id_salt("browser")
        .show(ui, |ui| {
            for (group, tables) in &grouped {
                let open_tables: Vec<&String> = tables
                    .iter()
                    .filter(|t| editor.views.browser.open.contains(*t))
                    .collect();
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(group.to_uppercase())
                            .size(11.0)
                            .color(theme::MUTED)
                            .family(egui::FontFamily::Name("medium".into())),
                    );
                    if open_tables.is_empty() && *group == "Game" {
                        ui.label(theme::muted("game.json").monospace().size(13.0));
                        if ui
                            .add(
                                egui::Label::new(
                                    theme::muted(format!("+{}", tables.len()))
                                        .monospace()
                                        .size(13.0),
                                )
                                .sense(Sense::click()),
                            )
                            .clicked()
                        {
                            toggle_table = Some(tables[0].clone());
                        }
                    } else if open_tables.is_empty() {
                        for (shown, table) in tables.iter().enumerate() {
                            if shown == 2 {
                                let rest = tables.len() - shown;
                                if ui
                                    .add(
                                        egui::Label::new(
                                            theme::muted(format!("+{rest}")).monospace().size(13.0),
                                        )
                                        .sense(Sense::click()),
                                    )
                                    .clicked()
                                {
                                    toggle_table = Some(tables[shown].clone());
                                }
                                break;
                            }
                            if shown > 0 {
                                ui.label(theme::faint("·"));
                            }
                            if ui
                                .add(
                                    egui::Label::new(theme::muted(table).monospace().size(13.0))
                                        .sense(Sense::click()),
                                )
                                .clicked()
                            {
                                toggle_table = Some(table.clone());
                            }
                        }
                    }
                });
                for table in tables {
                    let Some(project) = &editor.project else {
                        return;
                    };
                    let prefix = format!("tables/{table}/");
                    let rows: Vec<(String, String, bool)> = project
                        .files
                        .paths_under(&prefix)
                        .filter_map(|file| {
                            row_of(file).map(|(_, key)| (file.clone(), key.to_owned()))
                        })
                        .map(|(file, key)| {
                            let unsaved = project.is_unsaved(&file);
                            (file, key, unsaved)
                        })
                        .filter(|(_, key, unsaved)| {
                            (!only_unsaved || *unsaved)
                                && (!only_fixtures || editor.shapes.is_fixture(table, key))
                        })
                        .collect();
                    let open = editor.views.browser.open.contains(table);
                    if !open && open_tables.is_empty() {
                        continue;
                    }
                    let fixtures = editor.shapes.has_fixtures(table);
                    let header = ui
                        .horizontal(|ui| {
                            ui.add_space(6.0);
                            ui.label(theme::muted(if open { "▾" } else { "▸" }).size(11.0));
                            ui.label(
                                theme::mono(format!(
                                    "{}{table}",
                                    if fixtures { "🔒 " } else { "" }
                                ))
                                .color(theme::CODE),
                            );
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                ui.label(
                                    theme::muted(rows.len().to_string()).monospace().size(12.0),
                                );
                                if open
                                    && !fixtures
                                    && ui
                                        .add(
                                            egui::Label::new(theme::faint("+"))
                                                .sense(Sense::click()),
                                        )
                                        .on_hover_text(format!("New {table}"))
                                        .clicked()
                                {
                                    new_row = Some(table.clone());
                                }
                            });
                        })
                        .response
                        .interact(Sense::click());
                    if header.clicked() {
                        toggle_table = Some(table.clone());
                    }
                    if !open {
                        continue;
                    }
                    let expanded = editor.views.browser.expanded.contains(table);
                    let shown = if expanded {
                        rows.len()
                    } else {
                        rows.len().min(SHOWN_ROWS)
                    };
                    for (_, key, unsaved) in rows.iter().take(shown) {
                        let selected =
                            editor.selection.table == *table && editor.selection.keys.contains(key);
                        let response = row_line(editor, ui, table, key, *unsaved, selected);
                        if response.clicked() {
                            let modifiers = ui.input(|i| i.modifiers);
                            clicked =
                                Some((table.clone(), key.clone(), modifiers.ctrl, modifiers.shift));
                        }
                        if response.double_clicked() {
                            action = Some((table.clone(), key.clone(), Action::Open));
                        }
                        response.context_menu(|ui| row_menu(ui, &mut action, table, key));
                    }
                    if rows.len() > shown {
                        ui.horizontal(|ui| {
                            ui.add_space(30.0);
                            if ui
                                .add(
                                    egui::Label::new(
                                        theme::muted(format!("… {} more", rows.len() - shown))
                                            .monospace()
                                            .size(13.0),
                                    )
                                    .sense(Sense::click()),
                                )
                                .clicked()
                            {
                                expand = Some(table.clone());
                            }
                        });
                    }
                }
                ui.add_space(6.0);
            }
        });
    if let Some(table) = toggle_table {
        let open = &mut editor.views.browser.open;
        if !open.remove(&table) {
            open.insert(table);
        }
    }
    if let Some(table) = expand {
        editor.views.browser.expanded.insert(table);
    }
    if let Some(table) = new_row {
        crate::rows::new_row_dialog(editor, &table);
    }
    if let Some((table, key, ctrl, shift)) = clicked {
        select_row(editor, &table, &key, ctrl, shift);
    }
    if let Some((table, key, action)) = action {
        act(editor, &table, &key, action);
    }
}

fn row_line(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    key: &str,
    unsaved: bool,
    selected: bool,
) -> egui::Response {
    let full = ui.available_rect_before_wrap();
    let height = 22.0;
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), height), Sense::click());
    if selected {
        ui.painter().rect_filled(rect, 3.0, theme::ACCENT_SOFT);
    } else if response.hovered() {
        ui.painter().rect_filled(
            rect,
            3.0,
            egui::Color32::from_rgba_unmultiplied(255, 255, 255, 8),
        );
    }
    let drag_id = egui::Id::new(("drag", table, key));
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(Layout::left_to_right(Align::Center)),
    );
    child.dnd_drag_source(
        drag_id,
        RowDrag {
            table: table.to_owned(),
            key: key.to_owned(),
        },
        |ui| {
            ui.add_space(30.0);
            if let Some((texture, uv, size)) = row_icon(editor, ui, table, key) {
                ui.add(egui::Image::from_texture((texture, size)).uv(uv));
                ui.add_space(2.0);
            }
            ui.label(theme::mono(key).size(13.0).color(if selected {
                theme::TEXT
            } else {
                theme::CODE
            }));
        },
    );
    if unsaved {
        ui.painter().circle_filled(
            egui::pos2(rect.max.x - 10.0, rect.center().y),
            3.5,
            theme::WARN,
        );
    }
    response
}

/// A 16 px picture for rows that have one: an npc's or model's first idle frame, an item's icon.
pub fn row_icon(
    editor: &mut Editor,
    ui: &Ui,
    table: &str,
    key: &str,
) -> Option<(egui::TextureId, egui::Rect, egui::Vec2)> {
    let ctx = ui.ctx().clone();
    let Editor { project, form, .. } = editor;
    let project = project.as_ref()?;
    match table {
        "npc" | "player" | "model" => {
            let model_key = if table == "model" {
                key.to_owned()
            } else {
                project.files.json(&crate::project::row_file(table, key))?["model"]
                    .as_str()?
                    .to_owned()
            };
            let model = project
                .files
                .json(&crate::project::row_file("model", &model_key))?;
            let image = model["sprites"]["image"].as_str()?;
            let thumb = form.thumbnails.image(&ctx, &project.files, image)?;
            let w = model["sprites"]["frame_size"]["width"].as_f64()? as f32;
            let h = model["sprites"]["frame_size"]["height"].as_f64()? as f32;
            let frame = model["sprites"]["actions"]["idle"]["s"][0]["frame"]
                .as_u64()
                .unwrap_or(0) as f32;
            let columns = (thumb.size[0] as f32 / w).floor().max(1.0);
            let x = (frame % columns) * w;
            let y = (frame / columns).floor() * h;
            let scale = 18.0 / h.max(1.0);
            Some((
                thumb.texture.id(),
                crate::thumbs::uv(thumb.size, x, y, w, h),
                egui::vec2(w * scale, h * scale),
            ))
        }
        "item" | "interface_icon" | "cursor" | "attention" => {
            let row = project.files.json(&crate::project::row_file(table, key))?;
            let path = row["icon"].as_str().or_else(|| row["image"].as_str())?;
            let thumb = form.thumbnails.image(&ctx, &project.files, path)?;
            let scale = 16.0 / thumb.size[1].max(1) as f32;
            Some((
                thumb.texture.id(),
                egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                egui::vec2(thumb.size[0] as f32 * scale, 16.0),
            ))
        }
        _ => None,
    }
}

fn row_menu(ui: &mut Ui, action: &mut Option<(String, String, Action)>, table: &str, key: &str) {
    let mut pick = |what: Action, ui: &mut Ui| {
        *action = Some((table.to_owned(), key.to_owned(), what));
        ui.close();
    };
    if ui
        .add(egui::Button::new("Open").shortcut_text("Enter"))
        .clicked()
    {
        pick(Action::Open, ui);
    }
    if ui
        .add(egui::Button::new("Open in new tab").shortcut_text("Ctrl Enter"))
        .clicked()
    {
        pick(Action::OpenTab, ui);
    }
    ui.separator();
    if ui
        .add(egui::Button::new("Duplicate").shortcut_text("Ctrl D"))
        .clicked()
    {
        pick(Action::Duplicate, ui);
    }
    if ui
        .add(egui::Button::new("Rename key…").shortcut_text("F2"))
        .clicked()
    {
        pick(Action::Rename, ui);
    }
    if ui
        .add(egui::Button::new("Show usages").shortcut_text("Shift F12"))
        .clicked()
    {
        pick(Action::Usages, ui);
    }
    ui.separator();
    if ui
        .add(egui::Button::new("Delete…").shortcut_text("Del"))
        .clicked()
    {
        pick(Action::Delete, ui);
    }
}

fn select_row(editor: &mut Editor, table: &str, key: &str, ctrl: bool, shift: bool) {
    let mut selection = if editor.selection.table == table && (ctrl || shift) {
        editor.selection.clone()
    } else {
        Selection::rows(table, Vec::new())
    };
    if ctrl && selection.keys.contains(&key.to_owned()) {
        selection.keys.retain(|k| k != key);
    } else if shift && let Some(last) = selection.keys.last().cloned() {
        let keys: Vec<String> = editor
            .project
            .as_ref()
            .map(|project| {
                project
                    .files
                    .paths_under(&format!("tables/{table}/"))
                    .filter_map(|file| row_of(file).map(|(_, key)| key.to_owned()))
                    .collect()
            })
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
    editor.select(selection);
    editor.panels.right = RightTab::Inspector;
}

pub fn act(editor: &mut Editor, table: &str, key: &str, action: Action) {
    match action {
        Action::Open | Action::OpenTab => {
            editor.select(Selection::row(table, key));
            editor.open_tab(Tab::for_row(table, key));
        }
        Action::Rename => {
            if editor.shapes.is_fixture(table, key) {
                editor.toast(format!(
                    "{table}/{key} is a fixture: the engine names it in code"
                ));
            } else {
                editor.dialogs.push(Dialog::Rename(RenameDialog {
                    table: table.to_owned(),
                    draft: key.to_owned(),
                    key: key.to_owned(),
                    error: None,
                }));
            }
        }
        Action::Duplicate => crate::rows::duplicate(editor, table, key),
        Action::Usages => {
            editor.select(Selection::row(table, key));
            editor.panels.right = RightTab::UsedBy;
        }
        Action::Delete => crate::rows::delete_dialog(editor, table, vec![key.to_owned()]),
    }
}

/// Search results: rows, then the modules and objects matching inside rows, then files.
fn results(editor: &mut Editor, ui: &mut Ui, enter: bool) {
    let needle = editor.views.browser.search.trim().to_lowercase();
    let only_unsaved = editor.views.browser.only_unsaved;
    let only_fixtures = editor.views.browser.only_fixtures;
    let hits: Vec<Hit> = {
        let Some(project) = &editor.project else {
            return;
        };
        let mut rows = Vec::new();
        let mut modules = Vec::new();
        let mut files = Vec::new();
        for table in editor.shapes.order.clone() {
            for file in project.files.paths_under(&format!("tables/{table}/")) {
                let Some((_, key)) = row_of(file) else {
                    continue;
                };
                if (only_unsaved && !project.is_unsaved(file))
                    || (only_fixtures && !editor.shapes.is_fixture(&table, key))
                {
                    continue;
                }
                let row = project.files.json(file);
                let name_hit = row.as_ref().is_some_and(|row| {
                    ["name", "title", "label"].iter().any(|f| {
                        row[*f]
                            .as_str()
                            .is_some_and(|t| t.to_lowercase().contains(&needle))
                    })
                });
                if key.to_lowercase().contains(&needle) || name_hit {
                    rows.push(Hit::Row {
                        table: table.clone(),
                        key: key.to_owned(),
                    });
                }
                if let Some(row) = &row {
                    for (index, module) in
                        row["modules"].as_array().into_iter().flatten().enumerate()
                    {
                        let kind = module["type"].as_str().unwrap_or("module").to_owned();
                        let name = module["name"].as_str().map(str::to_owned);
                        let kind_hit = kind.contains(&needle);
                        let name_hit = name
                            .as_ref()
                            .is_some_and(|n| n.to_lowercase().contains(&needle));
                        let reference_hit = module.as_object().is_some_and(|fields| {
                            fields.values().any(|v| {
                                v.as_str()
                                    .is_some_and(|s| s.to_lowercase().contains(&needle))
                            })
                        });
                        if kind_hit || name_hit || reference_hit {
                            modules.push(Hit::Module {
                                table: table.clone(),
                                key: key.to_owned(),
                                index,
                                kind,
                                name,
                            });
                        }
                    }
                }
            }
        }
        let mut folders: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
        for path in project.files.paths_under("assets/") {
            let relative = path.trim_start_matches("assets/");
            if let Some((folder, _)) = relative.rsplit_once('/')
                && folder.to_lowercase().contains(&needle)
            {
                folders.insert(folder.to_owned());
            } else if relative.to_lowercase().contains(&needle) {
                files.push(Hit::File {
                    path: relative.to_owned(),
                    folder: false,
                });
            }
        }
        for folder in folders {
            files.push(Hit::File {
                path: format!("{folder}/"),
                folder: true,
            });
        }
        rows.into_iter().chain(modules).chain(files).collect()
    };
    editor.status.left.push(format!(
        "{} result{} for \"{}\"",
        hits.len(),
        if hits.len() == 1 { "" } else { "s" },
        editor.views.browser.search.trim()
    ));
    let mut clicked: Option<(String, String, bool, bool)> = None;
    let mut action: Option<(String, String, Action)> = None;
    let mut open_module: Option<(String, String, usize)> = None;
    let mut open_file: Option<String> = None;
    let mut heading: Option<&str> = None;
    egui::ScrollArea::vertical()
        .id_salt("results")
        .show(ui, |ui| {
            for hit in &hits {
                let kind = match hit {
                    Hit::Row { .. } => "rows",
                    Hit::Module { .. } => "modules",
                    Hit::File { .. } => "files",
                };
                if heading != Some(kind) {
                    heading = Some(kind);
                    ui.add_space(4.0);
                    ui.label(theme::mono(kind).color(theme::CODE).size(12.5));
                }
                match hit {
                    Hit::Row { table, key } => {
                        let selected =
                            editor.selection.table == *table && editor.selection.keys.contains(key);
                        let response = result_line(
                            editor,
                            ui,
                            Some((table, key)),
                            &format!("{table}/{key}"),
                            None,
                            selected,
                        );
                        if response.clicked() {
                            let modifiers = ui.input(|i| i.modifiers);
                            clicked =
                                Some((table.clone(), key.clone(), modifiers.ctrl, modifiers.shift));
                        }
                        if response.double_clicked() {
                            action = Some((table.clone(), key.clone(), Action::Open));
                        }
                        response.context_menu(|ui| row_menu(ui, &mut action, table, key));
                    }
                    Hit::Module {
                        table,
                        key,
                        index,
                        kind,
                        name,
                    } => {
                        let label = name.clone().unwrap_or_else(|| kind.clone());
                        let response = result_line(
                            editor,
                            ui,
                            None,
                            &label,
                            Some((kind.as_str(), format!("{table}/{key}"))),
                            false,
                        );
                        if response.clicked() {
                            open_module = Some((table.clone(), key.clone(), *index));
                        }
                    }
                    Hit::File { path, folder } => {
                        let icon = if *folder { "▸" } else { "▫" };
                        let response = ui
                            .horizontal(|ui| {
                                ui.add_space(6.0);
                                ui.label(theme::muted(icon));
                                ui.add(
                                    egui::Label::new(
                                        theme::mono(path).color(theme::CODE).size(13.0),
                                    )
                                    .sense(Sense::click()),
                                )
                            })
                            .inner;
                        if response.clicked() {
                            open_file = Some(path.clone());
                        }
                    }
                }
            }
            if hits.is_empty() {
                ui.label(theme::muted("nothing matches"));
            }
        });
    if enter && let Some(first) = hits.first() {
        match first {
            Hit::Row { table, key } => action = Some((table.clone(), key.clone(), Action::Open)),
            Hit::Module {
                table, key, index, ..
            } => open_module = Some((table.clone(), key.clone(), *index)),
            Hit::File { path, .. } => open_file = Some(path.clone()),
        }
    }
    if let Some((table, key, ctrl, shift)) = clicked {
        select_row(editor, &table, &key, ctrl, shift);
    }
    if let Some((table, key, action)) = action {
        act(editor, &table, &key, action);
    }
    if let Some((table, key, index)) = open_module {
        editor.select(Selection {
            table: table.clone(),
            keys: vec![key.clone()],
            parts: vec![format!("/modules/{index}")],
        });
        editor.open_tab(Tab::for_row(&table, &key));
        editor.panels.right = RightTab::Inspector;
    }
    if let Some(path) = open_file {
        editor.panels.left = crate::app::LeftTab::Assets;
        editor.views.assets.search = path.trim_end_matches('/').to_owned();
        if !path.ends_with('/') {
            editor.select(Selection::row("asset", &path));
            editor.panels.right = RightTab::Inspector;
        }
    }
}

fn result_line(
    editor: &mut Editor,
    ui: &mut Ui,
    row: Option<(&str, &str)>,
    label: &str,
    module: Option<(&str, String)>,
    selected: bool,
) -> egui::Response {
    let full = ui.available_rect_before_wrap();
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), 22.0), Sense::click());
    if selected {
        ui.painter().rect_filled(rect, 3.0, theme::ACCENT_SOFT);
    } else if response.hovered() {
        ui.painter().rect_filled(
            rect,
            3.0,
            egui::Color32::from_rgba_unmultiplied(255, 255, 255, 8),
        );
    }
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(Layout::left_to_right(Align::Center)),
    );
    child.add_space(6.0);
    if let Some((kind, owner)) = module {
        widgets::badge(&mut child, kind);
        child.label(theme::mono(label).size(13.0));
        child.label(theme::faint("·"));
        child.label(theme::muted(owner).monospace().size(12.5));
    } else {
        if let Some((table, key)) = row
            && let Some((texture, uv, size)) = row_icon(editor, &child, table, key)
        {
            child.add(egui::Image::from_texture((texture, size)).uv(uv));
        }
        child.label(theme::mono(label).size(13.0).color(if selected {
            theme::TEXT
        } else {
            theme::CODE
        }));
    }
    response
}
