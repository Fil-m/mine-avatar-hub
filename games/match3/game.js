/**
 * game.js
 * Двигун гри Match-3 для безпечної пісочниці iframe.
 * Рендерить шикарні неонові кристали на Canvas, підтримує анімацію каскадів,
 * розраховує здобуті ресурси та передає їх Хабу через безпечний postMessage контракт.
 */

const canvas = document.getElementById("match3-canvas");
const ctx = canvas.getContext("2d");

const GRID_SIZE = 8;
const CELL_SIZE = 50;
const COLORS = {
  ruby: "#ff007f",      // Hot Pink
  sapphire: "#00f0ff",  // Cyan
  emerald: "#00e676",   // Neon Green
  gold: "#ffea00",      // Gold/Yellow
  bg: "#05070c",
  grid: "rgba(255, 255, 255, 0.03)"
};

// Види кристалів
const TYPES = [
  { id: "ruby", color: COLORS.ruby, name: "Ruby", resKey: "resource:ruby" },
  { id: "sapphire", color: COLORS.sapphire, name: "Sapphire", resKey: "resource:sapphire" },
  { id: "emerald", color: COLORS.emerald, name: "Emerald", resKey: "resource:emerald" },
  { id: "gold", color: COLORS.gold, name: "Gold", resKey: "resource:gold" }
];

let board = [];
let selectedCell = null;
let score = 0;
let earned = {
  "resource:gold": 0,
  "resource:ruby": 0,
  "resource:sapphire": 0,
  "resource:emerald": 0
};
let isAnimating = false;
let particles = [];

// Отримання токена сесії
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token") || "Offline-Demo-Token";
document.getElementById("token-box").innerText = `Token: ${token}`;

// Ініціалізація дошки (без первинних трійок)
function initBoard() {
  for (let r = 0; r < GRID_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      let typeIdx;
      do {
        typeIdx = Math.floor(Math.random() * TYPES.length);
      } while (
        (r >= 2 && board[r-1][c] === typeIdx && board[r-2][c] === typeIdx) ||
        (c >= 2 && board[r][c-1] === typeIdx && board[r][c-2] === typeIdx)
      );
      board[r][c] = typeIdx;
    }
  }
}

// Малювання кристалу
function drawCrystal(x, y, typeIdx, isSelected = false) {
  const cx = x + CELL_SIZE / 2;
  const cy = y + CELL_SIZE / 2;
  const size = 16;
  const type = TYPES[typeIdx];

  ctx.save();

  // Додаємо неонове свічення
  ctx.shadowColor = type.color;
  ctx.shadowBlur = isSelected ? 15 : 6;
  ctx.strokeStyle = type.color;
  ctx.lineWidth = isSelected ? 3 : 2;
  
  // Напівпрозоре наповнення для глибини
  ctx.fillStyle = `${type.color}22`;

  ctx.beginPath();
  if (type.id === "ruby") {
    // Ромб (Рубін)
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
  } else if (type.id === "sapphire") {
    // Шестикутник (Сапфір)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 6;
      ctx.lineTo(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
    }
    ctx.closePath();
  } else if (type.id === "emerald") {
    // Восьмикутник (Смарагд)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.lineTo(cx + (size - 2) * Math.cos(angle), cy + (size - 2) * Math.sin(angle));
    }
    ctx.closePath();
  } else {
    // Зірка / Кружечок з хрестом (Золото)
    ctx.arc(cx, cy, size - 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Внутрішній хрест
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
  }
  
  ctx.fill();
  ctx.stroke();

  // Світловий блик
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Малювання сітки та кристалів
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Малюємо лінійну сітку кібер-декору
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }

  // Малюємо кристали
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] !== null) {
        const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
        drawCrystal(c * CELL_SIZE, r * CELL_SIZE, board[r][c], isSelected);
      }
    }
  }

  // Малюємо та оновлюємо часточки ефектів
  drawParticles();
}

