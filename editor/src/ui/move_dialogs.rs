use std::collections::{BTreeMap, BTreeSet};

use design_tokens::glyph::{self, Mark};
use egui::{Context, RichText, Ui};
use engine::core::content::{ContentRow, OWNER_FIELD, RowName, row_file, row_of};
use engine::systems::area::AreaDef;
use engine::systems::registry;

use super::dialogs::{DialogKeys, card, keys};
use super::{theme, widgets};
use crate::app::{
    DuplicateDialog, Editor, GatherDialog, MakeGlobalDialog, MakeLocalDialog, ModalDialog,
    MoveToDialog,
};
use crate::moves::{Gathered, MoveRefusal, ScopeMoves, StaysGlobal, owner_lines};
use crate::project::ContentEdit;
use crate::rows;

/// Opens the dialog that makes `row` local to the one row every use of it sits in, or says why
/// there is none.
pub fn make_local(editor: &mut Editor, row: RowName) {
    let Some(project) = &editor.project else {
        return;
    };
    match ScopeMoves::of(project).home(&row) {
        Ok(owner) => editor.dialogs.push(ModalDialog::MakeLocal(MakeLocalDialog {
            row,
            owner,
            kept: BTreeSet::new(),
            error: None,
        })),
        Err(reason) => {
            let text = stays_global_text(&row, &reason);
            editor.toast(text);
        }
    }
}

pub fn make_global(editor: &mut Editor, row: RowName) {
    editor
        .dialogs
        .push(ModalDialog::MakeGlobal(MakeGlobalDialog {
            row,
            kept: BTreeSet::new(),
            error: None,
        }));
}

pub fn move_to(editor: &mut Editor, row: RowName) {
    let draft = editor
        .project
        .as_ref()
        .and_then(|project| project.files.owners().owner(&row.table, &row.key).cloned())
        .map(|owner| owner.to_string())
        .unwrap_or_default();
    editor.dialogs.push(ModalDialog::MoveTo(MoveToDialog {
        row,
        draft,
        error: None,
    }));
}

pub fn gather(editor: &mut Editor) {
    editor.dialogs.push(ModalDialog::Gather(GatherDialog {
        ticks: BTreeMap::new(),
        open: BTreeSet::new(),
        table: None,
        plan: None,
        error: None,
    }));
}

/// Why `row` can't be made local, as its menu says it.
pub fn stays_global_text(row: &RowName, reason: &StaysGlobal) -> String {
    match reason {
        StaysGlobal::Scattered(_) => format!(
            "{} is {reason}. Make the others stop using it first, or keep it global.",
            row.key
        ),
        _ => format!("{} stays global: {reason}", row.key),
    }
}

pub fn duplicate_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: DuplicateDialog,
) -> Option<ModalDialog> {
    let project = editor.project.as_ref()?;
    let copies = rows::copied_keys(&project.files, &dialog.row, dialog.draft.trim());
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    card(ctx, "duplicate", 620.0, |ui| {
        pressed = keys(ui);
        title(ui, &format!("Duplicate {}", dialog.row));
        widgets::kv(ui, "new key", |ui| {
            let response = ui.add(
                egui::TextEdit::singleline(&mut dialog.draft)
                    .desired_width(f32::INFINITY)
                    .font(egui::TextStyle::Monospace),
            );
            widgets::default_focus(ui, &response);
        });
        ui.add_space(6.0);
        widgets::section_count(ui, "Copied with it", copies.len() - 1);
        let lines: Vec<String> = copies[1..]
            .iter()
            .map(|(row, key)| format!("{row} → {key}"))
            .collect();
        listed(ui, &lines, 6);
        ui.add_space(4.0);
        ui.add(
            egui::Label::new(theme::muted(format!(
                "Inside the copy, every reference to a copied row is rewritten to its copy, so \
                 editing {copy}'s rows never changes {key}'s. References to global rows stay as \
                 they are.",
                copy = dialog.draft.trim(),
                key = dialog.row.key
            )))
            .wrap(),
        );
        error_line(ui, &dialog.error);
        outcome = buttons(ui, &rows_phrase("Duplicate", copies.len(), ""), true);
    });
    match answer(outcome, &pressed) {
        Some(true) => match rows::duplicate_as(editor, &dialog.row, dialog.draft.trim()) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(ModalDialog::Duplicate(dialog))
            }
        },
        Some(false) => None,
        None => Some(ModalDialog::Duplicate(dialog)),
    }
}

