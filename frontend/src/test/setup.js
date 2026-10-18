import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Newer Node versions expose an experimental global `localStorage` that shadows
// jsdom's and has no working methods unless started with --localstorage-file.
// Install a simple in-memory Storage so tests behave like a browser.
class MemoryStorage {
  #items = new Map();
  get length() {
    return this.#items.size;
  }
  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }
  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }
  setItem(key, value) {
    this.#items.set(key, String(value));
  }
  removeItem(key) {
    this.#items.delete(key);
  }
  clear() {
    this.#items.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
