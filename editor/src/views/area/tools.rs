use std::collections::HashSet;

use egui::{Color32, Pos2, Rect as ERect, RichText, Stroke as EStroke, Ui, Vec2};
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::{Cell, CellPos, TilePos, TileSize, Tiles};
use game::systems::area::{self, Flip};
use serde_json::Value;

use super::{
    Canvas, Corner, Drag, Frame, MAX_ZOOM, MIN_ZOOM, PasteGhost, Tool, blueprint, grid, pins,
    shapes,
};
use crate::app::{Editor, PickWhat};
use crate::project::{Edit, Selection, row_file};

/// The tiles the paint tool lays down: one block of a tileset, or several picked at random.
#[derive(Clone, Default, Debug)]
pub struct TilePick {
    pub tileset: Option<String>,
    pub block: Vec<Vec<u32>>,
    pub random: Vec<u32>,
    pub anchor: Option<(u32, u32)>,
}

impl TilePick {
    pub fn is_empty(&self) -> bool {
        self.block.is_empty() && self.random.is_empty()
    }

    pub fn block_size(&self) -> (usize, usize) {
        (self.block.first().map_or(0, Vec::len), self.block.len())
    }
}

#[derive(Clone, Default, Debug)]
pub struct TerrainPick {
    pub tileset: Option<String>,
    pub set: Option<String>,
    pub terrain: usize,
}

/// One gesture of a grid tool, written as one step when the button comes up.
pub struct Stroke {
    pub draft: grid::GridDraft,
    pub kind: StrokeKind,
    pub cells: HashSet<CellPos>,
    pub seed: u64,
    pub anchor: CellPos,
    pub rng: game::core::math::Rng,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StrokeKind {
    Paint,
    Erase,
    Walk,
    Terrain,
}

pub struct ResizeDialog {
    pub area: String,
    pub width: u32,
    pub height: u32,
    pub anchor: (i8, i8),
    pub error: Option<String>,
}

pub fn rail(editor: &mut Editor, ui: &mut Ui, view_key: &str) {
    let view = editor.views.area.views.get_mut(view_key).expect("the view");
    let mut switched = None;
    ui.add_space(6.0);
    for tool in Tool::ALL {
        let selected = view.tool == tool;
        let (rect, response) = ui.allocate_exact_size(Vec2::new(32.0, 34.0), egui::Sense::click());
        let painter = ui.painter();
        if selected {
            painter.rect_filled(rect, 5.0, crate::ui::theme::ACCENT);
        } else if response.hovered() {
            painter.rect_filled(rect, 5.0, crate::ui::theme::RAISED);
        }
        let ink = if selected {
            Color32::WHITE
        } else {
            crate::ui::theme::TEXT
        };
        tool_icon(painter, tool, rect.center() - Vec2::new(0.0, 3.0), ink);
        painter.text(
            rect.right_bottom() - Vec2::new(4.0, 2.0),
            egui::Align2::RIGHT_BOTTOM,
            key_letter(tool),
            egui::FontId::monospace(9.0),
            if selected {
                Color32::WHITE
            } else {
                crate::ui::theme::MUTED
            },
        );
        if response
            .on_hover_text(format!("{} ({})", tool.label(), key_letter(tool)))
            .clicked()
        {
            view.tool = tool;
            view.drag = None;
            switched = Some(tool);
        }
        ui.add_space(2.0);
    }
    if let Some(bottom) = switched.and_then(Tool::bottom_tab) {
        editor.panels.bottom = bottom;
    }
}

fn key_letter(tool: Tool) -> &'static str {
    match tool {
        Tool::Select => "V",
        Tool::Paint => "B",
        Tool::Terrain => "T",
        Tool::Fill => "G",
        Tool::Erase => "E",
        Tool::Eyedropper => "I",
        Tool::Stamp => "S",
        Tool::Module => "M",
    }
}

/// The rail's pictograms, drawn as strokes so they match at any scale.
fn tool_icon(painter: &egui::Painter, tool: Tool, c: Pos2, ink: Color32) {
    let stroke = EStroke::new(1.6, ink);
    let p = |x: f32, y: f32| Pos2::new(c.x + x, c.y + y);
    match tool {
        Tool::Select => {
            painter.add(egui::Shape::convex_polygon(
                vec![
                    p(-5.0, -7.0),
                    p(5.0, 2.0),
                    p(1.0, 2.5),
                    p(3.5, 7.0),
                    p(1.5, 8.0),
                    p(-1.0, 3.5),
                    p(-5.0, 6.0),
                ],
                ink,
                EStroke::NONE,
            ));
        }
        Tool::Paint => {
            painter.line_segment([p(-6.0, 6.0), p(3.0, -3.0)], EStroke::new(2.2, ink));
            painter.line_segment([p(3.0, -3.0), p(6.0, -6.0)], EStroke::new(3.5, ink));
            painter.circle_filled(p(-6.0, 6.0), 2.0, ink);
        }
        Tool::Terrain => {
            painter.rect_stroke(
                ERect::from_min_max(p(-6.0, -6.0), p(3.0, 3.0)),
                1.0,
                stroke,
                egui::StrokeKind::Middle,
            );
            painter.rect_filled(ERect::from_min_max(p(-2.0, -2.0), p(7.0, 7.0)), 1.0, ink);
        }
        Tool::Fill => {
            painter.add(egui::Shape::closed_line(
                vec![p(-6.0, -1.0), p(0.0, -7.0), p(6.0, -1.0), p(0.0, 5.0)],
                stroke,
            ));
            painter.circle_filled(p(5.5, 5.0), 2.2, ink);
        }
        Tool::Erase => {
            painter.line_segment([p(-5.0, -5.0), p(5.0, 5.0)], EStroke::new(2.0, ink));
            painter.line_segment([p(-5.0, 5.0), p(5.0, -5.0)], EStroke::new(2.0, ink));
        }
        Tool::Eyedropper => {
            painter.line_segment([p(-6.0, 6.0), p(2.0, -2.0)], EStroke::new(2.0, ink));
            painter.circle_filled(p(4.0, -4.0), 3.0, ink);
        }
        Tool::Stamp => {
            painter.rect_filled(ERect::from_min_max(p(-7.0, 3.0), p(7.0, 7.0)), 1.0, ink);
            painter.rect_filled(ERect::from_min_max(p(-2.0, -3.0), p(2.0, 3.0)), 0.0, ink);
            painter.circle_filled(p(0.0, -5.0), 3.0, ink);
        }
        Tool::Module => {
            painter.line_segment([p(-6.0, 0.0), p(6.0, 0.0)], EStroke::new(2.2, ink));
            painter.line_segment([p(0.0, -6.0), p(0.0, 6.0)], EStroke::new(2.2, ink));
        }
    }
}

/// Renames a ground layer: the row's list and the CSV file move together.
pub fn rename_layer(
    editor: &mut Editor,
    area_key: &str,
    from: &str,
    to: &str,
) -> Result<(), String> {
    let Some(mut row) = editor.row_value("area", area_key) else {
        return Err("the area is gone".to_owned());
    };
    let layers = row["map"]["ground"].as_array_mut().ok_or("no layers")?;
    if layers
        .iter()
        .any(|l| l.as_str().is_some_and(|l| l.eq_ignore_ascii_case(to)))
    {
        return Err(format!("{to} is already a layer"));
    }
    if to == "palette" || to == "walk" || !game::core::content::load::valid_key(to) {
        return Err("a layer name is a key that isn't palette or walk".to_owned());
    }
    for layer in layers.iter_mut() {
        if layer.as_str() == Some(from) {
            *layer = Value::String(to.to_owned());
        }
    }
    let project = editor.project.as_ref().ok_or("no folder")?;
    let old = format!("tables/area/{area_key}/{from}.csv");
    let bytes = project
        .files
        .get(&old)
        .cloned()
        .ok_or("the layer file is gone")?;
    let mut edit = Edit::new(format!("Rename layer {from} of {area_key} to {to}"));
    edit.write_json(row_file("area", area_key), &row);
    edit.write(format!("tables/area/{area_key}/{to}.csv"), bytes);
    edit.remove(old);
    if editor.apply(edit) {
        Ok(())
    } else {
        Err("refused".to_owned())
    }
}

