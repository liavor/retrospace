const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- AYARLAR ---
// Test etmek için bu sayıları düşürebilirsin (örn: 100, 200, 300)
const STAGE_2_THRESHOLD = 100; // Toxic Sewers
const STAGE_3_THRESHOLD = 250; // Cyber Glitch
const STAGE_4_THRESHOLD = 500; // The Void (Ghosting)

const ENEMY_THRESHOLD = 1000;   // Mayınların başlama puanı

// --- MÜZİK SİSTEMİ ---
const bgMusic = new Audio('music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

// UI Elementleri
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const startHighScoreEl = document.getElementById('start-high-score');
const endHighScoreEl = document.getElementById('end-high-score');
const finalScoreEl = document.getElementById('final-score');
const comboBar = document.getElementById('combo-bar');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// --- SES EFEKT SİSTEMİ ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    bgMusic.play().catch(e => console.log("Müzik hatası:", e));
}

function playSound(type, pitchMult = 1) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } 
    else if (type === 'coin') {
        let baseFreq = 1000 * (1 + (pitchMult * 0.1)); 
        if(baseFreq > 2000) baseFreq = 2000; 
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq + 600, now + 0.1);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
    else if (type === 'die') {
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(10, now + 0.8);
        gainNode.gain.setValueAtTime(0.8, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

// --- OYUN DEĞİŞKENLERİ ---
let gameState = 'START';
let score = 0;
let highScore = parseInt(localStorage.getItem('recoilHighScore')) || 0;
let shake = 0;
let gameTime = 0; // Animasyonlar için zaman sayacı

// KOMBO & MODLAR
let combo = 1;
let comboTimer = 0;
const MAX_COMBO_TIME = 18000; 

// EKRAN
highScoreEl.innerText = highScore;
startHighScoreEl.innerText = highScore;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const gun = {
    x: 0, y: 0, width: 40, height: 15,
    angle: 0, rotationSpeed: 0.04,
    vx: 0, vy: 0, gravity: 0.15, recoilPower: 9, friction: 0.98
};

// NESNE DİZİLERİ
let targets = []; 
let mines = []; 
let particles = [];
let stars = []; // Hem yıldız hem baloncuk olacaklar
let floatingTexts = [];

// Yıldızları oluştur
for(let i=0; i<50; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.5 + 0.1
    });
}

function initGame() {
    initAudio();
    gun.x = canvas.width / 2;
    gun.y = canvas.height / 2;
    gun.vx = 0; gun.vy = 0; gun.angle = -Math.PI / 2;
    
    score = 0;
    combo = 1;
    comboTimer = 0;
    gameTime = 0;
    
    scoreEl.innerText = score;
    updateComboUI();
    
    particles = [];
    floatingTexts = [];
    targets = [];
    mines = []; 
    spawnTarget();
    
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    loop();
}

function spawnTarget() {
    const padding = 60;
    targets.push({
        x: padding + Math.random() * (canvas.width - padding * 2),
        y: padding + Math.random() * (canvas.height - 200),
        radius: 20,
        pulse: Math.random() * Math.PI
    });
}

function spawnMine() {
    const padding = 50;
    let mx, my;
    do {
        mx = Math.random() * canvas.width;
        my = Math.random() * (canvas.height - 100);
    } while (Math.abs(mx - gun.x) < 100 && Math.abs(my - gun.y) < 100);

    mines.push({
        x: mx, y: my, radius: 25,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        angle: 0
    });
}

function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({
        x: x, y: y, text: text, color: color,
        life: 1.0, vy: -2
    });
}

function handleInput(e) {
    if (gameState !== 'PLAYING') return;
    gun.vx -= Math.cos(gun.angle) * gun.recoilPower;
    gun.vy -= Math.sin(gun.angle) * gun.recoilPower;
    createParticles(gun.x, gun.y, Math.cos(gun.angle) * 10, Math.sin(gun.angle) * 10, 'smoke');
    shake = 5;
    playSound('shoot');
}

window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', handleInput, {passive: false});

startBtn.addEventListener('click', (e) => { e.stopPropagation(); initGame(); });
restartBtn.addEventListener('click', (e) => { e.stopPropagation(); initGame(); });

function createParticles(x, y, velX, velY, type) {
    let count = type === 'explosion' ? 20 : 5;
    let speedMult = type === 'explosion' ? 5 : 2;
    if (type === 'mine') count = 30;

    for(let i=0; i<count; i++) {
        let hue;
        // Evreye göre parçacık renkleri
        if (type === 'mine') hue = Math.random() * 20 + 340; 
        else if (score > STAGE_4_THRESHOLD) hue = Math.random() * 360; // Gökkuşağı
        else if (score > STAGE_2_THRESHOLD && score < STAGE_3_THRESHOLD) hue = Math.random() * 40 + 80; // Yeşil (Toxic)
        else hue = type === 'explosion' ? Math.random()*60+40 : Math.random()*20+10; 

        particles.push({
            x: x, y: y,
            vx: velX * 0.5 + (Math.random() - 0.5) * speedMult,
            vy: velY * 0.5 + (Math.random() - 0.5) * speedMult,
            life: 1.0, type: type, 
            color: `hsl(${hue}, 100%, 50%)`
        });
    }
}

