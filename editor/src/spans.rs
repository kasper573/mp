use std::collections::HashMap;

use design_tokens::ink::{self, Ground};
use egui::text::{CCursor, CCursorRange, LayoutJob, TextFormat};
use egui::{Color32, FontId, RichText, Stroke, Ui};
use engine::core::content::ContentFile;
use engine::core::text::{TextMotion, TextVoice};
use engine::systems::input::map::InputDef;
use engine::systems::text::Ink;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use strum::VariantArray;

use crate::drafts::{clear_draft, draft_of, set_draft, take_draft};
use crate::forms::{self, FormChange, FormCx, committed};
use crate::keymap::EditorKey;
use crate::ui::{theme, widgets};
use crate::{condition, picker};

fn names<T: VariantArray + Copy + Into<&'static str>>() -> Vec<&'static str> {
    T::VARIANTS
        .iter()
        .map(|variant| (*variant).into())
        .collect()
}
const VALUE_TOKEN: &str = "⟨value⟩";
const INPUT_TOKEN: &str = "⟨input⟩";

pub struct SpanLineEdit {
    pub spans: Option<Value>,
    pub entered: bool,
}

pub fn line(ui: &mut Ui, spans: &Value, id: egui::Id, font: FontId, hint: &str) -> SpanLineEdit {
    let stored = spans_of(spans);
    let draft_spans: Value = draft_of(ui, id)
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| stored.clone());
    let plain_before = plain(&draft_spans);
    let mut text = plain_before.clone();
    let selection_id = id.with("selection");
    let selection: Option<(usize, usize)> = ui.ctx().data(|d| d.get_temp(selection_id));
    let mut spans_now = draft_spans.clone();
    let mut changed = false;
    if let Some((start, end)) = selection.filter(|(a, b)| a != b)
        && let Some(styled) = toolbar(ui, &spans_now, (start, end))
    {
        spans_now = styled;
        changed = true;
    }
    let job_spans = spans_now.clone();
    let font_for_layout = font.clone();
    let mut layouter = move |ui: &Ui, buffer: &dyn egui::TextBuffer, wrap_width: f32| {
        let typed = buffer.as_str();
        let job = if typed == plain(&job_spans) {
            layout_job(&job_spans, font_for_layout.clone(), theme::TEXT, wrap_width)
        } else {
            let mut job = LayoutJob::simple(
                typed.to_owned(),
                font_for_layout.clone(),
                theme::TEXT,
                wrap_width,
            );
            job.wrap.max_width = wrap_width;
            job
        };
        ui.fonts_mut(|f| f.layout_job(job))
    };
    let output = egui::TextEdit::multiline(&mut text)
        .id(id)
        .frame(egui::Frame::NONE)
        .hint_text(hint)
        .desired_rows(1)
        .desired_width(f32::INFINITY)
        .layouter(&mut layouter)
        .show(ui);
    let response = output.response;
    let focused = response.has_focus();
    let range = output
        .state
        .cursor
        .char_range()
        .filter(|_| focused)
        .map(|range| {
            let sorted = range.sorted_cursors();
            (sorted[0].index, sorted[1].index)
        });
    ui.ctx().data_mut(|d| match range {
        Some(range) => {
            d.insert_temp(selection_id, range);
        }
        None => {
            d.remove_temp::<(usize, usize)>(selection_id);
        }
    });
    let enter = ui.input(|i| EditorKey::Confirm.pressed(i));
    let mut entered = false;
    if response.changed() {
        let typed = text.trim_end_matches('\n').to_owned();
        if typed != text && enter {
            entered = true;
        }
        if let Some(retyped) = retype(&spans_now, &plain_before, &typed) {
            spans_now = retyped;
            changed = true;
        } else {
            ui.ctx().request_repaint();
        }
    }
    if entered {
        let mut state = output.state;
        state
            .cursor
            .set_char_range(Some(CCursorRange::one(CCursor::new(
                plain(&spans_now).chars().count(),
            ))));
        state.store(ui.ctx(), response.id);
    }
    if changed {
        set_draft(
            ui,
            id,
            &serde_json::to_string(&spans_now).unwrap_or_default(),
        );
    }
    let escape = ui.input(|i| EditorKey::Cancel.pressed(i));
    if escape && focused {
        clear_draft(ui, id);
        return SpanLineEdit {
            spans: None,
            entered: false,
        };
    }
    if entered || committed(ui, &response) {
        clear_draft(ui, id);
        if spans_now != stored {
            return SpanLineEdit {
                spans: Some(spans_now),
                entered,
            };
        }
    }
    SpanLineEdit {
        spans: None,
        entered,
    }
}

