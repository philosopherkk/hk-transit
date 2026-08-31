(async () => {
  const parts = await Promise.all([
    fetch("part1.js").then((r) => r.text()),
    fetch("part2.js").then((r) => r.text()),
  ]);
  const script = document.createElement("script");
  script.textContent = parts.join("");
  document.body.appendChild(script);
})().catch((err) => {
  const el = document.getElementById("status");
  if (el) el.textContent = "Failed to load app: " + err.message;
});
