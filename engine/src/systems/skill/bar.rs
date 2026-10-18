use std::collections::BTreeMap;

use bevy::prelude::*;
use design_tokens::glyph::{self, Mark};
use design_tokens::{TextRole, ink, slip};
use egui::{Align2, Pos2, Rect, Sense, Stroke, StrokeKind, Ui, Vec2};
use serde::{Deserialize, Serialize};
use strum::VariantArray;

use super::card;
use super::{
    AssignBasicAttackRequest, AssignHotbarRequest, BasicAttack, Cooldowns, Hotbar, HotbarEntry,
    HotbarSlot, Rank, SkillId, SkillKind, Targeting, UseSkillRequest, casting,
};
use crate::core::content::{Content, Fixture};
use crate::core::text::{StyledLine, TextPiece};
use crate::core::time::Seconds;
use crate::systems::equipment::Equipment;
use crate::systems::hud::{self, Carried, Confirm, GripCorner, HudWidget};
use crate::systems::input::map::{
    self, InputAction, InputBinding, InputMap, KeyGesture, KeyModifiers, input,
};
use crate::systems::interface::InterfaceSound;
use crate::systems::item::widget::{SLOT, SlotLook, slot};
use crate::systems::item::{Inventory, ItemId, ItemKind, UseItemRequest, card as item_card};
use crate::systems::notification;
use crate::systems::player::session;
use crate::systems::reach::Engaged;
use crate::systems::script::condition;
use crate::systems::settings::{HotbarKey, HotbarShape, UserSettings};
use crate::systems::skill::{CastAim, aim};
use crate::systems::stat;

pub const HOTBAR_KEYS: [InputAction; 9] = [
    InputAction::Hotbar1,
    InputAction::Hotbar2,
    InputAction::Hotbar3,
    InputAction::Hotbar4,
    InputAction::Hotbar5,
    InputAction::Hotbar6,
    InputAction::Hotbar7,
    InputAction::Hotbar8,
    InputAction::Hotbar9,
];

pub const HOTBAR: &str = "hotbar";
const GAP: f32 = 4.0;
const PITCH: f32 = SLOT + GAP;
const BASIC_ATTACK_GAP: f32 = 8.0;
const BOTTOM: f32 = 8.0;
const PRESS_MARK_SECONDS: f32 = 0.6;

pub struct HotbarWidget;

impl HudWidget for HotbarWidget {
    fn fallback(&self, screen: Rect) -> Pos2 {
        let width = SLOT + BASIC_ATTACK_GAP + HotbarShape::DEFAULT.columns as f32 * PITCH - GAP
            + slip::PADDING.sum().x;
        Pos2::new(
            screen.center().x - width / 2.0,
            screen.bottom() - (SLOT + slip::PADDING.sum().y) - BOTTOM,
        )
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let shape = shown_shape(world, ui.ctx());
        let framed = slip::show(ui, |ui| {
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing = Vec2::splat(GAP);
                basic_attack_slot(ui, world);
                ui.add_space(BASIC_ATTACK_GAP - GAP);
                egui::Grid::new("hotbar grid")
                    .spacing(Vec2::splat(GAP))
                    .show(ui, |ui| {
                        for row in 0..shape.rows {
                            for column in 0..shape.columns {
                                hotbar_slot(ui, world, HotbarSlot(row * shape.columns + column));
                            }
                            ui.end_row();
                        }
                    });
            });
        });
        let outer = framed.response.rect;
        let corner = if outer.max.y + PITCH > ui.ctx().content_rect().bottom() {
            GripCorner::TopRight
        } else {
            GripCorner::BottomRight
        };
        let grip = hud::slip_grip(ui, ui.id().with("hotbar grip"), outer, corner);
        resize(world, ui, &grip, outer, corner);
        rebind_panel(ui, world, outer);
    }
}

#[derive(Resource, Default)]
pub struct BarState {
    rebinding: Option<HotbarSlot>,
    resizing: Option<Resizing>,
    presses: BTreeMap<HotbarSlot, Press>,
}

/// How a press on a slot went: what it held was used, or the press was refused, by the slot's own
/// state or by what the use ran into.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotbarPress {
    Used,
    Denied,
}

/// What each shown slot holds and how it is drawn, for whoever probes the client.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SlotReport {
    pub entry: HotbarEntry,
    pub key: Option<String>,
    pub cooling: bool,
    pub blocked: bool,
    pub dimmed: bool,
    /// Waiting for the next key pressed to become its key.
    pub rebinding: bool,
    /// How the last press on the slot went, if it was ever pressed.
    pub pressed: Option<HotbarPress>,
}

