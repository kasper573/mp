use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

pub use std::alloc::System as ServiceAllocator;

#[macro_export]
macro_rules! heap_profiling {
    () => {
        $crate::heap_profiling!($crate::ServiceAllocator, $crate::ServiceAllocator);
    };
    ($allocator:ty, $init:expr) => {
        #[global_allocator]
        static GLOBAL_ALLOCATOR: $allocator = $init;
    };
}

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