pub fn make_local_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: MakeLocalDialog,
) -> Option<ModalDialog> {
    let project = editor.project.as_ref()?;
    let moves = ScopeMoves::of(project);
    let plan = moves.make_local(&dialog.row, &dialog.owner, &dialog.kept);
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    card(ctx, "make-local", 640.0, |ui| {
        pressed = keys(ui);
        title(
            ui,
            &format!("Make {} local to {}", dialog.row, dialog.owner),
        );
        widgets::code_block(
            ui,
            &format!(
                "{}\n+ \"{OWNER_FIELD}\": \"{}\",",
                row_file(&dialog.row.table, &dialog.row.key),
                dialog.owner
            ),
        );
        ui.add_space(4.0);
        ui.add(
            egui::Label::new(theme::muted(format!(
                "Every use of {key} stays as written: keys don't change and files don't move. \
                 Only who may use {key} changes.",
                key = dialog.row.key
            )))
            .wrap(),
        );
        let unticked: Vec<RowName> = dialog.kept.iter().cloned().collect();
        if !plan.along.is_empty() || !unticked.is_empty() {
            ui.add_space(6.0);
            ui.label(widgets::section_heading(&format!(
                "Also make local to {}",
                dialog.row.key
            )));
            for (row, owner) in &plan.along {
                let mut on = true;
                ui.horizontal(|ui| {
                    ui.checkbox(&mut on, theme::mono(row.to_string()));
                    let note = if *owner == dialog.row {
                        format!("only {} uses it", dialog.row.key)
                    } else {
                        format!("local to {owner}")
                    };
                    ui.label(theme::muted(note).size(12.5));
                });
                if !on {
                    dialog.kept.insert(row.clone());
                }
            }
            for row in unticked {
                let mut on = false;
                ui.horizontal(|ui| {
                    ui.checkbox(&mut on, theme::mono(row.to_string()));
                    ui.label(theme::muted("unticked: stays where it is").size(12.5));
                });
                if on {
                    dialog.kept.remove(&row);
                }
            }
        }
        if !plan.staying.is_empty() {
            ui.add_space(6.0);
            ui.label(widgets::section_heading("Stays global"));
            for (row, others) in plan.staying.iter().take(6) {
                ui.horizontal(|ui| {
                    ui.label(theme::faint("—"));
                    ui.label(theme::mono(row.to_string()).color(theme::MUTED));
                    ui.label(
                        theme::faint(format!(
                            "used by {others} other row{} · stays global",
                            widgets::plural(*others)
                        ))
                        .size(12.5),
                    );
                });
            }
        }
        if plan.seeing_all > 0 {
            ui.add_space(4.0);
            ui.label(
                theme::muted(format!(
                    "{} row{} that see every row name {}, and keep working.",
                    plan.seeing_all,
                    widgets::plural(plan.seeing_all),
                    dialog.row.key
                ))
                .size(12.5),
            );
        }
        error_line(ui, &dialog.error);
        outcome = buttons(
            ui,
            &rows_phrase("Make", plan.along.len() + 1, "local"),
            true,
        );
    });
    match answer(outcome, &pressed) {
        Some(true) => {
            let mut lines = vec![(plan.row.clone(), Some(plan.owner.clone()))];
            lines.extend(
                plan.along
                    .iter()
                    .map(|(row, owner)| (row.clone(), Some(owner.clone()))),
            );
            let mut label = format!("Made {} local to {}", plan.row, plan.owner);
            if !plan.along.is_empty() {
                label.push_str(&format!(" with {} more", plan.along.len()));
            }
            write_lines(editor, label, &lines, ModalDialog::MakeLocal, dialog)
        }
        Some(false) => None,
        None => Some(ModalDialog::MakeLocal(dialog)),
    }
}