pub fn plain(spans: &Value) -> String {
    spans_of(spans)
        .as_array()
        .into_iter()
        .flatten()
        .map(token)
        .collect()
}

pub fn layout_job(spans: &Value, font: FontId, ink: Color32, wrap_width: f32) -> LayoutJob {
    let mut job = LayoutJob::default();
    job.wrap.max_width = wrap_width;
    for span in spans_of(spans).as_array().into_iter().flatten() {
        let mut format = TextFormat::simple(font.clone(), ink);
        match span {
            span if is_atom(span) => {
                format.color = theme::CODE;
                format.background = theme::INPUT;
            }
            Value::Object(map) => {
                if let Some(ink) = map.get("ink") {
                    format.color = Ink::deserialize(ink)
                        .map_or(theme::TEXT, |ink| ink.prose().on(Ground::Paper));
                }
                if map.contains_key("voice") || map.contains_key("motion") {
                    format.background = ink::gold_wash(0.2);
                }
                if map.get("slow").and_then(Value::as_bool).unwrap_or(false) {
                    format.underline = Stroke::new(1.0, format.color);
                }
                if map.contains_key("pause_after") {
                    format.strikethrough = Stroke::NONE;
                    format.italics = true;
                }
            }
            _ => {}
        }
        job.append(&token(span), 0.0, format);
    }
    job
}

pub fn retype(spans: &Value, before: &str, after: &str) -> Option<Value> {
    let old: Vec<char> = before.chars().collect();
    let new: Vec<char> = after.chars().collect();
    let prefix = old
        .iter()
        .zip(new.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let suffix = old[prefix..]
        .iter()
        .rev()
        .zip(new[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let mut cells = Cells::of(spans);
    let removed = prefix..old.len() - suffix;
    if cells.cuts_atom(removed.start) || cells.cuts_atom(removed.end) {
        return None;
    }
    let run = cells.run_at(removed.start);
    let inserted: Vec<Cell> = new[prefix..new.len() - suffix]
        .iter()
        .map(|&c| Cell::Char(c, run))
        .collect();
    cells.cells.splice(removed, inserted);
    Some(cells.spans())
}

fn toolbar(ui: &mut Ui, spans: &Value, (start, end): (usize, usize)) -> Option<Value> {
    let mut outcome = None;
    egui::Frame::new()
        .fill(theme::RAISED)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(4, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                for (field, options) in [
                    ("ink", names::<Ink>()),
                    ("voice", names::<TextVoice>()),
                    ("motion", names::<TextMotion>()),
                ] {
                    ui.menu_button(RichText::new(field).size(12.0), |ui| {
                        for option in options {
                            if ui.button(option).clicked() {
                                outcome = Some(restyle(spans, (start, end), |map| {
                                    map.insert(field.to_owned(), Value::String(option.to_owned()));
                                }));
                                ui.close();
                            }
                        }
                        if ui.button(format!("no {field}")).clicked() {
                            outcome = Some(restyle(spans, (start, end), |map| {
                                map.remove(field);
                            }));
                            ui.close();
                        }
                    });
                }
                if ui
                    .add(egui::Button::new(RichText::new("slow").size(12.0)))
                    .clicked()
                {
                    outcome = Some(restyle(spans, (start, end), |map| {
                        if map.get("slow").and_then(Value::as_bool).unwrap_or(false) {
                            map.remove("slow");
                        } else {
                            map.insert("slow".to_owned(), Value::Bool(true));
                        }
                    }));
                }
                if ui
                    .add(egui::Button::new(RichText::new("pause").size(12.0)))
                    .on_hover_text("A 400 ms pause after the span")
                    .clicked()
                {
                    outcome = Some(restyle(spans, (start, end), |map| {
                        if map.contains_key("pause_after") {
                            map.remove("pause_after");
                        } else {
                            map.insert("pause_after".to_owned(), Value::from(400));
                        }
                    }));
                }
                if ui
                    .add(egui::Button::new(RichText::new("value").size(12.0)))
                    .on_hover_text("Replace the selection with a value span showing an expression")
                    .clicked()
                {
                    outcome = with_value(spans, (start, end));
                }
                ui.label(theme::faint(format!("{} chars", end - start)).size(11.0));
            });
        });
    outcome
}

