use bevy_ecs::prelude::*;
use game::core::tiling::Tiles;
use game::systems::dialogue::ConversationRequest;
use game::systems::interact::InteractRequest;
use game::systems::item::Id as ItemId;
use game::systems::item::{Inventory, ItemStack};
use game::systems::movement::{Position, position};
use game::systems::script::Speaker;
use game::systems::shop::{ShopId, ShopRequest, ShopView};

use crate::support::{
    Sim, content, conversation, count, give, later, object, pick, row, spawn_area, talk,
    townsperson,
};

fn shown(sim: &mut Sim, player: Entity) -> Option<ShopView> {
    sim.world().get::<ShopView>(player).cloned()
}

fn browse(sim: &mut Sim, client: u32, player: Entity, keeper: game::systems::npc::Id) -> ShopView {
    talk(sim, client, player, keeper);
    pick(sim, client, player, ask_of(keeper));
    assert!(
        sim.run_until(20.0, |world| world.get::<ShopView>(player).is_some()),
        "the shop with {keeper:?} never opened"
    );
    shown(sim, player).expect("the shop opened")
}

fn ask_of(keeper: game::systems::npc::Id) -> &'static str {
    if keeper == row("Mara") {
        "Show me your wares."
    } else if keeper == row("Wren") {
        "I've brought bones."
    } else {
        panic!("{keeper:?} keeps no shop")
    }
}

fn slot_of(sim: &mut Sim, player: Entity, item: ItemId) -> u32 {
    sim.world()
        .get::<Inventory>(player)
        .expect("bag")
        .slots
        .iter()
        .position(|stack| stack.item == item)
        .expect("in the bag") as u32
}

fn offer_of(shop: ShopId, item: ItemId) -> u32 {
    shop.get(content())
        .sells()
        .position(|offer| offer.item == item)
        .expect("on sale") as u32
}

#[test]
fn asking_a_keeper_opens_the_shop_and_buying_trades_the_price_for_the_goods() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Gold"), 10);

    let opened = browse(&mut sim, 1, player, row("Mara"));
    assert_eq!(opened.shop, row::<ShopId>("MaraWares"));
    let now = conversation(&mut sim, player).expect("browsing");
    assert_eq!(now.node, "wares");

    sim.send(
        1,
        ShopRequest::Buy {
            offer: offer_of(row("MaraWares"), row("HealthPotion")),
        },
    );
    sim.tick();

    assert_eq!(count(&mut sim, player, row("Gold")), 4);
    assert_eq!(count(&mut sim, player, row("HealthPotion")), 1);
}

#[test]
fn a_purchase_you_cannot_cover_changes_nothing_and_the_keeper_says_so() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Gold"), 12);
    let mara = townsperson(&mut sim, row("Mara"));
    let opened = browse(&mut sim, 1, player, row("Mara"));
    let potion = offer_of(row("MaraWares"), row("GreaterHealthPotion"));
    assert!(opened.offers[potion as usize].refusal.is_some());

    sim.send(1, ShopRequest::Buy { offer: potion });
    sim.tick();

    assert_eq!(count(&mut sim, player, row("Gold")), 12);
    assert_eq!(count(&mut sim, player, row("GreaterHealthPotion")), 0);
    let talking = conversation(&mut sim, player).expect("still browsing");
    assert_eq!(talking.with, Some(mara));
    let remark = talking.remark.expect("Mara reacts");
    assert_eq!(remark.line.by, Speaker::Npc(row("Mara")));
}

#[test]
fn limited_stock_is_kept_per_player_and_restocks_on_its_timer() {
    let mut sim = Sim::area(spawn_area());
    let first = sim.join(1);
    let second = sim.join(2);
    for player in [first, second] {
        give(&mut sim, player, row("Gold"), 100);
        give(&mut sim, player, row("BatWing"), 20);
    }
    browse(&mut sim, 1, first, row("Mara"));
    browse(&mut sim, 2, second, row("Mara"));
    let potion = offer_of(row("MaraWares"), row("GreaterHealthPotion"));

    for _ in 0..4 {
        sim.send(1, ShopRequest::Buy { offer: potion });
        sim.tick();
    }
    assert_eq!(count(&mut sim, first, row("GreaterHealthPotion")), 3);
    let sold_out = shown(&mut sim, first).expect("open");
    assert_eq!(sold_out.offers[potion as usize].left, Some(0));

    sim.send(2, ShopRequest::Buy { offer: potion });
    sim.tick();
    assert_eq!(count(&mut sim, second, row("GreaterHealthPotion")), 1);

    later(&mut sim, 600.0);
    sim.send(1, ShopRequest::Buy { offer: potion });
    sim.tick();
    assert_eq!(count(&mut sim, first, row("GreaterHealthPotion")), 4);
}

