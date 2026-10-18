use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use design_tokens::{TextRole, color, widgets};
use egui::{Color32, Rect, Response, RichText, Ui};

use crate::core::content::Content;
use crate::core::gui::Band;
use crate::core::text::{self, StyledLine, StyledSpan, TextLook, TextPiece, TextVoice};
use crate::systems::hud::{self, Carried};
use crate::systems::input::map::{self, InputAction, input};
use crate::systems::item::{ItemDef, ItemFlag, ItemId, ItemKind};
use crate::systems::player::session;
use crate::systems::screen::ClientScreen;
use crate::systems::script::condition;
use crate::systems::skill;
use crate::systems::stat::StatKind;
use crate::systems::status;

const WINDOW_KEY: &str = "Item";
const ICON: f32 = 48.0;
const GRANT_ICON: f32 = 24.0;

pub struct ItemCardPlugin;

impl Plugin for ItemCardPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<hud::Pinned<ItemId>>()
            .add_systems(
                Update,
                hud::raise_pinned::<ItemId>(WINDOW_KEY).run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(
                EguiPrimaryContextPass,
                draw_card
                    .in_set(Band::Hud)
                    .run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(OnExit(ClientScreen::Area), hud::forget_pinned::<ItemId>);
    }
}

pub fn open(world: &mut World, item: ItemId) {
    hud::pin(world, item);
}

pub fn close(world: &mut World) -> bool {
    hud::unpin::<ItemId>(world)
}

pub fn showing(world: &World) -> bool {
    hud::pinned::<ItemId>(world).is_some()
}

pub fn layer() -> egui::LayerId {
    hud::window_layer(WINDOW_KEY)
}

pub fn shown(world: &World) -> Option<(ItemId, Rect)> {
    Some((
        hud::pinned::<ItemId>(world)?,
        hud::pinned_rect::<ItemId>(world)?,
    ))
}

/// `response` must sense clicks.
pub fn inspect(world: &mut World, response: Response, item: ItemId) -> Response {
    if map::clicked(world, InputAction::InspectItem, &response) {
        open(world, item);
    }
    tooltip(world, &response, item);
    response
}

pub fn tooltip(world: &World, response: &Response, item: ItemId) {
    let content = world.resource::<Content>().clone();
    let def = item.get(&content);
    let lines = [overview(def)];
    let hint = StyledLine::new(inspect_hint());
    hud::tooltip(response, world, &def.name, &lines, Some(&hint));
}

pub fn overview(def: &ItemDef) -> String {
    let category = def.category().label();
    match &def.kind {
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
        ItemKind::Usable => Some("use"),
        ItemKind::Equipment { .. } => Some("wear"),
        ItemKind::Resource => None,
    }
}

pub fn sheet(ui: &mut Ui, world: &mut World, item: ItemId) {
    let content = world.resource::<Content>().clone();
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
            for (label, color) in tags {
                widgets::pill(ui, label, color);
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
        for (fact, color) in facts(world, item, def) {
            ui.label(RichText::new(fact).color(color));
        }
    });
    grants(ui, world, item);
}

fn draw_card(world: &mut World) {
    hud::draw_pinned::<ItemId>(world, WINDOW_KEY, |ui, world, item| sheet(ui, world, *item));
}

fn grants(ui: &mut Ui, world: &mut World, item: ItemId) {
    let content = world.resource::<Content>().clone();
    let granted = skill::grants_of(&content, item);
    if granted.is_empty() {
        return;
    }
    ui.add_space(4.0);
    ui.label(
        RichText::new("Grants while worn")
            .size(TextRole::Small.size())
            .family(design_tokens::family::medium())
            .color(color::MUTED),
    );
    for &granted in granted {
        let def = granted.get(&content);
        let response = ui
            .horizontal(|ui| {
                hud::icon(ui, world, &def.icon, GRANT_ICON);
                ui.label(&def.name);
                ui.label(
                    RichText::new(def.target.describe())
                        .size(TextRole::Small.size())
                        .color(color::MUTED),
                );
                if def.basic_attack {
                    widgets::pill(ui, skill::card::BASIC_ATTACK_MARK, color::WARN);
                }
            })
            .response
            .interact(egui::Sense::click_and_drag());
        if map::drag_started(world, InputAction::CarryItem, &response) {
            hud::carry(ui.ctx(), Carried::Skill(granted));
        } else if map::clicked(world, InputAction::PinToHotbar, &response) {
            skill::bar::pin(world, skill::HotbarEntry::Skill(granted));
        }
        let hint = StyledLine::new(vec![
            TextPiece::text("Drag it to a slot · "),
            input(InputAction::PinToHotbar),
            TextPiece::text(" puts it on the hotbar"),
        ]);
        skill::card::tooltip(
            &response,
            world,
            &skill::card::of(world, granted),
            Some(&hint),
        );
    }
    if granted.iter().any(|skill| skill.get(&content).basic_attack) {
        ui.label(
            RichText::new(
                "Dropping the item on the basic attack slot picks its first basic attack",
            )
            .size(TextRole::Small.size())
            .color(color::FAINT),
        );
    }
}

fn tags(def: &ItemDef) -> Vec<(&'static str, Color32)> {
    [
        (ItemFlag::Quest, "Quest item", color::WARN),
        (ItemFlag::Bound, "Bound", color::DANGER),
    ]
    .into_iter()
    .filter(|(flag, ..)| def.has(*flag))
    .map(|(_, label, color)| (label, color))
    .collect()
}

fn facts(world: &World, item: ItemId, def: &ItemDef) -> Vec<(String, Color32)> {
    let content = world.resource::<Content>();
    let plain = |fact: String| (fact, color::TEXT);
    let mut facts = Vec::new();
    let boosts = status::boosts_of(content, item);
    match &def.kind {
        ItemKind::Equipment { slot, requires, .. } => {
            facts.push(plain(format!(
                "Worn as your {}",
                slot.label().to_lowercase()
            )));
            facts.extend(boosts.iter().map(|boost| plain(modifier(*boost))));
            let viewer = session::me(world);
            facts.extend(requires.iter().map(|requirement| {
                let color = match viewer.map(|viewer| condition::holds(world, viewer, requirement))
                {
                    Some(true) => color::OK,
                    Some(false) => color::DANGER,
                    None => color::TEXT,
                };
                (
                    format!("Requires {}", condition::describe(content, requirement)),
                    color,
                )
            }));
        }
        ItemKind::Usable => facts.push(plain("Can be used".to_owned())),
        ItemKind::Resource => facts.extend(
            boosts
                .iter()
                .map(|boost| plain(format!("{} while carried", modifier(*boost)))),
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

fn modifier((stat, by): (StatKind, Option<f32>)) -> String {
    let name: &'static str = stat.into();
    match by {
        Some(by) => format!("{by:+} {name}"),
        None => format!("Boosts {name}"),
    }
}
