use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bevy::prelude::Resource;
use serde::{Deserialize, Serialize};

#[derive(Resource, Clone)]
pub struct Session {
    pub authorization: String,
    pub roles: Vec<String>,
}

impl Session {
    pub fn from_access_token(access_token: &str) -> Session {
        Session {
            authorization: format!("Bearer {access_token}"),
            roles: TokenClaims::read_unverified(access_token)
                .map(|claims| claims.realm_access.roles)
                .unwrap_or_default(),
        }
    }
}

/// The claims of an access token the game reads, shaped as the identity provider issues them.
#[derive(Serialize, Deserialize, Default)]
pub struct TokenClaims {
    #[serde(default)]
    pub sub: String,
    #[serde(default)]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub realm_access: RealmAccess,
}

#[derive(Serialize, Deserialize, Default)]
pub struct RealmAccess {
    #[serde(default)]
    pub roles: Vec<String>,
}

impl TokenClaims {
    // Without verifying the signature: roles only gate client-side UI, and the server verifies the
    // token independently on every session request.
    pub fn read_unverified(token: &str) -> Option<TokenClaims> {
        let payload = token.split('.').nth(1)?;
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).ok()?).ok()
    }

    /// A token without a signature, which only a server that trusts every token takes.
    pub fn unsigned(&self) -> String {
        let claims = serde_json::to_vec(self).expect("serializable claims");
        format!(
            "{}.{}.",
            URL_SAFE_NO_PAD.encode("{}"),
            URL_SAFE_NO_PAD.encode(claims)
        )
    }
}
