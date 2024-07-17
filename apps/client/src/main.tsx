import { v4 as uuid } from "uuid";
import { createApiClient } from "@mp/api-client";
import { env } from "./env";

const api = createApiClient({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
});

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const send = document.querySelector("button")!;

send.addEventListener("click", () => {
  api.events.example.say(input.value);
  input.value = "";
});

api.events.example.chat.subscribe((message) => {
  chat.value += `${message.from}: ${message.contents}\n`;
});

function getClientId() {
  let id = localStorage.getItem("client-id");
  if (id === null) {
    id = uuid();
    localStorage.setItem("client-id", id);
  }
  return id;
}
