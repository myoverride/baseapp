const inLobby = ref(true);
const connected = ref(false);
const myId = ref('Oyuncu' + Math.floor(Math.random() * 1000));
const myColor = ref('#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
const myHp = ref(100);
const myScore = ref(0);
const myAmmo = ref(30);
const isReloading = ref(false);

const isLocked = ref(false);
const showDeath = ref(false);
const scoreboard = ref([]);
const playerCount = ref(1);

let ws = null;
let scene, camera, renderer, controls, raycaster;
const players = new Map();
const bullets = [];
const environmentMeshes = [];
let THREE = null;
let splatTextures = [];

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let direction = null;

let canJump = false;
let velocityY = 0;
let isCrouching = false;
let lastCrouch = false;
const baseHeight = 2.0;
const crouchHeight = 1.0;
const bulletSpeed = 1.2;

const updateScoreboard = () => {
  const list = Array.from(players.values()).map(p => ({ id: p.id, score: p.score, color: p.color }));
  list.push({ id: myId.value + ' (Sen)', score: myScore.value, color: myColor.value });
  list.sort((a, b) => b.score - a.score);
  scoreboard.value = list;
  playerCount.value = list.length;
};

const createSplatTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 25, 0, Math.PI * 2);
  ctx.fill();
  const loops = 10 + Math.floor(Math.random() * 6);
  for (let i = 0; i < loops; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 30;
    const size = 2 + Math.random() * 7;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(angle) * dist, 64 + Math.sin(angle) * dist, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(angle) * dist, 64 + Math.sin(angle) * dist);
    ctx.lineWidth = size / 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
};

const createFaceTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffcc99';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(24, 40, 24, 16);
  ctx.fillRect(80, 40, 24, 16);

  ctx.fillStyle = '#000000';
  ctx.fillRect(32, 44, 8, 8);
  ctx.fillRect(88, 44, 8, 8);

  ctx.fillStyle = '#8a3a3a';
  ctx.fillRect(40, 85, 48, 12);

  return new THREE.CanvasTexture(canvas);
};

const spawnPlayer = () => {
  if (!camera || !THREE) return;
  let pos = new THREE.Vector3();
  let valid = false;
  const pBox = new THREE.Box3();

  while (!valid) {
    pos.set(Math.random() * 40 - 20, baseHeight, Math.random() * 40 - 20);
    pBox.setFromCenterAndSize(new THREE.Vector3(pos.x, pos.y - 1, pos.z), new THREE.Vector3(1.2, 2, 1.2));
    valid = true;

    for (let mesh of environmentMeshes) {
      if (mesh.name === "floor") continue;
      const wBox = new THREE.Box3().setFromObject(mesh);
      if (pBox.intersectsBox(wBox)) {
        valid = false;
        break;
      }
    }
  }
  camera.position.copy(pos);
};

const initThree = async () => {
  THREE = await import('https://esm.sh/three@0.160.0');
  const { PointerLockControls } = await import('https://esm.sh/three@0.160.0/examples/jsm/controls/PointerLockControls.js');

  for (let i = 0; i < 5; i++) {
    splatTextures.push(createSplatTexture());
  }

  const container = document.getElementById('three-canvas-container');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 0, 80);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const floorGeometry = new THREE.PlaneGeometry(150, 150);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "floor";
  scene.add(floor);
  environmentMeshes.push(floor);

  const createWall = (w, h, d, x, y, z, col) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    environmentMeshes.push(wall);
  };

  createWall(10, 8, 10, 0, 4, 0, 0x2c3e50);
  createWall(4, 5, 4, 25, 2.5, 25, 0x8e44ad);
  createWall(4, 5, 4, -25, 2.5, 25, 0x8e44ad);
  createWall(4, 5, 4, 25, 2.5, -25, 0x8e44ad);
  createWall(4, 5, 4, -25, 2.5, -25, 0x8e44ad);
  createWall(20, 4, 2, 0, 2, 20, 0x27ae60);
  createWall(20, 4, 2, 0, 2, -20, 0x27ae60);
  createWall(2, 4, 20, 20, 2, 0, 0x2980b9);
  createWall(2, 4, 20, -20, 2, 0, 0x2980b9);

  createWall(4, 1, 4, 10, 0.5, 10, 0xf1c40f);
  createWall(4, 2, 4, 14, 1.0, 10, 0xe67e22);
  createWall(4, 3, 4, 18, 1.5, 10, 0xe74c3c);
  createWall(4, 4, 4, 22, 2.0, 10, 0xc0392b);

  spawnPlayer();

  direction = new THREE.Vector3();
  raycaster = new THREE.Raycaster();
  controls = new PointerLockControls(camera, document.body);

  controls.addEventListener('lock', () => isLocked.value = true);
  controls.addEventListener('unlock', () => isLocked.value = false);

  document.addEventListener('mousedown', (e) => {
    if (inLobby.value || showDeath.value) return;
    if (!controls.isLocked) {
      controls.lock();
    } else {
      if (e.button === 0) shoot();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (inLobby.value) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') moveForward = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') moveBackward = true;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight = true;
    if (e.code === 'Space' && canJump) {
      velocityY = 0.35;
      canJump = false;
    }
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      isCrouching = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (inLobby.value) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') moveForward = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') moveBackward = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight = false;
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      isCrouching = false;
    }
  });

  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
};

