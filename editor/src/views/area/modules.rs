use egui::{Pos2, RichText, Ui, Vec2};
use engine::core::math::Pos;
use engine::core::tiling::{CellPos, TilePos, Tiles};
use engine::systems::area::AreaModuleKind;
use engine::systems::script::Place;
use serde_json::Value;

use super::select::start_paste;
use super::{AreaAction, AreaFrame, AreaTool, AreaViewState, pins, shapes};
use super::{pick, placement};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::{ContentEdit, RowSelection};
use crate::ui::{theme, widgets};
use crate::value::RowValue;
use crate::{play, schema};
use engine::core::content::row_file;

#[derive(Clone, Copy)]
pub struct AreaMenuAnchor {
    pub at: Pos2,
    pub tile: Pos<Tiles>,
}

pub(super) fn context_menu_at(editor: &mut Editor, view_key: &str, frame: &AreaFrame) {
    let Some(tile) = frame.pointer_tile else {
        return;
    };
    let view = editor.views.area.view_mut(view_key);
    view.cursor_cell = Some(tile.cell());
    view.take_drag();
    let selecting = view.tool == AreaTool::Select;
    if selecting && let Some(hit) = frame.hit(tile) {
        let part = super::module_part(hit);
        if !super::selected_parts(editor, &frame.area_key).contains(&part) {
            editor.selection = RowSelection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts: vec![part],
            };
        }
    }
    let view = editor.views.area.view_mut(view_key);
    open_menu(
        &frame.response.ctx,
        view,
        view_key,
        frame.pointer.unwrap_or(frame.canvas.screen.center()),
        tile,
    );
}

pub(super) fn open_add_menu(
    ui: &mut Ui,
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    tile: Pos<Tiles>,
) {
    if let Some(view) = editor.views.area.views.get_mut(view_key) {
        let at = frame.pointer.unwrap_or(frame.canvas.screen.center());
        open_menu(ui.ctx(), view, view_key, at, tile);
    }
}

pub(super) fn open_menu(
    ctx: &egui::Context,
    view: &mut AreaViewState,
    view_key: &str,
    at: Pos2,
    tile: Pos<Tiles>,
) {
    egui::Popup::open_id(ctx, menu_id(view_key));
    view.menu = Some(AreaMenuAnchor { at, tile });
}

fn menu_id(view_key: &str) -> egui::Id {
    egui::Id::new((view_key, "context"))
}

pub fn module_menu_row(ui: &mut Ui, kind: &str, description: &str) -> bool {
    let (rect, response) = ui.allocate_exact_size(
        Vec2::new(ui.available_width().min(260.0), 34.0),
        egui::Sense::click(),
    );
    if response.hovered() {
        ui.painter().rect_filled(rect, 4.0, theme::ACCENT_SOFT);
    }
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect.shrink2(Vec2::new(6.0, 2.0)))
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    widgets::badge(&mut child, kind);
    child.vertical(|ui| {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.label(RichText::new(kind).monospace().color(theme::TEXT));
        ui.label(RichText::new(description).size(11.5).color(theme::MUTED));
    });
    response.clicked()
}