function updateComboUI() {
    let percentage = (comboTimer / MAX_COMBO_TIME) * 100;
    comboBar.style.width = percentage + '%';
    if (percentage < 30) comboBar.style.backgroundColor = '#ff0000';
    else if (combo >= 5) comboBar.style.backgroundColor = '#ff00ff';
    else comboBar.style.backgroundColor = '#ff0055';
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    // Perspektif hareketi için offset
    const offset = (gameTime * 0.5) % gridSize; 
    
    // Dikey
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    // Yatay (Hareketli)
    for (let y = offset; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function loop() {
    if (gameState !== 'PLAYING') return;
    gameTime++;

    // --- MANTIK GÜNCELLEMELERİ ---
    if (comboTimer > 0) { comboTimer--; updateComboUI(); } 
    else {
        if (combo > 1) spawnFloatingText(gun.x, gun.y - 20, "COMBO LOST", "#aaa");
        combo = 1;
    }

    let desiredTargetCount = (combo >= 5) ? 6 : 1;
    if (targets.length < desiredTargetCount) spawnTarget();

    if (score >= ENEMY_THRESHOLD) {
        let maxMines = 1 + Math.floor((score - ENEMY_THRESHOLD) / 500);
        if (maxMines > 5) maxMines = 5;
        if (mines.length < maxMines && Math.random() < 0.02) {
            spawnMine();
            spawnFloatingText(canvas.width/2, 100, "WARNING!", "#ff0000");
        }
    }

    // --- ARKA PLAN VE ATMOSFER (ÖNEMLİ!) ---
    
    ctx.save(); // Glitch sarsıntısı için save

    // STAGE 4: THE VOID (Ghosting)
    if (score > STAGE_4_THRESHOLD) {
        // Ekranı temizlemek yerine yarı saydam boyuyoruz (İz bırakma)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } 
    // STAGE 3: CYBER GLITCH
    else if (score > STAGE_3_THRESHOLD) {
        ctx.fillStyle = '#050010'; // Çok koyu mor
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(); // Izgara çiz
        
        // Glitch Efekti (Rastgele sarsıntı)
        if (Math.random() < 0.05) {
            let shiftX = (Math.random() - 0.5) * 10;
            ctx.translate(shiftX, 0);
        }
    }
    // STAGE 2: TOXIC SEWERS
    else if (score > STAGE_2_THRESHOLD) {
        ctx.fillStyle = '#051505'; // Koyu Yeşil
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // STAGE 1: NEON CITY (Default)
    else {
        ctx.fillStyle = (combo >= 5) ? '#1a001a' : '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Sarsıntı (Silah ateşleyince olan)
    if (shake > 0) {
        let dx = (Math.random() - 0.5) * shake;
        let dy = (Math.random() - 0.5) * shake;
        ctx.translate(dx, dy);
        shake *= 0.9; if(shake < 0.5) shake = 0;
    }

    // Yıldızlar / Baloncuklar
    // Stage 2'de renk yeşilimsi ve yön YUKARI olur
    let starColor = (score > STAGE_2_THRESHOLD && score < STAGE_3_THRESHOLD) 
                    ? 'rgba(100, 255, 100, 0.3)' // Yeşil Baloncuk
                    : 'rgba(255, 255, 255, 0.5)'; // Beyaz Yıldız

    ctx.fillStyle = starColor;
    
    stars.forEach(star => {
        // Toxic Modda (Stage 2) yukarı çıkar, diğerlerinde aşağı iner
        if (score > STAGE_2_THRESHOLD && score < STAGE_3_THRESHOLD) {
            star.y -= star.speed * 2; // Yukarı (Baloncuk)
            if (star.y < 0) star.y = canvas.height;
        } else {
            star.y += star.speed + (combo >= 5 ? 2 : 0); // Aşağı (Yıldız)
            if (star.y > canvas.height) star.y = 0;
        }
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI*2);
        ctx.fill();
    });

    // Magnet Görseli
    if (combo >= 3) {
        ctx.beginPath();
        ctx.arc(gun.x, gun.y, 150, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, 0.1)`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // --- SİLAH FİZİĞİ ---
    gun.vy += gun.gravity;
    gun.x += gun.vx; gun.y += gun.vy;
    gun.vx *= gun.friction; gun.vy *= gun.friction;
    gun.angle += gun.rotationSpeed;

    if (gun.x < 0) { gun.x = 0; gun.vx *= -0.6; }
    if (gun.x > canvas.width) { gun.x = canvas.width; gun.vx *= -0.6; }
    if (gun.y < 0) { gun.y = 0; gun.vy *= -0.6; }
    if (gun.y > canvas.height) { playSound('die'); gameOver(); return; }

    // --- MAYINLAR ---
    for (let i = mines.length - 1; i >= 0; i--) {
        let m = mines[i];
        m.x += m.vx; m.y += m.vy; m.angle += 0.05;
        if (m.x < 0 || m.x > canvas.width) m.vx *= -1;
        if (m.y < 0 || m.y > canvas.height) m.vy *= -1;

        if (Math.hypot(gun.x - m.x, gun.y - m.y) < m.radius + gun.width/2) {
            createParticles(gun.x, gun.y, 0, 0, 'mine');
            shake = 20; playSound('die'); gameOver(); return;
        }

        ctx.save();
        ctx.translate(m.x, m.y); ctx.rotate(m.angle);
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 15; ctx.shadowColor = '#ff0000';
        ctx.beginPath(); ctx.arc(0, 0, m.radius, 0, Math.PI*2); ctx.fill();
        for(let j=0; j<8; j++) {
            ctx.rotate(Math.PI/4); ctx.beginPath();
            ctx.moveTo(m.radius, -5); ctx.lineTo(m.radius+10, 0); ctx.lineTo(m.radius, 5); ctx.fill();
        }
        ctx.fillStyle = '#550000'; ctx.beginPath(); ctx.arc(0, 0, m.radius/2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }

    // --- HEDEFLER ---
    for (let i = targets.length - 1; i >= 0; i--) {
        let t = targets[i];
        
        if (combo >= 3) {
            let dx = gun.x - t.x, dy = gun.y - t.y;
            if (Math.sqrt(dx*dx + dy*dy) < 300) { t.x += dx * 0.05; t.y += dy * 0.05; }
        }

        t.pulse += 0.1;
        let dist = Math.hypot(gun.x - t.x, gun.y - t.y);

        if (dist < gun.width + t.radius) {
            let points = 1 * combo; score += points; scoreEl.innerText = score;
            
            let color = combo >= 5 ? '#ff00ff' : (combo >= 3 ? '#00ffff' : '#fff');
            spawnFloatingText(t.x, t.y, `+${points}${combo > 1 ? ' x'+combo : ''}`, color);

            combo++; comboTimer = MAX_COMBO_TIME;
            createParticles(t.x, t.y, 0, 0, 'explosion');
            shake = 10 + (combo * 2);
            playSound('coin', combo);
            gun.vx *= 0.6; gun.vy *= 0.6;

            targets.splice(i, 1);
            continue;
        }

        // Hedef Rengi (Stage'e göre değişsin)
        let targetColor;
        if (score > STAGE_4_THRESHOLD) targetColor = `hsl(${gameTime % 360}, 100%, 50%)`; // Rainbow
        else if (score > STAGE_3_THRESHOLD) targetColor = '#00ffff'; // Glitch Cyan
        else if (score > STAGE_2_THRESHOLD) targetColor = '#adff2f'; // Toxic Green
        else targetColor = (combo >= 5) ? '#ff00ff' : (combo >= 3 ? '#00ffaa' : '#0ff'); // Normal

        let pulseSize = Math.sin(t.pulse) * 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius + pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = targetColor;
        ctx.fill();
        ctx.shadowBlur = 20; ctx.shadowColor = ctx.fillStyle;
        ctx.closePath(); ctx.shadowBlur = 0;
    }

    // --- SİLAH VE LAZER ÇİZİMİ ---
    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(gun.angle);
    
    // Lazer
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-200, 0); 
    ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`; ctx.lineWidth = 2;
    ctx.setLineDash([5, 15]); ctx.stroke();

    // Silah Gövde
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 15; ctx.shadowColor = '#ff0055';
    ctx.fillRect(-gun.width / 2, -gun.height / 2, gun.width, gun.height);
    ctx.fillStyle = '#cc0044'; ctx.fillRect(-5, 0, 10, 15);
    ctx.fillStyle = '#000'; ctx.fillRect((gun.width/2) - 6, -gun.height/2, 6, gun.height);
    ctx.restore();

    updateParticlesAndTexts();
    ctx.restore(); // Glitch restore
    requestAnimationFrame(loop);
}

function updateParticlesAndTexts() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
        else {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.type === 'explosion' ? Math.random()*5 : 3, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
    ctx.font = "bold 24px Courier New";
    ctx.textAlign = "center";
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.vy; ft.life -= 0.02;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
        else {
            ctx.globalAlpha = ft.life;
            ctx.fillStyle = ft.color;
            ctx.shadowBlur = 5; ctx.shadowColor = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
        }
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    bgMusic.pause();
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('recoilHighScore', highScore);
        highScoreEl.innerText = highScore;
    }
    startHighScoreEl.innerText = highScore;
    endHighScoreEl.innerText = highScore;
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
}