const addPaintSplat = (point, normal, color) => {
  if (!THREE || splatTextures.length === 0) return;
  const size = 1.0 + Math.random() * 0.5;
  const splatGeo = new THREE.PlaneGeometry(size, size);
  const randomTexture = splatTextures[Math.floor(Math.random() * splatTextures.length)];
  const splatMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    alphaMap: randomTexture,
    alphaTest: 0.05,
    side: THREE.DoubleSide
  });
  const splat = new THREE.Mesh(splatGeo, splatMat);
  splat.position.copy(point);
  splat.position.add(normal.clone().multiplyScalar(0.02));
  splat.lookAt(splat.position.clone().add(normal));
  splat.rotateZ(Math.random() * Math.PI * 2);
  scene.add(splat);
};

// Vurulan oyuncunun üzerine boya ekleyen yepyeni yardımcı fonksiyon
const addPlayerSplat = (p, wPoint, wNormal, color, exactObject = null) => {
  if (!THREE || splatTextures.length === 0) return;
  const size = 0.3 + Math.random() * 0.2; // Vücuda uygun hafif küçük boya
  const splatGeo = new THREE.PlaneGeometry(size, size);
  const randomTexture = splatTextures[Math.floor(Math.random() * splatTextures.length)];
  const splatMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    alphaMap: randomTexture,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10
  });
  const splat = new THREE.Mesh(splatGeo, splatMat);

  scene.add(splat);
  splat.position.copy(wPoint);
  splat.position.add(wNormal.clone().multiplyScalar(0.01)); // Yüzeyden çok hafif ayır
  splat.lookAt(splat.position.clone().add(wNormal));
  splat.rotateZ(Math.random() * Math.PI * 2);

  // Eğer özel bir kemik (obj) vurulduysa direkt ona ekle ki onunla hareket etsin
  const parentToAttach = exactObject || p.yawGroup;
  parentToAttach.attach(splat);
  p.splats.push(splat);
};

