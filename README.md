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

Op het startscherm kies je **Model**, **Animatie**, **GFX**, **Levelblok** of **Prefab**. Bij modelprojecten vul je een naam in en kies je een leeg project of een startsjabloon. Je kunt ook een auteur en notities invullen. **Animatie** opent de zelfstandige Animation Creator.

Voeg een vorm of groep toe en selecteer die in de 3D-weergave of objectboom. Gebruik **G**, **R** en **S** voor verplaatsen, roteren en schalen. Je kunt waarden ook rechtstreeks invoeren. Posities zijn in meters, rotaties in graden. Een object dat naar een andere groep verhuist, behoudt zijn lokale transformatie.

Stel basiskleur, ruwheid en metaalheid in. Per object kun je één PNG- of JPEG-textuur tot 1,5 MB toevoegen. **Ctrl+Z** maakt een wijziging ongedaan. **Ctrl+Shift+Z** of **Ctrl+Y** voert die opnieuw uit. Gebruik op macOS **Cmd**.

**Lokaal bewaren** slaat één project per browserprofiel en site op. Het project opent opnieuw als je de editor herlaadt. De geschiedenis geldt voor de huidige sessie.

## Objecten bewerken

Gebruik **Ctrl+D** om een object of groep met inhoud te dupliceren. **Ctrl+C**, **Ctrl+X** en **Ctrl+V** kopiëren, knippen en plakken binnen de editor. Een duplicaat komt naast het origineel in dezelfde groep. Plakken voegt een kopie toe aan de geselecteerde groep, of op hetzelfde niveau als het geselecteerde object. Het klembord geldt voor het huidige tabblad en wordt geleegd bij herladen.

Gebruik **H** of de knop naast een object om het te tonen of te verbergen. Verborgen objecten blijven in je project en worden overgeslagen bij het exporteren van het model. Onder het werkgebied kun je het raster, snapping, lokale assen en draadmodelweergave instellen. Snapping gebruikt stappen van 0,25 m, 15° en 0,25 schaalpunt.

Editorsneltoetsen hebben voorrang buiten invoervelden als de browser ze doorgeeft. In invoervelden blijven de gebruikelijke sneltoetsen voor tekstbewerking beschikbaar. Sneltoetsen die de browser of het systeem zelf afhandelt, zoals tabblad sluiten, blijven beschikbaar.

## Animeren

### Animation Creator

1. Exporteer je model met **Exporteren… → GLB**. RS2-model-JSON en glTF met ingesloten buffers en afbeeldingen werken ook.
2. Ga naar het startscherm en kies **Animatie**. Importeer het bestand vóór je de projectnaam, clipnaam, beeldsnelheid en het eindframe instelt. Auteur en notities zijn optioneel.
3. Kies een object of bot in de modelhiërarchie en zet de afspeelkop op een frame. Kies **Positie**, **Rotatie** of **Schaal**. Een wijziging via de 3D-gizmo of numerieke invoer legt een keyframe op dat frame vast. Je kunt ook één kanaal, alle transformaties of de rustpose opnemen.
4. Download een **RS2-animatieproject** om verder te kunnen bewerken, of exporteer de actieve clip of alle clips als geanimeerde GLB of glTF. Open het bewerkbare project later via dezelfde importknop.

De Creator gebruikt het geïmporteerde model, zijn materialen en hiërarchie als uitgangspunt. Bestaande animatieclips uit het bronbestand worden niet overgenomen. De Creator ondersteunt transformaties van aanwezige botten. Zelf skeletons bouwen, IK en morph-keyframes vallen buiten deze versie.

#### Nieuwe gereedschappen

