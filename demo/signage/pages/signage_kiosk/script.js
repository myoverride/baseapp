const slides = ref([]);
    const screens = ref([]);
    const currentSlideIndex = ref(0);
    const currentSlide = ref(null);
    const progressPercentage = ref(0);
    const targetScreenId = ref(null);
    const audioContextStarted = ref(false);
    
    let timer = null;
    let progressTimer = null;
    let startTime = 0;
    let durationMs = 0;
    let ws = null;

    const bgAudio = ref(null);
    const bgVideo = ref(null);

    const fetchScreens = async () => {
        try {
            const res = await fetch('/api/admin/records/signage_screen?limit=100');
            const data = await res.json();
            screens.value = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : (Array.isArray(data.data) ? data.data : []));
        } catch(e) { console.error(e); }
    };

    const fetchSlides = async () => {
        if(!targetScreenId.value) return;
        
        try {
            const res = await fetch('/api/admin/records/signage_slide?limit=100');
            const data = await res.json();
            const arr = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : (Array.isArray(data.data) ? data.data : []));
            
            let filtered = arr.filter(s => s.is_active);
            
            if(targetScreenId.value !== 'all') {
                filtered = filtered.filter(s => s.screen_id == targetScreenId.value || !s.screen_id);
            }

            slides.value = filtered.sort((a, b) => a.order_index - b.order_index);
            
            if(slides.value.length === 0) {
                stopAll();
            } else {
                if(!currentSlide.value || !slides.value.find(s => s.id === currentSlide.value.id)) {
                    currentSlideIndex.value = 0;
                    playSlide(slides.value[0]);
                }
            }
        } catch(e) { console.error(e); }
    };

    const selectScreen = (id) => {
        targetScreenId.value = id;
        localStorage.setItem('signage_kiosk_screen_id', id);
        startAudioContext();
        fetchSlides();
    };
    
    const resetScreen = () => {
        stopAll();
        targetScreenId.value = null;
        localStorage.removeItem('signage_kiosk_screen_id');
        fetchScreens();
    };

    const stopAll = () => {
        currentSlide.value = null;
        clearInterval(timer);
        clearInterval(progressTimer);
        stopAudio();
    };

    const stopAudio = () => {
        if(bgAudio.value) {
            bgAudio.value.pause();
            bgAudio.value.currentTime = 0;
        }
    };

    const startAudioContext = () => {
        audioContextStarted.value = true;
        if(bgAudio.value && currentSlide.value && currentSlide.value.audio_url) {
            bgAudio.value.play().catch(e => console.log('Audio autoplay blocked'));
        }
    };

    const playSlide = (slide) => {
        stopAll();
        currentSlide.value = slide;
        durationMs = (slide.duration || 10) * 1000;
        startTime = Date.now();

        if(slide.audio_url && audioContextStarted.value) {
            nextTick(() => {
                if(bgAudio.value) bgAudio.value.play().catch(e => console.log('Audio autoplay blocked'));
            });
        }
        
        if(slide.media_type === 'video' && audioContextStarted.value) {
            nextTick(() => {
                if(bgVideo.value) {
                    bgVideo.value.muted = false;
                }
            });
        }

        progressTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            progressPercentage.value = Math.min((elapsed / durationMs) * 100, 100);
        }, 100);

        timer = setTimeout(() => {
            nextSlide();
        }, durationMs);
    };

    const nextSlide = () => {
        if(slides.value.length === 0) return;
        currentSlideIndex.value = (currentSlideIndex.value + 1) % slides.value.length;
        playSlide(slides.value[currentSlideIndex.value]);
    };

    const connectWS = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/signage`);
        ws.onopen = () => console.log('Kiosk WS Connected');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if(data.action === 'REFRESH') {
                    fetchSlides();
                }
            } catch(e) {}
        };
        ws.onclose = () => {
            setTimeout(connectWS, 5000);
        };
    };

    onMounted(() => {
        const urlParams = new URLSearchParams(window.location.search);
        let urlScreen = urlParams.get('screen');
        let savedScreen = localStorage.getItem('signage_kiosk_screen_id');
        
        if(urlScreen) {
            targetScreenId.value = urlScreen;
            localStorage.setItem('signage_kiosk_screen_id', urlScreen);
        } else if(savedScreen) {
            targetScreenId.value = savedScreen;
        }

        if(targetScreenId.value) {
            fetchSlides();
        } else {
            fetchScreens();
        }
        
        connectWS();
        document.body.addEventListener('click', startAudioContext, { once: true });
    });

    onUnmounted(() => {
        stopAll();
        if(ws) ws.close();
    });

    return { 
        currentSlide, progressPercentage, targetScreenId, screens, bgAudio, bgVideo, 
        startAudioContext, selectScreen, resetScreen
    };