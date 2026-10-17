use bevy::prelude::*;
use design_tokens::{TextRole, color};
use egui::{Color32, FontId, Pos2, Stroke, Vec2};

use super::{Rank, SkillId, Targeting, UseSkillRequest, using};
use crate::core::content::Content;
use crate::core::geometry::{Footprint, Shape, facing_from};
use crate::core::gui;
use crate::core::math::Pos;
use crate::core::render;
use crate::core::tiling::{TilePos, Tiles};
use crate::systems::actor::{self, Actor};
use crate::systems::input::gestures::{ClickClaim, Cursor, Gesture};
use crate::systems::interface::{CursorShape, InterfaceSound};
use crate::systems::movement;
use crate::systems::player::session;
use crate::systems::skill::Aim;

const OUTLINE_STEPS: usize = 40;

/// The skill a press armed, waiting for the click that aims it.
#[derive(Resource, Default, Clone, Copy, Debug, PartialEq)]
pub struct Aiming(pub Option<Aimed>);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aimed {
    pub skill: SkillId,
    pub rank: Rank,
}

pub fn arm(world: &mut World, skill: SkillId, rank: Rank) {
    world.resource_mut::<Aiming>().0 = Some(Aimed { skill, rank });
    InterfaceSound::UiMove.play(world);
}

pub fn disarm(world: &mut World) -> bool {
    world.resource_mut::<Aiming>().0.take().is_some()
}

pub fn aiming(world: &World) -> Option<Aimed> {
    world.resource::<Aiming>().0
}

pub fn forget(mut aiming: ResMut<Aiming>) {
    aiming.0 = None;
}

/// An armed skill forgets itself once the character stops knowing it.
pub fn settle(world: &mut World) {
    let Some(aimed) = aiming(world) else {
        return;
    };
    let known =
        session::me(world).is_some_and(|me| super::rank_of(world, me, aimed.skill) > Rank::NONE);
    if !known {
        disarm(world);
    }
}

/// Takes the click while a skill is armed: an actor the skill fits, a point for an area, and the
/// bare ground for a single-target skill, which puts the skill away.
pub struct AimGesture;

impl Gesture for AimGesture {
    fn claim(&self, world: &mut World, tile: Option<Pos<Tiles>>) -> Option<ClickClaim> {
        let aimed = aiming(world)?;
        if !session::is_alive(world) {
            return None;
        }
        let tile = tile?;
        let content = world.resource::<Content>().clone();
        let targeting = aimed.skill.get(&content).target;
        match targeting {
            Targeting::SingleAlly | Targeting::SingleEnemy => Some(
                actor_at(world, tile, targeting)
                    .map_or(ClickClaim::AimAt(tile.snap()), ClickClaim::Aim),
            ),
            Targeting::AreaAlly | Targeting::AreaEnemy => Some(ClickClaim::AimAt(tile)),
            Targeting::Caster => None,
        }
    }

    fn drive(&self, world: &mut World, claim: Option<ClickClaim>, start: bool) {
        if !start {
            return;
        }
        let Some(aimed) = aiming(world) else {
            return;
        };
        let content = world.resource::<Content>().clone();
        let aim = match claim {
            Some(ClickClaim::Aim(target)) => Aim::Actor(target),
            Some(ClickClaim::AimAt(point)) if aimed.skill.get(&content).target.aimed_at_point() => {
                Aim::Point(point)
            }
            _ => {
                disarm(world);
                return;
            }
        };
        disarm(world);
        world.write_message(UseSkillRequest {
            skill: aimed.skill,
            aim,
        });
    }

    fn cursor(&self, world: &mut World, claim: ClickClaim) -> Option<Cursor> {
        let aimed = aiming(world)?;
        let hostile = aimed
            .skill
            .get(world.resource::<Content>())
            .target
            .hostile();
        Some(Cursor::Shaped(match claim {
            ClickClaim::Aim(_) if hostile => CursorShape::Attack,
            ClickClaim::Aim(_) => CursorShape::Use,
            _ => CursorShape::Default,
        }))
    }
}

fn actor_at(world: &mut World, point: Pos<Tiles>, targeting: Targeting) -> Option<Entity> {
    let me = session::me(world)?;
    actor::frontmost_at(world, point, None, |world, entity| {
        world.get::<Actor>(entity).is_some() && using::fits(world, me, entity, targeting)
    })
}

