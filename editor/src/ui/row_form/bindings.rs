use design_tokens::glyph::{self, Mark};
use egui::{Key, Sense, Ui};
use engine::core::content::ContentRow;
use engine::core::content::fixture::FixtureLock;
use engine::systems::input::map::InputDef;
use serde_json::Value;

use super::{theme, widgets};
use crate::forms::FormChange;
use crate::project::ProjectFiles;
use crate::value::RowValue;
use engine::core::content::row_file;

pub(super) fn bindings_section(
    ui: &mut Ui,
    files: &ProjectFiles,
    locks: &[FixtureLock],
    key: &str,
    value: &mut Value,
) -> FormChange {
    let mut changed = FormChange::default();
    widgets::section(ui, "Bindings");
    let read = locks.iter().find_map(|lock| lock.variants("/bindings"));
    let reads = |kind: &str| read.is_none_or(|read| read.iter().any(|known| known == kind));
    if !value["bindings"].is_array() {
        value["bindings"] = Value::Array(Vec::new());
    }
    let mut remove = None;
    ui.horizontal_wrapped(|ui| {
        for (index, binding) in value["bindings"]
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
        {
            let (keys, kind) = binding_label(binding);
            let shared_with = also_bound(files, key, binding);
            egui::Frame::new()
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(
                    1.0,
                    if shared_with.is_empty() {
                        theme::BORDER
                    } else {
                        theme::WARN
                    },
                ))
                .corner_radius(4.0)
                .inner_margin(egui::Margin::symmetric(6, 3))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        widgets::key_hint(ui, &keys);
                        ui.label(theme::mono(kind).size(12.5));
                        if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove").clicked() {
                            remove = Some(index);
                        }
                    });
                })
                .response
                .on_hover_text(if shared_with.is_empty() {
                    format!("Only this input uses {keys}.")
                } else {
                    format!("Also bound to {}.", shared_with.join(", "))
                });
        }
    });
    let conflicts: Vec<String> = value["bindings"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|binding| {
            let others = also_bound(files, key, binding);
            (!others.is_empty()).then(|| {
                format!(
                    "{} is also bound to {}",
                    binding_label(binding).0,
                    others.join(", ")
                )
            })
        })
        .collect();
    for conflict in conflicts {
        ui.label(theme::warn(conflict).size(12.5));
    }
    if let Some(index) = remove {
        value["bindings"]
            .as_array_mut()
            .expect("bindings")
            .remove(index);
        changed = FormChange::at("/bindings");
    }
    let id = ui.id().with("capture");
    let capturing = ui.ctx().data(|d| d.get_temp::<bool>(id)).unwrap_or(false);
    ui.horizontal(|ui| {
        let response = egui::Frame::new()
            .fill(theme::INPUT)
            .stroke(egui::Stroke::new(
                1.0,
                if capturing {
                    theme::ACCENT
                } else {
                    theme::BORDER
                },
            ))
            .corner_radius(4.0)
            .inner_margin(egui::Margin::symmetric(8, 4))
            .show(ui, |ui| {
                ui.set_width(ui.available_width() - 60.0);
                ui.label(
                    theme::mono(if capturing {
                        "press a key or click…"
                    } else {
                        "+ add a binding"
                    })
                    .color(if capturing { theme::TEXT } else { theme::MUTED }),
                );
            })
            .response
            .interact(Sense::click());
        if response.clicked() && !capturing {
            ui.ctx().data_mut(|d| d.insert_temp(id, true));
        }
        if capturing && ui.button("Esc").clicked() {
            ui.ctx().data_mut(|d| d.insert_temp(id, false));
        }
    });
    if let Some(read) = read {
        let kinds: Vec<String> = read.iter().map(|kind| kind.replace('_', " ")).collect();
        ui.label(
            theme::faint(format!("The game reads this as: {}", kinds.join(" or "))).size(12.0),
        );
    }
    if capturing {
        let captured = ui.input(|i| {
            if i.key_pressed(egui::Key::Escape) {
                return Some(None);
            }
            for event in &i.events {
                match event {
                    egui::Event::Key {
                        key,
                        pressed: true,
                        modifiers,
                        ..
                    } if reads("key") => {
                        let name = key_code_name(*key);
                        return Some(Some(binding_json(
                            "key",
                            modifiers,
                            serde_json::json!({ "key": name }),
                        )));
                    }
                    egui::Event::PointerButton {
                        button,
                        pressed: true,
                        modifiers,
                        ..
                    } => {
                        let name = match button {
                            egui::PointerButton::Primary => "Left",
                            egui::PointerButton::Secondary => "Right",
                            egui::PointerButton::Middle => "Middle",
                            _ => "Left",
                        };
                        let pointer = ["click", "drag", "mouse"]
                            .into_iter()
                            .find(|kind| reads(kind));
                        let Some(kind) = pointer else {
                            continue;
                        };
                        let fields = match kind {
                            "click" => serde_json::json!({ "button": name, "times": 1 }),
                            _ => serde_json::json!({ "button": name }),
                        };
                        return Some(Some(binding_json(kind, modifiers, fields)));
                    }
                    _ => {}
                }
            }
            None
        });
        match captured {
            Some(Some(binding)) => {
                let list = value["bindings"].as_array_mut().expect("bindings");
                if !list.contains(&binding) {
                    list.push(binding);
                    changed = FormChange::at("/bindings");
                }
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            Some(None) => {
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            None => {}
        }
    }
    changed
}

pub(super) fn binding_json(kind: &str, modifiers: &egui::Modifiers, mut fields: Value) -> Value {
    fields["type"] = Value::String(kind.to_owned());
    if modifiers.ctrl || modifiers.command {
        fields["ctrl"] = Value::Bool(true);
    }
    if modifiers.shift {
        fields["shift"] = Value::Bool(true);
    }
    if modifiers.alt {
        fields["alt"] = Value::Bool(true);
    }
    fields
}

pub fn binding_label(binding: &Value) -> (String, String) {
    let mut parts: Vec<String> = Vec::new();
    if binding["ctrl"].as_bool().unwrap_or(false) {
        parts.push("Ctrl".to_owned());
    }
    if binding["shift"].as_bool().unwrap_or(false) {
        parts.push("Shift".to_owned());
    }
    if binding["alt"].as_bool().unwrap_or(false) {
        parts.push("Alt".to_owned());
    }
    let kind = binding.kind_or("key").to_owned();
    let main = match kind.as_str() {
        "key" => binding["key"]
            .as_str()
            .unwrap_or("?")
            .trim_start_matches("Key")
            .trim_start_matches("Digit")
            .to_owned(),
        "any_key" => "any key".to_owned(),
        "mouse" | "click" | "drag" => binding.text_or("button", "?").to_owned(),
        _ => "?".to_owned(),
    };
    parts.push(main);
    let kind = if kind == "click" && binding["times"].as_u64().unwrap_or(1) > 1 {
        "double click".to_owned()
    } else {
        kind.replace('_', " ")
    };
    (parts.join(" "), kind)
}

pub(super) fn key_code_name(key: egui::Key) -> String {
    let name = key.name();
    match key {
        Key::ArrowDown => "ArrowDown".to_owned(),
        Key::ArrowLeft => "ArrowLeft".to_owned(),
        Key::ArrowRight => "ArrowRight".to_owned(),
        Key::ArrowUp => "ArrowUp".to_owned(),
        Key::Escape => "Escape".to_owned(),
        Key::Tab => "Tab".to_owned(),
        Key::Backspace => "Backspace".to_owned(),
        Key::Enter => "Enter".to_owned(),
        Key::Space => "Space".to_owned(),
        Key::Insert => "Insert".to_owned(),
        Key::Delete => "Delete".to_owned(),
        Key::Home => "Home".to_owned(),
        Key::End => "End".to_owned(),
        Key::PageUp => "PageUp".to_owned(),
        Key::PageDown => "PageDown".to_owned(),
        Key::Comma => "Comma".to_owned(),
        Key::Period => "Period".to_owned(),
        Key::Minus => "Minus".to_owned(),
        Key::Equals => "Equal".to_owned(),
        Key::Semicolon => "Semicolon".to_owned(),
        Key::Quote => "Quote".to_owned(),
        Key::Slash => "Slash".to_owned(),
        Key::Backslash => "Backslash".to_owned(),
        Key::Backtick => "Backquote".to_owned(),
        Key::OpenBracket => "BracketLeft".to_owned(),
        Key::CloseBracket => "BracketRight".to_owned(),
        _ => {
            if name.len() == 1 && name.chars().all(|c| c.is_ascii_alphabetic()) {
                format!("Key{}", name.to_uppercase())
            } else if name.len() == 1 && name.chars().all(|c| c.is_ascii_digit()) {
                format!("Digit{name}")
            } else {
                name.to_owned()
            }
        }
    }
}

/// The other inputs that carry this same binding.
fn also_bound(files: &ProjectFiles, key: &str, binding: &Value) -> Vec<String> {
    files
        .keys_of(InputDef::TABLE)
        .filter(|other| *other != key)
        .filter(|other| {
            files
                .json(&row_file(InputDef::TABLE, other))
                .is_some_and(|row| {
                    row["bindings"]
                        .as_array()
                        .is_some_and(|list| list.contains(binding))
                })
        })
        .map(|other| format!("input/{other}"))
        .collect()
}
