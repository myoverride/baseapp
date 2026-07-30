import json

app_json = {
  'app_name': 'STEP FAST Viewer',
  'tag': '#stepfast',
  'export_date': '2026-07-29T13:00:00.000Z',
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
        "name": "StepFast Converter",
        "route_pattern": "/api/custom/stepfast-convert",
        "method": "POST",
        "active": 1,
        "is_public": 1,
        "description": "Converts STEP to GLB using Python",
        "code": '''
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const id = crypto.randomUUID();
const tmpDir = os.tmpdir();
const stepPath = path.join(tmpDir, `${id}.step`);
const glbPath = path.join(tmpDir, `${id}.glb`);

let pyScript = path.join(__dirname, 'demo', 'convert_step.py');
if (!fs.existsSync(pyScript)) {
  // If not in demo, maybe we are running in the root or plugins. Try different paths
  pyScript = path.join(process.cwd(), 'demo', 'convert_step.py');
}

try {
  let buf = payload.body;
  if (!Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }
  
  fs.writeFileSync(stepPath, buf);
  
  cp.execSync(`python3 "${pyScript}" "${stepPath}" "${glbPath}"`, { stdio: 'inherit' });
  
  const glbBuffer = fs.readFileSync(glbPath);
  
  try { fs.unlinkSync(stepPath); } catch(e){}
  try { fs.unlinkSync(glbPath); } catch(e){}
  
  return {
    respond: true,
    status: 200,
    headers: { 'Content-Type': 'model/gltf-binary' },
    body: glbBuffer
  };
} catch(e) {
  return { respond: true, status: 500, body: `Error: ${e.message}` };
}
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
    <v-toolbar-title class="text-body-1 font-weight-bold text-white">STEP FAST Viewer (GLTF Backend)</v-toolbar-title>
    <v-spacer></v-spacer>
    
    <v-btn variant="flat" color="green-accent-4" @click="$refs.fileInput.click()" class="text-none font-weight-bold mr-2" prepend-icon="mdi-upload">
      STEP Yükle
    </v-btn>
    <input type="file" ref="fileInput" style="display: none" accept=".step, .stp" @change="handleFileUpload" />
  </v-toolbar>

  <div class="flex-grow-1 position-relative" style="min-height: 0; width: 100%;">
    <div v-if="loading" class="d-flex flex-column align-center justify-center h-100 w-100 position-absolute bg-black" style="z-index: 1000; opacity: 0.9;">
        <v-progress-circular indeterminate color="green-accent-3" size="72" width="6"></v-progress-circular>
        <h2 class="mt-6 text-h5 text-green-accent-3 font-weight-bold">{{ loadingText }}</h2>
        <div class="text-grey mt-2">Sunucu modeli anında görüntüleyebilmeniz için GLTF formatına çeviriyor...</div>
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
        const isModelLoaded = ref(false);

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
            scene.background = new window.THREE.Color(0x111111);
            
            camera = new window.THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000);
            camera.position.set(100, 100, 100);
            
            renderer = new window.THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
            renderer.setSize(el.clientWidth, el.clientHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for speed
            
            el.appendChild(renderer.domElement);
            
            // Soft Lighting
            const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            
            const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(200, 300, 200);
            scene.add(dirLight);

            const dirLight2 = new window.THREE.DirectionalLight(0xffffff, 0.4);
            dirLight2.position.set(-200, -300, -200);
            scene.add(dirLight2);
            
            // Minimal Grid
            const gridHelper = new window.THREE.GridHelper(500, 50, 0x333333, 0x1a1a1a);
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
                loadingText.value = 'GLTF Motoru Yükleniyor...';
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
                
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
            loadingText.value = 'Sunucu Üzerinde Optimize Ediliyor... (GrabCAD Backend)';
            isModelLoaded.value = false;
            
            try {
                const response = await fetch('/api/custom/stepfast-convert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: file
                });
                
                if (!response.ok) {
                    throw new Error('Sunucu çeviri hatası verdi.');
                }
                
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                loadingText.value = 'Model Ekran Kartına Yükleniyor...';
                
                const loader = new window.THREE.GLTFLoader();
                loader.load(objectUrl, (gltf) => {
                    if (currentModel) {
                        scene.remove(currentModel);
                    }
                    currentModel = gltf.scene;
                    
                    const box = new window.THREE.Box3().setFromObject(currentModel);
                    const center = box.getCenter(new window.THREE.Vector3());
                    const size = box.getSize(new window.THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    
                    const scale = 150 / (maxDim || 1);
                    currentModel.scale.setScalar(scale);
                    
                    currentModel.position.sub(center.multiplyScalar(scale));
                    currentModel.position.y += (size.y * scale) / 2;
                    
                    // Default material ayarları
                    currentModel.traverse((child) => {
                        if (child.isMesh) {
                            if (!child.material) {
                                child.material = new window.THREE.MeshStandardMaterial({
                                    color: 0x90a4ae,
                                    metalness: 0.2,
                                    roughness: 0.6
                                });
                            }
                        }
                    });
                    
                    scene.add(currentModel);
                    
                    camera.position.set(150, 150, 150);
                    controls.target.set(0, (size.y * scale) / 2, 0);
                    controls.update();
                    
                    loading.value = false;
                    isModelLoaded.value = true;
                });
                
            } catch (err) {
                alert(err.message);
                loading.value = false;
            }
        };

        return {
            fileInput, handleFileUpload, loading, loadingText, isModelLoaded
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
