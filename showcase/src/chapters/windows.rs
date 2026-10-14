use driver::{Player, UiTarget, content, holding};
use game::core::math::Offset;
use game::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "windows",
    title: "Windows",
    summary: "Inventory, equipment, stats and settings, laid out your way",
    play,
};

// Each window opens at the same spot; these spread them over the corners of a 1280×720 view.
const LAYOUT: [(InputAction, &str, (f32, f32)); 4] = [
    (InputAction::ToggleInventory, "Inventory", (-330.0, -230.0)),
    (InputAction::ToggleEquipment, "Equipment", (440.0, -230.0)),
    (InputAction::ToggleStats, "Stats", (-330.0, 40.0)),
    (InputAction::ToggleSettings, "Settings", (440.0, 40.0)),
];

const SWORD: &str = "icons/weapon_and_tool/iron_sword.png";
const SHIELD: &str = "icons/weapon_and_tool/wooden_shield.png";

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as("armed", None);
    let mut me = shoot.roll(player);
    me.caption("Every window has a hotkey: I, E, K, L, O and C");
    for (toggle, title, (x, y)) in LAYOUT {
        me.act(toggle);
        if title == "Inventory" {
            me.caption("Drag a window by its title to move it");
        }
        me.drag_ui(title, Offset::new(x, y));
    }
    me.caption("Right-click an item for its card: what it does, and a line of lore");
    inspect(&mut me, SHIELD, "bone_shield");
    me.caption("One card at a time: right-click another item and the card follows");
    inspect(&mut me, SWORD, "rusty_sword");
    me.caption("Double-click an item to use it — or, for gear, to wear it");
    me.act_on_ui(InputAction::UseItem, outside_card(SWORD));
    me.wait_until("the sword to be worn", |snapshot| {
        holding(snapshot, "rusty_sword") == 0
    });
    me.caption("Worn gear has a card too…");
    inspect(&mut me, SHIELD, "bone_shield");
    inspect(&mut me, SWORD, "rusty_sword");
    me.caption("…and a double-click takes it off");
    me.act_on_ui(InputAction::UseItem, outside_card(SWORD));
    me.wait_until("the sword to be taken off", |snapshot| {
        holding(snapshot, "rusty_sword") == 1
    });
    me.caption("Esc closes the card before any window");
    me.act(InputAction::Dismiss);
    me.wait_until("the item card to close", |snapshot| {
        snapshot.item_card.is_none()
    });

    me.caption("Windows snap to a grid — toggle it in Settings");
    me.click_ui(UiTarget::starting("ui snapping"));
    me.hold();
    me.click_ui(UiTarget::starting("ui snapping"));
    me.caption("Text speed is a slider, in letters a second");
    let before = me.find_ui(UiTarget::starting("text speed")).text;
    me.drag_ui(
        UiTarget::new("a slider", |element, _| element.slider.is_some()),
        Offset::new(70.0, 0.0),
    );
    me.wait_until("the text speed to change", |snapshot| {
        UiTarget::starting("text speed")
            .find(snapshot)
            .map(|speed| &speed.text)
            != Some(&before)
    });
    me.caption("Reduced motion is a setting too");
    me.click_ui(UiTarget::starting("reduced motion"));
    me.caption(
        "Sound has a volume each: master, music, ambience, effects and voice, all halfway to start",
    );
    me.scroll_until(UiTarget::starting("reduced motion"), "Voice");
    me.caption("Halfway is the mix as balanced, with room to turn any of them up or down");
    me.show_mixer();
    let mut faders = Faders::default();
    me.caption("Music is the soundscape's first channel: turned down, the harbour theme fades out");
    faders.set(&mut me, "Music", 0.0);
    me.caption("Ambience is every other channel: down goes the surf, and the island falls silent");
    faders.set(&mut me, "Ambience", 0.0);
    me.caption("Effects are the game's sounds: in the quiet, your footsteps…");
    let home = me.come_to_rest();
    me.walk_by(Offset::new(3.0, 0.0));
    me.caption("…which go quiet too with effects turned down");
    faders.set(&mut me, "Effects", 0.0);
    me.walk_to(home);
    me.caption("Back to halfway, everything plays as balanced again");
    for fader in ["Music", "Ambience", "Effects"] {
        faders.set(&mut me, fader, 0.5);
    }
    me.hold();
    me.hide_mixer();
    me.caption("Where you put them is remembered for next time");
    me.caption("Esc closes the window you used last");
    for _ in LAYOUT {
        me.act(InputAction::Dismiss);
    }
    me.wait_until("every window to close", |snapshot| {
        LAYOUT
            .iter()
            .all(|(_, title, _)| UiTarget::text(title).find(snapshot).is_none())
    });

    me.caption("Voice is how characters speak: at halfway, Grisha's greeting babbles…");
    hear_out_greeting(&mut me);
    me.act(InputAction::ToggleSettings);
    me.scroll_until(UiTarget::starting("reduced motion"), "Voice");
    faders.set(&mut me, "Voice", 0.0);
    me.act(InputAction::Dismiss);
    me.caption("…and with voice turned down, the same greeting is silent");
    hear_out_greeting(&mut me);
}

fn inspect(me: &mut Player, icon: &str, item: &str) {
    me.act_on_ui(InputAction::InspectItem, outside_card(icon));
    me.wait_until(&format!("the card of {item}"), |snapshot| {
        snapshot
            .item_card
            .is_some_and(|card| card.item.key(content()) == item)
    });
}

// The item card repeats the icon of the item it shows; only the copies outside it count.
fn outside_card(icon: &str) -> UiTarget {
    UiTarget::image(icon).and("outside the item card", |element, snapshot| {
        snapshot
            .item_card
            .is_none_or(|card| !card.rect.contains(element.rect.center()))
    })
}

fn hear_out_greeting(me: &mut Player) {
    me.talk_to("grisha");
    me.read_to_choices();
    me.leave_conversation();
}

// A thumb sits over its value along the track, so the track's width turns a value into a drag
// distance. Dragging one all the way down measures it.
#[derive(Default)]
struct Faders {
    track: Option<f32>,
}

const PAST_EMPTY: f32 = 300.0;
const TOLERANCE: f32 = 0.02;

impl Faders {
    fn set(&mut self, me: &mut Player, fader: &str, value: f32) {
        let before = me.find_ui(thumb(fader));
        let at = before.slider.expect("a slider");
        let by = match self.track {
            _ if value == 0.0 => -PAST_EMPTY,
            Some(track) => (value - at) * track,
            None => panic!("a fader is turned all the way down before any is set between"),
        };
        me.drag_ui(thumb(fader), Offset::new(by, 0.0));
        let reached = thumb(fader);
        let after = me.wait_for(
            &format!("the {fader} volume to reach {value}"),
            |snapshot| {
                reached
                    .find(snapshot)
                    .filter(|thumb| {
                        thumb
                            .slider
                            .is_some_and(|now| (now - value).abs() <= TOLERANCE)
                    })
                    .cloned()
            },
        );
        if value == 0.0 && at > 0.0 && self.track.is_none() {
            self.track = Some((before.rect.origin.x - after.rect.origin.x) / at);
        }
    }
}

// The slider thumb on the fader's row.
fn thumb(fader: &str) -> UiTarget {
    let label = UiTarget::text(fader);
    UiTarget::new(format!("the {fader} thumb"), move |element, snapshot| {
        element.slider.is_some()
            && label
                .find(snapshot)
                .is_some_and(|label| (element.rect.center().y - label.rect.center().y).abs() < 12.0)
    })
}
