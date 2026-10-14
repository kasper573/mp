mod attack;
mod default;
mod interact;
mod interface;
mod locked;
mod pickup;
mod walk;

use bevy::prelude::*;
use bevy::window::{CursorIcon, CustomCursor, CustomCursorImage, PrimaryWindow};
use serde::{Deserialize, Serialize};
use strum::VariantArray;

use super::ActiveTileHighlight;
use super::map::{self, InputAction};
use crate::core::content::{Content, Fixture};
use crate::core::math::Pos;
use crate::core::render::transition::WorldViewSystems;
use crate::core::tiling::Tiles;
use crate::systems::interface::CursorShape;
use crate::systems::scene::Scene as GameScene;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub enum ClickClaim {
    Interface,
    Locked,
    Attack(Entity),
    Pickup(Entity),
    Interact(Entity),
    Walk(Pos<Tiles>),
    Nothing,
}

pub fn claim(world: &mut World) -> ClickClaim {
    let gestures = world.resource::<Gestures>().0.clone();
    gestures
        .iter()
        .find_map(|gesture| gesture.claim(world))
        .unwrap_or(ClickClaim::Nothing)
}

pub trait Gesture: Send + Sync {
    fn priority(&self) -> i32;
    fn claim(&self, world: &mut World) -> Option<ClickClaim>;
    fn drive(&self, world: &mut World, start: bool);
    fn cursor(&self, world: &mut World) -> Option<CursorIcon>;
    fn tile_highlight(&self, _world: &mut World) -> Option<ActiveTileHighlight> {
        None
    }
}

static GESTURES: &[&dyn Gesture] = &[
    &attack::AttackGesture,
    &default::DefaultGesture,
    &interact::InteractGesture,
    &interface::InterfaceGesture,
    &locked::LockedGesture,
    &pickup::PickupGesture,
    &walk::WalkGesture,
];

pub fn plugin(app: &mut App) {
    app.add_systems(Startup, setup)
        .add_systems(
            Update,
            load_cursors.run_if(resource_exists_and_changed::<Content>),
        )
        .add_systems(
            Update,
            update
                .in_set(WorldViewSystems)
                .run_if(in_state(GameScene::Area)),
        );
}

#[derive(Resource)]
pub(crate) struct Gestures(pub Vec<&'static dyn Gesture>);

#[derive(Resource, Default)]
struct Latched(Option<GestureIndex>);

#[derive(Resource, Default)]
struct LockSeen(bool);

#[derive(Clone, Copy)]
struct GestureIndex(usize);

#[derive(Resource, Default)]
struct AppliedCursor(Option<CursorIcon>);

// Held for the whole session: a cursor loaded by path on each switch is unloaded as soon as the
// shape changes, and the next switch back finds it missing again.
#[derive(Resource)]
struct CursorImages(Vec<(CursorShape, Handle<Image>)>);

fn load_cursors(content: Res<Content>, assets: Res<AssetServer>, mut commands: Commands) {
    let images = CursorShape::VARIANTS
        .iter()
        .map(|&shape| (shape, assets.load(shape.get(&content).image.path())))
        .collect();
    commands.insert_resource(CursorImages(images));
}

fn setup(mut commands: Commands) {
    let mut gestures: Vec<&'static dyn Gesture> = GESTURES.to_vec();
    gestures.sort_by_key(|gesture| gesture.priority());
    commands.insert_resource(Gestures(gestures));
    commands.init_resource::<Latched>();
    commands.init_resource::<LockSeen>();
    commands.init_resource::<AppliedCursor>();
}

fn update(world: &mut World) {
    let gestures = world.resource::<Gestures>().0.clone();
    forget_clicks_across_lock(world);

    let mut active = world.resource::<Latched>().0;
    let pressed = map::pressed(world, InputAction::Interact);
    let just = map::just_pressed(world, InputAction::Interact);
    // A click pressed and released between two frames arrives as `just` without `pressed`.
    if just {
        active = gestures
            .iter()
            .position(|gesture| gesture.claim(world).is_some())
            .map(GestureIndex);
    } else if !pressed {
        active = None;
    }
    if let Some(GestureIndex(index)) = active {
        gestures[index].drive(world, just);
    }
    world.resource_mut::<Latched>().0 = active.filter(|_| pressed);

    let mut cursor = None;
    let mut highlight = None;
    let mut first_claimant = true;
    for gesture in &gestures {
        if gesture.claim(world).is_none() {
            continue;
        }
        if first_claimant {
            highlight = gesture.tile_highlight(world);
            first_claimant = false;
        }
        cursor = gesture.cursor(world);
        if cursor.is_some() {
            break;
        }
    }

    match highlight {
        Some(highlight) => world.insert_resource(highlight),
        None => {
            world.remove_resource::<ActiveTileHighlight>();
        }
    }
    apply_cursor(world, cursor);
}

fn forget_clicks_across_lock(world: &mut World) {
    let locked = crate::systems::player::session::is_locked(world);
    if std::mem::replace(&mut world.resource_mut::<LockSeen>().0, locked) != locked {
        world.resource_mut::<ButtonInput<MouseButton>>().reset_all();
        world.resource_mut::<Latched>().0 = None;
    }
}

fn apply_cursor(world: &mut World, cursor: Option<CursorIcon>) {
    let Some(cursor) = cursor else {
        return;
    };
    if world.resource::<AppliedCursor>().0.as_ref() == Some(&cursor) {
        return;
    }
    if let CursorIcon::Custom(CustomCursor::Image(image)) = &cursor
        && !world.resource::<Assets<Image>>().contains(&image.handle)
    {
        return;
    }
    world.resource_mut::<AppliedCursor>().0 = Some(cursor.clone());
    if let Ok(window) = world
        .query_filtered::<Entity, With<PrimaryWindow>>()
        .single(world)
    {
        world.entity_mut(window).insert(cursor);
    }
}

pub(crate) fn content_cursor(world: &World, shape: CursorShape) -> CursorIcon {
    let cursor = shape.get(world.resource::<Content>());
    let handle = world
        .get_resource::<CursorImages>()
        .and_then(|images| images.0.iter().find(|(known, _)| *known == shape))
        .map(|(_, handle)| handle.clone())
        .unwrap_or_default();
    CursorIcon::Custom(CustomCursor::Image(CustomCursorImage {
        handle,
        texture_atlas: None,
        flip_x: false,
        flip_y: false,
        rect: None,
        hotspot: (cursor.hotspot.x, cursor.hotspot.y),
    }))
}
