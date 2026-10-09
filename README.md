# JarvisMC — « Best Friend Bot »

Bot Minecraft autonome et extensible, construit sur [Mineflayer](https://github.com/PrismarineJS/mineflayer).
Il se connecte à un serveur comme un joueur, répond aux commandes `!` de son propriétaire,
se déplace, inventorie, mange, se soigne et se reconnecte tout seul.

> **État actuel : Phase 1 (cœur) en cours.** Le langage naturel (IA), le minage, le crafting,
> le combat et la construction ne sont **pas encore implémentés**. Le bot répond honnêtement
> « Je ne comprends pas encore… » plutôt que de prétendre agir.

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
| `bot.version` | Version Minecraft (voir §3) | `1.21.11` |
| `bot.auth` | `offline` (serveur crackté) ou `microsoft` | `offline` |
| `behavior.owner` | Pseudo du propriétaire (seul à avoir tous les droits) | `null` |
| `behavior.trusted` | Joueurs de confiance (commandes de déplacement, `!stop`…) | `[]` |
| `behavior.blocked` | Joueurs ignorés | `[]` |
| `behavior.autoReconnect` | Reconnexion automatique | `true` |
| `behavior.reconnectBaseDelayMs` / `reconnectMaxDelayMs` | Backoff exponentiel | `2000` / `60000` |
| `behavior.autoEat` / `autoSleep` / `autoRespawn` | Survie automatique | `true` |
| `behavior.lowHealthAlert` | Alerte chat sous ce nombre de PV | `6` |
| `ai.enabled` / `ai.provider` / `ai.model` | Moteur IA (pas encore implémenté) | `false` / `local` / `null` |
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

## 6. Commandes

Les commandes commencent par `!` et sont séparées du langage naturel. Dans le terminal, le `!` est facultatif.

| Commande | Rôle | Droits |
|---|---|---|
| `!help` | Liste les commandes accessibles | tous |
| `!status` | Position, PV, faim, tâche, état IA/pause | tous |
| `!task` | Tâche en cours | tous |
| `!inventory` (`!inv`) | Résumé de l'inventaire | tous |
| `!goto <x> <y> <z>` | Va à une position (vérifie l'arrivée) | TRUSTED |
| `!follow <joueur>` | Suit un joueur | TRUSTED |
| `!cancel` | Annule la tâche en cours | TRUSTED |
| `!stop` | Arrête tout et se met en pause | TRUSTED |
| `!resume` | Reprend après `!stop` | TRUSTED |
| `!reconnect` | Reconnexion immédiate | OWNER |
| `!quit` | Quitte le serveur et arrête JarvisMC | OWNER |

Terminal : `say <message>` parle dans le chat ; `status`, `goto 1 2 3`, `quit`… sont acceptés sans `!`.

Les messages en langage naturel sont pour l'instant refusés poliment (aucune action n'est simulée).

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
  modules/            une capacité = un fichier qui exporte une fabrique de module
    index.js          registre des modules
    general.js        help, status, task, cancel, stop, resume, reconnect, quit
    movement.js       goto (vérifié à l'arrivée), follow
    inventory.js      résumé de l'inventaire
    survival.js       manger, alerte PV bas, dormir la nuit (best effort), mort
tests/
  unit/               configuration, versions, commandes, permissions, tâches, bot (sans serveur)
  integration/        adaptateur Mineflayer réel (reconnexion), test serveur réel optionnel
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
npm test                 # tous les tests
npm run test:unit        # unitaires (sans serveur)
npm run test:integration # adaptateur Mineflayer réel + serveur réel optionnel
```

Test sur un vrai serveur (mode offline) :

```bash
JARVIS_TEST_SERVER=localhost:25565 JARVIS_TEST_VERSION=1.21.11 npm run test:integration
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

Voir le cahier des charges. Phases : **1** cœur de connexion et navigation (en cours) ·
**2** mining, crafting, combat, survie, exploration · **3** planificateur de tâches complet et
récupération d'erreurs · **4** compréhension du langage naturel (IA) · **5** construction ·
**6** apprentissage et mémoire procédurale · **7** farms, Redstone, coopération.
