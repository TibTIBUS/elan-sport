# Décision après le rapport transmis par Thibaut

Rapport 0.0.6, premier passage guidé sur iPhone 16e, iOS déclaré 27.0, PWA. Ne pas confondre avec les anciens essais playback restaurés.

- Pompes : deux séries mesurées, normale 10/10 et rapide 10/10, sans perte de suivi. Première preuve enregistrée, distincte du retour oral antérieur positif de Thibaut.
- Réactivité : p95 44 ms sur 10 appuis.
- Modèle retéléchargé : 547 ms, prêt en 2675 ms, première analyse 109 ms, six images de préchauffage, gel écran max 228 ms.
- Analyse active : max 18 ms ; visage sur thread principal retenu provisoirement. Pose non évalué.
- Verrouillage : 164,2 s, mono/civile 0 ms d'écart, reprise audio interrupted → running, aucun ancien son signalé.
- Audio : Spotify préservé, mais réponses nombres = Non et priorité = Non. Ces points restent ouverts, ne pas les déclarer validés.
- 2 bips programmés en 109 s : mesure incohérente avec un signal 1/s. Le moteur JavaScript tournait (1048 boucles), mais le rapport n'établit pas que l'horloge audio avançait. Cause non démontrée.
- Lecture du labo : l'étape d'écoute guidée appelle playClip sans ensureAudio immédiatement avant ; piste de contexte suspendu, à confirmer sur l'appareil. Pas de modification du test de référence dans cette PR (sauf manifest séparé).
- Calibration 22 % / 24,4 % : amplitude plus faible qu'au précédent essai ; résultat positif sur ces deux séries seulement.

Conclusion : clôture du labo initial pour démarrer l'app manuelle. Pas besoin de refaire le parcours complet pour coder les minuteurs. Restent un second lancement et l'écoute ciblée des clips, à valider sur la première version utilisable. Aucun test Pose ni caméra de production livré à cette étape.
