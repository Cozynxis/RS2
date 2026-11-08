# RS2 Modelengine

Nederlandstalige webeditor voor 3D-modellen voor RS2, gebouwd met React, TypeScript, Vite en Three.js.

## Starten

Gebruik Node.js 24.

```sh
npm ci
npm run dev
npm run build
```

## Een model maken

Voeg een vorm of groep toe en selecteer die in de 3D-weergave of objectboom. Gebruik **G**, **R** en **S** voor verplaatsen, roteren en schalen. Je kunt waarden ook rechtstreeks invoeren. Posities zijn in meters, rotaties in graden. Een object dat naar een andere groep verhuist, behoudt zijn lokale transformatie.

Stel basiskleur, ruwheid en metaalheid in. Per object kun je één PNG- of JPEG-textuur tot 1,5 MB toevoegen. **Ctrl+Z** maakt een wijziging ongedaan. **Ctrl+Shift+Z** of **Ctrl+Y** voert die opnieuw uit. Gebruik op macOS **Cmd**.

**Lokaal bewaren** slaat één project per browserprofiel en site op. Het project opent opnieuw als je de editor herlaadt. De geschiedenis geldt voor de huidige sessie.

## Objecten bewerken

Gebruik **Ctrl+D** om een object of groep met inhoud te dupliceren. **Ctrl+C**, **Ctrl+X** en **Ctrl+V** kopiëren, knippen en plakken binnen de editor. Een duplicaat komt naast het origineel in dezelfde groep. Plakken voegt een kopie toe aan de geselecteerde groep, of op hetzelfde niveau als het geselecteerde object. Het klembord geldt voor het huidige tabblad en wordt geleegd bij herladen.

Gebruik **H** of de knop naast een object om het te tonen of te verbergen. Verborgen objecten blijven in je project en worden overgeslagen bij het exporteren van het model. Onder het werkgebied kun je het raster, snapping, lokale assen en draadmodelweergave instellen. Snapping gebruikt stappen van 0,25 m, 15° en 0,25 schaalpunt.

Editorsneltoetsen hebben voorrang buiten invoervelden als de browser ze doorgeeft. In invoervelden blijven de gebruikelijke sneltoetsen voor tekstbewerking beschikbaar. Sneltoetsen die de browser of het systeem zelf afhandelt, zoals tabblad sluiten, blijven beschikbaar.

## Exporteren naar Godot 4

**GLB exporteren** downloadt het model met hiërarchie, transformaties, PBR-materialen en ingesloten texturen. **Godot-pakket** maakt een ZIP met deze structuur.

```text
assets/
  models/<project>.glb
  textures/
  animations/
  presets/<project>.json
IMPORTEREN.txt
```

Pak de ZIP uit in een bestaand Godot 4-project en sleep het GLB vanuit het Bestandssysteem naar een scène. De preset bevat de RS2-editordata. Texturen zitten in het GLB. De mappen in de repository zijn bedoeld voor gedeelde RS2-assets.

## GitHub Pages

Een push naar `modelengine` start de build- en Pages-workflow. Stel bij **Settings → Pages → Build and deployment** de bron in op **GitHub Actions** en laat de omgeving `github-pages` deployments vanaf `modelengine` toe.

## Geavanceerde V1-features voor later

- GLB/glTF-import, meerdere projecten en presets openen vanuit bestanden.
- Mesh- en UV-bewerking, extra textuurkanalen en materiaalbibliotheken.
- Meervoudige selectie en orthografische aanzichten.
- Keyframes, een animatietijdlijn, vloeiende interpolatie en animatie-export.
- Godot-specifieke scènes, colliders en metadata voor levels. Levelbouw en gameplay horen bij de latere gamefase.
