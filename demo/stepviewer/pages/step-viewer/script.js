const fileInput = ref(null);
        const loading = ref(true);
        const loadingText = ref('Kütüphaneler Yükleniyor...');
        
        const clipX = ref(100);
        const clipY = ref(150);
        const clipZ = ref(100);

        let scene, camera, renderer, controls;
        let currentModel = null;
        let planeX, planeY, planeZ;

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
            
            // Kesit görünümü aktifleştir
            renderer.localClippingEnabled = true;
            
            el.appendChild(renderer.domElement);
            
            // Aydınlatma
            const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            
            const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(200, 300, 200);
            scene.add(dirLight);

            const dirLight2 = new window.THREE.DirectionalLight(0xffffff, 0.4);
            dirLight2.position.set(-200, -300, -200);
            scene.add(dirLight2);
            
            // Kesit Düzlemleri
            planeX = new window.THREE.Plane(new window.THREE.Vector3(-1, 0, 0), clipX.value);
            planeY = new window.THREE.Plane(new window.THREE.Vector3(0, -1, 0), clipY.value);
            planeZ = new window.THREE.Plane(new window.THREE.Vector3(0, 0, -1), clipZ.value);
            
            // Izgara
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

        watch(clipX, (val) => { if(planeX) planeX.constant = val; });
        watch(clipY, (val) => { if(planeY) planeY.constant = val; });
        watch(clipZ, (val) => { if(planeZ) planeZ.constant = val; });

        onMounted(async () => {
            try {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
                await loadScript('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js');
                
                initThree();
                
                loadingText.value = 'CAD Motoru Başlatılıyor (WASM)...';
                window.occt = await window.occtimportjs({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/${file}`
                });
                
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

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            loading.value = true;
            loadingText.value = 'Geometri Çözümleniyor (Tessellation)... Lütfen bekleyin.';
            
            // Kaydırıcıları sıfırla (Tam görünüm)
            clipX.value = 100;
            clipY.value = 150;
            clipZ.value = 100;
            
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const arrayBuffer = evt.target.result;
                const fileBuffer = new Uint8Array(arrayBuffer);
                
                setTimeout(() => {
                    try {
                        const result = window.occt.ReadStepFile(fileBuffer);
                        
                        if (result.success) {
                            displayMeshes(result.meshes);
                        } else {
                            alert("STEP dosyası okunurken hata oluştu.");
                        }
                    } catch(err) {
                        console.error("Parser error", err);
                        alert("Çeviri motoru çöktü!");
                    } finally {
                        loading.value = false;
                        e.target.value = '';
                    }
                }, 100);
            };
            reader.readAsArrayBuffer(file);
        };

        const displayMeshes = (meshes) => {
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
                    side: window.THREE.DoubleSide,
                    clippingPlanes: [planeX, planeY, planeZ],
                    clipShadows: true
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
        };

        return {
            fileInput, handleFileUpload, loading, loadingText, clipX, clipY, clipZ
        };