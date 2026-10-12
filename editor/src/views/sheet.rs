use std::collections::{BTreeMap, BTreeSet, HashMap};

use egui::{Color32, Key, Sense, Ui, Vec2};
use serde_json::Value;

use crate::app::Editor;
use crate::forms::{FormCx, FormState};
use crate::project::{Edit, Selection, row_file};
use crate::schema::{self, Kind};
use crate::tabs::Tab;
use crate::ui::theme;
use crate::ui::widgets;
use crate::user::SpreadsheetView;

const ROW_H: f32 = 29.0;
const KEY_W: f32 = 110.0;
const CELL_W: f32 = 84.0;
const MAX_DEFAULT_COLUMNS: usize = 9;

#[derive(Default)]
pub struct SheetViews {
    pub views: HashMap<String, SheetState>,
}

#[derive(Default)]
pub struct SheetState {
    pub search: String,
    pub selected: Option<(String, String)>,
    pub anchor: Option<(String, String)>,
    pub editing: Option<String>,
    pub form: FormState,
    pub last_edit: Option<(String, String, String)>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Source {
    Key,
    First(Vec<String>),
    Module { tag: String, path: Vec<String> },
}

#[derive(Clone, Debug)]
pub struct Column {
    pub id: String,
    pub title: String,
    pub sub: String,
    pub source: Source,
    pub schema: Value,
    pub numeric: bool,
}

pub struct Row {
    pub key: String,
    pub value: Value,
}

impl Column {
    pub fn get<'a>(&self, row: &'a Value) -> Option<&'a Value> {
        match &self.source {
            Source::Key => None,
            Source::First(path) => dig(row, path),
            Source::Module { tag, path } => {
                let module = row["modules"]
                    .as_array()?
                    .iter()
                    .find(|module| module["type"] == *tag)?;
                dig(module, path)
            }
        }
    }

    pub fn text(&self, row: &Row) -> Option<String> {
        if self.source == Source::Key {
            return Some(row.key.clone());
        }
        self.get(&row.value).map(cell_text)
    }

    pub fn number(&self, row: &Row) -> Option<f64> {
        self.get(&row.value).and_then(Value::as_f64)
    }

    pub fn lacks_module(&self, row: &Row) -> bool {
        match &self.source {
            Source::Module { tag, .. } => !row.value["modules"]
                .as_array()
                .is_some_and(|modules| modules.iter().any(|module| module["type"] == *tag)),
            _ => false,
        }
    }

    pub fn origin(&self) -> String {
        match &self.source {
            Source::Key => "the row's key".to_owned(),
            Source::First(path) if path.len() == 1 => "first-class".to_owned(),
            Source::First(path) => {
                format!("the {} list, first-class", path[..path.len() - 1].join("."))
            }
            Source::Module { tag, path } if path.len() == 1 => format!("the {tag} module"),
            Source::Module { tag, path } => {
                format!("{} in the {tag} module", path[..path.len() - 1].join("."))
            }
        }
    }
}

fn dig<'a>(value: &'a Value, path: &[String]) -> Option<&'a Value> {
    let mut current = value;
    for step in path {
        current = current.get(step)?;
    }
    Some(current)
}

fn cell_text(value: &Value) -> String {
    match value {
        Value::Null => "none".to_owned(),
        Value::Bool(flag) => if *flag { "yes" } else { "no" }.to_owned(),
        Value::Number(number) => number
            .as_f64()
            .map(crate::forms::trim_number)
            .unwrap_or_else(|| number.to_string()),
        Value::String(text) => text.clone(),
        Value::Array(items) => format!("{} items", items.len()),
        Value::Object(fields) => format!("{} fields", fields.len()),
    }
}

pub fn columns_of(editor: &Editor, table: &str, rows: &[Row]) -> Vec<Column> {
    let mut columns = vec![Column {
        id: "key".to_owned(),
        title: "key".to_owned(),
        sub: String::new(),
        source: Source::Key,
        schema: Value::Null,
        numeric: false,
    }];
    let Some(shape) = editor.shapes.table(table) else {
        return columns;
    };
    let root = &shape.shape;
    let mut path = Vec::new();
    leaves(root, root, &mut path, &mut |path, schema| {
        if path.first().is_some_and(|first| first == "modules") {
            return;
        }
        let sub = match path.len() {
            1 => "first-class".to_owned(),
            _ => path[path.len() - 2].trim_end_matches('s').to_owned(),
        };
        columns.push(Column {
            id: path.join("."),
            title: path.last().cloned().unwrap_or_default(),
            sub,
            source: Source::First(path.to_vec()),
            numeric: is_numeric(root, schema),
            schema: schema.clone(),
        });
    });
    if let Some(modules) = editor.shapes.modules_of(table)
        && let Kind::Union(variants) = schema::kind(root, modules)
    {
        for variant in variants {
            let mut path = Vec::new();
            leaves(root, variant.schema, &mut path, &mut |path, schema| {
                if path.first().is_some_and(|first| first == &variant.field) {
                    return;
                }
                let sub = match path.len() {
                    1 => short_tag(&variant.tag),
                    _ => path[path.len() - 2].trim_end_matches('s').to_owned(),
                };
                columns.push(Column {
                    id: format!("{}.{}", variant.tag, path.join(".")),
                    title: path.last().cloned().unwrap_or_default(),
                    sub,
                    source: Source::Module {
                        tag: variant.tag.clone(),
                        path: path.to_vec(),
                    },
                    numeric: is_numeric(root, schema),
                    schema: schema.clone(),
                });
            });
            let mut keyed: BTreeMap<String, (String, bool)> = BTreeMap::new();
            for row in rows {
                let Some(modules) = row.value["modules"].as_array() else {
                    continue;
                };
                for module in modules.iter().filter(|m| m["type"] == variant.tag) {
                    for (name, field) in schema::properties(variant.schema) {
                        if !matches!(schema::kind(root, field), Kind::Map(_)) {
                            continue;
                        }
                        if let Some(map) = module[name].as_object() {
                            for (entry, value) in map {
                                keyed
                                    .entry(format!("{name}.{entry}"))
                                    .or_insert((name.clone(), value.is_number()));
                            }
                        }
                    }
                }
            }
            for (id, (map_name, numeric)) in keyed {
                let entry = id[map_name.len() + 1..].to_owned();
                columns.push(Column {
                    id: format!("{}.{id}", variant.tag),
                    title: entry.clone(),
                    sub: map_name.trim_end_matches('s').to_owned(),
                    source: Source::Module {
                        tag: variant.tag.clone(),
                        path: vec![map_name, entry],
                    },
                    schema: serde_json::json!({ "type": if numeric { "number" } else { "string" } }),
                    numeric,
                });
            }
        }
    }
    columns
}

