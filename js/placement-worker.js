import { generate } from "./habitats.js";
onmessage = (e) => {
  try {
    postMessage({ id: e.data.id, patch: generate(e.data.input) });
  } catch (err) {
    postMessage({ id: e.data.id, error: String(err) });
  }
};
