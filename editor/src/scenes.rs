use std::path::PathBuf;

use engine::core::content::ContentRow;
use engine::systems::actor::model::ModelDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::tileset::TilesetDef;
use engine::systems::area::world_map::{Note, Region};
use engine::systems::area::{self, AreaDef};
use engine::systems::class::ClassDef;
use engine::systems::script::ScriptDef;
use serde::Deserialize;
use strum::VariantNames;

use crate::app::{BottomTab, Clipboard, Editor, ModalDialog};
use crate::import::ImportStep;
use crate::project::{ContentEdit, RowSelection};
use crate::tabs::EditorTab;
use crate::views::area::resize::ResizeDialog;
use crate::views::area::{blueprint, shapes};
use crate::views::character::CharacterSection;
use crate::views::class;
use crate::views::model::strip::TimingSetBy;
use crate::views::model::{self, FrameCueKind, ModelPage, ModelStrip, busts};
use crate::views::script::{PendingScriptAction, ScriptOwner};
use crate::views::tileset::{
    self, NewSurfaceDialog, NewTerrainSetDialog, SheetRect, TileBlueprintDialog, TileSheetDialog,
    TilesetMode, WalkBrush,
};
use crate::views::world::{
    self, ColorBy, ColorField, MapLens, MapLook, MapPart, MapRoute, OpenWorldMap, arrange,
};
use crate::{rows, ui};