fn short_tag(tag: &str) -> String {
    match tag {
        "shared_script" => "shared".to_owned(),
        "inline_script" => "inline".to_owned(),
        other => other.to_owned(),
    }
}

fn is_numeric(root: &Value, schema: &Value) -> bool {
    matches!(schema::kind(root, schema), Kind::Integer | Kind::Number)
}

fn leaves(
    root: &Value,
    schema: &Value,
    path: &mut Vec<String>,
    out: &mut dyn FnMut(&[String], &Value),
) {
    if path.len() > 3 {
        return;
    }
    let schema = schema::resolve(root, schema);
    match schema::kind(root, schema) {
        Kind::Object
            if schema::marker(schema).is_none()
                && crate::forms::geometry_of(root, schema).is_none() =>
        {
            for (name, field) in schema::properties(schema) {
                path.push(name.clone());
                leaves(root, field, path, out);
                path.pop();
            }
        }
        Kind::Text
        | Kind::Integer
        | Kind::Number
        | Kind::Boolean
        | Kind::Enum(_)
        | Kind::Object => {
            if !path.is_empty() {
                out(path, schema);
            }
        }
        Kind::Choice(alternatives)
            if !path.is_empty()
                && alternatives.iter().any(|alt| {
                    matches!(
                        schema::kind(root, alt),
                        Kind::Text | Kind::Integer | Kind::Number | Kind::Boolean | Kind::Enum(_)
                    )
                }) =>
        {
            out(path, schema);
        }
        _ => {}
    }
}

pub fn rows_of(editor: &Editor, table: &str) -> Vec<Row> {
    let Some(project) = editor.project.as_ref() else {
        return Vec::new();
    };
    let prefix = format!("tables/{table}/");
    let mut rows: Vec<Row> = project
        .files
        .paths_under(&prefix)
        .filter_map(|path| {
            let key = path.strip_prefix(&prefix)?.strip_suffix(".json")?;
            if key.contains('/') {
                return None;
            }
            Some(Row {
                key: key.to_owned(),
                value: project.files.json(path)?,
            })
        })
        .collect();
    rows.sort_by(|a, b| a.key.cmp(&b.key));
    rows
}

fn view_of(editor: &Editor, table: &str, columns: &[Column]) -> SpreadsheetView {
    let mut view = editor
        .settings
        .views
        .get(table)
        .cloned()
        .unwrap_or_default();
    if view.columns.is_empty() {
        view.columns = columns
            .iter()
            .filter(|column| column.source != Source::Key)
            .take(MAX_DEFAULT_COLUMNS)
            .map(|column| column.id.clone())
            .collect();
    }
    view
}

fn save_view(editor: &mut Editor, table: &str, view: SpreadsheetView) {
    editor.settings.views.insert(table.to_owned(), view);
    editor.save_settings();
}

fn combat_scripts(editor: &Editor) -> BTreeSet<String> {
    let Some(project) = editor.project.as_ref() else {
        return BTreeSet::new();
    };
    project
        .files
        .paths_under("tables/script/")
        .filter_map(|path| {
            let key = path.strip_prefix("tables/script/")?.strip_suffix(".json")?;
            let row = project.files.json(path)?;
            let fights = row["nodes"]
                .as_object()
                .is_some_and(|nodes| nodes.values().any(|node| node["type"] == "attack"));
            fights.then(|| key.to_owned())
        })
        .collect()
}

fn filters_of(view: &SpreadsheetView) -> Vec<String> {
    view.filter
        .split(';')
        .map(str::trim)
        .filter(|f| !f.is_empty())
        .map(str::to_owned)
        .collect()
}

fn passes(row: &Row, filter: &str, combat: &BTreeSet<String>, columns: &[Column]) -> bool {
    if filter == "can be fought" {
        return row.value["modules"].as_array().is_some_and(|modules| {
            modules.iter().any(|module| {
                module["type"] == "shared_script"
                    && module["script"]
                        .as_str()
                        .is_some_and(|key| combat.contains(key))
            })
        });
    }
    if let Some(tag) = filter.strip_prefix("has ") {
        return row.value["modules"]
            .as_array()
            .is_some_and(|modules| modules.iter().any(|module| module["type"] == tag));
    }
    if let Some(tag) = filter.strip_prefix("lacks ") {
        return !row.value["modules"]
            .as_array()
            .is_some_and(|modules| modules.iter().any(|module| module["type"] == tag));
    }
    for operator in [">=", "<=", "=", ">", "<"] {
        if let Some((column_id, wanted)) = filter.split_once(operator) {
            let (column_id, wanted) = (column_id.trim(), wanted.trim());
            let Some(column) = columns
                .iter()
                .find(|c| c.id == column_id || c.title == column_id)
            else {
                return true;
            };
            return match (column.number(row), wanted.parse::<f64>()) {
                (Some(have), Ok(want)) => match operator {
                    ">=" => have >= want,
                    "<=" => have <= want,
                    ">" => have > want,
                    "<" => have < want,
                    _ => (have - want).abs() < f64::EPSILON,
                },
                _ => column
                    .text(row)
                    .is_some_and(|text| operator == "=" && text.eq_ignore_ascii_case(wanted)),
            };
        }
    }
    true
}

