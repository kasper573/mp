use egui::{Pos2, RichText, Ui, Vec2};
use engine::core::math::Pos;
use engine::core::tiling::{CellPos, TilePos, Tiles};
use engine::systems::area::AreaModuleKind;
use engine::systems::area::scene::scene_file;
use engine::systems::script::Place;
use serde_json::Value;

use super::select::start_paste;
use super::{AreaAction, AreaFrame, AreaTool, AreaViewState, nodes, pick, pins, placement, shapes};
use crate::app::Editor;
use crate::keymap::EditorKey;
use crate::project::ContentEdit;
use crate::tabs::file_title;
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
    view.take_drag();
    let selecting = view.tool == AreaTool::Select;
    if selecting
        && let Some(hit) = frame.hit(tile)
        && !super::selected_parts(editor, &frame.area_key).contains(&hit)
    {
        nodes::select(editor, &frame.area_key, vec![hit]);
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
                let node = selected.iter().next().cloned().unwrap_or_default();
                if let Some(module) = frame.module(&node) {
                    if module.is_module(AreaModuleKind::Blueprint) {
                        if ui
                            .add(widgets::shortcut_button(
                                "Edit blueprint in place",
                                EditorKey::Confirm,
                            ))
                            .clicked()
                        {
                            action = Some(MenuAction::EditInPlace(node.clone()));
                            ui.close();
                        }
                        if ui.button("Unpack").clicked() {
                            action = Some(MenuAction::Area(AreaAction::Unpack(node.clone())));
                            ui.close();
                        }
                        if ui.button("Replace with…").clicked() {
                            action = Some(MenuAction::Area(AreaAction::Replace(node.clone())));
                            ui.close();
                        }
                    }
                    if module.is_module(AreaModuleKind::Scenery)
                        && ui.button("Split into tiles").clicked()
                    {
                        action = Some(MenuAction::Area(AreaAction::Split(node.clone())));
                        ui.close();
                    }
                    if module.is_module(AreaModuleKind::Object)
                        && ui.button("Return door…").clicked()
                    {
                        action = Some(MenuAction::Area(AreaAction::ReturnDoor(node.clone())));
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
        MenuAction::EditInPlace(node) => placement::edit_in_place(editor, view_key, frame, &node),
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
    EditInPlace(String),
    Area(AreaAction),
}

pub fn variant_template(editor: &Editor, kind: &str) -> Option<Value> {
    module_variants(editor)
        .into_iter()
        .find_map(|(tag, template)| (tag == kind).then_some(template))
}

pub fn module_variants(editor: &Editor) -> Vec<(String, Value)> {
    let root = &editor.shapes.scene_module;
    editor
        .shapes
        .scene_variants()
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
        &[(AreaModuleKind::Script, "names a script row")],
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
        AreaModuleKind::Script => Some("script"),
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
    nodes::add(
        editor,
        &frame.area_key,
        vec![module],
        &format!("Add {label} to {}", file_title(&frame.area_key)),
    );
}

pub enum PlaceOutcome {
    Whole,
    Partly { skipped: usize, reason: String },
}

/// Places `new` in the insertion folder of `bundle` as one step: all of them, or as many as the
/// folder's game takes, in order, when some are refused. Selects what it placed.
pub fn place_modules(
    editor: &mut Editor,
    bundle: &str,
    mut new: Vec<Value>,
    label: &str,
) -> PlaceOutcome {
    let count = new.len();
    let folder = nodes::insertion_folder(editor, bundle);
    let scene = nodes::scene_of(editor, bundle);
    nodes::label_placements(&scene, &folder, &mut new);
    let with = |modules: &[Value], label: String| {
        let mut scene = scene.clone();
        let added = nodes::append(&mut scene, &folder, modules.to_vec());
        let mut edit = ContentEdit::new(label);
        edit.write_json(scene_file(bundle), &scene);
        (edit, added)
    };
    let check = |editor: &Editor, edit: &ContentEdit| {
        editor
            .project
            .as_ref()
            .map(|project| project.check(edit).map_err(|refusal| refusal.sentence()))
    };
    let (edit, added) = with(&new, label.to_owned());
    let mut reason = match check(editor, &edit) {
        Some(Ok(())) => {
            return match editor.try_apply(edit) {
                Ok(()) => {
                    nodes::select(editor, bundle, added);
                    PlaceOutcome::Whole
                }
                Err(reason) => PlaceOutcome::Partly {
                    skipped: count,
                    reason,
                },
            };
        }
        Some(Err(reason)) => reason,
        None => {
            return PlaceOutcome::Partly {
                skipped: count,
                reason: "no folder is open".to_owned(),
            };
        }
    };
    let mut kept: Vec<Value> = Vec::new();
    let mut skipped = 0;
    for module in new {
        let mut candidate = kept.clone();
        candidate.push(module);
        match check(editor, &with(&candidate, String::new()).0) {
            Some(Ok(())) => kept = candidate,
            Some(Err(refused)) => {
                skipped += 1;
                if kept.is_empty() {
                    reason = refused;
                }
            }
            None => break,
        }
    }
    if !kept.is_empty() {
        let (edit, added) = with(&kept, format!("{label} ({skipped} skipped)"));
        if editor.try_apply(edit).is_ok() {
            nodes::select(editor, bundle, added);
        }
    }
    PlaceOutcome::Partly { skipped, reason }
}
