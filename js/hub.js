import { db } from "./database.js";
import { api } from "./api.js";

// Конфігурація елементів за замовчуванням
const DEFAULT_AVATAR = {
  base: "skin_default",
  hair: "hair_default",
  eyes: "eyes_default",
};

const AVATAR_COLORS = {
  skin_default: "#e0ac69",
  skin_cyborg: "#6a7b83",
  skin_neon: "#00f0ff",
  hair_default: "#2c3e50",
  hair_neon: "#ff007f",
  hair_cyber: "#ad00ff",
  eyes_default: "#27ae60",
  eyes_cyborg: "#e74c3c",
  eyes_neon: "#ffff00",
};

class AvatarHub {
  constructor() {
    this.saveState = null;
    this.activeToken = null;
    this.sessionStartTime = null;
  }

  async init() {
    await db.init();
    this.loadGitConfigFromStorage();
    await this.loadSave();
    await this.syncMode();
    this.initEventListeners();
    this.renderAvatar();
    this.updateUI();
  }

  loadGitConfigFromStorage() {
    const patInput = document.getElementById("git-pat");
    const repoInput = document.getElementById("git-repo");
    const pathInput = document.getElementById("git-filepath");

    if (patInput) patInput.value = localStorage.getItem("github_pat") || "";
    if (repoInput) repoInput.value = localStorage.getItem("github_repo") || "";
    if (pathInput) pathInput.value = localStorage.getItem("github_filepath") || "saves/save.json";
  }

  async syncMode() {
    const detected = await api.detectMode();
    const indicator = document.getElementById("mode-indicator");
    const indicatorText = document.getElementById("mode-text");

    if (indicator && indicatorText) {
      indicator.className = `indicator-dot ${detected}`;
      if (detected === "companion") {
        indicatorText.innerText = "Hybrid Desktop Active";
      } else if (detected === "eme") {
        indicatorText.innerText = "EME Mesh Node Active";
      } else if (detected === "cloud") {
        indicatorText.innerText = "Cloud (GitHub) Active";
      } else {
        indicatorText.innerText = "Offline Local Mode";
      }
    }
  }

  async loadSave() {
    // 1. Спочатку детектуємо активний режим
    const detected = await api.detectMode();
    let state = null;

    // 2. Якщо ми в мережевому режимі, пробуємо отримати збереження з бекенду
    if (detected === "companion" || detected === "eme") {
      try {
        // Отримуємо останнє збережене ім'я гравця з локальної бази для запиту
        const tempState = await db.get("save_state");
        const username = tempState ? tempState.player.username : null;
        if (username) {
          const networkState = await api.getSave(username);
          if (networkState && networkState.player) {
            state = networkState;
            console.log(`📥 Loaded fresh state from ${detected.toUpperCase()} for ${username}`);
            // Оновлюємо локальну IndexedDB свіжим станом з мережі
            await db.set("save_state", state);
          }
        }
      } catch (e) {
        console.warn("Could not load from network sync provider, using local IndexedDB", e);
      }
    }

    // 3. Fallback до локального IndexedDB
    if (!state) {
      state = await db.get("save_state");
    }

    // 4. Якщо збереження взагалі не існує (перший запуск), створюємо дефолтний профайл
    if (!state) {
      state = {
        version: 3,
        player: {
          username: "player_" + Math.floor(Math.random() * 10000),
          sequence: 1,
          last_sync_hash: "00000000",
        },
        resources: {
          "resource:ruby": 100,
          "resource:sapphire": 50,
          "resource:emerald": 10,
          "resource:gold": 200,
          "resource:eme_token": 0,
        },
        inventory: {
          charItems: ["skin_default", "hair_default", "eyes_default"],
          unlockedGames: ["match3"],
        },
        activeCharacter: { ...DEFAULT_AVATAR },
        last_session: null,
      };
      await db.set("save_state", state);
    }
    this.saveState = state;
  }