/// Puts something on the first free slot of the bar as it is shown, or says the bar is full.
pub fn pin(world: &mut World, entry: HotbarEntry) {
    let Some(me) = session::me(world) else {
        return;
    };
    let shown = world.resource::<UserSettings>().hotbar_shape().slots();
    let free = world
        .get::<Hotbar>(me)
        .map_or(Some(HotbarSlot(0)), |hotbar| hotbar.first_free(shown));
    match free {
        Some(slot) => {
            world.write_message(AssignHotbarRequest { slot, entry });
            InterfaceSound::UiPick.play(world);
        }
        None => notification::local_error(world, "No free slot on the hotbar"),
    }
}

pub fn pin_bag_slot(world: &mut World, slot: u32) {
    let Some(item) = bag_item(world, slot) else {
        return;
    };
    pin(world, HotbarEntry::Item(item));
}

/// Takes the key a rebind waits on. It runs whether or not the interface claims the keyboard:
/// the menu button that started the rebind keeps egui's focus for the frame after its click.
pub fn capture_key(world: &mut World) {
    if let Some(slot) = world.resource::<BarState>().rebinding {
        capture(world, slot);
    }
}

/// Fires the slot a key was pressed for.
pub fn keys(world: &mut World) {
    if world.resource::<BarState>().rebinding.is_some() {
        return;
    }
    if session::is_locked(world) || !session::is_alive(world) || hud::confirming(world) {
        return;
    }
    let Some(me) = session::me(world) else {
        return;
    };
    let shape = world.resource::<UserSettings>().hotbar_shape();
    let pressed = (0..shape.slots())
        .map(HotbarSlot)
        .find(|slot| key_pressed(world, *slot));
    let Some(slot) = pressed else {
        return;
    };
    let entry = world
        .get::<Hotbar>(me)
        .map_or(HotbarEntry::Empty, |hotbar| hotbar.entry(slot));
    press(world, slot, entry);
}

pub fn cancel_rebind(world: &mut World) -> bool {
    world.resource_mut::<BarState>().rebinding.take().is_some()
}

/// Uses what a slot holds: a skill is cast or aimed, an item is used from the bag. A slot drawn as
/// cooling or blocked counts its press as denied whatever the use comes to.
pub fn fire(world: &mut World, entry: HotbarEntry) -> HotbarPress {
    let ready = matches!(SlotView::of(world, entry).fill, Fill::Ready);
    let used = match entry {
        HotbarEntry::Empty => false,
        HotbarEntry::Skill(skill) => use_skill(world, skill),
        HotbarEntry::Item(item) => use_item(world, item),
    };
    if used && ready {
        HotbarPress::Used
    } else {
        HotbarPress::Denied
    }
}

/// An entry let go of anywhere but a slot leaves the bar, once the player agrees. A slot that took
/// the drop has cleared what was carried by now.
pub fn drop_off_bar(world: &mut World) {
    let Some(gui) = world
        .get_resource::<crate::core::gui::GuiContext>()
        .map(|gui| gui.0.clone())
    else {
        return;
    };
    let Some(Carried::HotbarEntry { from, entry }) = hud::carried(&gui) else {
        return;
    };
    if !gui.input(|input| input.pointer.any_released()) {
        return;
    }
    let content = world.resource::<Content>().clone();
    let name = entry_name(&content, entry);
    hud::confirm(
        world,
        Confirm {
            title: format!("Take {name} off the hotbar?"),
            body: vec!["It stays in your tree or your bag; only the slot empties.".to_owned()],
            confirm: "Take off".to_owned(),
            cancel: "Keep".to_owned(),
            answer: Box::new(move |world, taken| {
                if taken {
                    world.write_message(AssignHotbarRequest {
                        slot: from,
                        entry: HotbarEntry::Empty,
                    });
                }
            }),
        },
    );
}

pub fn forget(mut state: ResMut<BarState>) {
    *state = BarState::default();
}

pub fn report(world: &World) -> Vec<SlotReport> {
    let shape = world.resource::<UserSettings>().hotbar_shape();
    let hotbar = session::my_character(world)
        .and_then(|me| me.get::<Hotbar>())
        .cloned()
        .unwrap_or_default();
    (0..shape.slots())
        .map(HotbarSlot)
        .map(|slot| {
            let entry = hotbar.entry(slot);
            let view = SlotView::of(world, entry);
            let state = world.resource::<BarState>();
            SlotReport {
                entry,
                key: key_name(world, slot),
                cooling: matches!(view.fill, Fill::Cooling { .. }),
                blocked: matches!(view.fill, Fill::Blocked(_)),
                dimmed: view.dimmed,
                rebinding: state.rebinding == Some(slot),
                pressed: state.presses.get(&slot).map(|press| press.outcome),
            }
        })
        .collect()
}

