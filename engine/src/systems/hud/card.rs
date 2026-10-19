use bevy::prelude::*;
use design_tokens::card::{self, CardResponse};
use design_tokens::motion::{self, CardPose};
use design_tokens::sheet::Depth;
use egui::epaint::Mesh;
use egui::{Id, LayerId, Pos2, Rect, Shape, Ui, Vec2};

use super::panel;
use crate::core::gui::{self, Band, GuiContext};
use crate::systems::interface::InterfaceSound;

const CARD_TOP: f32 = 96.0;
const CARD_MARGIN: f32 = 72.0;
const EDGE_ORIGIN: f32 = 18.0;

/// One thing of a kind inspected at a time, in a card pinned beside the windows until it is
/// closed; opening another of the kind replaces it.
#[derive(Resource)]
pub(crate) struct Pinned<T: Send + Sync + 'static> {
    wanted: Option<T>,
    to_front: bool,
    drawn: Option<Rect>,
    dealt: Option<Dealt>,
    leaving: Option<Leaving<T>>,
}

impl<T: Send + Sync + 'static> Default for Pinned<T> {
    fn default() -> Pinned<T> {
        Pinned {
            wanted: None,
            to_front: false,
            drawn: None,
            dealt: None,
            leaving: None,
        }
    }
}

pub(crate) fn pin<T: PartialEq + Send + Sync + 'static>(
    world: &mut World,
    card: T,
    from: Option<Rect>,
) {
    let mut pinned = world.resource_mut::<Pinned<T>>();
    pinned.to_front = true;
    if pinned.wanted.as_ref() == Some(&card) {
        return;
    }
    let was = pinned.wanted.replace(card);
    pinned.dealt = Some(Dealt { from, since: None });
    let was_shown = was.is_some();
    if let (Some(old), Some(at)) = (was, pinned.drawn) {
        pinned.leaving = Some(Leaving {
            card: old,
            at,
            since: None,
            way: Way::Replaced,
        });
    }
    if !was_shown {
        InterfaceSound::UiOpen.play(world);
    }
}

pub(crate) fn unpin<T: Send + Sync + 'static>(world: &mut World) -> bool {
    let mut pinned = world.resource_mut::<Pinned<T>>();
    let Some(card) = pinned.wanted.take() else {
        return false;
    };
    pinned.dealt = None;
    if let Some(at) = pinned.drawn.take() {
        pinned.leaving = Some(Leaving {
            card,
            at,
            since: None,
            way: Way::Flick,
        });
    }
    InterfaceSound::UiClose.play(world);
    true
}

pub(crate) fn pinned<T: Clone + Send + Sync + 'static>(world: &World) -> Option<T> {
    world.resource::<Pinned<T>>().wanted.clone()
}

/// Where the card stood when last drawn, while it is pinned.
pub(crate) fn pinned_rect<T: Send + Sync + 'static>(world: &World) -> Option<Rect> {
    world.resource::<Pinned<T>>().drawn
}

pub(crate) fn draw_pinned<T: Clone + Send + Sync + 'static>(
    world: &mut World,
    key: &'static str,
    draw: impl Fn(&mut Ui, &mut World, &T, Depth) -> CardResponse,
) {
    let Some(gui) = gui::context(world) else {
        return;
    };
    let now = gui.input(|input| input.time);
    let screen = gui.content_rect();
    let leaving = leaving_pose(world, now);
    let main = panel::layer(key);
    let scratch = LayerId::new(Band::Hud.order(), Id::new(("leaving card", key)));
    let old = leaving.map(|(card, at, pose, way)| {
        let meshes = posed_card(world, &gui, scratch, at, pose, |ui, world| {
            draw(ui, world, &card, Depth::Behind);
        });
        (meshes, way)
    });
    let Some(card) = pinned::<T>(world) else {
        world.resource_mut::<Pinned<T>>().drawn = None;
        if let Some((meshes, _)) = old {
            add_meshes(&gui, scratch, meshes);
        }
        return;
    };
    let start = Pos2::new(
        (screen.right() - card::WIDTH - CARD_MARGIN).max(8.0),
        screen.top() + CARD_TOP,
    );
    let rest = panel::placed_spot(world, &gui, key, start);
    let deal = dealing::<T>(world, now, rest, screen);
    let front = panel::front_sheet(world, &gui) == Some(key);
    let depth = if front { Depth::Front } else { Depth::Behind };
    let shown = egui::Area::new(panel::area_id(key))
        .order(Band::Hud.order())
        .fixed_pos(rest.min)
        .constrain(false)
        .fade_in(false)
        .interactable(deal.is_none())
        .show(&gui, |ui| draw(ui, world, &card, depth));
    let response = shown.inner;
    let drawn = shown.response.rect;
    let mut open = !response.close.is_some_and(|close| close.clicked());
    if deal.is_none() {
        panel::grab_spot(world, key, &response.band, drawn);
    } else {
        open = true;
    }
    if let Some(pose) = deal {
        let new = motion::posed(&gui, main, drawn, pose);
        if let Some((meshes, Way::Replaced)) = old {
            add_meshes(&gui, main, meshes);
        }
        add_meshes(&gui, main, new);
    } else if let Some((meshes, way)) = old {
        let onto = if way == Way::Replaced { main } else { scratch };
        add_meshes(&gui, onto, meshes);
    }
    panel::mark_drawn(world, key);
    world
        .resource_mut::<gui::WidgetRects>()
        .0
        .insert(key.to_owned(), drawn);
    world.resource_mut::<Pinned<T>>().drawn = Some(drawn);
    if !open {
        unpin::<T>(world);
    }
}