pub(super) fn show_add_menu(ui: &mut Ui, editor: &mut Editor, view_key: &str, frame: &AreaFrame) {
    let id = menu_id(view_key);
    if !egui::Popup::is_id_open(ui.ctx(), id) {
        return;
    }
    let Some(AreaMenuAnchor { at, tile }) = editor
        .views
        .area
        .views
        .get(view_key)
        .and_then(|view| view.menu)
    else {
        return;
    };
    let mut action: Option<MenuAction> = None;
    let selected = super::selected_parts(editor, &frame.area_key);
    let variants = module_variants(editor);
    egui::Popup::new(
        id,
        ui.ctx().clone(),
        egui::PopupAnchor::Position(at),
        ui.layer_id(),
    )
    .open_memory(None)
    .show(|ui| {
        ui.set_min_width(220.0);
        let cell = tile.cell();
        ui.label(RichText::new(format!("{}, {}", cell.x, cell.y)).weak());
        let character =
            play::current_character(editor).unwrap_or_else(|| "a test character".to_owned());
        if ui
            .add(widgets::shortcut_button(
                format!("Play here as {character}"),
                EditorKey::PlayHere,
            ))
            .clicked()
        {
            action = Some(MenuAction::PlayHere);
            ui.close();
        }
        ui.menu_button("Play here as…", |ui| {
            for other in play::test_characters(editor) {
                if ui
                    .button(format!(
                        "{} · level {} · {}",
                        other.key, other.level, other.area
                    ))
                    .clicked()
                {
                    editor.play.character = Some(other.key.clone());
                    editor.settings.last_play = Some(other.key);
                    action = Some(MenuAction::PlayHere);
                    ui.close();
                }
            }
        });
        if ui
            .add(widgets::shortcut_button(
                "Play from its own start",
                EditorKey::PlayFromStart,
            ))
            .clicked()
        {
            action = Some(MenuAction::PlayFromStart);
            ui.close();
        }
        ui.separator();
        if ui.button("Set the game's spawn here").clicked() {
            action = Some(MenuAction::SetSpawn);
            ui.close();
        }
        if ui
            .button(format!("Listen here ({} click)", EditorKey::Listen.name()))
            .clicked()
        {
            action = Some(MenuAction::Listen);
            ui.close();
        }
        ui.separator();
        ui.label(
            RichText::new("ADD MODULE")
                .size(11.0)
                .color(crate::ui::theme::MUTED)
                .family(theme::medium()),
        );
        for (group, kinds) in ADD_MENU {
            ui.add_space(2.0);
            ui.label(
                RichText::new(*group)
                    .size(11.0)
                    .color(crate::ui::theme::FAINT),
            );
            for &(kind, description) in *kinds {
                if !variants.iter().any(|(tag, _)| tag == kind.tag()) {
                    continue;
                }
                if module_menu_row(ui, kind.tag(), description) {
                    action = Some(MenuAction::Add(kind));
                    ui.close();
                }
            }
        }
        if !selected.is_empty() {
            ui.separator();
            ui.label(RichText::new(format!("{} selected", selected.len())).strong());
            if ui
                .add(widgets::shortcut_button("Copy", EditorKey::Copy))
                .clicked()
            {
                action = Some(MenuAction::Area(AreaAction::Copy));
                ui.close();
            }
            if ui
                .add(widgets::shortcut_button("Duplicate", EditorKey::Duplicate))
                .clicked()
            {
                action = Some(MenuAction::Area(AreaAction::Duplicate));
                ui.close();
            }
            if ui
                .add(widgets::shortcut_button(
                    "Make blueprint",
                    EditorKey::MakeBlueprint,
                ))
                .clicked()
            {
                action = Some(MenuAction::Area(AreaAction::MakeBlueprint));
                ui.close();
            }
            if selected.len() == 1 {
                let index: Option<usize> =
                    selected.iter().next().and_then(|p| super::module_index(p));
                if let Some(index) = index {
                    let module = &frame.modules[index];
                    if module.is_module(AreaModuleKind::Blueprint) {
                        if ui
                            .add(widgets::shortcut_button(
                                "Edit blueprint in place",
                                EditorKey::Confirm,
                            ))
                            .clicked()
                        {
                            action = Some(MenuAction::EditInPlace(index));
                            ui.close();
                        }
                        if ui.button("Unpack").clicked() {
                            action = Some(MenuAction::Area(AreaAction::Unpack(index)));
                            ui.close();
                        }
                        if ui.button("Replace with…").clicked() {
                            action = Some(MenuAction::Area(AreaAction::Replace(index)));
                            ui.close();
                        }
                    }
                    if module.is_module(AreaModuleKind::Scenery)
                        && ui.button("Split into tiles").clicked()
                    {
                        action = Some(MenuAction::Area(AreaAction::Split(index)));
                        ui.close();
                    }
                    if module.is_module(AreaModuleKind::Object)
                        && ui.button("Return door…").clicked()
                    {
                        action = Some(MenuAction::Area(AreaAction::ReturnDoor(index)));
                        ui.close();
                    }
                }
            }
            if ui
                .add(widgets::shortcut_button("Delete", EditorKey::Delete))
                .clicked()
            {
                action = Some(MenuAction::Area(AreaAction::Delete));
                ui.close();
            }
        }
        if editor.clipboard.is_some()
            && ui
                .add(widgets::shortcut_button("Paste here", EditorKey::Paste))
                .clicked()
        {
            action = Some(MenuAction::Paste);
            ui.close();
        }
    });
    let Some(action) = action else {
        return;
    };
    match action {
        MenuAction::PlayHere => {
            let place = Place {
                area: frame.area_id,
                at: tile.snap(),
            };
            play::start(editor, Some(place));
        }
        MenuAction::PlayFromStart => play::start(editor, None),
        MenuAction::SetSpawn => pins::set_spawn(editor, &frame.area_key, tile.snap()),
        MenuAction::Listen => {
            editor.views.area.view_mut(view_key).listener = Some(tile);
            pick::listen(editor, frame, tile);
        }
        MenuAction::Add(kind) => add_module(editor, view_key, frame, kind, tile),
        MenuAction::Paste => start_paste(editor, view_key),
        MenuAction::EditInPlace(index) => placement::edit_in_place(editor, view_key, frame, index),
        MenuAction::Area(action) => super::run_action(editor, frame, action),
    }
}