pub fn entry_name(content: &Content, entry: HotbarEntry) -> String {
    match entry {
        HotbarEntry::Empty => "nothing".to_owned(),
        HotbarEntry::Skill(skill) => skill.get(content).name.clone(),
        HotbarEntry::Item(item) => item.get(content).name.clone(),
    }
}

#[derive(Clone, Copy)]
struct Press {
    outcome: HotbarPress,
    since: Seconds,
}

#[derive(Clone, Copy)]
struct Resizing {
    from: HotbarShape,
    grab: Pos2,
    corner: GripCorner,
}

/// How a slot is drawn over its icon: free, draining while a cooldown runs, or held under a
/// hatched fill with the glyph of what blocks it.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Fill {
    Ready,
    Cooling { fraction: f32, left: Seconds },
    Blocked(Glyph),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Glyph {
    Lock,
    Zero,
    Cross,
}

struct SlotView {
    icon: Option<crate::core::assets::AssetRef>,
    count: u32,
    dimmed: bool,
    fill: Fill,
    name: String,
}

impl SlotView {
    fn empty() -> SlotView {
        SlotView {
            icon: None,
            count: 0,
            dimmed: false,
            fill: Fill::Ready,
            name: "empty".to_owned(),
        }
    }

    fn of(world: &World, entry: HotbarEntry) -> SlotView {
        let content = world.resource::<Content>();
        let Some(me) = session::me(world) else {
            return SlotView::empty();
        };
        match entry {
            HotbarEntry::Empty => SlotView::empty(),
            HotbarEntry::Skill(skill) => {
                let def = skill.get(content);
                let rank = super::rank_of(world, me, skill);
                SlotView {
                    icon: Some(def.icon.clone()),
                    count: 0,
                    dimmed: rank == Rank::NONE,
                    fill: skill_fill(world, me, skill, rank),
                    name: def.name.clone(),
                }
            }
            HotbarEntry::Item(item) => {
                let def = item.get(content);
                let held = world
                    .get::<Inventory>(me)
                    .map_or(0, |inventory| inventory.count(item));
                let worn = wears(world, me, item);
                SlotView {
                    icon: Some(def.icon.clone()),
                    count: held,
                    dimmed: held == 0 && !worn,
                    fill: if held == 0 && !worn {
                        Fill::Blocked(Glyph::Zero)
                    } else {
                        Fill::Ready
                    },
                    name: def.name.clone(),
                }
            }
        }
    }
}

fn wears(world: &World, me: Entity, item: ItemId) -> bool {
    world
        .get::<Equipment>(me)
        .is_some_and(|equipment| equipment.slots.values().any(|worn| *worn == item))
}

fn bag_item(world: &World, slot: u32) -> Option<ItemId> {
    session::my_character(world)
        .and_then(|me| me.get::<Inventory>())
        .and_then(|inventory| inventory.slots.get(slot as usize))
        .map(|stack| stack.item)
}

fn skill_fill(world: &World, me: Entity, skill: SkillId, rank: Rank) -> Fill {
    let content = world.resource::<Content>();
    let def = skill.get(content);
    if stat::is_dead(world, me) {
        return Fill::Blocked(Glyph::Cross);
    }
    if let Some(now) = session::server_now(world)
        && let Some(ready) = world
            .get::<Cooldowns>(me)
            .and_then(|cooldowns| cooldowns.ready_at(skill))
        && ready > now
    {
        let left = ready.since(now);
        let whole = def
            .cooldown_at(rank.max(Rank::FIRST))
            .0
            .max(left.0)
            .max(0.001);
        return Fill::Cooling {
            fraction: (left.0 / whole).clamp(0.0, 1.0),
            left,
        };
    }
    if condition::first_unmet(world, me, def.requires.iter()).is_some() {
        return Fill::Blocked(Glyph::Lock);
    }
    let bag = world.get::<Inventory>(me);
    if def
        .cost
        .iter()
        .any(|stack| bag.map_or(0, |bag| bag.count(stack.item)) < stack.count)
    {
        return Fill::Blocked(Glyph::Zero);
    }
    Fill::Ready
}