/// Pointer input on the canvas: pan and zoom for every tool, then the tool's own gesture.
pub fn input(
    editor: &mut Editor,
    ui: &mut Ui,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
) {
    let response = frame.response;
    let modifiers = ui.input(|i| i.modifiers);
    let space = ui.input(|i| i.key_down(egui::Key::Space));
    let scroll = ui.input(|i| i.smooth_scroll_delta);
    let zoom_delta = ui.input(|i| i.zoom_delta());
    {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if response.hovered() && (scroll.y != 0.0 || zoom_delta != 1.0) {
            let factor = if zoom_delta != 1.0 {
                zoom_delta
            } else {
                (scroll.y / 240.0).exp2()
            };
            let before = frame.pointer_tile;
            view.zoom = (view.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
            if let (Some(before), Some(p)) = (before, frame.pointer) {
                let canvas = Canvas {
                    rect: frame.canvas.rect,
                    center: view.center,
                    zoom: view.zoom,
                };
                let after = canvas.to_tile(p);
                view.center = Pos::new(
                    view.center.x + before.x - after.x,
                    view.center.y + before.y - after.y,
                );
            }
        }
        let panning = response.dragged_by(egui::PointerButton::Middle)
            || (space && response.dragged_by(egui::PointerButton::Primary));
        if panning {
            let delta = response.drag_delta();
            view.center = Pos::new(
                view.center.x - delta.x / view.zoom / super::TILE_PX,
                view.center.y - delta.y / view.zoom / super::TILE_PX,
            );
            return;
        }
    }
    if let Some(pick) = editor.pick.clone() {
        pick_place(editor, painter, view_key, frame, &pick, modifiers.alt);
        return;
    }
    if let Some(payload) = response.dnd_release_payload::<crate::ui::browser::RowDrag>() {
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .drag_hover = None;
        if let Some(tile) = frame.pointer_tile {
            blueprint::drop_row(editor, view_key, frame, &payload.table, &payload.key, tile);
        }
        return;
    }
    {
        let hover = response
            .dnd_hover_payload::<crate::ui::browser::RowDrag>()
            .and_then(|payload| {
                let pointer = ui.input(|i| i.pointer.hover_pos())?;
                Some((
                    payload.table.clone(),
                    payload.key.clone(),
                    frame.canvas.to_tile(pointer),
                ))
            });
        if hover.is_some() {
            ui.ctx().request_repaint();
        }
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if view.drag_hover != hover {
            view.drag_hover = hover;
        }
    }
    if editor.views.area.views[view_key].drop_menu.is_some() {
        return;
    }
    let tool = editor.views.area.views[view_key].tool;
    let walk_overlay = editor.views.area.views[view_key].walk_overlay;
    if response.secondary_clicked() {
        context_menu_at(editor, view_key, frame);
    }
    let in_place = editor.views.area.views[view_key].in_place.last().cloned();
    match tool {
        Tool::Select if in_place.is_some() => blueprint::select_input_in_place(
            editor,
            view_key,
            frame,
            in_place.as_ref().expect("in place"),
            modifiers,
        ),
        Tool::Select => select_input(editor, ui, view_key, frame, modifiers),
        Tool::Paint if walk_overlay => grid_stroke(editor, view_key, frame, StrokeKind::Walk),
        Tool::Paint => grid_stroke(editor, view_key, frame, StrokeKind::Paint),
        Tool::Erase => grid_stroke(editor, view_key, frame, StrokeKind::Erase),
        Tool::Terrain => grid_stroke(editor, view_key, frame, StrokeKind::Terrain),
        Tool::Fill => {
            if response.clicked()
                && let Some(cell) = frame.pointer_cell()
            {
                fill(editor, view_key, frame, cell);
            }
        }
        Tool::Eyedropper => {
            if response.clicked()
                && let Some(cell) = frame.pointer_cell()
            {
                eyedrop(editor, view_key, frame, cell, modifiers.alt);
            }
        }
        Tool::Stamp => blueprint::stamp_input(editor, ui, view_key, frame),
        Tool::Module => {
            if response.clicked()
                && let Some(tile) = frame.pointer_tile
            {
                editor
                    .views
                    .area
                    .views
                    .get_mut(view_key)
                    .expect("view")
                    .cursor_cell = Some(tile.cell());
                open_add_menu(ui, editor, view_key, frame, tile);
            }
        }
    }
    show_add_menu(ui, editor, view_key, frame);
}

fn context_menu_at(editor: &mut Editor, view_key: &str, frame: &Frame) {
    let Some(tile) = frame.pointer_tile else {
        return;
    };
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    view.cursor_cell = Some(tile.cell());
    view.drag = None;
    if view.tool == Tool::Select
        && let Some(hit) = frame.hit(tile)
    {
        let part = format!("/modules/{hit}");
        if !super::selected_parts(editor, &frame.area_key).contains(&part) {
            editor.selection = Selection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts: vec![part],
            };
        }
    }
    let id = egui::Id::new((view_key, "context"));
    egui::Popup::open_id(&frame.response.ctx, id);
    MENU_AT.with(|cell| {
        cell.set(Some((
            id,
            frame.pointer.unwrap_or(frame.canvas.rect.center()),
            tile,
        )))
    });
}

thread_local! {
    static MENU_AT: std::cell::Cell<Option<(egui::Id, Pos2, Pos<Tiles>)>> = const { std::cell::Cell::new(None) };
}

fn open_add_menu(
    ui: &mut Ui,
    _editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    tile: Pos<Tiles>,
) {
    let id = egui::Id::new((view_key, "context"));
    egui::Popup::open_id(ui.ctx(), id);
    MENU_AT.with(|cell| {
        cell.set(Some((
            id,
            frame.pointer.unwrap_or(frame.canvas.rect.center()),
            tile,
        )))
    });
}