pub fn make_global_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: MakeGlobalDialog,
) -> Option<ModalDialog> {
    let project = editor.project.as_ref()?;
    let moves = ScopeMoves::of(project);
    let owner = moves.owner(&dialog.row).cloned();
    let needed = moves.make_global(&dialog.row, &BTreeSet::new());
    let missing: Vec<&RowName> = needed
        .iter()
        .filter(|row| dialog.kept.contains(*row))
        .collect();
    let ready = missing.is_empty();
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    card(ctx, "make-global", 640.0, |ui| {
        pressed = keys(ui);
        title(ui, &format!("Make {} global", dialog.row));
        if let Some(owner) = &owner {
            widgets::code_block(
                ui,
                &format!(
                    "{}\n- \"{OWNER_FIELD}\": \"{owner}\",",
                    row_file(&dialog.row.table, &dialog.row.key)
                ),
            );
        }
        if !needed.is_empty() {
            ui.add_space(6.0);
            ui.label(widgets::section_heading(&format!(
                "It uses rows a global {} can't reach",
                dialog.row.table
            )));
            for row in &needed {
                let mut on = !dialog.kept.contains(row);
                ui.horizontal(|ui| {
                    ui.checkbox(&mut on, theme::mono(row.to_string()));
                    let place = moves
                        .owner(row)
                        .map(|owner| format!("local to {owner} · make global too"))
                        .unwrap_or_default();
                    ui.label(theme::muted(place).size(12.5));
                });
                if on {
                    dialog.kept.remove(row);
                } else {
                    dialog.kept.insert(row.clone());
                }
            }
        }
        ui.add_space(4.0);
        let uses = owner
            .as_ref()
            .map(|owner| {
                format!(
                    "Uses of {} from {} keep working: ",
                    dialog.row.key, owner.key
                )
            })
            .unwrap_or_default();
        ui.add(
            egui::Label::new(theme::muted(format!(
                "{uses}global rows are in reach from everywhere. Rows local to {} stay local to \
                 it. One undo step.",
                dialog.row.key
            )))
            .wrap(),
        );
        if let Some(row) = missing.first() {
            ui.colored_label(
                theme::DANGER,
                format!(
                    "{row} must become global too: {} or its local rows use it.",
                    dialog.row.key
                ),
            );
        }
        error_line(ui, &dialog.error);
        outcome = buttons(ui, &rows_phrase("Make", needed.len() + 1, "global"), ready);
    });
    match answer(outcome, &pressed) {
        Some(true) if ready => {
            let lines: Vec<(RowName, Option<RowName>)> = std::iter::once(dialog.row.clone())
                .chain(needed)
                .map(|row| (row, None))
                .collect();
            let label = format!("Made {} global", dialog.row);
            write_lines(editor, label, &lines, ModalDialog::MakeGlobal, dialog)
        }
        Some(false) => None,
        _ => Some(ModalDialog::MakeGlobal(dialog)),
    }
}