/// The line with the selection between `start` and `end` replaced by a value span.
pub fn with_value(spans: &Value, (start, end): (usize, usize)) -> Option<Value> {
    let mut cells = Cells::of(spans);
    if cells.cuts_atom(start) || cells.cuts_atom(end) {
        return None;
    }
    cells.cells.drain(start..end);
    cells.insert_atom(start, json!({ "value": 0 }));
    Some(cells.spans())
}

pub fn restyle(
    spans: &Value,
    (start, end): (usize, usize),
    apply: impl Fn(&mut Map<String, Value>),
) -> Value {
    let Cells {
        mut runs,
        mut cells,
    } = Cells::of(spans);
    let mut restyled: HashMap<usize, usize> = HashMap::new();
    let end = end.min(cells.len());
    for cell in &mut cells[start.min(end)..end] {
        if let Cell::Char(_, run) = cell {
            *run = *restyled.entry(*run).or_insert_with(|| {
                let mut style = runs[*run].clone();
                apply(&mut style);
                runs.push(style);
                runs.len() - 1
            });
        }
    }
    Cells { runs, cells }.spans()
}

pub fn edit(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let mut changed = FormChange::default();
    ui.vertical(|ui| {
        if let Some(text) = value.as_str().map(str::to_owned) {
            let mut draft_value = Value::String(text);
            if forms::text(ui, cx, &mut draft_value, path).is_some() {
                *value = draft_value;
                changed = FormChange::at(path);
            }
            ui.horizontal(|ui| {
                if ui
                    .small_button("style…")
                    .on_hover_text("Give the span an ink, a voice or a motion")
                    .clicked()
                {
                    let mut styled = Map::new();
                    styled.insert("text".to_owned(), value.clone());
                    *value = Value::Object(styled);
                    changed = FormChange::at(path);
                }
            });
            return;
        }
        let mut back_to_plain = false;
        let Some(object) = value.as_object_mut() else {
            ui.label(RichText::new("—").weak());
            return;
        };
        if object.contains_key("input") {
            let mut input = object["input"].as_str().unwrap_or_default().to_owned();
            ui.horizontal(|ui| {
                ui.label("key of");
                if picker::row(
                    ui,
                    cx,
                    InputDef::TABLE,
                    &mut input,
                    &format!("{path}/input"),
                ) {
                    object.insert("input".to_owned(), Value::String(input));
                    changed = FormChange::at(path);
                }
            });
            return;
        }
        if object.contains_key("value") {
            ui.label(RichText::new("value").weak());
            let mut inner = object["value"].clone();
            let schema = serde_json::json!({ "x-condition": true });
            if condition::edit(ui, cx, &schema, &mut inner, &format!("{path}/value")).is_some() {
                object.insert("value".to_owned(), inner);
                changed = FormChange::at(path);
            }
            return;
        }
        let mut text = object
            .get("text")
            .cloned()
            .unwrap_or(Value::String(String::new()));
        if forms::text(ui, cx, &mut text, &format!("{path}/text")).is_some() {
            object.insert("text".to_owned(), text);
            changed = FormChange::at(path);
        }
        ui.horizontal_wrapped(|ui| {
            for (field, options) in [
                ("ink", names::<Ink>()),
                ("voice", names::<TextVoice>()),
                ("motion", names::<TextMotion>()),
            ] {
                let current = object
                    .get(field)
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                let mut picked = current.clone();
                widgets::combo(ui.id().with(path).with(field))
                    .selected_text(if current.is_empty() {
                        field.to_owned()
                    } else {
                        current.clone()
                    })
                    .width(90.0)
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut picked, String::new(), format!("no {field}"));
                        for option in options {
                            ui.selectable_value(&mut picked, option.to_owned(), option);
                        }
                    });
                if picked != current {
                    if picked.is_empty() {
                        object.remove(field);
                    } else {
                        object.insert(field.to_owned(), Value::String(picked));
                    }
                    changed = FormChange::at(path);
                }
            }
            let mut slow = object.get("slow").and_then(Value::as_bool).unwrap_or(false);
            if ui.checkbox(&mut slow, "slow").changed() {
                if slow {
                    object.insert("slow".to_owned(), Value::Bool(true));
                } else {
                    object.remove("slow");
                }
                changed = FormChange::at(path);
            }
            let id = ui.id().with(path).with("pause");
            let current = object
                .get("pause_after")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let mut draft: f64 = draft_of(ui, id)
                .and_then(|t| t.parse().ok())
                .unwrap_or(current);
            ui.label("pause ms");
            let response = ui.add(
                egui::DragValue::new(&mut draft)
                    .range(0.0..=10_000.0)
                    .speed(10.0),
            );
            if response.changed() {
                set_draft(ui, id, &draft.to_string());
            }
            if (response.drag_stopped() || committed(ui, &response))
                && take_draft(ui, id).is_some()
                && draft != current
            {
                if draft <= 0.0 {
                    object.remove("pause_after");
                } else {
                    object.insert("pause_after".to_owned(), Value::from(draft));
                }
                changed = FormChange::at(path);
            }
            if object.len() == 1
                && ui
                    .small_button("plain")
                    .on_hover_text("Back to a plain string")
                    .clicked()
            {
                back_to_plain = true;
            }
        });
        if back_to_plain {
            let plain = object.get("text").cloned().unwrap_or_default();
            *value = plain;
            changed = FormChange::at(path);
        }
    });
    changed
}