fn matches_search(row: &Row, search: &str, columns: &[Column]) -> bool {
    let needle = search.trim().to_lowercase();
    if needle.is_empty() {
        return true;
    }
    row.key.to_lowercase().contains(&needle)
        || columns
            .iter()
            .filter_map(|column| column.text(row))
            .any(|text| text.to_lowercase().contains(&needle))
}

fn sort_rows(rows: &mut [Row], column: &Column, descending: bool) {
    rows.sort_by(|a, b| {
        let order = match column.numeric {
            true => match (column.number(a), column.number(b)) {
                (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            },
            false => match (column.text(a), column.text(b)) {
                (Some(x), Some(y)) => x.to_lowercase().cmp(&y.to_lowercase()),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            },
        };
        match descending {
            true => order.reverse(),
            false => order,
        }
        .then_with(|| a.key.cmp(&b.key))
    });
}

pub fn shown_rows(editor: &Editor, table: &str) -> (Vec<Row>, Vec<Column>, SpreadsheetView, usize) {
    let all = rows_of(editor, table);
    let columns = columns_of(editor, table, &all);
    let view = view_of(editor, table, &columns);
    let combat = combat_scripts(editor);
    let filters = filters_of(&view);
    let search = editor
        .views
        .sheet
        .views
        .get(table)
        .map(|state| state.search.clone())
        .unwrap_or_default();
    let total = all.len();
    let mut rows: Vec<Row> = all
        .into_iter()
        .filter(|row| {
            filters
                .iter()
                .all(|filter| passes(row, filter, &combat, &columns))
        })
        .filter(|row| matches_search(row, &search, &columns))
        .collect();
    if let Some((id, descending)) = &view.sort
        && let Some(column) = columns.iter().find(|c| c.id == *id)
    {
        sort_rows(&mut rows, column, *descending);
    }
    (rows, columns, view, total)
}

pub fn show(editor: &mut Editor, ui: &mut Ui, table: &str) {
    editor
        .views
        .sheet
        .views
        .entry(table.to_owned())
        .or_default();
    let (rows, columns, mut view, total) = shown_rows(editor, table);
    let shown: Vec<&Column> = view
        .columns
        .iter()
        .filter_map(|id| columns.iter().find(|c| c.id == *id))
        .collect();
    let mut view_changed = false;
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(12, 8))
        .show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            view_changed |= toolbar(editor, ui, table, &columns, &mut view, rows.len(), total);
            ui.add_space(6.0);
            let shown: Vec<Column> = shown.into_iter().cloned().collect();
            view_changed |= table_body(editor, ui, table, &rows, &shown, &mut view);
        });
    if view_changed {
        save_view(editor, table, view);
    }
}

fn toolbar(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    columns: &[Column],
    view: &mut SpreadsheetView,
    shown: usize,
    total: usize,
) -> bool {
    let mut changed = false;
    let mut filters = filters_of(view);
    let module_tags: Vec<String> = editor
        .shapes
        .modules_of(table)
        .and_then(
            |modules| match schema::kind(&editor.shapes.table(table)?.shape, modules) {
                Kind::Union(variants) => Some(variants.into_iter().map(|v| v.tag).collect()),
                _ => None,
            },
        )
        .unwrap_or_default();
    let has_combat = table == "npc" && !combat_scripts(editor).is_empty();
    ui.horizontal(|ui| {
        let state = editor
            .views
            .sheet
            .views
            .get_mut(table)
            .expect("the sheet state");
        ui.allocate_ui(Vec2::new(220.0, 26.0), |ui| {
            widgets::search_box(ui, &mut state.search, "Filter rows", None);
        });
        let mut removed = None;
        for (index, filter) in filters.iter().enumerate() {
            let (_, closed) = widgets::chip_closable(ui, filter);
            if closed {
                removed = Some(index);
            }
        }
        if let Some(index) = removed {
            filters.remove(index);
            changed = true;
        }
        ui.menu_button("+ filter", |ui| {
            if has_combat && ui.button("can be fought").clicked() {
                filters.push("can be fought".to_owned());
                changed = true;
                ui.close();
            }
            for tag in &module_tags {
                if ui.button(format!("has {tag}")).clicked() {
                    filters.push(format!("has {tag}"));
                    changed = true;
                    ui.close();
                }
            }
            for tag in &module_tags {
                if ui.button(format!("lacks {tag}")).clicked() {
                    filters.push(format!("lacks {tag}"));
                    changed = true;
                    ui.close();
                }
            }
            ui.separator();
            ui.label(theme::faint("a column test, like damage > 5"));
            let id = ui.id().with("custom-filter");
            let mut text: String = ui.memory(|m| m.data.get_temp(id)).unwrap_or_default();
            let response = ui.add(
                egui::TextEdit::singleline(&mut text)
                    .desired_width(160.0)
                    .hint_text("column > value"),
            );
            if response.lost_focus()
                && ui.input(|i| i.key_pressed(Key::Enter))
                && !text.trim().is_empty()
            {
                filters.push(text.trim().to_owned());
                text.clear();
                changed = true;
                ui.close();
            }
            ui.memory_mut(|m| m.data.insert_temp(id, text));
        });
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(theme::muted(format!("{shown} of {total} rows")));
            ui.menu_button("columns ▾", |ui| {
                ui.set_min_width(220.0);
                egui::ScrollArea::vertical()
                    .max_height(400.0)
                    .show(ui, |ui| {
                        for column in columns.iter().filter(|c| c.source != Source::Key) {
                            let mut on = view.columns.contains(&column.id);
                            let label = match column.sub.is_empty() {
                                true => column.title.clone(),
                                false => format!("{} · {}", column.title, column.sub),
                            };
                            if ui.checkbox(&mut on, label).changed() {
                                match on {
                                    true => view.columns.push(column.id.clone()),
                                    false => view.columns.retain(|id| *id != column.id),
                                }
                                changed = true;
                            }
                        }
                    });
            });
        });
    });
    if changed {
        view.filter = filters.join(";");
    }
    changed
}

