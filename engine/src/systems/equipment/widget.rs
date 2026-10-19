use bevy::prelude::*;
use design_tokens::{TextRole, ink, sheet};
use egui::{Sense, Ui, Vec2};
use strum::VariantArray;

use crate::core::content::Content;
use crate::core::gui;
use crate::core::text::{StyledLine, TextPiece};
use crate::systems::equipment::{Equipment, EquipmentSlot, UnequipRequest};
use crate::systems::hud::{self, Carried, HudWindow};
use crate::systems::input::map::{self, InputAction, input};
use crate::systems::interface::InterfaceIcon;
use crate::systems::item::widget::{SlotLook, slot};
use crate::systems::item::{ItemId, card};
use crate::systems::player::session;

const SLOT_GAP: f32 = 8.0;
const NAMED_SLOT: f32 = 52.0;

pub struct EquipmentWindow;

impl HudWindow for EquipmentWindow {
    fn title(&self) -> &'static str {
        "Equipment"
    }
    fn toggle(&self) -> InputAction {
        InputAction::ToggleEquipment
    }
    fn icon(&self) -> InterfaceIcon {
        InterfaceIcon::Equipment
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let worn = worn(world);
        sheet::scroll(ui, egui::ScrollArea::vertical().auto_shrink(false), |ui| {
            ui.spacing_mut().item_spacing = Vec2::new(SLOT_GAP, 2.0);
            ui.horizontal_wrapped(|ui| {
                for &(kind, item) in &worn {
                    ui.allocate_ui(Vec2::new(NAMED_SLOT, NAMED_SLOT), |ui| {
                        ui.vertical_centered(|ui| {
                            match item {
                                Some(item) => worn_slot(ui, world, kind, item),
                                None => empty_slot(ui, world, kind),
                            }
                            ui.add(
                                egui::Label::new(
                                    TextRole::Small.rich(kind.label()).color(ink::INK3),
                                )
                                .truncate(),
                            );
                        });
                    });
                }
            });
        });
    }
}

fn worn(world: &World) -> Vec<(EquipmentSlot, Option<ItemId>)> {
    let equipment = session::my_character(world).and_then(|me| me.get::<Equipment>());
    EquipmentSlot::VARIANTS
        .iter()
        .map(|&slot| {
            let item = equipment.and_then(|equipment| equipment.slots.get(&slot).copied());
            (slot, item)
        })
        .collect()
}

fn empty_slot(ui: &mut Ui, world: &mut World, kind: EquipmentSlot) {
    let response = slot(ui, world, SlotLook::EMPTY, Sense::hover());
    gui::tooltip(&response, |ui| {
        ui.label(kind.label());
    });
}

fn worn_slot(ui: &mut Ui, world: &mut World, kind: EquipmentSlot, item: ItemId) {
    let content = world.resource::<Content>().clone();
    let def = item.get(&content);
    let look = SlotLook {
        icon: Some(&def.icon),
        faded: hud::carried(ui.ctx()) == Some(Carried::Worn(kind)),
        ..SlotLook::EMPTY
    };
    let response = slot(ui, world, look, Sense::click_and_drag());
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            true,
            format!("Worn as {}: {}", kind.label(), def.name),
        )
    });
    if map::clicked(world, InputAction::UseItem, &response) {
        world.write_message(UnequipRequest { slot: kind });
    } else if map::clicked(world, InputAction::InspectItem, &response) {
        card::open(world, item, Some(response.rect));
    } else if map::drag_started(world, InputAction::CarryItem, &response) {
        hud::carry(ui.ctx(), Carried::Worn(kind));
    }
    let hint = StyledLine::new(
        card::inspect_hint()
            .into_iter()
            .chain([
                TextPiece::text(" · "),
                input(InputAction::UseItem),
                TextPiece::text(" to take it off · "),
                input(InputAction::CarryItem),
                TextPiece::text(" onto the hotbar"),
            ])
            .collect(),
    );
    let lines = [card::overview(def)];
    hud::tooltip(&response, world, &def.name, &lines, Some(&hint));
}