fn hotbar_slot(ui: &mut Ui, world: &mut World, index: HotbarSlot) {
    let content = world.resource::<Content>().clone();
    let entry = session::my_character(world)
        .and_then(|me| me.get::<Hotbar>())
        .map_or(HotbarEntry::Empty, |hotbar| hotbar.entry(index));
    let view = SlotView::of(world, entry);
    let rebinding = world.resource::<BarState>().rebinding == Some(index);
    let carried = hud::carried(ui.ctx());
    let ghost = matches!(carried, Some(Carried::HotbarEntry { from, .. }) if from == index);
    let look = SlotLook {
        icon: view.icon.as_ref(),
        count: view.count,
        faded: view.dimmed || ghost,
        ..SlotLook::EMPTY
    };
    let response = slot(ui, world, look, Sense::click_and_drag());
    if carried.is_some() && response.contains_pointer() {
        drop_wash(ui, response.rect);
    }
    if let Some(key) = key_name(world, index) {
        slot_key_mark(ui, response.rect, &key);
    }
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            true,
            format!("Hotbar slot {}: {}", index.number(), view.name),
        )
    });
    overlay(ui, response.rect, view.fill);
    press_mark(ui, world, index, response.rect);
    if rebinding {
        ui.painter()
            .rect_filled(response.rect, 3.0, ink::wash(ink::CREAM, 0.85));
        ui.painter().rect_stroke(
            response.rect,
            3.0,
            Stroke::new(2.0, ink::GOLD),
            StrokeKind::Inside,
        );
        ui.painter().text(
            response.rect.center(),
            Align2::CENTER_CENTER,
            "key?",
            TextRole::KeyHint.font_id(),
            ink::INK,
        );
    }
    take_drop(world, &response, index, entry);
    if map::clicked(world, InputAction::PinToHotbar, &response) {
        if entry != HotbarEntry::Empty {
            world.write_message(AssignHotbarRequest {
                slot: index,
                entry: HotbarEntry::Empty,
            });
        }
    } else if response.clicked() {
        press(world, index, entry);
    } else if map::drag_started(world, InputAction::CarryItem, &response)
        && entry != HotbarEntry::Empty
    {
        hud::carry(ui.ctx(), Carried::HotbarEntry { from: index, entry });
    }
    response.context_menu(|ui| {
        if ui.button("Rebind key").clicked() {
            world.resource_mut::<BarState>().rebinding = Some(index);
            ui.close();
        }
        if ui
            .add_enabled(entry != HotbarEntry::Empty, egui::Button::new("Clear slot"))
            .clicked()
        {
            world.write_message(AssignHotbarRequest {
                slot: index,
                entry: HotbarEntry::Empty,
            });
            ui.close();
        }
        ui.separator();
        ui.label(
            TextRole::Small
                .rich(format!(
                    "{} · {}",
                    entry_name(&content, entry),
                    key_name(world, index).unwrap_or_else(|| "no key".to_owned())
                ))
                .color(ink::INK3),
        );
    });
    slot_tooltip(world, &response, index, entry);
}

fn basic_attack_slot(ui: &mut Ui, world: &mut World) {
    let content = world.resource::<Content>().clone();
    let held = session::my_character(world)
        .and_then(|me| me.get::<BasicAttack>())
        .and_then(|slot| slot.0);
    let entry = held.map_or(HotbarEntry::Empty, HotbarEntry::Skill);
    let view = SlotView::of(world, entry);
    let carried =
        hud::carried(ui.ctx()).and_then(|carried| carried_skill(world, &content, carried));
    let look = SlotLook {
        icon: view.icon.as_ref(),
        faded: view.dimmed,
        ..SlotLook::EMPTY
    };
    let response = slot(ui, world, look, Sense::click_and_drag());
    if let Some(skill) = carried
        && response.contains_pointer()
    {
        if skill.get(&content).basic_attack {
            drop_wash(ui, response.rect);
        } else {
            glyph::hatch(ui.painter(), response.rect.shrink(1.0), ink::ink_wash(0.45));
        }
    }
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            true,
            format!("Basic attack slot: {}", view.name),
        )
    });
    overlay(ui, response.rect, view.fill);
    if let Some(skill) =
        hud::dropped(&response).and_then(|dropped| carried_skill(world, &content, dropped))
    {
        if skill.get(&content).basic_attack {
            world.write_message(AssignBasicAttackRequest { skill: Some(skill) });
            InterfaceSound::UiPick.play(world);
        } else {
            notification::local_error(
                world,
                format!("{} can't be a basic attack", skill.get(&content).name),
            );
        }
    }
    if map::clicked(world, InputAction::PinToHotbar, &response) {
        if held.is_some() {
            world.write_message(AssignBasicAttackRequest { skill: None });
        }
    } else if map::drag_started(world, InputAction::CarryItem, &response)
        && let Some(skill) = held
    {
        hud::carry(ui.ctx(), Carried::Skill(skill));
    }
    response.context_menu(|ui| {
        if ui
            .add_enabled(held.is_some(), egui::Button::new("Clear"))
            .clicked()
        {
            world.write_message(AssignBasicAttackRequest { skill: None });
            ui.close();
        }
    });
    match held {
        Some(skill) => {
            let hint = StyledLine::new(vec![
                TextPiece::text("Click an enemy to use it · drag a basic-attack skill here · "),
                input(InputAction::PinToHotbar),
                TextPiece::text(" or right-click clears it"),
            ]);
            card::tooltip(&response, world, &card::of(world, skill), Some(&hint));
        }
        None => hud::tooltip(
            &response,
            world,
            "Basic attack · empty",
            &["Wear a weapon that has one, or drag one here".to_owned()],
            None,
        ),
    }
}

