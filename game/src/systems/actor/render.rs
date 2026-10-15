use std::collections::HashMap;

use bevy::prelude::*;
use bevy::sprite::Anchor;

use crate::core::audio::playback::{PlaySfx, SfxPlace};
use crate::core::content::Content;
use crate::core::interpolate::{Interpolate, InterpolatePlugin};
use crate::core::math::Direction;
use crate::core::render::transition::WorldViewSystems;
use crate::core::render::{Animator, RowDepth, atlas_rect, dynamic_z, sprite_transform};
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::{PlaybackRate, Seconds};
use crate::systems::actor::{Action, Actor, ActorModel};
use crate::systems::area::{self, AreaTag};
use crate::systems::movement::RenderPosition;
use crate::systems::screen::ClientScreen;

pub struct ActorPlugin;

impl Plugin for ActorPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CuePlayheads>()
            .add_plugins(InterpolatePlugin::<RenderActor>::default())
            .add_systems(
                Update,
                (attach_sprites, sync_actors, actor_cues)
                    .chain()
                    .in_set(WorldViewSystems)
                    .run_if(in_state(ClientScreen::Area)),
            );
    }
}

pub const ACTOR_ANCHOR: Anchor = Anchor(Vec2::new(0.0, -1.0 / 6.0));

pub fn draw_actor_frame(
    sprite: &mut Sprite,
    model: &ActorModel,
    action: Action,
    dir: Direction,
    elapsed: Seconds,
    attack_rate: PlaybackRate,
) {
    let region = model.frame(action, dir, elapsed, attack_rate);
    let drawn = model.drawn_size(region);
    sprite.rect = Some(atlas_rect(region));
    sprite.custom_size = Some(Vec2::new(drawn.width, drawn.height));
}

/// The facing and animation to render an actor with. The server recomputes these alongside its
/// movement every tick, so they ride the same replication cadence as [`RenderPosition`]: the legs go
/// idle, and the heading turns, as the on-screen motion stops or changes course — not the snapshot
/// earlier they would if read live, which reads as the actor sliding or drifting. Discrete values,
/// so they switch as their segment starts rather than blending. The client's own character, walked
/// ahead of the snapshots, takes them from its own walk.
#[derive(Component, Clone, Copy, PartialEq)]
pub struct RenderActor {
    pub dir: Direction,
    pub action: Action,
}

impl Interpolate for RenderActor {
    type Source = Actor;

    fn sample(actor: &Actor) -> RenderActor {
        RenderActor {
            dir: actor.dir,
            action: actor.action,
        }
    }
}

fn attach_sprites(
    actors: Query<(Entity, &Actor), Without<Sprite>>,
    assets: Res<AssetServer>,
    content: Res<Content>,
    mut commands: Commands,
) {
    for (entity, actor) in &actors {
        let image = assets.load(ActorModel::get(&content, actor.model).sheet().path());
        commands.entity(entity).insert((
            Sprite { image, ..default() },
            ACTOR_ANCHOR,
            Transform::default(),
            RowDepth::default(),
            Visibility::Hidden,
        ));
    }
}

type ActorView = (
    Entity,
    &'static Actor,
    &'static RenderPosition,
    &'static RenderActor,
    &'static AreaTag,
    &'static mut Sprite,
    &'static mut Transform,
    &'static mut RowDepth,
    &'static mut Visibility,
);

fn sync_actors(
    time: Res<Time>,
    content: Res<Content>,
    mut animator: ResMut<Animator>,
    mut actors: Query<ActorView>,
) {
    let clock = Seconds(time.elapsed_secs());
    animator.retain(|entity| actors.contains(entity));
    for (entity, actor, render, pose, tag, mut sprite, mut transform, mut depth, mut visibility) in
        &mut actors
    {
        let elapsed = animator.elapsed(entity, pose.action as u64, clock);
        let model = ActorModel::get(&content, actor.model);
        draw_actor_frame(
            &mut sprite,
            model,
            pose.action,
            pose.dir,
            elapsed,
            actor.attack_rate,
        );
        sprite.color = actor.color.color();
        let area = area::load(&content, tag.area);
        let at = render.0;
        *depth = RowDepth(dynamic_z(area.size.height, area.sort_base(), Tiles(at.y)));
        *transform = sprite_transform(at, depth.0);
        if *visibility == Visibility::Hidden {
            *visibility = Visibility::Inherited;
        }
    }
}

#[derive(Resource, Default)]
struct CuePlayheads(HashMap<Entity, (Action, Seconds)>);

fn actor_cues(
    time: Res<Time>,
    content: Res<Content>,
    mut animator: ResMut<Animator>,
    mut playheads: ResMut<CuePlayheads>,
    actors: Query<(Entity, &Actor, &RenderPosition, &RenderActor, &AreaTag)>,
    mut play: MessageWriter<PlaySfx>,
) {
    let clock = Seconds(time.elapsed_secs());
    playheads.0.retain(|entity, _| actors.contains(*entity));
    for (entity, actor, render, pose, tag) in &actors {
        let at = render.0;
        let now = animator.elapsed(entity, pose.action as u64, clock);
        let Some((was, then)) = playheads.0.insert(entity, (pose.action, now)) else {
            continue;
        };
        let since = (was == pose.action).then_some(then);
        let model = ActorModel::get(&content, actor.model);
        let (cues, stepped) = model.cues(pose.action, pose.dir, since, now, actor.attack_rate);
        for id in cues {
            play.write(PlaySfx {
                id: *id,
                place: SfxPlace::World(at),
            });
        }
        if stepped && let Some(id) = area::load(&content, tag.area).footstep_at(at.cell()) {
            play.write(PlaySfx {
                id: *id,
                place: SfxPlace::World(at),
            });
        }
    }
}
