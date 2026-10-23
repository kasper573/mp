use bevy::prelude::*;
use ui::egui::{Pos2, Rect, Ui, Vec2};
use ui::face::{self, TextRole};
use ui::{ink, slip};

use crate::core::content::Content;
use crate::systems::actor::Name;
use crate::systems::hud::HudWidget;
use crate::systems::player::{Xp, session};
use crate::systems::{class, stat, status};
use ui::paint;

const WIDTH: f32 = 178.0;
const HEALTH_BAR: Vec2 = Vec2::new(70.0, 6.0);
const MARGIN: f32 = 8.0;

pub struct CharacterWidget;

impl HudWidget for CharacterWidget {
    fn fallback(&self, screen: Rect) -> Pos2 {
        screen.min + Vec2::splat(MARGIN)
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let fresh = character_sheet(world);
        let mut last = world.get_resource_or_init::<LastSheet>();
        if let Some(fresh) = fresh {
            last.0 = Some(fresh);
        }
        let Some(sheet) = last.0.clone() else {
            return;
        };
        slip::show(ui, |ui| {
            ui.set_width(WIDTH - slip::PADDING.sum().x);
            ui.spacing_mut().item_spacing.y = 2.0;
            ui.label(face::bold(sheet.name.as_str()));
            if let Some(class) = &sheet.class {
                ui.label(face::secondary(class.as_str()));
            }
            health(ui, sheet.health, sheet.max_health);
            ui.label(face::secondary(format!("xp {}", sheet.xp)));
            if sheet.points > 0 {
                let plural = if sheet.points == 1 { "" } else { "s" };
                ui.label(
                    TextRole::Body
                        .rich(format!("{} skill point{plural} to spend", sheet.points))
                        .color(ink::OCHRE),
                );
            }
        });
        status::widget::grid(ui, world);
    }
}

// Between areas there is no character for a moment; the slip keeps what it last showed.
#[derive(Resource, Default)]
struct LastSheet(Option<CharacterSheet>);

#[derive(Clone)]
struct CharacterSheet {
    name: String,
    class: Option<String>,
    health: f32,
    max_health: f32,
    xp: u32,
    points: u32,
}

fn health(ui: &mut Ui, current: f32, max: f32) {
    ui.horizontal(|ui| {
        let share = if max > 0.0 { current / max } else { 0.0 };
        paint::progress_line(ui, HEALTH_BAR, share, ink::RUBRIC);
        ui.label(face::body(format!("{current:.0} / {max:.0}")));
    });
}

fn character_sheet(world: &World) -> Option<CharacterSheet> {
    let me = session::my_character(world)?;
    let entity = me.id();
    let content = world.resource::<Content>();
    Some(CharacterSheet {
        name: me
            .get::<Name>()
            .map_or_else(String::new, |n| n.name.clone()),
        class: class::of(world, entity).map(|class| {
            format!(
                "{} · level {}",
                class.get(content).name,
                class::level(world, entity)
            )
        }),
        health: stat::current_health(world, entity),
        max_health: stat::max_health(world, entity),
        xp: me.get::<Xp>().map_or(0, |x| x.amount),
        points: class::points_to_spend(world, entity).0,
    })
}
