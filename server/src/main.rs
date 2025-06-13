use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{info, warn};

mod config;
mod websocket;

use config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "OK".to_string(),
    })
}

async fn create_app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/ws", get(websocket::websocket_handler))
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(
                    CorsLayer::new()
                        .allow_origin(Any)
                        .allow_methods(Any)
                        .allow_headers(Any),
                ),
        )
        .with_state(state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load configuration
    let config = AppConfig::from_env()?;
    info!("Server configuration loaded");

    let state = AppState {
        config: Arc::new(config.clone()),
    };

    // Create the application
    let app = create_app(state).await;

    // Create listener
    let listener = TcpListener::bind(&config.server.bind_address).await?;
    info!("Server listening on {}", config.server.bind_address);

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}