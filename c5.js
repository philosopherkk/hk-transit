      <div><strong>${esc(label)}</strong><div class="muted">${esc(leg.from)} → ${esc(leg.to)}${leg.destName ? " · " + esc(leg.destName) : ""}</div></div>
      <div>${eta}</div></div>`;
  }

  function fmtMin(n) {
    n = Math.max(0, n);
    const m = Math.round(n);
    return `${m} ${t("min")}`;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """ }[c]));
  }

  function drawTrip(tr) {
    state.layer.clearLayers();
    if (!tr) return;
    const pts = [];
    if (state.origin) {
      L.circleMarker([state.origin.lat, state.origin.lng], { radius: 8, color: "#2ee0c0", fillColor: "#2ee0c0", fillOpacity: 1 }).addTo(state.layer).bindTooltip("A");
      pts.push([state.origin.lat, state.origin.lng]);
    }
    if (state.dest) {
      L.circleMarker([state.dest.lat, state.dest.lng], { radius: 8, color: "#ff6b6b", fillColor: "#ff6b6b", fillOpacity: 1 }).addTo(state.layer).bindTooltip("B");
      pts.push([state.dest.lat, state.dest.lng]);
    }
    if (tr.board && tr.board.location) {
      L.circleMarker([tr.board.location.lat, tr.board.location.lng], { radius: 6, color: "#f4c15d" }).addTo(state.layer);
      pts.push([tr.board.location.lat, tr.board.location.lng]);
    }
    if (pts.length >= 2) {
      L.polyline(pts, { color: "#2ee0c0", weight: 3, dashArray: "6 8", opacity: 0.7 }).addTo(state.layer);
      state.map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    }
  }

  function useGeo() {
    if (!navigator.geolocation) { setStatus(t("geoFail")); return; }
    setStatus(t("locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        state.origin = { lat, lng, name: state.lang === "zh" ? "目前位置" : "Current location" };
        $("originInput").value = state.origin.name;
        state.map.setView([lat, lng], 15);
        L.circleMarker([lat, lng], { radius: 8, color: "#2ee0c0", fillColor: "#2ee0c0", fillOpacity: 1 }).addTo(state.layer);
        setStatus(state.origin.name);
        if (state.dest) plan();
      },
      () => setStatus(t("geoFail")),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function tickClock() {
    $("clock").textContent = new Date().toLocaleString(state.lang === "zh" ? "zh-HK" : "en-HK", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function startEtaLoop() {
    clearInterval(state.etaTimer);
    state.etaTimer = setInterval(async () => {
      if (!state.trips.length) return;
      await refreshEtas(state.trips.slice(0, 6));
      rerankWithEta();
      renderTrips();
    }, 20000);
  }

  async function main() {
    initMap();
    renderChips();
    applyLang();
    bindSuggest($("originInput"), $("originSuggest"), (p) => {
      state.origin = p;
      $("originInput").value = p.name;
    });
    bindSuggest($("destInput"), $("destSuggest"), (p) => {
      state.dest = p;
      $("destInput").value = p.name;
    });
    $("destChips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-i]");
      if (!btn) return;
      const h = HOT[+btn.dataset.i];
      state.dest = { lat: h.lat, lng: h.lng, name: state.lang === "zh" ? h.zh : h.en };
      $("destInput").value = state.dest.name;
      if (state.origin) plan();
    });
    $("geoBtn").onclick = useGeo;
    $("planBtn").onclick = plan;
    $("swapBtn").onclick = () => {
      const a = state.origin, b = state.dest;
      state.origin = b; state.dest = a;
      $("originInput").value = (b && b.name) || "";
      $("destInput").value = (a && a.name) || "";
    };
    $("langBtn").onclick = () => {
      state.lang = state.lang === "en" ? "zh" : "en";
      applyLang();
    };
    tickClock();
    setInterval(tickClock, 1000);
    await loadData();
    startEtaLoop();
    useGeo();
  }

  main().catch((err) => setStatus("Startup failed: " + err.message));
})();