pub fn move_to_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: MoveToDialog,
) -> Option<ModalDialog> {
    let project = editor.project.as_ref()?;
    let moves = ScopeMoves::of(project);
    let from = moves.owner(&dialog.row).cloned();
    let target = RowName::try_from(dialog.draft.trim().to_owned()).ok();
    let verdict = target
        .as_ref()
        .map(|target| moves.move_to(&dialog.row, target));
    let held = moves.owners().held_within(&dialog.row).len();
    let needle = dialog.draft.trim().to_lowercase();
    let suggestions: Vec<RowName> = if target.as_ref().is_some_and(|target| {
        project
            .files
            .contains(&row_file(&target.table, &target.key))
    }) {
        Vec::new()
    } else {
        registry()
            .table_names()
            .into_iter()
            .flat_map(|table| {
                project
                    .files
                    .keys_of(table)
                    .map(move |key| RowName::new(table, key))
            })
            .filter(|row| row.to_string().contains(&needle) && !moves.holds(&dialog.row, row))
            .take(8)
            .collect()
    };
    let mut outcome = None;
    let mut instead = false;
    let mut pressed = DialogKeys::default();
    card(ctx, "move-to", 640.0, |ui| {
        pressed = keys(ui);
        let heading = match &from {
            Some(from) => format!("Move {} out of {from}", dialog.row),
            None => format!("Move {}", dialog.row),
        };
        title(ui, &heading);
        widgets::kv(ui, "owner", |ui| {
            let response = ui.add(
                egui::TextEdit::singleline(&mut dialog.draft)
                    .hint_text("table/key")
                    .desired_width(f32::INFINITY)
                    .font(egui::TextStyle::Monospace),
            );
            widgets::default_focus(ui, &response);
        });
        for row in &suggestions {
            if ui
                .selectable_label(false, theme::mono(row.to_string()).size(12.5))
                .clicked()
            {
                dialog.draft = row.to_string();
            }
        }
        match &verdict {
            Some(Err(MoveRefusal::Breaks(broken))) => {
                ui.add_space(6.0);
                let heading = match &from {
                    Some(from) => format!("Still used by {from}"),
                    None => "Still used".to_owned(),
                };
                ui.label(widgets::section_heading(&heading));
                for use_ in broken.iter().take(8) {
                    let reader = row_of(&use_.file)
                        .map(|(table, key)| format!("{table}/{key}"))
                        .unwrap_or_else(|| use_.file.clone());
                    let field = rows::field_of(project, &use_.file, &use_.pointer);
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("✕").color(theme::DANGER));
                        ui.label(theme::mono(format!("{field} {}", use_.target.key)));
                        ui.label(theme::muted(reader).size(12.5));
                    });
                }
                if broken.len() > 8 {
                    ui.label(theme::faint(format!("… {} more", broken.len() - 8)));
                }
                ui.add_space(4.0);
                if let (Some(target), Some(from)) = (&target, &from) {
                    ui.add(
                        egui::Label::new(theme::muted(format!(
                            "{target} is not {from} or one of its local rows, so these would \
                             lose {key}. Remove them first, or make {key} global.",
                            key = dialog.row.key
                        )))
                        .wrap(),
                    );
                }
            }
            Some(Err(refusal)) => {
                ui.colored_label(theme::DANGER, refusal.to_string());
            }
            Some(Ok(())) | None => {}
        }
        if held > 0 {
            ui.label(
                theme::muted(format!(
                    "The {held} row{} local to {} stay local to it.",
                    widgets::plural(held),
                    dialog.row.key
                ))
                .size(12.5),
            );
        }
        error_line(ui, &dialog.error);
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.add_enabled_ui(matches!(verdict, Some(Ok(()))), |ui| {
                if widgets::primary(ui, "Move").clicked() {
                    outcome = Some(true);
                }
            });
            if from.is_some() && ui.button("Make global instead…").clicked() {
                instead = true;
            }
            if ui.button("Cancel").clicked() {
                outcome = Some(false);
            }
        });
    });
    if instead {
        return Some(ModalDialog::MakeGlobal(MakeGlobalDialog {
            row: dialog.row,
            kept: BTreeSet::new(),
            error: None,
        }));
    }
    match (answer(outcome, &pressed), target, verdict) {
        (Some(true), Some(target), Some(Ok(()))) => {
            let label = format!("Moved {} to {target}", dialog.row);
            let lines = [(dialog.row.clone(), Some(target))];
            write_lines(editor, label, &lines, ModalDialog::MoveTo, dialog)
        }
        (Some(false), ..) => None,
        _ => Some(ModalDialog::MoveTo(dialog)),
    }
}

