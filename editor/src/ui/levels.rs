use design_tokens::glyph::{self, Mark};
use egui::Ui;
use serde::Serialize;
use serde_json::{Map, Value};
use strum::VariantArray;

use crate::forms::{self, FormChange, FormCx};
use crate::ui::{theme, widgets};

const LABEL: f32 = 110.0;
const INPUT: f32 = 150.0;

/// How a row that grows by levels edits them: a class by its levels, a skill by its ranks. Each
/// level holds whole-number fields, and the stats of kind `S` it adds.
pub struct LevelCards<S: 'static> {
    /// What one level is called, capitalized.
    pub name: &'static str,
    /// Each field a level holds, with the value a level lacking it shows.
    pub fields: &'static [(&'static str, u64)],
    /// The level added after the last one.
    pub next: fn(last: Option<&Value>) -> Value,
    pub unit: fn(S) -> Option<&'static str>,
}

/// The cards of a row's `levels`, each with a `note` beside its title, which sees every level in
/// turn.
pub fn cards<S>(
    ui: &mut Ui,
    cx: &mut FormCx,
    value: &mut Value,
    look: &LevelCards<S>,
    mut note: impl FnMut(usize, &Value) -> Option<String>,
) -> FormChange
where
    S: VariantArray + Serialize + Copy + PartialEq,
{
    let mut changed = FormChange::default();
    if !value["levels"].is_array() {
        value["levels"] = Value::Array(Vec::new());
    }
    let levels = value["levels"].as_array_mut().expect("array");
    let noun = look.name.to_lowercase();
    widgets::section_count(ui, &format!("{noun}s"), levels.len());
    let mut remove = None;
    for (index, level) in levels.iter_mut().enumerate() {
        let note = note(index, level);
        ui.push_id(index, |ui| {
            if card(ui, cx, look, index, note, level, &mut changed) {
                remove = Some(index);
            }
        });
        ui.add_space(6.0);
    }
    if let Some(index) = remove {
        levels.remove(index);
        changed = FormChange::at("/levels");
    }
    if ui.button(format!("+ {noun}")).clicked() {
        levels.push((look.next)(levels.last()));
        changed = FormChange::at("/levels");
    }
    changed
}

fn card<S>(
    ui: &mut Ui,
    cx: &mut FormCx,
    look: &LevelCards<S>,
    index: usize,
    note: Option<String>,
    level: &mut Value,
    changed: &mut FormChange,
) -> bool
where
    S: VariantArray + Serialize + Copy + PartialEq,
{
    let path = format!("/levels/{index}");
    let mut removed = false;
    widgets::card_frame(false).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.label(theme::strong(format!("{} {}", look.name, index + 1)));
            if let Some(note) = note {
                ui.label(theme::muted(note).size(12.0));
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove")
                    .on_hover_text(format!("Remove this {}", look.name.to_lowercase()))
                    .clicked()
                {
                    removed = true;
                }
            });
        });
        ui.add_space(4.0);
        for &(field, fallback) in look.fields {
            field_row(ui, &field.replace('_', " "), |ui| {
                let schema = serde_json::json!({ "type": "integer", "minimum": 0 });
                if !level[field].is_number() {
                    level[field] = Value::from(fallback);
                }
                *changed |= forms::number(
                    ui,
                    cx,
                    &schema,
                    &mut level[field],
                    &format!("{path}/{field}"),
                    true,
                );
            });
        }
        widgets::section(ui, "stats");
        *changed |= stats(ui, cx, look, index, &path, level);
    });
    removed
}

fn stats<S>(
    ui: &mut Ui,
    cx: &mut FormCx,
    look: &LevelCards<S>,
    index: usize,
    path: &str,
    level: &mut Value,
) -> FormChange
where
    S: VariantArray + Serialize + Copy + PartialEq,
{
    let mut changed = FormChange::default();
    if !level["stats"].is_object() {
        level["stats"] = Value::Object(Map::new());
    }
    let mut unset = None;
    let present: Vec<S> = S::VARIANTS
        .iter()
        .copied()
        .filter(|stat| level["stats"].get(stat_key(*stat)).is_some())
        .collect();
    for &stat in &present {
        let key = stat_key(stat);
        let stat_path = format!("{path}/stats/{key}");
        field_row(ui, &key, |ui| {
            let schema = match (look.unit)(stat) {
                Some(unit) => serde_json::json!({ "type": "number", "x-unit": unit }),
                None => serde_json::json!({ "type": "number" }),
            };
            changed |= forms::number(
                ui,
                cx,
                &schema,
                &mut level["stats"][&key],
                &stat_path,
                false,
            );
            if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove")
                .on_hover_text(format!("Unset {key}"))
                .clicked()
            {
                unset = Some(key.clone());
            }
        });
    }
    if present.is_empty() {
        let noun = look.name.to_lowercase();
        ui.label(theme::faint(format!("nothing changes at this {noun}")).size(12.5));
    }
    if let Some(key) = unset {
        level["stats"].as_object_mut().expect("object").remove(&key);
        changed = FormChange::at(&format!("{path}/stats"));
    }
    let missing: Vec<S> = S::VARIANTS
        .iter()
        .copied()
        .filter(|stat| !present.contains(stat))
        .collect();
    if !missing.is_empty() {
        let mut picked: Option<S> = None;
        widgets::combo(("add-stat", index))
            .selected_text(theme::muted("+ stat"))
            .width(INPUT)
            .show_ui(ui, |ui| {
                for stat in missing {
                    ui.selectable_value(&mut picked, Some(stat), stat_key(stat));
                }
            });
        if let Some(stat) = picked {
            level["stats"][stat_key(stat)] = Value::from(0.0);
            changed = FormChange::at(&format!("{path}/stats"));
        }
    }
    changed
}

fn field_row(ui: &mut Ui, label: &str, input: impl FnOnce(&mut Ui)) {
    ui.horizontal(|ui| {
        let (rect, _) = ui.allocate_exact_size(
            egui::vec2(LABEL, ui.spacing().interact_size.y),
            egui::Sense::hover(),
        );
        ui.new_child(
            egui::UiBuilder::new()
                .max_rect(rect)
                .layout(egui::Layout::left_to_right(egui::Align::Center)),
        )
        .add(egui::Label::new(theme::muted(label).monospace().size(13.0)).truncate());
        ui.allocate_ui_with_layout(
            egui::vec2(INPUT, ui.spacing().interact_size.y),
            egui::Layout::left_to_right(egui::Align::Center),
            |ui| {
                ui.set_width(INPUT);
                input(ui);
            },
        );
    });
}

fn stat_key(stat: impl Serialize) -> String {
    serde_json::to_value(stat)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default()
}