pub(super) enum MenuAction {
    PlayHere,
    PlayFromStart,
    SetSpawn,
    Listen,
    Add(AreaModuleKind),
    Paste,
    EditInPlace(usize),
    Area(AreaAction),
}

pub fn variant_template(editor: &Editor, kind: &str) -> Option<Value> {
    module_variants(editor)
        .into_iter()
        .find_map(|(tag, template)| (tag == kind).then_some(template))
}

pub fn module_variants(editor: &Editor) -> Vec<(String, Value)> {
    let root = editor.shapes.shape_of("area");
    editor
        .shapes
        .module_variants("area")
        .iter()
        .map(|variant| (variant.tag.clone(), schema::variant_template(root, variant)))
        .collect()
}

pub const ADD_MENU: &[(&str, &[(AreaModuleKind, &str)])] = &[
    (
        "Shapes",
        &[
            (AreaModuleKind::Object, "a point or rect with scripts"),
            (AreaModuleKind::SafeZone, "a rect where no one fights"),
            (AreaModuleKind::Soundscape, "a sound zone"),
        ],
    ),
    (
        "People",
        &[
            (AreaModuleKind::Population, "npcs that roam a rect"),
            (AreaModuleKind::Resident, "one npc at one spot"),
        ],
    ),
    (
        "Copies",
        &[
            (AreaModuleKind::Blueprint, "a blueprint, placed"),
            (AreaModuleKind::Scenery, "tiles drawn as one"),
        ],
    ),
    (
        "Area-wide",
        &[
            (AreaModuleKind::InlineScript, "its nodes in this area"),
            (AreaModuleKind::SharedScript, "names a script row"),
        ],
    ),
];

