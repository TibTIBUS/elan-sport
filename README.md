# ÉLAN

Application personnelle pour le sport du matin. HTML, CSS et JavaScript en modules, sans build ni compte. GitHub Pages, chemins relatifs compatibles avec `/elan-sport/`.

## Version 0.1.0 — première application

- Chronomètre avec tours (meilleur et plus long).
- Compte à rebours et durées rapides.
- Intervalles, Tabata 20/10 × 8, repos final optionnel.
- EMOM, départ à chaque minute.
- AMRAP, comptage manuel +1/−1.
- Pré-décompte, pause, reprise, résumé, sauvegarde locale d'une activité et restauration explicite.
- Web Audio ambient, clips de départ/repos/fin, bips et Wake Lock. Aucun speechSynthesis dans l'app.
- Interface française sombre, grandes commandes, manifeste et icônes PWA.

Le laboratoire 0.0.6 reste à `lab.html` avec son propre manifest. Les séances personnalisées, l'historique/export, les stats et la caméra dans l'application seront les étapes suivantes. Le mode salle utilise un signal visuel aux changements de phase ; les flashs à chaque signal restent à compléter.

## Démarrer et tester

```sh
npm test
npm start
```

Ouvrir http://localhost:8080/ ; Node 20+ pour les tests, Python 3 pour le serveur. Aucun paquet npm requis. Ouvrir le dossier par HTTP, pas par `file://` (modules ES).

GitHub Pages publie `main` depuis la racine. Cette étape se prépare sur une branche et une PR ; fusionner seulement après revue. Pour installer l'app sur iPhone une fois publiée : Safari → Partager → Sur l'écran d'accueil. Une ancienne icône labo peut toujours pointer sur lab.html ; ajouter l'application depuis sa racine.

## Contrats et vérifications

- [Contrats V1.2](docs/CONTRACTS-V1.2.md)
- [Bilan labo 0.0.6](docs/LAB-0.0.6-DECISION.md)
- [Crédits audio](CREDITS.md)

Après verrouillage, la phase temporelle est reconstruite mais aucun son en arrière-plan n'est garanti. Une modification manuelle de l'heure pendant la veille ne permet pas de garantir le temps réel. Le mode silencieux iPhone peut rendre ambient muet. Les données locales ne sont pas une sauvegarde durable ; export/import prévu avec l'historique. Pas de garantie hors ligne en V1. Pas de télémétrie, pas d'images envoyées.
