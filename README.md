# Mémo EPS Agrégation — installation GitHub Pages

## Structure obligatoire
Tous les fichiers suivants doivent rester **à la racine** du dépôt :

- `index.html`
- `styles.css`
- `app.js`
- `eps-corpus.js` — **indispensable : contient les 909 cartes et les 138 pages de connaissances**
- `manifest.json`
- `sw.js`
- `icon.svg`, `icon-192.png`, `icon-512.png`
- `.nojekyll`

Il ne faut créer **ni dossier `data` ni dossier `icons`** pour cette version.

## Publication
1. Crée un dépôt GitHub (public ou privé selon ton besoin).
2. Dépose **le contenu du dossier** à la racine du dépôt, sans placer le dossier lui-même dans un sous-dossier.
3. Dans GitHub : `Settings` → `Pages` → branche `main` → dossier `/ (root)` → `Save`.
4. Ouvre l’adresse fournie par GitHub Pages.

En cas d’ancienne version déjà ouverte : recharge fortement la page (`Ctrl + F5`) une première fois. Le nouveau service worker remplacera ensuite l’ancien cache.
