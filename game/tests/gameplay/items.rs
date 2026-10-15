use driver::{Player, UiTarget, content, id};
use game::systems::input::map::InputAction;
use game::systems::item::{ItemDef, ItemId};
use game::systems::probe::ProbeSnapshot;

use crate::playtest;

#[test]
fn an_item_names_itself_to_the_pointer_that_clicked_it() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("armed", None);
    player.act(InputAction::ToggleInventory);
    let sword = item("rusty_sword");
    player.click_ui(UiTarget::image(sword.icon.as_str()));
    player.wait_until("the sword's tooltip", |snapshot| {
        UiTarget::text(&sword.name).find(snapshot).is_some()
    });
}

#[test]
fn a_card_asked_for_from_a_window_comes_in_front_of_it_and_esc_closes_it_first() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("armed", None);
    player.act(InputAction::ToggleInventory);
    let (sword, shield) = (id::<ItemDef>("rusty_sword"), id::<ItemDef>("bone_shield"));
    inspect(&mut player, sword);
    let card = player.snapshot().item_card.expect("the sword's card").rect;
    let title = player.find_ui("Inventory").rect;
    player.drag_ui("Inventory", card.origin - title.origin);
    player.wait_until("the bag over the card", |snapshot| {
        card_in_front(snapshot, sword) == Some(false)
    });

    inspect(&mut player, shield);
    player.wait_until("the shield's card in front of the bag", |snapshot| {
        card_in_front(snapshot, shield) == Some(true)
    });
    player.act(InputAction::Dismiss);
    player.wait_until("the card to close, and the bag to stay", |snapshot| {
        snapshot.item_card.is_none() && UiTarget::text("Inventory").find(snapshot).is_some()
    });
    player.act(InputAction::Dismiss);
    player.wait_until("the bag to close", |snapshot| {
        UiTarget::text("Inventory").find(snapshot).is_none()
    });
}

#[test]
fn a_card_fits_its_item_alike_whether_it_opened_on_it_or_turned_to_it() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("armed", None);
    player.act(InputAction::ToggleInventory);
    let (sword, shield) = (id::<ItemDef>("rusty_sword"), id::<ItemDef>("bone_shield"));
    inspect(&mut player, shield);
    let opened_on = card_height(&mut player, shield);
    inspect(&mut player, sword);
    let between = card_height(&mut player, sword);
    assert_ne!(
        between, opened_on,
        "the two items' cards are alike in height"
    );

    inspect(&mut player, shield);
    player.wait_until("the card to fit the shield again", |snapshot| {
        snapshot
            .item_card
            .is_some_and(|card| card.item == shield && card.rect.height() == opened_on)
    });
}

fn card_height(player: &mut Player, item: ItemId) -> f32 {
    player.wait_until("the card to show the item", |snapshot| {
        snapshot.item_card.is_some_and(|card| card.item == item)
    });
    let card = player.settled().item_card.expect("the card");
    assert_eq!(card.item, item, "the card turned to another item");
    card.rect.height()
}

fn inspect(player: &mut Player, item: ItemId) {
    let icon = &item.get(content()).icon;
    player.act_on_ui(InputAction::InspectItem, UiTarget::image(icon.as_str()));
}

// Whether nothing covers the card's naming of `item`, while the card shows it.
fn card_in_front(snapshot: &ProbeSnapshot, item: ItemId) -> Option<bool> {
    let card = snapshot
        .item_card
        .as_ref()
        .filter(|card| card.item == item)?;
    let name = &item.get(content()).name;
    let named: Vec<bool> = snapshot
        .ui
        .iter()
        .filter(|element| element.text.as_ref() == Some(name))
        .filter(|element| card.rect.contains(element.rect.center()))
        .map(|element| !element.click_through)
        .collect();
    (!named.is_empty()).then(|| named.iter().all(|&shown| shown))
}

fn item(key: &str) -> &'static ItemDef {
    id::<ItemDef>(key).get(content())
}
