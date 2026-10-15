use bevy::prelude::*;

use crate::core::audio::playback::{PlaySfx, SfxId, SfxPlace};
use crate::core::content::Content;
use crate::core::math::{Pos, WorldPx};
use crate::core::render::transition::WorldViewSystems;
use crate::core::render::{RowDepth, ToScreen, dynamic_z, sprite_transform};
use crate::core::tiling::Tiles;
use crate::core::time::Seconds;
use crate::systems::area::{self, AreaTag};
use crate::systems::item::{DroppedItem, ItemConsumed, ItemsDropped};
use crate::systems::movement::{Position, RenderPosition};
use crate::systems::screen::ClientScreen;

const DROP_SIZE: WorldPx = WorldPx(12.0);
const DROP_STAGGER: Seconds = Seconds(0.06);
const DROP_DURATION: Seconds = Seconds(0.5);
const DROP_HOP: WorldPx = WorldPx(24.0);
const PENDING_TTL: Seconds = Seconds(0.5);

pub struct ItemsPlugin;

impl Plugin for ItemsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<PendingDrops>()
            .add_observer(attach_drop_sprite)
            .add_systems(
                Update,
                (
                    use_sounds,
                    (recv_drops, start_drops, place_drops, animate_drops)
                        .chain()
                        .in_set(WorldViewSystems),
                )
                    .run_if(in_state(ClientScreen::Area)),
            );
    }
}

#[derive(Component)]
struct DropAnim {
    from: Vec2,
    to: Vec2,
    delay: Seconds,
    elapsed: Seconds,
    drop_sfx: SfxId,
}

#[derive(Resource, Default)]
struct PendingDrops(Vec<Pending>);

struct Pending {
    entity: Entity,
    from: Pos<Tiles>,
    index: usize,
    age: Seconds,
}

fn use_sounds(
    content: Res<Content>,
    mut consumed: MessageReader<ItemConsumed>,
    positions: Query<&RenderPosition>,
    mut play: MessageWriter<PlaySfx>,
) {
    for consumed in consumed.read() {
        let Some(id) = consumed.item.get(&content).sfx.on_use else {
            continue;
        };
        let Ok(position) = positions.get(consumed.actor) else {
            continue;
        };
        play.write(PlaySfx {
            id,
            place: SfxPlace::World(position.0),
        });
    }
}

fn attach_drop_sprite(
    add: On<Add<DroppedItem>>,
    drops: Query<&DroppedItem>,
    content: Res<Content>,
    assets: Res<AssetServer>,
    mut commands: Commands,
) {
    let Ok(dropped) = drops.get(add.entity) else {
        return;
    };
    let image = assets.load(dropped.item.get(&content).icon.path());
    commands.entity(add.entity).insert((
        Sprite {
            image,
            custom_size: Some(Vec2::splat(DROP_SIZE.0)),
            ..default()
        },
        Transform::default(),
        RowDepth::default(),
        Visibility::default(),
    ));
}

fn recv_drops(mut dropped: MessageReader<ItemsDropped>, mut pending: ResMut<PendingDrops>) {
    for dropped in dropped.read() {
        for (index, &entity) in dropped.items.iter().enumerate() {
            pending.0.push(Pending {
                entity,
                from: dropped.from,
                index,
                age: Seconds(0.0),
            });
        }
    }
}

fn start_drops(
    time: Res<Time>,
    content: Res<Content>,
    mut pending: ResMut<PendingDrops>,
    drops: Query<(&DroppedItem, &Position)>,
    mut commands: Commands,
) {
    let dt = Seconds(time.delta_secs());
    pending.0.retain_mut(|drop| match drops.get(drop.entity) {
        Ok((dropped, position)) => {
            commands.entity(drop.entity).insert(DropAnim {
                from: drop.from.to_screen(),
                to: position.pos.to_screen(),
                delay: DROP_STAGGER * drop.index as f32,
                elapsed: Seconds(0.0),
                drop_sfx: dropped.item.get(&content).sfx.drop,
            });
            false
        }
        Err(_) => {
            drop.age += dt;
            drop.age < PENDING_TTL
        }
    });
}

fn place_drops(
    content: Res<Content>,
    mut drops: Query<(&Position, &AreaTag, &mut Transform, &mut RowDepth), With<DroppedItem>>,
) {
    for (position, tag, mut transform, mut depth) in &mut drops {
        *depth = RowDepth(drop_z(&content, tag, position.pos));
        *transform = sprite_transform(position.pos, depth.0);
    }
}

fn animate_drops(
    time: Res<Time>,
    mut drops: Query<(Entity, &Position, &RowDepth, &mut DropAnim, &mut Transform)>,
    mut play: MessageWriter<PlaySfx>,
    mut commands: Commands,
) {
    let dt = Seconds(time.delta_secs());
    for (entity, position, depth, mut anim, mut transform) in &mut drops {
        anim.elapsed += dt;
        let t = (anim.elapsed - anim.delay)
            .ratio(DROP_DURATION)
            .clamp(0.0, 1.0);
        let ground = anim.from.lerp(anim.to, ease_out(t));
        let hop = DROP_HOP.0 * (std::f32::consts::PI * t).sin();
        transform.translation = Vec3::new(ground.x, ground.y + hop, depth.0);
        if anim.elapsed - anim.delay >= DROP_DURATION {
            play.write(PlaySfx {
                id: anim.drop_sfx,
                place: SfxPlace::World(position.pos),
            });
            commands.entity(entity).remove::<DropAnim>();
        }
    }
}

fn drop_z(content: &Content, tag: &AreaTag, pos: Pos<Tiles>) -> f32 {
    let area = area::load(content, tag.area);
    dynamic_z(area.size.height, area.sort_base(), Tiles(pos.y))
}

fn ease_out(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(3)
}
