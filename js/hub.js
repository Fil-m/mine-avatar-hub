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
    this.currentShopCategory = "all"; // Нова властивість для фільтрації магазину за категоріями
  }

  async init() {
    await db.init();
    this.loadGitConfigFromStorage();
    await this.loadSave();
    await this.syncMode();
    this.initEventListeners();
    this.renderAvatar();
    this.updateUI();
    this.initZenNavigation(); // Ініціалізація Zen Navigation та хоткеїв
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
          "resource:ruby": 0,
          "resource:sapphire": 0,
          "resource:emerald": 0,
          "resource:gold": 0,
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
      { id: "somatic_game", name: "The Shape We Become (Somatic Game)", type: "game", cost: 100, res: "resource:gold" },
      { id: "empathy_core", name: "Quantum Empathy Heart Core", type: "item", cost: 10, res: "resource:eme_token" },
    ];

    // Фільтруємо каталог на основі обраної категорії
    const filteredCatalog = catalog.filter((item) => {
      if (this.currentShopCategory === "all") return true;
      if (this.currentShopCategory === "base") return item.type === "base";
      if (this.currentShopCategory === "miner") return item.type === "hair" || item.type === "eyes";
      if (this.currentShopCategory === "somatic") return item.type === "game" || item.type === "item";
      return true;
    });

    filteredCatalog.forEach((item) => {
      const owned = item.type === "game"
        ? (this.saveState.inventory.unlockedGames || []).includes(item.id)
        : this.saveState.inventory.charItems.includes(item.id);
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

    // Оновлення бібліотеки ігор
    const somaticCard = document.getElementById("somatic-game-card");
    const somaticStatus = document.getElementById("somatic-game-status");
    if (somaticCard && somaticStatus) {
      const isSomaticUnlocked = (this.saveState.inventory.unlockedGames || []).includes("somatic_game");
      if (isSomaticUnlocked) {
        somaticCard.className = "game-card active";
        somaticStatus.innerHTML = `<button id="play-somatic-btn" class="game-play-btn">🚀 Запустити сесію</button>`;
      } else {
        somaticCard.className = "game-card locked";
        somaticStatus.innerHTML = `<span class="game-lock-badge">🔒 Заблоковано (Купіть у Cyber Shop за 100 золото)</span>`;
      }
    }
  }

  async purchaseItem(item) {
    const isGame = item.type === "game";
    const inventoryList = isGame
      ? (this.saveState.inventory.unlockedGames || [])
      : this.saveState.inventory.charItems;

    if (inventoryList.includes(item.id)) return;
    if (this.saveState.resources[item.res] < item.cost) return;

    const resources = { ...this.saveState.resources };
    resources[item.res] -= item.cost;

    let inventory = { ...this.saveState.inventory };
    if (isGame) {
      inventory.unlockedGames = [...(inventory.unlockedGames || []), item.id];
    } else {
      inventory.charItems = [...(inventory.charItems || []), item.id];
    }

    await this.save({ resources, inventory });
  }

  async selectItem(type, itemId) {
    const activeCharacter = { ...this.saveState.activeCharacter };
    activeCharacter[type] = itemId;
    await this.save({ activeCharacter });
  }

  launchGame(gameId = "match3") {
    this.activeToken = crypto.randomUUID();
    this.sessionStartTime = Date.now();

    const gameFrame = document.getElementById("game-frame");
    const gameContainer = document.getElementById("game-container");
    const gameTitle = document.querySelector(".game-header h2");
    
    if (gameFrame && gameContainer) {
      if (gameId === "somatic") {
        gameFrame.src = `games/somatic/index.html?token=${this.activeToken}`;
        if (gameTitle) gameTitle.innerText = "Secured Sandbox Session: The Shape We Become";
      } else {
        gameFrame.src = `games/match3/index.html?token=${this.activeToken}`;
        if (gameTitle) gameTitle.innerText = "Secured Sandbox Session: Match-3 Game";
      }
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
    this.updateUI();
  }

  initEventListeners() {
    const closeBtn = document.getElementById("close-game-btn");
    const manualSyncBtn = document.getElementById("manual-sync-btn");

    if (closeBtn) closeBtn.addEventListener("click", () => this.closeGame());
    if (manualSyncBtn) manualSyncBtn.addEventListener("click", () => this.syncMode());

    // Dynamic delegate for modular launch buttons
    document.addEventListener("click", (e) => {
      if (e.target && e.target.id === "play-match3-btn") {
        this.launchGame("match3");
      }
      if (e.target && e.target.id === "play-somatic-btn") {
        this.launchGame("somatic");
      }
    });

    // 💾 Local File Sync (Dual-Path Saves)
    const exportBtn = document.getElementById("export-save-btn");
    const importInput = document.getElementById("import-save-file");

    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportSave());
    }
    if (importInput) {
      importInput.addEventListener("change", (e) => this.importSave(e));
    }

    // ⚡ Maintenance & Purge buttons
    const resetProfileBtn = document.getElementById("reset-profile-btn");
    const clearDbBtn = document.getElementById("clear-db-btn");

    if (resetProfileBtn) {
      resetProfileBtn.addEventListener("click", () => this.resetProfile());
    }
    if (clearDbBtn) {
      clearDbBtn.addEventListener("click", () => this.clearDatabase());
    }

    // 🛒 Shop Categories tab switching
    const shopTabButtons = document.querySelectorAll(".shop-tab-btn");
    shopTabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        shopTabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentShopCategory = btn.getAttribute("data-category");
        this.updateUI();
      });
    });

    // ☁️ GitHub Config Saving
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
      if (!data) return;

      // 1. Handshake: Ініціалізація гри у iframe
      if (data.type === "INIT_GAME") {
        if (data.token !== this.activeToken) {
          console.error("🔒 Security Alert: Unauthorized Session Token in INIT_GAME");
          return;
        }
        event.source.postMessage({
          type: "LOAD_GAME_STATE",
          token: this.activeToken,
          saveState: this.saveState
        }, "*");
        return;
      }

      // 2. Realtime Sync з соматичної гри
      if (data.type === "SAVE_GAME_STATE") {
        const payload = data.payload;
        if (!payload || payload.token !== this.activeToken) {
          console.error("🔒 Security Alert: Unauthorized Session Token in SAVE_GAME_STATE");
          return;
        }

        const somaticState = payload.somaticGameState;
        if (!somaticState) return;

        // Злиття ресурсів: Love -> Ruby, Food -> Gold, Rest -> Sapphire
        const resources = { ...this.saveState.resources };
        resources["resource:ruby"] = somaticState.resources.love || 0;
        resources["resource:gold"] = somaticState.resources.food || 0;
        resources["resource:sapphire"] = somaticState.resources.rest || 0;

        const somatic_game_state = somaticState;

        this.save({ resources, somatic_game_state });
        return;
      }

      // 3. Match-3 earn resources
      if (data.type === "EARN_RESOURCES") {
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
        return;
      }
    });
  }

  // 🧬 Zen Navigation & Keyboard Shortcuts
  initZenNavigation() {
    const navButtons = document.querySelectorAll(".zen-nav-btn");
    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        this.switchTab(targetTab);
      });
    });

    // Обробка гарячих клавіш для швидкого перемикання
    document.addEventListener("keydown", (e) => {
      // Ігноруємо гарячі клавіші, якщо фокус в полях введення
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "a" || key === "ф") {
        e.preventDefault();
        this.switchTab("avatar");
      } else if (key === "d" || key === "в") {
        e.preventDefault();
        this.switchTab("domain");
      } else if (key === "c" || key === "с") {
        e.preventDefault();
        this.switchTab("shop");
      } else if (key === "b" || key === "и") {
        e.preventDefault();
        this.switchTab("build");
      }
    });
  }

  switchTab(tabId) {
    const navButtons = document.querySelectorAll(".zen-nav-btn");
    const tabPanels = document.querySelectorAll(".zen-tab-panel");

    navButtons.forEach((btn) => {
      if (btn.getAttribute("data-tab") === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    tabPanels.forEach((panel) => {
      const id = panel.getAttribute("id");
      if (id === `view-${tabId}`) {
        panel.classList.add("active");
      } else {
        panel.classList.remove("active");
      }
    });

    // Запис у консоль хабу
    const consoleDiv = document.getElementById("dev-console");
    if (consoleDiv) {
      const p = document.createElement("p");
      p.innerText = `[${new Date().toLocaleTimeString()}] Switched view to: [${tabId.toUpperCase()}]`;
      consoleDiv.appendChild(p);
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }
  }

  // 📥 Експорт локального збереження у файл save.json
  exportSave() {
    try {
      if (!this.saveState) {
        alert("Помилка: нема даних для експорту!");
        return;
      }
      const dataStr = JSON.stringify(this.saveState, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `save_${this.saveState.player.username}_seq${this.saveState.player.sequence}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      const consoleDiv = document.getElementById("dev-console");
      if (consoleDiv) {
        const p = document.createElement("p");
        p.className = "success";
        p.innerText = `[${new Date().toLocaleTimeString()}] Save exported successfully: ${exportFileDefaultName}`;
        consoleDiv.appendChild(p);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
      }
    } catch (error) {
      console.error("Export save failed", error);
      alert("Не вдалося експортувати файл збереження!");
    }
  }

  // 📤 Імпорт збереження з файлу save.json з повною валідацією схеми
  async importSave(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);

        // Валідація схеми (Anti-corruption check)
        if (!importedData || typeof importedData !== "object") {
          throw new Error("Файл не є валідним об'єктом JSON");
        }
        if (!importedData.player || typeof importedData.player.username !== "string") {
          throw new Error("Відсутнє ім'я гравця (player.username)");
        }
        if (typeof importedData.player.sequence !== "number" || importedData.player.sequence < 1) {
          throw new Error("Невалідний номер коміт-послідовності (player.sequence)");
        }
        if (!importedData.resources || typeof importedData.resources !== "object") {
          throw new Error("Відсутній об'єкт ресурсів (resources)");
        }

        // Перевіряємо, щоб усі ресурси були позитивними числами
        for (const [key, val] of Object.entries(importedData.resources)) {
          if (typeof val !== "number" || val < 0) {
            throw new Error(`Невалідний баланс ресурсу ${key}: має бути позитивним числом`);
          }
        }

        if (!importedData.inventory || typeof importedData.inventory !== "object") {
          throw new Error("Відсутній інвентар (inventory)");
        }
        if (!Array.isArray(importedData.inventory.charItems)) {
          throw new Error("Невалідний список скінів (inventory.charItems)");
        }
        if (!Array.isArray(importedData.inventory.unlockedGames)) {
          throw new Error("Невалідний список ігор (inventory.unlockedGames)");
        }
        if (!importedData.activeCharacter || typeof importedData.activeCharacter !== "object") {
          throw new Error("Відсутня конфігурація аватара (activeCharacter)");
        }

        // Все добре, застосовуємо збереження
        this.saveState = importedData;
        await db.set("save_state", this.saveState);

        // Якщо у нас налаштований Git Sync, синхронізуємо
        await api.saveState(this.saveState);

        this.updateUI();
        this.renderAvatar();

        // Скидаємо input значення
        event.target.value = "";

        const consoleDiv = document.getElementById("dev-console");
        if (consoleDiv) {
          const p = document.createElement("p");
          p.className = "success";
          p.innerText = `[${new Date().toLocaleTimeString()}] Save imported successfully (Seq #${this.saveState.player.sequence}) for ${this.saveState.player.username}`;
          consoleDiv.appendChild(p);
          consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }

        alert(`Збереження імпортовано успішно для ${this.saveState.player.username}!`);
      } catch (error) {
        console.error("Import save failed", error);
        alert(`Помилка імпорту збереження: ${error.message}`);
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  // ❌ Скидання профілю до початкового стану
  async resetProfile() {
    if (!confirm("Ви впевнені, що хочете скинути свій профіль? Усі ресурси та куплені скіни будуть видалені!")) {
      return;
    }

    const state = {
      version: 3,
      player: {
        username: "player_" + Math.floor(Math.random() * 10000),
        sequence: 1,
        last_sync_hash: "00000000",
      },
      resources: {
        "resource:ruby": 0,
        "resource:sapphire": 0,
        "resource:emerald": 0,
        "resource:gold": 0,
        "resource:eme_token": 0,
      },
      inventory: {
        charItems: ["skin_default", "hair_default", "eyes_default"],
        unlockedGames: ["match3"],
      },
      activeCharacter: { ...DEFAULT_AVATAR },
      last_session: null,
    };

    this.saveState = state;
    await db.set("save_state", state);
    
    // Спроба відправити на сервер
    await api.saveState(state);

    this.updateUI();
    this.renderAvatar();

    const consoleDiv = document.getElementById("dev-console");
    if (consoleDiv) {
      const p = document.createElement("p");
      p.className = "warning";
      p.innerText = `[${new Date().toLocaleTimeString()}] Profile reset to default values.`;
      consoleDiv.appendChild(p);
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    alert("Профіль успішно скинуто!");
  }

  // 🧹 Повне очищення IndexedDB
  async clearDatabase() {
    if (!confirm("Ви впевнені, що хочете повністю очистити IndexedDB? Це призведе до повної втрати локальних даних!")) {
      return;
    }

    try {
      await db.clear();
      
      const consoleDiv = document.getElementById("dev-console");
      if (consoleDiv) {
        const p = document.createElement("p");
        p.className = "warning";
        p.innerText = `[${new Date().toLocaleTimeString()}] IndexedDB completely purged!`;
        consoleDiv.appendChild(p);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
      }

      alert("IndexedDB успішно очищено! Перезавантажуємо сторінку...");
      window.location.reload();
    } catch (error) {
      console.error("Purging IndexedDB failed", error);
      alert(`Не вдалося очистити IndexedDB: ${error.message}`);
    }
  }
}

// Запуск хабу при завантаженні сторінки
window.addEventListener("DOMContentLoaded", () => {
  const hub = new AvatarHub();
  hub.init();
});