pub fn module_template(editor: &Editor, kind: AreaModuleKind, cell: CellPos) -> Option<Value> {
    let mut module = variant_template(editor, kind.tag())?;
    let (x, y) = (cell.x as f32, cell.y as f32);
    match kind {
        AreaModuleKind::Object => {
            module["shape"] = serde_json::json!({ "type": "point", "x": x, "y": y });
        }
        AreaModuleKind::SafeZone => {
            module["rect"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
        }
        AreaModuleKind::Soundscape => {
            module["shape"] = serde_json::json!({ "type": "rect", "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
            module["emit"] = serde_json::json!(4.0);
            module["channels"] = serde_json::json!([]);
        }
        AreaModuleKind::Population => {
            module["roams"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
            module["count"] = serde_json::json!(1);
        }
        AreaModuleKind::Resident | AreaModuleKind::Blueprint => {
            module["at"] = serde_json::json!({ "x": x, "y": y });
        }
        AreaModuleKind::Scenery => {
            module["at"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5 });
        }
        AreaModuleKind::InlineScript => {
            module["nodes"] = serde_json::json!({});
        }
        _ => {}
    }
    Some(module)
}

pub fn add_module(
    editor: &mut Editor,
    view_key: &str,
    frame: &AreaFrame,
    kind: AreaModuleKind,
    tile: Pos<Tiles>,
) {
    let Some(mut module) = module_template(editor, kind, tile.cell()) else {
        return;
    };
    if kind == AreaModuleKind::Blueprint
        && let Some(stamp) = editor.views.area.view(view_key).stamp.clone()
    {
        module["blueprint"] = Value::String(stamp);
    }
    let reference = match kind {
        AreaModuleKind::Population | AreaModuleKind::Resident => Some("npc"),
        AreaModuleKind::Blueprint => Some("blueprint"),
        AreaModuleKind::SharedScript => Some("script"),
        AreaModuleKind::Scenery => Some("tileset"),
        _ => None,
    };
    if let Some(table) = reference
        && module[table].as_str().unwrap_or_default().is_empty()
    {
        pick::pick_then_add(editor, frame, module, table, table);
        return;
    }
    let label = shapes::label(&module);
    append_modules(
        editor,
        &frame.area_key,
        vec![module],
        &format!("Add {label} to {}", frame.area_key),
    );
}

pub fn append_modules(editor: &mut Editor, area_key: &str, new: Vec<Value>, label: &str) -> bool {
    let count = new.len();
    let mut start = 0;
    let applied = change_modules(editor, area_key, |modules| {
        start = modules.len();
        modules.extend(new);
        Some(label.to_owned())
    });
    if applied {
        select_appended(editor, area_key, start, count);
    }
    applied
}

pub enum Placement {
    Whole,
    Partly { skipped: usize, reason: String },
}

pub fn place_modules(
    editor: &mut Editor,
    area_key: &str,
    new: Vec<Value>,
    label: &str,
) -> Placement {
    let count = new.len();
    let existing = area_modules(editor, area_key);
    let start = existing.len();
    let whole: Vec<Value> = existing
        .iter()
        .cloned()
        .chain(new.iter().cloned())
        .collect();
    let Some(edit) = module_edit(editor, area_key, |list| {
        *list = whole;
        Some(label.to_owned())
    }) else {
        return Placement::Partly {
            skipped: count,
            reason: "the area is gone".to_owned(),
        };
    };
    let Some(refusal) = editor
        .project
        .as_ref()
        .and_then(|project| project.check(&edit).err())
    else {
        return match editor.try_apply(edit) {
            Ok(()) => {
                select_appended(editor, area_key, start, count);
                Placement::Whole
            }
            Err(reason) => Placement::Partly {
                skipped: count,
                reason,
            },
        };
    };
    let mut reason = refusal.sentence();
    let mut kept = existing;
    let mut kept_count = 0;
    let mut skipped = 0;
    for module in new {
        let mut candidate = kept.clone();
        candidate.push(module);
        let Some(probe) = module_edit(editor, area_key, |list| {
            *list = candidate.clone();
            Some(String::new())
        }) else {
            break;
        };
        match editor.project.as_ref().map(|project| project.check(&probe)) {
            Some(Ok(())) => {
                kept = candidate;
                kept_count += 1;
            }
            Some(Err(refused)) => {
                skipped += 1;
                if kept_count == 0 {
                    reason = refused.sentence();
                }
            }
            None => break,
        }
    }
    if kept_count > 0
        && let Some(edit) = module_edit(editor, area_key, |list| {
            *list = kept;
            Some(format!("{label} ({skipped} skipped)"))
        })
    {
        let _ = editor.try_apply(edit);
    }
    Placement::Partly { skipped, reason }
}

fn select_appended(editor: &mut Editor, area_key: &str, start: usize, count: usize) {
    editor.selection = RowSelection::parts(
        "area",
        area_key,
        (start..start + count).map(super::module_part).collect(),
    );
}

pub fn change_modules(
    editor: &mut Editor,
    area_key: &str,
    change: impl FnOnce(&mut Vec<Value>) -> Option<String>,
) -> bool {
    module_edit(editor, area_key, change).is_some_and(|edit| editor.apply(edit))
}

pub fn area_modules(editor: &Editor, area_key: &str) -> Vec<Value> {
    editor
        .row_value("area", area_key)
        .and_then(|row| row["modules"].as_array().cloned())
        .unwrap_or_default()
}

pub fn module_edit(
    editor: &Editor,
    area_key: &str,
    change: impl FnOnce(&mut Vec<Value>) -> Option<String>,
) -> Option<ContentEdit> {
    let mut row = editor.row_value("area", area_key)?;
    let mut modules = area_modules(editor, area_key);
    let label = change(&mut modules)?;
    row["modules"] = Value::Array(modules);
    let mut edit = ContentEdit::new(label);
    edit.write_json(row_file("area", area_key), &row);
    Some(edit)
}
