const activeTab = ref('screens');
    
    // Screens
    const screens = ref([]);
    const screenDialog = ref(false);
    const editingScreenId = ref(null);
    const screenForm = ref({ name: '', location: '', resolution: '' });

    // Slides
    const slides = ref([]);
    const slideDialog = ref(false);
    const editingSlideId = ref(null);
    const selectedScreenFilter = ref('all');
    const defaultSlideForm = {
        title: '', media_type: 'image', media_url: '', text_content: '', 
        bg_color: '#D32F2F', text_color: '#FFFFFF', duration: 10, order_index: 0, 
        is_active: true, screen_id: null, audio_url: '', banner_text: ''
    };
    const slideForm = ref({ ...defaultSlideForm });

    const publishing = ref(false);
    const publishSuccess = ref(false);
    let ws = null;

    const screenOptions = computed(() => {
        return [{ id: 'all', name: 'Tüm Ekranlar' }, ...screens.value];
    });

    const filteredSlides = computed(() => {
        let filtered = [...slides.value];
        if(selectedScreenFilter.value !== 'all') {
            filtered = filtered.filter(s => s.screen_id === selectedScreenFilter.value);
        }
        return filtered.sort((a, b) => a.order_index - b.order_index);
    });

    const getScreenName = (id) => {
        if(!id) return 'Tümü / Atanmadı';
        const s = screens.value.find(x => x.id === id);
        return s ? s.name : 'Silinmiş Ekran';
    };

    // --- API Calls ---
    const fetchScreens = async () => {
        try {
            const res = await fetch('/api/admin/records/signage_screen?limit=100');
            const data = await res.json();
            screens.value = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : (Array.isArray(data.data) ? data.data : []));
        } catch(e) { console.error(e); }
    };

    const fetchSlides = async () => {
        try {
            const res = await fetch('/api/admin/records/signage_slide?limit=100');
            const data = await res.json();
            slides.value = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : (Array.isArray(data.data) ? data.data : []));
        } catch(e) { console.error(e); }
    };

    // --- Screen Actions ---
    const openScreenDialog = (screen) => {
        if(screen) {
            editingScreenId.value = screen.id;
            screenForm.value = { ...screen };
        } else {
            editingScreenId.value = null;
            screenForm.value = { name: '', location: '', resolution: '' };
        }
        screenDialog.value = true;
    };

    const saveScreen = async () => {
        const method = editingScreenId.value ? 'PUT' : 'POST';
        const url = editingScreenId.value ? `/api/admin/records/signage_screen/${editingScreenId.value}` : '/api/admin/records/signage_screen';
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: screenForm.value }) });
        screenDialog.value = false;
        fetchScreens();
    };

    const deleteScreen = async (id) => {
        if(confirm("Bu ekranı silmek istediğinize emin misiniz? Slaytları kaybolmaz ama boşa düşer.")) {
            await fetch(`/api/admin/records/signage_screen/${id}`, { method: 'DELETE' });
            fetchScreens();
        }
    };

    // --- Slide Actions ---
    const openSlideDialog = (slide) => {
        if(slide) {
            editingSlideId.value = slide.id;
            slideForm.value = { ...slide };
        } else {
            editingSlideId.value = null;
            let targetScreen = selectedScreenFilter.value === 'all' ? null : selectedScreenFilter.value;
            slideForm.value = { ...defaultSlideForm, order_index: slides.value.length * 10, screen_id: targetScreen };
        }
        slideDialog.value = true;
    };

    const saveSlide = async () => {
        const method = editingSlideId.value ? 'PUT' : 'POST';
        const url = editingSlideId.value ? `/api/admin/records/signage_slide/${editingSlideId.value}` : '/api/admin/records/signage_slide';
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: slideForm.value }) });
        slideDialog.value = false;
        fetchSlides();
    };

    const deleteSlide = async (id) => {
        if(confirm("Silmek istediğinize emin misiniz?")) {
            await fetch(`/api/admin/records/signage_slide/${id}`, { method: 'DELETE' });
            fetchSlides();
        }
    };

    // --- WebSocket & Publish ---
    const connectWS = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/signage`);
        ws.onopen = () => console.log('CMS WS Connected');
    };

    const publishChanges = () => {
        publishing.value = true;
        if(ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'REFRESH' }));
            publishSuccess.value = true;
            setTimeout(() => publishSuccess.value = false, 3000);
        } else {
            alert('Bağlantı kurulamadı. Lütfen WebSocket uç noktasının doğru yapılandırıldığından emin olun.');
        }
        publishing.value = false;
    };

    onMounted(() => {
        fetchScreens();
        fetchSlides();
        connectWS();
    });

    return { 
        activeTab, screens, screenDialog, editingScreenId, screenForm,
        slides, slideDialog, editingSlideId, slideForm, defaultSlideForm,
        selectedScreenFilter, screenOptions, filteredSlides, getScreenName,
        publishing, publishSuccess,
        openScreenDialog, saveScreen, deleteScreen,
        openSlideDialog, saveSlide, deleteSlide, publishChanges
    };