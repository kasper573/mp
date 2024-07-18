import { api } from "./api";

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
