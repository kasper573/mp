use game::systems::area::world_map::{Note, Region};
use game::systems::area::{self, AreaDef};

use crate::app::{BottomTab, Clipboard, Editor, ModalDialog};
use crate::project::{ContentEdit, RowSelection};
use crate::tabs::EditorTab;
use crate::views::area::resize::ResizeDialog;
use crate::views::area::{blueprint, shapes};
use crate::views::character::CharacterSection;
use crate::views::model::strip::TimingSetBy;
use crate::views::model::{FrameCueKind, ModelPage, ModelStrip, busts};
use crate::views::script::{PendingScriptAction, ScriptOwner};
use crate::views::tileset::{
    NewSurfaceDialog, NewTerrainSetDialog, SheetRect, TileBlueprintDialog, TileSheetDialog,
    TilesetMode, WalkBrush,
};
use crate::views::world::{
    ColourBy, ColourField, MapLens, MapLook, MapPart, MapRoute, OpenWorldMap, arrange,
};
use crate::views::{model, tileset, world};
use crate::{rows, ui};

pub fn open(editor: &mut Editor, name: &str) {
    for step in name.split(';') {
        open_one(editor, step.trim());
    }
}

fn open_one(editor: &mut Editor, name: &str) {
    let (kind, rest) = name.split_once(':').unwrap_or((name, ""));
    match kind {
        "area" => {
            editor.select(RowSelection::row("area", rest));
            editor.open_tab(EditorTab::Area {
                key: rest.to_owned(),
            });
        }
        "part" => {
            let mut bits = rest.splitn(3, '/');
            if let (Some(table), Some(key), Some(indices)) = (bits.next(), bits.next(), bits.next())
            {
                let parts: Vec<String> = indices
                    .split(',')
                    .map(|i| format!("/modules/{i}"))
                    .collect();
                editor.select(RowSelection {
                    table: table.to_owned(),
                    keys: vec![key.to_owned()],
                    parts,
                });
                editor.open_tab(EditorTab::for_row(table, key));
            }
        }
        "resize" => {
            if let Some((_, key)) = rest.split_once('/') {
                let size = editor
                    .project
                    .as_ref()
                    .and_then(|p| p.content)
                    .and_then(|c| c.by_key::<AreaDef>(key).map(|id| area::load(&c, id).size));
                editor.open_tab(EditorTab::Area {
                    key: key.to_owned(),
                });
                editor
                    .dialogs
                    .push(crate::app::ModalDialog::Resize(ResizeDialog {
                        area: key.to_owned(),
                        width: size.map_or(0, |s| s.width as u32),
                        height: size.map_or(0, |s| s.height as u32),
                        anchor: (-1, -1),
                        error: None,
                    }));
            }
        }
        "blueprint" => {
            editor.select(RowSelection::row("blueprint", rest));
            editor.open_tab(EditorTab::Blueprint {
                key: rest.to_owned(),
            });
        }
        "row" => {
            if let Some((table, key)) = rest.split_once('/') {
                editor.select(RowSelection::row(table, key));
                editor.open_tab(EditorTab::for_row(table, key));
            }
        }
        "rows" => {
            if let Some((table, keys)) = rest.split_once('/') {
                let keys: Vec<String> = keys.split(',').map(str::to_owned).collect();
                editor.select(RowSelection::rows(table, keys.clone()));
                editor.open_tab(EditorTab::Rows {
                    table: table.to_owned(),
                    keys,
                });
            }
        }
        "fold" | "unfold" => {
            if let Some((row, indices)) = rest.rsplit_once('/')
                && let Some((table, _)) = row.split_once('/')
            {
                for index in indices.split(',') {
                    let path = format!("{table}/modules/{index}");
                    if kind == "fold" {
                        editor.form.unfolded.remove(&path);
                        editor.form.folded.insert(path);
                    } else {
                        editor.form.folded.remove(&path);
                        editor.form.unfolded.insert(path);
                    }
                }
            }
        }
        "delete" => {
            if let Some((table, key)) = rest.split_once('/') {
                rows::delete_dialog(editor, table, vec![key.to_owned()]);
            }
        }
        "duplicate" => {
            if let Some((table, key)) = rest.split_once('/') {
                rows::duplicate(editor, table, key);
            }
        }
        "clipboard" => {
            if let Some((row, index)) = rest.rsplit_once('/')
                && let Some((table, key)) = row.split_once('/')
                && let Some(module) = editor.row_value(table, key).and_then(|value| {
                    value["modules"]
                        .get(index.parse::<usize>().unwrap_or(0))
                        .cloned()
                })
            {
                let origin =
                    blueprint::selection_origin(std::slice::from_ref(&module)).unwrap_or_default();
                let mut relative = module;
                shapes::shift(&mut relative, -origin.x, -origin.y);
                editor.clipboard = Some(Clipboard {
                    table: table.to_string(),
                    from: key.to_string(),
                    modules: vec![relative],
                    origin: Some(origin),
                });
            }
        }
        "script" => match rest.split_once('#') {
            Some((row, pointer)) => {
                if let Some((table, key)) = row.split_once('/')
                    && let Some(owner) = ScriptOwner::inline(table, key, pointer)
                {
                    editor.select(RowSelection::row(table, key));
                    editor.open_tab(EditorTab::Script(owner));
                }
            }
            None => {
                editor.select(RowSelection::row("script", rest));
                editor.open_tab(EditorTab::Script(ScriptOwner::Shared {
                    key: rest.to_owned(),
                }));
            }
        },
        "node" => {
            let owner = last_script_owner(editor);
            if let Some(owner) = owner {
                editor.views.script.focus = Some(owner.clone());
                let parts = rest.split(',').map(|name| format!("node:{name}")).collect();
                editor.select(RowSelection::parts(owner.table(), owner.key(), parts));
            }
        }
        "make-shared" | "make-inline" | "connect" => {
            let owner = last_script_owner(editor);
            let pending = match kind {
                "make-shared" => Some(PendingScriptAction::MakeShared),
                "make-inline" => Some(PendingScriptAction::MakeInline),
                _ => {
                    let parts: Vec<&str> = rest.split(':').collect();
                    match parts.as_slice() {
                        [from, field, to] => Some(PendingScriptAction::Connect {
                            from: (*from).to_owned(),
                            field: format!("/{field}"),
                            to: (*to).to_owned(),
                        }),
                        _ => None,
                    }
                }
            };
            if let (Some(owner), Some(pending)) = (owner, pending) {
                editor.views.script.pending = Some((owner, pending));
            }
        }
        "bottom" => {
            editor.panels.bottom = match rest {
                "may-do" => BottomTab::MayDo,
                "used-by" => BottomTab::UsedBy,
                "run" => BottomTab::Run,
                "output" => BottomTab::Output,
                _ => BottomTab::History,
            };
        }
        "model" => {
            editor.select(RowSelection::row("model", rest));
            editor.open_tab(EditorTab::Model {
                key: rest.to_owned(),
            });
        }
        "tileset" => {
            editor.select(RowSelection::row("tileset", rest));
            editor.open_tab(EditorTab::Tileset {
                key: rest.to_owned(),
            });
        }
        "sheet" => editor.open_tab(EditorTab::Spreadsheet {
            table: rest.to_owned(),
        }),
        "world" => editor.open_tab(EditorTab::World),
        "mp" => model_step(editor, rest),
        "tp" => tileset_step(editor, rest),
        "imp" => editor.jobs.script.push_back(rest.to_owned()),
        "sh" => sheet_step(editor, rest),
        "wm" => {
            editor.open_tab(EditorTab::World);
            let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
            world_step(editor, what, arg);
        }
        "section" => {
            editor.views.character.section = match rest {
                "stats" => CharacterSection::Stats,
                "bag" => CharacterSection::Bag,
                "equipment" => CharacterSection::Equipment,
                "start" => CharacterSection::Start,
                "areas" => CharacterSection::AreasKnown,
                "quests" => CharacterSection::Quests,
                "memories" => CharacterSection::Memories,
                "lines" => CharacterSection::LinesHeard,
                "shops" => CharacterSection::Shops,
                "history" => CharacterSection::History,
                _ => CharacterSection::Identity,
            };
        }
        "save" => {
            editor.save();
        }
        "dialog" => match rest {
            "keys" => editor.dialogs.push(ModalDialog::Keys),
            "binaries" => editor.dialogs.push(ModalDialog::Binaries),
            _ => {}
        },
        other => editor.say(format!("unknown scene {other}")),
    }
}