pub fn line_field(ui: &mut Ui, cx: &mut FormCx, value: &mut Value, path: &str) -> FormChange {
    let id = ui.id().with(path).with("line");
    let mut changed = FormChange::default();
    forms::boxed_input(ui, None, |ui| {
        let edit = line(ui, value, id, FontId::proportional(13.5), "…");
        if let Some(spans) = edit.spans {
            *value = spans;
            changed = FormChange::at(path);
        }
        ui.allocate_response(egui::Vec2::ZERO, egui::Sense::hover())
    });
    let count = value.as_array().map_or(0, Vec::len);
    for index in 0..count {
        if value[index].get("value").is_none() {
            continue;
        }
        let mut inner = value[index]["value"].clone();
        let schema = serde_json::json!({ "x-condition": true });
        widgets::kv(ui, "value", |ui| {
            if condition::edit(
                ui,
                cx,
                &schema,
                &mut inner,
                &format!("{path}/{index}/value"),
            )
            .is_some()
            {
                value[index]["value"] = inner.clone();
                changed = FormChange::at(path);
            }
        });
    }
    changed
}

fn spans_of(value: &Value) -> Value {
    match value {
        Value::Array(_) => value.clone(),
        Value::String(text) => Value::Array(vec![Value::String(text.clone())]),
        Value::Null => Value::Array(vec![Value::String(String::new())]),
        other => Value::Array(vec![other.clone()]),
    }
}

