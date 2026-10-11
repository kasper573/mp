use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use crate::core::platform::LocalFuture;

/// Where synced files stay between visits, each under its blake3 hash. It is a cache: any entry may
/// be gone or wrong, so the reader verifies what it gets back.
pub trait ContentStore {
    fn list(&self) -> LocalFuture<Vec<String>>;
    fn read(&self, hash: &str) -> LocalFuture<Option<Vec<u8>>>;
    fn write(&self, hash: &str, bytes: Arc<[u8]>) -> LocalFuture<Result<(), String>>;
    fn remove(&self, hash: &str) -> LocalFuture<()>;
}

#[derive(Clone, Default)]
pub struct MemoryStore {
    entries: Rc<RefCell<HashMap<String, Arc<[u8]>>>>,
    refuses_writes: bool,
}

impl MemoryStore {
    pub fn refusing_writes() -> MemoryStore {
        MemoryStore {
            refuses_writes: true,
            ..MemoryStore::default()
        }
    }

    pub fn hashes(&self) -> Vec<String> {
        let mut hashes: Vec<String> = self.entries.borrow().keys().cloned().collect();
        hashes.sort();
        hashes
    }

    pub fn put(&self, hash: &str, bytes: &[u8]) {
        self.entries
            .borrow_mut()
            .insert(hash.to_owned(), Arc::from(bytes));
    }
}

impl ContentStore for MemoryStore {
    fn list(&self) -> LocalFuture<Vec<String>> {
        Box::pin(std::future::ready(self.hashes()))
    }

    fn read(&self, hash: &str) -> LocalFuture<Option<Vec<u8>>> {
        let found = self.entries.borrow().get(hash).map(|bytes| bytes.to_vec());
        Box::pin(std::future::ready(found))
    }

    fn write(&self, hash: &str, bytes: Arc<[u8]>) -> LocalFuture<Result<(), String>> {
        let result = if self.refuses_writes {
            Err("the store refuses writes".to_owned())
        } else {
            self.entries.borrow_mut().insert(hash.to_owned(), bytes);
            Ok(())
        };
        Box::pin(std::future::ready(result))
    }

    fn remove(&self, hash: &str) -> LocalFuture<()> {
        self.entries.borrow_mut().remove(hash);
        Box::pin(std::future::ready(()))
    }
}
