import { api } from "./api";

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const form = document.querySelector("form")!;
const cheatButton = document.querySelector("button#try-to-cheat")!;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  api.example.say(input.value);
  input.value = "";
});

api.example.chat.subscribe((message) => {
  chat.value += `${message.from}: ${message.contents}\n`;
});

cheatButton.addEventListener("click", () => {
  api.example.chat({ from: "server", contents: "I'm cheating!" });
});