/// The skill a drag over the basic attack slot would put there: a skill carried as itself or on a
/// hotbar entry, or the first flagged skill a carried weapon grants.
fn carried_skill(world: &World, content: &Content, carried: Carried) -> Option<SkillId> {
    match carried {
        Carried::Skill(skill) => Some(skill),
        Carried::BagSlot(slot) => weapon_attack(content, bag_item(world, slot)?),
        Carried::HotbarEntry { entry, .. } => match entry {
            HotbarEntry::Skill(skill) => Some(skill),
            HotbarEntry::Item(item) => weapon_attack(content, item),
            HotbarEntry::Empty => None,
        },
    }
}

fn weapon_attack(content: &Content, item: ItemId) -> Option<SkillId> {
    super::grants_of(content, item)
        .iter()
        .copied()
        .find(|skill| skill.get(content).basic_attack)
        .or_else(|| super::grants_of(content, item).first().copied())
}

fn take_drop(world: &mut World, response: &egui::Response, index: HotbarSlot, held: HotbarEntry) {
    let Some(dropped) = hud::dropped(response) else {
        return;
    };
    match dropped {
        Carried::Skill(skill) => {
            world.write_message(AssignHotbarRequest {
                slot: index,
                entry: HotbarEntry::Skill(skill),
            });
        }
        Carried::BagSlot(slot) => {
            let Some(item) = bag_item(world, slot) else {
                return;
            };
            world.write_message(AssignHotbarRequest {
                slot: index,
                entry: HotbarEntry::Item(item),
            });
        }
        Carried::HotbarEntry { from, entry } => {
            if from == index {
                return;
            }
            world.write_message(AssignHotbarRequest { slot: index, entry });
            world.write_message(AssignHotbarRequest {
                slot: from,
                entry: held,
            });
        }
    }
    InterfaceSound::UiPick.play(world);
}

fn slot_tooltip(
    world: &mut World,
    response: &egui::Response,
    index: HotbarSlot,
    entry: HotbarEntry,
) {
    let key = key_name(world, index);
    let key_line = key.map_or_else(
        || "No key · right-click to bind one".to_owned(),
        |key| format!("Key {key} · right-click for options"),
    );
    match entry {
        HotbarEntry::Empty => hud::tooltip(
            response,
            world,
            &format!("Slot {}", index.number()),
            &["Empty · drag a skill or an item here".to_owned(), key_line],
            None,
        ),
        HotbarEntry::Skill(skill) => {
            let hint = StyledLine::new(vec![
                TextPiece::text(format!("{key_line} · ")),
                input(InputAction::PinToHotbar),
                TextPiece::text(" takes it off the bar"),
            ]);
            card::tooltip(response, world, &card::of(world, skill), Some(&hint));
        }
        HotbarEntry::Item(item) => {
            let content = world.resource::<Content>().clone();
            let def = item.get(&content);
            let hint = StyledLine::new(vec![
                TextPiece::text(format!("{key_line} · ")),
                input(InputAction::PinToHotbar),
                TextPiece::text(" takes it off the bar"),
            ]);
            let lines = [item_card::overview(def), item_use_line(def)];
            hud::tooltip(response, world, &def.name, &lines, Some(&hint));
        }
    }
}