/// One module kind in a menu: its badge, its tag in mono and a line of what it is.
pub fn module_menu_row(ui: &mut Ui, kind: &str, description: &str) -> bool {
    use crate::ui::{theme, widgets};
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

/// The canvas menu: add a module here, play here, set the spawn, and the selection's commands.
fn show_add_menu(ui: &mut Ui, editor: &mut Editor, view_key: &str, frame: &Frame) {
    let id = egui::Id::new((view_key, "context"));
    if !egui::Popup::is_id_open(ui.ctx(), id) {
        return;
    }
    let Some((_, at, tile)) = MENU_AT.with(|cell| cell.get()) else {
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
            crate::play::current_character(editor).unwrap_or_else(|| "a test character".to_owned());
        if ui
            .add(egui::Button::new(format!("▸ Play here as {character}")).shortcut_text("F6"))
            .clicked()
        {
            action = Some(MenuAction::PlayHere);
            ui.close();
        }
        ui.menu_button("Play here as…", |ui| {
            for other in crate::play::test_characters(editor) {
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
                .family(egui::FontFamily::Name("medium".into())),
        );
        for (group, kinds) in [
            (
                "Shapes",
                vec![
                    ("object", "a point or rect with scripts"),
                    ("safe_zone", "a rect where no one fights"),
                    ("soundscape", "a sound zone"),
                ],
            ),
            (
                "People",
                vec![
                    ("population", "npcs that roam a rect"),
                    ("resident", "one npc at one spot"),
                ],
            ),
            (
                "Copies",
                vec![
                    ("blueprint", "a blueprint, placed"),
                    ("scenery", "tiles drawn as one"),
                ],
            ),
            (
                "Area-wide",
                vec![
                    ("inline_script", "its nodes in this area"),
                    ("shared_script", "names a script row"),
                ],
            ),
        ] {
            ui.add_space(2.0);
            ui.label(
                RichText::new(group)
                    .size(11.0)
                    .color(crate::ui::theme::FAINT),
            );
            for (kind, description) in kinds {
                if !variants.iter().any(|(tag, _)| tag == kind) {
                    continue;
                }
                if module_menu_row(ui, kind, description) {
                    action = Some(MenuAction::Add(kind.to_owned()));
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
                    if module["type"] == "blueprint" {
                        if ui.button("Edit blueprint in place (Enter)").clicked() {
                            action = Some(MenuAction::EditInPlace(index));
                            ui.close();
                        }
                        if ui.button("Unpack").clicked() {
                            action = Some(MenuAction::Unpack(index));
                            ui.close();
                        }
                        if ui.button("Replace with…").clicked() {
                            action = Some(MenuAction::Replace(index));
                            ui.close();
                        }
                    }
                    if module["type"] == "scenery" && ui.button("Split into tiles").clicked() {
                        action = Some(MenuAction::Split(index));
                        ui.close();
                    }
                    if module["type"] == "object" && ui.button("Return door…").clicked() {
                        action = Some(MenuAction::ReturnDoor(index));
                        ui.close();
                    }
                }
            }
            if ui.button("Delete (Del)").clicked() {
                action = Some(MenuAction::Delete);
                ui.close();
            }
        }
        if editor
            .clipboard
            .as_ref()
            .is_some_and(|c| c["rift"] == "modules")
            && ui.button("Paste here (Ctrl V)").clicked()
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
            let place = game::systems::script::Place {
                area: frame.area_id,
                at: tile.snap(),
            };
            crate::play::start(editor, Some(place));
        }
        MenuAction::PlayFromStart => crate::play::start(editor, None),
        MenuAction::SetSpawn => pins::set_spawn(editor, frame, tile.snap()),
        MenuAction::Listen => {
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .listener = Some(tile);
            blueprint::listen(editor, frame, tile);
        }
        MenuAction::Add(kind) => add_module(editor, view_key, frame, &kind, tile),
        MenuAction::Copy => copy_selection(editor, frame),
        MenuAction::Duplicate => duplicate_selection(editor, frame),
        MenuAction::Delete => delete_selection(editor, frame),
        MenuAction::Paste => start_paste(editor, view_key),
        MenuAction::MakeBlueprint => blueprint::make_blueprint_from_selection(editor, frame),
        MenuAction::EditInPlace(index) => blueprint::edit_in_place(editor, view_key, frame, index),
        MenuAction::Unpack(index) => blueprint::unpack(editor, frame, index),
        MenuAction::Replace(index) => blueprint::replace_dialog(editor, frame, index),
        MenuAction::Split(index) => blueprint::split_scenery(editor, frame, index),
        MenuAction::ReturnDoor(index) => blueprint::return_door(editor, frame, index),
    }
}

enum MenuAction {
    PlayHere,
    PlayFromStart,
    SetSpawn,
    Listen,
    Add(String),
    Copy,
    Duplicate,
    Delete,
    Paste,
    MakeBlueprint,
    EditInPlace(usize),
    Unpack(usize),
    Replace(usize),
    Split(usize),
    ReturnDoor(usize),
}

pub fn module_variants(editor: &Editor) -> Vec<(String, Value)> {
    let Some(items) = editor.shapes.modules_of("area") else {
        return Vec::new();
    };
    let root = editor
        .shapes
        .table("area")
        .map(|t| &t.shape)
        .expect("area shape");
    match crate::schema::kind(root, items) {
        crate::schema::Kind::Union(variants) => variants
            .iter()
            .map(|variant| {
                (
                    variant.tag.clone(),
                    crate::schema::variant_template(root, variant),
                )
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Adds one module of `kind` at the tile: points land there, rects start 2 × 2, scripts have no place.
pub fn add_module(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    kind: &str,
    tile: Pos<Tiles>,
) {
    let Some((_, mut module)) = module_variants(editor)
        .into_iter()
        .find(|(tag, _)| tag == kind)
    else {
        return;
    };
    let cell = tile.cell();
    let (x, y) = (cell.x as f32, cell.y as f32);
    match kind {
        "object" => {
            module["shape"] = serde_json::json!({ "type": "point", "x": x, "y": y });
        }
        "safe_zone" => {
            module["rect"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
        }
        "soundscape" => {
            module["shape"] = serde_json::json!({ "type": "rect", "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
            module["emit"] = serde_json::json!(4.0);
            module["channels"] = serde_json::json!([]);
        }
        "population" => {
            module["roams"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5, "w": 2.0, "h": 2.0 });
            module["count"] = serde_json::json!(1);
        }
        "resident" => {
            module["at"] = serde_json::json!({ "x": x, "y": y });
        }
        "scenery" => {
            module["at"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5 });
        }
        "blueprint" => {
            module["at"] = serde_json::json!({ "x": x, "y": y });
            let stamp = editor.views.area.views[view_key].stamp.clone();
            if let Some(stamp) = stamp {
                module["blueprint"] = Value::String(stamp);
            }
        }
        "inline_script" => {
            module["nodes"] = serde_json::json!({});
        }
        _ => {}
    }
    if matches!(
        kind,
        "population" | "resident" | "blueprint" | "shared_script" | "scenery"
    ) {
        let table = match kind {
            "population" | "resident" => "npc",
            "blueprint" => "blueprint",
            "shared_script" => "script",
            _ => "tileset",
        };
        let field = match kind {
            "population" | "resident" => "npc",
            "blueprint" => "blueprint",
            "shared_script" => "script",
            _ => "tileset",
        };
        if module[field].as_str().unwrap_or_default().is_empty() {
            blueprint::pick_then_add(editor, view_key, frame, module, table, field);
            return;
        }
    }
    let label = shapes::label(&module);
    append_modules(
        editor,
        frame,
        vec![module],
        &format!("Add {label} to {}", frame.area_key),
    );
}

/// Appends modules to the area as one step and selects them.
pub fn append_modules(
    editor: &mut Editor,
    frame: &Frame,
    modules: Vec<Value>,
    label: &str,
) -> bool {
    let Some(mut row) = editor.row_value("area", &frame.area_key) else {
        return false;
    };
    let start = row["modules"].as_array().map_or(0, Vec::len);
    let count = modules.len();
    if !row["modules"].is_array() {
        row["modules"] = Value::Array(Vec::new());
    }
    row["modules"]
        .as_array_mut()
        .expect("modules")
        .extend(modules);
    let mut edit = Edit::new(label);
    edit.write_json(row_file("area", &frame.area_key), &row);
    if editor.apply(edit) {
        editor.selection = Selection {
            table: "area".to_owned(),
            keys: vec![frame.area_key.clone()],
            parts: (start..start + count)
                .map(|i| format!("/modules/{i}"))
                .collect(),
        };
        true
    } else {
        false
    }
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
    let mut edit = Edit::new(label);
    edit.write_json(row_file("area", area_key), &row);
    editor.apply(edit)
}

fn selected_indices(editor: &Editor, area_key: &str) -> Vec<usize> {
    let mut indices: Vec<usize> = super::selected_parts(editor, area_key)
        .iter()
        .filter_map(|part| part.strip_prefix("/modules/")?.parse().ok())
        .collect();
    indices.sort_unstable();
    indices
}

fn select_input(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    frame: &Frame,
    modifiers: egui::Modifiers,
) {
    let response = frame.response;
    let Some(tile) = frame.pointer_tile else {
        if response.drag_stopped() {
            finish_select_drag(editor, view_key, frame, modifiers);
        }
        return;
    };
    if modifiers.alt && response.clicked() {
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .listener = Some(tile);
        blueprint::listen(editor, frame, tile);
        return;
    }
    if let Some(ghost) = editor.views.area.views[view_key].paste.clone() {
        if response.clicked() || ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            finish_paste(editor, view_key, frame, ghost, tile);
        }
        return;
    }
    let selected = selected_indices(editor, &frame.area_key);
    let editing = editor.views.area.views[view_key]
        .in_place
        .last()
        .map(|p| p.module);
    if response.drag_started_by(egui::PointerButton::Primary) {
        let on_handle = selected
            .iter()
            .find_map(|&index| handle_at(frame, index, frame.pointer?));
        let hit = frame
            .hit(tile)
            .filter(|hit| editing.is_none_or(|e| e == *hit));
        let pin = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default());
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some((index, corner, start)) = on_handle {
            view.drag = Some(Drag::Resize {
                part: format!("/modules/{index}"),
                corner,
                start,
            });
        } else if let Some(pin) = pin {
            view.drag = Some(match pin {
                pins::PinHit::Spawn => Drag::Spawn,
                pins::PinHit::Place { file, pointer } => Drag::Pin { file, pointer },
            });
        } else if let Some(hit) = hit {
            if !selected.contains(&hit) {
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![frame.area_key.clone()],
                    parts: vec![format!("/modules/{hit}")],
                };
            }
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .drag = Some(Drag::Move {
                from: tile,
                moved: false,
            });
        } else {
            view.drag = Some(Drag::Box { from: tile });
        }
        return;
    }
    if response.dragged_by(egui::PointerButton::Primary) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if let Some(Drag::Move { from, moved }) = &mut view.drag
            && (tile.x - from.x).abs() + (tile.y - from.y).abs() > 0.25
        {
            *moved = true;
        }
        return;
    }
    if response.drag_stopped() {
        finish_select_drag(editor, view_key, frame, modifiers);
        return;
    }
    if response.double_clicked()
        && let Some(hit) = frame.hit(tile)
    {
        if frame.modules[hit]["type"] == "blueprint" {
            blueprint::edit_in_place(editor, view_key, frame, hit);
        } else {
            editor.panels.right = crate::app::RightTab::Inspector;
        }
        return;
    }
    if response.clicked() {
        if let Some(pin) = pins::pin_at(editor, frame, frame.pointer.unwrap_or_default()) {
            pins::open_pin(editor, pin);
            return;
        }
        let hit = frame
            .hit(tile)
            .filter(|hit| editing.is_none_or(|e| e == *hit));
        match hit {
            Some(index) => {
                let part = format!("/modules/{index}");
                let mut parts: Vec<String> = if modifiers.shift || modifiers.ctrl {
                    editor.selection.parts.clone()
                } else {
                    Vec::new()
                };
                if editor.selection.table != "area"
                    || editor.selection.keys != vec![frame.area_key.clone()]
                {
                    parts.clear();
                }
                if modifiers.ctrl && parts.contains(&part) {
                    parts.retain(|p| *p != part);
                } else if !parts.contains(&part) {
                    parts.push(part);
                }
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![frame.area_key.clone()],
                    parts,
                };
            }
            None => {
                if !modifiers.shift && !modifiers.ctrl {
                    editor.selection = Selection {
                        table: "area".to_owned(),
                        keys: vec![frame.area_key.clone()],
                        parts: Vec::new(),
                    };
                }
            }
        }
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .cursor_cell = Some(tile.cell());
    }
}

fn handle_at(frame: &Frame, index: usize, pointer: Pos2) -> Option<(usize, Corner, Rect<Tiles>)> {
    let module = frame.modules.get(index)?;
    if !shapes::has_size(module) {
        return None;
    }
    let bounds = frame.module_bounds(index)?;
    let rect = frame.canvas.rect(bounds);
    let corners = [
        (Corner::TopLeft, rect.min),
        (Corner::TopRight, Pos2::new(rect.max.x, rect.min.y)),
        (Corner::BottomLeft, Pos2::new(rect.min.x, rect.max.y)),
        (Corner::BottomRight, rect.max),
    ];
    corners
        .into_iter()
        .find(|(_, at)| (*at - pointer).length() <= 7.0)
        .map(|(corner, _)| (index, corner, bounds))
}

fn finish_select_drag(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    modifiers: egui::Modifiers,
) {
    let Some(drag) = editor
        .views
        .area
        .views
        .get_mut(view_key)
        .expect("view")
        .drag
        .take()
    else {
        return;
    };
    let Some(tile) = frame.pointer_tile.or_else(|| {
        frame
            .response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p))
    }) else {
        return;
    };
    match drag {
        Drag::Box { from } => {
            let rect = Rect::from_points([from, tile]);
            let editing = editor.views.area.views[view_key]
                .in_place
                .last()
                .map(|p| p.module);
            let mut parts: Vec<String> = if modifiers.shift {
                editor.selection.parts.clone()
            } else {
                Vec::new()
            };
            for index in 0..frame.modules.len() {
                if editing.is_some_and(|e| e != index) {
                    continue;
                }
                if frame.modules[index]["type"] == "population"
                    && frame.modules[index]["roams"].is_null()
                {
                    continue;
                }
                if let Some(bounds) = frame.module_bounds(index)
                    && rect.contains_rect(&bounds)
                {
                    let part = format!("/modules/{index}");
                    if !parts.contains(&part) {
                        parts.push(part);
                    }
                }
            }
            editor.selection = Selection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts,
            };
        }
        Drag::Move { from, moved } => {
            if !moved {
                return;
            }
            let (dx, dy) = snapped_delta(from, tile, modifiers.alt);
            if dx == 0.0 && dy == 0.0 {
                return;
            }
            move_selection(editor, view_key, frame, dx, dy);
        }
        Drag::Resize {
            part,
            corner,
            start,
        } => {
            let Some(index) = part
                .strip_prefix("/modules/")
                .and_then(|i| i.parse::<usize>().ok())
            else {
                return;
            };
            let snap = |v: f32| {
                if modifiers.alt {
                    (v * 16.0).round() / 16.0
                } else {
                    v.round()
                }
            };
            let (min, max) = (start.min(), start.max());
            let (new_min, new_max) = match corner {
                Corner::TopLeft => (
                    Pos::new(snap(tile.x + 0.5) - 0.5, snap(tile.y + 0.5) - 0.5),
                    max,
                ),
                Corner::TopRight => (
                    Pos::new(min.x, snap(tile.y + 0.5) - 0.5),
                    Pos::new(snap(tile.x + 0.5) - 0.5, max.y),
                ),
                Corner::BottomLeft => (
                    Pos::new(snap(tile.x + 0.5) - 0.5, min.y),
                    Pos::new(max.x, snap(tile.y + 0.5) - 0.5),
                ),
                Corner::BottomRight => (
                    min,
                    Pos::new(snap(tile.x + 0.5) - 0.5, snap(tile.y + 0.5) - 0.5),
                ),
            };
            let w = (new_max.x - new_min.x).max(1.0);
            let h = (new_max.y - new_min.y).max(1.0);
            let mut modules = frame.modules.clone();
            let module = &mut modules[index];
            shapes::shift(module, new_min.x - min.x, new_min.y - min.y);
            shapes::resize(module, w, h);
            let label = format!("Resize {} in {}", shapes::label(module), frame.area_key);
            write_modules(editor, &frame.area_key, modules, &label);
        }
        Drag::Pin { file, pointer } => {
            let at = if modifiers.alt {
                snap_sixteenth(tile)
            } else {
                tile.snap()
            };
            pins::move_pin(editor, frame, &file, &pointer, at);
        }
        Drag::Spawn => {
            let at = if modifiers.alt {
                snap_sixteenth(tile)
            } else {
                tile.snap()
            };
            pins::set_spawn(editor, frame, at);
        }
        _ => {}
    }
}

