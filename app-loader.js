(async () => {
  const files = ["c1.js", "c2.js", "c3.js", "c4.js", "c5.js"];
  const parts = await Promise.all(files.map((f) => fetch(f).then((r) => {
    if (!r.ok) throw new Error("Missing " + f);
    return r.text();
  })));
  const script = document.createElement("script");
  script.textContent = parts.join("");
  document.body.appendChild(script);
})().catch((err) => {
  const el = document.getElementById("status");
  if (el) el.textContent = "Failed to load app: " + err.message;
});
