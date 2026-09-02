(async () => {
  const files = ["c1.js", "c2.js", "c3.js", "c4.js", "c5.js", "c6.js"];
  const raw = "https://raw.githubusercontent.com/philosopherkk/hk-transit/main/";
  const parts = await Promise.all(files.map(async (f) => {
    let r = await fetch(f);
    if (!r.ok) r = await fetch(raw + f);
    if (!r.ok) throw new Error("Missing " + f);
    return r.text();
  }));
  const script = document.createElement("script");
  script.textContent = parts.join("");
  document.body.appendChild(script);
})().catch((err) => {
  const el = document.getElementById("status");
  if (el) el.textContent = "Failed to load app: " + err.message;
});