pub fn snap_sixteenth(p: Pos<Tiles>) -> Pos<Tiles> {
    Pos::new((p.x * 16.0).round() / 16.0, (p.y * 16.0).round() / 16.0)
}

/// Whole tiles, keeping each module's fraction; Alt moves by sixteenths.
fn snapped_delta(from: Pos<Tiles>, to: Pos<Tiles>, fine: bool) -> (f32, f32) {
    let (dx, dy) = (to.x - from.x, to.y - from.y);
    if fine {
        ((dx * 16.0).round() / 16.0, (dy * 16.0).round() / 16.0)
    } else {
        (dx.round(), dy.round())
    }
}

pub fn move_selection(editor: &mut Editor, view_key: &str, frame: &Frame, dx: f32, dy: f32) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    if let Some(place) = editor.views.area.views[view_key].in_place.last().cloned() {
        blueprint::move_parts_in_place(editor, frame, &place, &indices, dx, dy);
        return;
    }
    let mut modules = frame.modules.clone();
    for &index in &indices {
        shapes::shift(&mut modules[index], dx, dy);
    }
    let label = if indices.len() == 1 {
        format!(
            "Move {} in {}",
            shapes::label(&modules[indices[0]]),
            frame.area_key
        )
    } else {
        format!("Move {} modules in {}", indices.len(), frame.area_key)
    };
    write_modules(editor, &frame.area_key, modules, &label);
}

pub fn copy_selection(editor: &mut Editor, frame: &Frame) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let origin = indices
        .iter()
        .filter_map(|&i| frame.module_bounds(i))
        .reduce(shapes::rect_union)
        .map(|r| r.min())
        .unwrap_or(Pos::new(0.0, 0.0));
    let modules: Vec<Value> = indices
        .iter()
        .map(|&i| {
            let mut module = frame.modules[i].clone();
            shapes::shift(&mut module, -origin.x, -origin.y);
            module
        })
        .collect();
    editor.clipboard = Some(
        serde_json::json!({ "rift": "modules", "table": "area", "from": frame.area_key, "modules": modules, "origin": { "x": origin.x, "y": origin.y } }),
    );
    editor.toast(format!("Copied {} modules", indices.len()));
}

pub fn start_paste(editor: &mut Editor, view_key: &str) {
    let Some(clip) = editor.clipboard.clone() else {
        editor.toast("Nothing copied");
        return;
    };
    if clip["rift"] != "modules" {
        editor.toast("The clipboard holds no modules");
        return;
    }
    let modules: Vec<Value> = clip["modules"].as_array().cloned().unwrap_or_default();
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    view.tool = Tool::Select;
    view.paste = Some(PasteGhost { modules, at: None });
}

/// Pastes the copied modules at their own tiles (Ctrl Shift V).
pub fn paste_in_place(editor: &mut Editor, frame: &Frame) {
    let Some(clip) = editor.clipboard.clone() else {
        return;
    };
    if clip["rift"] != "modules" {
        return;
    }
    let origin = shapes::pos_of(&clip["origin"]).unwrap_or(Pos::new(0.0, 0.0));
    let modules: Vec<Value> = clip["modules"].as_array().cloned().unwrap_or_default();
    paste_at(editor, frame, modules, origin);
}

fn finish_paste(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    ghost: PasteGhost,
    tile: Pos<Tiles>,
) {
    editor
        .views
        .area
        .views
        .get_mut(view_key)
        .expect("view")
        .paste = None;
    let at = Pos::new(tile.x.round() - 0.5, tile.y.round() - 0.5);
    paste_at(editor, frame, ghost.modules, at);
}

fn paste_at(editor: &mut Editor, frame: &Frame, modules: Vec<Value>, at: Pos<Tiles>) {
    let taken: HashSet<String> = frame
        .modules
        .iter()
        .filter_map(|m| m["name"].as_str().map(str::to_owned))
        .collect();
    let mut placed = Vec::new();
    let mut names = taken.clone();
    for mut module in modules {
        shapes::shift(&mut module, at.x, at.y);
        if let Some(name) = module["name"].as_str().map(str::to_owned)
            && names.contains(&name)
        {
            let fresh = blueprint::suffixed(&name, &names);
            names.insert(fresh.clone());
            module["name"] = Value::String(fresh);
        }
        placed.push(module);
    }
    let count = placed.len();
    append_modules(
        editor,
        frame,
        placed,
        &format!("Paste {count} modules into {}", frame.area_key),
    );
}

pub fn duplicate_selection(editor: &mut Editor, frame: &Frame) {
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let names: HashSet<String> = frame
        .modules
        .iter()
        .filter_map(|m| m["name"].as_str().map(str::to_owned))
        .collect();
    let mut taken = names.clone();
    let copies: Vec<Value> = indices
        .iter()
        .map(|&i| {
            let mut module = frame.modules[i].clone();
            shapes::shift(&mut module, 1.0, 1.0);
            if let Some(name) = module["name"].as_str().map(str::to_owned) {
                let fresh = blueprint::suffixed(&name, &taken);
                taken.insert(fresh.clone());
                module["name"] = Value::String(fresh);
            }
            module
        })
        .collect();
    let count = copies.len();
    append_modules(
        editor,
        frame,
        copies,
        &format!("Duplicate {count} modules in {}", frame.area_key),
    );
}

