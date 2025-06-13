use axum::{
    extract::{State, WebSocketUpgrade},
    response::{Html, Json, Response},
    routing::{get, post},
    Router,
};
use axum_extra::TypedHeader;
use mp_rpc::{RpcRequest, RpcResponse, RpcRouter, FunctionHandler};
use mp_std::{generate_uuid, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing::info;

/// Server configuration
#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 3000,
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgresql://localhost/mp".to_string()),
        }
    }
}

/// Application state
#[derive(Clone)]
pub struct AppState {
    pub rpc_router: Arc<Mutex<RpcRouter>>,
    pub game_state: Arc<Mutex<GameState>>,
}

/// Simple game state representation
#[derive(Debug, Clone, Default)]
pub struct GameState {
    pub players: std::collections::HashMap<String, Player>,
}

/// Player data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub x: f32,
    pub y: f32,
}

/// RPC method inputs and outputs
#[derive(Serialize, Deserialize)]
pub struct GetVersionOutput {
    version: String,
}

#[derive(Serialize, Deserialize)]
pub struct JoinGameInput {
    player_name: String,
}

#[derive(Serialize, Deserialize)]
pub struct JoinGameOutput {
    player_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct MovePlayerInput {
    player_id: String,
    x: f32,
    y: f32,
}

#[derive(Serialize, Deserialize)]
pub struct MovePlayerOutput {
    success: bool,
}

/// Setup RPC routes
pub async fn setup_rpc_router() -> RpcRouter {
    let mut router = RpcRouter::new();

    // System methods
    router.register(
        "system.getVersion",
        FunctionHandler::new(|_: serde_json::Value| -> Result<GetVersionOutput> {
            Ok(GetVersionOutput {
                version: env!("CARGO_PKG_VERSION").to_string(),
            })
        }),
    );

    // Game methods
    router.register(
        "game.join",
        FunctionHandler::new(|input: JoinGameInput| -> Result<JoinGameOutput> {
            let player_id = generate_uuid().to_string();
            info!("Player {} joined with ID {}", input.player_name, player_id);
            Ok(JoinGameOutput { player_id })
        }),
    );

    router.register(
        "game.movePlayer",
        FunctionHandler::new(|input: MovePlayerInput| -> Result<MovePlayerOutput> {
            info!(
                "Player {} moved to ({}, {})",
                input.player_id, input.x, input.y
            );
            Ok(MovePlayerOutput { success: true })
        }),
    );

    router
}

/// Health check endpoint
pub async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now()
    }))
}

/// RPC endpoint
pub async fn rpc_handler(
    State(state): State<AppState>,
    Json(request): Json<RpcRequest>,
) -> Json<RpcResponse> {
    let router = state.rpc_router.lock().await;
    let response = router.handle_request(request).await;
    Json(response)
}

/// WebSocket upgrade handler
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    user_agent: Option<TypedHeader<axum_extra::headers::UserAgent>>,
) -> Response {
    let user_agent = if let Some(TypedHeader(user_agent)) = user_agent {
        user_agent.to_string()
    } else {
        String::from("Unknown browser")
    };
    info!("WebSocket connection from: {}", user_agent);
    ws.on_upgrade(handle_websocket)
}

/// Handle WebSocket connection
pub async fn handle_websocket(_socket: axum::extract::ws::WebSocket) {
    info!("WebSocket connection established");
    // For now, just handle basic WebSocket lifecycle
    // In a real implementation, this would handle game state synchronization
}

/// Create the main application router
pub async fn create_app() -> Result<Router> {
    let rpc_router = setup_rpc_router().await;
    
    let state = AppState {
        rpc_router: Arc::new(Mutex::new(rpc_router)),
        game_state: Arc::new(Mutex::new(GameState::default())),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/rpc", post(rpc_handler))
        .route("/ws", get(websocket_handler))
        .route("/", get(|| async { Html("MP Game Server") }))
        .layer(CorsLayer::permissive())
        .with_state(state);

    Ok(app)
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::default();

    info!("Starting MP Game Server on port {}", config.port);

    // Create application
    let app = create_app().await?;

    // Start server
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.port)).await?;
    info!("Server listening on http://0.0.0.0:{}", config.port);

    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;

    #[tokio::test]
    async fn test_health_check() {
        let app = create_app().await.unwrap();
        let server = TestServer::new(app).unwrap();

        let response = server.get("/health").await;
        assert_eq!(response.status_code(), 200);
        
        let json: serde_json::Value = response.json();
        assert_eq!(json["status"], "healthy");
    }

    #[tokio::test]
    async fn test_rpc_get_version() {
        let app = create_app().await.unwrap();
        let server = TestServer::new(app).unwrap();

        let request = RpcRequest {
            id: "test-1".to_string(),
            method: "system.getVersion".to_string(),
            params: serde_json::Value::Null,
        };

        let response = server.post("/rpc").json(&request).await;
        assert_eq!(response.status_code(), 200);
        
        let rpc_response: RpcResponse = response.json();
        assert_eq!(rpc_response.id, "test-1");
        assert!(rpc_response.error.is_none());
        
        let result: GetVersionOutput = serde_json::from_value(rpc_response.result.unwrap()).unwrap();
        assert_eq!(result.version, env!("CARGO_PKG_VERSION"));
    }
}