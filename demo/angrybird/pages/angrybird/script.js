const canvasContainer = ref(null);
    const score = ref(0);
    const gameOver = ref(false);
    const outOfBirds = ref(false);
    const birdCount = ref(3);
    
    let engine, render, runner;
    let world, Engine, Render, Runner, Mouse, MouseConstraint, Events, Constraint, Bodies, Composites, World, Body, Vector;
    let bird, sling, mouseConstraint;
    let enemies = [];
    let isFired = false;
    let MatterObj = null;

    const goHome = () => {
      window.location.href = '/';
    };

    const initMatter = async () => {
      const MatterModule = await import('https://esm.sh/matter-js@0.19.0');
      MatterObj = MatterModule.default || MatterModule;
      
      Engine = MatterObj.Engine;
      Render = MatterObj.Render;
      Runner = MatterObj.Runner;
      Mouse = MatterObj.Mouse;
      MouseConstraint = MatterObj.MouseConstraint;
      Events = MatterObj.Events;
      Constraint = MatterObj.Constraint;
      Bodies = MatterObj.Bodies;
      Composites = MatterObj.Composites;
      World = MatterObj.World;
      Body = MatterObj.Body;
      Vector = MatterObj.Vector;

      engine = Engine.create();
      world = engine.world;
      
      engine.positionIterations = 8;
      engine.velocityIterations = 6;

      render = Render.create({
        element: canvasContainer.value,
        engine: engine,
        options: {
          width: 1400,
          height: 650,
          wireframes: false,
          background: 'transparent' // We use CSS gradient
        }
      });

      Render.run(render);
      render.canvas.style.maxWidth = '100%';
      render.canvas.style.maxHeight = '100%';
      render.canvas.style.objectFit = 'contain';
      
      // Update mouse scale on window resize to keep it perfectly tracked
      window.addEventListener('resize', () => {
         setTimeout(() => {
             const rect = render.canvas.getBoundingClientRect();
             Mouse.setScale(mouseConstraint.mouse, { 
                 x: 1400 / rect.width, 
                 y: 650 / rect.height 
             });
         }, 100);
      });

      runner = Runner.create();
      Runner.run(runner, engine);

      setupLevel();
      setupMouse();
      setupEvents();
      setupCustomRendering();
    };

    const setupLevel = () => {
      World.clear(world);
      Engine.clear(engine);
      if (mouseConstraint) World.add(world, mouseConstraint);
      enemies = [];
      score.value = 0;
      gameOver.value = false;
      outOfBirds.value = false;
      birdCount.value = 3;
      isFired = false;

      // Zemin
      const ground = Bodies.rectangle(700, 630, 1600, 40, { 
        isStatic: true, 
        render: { fillStyle: '#4A5D23', strokeStyle: '#2e3a15', lineWidth: 4 } 
      });
      World.add(world, ground);

      const woodOpts = { 
        render: { fillStyle: '#D2B48C', strokeStyle: '#8B4513', lineWidth: 3 }, 
        density: 0.002, 
        friction: 0.8,
        restitution: 0.1
      };
      
      const blocks = [];
      
      // Alt Kat (Y: 610 - 50 = 560)
      blocks.push(Bodies.rectangle(700, 560, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(800, 560, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(900, 560, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(1000, 560, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(850, 500, 340, 20, woodOpts)); // Tek büyük Çatı 1

      // Orta Kat (Y: 490 - 50 = 440)
      blocks.push(Bodies.rectangle(750, 440, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(850, 440, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(950, 440, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(850, 380, 260, 20, woodOpts)); // Büyük Çatı 2

      // Üst Kat (Y: 370 - 50 = 320)
      blocks.push(Bodies.rectangle(800, 320, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(900, 320, 20, 100, woodOpts));
      blocks.push(Bodies.rectangle(850, 260, 140, 20, woodOpts)); // Zirve Çatı

      World.add(world, blocks);

      const enemyOpts = { 
        render: { fillStyle: '#32CD32', strokeStyle: '#006400', lineWidth: 3 }, 
        label: 'enemy',
        density: 0.001,
        restitution: 0.4
      };
      
      enemies.push(Bodies.circle(750, 580, 20, enemyOpts)); // Alt Sol (Zemin 610)
      enemies.push(Bodies.circle(850, 580, 20, enemyOpts)); // Alt Orta (Zemin 610)
      enemies.push(Bodies.circle(950, 580, 20, enemyOpts)); // Alt Sağ (Zemin 610)
      enemies.push(Bodies.circle(800, 470, 20, enemyOpts)); // Orta Sol (Çatı 1 üstü)
      enemies.push(Bodies.circle(900, 470, 20, enemyOpts)); // Orta Sağ (Çatı 1 üstü)
      enemies.push(Bodies.circle(850, 350, 20, enemyOpts)); // Üst Orta (Çatı 2 üstü)
      enemies.push(Bodies.circle(850, 230, 20, enemyOpts)); // Zirve
      
      World.add(world, enemies);

      spawnBird();
    };

    const spawnBird = () => {
      isFired = false;
      if (bird) World.remove(world, bird);
      if (sling) World.remove(world, sling);

      bird = Bodies.circle(300, 500, 20, { 
        render: { fillStyle: '#FF0000', strokeStyle: '#8B0000', lineWidth: 3 }, 
        density: 0.005, 
        restitution: 0.5,
        label: 'bird' 
      });
      World.add(world, bird);

      sling = Constraint.create({
        pointA: { x: 300, y: 500 },
        bodyB: bird,
        stiffness: 0.08, // Daha güçlü sapan esnekliği
        render: { strokeStyle: '#5c2c0a', lineWidth: 6 }
      });
      World.add(world, sling);
    };

    const setupMouse = () => {
      const mouse = Mouse.create(render.canvas);
      mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
          stiffness: 0.2,
          render: { visible: false }
        }
      });
      World.add(world, mouseConstraint);
      render.mouse = mouse;
    };

    const setupEvents = () => {
      Events.on(engine, 'afterUpdate', () => {
        // Slingshot mekaniği: Fare bırakıldığında ve kuş başlangıç noktasını (x=200) geçtiğinde ipi kopar
        if (!isFired && mouseConstraint.mouse.button === -1 && (bird.position.x > 300 || bird.position.y < 480)) {
            // Kuş hala yavaşsa (hiç gerdirilmemişse) ateşleme
            const speed = Math.sqrt(bird.velocity.x * bird.velocity.x + bird.velocity.y * bird.velocity.y);
            if (speed > 2 || bird.position.x > 320) {
                isFired = true;
                World.remove(world, sling);
                
                // 4 saniye sonra sıradaki kuşu getir
                setTimeout(() => {
                  if (enemies.length === 0) return; 
                  birdCount.value--;
                  if (birdCount.value > 0) {
                    spawnBird();
                  } else if (!gameOver.value) {
                    outOfBirds.value = true;
                  }
                }, 4000);
            }
        }
      });

      Events.on(engine, 'collisionStart', (event) => {
        const pairs = event.pairs;
        for (let i = 0; i < pairs.length; i++) {
          const bodyA = pairs[i].bodyA;
          const bodyB = pairs[i].bodyB;
          
          const vA = bodyA.velocity.x * bodyA.velocity.x + bodyA.velocity.y * bodyA.velocity.y;
          const vB = bodyB.velocity.x * bodyB.velocity.x + bodyB.velocity.y * bodyB.velocity.y;
          
          if (bodyA.label === 'enemy' && (vA > 10 || vB > 10)) {
              bodyA.label = 'dead';
          }
          if (bodyB.label === 'enemy' && (vA > 10 || vB > 10)) {
              bodyB.label = 'dead';
          }
        }
      });

      Events.on(engine, 'afterUpdate', () => {
        for (let i = enemies.length - 1; i >= 0; i--) {
          const enemy = enemies[i];
          if (enemy.position.y > 650 || enemy.position.x > 1300 || enemy.position.x < -100 || enemy.label === 'dead') {
              score.value += 100;
              World.remove(world, enemy);
              enemies.splice(i, 1);
          }
        }
        
        if (enemies.length === 0 && !gameOver.value && !outOfBirds.value) {
            gameOver.value = true;
        }
      });
    };

    // Gerçekçi suratlar ve sapan çizimi (Canvas Hook)
    const setupCustomRendering = () => {
      Events.on(render, 'afterRender', function() {
        var ctx = render.context;
        
        // Arka plan sapan çubuğu
        ctx.fillStyle = '#5c2c0a';
        ctx.fillRect(290, 500, 10, 110);
        ctx.fillRect(305, 500, 10, 110);

        // Kuş Surat Çizimi
        if (bird && bird.position) {
          ctx.translate(bird.position.x, bird.position.y);
          ctx.rotate(bird.angle);
          
          // Gözler
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.arc(4, -6, 5, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(14, -6, 5, 0, 2*Math.PI); ctx.fill();
          // Gözbebekleri
          ctx.fillStyle = 'black';
          ctx.beginPath(); ctx.arc(6, -6, 2, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(16, -6, 2, 0, 2*Math.PI); ctx.fill();
          // Kaşlar (Kızgın)
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, -8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(18, -12); ctx.lineTo(10, -8); ctx.stroke();
          // Gaga
          ctx.fillStyle = '#FFD700';
          ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(25, 6); ctx.lineTo(13, 10); ctx.fill();
          ctx.stroke();

          ctx.rotate(-bird.angle);
          ctx.translate(-bird.position.x, -bird.position.y);
        }
        
        // Domuz Surat Çizimi
        for(let pig of enemies) {
          ctx.translate(pig.position.x, pig.position.y);
          ctx.rotate(pig.angle);
          
          // Gözler
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.arc(-7, -5, 4, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(7, -5, 4, 0, 2*Math.PI); ctx.fill();
          ctx.fillStyle = 'black';
          ctx.beginPath(); ctx.arc(-7, -5, 1.5, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(7, -5, 1.5, 0, 2*Math.PI); ctx.fill();
          // Burun
          ctx.fillStyle = '#228B22';
          ctx.beginPath(); ctx.ellipse(0, 4, 8, 5, 0, 0, 2*Math.PI); ctx.fill();
          ctx.fillStyle = '#006400';
          ctx.beginPath(); ctx.arc(-3, 4, 1.5, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(3, 4, 1.5, 0, 2*Math.PI); ctx.fill();

          ctx.rotate(-pig.angle);
          ctx.translate(-pig.position.x, -pig.position.y);
        }
      });
    };

    const resetLevel = () => {
      if (engine && world) {
        setupLevel();
      }
    };

    onMounted(() => {
      if (typeof window !== 'undefined') {
        initMatter();
      }
    });

    onUnmounted(() => {
      if (render) {
        Render.stop(render);
        render.canvas.remove();
        render.canvas = null;
        render.context = null;
        render.textures = {};
      }
      if (runner) Runner.stop(runner);
      if (engine) {
        World.clear(engine.world);
        Engine.clear(engine);
      }
    });

    return { 
      canvasContainer, score, gameOver, outOfBirds, birdCount, resetLevel, goHome
    };