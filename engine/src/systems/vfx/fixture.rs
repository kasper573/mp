use bevy_ecs::prelude::*;
use strum::{IntoStaticStr, VariantArray};

use crate::core::content::{Content, Fixture, Loading, RowCheck};
use crate::core::vfx::{ParamKind, ParamValue, VfxDef, VfxParams, VfxShaderDef, VfxSite};

/// The parameters the engine fills when it plays a fixture: a row that declares one of them
/// declares it of this kind, so what the engine hands over is what the row reads.
pub const AMOUNT: &str = "amount";
pub const LEVEL: &str = "level";
pub const HOSTILE: &str = "hostile";

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

/// The shaders every game provides, drawn by the engine itself: the ground an area skill is aimed
/// at.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, VariantArray, IntoStaticStr)]
#[strum(serialize_all = "snake_case")]
pub enum VfxShaderFixture {
    SkillArea,
}

impl Fixture for VfxShaderFixture {
    type Row = VfxShaderDef;
}

impl VfxFixture {
    /// What the engine fills when it plays the fixture.
    pub fn params(self) -> &'static [(&'static str, ParamKind)] {
        match self {
            VfxFixture::DamageTaken | VfxFixture::Healed => &[(AMOUNT, ParamKind::Number)],
            VfxFixture::Defeated => &[],
            VfxFixture::LevelUp => &[(LEVEL, ParamKind::Number)],
        }
    }
}

impl VfxShaderFixture {
    /// What the engine sets when it draws the fixture.
    pub fn params(self) -> &'static [(&'static str, ParamKind)] {
        match self {
            VfxShaderFixture::SkillArea => &[(HOSTILE, ParamKind::Bool)],
        }
    }
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

/// A fixture row that declares a parameter the engine fills declares it of the engine's kind.
pub fn check_all(loading: &mut Loading) {
    let content = loading.content();
    for fixture in VfxFixture::VARIANTS {
        let Some(id) = content.by_key::<VfxDef>(fixture.key()) else {
            continue;
        };
        let declared: Vec<(usize, &str, ParamKind)> = id
            .get(&content)
            .params
            .iter()
            .enumerate()
            .map(|(index, param)| (index, param.name.as_str(), param.kind))
            .collect();
        let mut check = RowCheck::default();
        check_kinds(&mut check, &declared, fixture.params());
        loading.row_errors(id, check);
    }
    for fixture in VfxShaderFixture::VARIANTS {
        let Some(id) = content.by_key::<VfxShaderDef>(fixture.key()) else {
            continue;
        };
        let declared: Vec<(usize, &str, ParamKind)> = id
            .get(&content)
            .params
            .iter()
            .enumerate()
            .map(|(index, param)| (index, param.name.as_str(), param.kind))
            .collect();
        let mut check = RowCheck::default();
        check_kinds(&mut check, &declared, fixture.params());
        loading.row_errors(id, check);
    }
}

fn check_kinds(
    check: &mut RowCheck,
    declared: &[(usize, &str, ParamKind)],
    engine: &[(&str, ParamKind)],
) {
    for (index, name, kind) in declared {
        if let Some((_, wanted)) = engine.iter().find(|(wanted, _)| wanted == name)
            && wanted != kind
        {
            check.error(
                format!("/params/{index}/kind"),
                "fixture parameter kind",
                kind.label(),
                format!("{}, as the engine fills {name}", wanted.label()),
            );
        }
    }
}

fn numbers(params: &[(&str, f32)]) -> VfxParams {
    VfxParams(
        params
            .iter()
            .map(|(name, value)| ((*name).to_owned(), ParamValue::Number(*value)))
            .collect(),
    )
}