// A press brings the area it lands on to the front as its pass ends, and areas brought to the front
// in the same pass keep their order. So the card comes to the front a pass after it was asked for,
// to end up above the window it was asked for from.
pub(crate) fn raise_pinned<T: Send + Sync + 'static>(
    key: &'static str,
) -> impl FnMut(ResMut<Pinned<T>>, Option<Res<GuiContext>>) {
    move |mut pinned, gui| {
        if !pinned.to_front {
            return;
        }
        pinned.to_front = false;
        if let Some(gui) = gui
            && pinned.wanted.is_some()
        {
            gui.0.move_to_top(panel::layer(key));
        }
    }
}

pub(crate) fn forget_pinned<T: Send + Sync + 'static>(mut pinned: ResMut<Pinned<T>>) {
    *pinned = Pinned::default();
}

struct Dealt {
    from: Option<Rect>,
    since: Option<f64>,
}

struct Leaving<T> {
    card: T,
    at: Rect,
    since: Option<f64>,
    way: Way,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Way {
    Flick,
    Replaced,
}

fn leaving_pose<T: Clone + Send + Sync + 'static>(
    world: &mut World,
    now: f64,
) -> Option<(T, Rect, CardPose, Way)> {
    let mut pinned = world.resource_mut::<Pinned<T>>();
    let leaving = pinned.leaving.as_mut()?;
    let since = *leaving.since.get_or_insert(now);
    let seconds = match leaving.way {
        Way::Flick => motion::FLICK_SECS,
        Way::Replaced => motion::DEAL_SECS,
    };
    let t = ((now - since) as f32 / seconds).clamp(0.0, 1.0);
    if t >= 1.0 {
        pinned.leaving = None;
        return None;
    }
    let pose = match leaving.way {
        Way::Flick => motion::flick(t, leaving.at),
        Way::Replaced => motion::replaced(t, leaving.at),
    };
    Some((leaving.card.clone(), leaving.at, pose, leaving.way))
}

fn dealing<T: Send + Sync + 'static>(
    world: &mut World,
    now: f64,
    rest: Rect,
    screen: Rect,
) -> Option<CardPose> {
    let mut pinned = world.resource_mut::<Pinned<T>>();
    let dealt = pinned.dealt.as_mut()?;
    let since = *dealt.since.get_or_insert(now);
    let t = ((now - since) as f32 / motion::DEAL_SECS).clamp(0.0, 1.0);
    if t >= 1.0 {
        pinned.dealt = None;
        return None;
    }
    let from = dealt.from.unwrap_or_else(|| edge_origin(rest, screen));
    Some(motion::deal(t, from, rest))
}

fn edge_origin(rest: Rect, screen: Rect) -> Rect {
    let centre = rest.center();
    let to_left = centre.x - screen.left();
    let to_right = screen.right() - centre.x;
    let x = if to_right <= to_left {
        screen.right() - EDGE_ORIGIN
    } else {
        screen.left() + EDGE_ORIGIN
    };
    Rect::from_center_size(Pos2::new(x, centre.y), Vec2::splat(2.0 * EDGE_ORIGIN))
}

fn posed_card(
    world: &mut World,
    gui: &egui::Context,
    layer: LayerId,
    at: Rect,
    pose: CardPose,
    draw: impl FnOnce(&mut Ui, &mut World),
) -> Vec<Mesh> {
    egui::Area::new(layer.id)
        .order(layer.order)
        .fixed_pos(at.min)
        .constrain(false)
        .fade_in(false)
        .interactable(false)
        .show(gui, |ui| draw(ui, world));
    motion::posed(gui, layer, at, pose)
}

fn add_meshes(gui: &egui::Context, layer: LayerId, meshes: Vec<Mesh>) {
    gui.layer_painter(layer)
        .extend(meshes.into_iter().map(Shape::mesh));
}