#[derive(Clone, Debug, Deserialize, VariantNames)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SceneStep {
    Area(String),
    Blueprint(String),
    Resize(String),
    Row {
        table: String,
        key: String,
    },
    Rows {
        table: String,
        keys: Vec<String>,
    },
    Part {
        table: String,
        key: String,
        modules: Vec<usize>,
    },
    Fold {
        table: String,
        modules: Vec<usize>,
    },
    Unfold {
        table: String,
        modules: Vec<usize>,
    },
    Delete {
        table: String,
        key: String,
    },
    Duplicate {
        table: String,
        key: String,
    },
    Clipboard {
        table: String,
        key: String,
        module: usize,
    },
    Script(ScriptTarget),
    Node(Vec<String>),
    MakeShared,
    MakeInline,
    Connect {
        from: String,
        field: String,
        to: String,
    },
    Bottom(BottomTab),
    Model(ModelStep),
    Tileset(TilesetStep),
    Sheet(SheetStep),
    World(WorldStep),
    Import(ImportStep),
    Section(CharacterSection),
    Tree {
        key: String,
        node: Option<String>,
    },
    Save,
    Dialog(DialogName),
    Game,
    Asset(String),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScriptTarget {
    Shared {
        key: String,
    },
    Inline {
        table: String,
        key: String,
        pointer: String,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DialogName {
    Keys,
    Binaries,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelStep {
    Open(String),
    Strip(StripView),
    Timing(StripView),
    Cues(StripView),
    Hitbox,
    Busts(Option<String>),
    Bottom(BottomTab),
    SetBy(SetTiming),
    Surface(String),
    Drop(PathBuf),
}

#[derive(Clone, Debug, Deserialize)]
pub struct StripView {
    #[serde(default)]
    pub strip: Option<StripName>,
    #[serde(default)]
    pub frames: Vec<usize>,
    #[serde(default)]
    pub cue: Option<FrameCueKind>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StripName {
    pub action: String,
    pub direction: String,
}

impl StripName {
    pub fn strip(&self) -> Option<ModelStrip> {
        ModelStrip::parse(&self.action, &self.direction)
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct SetTiming {
    pub by: TimingSetBy,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TilesetStep {
    Open(String),
    Mode(TilesetMode),
    Brush(SceneBrush),
    Select(TileSelection),
    Tile(u32),
    Set(String),
    Terrain(usize),
    Closeup(u32),
    Bottom(BottomTab),
    Zoom(f32),
    Dialog(TilesetDialogName),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SceneBrush {
    Walk(WalkBrush),
    Surface(String),
    NoSurface,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct TileSelection {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TilesetDialogName {
    Blueprint,
    Surface,
    Set,
    None,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SheetStep {
    Open(String),
    Columns(Vec<String>),
    Sort {
        column: String,
        #[serde(default)]
        order: SortOrder,
    },
    Filter(String),
    Cell {
        key: String,
        column: String,
        #[serde(default)]
        editing: bool,
    },
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Asc,
    #[default]
    Desc,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorldStep {
    Open,
    Lens(WorldLens),
    Color(Option<ColorField>),
    Line(String),
    Route(Option<MapRoute>),
    Look {
        area: String,
        zoom: f32,
    },
    Select(Vec<MapPart>),
    Layer(WorldLayer),
    Arrange,
    ArrangeApply,
    Region {
        name: String,
        cards: Vec<String>,
    },
    Note {
        text: String,
        #[serde(default)]
        x: f32,
        #[serde(default)]
        y: f32,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorldLens {
    Row { table: String, key: String },
    Text(String),
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorldLayer {
    Residents,
    Populations,
    Givers,
}

pub fn open(editor: &mut Editor, steps: &[SceneStep]) {
    for step in steps {
        open_one(editor, step);
    }
}

fn open_one(editor: &mut Editor, step: &SceneStep) {
    match step {
        SceneStep::Area(key) => {
            editor.select(RowSelection::row(AreaDef::TABLE, key));
            editor.open_tab(EditorTab::Area { key: key.clone() });
        }
        SceneStep::Blueprint(key) => {
            editor.select(RowSelection::row(BlueprintDef::TABLE, key));
            editor.open_tab(EditorTab::Blueprint { key: key.clone() });
        }
        SceneStep::Part {
            table,
            key,
            modules,
        } => {
            let parts: Vec<String> = modules.iter().map(|i| format!("/modules/{i}")).collect();
            editor.select(RowSelection {
                table: table.clone(),
                keys: vec![key.clone()],
                parts,
            });
            editor.open_tab(EditorTab::for_row(table, key));
        }
        SceneStep::Resize(key) => {
            let size = editor
                .project
                .as_ref()
                .and_then(|p| p.content.clone())
                .and_then(|c| c.by_key::<AreaDef>(key).map(|id| area::load(&c, id).size));
            editor.open_tab(EditorTab::Area { key: key.clone() });
            editor.dialogs.push(ModalDialog::Resize(ResizeDialog {
                area: key.clone(),
                width: size.map_or(0, |s| s.width as u32),
                height: size.map_or(0, |s| s.height as u32),
                anchor: (-1, -1),
                error: None,
            }));
        }
        SceneStep::Row { table, key } => {
            editor.open_row(table, key);
        }
        SceneStep::Rows { table, keys } => {
            editor.select(RowSelection::rows(table, keys.clone()));
            editor.open_tab(EditorTab::Rows {
                table: table.clone(),
                keys: keys.clone(),
            });
        }
        SceneStep::Fold { table, modules } => fold(editor, table, modules, true),
        SceneStep::Unfold { table, modules } => fold(editor, table, modules, false),
        SceneStep::Delete { table, key } => rows::delete_dialog(editor, table, vec![key.clone()]),
        SceneStep::Duplicate { table, key } => rows::duplicate(editor, table, key),
        SceneStep::Clipboard { table, key, module } => {
            let Some(module_value) = editor
                .row_value(table, key)
                .and_then(|value| value["modules"].get(*module).cloned())
            else {
                return;
            };
            let origin = blueprint::selection_origin(std::slice::from_ref(&module_value))
                .unwrap_or_default();
            let mut relative = module_value;
            shapes::shift(&mut relative, -origin.x, -origin.y);
            editor.clipboard = Some(Clipboard {
                from: key.clone(),
                modules: vec![relative],
                origin: Some(origin),
            });
        }
        SceneStep::Script(target) => open_script(editor, target),
        SceneStep::Node(names) => {
            if let Some(owner) = last_script_owner(editor) {
                let parts = names.iter().map(|name| format!("node:{name}")).collect();
                editor.select(RowSelection::parts(owner.table(), owner.key(), parts));
            }
        }
        SceneStep::MakeShared => set_pending(editor, PendingScriptAction::MakeShared),
        SceneStep::MakeInline => set_pending(editor, PendingScriptAction::MakeInline),
        SceneStep::Connect { from, field, to } => set_pending(
            editor,
            PendingScriptAction::Connect {
                from: from.clone(),
                field: format!("/{field}"),
                to: to.clone(),
            },
        ),
        SceneStep::Bottom(tab) => editor.panels.bottom = *tab,
        SceneStep::Model(step) => model_step(editor, step),
        SceneStep::Tileset(step) => tileset_step(editor, step),
        SceneStep::Sheet(step) => sheet_step(editor, step),
        SceneStep::World(step) => {
            editor.open_tab(EditorTab::World);
            world_step(editor, step);
        }
        SceneStep::Import(step) => editor.jobs.script.push_back(step.clone()),
        SceneStep::Section(section) => editor.views.character.section = *section,
        SceneStep::Tree { key, node } => {
            editor.open_tab(EditorTab::for_row(ClassDef::TABLE, key));
            editor
                .views
                .class
                .pages
                .insert(key.clone(), class::ClassPage::Tree);
            class::select_node(editor, key, node.as_deref());
        }
        SceneStep::Save => {
            editor.save();
        }
        SceneStep::Game => {
            editor.select(RowSelection::game());
            editor.open_tab(EditorTab::Game);
        }
        SceneStep::Asset(path) => {
            editor.select(RowSelection::row("asset", path));
            editor.open_tab(EditorTab::Asset { path: path.clone() });
        }
        SceneStep::Dialog(DialogName::Keys) => editor.dialogs.push(ModalDialog::Keys),
        SceneStep::Dialog(DialogName::Binaries) => editor.dialogs.push(ModalDialog::Binaries),
    }
}

fn fold(editor: &mut Editor, table: &str, modules: &[usize], folded: bool) {
    for index in modules {
        let path = format!("{table}/modules/{index}");
        if folded {
            editor.form.unfolded.remove(&path);
            editor.form.folded.insert(path);
        } else {
            editor.form.folded.remove(&path);
            editor.form.unfolded.insert(path);
        }
    }
}

fn open_script(editor: &mut Editor, target: &ScriptTarget) {
    match target {
        ScriptTarget::Shared { key } => {
            editor.select(RowSelection::row(ScriptDef::TABLE, key));
            editor.open_tab(EditorTab::Script(ScriptOwner::Shared { key: key.clone() }));
        }
        ScriptTarget::Inline {
            table,
            key,
            pointer,
        } => {
            if let Some(owner) = ScriptOwner::inline(table, key, pointer) {
                editor.select(RowSelection::row(table, key));
                editor.open_tab(EditorTab::Script(owner));
            }
        }
    }
}

fn set_pending(editor: &mut Editor, action: PendingScriptAction) {
    if let Some(owner) = last_script_owner(editor) {
        editor.views.script.set_pending(&owner, action);
    }
}

fn last_script_owner(editor: &Editor) -> Option<ScriptOwner> {
    editor
        .open_tabs
        .iter()
        .map(|(tab, _)| tab)
        .chain(editor.dock.iter_all_tabs().map(|(_, tab)| tab))
        .filter_map(|tab| match tab {
            EditorTab::Script(owner) => Some(owner.clone()),
            _ => None,
        })
        .last()
}

fn sheet_step(editor: &mut Editor, step: &SheetStep) {
    if let SheetStep::Open(table) = step {
        editor.open_tab(EditorTab::Spreadsheet {
            table: table.clone(),
        });
        return;
    }
    let pending = editor
        .open_tabs
        .iter()
        .rev()
        .find_map(|(tab, _)| match tab {
            EditorTab::Spreadsheet { table } => Some(table.clone()),
            _ => None,
        });
    let active = match ui::active_tab(editor) {
        Some(EditorTab::Spreadsheet { table }) => Some(table),
        _ => None,
    };
    let Some(table) = pending.or(active) else {
        return;
    };
    if let SheetStep::Cell {
        key,
        column,
        editing,
    } = step
    {
        let state = editor.views.spreadsheet.state_mut(&table);
        state.selected = Some((key.clone(), column.clone()));
        state.editing = editing.then(|| column.clone());
        editor.select(RowSelection {
            table: table.clone(),
            keys: vec![key.clone()],
            parts: vec![format!("#sheet/{column}")],
        });
        return;
    }
    let mut view = editor
        .settings
        .views
        .get(&table)
        .cloned()
        .unwrap_or_default();
    match step {
        SheetStep::Columns(columns) => view.columns = columns.clone(),
        SheetStep::Sort { column, order } => {
            view.sort = Some((column.clone(), matches!(order, SortOrder::Desc)));
        }
        SheetStep::Filter(text) => view.filter = text.clone(),
        SheetStep::Open(_) | SheetStep::Cell { .. } => return,
    }
    editor.settings.views.insert(table, view);
}

fn model_step(editor: &mut Editor, step: &ModelStep) {
    if let ModelStep::Open(key) = step {
        editor.select(RowSelection::row(ModelDef::TABLE, key));
        editor.open_tab(EditorTab::Model { key: key.clone() });
        return;
    }
    let key = match ui::active_tab(editor) {
        Some(EditorTab::Model { key }) => key,
        _ if editor.selection.table == ModelDef::TABLE && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    model::ensure_view(editor, &key);
    match step {
        ModelStep::Open(_) => {}
        ModelStep::Strip(view) => show_strip(editor, &key, ModelPage::Matrix, view),
        ModelStep::Timing(view) => show_strip(editor, &key, ModelPage::Timing, view),
        ModelStep::Cues(view) => show_strip(editor, &key, ModelPage::Cues, view),
        ModelStep::Hitbox => editor.views.model.view_mut(&key).page = ModelPage::Hitbox,
        ModelStep::Busts(face) => {
            let view = editor.views.model.view_mut(&key);
            view.page = ModelPage::Busts;
            if let Some(face) = face {
                view.face = Some(face.clone());
                if let Some(row) = editor.row_value(ModelDef::TABLE, &key)
                    && let Some(found) = busts::faces(&row)
                        .into_iter()
                        .find(|found| found.name == *face)
                {
                    editor.select(RowSelection {
                        table: ModelDef::TABLE.to_owned(),
                        keys: vec![key.clone()],
                        parts: vec![found.pointer],
                    });
                }
            }
        }
        ModelStep::Bottom(tab) => editor.panels.bottom = *tab,
        ModelStep::SetBy(timing) => {
            let view = editor.views.model.view_mut(&key);
            view.timing.set_by = timing.by;
            view.timing.text = timing.text.clone();
        }
        ModelStep::Surface(name) => editor.views.model.view_mut(&key).surface = Some(name.clone()),
        ModelStep::Drop(path) => editor.views.model.drops.push(path.clone()),
    }
}

fn show_strip(editor: &mut Editor, key: &str, page: ModelPage, step: &StripView) {
    let view = editor.views.model.view_mut(key);
    if let Some(strip) = step.strip.as_ref().and_then(StripName::strip) {
        view.strip = strip;
    }
    view.page = page;
    view.frames = step.frames.iter().map(|f| f.saturating_sub(1)).collect();
    view.cue = None;
    view.preview.playing = false;
    view.preview.position = 0.0;
    let strip = view.strip;
    match (view.frames.first().copied(), step.cue) {
        (Some(frame), Some(kind)) => {
            view.cue = Some((frame, kind));
            model::select_cue(editor, key, strip, frame, kind);
        }
        _ => model::select_frames(editor, key, strip),
    }
}

fn tileset_step(editor: &mut Editor, step: &TilesetStep) {
    if let TilesetStep::Open(key) = step {
        editor.select(RowSelection::row(TilesetDef::TABLE, key));
        editor.open_tab(EditorTab::Tileset { key: key.clone() });
        return;
    }
    let key = match ui::active_tab(editor) {
        Some(EditorTab::Tileset { key }) => key,
        _ if editor.selection.table == TilesetDef::TABLE && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    tileset::ensure_view(editor, &key);
    match step {
        TilesetStep::Open(_) => {}
        TilesetStep::Mode(mode) => tileset::set_mode(editor, &key, *mode),
        TilesetStep::Brush(brush) => {
            let view = editor.views.tileset.view_mut(&key);
            match brush {
                SceneBrush::Walk(walk) => view.walk = *walk,
                SceneBrush::Surface(surface) => view.surface = Some(surface.clone()),
                SceneBrush::NoSurface => view.surface = None,
            }
        }
        TilesetStep::Select(selection) => {
            let view = editor.views.tileset.view_mut(&key);
            view.selection = Some(SheetRect {
                x: selection.x,
                y: selection.y,
                w: selection.w.max(1),
                h: selection.h.max(1),
            });
            if view.mode == TilesetMode::Animation {
                tileset::select_part(editor, &key, tileset::ANIMATION_PART);
            }
        }
        TilesetStep::Tile(tile) => tileset::select_tile(editor, &key, *tile),
        TilesetStep::Set(set) => editor.views.tileset.view_mut(&key).pick_set(set.clone()),
        TilesetStep::Terrain(index) => editor.views.tileset.view_mut(&key).terrain = *index,
        TilesetStep::Closeup(tile) => {
            let view = editor.views.tileset.view_mut(&key);
            view.closeup = Some(*tile);
            view.tile = Some(*tile);
        }
        TilesetStep::Bottom(tab) => editor.panels.bottom = *tab,
        TilesetStep::Zoom(zoom) => editor.views.tileset.view_mut(&key).zoom = *zoom,
        TilesetStep::Dialog(name) => {
            editor.views.tileset.view_mut(&key).dialog = match name {
                TilesetDialogName::Blueprint => {
                    Some(TileSheetDialog::MakeBlueprint(TileBlueprintDialog {
                        name: format!("{key}_part"),
                        error: None,
                    }))
                }
                TilesetDialogName::Surface => {
                    Some(TileSheetDialog::NewSurface(NewSurfaceDialog::default()))
                }
                TilesetDialogName::Set => Some(TileSheetDialog::NewTerrainSet(
                    NewTerrainSetDialog::default(),
                )),
                TilesetDialogName::None => None,
            };
        }
    }
}

fn world_step(editor: &mut Editor, step: &WorldStep) {
    match step {
        WorldStep::Open => {}
        WorldStep::Lens(lens) => editor.views.world.lenses.push(match lens {
            WorldLens::Row { table, key } => MapLens::Row {
                table: table.clone(),
                key: key.clone(),
            },
            WorldLens::Text(text) => MapLens::Text(text.clone()),
        }),
        WorldStep::Color(field) => editor.views.world.color = field.clone().map(ColorBy::new),
        WorldStep::Line(line) => editor.views.world.quest_line = Some(line.clone()),
        WorldStep::Route(route) => editor.views.world.route = route.clone(),
        WorldStep::Look { area, zoom } => {
            editor.views.world.pending_look = Some(MapLook {
                area: area.clone(),
                zoom: *zoom,
            });
        }
        WorldStep::Select(parts) => world::select(editor, parts.clone()),
        WorldStep::Layer(layer) => {
            let layers = &mut editor.views.world.layers;
            match layer {
                WorldLayer::Residents => layers.residents = true,
                WorldLayer::Populations => layers.populations = true,
                WorldLayer::Givers => layers.givers = true,
            }
        }
        WorldStep::Arrange => arrange::open(editor),
        WorldStep::ArrangeApply => arrange::arrange_everything(editor),
        WorldStep::Region { name, cards } => {
            let Some(map) = OpenWorldMap::of(editor) else {
                return;
            };
            map.change(editor, ContentEdit::new(format!("Add {name}")), |layout| {
                layout.regions.push(Region {
                    name: name.clone(),
                    cards: cards.iter().filter_map(|key| map.atlas.id(key)).collect(),
                    color: None,
                });
            });
        }
        WorldStep::Note { text, x, y } => {
            let Some(map) = OpenWorldMap::of(editor) else {
                return;
            };
            map.change(editor, ContentEdit::new(format!("Add {text}")), |layout| {
                layout.notes.push(Note {
                    text: text.clone(),
                    x: *x,
                    y: *y,
                });
            });
        }
    }
}
