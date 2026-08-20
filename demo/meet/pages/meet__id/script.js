const route = useRoute();
    const roomId = typeof routeParams !== 'undefined' ? routeParams.id : route.params.id;
    const userName = ref(localStorage.getItem('meet_username') || 'Misafir_' + Math.floor(Math.random()*1000));
    const myPeerId = 'peer_' + Math.random().toString(36).substring(2, 9);
    const ownerToken = localStorage.getItem('meet_owner_token') || '';
    
    const localVideo = ref(null);
    const localScreenVideo = ref(null);
    const chatBox = ref(null);

    let localStream = null;
    let screenStream = null;
    let screenPeerId = null;
    
    const isScreenSharing = ref(false);
    const isMicMuted = ref(false);
    const isCameraOff = ref(false);
    const showChat = ref(false);
    
    const chatInput = ref('');
    const messages = ref([]);
    const peers = ref({}); 
    const roomData = ref(null);
    const isOwner = ref(false);
    const loadingChat = ref(true);
    const unreadMessages = ref(0);

    const isAuthorized = ref(false);
    const inputName = ref(localStorage.getItem('meet_username') || '');
    const inputPassword = ref('');
    const requirePassword = ref(false);
    const loadingAuth = ref(true);

    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };
    const tenantSlug = (window.location.pathname.startsWith('/tenant/') ? window.location.pathname.split('/')[2] : null) || getCookie('tenant_slug') || 'master';
    const wsPath = `/api/ws/tenant/${tenantSlug}/meet`;

    const getConnKey = (sender, target) => {
      const isTargetingMyScreen = (target === screenPeerId);
      return isTargetingMyScreen ? sender + '_screen_viewer' : sender;
    };

    const { ws } = useWS(wsPath, async (data) => {
      if (!data || data.roomId !== roomId) return;
      
      if (data.type === 'kick') {
        if (data.targetId === myPeerId || data.targetId === screenPeerId) {
          alert('Oda yöneticisi tarafından odadan çıkarıldınız.');
          leaveRoom();
        }
        return;
      }

      if (data.sender === myPeerId || data.sender === screenPeerId) return;

      if (data.type === 'join') {
        const connKey = data.peerId;
        if (peers.value[connKey]) return;
        createPeerConnection(connKey, data.peerId, data.peerName, true, data.isScreen, false);

        // If I am currently sharing my screen, announce it again so the new joiner knows
        if (screenPeerId && !data.isScreen) {
          setTimeout(() => {
            sendSignal({ type: 'join', peerId: screenPeerId, peerName: userName.value, isScreen: true, sender: screenPeerId });
          }, 500);
        }
      }
      else if (data.type === 'offer') {
        if (data.target !== myPeerId && data.target !== screenPeerId) return;
        
        const connKey = getConnKey(data.sender, data.target);
        if (peers.value[connKey]) return;
        
        const isTargetingMyScreen = (data.target === screenPeerId);
        const pc = createPeerConnection(connKey, data.sender, data.name, false, false, isTargetingMyScreen);
        
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', answer, target: data.sender, sender: data.target });
      }
      else if (data.type === 'answer') {
        if (data.target !== myPeerId && data.target !== screenPeerId) return;
        
        const connKey = getConnKey(data.sender, data.target);
        if (peers.value[connKey]) {
          await peers.value[connKey].pc.setRemoteDescription(data.answer);
        }
      }
      else if (data.type === 'ice') {
        if (data.target !== myPeerId && data.target !== screenPeerId) return;
        
        const connKey = getConnKey(data.sender, data.target);
        if (peers.value[connKey]) {
          peers.value[connKey].pc.addIceCandidate(data.candidate).catch(e=> console.error(e));
        }
      }
      else if (data.type === 'chat') {
        messages.value.push({ sender: data.senderName, text: data.text, ts: data.ts || Date.now() });
        scrollToBottom();
        if (!showChat.value) unreadMessages.value++;
      }
      else if (data.type === 'leave') {
        // Find all connections associated with this peer and close them
        Object.keys(peers.value).forEach(key => {
           if (key === data.peerId || key.startsWith(data.peerId + '_')) {
             peers.value[key].pc.close();
             delete peers.value[key];
           }
        });
      }
    });

    const sendSignal = async (payload, keepalive = false) => {
      try {
        await fetch('/api/meet/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
          keepalive: keepalive,
          body: JSON.stringify({ ...payload, roomId, sender: payload.sender || myPeerId })
        });
      } catch (e) { console.error('Signal error', e); }
    };

    const checkAuth = async (initialCheck = false) => {
      if (typeof initialCheck !== "boolean") initialCheck = false;
      if (!initialCheck && !inputName.value.trim()) {
         alert('Lütfen adınızı girin.');
         return;
      }
      
      loadingAuth.value = true;
      try {
        const res = await fetch('/api/meet/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
          body: JSON.stringify({ roomId, password: inputPassword.value })
        });
        
        const data = await res.json();
        
        if (res.status === 401 && data.requirePassword) {
          requirePassword.value = true;
          if (!initialCheck && inputPassword.value) {
            alert('Hatalı şifre!');
          }
          loadingAuth.value = false;
          return;
        }
        
        if (!res.ok) {
          if (!initialCheck) alert('Oda doğrulanamadı: ' + (data.error || 'Bilinmeyen hata'));
          loadingAuth.value = false;
          return;
        }

        if (!initialCheck) {
          userName.value = inputName.value;
          localStorage.setItem('meet_username', userName.value);
          isAuthorized.value = true;
          setTimeout(startConnection, 100);
        } else {
          loadingAuth.value = false;
        }
      } catch (e) {
        console.error(e);
        if (!initialCheck) alert('Sunucuya bağlanılamadı');
        loadingAuth.value = false;
      }
    };

    const fetchRoomDetails = async () => {
      try {
        const res = await fetch(`/api/admin/records/room?filter=id,eq,${roomId}&limit=1`, { headers: { 'x-tenant-slug': tenantSlug } });
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          const room = data.data[0];
          roomData.value = room;
          if (room.owner_id && room.owner_id === ownerToken) {
            isOwner.value = true;
          }
        }
        // Start by checking if a password is required
        await checkAuth(true);
      } catch (e) { 
        console.error(e); 
        loadingAuth.value = false;
      }
    };

    const fetchChatHistory = async () => {
      try {
        const res = await fetch(`/api/admin/records/meet_chat?filter=room_id,eq,${roomId}&sortBy=timestamp&sortOrder=ASC&limit=100`, { headers: { 'x-tenant-slug': tenantSlug } });
        const data = await res.json();
        if (data && data.data) {
          messages.value = data.data.map(r => ({ sender: r.sender, text: r.message, ts: r.timestamp }));
          scrollToBottom();
        }
      } catch (e) { console.error(e); }
      loadingChat.value = false;
    };

    const startConnection = async () => {
      fetchChatHistory();

      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo.value) localVideo.value.srcObject = localStream;
      } catch (e) { 
        console.error('Kamera hatası:', e);
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          isCameraOff.value = true;
        } catch (e2) {
           alert('Kamera ve mikrofon izni alınamadı. Sadece izleyici olarak katılıyorsunuz.');
        }
      }

      const tryJoin = () => {
        if (ws.value && ws.value.readyState === 1) {
          sendSignal({ type: 'join', peerId: myPeerId, peerName: userName.value, isScreen: false });
        } else {
          setTimeout(tryJoin, 200);
        }
      };
      tryJoin();
    };

    const createPeerConnection = (connKey, remotePeerId, peerName, isInitiator, isReceivingScreen = false, isSendingScreen = false) => {
      const pc = new RTCPeerConnection(iceServers);
      peers.value[connKey] = { 
        pc, 
        name: peerName, 
        hasVideo: !isReceivingScreen && !isSendingScreen, 
        hasScreen: isReceivingScreen 
      };
      
      // If this connection is meant for sending my screen, attach screenStream
      if (isSendingScreen && screenStream) {
        screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));
      } 
      // If it's a normal camera connection, attach localStream
      else if (!isSendingScreen && !isReceivingScreen && localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      }
      // If we are RECEIVING a screen, we must tell WebRTC we want to receive video, even though we aren't sending any!
      else if (isReceivingScreen && pc.addTransceiver) {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const myIdentity = isSendingScreen ? screenPeerId : myPeerId;
          sendSignal({ type: 'ice', candidate: event.candidate, target: remotePeerId, sender: myIdentity });
        }
      };
      
      pc.ontrack = (event) => {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        const attachVideo = (retries) => {
          const prefix = isReceivingScreen ? 'screen_' : 'video_';
          const vidElement = document.getElementById(prefix + connKey);
          if (vidElement) {
            vidElement.srcObject = stream;
          } else if (retries > 0) {
            setTimeout(() => attachVideo(retries - 1), 200);
          }
        };
        attachVideo(20);
      };

      const handleDisconnect = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (peers.value[connKey]) { delete peers.value[connKey]; }
        }
      };

      pc.onconnectionstatechange = handleDisconnect;
      pc.oniceconnectionstatechange = handleDisconnect;
      
      if (isInitiator) {
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          const myIdentity = isSendingScreen ? screenPeerId : myPeerId;
          sendSignal({ type: 'offer', offer, target: remotePeerId, name: userName.value, isScreen: isSendingScreen, sender: myIdentity });
        });
      }
      return pc;
    };

    const toggleScreenShare = async () => {
      if (!isScreenSharing.value) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Tarayıcınız ekran paylaşımını desteklemiyor.');
          return;
        }
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          const screenVideoTrack = screenStream.getVideoTracks()[0];
          
          screenVideoTrack.onended = () => { stopScreenShare(); };

          isScreenSharing.value = true;
          setTimeout(() => {
            if (localScreenVideo.value) localScreenVideo.value.srcObject = screenStream;
          }, 100);

          screenPeerId = myPeerId + '_screen';
          sendSignal({ type: 'join', peerId: screenPeerId, peerName: userName.value, isScreen: true, sender: screenPeerId });

        } catch (e) {
          console.error('Ekran paylaşılamadı:', e);
        }
      } else {
        stopScreenShare();
      }
    };

    const stopScreenShare = () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      isScreenSharing.value = false;
      if (screenPeerId) {
        sendSignal({ type: 'leave', peerId: screenPeerId, sender: screenPeerId });
        // Close all outbound screen connections
        Object.keys(peers.value).forEach(key => {
          if (key.endsWith('_screen_viewer')) {
            peers.value[key].pc.close();
            delete peers.value[key];
          }
        });
        screenPeerId = null;
      }
    };

    const toggleMic = () => {
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioTrack.enabled;
          isMicMuted.value = !audioTrack.enabled;
        }
      }
    };

    const toggleCamera = () => {
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoTrack.enabled;
          isCameraOff.value = !videoTrack.enabled;
        }
      }
    };

    const makeFullscreen = (id) => {
      const el = document.getElementById(id);
      if (el) {
        if (el.requestFullscreen) { el.requestFullscreen(); }
        else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
        else if (el.msRequestFullscreen) { el.msRequestFullscreen(); }
      }
    };

    const scrollToBottom = () => {
      setTimeout(() => {
        if (chatBox.value) {
          chatBox.value.scrollTop = chatBox.value.scrollHeight;
        }
      }, 50);
    };

    watch(showChat, (val) => {
      if (val) {
        unreadMessages.value = 0;
        scrollToBottom();
      }
    });

    const sendChat = async () => {
      if (!chatInput.value.trim()) return;
      const text = chatInput.value;
      const ts = Date.now();
      
      try {
        await fetch('/api/admin/records/meet_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
          body: JSON.stringify({ data: { room_id: roomId, sender: userName.value, message: text, timestamp: ts } })
        });
      } catch (e) { console.error(e); }

      sendSignal({ type: 'chat', text, senderName: userName.value, ts });
      messages.value.push({ sender: userName.value, text, ts });
      chatInput.value = '';
      scrollToBottom();
    };

    const kickPeer = (peerId) => {
      if (!isOwner.value) return;
      if (confirm('Bu kullanıcıyı odadan atmak istediğinize emin misiniz?')) {
        sendSignal({ type: 'kick', targetId: peerId });
      }
    };

    const leaveRoom = () => {
      const base = window.location.pathname.startsWith('/tenant/') ? '/tenant/' + window.location.pathname.split('/')[2] : ''; window.location.href = base + '/meet';
    };

    const handleUnload = () => {
      sendSignal({ type: 'leave', peerId: myPeerId }, true);
      if (screenPeerId) sendSignal({ type: 'leave', peerId: screenPeerId, sender: screenPeerId }, true);
    };

    onMounted(() => {
      window.addEventListener('beforeunload', handleUnload);
      fetchRoomDetails();
    });

    onUnmounted(() => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload(); 
      
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (screenStream) screenStream.getTracks().forEach(t => t.stop());
      Object.values(peers.value).forEach(p => p.pc.close());
    });

    return { 
      userName, localVideo, localScreenVideo, peers, chatInput, messages, 
      sendChat, isScreenSharing, toggleScreenShare, isMicMuted, isCameraOff, 
      toggleMic, toggleCamera, makeFullscreen, roomData, isOwner, kickPeer, 
      leaveRoom, showChat, chatBox, loadingChat, unreadMessages,
      isAuthorized, inputName, inputPassword, requirePassword, loadingAuth, checkAuth
    };