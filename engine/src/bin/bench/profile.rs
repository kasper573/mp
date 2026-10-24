//! A fixed workload near the bench's budget crossover, profiled for allocations here and for CPU by
//! the `perf record` it runs under, which samples only the measured ticks. Argument: `dist` for
//! distributed players.

#[path = "play.rs"]
mod play;
#[path = "sim.rs"]
mod sim;

use std::alloc::{GlobalAlloc, Layout};
use std::cmp::Reverse;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};
use std::time::Instant;

use bevy_app::App;
use bevy_ecs::prelude::{Entity, With};
use bevy_replicon::prelude::Replicated;
use engine::systems::movement::Position;
use engine::systems::visibility::seen_by;
use serde::Deserialize;

use crate::sim::{Bench, load};

// The server's own allocator setup, counted, so the measured ticks allocate exactly as production
// does.
service::heap_profiling!(Counting, Counting);

static ALLOCS: AtomicU64 = AtomicU64::new(0);
static BYTES: AtomicU64 = AtomicU64::new(0);

struct Counting;

// SAFETY: every call goes unchanged to the services' allocator, which upholds GlobalAlloc's
// contract; counting touches only atomics and never allocates.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCS.fetch_add(1, Relaxed);
        BYTES.fetch_add(layout.size() as u64, Relaxed);
        unsafe { service::ServiceAllocator.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { service::ServiceAllocator.dealloc(ptr, layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        ALLOCS.fetch_add(1, Relaxed);
        if new_size > layout.size() {
            BYTES.fetch_add((new_size - layout.size()) as u64, Relaxed);
        }
        unsafe { service::ServiceAllocator.realloc(ptr, layout, new_size) }
    }
}

const AREAS: usize = 250; // near the current budget crossover: the representative heavy workload
const MEASURE: usize = 400;

#[derive(Deserialize)]
struct Env {
    content_dir: PathBuf,
    no_clients: Option<bool>,
    perf_control: PathBuf,
    perf_ack: PathBuf,
}

fn main() {
    let env: Env = envy::prefixed("RIFT_BENCH_")
        .from_env()
        .expect("RIFT_BENCH_* environment");
    let layout = if std::env::args().any(|arg| arg == "dist") {
        sim::Layout::Distributed
    } else {
        sim::Layout::Congested
    };
    let mut bench = Bench::new(AREAS, layout, &load(&env.content_dir));
    if !env.no_clients.unwrap_or(false) {
        bench.connect();
    }

    for _ in 0..sim::WARMUP {
        step(&mut bench);
    }

    report_aoi(&mut bench.worlds);
    report_changes(&mut bench.worlds);

    let mut perf = Perf::attach(&env.perf_control, &env.perf_ack);
    perf.send("enable");
    ALLOCS.store(0, Relaxed);
    BYTES.store(0, Relaxed);
    let started = Instant::now();
    for _ in 0..MEASURE {
        step(&mut bench);
    }
    let elapsed = started.elapsed();
    let allocs = ALLOCS.load(Relaxed);
    let bytes = BYTES.load(Relaxed);
    perf.send("disable");

    let ticks = MEASURE as f64;
    let per_tick = elapsed.as_secs_f64() * 1000.0 / ticks;
    println!("[profile] {AREAS} areas, full config (clients connected), {MEASURE} ticks");
    println!(
        "[profile] {per_tick:.2}ms/tick wall ({:.2}s total)",
        elapsed.as_secs_f64()
    );
    println!(
        "[profile] allocations: {:.0}/tick ({} total), {:.2} MiB/tick churn",
        allocs as f64 / ticks,
        allocs,
        bytes as f64 / ticks / (1024.0 * 1024.0),
    );
    if let Some(hwm) = peak_rss_kib() {
        println!("[profile] peak RSS: {:.1} MiB", hwm as f64 / 1024.0);
    }
}

/// Quantifies area-of-interest overlap in the (distributed-player) scenario: how many clients see
/// each replicated entity, and how many distinct AOIs exist. High avg viewers/entity means the
/// per-(client,entity) replication work is heavily redundant and an AOI-dedup optimization would
/// pay; ~1 means it would not. Uses the real `visibility::seen_by`, so it reflects the live rules.
/// Advances every world one tick on the calling thread only, so CPU samples attribute cleanly to
/// game systems instead of being scattered across rayon worker frames.
fn step(bench: &mut Bench) {
    let clock = bench.play();
    for app in &mut bench.worlds {
        app.insert_resource(clock);
        app.update();
    }
    bench.acknowledge_sent();
}

fn report_aoi(worlds: &mut [App]) {
    let mut subjects = 0u64;
    let mut viewer_pairs = 0u64; // sum over entities of viewer count = sum over clients of AOI size
    let mut max_viewers = 0usize;
    let mut clients = 0u64;
    let mut distinct_aois = 0u64;
    for app in worlds.iter_mut() {
        let world = app.world_mut();
        let entities: Vec<Entity> = world
            .query_filtered::<Entity, (With<Replicated>, With<Position>)>()
            .iter(world)
            .collect();
        let mut aoi: HashMap<Entity, Vec<u64>> = HashMap::new();
        for &entity in &entities {
            let viewers = seen_by(world, entity);
            subjects += 1;
            viewer_pairs += viewers.len() as u64;
            max_viewers = max_viewers.max(viewers.len());
            for client in viewers {
                aoi.entry(client).or_default().push(entity.to_bits());
            }
        }
        clients += aoi.len() as u64;
        let mut sets: Vec<Vec<u64>> = aoi
            .into_values()
            .map(|mut set| {
                set.sort_unstable();
                set
            })
            .collect();
        sets.sort();
        sets.dedup();
        distinct_aois += sets.len() as u64;
    }
    let avg_viewers = viewer_pairs as f64 / subjects.max(1) as f64;
    let avg_aoi = viewer_pairs as f64 / clients.max(1) as f64;
    println!(
        "[aoi] avg viewers/entity: {avg_viewers:.2}  (per-entity replication work repeated this many times)"
    );
    println!(
        "[aoi] avg AOI size: {avg_aoi:.1} entities/client, max viewers on one entity: {max_viewers}"
    );
    println!(
        "[aoi] distinct AOI permutations: {distinct_aois} of {clients} viewing clients ({:.1}% unique)",
        100.0 * distinct_aois as f64 / clients.max(1) as f64,
    );
}

fn peak_rss_kib() -> Option<u64> {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|status| {
            status
                .lines()
                .find_map(|line| line.strip_prefix("VmHWM:"))
                .and_then(|rest| rest.split_whitespace().next())
                .and_then(|kib| kib.parse().ok())
        })
}

