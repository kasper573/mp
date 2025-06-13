use serde::{Deserialize, Serialize};
use uuid::Uuid;
use async_trait::async_trait;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub id: Uuid,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub id: Uuid,
    pub result: Option<serde_json::Value>,
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

impl RpcError {
    pub fn new(code: i32, message: String) -> Self {
        Self {
            code,
            message,
            data: None,
        }
    }
}

#[async_trait]
pub trait RpcHandler {
    async fn handle(&self, request: RpcRequest) -> RpcResponse;
}

type BoxedHandler = Box<dyn RpcHandler + Send + Sync>;

pub struct RpcService {
    handlers: std::collections::HashMap<String, BoxedHandler>,
}

impl RpcService {
    pub fn new() -> Self {
        Self {
            handlers: std::collections::HashMap::new(),
        }
    }

    pub fn register_handler(&mut self, method: String, handler: BoxedHandler) {
        self.handlers.insert(method, handler);
    }

    pub async fn handle_request(&self, request: RpcRequest) -> RpcResponse {
        if let Some(handler) = self.handlers.get(&request.method) {
            handler.handle(request).await
        } else {
            RpcResponse {
                id: request.id,
                result: None,
                error: Some(RpcError::new(-32601, "Method not found".to_string())),
            }
        }
    }
}

impl Default for RpcService {
    fn default() -> Self {
        Self::new()
    }
}