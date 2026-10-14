use bevy::prelude::*;
use strum::VariantArray;
use ui::{Align, RichPiece, Side, TooltipText, tooltip, tooltip_content};

use crate::core::content::Content;
use crate::systems::equipment::{Equipment, EquipmentSlot, UnequipRequest};
use crate::systems::hud::{
    HudAudience, SLOT_BG, SLOT_BORDER, Window, reconcile_children, single_tab, slot_node,
    tooltip_label,
};
use crate::systems::input::map::{ActionInput, InputAction, input};
use crate::systems::interface::InterfaceIcon;
use crate::systems::item::{ItemId, card};
use crate::systems::player::session;

#[derive(Component, Default, Clone)]
struct EquipmentGrid;

pub struct EquipmentWindow;

impl Window for EquipmentWindow {
    fn audience(&self) -> HudAudience {
        HudAudience::Players
    }
    fn title(&self) -> &'static str {
        "Equipment"
    }
    fn toggle(&self) -> InputAction {
        InputAction::ToggleEquipment
    }
    fn icon(&self) -> InterfaceIcon {
        InterfaceIcon::Equipment
    }
    fn contents(&self, _: &World) -> Vec<ui::WindowContent> {
        single_tab(self.title(), ui::scrolled(content()))
    }
    fn sync(&self, world: &mut World) {
        sync_equipment(world)
    }
}

fn content() -> Box<dyn Scene> {
    Box::new(bsn! {
        Node {
            width: Val::Percent(100.0),
            flex_wrap: FlexWrap::Wrap,
            align_content: AlignContent::FlexStart,
        }
        EquipmentGrid
    })
}

#[derive(Hash)]
struct CellData {
    slot: EquipmentSlot,
    worn: Option<(ItemId, Handle<Image>)>,
}

fn sync_equipment(world: &mut World) {
    let cells = equipment_cells(world);
    let mut grids = world.query_filtered::<Entity, With<EquipmentGrid>>();
    let Some(grid) = grids.iter(world).next() else {
        return;
    };
    reconcile_children(world, grid, &cells, |world, index| {
        cell_scene(world.resource::<Content>(), &cells[index])
    });
}

fn equipment_cells(world: &World) -> Vec<CellData> {
    let content = world.resource::<Content>();
    let equipment = session::my_character(world).and_then(|me| me.get::<Equipment>());
    let assets = world.resource::<AssetServer>();
    EquipmentSlot::VARIANTS
        .iter()
        .copied()
        .map(|slot| {
            let item = equipment.and_then(|equipment| equipment.slots.get(&slot).copied());
            CellData {
                slot,
                worn: item.map(|item| (item, assets.load(item.get(content).icon.path()))),
            }
        })
        .collect()
}

fn cell_scene(content: &Content, cell: &CellData) -> Box<dyn Scene> {
    match &cell.worn {
        Some((item, icon)) => Box::new(worn_slot(content, cell.slot, *item, icon.clone())),
        None => Box::new(empty_slot(cell.slot)),
    }
}

fn empty_slot(slot: EquipmentSlot) -> impl Scene {
    bsn! {
        slot_node()
        BackgroundColor({SLOT_BG})
        BorderColor::all(SLOT_BORDER)
        @{tooltip(false)}
        Children [
            @{tooltip_content(Side::Bottom, Align::Start, 0.0)}
            Children [ @{tooltip_label(slot.label().to_owned())} ]
        ]
    }
}

fn worn_slot(
    content: &Content,
    slot: EquipmentSlot,
    item: ItemId,
    icon: Handle<Image>,
) -> impl Scene {
    let def = item.get(content);
    let tip = TooltipText {
        title: def.name.to_owned(),
        lines: vec![vec![RichPiece::text(card::overview(def))]],
        hint: Some(
            card::inspect_hint()
                .into_iter()
                .chain([
                    RichPiece::text(" · "),
                    input(InputAction::UseItem),
                    RichPiece::text(" to take it off"),
                ])
                .collect(),
        ),
    };
    bsn! {
        slot_node()
        BackgroundColor({SLOT_BG})
        BorderColor::all(SLOT_BORDER)
        @{tooltip(false)}
        ui::CursorStyle::Pointer
        on(move |click: On<PointerClick>, input: ActionInput, mut commands: Commands| {
            if input.clicked(InputAction::UseItem, &click) {
                commands.write_message(UnequipRequest { slot });
            } else if input.clicked(InputAction::InspectItem, &click) {
                commands.queue(move |world: &mut World| card::open(world, item));
            }
        })
        Children [
            Node { width: Val::Px(32.0), height: Val::Px(32.0) }
            ImageNode { image: {icon} }
            Pickable { should_block_lower: false, is_hoverable: false }
            --
            @{tooltip_content(Side::Bottom, Align::Start, 0.0)}
            Children [ @{ui::tooltip_text(tip)} ]
        ]
    }
}
