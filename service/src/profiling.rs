pub use tikv_jemallocator::Jemalloc as ServiceAllocator;

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use pyroscope::backend::{BackendConfig, PprofConfig, pprof_backend};
use pyroscope::pyroscope::{PyroscopeAgent, PyroscopeAgentBuilder, PyroscopeAgentRunning};

pub struct CpuProfiler {
    _agent: PyroscopeAgent<PyroscopeAgentRunning>,
}

pub fn profiler(application: &str, enabled: bool, sample_hz: u32) -> Option<CpuProfiler> {
    if !enabled {
        return None;
    }
    #[derive(serde::Deserialize)]
    struct Profiling {
        base: String,
    }
    let profiling: Profiling = envy::prefixed("PYROSCOPE_")
        .from_env()
        .expect("PYROSCOPE_* environment");
    let agent = PyroscopeAgentBuilder::new(
        profiling.base,
        application,
        sample_hz,
        "pyroscope-rs",
        env!("CARGO_PKG_VERSION"),
        pprof_backend(
            PprofConfig {
                sample_rate: sample_hz,
            },
            BackendConfig::default(),
        ),
    )
    .build()
    .expect("build pyroscope agent")
    .start()
    .expect("start pyroscope agent");
    Some(CpuProfiler { _agent: agent })
}

pub async fn heap_profile() -> Response {
    let Some(controller) = jemalloc_pprof::PROF_CTL.as_ref() else {
        return (StatusCode::NOT_FOUND, "heap profiling is not enabled").into_response();
    };
    match controller.lock().await.dump_pprof() {
        Ok(pprof) => pprof.into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}
