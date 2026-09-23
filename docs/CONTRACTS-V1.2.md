# ÉLAN — contrats V1.2

Statut : implémentation initiale 0.1.0. Les parties futures sont explicitement séparées du code livré.

## Périmètre livré

PWA HTML/CSS/ES modules sans build, 5 minuteurs et comptage manuel AMRAP, chronomètre avec tours, pré-décompte, pause/reprise, fin et résumé, paramètres locaux, reprise d'un brouillon, Wake Lock, bips et clips existants (départ/repos/fin et 3-2-1). GitHub Pages sous /elan-sport/. Aucun service worker : démarrage hors ligne non garanti, conformément au périmètre V1. Aucun appel à speechSynthesis dans l'application ; le laboratoire de référence conserve ses essais historiques.

Pas encore livrés : constructeur de séances, historique consultable/export/import, caméra dans l'app, records, encouragements et banque complète de nombres. Le laboratoire caméra reste disponible via lab.html et son manifest dédié.

## Horloges et états

Le moteur reçoit `{mono: () => milliseconds, wall: () => epochMilliseconds}`. Aucun timer ni accès navigateur dans le moteur. La boucle UI appelle `tick()` ; elle ne constitue pas l'horloge. Temps logique = temps déjà acquis + delta monotone. Toutes les phases ont des offsets sur une timeline immuable : une frontière est calculée depuis le début de séance, jamais depuis l'heure de livraison d'un callback.

Statuts : idle, running, paused, finished, interrupted. Phase distincte : precount, work, rest. L'état paused conserve exactement la phase et le temps. finished/interrupted sont terminaux. Un chronomètre arrêté volontairement est terminé ; un mode de durée fixe arrêté avant son échéance est interrompu. Les actions de comptage et tours sont rejetées hors travail actif.

