import { v4 as uuid } from "uuid";
import { createClient } from "@mp/api-client";
import { env } from "./env";

const api = createClient({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
});

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const form = document.querySelector("form")!;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  api.emit("example.say", input.value);
  input.value = "";
});

api.on("example.chat", (message) => {
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