const shoot = () => {
  if (isReloading.value || showDeath.value) return;
  if (myAmmo.value <= 0) {
    isReloading.value = true;
    setTimeout(() => { myAmmo.value = 30; isReloading.value = false; }, 2000);
    return;
  }
  myAmmo.value--;

  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  ws.send(JSON.stringify({
    type: 'shoot',
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    direction: { x: dir.x, y: dir.y, z: dir.z },
    color: myColor.value
  }));

  createBullet({ x: camera.position.x, y: camera.position.y, z: camera.position.z }, { x: dir.x, y: dir.y, z: dir.z }, myColor.value);

  raycaster.set(camera.position, dir);

  const pMeshes = Array.from(players.values()).map(p => p.mesh);
  const pIntersects = raycaster.intersectObjects(pMeshes, true);

  if (pIntersects.length > 0) {
    const hit = pIntersects[0];
    const hitDelay = (hit.distance / bulletSpeed) * 16.66;

    let hitPlayerId = null;
    let hitPlayer = null;
    for (let [id, p] of players.entries()) {
      p.mesh.traverse((child) => {
        if (child === hit.object) { hitPlayerId = id; hitPlayer = p; }
      });
      if (hitPlayerId) break;
    }

    if (hitPlayerId) {
      // Yüzeyin dünya koordinatındaki gerçek normalini hesaplıyoruz
      let nX = -dir.x, nY = -dir.y, nZ = -dir.z;
      if (hit.face) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        nX = worldNormal.x; nY = worldNormal.y; nZ = worldNormal.z;
      }
      const wNormal = new THREE.Vector3(nX, nY, nZ);

      setTimeout(() => {
        // Ateş eden kişi için VURULMA ANINDA LOKAL OLARAK (gecikmesiz) BOYAYI BASIYORUZ
        addPlayerSplat(hitPlayer, hit.point, wNormal, myColor.value, hit.object);

        ws.send(JSON.stringify({
          type: 'hit',
          targetId: hitPlayerId,
          shooterId: myId.value,
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          normal: { x: nX, y: nY, z: nZ },
          color: myColor.value
        }));
      }, hitDelay);
    }
  } else {
    const envIntersects = raycaster.intersectObjects(environmentMeshes);
    if (envIntersects.length > 0) {
      const hit = envIntersects[0];
      const hitDelay = (hit.distance / bulletSpeed) * 16.66;

      setTimeout(() => {
        addPaintSplat(hit.point, hit.face.normal, myColor.value);
        ws.send(JSON.stringify({ type: 'paint', point: hit.point, normal: hit.face.normal, color: myColor.value }));
      }, hitDelay);
    }
  }
};

const createBullet = (pos, dir, color) => {
  if (!THREE) return;
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: color });
  const bullet = new THREE.Mesh(geometry, material);
  bullet.position.set(pos.x, pos.y, pos.z);

  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  bullet.position.addScaledVector(d, 1.5);

  scene.add(bullet);
  bullets.push({
    mesh: bullet,
    velocity: d.multiplyScalar(bulletSpeed),
    life: 60
  });
};

let lastSend = 0;
let lastDir = null;

