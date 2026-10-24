use bevy::prelude::*;
use ui::controls::{self, RowLook};
use ui::drag;
use ui::egui;
use ui::egui::{Align, Layout, Pos2, Rect, Ui, UiBuilder};
use ui::face::{self, TextRole};
use ui::sheet::{self, Depth};
use ui::{card, ink};

use super::{OfferView, SaleQuote, SaleVerdict, ShopId, ShopRequest, ShopView, WareRefusal};
use crate::core::content::Content;
use crate::core::text::{self, StyledLine, TextLook, TextPiece};
use crate::systems::dialogue::stage::{self, DockedPanel, PanelChrome, PanelHead};
use crate::systems::hud::{self, Carried, Confirm};
use crate::systems::input::map::{self, InputAction, input};
use crate::systems::interface::InterfaceSound;
use crate::systems::item::card::CardLook;
use crate::systems::item::widget::{SlotAction, SlotVerdict, slot_action, slot_verdict_source};
use crate::systems::item::{self, Inventory, ItemCategory, ItemId, ItemStack};
use crate::systems::player::session;
use crate::systems::screen::ClientScreen;
use crate::systems::text::duration;

const COUNTER_WIDTH: f32 = 620.0;
const COUNTER_HEIGHT: f32 = 400.0;
const SHOP_PAGE_WIDTH: f32 = 290.0;
const PAGE_GAP: f32 = 10.0;
const HINT_ROOM: f32 = 24.0;
const ICON: f32 = 24.0;
const BUTTON_GAP: f32 = 10.0;

pub struct ShopCounterPlugin;

impl Plugin for ShopCounterPlugin {
    fn build(&self, app: &mut App) {
        slot_verdict_source(app, verdict);
        slot_action(
            app,
            SlotAction {
                action: InputAction::SellItem,
                active: selling,
                act: request_sale,
                verb: "sell",
            },
        );
        stage::dock(
            app,
            DockedPanel {
                head,
                show: show_counter,
            },
        );
        app.init_resource::<Browse>()
            .add_systems(Update, notice_counter.run_if(in_state(ClientScreen::Area)))
            .add_systems(OnExit(ClientScreen::Area), forget);
    }
}

pub fn view(world: &World) -> Option<&ShopView> {
    session::me(world).and_then(|seen| world.get::<ShopView>(seen))
}

