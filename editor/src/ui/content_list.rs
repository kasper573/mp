use std::collections::{BTreeMap, BTreeSet, HashMap};

use design_tokens::controls;
use design_tokens::glyph::{self, Mark};
use egui::{Align, Layout, Sense, Ui};
use engine::core::assets::AssetKind;
use engine::core::content::{
    ASSETS_DIR, ContentOwners, ContentRow, GAME_FILE, RowName, asset_of, row_file, row_of,
};
use engine::systems::area::world_map::WorldMapDef;

use super::browser::{self, BrowserAction, RowMenu};
use super::categories::CATEGORIES;
use super::tree::{self, TreeAction, TreeIcon, TreeNode, TreeState, TreeStyle};
use super::{theme, widgets};
use crate::app::{Editor, LeftTab};
use crate::keymap::EditorKey;
use crate::picker::{self, Dragged};
use crate::project::RowSelection;
use crate::tabs::{EditorTab, TabOpening};
use crate::user::ContentFolds;
use crate::value::RowValue;
use crate::{rows, ui};

/// Where a content list takes its rows from: the rows without an owner, or the rows local to one
/// owner.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum ContentSource {
    Global,
    LocalTo(RowName),
}

impl ContentSource {
    pub fn holds(&self, owners: &ContentOwners, table: &str, key: &str) -> bool {
        match self {
            ContentSource::Global => !owners.is_local(table, key),
            ContentSource::LocalTo(owner) => owners.owner(table, key) == Some(owner),
        }
    }

    pub fn owner(&self) -> Option<&RowName> {
        match self {
            ContentSource::Global => None,
            ContentSource::LocalTo(owner) => Some(owner),
        }
    }

    fn folds_key(&self) -> String {
        match self {
            ContentSource::Global => "global".to_owned(),
            ContentSource::LocalTo(owner) => format!("local:{owner}"),
        }
    }
}

/// One content list's own state: its search, its chips and the line its keys are on.
pub struct ContentList {
    pub search: String,
    pub only_unsaved: bool,
    pub only_fixtures: bool,
    pub only_unused: bool,
    pub hide_empty: bool,
    pub focus_search: bool,
    tree: TreeState,
}

impl ContentList {
    pub fn of(source: &ContentSource) -> ContentList {
        ContentList {
            search: String::new(),
            only_unsaved: false,
            only_fixtures: false,
            only_unused: false,
            hide_empty: matches!(source, ContentSource::LocalTo(_)),
            focus_search: false,
            tree: TreeState::default(),
        }
    }

    fn filtering(&self) -> bool {
        self.only_unsaved || self.only_fixtures || self.only_unused
    }
}

#[derive(Default)]
pub struct ContentLists {
    global: Option<ContentList>,
    local: HashMap<RowName, ContentList>,
    revealed: Option<(String, String)>,
}

impl ContentLists {
    pub fn get_mut(&mut self, source: &ContentSource) -> &mut ContentList {
        match source {
            ContentSource::Global => self.global.get_or_insert_with(|| ContentList::of(source)),
            ContentSource::LocalTo(owner) => self
                .local
                .entry(owner.clone())
                .or_insert_with(|| ContentList::of(source)),
        }
    }

    fn take(&mut self, source: &ContentSource) -> ContentList {
        let list = self.get_mut(source);
        std::mem::replace(list, ContentList::of(source))
    }

    fn put(&mut self, source: &ContentSource, list: ContentList) {
        *self.get_mut(source) = list;
    }
}

pub fn focus_search(editor: &mut Editor, source: &ContentSource) {
    editor.views.content.get_mut(source).focus_search = true;
}

