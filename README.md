# Motorrad-Kraftsimulation (GitHub Pages)

Dieses Projekt ist eine statische Web-App.

## Lokal testen

Einfach `index.html` im Browser oeffnen.

## Auf GitHub Pages veroeffentlichen

1. Erstelle auf GitHub ein **neues leeres Repository** (z. B. `motorrad-kraefte`).
2. Fuehre im Projektordner diese Befehle aus (ersetze `<USER>` und `<REPO>`):

```bash
git add .
git commit -m "Initial version: motorcycle force simulation"
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

3. Auf GitHub: `Settings` -> `Pages` -> `Build and deployment`:
   - `Source`: **Deploy from a branch**
   - `Branch`: **main**
   - `Folder`: **/ (root)**

4. Nach 1-2 Minuten ist die App online unter:
   - `https://<USER>.github.io/<REPO>/`

## Updates veroeffentlichen

```bash
git add .
git commit -m "Update"
git push
```
