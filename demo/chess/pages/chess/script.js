const route = useRoute();
const tenantSlug = route?.params?.slug || (route?.path ? route.path.split('/')[2] : '') || '';

    const rooms = ref([]);
    const newRoomName = ref('');
    const showJoinDialog = ref(false);
    const userName = ref('');
    const selectedRoomId = ref(null);
    const loading = ref(false);

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/custom/chess/rooms/public?limit=50&sortBy=created_at&sortOrder=DESC', { headers: { 'x-tenant-slug': tenantSlug } });
        if (res.status === 401) return;
        const data = await res.json();
        if (data.data) {
          rooms.value = data.data;
        }
      } catch (e) { 
        console.error('Fetch rooms error:', e); 
      }
    };

    const createRoom = async () => {
      if (!newRoomName.value) return;
      loading.value = true;
      try {
        const payload = { data: { name: newRoomName.value, status: 'active', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } };
        const res = await fetch('/api/custom/chess/rooms/private', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug }, 
          body: JSON.stringify(payload) 
        });
        const data = await res.json();
        if (!res.ok) {
          alert('Hata: ' + (data.message || JSON.stringify(data)));
        } else {
          newRoomName.value = '';
          fetchRooms();
        }
      } catch (e) { 
        console.error('Create room error:', e); 
      } finally {
        loading.value = false;
      }
    };

    const joinRoom = (id) => {
      selectedRoomId.value = id;
      showJoinDialog.value = true;
    };

    const confirmJoin = () => {
      if (!userName.value) return;
      localStorage.setItem('chess_username', userName.value);
      window.location.href = '/chess/' + selectedRoomId.value;
    };

    let interval = null;
    onMounted(() => {
      userName.value = localStorage.getItem('chess_username') || 'Oyuncu_' + Math.floor(Math.random()*1000);
      fetchRooms();
      interval = setInterval(fetchRooms, 3000);
    });
    
    onUnmounted(() => {
      if (interval) clearInterval(interval);
    });

    return { rooms, newRoomName, createRoom, showJoinDialog, joinRoom, userName, confirmJoin, loading };