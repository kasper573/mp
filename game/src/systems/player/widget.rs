use bevy::prelude::*;
use ui::{DragHandle, DragRoot, OnSettle, text_colored};

use crate::systems::actor::Name;
use crate::systems::hud::{BORDER, HudAudience, PANEL_BG, Widget, persist_widget};
use crate::systems::player::{Xp, session};
use crate::systems::stat;

#[derive(Component, Default, Clone)]
struct CharacterText;

pub struct CharacterWidget;

impl Widget for CharacterWidget {
    fn audience(&self) -> HudAudience {
        HudAudience::Players
    }
    fn fallback(&self, _: f32) -> Vec2 {
        Vec2::new(8.0, 8.0)
    }
    fn build(&self, pos: Vec2, id: &'static str) -> Box<dyn Scene> {
        build(pos, id)
    }
    fn sync(&self, world: &mut World) {
        sync_character(world)
    }
}

fn build(pos: Vec2, id: &'static str) -> Box<dyn Scene> {
    let node = Node {
        position_type: PositionType::Absolute,
        left: Val::Px(pos.x),
        top: Val::Px(pos.y),
        width: Val::Px(140.0),
        height: Val::Px(64.0),
        border: UiRect::all(Val::Px(1.0)),
        padding: UiRect::all(Val::Px(6.0)),
        ..default()
    };
    Box::new(bsn! {
        node
        BackgroundColor({PANEL_BG})
        BorderColor::all(BORDER)
        DragRoot
        DragHandle
        ~{OnSettle::new(move |world, geom| persist_widget(world, id, geom))}
        Children [ @{text_colored(String::new(), Color::WHITE)} CharacterText ]
    })
}

// Between areas there is no character for a moment; the panel keeps what it last showed.
fn sync_character(world: &mut World) {
    let Some(text) = character_text(world) else {
        return;
    };
    let mut query = world.query_filtered::<&mut Text, With<CharacterText>>();
    for mut node in query.iter_mut(world) {
        node.0 = text.clone();
    }
}

fn character_text(world: &World) -> Option<String> {
    let me = session::my_character(world)?;
    let entity = me.id();
    let name = me
        .get::<Name>()
        .map_or_else(String::new, |n| n.name.clone());
    let xp = me.get::<Xp>().map_or(0, |x| x.amount);
    let health = stat::current_health(world, entity);
    let max = stat::max_health(world, entity);
    Some(format!("{name}\n{health:.0} / {max:.0}\nxp {xp}"))
}