struct Hit {
    key: String,
    column: String,
    shift: bool,
    double: bool,
}

fn table_body(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    rows: &[Row],
    shown: &[Column],
    view: &mut SpreadsheetView,
) -> bool {
    let mut view_changed = false;
    let mut hit: Option<Hit> = None;
    let mut sort_click: Option<String> = None;
    let keyboard_free = !ui.ctx().egui_wants_keyboard_input();
    let (selected, anchor, editing) = {
        let state = &editor.views.sheet.views[table];
        (
            state.selected.clone(),
            state.anchor.clone(),
            state.editing.clone(),
        )
    };
    let range = selection_range(rows, shown, &selected, &anchor);
    let mut commit: Option<(String, String, Value, String)> = None;
    let mut stop_editing = false;
    let widths: Vec<f32> = shown
        .iter()
        .map(|column| match column.source {
            Source::Key => KEY_W,
            _ if column.title == "name" => 120.0,
            _ if column.title == "script" => 150.0,
            _ => CELL_W,
        })
        .collect();
    let header_h = 36.0;
    ui.horizontal(|ui| {
        ui.add_space(22.0);
        for (column, width) in shown.iter().zip(&widths) {
            let (rect, response) =
                ui.allocate_exact_size(Vec2::new(*width, header_h), Sense::click());
            let painter = ui.painter();
            let sorted = view.sort.as_ref().filter(|(id, _)| *id == column.id);
            let title = match sorted {
                Some((_, true)) => format!("{} ▾", column.title.to_uppercase()),
                Some((_, false)) => format!("{} ▴", column.title.to_uppercase()),
                None => column.title.to_uppercase(),
            };
            let align = match column.numeric {
                true => egui::Align2::RIGHT_TOP,
                false => egui::Align2::LEFT_TOP,
            };
            let x = match column.numeric {
                true => rect.max.x - 6.0,
                false => rect.min.x + 4.0,
            };
            painter.text(
                egui::pos2(x, rect.min.y + 2.0),
                align,
                clip_text(&title, *width - 10.0, 11.5),
                egui::FontId::new(11.5, egui::FontFamily::Name("medium".into())),
                theme::MUTED,
            );
            painter.text(
                egui::pos2(x, rect.min.y + 18.0),
                align,
                &column.sub,
                egui::FontId::proportional(10.5),
                theme::FAINT,
            );
            if response.clicked() {
                sort_click = Some(column.id.clone());
            }
            if response.hovered() {
                response.on_hover_text(format!("{} · {}", column.id, column.origin()));
            }
        }
    });
    if let Some(id) = sort_click {
        view.sort = match &view.sort {
            Some((current, true)) if *current == id => Some((id, false)),
            Some((current, false)) if *current == id => None,
            _ => Some((id, true)),
        };
        view_changed = true;
    }
    let separator = ui.available_rect_before_wrap();
    ui.painter().hline(
        separator.min.x..=separator.max.x,
        separator.min.y,
        egui::Stroke::new(1.0, theme::BORDER),
    );
    let mut more_note = None;
    let output = egui::ScrollArea::both()
        .id_salt(("sheet", table))
        .auto_shrink([false, false])
        .max_height((ui.available_height() - 26.0).max(ROW_H))
        .show_rows(ui, ROW_H, rows.len(), |ui, visible| {
            for index in visible {
                let row = &rows[index];
                let is_selected_row = selected.as_ref().is_some_and(|(key, _)| *key == row.key);
                let (line, _) = ui.allocate_exact_size(
                    Vec2::new(
                        ui.available_width().max(22.0 + widths.iter().sum::<f32>()),
                        ROW_H,
                    ),
                    Sense::hover(),
                );
                let painter = ui.painter_at(line);
                if is_selected_row {
                    painter.rect_filled(line, 0.0, theme::ACCENT_SOFT.gamma_multiply(0.6));
                } else if index % 2 == 1 {
                    painter.rect_filled(line, 0.0, Color32::from_white_alpha(3));
                }
                painter.hline(
                    line.min.x..=line.max.x,
                    line.max.y,
                    egui::Stroke::new(1.0, theme::BORDER.gamma_multiply(0.6)),
                );
                let mut x = line.min.x;
                if let Some((texture, uv, size)) =
                    crate::ui::browser::row_icon(editor, ui, table, &row.key)
                {
                    let icon =
                        egui::Rect::from_center_size(egui::pos2(x + 11.0, line.center().y), size);
                    painter.image(texture, icon, uv, Color32::WHITE);
                }
                x += 22.0;
                for (column, width) in shown.iter().zip(&widths) {
                    let cell = egui::Rect::from_min_size(
                        egui::pos2(x, line.min.y),
                        Vec2::new(*width, ROW_H),
                    );
                    x += width;
                    let in_range = range.contains(&(row.key.clone(), column.id.clone()));
                    let is_selected =
                        selected.as_ref() == Some(&(row.key.clone(), column.id.clone()));
                    if in_range && !is_selected {
                        painter.rect_filled(cell.shrink(1.0), 2.0, theme::ACCENT_SOFT);
                    }
                    if is_selected && editing.is_none() {
                        painter.rect_stroke(
                            cell.shrink(1.0),
                            3.0,
                            egui::Stroke::new(1.5, theme::SELECTION),
                            egui::StrokeKind::Inside,
                        );
                    }
                    let response =
                        ui.interact(cell, ui.id().with((&row.key, &column.id)), Sense::click());
                    if response.clicked() || response.double_clicked() {
                        hit = Some(Hit {
                            key: row.key.clone(),
                            column: column.id.clone(),
                            shift: ui.input(|i| i.modifiers.shift),
                            double: response.double_clicked(),
                        });
                    }
                    if is_selected && editing.as_deref() == Some(column.id.as_str()) {
                        let mut child = ui.new_child(
                            egui::UiBuilder::new()
                                .max_rect(cell.shrink2(Vec2::new(3.0, 2.0)))
                                .layout(egui::Layout::left_to_right(egui::Align::Center)),
                        );
                        match edit_cell(editor, &mut child, table, row, column) {
                            CellEdit::Committed(value, label) => {
                                commit = Some((row.key.clone(), column.id.clone(), value, label));
                            }
                            CellEdit::Cancelled => stop_editing = true,
                            CellEdit::Open => {}
                        }
                        continue;
                    }
                    let (text, colour) = match column.text(row) {
                        Some(text) => (
                            text,
                            if column.source == Source::Key {
                                theme::CODE
                            } else {
                                theme::TEXT
                            },
                        ),
                        None if column.lacks_module(row) => ("—".to_owned(), theme::FAINT),
                        None => (String::new(), theme::FAINT),
                    };
                    let (align, tx) = match column.numeric {
                        true => (egui::Align2::RIGHT_CENTER, cell.max.x - 6.0),
                        false => (egui::Align2::LEFT_CENTER, cell.min.x + 4.0),
                    };
                    painter.text(
                        egui::pos2(tx, cell.center().y),
                        align,
                        clip_text(&text, *width - 10.0, 12.5),
                        egui::FontId::monospace(12.5),
                        colour,
                    );
                }
            }
        });
    let below = {
        let content_bottom = output.content_size.y;
        let seen = output.state.offset.y + output.inner_rect.height();
        ((content_bottom - seen) / ROW_H).ceil().max(0.0) as usize
    };
    if below > 0 && rows.len() >= below {
        let last = &rows[rows.len() - 1];
        let second = rows.get(rows.len() - 2);
        let sort_column = view
            .sort
            .as_ref()
            .and_then(|(id, _)| shown.iter().find(|c| c.id == *id));
        let describe = |row: &Row| match sort_column {
            Some(column) => format!(
                "{} with {}",
                row.key,
                column.text(row).unwrap_or_else(|| "—".to_owned())
            ),
            None => row.key.clone(),
        };
        more_note = Some(match second {
            Some(second) => format!(
                "… {below} more, to {} and {}",
                describe(second),
                describe(last)
            ),
            None => format!("… {below} more, to {}", describe(last)),
        });
    }
    if let Some(note) = more_note {
        ui.add_space(4.0);
        ui.label(theme::faint(note).size(12.0));
    }
    if let Some(hit) = hit {
        let state = editor
            .views
            .sheet
            .views
            .get_mut(table)
            .expect("the sheet state");
        let same = state.selected.as_ref() == Some(&(hit.key.clone(), hit.column.clone()));
        if hit.shift && state.selected.is_some() {
            state.anchor = Some((hit.key.clone(), hit.column.clone()));
        } else {
            state.anchor = None;
            state.selected = Some((hit.key.clone(), hit.column.clone()));
            state.editing = None;
        }
        if hit.double || (same && hit.column != "key") {
            state.editing = Some(hit.column.clone());
            state.form = FormState::default();
        }
        editor.select(Selection {
            table: table.to_owned(),
            keys: vec![hit.key.clone()],
            parts: vec![format!("#sheet/{}", hit.column)],
        });
    }
    if let Some((key, column_id, value, label)) = commit {
        let column = shown.iter().find(|c| c.id == column_id).cloned();
        if let Some(column) = column {
            write_cells(editor, table, &[(key, column, value)], &label);
        }
        let state = editor
            .views
            .sheet
            .views
            .get_mut(table)
            .expect("the sheet state");
        state.editing = None;
    }
    if stop_editing {
        let state = editor
            .views
            .sheet
            .views
            .get_mut(table)
            .expect("the sheet state");
        state.editing = None;
    }
    if keyboard_free || editing.is_some() {
        keys(editor, ui, table, rows, shown, &range);
    }
    status(editor, table, rows, shown, view);
    view_changed
}

