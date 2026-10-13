use egui::{Pos2, RichText, Ui, Vec2};
use game::core::math::Pos;
use game::core::tiling::{CellPos, TilePos, Tiles};
use game::systems::area::AreaModuleKind;
use game::systems::script::Place;
use serde_json::Value;

use super::select::{copy_selection, delete_selection, duplicate_selection, start_paste};
use super::{AreaFrame, AreaTool, AreaViewState, DeferredAreaAction, blueprint, pins, shapes};
use super::{pick, placement};
use crate::app::Editor;
use crate::project::{ContentEdit, RowSelection, row_file};
use crate::ui::{theme, widgets};
use crate::value::RowValue;
use crate::{play, schema};

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
    view.drag = None;
    let selecting = view.tool == AreaTool::Select;
    if selecting && let Some(hit) = frame.hit(tile) {
        let part = format!("/modules/{hit}");
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
        frame.pointer.unwrap_or(frame.canvas.rect.center()),
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
        let at = frame.pointer.unwrap_or(frame.canvas.rect.center());
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
            .add(egui::Button::new(format!("▸ Play here as {character}")).shortcut_text("F6"))
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
            .add(egui::Button::new("Play from its own start").shortcut_text("F5"))
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
        if ui.button("Listen here (Alt-click)").clicked() {
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
            if ui.button("Copy (Ctrl C)").clicked() {
                action = Some(MenuAction::Copy);
                ui.close();
            }
            if ui.button("Duplicate (Ctrl D)").clicked() {
                action = Some(MenuAction::Duplicate);
                ui.close();
            }
            if ui.button("Make blueprint (Ctrl Alt B)").clicked() {
                action = Some(MenuAction::MakeBlueprint);
                ui.close();
            }
            if selected.len() == 1 {
                let index: Option<usize> = selected
                    .iter()
                    .next()
                    .and_then(|p| p.strip_prefix("/modules/")?.parse().ok());
                if let Some(index) = index {
                    let module = &frame.modules[index];
                    if module.is_module(AreaModuleKind::Blueprint) {
                        if ui.button("Edit blueprint in place (Enter)").clicked() {
                            action = Some(MenuAction::EditInPlace(index));
                            ui.close();
                        }
                        if ui.button("Unpack").clicked() {
                            action = Some(MenuAction::Defer(DeferredAreaAction::Unpack(index)));
                            ui.close();
                        }
                        if ui.button("Replace with…").clicked() {
                            action = Some(MenuAction::Defer(DeferredAreaAction::Replace(index)));
                            ui.close();
                        }
                    }
                    if module.is_module(AreaModuleKind::Scenery)
                        && ui.button("Split into tiles").clicked()
                    {
                        action = Some(MenuAction::Defer(DeferredAreaAction::Split(index)));
                        ui.close();
                    }
                    if module.is_module(AreaModuleKind::Object)
                        && ui.button("Return door…").clicked()
                    {
                        action = Some(MenuAction::Defer(DeferredAreaAction::ReturnDoor(index)));
                        ui.close();
                    }
                }
            }
            if ui.button("Delete (Del)").clicked() {
                action = Some(MenuAction::Delete);
                ui.close();
            }
        }
        if editor.clipboard.is_some() && ui.button("Paste here (Ctrl V)").clicked() {
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
        MenuAction::Copy => copy_selection(editor, frame),
        MenuAction::Duplicate => duplicate_selection(editor, frame),
        MenuAction::Delete => delete_selection(editor, frame),
        MenuAction::Paste => start_paste(editor, view_key),
        MenuAction::MakeBlueprint => blueprint::make_blueprint_from_selection(editor, frame),
        MenuAction::EditInPlace(index) => placement::edit_in_place(editor, view_key, frame, index),
        MenuAction::Defer(deferred) => super::run_deferred(editor, frame, deferred),
    }
}

pub(super) enum MenuAction {
    PlayHere,
    PlayFromStart,
    SetSpawn,
    Listen,
    Add(AreaModuleKind),
    Copy,
    Duplicate,
    Delete,
    Paste,
    MakeBlueprint,
    EditInPlace(usize),
    Defer(DeferredAreaAction),
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

pub fn append_modules(
    editor: &mut Editor,
    area_key: &str,
    modules: Vec<Value>,
    label: &str,
) -> bool {
    let Some(mut row) = editor.row_value("area", area_key) else {
        return false;
    };
    let mut list = row["modules"].as_array().cloned().unwrap_or_default();
    let start = list.len();
    let count = modules.len();
    list.extend(modules);
    row["modules"] = Value::Array(list);
    let mut edit = ContentEdit::new(label);
    edit.write_json(row_file("area", area_key), &row);
    if !editor.apply(edit) {
        return false;
    }
    editor.selection = RowSelection::parts(
        "area",
        area_key,
        (start..start + count)
            .map(|i| format!("/modules/{i}"))
            .collect(),
    );
    true
}

pub fn write_modules(
    editor: &mut Editor,
    area_key: &str,
    modules: Vec<Value>,
    label: &str,
) -> bool {
    let Some(mut row) = editor.row_value("area", area_key) else {
        return false;
    };
    row["modules"] = Value::Array(modules);
    let mut edit = ContentEdit::new(label);
    edit.write_json(row_file("area", area_key), &row);
    editor.apply(edit)
}
