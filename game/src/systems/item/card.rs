use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use design_tokens::{TextRole, color, widgets};
use egui::{Color32, CursorIcon, Pos2, Rect, Response, RichText, Ui, Vec2};

use crate::core::content::Content;
use crate::core::gui::{self, Band};
use crate::core::text::{self, StyledLine, StyledSpan, TextLook, TextPiece, TextVoice};
use crate::systems::hud;
use crate::systems::input::map::{self, InputAction, input};
use crate::systems::interface::InterfaceSound;
use crate::systems::item::{ItemDef, ItemFlag, ItemId, ItemKind};
use crate::systems::player::session::Viewpoint;
use crate::systems::screen::ClientScreen;
use crate::systems::script::condition;
use crate::systems::stat::Stat;

const WINDOW_KEY: &str = "Item";
const WINDOW_SIZE: Vec2 = Vec2::new(300.0, 360.0);
const WINDOW_TOP: f32 = 96.0;
const WINDOW_MARGIN: f32 = 72.0;
const ICON: f32 = 48.0;

pub struct ItemCardPlugin;

impl Plugin for ItemCardPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ItemCard>()
            .add_systems(Update, chime.run_if(in_state(ClientScreen::Area)))
            .add_systems(
                EguiPrimaryContextPass,
                draw_card
                    .in_set(Band::Hud)
                    .run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(OnExit(ClientScreen::Area), forget);
    }
}

pub fn open(world: &mut World, item: ItemId) {
    world.resource_mut::<ItemCard>().wanted = Some(item);
}

pub fn close(world: &mut World) -> bool {
    world.resource_mut::<ItemCard>().wanted.take().is_some()
}

pub fn shown(world: &World) -> Option<(ItemId, Rect)> {
    world.resource::<ItemCard>().drawn
}

/// `response` must sense clicks.
pub fn inspect(world: &mut World, response: Response, item: ItemId) -> Response {
    if map::clicked(world, InputAction::InspectItem, &response) {
        open(world, item);
    }
    let content = *world.resource::<Content>();
    let def = item.get(&content);
    let lines = [overview(def)];
    let hint = StyledLine::new(inspect_hint());
    response
        .on_hover_cursor(CursorIcon::PointingHand)
        .on_hover_ui(|ui| hud::tooltip(ui, world, &def.name, &lines, Some(&hint)))
}

pub fn overview(def: &ItemDef) -> String {
    let category = def.category().label();
    match &def.kind {
        ItemKind::Consumable { health_bonus, .. } if *health_bonus > 0.0 => {
            format!("{category} · restores {health_bonus} health")
        }
        ItemKind::Equipment { slot, .. } => format!("{category} · {}", slot.label()),
        _ => category.to_owned(),
    }
}

pub fn inspect_hint() -> Vec<TextPiece> {
    vec![
        input(InputAction::InspectItem),
        TextPiece::text(" for more information"),
    ]
}

pub fn use_verb(def: &ItemDef) -> Option<&'static str> {
    match def.kind {
        ItemKind::Consumable { .. } | ItemKind::Usable => Some("use"),
        ItemKind::Equipment { .. } => Some("wear"),
        ItemKind::Resource => None,
    }
}

pub fn sheet(ui: &mut Ui, world: &mut World, item: ItemId) {
    let content = *world.resource::<Content>();
    let def = item.get(&content);
    ui.spacing_mut().item_spacing.y = 8.0;
    ui.horizontal(|ui| {
        hud::icon(ui, world, &def.icon, ICON);
        ui.vertical(|ui| {
            ui.label(RichText::new(def.name.as_str()).font(TextRole::Heading.font_id()));
            ui.label(
                RichText::new(overview(def))
                    .size(TextRole::Small.size())
                    .color(color::MUTED),
            );
        });
    });
    let tags = tags(def);
    if !tags.is_empty() {
        ui.horizontal_wrapped(|ui| {
            for (label, colour) in tags {
                widgets::pill(ui, label, colour);
            }
        });
    }
    if let Some(flavor) = def.flavor() {
        let line = StyledLine::new(vec![
            StyledSpan::plain(flavor.to_owned())
                .voice(TextVoice::Whisper)
                .into(),
        ]);
        let look = TextLook {
            size: TextRole::Prose.size(),
            color: color::TEXT,
        };
        text::show(ui, world, &line, look, None);
    }
    ui.vertical(|ui| {
        ui.spacing_mut().item_spacing.y = 3.0;
        for (fact, colour) in facts(world, def) {
            ui.label(RichText::new(fact).color(colour));
        }
    });
}

