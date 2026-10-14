use game::core::math::Offset;

use crate::chapters::Chapter;
use crate::shoot::Shoot;

pub const CHAPTER: Chapter = Chapter {
    name: "explore",
    title: "Explore",
    summary: "Point and click to roam the island",
    play,
};

const ROUTE: [((f32, f32), &str); 4] = [
    (
        (4.0, 1.0),
        "Click the ground to walk there — the camera follows",
    ),
    (
        (5.0, -2.0),
        "Paths route around water, rocks and anything in the way",
    ),
    (
        (-3.0, -4.0),
        "Beaches, docks and palm groves — the island is open to explore",
    ),
    (
        (0.0, 0.0),
        "Town is safe ground: monsters roam the wilds beyond it, and fight back",
    ),
];

fn play(shoot: &mut Shoot) {
    let player = shoot.join_fresh();
    let mut me = shoot.roll(player);
    let spawn = me.come_to_rest();
    for ((x, y), says) in ROUTE {
        me.caption(says);
        me.walk_near(spawn + Offset::new(x, y));
    }
}
