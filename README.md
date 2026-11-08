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
- Meervoudige selectie, dupliceren, snapping en orthografische aanzichten.
- Keyframes, een animatietijdlijn, vloeiende interpolatie en animatie-export.
- Godot-specifieke scènes, colliders en metadata voor levels. Levelbouw en gameplay horen bij de latere gamefase.
