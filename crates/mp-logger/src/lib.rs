use tracing::{debug, error, info, warn};

#[derive(Debug, Clone)]
pub struct Logger {
    service_name: String,
}

impl Logger {
    pub fn new(service_name: String) -> Self {
        Self { service_name }
    }

    pub fn info(&self, message: &str) {
        info!(service = %self.service_name, "{}", message);
    }

    pub fn warn(&self, message: &str) {
        warn!(service = %self.service_name, "{}", message);
    }

    pub fn error(&self, message: &str) {
        error!(service = %self.service_name, "{}", message);
    }

    pub fn debug(&self, message: &str) {
        debug!(service = %self.service_name, "{}", message);
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new("mp".to_string())
    }
}