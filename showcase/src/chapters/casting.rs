use driver::{
    Player, UiTarget, aiming, beside_other_player, east_of, npc_is, other_player,
    other_player_within, pack_ground, played, played_on, status_on_me,
};
use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use engine::core::vfx::VfxSite;
use engine::systems::input::map::InputAction;
use engine::systems::probe::ProbeSnapshot;

use crate::chapters::Chapter;
use crate::shoot::{Shoot, Star};

pub const CHAPTER: Chapter = Chapter {
    name: "casting",
    title: "Casting",
    summary: "Every way a skill can be aimed: yourself, one ally, one enemy, and areas of every shape",
    play,
};

const AREA: &str = "glimmercap";
const PREY: &str = "myconid";

fn play(shoot: &mut Shoot) {
    let ring = pack_ground(AREA, PREY);
    let player = shoot.join_as("arcanist", Some(east_of(AREA, ring, 5.0)));
    let mut friend = shoot.join_as("armsman", Some(east_of(AREA, ring, 6.0)));
    friend.in_world();
    let mut me = shoot.roll(player);
    stand_beside(&mut friend);
    me.caption_top(
        "Every skill has one targeting kind. On yourself: Ward fires the moment its key is pressed",
    );
    me.act(InputAction::Hotbar6);
    me.wait_until("warded", |snapshot| status_on_me(snapshot, "warded"));
    me.hold();
    me.caption_top(
        "One ally: Mend arms, and the click must land on a friend. Allies are the other players",
    );
    me.act(InputAction::Hotbar4);
    me.wait_until("Mend armed", aiming);
    let ally = other_player(&me.snapshot())
        .expect("the friend in view")
        .clone();
    me.point_at_tile(ally.at);
    me.hold();
    me.click();
    me.wait_until("the friend mended", |snapshot| {
        played_on(snapshot, "mend_glow", ally.id)
    });
    me.hold();
    me.caption_top(
        "One enemy: a click on a monster uses the basic attack, Spark; any other single-target skill is aimed the same way",
    );
    me.fight(
        |_, actor| npc_is(actor, PREY),
        |snapshot| !played(snapshot, "spark_hit").is_empty(),
    );
    me.hold();
    me.caption_top(
        "An area of enemies, a circle: Fireball lands on the point you aim at, walking into range first if it must",
    );
    aim_then_cast(&mut me, InputAction::Hotbar1, ring, |snapshot| {
        !played(snapshot, "fireball_blast").is_empty()
    });
    me.hold();
    me.caption_top(
        "Chain Lightning's circle picks out everything hostile inside it, and the bolt runs through each one",
    );
    aim_then_cast(&mut me, InputAction::Hotbar3, ring, chained_through_several);
    me.hold();
    me.caption_top("A line: Frost Lance reaches out from where you stand toward the pointer");
    aim_then_cast(&mut me, InputAction::Hotbar2, ring, |snapshot| {
        !played(snapshot, "frost_lance").is_empty()
    });
    me.hold();
    me.caption_top(
        "An area of allies, a rectangle: Sanctuary blesses everyone standing in it, the caster included",
    );
    friend.walk_toward(beside_other_player);
    let ally = me.wait_for("the friend beside me", |snapshot| {
        other_player_within(snapshot, 4.5)
    });
    aim_then_cast(&mut me, InputAction::Hotbar5, ally.at, |snapshot| {
        played_on(snapshot, "holy_motes", ally.id)
    });
    me.hold();
    me.caption_top("And a cone: the armsman's Cleave sweeps the arc in front of him");
    friend.act(InputAction::Hotbar1);
    friend.wait_until("Cleave armed", aiming);
    friend.point_at_tile(ring);
    friend.click();
    me.wait_until("the cleave", |snapshot| {
        !played(snapshot, "cleave_swoosh").is_empty()
    });
    me.hold();
    me.caption_top(
        "A passive, Arcane Mind, is aimed at nobody: it holds for as long as it is known",
    );
    me.act(InputAction::ToggleSkills);
    me.hover_ui(UiTarget::starting("Arcane Mind node"));
    me.hold();
    me.act(InputAction::ToggleSkills);
}

// The viewer sees where the skill is aimed before the click lands it.
fn aim_then_cast(
    me: &mut Star,
    slot: InputAction,
    at: Pos<Tiles>,
    done: impl Fn(&ProbeSnapshot) -> bool,
) {
    me.aim_skill(slot, at);
    me.hold();
    me.cast(done);
}

fn chained_through_several(snapshot: &ProbeSnapshot) -> bool {
    played(snapshot, "chain_lightning")
        .iter()
        .any(|bolt| matches!(&bolt.site, VfxSite::Path(stops) if stops.len() >= 3))
}

// The friend comes to stand at the star's shoulder.
fn stand_beside(friend: &mut Player) {
    friend.walk_toward(beside_other_player);
}