pub fn delete_selection(editor: &mut Editor, frame: &Frame) {
    if editor.selection.table == "blueprint"
        && let Some(place) = editor
            .views
            .area
            .views
            .get(&format!("area:{}", frame.area_key))
            .and_then(|v| v.in_place.last().cloned())
    {
        blueprint::delete_parts_in_place(editor, frame, &place);
        return;
    }
    let indices = selected_indices(editor, &frame.area_key);
    if indices.is_empty() {
        return;
    }
    let mut modules = frame.modules.clone();
    for &index in indices.iter().rev() {
        modules.remove(index);
    }
    let label = if indices.len() == 1 {
        format!(
            "Remove {} from {}",
            shapes::label(&frame.modules[indices[0]]),
            frame.area_key
        )
    } else {
        format!("Remove {} modules from {}", indices.len(), frame.area_key)
    };
    if write_modules(editor, &frame.area_key, modules, &label) {
        editor.selection.parts.clear();
    }
}

/// A paint, erase, walk or terrain gesture: cells accumulate while the button is down, then one
/// step writes the grid files.
fn grid_stroke(editor: &mut Editor, view_key: &str, frame: &Frame, kind: StrokeKind) {
    let response = frame.response;
    let brush = editor.settings.brush.clone();
    let pressed = response.drag_started_by(egui::PointerButton::Primary)
        || response.clicked_by(egui::PointerButton::Primary);
    let down = response.dragged_by(egui::PointerButton::Primary);
    let released = response.drag_stopped_by(egui::PointerButton::Primary)
        || response.clicked_by(egui::PointerButton::Primary);
    let Some(cell) = frame.pointer_cell().or_else(|| {
        frame
            .response
            .interact_pointer_pos()
            .map(|p| frame.canvas.to_tile(p).cell())
    }) else {
        if released {
            finish_stroke(editor, view_key, frame);
        }
        return;
    };
    if pressed && editor.views.area.views[view_key].stroke.is_none() {
        let grids = frame.area().grids;
        let draft = grid::GridDraft::of(&frame.area_key, grids);
        let seed = editor
            .frame
            .wrapping_mul(6364136223846793005)
            .wrapping_add(cell.x as u64 * 31 + cell.y as u64);
        editor
            .views
            .area
            .views
            .get_mut(view_key)
            .expect("view")
            .stroke = Some(Stroke {
            draft,
            kind,
            cells: HashSet::new(),
            seed,
            anchor: cell,
            rng: game::core::math::Rng::new(seed),
        });
    }
    if pressed || down {
        apply_brush(editor, view_key, frame, cell, &brush);
    }
    if released {
        finish_stroke(editor, view_key, frame);
    }
}

fn apply_brush(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    center: CellPos,
    brush: &crate::user::BrushSettings,
) {
    let content = frame.content;
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let layer = view.layer;
    let walk_value = view.walk_value;
    let pick = view.pick.clone();
    let terrain = view.terrain.clone();
    let Some(stroke) = &mut view.stroke else {
        return;
    };
    match stroke.kind {
        StrokeKind::Walk => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set_walk(cell, walk_value) {
                    stroke.cells.insert(cell);
                }
            }
        }
        StrokeKind::Erase => {
            for cell in grid::brush_cells(center, brush.size) {
                if stroke.draft.set(layer, cell, None) {
                    stroke.cells.insert(cell);
                }
            }
        }
        StrokeKind::Paint => {
            let Some(tileset) = pick.tileset.clone() else {
                return;
            };
            if pick.is_empty() {
                return;
            }
            let flip = Flip::of(brush.flip_x, brush.flip_y);
            if !pick.random.is_empty() || brush.random {
                let choices: Vec<u32> = if pick.random.is_empty() {
                    pick.block.iter().flatten().copied().collect()
                } else {
                    pick.random.clone()
                };
                for cell in grid::brush_cells(center, brush.size) {
                    if stroke.cells.contains(&cell) {
                        continue;
                    }
                    let tile = choices[stroke.rng.rand_range(0..choices.len() as u32) as usize];
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            } else {
                let (w, h) = pick.block_size();
                let (w, h) = (w as i32, h as i32);
                for cell in grid::brush_cells(center, brush.size) {
                    let bx = (cell.x - stroke.anchor.x).rem_euclid(w);
                    let by = (cell.y - stroke.anchor.y).rem_euclid(h);
                    let (bx, by) = (
                        if brush.flip_x { w - 1 - bx } else { bx },
                        if brush.flip_y { h - 1 - by } else { by },
                    );
                    let tile = pick.block[by as usize][bx as usize];
                    let entry = stroke.draft.intern(&tileset, tile, flip);
                    if stroke.draft.set(layer, cell, Some(entry)) {
                        stroke.cells.insert(cell);
                    }
                }
            }
        }
        StrokeKind::Terrain => {
            let (Some(tileset), Some(set)) = (terrain.tileset.clone(), terrain.set.clone()) else {
                return;
            };
            let Some(def) = content
                .by_key::<area::tileset::TilesetDef>(&tileset)
                .map(|id| id.get(&content))
            else {
                return;
            };
            let kept = super::terrain::paint(
                &mut stroke.draft,
                layer,
                def,
                &tileset,
                &set,
                terrain.terrain,
                center,
                brush.size,
                &mut stroke.rng,
                &mut stroke.cells,
            );
            if kept > 0 {
                view.skipped = Some(format!("{kept} cells kept: no tile for that mix"));
            }
        }
    }
}

fn finish_stroke(editor: &mut Editor, view_key: &str, frame: &Frame) {
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let Some(stroke) = view.stroke.take() else {
        return;
    };
    if stroke.cells.is_empty() || !stroke.draft.is_touched() {
        return;
    }
    let layer_name = stroke
        .draft
        .layer_names()
        .get(view.layer)
        .cloned()
        .unwrap_or_default();
    let label = match stroke.kind {
        StrokeKind::Paint => format!(
            "Paint {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Erase => format!(
            "Erase {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Walk => format!(
            "Walk grid: {} cells in {}",
            stroke.cells.len(),
            frame.area_key
        ),
        StrokeKind::Terrain => format!(
            "Terrain: {} cells of {layer_name} in {}",
            stroke.cells.len(),
            frame.area_key
        ),
    };
    let mut draft = stroke.draft;
    if stroke.kind == StrokeKind::Erase {
        draft.compact_palette();
    }
    let mut edit = Edit::new(label);
    draft.write_into(&mut edit);
    editor.apply(edit);
}

fn fill(editor: &mut Editor, view_key: &str, frame: &Frame, cell: CellPos) {
    let view = &editor.views.area.views[view_key];
    let layer = view.layer;
    let pick = view.pick.clone();
    let walk_overlay = view.walk_overlay;
    let walk_value = view.walk_value;
    let brush = editor.settings.brush.clone();
    let grids = frame.area().grids;
    let mut draft = grid::GridDraft::of(&frame.area_key, grids);
    let cells = draft.flood(layer, cell);
    if cells.is_empty() {
        return;
    }
    let count = cells.len();
    if walk_overlay {
        for cell in cells {
            draft.set_walk(cell, walk_value);
        }
        let mut edit = Edit::new(format!(
            "Walk grid: fill {count} cells in {}",
            frame.area_key
        ));
        draft.write_into(&mut edit);
        editor.apply(edit);
        return;
    }
    let Some(tileset) = pick.tileset.clone() else {
        editor.toast("Pick a tile first");
        return;
    };
    if pick.is_empty() {
        editor.toast("Pick a tile first");
        return;
    }
    let flip = Flip::of(brush.flip_x, brush.flip_y);
    let mut rng = game::core::math::Rng::new(editor.frame);
    let choices: Vec<u32> = if pick.random.is_empty() {
        pick.block.iter().flatten().copied().collect()
    } else {
        pick.random.clone()
    };
    let (w, h) = pick.block_size();
    for c in cells {
        let tile = if !pick.random.is_empty() || brush.random {
            choices[rng.rand_range(0..choices.len() as u32) as usize]
        } else {
            let bx = (c.x - cell.x).rem_euclid(w as i32) as usize;
            let by = (c.y - cell.y).rem_euclid(h as i32) as usize;
            pick.block[by][bx]
        };
        let entry = draft.intern(&tileset, tile, flip);
        draft.set(layer, c, Some(entry));
    }
    let layer_name = draft.layer_names().get(layer).cloned().unwrap_or_default();
    let mut edit = Edit::new(format!(
        "Fill {count} cells of {layer_name} in {}",
        frame.area_key
    ));
    draft.write_into(&mut edit);
    editor.apply(edit);
}