pub fn select(world: &mut World, tab: ShopTab, index: usize) {
    let mut browse = world.resource_mut::<Browse>();
    browse.tab = tab;
    browse.selected = index;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum ShopTab {
    #[default]
    Wares,
    Buyback,
}

#[derive(Resource, Default)]
struct Browse {
    tab: ShopTab,
    selected: usize,
    open: Option<ShopId>,
}

struct Shelf {
    shown: ShopView,
    tab: ShopTab,
    selected: usize,
}

struct Ware {
    item: ItemId,
    count: u32,
    price: Vec<ItemStack>,
    held: Vec<u32>,
    note: Option<String>,
    refusal: Option<WareRefusal>,
}

fn forget(mut browse: ResMut<Browse>) {
    *browse = Browse::default();
}

fn notice_counter(world: &mut World) {
    let shop = view(world).map(|shown| shown.shop);
    if world.resource::<Browse>().open == shop {
        return;
    }
    *world.resource_mut::<Browse>() = Browse {
        open: shop,
        ..Browse::default()
    };
    if shop.is_some() {
        InterfaceSound::UiOpen.play(world);
    }
}

fn head(world: &World) -> Option<PanelHead> {
    let content = world.resource::<Content>();
    view(world).map(|shown| PanelHead {
        width: COUNTER_WIDTH,
        chrome: PanelChrome::Sheet {
            title: shown.shop.get(content).title.to_owned(),
            height: COUNTER_HEIGHT,
        },
    })
}

fn show_counter(ui: &mut Ui, world: &mut World, _width: f32, _most: f32) {
    let Some(shelf) = shelf(world) else {
        return;
    };
    let shown = ui.scope(|ui| counter(ui, world, &shelf)).response;
    if let Some(Carried::BagSlot(slot)) = drag::dropped::<Carried>(&shown) {
        request_sale(world, slot);
    }
}

fn shelf(world: &World) -> Option<Shelf> {
    let shown = view(world)?.clone();
    let browse = world.resource::<Browse>();
    Some(Shelf {
        shown,
        tab: browse.tab,
        selected: browse.selected,
    })
}

fn counter(ui: &mut Ui, world: &mut World, shelf: &Shelf) {
    let content = world.resource::<Content>().clone();
    let wares = shelf.wares(&content);
    let selected = shelf.selected.min(wares.len().saturating_sub(1));
    let wants = shelf.shown.shop.get(&content).wants(&content);
    ui.horizontal(|ui| {
        let tabs = [
            (ShopTab::Wares, "Wares".to_owned()),
            (
                ShopTab::Buyback,
                format!("Buy back ({})", shelf.shown.buyback.len()),
            ),
        ];
        let mut tab = shelf.tab;
        sheet::tabs(ui, &tabs, &mut tab);
        if tab != shelf.tab {
            select(world, tab, 0);
        }
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            sheet::label(ui, TextRole::Small, &wants_note(&wants), ink::GOLD);
        });
    });
    ui.add_space(PAGE_GAP);
    let room = ui.available_rect_before_wrap();
    let list = Rect::from_min_max(
        room.min,
        Pos2::new(room.max.x - SHOP_PAGE_WIDTH - PAGE_GAP, room.max.y),
    );
    let page = Rect::from_min_max(
        Pos2::new(room.max.x - SHOP_PAGE_WIDTH, room.min.y),
        room.max,
    );
    ui.scope_builder(
        UiBuilder::new()
            .max_rect(list)
            .layout(Layout::top_down(Align::Min)),
        |ui| {
            let rows = (list.height() - HINT_ROOM).max(0.0);
            sheet::scroll(
                ui,
                egui::ScrollArea::vertical()
                    .max_height(rows)
                    .auto_shrink([false, false]),
                |ui| wares_list(ui, world, shelf, &wares, selected),
            );
            sell_hint(ui, world, !wants.is_empty());
        },
    );
    ui.scope_builder(
        UiBuilder::new()
            .max_rect(page)
            .layout(Layout::top_down(Align::Min)),
        |ui| {
            if let Some(ware) = wares.get(selected) {
                ware_card(ui, world, shelf.tab, ware, selected, page.height());
            }
        },
    );
    ui.advance_cursor_after_rect(room);
}

fn wares_list(ui: &mut Ui, world: &mut World, shelf: &Shelf, wares: &[Ware], selected: usize) {
    if wares.is_empty() {
        let note = match shelf.tab {
            ShopTab::Wares => "Nothing for sale",
            ShopTab::Buyback => "Nothing sold here yet",
        };
        ui.add_space(16.0);
        sheet::label(ui, TextRole::Small, note, ink::INK3);
        return;
    }
    ui.spacing_mut().item_spacing.y = 0.0;
    for (index, ware) in wares.iter().enumerate() {
        let response = ui
            .push_id(("ware", index), |ui| {
                ware_row(ui, world, ware, index == selected)
            })
            .inner;
        if map::clicked(world, InputAction::Select, &response) {
            select(world, shelf.tab, index);
        }
    }
}