/// Which replicated components change in a tick: every change is serialized for each viewer, so a
/// component written every tick without actually changing is pure replication waste.
fn report_changes(worlds: &mut [App]) {
    let mut counts: HashMap<String, u64> = HashMap::new();
    let mut entities = 0u64;
    let mut changed_entities = 0u64;
    for app in worlds.iter_mut() {
        let last = app.world_mut().change_tick();
        app.update();
        let world = app.world_mut();
        let this = world.change_tick();
        let replicated: Vec<Entity> = world
            .query_filtered::<Entity, With<Replicated>>()
            .iter(world)
            .collect();
        for entity in replicated {
            entities += 1;
            let mut any = false;
            let entity_ref = world.entity(entity);
            for &id in entity_ref.archetype().components() {
                let changed = entity_ref
                    .get_change_ticks_by_id(id)
                    .is_some_and(|ticks| ticks.is_changed(last, this));
                if changed {
                    any = true;
                    let name = world
                        .components()
                        .get_name(id)
                        .map(|name| name.to_string())
                        .unwrap_or_default();
                    *counts.entry(name).or_default() += 1;
                }
            }
            if any {
                changed_entities += 1;
            }
        }
    }
    let mut rows: Vec<_> = counts.into_iter().collect();
    rows.sort_by_key(|row| Reverse(row.1));
    println!("[changes] replicated entities: {entities}, changed this tick: {changed_entities}");
    for (name, count) in rows.iter().take(20) {
        println!("[changes] {count:>8}  {name}");
    }
}

/// The `perf record` this runs under, told through its control fifo when to sample.
struct Perf {
    control: File,
    ack: BufReader<File>,
}

impl Perf {
    fn attach(control: &Path, ack: &Path) -> Perf {
        Perf {
            control: OpenOptions::new()
                .write(true)
                .open(control)
                .expect("perf's control fifo: run under `just profile`"),
            ack: BufReader::new(File::open(ack).expect("perf's ack fifo")),
        }
    }

    // Answered once perf has acted, so no sample lands on the wrong side of the switch.
    fn send(&mut self, command: &str) {
        writeln!(self.control, "{command}").expect("perf takes the command");
        let mut ack = String::new();
        self.ack.read_line(&mut ack).expect("perf acknowledges");
    }
}
