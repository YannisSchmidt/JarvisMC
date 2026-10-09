# JarvisMC — « Best Friend Bot »

Bot Minecraft autonome et extensible, construit sur [Mineflayer](https://github.com/PrismarineJS/mineflayer).
Il se connecte à un serveur comme un joueur, répond aux commandes `!` de son propriétaire,
se déplace, inventorie, mange, se soigne et se reconnecte tout seul.

> **Cible : Minecraft 1.21.1.** Le cœur, la navigation, la récolte (bois, pierre, minerais),
> le craft avec fonte et tables, la défense, la mémoire et la compréhension de phrases simples
> sont implémentés et couverts par des tests unitaires.
> **Pas encore implémentés** : construction, fermes, redstone, commerce, villages/structures,
> Ender Dragon, élytres, téléportation, rangement en coffres. Le bot le dit honnêtement au lieu de
> prétendre agir. Les tests **sur un vrai serveur** n'ont pas encore été exécutés (voir §9).

---

## 1. Installation

Prérequis : **Node.js ≥ 20** (testé avec Node 22).

```bash
npm install
cp config.example.json config.json
```

## 2. Configuration (sans toucher au code)

Tout se règle dans `config.json` (ignoré par Git) :

| Clé | Rôle | Défaut |
|---|---|---|
| `bot.username` | Pseudo du bot (3–16 caractères alphanumériques ou `_`) | `BestFriendBot` |
| `bot.host` / `bot.port` | Adresse et port du serveur | `localhost` / `25565` |
| `bot.version` | Version Minecraft (voir §3) | `1.21.1` |
| `bot.auth` | `offline` (serveur crackté) ou `microsoft` | `offline` |
| `behavior.owner` | Pseudo du propriétaire (seul à avoir tous les droits) | `null` |
| `behavior.trusted` | Joueurs de confiance (commandes de déplacement, `!stop`…) | `[]` |
| `behavior.blocked` | Joueurs ignorés | `[]` |
| `behavior.autoReconnect` | Reconnexion automatique | `true` |
| `behavior.reconnectBaseDelayMs` / `reconnectMaxDelayMs` | Backoff exponentiel | `2000` / `60000` |
| `behavior.autoEat` / `autoSleep` / `autoRespawn` | Survie automatique | `true` |
| `behavior.lowHealthAlert` | Alerte chat sous ce nombre de PV | `6` |
| `behavior.autoDefend` | Défense automatique contre les mobs hostiles | `true` |
| `ai.enabled` / `ai.provider` / `ai.model` | Moteur IA (pas encore implémenté) | `false` / `local` / `null` |
| `memory.file` | Fichier de mémoire longue (`null` = volatile) | `data/memory.json` |
| `logging.level` | `ERROR`, `WARN`, `INFO`, `DEBUG` | `INFO` |
| `logging.file` | Fichier de log (`null` pour désactiver) | `logs/jarvismc.log` |

Une configuration invalide produit un message listant **tous** les problèmes, puis le programme s'arrête.

## 3. Versions Minecraft

- La version est lue **uniquement** depuis `bot.version`.
- `src/adapters/version.js` est l'unique endroit qui connaît les numéros de version : il vérifie que la
  version demandée est une release prise en charge (données `minecraft-data`) et refuse les snapshots,
  pré-versions et RC avec la liste des versions récentes disponibles.
- Pour changer de version : modifier `bot.version` dans `config.json` et relancer.
  Les versions 26.x sont listées par la bibliothèque installée ; leur compatibilité réelle
  avec un serveur n'a pas encore été vérifiée dans ce projet.

## 4. Lancement

```bash
npm start                              # lit ./config.json
node src/index.js --config autre.json  # fichier de config personnalisé
```

Au démarrage, le bot prépare tout **avant** de se connecter (configuration, version, IA, modules),
affiche `READY`, puis se connecte. Un terminal interactif accepte les commandes (voir §6).

## 5. Connexion au serveur, pseudo, IP, version

- **IP / port** : `bot.host`, `bot.port`.
- **Pseudo** : `bot.username`. Relancer le programme après modification.
- **Version** : `bot.version` (voir §3).
- **Mode crack** : `bot.auth = "offline"`. Pour un compte Microsoft : `"microsoft"` (l'authentification
  interactive de la bibliothèque peut demander une confirmation dans le terminal — non testée ici).

## 6. Commandes et langage naturel

Les commandes commencent par `!` et sont séparées du langage naturel. Dans le terminal, le `!` est facultatif.

| Commande | Rôle | Droits |
|---|---|---|
| `!help` | Liste les commandes accessibles | tous |
| `!status` | Position, PV, faim, tâche, pause, IA | tous |
| `!task` | Tâche en cours | tous |
| `!inventory` (`!inv`) | Résumé de l'inventaire | tous |
| `!find <bloc>` | Cherche un bloc dans les chunks chargés | tous |
| `!collect <ressource> [quantité]` (`!mine`, `!ramene`) | Récolte jusqu'à la quantité (ex. `log 16`, `raw_iron 192`, `diamond 3`) | TRUSTED |
| `!craft <item> [quantité]` | Fabrique un item : récolte, fonte, table et outils automatiques | TRUSTED |
| `!armor <matière>` | Fabrique une armure complète et l'équipe | TRUSTED |
| `!goto <x> <y> <z>` | Va à une position (vérifie l'arrivée) | TRUSTED |
| `!follow <joueur>` | Suit un joueur | TRUSTED |
| `!defend on\|off` | Défense automatique contre les mobs | TRUSTED |
| `!sleep` | Va dormir dans le lit le plus proche | TRUSTED |
| `!setbase` / `!base` | Mémorise la base / y rentre | TRUSTED |
| `!explore [points]` | Explore par points de passage (max 10) | TRUSTED |
| `!cancel` | Annule la tâche en cours | TRUSTED |
| `!stop` / `!resume` | Arrête tout et met en pause / reprend | TRUSTED |
| `!confirm` | Confirme une action dangereuse (délai 60 s) | TRUSTED |
| `!memory` | Résumé de la mémoire et des stratégies apprises | OWNER |
| `!reconnect` | Reconnexion immédiate | OWNER |
| `!quit` | Quitte le serveur et arrête JarvisMC | OWNER |

**Langage naturel** (propriétaire et joueurs de confiance) : le bot traduit une phrase en commande
ou répond honnêtement. Exemples reconnus :

- « Va chercher du bois » → `!collect log 16`
- « Ramène-moi 3 stacks de fer » → `!collect raw_iron 192`
- « Fais-moi une pioche en diamant » → `!craft diamond_pickaxe 1`
- « Fais une armure complète en diamant » → `!armor diamond`
- « Trouve des diamants » → `!collect diamond 8`
- « Suis-moi », « Défends-moi », « Va dormir », « Rentre à la base », « Arrête tout »

Une phrase non comprise reçoit une demande de reformulation. Une phrase reconnue mais non
implémentée (village, ferme, construction, Ender Dragon…) reçoit un refus explicite.

> Ce parseur est **déterministe** (règles en français, `src/core/intent.js`). Il ne fait pas de
> compréhension profonde : une phrase trop libre ne sera pas comprise. Un modèle de langage pourra
> le remplacer plus tard avec la même interface.

**Confirmations** : une récolte de ressource rare (diamant, émeraude) de 10 unités ou plus, ou le
remplacement de la base, demande `!confirm` avant d'agir.

## 7. Architecture

```
src/
  index.js            point d'entrée (boot + CLI + arrêt propre)
  cli.js              console de contrôle sur stdin
  config/index.js     chargement et validation de config.json
  adapters/
    version.js        SEUL endroit qui résout les versions Minecraft
    minecraft.js      SEUL endroit qui appelle Mineflayer (createBot, pathfinder)
  core/
    boot.js           séquence de démarrage READY (avant la connexion)
    bot.js            JarvisBot : cycle de vie, reconnexion, routage, permissions
    commands.js       registre et parseur des commandes "!"
    permissions.js    rôles OWNER / TRUSTED / PLAYER / UNKNOWN / HOSTILE
    tasks.js          gestionnaire de tâches annulables (une à la fois)
    backoff.js        délai de reconnexion exponentiel
    logger.js         logs [HH:MM:SS] [TAG] avec niveaux et fichier
    crafting-planner.js  planification du craft (recettes du jeu, fonte, familles)
    crafter.js        exécution réelle : une étape, vérification, replanification
    resources.js      sources de récolte, outils, quantités par défaut
    plan.js           exécuteur d'étapes avec limite de réessais (MAX_RETRIES = 3)
    intent.js         langage naturel français → commande (déterministe)
    safety.js         confirmations pour les actions dangereuses
  memory/
    store.js          mémoire longue JSON : joueurs, lieux, stratégies, erreurs
  modules/            une capacité = un fichier qui exporte une fabrique de module
    index.js          registre des modules
    general.js        help, status, task, cancel, stop, resume, reconnect, quit
    movement.js       goto (vérifié à l'arrivée), follow
    inventory.js      résumé de l'inventaire
    survival.js       manger, alerte PV bas, dormir (!sleep et la nuit), mort
    gathering.js      récolte : recherche, outil, minage, vérification, drops, mémoire
    crafting.js       !craft et !armor
    combat.js         défense : cible choisie, jamais de joueur, fuite à PV bas
    exploration.js    base, recherche de blocs, exploration
tests/
  unit/               configuration, versions, commandes, permissions, tâches, bot (sans serveur)
  integration/        adaptateur Mineflayer réel (reconnexion), test serveur réel optionnel
data/                 mémoire longue (non versionnée)
logs/                 journaux (non versionnés)
```

Principe : le **core** est déterministe et testable ; l'IA (à venir) ne décidera que *quoi* faire,
pas les mouvements une à une.

## 8. Ajouter un module

1. Créer `src/modules/mon-module.js` :

```js
function createMonModule() {
  return {
    name: 'mon-module',
    attach(mc, services) {          // appelé à chaque spawn ; renvoie une fonction de nettoyage
      const onTick = () => { /* ... */ };
      mc.on('physicsTick', onTick);
      return () => mc.removeListener('physicsTick', onTick);
    },
    commands: [
      {
        name: 'ma-commande',
        minRole: 'TRUSTED',         // PLAYER, TRUSTED, OWNER
        action: true,               // refusée pendant une pause
        description: 'Ce que fait la commande',
        async run(ctx, args) {      // retourne le texte de réponse
          return 'fait';
        },
      },
    ],
  };
}
module.exports = { createMonModule };
```

2. L'ajouter dans `src/modules/index.js`. Rien d'autre à modifier.

## 9. Tests

```bash
npm test                 # tous les tests (55 réussis, 1 ignoré sans serveur)
npm run test:unit        # unitaires (sans serveur)
npm run test:integration # adaptateur Mineflayer réel + serveur réel optionnel
npm run lint             # eslint (références non définies, variables inutiles)
```

Test sur un vrai serveur (mode offline) :

```bash
JARVIS_TEST_SERVER=localhost:25565 JARVIS_TEST_VERSION=1.21.1 npm run test:integration
```

## 10. Résolution des problèmes

| Symptôme | Cause probable |
|---|---|
| `Fichier de configuration introuvable` | Copier `config.example.json` vers `config.json`. |
| `Configuration invalide : …` | Lire la liste affichée et corriger la clé indiquée. |
| `Version Minecraft "…" non prise en charge` | Utiliser une version release listée dans le message. |
| `ECONNREFUSED` en boucle | Serveur arrêté, mauvais `host`/`port`, ou pare-feu. Le bot réessaie avec un délai croissant. |
| `Expulsé du serveur : …` | Le message affiché contient la raison (ex. pseudo déjà utilisé, liste blanche). |
| Le bot ne répond pas à `!…` | Vérifier que votre pseudo est `behavior.owner` ou dans `behavior.trusted`. |
| `Je ne suis pas connecté` | Attendre la connexion (`status`) ou lancer `reconnect`. |

## 11. Feuille de route

- **Fait** : phases 1 (cœur), 2 (minage, craft, combat, survie, exploration partielle),
  3 (tâches, planification par étapes, récupération avec limite de réessais, vérification),
  4 (langage naturel déterministe), 6 (mémoire procédurale — enregistrée, pas encore exploitée
  pour optimiser automatiquement la récolte).
- **Pas encore** : construction (blueprint, plans), fermes, Redstone, commerce, recherche de
  villages/forteresses/stronghold, Ender Dragon, élytres, téléportation, rangement en coffres,
  compréhension libre du langage (LLM), apprentissage statistique avancé.