fn eyedrop(editor: &mut Editor, view_key: &str, frame: &Frame, cell: CellPos, topmost: bool) {
    let grids = frame.area().grids;
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    let layers: Vec<usize> = if topmost {
        (0..grids.ground.len()).rev().collect()
    } else {
        vec![view.layer]
    };
    for layer in layers {
        let Some(index) = cell.index(grids.size) else {
            continue;
        };
        let Some(entry) = grids
            .ground
            .get(layer)
            .and_then(|l| l.cells[index])
            .and_then(|i| grids.palette_keys.get(i as usize))
        else {
            continue;
        };
        view.pick = TilePick {
            tileset: Some(entry.0.clone()),
            block: vec![vec![entry.1]],
            random: Vec::new(),
            anchor: None,
        };
        view.layer = layer;
        editor.settings.brush.flip_x = entry.2.horizontal();
        editor.settings.brush.flip_y = entry.2.vertical();
        view.tool = Tool::Paint;
        return;
    }
    editor.toast("Nothing on that layer here");
}

/// Waits for a click that picks a place for a field; invalid cells are hatched and refused.
fn pick_place(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    pick: &crate::app::PickRequest,
    fine: bool,
) {
    let canvas = frame.canvas;
    let area = frame.area();
    let warps = pins::warp_objects(frame.content, frame.area_id);
    let visible = canvas.visible();
    for cell in super::size_cells(area.size.grid()) {
        let bounds = cell.bounds();
        if !visible.intersects(&bounds) {
            continue;
        }
        let valid =
            area.grid.walkable(cell.center()) && !warps.iter().any(|shape| shape.covers_cell(cell));
        if !valid {
            super::hatch(
                painter,
                canvas.rect(bounds),
                Color32::from_rgba_unmultiplied(220, 60, 60, 90),
                canvas.scale(),
            );
        }
    }
    pins::draw_arrivals(editor, painter, frame);
    let text = match &pick.what {
        PickWhat::Place { file, pointer } => format!(
            "Pick a place for {file} {pointer} · click a cell, Alt-click any point · Esc cancels"
        ),
    };
    painter.text(
        canvas.rect.min + Vec2::new(8.0, 8.0),
        egui::Align2::LEFT_TOP,
        text,
        egui::FontId::proportional(13.0),
        Color32::from_rgb(255, 230, 120),
    );
    let _ = view_key;
    let Some(tile) = frame.pointer_tile else {
        return;
    };
    let at = if fine {
        snap_sixteenth(tile)
    } else {
        tile.snap()
    };
    painter.circle_stroke(
        canvas.to_screen(at),
        6.0,
        EStroke::new(2.0, Color32::from_rgb(255, 230, 120)),
    );
    if !frame.response.clicked() {
        return;
    }
    let place = game::systems::script::Place {
        area: frame.area_id,
        at,
    };
    if let Err(problem) = area::check_place(&frame.content, place) {
        editor.toast(format!("{}: {}", problem.rule, problem.expected));
        return;
    }
    let PickWhat::Place { file, pointer } = &pick.what;
    let Some(mut target) = editor.project.as_ref().and_then(|p| p.files.json(file)) else {
        editor.pick = None;
        return;
    };
    let Some(slot) = target.pointer_mut(pointer) else {
        editor.toast(format!("{pointer} is gone from {file}"));
        editor.pick = None;
        return;
    };
    *slot = serde_json::json!({ "area": frame.area_key, "x": at.x, "y": at.y });
    let mut edit = Edit::new(format!(
        "Pick place {} {}, {} for {file}",
        frame.area_key, at.x, at.y
    ));
    edit.write_json(file.clone(), &target);
    if editor.apply(edit) {
        editor.pick = None;
        editor.toast(format!("Picked {} {}, {}", frame.area_key, at.x, at.y));
    }
}

/// Draws the tool's preview: brush cells, the box being dragged, the paste ghost, the listener.
pub fn overlay(editor: &mut Editor, painter: &egui::Painter, view_key: &str, frame: &Frame) {
    let canvas = frame.canvas;
    let brush = editor.settings.brush.clone();
    let view = &editor.views.area.views[view_key];
    let accent = Color32::from_rgb(255, 230, 120);
    match &view.drag {
        Some(Drag::Box { from }) => {
            if let Some(tile) = frame.pointer_tile {
                painter.rect_stroke(
                    canvas.rect(Rect::from_points([*from, tile])),
                    0.0,
                    EStroke::new(1.0, accent),
                    egui::StrokeKind::Inside,
                );
            }
        }
        Some(Drag::Move { from, moved: true }) => {
            if let Some(tile) = frame.pointer_tile {
                let alt = painter.ctx().input(|i| i.modifiers.alt);
                let (dx, dy) = snapped_delta(*from, tile, alt);
                for index in selected_indices(editor, &frame.area_key) {
                    if let Some(bounds) = frame.module_bounds(index) {
                        let moved = bounds.translate(game::core::math::Offset::new(dx, dy));
                        painter.rect_stroke(
                            canvas.rect(moved),
                            0.0,
                            EStroke::new(1.5, accent),
                            egui::StrokeKind::Inside,
                        );
                    }
                }
            }
        }
        _ => {}
    }
    if let Some(listener) = view.listener {
        let at = canvas.to_screen(listener);
        painter.circle_stroke(at, 8.0, EStroke::new(2.0, Color32::from_rgb(170, 110, 255)));
        painter.text(
            at + Vec2::new(10.0, -8.0),
            egui::Align2::LEFT_TOP,
            "listening",
            egui::FontId::proportional(11.0),
            Color32::from_rgb(170, 110, 255),
        );
    }
    if let Some(ghost) = &view.paste
        && let Some(tile) = frame.pointer_tile
    {
        let at: Pos<Tiles> = Pos::new(tile.x.round() - 0.5, tile.y.round() - 0.5);
        let mut whole: Option<Rect<Tiles>> = None;
        for module in &ghost.modules {
            let mut placed = module.clone();
            shapes::shift(&mut placed, at.x, at.y);
            if let Some(bounds) = shapes::bounds(&placed, None) {
                let color = super::module_color(module["type"].as_str().unwrap_or(""));
                let rect = canvas.rect(bounds);
                painter.add(egui::Shape::dashed_line(
                    &[
                        rect.left_top(),
                        rect.right_top(),
                        rect.right_bottom(),
                        rect.left_bottom(),
                        rect.left_top(),
                    ],
                    EStroke::new(1.5, color),
                    6.0,
                    4.0,
                ));
                if matches!(
                    module["type"].as_str(),
                    Some("population") | Some("resident") | Some("object")
                ) {
                    super::label_chip(
                        painter,
                        rect.min + Vec2::new(0.0, -4.0),
                        &shapes::label(module),
                        color,
                    );
                }
                whole = Some(whole.map_or(bounds, |w| shapes::rect_union(w, bounds)));
            }
        }
        if let Some(whole) = whole {
            let rect = canvas.rect(whole);
            painter.add(egui::Shape::dashed_line(
                &[
                    rect.left_top(),
                    rect.right_top(),
                    rect.right_bottom(),
                    rect.left_bottom(),
                    rect.left_top(),
                ],
                EStroke::new(1.0, Color32::from_rgba_unmultiplied(255, 120, 160, 160)),
                8.0,
                6.0,
            ));
        }
        let from = editor
            .clipboard
            .as_ref()
            .and_then(|c| c["from"].as_str().map(|f| format!(" from area/{f}")))
            .unwrap_or_default();
        super::label_chip(
            painter,
            canvas.to_screen(tile) + Vec2::new(16.0, 8.0),
            &format!(
                "{} module{}{from}",
                ghost.modules.len(),
                if ghost.modules.len() == 1 { "" } else { "s" }
            ),
            Color32::WHITE,
        );
        editor
            .status
            .left
            .push(format!("pasting into area/{}", frame.area_key));
        editor
            .status
            .left
            .push("click or Enter places · Esc cancels".to_owned());
        editor
            .status
            .left
            .push("Ctrl ⇧ V pastes at the same tiles".to_owned());
    }
    let drag_hover = view.drag_hover.clone();
    let tool_now = view.tool;
    if let Some((table, key, tile)) = drag_hover {
        let cell = tile.cell();
        let candidates = super::inspect::drop_candidates(editor, &table);
        if candidates.iter().any(|(kind, _)| kind == "population") {
            let rect = canvas.rect(Rect::new(
                Pos::new(cell.x as f32 - 2.5, cell.y as f32 - 2.5),
                game::core::math::Size::new(4.0, 4.0),
            ));
            painter.add(egui::Shape::dashed_line(
                &[
                    rect.left_top(),
                    rect.right_top(),
                    rect.right_bottom(),
                    rect.left_bottom(),
                    rect.left_top(),
                ],
                EStroke::new(1.5, super::module_color("population")),
                6.0,
                4.0,
            ));
        }
        let ctx = painter.ctx().clone();
        if let Some((texture, uv, drawn)) =
            super::inspect::npc_sprite(editor, &ctx, frame.content, &key)
        {
            let scale = canvas.scale() / super::TILE_PX;
            let shown = drawn * scale;
            let feet = canvas.to_screen(tile) + Vec2::new(0.0, canvas.scale() * 0.5);
            painter.image(
                texture,
                ERect::from_min_max(
                    feet - Vec2::new(shown.x / 2.0, shown.y),
                    feet + Vec2::new(shown.x / 2.0, 0.0),
                ),
                uv,
                Color32::from_rgba_unmultiplied(255, 255, 255, 200),
            );
        }
        super::label_chip(
            painter,
            canvas.to_screen(tile) + Vec2::new(canvas.scale(), canvas.scale() * 2.0),
            &format!("{table}/{key}"),
            Color32::WHITE,
        );
        editor.status.left.push(format!("dragging {table}/{key}"));
    }
    let view = &editor.views.area.views[view_key];
    let _ = tool_now;
    let Some(cell) = frame.pointer_cell() else {
        return;
    };
    match view.tool {
        Tool::Paint | Tool::Erase => {
            let cells = grid::brush_cells(cell, brush.size);
            if let Some(rect) = grid::rect_of_cells(&cells) {
                let color = if view.tool == Tool::Erase || view.walk_overlay {
                    Color32::from_rgb(255, 120, 120)
                } else {
                    accent
                };
                painter.rect_stroke(
                    canvas.rect(rect),
                    0.0,
                    EStroke::new(1.5, color),
                    egui::StrokeKind::Inside,
                );
                if view.tool == Tool::Paint && !view.walk_overlay {
                    paint_preview(editor, painter, view_key, frame, &cells);
                }
            }
        }
        Tool::Terrain => {
            let cells = grid::brush_cells(cell, brush.size);
            if let Some(rect) = grid::rect_of_cells(&cells) {
                let outline = rect.inflate(0.5, 0.5);
                painter.rect_stroke(
                    canvas.rect(outline),
                    0.0,
                    EStroke::new(1.5, Color32::from_rgb(140, 220, 140)),
                    egui::StrokeKind::Inside,
                );
            }
        }
        Tool::Fill | Tool::Eyedropper | Tool::Module => {
            painter.rect_stroke(
                canvas.rect(cell.bounds()),
                0.0,
                EStroke::new(1.0, accent),
                egui::StrokeKind::Inside,
            );
        }
        Tool::Stamp => blueprint::stamp_overlay(editor, painter, view_key, frame),
        Tool::Select => {
            if let Some(cursor) = view.cursor_cell
                && !painter.ctx().text_edit_focused()
            {
                painter.rect_stroke(
                    canvas.rect(cursor.bounds()),
                    0.0,
                    EStroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 90)),
                    egui::StrokeKind::Inside,
                );
            }
        }
    }
}

