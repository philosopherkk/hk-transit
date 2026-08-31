# HK Transit

A publishable webpage that plans Hong Kong public-transport trips (MTR, bus, green minibus) from your current position to a destination, then ranks the **shortest** and **cheapest** options with live arrival times.

Live site after Pages is on:

`https://philosopherkk.github.io/hk-transit/`

## Publish on GitHub Pages

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Wait for the **Deploy GitHub Pages** workflow to finish.
4. The public URL is `https://<your-username>.github.io/hk-transit/`.

Location only works on HTTPS (GitHub Pages is fine). Allow location when the browser asks.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Data

- Routes and fares: [hkbus catalogue](https://data.hkbus.app/routeFareList.min.json)
- Live ETA: official KMB, Citybus, GMB and MTR open APIs
- MTR adult Octopus matrix: `data/mtr-fares.json`
