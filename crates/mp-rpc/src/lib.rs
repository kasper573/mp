use mp_std::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// RPC Request structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub id: String,
    pub method: String,
    pub params: serde_json::Value,
}

/// RPC Response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<RpcError>,
}

/// RPC Error structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// RPC Handler trait using boxed futures for dyn compatibility
pub trait RpcHandler: Send + Sync {
    fn handle(
        &self,
        params: serde_json::Value,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send + '_>>;
}

/// RPC Router for managing handlers
pub struct RpcRouter {
    handlers: HashMap<String, Arc<dyn RpcHandler>>,
}

impl RpcRouter {
    /// Create a new RPC router
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    /// Register a handler for a method
    pub fn register<H>(&mut self, method: &str, handler: H)
    where
        H: RpcHandler + 'static,
    {
        self.handlers.insert(method.to_string(), Arc::new(handler));
    }

    /// Handle an RPC request
    pub async fn handle_request(&self, request: RpcRequest) -> RpcResponse {
        match self.handlers.get(&request.method) {
            Some(handler) => match handler.handle(request.params).await {
                Ok(result) => RpcResponse {
                    id: request.id,
                    result: Some(result),
                    error: None,
                },
                Err(err) => RpcResponse {
                    id: request.id,
                    result: None,
                    error: Some(RpcError {
                        code: -1,
                        message: err.to_string(),
                        data: None,
                    }),
                },
            },
            None => RpcResponse {
                id: request.id,
                result: None,
                error: Some(RpcError {
                    code: -32601,
                    message: format!("Method '{}' not found", request.method),
                    data: None,
                }),
            },
        }
    }
}

impl Default for RpcRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple function-based RPC handler
pub struct FunctionHandler<F, I, O>
where
    F: Fn(I) -> Result<O> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    func: F,
    _phantom: std::marker::PhantomData<(I, O)>,
}

impl<F, I, O> FunctionHandler<F, I, O>
where
    F: Fn(I) -> Result<O> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    pub fn new(func: F) -> Self {
        Self {
            func,
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<F, I, O> RpcHandler for FunctionHandler<F, I, O>
where
    F: Fn(I) -> Result<O> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    fn handle(
        &self,
        params: serde_json::Value,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send + '_>> {
        Box::pin(async move {
            let input: I = serde_json::from_value(params)?;
            let output = (self.func)(input)?;
            Ok(serde_json::to_value(output)?)
        })
    }
}

/// Async function-based RPC handler
pub struct AsyncFunctionHandler<F, Fut, I, O>
where
    F: Fn(I) -> Fut + Send + Sync,
    Fut: Future<Output = Result<O>> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    func: F,
    _phantom: std::marker::PhantomData<(Fut, I, O)>,
}

impl<F, Fut, I, O> AsyncFunctionHandler<F, Fut, I, O>
where
    F: Fn(I) -> Fut + Send + Sync,
    Fut: Future<Output = Result<O>> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    pub fn new(func: F) -> Self {
        Self {
            func,
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<F, Fut, I, O> RpcHandler for AsyncFunctionHandler<F, Fut, I, O>
where
    F: Fn(I) -> Fut + Send + Sync,
    Fut: Future<Output = Result<O>> + Send + Sync,
    I: for<'de> Deserialize<'de> + Send + Sync,
    O: Serialize + Send + Sync,
{
    fn handle(
        &self,
        params: serde_json::Value,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send + '_>> {
        Box::pin(async move {
            let input: I = serde_json::from_value(params)?;
            let output = (self.func)(input).await?;
            Ok(serde_json::to_value(output)?)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize, Deserialize)]
    struct TestInput {
        value: i32,
    }

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct TestOutput {
        result: i32,
    }

    #[tokio::test]
    async fn test_function_handler() {
        let handler = FunctionHandler::new(|input: TestInput| -> Result<TestOutput> {
            Ok(TestOutput {
                result: input.value * 2,
            })
        });

        let params = serde_json::to_value(TestInput { value: 5 }).unwrap();
        let result = handler.handle(params).await.unwrap();
        let output: TestOutput = serde_json::from_value(result).unwrap();
        
        assert_eq!(output, TestOutput { result: 10 });
    }

    #[tokio::test]
    async fn test_async_function_handler() {
        let handler = AsyncFunctionHandler::new(|input: TestInput| async move {
            Ok(TestOutput {
                result: input.value * 3,
            })
        });

        let params = serde_json::to_value(TestInput { value: 5 }).unwrap();
        let result = handler.handle(params).await.unwrap();
        let output: TestOutput = serde_json::from_value(result).unwrap();
        
        assert_eq!(output, TestOutput { result: 15 });
    }

    #[tokio::test]
    async fn test_rpc_router() {
        let mut router = RpcRouter::new();
        
        router.register(
            "double",
            FunctionHandler::new(|input: TestInput| -> Result<TestOutput> {
                Ok(TestOutput {
                    result: input.value * 2,
                })
            }),
        );

        let request = RpcRequest {
            id: "test-1".to_string(),
            method: "double".to_string(),
            params: serde_json::to_value(TestInput { value: 7 }).unwrap(),
        };

        let response = router.handle_request(request).await;
        assert_eq!(response.id, "test-1");
        assert!(response.error.is_none());
        
        let output: TestOutput = serde_json::from_value(response.result.unwrap()).unwrap();
        assert_eq!(output, TestOutput { result: 14 });
    }

    #[tokio::test]
    async fn test_rpc_router_method_not_found() {
        let router = RpcRouter::new();
        
        let request = RpcRequest {
            id: "test-2".to_string(),
            method: "unknown".to_string(),
            params: serde_json::Value::Null,
        };

        let response = router.handle_request(request).await;
        assert_eq!(response.id, "test-2");
        assert!(response.result.is_none());
        
        let error = response.error.unwrap();
        assert_eq!(error.code, -32601);
        assert!(error.message.contains("Method 'unknown' not found"));
    }
}