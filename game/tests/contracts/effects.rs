use game::core::time::{Seconds, WallClock};
use game::systems::effect::{Effect, TimedEffect, TimedEffects};
use game::systems::stat::{self, StatKind};
use testkit::{Sim, spawn_area};

#[test]
fn a_timed_effect_stops_counting_the_moment_it_runs_out() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let clock = *sim.world().resource::<WallClock>();
    let base = stat::max_health(sim.world(), player);
    sim.world()
        .entity_mut(player)
        .insert(TimedEffects(vec![TimedEffect {
            effect: Effect::StatModifier(StatKind::MaxHealth.of(10.0)),
            until: clock.now.after(Seconds(1.0)),
        }]));
    assert_eq!(stat::max_health(sim.world(), player), base + 10.0);

    sim.world().insert_resource(WallClock {
        now: clock.now.after(Seconds(1.0)),
        ..clock
    });
    assert_eq!(stat::max_health(sim.world(), player), base);
}
