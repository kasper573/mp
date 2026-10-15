pub mod camera;
mod icons;
pub mod present;
pub mod screen;
pub mod transition;

pub use camera::{WorldToWindow, cursor_tile, tile_to_window};
pub use screen::ToScreen;

use std::collections::HashMap;

use bevy::prelude::*;
use bevy::sprite_render::Material2dPlugin;

use crate::core::interpolate::RenderValueSystems;
use crate::core::math::{Pos, Rect as WorldRect, WorldPx};
use crate::core::tiling::Tiles;
use crate::core::time::Seconds;

pub const TILE: WorldPx = WorldPx(16.0);

pub fn sprite_transform(pos: Pos<Tiles>, z: f32) -> Transform {
    Transform::from_translation(pos.to_screen().extend(z))
}

pub fn snap_to_screen(at: Vec2) -> Vec2 {
    (at * present::SCALE).round() / present::SCALE
}

pub fn dynamic_z(area_height: f32, base: f32, y: Tiles) -> f32 {
    base + (y + Tiles(1.0)).ratio(Tiles(area_height + 2.0))
}

/// The depth a sprite sorts by from its row, which `order_rows` turns into the depth it is drawn at.
#[derive(Component, Clone, Copy, Default, PartialEq, Debug)]
pub struct RowDepth(pub f32);

/// Sprites at one depth draw in whatever order the renderer meets them, which changes as entities
/// move between tables. Each is drawn the smallest step f32 allows above its row, and above the
/// sprite before it, in the order of their entities, so sprites sharing a row keep one order and
/// stand in front of scenery whose sort line they share.
pub fn order_rows(mut sprites: Query<(Entity, &RowDepth, &mut Transform)>) {
    let mut rows: Vec<(f32, Entity)> = sprites
        .iter()
        .map(|(entity, depth, _)| (depth.0, entity))
        .collect();
    rows.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut below = f32::NEG_INFINITY;
    for (row, entity) in rows {
        let z = row.next_up().max(below.next_up());
        below = z;
        if let Ok((_, _, mut transform)) = sprites.get_mut(entity) {
            transform.translation.z = z;
        }
    }
}

pub fn atlas_rect(region: WorldRect<WorldPx>) -> Rect {
    Rect::new(
        region.min().x,
        region.min().y,
        region.max().x,
        region.max().y,
    )
}

pub struct RenderPlugin;

impl Plugin for RenderPlugin {
    fn build(&self, app: &mut App) {
        bevy::asset::embedded_asset!(app, "present.wesl");
        app.add_plugins(Material2dPlugin::<present::Present>::default())
            .init_resource::<Animator>()
            .init_resource::<present::ScreenTint>()
            .init_resource::<present::Viewport>()
            .init_resource::<transition::ActiveTransition>()
            .init_resource::<transition::ScreenTransitionPreference>()
            .init_resource::<transition::ScreenTransitionPhase>()
            .configure_sets(
                PreUpdate,
                transition::WorldViewSystems.run_if(not(transition::covering)),
            )
            .configure_sets(
                Update,
                transition::WorldViewSystems
                    .run_if(not(transition::covering))
                    .after(RenderValueSystems),
            )
            .add_systems(Startup, present::setup)
            .add_systems(Update, (present::match_display, present::fit).chain())
            .init_resource::<icons::ResidentIcons>()
            .add_systems(
                PostUpdate,
                (
                    order_rows.before(bevy::transform::TransformSystems::Propagate),
                    present::apply_present.after(bevy::transform::TransformSystems::Propagate),
                ),
            )
            .add_systems(Update, icons::keep_icons_resident);
    }
}

#[derive(Resource, Default)]
pub struct Animator {
    anchors: HashMap<Entity, (u64, Seconds)>,
}

impl Animator {
    pub fn elapsed(&mut self, entity: Entity, state: u64, time: Seconds) -> Seconds {
        match self.anchors.get(&entity) {
            Some(&(seen, start)) if seen == state => time - start,
            _ => {
                self.anchors.insert(entity, (state, time));
                Seconds(0.0)
            }
        }
    }

    pub fn retain(&mut self, mut alive: impl FnMut(Entity) -> bool) {
        self.anchors.retain(|entity, _| alive(*entity));
    }
}