fn paint_preview(
    editor: &mut Editor,
    painter: &egui::Painter,
    view_key: &str,
    frame: &Frame,
    cells: &[CellPos],
) {
    let view = &editor.views.area.views[view_key];
    let pick = view.pick.clone();
    let (Some(tileset), false) = (pick.tileset.clone(), pick.is_empty()) else {
        return;
    };
    let Some(def) = frame
        .content
        .by_key::<area::tileset::TilesetDef>(&tileset)
        .map(|id| id.get(&frame.content))
    else {
        return;
    };
    let image = def.image.as_str().to_owned();
    let ctx = painter.ctx().clone();
    let Some(project) = &editor.project else {
        return;
    };
    let Some(thumb) = editor.form.thumbnails.image(&ctx, &project.files, &image) else {
        return;
    };
    let columns = (thumb.size[0] as u32 / def.tile.max(1)).max(1);
    let (w, h) = pick.block_size();
    let anchor = view.stroke.as_ref().map(|s| s.anchor).unwrap_or(cells[0]);
    let brush = &editor.settings.brush;
    for cell in cells {
        let tile = if !pick.random.is_empty() || brush.random {
            let choices: Vec<u32> = if pick.random.is_empty() {
                pick.block.iter().flatten().copied().collect()
            } else {
                pick.random.clone()
            };
            choices[((cell.x * 7 + cell.y * 13).rem_euclid(choices.len() as i32)) as usize]
        } else {
            let bx = (cell.x - anchor.x).rem_euclid(w as i32) as usize;
            let by = (cell.y - anchor.y).rem_euclid(h as i32) as usize;
            let (bx, by) = (
                if brush.flip_x { w - 1 - bx } else { bx },
                if brush.flip_y { h - 1 - by } else { by },
            );
            pick.block[by][bx]
        };
        let (x, y) = ((tile % columns) * def.tile, (tile / columns) * def.tile);
        let mut uv = crate::thumbs::uv(
            thumb.size,
            x as f32,
            y as f32,
            def.tile as f32,
            def.tile as f32,
        );
        if brush.flip_x {
            uv = ERect::from_min_max(Pos2::new(uv.max.x, uv.min.y), Pos2::new(uv.min.x, uv.max.y));
        }
        if brush.flip_y {
            uv = ERect::from_min_max(Pos2::new(uv.min.x, uv.max.y), Pos2::new(uv.max.x, uv.min.y));
        }
        let rect = frame.canvas.rect(Rect::new(
            Pos::new(cell.x as f32, cell.y as f32),
            Size::splat(1.0),
        ));
        painter.image(
            thumb.texture.id(),
            rect,
            uv,
            Color32::from_rgba_unmultiplied(255, 255, 255, 180),
        );
    }
}

/// Keys with the canvas hovered: tools, brush size, flips, overlay, selection commands, nudges.
pub fn keys(editor: &mut Editor, ui: &mut Ui, view_key: &str, frame: &Frame) {
    let input = ui.input(|i| i.clone());
    let modifiers = input.modifiers;
    if editor.pick.is_some() {
        if input.key_pressed(egui::Key::Escape) {
            editor.pick = None;
            editor.toast("Pick cancelled");
        }
        return;
    }
    if !modifiers.ctrl && !modifiers.alt {
        if input.key_pressed(egui::Key::OpenBracket) {
            editor.settings.brush.size = editor.settings.brush.size.saturating_sub(1).max(1);
            editor.save_settings();
        }
        if input.key_pressed(egui::Key::CloseBracket) {
            editor.settings.brush.size = (editor.settings.brush.size + 1).min(9);
            editor.save_settings();
        }
    }
    let mut switched = None;
    let plain_key = |key: egui::Key| {
        input.events.iter().any(|event| matches!(event, egui::Event::Key { key: pressed, pressed: true, modifiers, .. } if *pressed == key && !modifiers.ctrl && !modifiers.alt && !modifiers.command))
    };
    {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if !modifiers.ctrl && !modifiers.alt {
            for tool in Tool::ALL {
                if plain_key(tool.key()) {
                    view.tool = tool;
                    view.drag = None;
                    switched = tool.bottom_tab();
                }
            }
            if input.key_pressed(egui::Key::W) {
                view.walk_overlay = !view.walk_overlay;
            }
            if input.key_pressed(egui::Key::L) {
                view.layers_open = Some(!view.layers_shown());
            }
            if view.tool == Tool::Terrain {
                for (index, key) in [
                    egui::Key::Num1,
                    egui::Key::Num2,
                    egui::Key::Num3,
                    egui::Key::Num4,
                    egui::Key::Num5,
                    egui::Key::Num6,
                    egui::Key::Num7,
                    egui::Key::Num8,
                    egui::Key::Num9,
                ]
                .iter()
                .enumerate()
                {
                    if input.key_pressed(*key) {
                        view.terrain.terrain = index;
                    }
                }
            }
        }
    }
    if let Some(bottom) = switched {
        editor.panels.bottom = bottom;
    }
    let view_tool = editor.views.area.views[view_key].tool;
    if input.key_pressed(egui::Key::X) || input.key_pressed(egui::Key::Y) {
        let horizontal = input.key_pressed(egui::Key::X);
        match view_tool {
            Tool::Paint | Tool::Fill => {
                if horizontal {
                    editor.settings.brush.flip_x = !editor.settings.brush.flip_x
                } else {
                    editor.settings.brush.flip_y = !editor.settings.brush.flip_y
                }
                editor.save_settings();
            }
            Tool::Stamp => blueprint::flip_stamp(editor, view_key, horizontal),
            _ => {
                let indices = selected_indices(editor, &frame.area_key);
                if !indices.is_empty() {
                    let mut modules = frame.modules.clone();
                    for &index in &indices {
                        shapes::flip_field(&mut modules[index], horizontal);
                    }
                    write_modules(
                        editor,
                        &frame.area_key,
                        modules,
                        &format!("Flip {} modules in {}", indices.len(), frame.area_key),
                    );
                }
            }
        }
    }
    if input.key_pressed(egui::Key::Escape) {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        if view.drag.is_some() {
            view.drag = None;
            view.stroke = None;
        } else if view.paste.is_some() {
            view.paste = None;
        } else if view.in_place.pop().is_some() || !editor.selection.parts.is_empty() {
            editor.selection.parts.clear();
        }
        return;
    }
    if input.key_pressed(egui::Key::Enter) {
        let indices = selected_indices(editor, &frame.area_key);
        if indices.len() == 1 && frame.modules[indices[0]]["type"] == "blueprint" {
            blueprint::edit_in_place(editor, view_key, frame, indices[0]);
        }
    }
    if input.key_pressed(egui::Key::Delete) || input.key_pressed(egui::Key::Backspace) {
        delete_selection(editor, frame);
    }
    let (copied, pasted) = ui.input(|i| {
        (
            i.events
                .iter()
                .any(|event| matches!(event, egui::Event::Copy)),
            i.events
                .iter()
                .any(|event| matches!(event, egui::Event::Paste(_))),
        )
    });
    if copied || (modifiers.command && input.key_pressed(egui::Key::C)) {
        copy_selection(editor, frame);
        if let Some(clip) = &editor.clipboard {
            ui.ctx()
                .copy_text(serde_json::to_string_pretty(&clip["modules"]).unwrap_or_default());
        }
    }
    if pasted || (modifiers.command && input.key_pressed(egui::Key::V)) {
        if modifiers.shift {
            paste_in_place(editor, frame);
        } else {
            start_paste(editor, view_key);
        }
    }
    if modifiers.command && input.key_pressed(egui::Key::D) {
        duplicate_selection(editor, frame);
    }
    if modifiers.command && input.key_pressed(egui::Key::G) {
        blueprint::join_scenery(editor, view_key, frame);
    }
    let make_blueprint = input.events.iter().any(|event| matches!(event, egui::Event::Key { key: egui::Key::B, pressed: true, modifiers, .. } if modifiers.command && modifiers.alt));
    if make_blueprint {
        blueprint::make_blueprint_from_selection(editor, frame);
    }
    let step = if modifiers.shift { 1.0 / 16.0 } else { 1.0 };
    let nudge = [
        (egui::Key::ArrowLeft, (-step, 0.0)),
        (egui::Key::ArrowRight, (step, 0.0)),
        (egui::Key::ArrowUp, (0.0, -step)),
        (egui::Key::ArrowDown, (0.0, step)),
    ];
    for (key, (dx, dy)) in nudge {
        if input.key_pressed(key) {
            if !editor.selection.parts.is_empty() && editor.selection.table == "area" {
                move_selection(editor, view_key, frame, dx, dy);
            } else {
                let view = editor.views.area.views.get_mut(view_key).expect("view");
                let cursor = view.cursor_cell.unwrap_or_else(|| view.center.cell());
                view.cursor_cell = Some(cursor.step((dx.round() as i32, dy.round() as i32)));
            }
        }
    }
    if input.key_pressed(egui::Key::Space)
        && !modifiers.any()
        && let Some(cursor) = editor.views.area.views[view_key].cursor_cell
    {
        let tile = cursor.center();
        if let Some(hit) = frame.hit(tile) {
            editor.selection = Selection {
                table: "area".to_owned(),
                keys: vec![frame.area_key.clone()],
                parts: vec![format!("/modules/{hit}")],
            };
        }
    }
    if input.key_pressed(egui::Key::F10) && modifiers.shift {
        let view = editor.views.area.views.get_mut(view_key).expect("view");
        let at = view
            .cursor_cell
            .map(|c| frame.canvas.to_screen(c.center()))
            .unwrap_or(frame.canvas.rect.center());
        let tile = view.cursor_cell.map(|c| c.center()).unwrap_or(view.center);
        let id = egui::Id::new((view_key, "context"));
        egui::Popup::open_id(ui.ctx(), id);
        MENU_AT.with(|cell| cell.set(Some((id, at, tile))));
    }
}

