use egui::{Sense, Ui};
use serde_json::Value;

use super::{theme, widgets};
use crate::app::Editor;
use crate::forms::{Changed, FormCx};
use crate::project::row_of;
use crate::value::RowValue;

pub(super) fn bindings_section(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> Changed {
    let mut changed = Changed::default();
    widgets::section(ui, "Bindings");
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
            egui::Frame::new()
                .fill(theme::RAISED)
                .stroke(egui::Stroke::new(1.0, theme::BORDER))
                .corner_radius(4.0)
                .inner_margin(egui::Margin::symmetric(6, 3))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        widgets::key_hint(ui, &keys);
                        ui.label(theme::mono(kind).size(12.5));
                        if ui
                            .add(egui::Label::new(theme::faint("✕")).sense(Sense::click()))
                            .clicked()
                        {
                            remove = Some(index);
                        }
                    });
                });
        }
    });
    if let Some(index) = remove {
        value["bindings"]
            .as_array_mut()
            .expect("bindings")
            .remove(index);
        changed = Changed::at("/bindings");
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
                    } => {
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
                        return Some(Some(binding_json(
                            "click",
                            modifiers,
                            serde_json::json!({ "button": name, "times": 1 }),
                        )));
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
                    changed = Changed::at("/bindings");
                }
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            Some(None) => {
                ui.ctx().data_mut(|d| d.insert_temp(id, false));
            }
            None => {}
        }
    }
    let _ = cx;
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
    use egui::Key;
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

pub fn show_conflicts(editor: &mut Editor, ui: &mut Ui) {
    let selection = editor.selection.clone();
    let Some(key) = selection.keys.first() else {
        return;
    };
    let Some(value) = editor.row_value("input", key) else {
        return;
    };
    let Some(project) = &editor.project else {
        return;
    };
    for binding in value["bindings"].as_array().into_iter().flatten() {
        let (label, _) = binding_label(binding);
        widgets::section(ui, &format!("Also bound to {label}"));
        let others: Vec<String> = project
            .files
            .paths_under("tables/input/")
            .filter_map(|file| row_of(file).map(|(_, other)| (file.clone(), other.to_owned())))
            .filter(|(_, other)| other != key)
            .filter(|(file, _)| {
                project.files.json(file).is_some_and(|row| {
                    row["bindings"]
                        .as_array()
                        .is_some_and(|list| list.contains(binding))
                })
            })
            .map(|(_, other)| other)
            .collect();
        if others.is_empty() {
            widgets::hint(ui, &format!("No other input uses {label}."));
        } else {
            for other in others {
                ui.label(theme::mono(format!("input/{other}")).color(theme::WARN));
            }
        }
    }
}