fn item_use_line(def: &crate::systems::item::ItemDef) -> String {
    match def.kind {
        ItemKind::Usable => "The key uses one".to_owned(),
        ItemKind::Equipment { .. } => "The key wears it".to_owned(),
        ItemKind::Resource => "Counts what you carry".to_owned(),
    }
}

fn overlay(ui: &Ui, rect: Rect, fill: Fill) {
    let painter = ui.painter();
    match fill {
        Fill::Ready => {}
        Fill::Cooling { fraction, left } => {
            let height = rect.height() * fraction;
            let wash = Rect::from_min_max(Pos2::new(rect.min.x, rect.max.y - height), rect.max);
            painter.rect_filled(wash.shrink(1.0), 2.0, ink::wash(ink::RUBRIC, 0.45));
            if fraction > 0.02 {
                for offset in [
                    Vec2::new(-1.0, 0.0),
                    Vec2::new(1.0, 0.0),
                    Vec2::new(0.0, 1.0),
                ] {
                    painter.text(
                        rect.center() + offset,
                        Align2::CENTER_CENTER,
                        cooldown_text(left),
                        TextRole::Count.font_id(),
                        ink::CREAM,
                    );
                }
                painter.text(
                    rect.center(),
                    Align2::CENTER_CENTER,
                    cooldown_text(left),
                    TextRole::Count.font_id(),
                    ink::INK,
                );
            }
        }
        Fill::Blocked(blocked) => {
            painter.rect_filled(rect.shrink(1.0), 2.0, ink::wash(ink::CREAM, 0.55));
            glyph::hatch(painter, rect.shrink(1.0), ink::ink_wash(0.3));
            match blocked {
                Glyph::Lock => glyph::padlock(painter, rect.center(), 11.0, ink::INK2),
                Glyph::Zero => {
                    painter.text(
                        rect.right_bottom() - Vec2::new(3.0, 1.0),
                        Align2::RIGHT_BOTTOM,
                        "0",
                        TextRole::Count.font_id(),
                        ink::RUBRIC,
                    );
                }
                Glyph::Cross => glyph::paint(
                    painter,
                    Mark::Cross,
                    Rect::from_center_size(rect.center(), Vec2::splat(14.0)),
                    ink::RUBRIC,
                ),
            }
        }
    }
}

fn press_mark(ui: &Ui, world: &World, slot: HotbarSlot, rect: Rect) {
    let Some(press) = world.resource::<BarState>().presses.get(&slot) else {
        return;
    };
    if (uptime(world) - press.since).0 >= PRESS_MARK_SECONDS {
        return;
    }
    let color = match press.outcome {
        HotbarPress::Used => ink::GOLD,
        HotbarPress::Denied => ink::RUBRIC,
    };
    ui.painter()
        .rect_stroke(rect, 3.0, Stroke::new(2.0, color), StrokeKind::Outside);
}

fn drop_wash(ui: &Ui, rect: Rect) {
    ui.painter().rect(
        rect,
        3.0,
        ink::gold_wash(0.28),
        Stroke::new(1.0, ink::OCHRE),
        StrokeKind::Inside,
    );
}

fn slot_key_mark(ui: &Ui, rect: Rect, key: &str) {
    let at = rect.left_top() + Vec2::new(3.0, 1.0);
    for offset in [
        Vec2::new(-1.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 1.0),
    ] {
        ui.painter().text(
            at + offset,
            Align2::LEFT_TOP,
            key,
            TextRole::Launcher.font_id(),
            ink::CREAM,
        );
    }
    ui.painter().text(
        at,
        Align2::LEFT_TOP,
        key,
        TextRole::Launcher.font_id(),
        ink::INK2,
    );
}

fn uptime(world: &World) -> Seconds {
    Seconds(world.resource::<Time>().elapsed_secs())
}

fn press(world: &mut World, slot: HotbarSlot, entry: HotbarEntry) {
    let outcome = fire(world, entry);
    let since = uptime(world);
    world
        .resource_mut::<BarState>()
        .presses
        .insert(slot, Press { outcome, since });
}

fn cooldown_text(left: Seconds) -> String {
    if left.0 >= 60.0 {
        format!("{}m", (left.0 / 60.0).ceil() as u32)
    } else {
        format!("{}", left.0.ceil().max(1.0) as u32)
    }
}

