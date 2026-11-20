export const dev =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("dev") === "1";
export const edition = dev ? "dev" : "public";
