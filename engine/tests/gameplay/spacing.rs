use driver::{east_of, npc_is, pack_ground, surrounded_by};

use crate::playtest;

const AREA: &str = "amberwood";
const PACK: &str = "goblin";

#[test]
fn a_pack_surrounds_its_prey_each_on_a_tile_of_its_own() {
    let mut playtest = playtest();
    let ground = pack_ground(AREA, PACK);
    let mut me = playtest.join_as("swordsman", Some(east_of(AREA, ground, 2.0)));
    me.in_world();

    me.fight(
        |_, actor| npc_is(actor, PACK),
        |snapshot| surrounded_by(snapshot, PACK, 3),
    );
}