#[test]
fn a_collector_pays_in_his_own_currency_and_buyback_costs_exactly_what_he_paid() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Bone"), 7);
    give(&mut sim, player, row("OrcTusk"), 1);

    let opened = browse(&mut sim, 1, player, row("Wren"));
    assert_eq!(opened.shop, row::<ShopId>("BoneExchange"));
    let now = conversation(&mut sim, player)
        .expect("a shop without reactions still keeps its conversation");
    assert_eq!(now.node, "counter");

    let tusk = slot_of(&mut sim, player, row("OrcTusk"));
    sim.send(
        1,
        ShopRequest::Sell {
            slot: tusk,
            stack: ItemStack::new(row("OrcTusk"), 1),
        },
    );
    sim.tick();
    assert_eq!(count(&mut sim, player, row("OrcTusk")), 1);

    let bones = slot_of(&mut sim, player, row("Bone"));
    let all_bones = ItemStack::new(row("Bone"), 7);
    sim.send(
        1,
        ShopRequest::Sell {
            slot: bones,
            stack: all_bones,
        },
    );
    sim.send(
        1,
        ShopRequest::Sell {
            slot: bones,
            stack: all_bones,
        },
    );
    sim.tick();
    assert_eq!(count(&mut sim, player, row("Bone")), 0);
    assert_eq!(count(&mut sim, player, row("BoneToken")), 7);
    let sold = shown(&mut sim, player).expect("open");
    assert_eq!(sold.buyback.len(), 1);

    sim.send(1, ShopRequest::Buyback { sale: 0 });
    sim.tick();
    assert_eq!(count(&mut sim, player, row("Bone")), 7);
    assert_eq!(count(&mut sim, player, row("BoneToken")), 0);
    assert!(shown(&mut sim, player).expect("open").buyback.is_empty());
}

#[test]
fn walking_out_of_reach_closes_the_shop() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    browse(&mut sim, 1, player, row("Wren"));
    let at = position(sim.world(), player).expect("position");

    let away = sim.walkable_near(at, Tiles(8.0), Tiles(12.0));
    sim.world()
        .entity_mut(player)
        .insert(Position { pos: away });
    sim.tick();

    assert!(shown(&mut sim, player).is_none());
}

#[test]
fn leaving_the_conversation_closes_the_shop() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    browse(&mut sim, 1, player, row("Mara"));
    let step = conversation(&mut sim, player).expect("browsing").step;

    sim.send(1, ConversationRequest::Leave { step });
    sim.tick();

    assert!(conversation(&mut sim, player).is_none());
    assert!(shown(&mut sim, player).is_none());
}

#[test]
fn a_map_object_can_keep_a_shop() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Gold"), 3);
    let honesty_box = object(&mut sim, "honesty-box");

    sim.send(
        1,
        InteractRequest {
            target: honesty_box,
        },
    );
    assert!(sim.run_until(20.0, |world| world.get::<ShopView>(player).is_some()));
    assert_eq!(
        shown(&mut sim, player).map(|opened| opened.shop),
        Some(row::<ShopId>("HonestyBox"))
    );
    let now = conversation(&mut sim, player).expect("the box keeps its shop inside a conversation");
    assert_eq!(now.node, "note");

    sim.send(
        1,
        ShopRequest::Buy {
            offer: offer_of(row("HonestyBox"), row("FishSteak")),
        },
    );
    sim.tick();
    assert_eq!(count(&mut sim, player, row("FishSteak")), 1);
    assert_eq!(count(&mut sim, player, row("Gold")), 0);
}
