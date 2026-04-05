<div align="center">

# 💧 HydraDev

**L'assistant hydratation pensé pour les développeurs**

*Arrête d'oublier de boire pendant tes sessions de code.*

[![Release](https://img.shields.io/github/v/release/KimBgey/hydradev?style=flat-square&color=22d3ee)](https://github.com/KimBgey/hydradev/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square&color=0f1825)](https://github.com/KimBgey/hydradev/releases/latest)
[![License](https://img.shields.io/badge/license-ISC-gray?style=flat-square)](LICENSE)

[**⬇️ Télécharger**](https://github.com/KimBgey/hydradev/releases/latest) · [Voir les releases](https://github.com/KimBgey/hydradev/releases)

</div>

---

## Le problème

Tu codes, tu entres en focus mode, et 3 heures passent sans que tu aies bu une goutte d'eau ni bougé de ta chaise. Résultat : maux de tête, concentration en berne, et des risques pour ta santé à long terme.

HydraDev tourne discrètement en arrière-plan et te rappelle de boire et de faire une pause — sans jamais te déranger quand t'es vraiment dans le flow.

---

## Fonctionnalités

**💧 Rappels hydratation**
Popup toutes les 45 minutes avec un compteur de verres journalier et ton streak.

**🚽 Rappels pause**
Rappel toutes les 2 heures pour éviter la rétention. Indépendant du timer eau.

**🎯 Mode focus**
Un toggle dans le tray double les délais de rappel et rend le widget discret. Tu restes dans le flow, les rappels restent là.

**📊 Dashboard stats**
Historique 7 jours, calendrier 30 jours, streak, objectif journalier personnalisable. Accessible en un clic depuis le tray.

**💊 Widget always-on-top**
Une petite pill flottante en bas à droite de l'écran. Countdown eau + pause, compteur de verres, boutons d'action rapide.

**🔄 Mises à jour automatiques**
L'app se met à jour silencieusement en arrière-plan. Une notif dans le tray quand c'est prêt.

---

## Installation

### Téléchargement direct

1. Va sur la [page des releases](https://github.com/KimBgey/hydradev/releases/latest)
2. Télécharge `HydraDev-Setup-x.x.x.exe`
3. Lance l'installeur

> **Note Windows SmartScreen** : Windows peut afficher un avertissement "Application inconnue" car l'exe n'est pas signé avec un certificat payant. Clique sur **Informations complémentaires** → **Exécuter quand même**. Le code source est entièrement disponible ici pour vérification.

---

## Utilisation

L'app démarre automatiquement avec Windows et vit dans la barre système (system tray).

| Action | Comment |
|--------|---------|
| Voir le widget | Clic gauche sur l'icône tray |
| J'ai bu | Bouton 💧 dans le widget ou menu tray |
| Pause faite | Bouton 🚽 dans le widget ou menu tray |
| Mode focus | Menu tray → 🎯 Mode focus |
| Stats | Menu tray → 📊 Voir les stats |
| Quitter | Menu tray → Quitter |

---

## Stack technique

- **Electron** — framework desktop
- **Node.js** — logique métier, timers, persistance
- **HTML / CSS / JS** — UI vanilla, zéro framework
- **electron-builder** — packaging & distribution
- **electron-updater** — mises à jour automatiques via GitHub Releases

---

## Développement local

```powershell
git clone https://github.com/KimBgey/hydradev.git
cd hydradev
npm install
npm run dev
```

Pour builder et publier une nouvelle version :

```powershell
# 1. Bumper la version dans package.json
# 2. Commiter
git add .
git commit -m "v1.x.x - description"
git push
# 3. Publier
.\release.ps1
```

---

## Structure du projet

```
hydradev/
├── main.js          — process principal Electron, timers, IPC, tray
├── store.js         — persistance des données (JSON)
├── widget.html      — pill always-on-top
├── reminder.html    — popup rappel (eau / pause)
├── dashboard.html   — fenêtre stats
├── icon.ico         — icône app
├── tray-icon.png    — icône tray normale
├── tray-icon-alert.png  — icône tray alerte
├── tray-icon-focus.png  — icône tray mode focus
└── package.json
```

---

<div align="center">

Fait avec 💧 pour arrêter d'oublier de boire en codant

</div>