const animate = () => {
  if (!renderer) return;
  requestAnimationFrame(animate);

  let moved = false;
  let rotationChanged = false;
  let crouchChanged = false;

  if (isCrouching !== lastCrouch) {
    crouchChanged = true;
    lastCrouch = isCrouching;
  }

  if (!inLobby.value && controls && controls.isLocked && !showDeath.value) {
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    const speed = isCrouching ? 0.1 : 0.2;
    const oldPos = camera.position.clone();

    if (moveForward || moveBackward) { controls.moveForward(direction.z * speed); }
    if (moveLeft || moveRight) { controls.moveRight(direction.x * speed); }

    const playerBox = new THREE.Box3();
    const checkCollision = (pos) => {
      const h = isCrouching ? crouchHeight : baseHeight;
      playerBox.setFromCenterAndSize(
        new THREE.Vector3(pos.x, pos.y - (h / 2) + 0.1, pos.z),
        new THREE.Vector3(0.8, h - 0.2, 0.8)
      );
      for (let mesh of environmentMeshes) {
        if (mesh.name === "floor") continue;
        const wallBox = new THREE.Box3().setFromObject(mesh);
        if (playerBox.intersectsBox(wallBox)) return true;
      }
      return false;
    };

    if (checkCollision(camera.position)) {
      const tryX = camera.position.clone();
      tryX.z = oldPos.z;
      if (!checkCollision(tryX)) {
        camera.position.copy(tryX);
      } else {
        const tryZ = camera.position.clone();
        tryZ.x = oldPos.x;
        if (!checkCollision(tryZ)) {
          camera.position.copy(tryZ);
        } else {
          camera.position.copy(oldPos);
        }
      }
    }

    if (camera.position.x !== oldPos.x || camera.position.z !== oldPos.z) {
      moved = true;
    }

    velocityY -= 0.015;
    camera.position.y += velocityY;

    const origin = camera.position.clone();
    const currentStandHeight = isCrouching ? crouchHeight : baseHeight;

    const downRay = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
    const downHits = downRay.intersectObjects(environmentMeshes);

    let groundY = 0;
    if (downHits.length > 0) {
      groundY = downHits[0].point.y;
    }

    let targetHeight = groundY + currentStandHeight;

    if (camera.position.y <= targetHeight) {
      camera.position.y = targetHeight;
      velocityY = 0;
      canJump = true;
    } else {
      moved = true;
    }

    const currentDir = new THREE.Vector3();
    camera.getWorldDirection(currentDir);
    if (!lastDir) lastDir = currentDir.clone();

    if (lastDir.distanceTo(currentDir) > 0.02) {
      rotationChanged = true;
      lastDir.copy(currentDir);
    }
  }

  const now = Date.now();
  if ((moved || rotationChanged || crouchChanged) && ws && ws.readyState === WebSocket.OPEN && now - lastSend > 50) {
    const sendDir = new THREE.Vector3();
    camera.getWorldDirection(sendDir);
    ws.send(JSON.stringify({
      type: 'move',
      id: myId.value,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      dirX: sendDir.x,
      dirY: sendDir.y,
      dirZ: sendDir.z,
      crouch: isCrouching
    }));
    lastSend = now;
  }

  players.forEach(p => {
    if (p.mesh && p.targetPos && p.targetDir) {
      p.mesh.position.lerp(p.targetPos, 0.3);

      const flatDir = new THREE.Vector3(p.targetDir.x, 0, p.targetDir.z);
      if (flatDir.lengthSq() > 0.001) {
        flatDir.normalize();
        const targetObj = new THREE.Object3D();
        targetObj.lookAt(flatDir);

        targetObj.rotateY(Math.PI);
        p.yawGroup.quaternion.slerp(targetObj.quaternion, 0.3);
      }

      let pitch = Math.asin(Math.max(-1, Math.min(1, p.targetDir.y)));
      p.pitchGroup.rotation.x += (pitch - p.pitchGroup.rotation.x) * 0.3;

      const targetScaleY = p.targetCrouch ? 0.6 : 1.0;
      p.yawGroup.scale.y += (targetScaleY - p.yawGroup.scale.y) * 0.2;
    }
  });

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevPos = b.mesh.position.clone();

    b.mesh.position.add(b.velocity);
    b.life--;

    const bulletDir = b.velocity.clone().normalize();
    const bulletRay = new THREE.Raycaster(prevPos, bulletDir, 0, b.velocity.length());

    // Merminin oyuncu içinden geçmemesi için oyuncuları da çarpışma testine dâhil ediyoruz!
    const pMeshes = Array.from(players.values()).map(p => p.mesh);
    const hits = bulletRay.intersectObjects([...environmentMeshes, ...pMeshes], true);

    if (hits.length > 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }

    if (b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
};

const addPlayer = (pData) => {
  if (!THREE || players.has(pData.id)) return;
  const mesh = new THREE.Group();

  const yawGroup = new THREE.Group();
  mesh.add(yawGroup);

  const colorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pData.color), roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6 });

  const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
  const body = new THREE.Mesh(bodyGeo, colorMat);
  body.position.y = -0.6;
  body.castShadow = true;
  yawGroup.add(body);

  const legGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
  const leftLeg = new THREE.Mesh(legGeo, colorMat);
  leftLeg.position.set(-0.25, -1.7, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, colorMat);
  rightLeg.position.set(0.25, -1.7, 0);
  rightLeg.castShadow = true;
  yawGroup.add(leftLeg);
  yawGroup.add(rightLeg);

  const pitchGroup = new THREE.Group();
  pitchGroup.position.y = 0;
  yawGroup.add(pitchGroup);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.45;
  const headGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const faceTex = createFaceTexture();
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex });
  const headMats = [skinMat, skinMat, skinMat, skinMat, skinMat, faceMat];
  const head = new THREE.Mesh(headGeo, headMats);
  head.castShadow = true;
  headGroup.add(head);
  pitchGroup.add(headGroup);

  const armGeo = new THREE.BoxGeometry(0.25, 0.25, 1.0);
  const leftArm = new THREE.Mesh(armGeo, colorMat);
  leftArm.position.set(-0.55, -0.2, -0.3);
  leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, colorMat);
  rightArm.position.set(0.55, -0.2, -0.3);
  rightArm.castShadow = true;
  pitchGroup.add(leftArm);
  pitchGroup.add(rightArm);

  const gunGeo = new THREE.BoxGeometry(0.15, 0.15, 0.9);
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const gun = new THREE.Mesh(gunGeo, gunMat);
  gun.position.set(0.3, -0.2, -0.8);
  gun.castShadow = true;
  pitchGroup.add(gun);

  mesh.position.set(pData.x, pData.y, pData.z);
  scene.add(mesh);

  const startDir = new THREE.Vector3(pData.dirX || 0, pData.dirY || 0, pData.dirZ || -1);

  players.set(pData.id, {
    id: pData.id,
    color: pData.color,
    score: pData.score || 0,
    mesh,
    yawGroup,
    pitchGroup,
    targetPos: new THREE.Vector3(pData.x, pData.y, pData.z),
    targetDir: startDir,
    targetCrouch: pData.crouch || false,
    splats: []
  });
  updateScoreboard();
};

