/// Common type aliases and utilities
use std::collections::HashMap;

/// Result type with anyhow::Error
pub type Result<T> = anyhow::Result<T>;

/// Type alias for entity records (like the TS version)
pub type EntityRecord<T> = HashMap<String, T>;

/// Type alias for ID
pub type Id = String;

/// Type alias for timestamp
pub type Timestamp = chrono::DateTime<chrono::Utc>;

/// Trait for items that have an ID
pub trait HasId {
    fn id(&self) -> &Id;
}

/// Trait for items that can be converted to/from JSON
pub trait JsonSerializable: serde::Serialize + for<'de> serde::Deserialize<'de> {}

impl<T> JsonSerializable for T where T: serde::Serialize + for<'de> serde::Deserialize<'de> {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct TestEntity {
        id: String,
        name: String,
    }

    impl HasId for TestEntity {
        fn id(&self) -> &Id {
            &self.id
        }
    }

    #[test]
    fn test_entity_record() {
        let mut record: EntityRecord<TestEntity> = HashMap::new();
        let entity = TestEntity {
            id: "test".to_string(),
            name: "Test Entity".to_string(),
        };
        
        record.insert(entity.id().clone(), entity);
        assert_eq!(record.len(), 1);
    }

    #[test]
    fn test_json_serializable() {
        let entity = TestEntity {
            id: "test".to_string(),
            name: "Test Entity".to_string(),
        };
        
        let json = serde_json::to_string(&entity).unwrap();
        let deserialized: TestEntity = serde_json::from_str(&json).unwrap();
        
        assert_eq!(entity.id, deserialized.id);
        assert_eq!(entity.name, deserialized.name);
    }
}