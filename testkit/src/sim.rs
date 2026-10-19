use bevy_ecs::message::{Message, MessageCursor, MessageRegistry, Messages, message_update_system};
use bevy_ecs::prelude::*;
use bevy_ecs::schedule::{IntoScheduleConfigs, ScheduleLabel, SingleThreadedExecutor, SystemSet};
use bevy_ecs::system::ScheduleSystem;
use bevy_replicon::prelude::ToClients;
use bevy_time::Time;
use engine::core::content::{Content, ContentId, ContentRow};
use engine::core::math::Rng;
use engine::core::time::{Seconds, UnixMillis, UtcHour, WallClock};
use engine::systems::TICK_HZ;
use engine::systems::notification::NotificationSent;
use engine::systems::{area_state, plug_ins};

use crate::notices::{self, Notified};

/// A bare world holding a game's content, its clocks, its dice, and what an area's server keeps
/// besides, stepped tick by tick through only the systems a test adds, in the order it adds them.
/// Messages last two ticks, as the server's do.
pub struct Sim {
    pub world: World,
    schedule: Schedule,
    steps: usize,
}

#[derive(ScheduleLabel, Clone, Debug, PartialEq, Eq, Hash)]
struct Tick;

#[derive(SystemSet, Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct Step(usize);

impl Sim {
    pub fn new(content: Content) -> Sim {
        let mut world = World::new();
        world.insert_resource(Rng::new(drawn_seed()));
        world.insert_resource(Time::<()>::default());
        world.insert_resource(WallClock {
            now: UnixMillis(0),
            reset: UtcHour::MIDNIGHT,
        });
        plug_ins(&mut world);
        area_state(&mut world, &content);
        MessageRegistry::register_message::<ToClients<NotificationSent>>(&mut world);
        world.init_resource::<Notified>();
        let mut schedule = Schedule::new(Tick);
        schedule.set_executor(SingleThreadedExecutor::new());
        schedule.add_systems(
            (notices::collect, message_update_system)
                .chain()
                .in_set(Step(0)),
        );
        Sim {
            world,
            schedule,
            steps: 0,
        }
    }

    /// The row of `Row`'s table the test declared under `key`.
    pub fn id<Row: ContentRow>(&self, key: &str) -> ContentId<Row> {
        self.world
            .resource::<Content>()
            .by_key::<Row>(key)
            .unwrap_or_else(|| panic!("the test game has no {} row `{key}`", Row::TABLE))
    }

    /// Runs `systems` every tick, one after another in the order given, after those added before.
    pub fn add<M>(&mut self, systems: impl IntoScheduleConfigs<ScheduleSystem, M>) -> &mut Sim {
        let previous = Step(self.steps);
        self.steps += 1;
        let step = Step(self.steps);
        self.schedule.configure_sets(step.after(previous));
        self.schedule.add_systems(systems.chain().in_set(step));
        self
    }

    /// Lets the world carry messages of `M`, as an app that adds them does.
    pub fn message<M: Message>(&mut self) -> &mut Sim {
        if !self.world.contains_resource::<Messages<M>>() {
            MessageRegistry::register_message::<M>(&mut self.world);
        }
        self
    }

    /// Every message of `M` the cursor hasn't seen, of those still held.
    pub fn read<M: Message + Clone>(&mut self, cursor: &mut MessageCursor<M>) -> Vec<M> {
        self.message::<M>();
        let messages = self.world.resource::<Messages<M>>();
        cursor.read(messages).cloned().collect()
    }

    /// One tick: the clocks move on by the server's tick, then every added system runs once.
    pub fn tick(&mut self) {
        let period = TICK_HZ.period();
        self.world.resource_mut::<Time>().advance_by(period);
        let mut clock = self.world.resource_mut::<WallClock>();
        clock.now = clock.now.after(Seconds(period.as_secs_f32()));
        self.schedule.run(&mut self.world);
    }

    /// Ticks for up to `seconds` until `done` holds, and tells whether it did.
    pub fn run_until(&mut self, seconds: f32, mut done: impl FnMut(&mut World) -> bool) -> bool {
        let ticks = (seconds * TICK_HZ.0).ceil() as usize;
        for _ in 0..ticks {
            if done(&mut self.world) {
                return true;
            }
            self.tick();
        }
        done(&mut self.world)
    }

    pub fn run(&mut self, seconds: f32) {
        self.run_until(seconds, |_| false);
    }

    /// The wall clock jumps `seconds` ahead, as it does over a stretch nobody plays through, and
    /// the world catches up for half a second.
    pub fn later(&mut self, seconds: f32) {
        let mut clock = self.world.resource_mut::<WallClock>();
        clock.now = clock.now.after(Seconds(seconds));
        self.run(0.5);
    }
}

// Tests hold on any seed: the one drawn shows in a failing test's output, to play it out again.
pub fn drawn_seed() -> u64 {
    let seed = Rng::random_seed();
    eprintln!("rng seed {seed}");
    seed
}
