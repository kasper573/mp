use std::collections::{HashMap, HashSet};
use std::hash::Hash;

use bevy::prelude::*;
use bevy_egui::{
    EguiContext, EguiGlobalSettings, EguiOutput, EguiPlugin, EguiPostUpdateSet,
    EguiPrimaryContextPass, EguiTextureHandle, EguiUserTextures, PrimaryEguiContext,
};
use egui::load::SizedTexture;
use egui::{FontDefinitions, LayerId, Order};

use crate::core::assets::AssetRef;
use crate::core::content::asset_of;
use crate::core::text::MotionPreference;

/// Each band draws in its own egui order, so it stacks the same however the frame's systems run.
#[derive(SystemSet, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Band {
    Stage,
    Hud,
    /// Drawn after the stage and the HUD, whose rects what floats over the world steers around.
    World,
    Notices,
    System,
    Modal,
    Pointer,
}

impl Band {
    pub fn order(self) -> Order {
        match self {
            Band::World | Band::Stage => Order::Background,
            Band::Hud => Order::Middle,
            Band::Notices | Band::System | Band::Modal => Order::Foreground,
            Band::Pointer => Order::Tooltip,
        }
    }
}

#[derive(Resource, Clone)]
pub struct GuiContext(pub egui::Context);

#[derive(Resource, Default)]
pub struct WorldLayers(HashSet<LayerId>);

impl WorldLayers {
    pub fn contains(&self, layer: LayerId) -> bool {
        self.0.contains(&layer)
    }
}

#[derive(Resource, Clone)]
pub struct GuiFonts(pub FontDefinitions);

#[derive(Clone, Debug)]
pub struct GuiImage {
    pub texture: egui::TextureId,
    pub size: egui::Vec2,
    pub path: String,
}

impl GuiImage {
    pub fn widget(&self, size: egui::Vec2) -> egui::Image<'static> {
        egui::Image::new(SizedTexture::new(self.texture, size)).alt_text(self.path.clone())
    }
}

pub struct GuiPlugin;

impl Plugin for GuiPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(EguiPlugin::default())
            .insert_resource(EguiGlobalSettings {
                auto_create_primary_context: false,
                enable_cursor_icon_updates: false,
                ..default()
            })
            .init_resource::<WorldLayers>()
            .init_resource::<GuiImages>()
            .init_resource::<GuiCursor>()
            .configure_sets(
                EguiPrimaryContextPass,
                (
                    Band::Stage,
                    Band::Hud,
                    Band::World,
                    Band::Notices,
                    Band::System,
                    Band::Modal,
                    Band::Pointer,
                )
                    .chain(),
            )
            .add_systems(PreUpdate, adopt_context)
            .add_systems(
                Update,
                (
                    install_fonts.run_if(resource_exists_and_changed::<GuiFonts>),
                    apply_motion.run_if(resource_exists_and_changed::<MotionPreference>),
                )
                    .run_if(resource_exists::<GuiContext>),
            )
            .add_systems(
                EguiPrimaryContextPass,
                forget_world_layers.before(Band::Stage),
            )
            .add_systems(
                PostUpdate,
                read_cursor.after(EguiPostUpdateSet::ProcessOutput),
            );
    }
}

pub fn context(world: &World) -> Option<egui::Context> {
    world.get_resource::<GuiContext>().map(|gui| gui.0.clone())
}

pub fn world_area(world: &mut World, id: impl Hash + std::fmt::Debug) -> egui::Area {
    let id = egui::Id::new(id);
    world
        .resource_mut::<WorldLayers>()
        .0
        .insert(LayerId::new(Band::World.order(), id));
    egui::Area::new(id)
        .order(Band::World.order())
        .interactable(false)
        .constrain(false)
}

/// The handle is held from the first ask on, so an image shown again never waits on a fresh load.
pub fn image(world: &mut World, asset: &AssetRef) -> Option<GuiImage> {
    image_file(world, &asset.path())
}

pub fn image_file(world: &mut World, file: &str) -> Option<GuiImage> {
    let known = world.resource::<GuiImages>().0.get(file).cloned();
    let (handle, texture) = match known {
        Some(known) => known,
        None => {
            let handle: Handle<Image> = world.resource::<AssetServer>().load(file.to_owned());
            let texture = world
                .resource_mut::<EguiUserTextures>()
                .add_image(EguiTextureHandle::Strong(handle.clone()));
            world
                .resource_mut::<GuiImages>()
                .0
                .insert(file.to_owned(), (handle.clone(), texture));
            (handle, texture)
        }
    };
    let size = world.resource::<Assets<Image>>().get(&handle)?.size_f32();
    Some(GuiImage {
        texture,
        size: egui::vec2(size.x, size.y),
        path: asset_of(file).to_owned(),
    })
}

pub fn pointer_claimed(world: &World) -> bool {
    let Some(gui) = context(world) else {
        return false;
    };
    gui.egui_is_using_pointer()
        || gui.dragged_id().is_some()
        || gui.viewport(|viewport| viewport.hits.click.is_some() || viewport.hits.drag.is_some())
}

/// egui keeps a root layer under the whole screen for panels to catch clicks on, which this
/// interface never draws on.
pub fn layer_at(gui: &egui::Context, at: egui::Pos2) -> Option<LayerId> {
    gui.layer_id_at(at)
        .filter(|&layer| layer != LayerId::background())
}

pub fn cursor(world: &World) -> egui::CursorIcon {
    world.resource::<GuiCursor>().0
}

#[derive(Resource, Default)]
struct GuiImages(HashMap<String, (Handle<Image>, egui::TextureId)>);

#[derive(Resource, Default)]
struct GuiCursor(egui::CursorIcon);

fn adopt_context(
    mut contexts: Query<&mut EguiContext, Added<PrimaryEguiContext>>,
    fonts: Option<Res<GuiFonts>>,
    motion: Res<MotionPreference>,
    mut commands: Commands,
) {
    let Ok(mut context) = contexts.single_mut() else {
        return;
    };
    let gui = context.get_mut().clone();
    gui.set_fonts(fonts.map_or_else(design_tokens::builtin_fonts, |fonts| fonts.0.clone()));
    design_tokens::apply(&gui);
    // A window's corner reaches this far past its edge for a resize, which would take the clicks
    // meant for a slot in the window beside it.
    gui.all_styles_mut(|style| {
        style.interaction.resize_grab_radius_corner = style.interaction.resize_grab_radius_side;
    });
    gui.options_mut(|options| options.zoom_with_keyboard = false);
    set_motion(&gui, *motion);
    commands.insert_resource(GuiContext(gui));
}

fn install_fonts(gui: Res<GuiContext>, fonts: Res<GuiFonts>) {
    gui.0.set_fonts(fonts.0.clone());
}

fn apply_motion(gui: Res<GuiContext>, motion: Res<MotionPreference>) {
    set_motion(&gui.0, *motion);
}

fn set_motion(gui: &egui::Context, motion: MotionPreference) {
    let seconds = if motion.reduced {
        0.0
    } else {
        egui::Style::default().animation_time
    };
    gui.all_styles_mut(|style| style.animation_time = seconds);
}

fn forget_world_layers(mut layers: ResMut<WorldLayers>) {
    layers.0.clear();
}

fn read_cursor(
    outputs: Query<&EguiOutput, With<PrimaryEguiContext>>,
    mut cursor: ResMut<GuiCursor>,
) {
    if let Ok(output) = outputs.single() {
        cursor.0 = output.platform_output.cursor_icon;
    }
}
