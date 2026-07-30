import json

app_json = {
  'app_name': 'STEP FAST Viewer',
  'tag': '#stepfast',
  'export_date': '2026-07-29T14:30:00.000Z',
  'components': {
    'entities': [],
    'system_variables': [],
    'dynamic_utils': [],
    'records': [],
    'schedulers': [],
    'roles': [],
    'languages': [],
    'translations': [],
    'endpoints': [
      {
        "id": 150,
        "name": "CAD Upload and Cache",
        "route_pattern": "/api/custom/stepfast-upload",
        "type": "http",
        "active": 1,
        "is_public": 1,
        "code": '''
const fs = require('fs');
const path = require('path');
// Plugins dizinindeki kütüphaneyi require et
const occtimportjs = require('./plugins/occt-import-js');

try {
  const base64Data = payload.body.data;
  if (!base64Data) {
    return { respond: true, status: 400, body: { error: 'Veri bulunamadı.' } };
  }
  
  const buf = Buffer.from(base64Data, 'base64');
  
  // occtimportjs bir promise döner, onu bekle
  const occt = await occtimportjs();
  const result = occt.ReadStepFile(buf);
  
  if (!result.success) {
    return { respond: true, status: 500, body: { error: 'STEP çözümlenemedi.' } };
  }
  
  // Milyonlarca koordinatı özel BINM formatında sıkıştır (Binary Mesh)
  let totalBytes = 8; // Header: 4 byte MAGIC + 4 byte MESH COUNT
  for (const mesh of result.meshes) {
    totalBytes += 12; // Color (R, G, B Float32)
    totalBytes += 12; // Counts (pos, norm, idx UInt32)
    totalBytes += (mesh.attributes.position ? mesh.attributes.position.array.length : 0) * 4;
    totalBytes += (mesh.attributes.normal ? mesh.attributes.normal.array.length : 0) * 4;
    let indexCount = 0;
    if (mesh.index && mesh.index.array) indexCount = mesh.index.array.length;
    else if (mesh.attributes.index && mesh.attributes.index.array) indexCount = mesh.attributes.index.array.length;
    totalBytes += indexCount * 4;
  }
  
  // Performans için büyük bir buffer ayır
  const buffer = Buffer.allocUnsafe(totalBytes);
  let offset = 0;
  
  buffer.write('BINM', offset); offset += 4;
  buffer.writeUInt32LE(result.meshes.length, offset); offset += 4;
  
  for (const mesh of result.meshes) {
    const r = mesh.color ? mesh.color[0] : 0.8;
    const g = mesh.color ? mesh.color[1] : 0.8;
    const b = mesh.color ? mesh.color[2] : 0.8;
    buffer.writeFloatLE(r, offset); offset += 4;
    buffer.writeFloatLE(g, offset); offset += 4;
    buffer.writeFloatLE(b, offset); offset += 4;
    
    const posArr = mesh.attributes.position ? mesh.attributes.position.array : [];
    const normArr = mesh.attributes.normal ? mesh.attributes.normal.array : [];
    let idxArr = [];
    if (mesh.index && mesh.index.array) idxArr = mesh.index.array;
    else if (mesh.attributes.index && mesh.attributes.index.array) idxArr = mesh.attributes.index.array;
    
    buffer.writeUInt32LE(posArr.length, offset); offset += 4;
    buffer.writeUInt32LE(normArr.length, offset); offset += 4;
    buffer.writeUInt32LE(idxArr.length, offset); offset += 4;
    
    for (let i = 0; i < posArr.length; i++) { buffer.writeFloatLE(posArr[i], offset); offset += 4; }
    for (let i = 0; i < normArr.length; i++) { buffer.writeFloatLE(normArr[i], offset); offset += 4; }
    for (let i = 0; i < idxArr.length; i++) { buffer.writeUInt32LE(idxArr[i], offset); offset += 4; }
  }
  
  // Önbellek dosyasına kaydet
  const id = crypto.randomUUID();
  const dataDir = path.join(process.cwd(), '.data', 'cad');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, id + '.binm'), buffer);
  
  return { respond: true, status: 200, body: { id: id, message: 'Başarıyla eklenti üzerinden işlendi' } };
  
} catch(e) {
  return { respond: true, status: 500, body: { error: `Sunucu Eklenti Hatası: ${e.message}` } };
}
'''
      },
      {
        "id": 151,
        "name": "CAD Download Binary",
        "route_pattern": "/api/custom/stepfast-model",
        "type": "http",
        "active": 1,
        "is_public": 1,
        "code": '''
const fs = require('fs');
const path = require('path');
const id = payload.query.id;

const dataDir = path.join(process.cwd(), '.data', 'cad');
const filePath = path.join(dataDir, id + '.binm');

if (!fs.existsSync(filePath)) {
  return { respond: true, status: 404, body: 'Model not found' };
}

const buffer = fs.readFileSync(filePath);
return { 
  respond: true, 
  status: 200, 
  headers: { 
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000'
  }, 
  body: buffer 
};
'''
      }
    ],
    'pages': [
      {
        'id': 100,
        'route_pattern': 'step-fast',
        'title': 'Ultra Fast 3D CAD Viewer',
        'page_type': 'regular',
        'template_string': '''
<v-container fluid class="pa-0 d-flex flex-column overflow-hidden bg-black" style="height: calc(100vh - 64px);">
  <v-toolbar color="grey-darken-4" density="compact" elevation="2" style="flex-shrink: 0;">
    <v-icon start class="ml-2 text-green-accent-3">mdi-rocket-launch</v-icon>
    <v-toolbar-title class="text-body-1 font-weight-bold text-white">STEP FAST Viewer (GrabCAD Mimarisi)</v-toolbar-title>
    <v-spacer></v-spacer>
    
    <v-text-field v-model="modelId" label="Model ID (Varsa)" density="compact" variant="solo-filled" hide-details class="mr-4" style="max-width: 250px"></v-text-field>
    
    <v-btn v-if="modelId" variant="flat" color="blue-accent-2" @click="loadModelById(modelId)" class="text-none font-weight-bold mr-4" prepend-icon="mdi-download">
      Yükle
    </v-btn>

    <v-btn variant="flat" color="green-accent-4" @click="$refs.fileInput.click()" class="text-none font-weight-bold mr-2" prepend-icon="mdi-upload">
      Yeni STEP Yükle
    </v-btn>
    <input type="file" ref="fileInput" style="display: none" accept=".step, .stp" @change="handleFileUpload" />
  </v-toolbar>

  <div class="flex-grow-1 position-relative" style="min-height: 0; width: 100%;">
    <div v-if="loading" class="d-flex flex-column align-center justify-center h-100 w-100 position-absolute bg-black" style="z-index: 1000; opacity: 0.9;">
        <v-progress-circular indeterminate color="green-accent-3" size="72" width="6"></v-progress-circular>
        <h2 class="mt-6 text-h5 text-green-accent-3 font-weight-bold">{{ loadingText }}</h2>
        <div class="text-grey mt-2">{{ loadingSubtext }}</div>
    </div>
    
    <div id="three-container" class="w-100 h-100"></div>
  </div>
</v-container>
''',
        'script_content': '''}; return {
    setup() {
        const fileInput = ref(null);
        const loading = ref(true);
        const loadingText = ref('Kütüphaneler Yükleniyor...');
        const loadingSubtext = ref('');
        const isModelLoaded = ref(false);
        const modelId = ref('');

        let scene, camera, renderer, controls;
        let currentModel = null;

        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };

        const initThree = () => {
            const el = document.getElementById('three-container');
            if (!el) return;
            el.innerHTML = '';
            
            scene = new window.THREE.Scene();
            scene.background = new window.THREE.Color(0x1a1a1a);
            
            camera = new window.THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000);
            camera.position.set(100, 100, 100);
            
            renderer = new window.THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
            renderer.setSize(el.clientWidth, el.clientHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            
            el.appendChild(renderer.domElement);
            
            const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            
            const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(200, 300, 200);
            scene.add(dirLight);

            const dirLight2 = new window.THREE.DirectionalLight(0xffffff, 0.4);
            dirLight2.position.set(-200, -300, -200);
            scene.add(dirLight2);
            
            const gridHelper = new window.THREE.GridHelper(500, 50, 0x444444, 0x222222);
            scene.add(gridHelper);
            
            controls = new window.THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            
            const animate = () => {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            };
            animate();
            
            window.addEventListener('resize', onWindowResize);
        };

        const onWindowResize = () => {
            const el = document.getElementById('three-container');
            if (!el || !camera || !renderer) return;
            camera.aspect = el.clientWidth / el.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(el.clientWidth, el.clientHeight);
        };

        onMounted(async () => {
            try {
                loadingText.value = 'Hızlandırılmış CAD Motoru Başlatılıyor...';
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
                
                initThree();
                loading.value = false;
                
            } catch (e) {
                console.error("Yükleme hatası", e);
                loadingText.value = "Kütüphaneler yüklenemedi!";
            }
        });
        
        onUnmounted(() => {
            window.removeEventListener('resize', onWindowResize);
            if (renderer) renderer.dispose();
        });

        const handleFileUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            loading.value = true;
            loadingText.value = 'Sunucuda CAD İşleniyor (İlk Yükleme)...';
            loadingSubtext.value = 'Bu işlem 20-30 saniye sürebilir, sunucu modeli özel formata sıkıştırıyor. Sonraki açılışlar 1 saniye sürecektir.';
            isModelLoaded.value = false;
            
            try {
                // Read file as ArrayBuffer and convert to Base64 to prevent Nuxt binary parsing issues
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                // 11MB file can cause stack overflow with apply, process in chunks
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                }
                const base64String = window.btoa(binary);

                const response = await fetch('/api/custom/stepfast-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: base64String })
                });
                
                const data = await response.json();
                
                if (response.ok && data.id) {
                    modelId.value = data.id;
                    await loadModelById(data.id);
                } else {
                    alert("Yükleme/İşleme hatası: " + (data.error || 'Bilinmeyen hata'));
                    loading.value = false;
                }
            } catch (err) {
                alert("Ağ hatası: " + err.message);
                loading.value = false;
            }
        };

        const loadModelById = async (id) => {
            if (!id) return;
            loading.value = true;
            loadingText.value = 'Ağdan Veri Akıyor...';
            loadingSubtext.value = 'Sıkıştırılmış Binary Format (JSON parse gecikmesi olmadan okunuyor)';
            
            try {
                const response = await fetch('/api/custom/stepfast-model?id=' + id);
                if (!response.ok) {
                    throw new Error("Model bulunamadı (Sunucuda cache silinmiş olabilir)");
                }
                
                loadingText.value = 'GPU\\'ya Aktarılıyor...';
                const arrayBuffer = await response.arrayBuffer();
                const view = new DataView(arrayBuffer);
                
                // Read BINM Header
                let offset = 0;
                const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
                if (magic !== 'BINM') {
                    throw new Error("Geçersiz dosya formatı");
                }
                offset += 4;
                
                const meshCount = view.getUint32(offset, true);
                offset += 4;
                
                if (currentModel) {
                    scene.remove(currentModel);
                }
                currentModel = new window.THREE.Group();
                
                for (let i = 0; i < meshCount; i++) {
                    const r = view.getFloat32(offset, true); offset += 4;
                    const g = view.getFloat32(offset, true); offset += 4;
                    const b = view.getFloat32(offset, true); offset += 4;
                    
                    const posLen = view.getUint32(offset, true); offset += 4;
                    const normLen = view.getUint32(offset, true); offset += 4;
                    const idxLen = view.getUint32(offset, true); offset += 4;
                    
                    const geometry = new window.THREE.BufferGeometry();
                    
                    if (posLen > 0) {
                        const posArray = new Float32Array(arrayBuffer, offset, posLen);
                        geometry.setAttribute('position', new window.THREE.BufferAttribute(posArray, 3));
                        offset += posLen * 4;
                    }
                    if (normLen > 0) {
                        const normArray = new Float32Array(arrayBuffer, offset, normLen);
                        geometry.setAttribute('normal', new window.THREE.BufferAttribute(normArray, 3));
                        offset += normLen * 4;
                    } else {
                        geometry.computeVertexNormals();
                    }
                    if (idxLen > 0) {
                        const idxArray = new Uint32Array(arrayBuffer, offset, idxLen);
                        geometry.setIndex(new window.THREE.BufferAttribute(idxArray, 1));
                        offset += idxLen * 4;
                    }
                    
                    const material = new window.THREE.MeshStandardMaterial({
                        color: new window.THREE.Color(r, g, b),
                        metalness: 0.3,
                        roughness: 0.5,
                        side: window.THREE.DoubleSide
                    });
                    
                    const mesh = new window.THREE.Mesh(geometry, material);
                    currentModel.add(mesh);
                }
                
                const box = new window.THREE.Box3().setFromObject(currentModel);
                const center = box.getCenter(new window.THREE.Vector3());
                const size = box.getSize(new window.THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                
                const scale = 150 / (maxDim || 1);
                currentModel.scale.setScalar(scale);
                currentModel.position.sub(center.multiplyScalar(scale));
                currentModel.position.y += (size.y * scale) / 2;
                
                scene.add(currentModel);
                camera.position.set(150, 150, 150);
                controls.target.set(0, (size.y * scale) / 2, 0);
                controls.update();
                
                loading.value = false;
                isModelLoaded.value = true;
                
            } catch(e) {
                alert("Yükleme hatası: " + e.message);
                loading.value = false;
            }
        };

        return {
            fileInput, handleFileUpload, loading, loadingText, loadingSubtext, isModelLoaded, modelId, loadModelById
        };
    }
}; function __dummy() {''',
        'style_content': '',
        'active': 1,
        'is_public': 1,
        'is_landing_page': 0,
        'created_at': '2026-07-29 10:00:00',
        'updated_at': '2026-07-29 10:00:00',
        'created_by': 1,
        'updated_by': 1,
        'hashtags': '["#stepfast"]',
        'priority': 0
      }
    ]
  }
}

with open('stepfast_app.json', 'w', encoding='utf-8') as f:
    json.dump(app_json, f, ensure_ascii=False, indent=2)

print('Generated stepfast_app.json successfully')