| Onderdeel | Functies |
| --- | --- |
| Import en projecten | GLB-import, ingesloten glTF-import, RS2-modelimport, importvalidatie, modelhiërarchie, zoeken op objectnaam, eigen projectdetails, bewerkbaar projectbestand opslaan en heropenen |
| Clips | Toevoegen, dupliceren, wisselen, hernoemen, verwijderen, beeldsnelheid wijzigen, eindframe instellen, bijsnijden op de afspeelkop |
| Tracks en keyframes | Aparte positie-, rotatie- en schaaltracks, numerieke invoer, gizmo-opname, alle kanalen opnemen, rustpose opnemen, keyframes vervangen, kopiëren, knippen, plakken, dupliceren, verwijderen, één frame naar links of rechts verplaatsen, naar vorige of volgende key springen, track dempen, solo bekijken, omkeren of verwijderen, vijf interpolatiemodi en undo/redo |
| Afspelen en camera | Afspelen, pauzeren, stoppen, herhalen, snelheidskeuze, begin/einde, één frame vooruit/achteruit, numerieke afspeelkop, scrubben, klikbare tijdlijn, tijdlijnzoom, perspectief en drie orthografische aanzichten, raster en assen aan/uit, lokale assen, gizmo aan/uit, centreren en camerastand herstellen |
| Modeleditor | Vijf extra vormen, dupliceren op dezelfde plek, selectie isoleren, alles tonen, bovenliggende groep of eerste kind selecteren, transformaties vergrendelen, centreren op X/Z, positie en rotatie afronden, schaal gelijkmaken, spiegelen per as, vijf materiaalpresets, UV-herhaling, verschuiving, rotatie en UV-reset |

Gebruik **Spatie** voor afspelen, **pijltjes** om frames te stappen en **Shift+pijltjes** voor tien frames tegelijk. **K** neemt de huidige waarde op en **F** centreert het object. In invoervelden blijven de gebruikelijke tekst- en navigatietoetsen werken.

### Snelle tijdlijn in de modeleditor

In het rechterpaneel wissel je tussen **Transform** en **Element**. Onder **Omlijning** kun je groepen uitklappen, objecten zoeken, een selectie groeperen of objecten naar een groep slepen. Een groepswijziging behoudt de lokale transformatie. Selecteer de groep zelf en klik op **Groep animeren** om haar positie, rotatie of schaal vast te leggen. De inhoud beweegt mee.

In de Animation Creator kun je de diamanten op de tijdlijn naar een vrij frame slepen. **Heen en terug** speelt een herhalende clip om en om voorwaarts en achterwaarts af. De 3D-preview interpoleert tijdens het afspelen tussen de projectframes.

Open **Animeren** in het werkblad. Selecteer een object of groep, zet de tijdcursor op een tijdstip en klik op **Keyframe opnemen** om de huidige positie, rotatie en schaal vast te leggen. Neem op andere tijdstippen nieuwe poses op. Met **Voorbeeld tonen** bekijk je de pose op de cursor. **Afspelen** laat de animatie herhalen. Met **Pose bewerken** keer je terug naar de bewerkbare scène. De interpolatie geldt voor het hele project. Bij vloeiende interpolatie worden tussenposes gebakken op de ingestelde beeldsnelheid.

## Exporteren naar Godot 4

Open **Exporteren…** en kies GLB, glTF, Godot 4 ZIP of RS2-projectgegevens (JSON). Voor 3D-export kun je bestandsnaam, selectie, schaalfactor, oorsprong, maximale textuurgrootte, verborgen objecten, texturen, animatie, metadata en losse transformaties instellen. Animatie vereist losse transformaties in glTF en schakelt die automatisch in. Hercentreren gebruikt de grenzen van de bewerkbare scène. De JSON-export bevat de volledige projectgegevens.

Het Godot-pakket gebruikt deze structuur.

```text
assets/
  models/<project>.glb
  textures/
  animations/
  presets/<project>.json (optioneel)
IMPORTEREN.txt
```

Pak de ZIP uit in een bestaand Godot 4-project en sleep het GLB vanuit het Bestandssysteem naar een scène. De preset bevat de RS2-editordata. Texturen zitten in het GLB. De mappen in de repository zijn bedoeld voor gedeelde RS2-assets.

## GitHub Pages

Een push naar `modelengine` start de build- en Pages-workflow. Stel bij **Settings → Pages → Build and deployment** de bron in op **GitHub Actions** en laat de omgeving `github-pages` deployments vanaf `modelengine` toe.

## Geavanceerde V1-features voor later

- GLB/glTF-import, meerdere lokaal bewaarde projecten en RS2-projecten openen vanuit bestanden.
- Mesh- en UV-bewerking, extra textuurkanalen en materiaalbibliotheken.
- Meervoudige selectie en orthografische aanzichten.
- Meerdere animatieclips, rigging en een deeltjeseditor voor GFX.
- Godot-specifieke scènes, colliders en metadata voor levels. Levelbouw en gameplay horen bij de latere gamefase.