fn clip_text(text: &str, width: f32, size: f32) -> String {
    let per_char = size * 0.62;
    let fits = (width / per_char).floor().max(1.0) as usize;
    if text.chars().count() <= fits {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(fits.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn selection_range(
    rows: &[Row],
    shown: &[Column],
    selected: &Option<(String, String)>,
    anchor: &Option<(String, String)>,
) -> BTreeSet<(String, String)> {
    let mut range = BTreeSet::new();
    let (Some((key_a, col_a)), Some((key_b, col_b))) = (selected, anchor) else {
        return range;
    };
    let row_a = rows.iter().position(|r| r.key == *key_a);
    let row_b = rows.iter().position(|r| r.key == *key_b);
    let col_a = shown.iter().position(|c| c.id == *col_a);
    let col_b = shown.iter().position(|c| c.id == *col_b);
    let (Some(ra), Some(rb), Some(ca), Some(cb)) = (row_a, row_b, col_a, col_b) else {
        return range;
    };
    for row in &rows[ra.min(rb)..=ra.max(rb)] {
        for column in &shown[ca.min(cb)..=ca.max(cb)] {
            range.insert((row.key.clone(), column.id.clone()));
        }
    }
    range
}

enum CellEdit {
    Open,
    Committed(Value, String),
    Cancelled,
}

fn edit_cell(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    row: &Row,
    column: &Column,
) -> CellEdit {
    if ui.input(|i| i.key_pressed(Key::Escape)) {
        return CellEdit::Cancelled;
    }
    let Some(shape) = editor.shapes.table(table) else {
        return CellEdit::Cancelled;
    };
    let root = shape.shape.clone();
    let schema = column.schema.clone();
    let mut value = column
        .get(&row.value)
        .cloned()
        .unwrap_or_else(|| schema::template(&root, &schema));
    let path = format!("/{}", column.id.replace('.', "/"));
    let mut actions = Vec::new();
    let Editor {
        project,
        shapes,
        views,
        ..
    } = editor;
    let Some(project) = project.as_ref() else {
        return CellEdit::Cancelled;
    };
    let state = views.sheet.views.get_mut(table).expect("the sheet state");
    let mut cx = FormCx::new(project, &root, shapes, &mut state.form, &mut actions);
    cx.owner_table = Some(table.to_owned());
    cx.owner_key = Some(row.key.clone());
    let first_frame = !cx
        .state
        .drafts
        .contains_key(&ui.id().with(&path).with("number"))
        && !cx.state.drafts.contains_key(&ui.id().with(&path));
    let changed = ui
        .push_id(("sheet-cell", &row.key, &column.id), |ui| {
            ui.set_width(ui.available_width());
            crate::forms::value(ui, &mut cx, &schema, &mut value, &path)
        })
        .inner;
    if first_frame {
        ui.memory_mut(|m| m.request_focus(ui.id().with(&path).with("number")));
    }
    match changed.0 {
        Some(label) => CellEdit::Committed(value, format!("{label} of {}", row.key)),
        None => CellEdit::Open,
    }
}

fn write_cells(
    editor: &mut Editor,
    table: &str,
    cells: &[(String, Column, Value)],
    label: &str,
) -> bool {
    let mut rows: BTreeMap<String, Value> = BTreeMap::new();
    for (key, column, value) in cells {
        let Some(row) = rows
            .get(key)
            .cloned()
            .or_else(|| editor.row_value(table, key))
        else {
            continue;
        };
        let mut row = row;
        match &column.source {
            Source::Key => continue,
            Source::First(path) => {
                set_path(&mut row, path, value.clone());
            }
            Source::Module { tag, path } => {
                let modules = row["modules"].as_array().cloned().unwrap_or_default();
                let index = modules.iter().position(|module| module["type"] == *tag);
                let index = match index {
                    Some(index) => index,
                    None => {
                        let Some(template) = module_template(editor, table, tag) else {
                            continue;
                        };
                        if !row["modules"].is_array() {
                            row["modules"] = Value::Array(Vec::new());
                        }
                        row["modules"]
                            .as_array_mut()
                            .expect("an array")
                            .push(template);
                        modules.len()
                    }
                };
                set_path(&mut row["modules"][index], path, value.clone());
            }
        }
        rows.insert(key.clone(), row);
    }
    let mut edit = Edit::new(label);
    for (key, row) in &rows {
        edit.write_json(row_file(table, key), row);
    }
    editor.apply(edit)
}

fn module_template(editor: &Editor, table: &str, tag: &str) -> Option<Value> {
    let root = &editor.shapes.table(table)?.shape;
    let modules = editor.shapes.modules_of(table)?;
    let Kind::Union(variants) = schema::kind(root, modules) else {
        return None;
    };
    let variant = variants.into_iter().find(|v| v.tag == tag)?;
    Some(schema::variant_template(root, &variant))
}

fn set_path(target: &mut Value, path: &[String], value: Value) {
    let mut current = target;
    for (index, step) in path.iter().enumerate() {
        if index + 1 == path.len() {
            if !current.is_object() {
                *current = Value::Object(serde_json::Map::new());
            }
            current[step] = value;
            return;
        }
        if !current.get(step).is_some_and(Value::is_object) {
            current[step] = Value::Object(serde_json::Map::new());
        }
        current = &mut current[step];
    }
}

fn keys(
    editor: &mut Editor,
    ui: &Ui,
    table: &str,
    rows: &[Row],
    shown: &[Column],
    range: &BTreeSet<(String, String)>,
) {
    let state = editor
        .views
        .sheet
        .views
        .get_mut(table)
        .expect("the sheet state");
    let Some((key, column_id)) = state.selected.clone() else {
        return;
    };
    let row_index = rows.iter().position(|r| r.key == key);
    let column_index = shown.iter().position(|c| c.id == column_id);
    let (Some(row_index), Some(column_index)) = (row_index, column_index) else {
        return;
    };
    let editing = state.editing.is_some();
    let (up, down, left, right, enter, tab, fill, escape, copy, paste) = ui.input(|i| {
        (
            !editing && i.key_pressed(Key::ArrowUp),
            !editing && i.key_pressed(Key::ArrowDown),
            !editing && i.key_pressed(Key::ArrowLeft),
            !editing && i.key_pressed(Key::ArrowRight),
            !editing && i.key_pressed(Key::Enter),
            i.key_pressed(Key::Tab),
            i.modifiers.command && i.key_pressed(Key::D),
            editing && i.key_pressed(Key::Escape),
            !editing && i.modifiers.command && i.key_pressed(Key::C),
            (!editing)
                .then(|| {
                    i.events.iter().find_map(|event| match event {
                        egui::Event::Paste(text) => Some(text.clone()),
                        _ => None,
                    })
                })
                .flatten(),
        )
    });
    let mut target = (row_index, column_index);
    if up {
        target.0 = row_index.saturating_sub(1);
    }
    if down {
        target.0 = (row_index + 1).min(rows.len().saturating_sub(1));
    }
    if left {
        target.1 = column_index.saturating_sub(1);
    }
    if right || tab {
        target.1 = (column_index + 1).min(shown.len().saturating_sub(1));
    }
    if escape {
        state.editing = None;
    }
    if tab {
        state.editing = None;
    }
    if target != (row_index, column_index) {
        state.selected = Some((rows[target.0].key.clone(), shown[target.1].id.clone()));
        state.anchor = None;
        if tab && shown[target.1].source != Source::Key {
            state.editing = Some(shown[target.1].id.clone());
            state.form = FormState::default();
        }
        editor.select(Selection {
            table: table.to_owned(),
            keys: vec![rows[target.0].key.clone()],
            parts: vec![format!("#sheet/{}", shown[target.1].id)],
        });
        return;
    }
    if enter && shown[column_index].source != Source::Key {
        state.editing = Some(column_id.clone());
        state.form = FormState::default();
        return;
    }
    if copy {
        let text = clipboard_text(rows, shown, range, &key, &column_id);
        ui.ctx().copy_text(text);
        return;
    }
    if fill {
        let column = shown[column_index].clone();
        if column.source == Source::Key {
            return;
        }
        let Some(value) = column.get(&rows[row_index].value).cloned() else {
            return;
        };
        let targets: Vec<String> = match range.is_empty() {
            true => rows
                .get(row_index + 1)
                .map(|r| vec![r.key.clone()])
                .unwrap_or_default(),
            false => rows
                .iter()
                .filter(|r| range.contains(&(r.key.clone(), column.id.clone())) && r.key != key)
                .map(|r| r.key.clone())
                .collect(),
        };
        if targets.is_empty() {
            return;
        }
        let cells: Vec<(String, Column, Value)> = targets
            .iter()
            .map(|k| (k.clone(), column.clone(), value.clone()))
            .collect();
        let label = format!(
            "Fill {} down {} row{}",
            column.title,
            targets.len(),
            if targets.len() == 1 { "" } else { "s" }
        );
        write_cells(editor, table, &cells, &label);
        return;
    }
    if let Some(text) = paste {
        let mut cells = Vec::new();
        for (dy, line) in text.lines().enumerate() {
            let Some(row) = rows.get(row_index + dy) else {
                break;
            };
            for (dx, piece) in line.split('\t').enumerate() {
                let Some(column) = shown.get(column_index + dx) else {
                    break;
                };
                if column.source == Source::Key {
                    continue;
                }
                let value = parse_cell(
                    &editor
                        .shapes
                        .table(table)
                        .map(|s| s.shape.clone())
                        .unwrap_or(Value::Null),
                    column,
                    piece.trim(),
                );
                cells.push((row.key.clone(), column.clone(), value));
            }
        }
        if !cells.is_empty() {
            let count = cells.len();
            write_cells(
                editor,
                table,
                &cells,
                &format!("Paste {count} cell{}", if count == 1 { "" } else { "s" }),
            );
        }
    }
}

fn parse_cell(root: &Value, column: &Column, text: &str) -> Value {
    match schema::kind(root, &column.schema) {
        Kind::Integer => text
            .parse::<i64>()
            .map(Value::from)
            .unwrap_or(Value::String(text.to_owned())),
        Kind::Number => text
            .parse::<f64>()
            .map(Value::from)
            .unwrap_or(Value::String(text.to_owned())),
        Kind::Boolean => Value::Bool(matches!(text, "yes" | "true" | "1")),
        _ => Value::String(text.to_owned()),
    }
}

fn clipboard_text(
    rows: &[Row],
    shown: &[Column],
    range: &BTreeSet<(String, String)>,
    key: &str,
    column_id: &str,
) -> String {
    if range.is_empty() {
        return rows
            .iter()
            .find(|r| r.key == key)
            .and_then(|row| {
                shown
                    .iter()
                    .find(|c| c.id == column_id)
                    .and_then(|c| c.text(row))
            })
            .unwrap_or_default();
    }
    let mut lines = Vec::new();
    for row in rows {
        let cells: Vec<String> = shown
            .iter()
            .filter(|c| range.contains(&(row.key.clone(), c.id.clone())))
            .map(|c| c.text(row).unwrap_or_default())
            .collect();
        if !cells.is_empty() {
            lines.push(cells.join("\t"));
        }
    }
    lines.join("\n")
}

fn status(
    editor: &mut Editor,
    table: &str,
    rows: &[Row],
    shown: &[Column],
    view: &SpreadsheetView,
) {
    let state = &editor.views.sheet.views[table];
    let mut left = Vec::new();
    if let Some((key, column_id)) = &state.selected
        && let Some(column) = shown.iter().find(|c| c.id == *column_id)
        && let Some(row) = rows.iter().find(|r| r.key == *key)
    {
        let mut cell = format!("{table}/{key} · {}", column.title);
        if let Some(text) = column.text(row) {
            cell.push_str(&format!(" · {text}"));
        }
        if let Some((last_key, last_column, change)) = &state.last_edit
            && last_key == key
            && last_column == column_id
        {
            cell = format!("{table}/{key} · {} · {change}", column.title);
        }
        left.push(cell);
    } else {
        left.push(format!("{table} · {} rows", rows.len()));
    }
    left.push("arrows move · Enter edits · Tab next · Ctrl D fills down".to_owned());
    editor.status.left = left;
    if let Some((id, descending)) = &view.sort
        && let Some(column) = shown.iter().find(|c| c.id == *id)
    {
        editor.status.right.push(format!(
            "sorted by {}, {} first",
            column.title,
            if *descending { "highest" } else { "lowest" }
        ));
    }
}

pub fn inspect(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    let table = selection.table.clone();
    let Some(key) = selection.keys.first().cloned() else {
        return;
    };
    let Some(column_id) = selection
        .parts
        .first()
        .and_then(|part| part.strip_prefix("#sheet/"))
        .map(str::to_owned)
    else {
        return;
    };
    let (rows, columns, _, _) = shown_rows(editor, &table);
    let Some(column) = columns.iter().find(|c| c.id == column_id).cloned() else {
        return;
    };
    ui.label(
        theme::mono(format!("{table} · table › {}", column.title))
            .color(theme::CODE)
            .size(12.0),
    );
    ui.add_space(6.0);
    widgets::card_frame(true).show(ui, |ui| {
        ui.vertical(|ui| {
            widgets::card_header(ui, "column", &column.title, "", |_| {});
            widgets::kv_text(ui, "from", column.origin());
            let values: Vec<f64> = rows.iter().filter_map(|row| column.number(row)).collect();
            if column.numeric && !values.is_empty() {
                let (low, high) = values.iter().fold((f64::MAX, f64::MIN), |(low, high), v| {
                    (low.min(*v), high.max(*v))
                });
                let (from, to, count) = densest(&values);
                widgets::kv_text(
                    ui,
                    &format!("{} rows", values.len()),
                    format!(
                        "{} to {} · {count} are {} to {}",
                        crate::forms::trim_number(low),
                        crate::forms::trim_number(high),
                        crate::forms::trim_number(from),
                        crate::forms::trim_number(to)
                    ),
                );
            } else {
                let texts: Vec<String> = rows.iter().filter_map(|row| column.text(row)).collect();
                let distinct: BTreeSet<&String> = texts.iter().collect();
                widgets::kv_text(
                    ui,
                    &format!("{} rows", texts.len()),
                    format!("{} different values", distinct.len()),
                );
            }
        });
    });
    ui.add_space(6.0);
    let values: Vec<f64> = rows.iter().filter_map(|row| column.number(row)).collect();
    if column.numeric && !values.is_empty() {
        histogram(
            ui,
            &values,
            column.number(rows.iter().find(|r| r.key == key).unwrap_or(&rows[0])),
        );
    } else {
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        for row in &rows {
            if let Some(text) = column.text(row) {
                *counts.entry(text).or_default() += 1;
            }
        }
        let mut counts: Vec<(String, usize)> = counts.into_iter().collect();
        counts.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        for (text, count) in counts.iter().take(8) {
            ui.horizontal(|ui| {
                ui.label(theme::mono(text).size(12.0));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(theme::muted(count.to_string()));
                });
            });
        }
        if counts.len() > 8 {
            ui.label(theme::faint(format!("… {} more values", counts.len() - 8)));
        }
    }
    ui.add_space(10.0);
    widgets::section(ui, &format!("{table}/{key}"));
    if let Some(row) = rows.iter().find(|r| r.key == key) {
        let brief: Vec<&Column> = columns
            .iter()
            .filter(|c| c.source != Source::Key && c.id != column.id)
            .filter(|c| c.text(row).is_some())
            .take(6)
            .collect();
        for other in brief {
            widgets::kv_text(ui, &other.title, other.text(row).unwrap_or_default());
        }
        let modules: Vec<String> = row.value["modules"]
            .as_array()
            .map(|modules| {
                modules
                    .iter()
                    .filter_map(|m| m["type"].as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        if !modules.is_empty() {
            widgets::kv_text(ui, "modules", modules.join(" · "));
        }
    }
    ui.add_space(6.0);
    if ui.button("→ Open as a form").clicked() {
        editor.select(Selection::row(&table, &key));
        editor.open_tab(Tab::Row {
            table: table.clone(),
            key: key.clone(),
        });
    }
}

fn densest(values: &[f64]) -> (f64, f64, usize) {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let need = sorted.len().div_ceil(3) * 2;
    let need = need.min(sorted.len()).max(1);
    let mut best = (sorted[0], sorted[sorted.len() - 1], sorted.len());
    let mut best_width = f64::MAX;
    for start in 0..=sorted.len() - need {
        let (from, to) = (sorted[start], sorted[start + need - 1]);
        if to - from < best_width {
            best_width = to - from;
            let count = sorted.iter().filter(|v| **v >= from && **v <= to).count();
            best = (from, to, count);
        }
    }
    best
}

fn histogram(ui: &mut Ui, values: &[f64], highlight: Option<f64>) {
    let (low, high) = values.iter().fold((f64::MAX, f64::MIN), |(low, high), v| {
        (low.min(*v), high.max(*v))
    });
    let distinct: BTreeSet<i64> = values.iter().map(|v| (*v * 100.0).round() as i64).collect();
    let integral = values.iter().all(|v| v.fract() == 0.0);
    let bins = if integral && ((high - low) as usize) < 12 {
        (high - low) as usize + 1
    } else {
        distinct.len().clamp(1, 12)
    };
    let width = ui.available_width().min(320.0);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 90.0), Sense::hover());
    let painter = ui.painter_at(rect);
    let span = (high - low).max(f64::EPSILON);
    let mut counts = vec![0usize; bins];
    for v in values {
        let mut bin = (((v - low) / span) * bins as f64).floor() as usize;
        if bin >= bins {
            bin = bins - 1;
        }
        counts[bin] += 1;
    }
    let max = counts.iter().copied().max().unwrap_or(1).max(1) as f32;
    let bar_w = (rect.width() / bins as f32).max(4.0);
    let bar_h = rect.height() - 18.0;
    let highlight_bin = highlight.map(|v| {
        let bin = (((v - low) / span) * bins as f64).floor() as usize;
        bin.min(bins - 1)
    });
    for (index, count) in counts.iter().enumerate() {
        let h = (*count as f32 / max) * bar_h;
        let x = rect.min.x + index as f32 * bar_w;
        let bar = egui::Rect::from_min_max(
            egui::pos2(x + 2.0, rect.min.y + bar_h - h.max(2.0)),
            egui::pos2(x + bar_w - 2.0, rect.min.y + bar_h),
        );
        let colour = match highlight_bin == Some(index) {
            true => theme::SELECTION,
            false => theme::RAISED.gamma_multiply(1.6),
        };
        painter.rect_filled(bar, 2.0, colour);
        let label = match integral && bins as f64 == high - low + 1.0 {
            true => crate::forms::trim_number(low + index as f64),
            false => crate::forms::trim_number(low + span * index as f64 / bins as f64),
        };
        if bins <= 12 {
            painter.text(
                egui::pos2(x + bar_w / 2.0, rect.max.y - 4.0),
                egui::Align2::CENTER_BOTTOM,
                label,
                egui::FontId::monospace(10.0),
                theme::FAINT,
            );
        }
    }
}