fn token(span: &Value) -> String {
    match span {
        Value::String(text) => text.clone(),
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                text.to_owned()
            } else if map.contains_key("value") {
                VALUE_TOKEN.to_owned()
            } else if map.contains_key("input") {
                INPUT_TOKEN.to_owned()
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

fn normalise(span: Value) -> Value {
    match span {
        Value::Object(map) if map.len() == 1 && map.contains_key("text") => map["text"].clone(),
        other => other,
    }
}

fn is_atom(span: &Value) -> bool {
    span.as_object()
        .is_some_and(|map| map.contains_key("value") || map.contains_key("input"))
}

/// A line cut into the characters its plain text shows: a character keeps the run of style it
/// was written in, and a value or input span sits whole on the first cell of its token.
struct Cells {
    runs: Vec<Map<String, Value>>,
    cells: Vec<Cell>,
}

#[derive(Clone)]
enum Cell {
    Char(char, usize),
    Atom(Value),
    WithinAtom,
}

impl Cells {
    fn of(spans: &Value) -> Cells {
        let mut cells = Cells {
            runs: Vec::new(),
            cells: Vec::new(),
        };
        for span in spans_of(spans).as_array().into_iter().flatten() {
            if is_atom(span) {
                cells.insert_atom(cells.cells.len(), span.clone());
                continue;
            }
            let mut style = span.as_object().cloned().unwrap_or_default();
            style.remove("text");
            cells.runs.push(style);
            let run = cells.runs.len() - 1;
            cells
                .cells
                .extend(token(span).chars().map(|c| Cell::Char(c, run)));
        }
        cells
    }

    fn insert_atom(&mut self, at: usize, span: Value) {
        let width = token(&span).chars().count();
        let cells = std::iter::once(Cell::Atom(span)).chain(std::iter::repeat_n(
            Cell::WithinAtom,
            width.saturating_sub(1),
        ));
        self.cells.splice(at..at, cells);
    }

    /// Whether a cut at `at` would split a value or input span.
    fn cuts_atom(&self, at: usize) -> bool {
        matches!(self.cells.get(at), Some(Cell::WithinAtom))
    }

    /// The run text typed at `at` joins: the one before it, else the one after, else plain text.
    fn run_at(&mut self, at: usize) -> usize {
        let neighbour = |index: Option<usize>| match index.and_then(|i| self.cells.get(i)) {
            Some(Cell::Char(_, run)) => Some(*run),
            _ => None,
        };
        neighbour(at.checked_sub(1))
            .or(neighbour(Some(at)))
            .unwrap_or_else(|| {
                self.runs.push(Map::new());
                self.runs.len() - 1
            })
    }

    fn spans(&self) -> Value {
        let mut spans: Vec<Value> = Vec::new();
        let mut run: Option<(usize, String)> = None;
        for cell in &self.cells {
            match cell {
                Cell::Char(c, of) => match &mut run {
                    Some((current, text)) if current == of => text.push(*c),
                    _ => {
                        spans.extend(run.take().map(|run| self.span_of(run)));
                        run = Some((*of, c.to_string()));
                    }
                },
                Cell::Atom(span) => {
                    spans.extend(run.take().map(|run| self.span_of(run)));
                    spans.push(span.clone());
                }
                Cell::WithinAtom => {}
            }
        }
        spans.extend(run.map(|run| self.span_of(run)));
        let mut merged: Vec<Value> = Vec::new();
        for span in spans {
            match (merged.last_mut(), &span) {
                (Some(Value::String(last)), Value::String(next)) => last.push_str(next),
                _ => merged.push(span),
            }
        }
        if merged.is_empty() {
            merged.push(Value::String(String::new()));
        }
        Value::Array(merged)
    }

    fn span_of(&self, (run, text): (usize, String)) -> Value {
        let mut span = Map::from_iter([("text".to_owned(), Value::String(text))]);
        span.extend(self.runs[run].clone());
        normalise(Value::Object(span))
    }
}
