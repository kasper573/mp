use driver::{UiTarget, content, holding, resident_home};
use engine::core::math::Offset;
use engine::systems::input::map::InputAction;
use engine::systems::probe::ProbeSnapshot;
use engine::systems::skill::HotbarEntry;

use crate::playtest;

const POTION: &str = "icons/potion/red_potion.png";
const DRAUGHT: &str = "icons/potion/green_potion_3.png";

#[test]
fn skills_are_learned_in_the_tree_put_on_the_bar_cast_and_reset() {
    let mut playtest = playtest();
    let mut player = playtest.join_as(
        "unspent",
        Some(resident_home("glimmercap", "gnome_alchemist")),
    );

    player.act(InputAction::ToggleSkills);
    player.find_ui("Skills");
    player.click_ui(UiTarget::starting("Cleave node"));
    player.click_ui(UiTarget::starting("Guard node"));
    player.wait_until("two picks", |snapshot| planned(snapshot) == 2);
    player.click_ui(UiTarget::starting("Confirm"));
    player.wait_until("the ranks learned", |snapshot| {
        learned(snapshot, "cleave") == 1
            && learned(snapshot, "guard") == 1
            && to_spend(snapshot) == 1
    });

    player.carry_onto(
        UiTarget::starting("Cleave node"),
        UiTarget::starting("Hotbar slot 1"),
    );
    player.wait_until("Cleave in slot 1", |snapshot| {
        slot_skill(snapshot, 0) == Some("cleave")
    });
    player.act_on_ui(InputAction::PinToHotbar, UiTarget::starting("Guard node"));
    player.wait_until("Guard in slot 2", |snapshot| {
        slot_skill(snapshot, 1) == Some("guard")
    });
    player.act(InputAction::ToggleSkills);

    player.act(InputAction::Hotbar2);
    player.wait_until("Guard cooling", |snapshot| cooling(snapshot, 1));
    player.act(InputAction::Hotbar1);
    player.wait_until("Cleave armed", aiming);
    let at = player.snapshot().me.expect("the player").at + Offset::new(2.0, 0.0);
    player.point_at_tile(at);
    player.click();
    player.wait_until("Cleave cast", |snapshot| {
        cooling(snapshot, 0) && !aiming(snapshot)
    });

    player.act(InputAction::ToggleInventory);
    player.act_on_ui(InputAction::PinToHotbar, UiTarget::image(POTION));
    player.wait_until("the potion on the bar", |snapshot| {
        slot_item(snapshot, 2) == Some("health_potion")
    });
    player.act(InputAction::ToggleInventory);
    player.act(InputAction::Hotbar3);
    player.wait_until("a potion drunk", |snapshot| {
        holding(snapshot, "health_potion") == 1
    });

    player.act_on_ui(
        InputAction::InspectItem,
        UiTarget::starting("Hotbar slot 2"),
    );
    player.click_ui(UiTarget::button("Rebind key"));
    player.type_text("q", |snapshot| {
        snapshot
            .hotbar
            .get(1)
            .is_some_and(|slot| slot.key.as_deref() == Some("Q"))
    });

    player.drag_ui("Resize", Offset::new(-200.0, -44.0));
    player.wait_until("another shape", |snapshot| snapshot.hotbar.len() == 8);
    player.drag_ui("Resize", Offset::new(200.0, 44.0));
    player.wait_until("one row of nine", |snapshot| snapshot.hotbar.len() == 9);

    player.act(InputAction::ToggleInventory);
    player.act_on_ui(InputAction::UseItem, UiTarget::image(DRAUGHT));
    player.wait_until("the question", prompted);
    player.click_ui(UiTarget::button("Reset"));
    player.wait_until("the points back", |snapshot| {
        learned(snapshot, "cleave") == 0 && to_spend(snapshot) == 3
    });
    let snapshot = player.snapshot();
    assert_eq!(slot_skill(&snapshot, 0), Some("cleave"));
    assert!(snapshot.hotbar[0].dimmed);
}

fn learned(snapshot: &ProbeSnapshot, node: &str) -> u8 {
    snapshot
        .skills
        .as_ref()
        .and_then(|skills| {
            skills
                .learned
                .iter()
                .find(|(key, _)| key == node)
                .map(|(_, rank)| rank.0)
        })
        .unwrap_or(0)
}

fn planned(snapshot: &ProbeSnapshot) -> usize {
    snapshot
        .skills
        .as_ref()
        .map_or(0, |skills| skills.planned.len())
}

fn to_spend(snapshot: &ProbeSnapshot) -> u32 {
    snapshot.skills.as_ref().map_or(0, |skills| skills.to_spend)
}

fn aiming(snapshot: &ProbeSnapshot) -> bool {
    snapshot
        .skills
        .as_ref()
        .is_some_and(|skills| skills.aiming.is_some())
}

fn prompted(snapshot: &ProbeSnapshot) -> bool {
    snapshot
        .skills
        .as_ref()
        .is_some_and(|skills| skills.reset_prompt)
}

fn cooling(snapshot: &ProbeSnapshot, slot: usize) -> bool {
    snapshot.hotbar.get(slot).is_some_and(|slot| slot.cooling)
}

fn slot_skill(snapshot: &ProbeSnapshot, slot: usize) -> Option<&'static str> {
    match snapshot.hotbar.get(slot)?.entry {
        HotbarEntry::Skill(skill) => Some(skill.key(content())),
        _ => None,
    }
}

fn slot_item(snapshot: &ProbeSnapshot, slot: usize) -> Option<&'static str> {
    match snapshot.hotbar.get(slot)?.entry {
        HotbarEntry::Item(item) => Some(item.key(content())),
        _ => None,
    }
}