pub fn gather_dialog(
    editor: &mut Editor,
    ctx: &Context,
    mut dialog: GatherDialog,
) -> Option<ModalDialog> {
    let project = editor.project.as_ref()?;
    if dialog.plan.is_none() {
        dialog.plan = Some(ScopeMoves::of(project).gather(&dialog.ticks));
    }
    let plan = dialog.plan.clone().unwrap_or_default();
    let planned: BTreeMap<&RowName, &Gathered> = plan
        .iter()
        .map(|gathered| (&gathered.row, gathered))
        .collect();
    let top_of = |gathered: &Gathered| {
        let mut owner = &gathered.owner;
        let mut depth = 0;
        while let Some(above) = planned.get(owner).filter(|above| above.ticked) {
            owner = &above.owner;
            depth += 1;
        }
        (owner.clone(), depth)
    };
    let mut groups: BTreeMap<RowName, Vec<(&Gathered, usize)>> = BTreeMap::new();
    for gathered in &plan {
        let (top, depth) = top_of(gathered);
        groups.entry(top).or_default().push((gathered, depth));
    }
    for (top, members) in &mut groups {
        *members = as_tree(top, members);
    }
    let ticked: Vec<&Gathered> = plan.iter().filter(|gathered| gathered.ticked).collect();
    let mut per_table: BTreeMap<&str, usize> = BTreeMap::new();
    for gathered in &ticked {
        *per_table.entry(&gathered.row.table).or_default() += 1;
    }
    let mut tables: Vec<(&str, usize)> = per_table.into_iter().collect();
    tables.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    let mut ordered: Vec<(RowName, Vec<(&Gathered, usize)>)> = groups
        .into_iter()
        .filter(|(_, members)| {
            dialog.table.as_ref().is_none_or(|table| {
                members
                    .iter()
                    .any(|(gathered, _)| gathered.row.table == *table)
            })
        })
        .collect();
    ordered.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then(a.0.cmp(&b.0)));
    let owners: BTreeSet<&RowName> = ticked.iter().map(|gathered| &gathered.owner).collect();
    let unticked_areas = plan
        .iter()
        .filter(|gathered| !gathered.ticked && gathered.row.table == AreaDef::TABLE)
        .count();
    let mut toggles: Vec<(Vec<RowName>, bool)> = Vec::new();
    let mut outcome = None;
    let mut pressed = DialogKeys::default();
    card(ctx, "gather", 980.0, |ui| {
        pressed = keys(ui);
        title(ui, "Gather local content");
        ui.label(theme::muted(
            "These rows are used from inside exactly one other row. Each ticked row gets that row \
             as its owner. Keys and files stay as they are.",
        ));
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.label(theme::muted("show").size(12.5));
            let shown = match &dialog.table {
                Some(table) => format!("{table} · {}", per_table_count(&tables, table)),
                None => format!("all tables · {}", ticked.len()),
            };
            widgets::combo("gather-table")
                .selected_text(theme::mono(shown).size(13.0))
                .show_ui(ui, |ui| {
                    if ui
                        .selectable_label(
                            dialog.table.is_none(),
                            format!("all tables · {}", ticked.len()),
                        )
                        .clicked()
                    {
                        dialog.table = None;
                    }
                    for (table, count) in &tables {
                        let on = dialog.table.as_deref() == Some(*table);
                        if ui
                            .selectable_label(on, theme::mono(format!("{table} · {count}")))
                            .clicked()
                        {
                            dialog.table = Some((*table).to_owned());
                        }
                    }
                });
        });
        ui.add_space(4.0);
        egui::ScrollArea::vertical()
            .max_height(440.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                for (top, members) in ordered.iter().take(60) {
                    let ticked_members = members
                        .iter()
                        .filter(|(gathered, _)| gathered.ticked)
                        .count();
                    let open = dialog.open.contains(top);
                    ui.horizontal(|ui| {
                        let mut on = ticked_members > 0;
                        let mixed = on && ticked_members < members.len();
                        if ui
                            .add(egui::Checkbox::without_text(&mut on).indeterminate(mixed))
                            .changed()
                        {
                            toggles.push((
                                members
                                    .iter()
                                    .map(|(gathered, _)| gathered.row.clone())
                                    .collect(),
                                on,
                            ));
                        }
                        let fold = ui
                            .horizontal(|ui| {
                                let mark = if open {
                                    Mark::ChevronDown
                                } else {
                                    Mark::ChevronRight
                                };
                                glyph::show(ui, mark, 11.0, theme::FAINT);
                                ui.label(theme::mono(top.to_string()).color(theme::TEXT));
                            })
                            .response
                            .interact(egui::Sense::click());
                        if fold.clicked() {
                            if open {
                                dialog.open.remove(top);
                            } else {
                                dialog.open.insert(top.clone());
                            }
                        }
                        ui.label(theme::muted(table_counts(members)).size(12.5));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(theme::mono(members.len().to_string()).color(theme::MUTED));
                        });
                    });
                    if !open {
                        continue;
                    }
                    for (gathered, depth) in members {
                        ui.horizontal(|ui| {
                            ui.add_space(24.0 + 18.0 * *depth as f32);
                            let mut on = gathered.ticked;
                            if ui
                                .checkbox(&mut on, theme::mono(gathered.row.to_string()))
                                .changed()
                            {
                                toggles.push((vec![gathered.row.clone()], on));
                            }
                            let note = if gathered.ticked {
                                format!("local to {}", gathered.owner)
                            } else if gathered.row.table == AreaDef::TABLE {
                                "kept global by convention · tick to make local".to_owned()
                            } else {
                                "unticked: stays global".to_owned()
                            };
                            ui.label(theme::muted(note).size(12.5));
                        });
                    }
                }
                if ordered.len() > 60 {
                    ui.label(theme::faint(format!(
                        "… {} more owners",
                        ordered.len() - 60
                    )));
                }
            });
        ui.add_space(6.0);
        ui.label(widgets::section_heading("Never offered"));
        ui.label(
            theme::muted(
                "Fixture rows · rows the game's settings name · rows only test characters or the \
                 world map use · rows nothing uses · rows used from inside more than one row",
            )
            .size(12.5),
        );
        error_line(ui, &dialog.error);
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            ui.label(
                theme::faint(format!(
                    "{} rows get an owner line · {unticked_areas} areas left unticked · one undo \
                     step",
                    ticked.len()
                ))
                .size(12.5),
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.add_enabled_ui(!ticked.is_empty(), |ui| {
                    if widgets::primary(ui, format!("Gather {} rows", ticked.len())).clicked() {
                        outcome = Some(true);
                    }
                });
                if ui.button("Cancel").clicked() {
                    outcome = Some(false);
                }
            });
        });
    });
    if !toggles.is_empty() {
        for (rows, on) in toggles {
            for row in rows {
                dialog.ticks.insert(row, on);
            }
        }
        dialog.plan = None;
    }
    match answer(outcome, &pressed) {
        Some(true) if !ticked.is_empty() => {
            let lines: Vec<(RowName, Option<RowName>)> = ticked
                .iter()
                .map(|gathered| (gathered.row.clone(), Some(gathered.owner.clone())))
                .collect();
            let label = format!(
                "Gathered {} rows into {} owners",
                widgets::thousands(lines.len()),
                widgets::thousands(owners.len())
            );
            write_lines(editor, label, &lines, ModalDialog::Gather, dialog)
        }
        Some(false) => None,
        _ => Some(ModalDialog::Gather(dialog)),
    }
}