fn last_script_owner(editor: &Editor) -> Option<ScriptOwner> {
    editor
        .open_tabs
        .iter()
        .chain(editor.dock.iter_all_tabs().map(|(_, tab)| tab))
        .filter_map(|tab| match tab {
            EditorTab::Script(owner) => Some(owner.clone()),
            _ => None,
        })
        .last()
}

fn sheet_step(editor: &mut Editor, rest: &str) {
    let pending = editor.open_tabs.iter().rev().find_map(|tab| match tab {
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
    let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
    let mut view = editor
        .settings
        .views
        .get(&table)
        .cloned()
        .unwrap_or_default();
    match what {
        "columns" => view.columns = arg.split(',').map(str::to_owned).collect(),
        "sort" => {
            let (column, order) = arg.split_once(':').unwrap_or((arg, "desc"));
            view.sort = Some((column.to_owned(), order != "asc"));
        }
        "filter" => view.filter = arg.to_owned(),
        "cell" => {
            let (cell, edit) = arg
                .split_once(':')
                .map(|(c, e)| (c, e == "edit"))
                .unwrap_or((arg, false));
            if let Some((key, column)) = cell.split_once('/') {
                let state = editor.views.spreadsheet.state_mut(&table);
                state.selected = Some((key.to_owned(), column.to_owned()));
                state.editing = edit.then(|| column.to_owned());
                editor.select(RowSelection {
                    table: table.clone(),
                    keys: vec![key.to_owned()],
                    parts: vec![format!("#sheet/{column}")],
                });
            }
            return;
        }
        _ => return,
    }
    editor.settings.views.insert(table, view);
}

fn model_step(editor: &mut Editor, rest: &str) {
    let key = match ui::active_tab(editor) {
        Some(EditorTab::Model { key }) => key,
        _ if editor.selection.table == "model" && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
    let bits: Vec<&str> = arg.split('/').collect();
    let strip = ModelStrip::parse(bits.first().unwrap_or(&""), bits.get(1).unwrap_or(&""));
    model::ensure_view(editor, &key);
    let view = editor.views.model.view_mut(&key);
    match what {
        "strip" | "timing" | "cues" => {
            if let Some(strip) = strip {
                view.strip = strip;
            }
            view.page = match what {
                "timing" => ModelPage::Timing,
                "cues" => ModelPage::Cues,
                _ => ModelPage::Matrix,
            };
            view.frames = bits
                .get(2)
                .map(|frames| {
                    frames
                        .split(',')
                        .filter_map(|f| f.parse::<usize>().ok())
                        .map(|f| f.saturating_sub(1))
                        .collect()
                })
                .unwrap_or_default();
            view.cue = None;
            view.preview.playing = false;
            view.preview.position = 0.0;
            let strip = view.strip;
            if let (Some(frame), Some(kind)) = (
                view.frames.first().copied(),
                bits.get(3)
                    .and_then(|kind| kind.parse::<FrameCueKind>().ok()),
            ) {
                view.cue = Some((frame, kind));
                model::select_cue(editor, &key, strip, frame, kind);
            } else {
                model::select_frames(editor, &key, strip);
            }
        }
        "hitbox" => view.page = ModelPage::Hitbox,
        "busts" => {
            view.page = ModelPage::Busts;
            if !arg.is_empty() {
                view.face = Some(arg.to_owned());
                if let Some(row) = editor.row_value("model", &key)
                    && let Some(face) = busts::faces(&row).into_iter().find(|face| face.name == arg)
                {
                    editor.select(RowSelection {
                        table: "model".to_owned(),
                        keys: vec![key.clone()],
                        parts: vec![face.pointer],
                    });
                }
            }
        }
        "bottom" => {
            editor.panels.bottom = match arg {
                "timeline" => BottomTab::Timeline,
                "sheet" => BottomTab::Sheet,
                "sounds" => BottomTab::Sounds,
                _ => BottomTab::History,
            };
        }
        "setby" => {
            let (by, text) = arg.split_once('=').unwrap_or((arg, ""));
            view.timing.set_by = match by {
                "fps" => TimingSetBy::Fps,
                "scale" => TimingSetBy::Scale,
                _ => TimingSetBy::Ms,
            };
            view.timing.text = text.to_owned();
        }
        "surface" => view.surface = Some(arg.to_owned()),
        "drop" => editor.views.model.drops.push(std::path::PathBuf::from(arg)),
        _ => {}
    }
}

fn tileset_step(editor: &mut Editor, rest: &str) {
    let key = match ui::active_tab(editor) {
        Some(EditorTab::Tileset { key }) => key,
        _ if editor.selection.table == "tileset" && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    tileset::ensure_view(editor, &key);
    let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
    let view = editor.views.tileset.view_mut(&key);
    match what {
        "mode" => {
            if let Ok(mode) = arg.parse::<TilesetMode>() {
                tileset::set_mode(editor, &key, mode);
            }
        }
        "brush" => match (arg.parse::<WalkBrush>(), arg) {
            (Ok(walk), _) => view.walk = walk,
            (Err(_), "none") => view.surface = None,
            (Err(_), surface) => view.surface = Some(surface.to_owned()),
        },
        "select" => {
            let n: Vec<u32> = arg
                .split(',')
                .filter_map(|v| v.trim().parse().ok())
                .collect();
            if let [x, y, w, h] = n[..] {
                view.selection = Some(SheetRect {
                    x,
                    y,
                    w: w.max(1),
                    h: h.max(1),
                });
                if view.mode == TilesetMode::Animation {
                    tileset::select_part(editor, &key, tileset::ANIMATION_PART);
                }
            }
        }
        "tile" => {
            if let Ok(tile) = arg.parse::<u32>() {
                tileset::select_tile(editor, &key, tile);
            }
        }
        "set" => view.pick_set(arg.to_owned()),
        "terrain" => {
            if let Ok(index) = arg.parse::<usize>() {
                view.terrain = index;
            }
        }
        "closeup" => {
            if let Ok(tile) = arg.parse::<u32>() {
                view.closeup = Some(tile);
                view.tile = Some(tile);
            }
        }
        "bottom" => {
            editor.panels.bottom = match arg {
                "surfaces" => BottomTab::Surfaces,
                "mixes" => BottomTab::Mixes,
                "timeline" => BottomTab::Timeline,
                _ => BottomTab::History,
            };
        }
        "zoom" => {
            if let Ok(zoom) = arg.parse::<f32>() {
                view.zoom = zoom;
            }
        }
        "dialog" => {
            view.dialog = match arg {
                "blueprint" => Some(TileSheetDialog::MakeBlueprint(TileBlueprintDialog {
                    name: format!("{key}_part"),
                    error: None,
                })),
                "surface" => Some(TileSheetDialog::NewSurface(NewSurfaceDialog::default())),
                "set" => Some(TileSheetDialog::NewTerrainSet(
                    NewTerrainSetDialog::default(),
                )),
                _ => None,
            };
        }
        _ => {}
    }
}

fn world_step(editor: &mut Editor, what: &str, arg: &str) {
    let view = &mut editor.views.world;
    match what {
        "lens" => view.lenses.push(match arg.split_once('/') {
            Some((table, key)) => MapLens::Row {
                table: table.to_owned(),
                key: key.to_owned(),
            },
            None => MapLens::Text(arg.to_owned()),
        }),
        "colour" => view.colour = ColourField::parse(arg).map(ColourBy::new),
        "line" => view.quest_line = Some(arg.to_owned()),
        "route" => {
            view.route = arg.split_once('/').map(|(from, to)| MapRoute {
                from: from.to_owned(),
                to: to.to_owned(),
            });
        }
        "look" => {
            if let Some((area, zoom)) = arg.split_once('/') {
                view.pending_look = Some(MapLook {
                    area: area.to_owned(),
                    zoom: zoom.parse().unwrap_or(0.5),
                });
            }
        }
        "select" => {
            let parts = arg
                .split(',')
                .map(|item| {
                    item.parse()
                        .unwrap_or_else(|_| MapPart::Card(item.to_owned()))
                })
                .collect();
            world::select(editor, parts);
        }
        "layer" => match arg {
            "residents" => view.layers.residents = true,
            "populations" => view.layers.populations = true,
            "givers" => view.layers.givers = true,
            _ => {}
        },
        "arrange" => arrange::open(editor),
        "arrange-apply" => arrange::arrange_everything(editor),
        "region" | "note" => {
            let Some(map) = OpenWorldMap::of(editor) else {
                return;
            };
            let (name, rest) = arg.split_once('=').unwrap_or((arg, ""));
            map.change(editor, ContentEdit::new(format!("Add {name}")), |layout| {
                if what == "region" {
                    layout.regions.push(Region {
                        name: name.to_owned(),
                        cards: rest
                            .split(',')
                            .filter_map(|key| map.atlas.id(key))
                            .collect(),
                        colour: None,
                    });
                } else {
                    let (x, y) = rest.split_once(',').unwrap_or(("0", "0"));
                    layout.notes.push(Note {
                        text: name.to_owned(),
                        x: x.parse().unwrap_or(0.0),
                        y: y.parse().unwrap_or(0.0),
                    });
                }
            });
        }
        _ => {}
    }
}
