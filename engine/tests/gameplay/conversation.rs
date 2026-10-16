use driver::{at_rest, beside_object, beside_resident, open_ground_beside};
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::input::gestures::ClickClaim;

use crate::playtest;

#[test]
fn a_conversation_drops_world_clicks_until_it_is_left() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", Some(beside_resident("island", "grisha")));
    assert_eq!(player.talk_to("grisha").node, "hello");
    // At rest, so that a walk shows as a step away from here.
    let talking = player.wait_for("talking to lock commands", |snapshot| {
        snapshot.me.as_ref().filter(|me| me.locked && at_rest(me))?;
        Some(snapshot.clone())
    });
    let talking_at = talking.me.as_ref().expect("the player").at;

    let ground = open_ground_beside(&talking)
        .into_iter()
        .find(|tile| player.point_at_tile(*tile).claim == ClickClaim::Locked)
        .expect("open ground in view beside the conversation");
    assert_eq!(player.click().claim, ClickClaim::Locked);
    player.leave_conversation();
    let left = player.wait_for("leaving to release commands", |snapshot| {
        snapshot.me.clone().filter(|me| !me.locked)
    });
    assert!(
        left.at.distance(talking_at) < Tiles(0.5),
        "a click while talking walked"
    );

    let walked_to = player.walk_to(ground);
    assert!(
        walked_to.distance(talking_at) > Tiles(1.0),
        "a click after leaving never walked"
    );
}

#[test]
fn a_map_object_opens_its_own_conversation() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", Some(beside_object("island", "notice-board")));
    assert_eq!(player.interact_with("notice-board").node, "read");
    player.leave_conversation();
}
