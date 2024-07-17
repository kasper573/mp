import { v4 as uuid } from "uuid";
import { ApiClient } from "@mp/api-client";
import { env } from "./env";

const api = new ApiClient({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
  log: console.log,
});

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const form = document.querySelector("form")!;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  api.send("example.say", input.value);
  input.value = "";
});

api.subscribe("example.chat", (message) => {
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
