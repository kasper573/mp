use driver::{Player, UiTarget, holding};
use game::core::math::Offset;
use game::systems::area::AreaId;
use game::systems::input::map::InputAction;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "travel",
    title: "Travel",
    summary: "Warps connect the areas of the world, some are locked, and each crossing plays a transition",
    play,
};

const TRANSITIONS: [(&str, &str); 6] = [
    (
        "Tile wave",
        "Tile wave: the tiles shrink to diamonds around you, and grow back where you land",
    ),
    (
        "Sweep",
        "Sweep: bands carry the old area off the way you walk, and bring the next in behind them",
    ),
    (
        "Iris",
        "Iris: a spotlight closes on you, and opens again where you arrive",
    ),
    (
        "Mosaic",
        "Mosaic: the area coarsens into blocks, steps over to the next, and resolves",
    ),
    (
        "Dither dissolve",
        "Dither dissolve: the area fizzles out pixel by pixel, and the next fizzles in around you",
    ),
    ("Fade", "Fade: plain and quick"),
];

fn play(shoot: &mut Shoot) {
    let player = shoot.join_as("traveler", None);
    let mut me = shoot.roll(player);
    me.caption("Warps lead to other areas — step onto one to cross");
    let seen = me.snapshot();
    let road = driver::portal(&seen, "forest-road").clone();
    me.walk_to(road.at);
    me.on_stage("halt");
    me.caption_top(
        "The forest road is locked without a pass: stand on it, and its warden stops you",
    );
    me.read_to_choices();
    me.caption_top("Twenty Gold buys a pass");
    me.hover_choice("Here, for your trouble.");
    me.hold();
    me.pick("Here, for your trouble.");
    me.on_stage("bribed");
    me.read_to_choices();
    me.pick("Goodbye.");
    me.conversation_over();
    me.wait_until("the pass in the bag", |snapshot| {
        holding(snapshot, "road_pass") == 1
    });
    me.caption("With the pass in your bag, the same warp takes you through: the island crumbles away, and the forest rises around you");
    me.show_mixer();
    me.cross("forest-road");
    me.caption("Welcome to the forest: its own music and birdsong crossfade in over the harbour's");
    me.caption("A camp's fire carries past its edge, louder the closer you walk");
    me.walk_by(Offset::new(3.0, -2.0));
    me.walk_by(Offset::new(2.0, -1.0));
    me.hold();
    me.hide_mixer();

    me.caption_top("Settings choose how a crossing looks");
    let home = seen.area.expect("the island");
    // Each is picked in town on the island: forest monsters don't wait while settings are open.
    cross_into(&mut me, home);
    let mut current = "Crumble";
    for (style, says) in TRANSITIONS {
        choose_transition(&mut me, current, style);
        current = style;
        me.caption(says);
        cross_into(&mut me, road.to);
        cross_into(&mut me, home);
    }
}

fn choose_transition(me: &mut Player, current: &str, next: &str) {
    me.act(InputAction::ToggleSettings);
    me.scroll_until("Audio", current);
    me.click_ui(current);
    me.hover_ui(next);
    me.click_ui(next);
    me.wait_until(&format!("{next} to be picked"), |snapshot| {
        UiTarget::text(next).find(snapshot).is_some()
            && UiTarget::text(current).find(snapshot).is_none()
    });
    me.act(InputAction::ToggleSettings);
    me.wait_until("the settings to close", |snapshot| {
        UiTarget::text(next).find(snapshot).is_none()
    });
}

// Through the nearest warp that leads there.
fn cross_into(me: &mut Player, area: AreaId) {
    let seen = me.snapshot();
    let here = seen.me.as_ref().expect("the player").at;
    let warp = seen
        .portals
        .iter()
        .filter(|portal| portal.to == area)
        .min_by(|a, b| a.at.distance_to(here).total_cmp(&b.at.distance_to(here)))
        .expect("a warp there")
        .name
        .clone();
    me.cross(&warp);
}
