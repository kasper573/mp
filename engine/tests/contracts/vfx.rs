use std::collections::BTreeMap;

use bevy_ecs::prelude::*;
use engine::core::geometry::{Degrees, Footprint, Radians, Shape};
use engine::core::math::{Offset, Pos, Rgba};
use engine::core::tiling::Tiles;
use engine::core::time::UnixMillis;
use engine::core::vfx::{ParamValue, VfxId, VfxInstance, VfxParams, VfxSite};
use engine::systems::GameSettings;
use engine::systems::class::{self, NodeKey};
use engine::systems::combat;
use engine::systems::movement::position;
use engine::systems::player::Owner;
use engine::systems::player::snapshot::{CharacterSnapshot, JoinAs, SnapshotSkill};
use engine::systems::skill::{self, CastAim, LearnSkillsRequest, Rank, UseSkillRequest};
use engine::systems::stat::{self, StatKind};
use engine::systems::visibility::Presence;

use testkit::{Sim, content, later, row, settle, spawn_area, target_dummy};

#[test]
fn damage_shows_on_the_one_hit_and_the_effect_passes() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let orc = orc_toward(&mut sim, player, 1.0);

    combat::inflict(sim.world(), orc, Some(player), 4.0);
    sim.tick();

    let shown = instances(&mut sim, row("DamageTaken"));
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].site, VfxSite::Actor(orc));

    later(&mut sim, 3.0);
    assert!(instances(&mut sim, row("DamageTaken")).is_empty());
}

#[test]
fn healing_shows_but_regeneration_does_not() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    stat::apply_damage(sim.world(), player, 6.0);
    sim.tick();

    stat::regenerate(sim.world(), player, 1.0);
    sim.tick();
    assert!(instances(&mut sim, row("Healed")).is_empty());

    stat::heal(sim.world(), player, 3.0);
    sim.tick();
    let shown = instances(&mut sim, row("Healed"));
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].site, VfxSite::Actor(player));
}

#[test]
fn a_level_reached_plays_on_the_actor_for_everyone_and_on_the_screen_for_the_player_alone() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    let client = sim.world().get::<Owner>(player).expect("owner").client;

    class::grant_xp(sim.world(), player, 30);
    sim.tick();

    let shown: Vec<(VfxInstance, Option<Presence>)> = sim
        .world()
        .query::<(&VfxInstance, Option<&Presence>)>()
        .iter(sim.world())
        .filter(|(instance, _)| instance.vfx == row::<VfxId>("LevelUp"))
        .map(|(instance, presence)| (instance.clone(), presence.cloned()))
        .collect();
    assert_eq!(shown.len(), 2);
    let on_actor = shown
        .iter()
        .find(|(instance, _)| instance.site == VfxSite::Actor(player))
        .expect("one on the actor");
    assert!(on_actor.1.is_none());
    let on_screen = shown
        .iter()
        .find(|(instance, _)| instance.site == VfxSite::Screen)
        .expect("one on the screen");
    assert!(matches!(on_screen.1, Some(Presence::For(shown)) if shown == client));
}

#[test]
fn a_skill_plays_its_vfx_on_every_target_and_once_on_its_area() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    sim.send(
        1,
        LearnSkillsRequest {
            ranks: vec![(NodeKey::from("cleave"), Rank(1))],
        },
    );
    settle(&mut sim);
    let near = orc_toward(&mut sim, player, 1.0);
    let far = orc_toward(&mut sim, player, 2.0);
    let full = stat::effective(sim.world(), near, StatKind::Health);
    let at = position(sim.world(), near).expect("position");

    sim.send(
        1,
        UseSkillRequest {
            skill: row("Cleave"),
            aim: CastAim::Point(at),
        },
    );
    assert!(sim.run_until(10.0, |world| {
        world
            .query::<&VfxInstance>()
            .iter(world)
            .any(|instance| instance.vfx == row::<VfxId>("SlashHit"))
    }));

    let mut hit: Vec<VfxSite> = instances(&mut sim, row("SlashHit"))
        .iter()
        .map(|instance| instance.site.clone())
        .collect();
    hit.sort_by_key(|site| format!("{site:?}"));
    let mut struck: Vec<VfxSite> = [near, far]
        .into_iter()
        .filter(|orc| stat::effective(sim.world(), *orc, StatKind::Health) < full)
        .map(VfxSite::Actor)
        .collect();
    struck.sort_by_key(|site| format!("{site:?}"));
    assert!(!struck.is_empty());
    assert_eq!(hit, struck);
    let sweeps = instances(&mut sim, row("CleaveSwoosh"));
    assert_eq!(sweeps.len(), 1);
    assert!(
        matches!(sweeps[0].site, VfxSite::Area(_)),
        "{:?}",
        sweeps[0].site
    );
}

