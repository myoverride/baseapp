import json

app_json = {
  'app_name': 'STEP FAST Viewer',
  'tag': '#stepfast',
  'export_date': '2026-07-29T14:00:00.000Z',
  'components': {
    'entities': [],
    'system_variables': [],
    'dynamic_utils': [],
    'records': [],
    'schedulers': [],
    'roles': [],
    'languages': [],
    'translations': [],
    'endpoints': [],
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
    <v-toolbar-title class="text-body-1 font-weight-bold text-white">STEP FAST Viewer (Optimize Edilmiş)</v-toolbar-title>
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
        <div class="text-grey mt-2">Tarayıcı kitlenmeden arka planda (WebWorker) çözümleniyor...</div>
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
        let worker = null;

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
            
            renderer = new window.THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(el.clientWidth, el.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            
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

        const initWorker = () => {
            const workerCode = `
importScripts('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js');
let occt = null;
self.onmessage = async (e) => {
    if(e.data.type === 'init') {
        try {
            occt = await occtimportjs({ locateFile: (f) => 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/' + f });
            self.postMessage({ type: 'ready' });
        } catch(err) {
            self.postMessage({ type: 'error', error: err.toString() });
        }
    } else if(e.data.type === 'parse') {
        try {
            const result = occt.ReadStepFile(e.data.buffer);
            self.postMessage({ type: 'done', result: result });
        } catch(err) {
            self.postMessage({ type: 'error', error: err.toString() });
        }
    }
};`;
            const blob = new Blob([workerCode], {type: 'application/javascript'});
            worker = new Worker(URL.createObjectURL(blob));
            
            worker.onmessage = (e) => {
                if(e.data.type === 'ready') {
                    loading.value = false;
                } else if(e.data.type === 'done') {
                    if (e.data.result.success) {
                        displayMeshes(e.data.result.meshes);
                    } else {
                        alert("STEP okuma hatası.");
                        loading.value = false;
                    }
                } else if(e.data.type === 'error') {
                    console.error("Worker Error:", e.data.error);
                    alert("Motor çöktü: " + e.data.error);
                    loading.value = false;
                }
            };
            
            worker.postMessage({ type: 'init' });
        };

        onMounted(async () => {
            try {
                loadingText.value = 'Hızlandırılmış CAD Motoru Yükleniyor...';
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
                
                initThree();
                initWorker();
                
            } catch (e) {
                console.error("Yükleme hatası", e);
                loadingText.value = "Kütüphaneler yüklenemedi!";
            }
        });
        
        onUnmounted(() => {
            window.removeEventListener('resize', onWindowResize);
            if (renderer) renderer.dispose();
            if (worker) worker.terminate();
        });

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            loading.value = true;
            loadingText.value = 'CAD Modeli Çözümleniyor (Donmadan)... Lütfen Bekleyin.';
            isModelLoaded.value = false;
            
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const arrayBuffer = evt.target.result;
                const fileBuffer = new Uint8Array(arrayBuffer);
                worker.postMessage({ type: 'parse', buffer: fileBuffer });
            };
            reader.readAsArrayBuffer(file);
        };

        // KULLANICININ ORİJİNAL ÇALIŞAN ÇİZİM FONKSİYONU
        const displayMeshes = (meshes) => {
            loadingText.value = 'Ekrana Çiziliyor...';
            setTimeout(() => {
                if (currentModel) {
                    scene.remove(currentModel);
                }
                
                currentModel = new window.THREE.Group();
                
                meshes.forEach(meshData => {
                    if (!meshData.attributes || !meshData.attributes.position || !meshData.attributes.position.array) return;
                    const geometry = new window.THREE.BufferGeometry();
                    
                    geometry.setAttribute('position', new window.THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
                    if (meshData.attributes.normal && meshData.attributes.normal.array) {
                        geometry.setAttribute('normal', new window.THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
                    } else {
                        geometry.computeVertexNormals();
                    }
                    
                    let indexArray = null;
                    if (meshData.index && meshData.index.array) {
                        indexArray = meshData.index.array;
                    } else if (meshData.attributes.index && meshData.attributes.index.array) {
                        indexArray = meshData.attributes.index.array;
                    }
                    
                    if (indexArray) {
                        geometry.setIndex(new window.THREE.Uint32BufferAttribute(indexArray, 1));
                    }
                    
                    let color = 0xcccccc;
                    if (meshData.color) {
                        color = new window.THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2]);
                    }
                    
                    const material = new window.THREE.MeshStandardMaterial({
                        color: color,
                        metalness: 0.3,
                        roughness: 0.5,
                        side: window.THREE.DoubleSide
                    });
                    
                    const mesh = new window.THREE.Mesh(geometry, material);
                    currentModel.add(mesh);
                });
                
                const box = new window.THREE.Box3().setFromObject(currentModel);
                const center = box.getCenter(new window.THREE.Vector3());
                const size = box.getSize(new window.THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                
                const scale = 150 / maxDim;
                currentModel.scale.setScalar(scale);
                
                currentModel.position.sub(center.multiplyScalar(scale));
                
                // Zemin üstüne al
                currentModel.position.y += (size.y * scale) / 2;
                
                scene.add(currentModel);
                
                camera.position.set(150, 150, 150);
                controls.target.set(0, (size.y * scale) / 2, 0);
                controls.update();
                
                loading.value = false;
                isModelLoaded.value = true;
            }, 50);
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