  async save(stateUpdate = {}) {
    this.saveState = { ...this.saveState, ...stateUpdate };
    this.saveState.player.sequence += 1;

    // 1. Зберігаємо локально в IndexedDB
    await db.set("save_state", this.saveState);

    // 2. Спроба відправити на API (Companion/EME)
    const syncStatus = await api.saveState(this.saveState);
    
    this.updateUI();
    this.renderAvatar();

    const consoleDiv = document.getElementById("dev-console");
    if (consoleDiv) {
      const p = document.createElement("p");
      p.className = syncStatus.success ? "success" : "warning";
      p.innerText = `[${new Date().toLocaleTimeString()}] Saved locally (Seq #${this.saveState.player.sequence}). Sync via ${syncStatus.method.toUpperCase()}: ${syncStatus.success ? "SUCCESS" : "PENDING/LOCAL"}`;
      consoleDiv.appendChild(p);
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }
  }

  renderAvatar() {
    const canvas = document.getElementById("avatar-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const active = this.saveState.activeCharacter;

    // Запобігаємо Tainted Canvas шляхом рендерингу гарних векторних спрайтів
    // Якщо картинки не підвантажились, ми рендеримо шикарний геометричний кібер-арт!
    
    // Шар 1: Тіло (Skin)
    ctx.fillStyle = AVATAR_COLORS[active.base] || AVATAR_COLORS.skin_default;
    ctx.beginPath();
    ctx.arc(128, 140, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Шар 2: Очі (Eyes)
    ctx.fillStyle = AVATAR_COLORS[active.eyes] || AVATAR_COLORS.eyes_default;
    const eyeColor = ctx.fillStyle;
    
    // Ліве око
    ctx.beginPath();
    ctx.arc(105, 130, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Блик
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(102, 127, 3, 0, Math.PI * 2);
    ctx.fill();

    // Праве око (або кібер-модифікований візор)
    if (active.eyes === "eyes_cyborg") {
      ctx.fillStyle = "#ff0055";
      ctx.strokeStyle = "#ffea00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(135, 120, 30, 20);
      ctx.fill();
      ctx.stroke();
      // Лазерний зрачок
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(150, 130, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(151, 130, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 4;
      ctx.stroke();
      // Блик
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(148, 127, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Шар 3: Зачіска (Hair)
    ctx.fillStyle = AVATAR_COLORS[active.hair] || AVATAR_COLORS.hair_default;
    if (active.hair === "hair_neon") {
      // Стильний кібер-ірокез з неоновим свіченням
      ctx.shadowColor = "#ff007f";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(70, 95);
      ctx.lineTo(128, 40);
      ctx.lineTo(186, 95);
      ctx.lineTo(158, 90);
      ctx.lineTo(128, 60);
      ctx.lineTo(98, 90);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0; // Скидаємо тіні
    } else if (active.hair === "hair_cyber") {
      // Хвиляста зачіска
      ctx.beginPath();
      ctx.arc(128, 90, 65, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Стандартна стрижка
      ctx.beginPath();
      ctx.arc(128, 95, 62, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      ctx.stroke();
    }

    // Рот (загальний для всіх)
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 165, 12, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  updateUI() {
    // Відображення балансу
    document.getElementById("res-gold").innerText = this.saveState.resources["resource:gold"];
    document.getElementById("res-ruby").innerText = this.saveState.resources["resource:ruby"];
    document.getElementById("res-sapphire").innerText = this.saveState.resources["resource:sapphire"];
    document.getElementById("res-eme").innerText = this.saveState.resources["resource:eme_token"];
    document.getElementById("player-name").innerText = this.saveState.player.username;
    document.getElementById("player-seq").innerText = this.saveState.player.sequence;

    // Оновлення магазину
    const shopList = document.getElementById("shop-list");
    if (!shopList) return;
    shopList.innerHTML = "";

    const catalog = [
      { id: "skin_cyborg", name: "Cyborg Metallic Skin", type: "base", cost: 100, res: "resource:gold" },
      { id: "skin_neon", name: "Neon Cybernetic Skin", type: "base", cost: 300, res: "resource:gold" },
      { id: "hair_neon", name: "Pink Neon Punk Mohican", type: "hair", cost: 40, res: "resource:ruby" },
      { id: "hair_cyber", name: "Purple Future Dreadlocks", type: "hair", cost: 60, res: "resource:ruby" },
      { id: "eyes_cyborg", name: "Cyber Visor Red Eye", type: "eyes", cost: 20, res: "resource:sapphire" },
      { id: "eyes_neon", name: "Yellow Energy Lenses", type: "eyes", cost: 35, res: "resource:sapphire" },
    ];

    catalog.forEach((item) => {
      const owned = this.saveState.inventory.charItems.includes(item.id);
      const canAfford = this.saveState.resources[item.res] >= item.cost;

      const card = document.createElement("div");
      card.className = `shop-card ${owned ? "owned" : ""}`;
      card.innerHTML = `
        <h4>${item.name}</h4>
        <p>Type: ${item.type.toUpperCase()}</p>
        <div class="price-row">
          <span>Cost: <strong>${item.cost}</strong> (${item.res.split(":")[1]})</span>
          ${
            owned
              ? `<span class="owned-tag">Owned</span>`
              : `<button class="buy-btn" ${canAfford ? "" : "disabled"} data-id="${item.id}">${canAfford ? "Purchase" : "Not Enough"}</button>`
          }
        </div>
      `;

      if (!owned && canAfford) {
        card.querySelector(".buy-btn").addEventListener("click", () => this.purchaseItem(item));
      }

      shopList.appendChild(card);
    });

    // Оновлення редактора
    const editContainer = document.getElementById("editor-options");
    if (!editContainer) return;
    editContainer.innerHTML = "";

    const categories = {
      base: "Skin Color",
      hair: "Hairstyle",
      eyes: "Eyes Style",
    };

    Object.entries(categories).forEach(([type, label]) => {
      const group = document.createElement("div");
      group.className = "editor-group";
      group.innerHTML = `<h3>${label}</h3>`;

      const options = this.saveState.inventory.charItems.filter((itemId) => {
        if (type === "base" && itemId.startsWith("skin_")) return true;
        if (type === "hair" && itemId.startsWith("hair_")) return true;
        if (type === "eyes" && itemId.startsWith("eyes_")) return true;
        return false;
      });

      options.forEach((itemId) => {
        const isActive = this.saveState.activeCharacter[type] === itemId;
        const btn = document.createElement("button");
        btn.className = `item-select-btn ${isActive ? "active" : ""}`;
        btn.innerText = itemId.split("_")[1].toUpperCase();
        btn.addEventListener("click", () => this.selectItem(type, itemId));
        group.appendChild(btn);
      });

      editContainer.appendChild(group);
    });
  }

  async purchaseItem(item) {
    if (this.saveState.inventory.charItems.includes(item.id)) return;
    if (this.saveState.resources[item.res] < item.cost) return;

    const resources = { ...this.saveState.resources };
    resources[item.res] -= item.cost;

    const charItems = [...this.saveState.inventory.charItems, item.id];
    const inventory = { ...this.saveState.inventory, charItems };

    await this.save({ resources, inventory });
  }

  async selectItem(type, itemId) {
    const activeCharacter = { ...this.saveState.activeCharacter };
    activeCharacter[type] = itemId;
    await this.save({ activeCharacter });
  }

  launchGame() {
    this.activeToken = crypto.randomUUID();
    this.sessionStartTime = Date.now();

    const gameFrame = document.getElementById("game-frame");
    const gameContainer = document.getElementById("game-container");
    
    if (gameFrame && gameContainer) {
      gameFrame.src = `games/match3/index.html?token=${this.activeToken}`;
      gameContainer.style.display = "block";
    }
  }

  closeGame() {
    const gameContainer = document.getElementById("game-container");
    const gameFrame = document.getElementById("game-frame");
    if (gameContainer && gameFrame) {
      gameContainer.style.display = "none";
      gameFrame.src = "";
    }
    this.activeToken = null;
  }

  initEventListeners() {
    const playBtn = document.getElementById("play-btn");
    const closeBtn = document.getElementById("close-game-btn");
    const manualSyncBtn = document.getElementById("manual-sync-btn");

    if (playBtn) playBtn.addEventListener("click", () => this.launchGame());
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeGame());
    if (manualSyncBtn) manualSyncBtn.addEventListener("click", () => this.syncMode());

    // GitHub Cloud Sync Panel Toggling & Saving
    const toggleGitBtn = document.getElementById("toggle-git-settings");
    const gitContent = document.getElementById("git-settings-content");
    if (toggleGitBtn && gitContent) {
      toggleGitBtn.addEventListener("click", () => {
        gitContent.classList.toggle("hidden");
      });
    }

    const saveGitConfigBtn = document.getElementById("save-git-config-btn");
    if (saveGitConfigBtn) {
      saveGitConfigBtn.addEventListener("click", async () => {
        const pat = document.getElementById("git-pat").value.trim();
        const repo = document.getElementById("git-repo").value.trim();
        const path = document.getElementById("git-filepath").value.trim();

        const consoleDiv = document.getElementById("dev-console");

        if (pat && repo) {
          localStorage.setItem("github_pat", pat);
          localStorage.setItem("github_repo", repo);
          localStorage.setItem("github_filepath", path || "saves/save.json");

          if (consoleDiv) {
            const p = document.createElement("p");
            p.className = "success";
            p.innerText = `[${new Date().toLocaleTimeString()}] GitHub Cloud Config saved! Syncing...`;
            consoleDiv.appendChild(p);
          }

          await this.syncMode();
          await this.loadSave();
          this.updateUI();
          this.renderAvatar();
          
          if (this.saveState) {
            await this.save(this.saveState);
          }
        } else if (!pat && !repo) {
          localStorage.removeItem("github_pat");
          localStorage.removeItem("github_repo");
          localStorage.removeItem("github_filepath");

          if (consoleDiv) {
            const p = document.createElement("p");
            p.className = "warning";
            p.innerText = `[${new Date().toLocaleTimeString()}] GitHub config cleared. Returned to local mode.`;
            consoleDiv.appendChild(p);
          }

          await this.syncMode();
          await this.loadSave();
          this.updateUI();
          this.renderAvatar();
        } else {
          alert("Будь ласка, вкажіть і GitHub Token (PAT), і репозиторій!");
        }
      });
    }

    // 🔒 postMessage listener з верифікацією Session Token та лімітів
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "EARN_RESOURCES") return;

      const payload = data.payload;
      if (!payload || payload.token !== this.activeToken) {
        console.error("🔒 Security Alert: Unauthorized Session Token in postMessage");
        return;
      }

      // М'яка валідація швидкості (Plausibility filter)
      const duration = (Date.now() - this.sessionStartTime) / 1000;
      const claimedGold = payload.resources["resource:gold"] || 0;
      
      const maxAllowed = duration * 2.5; // maxRatePerSecond = 2.5
      if (claimedGold > maxAllowed + 5) { // додаємо невелику похибку 5
        console.warn("⚠️ Plausibility Warning: Gold rate too high. Capping resources.");
        payload.resources["resource:gold"] = Math.floor(maxAllowed);
      }

      // Нараховуємо ресурси
      const resources = { ...this.saveState.resources };
      Object.entries(payload.resources).forEach(([key, val]) => {
        if (resources[key] !== undefined) {
          resources[key] += val;
        }
      });

      const last_session = {
        game_id: "match3",
        game_version: "1.2.0",
        duration: Math.floor(duration),
        earned: payload.resources,
      };

      this.save({ resources, last_session });
      this.closeGame();
    });
  }
}

// Запуск хабу при завантаженні сторінки
window.addEventListener("DOMContentLoaded", () => {
  const hub = new AvatarHub();
  hub.init();
});
