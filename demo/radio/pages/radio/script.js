const myPeerId = 'listener_' + Math.random().toString(36).substring(2, 9);
    const tempName = ref('');
    const userName = ref(localStorage.getItem('radio_username') || '');
    const userNameSet = computed(() => !!userName.value);
    
    const isLive = ref(false);
    const isPlaying = ref(false);
    
    const chatInput = ref('');
    const messages = ref([]);
    let pc = null;

    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };
    const tenantSlug = getCookie('tenant_slug') || 'master';
    const wsPath = `/api/ws/tenant/${tenantSlug}/radio`;

    const { ws } = useWS(wsPath, async (data) => {
      if (!data) return;
      if (data.sender === myPeerId) return;

      if (data.type === 'broadcast-started') {
        isLive.value = true;
        joinRadio();
      }
      else if (data.type === 'broadcast-stopped') {
        isLive.value = false;
        isPlaying.value = false;
        if (pc) pc.close();
        const audioEl = document.getElementById('radioAudio');
        if (audioEl) audioEl.srcObject = null;
      }
      else if (data.type === 'offer' && data.target === myPeerId) {
        isLive.value = true;
        await handleOffer(data.offer, data.sender);
      }
      else if (data.type === 'ice' && data.target === myPeerId) {
        if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
      }
      else if (data.type === 'chat') {
        messages.value.push({ sender: data.senderName, text: data.text, isHost: !!data.isHost, ts: Date.now() });
      }
    });

    const sendSignal = async (payload) => {
      try {
        await fetch('/api/radio/signal', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-tenant-slug': tenantSlug
          },
          body: JSON.stringify({ ...payload, sender: myPeerId })
        });
      } catch (e) { console.error('Signal error', e); }
    };

    const joinRadio = () => {
      sendSignal({ type: 'listener-join', peerId: myPeerId });
    };

    const handleOffer = async (offer, hostId) => {
      if (pc) pc.close();
      pc = new RTCPeerConnection(iceServers);
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({ type: 'ice', candidate: event.candidate, target: hostId });
        }
      };

      pc.ontrack = (event) => {
        const audioEl = document.getElementById('radioAudio');
        if (audioEl && event.streams[0]) {
          audioEl.srcObject = event.streams[0];
          audioEl.play().then(() => {
            isPlaying.value = true;
          }).catch(err => {
            console.log('Autoplay engellendi. Kullanıcı etkileşimi bekleniyor:', err);
            isPlaying.value = false;
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          isLive.value = false;
          isPlaying.value = false;
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      sendSignal({ type: 'answer', answer, target: hostId });
    };

    const startPlayback = () => {
      const audioEl = document.getElementById('radioAudio');
      if (audioEl && audioEl.srcObject) {
        audioEl.play().then(() => {
          isPlaying.value = true;
        }).catch(e => console.error('Oynatma hatası:', e));
      }
    };

    const saveName = () => {
      if (!tempName.value.trim()) return;
      userName.value = tempName.value.trim();
      localStorage.setItem('radio_username', userName.value);
    };

    const sendChat = () => {
      if (!chatInput.value.trim() || !userNameSet.value) return;
      sendSignal({ type: 'chat', text: chatInput.value, senderName: userName.value, isHost: false });
      messages.value.push({ sender: userName.value, text: chatInput.value, isHost: false, ts: Date.now() });
      chatInput.value = '';
    };

    const handleUnload = () => {
      sendSignal({ type: 'leave', peerId: myPeerId });
    };

    let joinTimer = null;
    onMounted(() => {
      window.addEventListener('beforeunload', handleUnload);
      joinTimer = setTimeout(() => {
        joinRadio();
      }, 1000);
    });

    onUnmounted(() => {
      if (joinTimer) clearTimeout(joinTimer);
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
      if (pc) pc.close();
    });

    return { isLive, isPlaying, startPlayback, tempName, userName, userNameSet, saveName, chatInput, messages, sendChat };