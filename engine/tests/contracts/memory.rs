use engine::core::content::Content;
use engine::core::script::Value;
use engine::core::time::{Seconds, UnixMillis, UtcHour, WallClock};
use engine::systems::area::AreaDef;
use engine::systems::area::transition::{self, Crossing};
use engine::systems::memory::{self, Memory, MemoryDef, MemoryId};
use engine::systems::movement::position;
use serde_json::json;
use testkit::{Game, Map, Sim};

const HOUR: u64 = 3_600_000;

#[test]
fn a_memory_reads_as_zero_until_set_and_again_once_forgotten() {
    let content = memories().load();
    let bribed = id(&content, "bribed");
    let clock = at(100 * HOUR);
    let mut memory = Memory::default();
    assert_eq!(memory.get(&content, bribed, clock), Value::Bool(false));
    memory.set(&content, bribed, Value::Bool(true), clock);
    assert_eq!(
        memory.get(&content, bribed, later(clock, 1e7)),
        Value::Bool(true)
    );
    memory.forget(bribed);
    assert_eq!(memory.get(&content, bribed, clock), Value::Bool(false));
}

#[test]
fn a_memory_keeps_the_time_it_was_last_set() {
    let content = memories().load();
    let grudge = id(&content, "grudge");
    let start = at(100 * HOUR);
    let mut memory = Memory::default();
    memory.set(&content, grudge, Value::Bool(true), start);
    assert!(memory.set_within(&content, grudge, Seconds(1_800.0), later(start, 1_799.0)));
    assert!(!memory.set_within(&content, grudge, Seconds(1_800.0), later(start, 1_800.0)));
    assert!(memory.is_set(&content, grudge, later(start, 1_800.0)));
}

#[test]
fn integer_memories_hold_a_count() {
    let content = memories().load();
    let visits = id(&content, "visits");
    let start = at(100 * HOUR);
    let mut memory = Memory::default();
    assert_eq!(memory.get(&content, visits, start), Value::Int(0));
    memory.set(&content, visits, Value::Int(3), start);
    assert_eq!(memory.get(&content, visits, start), Value::Int(3));
}

#[test]
fn daily_memories_end_at_the_reset_hour() {
    let content = memories().load();
    let looted = id(&content, "looted");
    let before_reset = at(100 * 24 * HOUR + 3 * HOUR);
    let mut memory = Memory::default();
    memory.set(&content, looted, Value::Bool(true), before_reset);
    assert!(memory.is_set(&content, looted, later(before_reset, 3_599.0)));
    assert!(!memory.is_set(&content, looted, later(before_reset, 3_600.0)));
}

#[test]
fn leaving_an_area_forgets_what_only_lasts_there() {
    let mut sim = Sim::new(
        memories()
            .area("village", &Map::open(5, 5), json!([]))
            .area("forest", &Map::open(5, 5), json!([]))
            .hero("village", 2.0, 2.0)
            .load(),
    );
    sim.serve("village");
    let player = sim.join(1);
    let content = sim.world.resource::<Content>().clone();
    let [fighting, grudge] = [id(&content, "fighting"), id(&content, "grudge")];
    let clock = *sim.world.resource::<WallClock>();
    let dest = position(&sim.world, player).expect("position");
    let mut memory = Memory::default();
    memory.set(&content, fighting, Value::Bool(true), clock);
    memory.set(&content, grudge, Value::Bool(true), clock);
    let forest = sim.id::<AreaDef>("forest");
    sim.world.entity_mut(player).insert((
        memory,
        Crossing {
            dest_area: forest,
            dest,
        },
    ));

    let travelers = transition::departing(&mut sim.world);

    let carried = &travelers[0].state.memory;
    assert!(!carried.is_set(&content, fighting, clock));
    assert!(carried.is_set(&content, grudge, clock));
}

#[test]
fn the_world_reads_and_writes_a_players_memory() {
    let mut sim = Sim::new(
        memories()
            .area("village", &Map::open(5, 5), json!([]))
            .hero("village", 2.0, 2.0)
            .load(),
    );
    sim.serve("village");
    let player = sim.join(1);
    let sided = sim.id::<MemoryDef>("bribed");

    assert_eq!(memory::get(&sim.world, player, sided), Value::Bool(false));
    memory::set(&mut sim.world, player, sided, Value::Bool(true));
    assert_eq!(memory::get(&sim.world, player, sided), Value::Bool(true));
    memory::forget(&mut sim.world, player, sided);
    assert_eq!(memory::get(&sim.world, player, sided), Value::Bool(false));
}

fn memories() -> Game {
    let memory = |game: Game, key: &str, ty: &str, resets: &str| {
        game.row(
            "memory",
            key,
            json!({ "label": key, "type": ty, "resets": resets }),
        )
    };
    let game = memory(Game::new(), "bribed", "boolean", "never");
    let game = memory(game, "grudge", "boolean", "never");
    let game = memory(game, "visits", "integer", "never");
    let game = memory(game, "looted", "boolean", "daily");
    memory(game, "fighting", "boolean", "leaving_area")
}

fn id(content: &Content, key: &str) -> MemoryId {
    content.by_key::<MemoryDef>(key).expect("a declared memory")
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
