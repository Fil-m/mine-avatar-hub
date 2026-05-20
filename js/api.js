/**
 * api.js
 * Уніфікований інтерфейс обміну даними.
 * Автоматично перемикається між Cloud (GitHub), Hybrid (Desktop Companion) та EME Mesh (Local Node) режимами.
 */

export class UnifiedAPI {
  constructor() {
    this.companionUrl = "http://127.0.0.1:8989";
    this.emeBaseUrl = window.location.origin; // якщо Хаб хоститься на ноді EME OS
    this.mode = "local"; // local, cloud, companion, eme
  }

  async detectMode() {
    // 1. Спроба детектувати EME OS Node API
    if (window.location.pathname.startsWith("/eme/")) {
      this.mode = "eme";
      console.log("📟 EME Mesh Mode detected.");
      return "eme";
    }

    // 2. Спроба детектувати Desktop Companion
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 600);
      const res = await fetch(`${this.companionUrl}/status`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const status = await res.json();
        if (status.status === "ready") {
          this.mode = "companion";
          console.log("🐍 Desktop Companion detected. Mode set to Hybrid Desktop.");
          return "companion";
        }
      }
    } catch (e) {
      // Companion not running
    }

    // 3. Fallback до Cloud/Local
    const savedToken = localStorage.getItem("github_pat");
    const savedRepo = localStorage.getItem("github_repo");
    if (savedToken && savedRepo) {
      this.mode = "cloud";
      return "cloud";
    }

    this.mode = "local";
    return "local";
  }

  async getSave(username) {
    if (this.mode === "companion") {
      try {
        const res = await fetch(`${this.companionUrl}/load?username=${username}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.error("Failed to load from companion, falling back", e);
      }
    } else if (this.mode === "eme") {
      try {
        const res = await fetch(`${this.emeBaseUrl}/api/eme/save?username=${username}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.error("Failed to load from EME OS Node, falling back", e);
      }
    } else if (this.mode === "cloud") {
      try {
        const pat = localStorage.getItem("github_pat");
        const repo = localStorage.getItem("github_repo");
        const path = localStorage.getItem("github_filepath") || "saves/save.json";

        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
          headers: {
            "Authorization": `token ${pat}`,
            "Accept": "application/vnd.github.v3+json",
            "Cache-Control": "no-cache"
          }
        });
        if (res.ok) {
          const fileData = await res.json();
          // Декодуємо Base64 з підтримкою UTF-8
          const binString = atob(fileData.content.replace(/\s/g, ""));
          const bytes = new Uint8Array(binString.length);
          for (let i = 0; i < binString.length; i++) {
            bytes[i] = binString.charCodeAt(i);
          }
          const decoded = new TextDecoder().decode(bytes);
          const saveJson = JSON.parse(decoded);
          return saveJson;
        }
      } catch (e) {
        console.error("Failed to load save from GitHub Cloud", e);
      }
    }
    return null;
  }

  async saveState(state) {
    const timestamp = new Date().toISOString();
    console.log(`[Sync Queue] Saving state at ${timestamp} via ${this.mode.toUpperCase()}`);

    if (this.mode === "companion") {
      try {
        const res = await fetch(`${this.companionUrl}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
        if (res.ok) {
          const result = await res.json();
          return { success: true, method: "companion", git: result.git };
        }
      } catch (e) {
        console.error("Companion save failed, falling back to local storage", e);
      }
    } else if (this.mode === "eme") {
      try {
        const res = await fetch(`${this.emeBaseUrl}/api/eme/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
        if (res.ok) {
          return { success: true, method: "eme" };
        }
      } catch (e) {
        console.error("EME Node save failed, falling back to local storage", e);
      }
    } else if (this.mode === "cloud") {
      try {
        const pat = localStorage.getItem("github_pat");
        const repo = localStorage.getItem("github_repo");
        const path = localStorage.getItem("github_filepath") || "saves/save.json";

        // 1. Отримуємо існуючий файл для SHA комміту
        let sha = null;
        try {
          const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            headers: {
              "Authorization": `token ${pat}`,
              "Accept": "application/vnd.github.v3+json",
              "Cache-Control": "no-cache"
            }
          });
          if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
          }
        } catch (e) {
          // Новий файл, sha = null
        }

        // 2. Безпечно кодуємо JSON в Base64 з UTF-8 символами
        const jsonStr = JSON.stringify(state, null, 2);
        const bytes = new TextEncoder().encode(jsonStr);
        let binString = "";
        for (let i = 0; i < bytes.length; i++) {
          binString += String.fromCharCode(bytes[i]);
        }
        const b64Content = btoa(binString);

        // 3. Відправляємо оновлення через API
        const putBody = {
          message: `Auto-save sequence #${state.player.sequence}`,
          content: b64Content
        };
        if (sha) {
          putBody.sha = sha;
        }

        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
          method: "PUT",
          headers: {
            "Authorization": `token ${pat}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify(putBody)
        });

        if (putRes.ok) {
          const putResult = await putRes.json();
          return { success: true, method: "cloud", git: true, commit: putResult.commit.sha };
        } else {
          const errText = await putRes.text();
          console.error("GitHub API PUT failed:", errText);
        }
      } catch (e) {
        console.error("Direct GitHub cloud save failed", e);
      }
      return { success: false, method: "cloud" };
    }

    return { success: false, method: "local" };
  }
}

export const api = new UnifiedAPI();
