pub mod area;
pub mod character;
pub mod model;
pub mod script;
pub mod sheet;
pub mod sound;
pub mod tileset;
pub mod world;

use bevy::prelude::*;
use egui::Ui;

use crate::app::{BottomTab, Editor};
use crate::project::Selection;
use crate::tabs::Tab;
use crate::ui::browser::BrowserState;

#[derive(Component)]
pub struct EditorCamera;

#[derive(Default)]
pub struct Views {
    pub browser: BrowserState,
    pub show_usages: bool,
    pub area: area::AreaViews,
    pub world: world::WorldView,
    pub script: script::ScriptViews,
    pub model: model::ModelViews,
    pub tileset: tileset::TilesetViews,
    pub sheet: sheet::SheetViews,
    pub sound: sound::SoundViews,
    pub character: character::CharacterView,
    pub assets: crate::ui::assets::AssetsState,
    pub preview: crate::ui::inspector::preview::PreviewState,
    pub generation_seen: u64,
}

impl Views {
    pub fn close(&mut self, _project: &mut Option<crate::project::Project>) {
        self.area.close();
        self.script.close();
    }

    pub fn camera_state(&self) -> Option<(String, [f32; 3])> {
        self.area.camera_state()
    }

    pub fn restore_camera(&mut self, camera: Option<(String, [f32; 3])>) {
        if let Some((key, state)) = camera {
            self.area.restore_camera(&key, state);
        }
    }

    pub fn content_changed(&mut self) {
        self.area.content_changed();
        self.world.content_changed();
        self.script.content_changed();
    }
}

pub fn sync(editor: &mut Editor, world: &mut World) {
    area::sync(editor, world);
    model::sounds::sync(editor, world);
}

pub fn bottom_tabs(editor: &Editor) -> Vec<(BottomTab, String)> {
    let mut tabs: Vec<BottomTab> = match crate::ui::active_tab(editor) {
        Some(Tab::Area { .. }) | Some(Tab::Blueprint { .. }) => {
            let mut tabs = vec![BottomTab::Palette, BottomTab::Blueprints];
            if editor.views.sound.listening.is_some() {
                tabs.push(BottomTab::Listen);
            }
            tabs
        }
        Some(Tab::Script(_)) => vec![BottomTab::MayDo, BottomTab::UsedBy, BottomTab::Run],
        Some(Tab::Model { key }) => model::bottom_tabs(editor, &key),
        Some(Tab::Tileset { key }) => tileset::bottom_tabs(editor, &key),
        _ => Vec::new(),
    };
    tabs.push(BottomTab::History);
    tabs.push(BottomTab::Output);
    tabs.into_iter()
        .map(|tab| {
            let title = match (tab, crate::ui::active_tab(editor)) {
                (BottomTab::UsedBy, Some(Tab::Script(owner))) => format!(
                    "{}   {}",
                    tab.title(),
                    script::panel::used_by_count(editor, &owner)
                ),
                _ => tab.title().to_owned(),
            };
            (tab, title)
        })
        .collect()
}

pub fn bottom_show(editor: &mut Editor, ui: &mut Ui, tab: BottomTab) {
    match (crate::ui::active_tab(editor), tab) {
        (Some(Tab::Area { key }), BottomTab::Palette) => {
            area::bottom(editor, ui, &format!("area:{key}"), tab)
        }
        (Some(Tab::Area { key }), BottomTab::Blueprints) => {
            area::bottom(editor, ui, &format!("area:{key}"), tab)
        }
        (Some(Tab::Area { .. }) | Some(Tab::Blueprint { .. }), BottomTab::Listen) => {
            sound::panel(editor, ui)
        }
        (Some(Tab::Blueprint { key }), BottomTab::Palette | BottomTab::Blueprints) => {
            area::bottom(editor, ui, &format!("blueprint:{key}"), tab)
        }
        (Some(Tab::Script(owner)), BottomTab::MayDo | BottomTab::UsedBy | BottomTab::Run) => {
            script::bottom(editor, ui, &owner, tab)
        }
        (Some(Tab::Model { key }), BottomTab::Timeline | BottomTab::Sheet | BottomTab::Sounds) => {
            model::bottom(editor, ui, &key, tab)
        }
        (
            Some(Tab::Tileset { key }),
            BottomTab::Surfaces | BottomTab::Mixes | BottomTab::Timeline,
        ) => tileset::bottom(editor, ui, &key, tab),
        _ => {
            ui.label(crate::ui::theme::muted("nothing to show here"));
        }
    }
}

pub fn play_here(editor: &mut Editor) {
    let Some(hover) = editor.views.area.hover.clone() else {
        editor.toast("Play here needs an area view under the pointer");
        return;
    };
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        return;
    };
    let Some(area) = content.by_key::<game::systems::area::AreaDef>(&hover.area) else {
        return;
    };
    use game::core::tiling::TilePos;
    crate::play::start(
        editor,
        Some(game::systems::script::Place {
            area,
            at: hover.tile.snap(),
        }),
    );
}

pub fn inspect_parts(editor: &mut Editor, ui: &mut Ui, selection: &Selection) {
    if script::is_node_selection(selection) {
        script::inspect_parts(editor, ui, selection);
        return;
    }
    if selection
        .parts
        .first()
        .is_some_and(|part| part.starts_with("#sheet/"))
    {
        egui::ScrollArea::vertical()
            .id_salt(("sheet-inspect", &selection.table))
            .show(ui, |ui| sheet::inspect(editor, ui, selection));
        return;
    }
    match selection.table.as_str() {
        "area" | "blueprint" => area::inspect_parts(editor, ui, selection),
        "world_map" => world::inspect_parts(editor, ui, selection),
        "model" => model::inspect_parts(editor, ui, selection),
        "tileset" => tileset::inspect_parts(editor, ui, selection),
        _ => {
            ui.label(format!(
                "{} parts of {}",
                selection.parts.len(),
                selection.table
            ));
        }
    }
}