/// Whether the skill was asked for, armed or cast; not whether the server then performs it.
fn use_skill(world: &mut World, skill: SkillId) -> bool {
    let Some(me) = session::me(world) else {
        return false;
    };
    let content = world.resource::<Content>().clone();
    let def = skill.get(&content);
    let rank = super::rank_of(world, me, skill);
    if rank == Rank::NONE {
        notification::local_error(world, format!("You don't know {}", def.name));
        return false;
    }
    if def.kind == SkillKind::Passive {
        notification::local_error(
            world,
            format!("{} is passive: it holds on its own", def.name),
        );
        return false;
    }
    match def.target {
        Targeting::Caster => {
            world.write_message(UseSkillRequest {
                skill,
                aim: CastAim::None,
            });
            true
        }
        Targeting::SingleAlly | Targeting::SingleEnemy => {
            let engaged = world
                .get::<Engaged>(me)
                .map(|engaged| engaged.0)
                .filter(|target| casting::fits(world, me, *target, def.target));
            match engaged {
                Some(target) => {
                    world.write_message(UseSkillRequest {
                        skill,
                        aim: CastAim::Actor(target),
                    });
                    true
                }
                None => aim_or_cast(world, skill, rank),
            }
        }
        Targeting::AreaAlly | Targeting::AreaEnemy => aim_or_cast(world, skill, rank),
    }
}

fn aim_or_cast(world: &mut World, skill: SkillId, rank: Rank) -> bool {
    if world.resource::<UserSettings>().quick_cast() {
        aim::cast_at_pointer(world, skill)
    } else {
        aim::arm(world, skill, rank);
        true
    }
}

/// Whether a use of the item was asked for.
fn use_item(world: &mut World, item: ItemId) -> bool {
    let Some(me) = session::me(world) else {
        return false;
    };
    let content = world.resource::<Content>().clone();
    let def = item.get(&content);
    if matches!(def.kind, ItemKind::Resource) {
        return false;
    }
    let bag_slot = world
        .get::<Inventory>(me)
        .and_then(|inventory| inventory.slots.iter().position(|stack| stack.item == item));
    match bag_slot {
        Some(slot) => {
            world.write_message(UseItemRequest { slot: slot as u32 });
            true
        }
        None if wears(world, me, item) => {
            notification::local_error(world, format!("{} is worn already", def.name));
            false
        }
        None => {
            notification::local_error(world, format!("No {} left", def.name));
            false
        }
    }
}

/// The key a slot answers to, once the setting is resolved: the game's own action for the slot,
/// or a gesture the player chose.
#[derive(Clone, Copy)]
enum SlotKey {
    Action(InputAction),
    Gesture(KeyGesture),
}

fn slot_key(settings: &UserSettings, slot: HotbarSlot) -> Option<SlotKey> {
    match settings.hotbar_key(slot) {
        HotbarKey::Default => HOTBAR_KEYS.get(slot.index()).copied().map(SlotKey::Action),
        HotbarKey::Unbound => None,
        HotbarKey::Custom(gesture) => Some(SlotKey::Gesture(gesture)),
    }
}

fn key_name(world: &World, slot: HotbarSlot) -> Option<String> {
    match slot_key(world.resource::<UserSettings>(), slot)? {
        SlotKey::Action(action) => world.resource::<InputMap>().name(action),
        SlotKey::Gesture(gesture) => Some(InputBinding::Key(gesture).name()),
    }
}

fn key_pressed(world: &World, slot: HotbarSlot) -> bool {
    match slot_key(world.resource::<UserSettings>(), slot) {
        Some(SlotKey::Action(action)) => map::just_pressed(world, action),
        Some(SlotKey::Gesture(gesture)) => {
            gesture.just_pressed(world.resource::<ButtonInput<KeyCode>>())
        }
        None => false,
    }
}

