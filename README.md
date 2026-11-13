# Konkan ghats atlas

A standalone desktop web app for comparing routes from Pune to beaches on the Konkan and Goa coasts.

## Open the app

Open `pune_to_konkan.html` in Chrome or Microsoft Edge. No server, API key or installation is required.

The route data and application code are embedded in the HTML. The basemap needs an internet connection.

English, Marathi and Hindi are supported. Unresolved native map names use the English source spelling instead of guessed translations.

For sharing, `pune_to_konkan_share.zip` contains only the standalone HTML.

## Build from source

Install Node.js with npm, then run:

```powershell
npm ci
npm run build
```

The build produces `pune_to_konkan.html`. It does not update the sharing ZIP.

## Verify changes

```powershell
npm test
npm run validate
npm run test:browser
```

Browser tests use installed Chrome and Microsoft Edge.

## Data and attribution

`data` contains the source records and cached evidence needed for reproducible builds and tests. Retain these files.

See `DATA-LICENSE.txt` and `THIRD-PARTY-NOTICES.txt` for data and dependency notices. The app includes source references and evidence downloads.

Route times and terrain samples are estimates, not live navigation or certified road surveys.
