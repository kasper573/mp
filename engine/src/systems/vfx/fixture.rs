use bevy_ecs::prelude::*;
use strum::{IntoStaticStr, VariantArray};

use crate::core::content::{Content, Fixture};
use crate::core::vfx::{ParamValue, VfxDef, VfxParams, VfxSite};

/// The vfx every game provides, played by the engine itself where damage, healing, defeat and a
/// level reached land, so skills, items and scripts never repeat them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, VariantArray, IntoStaticStr)]
#[strum(serialize_all = "snake_case")]
pub enum VfxFixture {
    DamageTaken,
    Healed,
    Defeated,
    LevelUp,
}

impl Fixture for VfxFixture {
    type Row = VfxDef;
}

pub fn play(world: &mut World, fixture: VfxFixture, site: VfxSite, params: &[(&str, f32)]) {
    let content = world.resource::<Content>().clone();
    super::spawn(world, fixture.id(&content), site, numbers(params));
}

pub fn play_for(
    world: &mut World,
    player: Entity,
    fixture: VfxFixture,
    site: VfxSite,
    params: &[(&str, f32)],
) {
    let content = world.resource::<Content>().clone();
    super::spawn_for(world, player, fixture.id(&content), site, numbers(params));
}

fn numbers(params: &[(&str, f32)]) -> VfxParams {
    VfxParams(
        params
            .iter()
            .map(|(name, value)| ((*name).to_owned(), ParamValue::Number(*value)))
            .collect(),
    )
}