const initNetwork = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws/tenant/master/metaverse`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connected.value = true;
    const initDir = new THREE.Vector3();
    if (camera) camera.getWorldDirection(initDir);

    ws.send(JSON.stringify({
      type: 'player-joined',
      player: {
        id: myId.value,
        color: myColor.value,
        x: camera ? camera.position.x : 0,
        y: camera ? camera.position.y : 2,
        z: camera ? camera.position.z : 0,
        dirX: initDir.x,
        dirY: initDir.y,
        dirZ: initDir.z,
        crouch: isCrouching,
        hp: 100,
        score: 0
      }
    }));
    updateScoreboard();
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'player-joined') {
      addPlayer(msg.player);
      const initDir = new THREE.Vector3();
      if (camera) camera.getWorldDirection(initDir);

      ws.send(JSON.stringify({
        type: 'player-state',
        targetId: msg.player.id,
        player: {
          id: myId.value,
          color: myColor.value,
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          dirX: initDir.x,
          dirY: initDir.y,
          dirZ: initDir.z,
          crouch: isCrouching,
          hp: myHp.value,
          score: myScore.value
        }
      }));
    }
    else if (msg.type === 'player-state') {
      if (msg.targetId === myId.value) {
        addPlayer(msg.player);
      }
    }
    else if (msg.type === 'move') {
      const p = players.get(msg.id);
      if (p && THREE) {
        const newPos = new THREE.Vector3(msg.x, msg.y, msg.z);
        if (p.targetPos.distanceTo(newPos) > 5) {
          p.mesh.position.copy(newPos);
        }
        p.targetPos.copy(newPos);
        p.targetDir = new THREE.Vector3(msg.dirX, msg.dirY, msg.dirZ);
        if (msg.crouch !== undefined) p.targetCrouch = msg.crouch;
      }
    }
    else if (msg.type === 'shoot') {
      createBullet(msg.position, msg.direction, msg.color);
    }
    else if (msg.type === 'paint') {
      addPaintSplat(new THREE.Vector3(msg.point.x, msg.point.y, msg.point.z), new THREE.Vector3(msg.normal.x, msg.normal.y, msg.normal.z), msg.color);
    }
    else if (msg.type === 'hit') {
      if (msg.targetId === myId.value) {
        if (showDeath.value) return;
        myHp.value -= 25;
        if (myHp.value <= 0) {
          showDeath.value = true;
          ws.send(JSON.stringify({ type: 'killed', victimId: myId.value, shooterId: msg.shooterId }));

          setTimeout(() => {
            myHp.value = 100;
            spawnPlayer();
            showDeath.value = false;

            const currentDir = new THREE.Vector3();
            camera.getWorldDirection(currentDir);
            ws.send(JSON.stringify({
              type: 'respawn',
              id: myId.value,
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z,
              dirX: currentDir.x,
              dirY: currentDir.y,
              dirZ: currentDir.z,
              crouch: isCrouching
            }));
          }, 2000);

        } else {
          ws.send(JSON.stringify({ type: 'hp-update', id: myId.value, hp: myHp.value }));
        }
      } else {
        const p = players.get(msg.targetId);
        if (p) {
          // Ateş edenden gelmeyen (izleyiciler için olan) boya sinyali
          if (msg.shooterId !== myId.value && msg.point && msg.normal) {
            const wPoint = new THREE.Vector3(msg.point.x, msg.point.y, msg.point.z);
            const wNormal = new THREE.Vector3(msg.normal.x, msg.normal.y, msg.normal.z);
            addPlayerSplat(p, wPoint, wNormal, msg.color);
          }

          p.mesh.traverse(c => {
            if (c.isMesh && c.material) {
              if (!c.userData.isFlashing) {
                c.userData.isFlashing = true;
                if (Array.isArray(c.material)) {
                  c.userData.oldColors = c.material.map(m => m.color ? m.color.getHex() : null);
                  c.material.forEach(m => { if (m.color) m.color.setHex(0xff0000); });
                } else if (c.material.color) {
                  c.userData.oldColor = c.material.color.getHex();
                  c.material.color.setHex(0xff0000);
                }

                setTimeout(() => {
                  if (Array.isArray(c.material) && c.userData.oldColors) {
                    c.material.forEach((m, idx) => {
                      if (m.color && c.userData.oldColors[idx] !== null) m.color.setHex(c.userData.oldColors[idx]);
                    });
                  } else if (c.material.color && c.userData.oldColor !== undefined) {
                    c.material.color.setHex(c.userData.oldColor);
                  }
                  c.userData.isFlashing = false;
                }, 200);
              }
            }
          });
        }
      }
    }
    else if (msg.type === 'respawn') {
      const p = players.get(msg.id);
      if (p) {
        if (p.splats) {
          p.splats.forEach(s => {
            s.removeFromParent();
            if (s.geometry) s.geometry.dispose();
            if (s.material) s.material.dispose();
          });
          p.splats = [];
        }
        p.targetPos.set(msg.x, msg.y, msg.z);
        p.mesh.position.set(msg.x, msg.y, msg.z);
        p.targetDir = new THREE.Vector3(msg.dirX, msg.dirY, msg.dirZ);
        p.targetCrouch = msg.crouch;
        p.hp = 100;

        p.mesh.traverse(c => {
          if (c.isMesh && c.material && c.userData.isFlashing) {
            if (Array.isArray(c.material) && c.userData.oldColors) {
              c.material.forEach((m, idx) => {
                if (m.color && c.userData.oldColors[idx] !== null) m.color.setHex(c.userData.oldColors[idx]);
              });
            } else if (c.material.color && c.userData.oldColor !== undefined) {
              c.material.color.setHex(c.userData.oldColor);
            }
            c.userData.isFlashing = false;
          }
        });
      }
    }
    else if (msg.type === 'hp-update') {
      const p = players.get(msg.id);
      if (p) p.hp = msg.hp;
    }
    else if (msg.type === 'killed') {
      if (msg.shooterId === myId.value) {
        myScore.value += 1;
        ws.send(JSON.stringify({ type: 'score-update', id: myId.value, score: myScore.value, myScore: myScore.value }));
      }
      updateScoreboard();
    }
    else if (msg.type === 'score-update') {
      const p = players.get(msg.id);
      if (p) { p.score = msg.score; updateScoreboard(); }
    }
    else if (msg.type === 'leave') {
      const p = players.get(msg.id);
      if (p) {
        if (p.splats) p.splats.forEach(s => { s.removeFromParent(); });
        scene.remove(p.mesh);
        players.delete(msg.id);
        updateScoreboard();
      }
    }
  };
};

const joinGame = () => {
  inLobby.value = false;
  initNetwork();
};

window.addEventListener('beforeunload', (e) => {
  if (!inLobby.value) {
    e.preventDefault();
    e.returnValue = '';
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave', id: myId.value }));
  }
});

onMounted(async () => {
  await initThree();
});

onUnmounted(() => {
  if (ws) {
    ws.send(JSON.stringify({ type: 'leave', id: myId.value }));
    ws.close();
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
});

return { inLobby, joinGame, connected, myId, myColor, myHp, myScore, isLocked, scoreboard, playerCount, showDeath, myAmmo, isReloading };