/// Takes the next key pressed as the slot's key. A key a fixed action holds is refused; one
/// another slot holds moves over.
fn capture(world: &mut World, slot: HotbarSlot) {
    let keys = world.resource::<ButtonInput<KeyCode>>();
    let Some(&key) = keys.get_just_pressed().find(|key| !is_modifier(**key)) else {
        return;
    };
    let modifiers = KeyModifiers::held(keys);
    world.resource_mut::<BarState>().rebinding = None;
    if key == KeyCode::Escape {
        return;
    }
    let gesture = KeyGesture { key, modifiers };
    let content = world.resource::<Content>().clone();
    let map = world.resource::<InputMap>().clone();
    let taken = InputAction::VARIANTS
        .iter()
        .copied()
        .filter(|action| !HOTBAR_KEYS.contains(action))
        .find(|action| map.bindings(*action).contains(&InputBinding::Key(gesture)));
    if let Some(action) = taken {
        let label = action.get(&content).label.clone();
        notification::local_error(
            world,
            format!(
                "{} is taken: {}",
                InputBinding::Key(gesture).name(),
                label.to_lowercase()
            ),
        );
        return;
    }
    let shown = world.resource::<UserSettings>().hotbar_shape().slots();
    let holder = (0..shown)
        .map(HotbarSlot)
        .filter(|other| *other != slot)
        .find(
            |other| match slot_key(world.resource::<UserSettings>(), *other) {
                Some(SlotKey::Action(action)) => {
                    map.bindings(action).contains(&InputBinding::Key(gesture))
                }
                Some(SlotKey::Gesture(held)) => held == gesture,
                None => false,
            },
        );
    let mut settings = world.resource_mut::<UserSettings>();
    if let Some(other) = holder {
        settings.set_hotbar_key(other, HotbarKey::Unbound);
    }
    settings.set_hotbar_key(slot, HotbarKey::Custom(gesture));
    if let Some(other) = holder {
        notification::local_error(
            world,
            format!(
                "Slot {} lost {} to slot {}",
                other.number(),
                InputBinding::Key(gesture).name(),
                slot.number()
            ),
        );
    } else {
        InterfaceSound::UiPick.play(world);
    }
}

fn is_modifier(key: KeyCode) -> bool {
    matches!(
        key,
        KeyCode::ShiftLeft
            | KeyCode::ShiftRight
            | KeyCode::ControlLeft
            | KeyCode::ControlRight
            | KeyCode::AltLeft
            | KeyCode::AltRight
            | KeyCode::SuperLeft
            | KeyCode::SuperRight
    )
}

fn rebind_panel(ui: &mut Ui, world: &World, bar: Rect) {
    let Some(slot) = world.resource::<BarState>().rebinding else {
        return;
    };
    let text = format!("Press a key for slot {} · Esc cancels", slot.number());
    let galley = ui
        .painter()
        .layout_no_wrap(text, TextRole::Small.font_id(), ink::INK);
    let size = galley.size() + slip::PADDING.sum();
    let rect = Rect::from_min_size(
        Pos2::new(bar.center().x - size.x / 2.0, bar.min.y - size.y - 6.0),
        size,
    );
    let painter = ui.painter();
    slip::paint(painter, rect);
    painter.galley(
        rect.min + Vec2::new(f32::from(slip::PADDING.left), f32::from(slip::PADDING.top)),
        galley,
        ink::INK,
    );
}

/// The shape drawn now: the saved one, or the one the grip is being dragged toward, in whole slots.
fn shown_shape(world: &mut World, gui: &egui::Context) -> HotbarShape {
    let saved = world.resource::<UserSettings>().hotbar_shape();
    let Some(resizing) = world.resource::<BarState>().resizing else {
        return saved;
    };
    let (down, pointer) = gui.input(|input| (input.pointer.any_down(), input.pointer.latest_pos()));
    let shape = pointer.map_or(resizing.from, |pointer| {
        let moved = pointer - resizing.grab;
        let down = match resizing.corner {
            GripCorner::BottomRight => moved.y,
            GripCorner::TopRight => -moved.y,
        };
        HotbarShape {
            columns: ((resizing.from.columns as f32 * PITCH + moved.x) / PITCH)
                .round()
                .max(1.0) as u32,
            rows: ((resizing.from.rows as f32 * PITCH + down) / PITCH)
                .round()
                .max(1.0) as u32,
        }
    });
    if !down {
        world.resource_mut::<BarState>().resizing = None;
        if shape != saved {
            world.resource_mut::<UserSettings>().set_hotbar_shape(shape);
        }
    }
    shape
}

fn resize(world: &mut World, ui: &Ui, grip: &egui::Response, outer: Rect, corner: GripCorner) {
    if grip.drag_started()
        && let Some(grab) = ui.input(|input| input.pointer.press_origin())
    {
        world.resource_mut::<BarState>().resizing = Some(Resizing {
            from: world.resource::<UserSettings>().hotbar_shape(),
            grab,
            corner,
        });
    }
    if world.resource::<BarState>().resizing.is_some() {
        let points = [
            outer.left_top(),
            outer.right_top(),
            outer.right_bottom(),
            outer.left_bottom(),
            outer.left_top(),
        ];
        ui.painter().add(egui::Shape::dashed_line(
            &points,
            Stroke::new(1.0, ink::OCHRE),
            5.0,
            3.0,
        ));
    }
}
