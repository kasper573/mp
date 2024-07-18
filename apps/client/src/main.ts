import { api } from "./api";

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const form = document.querySelector("form")!;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  api.send("example", "say", input.value);
  input.value = "";
});

api.subscribe("example", "chat", (message) => {
  chat.value += `${message.from}: ${message.contents}\n`;
});