/// The armed skill's shape under the pointer, its range around the character and a line saying
/// what a click does.
pub fn draw_aim(world: &mut World) {
    let Some(aimed) = aiming(world) else {
        return;
    };
    let Some(gui) = gui::context(world) else {
        return;
    };
    let Some(me) = session::me(world) else {
        return;
    };
    let content = world.resource::<Content>().clone();
    let def = aimed.skill.get(&content);
    let Some(from) = movement::position(world, me) else {
        return;
    };
    let area = gui::world_area(world, "aim preview");
    let pointer = render::cursor_tile(world);
    let range = super::range_of(world, me, aimed.skill, aimed.rank);
    let mut lines: Vec<(Vec<Pos2>, Color32, f32)> = Vec::new();
    let reach = Footprint {
        at: from,
        facing: facing_from(from, from),
        shape: Shape::Circle { radius: range },
    };
    if let Some(ring) = project(world, &reach.outline(OUTLINE_STEPS)) {
        lines.push((ring, color::WARN.gamma_multiply(0.35), 1.0));
    }
    if let Some(shape) = def.area_at(aimed.rank)
        && let Some(point) = pointer
    {
        let at = match shape {
            Shape::Cone { .. } | Shape::Line { .. } => from,
            Shape::Circle { .. } | Shape::Rect { .. } => point,
        };
        let footprint = Footprint {
            at,
            facing: facing_from(from, point),
            shape,
        };
        if let Some(outline) = project(world, &footprint.outline(OUTLINE_STEPS)) {
            lines.push((outline, color::WARN, 2.0));
        }
        for actor in inside(world, me, &footprint, def.target) {
            if let Some(at) = movement::position(world, actor)
                && let Some(center) = render::tile_to_window(world, at)
            {
                let ring = circle(Pos2::new(center.x, center.y), 14.0);
                lines.push((ring, color::OK, 1.5));
            }
        }
    }
    let label = match def.target {
        Targeting::AreaAlly | Targeting::AreaEnemy => {
            format!("{}: aim, click to cast · Esc cancels", def.name)
        }
        _ => format!("{}: click a target · Esc cancels", def.name),
    };
    let screen = gui.content_rect();
    area.fixed_pos(screen.min).show(&gui, |ui| {
        let painter = ui.painter();
        for (points, colour, width) in lines {
            painter.add(egui::Shape::closed_line(points, Stroke::new(width, colour)));
        }
        let at = gui
            .pointer_latest_pos()
            .map_or(screen.center(), |at| at + Vec2::new(16.0, 18.0));
        let font = FontId::proportional(TextRole::Small.size());
        let galley = painter.layout_no_wrap(label, font, color::TEXT);
        let rect = egui::Rect::from_min_size(at, galley.size() + Vec2::new(10.0, 6.0));
        painter.rect_filled(rect, 4.0, Color32::from_black_alpha(180));
        painter.galley(rect.min + Vec2::new(5.0, 3.0), galley, color::TEXT);
    });
}

fn inside(world: &World, me: Entity, footprint: &Footprint, targeting: Targeting) -> Vec<Entity> {
    let mut query = world.try_query::<(Entity, &crate::systems::movement::Position)>();
    let Some(query) = query.as_mut() else {
        return Vec::new();
    };
    query
        .iter(world)
        .filter(|(entity, at)| {
            *entity != me
                && footprint.contains(at.pos)
                && world.get::<Actor>(*entity).is_some()
                && using::fits(world, me, *entity, targeting)
        })
        .map(|(entity, _)| entity)
        .collect()
}

fn project(world: &mut World, points: &[Pos<Tiles>]) -> Option<Vec<Pos2>> {
    points
        .iter()
        .map(|point| render::tile_to_window(world, *point).map(|at| Pos2::new(at.x, at.y)))
        .collect()
}

fn circle(center: Pos2, radius: f32) -> Vec<Pos2> {
    (0..24)
        .map(|step| {
            let angle = std::f32::consts::TAU * step as f32 / 24.0;
            center + Vec2::new(angle.cos(), angle.sin()) * radius
        })
        .collect()
}
