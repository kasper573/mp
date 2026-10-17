use driver::{UiTarget, content, holding, resident_home};
use engine::core::math::Offset;
use engine::systems::input::map::InputAction;
use engine::systems::probe::ProbeSnapshot;
use engine::systems::skill::HotbarEntry;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "skills",
    title: "Skills",
    summary: "Learn from your class's tree, fill the hotbar, aim and cast",
    play,
};

const POTION: &str = "icons/potion/red_potion.png";
const DRAUGHT: &str = "icons/potion/green_potion_3.png";

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as(
        "unspent",
        Some(resident_home("glimmercap", "gnome_alchemist")),
    );
    let mut me = shoot.roll(player);
    me.caption_top("Your class grants skill points as you level: K opens your skills");
    me.act(InputAction::ToggleSkills);
    me.find_ui("Skills");
    me.find_ui(UiTarget::containing("to spend"));
    me.caption_top(
        "The tree is laid out as the designer drew it; arrows lead from a node to what it unlocks",
    );
    me.hold();
    me.caption_top(
        "Rest the pointer on a node for its card: every rank, its cost, and what it needs",
    );
    me.hover_ui(UiTarget::starting("Cleave node"));
    me.hold();
    me.caption_top("A locked node shows the crosses still to clear");
    me.hover_ui(UiTarget::starting("War Cry node"));
    me.hold();
    me.caption_top(
        "Click a node to pick a rank; the pill counts it. Confirm spends the points for good",
    );
    me.click_ui(UiTarget::starting("Cleave node"));
    me.click_ui(UiTarget::starting("Guard node"));
    me.wait_until("two picks", |snapshot| planned(snapshot) == 2);
    me.hold();
    me.click_ui(UiTarget::starting("Confirm"));
    me.wait_until("the ranks learned", |snapshot| {
        learned(snapshot, "cleave") == 1 && learned(snapshot, "guard") == 1
    });
    me.caption_top("Learned. Second Wind, which needed both, is open now, and one point is left");
    me.hold();
    me.caption_top("Drag a learned skill onto the hotbar…");
    me.carry_onto(
        UiTarget::starting("Cleave node"),
        UiTarget::starting("Hotbar slot 1"),
    );
    me.wait_until("Cleave in slot 1", |snapshot| {
        slot_skill(snapshot, 0) == Some("cleave")
    });
    me.caption_top("…or shift-click it to land in the first free slot");
    me.act_on_ui(InputAction::PinToHotbar, UiTarget::starting("Guard node"));
    me.wait_until("Guard in slot 2", |snapshot| {
        slot_skill(snapshot, 1) == Some("guard")
    });
    me.act(InputAction::ToggleSkills);
    me.caption_top("Press a slot's key: a skill on yourself fires at once, and its cooldown drains off the slot");
    me.act(InputAction::Hotbar2);
    me.wait_until("Guard cooling", |snapshot| cooling(snapshot, 1));
    me.hold();
    me.caption_top("An area skill is aimed: its shape follows the pointer, and a click casts it");
    me.act(InputAction::Hotbar1);
    me.wait_until("Cleave armed", aiming);
    let at = me.snapshot().me.expect("the player").at + Offset::new(2.0, 0.0);
    me.point_at_tile(at);
    me.hold();
    me.click();
    me.wait_until("Cleave cast", |snapshot| cooling(snapshot, 0));
    me.caption_top("Items go on the bar too: shift-click one in the bag. Its count stays live");
    me.act(InputAction::ToggleInventory);
    me.act_on_ui(InputAction::PinToHotbar, UiTarget::image(POTION));
    me.wait_until("the potion on the bar", |snapshot| {
        slot_item(snapshot, 2) == Some("health_potion")
    });
    me.act(InputAction::ToggleInventory);
    me.act(InputAction::Hotbar3);
    me.wait_until("a potion drunk", |snapshot| {
        holding(snapshot, "health_potion") == 1
    });
    me.caption_top("Right-click a slot to rebind its key, or to clear it");
    me.act_on_ui(
        InputAction::InspectItem,
        UiTarget::starting("Hotbar slot 2"),
    );
    me.click_ui(UiTarget::button("Rebind key"));
    me.hold();
    me.type_text("q", |snapshot| {
        snapshot
            .hotbar
            .get(1)
            .is_some_and(|slot| slot.key.as_deref() == Some("Q"))
    });
    me.caption_top("The slot's tooltip names its key");
    me.hover_ui(UiTarget::starting("Hotbar slot 2"));
    me.hold();
    me.caption_top("The bar is a grid of any shape: pull its corner, and it snaps to whole slots");
    me.drag_ui("Resize", Offset::new(-200.0, -44.0));
    me.wait_until("another shape", |snapshot| snapshot.hotbar.len() != 9);
    me.hold();
    me.drag_ui("Resize", Offset::new(200.0, 44.0));
    me.wait_until("one row of nine", |snapshot| snapshot.hotbar.len() == 9);
    me.caption_top(
        "Left of the bar sits the basic attack slot: a click on an enemy uses it, and a weapon that grants one fills it",
    );
    me.hover_ui(UiTarget::starting("Basic attack slot"));
    me.hold();
    me.caption_top("A reset is content's to offer, here a draught. The game always asks first, and Keep is the default");
    me.act(InputAction::ToggleInventory);
    me.act_on_ui(InputAction::UseItem, UiTarget::image(DRAUGHT));
    me.wait_until("the question", prompted);
    me.hold();
    me.click_ui(UiTarget::button("Reset"));
    me.wait_until("the points back", |snapshot| {
        learned(snapshot, "cleave") == 0 && to_spend(snapshot) == 3
    });
    me.act(InputAction::ToggleInventory);
    me.caption_top("Every point is back. The slots that held the skills stay, dimmed, until they are learned again");
    me.hover_ui(UiTarget::starting("Hotbar slot 1"));
    me.hold();
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