fn write_lines<D>(
    editor: &mut Editor,
    label: String,
    lines: &[(RowName, Option<RowName>)],
    again: impl FnOnce(D) -> ModalDialog,
    mut dialog: D,
) -> Option<ModalDialog>
where
    D: HasError,
{
    let Some(project) = &editor.project else {
        return None;
    };
    let mut edit = ContentEdit::new(label.clone());
    owner_lines(&mut edit, &project.files, lines);
    match editor.try_apply(edit) {
        Ok(()) => {
            editor.toast(label);
            None
        }
        Err(error) => {
            dialog.set_error(error);
            Some(again(dialog))
        }
    }
}

trait HasError {
    fn set_error(&mut self, error: String);
}

macro_rules! has_error {
    ($($dialog:ty),*) => {$(
        impl HasError for $dialog {
            fn set_error(&mut self, error: String) {
                self.error = Some(error);
            }
        }
    )*};
}

has_error!(
    MakeLocalDialog,
    MakeGlobalDialog,
    MoveToDialog,
    GatherDialog
);

/// `members` ordered as the tree under `top` they make: each row followed by the rows local to it.
fn as_tree<'g>(top: &RowName, members: &[(&'g Gathered, usize)]) -> Vec<(&'g Gathered, usize)> {
    let mut ordered = Vec::with_capacity(members.len());
    let mut pending: Vec<(&RowName, usize)> = vec![(top, 0)];
    while let Some((owner, depth)) = pending.pop() {
        let children: Vec<&(&Gathered, usize)> = members
            .iter()
            .filter(|(gathered, _)| gathered.owner == *owner)
            .collect();
        for (gathered, _) in children.iter().rev() {
            pending.push((&gathered.row, depth + 1));
        }
        if depth > 0
            && let Some((gathered, _)) = members.iter().find(|(gathered, _)| gathered.row == *owner)
        {
            ordered.push((*gathered, depth - 1));
        }
    }
    ordered
}