// Створення часточок вибуху
function spawnParticles(c, r, color) {
  const px = c * CELL_SIZE + CELL_SIZE / 2;
  const py = r * CELL_SIZE + CELL_SIZE / 2;
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: px,
      y: py,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      radius: Math.random() * 3 + 1,
      color: color,
      alpha: 1.0,
      life: 30
    });
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 1.0 / p.life;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Пошук збігів (тільки трійки або більше)
function checkMatches() {
  let matched = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
  let hasMatch = false;

  // Горизонтальні збіги
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE - 2; c++) {
      const val = board[r][c];
      if (val !== null && board[r][c+1] === val && board[r][c+2] === val) {
        matched[r][c] = true;
        matched[r][c+1] = true;
        matched[r][c+2] = true;
        hasMatch = true;
      }
    }
  }

  // Вертикальні збіги
  for (let c = 0; c < GRID_SIZE; c++) {
    for (let r = 0; r < GRID_SIZE - 2; r++) {
      const val = board[r][c];
      if (val !== null && board[r+1][c] === val && board[r+2][c] === val) {
        matched[r][c] = true;
        matched[r+1][c] = true;
        matched[r+2][c] = true;
        hasMatch = true;
      }
    }
  }

  return { hasMatch, matched };
}

// Видалення збігів та нарахування ресурсів
async function processMatches() {
  isAnimating = true;
  let matches = checkMatches();

  if (!matches.hasMatch) {
    isAnimating = false;
    return false;
  }

  let matchCount = 0;
  // Рахуємо та підриваємо кристали
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (matches.matched[r][c]) {
        const typeIdx = board[r][c];
        const type = TYPES[typeIdx];
        
        spawnParticles(c, r, type.color);
        
        // Нараховуємо здобуток
        score += 10;
        if (type.id === "gold") {
          earned["resource:gold"] += 2;
        } else {
          earned[type.resKey] += 1;
          // Також нараховуємо трохи золота за будь-які кристали!
          earned["resource:gold"] += 1;
        }

        board[r][c] = null;
        matchCount++;
      }
    }
  }

  // Оновлюємо інтерфейс
  document.getElementById("score-val").innerText = score;
  document.getElementById("gold-val").innerText = earned["resource:gold"];

  // Чекаємо спалахів вибухів
  await new Promise(r => setTimeout(r, 200));

  // Зсуваємо вниз
  for (let c = 0; c < GRID_SIZE; c++) {
    let emptyRow = GRID_SIZE - 1;
    for (let r = GRID_SIZE - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        if (emptyRow !== r) {
          board[emptyRow][c] = board[r][c];
          board[r][c] = null;
        }
        emptyRow--;
      }
    }
    // Заповнюємо зверху
    for (let r = emptyRow; r >= 0; r--) {
      board[r][c] = Math.floor(Math.random() * TYPES.length);
    }
  }

  // Повторно перевіряємо ланцюгові реакції (каскади)
  drawBoard();
  await new Promise(r => setTimeout(r, 150));
  await processMatches();
  return true;
}

// Клік по Canvas
canvas.addEventListener("click", async (e) => {
  if (isAnimating) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const c = Math.floor(x / CELL_SIZE);
  const r = Math.floor(y / CELL_SIZE);

  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;

  if (!selectedCell) {
    selectedCell = { r, c };
    drawBoard();
  } else {
    const dr = Math.abs(selectedCell.r - r);
    const dc = Math.abs(selectedCell.c - c);

    // Перевірка суміжності (тільки ортогональні сусіди)
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      isAnimating = true;
      
      // Тимчасово міняємо місцями
      const temp = board[r][c];
      board[r][c] = board[selectedCell.r][selectedCell.c];
      board[selectedCell.r][selectedCell.c] = temp;

      drawBoard();
      await new Promise(res => setTimeout(res, 150));

      const matches = checkMatches();
      if (matches.hasMatch) {
        selectedCell = null;
        await processMatches();
      } else {
        // Повертаємо назад
        const tempBack = board[r][c];
        board[r][c] = board[selectedCell.r][selectedCell.c];
        board[selectedCell.r][selectedCell.c] = tempBack;
        selectedCell = null;
        drawBoard();
      }
      isAnimating = false;
    } else {
      // Зміна вибору
      selectedCell = { r, c };
      drawBoard();
    }
  }
});

// Обробник натискання "Claim & Save Progress"
document.getElementById("claim-btn").addEventListener("click", () => {
  // 🔒 Передаємо ресурси через безпечний пост-меседж
  window.parent.postMessage({
    type: "EARN_RESOURCES",
    payload: {
      token: token,
      resources: earned
    }
  }, "*");
});

// Анімаційний цикл часточок
function animate() {
  drawBoard();
  requestAnimationFrame(animate);
}

// Запуск
initBoard();
animate();
