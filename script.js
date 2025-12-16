const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- AYARLAR ---
const ENEMY_THRESHOLD = 1000; 

// --- MÜZİK SİSTEMİ (YENİ) ---
// music.mp3 dosyasını klasöre atmayı unutma!
const bgMusic = new Audio('music.mp3');
bgMusic.loop = true;   // Sürekli dönsün
bgMusic.volume = 0.4;  // Sesi %40 yapalım ki efektleri bastırmasın

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

// --- SES EFEKT SİSTEMİ (SFX) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // MÜZİĞİ BAŞLAT
    // play() komutu kaldığı yerden devam ettirir.
    bgMusic.play().catch(e => console.log("Müzik başlatılamadı (Dosya var mı?):", e));
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

// KOMBO & MODLAR
let combo = 1;
let comboTimer = 0;
const MAX_COMBO_TIME = 180; 

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
    x: 0, y: 0,
    width: 40, height: 15,
    angle: 0,
    rotationSpeed: 0.04,
    vx: 0, vy: 0,
    gravity: 0.15,
    recoilPower: 9, 
    friction: 0.98
};

// NESNE DİZİLERİ
let targets = []; 
let mines = []; 
let particles = [];
let stars = [];
let floatingTexts = [];

// YILDIZLAR
for(let i=0; i<50; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.5 + 0.1
    });
}

function initGame() {
    // initAudio hem SFX sistemini açar hem müziği play() yapar
    initAudio(); 
    
    gun.x = canvas.width / 2;
    gun.y = canvas.height / 2;
    gun.vx = 0;
    gun.vy = 0;
    gun.angle = -Math.PI / 2;
    
    score = 0;
    combo = 1;
    comboTimer = 0;
    
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
    if (type === 'mine') { count = 30; }

    for(let i=0; i<count; i++) {
        let hue;
        if (type === 'mine') hue = Math.random() * 20 + 340; 
        else if (type === 'explosion') hue = Math.random() * 60 + 40; 
        else hue = Math.random() * 20 + 10; 

        particles.push({
            x: x, y: y,
            vx: velX * 0.5 + (Math.random() - 0.5) * speedMult,
            vy: velY * 0.5 + (Math.random() - 0.5) * speedMult,
            life: 1.0,
            type: type, 
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

function loop() {
    if (gameState !== 'PLAYING') return;

    if (comboTimer > 0) {
        comboTimer--;
        updateComboUI();
    } else {
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

    ctx.fillStyle = (combo >= 5) ? '#1a001a' : '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    if (shake > 0) {
        let dx = (Math.random() - 0.5) * shake;
        let dy = (Math.random() - 0.5) * shake;
        ctx.translate(dx, dy);
        shake *= 0.9; if(shake < 0.5) shake = 0;
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    stars.forEach(star => {
        star.y += star.speed + (combo >= 5 ? 2 : 0);
        if (star.y > canvas.height) star.y = 0;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI*2);
        ctx.fill();
    });

    if (combo >= 3) {
        ctx.beginPath();
        ctx.arc(gun.x, gun.y, 150, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, 0.1)`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    gun.vy += gun.gravity;
    gun.x += gun.vx;
    gun.y += gun.vy;
    gun.vx *= gun.friction;
    gun.vy *= gun.friction;
    gun.angle += gun.rotationSpeed;

    if (gun.x < 0) { gun.x = 0; gun.vx *= -0.6; }
    if (gun.x > canvas.width) { gun.x = canvas.width; gun.vx *= -0.6; }
    if (gun.y < 0) { gun.y = 0; gun.vy *= -0.6; }
    if (gun.y > canvas.height) { playSound('die'); gameOver(); return; }

    for (let i = mines.length - 1; i >= 0; i--) {
        let m = mines[i];
        m.x += m.vx; m.y += m.vy; m.angle += 0.05;
        if (m.x < 0 || m.x > canvas.width) m.vx *= -1;
        if (m.y < 0 || m.y > canvas.height) m.vy *= -1;

        let dx = gun.x - m.x;
        let dy = gun.y - m.y;
        let dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < m.radius + (gun.width/2)) {
            createParticles(gun.x, gun.y, 0, 0, 'mine');
            shake = 20;
            playSound('die');
            gameOver(); 
            return;
        }

        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.angle);
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff0000';
        ctx.beginPath();
        ctx.arc(0, 0, m.radius, 0, Math.PI*2);
        ctx.fill();
        for(let j=0; j<8; j++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(m.radius, -5);
            ctx.lineTo(m.radius + 10, 0);
            ctx.lineTo(m.radius, 5);
            ctx.fill();
        }
        ctx.fillStyle = '#550000';
        ctx.beginPath();
        ctx.arc(0, 0, m.radius/2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    for (let i = targets.length - 1; i >= 0; i--) {
        let t = targets[i];
        
        if (combo >= 3) {
            let dx = gun.x - t.x;
            let dy = gun.y - t.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 300) { t.x += dx * 0.05; t.y += dy * 0.05; }
        }

        let dx = gun.x - t.x;
        let dy = gun.y - t.y;
        let distance = Math.sqrt(dx*dx + dy*dy);
        
        t.pulse += 0.1;

        if (distance < gun.width + t.radius) {
            let points = 1 * combo;
            score += points;
            scoreEl.innerText = score;
            
            let comboText = combo > 1 ? ` x${combo}` : '';
            let color = combo >= 5 ? '#ff00ff' : (combo >= 3 ? '#00ffff' : '#fff');
            spawnFloatingText(t.x, t.y, `+${points}${comboText}`, color);

            combo++;
            comboTimer = MAX_COMBO_TIME;

            createParticles(t.x, t.y, 0, 0, 'explosion');
            shake = 10 + (combo * 2);
            playSound('coin', combo);
            gun.vx *= 0.6; gun.vy *= 0.6;

            targets.splice(i, 1);
            continue;
        }

        let pulseSize = Math.sin(t.pulse) * 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius + pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = combo >= 5 ? '#ff00ff' : (combo >= 3 ? '#00ffaa' : '#0ff');
        ctx.fill();
        ctx.shadowBlur = 20;
        ctx.shadowColor = ctx.fillStyle;
        ctx.closePath();
        ctx.shadowBlur = 0;
    }

    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(gun.angle);
    ctx.beginPath();
    ctx.moveTo(-20, 0); 
    ctx.lineTo(-200, 0); 
    ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 15]);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(gun.angle);
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0055';
    ctx.fillRect(-gun.width / 2, -gun.height / 2, gun.width, gun.height);
    ctx.fillStyle = '#cc0044';
    ctx.fillRect(-5, 0, 10, 15);
    ctx.fillStyle = '#000';
    ctx.fillRect((gun.width/2) - 6, -gun.height/2, 6, gun.height);
    ctx.restore();

    updateParticlesAndTexts();
    ctx.restore();
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
    
    // MÜZİĞİ DURAKLAT (Pause)
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