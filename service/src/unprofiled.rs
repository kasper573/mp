pub use std::alloc::System as ServiceAllocator;

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

pub enum CpuProfiler {}

pub fn profiler(application: &str, enabled: bool, _sample_hz: u32) -> Option<CpuProfiler> {
    assert!(
        !enabled,
        "{application}: CPU profiling runs only on Linux and macOS"
    );
    None
}

pub async fn heap_profile() -> Response {
    (
        StatusCode::NOT_FOUND,
        "heap profiling runs only on Linux and macOS",
    )
        .into_response()
}
