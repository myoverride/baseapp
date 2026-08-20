const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };
    const tenantSlug = (window.location.pathname.startsWith('/tenant/') ? window.location.pathname.split('/')[2] : null) || getCookie('tenant_slug') || 'master';
    
    const rooms = ref([]);
    const newRoomName = ref('');
    const newRoomPassword = ref('');
    const showJoinDialog = ref(false);
    const userName = ref('');
    const joinPassword = ref('');
    const selectedRoom = ref(null);
    const loading = ref(false);

    // Provide a random owner token if not logged in
    const getOwnerToken = () => {
      let token = localStorage.getItem('meet_owner_token');
      if (!token) {
        token = 'owner_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('meet_owner_token', token);
      }
      return token;
    };

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/admin/records/room?limit=50&sortBy=created_at&sortOrder=DESC', { headers: { 'x-tenant-slug': tenantSlug } });
        if (res.status === 401) {
          alert('Odalari gormek icin giris yapmalisiniz.');
          return;
        }
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
        const payload = { 
          data: { 
            name: newRoomName.value, 
            status: 'active',
            owner_id: getOwnerToken(),
            password: newRoomPassword.value || null
          } 
        };
        const res = await fetch('/api/admin/records/room', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug }, 
          body: JSON.stringify(payload) 
        });
        const data = await res.json();
        if (!res.ok) {
          alert('Hata: ' + (data.message || JSON.stringify(data)));
        } else {
          newRoomName.value = '';
          newRoomPassword.value = '';
          fetchRooms();
        }
      } catch (e) { 
        console.error('Create room error:', e); 
        alert('Bağlantı hatası: ' + e.message);
      } finally {
        loading.value = false;
      }
    };

    const joinRoom = (room) => {
      selectedRoom.value = room;
      joinPassword.value = '';
      showJoinDialog.value = true;
    };

    const confirmJoin = async () => {
      if (!userName.value) return;
      localStorage.setItem('meet_username', userName.value);
      const base = window.location.pathname.startsWith('/tenant/') ? '/tenant/' + window.location.pathname.split('/')[2] : ''; window.location.href = base + '/meet/' + selectedRoom.value.id;
    };

    onMounted(async () => {
      fetch('/api/meet/signal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug }, body: JSON.stringify({ type: 'ping' }) }).catch(e => false);
      
      userName.value = localStorage.getItem('meet_username') || '';
      fetchRooms();
    });

    return { rooms, newRoomName, newRoomPassword, createRoom, showJoinDialog, joinRoom, userName, joinPassword, selectedRoom, confirmJoin, loading };