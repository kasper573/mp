use crate::app::Editor;
use crate::project::Selection;
use crate::tabs::Tab;

/// Opens the editor on a named scene, for recordings and tests: `area:<key>`, `blueprint:<key>`,
/// `row:<table>/<key>`, `rows:<table>/<key>,<key>`, `script:<key>` or `script:<table>/<key>#<pointer>`,
/// `model:<key>`, `tileset:<key>`, `sheet:<table>`, `world`, `clipboard:<table>/<key>/<module index>`,
/// `fold:<table>/<key>/<indices>`, `unfold:…`, `delete:<table>/<key>`, `section:<name>` of a test character,
/// `wm:<lens|colour|line|route|look|select|layer|arrange>:<arg>` on the world map,
/// `mp:<strip|timing|cues|hitbox|busts|bottom|setby|surface|drop>:<arg>` on the open model,
/// `tp:<mode|brush|select|tile|set|terrain|closeup|bottom|zoom|dialog>:<arg>` on the open tileset;
/// steps chain with `;`.
pub fn open(editor: &mut Editor, name: &str) {
    for step in name.split(';') {
        open_one(editor, step.trim());
    }
}

fn open_one(editor: &mut Editor, name: &str) {
    let (kind, rest) = name.split_once(':').unwrap_or((name, ""));
    match kind {
        "area" => {
            editor.select(Selection::row("area", rest));
            editor.open_tab(Tab::Area {
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
                editor.select(Selection {
                    table: table.to_owned(),
                    keys: vec![key.to_owned()],
                    parts,
                });
                editor.open_tab(Tab::for_row(table, key));
            }
        }
        "resize" => {
            if let Some((_, key)) = rest.split_once('/') {
                let size = editor
                    .project
                    .as_ref()
                    .and_then(|p| p.content)
                    .and_then(|c| {
                        c.by_key::<game::systems::area::AreaDef>(key)
                            .map(|id| game::systems::area::load(&c, id).size)
                    });
                editor.open_tab(Tab::Area {
                    key: key.to_owned(),
                });
                editor.dialogs.push(crate::app::Dialog::Resize(
                    crate::views::area::tools::ResizeDialog {
                        area: key.to_owned(),
                        width: size.map_or(0, |s| s.width as u32),
                        height: size.map_or(0, |s| s.height as u32),
                        anchor: (-1, -1),
                        error: None,
                    },
                ));
            }
        }
        "blueprint" => {
            editor.select(Selection::row("blueprint", rest));
            editor.open_tab(Tab::Blueprint {
                key: rest.to_owned(),
            });
        }
        "row" => {
            if let Some((table, key)) = rest.split_once('/') {
                editor.select(Selection::row(table, key));
                editor.open_tab(Tab::for_row(table, key));
            }
        }
        "rows" => {
            if let Some((table, keys)) = rest.split_once('/') {
                let keys: Vec<String> = keys.split(',').map(str::to_owned).collect();
                editor.select(Selection::rows(table, keys.clone()));
                editor.open_tab(Tab::Rows {
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
                crate::rows::delete_dialog(editor, table, vec![key.to_owned()]);
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
                    crate::views::area::blueprint::selection_origin(std::slice::from_ref(&module))
                        .unwrap_or_default();
                let mut relative = module;
                crate::views::area::shapes::shift(&mut relative, -origin.x, -origin.y);
                editor.clipboard = Some(
                    serde_json::json!({ "rift": "modules", "table": table, "from": key, "modules": [relative], "origin": { "x": origin.x, "y": origin.y } }),
                );
            }
        }
        "script" => match rest.split_once('#') {
            Some((row, pointer)) => {
                if let Some((table, key)) = row.split_once('/') {
                    editor.select(Selection::row(table, key));
                    editor.open_tab(Tab::Script(crate::views::script::ScriptOwner::inline(
                        table, key, pointer,
                    )));
                }
            }
            None => {
                editor.select(Selection::row("script", rest));
                editor.open_tab(Tab::Script(crate::views::script::ScriptOwner::Shared {
                    key: rest.to_owned(),
                }));
            }
        },
        "node" => {
            let owner = editor
                .open_tabs
                .iter()
                .chain(editor.dock.iter_all_tabs().map(|(_, tab)| tab))
                .filter_map(|tab| match tab {
                    Tab::Script(owner) => Some(owner.clone()),
                    _ => None,
                })
                .last();
            if let Some(owner) = owner {
                editor.views.script.focus = Some(owner.clone());
                editor.select(Selection {
                    table: owner.table().to_owned(),
                    keys: vec![owner.key().to_owned()],
                    parts: rest.split(',').map(|name| format!("node:{name}")).collect(),
                });
            }
        }
        "make-shared" | "make-inline" | "connect" => {
            let owner = editor
                .open_tabs
                .iter()
                .chain(editor.dock.iter_all_tabs().map(|(_, tab)| tab))
                .filter_map(|tab| match tab {
                    Tab::Script(owner) => Some(owner.clone()),
                    _ => None,
                })
                .last();
            let pending = match kind {
                "make-shared" => Some(crate::views::script::Pending::MakeShared),
                "make-inline" => Some(crate::views::script::Pending::MakeInline),
                _ => {
                    let parts: Vec<&str> = rest.split(':').collect();
                    match parts.as_slice() {
                        [from, field, to] => Some(crate::views::script::Pending::Connect {
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
                "may-do" => crate::app::BottomTab::MayDo,
                "used-by" => crate::app::BottomTab::UsedBy,
                "run" => crate::app::BottomTab::Run,
                "output" => crate::app::BottomTab::Output,
                _ => crate::app::BottomTab::History,
            };
        }
        "model" => {
            editor.select(Selection::row("model", rest));
            editor.open_tab(Tab::Model {
                key: rest.to_owned(),
            });
        }
        "tileset" => {
            editor.select(Selection::row("tileset", rest));
            editor.open_tab(Tab::Tileset {
                key: rest.to_owned(),
            });
        }
        "sheet" => editor.open_tab(Tab::Sheet {
            table: rest.to_owned(),
        }),
        "world" => editor.open_tab(Tab::World),
        "mp" => model_step(editor, rest),
        "tp" => tileset_step(editor, rest),
        "imp" => editor.jobs.script.push_back(rest.to_owned()),
        "sh" => sheet_step(editor, rest),
        "wm" => {
            use crate::views::world::{ColourBy, ColourOf, ColourShow, Lens, Part};
            editor.open_tab(Tab::World);
            let view = &mut editor.views.world;
            let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
            match what {
                "lens" => view.lenses.push(match arg.split_once('/') {
                    Some((table, key)) => Lens::Row {
                        table: table.to_owned(),
                        key: key.to_owned(),
                    },
                    None => Lens::Text(arg.to_owned()),
                }),
                "colour" => {
                    view.colour = Some(ColourBy {
                        value: arg.to_owned(),
                        of: if arg.starts_with("npc.") {
                            ColourOf::Hostile
                        } else {
                            ColourOf::Placed
                        },
                        show: ColourShow::Highest,
                    })
                }
                "line" => view.quest_line = Some(arg.to_owned()),
                "route" => {
                    if let Some((from, to)) = arg.split_once('/') {
                        view.route = Some((from.to_owned(), to.to_owned()));
                    }
                }
                "look" => {
                    if let Some((area, zoom)) = arg.split_once('/') {
                        view.pending_look = Some((area.to_owned(), zoom.parse().unwrap_or(0.5)));
                    }
                }
                "select" => {
                    let parts: Vec<Part> = arg
                        .split(',')
                        .map(|key| Part::Card(key.to_owned()))
                        .collect();
                    editor.views.world.selected = parts.clone();
                    editor.select(Selection {
                        table: "world_map".to_owned(),
                        keys: vec!["world".to_owned()],
                        parts: parts
                            .iter()
                            .map(|part| match part {
                                Part::Card(key) => format!("card:{key}"),
                                _ => String::new(),
                            })
                            .collect(),
                    });
                }
                "layer" => match arg {
                    "residents" => view.layers.residents = true,
                    "populations" => view.layers.populations = true,
                    "givers" => view.layers.givers = true,
                    _ => {}
                },
                "arrange" => crate::views::world::arrange::open(editor),
                "arrange-apply" => {
                    let atlas = editor.project.as_ref().and_then(|project| {
                        project.content.map(|content| {
                            crate::views::world::atlas::Atlas::build(content, &project.files)
                        })
                    });
                    if let Some(atlas) = atlas {
                        let layout = crate::views::world::with_defaults(
                            &atlas,
                            crate::views::world::layout_of(editor),
                        );
                        let solved =
                            crate::views::world::arrange::solve(&layout, &atlas, true, true);
                        let mut edit = crate::project::Edit::new("Arrange the world map");
                        edit.write_json(
                            crate::project::row_file("world_map", "world"),
                            &serde_json::to_value(&solved).unwrap_or_default(),
                        );
                        editor.apply(edit);
                        editor.views.world.fitted = false;
                    }
                }
                "region" | "note" => {
                    let mut layout = crate::views::world::layout_of(editor);
                    let (name, cards) = arg.split_once('=').unwrap_or((arg, ""));
                    if what == "region" {
                        layout.regions.push(crate::views::world::Region {
                            name: name.to_owned(),
                            cards: cards.split(',').map(str::to_owned).collect(),
                            colour: None,
                        });
                    } else {
                        let (x, y) = cards.split_once(',').unwrap_or(("0", "0"));
                        layout.notes.push(crate::views::world::Note {
                            text: name.to_owned(),
                            x: x.parse().unwrap_or(0.0),
                            y: y.parse().unwrap_or(0.0),
                        });
                    }
                    let mut edit = crate::project::Edit::new(format!("Add {name}"));
                    edit.write_json(
                        crate::project::row_file("world_map", "world"),
                        &serde_json::to_value(&layout).unwrap_or_default(),
                    );
                    editor.apply(edit);
                }
                _ => {}
            }
        }
        "section" => {
            use crate::views::character::Section;
            editor.views.character.section = match rest {
                "stats" => Section::Stats,
                "bag" => Section::Bag,
                "equipment" => Section::Equipment,
                "start" => Section::Start,
                "areas" => Section::AreasKnown,
                "quests" => Section::Quests,
                "memories" => Section::Memories,
                "lines" => Section::LinesHeard,
                "shops" => Section::Shops,
                "history" => Section::History,
                _ => Section::Identity,
            };
        }
        "save" => {
            editor.save();
        }
        "start" => {}
        other => editor.say(format!("unknown scene {other}")),
    }
}

/// A step on the model tab in front: `strip:<action>/<dir>`, `timing:<action>/<dir>[/<frames>]`,
/// `cues:<action>/<dir>[/<frame>/<kind>]`, `hitbox`, `busts[:<face>]`, `bottom:<tab>`,
/// `setby:<ms|fps|scale>=<text>`, `surface:<key>`, `drop:<path>`.
/// `sh:columns:<a,b>`, `sh:sort:<column>[:asc]`, `sh:filter:<f;g>`, `sh:cell:<key>/<column>[:edit]` on the open sheet tab.
fn sheet_step(editor: &mut Editor, rest: &str) {
    let pending = editor.open_tabs.iter().rev().find_map(|tab| match tab {
        Tab::Sheet { table } => Some(table.clone()),
        _ => None,
    });
    let active = match crate::ui::active_tab(editor) {
        Some(Tab::Sheet { table }) => Some(table),
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
                let state = editor.views.sheet.views.entry(table.clone()).or_default();
                state.selected = Some((key.to_owned(), column.to_owned()));
                state.editing = edit.then(|| column.to_owned());
                editor.select(Selection {
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
    use crate::views::model::{ACTIONS, CueKind, DIRECTIONS, Page};
    let key = match crate::ui::active_tab(editor) {
        Some(Tab::Model { key }) => key,
        _ if editor.selection.table == "model" && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
    let bits: Vec<&str> = arg.split('/').collect();
    let action = bits
        .first()
        .and_then(|a| ACTIONS.iter().position(|n| n == a));
    let direction = bits
        .get(1)
        .and_then(|d| DIRECTIONS.iter().position(|n| n == d));
    crate::views::model::ensure_view(editor, &key);
    let view = editor
        .views
        .model
        .views
        .get_mut(&key)
        .expect("the view exists");
    match what {
        "strip" | "timing" | "cues" => {
            if let (Some(a), Some(d)) = (action, direction) {
                view.action = a;
                view.direction = d;
            }
            view.page = match what {
                "timing" => Page::Timing,
                "cues" => Page::Cues,
                _ => Page::Matrix,
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
            let (a, d) = (view.action, view.direction);
            if let (Some(frame), Some(kind)) = (
                view.frames.first().copied(),
                bits.get(3).and_then(|kind| CueKind::of(kind)),
            ) {
                view.cue = Some((frame, kind));
                crate::views::model::select_cue(editor, &key, a, d, frame, kind);
            } else {
                crate::views::model::select_frames(editor, &key, a, d);
            }
        }
        "hitbox" => view.page = Page::Hitbox,
        "busts" => {
            view.page = Page::Busts;
            if !arg.is_empty() {
                view.face = Some(arg.to_owned());
                if let Some(row) = editor.row_value("model", &key)
                    && let Some(face) = crate::views::model::busts::faces(&row)
                        .into_iter()
                        .find(|face| face.name == arg)
                {
                    editor.select(Selection {
                        table: "model".to_owned(),
                        keys: vec![key.clone()],
                        parts: vec![face.pointer],
                    });
                }
            }
        }
        "bottom" => {
            editor.panels.bottom = match arg {
                "timeline" => crate::app::BottomTab::Timeline,
                "sheet" => crate::app::BottomTab::Sheet,
                "sounds" => crate::app::BottomTab::Sounds,
                _ => crate::app::BottomTab::History,
            };
        }
        "setby" => {
            let (by, text) = arg.split_once('=').unwrap_or((arg, ""));
            view.timing.set_by = match by {
                "fps" => crate::views::model::strip::SetBy::Fps,
                "scale" => crate::views::model::strip::SetBy::Scale,
                _ => crate::views::model::strip::SetBy::Ms,
            };
            view.timing.text = text.to_owned();
        }
        "surface" => view.surface = Some(arg.to_owned()),
        "drop" => editor.views.model.drops.push(std::path::PathBuf::from(arg)),
        _ => {}
    }
}

/// A step on the tileset tab in front: `mode:<walk|surface|terrain|animation>`, `brush:<value>`,
/// `select:<x,y,w,h>`, `tile:<n>`, `set:<name>`, `terrain:<index>`, `closeup:<tile>`,
/// `bottom:<tab>`, `zoom:<factor>`, `dialog:<blueprint|surface|set>`.
fn tileset_step(editor: &mut Editor, rest: &str) {
    use crate::views::tileset::{Mode, TileRect, TilesetDialog, WalkBrush};
    let key = match crate::ui::active_tab(editor) {
        Some(Tab::Tileset { key }) => key,
        _ if editor.selection.table == "tileset" && !editor.selection.keys.is_empty() => {
            editor.selection.keys[0].clone()
        }
        _ => return,
    };
    crate::views::tileset::ensure_view(editor, &key);
    let (what, arg) = rest.split_once(':').unwrap_or((rest, ""));
    match what {
        "mode" => {
            if let Some(mode) = Mode::of(arg) {
                crate::views::tileset::set_mode(editor, &key, mode);
            }
        }
        "brush" => {
            let view = editor
                .views
                .tileset
                .views
                .get_mut(&key)
                .expect("the view exists");
            match arg {
                "walkable" => view.walk = WalkBrush::Walkable,
                "blocks" => view.walk = WalkBrush::Blocks,
                "nothing" => view.walk = WalkBrush::Nothing,
                "none" => view.surface = None,
                other => view.surface = Some(other.to_owned()),
            }
        }
        "select" => {
            let n: Vec<u32> = arg
                .split(',')
                .filter_map(|v| v.trim().parse().ok())
                .collect();
            if n.len() == 4 {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(&key)
                    .expect("the view exists");
                view.selection = Some(TileRect {
                    x: n[0],
                    y: n[1],
                    w: n[2].max(1),
                    h: n[3].max(1),
                });
                if view.mode == Mode::Animation {
                    crate::views::tileset::select_parts(
                        editor,
                        &key,
                        vec!["/animation".to_owned()],
                    );
                }
            }
        }
        "tile" => {
            if let Ok(tile) = arg.parse::<u32>() {
                crate::views::tileset::select_tile(editor, &key, tile);
            }
        }
        "set" => {
            let view = editor
                .views
                .tileset
                .views
                .get_mut(&key)
                .expect("the view exists");
            view.set = Some(arg.to_owned());
            view.terrain = 1;
        }
        "terrain" => {
            if let Ok(index) = arg.parse::<usize>() {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(&key)
                    .expect("the view exists");
                view.terrain = index;
            }
        }
        "closeup" => {
            if let Ok(tile) = arg.parse::<u32>() {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(&key)
                    .expect("the view exists");
                view.closeup = Some(tile);
                view.tile = Some(tile);
            }
        }
        "bottom" => {
            editor.panels.bottom = match arg {
                "surfaces" => crate::app::BottomTab::Surfaces,
                "mixes" => crate::app::BottomTab::Mixes,
                "timeline" => crate::app::BottomTab::Timeline,
                _ => crate::app::BottomTab::History,
            };
        }
        "zoom" => {
            if let Ok(zoom) = arg.parse::<f32>() {
                let view = editor
                    .views
                    .tileset
                    .views
                    .get_mut(&key)
                    .expect("the view exists");
                view.zoom = zoom;
            }
        }
        "dialog" => {
            let view = editor
                .views
                .tileset
                .views
                .get_mut(&key)
                .expect("the view exists");
            view.dialog = match arg {
                "blueprint" => Some(TilesetDialog::MakeBlueprint {
                    name: format!("{key}_part"),
                    error: None,
                }),
                "surface" => Some(TilesetDialog::NewSurface {
                    name: String::new(),
                    footstep: String::new(),
                    error: None,
                }),
                "set" => Some(TilesetDialog::NewTerrainSet {
                    name: String::new(),
                    terrains: String::new(),
                    error: None,
                }),
                _ => None,
            };
        }
        _ => {}
    }
}
