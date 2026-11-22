import { primeFieldAudio } from "./soundscape.js";
primeFieldAudio();
document.body.classList.add("public-edition", "paper-map");
if (location.hostname === "appassets.androidplatform.net")
  document.body.classList.add("app-boot-sync");
await import("./public-home.js");