fn ware_row(ui: &mut Ui, world: &mut World, ware: &Ware, selected: bool) -> egui::Response {
    let content = world.resource::<Content>().clone();
    let def = ware.item.get(&content);
    let name = counted(&def.name, ware.count);
    let note = unavailable(ware)
        .map(|reason| (reason, ink::RUBRIC))
        .or_else(|| ware.note.clone().map(|note| (note, ink::INK3)));
    let look = RowLook {
        selected,
        ..RowLook::default()
    };
    let response = controls::row(ui, look, |ui| {
        ui.horizontal(|ui| {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.with_layout(Layout::top_down(Align::Max), |ui| {
                    ui.spacing_mut().item_spacing.y = 2.0;
                    for (stack, have) in ware.price.iter().zip(&ware.held) {
                        price(ui, world, *have, *stack);
                    }
                });
                ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                    hud::icon(ui, world, &def.icon, ICON);
                    ui.vertical(|ui| {
                        ui.spacing_mut().item_spacing.y = 1.0;
                        ui.add(egui::Label::new(face::body(&name)).wrap());
                        if let Some((note, color)) = &note {
                            sheet::label(ui, TextRole::Small, note, *color);
                        }
                    });
                });
            });
        });
    })
    .response;
    response.widget_info(|| {
        egui::WidgetInfo::selected(egui::WidgetType::SelectableLabel, true, selected, &name)
    });
    response
}

fn ware_card(ui: &mut Ui, world: &mut World, tab: ShopTab, ware: &Ware, index: usize, most: f32) {
    let look = CardLook {
        width: SHOP_PAGE_WIDTH,
        max_height: (most - BUTTON_GAP - controls::CONTROL_HEIGHT - card::MARGIN)
            .min(card::MAX_HEIGHT),
        art: card::ART_SHORT,
        closable: false,
        depth: Depth::Front,
    };
    item::card::show(ui, world, ware.item, look);
    ui.add_space(BUTTON_GAP);
    ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
        ui.add_space(card::MARGIN);
        if trade_button(ui, tab, ware).clicked() {
            trade(world, tab, index);
        }
    });
}

fn trade_button(ui: &mut Ui, tab: ShopTab, ware: &Ware) -> egui::Response {
    match (&ware.refusal, tab) {
        (Some(WareRefusal::Unaffordable(_)), _) => controls::faded(ui, "Can't afford"),
        (Some(WareRefusal::Unavailable(_)), _) => controls::faded(ui, "Unavailable"),
        (None, ShopTab::Wares) => controls::primary(ui, "Buy"),
        (None, ShopTab::Buyback) => controls::primary(ui, "Buy back"),
    }
}

fn trade(world: &mut World, tab: ShopTab, index: usize) {
    let index = index as u32;
    match tab {
        ShopTab::Wares => {
            world.write_message(ShopRequest::Buy { offer: index });
        }
        ShopTab::Buyback => {
            world.write_message(ShopRequest::Buyback { sale: index });
        }
    }
    InterfaceSound::UiPick.play(world);
}

fn price(ui: &mut Ui, world: &mut World, have: u32, stack: ItemStack) {
    let color = if have >= stack.count {
        ink::INK
    } else {
        ink::RUBRIC
    };
    let icon = stack.item.get(world.resource::<Content>()).icon.clone();
    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        ui.label(face::body(stack.count.to_string()).color(color));
        hud::icon(ui, world, &icon, ICON);
    });
}

fn sell_hint(ui: &mut Ui, world: &mut World, selling: bool) {
    if !selling {
        return;
    }
    let hint = StyledLine::new(vec![
        input(InputAction::SellItem),
        TextPiece::text(" or "),
        input(InputAction::CarryItem),
        TextPiece::text(" from your bag to sell"),
    ]);
    let look = TextLook::new(TextRole::Small.size(), ink::INK3);
    text::show(ui, world, &hint, look, None);
}

impl Shelf {
    fn wares(&self, content: &Content) -> Vec<Ware> {
        match self.tab {
            ShopTab::Wares => self
                .shown
                .shop
                .get(content)
                .sells()
                .zip(&self.shown.offers)
                .map(|(offer, view)| Ware {
                    item: offer.item,
                    count: offer.count,
                    price: offer.price.to_vec(),
                    held: view.held.clone(),
                    note: stock_note(view),
                    refusal: view.refusal.clone(),
                })
                .collect(),
            ShopTab::Buyback => self
                .shown
                .buyback
                .iter()
                .map(|buyback| Ware {
                    item: buyback.sale.item,
                    count: buyback.sale.count,
                    price: buyback.sale.paid.clone(),
                    held: buyback.held.clone(),
                    note: None,
                    refusal: buyback.refusal.clone(),
                })
                .collect(),
        }
    }
}

