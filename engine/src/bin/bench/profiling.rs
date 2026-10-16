use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::Ordering::Relaxed;
use std::time::Instant;

use bevy_app::App;
use bevy_ecs::prelude::{Entity, With};
use bevy_replicon::prelude::Replicated;
use engine::core::content::Content;
use engine::systems::movement::Position;
use engine::systems::visibility::seen_by;
use serde::Deserialize;

use crate::sim;

const AREAS: usize = 250; // near the current budget crossover: the representative heavy workload
const MEASURE: usize = 400;

#[derive(Deserialize)]
struct Env {
    no_clients: Option<bool>,
}

pub fn run(out_dir: &Path, layout: sim::Layout, content: Content) {
    let env: Env = envy::prefixed("RIFT_BENCH_")
        .from_env()
        .expect("RIFT_BENCH_* environment");
    let (mut worlds, rosters) = sim::worlds(AREAS, layout, &content);
    if !env.no_clients.unwrap_or(false) {
        sim::connect(&mut worlds, &rosters);
    }

    for _ in 0..sim::WARMUP {
        sim::step_single_threaded(&mut worlds);
    }

    report_aoi(&mut worlds);
    report_changes(&mut worlds);

    let guard = pprof::ProfilerGuardBuilder::default()
        .frequency(999)
        .blocklist(&["libc", "libgcc", "pthread", "vdso"])
        .build()
        .expect("start pprof profiler");
    crate::ALLOCS.store(0, Relaxed);
    crate::BYTES.store(0, Relaxed);
    let started = Instant::now();
    for _ in 0..MEASURE {
        sim::step_single_threaded(&mut worlds);
    }
    let elapsed = started.elapsed();
    let allocs = crate::ALLOCS.load(Relaxed);
    let bytes = crate::BYTES.load(Relaxed);

    let report = guard.report().build().expect("build pprof report");
    print_hotspots(&report);
    let svg = out_dir.join("flamegraph.svg");
    report
        .flamegraph(File::create(&svg).expect("create flamegraph"))
        .expect("write flamegraph");
    {
        use pprof::protos::Message;
        let profile = report.pprof().expect("pprof profile");
        let buf = profile.write_to_bytes().expect("encode pprof");
        File::create(out_dir.join("profile.pb"))
            .expect("create profile.pb")
            .write_all(&buf)
            .expect("write profile.pb");
    }

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
    println!("[profile] flamegraph: {}", svg.display());
}

/// Quantifies area-of-interest overlap in the (distributed-player) scenario: how many clients see
/// each replicated entity, and how many distinct AOIs exist. High avg viewers/entity means the
/// per-(client,entity) replication work is heavily redundant and an AOI-dedup optimization would
/// pay; ~1 means it would not. Uses the real `visibility::seen_by`, so it reflects the live rules.
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

fn print_hotspots(report: &pprof::Report) {
    let mut total = 0i64;
    let mut self_time: HashMap<String, i64> = HashMap::new();
    let mut by_system: HashMap<String, i64> = HashMap::new();
    for (frames, &count) in &report.data {
        let count = count as i64;
        total += count;
        if let Some(leaf) = frames.frames.first().and_then(|group| group.first()) {
            *self_time.entry(symbol(leaf)).or_default() += count;
        }
        let owner = frames
            .frames
            .iter()
            .rev()
            .flat_map(|group| group.iter().rev())
            .find_map(|sym| attribute(&symbol(sym)))
            .unwrap_or_else(|| "other".to_string());
        *by_system.entry(owner).or_default() += count;
    }
    println!("\n[profile] CPU self time by owning system (of {total} samples):");
    print_ranked(&by_system, total);
    println!("\n[profile] CPU self time by leaf (top 25):");
    print_ranked(&self_time, total);
    println!();
}

/// The owning system/subsystem for a frame, scanning a stack root-first so the highest-level owner
/// wins (e.g. astar samples attribute to movement::advance).
fn attribute(name: &str) -> Option<String> {
    for prefix in ["engine::systems::", "engine::core::"] {
        if let Some(rest) = name.strip_prefix(prefix) {
            let trimmed: String = rest.split('<').next().unwrap_or(rest).to_string();
            return Some(format!("{prefix}{trimmed}"));
        }
    }
    if name.starts_with("bevy_replicon::") {
        return Some("bevy_replicon (replication)".to_string());
    }
    None
}

fn symbol(sym: &pprof::Symbol) -> String {
    let name = sym.name();
    name.split("::{{closure}}")
        .next()
        .unwrap_or(&name)
        .to_string()
}

fn print_ranked(map: &HashMap<String, i64>, total: i64) {
    let mut ranked: Vec<_> = map.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    for (name, &count) in ranked.into_iter().take(25) {
        println!(
            "[profile]   {:5.1}%  {}",
            100.0 * count as f64 / total as f64,
            name
        );
    }
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
    rows.sort_by(|a, b| b.1.cmp(&a.1));
    println!("[changes] replicated entities: {entities}, changed this tick: {changed_entities}");
    for (name, count) in rows.iter().take(20) {
        println!("[changes] {count:>8}  {name}");
    }
}
