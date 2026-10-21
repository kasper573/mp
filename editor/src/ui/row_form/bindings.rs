use bevy::input::keyboard::KeyCode;
use bevy::input::mouse::MouseButton;
use design_tokens::glyph::{self, Mark};
use egui::{Key, Sense, Ui};
use engine::core::content::ContentFile;
use engine::field;
use engine::systems::input::map::{InputBinding, InputBindingKind, InputDef, KeyModifiers};
use serde_json::Value;

use super::{theme, widgets};
use crate::forms::{self, FormChange, FormCx};
use crate::project::Project;
use crate::tabs::file_title;

/// The bindings of the input row `value` at `key`, each a chip, and a field that captures the
/// next key or click as one more.
pub(super) fn bindings_section(
    ui: &mut Ui,
    cx: &mut FormCx,
    key: &str,
    value: &mut Value,
) -> FormChange {
    widgets::section(ui, "Bindings");
    let path = field!(InputDef, bindings);
    forms::of_row(ui, cx, value, path, |ui, cx, input: &mut InputDef| {
        bindings(ui, cx, key, &mut input.bindings, path)
    })
}

fn bindings(
    ui: &mut Ui,
    cx: &mut FormCx,
    key: &str,
    bindings: &mut Vec<InputBinding>,
    path: &str,
) -> FormChange {
    let mut changed = FormChange::default();
    let read = cx.locks.iter().find_map(|lock| lock.variants(path));
    let reads = |kind: InputBindingKind| {
        read.is_none_or(|read| read.iter().any(|known| known == <&str>::from(kind)))
    };
    let mut remove = None;
    let mut conflicts = Vec::new();
    ui.horizontal_wrapped(|ui| {
        for (index, binding) in bindings.iter().enumerate() {
            let name = binding.name();
            let kind = <&str>::from(InputBindingKind::from(binding)).replace('_', " ");
            let shared_with = also_bound(cx.project, key, binding);
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
                        widgets::key_hint(ui, &name);
                        ui.label(theme::mono(kind).size(12.5));
                        if glyph::button(ui, Mark::Cross, 11.0, theme::FAINT, "Remove").clicked() {
                            remove = Some(index);
                        }
                    });
                })
                .response
                .on_hover_text(if shared_with.is_empty() {
                    format!("Only this input uses {name}.")
                } else {
                    format!("Also bound to {}.", shared_with.join(", "))
                });
            if !shared_with.is_empty() {
                conflicts.push(format!(
                    "{name} is also bound to {}",
                    shared_with.join(", ")
                ));
            }
        }
    });
    for conflict in conflicts {
        ui.label(theme::warn(conflict).size(12.5));
    }
    if let Some(index) = remove {
        bindings.remove(index);
        changed = FormChange::at(path);
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
    if !capturing {
        return changed;
    }
    match ui.input(|input| capture(input, reads)) {
        Some(Capture::Bound(binding)) => {
            if !bindings.contains(&binding) {
                bindings.push(binding);
                changed = FormChange::at(path);
            }
            ui.ctx().data_mut(|d| d.insert_temp(id, false));
        }
        Some(Capture::Cancelled) => {
            ui.ctx().data_mut(|d| d.insert_temp(id, false));
        }
        None => {}
    }
    changed
}

enum Capture {
    Bound(InputBinding),
    Cancelled,
}

fn capture(input: &egui::InputState, reads: impl Fn(InputBindingKind) -> bool) -> Option<Capture> {
    if input.key_pressed(Key::Escape) {
        return Some(Capture::Cancelled);
    }
    input.events.iter().find_map(|event| match event {
        egui::Event::Key {
            key,
            physical_key,
            pressed: true,
            modifiers,
            ..
        } if reads(InputBindingKind::Key) => key_code(physical_key.unwrap_or(*key))
            .map(|code| Capture::Bound(InputBinding::key(code).with(held(modifiers)))),
        egui::Event::PointerButton {
            button,
            pressed: true,
            modifiers,
            ..
        } => {
            let button = match button {
                egui::PointerButton::Secondary => MouseButton::Right,
                egui::PointerButton::Middle => MouseButton::Middle,
                _ => MouseButton::Left,
            };
            let binding = [
                (InputBindingKind::Click, InputBinding::click(button)),
                (InputBindingKind::Drag, InputBinding::drag(button)),
                (InputBindingKind::Mouse, InputBinding::mouse(button)),
            ]
            .into_iter()
            .find_map(|(kind, binding)| reads(kind).then_some(binding))?;
            Some(Capture::Bound(binding.with(held(modifiers))))
        }
        _ => None,
    })
}

fn held(modifiers: &egui::Modifiers) -> KeyModifiers {
    KeyModifiers {
        ctrl: modifiers.ctrl || modifiers.command,
        shift: modifiers.shift,
        alt: modifiers.alt,
        super_key: false,
    }
}

/// egui and bevy name a few keys apart; content stores bevy's names.
fn key_code(key: Key) -> Option<KeyCode> {
    let name = match key {
        Key::ArrowDown => "ArrowDown".to_owned(),
        Key::ArrowLeft => "ArrowLeft".to_owned(),
        Key::ArrowRight => "ArrowRight".to_owned(),
        Key::ArrowUp => "ArrowUp".to_owned(),
        Key::Equals => "Equal".to_owned(),
        Key::Backtick => "Backquote".to_owned(),
        Key::OpenBracket => "BracketLeft".to_owned(),
        Key::CloseBracket => "BracketRight".to_owned(),
        _ => {
            let name = key.name();
            match name.chars().next() {
                Some(first) if name.len() == 1 && first.is_ascii_alphabetic() => {
                    format!("Key{name}")
                }
                Some(first) if name.len() == 1 && first.is_ascii_digit() => format!("Digit{name}"),
                _ => name.to_owned(),
            }
        }
    };
    serde_json::from_value(Value::String(name)).ok()
}

/// The other inputs that carry this same binding.
fn also_bound(project: &Project, key: &str, binding: &InputBinding) -> Vec<String> {
    project
        .files
        .paths_of(InputDef::TABLE)
        .into_iter()
        .filter(|other| other != key)
        .filter(|other| {
            project
                .read::<InputDef>(other)
                .is_ok_and(|input| input.bindings.contains(binding))
        })
        .map(|other| file_title(&other).to_owned())
        .collect()
}
