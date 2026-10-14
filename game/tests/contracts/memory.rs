use game::core::script::Value;
use game::core::time::{Seconds, UnixMillis, UtcHour, WallClock};
use game::systems::area::transition::{self, Crossing};
use game::systems::memory::{self, Memory};
use game::systems::movement::position;

use crate::support::{Sim, content, row, spawn_area};

const HOUR: u64 = 3_600_000;

#[test]
fn a_memory_reads_as_zero_until_set_and_again_once_forgotten() {
    let clock = at(100 * HOUR);
    let mut memory = Memory::default();
    assert_eq!(
        memory.get(content(), row("BribedIlsa"), clock),
        Value::Bool(false)
    );
    memory.set(content(), row("BribedIlsa"), Value::Bool(true), clock);
    assert_eq!(
        memory.get(content(), row("BribedIlsa"), later(clock, 1e7)),
        Value::Bool(true)
    );
    memory.forget(row("BribedIlsa"));
    assert_eq!(
        memory.get(content(), row("BribedIlsa"), clock),
        Value::Bool(false)
    );
}

#[test]
fn a_memory_keeps_the_time_it_was_last_set() {
    let start = at(100 * HOUR);
    let mut memory = Memory::default();
    memory.set(content(), row("PellGrudge"), Value::Bool(true), start);
    assert!(memory.set_within(
        content(),
        row("PellGrudge"),
        Seconds(1_800.0),
        later(start, 1_799.0)
    ));
    assert!(!memory.set_within(
        content(),
        row("PellGrudge"),
        Seconds(1_800.0),
        later(start, 1_800.0)
    ));
    assert!(memory.is_set(content(), row("PellGrudge"), later(start, 1_800.0)));
}

#[test]
fn integer_memories_hold_a_count() {
    let start = at(100 * HOUR);
    let mut memory = Memory::default();
    assert_eq!(
        memory.get(content(), row("TobbVisits"), start),
        Value::Int(0)
    );
    memory.set(content(), row("TobbVisits"), Value::Int(3), start);
    assert_eq!(
        memory.get(content(), row("TobbVisits"), start),
        Value::Int(3)
    );
}

#[test]
fn daily_memories_end_at_the_reset_hour() {
    let before_reset = at(100 * 24 * HOUR + 3 * HOUR);
    let mut memory = Memory::default();
    memory.set(
        content(),
        row("TideChestLooted"),
        Value::Bool(true),
        before_reset,
    );
    assert!(memory.is_set(
        content(),
        row("TideChestLooted"),
        later(before_reset, 3_599.0)
    ));
    assert!(!memory.is_set(
        content(),
        row("TideChestLooted"),
        later(before_reset, 3_600.0)
    ));
}

#[test]
fn leaving_an_area_forgets_what_only_lasts_there() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let clock = *sim.world().resource::<WallClock>();
    let dest = position(sim.world(), player).expect("position");
    let mut memory = Memory::default();
    memory.set(content(), row("PellFighting"), Value::Bool(true), clock);
    memory.set(content(), row("PellGrudge"), Value::Bool(true), clock);
    sim.world().entity_mut(player).insert((
        memory,
        Crossing {
            dest_area: row("Forest"),
            dest,
        },
    ));

    let travelers = transition::departing(sim.world());

    let carried = &travelers[0].state.memory;
    assert!(!carried.is_set(content(), row("PellFighting"), clock));
    assert!(carried.is_set(content(), row("PellGrudge"), clock));
}

#[test]
fn the_world_reads_and_writes_a_players_memory() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);

    assert_eq!(
        memory::get(sim.world(), player, row("SidedWithOrcs")),
        Value::Bool(false)
    );
    memory::set(sim.world(), player, row("SidedWithOrcs"), Value::Bool(true));
    assert_eq!(
        memory::get(sim.world(), player, row("SidedWithOrcs")),
        Value::Bool(true)
    );
    memory::forget(sim.world(), player, row("SidedWithOrcs"));
    assert_eq!(
        memory::get(sim.world(), player, row("SidedWithOrcs")),
        Value::Bool(false)
    );
}

fn at(millis: u64) -> WallClock {
    WallClock {
        now: UnixMillis(millis),
        reset: UtcHour::try_from(4).expect("hour"),
    }
}

fn later(clock: WallClock, seconds: f32) -> WallClock {
    WallClock {
        now: clock.now.after(Seconds(seconds)),
        ..clock
    }
}
