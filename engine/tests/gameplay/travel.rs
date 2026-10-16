use driver::{area_key, beside_object, holding, object_at};

use crate::playtest;

#[test]
fn the_forest_road_holds_you_without_a_pass_and_crosses_with_one() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("forest_bound", Some(beside_object("island", "forest-road")));

    player.walk_to(object_at("island", "forest-road"));
    player.on_stage("halt");
    assert_eq!(area_key(&player.snapshot()), Some("island"));
    player.leave_conversation();

    player.talk_to("ilsa");
    player.read_to_choices();
    player.pick("Would a fish change your mind?");
    player.on_stage("fish");
    player.read_to_choices();
    player.pick("Enjoy it.");
    player.wait_until("Ilsa to hand over the pass", |snapshot| {
        holding(snapshot, "road_pass") == 1
    });

    let crossed = player.cross("forest-road");
    assert_eq!(area_key(&crossed), Some("forest"));
}