Pré-décompte une fois (0/3/5/10 dans l'UI), avant l'effort. Les avertissements 3-2-1 ne doublonnent pas le bip périodique. Pas de repos final en intervalles sauf option ; repos nul autorisé. EMOM : départ à 0 puis chaque minute, aucune nouvelle série à la fin. AMRAP = durée fixe + répétitions corrigibles ; minimum 0. Tours chrono excluent pré-décompte et pauses.

Au masquage : invalidation audio, snapshot mono/wall/logique, sauvegarde et relâchement du Wake Lock. Les minuteurs continuent selon l'horloge civile ; aucun son garanti en arrière-plan. Au retour : reconstitution directe de la phase en cours, sans émettre toutes les phases manquées. Une pause volontaire n'avance jamais. L'écart mono/wall normal d'une veille ne constitue pas une anomalie. Recul civil ou retard civil supérieur à 2 s par rapport au delta monotone : pause et message. Un saut civil en avant pendant veille est indiscernable d'une absence réelle ; aucune garantie d'exactitude dans ce cas. Après reconstitution, nouvelles références mono/wall.

Après rechargement, restaurer le brouillon sur demande, recalculer les durées puis attendre une reprise explicite si non terminé. Une séance expirée affiche son résultat. Le brouillon est sauvé aux actions, au masquage et chaque seconde d'activité ; un arrêt forcé peut perdre jusqu'à environ une seconde de progrès non sauvegardé.

Futur caméra : préparation non chronométrée incluant chargement, plusieurs vraies images sans comptage, stabilisation, calibration, puis décompte de placement. Toute interruption invalide le cycle et impose une détection stable. Une phase de répétitions n'a aucune échéance prévisible et ne peut jamais être sautée par reconstruction civile.

## Événements et calendrier

`subscribe(listener)` retourne une fonction de désabonnement. Enveloppe : `{type, runId, eventId, revision, atMonoMs, ...payload}`. IDs uniques par instance/run, révision incrémentée à chaque invalidation ; pas d'événement audio directement émis depuis une vue ou un compteur.

- run:start {config}, run:paused, run:resumed
- run:finished / run:interrupted {snapshot}
- phase:start {phase}, phase:end {phaseId}
- rep:changed {count, delta, origin:manual|correction} ; caméra ajouté ultérieurement
- lap {lap:{index, atMs, durationMs}}
- schedule:invalidated {reason:start|pause|resume|hidden|foreground|finished|stop|restored}
- run:snapshot {snapshot, recovered:true}

**Décision d'implémentation** : le calendrier est exposé par la fonction pure `schedule(horizonMs)` plutôt que par un événement périodique schedule:updated. C'est toujours le moteur qui possède les échéances ; l'adaptateur audio lit ce contrat sans reconstruire les modes. Retour `{revision, signals:[{id,kind,phaseId,dueMonoMs,number?}]}`. kind = precount/start/rest/warning/interval/finish. Horizon par défaut 2 s, peut traverser plusieurs phases. Tolérance de livraison immédiate 80 ms ; événements plus anciens exclus. Le consommateur déduplique par ID et révision. Les signaux non prévisibles (objectif caméra) seront immédiats et soumis à expiration.

Snapshot : statut, config copiée au démarrage, phase/phase suivante, temps total et de phase, remainingMs (null pour chrono), workElapsedMs (hors pré-décompte, inclut repos), reps, laps, anomaly. Les objets retournés ne doivent pas être mutés par les abonnés.

## Audio

Un seul AudioContext, ambient si disponible. Clips existants locaux au repo et bips synthétiques. Pas de voix iOS ni repli speechSynthesis. Téléchargement/décodage des clips anticipé et non bloquant ; clip absent = bip seul. La V0.1 n'annonce pas chaque répétition : la banque n'est pas complète.

Horloge audio indépendante : conversion depuis mono à chaque programmation. État non running = annulation des sources et déduplication réinitialisée. ensure() seulement à un démarrage/reprise volontaire, bouton Réactiver et retour au premier plan si séance running. Pas de relance sur pause/arrêt/+1. Une tentative concurrente au maximum, attente UI bornée à 1,5 s. Running indique que le contexte fonctionne, jamais que l'utilisateur entend le son. Mode silencieux iPhone : ambient peut rester muet.

Pause/stop/hide : annuler les sources déjà programmées (pas seulement les setInterval). Reprise : calendrier frais, aucun rattrapage sonore. Fin naturelle : laisser finir le signal terminal déjà programmé. Bips 100 ms avant les clips de phase (320 ms pour fin), clips fixes courts. À l'intégration d'encouragements/comptage : bip/phase > objectif > nombre > encouragement ; annulations, expiration des nombres, pas de file accumulée. La clarté des nombres rapides et la priorité de la banque actuelle ne sont PAS encore validées au labo 0.0.6.

## Données locales

Préfixe elan:v1:. Aucun nom, image ou secret envoyé. `settings`: schemaVersion 1, precountSec, sound, voice, warning3, intervalSec, volume, gym. `selected`: mode. `config:<mode>`: dernière configuration valide.

`active`: schemaVersion 1, runId, config, status, savedAt (epoch ms), elapsedMs (logique, inclut pré-décompte), startedAt, reps, laps[], corrections[{atMs,delta,origin}]. Les clés labo sont indépendantes. Un stockage refusé affiche un avertissement et ne bloque pas le minuteur.

### Schéma cible de l'étape séances/historique (non écrit en 0.1.0)

- workout: {schemaVersion:1,id,name,rounds,blocks:[{id,kind:reps|time|rest,exercise:pushup|squat|situp|plank|free,target?,durationSec?,counting:camera|manual}],createdAt,updatedAt}
- log: {schemaVersion:1,id,runId,startedAt,endedAt,localDate,timeZone,status:completed|interrupted,source:{mode,configSnapshot,workoutSnapshot?},elapsedDurationMs,activeDurationMs,pauseDurationMs,entries:[{blockId,roundIndex,setIndex,exercise,status,endReason,activeDurationMs,detectedReps,manualReps,corrections:[],finalReps}],laps:[]}
- export: {app:'elan',schemaVersion:1,exportedAt,settings,workouts,logs}.

Dates ISO pour l'historique, durées en ms ; le brouillon technique conserve epoch ms. Capturer une copie de la séance pour que ses modifications futures n'altèrent pas les logs. Records séparés : total par bloc, AMRAP (durée comparable), cumul journalier. Aucune affirmation de « série continue » sans mesure des ruptures. Streak calculé sur journées locales comportant une séance terminée, sans exiger une séance aujourd'hui tant que la journée n'est pas finie.

Import : hors séance active uniquement, remplacement complet avec confirmation, validation et migration intégrales en mémoire avant écriture, rejet de versions futures, sauvegarde préalable et rollback en cas d'erreur. localStorage n'est pas transactionnel : retenir IndexedDB si l'historique nécessite une atomicité durable. La persistance navigateur ne remplace pas export/import.

## Validation

Tests Node par horloge injectée (voir tests/). Parcours automatisés prévus dans Chromium (workflow de PR) : cela ne remplace pas le test Safari/iPhone, Spotify et l'écoute. Aucun test de ce checkout ne prétend valider l'audio audible à ±50 ms. Relecture indépendante Claude encore à faire ; pas de fusion automatique sur main dans cette étape.
