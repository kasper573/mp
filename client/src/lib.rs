use leptos::*;
use wasm_bindgen::prelude::*;
use web_sys::{WebSocket, MessageEvent};

#[component]
pub fn App() -> impl IntoView {
    let (connected, set_connected) = create_signal(false);
    let (messages, set_messages) = create_signal(Vec::<String>::new());
    let (message_input, set_message_input) = create_signal(String::new());
    
    let websocket = create_websocket();

    let send_message = move || {
        if let Some(ws) = websocket.get() {
            if let Err(e) = ws.send_with_str(&message_input.get()) {
                web_sys::console::log_1(&format!("Failed to send message: {:?}", e).into());
            }
            set_message_input.set(String::new());
        }
    };

    view! {
        <div class="app">
            <h1>"MP Game - Rust Client"</h1>
            
            <div class="connection-status">
                <p>"Connection Status: " {move || if connected.get() { "Connected" } else { "Disconnected" }}</p>
            </div>

            <div class="chat">
                <div class="messages">
                    <For
                        each=move || messages.get()
                        key=|message| message.clone()
                        children=move |message| {
                            view! {
                                <div class="message">{message}</div>
                            }
                        }
                    />
                </div>
                
                <div class="input-area">
                    <input
                        type="text"
                        placeholder="Enter message..."
                        prop:value=move || message_input.get()
                        on:input=move |ev| {
                            set_message_input.set(event_target_value(&ev));
                        }
                        on:keydown=move |ev| {
                            if ev.key() == "Enter" {
                                send_message();
                            }
                        }
                    />
                    <button on:click=move |_| send_message()>"Send"</button>
                </div>
            </div>
        </div>
    }
}

fn create_websocket() -> ReadSignal<Option<WebSocket>> {
    let (websocket, set_websocket) = create_signal(None::<WebSocket>);
    
    // Connect to WebSocket
    create_effect(move |_| {
        let ws_url = "ws://localhost:3000/ws";
        
        match WebSocket::new(ws_url) {
            Ok(ws) => {
                let ws_clone = ws.clone();
                
                // Set up event handlers
                let onopen_callback = Closure::wrap(Box::new(move |_| {
                    web_sys::console::log_1(&"WebSocket connected".into());
                }) as Box<dyn FnMut(JsValue)>);
                ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
                onopen_callback.forget();

                let onmessage_callback = Closure::wrap(Box::new(move |e: MessageEvent| {
                    if let Ok(txt) = e.data().dyn_into::<js_sys::JsString>() {
                        let message = txt.as_string().unwrap_or_default();
                        web_sys::console::log_1(&format!("Received: {}", message).into());
                    }
                }) as Box<dyn FnMut(MessageEvent)>);
                ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
                onmessage_callback.forget();

                let onerror_callback = Closure::wrap(Box::new(move |_| {
                    web_sys::console::log_1(&"WebSocket error".into());
                }) as Box<dyn FnMut(JsValue)>);
                ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
                onerror_callback.forget();

                let onclose_callback = Closure::wrap(Box::new(move |_| {
                    web_sys::console::log_1(&"WebSocket closed".into());
                }) as Box<dyn FnMut(JsValue)>);
                ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));
                onclose_callback.forget();

                set_websocket.set(Some(ws_clone));
            }
            Err(e) => {
                web_sys::console::log_1(&format!("Failed to create WebSocket: {:?}", e).into());
            }
        }
    });
    
    websocket
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    leptos::mount_to_body(App)
}