fn stock_note(view: &OfferView) -> Option<String> {
    let left = view.left?;
    Some(match view.restocks_in {
        Some(restocks) => format!("{left} left · restocks in {}", duration(restocks)),
        None => format!("{left} left"),
    })
}

fn wants_note(wants: &[String]) -> String {
    if wants.is_empty() {
        "Buys nothing".to_owned()
    } else {
        format!("Buys {}", wants.join(", "))
    }
}

fn unavailable(ware: &Ware) -> Option<String> {
    match &ware.refusal {
        Some(WareRefusal::Unavailable(reason)) => Some(reason.clone()),
        Some(WareRefusal::Unaffordable(_)) | None => None,
    }
}

fn counted(name: &str, count: u32) -> String {
    if count > 1 {
        format!("{name} ×{count}")
    } else {
        name.to_owned()
    }
}

fn verdict(world: &World, stack: ItemStack) -> Option<SlotVerdict> {
    let content = world.resource::<Content>();
    let quote = quote(view(world)?, stack.item)?;
    Some(match &quote.verdict {
        SaleVerdict::Pays(pays) => {
            SlotVerdict::Wanted(format!("sells for {}", paid(content, pays, stack.count)))
        }
        SaleVerdict::Refused(refusal) => SlotVerdict::Refused(refusal.clone()),
    })
}

fn quote(shown: &ShopView, item: ItemId) -> Option<&SaleQuote> {
    shown.quotes.iter().find(|quote| quote.item == item)
}

fn paid(content: &Content, pays: &[ItemStack], count: u32) -> String {
    pays.iter()
        .map(|pay| ItemStack::new(pay.item, pay.count.saturating_mul(count)).describe(content))
        .collect::<Vec<_>>()
        .join(" + ")
}

fn selling(world: &World) -> bool {
    view(world).is_some()
}

fn request_sale(world: &mut World, slot: u32) {
    let content = world.resource::<Content>().clone();
    let Some(shown) = view(world) else {
        return;
    };
    let shop = shown.shop;
    let Some(stack) = session::me(world)
        .and_then(|seen| world.get::<Inventory>(seen))
        .and_then(|inventory| inventory.slots.get(slot as usize).copied())
    else {
        return;
    };
    let Some(verdict) = quote(shown, stack.item).map(|quote| quote.verdict.clone()) else {
        return;
    };
    match verdict {
        SaleVerdict::Pays(pays)
            if stack.item.get(&content).category() == ItemCategory::Equipment =>
        {
            confirm_sale(world, shop, stack, &pays, slot);
        }
        SaleVerdict::Pays(_) | SaleVerdict::Refused(_) => sell(world, slot, stack),
    }
}

fn confirm_sale(world: &mut World, shop: ShopId, stack: ItemStack, pays: &[ItemStack], slot: u32) {
    let content = world.resource::<Content>().clone();
    let name = &stack.item.get(&content).name;
    hud::confirm(
        world,
        Confirm {
            title: format!("Sell {name}?"),
            body: vec![
                format!(
                    "{} pays {}.",
                    shop.get(&content).title,
                    paid(&content, pays, stack.count)
                ),
                "You can buy it back for the same until you leave the game.".to_owned(),
            ],
            confirm: "Sell".to_owned(),
            cancel: "Keep".to_owned(),
            answer: Box::new(move |world, sold| {
                if sold {
                    sell(world, slot, stack);
                }
            }),
        },
    );
}

fn sell(world: &mut World, slot: u32, stack: ItemStack) {
    world.write_message(ShopRequest::Sell { slot, stack });
    InterfaceSound::Coins.play(world);
}