/// How many rows a source holds, for a tab's or a heading's count.
pub fn count(editor: &Editor, source: &ContentSource) -> usize {
    let Some(project) = &editor.project else {
        return 0;
    };
    match source {
        ContentSource::Global => {
            let owners = project.files.owners();
            editor
                .shapes
                .order
                .iter()
                .map(|table| {
                    project
                        .files
                        .keys_of(table)
                        .filter(|key| !owners.is_local(table, key))
                        .count()
                })
                .sum()
        }
        ContentSource::LocalTo(owner) => project.files.owners().held_by(owner).len(),
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, source: &ContentSource) {
    if editor.project.is_none() {
        return;
    }
    reveal_active_row(editor);
    if *source == ContentSource::Global {
        browser::row_keys(editor, ui);
    }
    let mut list = editor.views.content.take(source);
    let placeholder = match source {
        ContentSource::Global => "Search rows, keys, files".to_owned(),
        ContentSource::LocalTo(owner) => format!("Search {}'s local content", owner.key),
    };
    let key = (*source == ContentSource::Global).then_some(EditorKey::Search);
    let response = widgets::search_box(ui, &mut list.search, &placeholder, key);
    if list.focus_search {
        response.request_focus();
        list.focus_search = false;
    }
    let enter = response.lost_focus() && ui.input(|i| EditorKey::Confirm.pressed(i));
    if response.has_focus() && ui.input(|i| EditorKey::Cancel.pressed(i)) {
        list.search.clear();
    }
    ui.horizontal(|ui| {
        if widgets::toggle_chip(ui, "unsaved", list.only_unsaved).clicked() {
            list.only_unsaved = !list.only_unsaved;
        }
        if widgets::toggle_chip(ui, "fixtures", list.only_fixtures).clicked() {
            list.only_fixtures = !list.only_fixtures;
        }
        if widgets::toggle_chip(ui, "unused", list.only_unused).clicked() {
            list.only_unused = !list.only_unused;
        }
        if widgets::toggle_chip(ui, "hide empty", list.hide_empty).clicked() {
            list.hide_empty = !list.hide_empty;
        }
    });
    ui.add_space(4.0);
    if list.search.trim().is_empty() {
        categories(editor, ui, source, &mut list);
    } else {
        results(editor, ui, source, &list, enter);
    }
    editor.views.content.put(source, list);
}

#[derive(Clone)]
enum TableAction {
    New,
    OpenTable,
}

const GAME_LINE: &str = GAME_FILE;

fn category_id(name: &str) -> String {
    format!("category:{name}")
}

fn categories(editor: &mut Editor, ui: &mut Ui, source: &ContentSource, list: &mut ContentList) {
    let project = editor.project.as_ref().expect("a project");
    let owners = project.files.owners();
    let folds = editor
        .settings
        .content_folds
        .get(&source.folds_key())
        .cloned()
        .unwrap_or_else(|| default_folds(source));
    let selection = editor.selection.clone();
    let filtering = list.filtering();
    let hide_empty = list.hide_empty || filtering;
    let mut open: BTreeSet<String> = folds.tables.clone();
    let mut nodes: Vec<TreeNode<TableAction>> = Vec::new();
    if *source == ContentSource::Global && !list.only_fixtures && !list.only_unused {
        let unsaved = project.is_unsaved(GAME_FILE);
        if !list.only_unsaved || unsaved {
            let mut game = TreeNode::leaf(GAME_LINE, "game");
            game.icon = TreeIcon::Mark(Mark::Gear);
            game.selected = selection.is_game();
            game.unsaved = unsaved;
            nodes.push(game);
        }
    }
    let mut rows_shown = 0;
    for category in CATEGORIES {
        let mut tables = Vec::new();
        let (mut matched, mut total) = (0, 0);
        let (mut unsaved, mut selected) = (false, false);
        for table in category.tables {
            if !editor.shapes.order.iter().any(|known| known == table) {
                continue;
            }
            let keys: Vec<&str> = project
                .files
                .keys_of(table)
                .filter(|key| source.holds(&owners, table, key))
                .collect();
            let rows: Vec<TreeNode<TableAction>> = keys
                .iter()
                .filter(|key| {
                    (!list.only_unsaved || project.is_unsaved(&row_file(table, key)))
                        && (!list.only_fixtures || editor.shapes.is_fixture(table, key))
                        && (!list.only_unused || project.unused.row(table, key).is_some())
                })
                .map(|key| row_node(project, &selection, table, key))
                .collect();
            total += keys.len();
            matched += rows.len();
            if hide_empty && rows.is_empty() {
                continue;
            }
            let mut node = TreeNode::folder(*table, *table, Vec::new());
            node.style = TreeStyle::Mono;
            node.unsaved = rows.iter().any(|row| row.unsaved);
            node.selected = rows.iter().any(|row| row.selected);
            node.count = Some(count_text(rows.len(), keys.len(), filtering));
            node.actions = table_actions(editor, source, table);
            if editor.shapes.is_closed(table) {
                node.note = Some("Fixtures: a fixed set of rows, so none can be added".to_owned());
            }
            unsaved |= node.unsaved;
            selected |= node.selected;
            node.children = Some(rows);
            tables.push(node);
        }
        if hide_empty && matched == 0 {
            continue;
        }
        rows_shown += matched;
        let id = category_id(category.name);
        if folds
            .categories
            .get(category.name)
            .copied()
            .unwrap_or(total > 0)
        {
            open.insert(id.clone());
        }
        let mut node = TreeNode::folder(id, category.name, tables);
        node.style = TreeStyle::Heading;
        node.count = Some(count_text(matched, total, filtering));
        node.unsaved = unsaved;
        node.selected = selected;
        node.note = Some(category_note(&node));
        nodes.push(node);
    }
    list.tree.open = open.into_iter().collect();
    let mut menu_action: Option<(String, String, BrowserAction)> = None;
    let mut budget = ui::assets::ICON_DECODES_PER_FRAME;
    let keys = ui.ui_contains_pointer();
    let out = egui::ScrollArea::vertical()
        .id_salt(("content-list", source.folds_key()))
        .show(ui, |ui| {
            if let ContentSource::LocalTo(owner) = source
                && rows_shown == 0
                && hide_empty
            {
                ui.label(theme::muted(if filtering {
                    "Nothing local matches the chips.".to_owned()
                } else {
                    format!(
                        "Nothing is local to {owner} yet. Turn hide empty off to reach every table's +."
                    )
                }));
            }
            let Editor {
                project,
                form,
                shapes,
                ..
            } = editor;
            let project = project.as_ref().expect("a project");
            tree::show(
                ui,
                &mut list.tree,
                &nodes,
                filtering,
                keys,
                tree::TreeHooks {
                    menu: Some(&mut |ui, id| {
                        if let Some((table, key)) = row_of(id) {
                            let menu = RowMenu::of(
                                &project.files,
                                &project.usages,
                                shapes.is_fixture(table, key),
                                &RowName::new(table, key),
                            );
                            if let Some(picked) = browser::row_menu(ui, &menu, true) {
                                menu_action = Some((table.to_owned(), key.to_owned(), picked));
                            }
                        }
                    }),
                    thumbs: Some(&mut |ctx, file| {
                        let (table, key) = row_of(file)?;
                        browser::row_icon(ctx, form, project, table, key, &mut budget)
                    }),
                },
            )
        })
        .inner;
    if !filtering && !out.toggled.is_empty() {
        let mut folds = folds;
        for id in &out.toggled {
            let now_open = list.tree.open.contains(id);
            match id.strip_prefix("category:") {
                Some(name) => {
                    folds.categories.insert(name.to_owned(), now_open);
                }
                None if now_open => {
                    folds.tables.insert(id.clone());
                }
                None => {
                    folds.tables.remove(id);
                }
            }
        }
        editor
            .settings
            .content_folds
            .insert(source.folds_key(), folds);
        editor.save_settings();
    }
    if let Some((table, action)) = out.action {
        table_act(editor, source, &table, action);
    }
    if let Some(entered) = out.entered
        && !entered.starts_with("category:")
    {
        editor.open_tab(EditorTab::Spreadsheet { table: entered });
    }
    let mut action = menu_action;
    if out
        .clicked
        .as_ref()
        .is_some_and(|(path, _)| path == GAME_LINE)
    {
        editor.select(RowSelection::game());
        editor.preview_tab(EditorTab::Game);
    }
    if out.double_clicked.as_deref() == Some(GAME_LINE) {
        editor.open_tab(EditorTab::Game);
    }
    if let Some((path, modifiers)) = out.clicked
        && let Some((table, key)) = row_of(&path)
    {
        let toggle = EditorKey::ToggleSelection.held_among(modifiers);
        let extend = EditorKey::ExtendSelection.held_among(modifiers);
        if table != WorldMapDef::TABLE && (toggle || extend) {
            browser::select_rows(editor, table, key, toggle, extend);
        } else {
            action = Some((table.to_owned(), key.to_owned(), BrowserAction::Open));
        }
    }
    if let Some(path) = out.double_clicked
        && let Some((table, key)) = row_of(&path)
    {
        action = Some((table.to_owned(), key.to_owned(), BrowserAction::OpenTab));
    }
    if let Some((table, key, action)) = action {
        browser::act(editor, &table, &key, action);
    }
}

fn default_folds(source: &ContentSource) -> ContentFolds {
    ContentFolds {
        categories: BTreeMap::new(),
        tables: match source {
            ContentSource::Global => BTreeSet::new(),
            ContentSource::LocalTo(_) => CATEGORIES
                .iter()
                .flat_map(|category| category.tables)
                .map(|table| (*table).to_owned())
                .collect(),
        },
    }
}

fn row_node(
    project: &crate::project::Project,
    selection: &RowSelection,
    table: &str,
    key: &str,
) -> TreeNode<TableAction> {
    let file = row_file(table, key);
    let mut node = TreeNode::leaf(&file, key);
    node.selected = selection.table == table && selection.keys.iter().any(|k| k == key);
    node.icon = TreeIcon::Thumb(file.clone());
    node.unsaved = project.is_unsaved(&file);
    node.spoken = Some(match project.files.owners().owner(table, key) {
        Some(owner) => format!("{key}, {table}, local to {owner}"),
        None => format!("{key}, {table}"),
    });
    node.drag = Some(Dragged::Row {
        table: table.to_owned(),
        key: key.to_owned(),
    });
    node
}

fn count_text(matched: usize, total: usize, filtering: bool) -> String {
    if filtering {
        format!("{matched} of {total}")
    } else {
        total.to_string()
    }
}

fn category_note(category: &TreeNode<TableAction>) -> String {
    let tables: Vec<String> = category
        .children
        .iter()
        .flatten()
        .map(|table| {
            format!(
                "{} {}",
                table.label,
                table.children.as_ref().map_or(0, Vec::len)
            )
        })
        .collect();
    let unsaved: Vec<String> = category
        .children
        .iter()
        .flatten()
        .flat_map(|table| table.children.iter().flatten())
        .filter(|row| row.unsaved)
        .filter_map(|row| row_of(&row.id).map(|(table, key)| format!("{table}/{key}")))
        .collect();
    let mut note = format!("{}\n{}", category.label, tables.join(" · "));
    if !unsaved.is_empty() {
        note.push_str(&format!(
            "\n{} unsaved: {}",
            unsaved.len(),
            unsaved.join(", ")
        ));
    }
    note
}

fn table_actions(
    editor: &Editor,
    source: &ContentSource,
    table: &str,
) -> Vec<TreeAction<TableAction>> {
    let open = TreeAction {
        mark: Mark::Grid,
        tip: "Open table".to_owned(),
        menu_label: "Open table".to_owned(),
        action: TableAction::OpenTable,
    };
    if editor.shapes.is_closed(table) {
        return vec![open];
    }
    let tip = match source {
        ContentSource::Global => format!("New {table}"),
        ContentSource::LocalTo(owner) => format!("New {table} local to {owner}"),
    };
    vec![
        TreeAction {
            mark: Mark::Plus,
            menu_label: format!("{tip}…"),
            tip,
            action: TableAction::New,
        },
        open,
    ]
}

fn table_act(editor: &mut Editor, source: &ContentSource, table: &str, action: TableAction) {
    match action {
        TableAction::New => rows::new_row_dialog(editor, table, source.owner().cloned()),
        TableAction::OpenTable => editor.open_tab(EditorTab::Spreadsheet {
            table: table.to_owned(),
        }),
    }
}

/// Unfolds the way to the row the active tab shows, in the content list that holds it, and
/// scrolls it into view, once each time the active tab changes.
fn reveal_active_row(editor: &mut Editor) {
    let Some((table, key)) = ui::active_tab(editor).and_then(|tab| tab.row()) else {
        return;
    };
    if editor.views.content.revealed.as_ref() == Some(&(table.clone(), key.clone())) {
        return;
    }
    editor.views.content.revealed = Some((table.clone(), key.clone()));
    let Some(project) = &editor.project else {
        return;
    };
    let source = match project.files.owners().owner(&table, &key) {
        Some(owner) => ContentSource::LocalTo(owner.clone()),
        None => ContentSource::Global,
    };
    let Some(category) = super::categories::category_of(&table) else {
        return;
    };
    let folds_key = source.folds_key();
    let mut folds = editor
        .settings
        .content_folds
        .get(&folds_key)
        .cloned()
        .unwrap_or_else(|| default_folds(&source));
    let unfolded_category = folds.categories.insert(category.name.to_owned(), true) != Some(true);
    let unfolded_table = folds.tables.insert(table.clone());
    if unfolded_category || unfolded_table {
        editor.settings.content_folds.insert(folds_key, folds);
        editor.save_settings();
    }
    editor.views.content.get_mut(&source).tree.reveal = Some(row_file(&table, &key));
}

enum Hit {
    Row {
        table: String,
        key: String,
        owner: Option<RowName>,
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

impl Hit {
    fn group(&self) -> &'static str {
        match self {
            Hit::Row { owner: None, .. } => "rows",
            Hit::Row { owner: Some(_), .. } => "local content",
            Hit::Module { .. } => "modules",
            Hit::File { .. } => "files",
        }
    }
}

fn results(
    editor: &mut Editor,
    ui: &mut Ui,
    source: &ContentSource,
    list: &ContentList,
    enter: bool,
) {
    let needle = list.search.trim().to_lowercase();
    let hits: Vec<Hit> = {
        let Some(project) = &editor.project else {
            return;
        };
        let owners = project.files.owners();
        let mut global_rows = Vec::new();
        let mut local_rows = Vec::new();
        let mut modules = Vec::new();
        let mut files = Vec::new();
        for table in editor.shapes.order.clone() {
            for key in project.files.keys_of(&table) {
                let owner = owners.owner(&table, key).cloned();
                if let ContentSource::LocalTo(held_by) = source
                    && owner.as_ref() != Some(held_by)
                {
                    continue;
                }
                let file = row_file(&table, key);
                if (list.only_unsaved && !project.is_unsaved(&file))
                    || (list.only_fixtures && !editor.shapes.is_fixture(&table, key))
                    || (list.only_unused && project.unused.row(&table, key).is_none())
                {
                    continue;
                }
                let row = project.files.json(&file);
                let name_hit = row.as_ref().is_some_and(|row| {
                    ["name", "title", "label"].iter().any(|f| {
                        row[*f]
                            .as_str()
                            .is_some_and(|t| t.to_lowercase().contains(&needle))
                    })
                });
                if key.to_lowercase().contains(&needle) || name_hit {
                    let local = owner.is_some() && *source == ContentSource::Global;
                    let hit = Hit::Row {
                        table: table.clone(),
                        key: key.to_owned(),
                        owner: if local { owner } else { None },
                    };
                    if local {
                        local_rows.push(hit);
                    } else {
                        global_rows.push(hit);
                    }
                }
                if let Some(row) = &row {
                    for (index, module) in
                        row["modules"].as_array().into_iter().flatten().enumerate()
                    {
                        let kind = module.kind_or("module").to_owned();
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
        if *source == ContentSource::Global {
            let mut folders: BTreeSet<String> = BTreeSet::new();
            for path in project.files.paths_under(&format!("{ASSETS_DIR}/")) {
                let relative = asset_of(path);
                if AssetKind::of(relative).is_none()
                    || list.only_fixtures
                    || (list.only_unused && !project.unused.has_asset(relative))
                    || (list.only_unsaved && !project.is_unsaved(path))
                {
                    continue;
                }
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
        }
        global_rows
            .into_iter()
            .chain(local_rows)
            .chain(modules)
            .chain(files)
            .collect()
    };
    let local = hits
        .iter()
        .filter(|hit| matches!(hit, Hit::Row { owner: Some(_), .. }))
        .count();
    editor.status.left.push(format!(
        "{} result{} for \"{}\"{}",
        hits.len(),
        widgets::plural(hits.len()),
        list.search.trim(),
        if local > 0 {
            format!(" · {local} local content")
        } else {
            String::new()
        }
    ));
    let owners = editor
        .project
        .as_ref()
        .map(|project| project.files.owners())
        .unwrap_or_default();
    let mut clicked: Option<(String, String, bool, bool)> = None;
    let mut action: Option<(String, String, BrowserAction)> = None;
    let mut open_module: Option<(String, String, usize, TabOpening)> = None;
    let mut open_file: Option<String> = None;
    let mut heading: Option<&str> = None;
    egui::ScrollArea::vertical()
        .id_salt(("results", source.folds_key()))
        .show(ui, |ui| {
            for hit in &hits {
                let group = hit.group();
                if heading != Some(group) {
                    heading = Some(group);
                    ui.add_space(4.0);
                    ui.label(widgets::section_heading(group));
                }
                match hit {
                    Hit::Row { table, key, owner } => {
                        let selected =
                            editor.selection.table == *table && editor.selection.keys.contains(key);
                        let note = owner.as_ref().map(|owner| {
                            if owners.is_local(&owner.table, &owner.key) {
                                format!("› {}", owner.key)
                            } else {
                                owner.key.clone()
                            }
                        });
                        let response = result_line(
                            editor,
                            ui,
                            Some((table, key)),
                            &format!("{table}/{key}"),
                            None,
                            note.as_deref(),
                            selected,
                        );
                        if response.clicked() {
                            let (toggle, extend) = ui.input(|i| {
                                (
                                    EditorKey::ToggleSelection.held(i),
                                    EditorKey::ExtendSelection.held(i),
                                )
                            });
                            clicked = Some((table.clone(), key.clone(), toggle, extend));
                        }
                        if response.double_clicked() {
                            action = Some((table.clone(), key.clone(), BrowserAction::OpenTab));
                        }
                        let fixture = editor.shapes.is_fixture(table, key);
                        response.context_menu(|ui| {
                            let Some(project) = &editor.project else {
                                return;
                            };
                            let menu = RowMenu::of(
                                &project.files,
                                &project.usages,
                                fixture,
                                &RowName::new(table, key),
                            );
                            if let Some(picked) = browser::row_menu(ui, &menu, true) {
                                action = Some((table.clone(), key.clone(), picked));
                            }
                        });
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
                            None,
                            false,
                        );
                        if response.clicked() {
                            open_module =
                                Some((table.clone(), key.clone(), *index, TabOpening::Preview));
                        }
                        if response.double_clicked() {
                            open_module =
                                Some((table.clone(), key.clone(), *index, TabOpening::Kept));
                        }
                    }
                    Hit::File { path, folder } => {
                        let icon = if *folder {
                            Mark::ChevronRight
                        } else {
                            Mark::Page
                        };
                        let response = ui
                            .horizontal(|ui| {
                                ui.add_space(6.0);
                                glyph::show(ui, icon, 11.0, theme::MUTED);
                                let sense = if *folder {
                                    Sense::click()
                                } else {
                                    Sense::click_and_drag()
                                };
                                let response = ui.add(
                                    egui::Label::new(
                                        theme::mono(path).color(theme::CODE).size(13.0),
                                    )
                                    .sense(sense),
                                );
                                if !*folder {
                                    picker::carry(ui, &response, &Dragged::Asset(path.clone()));
                                }
                                response
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
            Hit::Row { table, key, .. } => {
                action = Some((table.clone(), key.clone(), BrowserAction::Open))
            }
            Hit::Module {
                table, key, index, ..
            } => open_module = Some((table.clone(), key.clone(), *index, TabOpening::Preview)),
            Hit::File { path, .. } => open_file = Some(path.clone()),
        }
    }
    if let Some((table, key, toggle, extend)) = clicked {
        if toggle || extend {
            browser::select_rows(editor, &table, &key, toggle, extend);
        } else {
            browser::act(editor, &table, &key, BrowserAction::Open);
        }
    }
    if let Some((table, key, action)) = action {
        browser::act(editor, &table, &key, action);
    }
    if let Some((table, key, index, opening)) = open_module {
        editor.select(RowSelection {
            table: table.clone(),
            keys: vec![key.clone()],
            parts: vec![format!("/modules/{index}")],
        });
        let tab = EditorTab::for_row(&table, &key);
        match opening {
            TabOpening::Preview => editor.preview_tab(tab),
            TabOpening::Kept => editor.open_tab(tab),
        }
    }
    if let Some(path) = open_file {
        open_asset(editor, path);
    }
}

/// Shows an asset file, or a folder when `path` ends in a slash, in the assets panel, and opens
/// a file's tab.
pub fn open_asset(editor: &mut Editor, path: String) {
    editor.panels.left = LeftTab::Assets;
    editor.views.assets.search = path.trim_end_matches('/').to_owned();
    if !path.ends_with('/') {
        editor.select(RowSelection::row("asset", &path));
        editor.preview_tab(EditorTab::Asset { path });
    }
}

fn result_line(
    editor: &mut Editor,
    ui: &mut Ui,
    row: Option<(&str, &str)>,
    label: &str,
    module: Option<(&str, String)>,
    note: Option<&str>,
    selected: bool,
) -> egui::Response {
    let full = ui.available_rect_before_wrap();
    let sense = if row.is_some() {
        Sense::click_and_drag()
    } else {
        Sense::click()
    };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(full.width(), 22.0), sense);
    if let Some((table, key)) = row {
        picker::carry(
            ui,
            &response,
            &Dragged::Row {
                table: table.to_owned(),
                key: key.to_owned(),
            },
        );
    }
    ui.painter()
        .add(controls::row_marks(rect, response.hovered(), selected));
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(Layout::left_to_right(Align::Center)),
    );
    child.add_space(6.0);
    if let Some((kind, owner)) = &module {
        widgets::badge(&mut child, kind);
        child.label(theme::mono(label).size(13.0));
        child.label(theme::faint("·"));
        child.label(theme::muted(owner).monospace().size(12.5));
    } else if let Some((table, key)) = row {
        let mut budget = super::assets::ICON_DECODES_PER_FRAME;
        let icon = editor.project.as_ref().and_then(|project| {
            browser::row_icon(
                &child.ctx().clone(),
                &mut editor.form,
                project,
                table,
                key,
                &mut budget,
            )
        });
        if let Some(icon) = icon {
            child.add(egui::Image::from_texture((icon.texture, icon.size)).uv(icon.uv));
        }
    }
    if module.is_none() {
        child.label(theme::mono(label).size(13.0).color(if selected {
            theme::TEXT
        } else {
            theme::CODE
        }));
    }
    if let Some(note) = note {
        child.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.add_space(4.0);
            ui.label(theme::faint(note).size(12.0));
        });
    }
    response
}
