# Crédits

## Voix des clips audio (`audio/clips/`)

- Générés automatiquement par `tools/clips/generate.py` (GitHub Action « Générer les clips vocaux ») avec [Piper](https://github.com/rhasspy/piper) et la voix `fr_FR-siwis-medium` ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)).
- Jeu de données SIWIS (voix française) : CC-BY 4.0, University of Edinburgh.
- Attention : ce modèle Piper est affiné à partir de la voix anglaise `lessac`, dont le jeu de données (Blizzard 2013) est soumis à une licence restreinte. Usage personnel non commercial uniquement. Une diffusion commerciale d'Élan exigerait une autre voix ou des enregistrements propres.
- L'empreinte SHA-256 du modèle utilisé est inscrite dans `audio/clips/manifest.json`.

## Bibliothèques

- MediaPipe Tasks Vision 1.0.1 (Apache 2.0), chargée depuis jsDelivr.

## Direction visuelle de l’application

- Adaptation du « Fitness App UI Kit for Gym Workout App Fitness Tracker Mobile App Gym Fitness Mobile App UI Kit (Community) » fourni par Thibaut, fichier Figma eNv3s9pOhAHBBL3pnM8d8b. Palette : anthracite #232323, citron #E2F163, violet #896CFE et lavande #B3A0FF. Cartes, boutons arrondis et navigation adaptés aux minuteurs ÉLAN.
- Interface recréée en HTML/CSS ; aucun écran PNG utilisé comme interface et aucune photo du kit redistribuée.
- Poppins et League Spartan chargées via Google Fonts ; polices système de repli si le service est inaccessible. Ce chargement requiert une connexion et effectue des requêtes vers Google Fonts.