fn per_table_count(tables: &[(&str, usize)], table: &str) -> usize {
    tables
        .iter()
        .find(|(listed, _)| *listed == table)
        .map_or(0, |(_, count)| *count)
}

fn table_counts(members: &[(&Gathered, usize)]) -> String {
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for (gathered, _) in members {
        *counts.entry(&gathered.row.table).or_default() += 1;
    }
    let mut counts: Vec<(&str, usize)> = counts.into_iter().collect();
    counts.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    counts
        .iter()
        .map(|(table, count)| format!("{table} {count}"))
        .collect::<Vec<_>>()
        .join(" · ")
}

/// "Make 1 row local", "Duplicate 3 rows".
fn rows_phrase(verb: &str, count: usize, after: &str) -> String {
    let phrase = format!("{verb} {count} row{}", widgets::plural(count));
    if after.is_empty() {
        phrase
    } else {
        format!("{phrase} {after}")
    }
}

fn title(ui: &mut Ui, text: &str) {
    ui.label(RichText::new(text).strong().size(18.0));
    ui.add_space(8.0);
}

fn listed(ui: &mut Ui, lines: &[String], shown: usize) {
    for line in lines.iter().take(shown) {
        ui.label(theme::mono(line).size(12.5));
    }
    if lines.len() > shown {
        ui.label(theme::faint(format!("… {} more", lines.len() - shown)).monospace());
    }
}

fn error_line(ui: &mut Ui, error: &Option<String>) {
    if let Some(error) = error {
        ui.colored_label(theme::DANGER, error);
    }
}

fn buttons(ui: &mut Ui, confirm: &str, ready: bool) -> Option<bool> {
    let mut outcome = None;
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        ui.add_enabled_ui(ready, |ui| {
            if widgets::primary(ui, confirm).clicked() {
                outcome = Some(true);
            }
        });
        if ui.button("Cancel").clicked() {
            outcome = Some(false);
        }
    });
    outcome
}

fn answer(outcome: Option<bool>, pressed: &DialogKeys) -> Option<bool> {
    if pressed.escape {
        Some(false)
    } else if pressed.enter {
        Some(true)
    } else {
        outcome
    }
}
