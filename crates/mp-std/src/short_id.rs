use std::hash::{Hash, Hasher};

/// Generate a short ID (similar to the TS short-id package)
pub fn generate_short_id() -> String {
    let uuid = uuid::Uuid::new_v4();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    uuid.hash(&mut hasher);
    let hash = hasher.finish();
    
    // Convert to base36 for shorter representation
    base36::encode(hash)
}

/// Generate a short ID with custom length
pub fn generate_short_id_with_length(length: usize) -> String {
    let id = generate_short_id();
    if id.len() >= length {
        id[..length].to_string()
    } else {
        id
    }
}

mod base36 {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    
    pub fn encode(mut n: u64) -> String {
        if n == 0 {
            return "0".to_string();
        }
        
        let mut result = Vec::new();
        while n > 0 {
            result.push(ALPHABET[(n % 36) as usize]);
            n /= 36;
        }
        
        result.reverse();
        String::from_utf8(result).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_short_id() {
        let id1 = generate_short_id();
        let id2 = generate_short_id();
        
        // IDs should be different
        assert_ne!(id1, id2);
        
        // Should only contain valid base36 characters
        for c in id1.chars() {
            assert!(c.is_ascii_alphanumeric());
        }
    }

    #[test]
    fn test_generate_short_id_with_length() {
        let id = generate_short_id_with_length(8);
        assert!(id.len() <= 8);
    }
}