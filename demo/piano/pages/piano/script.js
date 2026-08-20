const loading = ref(false);
        const started = ref(false);
        const isMapMode = ref(false);
        const selectedKeyForMapping = ref(null);

        const instruments = [
            { title: 'Kuyruklu Piyano', value: 'piano' },
            { title: 'Klasik Gitar', value: 'acoustic_guitar' },
            { title: 'Elektro Gitar', value: 'electric_guitar' },
            { title: 'Keman', value: 'violin' },
            { title: 'Saksafon', value: 'sax' },
            { title: 'Flüt', value: 'flute' },
            { title: 'Elektronik Bas', value: 'bass' },
            { title: 'Retro Synth (Pluck)', value: 'pluck' },
            { title: 'Space Synth', value: 'space' },
            { title: 'Marimba', value: 'marimba' }
        ];
        
        const selectedInstrument = ref('piano');
        const baseOctave = ref(5);
        const activeKeys = ref({});
        
        // Yeni Özellik Değişkenleri
        const transpose = ref(0);
        const releaseTime = ref(0.15);
        const reverbMix = ref(0.2); // Default 20% reverb
        const echoMix = ref(0.0);   // Default 0% echo

        // Default Harita (Varsayılan)
        const getDefaultMapping = () => ({
            uw: [
                { key: 'q', offset: 0, noteName: 'C', id: 'uw0' },
                { key: 'w', offset: 2, noteName: 'D', id: 'uw1' },
                { key: 'e', offset: 4, noteName: 'E', id: 'uw2' },
                { key: 'r', offset: 5, noteName: 'F', id: 'uw3' },
                { key: 't', offset: 7, noteName: 'G', id: 'uw4' },
                { key: 'y', offset: 9, noteName: 'A', id: 'uw5' },
                { key: 'u', offset: 11, noteName: 'B', id: 'uw6' },
                { key: 'i', offset: 12, noteName: 'C', id: 'uw7' },
                { key: 'o', offset: 14, noteName: 'D', id: 'uw8' },
                { key: 'p', offset: 16, noteName: 'E', id: 'uw9' },
                { key: 'ğ', offset: 17, noteName: 'F', id: 'uw10' },
                { key: 'ü', offset: 19, noteName: 'G', id: 'uw11' }
            ],
            ub: [
                { key: '2', offset: 1, after: 0, noteName: 'C#', id: 'ub0' },
                { key: '3', offset: 3, after: 1, noteName: 'D#', id: 'ub1' },
                { key: '5', offset: 6, after: 3, noteName: 'F#', id: 'ub2' },
                { key: '6', offset: 8, after: 4, noteName: 'G#', id: 'ub3' },
                { key: '7', offset: 10, after: 5, noteName: 'A#', id: 'ub4' },
                { key: '9', offset: 13, after: 7, noteName: 'C#', id: 'ub5' },
                { key: '0', offset: 15, after: 8, noteName: 'D#', id: 'ub6' },
                { key: '*', offset: 18, after: 10, noteName: 'F#', id: 'ub7' }
            ],
            lw: [
                { key: 'z', offset: 0, noteName: 'C', id: 'lw0' },
                { key: 'x', offset: 2, noteName: 'D', id: 'lw1' },
                { key: 'c', offset: 4, noteName: 'E', id: 'lw2' },
                { key: 'v', offset: 5, noteName: 'F', id: 'lw3' },
                { key: 'b', offset: 7, noteName: 'G', id: 'lw4' },
                { key: 'n', offset: 9, noteName: 'A', id: 'lw5' },
                { key: 'm', offset: 11, noteName: 'B', id: 'lw6' },
                { key: 'ö', offset: 12, noteName: 'C', id: 'lw7' },
                { key: 'ç', offset: 14, noteName: 'D', id: 'lw8' },
                { key: '.', offset: 16, noteName: 'E', id: 'lw9' }
            ],
            lb: [
                { key: 's', offset: 1, after: 0, noteName: 'C#', id: 'lb0' },
                { key: 'd', offset: 3, after: 1, noteName: 'D#', id: 'lb1' },
                { key: 'g', offset: 6, after: 3, noteName: 'F#', id: 'lb2' },
                { key: 'h', offset: 8, after: 4, noteName: 'G#', id: 'lb3' },
                { key: 'j', offset: 10, after: 5, noteName: 'A#', id: 'lb4' },
                { key: 'l', offset: 13, after: 7, noteName: 'C#', id: 'lb5' },
                { key: 'ş', offset: 15, after: 8, noteName: 'D#', id: 'lb6' }
            ]
        });

        const mapState = ref(getDefaultMapping());

        onMounted(() => {
            const saved = localStorage.getItem('piano_custom_mapping');
            if (saved) {
                try { mapState.value = JSON.parse(saved); }
                catch(e) {}
            }
        });

        const resetMapping = () => {
            mapState.value = getDefaultMapping();
            localStorage.removeItem('piano_custom_mapping');
            selectedKeyForMapping.value = null;
        };

        const calcKeys = (whiteDef, blackDef, baseOct) => {
            const baseMidi = (baseOct + 1) * 12;
            const w = whiteDef.map(k => {
                const midi = baseMidi + k.offset;
                const oct = Math.floor(midi / 12) - 1;
                return { ...k, label: k.noteName + oct, midi };
            });
            const b = blackDef.map(k => {
                const midi = baseMidi + k.offset;
                const oct = Math.floor(midi / 12) - 1;
                return { ...k, label: k.noteName + oct, midi };
            });
            return { w, b };
        };

        const upperKeys = computed(() => calcKeys(mapState.value.uw, mapState.value.ub, baseOctave.value));
        const lowerKeys = computed(() => calcKeys(mapState.value.lw, mapState.value.lb, baseOctave.value - 1));

        const allKeysMap = ref({});
        watch([upperKeys, lowerKeys], () => {
            const map = {};
            upperKeys.value.w.forEach(k => map[k.key] = k);
            upperKeys.value.b.forEach(k => map[k.key] = k);
            lowerKeys.value.w.forEach(k => map[k.key] = k);
            lowerKeys.value.b.forEach(k => map[k.key] = k);
            allKeysMap.value = map;
        }, { immediate: true });

        // TONE.JS ENTEGRASYONU
        let synth = null;
        let reverbEffect = null;
        let delayEffect = null;
        let effectChain = null;

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

        const initEffects = async () => {
            if (!effectChain) {
                reverbEffect = new window.Tone.Reverb({ decay: 2.5, wet: reverbMix.value });
                await reverbEffect.generate(); // Reverb inisiyalizasyonu bekler

                delayEffect = new window.Tone.FeedbackDelay("8n", 0.4);
                delayEffect.wet.value = echoMix.value;
                
                effectChain = new window.Tone.Volume(0).chain(delayEffect, reverbEffect, window.Tone.Destination);
            }
        };

        const initToneSynth = (type) => {
            if (synth) {
                synth.dispose();
                synth = null;
            }
            if (!window.Tone || !effectChain) return;
            
            const rel = releaseTime.value;

            if (type === 'piano') {
                synth = new window.Tone.PolySynth(window.Tone.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: rel }
                }).connect(effectChain);
            } else if (type === 'electric_guitar') {
                synth = new window.Tone.PolySynth(window.Tone.FMSynth, {
                    harmonicity: 3,
                    modulationIndex: 10,
                    oscillator: { type: "square" },
                    envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: rel },
                    modulation: { type: "triangle" },
                    modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: rel }
                }).connect(effectChain);
            } else if (type === 'acoustic_guitar') {
                synth = new window.Tone.PolySynth(window.Tone.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: rel }
                }).connect(effectChain);
            } else if (type === 'violin') {
                synth = new window.Tone.PolySynth(window.Tone.AMSynth, {
                    harmonicity: 1,
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 1, release: rel },
                    modulation: { type: "sine" },
                    modulationEnvelope: { attack: 0.005, decay: 0.1, sustain: 1, release: rel }
                }).connect(effectChain);
            } else if (type === 'sax') {
                synth = new window.Tone.PolySynth(window.Tone.FMSynth, {
                    harmonicity: 2,
                    modulationIndex: 2,
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.8, release: rel },
                    modulation: { type: "triangle" }
                }).connect(effectChain);
            } else if (type === 'flute') {
                synth = new window.Tone.PolySynth(window.Tone.Synth, {
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 1, release: rel }
                }).connect(effectChain);
            } else if (type === 'bass') {
                synth = new window.Tone.PolySynth(window.Tone.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: rel }
                }).connect(effectChain);
            } else if (type === 'pluck') {
                synth = new window.Tone.PolySynth(window.Tone.Synth, {
                    oscillator: { type: "square" },
                    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: rel }
                }).connect(effectChain);
            } else if (type === 'space') {
                synth = new window.Tone.PolySynth(window.Tone.FMSynth, {
                    harmonicity: 0.5,
                    modulationIndex: 5,
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: rel },
                    modulation: { type: "sawtooth" },
                    modulationEnvelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: rel }
                }).connect(effectChain);
            } else if (type === 'marimba') {
                synth = new window.Tone.PolySynth(window.Tone.AMSynth, {
                    harmonicity: 4,
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: rel },
                    modulation: { type: "square" },
                    modulationEnvelope: { attack: 0.005, decay: 0.1, sustain: 0, release: rel }
                }).connect(effectChain);
            }
        };

        const startEngine = async () => {
            loading.value = true;
            try {
                if (!window.Tone) {
                    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js');
                }
                


                await window.Tone.start();
                await initEffects();
                started.value = true;
                initToneSynth(selectedInstrument.value);
            } catch (e) {
                console.error("Tone.js başlatılamadı", e);
            } finally {
                loading.value = false;
            }
        };

        watch([selectedInstrument, releaseTime], ([newInst]) => {
            if (started.value) initToneSynth(newInst);
        });

        watch(reverbMix, (val) => {
            if (reverbEffect) reverbEffect.wet.value = val;
        });

        watch(echoMix, (val) => {
            if (delayEffect) delayEffect.wet.value = val;
        });

        const getTransposedMidi = (midi) => {
            return midi + Number(transpose.value);
        };

        const playKey = (keyObj) => {
            if (activeKeys.value[keyObj.key]) return;
            activeKeys.value[keyObj.key] = true;
            
            if (started.value && synth) {
                const hz = window.Tone.Frequency(getTransposedMidi(keyObj.midi), "midi").toFrequency();
                synth.triggerAttack(hz, window.Tone.context.currentTime);
            }
        };

        const stopKey = (keyObj) => {
            if (!activeKeys.value[keyObj.key]) return;
            activeKeys.value[keyObj.key] = false;
            
            if (started.value && synth) {
                const hz = window.Tone.Frequency(getTransposedMidi(keyObj.midi), "midi").toFrequency();
                synth.triggerRelease(hz, window.Tone.context.currentTime + 0.02);
            }
        };

        const getKeyColor = (key, type) => {
            if (isMapMode.value && selectedKeyForMapping.value === key.id) return '#ffeb3b';
            if (activeKeys.value[key.key]) return type === 'white' ? '#ccc' : '#444';
            return type === 'white' ? '#fff' : '#111';
        };

        const toggleMapMode = () => {
            isMapMode.value = !isMapMode.value;
            selectedKeyForMapping.value = null;
        };

        const handleMouseClick = (key) => {
            if (isMapMode.value) {
                selectedKeyForMapping.value = key.id;
            } else {
                playKey(key);
            }
        };

        const updateMapping = (id, newKey) => {
            const groups = ['uw', 'ub', 'lw', 'lb'];
            for (let g of groups) {
                const item = mapState.value[g].find(x => x.id === id);
                if (item) {
                    item.key = newKey;
                    localStorage.setItem('piano_custom_mapping', JSON.stringify(mapState.value));
                    break;
                }
            }
        };

        const handleKeyDown = (e) => {
            if (e.repeat) return;
            if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;

            let k = e.key;
            if (k === 'I' || k === 'ı' || k === 'İ') k = 'i';
            else k = k.toLowerCase();
            
            if (isMapMode.value && selectedKeyForMapping.value) {
                e.preventDefault();
                updateMapping(selectedKeyForMapping.value, k);
                selectedKeyForMapping.value = null;
                return;
            }

            let keyObj = allKeysMap.value[k];
            if (keyObj) {
                e.preventDefault();
                playKey(keyObj);
            }
        };

        const handleKeyUp = (e) => {
            let k = e.key;
            if (k === 'I' || k === 'ı' || k === 'İ') k = 'i';
            else k = k.toLowerCase();

            let keyObj = allKeysMap.value[k];
            if (keyObj) {
                e.preventDefault();
                stopKey(keyObj);
            }
        };

        onMounted(() => {
            window.addEventListener('keydown', handleKeyDown, { passive: false });
            window.addEventListener('keyup', handleKeyUp, { passive: false });
        });

        onUnmounted(() => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (synth) synth.dispose();
            if (reverbEffect) reverbEffect.dispose();
            if (delayEffect) delayEffect.dispose();
        });

        return {
            loading, started, startEngine,
            instruments, selectedInstrument, baseOctave,
            transpose, releaseTime, reverbMix, echoMix,
            upperKeys, lowerKeys, activeKeys,
            isMapMode, toggleMapMode, selectedKeyForMapping, getKeyColor, handleMouseClick, resetMapping,
            playKey, stopKey
        };