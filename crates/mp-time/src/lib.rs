use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::interval;

/// Time span representation similar to TypeScript TimeSpan
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TimeSpan {
    milliseconds: i64,
}

impl TimeSpan {
    /// Create a new TimeSpan from milliseconds
    pub fn from_milliseconds(ms: i64) -> Self {
        Self { milliseconds: ms }
    }

    /// Create a new TimeSpan from seconds
    pub fn from_seconds(seconds: i64) -> Self {
        Self {
            milliseconds: seconds * 1000,
        }
    }

    /// Zero time span
    pub fn zero() -> Self {
        Self { milliseconds: 0 }
    }

    /// Get total milliseconds
    pub fn total_milliseconds(&self) -> i64 {
        self.milliseconds
    }

    /// Get total seconds
    pub fn total_seconds(&self) -> f64 {
        self.milliseconds as f64 / 1000.0
    }

    /// Convert to chrono Duration
    pub fn to_duration(&self) -> Duration {
        Duration::milliseconds(self.milliseconds)
    }

    /// Create from chrono Duration
    pub fn from_duration(duration: Duration) -> Self {
        Self {
            milliseconds: duration.num_milliseconds(),
        }
    }
}

/// Simplified ticker for regular interval execution
pub struct Ticker {
    task_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl Ticker {
    /// Create a new ticker
    pub fn new(options: TickerOptions) -> Self {
        Self {
            task_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Start the ticker with a simple middleware function
    pub async fn start<F>(&self, interval_timespan: TimeSpan, middleware: F)
    where
        F: Fn() -> Result<(), Box<dyn std::error::Error + Send + Sync>> + Send + Sync + 'static,
    {
        let mut task_handle = self.task_handle.lock().await;
        if task_handle.is_some() {
            panic!("Ticker is already running");
        }

        let interval_duration = std::time::Duration::from_millis(
            interval_timespan.total_milliseconds() as u64
        );

        let handle = tokio::spawn(async move {
            let mut interval = interval(interval_duration);
            
            loop {
                interval.tick().await;
                
                if let Err(err) = middleware() {
                    eprintln!("Ticker middleware error: {:?}", err);
                }
            }
        });

        *task_handle = Some(handle);
    }

    /// Stop the ticker
    pub async fn stop(&self) {
        let mut task_handle = self.task_handle.lock().await;
        if let Some(handle) = task_handle.take() {
            handle.abort();
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TickEvent {
    pub time_since_last_tick: TimeSpan,
    pub total_time_elapsed: TimeSpan,
}

#[derive(Default)]
pub struct TickerOptions {
    pub on_error: Option<String>, // Simplified - just store error message
}

/// Begin measuring time span - returns a function to get elapsed time
pub fn begin_measuring_time_span() -> impl Fn() -> TimeSpan {
    let start = Utc::now();
    move || TimeSpan::from_duration(Utc::now() - start)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration as TokioDuration};

    #[test]
    fn test_timespan_creation() {
        let ts = TimeSpan::from_milliseconds(1000);
        assert_eq!(ts.total_milliseconds(), 1000);
        assert_eq!(ts.total_seconds(), 1.0);
    }

    #[test]
    fn test_timespan_from_seconds() {
        let ts = TimeSpan::from_seconds(5);
        assert_eq!(ts.total_milliseconds(), 5000);
        assert_eq!(ts.total_seconds(), 5.0);
    }

    #[test]
    fn test_timespan_zero() {
        let ts = TimeSpan::zero();
        assert_eq!(ts.total_milliseconds(), 0);
        assert_eq!(ts.total_seconds(), 0.0);
    }

    #[tokio::test]
    async fn test_ticker_basic() {
        let ticker = Ticker::new(TickerOptions::default());
        
        let counter = Arc::new(Mutex::new(0));
        let counter_clone = Arc::clone(&counter);
        
        ticker.start(TimeSpan::from_milliseconds(50), move || {
            let counter = counter_clone.clone();
            tokio::spawn(async move {
                let mut count = counter.lock().await;
                *count += 1;
            });
            Ok(())
        }).await;

        sleep(TokioDuration::from_millis(150)).await;
        ticker.stop().await;

        let count = *counter.lock().await;
        assert!(count >= 2); // Should have ticked at least 2 times
    }

    #[test]
    fn test_begin_measuring_time_span() {
        let measure = begin_measuring_time_span();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let elapsed = measure();
        assert!(elapsed.total_milliseconds() >= 10);
    }
}