pub fn resize_dialog(
    editor: &mut Editor,
    ctx: &egui::Context,
    mut dialog: ResizeDialog,
) -> Option<ResizeDialog> {
    use crate::ui::{theme, widgets};
    let mut outcome = None;
    let (enter, escape) = ctx.input(|i| {
        (
            i.key_pressed(egui::Key::Enter),
            i.key_pressed(egui::Key::Escape),
        )
    });
    let old = editor
        .project
        .as_ref()
        .and_then(|p| p.content)
        .and_then(|c| {
            c.by_key::<area::AreaDef>(&dialog.area)
                .map(|id| area::load(&c, id).size)
        })
        .map(|size| (size.width as u32, size.height as u32))
        .unwrap_or((dialog.width, dialog.height));
    crate::ui::dialogs::card(ctx, "resize", 480.0, |ui| {
        ui.label(
            RichText::new(format!("Resize area/{}", dialog.area))
                .strong()
                .size(18.0),
        );
        ui.add_space(8.0);
        for (name, value, was) in [
            ("width", &mut dialog.width, old.0),
            ("height", &mut dialog.height, old.1),
        ] {
            widgets::kv(ui, name, |ui| {
                ui.scope(|ui| {
                    ui.set_width(120.0);
                    let id = ui.id().with((name, "resize"));
                    let mut draft = ui
                        .ctx()
                        .data(|d| d.get_temp::<String>(id))
                        .unwrap_or_else(|| value.to_string());
                    let response =
                        crate::forms::boxed_input(ui, Some(&format!("was {was}")), |ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut draft)
                                    .frame(egui::Frame::NONE)
                                    .font(egui::TextStyle::Monospace)
                                    .desired_width(f32::INFINITY),
                            )
                        });
                    if response.changed() {
                        ui.ctx().data_mut(|d| d.insert_temp(id, draft.clone()));
                        if let Ok(parsed) = draft.trim().parse::<u32>() {
                            *value = parsed.clamp(area::MIN_SIDE, area::MAX_SIDE);
                        }
                    }
                    if response.lost_focus() {
                        ui.ctx().data_mut(|d| d.remove_temp::<String>(id));
                    }
                });
            });
        }
        widgets::kv(ui, "anchor", |ui| {
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing = Vec2::splat(4.0);
                for row in [-1i8, 0, 1] {
                    ui.horizontal(|ui| {
                        for column in [-1i8, 0, 1] {
                            let picked = dialog.anchor == (column, row);
                            let (rect, response) =
                                ui.allocate_exact_size(Vec2::splat(18.0), egui::Sense::click());
                            ui.painter().rect_filled(
                                rect,
                                3.0,
                                if picked { theme::ACCENT } else { theme::INPUT },
                            );
                            ui.painter().rect_stroke(
                                rect,
                                3.0,
                                egui::Stroke::new(
                                    1.0,
                                    if picked { theme::ACCENT } else { theme::BORDER },
                                ),
                                egui::StrokeKind::Inside,
                            );
                            if response.clicked() {
                                dialog.anchor = (column, row);
                            }
                        }
                    });
                }
            });
        });
        ui.add_space(6.0);
        ui.label(
            theme::muted(resize_description(
                old,
                (dialog.width, dialog.height),
                dialog.anchor,
            ))
            .size(13.0),
        );
        if let Some(error) = &dialog.error {
            ui.colored_label(theme::DANGER, error);
        }
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::primary(ui, "Resize").clicked() || enter {
                outcome = Some(true);
            }
            if ui.button("Cancel").clicked() || escape {
                outcome = Some(false);
            }
        });
    });
    match outcome {
        Some(true) => match blueprint::resize_area(editor, &dialog) {
            Ok(()) => None,
            Err(error) => {
                dialog.error = Some(error);
                Some(dialog)
            }
        },
        Some(false) => None,
        None => Some(dialog),
    }
}

/// What the resize does to the grids, in words: what is added or clipped, and whether anything shifts.
fn resize_description(old: (u32, u32), new: (u32, u32), anchor: (i8, i8)) -> String {
    let mut parts = Vec::new();
    let side = |delta: i32, axis_anchor: i8, unit: &str, sides: (&str, &str)| -> Option<String> {
        if delta == 0 {
            return None;
        }
        let n = delta.unsigned_abs();
        let where_ = match axis_anchor {
            -1 => format!("on the {}", sides.1),
            1 => format!("on the {}", sides.0),
            _ => "on both sides".to_owned(),
        };
        Some(if delta > 0 {
            format!(
                "Adds {n} empty {unit}{} {where_}",
                if n == 1 { "" } else { "s" }
            )
        } else {
            format!("Clips {n} {unit}{} {where_}", if n == 1 { "" } else { "s" })
        })
    };
    if let Some(text) = side(
        new.0 as i32 - old.0 as i32,
        anchor.0,
        "column",
        ("left", "right"),
    ) {
        parts.push(text);
    }
    if let Some(text) = side(
        new.1 as i32 - old.1 as i32,
        anchor.1,
        "row",
        ("top", "bottom"),
    ) {
        parts.push(text);
    }
    if parts.is_empty() {
        return "The size stays as it is.".to_owned();
    }
    let shift = |axis_anchor: i8, delta: i32| -> i32 {
        match axis_anchor {
            -1 => 0,
            0 => delta / 2,
            _ => delta,
        }
    };
    let (dx, dy) = (
        shift(anchor.0, new.0 as i32 - old.0 as i32),
        shift(anchor.1, new.1 as i32 - old.1 as i32),
    );
    let shifting = if dx == 0 && dy == 0 {
        "With this anchor nothing shifts.".to_owned()
    } else {
        format!(
            "With this anchor everything shifts by {dx}, {dy}: positions, and every place leading in."
        )
    };
    format!(
        "{} of every ground layer and the walk grid. {shifting}",
        parts.join(" and ")
    )
}
