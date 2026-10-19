use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::ServiceExt;
use axum::extract::Request;
use axum::routing::get;
use axum_prometheus::PrometheusMetricLayerBuilder;
use axum_prometheus::metrics_exporter_prometheus::PrometheusBuilder;
use tokio::net::TcpListener;
use tokio::sync::Notify;
use tower_http::normalize_path::NormalizePath;

pub use axum_prometheus::metrics_exporter_prometheus::PrometheusHandle;
pub use profiling::{CpuProfiler, ServiceAllocator, profiler};

#[macro_export]
macro_rules! heap_profiling {
    () => {
        $crate::heap_profiling!($crate::ServiceAllocator, $crate::ServiceAllocator);
    };
    ($allocator:ty, $init:expr) => {
        #[global_allocator]
        static GLOBAL_ALLOCATOR: $allocator = $init;

        // SAFETY: jemalloc reads its options from this one symbol at startup, and nothing else
        // exports it.
        #[unsafe(export_name = "malloc_conf")]
        pub static MALLOC_CONF: &[u8] = b"prof:true,prof_active:true,lg_prof_sample:19\0";
    };
}

// jemalloc doesn't build for MSVC and pyroscope samples only Linux and macOS, so elsewhere the
// services run on the system allocator, unprofiled.
#[cfg_attr(
    not(any(target_os = "linux", target_os = "macos")),
    path = "unprofiled.rs"
)]
mod profiling;

pub async fn serve(name: &str, at: SocketAddr, router: Router) {
    let app = track(router, recorder());
    let listener = TcpListener::bind(at)
        .await
        .unwrap_or_else(|error| panic!("could not bind {at}: {error}"));
    println!("{name} listening on {at}");
    let stop = Arc::new(Notify::new());
    let signal = stop.clone();
    ctrlc::set_handler(move || signal.notify_one()).expect("install stop handler");
    let app = NormalizePath::trim_trailing_slash(app);
    axum::serve(listener, ServiceExt::<Request>::into_make_service(app))
        .with_graceful_shutdown(async move { stop.notified().await })
        .await
        .expect("serve");
}

pub fn recorder() -> PrometheusHandle {
    metrics_process::Collector::default().describe();
    PrometheusBuilder::new()
        .set_buckets(&[
            0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5,
        ])
        .expect("non-empty histogram buckets")
        .install_recorder()
        .expect("prometheus recorder installs")
}

pub fn track(router: Router, handle: PrometheusHandle) -> Router {
    let (layer, handle) = PrometheusMetricLayerBuilder::new()
        .with_metrics_from_fn(|| handle)
        .build_pair();
    router
        .layer(layer)
        .route(
            "/metrics",
            get(move || async move {
                metrics_process::Collector::default().collect();
                handle.render()
            }),
        )
        .route("/debug/pprof/heap", get(profiling::heap_profile))
}
