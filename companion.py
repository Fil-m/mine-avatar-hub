#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
companion.py
Кроссплатформенний Desktop Companion для Mine & Craft Avatar Hub.
Працює як локальний HTTP-сервер на порту 8989.
Забезпечує локальну персистентність збережень та фонову автоматизацію Git (CORS-сумісний).

Сумісність: Windows, macOS, Linux, Android (Termux)
Залежності: Немає (лише стандартна бібліотека Python 3)
"""

import os
import sys
import json
import urllib.parse
import subprocess
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 8989
SAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saves")
PLAYERS_DIR = os.path.join(SAVE_DIR, "players")
HISTORY_FILE = os.path.join(SAVE_DIR, "history.jsonl")

# Забезпечуємо існування директорій
os.makedirs(PLAYERS_DIR, exist_ok=True)


def check_git_repo():
    """Перевіряє, чи є поточна директорія git-репозиторієм."""
    try:
        res = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], 
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        return res.returncode == 0
    except FileNotFoundError:
        return False


def run_git_sync(username, sequence):
    """Фонова синхронізація через Git."""
    if not check_git_repo():
        print("⚠️  [Git Sync] Not inside a Git repository or Git is not installed. Skipping automatic Git Push.")
        return

    print(f"🔄 [Git Sync] Initializing background commit for sequence #{sequence}...")
    try:
        # Додаємо збереження гравця
        player_save_path = os.path.join(PLAYERS_DIR, username, "save.json")
        subprocess.run(["git", "add", player_save_path], check=True)
        
        # Робимо коміт
        commit_msg = f"Auto-save sequence #{sequence} for {username}"
        subprocess.run(["git", "commit", "-m", commit_msg], check=True)
        print(f"✅ [Git Sync] Committed locally: '{commit_msg}'")

        # Намагаємося завантажити зміни в хмару
        # Використовуємо таймаут для запобігання вічному зависанню за відсутності мережі
        print("🚀 [Git Sync] Pushing to remote repository...")
        res = subprocess.run(["git", "push"], timeout=15, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        print("✅ [Git Sync] Successfully pushed to remote.")
    except subprocess.TimeoutExpired:
        print("❌ [Git Sync] Git push timed out. Network connection might be offline. State remains committed locally.")
    except subprocess.CalledProcessError as e:
        print(f"❌ [Git Sync] Git operation failed: {e.stderr.decode('utf-8', errors='ignore')}")
    except Exception as e:
        print(f"❌ [Git Sync] Unexpected error during Git automation: {e}")


class CompanionHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        """Встановлює правильні CORS заголовки для браузерних запитів."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        """Обробляє CORS preflight запити."""
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # 1. Ендпоінт статусу роботи
        if path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            
            status_payload = {
                "status": "ready",
                "os": sys.platform,
                "mode": "hybrid_git",
                "git_repo": check_git_repo(),
                "eme_support": False
            }
            self.wfile.write(json.dumps(status_payload).encode("utf-8"))
            return

        # 2. Ендпоінт завантаження збереження гравця
        elif path == "/load":
            username = query.get("username", [None])[0]
            if not username:
                self.send_error_json(400, "Missing 'username' query parameter")
                return

            player_file = os.path.join(PLAYERS_DIR, username, "save.json")
            if not os.path.exists(player_file):
                self.send_error_json(404, f"No save found for player: {username}")
                return

            try:
                with open(player_file, "r", encoding="utf-8") as f:
                    save_data = json.load(f)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(save_data).encode("utf-8"))
            except Exception as e:
                self.send_error_json(500, f"Error reading player save: {str(e)}")
            return

        # Невідомий маршрут
        self.send_error_json(404, "Endpoint not found")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # 3. Ендпоінт збереження стану гравця
        if path == "/save":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error_json(400, "Empty POST body")
                return

            try:
                post_data = self.rfile.read(content_length)
                save_state = json.loads(post_data.decode("utf-8"))
                
                username = save_state.get("player", {}).get("username")
                sequence = save_state.get("player", {}).get("sequence", 0)

                if not username:
                    self.send_error_json(400, "Invalid payload: 'player.username' is required")
                    return

                # Записуємо у файл гравця
                player_dir = os.path.join(PLAYERS_DIR, username)
                os.makedirs(player_dir, exist_ok=True)
                player_file = os.path.join(player_dir, "save.json")

                with open(player_file, "w", encoding="utf-8") as f:
                    json.dump(save_state, f, indent=2, ensure_ascii=False)

                # Додаємо запис в історію транзакцій (ledger)
                history_entry = {
                    "timestamp": save_state.get("last_session", {}).get("timestamp", sequence),
                    "username": username,
                    "sequence": sequence,
                    "resources": save_state.get("resources", {})
                }
                with open(HISTORY_FILE, "a", encoding="utf-8") as hf:
                    hf.write(json.dumps(history_entry, ensure_ascii=False) + "\n")

                # Запуск фонового потоку для Git-синхронізації
                git_thread = threading.Thread(target=run_git_sync, args=(username, sequence))
                git_thread.daemon = True
                git_thread.start()

                # Миттєво відповідаємо клієнту для преміального UX
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                
                response_payload = {
                    "success": True,
                    "msg": "Saved locally, Git sync is running in background thread",
                    "git": {
                        "enabled": check_git_repo(),
                        "sequence": sequence
                    }
                }
                self.wfile.write(json.dumps(response_payload).encode("utf-8"))
            except Exception as e:
                self.send_error_json(500, f"Error saving player state: {str(e)}")
            return

        self.send_error_json(404, "Endpoint not found")

    def send_error_json(self, code, message):
        """Зручний хелпер для відправки помилок у форматі JSON."""
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        err_payload = {"error": True, "code": code, "message": message}
        self.wfile.write(json.dumps(err_payload).encode("utf-8"))

    def log_message(self, format, *args):
        # Перевизначаємо для кастомного логування в консоль без сміття
        sys.stdout.write("🖥️  [Companion Core] %s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))


def run():
    print("=" * 60)
    print("📟 Mine & Craft Avatar Hub Desktop Companion v3.0")
    print("=" * 60)
    print(f"📍 Working directory: {os.path.dirname(os.path.abspath(__file__))}")
    print(f"💾 Storage Directory: {SAVE_DIR}")
    print(f"🐙 Local Git Repo detected: {'YES' if check_git_repo() else 'NO (Local-only mode active)'}")
    
    server_address = ("127.0.0.1", PORT)
    try:
        httpd = HTTPServer(server_address, CompanionHandler)
        print(f"🚀 Server is running and listening on http://127.0.0.1:{PORT}")
        print("👉 Press Ctrl+C to terminate...")
        print("-" * 60)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Terminating Desktop Companion...")
    except Exception as e:
        print(f"❌ Failed to start server: {e}")


if __name__ == "__main__":
    run()