#[derive(Resource, Default)]
struct ItemCard {
    wanted: Option<ItemId>,
    heard: Option<ItemId>,
    drawn: Option<(ItemId, Rect)>,
}

fn forget(mut card: ResMut<ItemCard>) {
    *card = ItemCard::default();
}

fn chime(world: &mut World) {
    let card = world.resource::<ItemCard>();
    let sound = match (card.heard, card.wanted) {
        (None, Some(_)) => Some(InterfaceSound::UiOpen),
        (Some(_), None) => Some(InterfaceSound::UiClose),
        _ => None,
    };
    let wanted = card.wanted;
    world.resource_mut::<ItemCard>().heard = wanted;
    if let Some(sound) = sound {
        sound.play(world);
    }
}

fn draw_card(world: &mut World) {
    let Some(item) = world.resource::<ItemCard>().wanted else {
        world.resource_mut::<ItemCard>().drawn = None;
        return;
    };
    let Some(gui) = gui::context(world) else {
        return;
    };
    let content = *world.resource::<Content>();
    let screen = gui.content_rect();
    let fallback = Rect::from_min_size(
        Pos2::new(
            (screen.right() - WINDOW_SIZE.x - WINDOW_MARGIN).max(8.0),
            screen.top() + WINDOW_TOP,
        ),
        WINDOW_SIZE,
    );
    let mut open = true;
    let shown = hud::keyed_window(
        world,
        &gui,
        WINDOW_KEY,
        &item.get(&content).name,
        fallback,
        &mut open,
        |ui, world| {
            egui::ScrollArea::vertical()
                .auto_shrink(false)
                .show(ui, |ui| sheet(ui, world, item));
        },
    );
    world.resource_mut::<ItemCard>().drawn = shown.map(|shown| (item, shown.response.rect));
    if !open {
        close(world);
    }
}

fn tags(def: &ItemDef) -> Vec<(&'static str, Color32)> {
    [
        (ItemFlag::Quest, "Quest item", color::WARN),
        (ItemFlag::Bound, "Bound", color::DANGER),
    ]
    .into_iter()
    .filter(|(flag, ..)| def.has(*flag))
    .map(|(_, label, colour)| (label, colour))
    .collect()
}

fn facts(world: &World, def: &'static ItemDef) -> Vec<(String, Color32)> {
    let content = world.resource::<Content>();
    let plain = |fact: String| (fact, color::TEXT);
    let mut facts = Vec::new();
    match &def.kind {
        ItemKind::Consumable {
            health_bonus,
            lasts,
        } => {
            if *health_bonus > 0.0 {
                facts.push(plain(format!("Restores {health_bonus} health")));
            }
            facts.extend(
                def.stats()
                    .map(|stat| plain(format!("{} for {}s", modifier(stat), lasts.0))),
            );
        }
        ItemKind::Equipment { slot, requires } => {
            facts.push(plain(format!(
                "Worn as your {}",
                slot.label().to_lowercase()
            )));
            facts.extend(def.stats().map(|stat| plain(modifier(stat))));
            let viewer = world.resource::<Viewpoint>().0;
            facts.extend(requires.iter().map(|requirement| {
                let colour = match viewer.map(|viewer| condition::holds(world, viewer, requirement))
                {
                    Some(true) => color::OK,
                    Some(false) => color::DANGER,
                    None => color::TEXT,
                };
                (
                    format!("Requires {}", condition::describe(content, requirement)),
                    colour,
                )
            }));
        }
        ItemKind::Usable => facts.push(plain("Can be used".to_owned())),
        ItemKind::Resource => facts.extend(
            def.stats()
                .map(|stat| plain(format!("{} while carried", modifier(stat)))),
        ),
    }
    match def.stack_max() {
        1 => {}
        u32::MAX => facts.push(plain("Stacks without limit".to_owned())),
        max => facts.push(plain(format!("Stacks up to {max}"))),
    }
    if def.bound() {
        facts.push(plain("Can't be sold or dropped".to_owned()));
    }
    facts
}

fn modifier(stat: Stat) -> String {
    format!("{:+} {}", stat.value, stat.label())
}
