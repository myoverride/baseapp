const canvasRef = ref(null);
    const containerRef = ref(null);
    const score = ref(0);
    const highScore = ref(parseInt(localStorage.getItem('flappyHighScore')) || 0);
    const gameState = ref('ready'); // 'ready', 'playing', 'gameover'

    let ctx = null;
    let animationFrameId = null;
    let frames = 0;
    
    // Oyun çözünürlüğü sabittir, CSS ile ekran boyutuna sığdırılır
    const CW = 400;
    const CH = 600;
    
    const bird = {
       x: 80, y: 300, radius: 14, velocity: 0, gravity: 0.5, jump: -8
    };
    let pipes = [];
    
    const resetGame = () => {
        bird.y = 300;
        bird.velocity = 0;
        pipes = [];
        score.value = 0;
        frames = 0;
        gameState.value = 'ready';
        draw();
    };
    
    const jump = () => {
        if (gameState.value === 'ready') {
            gameState.value = 'playing';
            loop();
        }
        if (gameState.value === 'playing') {
            bird.velocity = bird.jump;
        }
        if (gameState.value === 'gameover') {
            resetGame();
        }
    };
    
    const loop = () => {
        if (gameState.value !== 'playing') return;
        update();
        draw();
        animationFrameId = requestAnimationFrame(loop);
    };
    
    const gameOver = () => {
        gameState.value = 'gameover';
        if (score.value > highScore.value) {
            highScore.value = score.value;
            localStorage.setItem('flappyHighScore', highScore.value);
        }
    };

    const update = () => {
        frames++;
        bird.velocity += bird.gravity;
        bird.y += bird.velocity;
        
        // Zemin veya Tavan Çarpışması
        if (bird.y + bird.radius >= CH || bird.y - bird.radius <= 0) {
            gameOver();
        }
        
        // Boru Üretimi (Zorluk seviyesi için frame aralığı)
        if (frames % 100 === 0) {
            const gapSize = 140; // Borular arası boşluk
            const minPipeHeight = 50;
            // Boşluğun orta noktası rastgele
            const gapPosition = Math.random() * (CH - 2 * minPipeHeight - gapSize) + minPipeHeight + gapSize/2;
            
            pipes.push({
                x: CW,
                top: gapPosition - gapSize/2,
                bottom: gapPosition + gapSize/2,
                width: 60,
                passed: false
            });
        }
        
        for (let i = 0; i < pipes.length; i++) {
            let p = pipes[i];
            p.x -= 2.5; // Boru ilerleme hızı
            
            // Çarpışma Tespiti (AABB)
            let birdLeft = bird.x - bird.radius;
            let birdRight = bird.x + bird.radius;
            let birdTop = bird.y - bird.radius;
            let birdBottom = bird.y + bird.radius;
            
            // Borunun X eksenine girdi mi?
            if (birdRight > p.x && birdLeft < p.x + p.width) {
                // Üst boruya veya alt boruya değdi mi?
                if (birdTop < p.top || birdBottom > p.bottom) {
                    gameOver();
                }
            }
            
            // Skoru artır
            if (p.x + p.width < birdLeft && !p.passed) {
                score.value++;
                p.passed = true;
            }
        }
        
        // Ekrandan çıkan boruları temizle
        if (pipes.length > 0 && pipes[0].x + pipes[0].width < 0) {
            pipes.shift();
        }
    };
    
    const draw = () => {
        if (!ctx) return;
        
        // Gökyüzü Arka Plan
        ctx.fillStyle = '#70c5ce';
        ctx.fillRect(0, 0, CW, CH);
        
        // Basit Bulutlar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath(); ctx.arc(100 - (frames * 0.2 % CW), 150, 30, 0, 2*Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(130 - (frames * 0.2 % CW), 150, 40, 0, 2*Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(160 - (frames * 0.2 % CW), 150, 30, 0, 2*Math.PI); ctx.fill();

        ctx.beginPath(); ctx.arc(300 - (frames * 0.3 % CW), 250, 20, 0, 2*Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(320 - (frames * 0.3 % CW), 250, 30, 0, 2*Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(340 - (frames * 0.3 % CW), 250, 20, 0, 2*Math.PI); ctx.fill();
        
        // Borular
        for (let p of pipes) {
            // Boru gövdesi
            ctx.fillStyle = '#73bf2e';
            ctx.fillRect(p.x, 0, p.width, p.top); // Üst
            ctx.fillRect(p.x, p.bottom, p.width, CH - p.bottom); // Alt
            
            // Boru Çizgileri ve Uç Kapakları (Flappy stili)
            ctx.strokeStyle = '#538d22'; 
            ctx.lineWidth = 4;
            ctx.strokeRect(p.x, 0, p.width, p.top);
            ctx.strokeRect(p.x, p.bottom, p.width, CH - p.bottom);
            
            // Boru uç kapakları (daha kalın kısım)
            const capHeight = 25;
            ctx.fillRect(p.x - 4, p.top - capHeight, p.width + 8, capHeight);
            ctx.strokeRect(p.x - 4, p.top - capHeight, p.width + 8, capHeight);
            
            ctx.fillRect(p.x - 4, p.bottom, p.width + 8, capHeight);
            ctx.strokeRect(p.x - 4, p.bottom, p.width + 8, capHeight);
        }
        
        // Zemin Çizgisi
        ctx.fillStyle = '#ded895';
        ctx.fillRect(0, CH - 20, CW, 20);
        ctx.strokeStyle = '#73bf2e';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, CH-20); ctx.lineTo(CW, CH-20); ctx.stroke();
        
        // Kuş
        ctx.save();
        ctx.translate(bird.x, bird.y);
        
        // Kuşun hıza göre dönmesi (Burnunu aşağı/yukarı eğmesi)
        let rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 6, (bird.velocity * 0.1)));
        ctx.rotate(rotation);
        
        // Kuş Gövdesi
        ctx.fillStyle = '#f8da2e';
        ctx.beginPath(); ctx.arc(0, 0, bird.radius, 0, 2*Math.PI); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
        
        // Göz
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bird.radius/2, -bird.radius/3, 5, 0, 2*Math.PI); ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(bird.radius/2 + 2, -bird.radius/3, 2, 0, 2*Math.PI); ctx.fill();
        
        // Kanat (Kanat Çırpma animasyonu)
        const wingY = (gameState.value === 'playing' && frames % 10 < 5) ? 2 : 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(-bird.radius/2, wingY, 8, 5, 0, 0, 2*Math.PI); ctx.fill();
        ctx.stroke();
        
        // Gaga
        ctx.fillStyle = '#f56c19';
        ctx.beginPath(); ctx.moveTo(bird.radius - 2, 0); ctx.lineTo(bird.radius + 12, 4); ctx.lineTo(bird.radius - 2, 8); ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    };

    const handleKeyDown = (e) => {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            jump();
        }
    };

    onMounted(() => {
        if (canvasRef.value) {
            ctx = canvasRef.value.getContext('2d');
            draw(); // İlk kareyi çiz
        }
        window.addEventListener('keydown', handleKeyDown, { passive: false });
    });

    onUnmounted(() => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        window.removeEventListener('keydown', handleKeyDown);
    });

    const goHome = () => {
        window.location.href = '/';
    };

    return {
        canvasRef, containerRef, score, highScore, gameState, jump, goHome
    };