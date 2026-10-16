use std::net::Ipv4Addr;
use std::sync::Arc;

use engine::core::platform::{IdentityProvider, LocalFuture, ProviderPage};
use engine::systems::launch::OidcConfig;
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, CsrfToken, HttpRequest, HttpResponse, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;
use tiny_http::{Header, Response, Server};

/// Signs in in the system browser, which hands the sign-in back to a port of this machine's own.
pub struct BrowserSignIn {
    oidc: OidcConfig,
    agent: ureq::Agent,
}

impl BrowserSignIn {
    pub fn new(oidc: OidcConfig, agent: ureq::Agent) -> BrowserSignIn {
        BrowserSignIn { oidc, agent }
    }

    fn begin(&self, page: ProviderPage) -> Result<Pending, String> {
        let callback = Server::http((Ipv4Addr::LOCALHOST, 0))
            .map_err(|error| format!("Couldn't listen for the sign-in: {error}"))?;
        let port = callback
            .server_addr()
            .to_ip()
            .expect("a tcp listener")
            .port();
        let client = BasicClient::new(ClientId::new(self.oidc.audience.clone()))
            .set_auth_uri(page_url(&self.oidc.issuer, page)?)
            .set_token_uri(TokenUrl::new(self.oidc.token_uri.clone()).map_err(invalid)?)
            .set_redirect_uri(
                RedirectUrl::new(format!("http://{}:{port}{CALLBACK}", Ipv4Addr::LOCALHOST))
                    .map_err(invalid)?,
            );
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let (url, state) = client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("openid".to_owned()))
            .add_scope(Scope::new("profile".to_owned()))
            .set_pkce_challenge(challenge)
            .url();
        opener::open_browser(url.as_str())
            .map_err(|error| format!("Couldn't open your browser: {error}"))?;
        let agent = self.agent.clone();
        let exchange = move |code: String| {
            let token = client
                .exchange_code(AuthorizationCode::new(code))
                .set_pkce_verifier(verifier)
                .request(&|request: HttpRequest| send(&agent, request))
                .map_err(|error| format!("The sign-in didn't go through: {error}"))?;
            Ok(token.access_token().secret().clone())
        };
        Ok(Pending {
            callback: Arc::new(callback),
            state,
            exchange: Box::new(exchange),
        })
    }
}

impl IdentityProvider for BrowserSignIn {
    fn sign_in(&self, page: ProviderPage) -> LocalFuture<Result<String, String>> {
        let pending = self.begin(page);
        Box::pin(async move {
            let pending = pending?;
            let _hang_up = HangUp(pending.callback.clone());
            blocking::unblock(move || pending.finish()).await
        })
    }
}

const CALLBACK: &str = "/callback";

struct Pending {
    callback: Arc<Server>,
    state: CsrfToken,
    exchange: Box<dyn FnOnce(String) -> Result<String, String> + Send>,
}

impl Pending {
    fn finish(self) -> Result<String, String> {
        loop {
            let request = self
                .callback
                .recv()
                .map_err(|error| format!("The sign-in stopped: {error}"))?;
            let answer = request
                .url()
                .strip_prefix(CALLBACK)
                .and_then(|query| query.strip_prefix('?'))
                .and_then(|query| serde_urlencoded::from_str::<Answer>(query).ok())
                .filter(|answer| answer.state.as_deref() == Some(self.state.secret()));
            let Some(answer) = answer else {
                let _ = request.respond(Response::empty(404));
                continue;
            };
            let outcome = match answer.code {
                Some(code) => (self.exchange)(code),
                None => Err(answer
                    .error_description
                    .or(answer.error)
                    .unwrap_or_else(|| "The sign-in didn't finish.".to_owned())),
            };
            let page = match outcome {
                Ok(_) => SIGNED_IN_PAGE,
                Err(_) => NOT_SIGNED_IN_PAGE,
            };
            let _ = request.respond(Response::from_string(page).with_header(html()));
            return outcome;
        }
    }
}

/// Stops waiting on the browser once whoever asked for the sign-in gives up on it.
struct HangUp(Arc<Server>);

impl Drop for HangUp {
    fn drop(&mut self) {
        self.0.unblock();
    }
}

#[derive(Deserialize)]
struct Answer {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

// The identity provider is Keycloak, whose registration page takes the same request as its sign-in.
fn page_url(issuer: &str, page: ProviderPage) -> Result<AuthUrl, String> {
    let endpoint = match page {
        ProviderPage::SignIn => "auth",
        ProviderPage::CreateAccount => "registrations",
    };
    AuthUrl::new(format!("{issuer}/protocol/openid-connect/{endpoint}")).map_err(invalid)
}

fn send(agent: &ureq::Agent, request: HttpRequest) -> Result<HttpResponse, ureq::Error> {
    let (parts, mut body) = agent.run(request)?.into_parts();
    Ok(HttpResponse::from_parts(parts, body.read_to_vec()?))
}

fn invalid(error: oauth2::url::ParseError) -> String {
    format!("The sign-in settings hold a bad address: {error}")
}

fn html() -> Header {
    Header::from_bytes("Content-Type", "text/html; charset=utf-8").expect("a valid header")
}

const SIGNED_IN_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Signed in</title>\
<p>You're signed in. Close this tab and return to the game.</p>";

const NOT_SIGNED_IN_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Not signed in</title>\
<p>The sign-in didn't finish. Return to the game to try again.</p>";