#[test]
fn an_area_vfx_reaches_the_targets_it_struck_and_not_the_caster() {
    let mut sim = Sim::area(spawn_area());
    let settings = content().built::<GameSettings>();
    let mage = row("Mage");
    let mut snapshot =
        CharacterSnapshot::fresh(content(), "Caster", settings.player.get(content()));
    snapshot.class = mage;
    snapshot.xp = mage
        .get(content())
        .levels
        .iter()
        .map(|level| level.xp)
        .max()
        .unwrap_or(0);
    snapshot.skills = vec![SnapshotSkill {
        node: NodeKey::from("fireball"),
        rank: Rank::FIRST,
    }];
    let player = sim.join_as(
        1,
        JoinAs {
            snapshot,
            start: settings.initial_spawn,
        },
    );
    settle(&mut sim);
    let orc = orc_toward(&mut sim, player, 1.0);
    let feet = position(sim.world(), player).expect("position");

    sim.send(
        1,
        UseSkillRequest {
            skill: row("Fireball"),
            aim: CastAim::Point(feet),
        },
    );
    assert!(sim.run_until(10.0, |world| {
        world
            .query::<&VfxInstance>()
            .iter(world)
            .any(|instance| instance.vfx == row::<VfxId>("FireballBlast"))
    }));

    let blasts = instances(&mut sim, row("FireballBlast"));
    let circles: Vec<Footprint> = blasts
        .iter()
        .filter_map(|blast| match blast.site {
            VfxSite::Area(footprint) => Some(footprint),
            _ => None,
        })
        .collect();
    assert_eq!(circles.len(), 1);
    assert!(circles[0].contains(feet));
    let struck: Vec<(Entity, Radians)> = blasts
        .iter()
        .filter_map(|blast| match blast.site {
            VfxSite::Actor(actor) => Some((actor, blast.heading)),
            _ => None,
        })
        .collect();
    assert_eq!(struck, vec![(orc, circles[0].facing)]);
}

#[test]
fn an_instance_with_every_kind_of_parameter_survives_the_wire() {
    let sent = VfxInstance {
        vfx: row("DamageTaken"),
        site: VfxSite::Screen,
        params: VfxParams(vec![
            ("amount".to_owned(), ParamValue::Number(4.5)),
            ("tint".to_owned(), ParamValue::Color(Rgba(0xff00_80ff))),
        ]),
        heading: Radians(0.25),
        started: UnixMillis(1_000),
        until: UnixMillis(2_500),
    };
    let bytes = postcard::to_allocvec(&sent).expect("serializes");
    let received: VfxInstance = postcard::from_bytes(&bytes).expect("deserializes");
    assert_eq!(received, sent);
}

#[test]
fn an_instance_on_an_area_survives_the_wire() {
    let sent = VfxInstance {
        vfx: row("Sweep"),
        site: VfxSite::Area(Footprint {
            at: Pos::new(3.0, 4.0),
            facing: Radians(0.5),
            shape: Shape::Cone {
                angle: Degrees(90.0),
                length: Tiles(2.5),
            },
        }),
        params: VfxParams::default(),
        heading: Radians(0.25),
        started: UnixMillis(1_000),
        until: UnixMillis(2_500),
    };
    let bytes = postcard::to_allocvec(&sent).expect("serializes");
    let received: VfxInstance = postcard::from_bytes(&bytes).expect("deserializes");
    assert_eq!(received, sent);
}

fn instances(sim: &mut Sim, vfx: VfxId) -> Vec<VfxInstance> {
    let world = sim.world();
    world
        .query::<&VfxInstance>()
        .iter(world)
        .filter(|instance| instance.vfx == vfx)
        .cloned()
        .collect()
}

fn orc_toward(sim: &mut Sim, player: Entity, east: f32) -> Entity {
    let start = position(sim.world(), player).expect("position");
    let spot = sim.walkable_toward(start, Offset::new(east, 0.0));
    target_dummy(sim, row("Orc"), spot)
}

#[test]
fn a_path_vfx_runs_from_the_caster_through_its_targets_nearest_first() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    settle(&mut sim);
    sim.world().entity_mut(player).insert((
        class::Class { def: row("Mage") },
        skill::Learned(BTreeMap::from([(
            NodeKey::from("chain_lightning"),
            Rank(1),
        )])),
    ));
    let from = position(sim.world(), player).expect("position");
    let aimed = sim.walkable_toward(from, Offset::new(3.0, 0.0));
    let far = orc_toward(&mut sim, player, 5.0);
    let near = orc_toward(&mut sim, player, 2.0);
    let middle = orc_toward(&mut sim, player, 4.0);
    settle(&mut sim);

    sim.send(
        1,
        UseSkillRequest {
            skill: row("ChainLightning"),
            aim: CastAim::Point(aimed),
        },
    );
    assert!(sim.run_until(10.0, |world| {
        world
            .query::<&VfxInstance>()
            .iter(world)
            .any(|instance| instance.vfx == row::<VfxId>("ChainLightning"))
    }));

    let shown = instances(&mut sim, row("ChainLightning"));
    assert_eq!(shown.len(), 1);
    let stops: Vec<_> = [player, near, middle, far]
        .iter()
        .map(|who| position(sim.world(), *who).expect("position"))
        .collect();
    assert_eq!(shown[0].site, VfxSite::Path(stops));
}
