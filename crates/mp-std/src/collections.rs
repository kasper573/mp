use std::collections::HashMap;

/// Trait for working with record-like structures
pub trait RecordExt<K, V> {
    /// Get all values from the record
    fn values<'a>(&'a self) -> impl Iterator<Item = &'a V> where V: 'a;
}

impl<K, V> RecordExt<K, V> for HashMap<K, V> {
    fn values<'a>(&'a self) -> impl Iterator<Item = &'a V> where V: 'a {
        HashMap::values(self)
    }
}

/// Utility functions for collections
pub mod utils {
    use std::collections::HashMap;

    /// Create a vector from record values
    pub fn record_values<K, V>(record: &HashMap<K, V>) -> Vec<&V> {
        record.values().collect()
    }

    /// Get typed keys from a HashMap
    pub fn typed_keys<K: Clone, V>(record: &HashMap<K, V>) -> Vec<K> {
        record.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_record_values() {
        let mut map = HashMap::new();
        map.insert("a", 1);
        map.insert("b", 2);
        map.insert("c", 3);

        let values = utils::record_values(&map);
        assert_eq!(values.len(), 3);
        assert!(values.contains(&&1));
        assert!(values.contains(&&2));
        assert!(values.contains(&&3));
    }

    #[test]
    fn test_typed_keys() {
        let mut map = HashMap::new();
        map.insert("a", 1);
        map.insert("b", 2);

        let keys = utils::typed_keys(&map);
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"a"));
        assert!(keys.contains(&"b"));
    }
}