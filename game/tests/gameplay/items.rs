use driver::{UiTarget, content, id};
use game::systems::input::map::InputAction;
use game::systems::item::ItemDef;

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

fn item(key: &str) -> &'static ItemDef {
    id::<ItemDef>(key).get(content())
}
