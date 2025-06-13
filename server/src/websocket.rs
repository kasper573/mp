use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use tracing::{error, info};

use crate::AppState;

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    info!("WebSocket connection established");

    // Handle incoming messages
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(text)) => {
                info!("Received text message: {}", text);
                
                // Echo the message back for now
                if let Err(e) = socket.send(Message::Text(format!("Echo: {}", text))).await {
                    error!("Failed to send message: {}", e);
                    break;
                }
            }
            Ok(Message::Binary(data)) => {
                info!("Received binary message of {} bytes", data.len());
                
                // Echo binary data back
                if let Err(e) = socket.send(Message::Binary(data)).await {
                    error!("Failed to send binary message: {}", e);
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket connection closed");
                break;
            }
            Ok(Message::Ping(data)) => {
                if let Err(e) = socket.send(Message::Pong(data)).await {
                    error!("Failed to send pong: {}", e);
                    break;
                }
            }
            Ok(Message::Pong(_)) => {
                // Handle pong messages if needed
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
        }
    }

    info!("WebSocket connection closed");
}