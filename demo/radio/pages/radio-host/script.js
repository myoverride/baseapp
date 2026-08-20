const userName = ref(localStorage.getItem('meet_username') || 'DJ_' + Math.floor(Math.random()*1000));
    const myPeerId = 'host_' + Math.random().toString(36).substring(2, 9);
    
    const isBroadcasting = ref(false);
    
    // Web Audio API Elements
    let audioCtx = null;
    let dest = null;
    
    // Mic
    let micStream = null;
    let micSource = null;
    let micGain = null;
    const micVolume = ref(1.0);
    const micEnabled = ref(true);
    
    // Playlist
    const audioEl = new Audio();
    let audioSource = null;
    let audioGain = null;
    const musicVolume = ref(0.4);
    const isMusicPlaying = ref(false);
    
    const playlistFiles = ref([]);
    const playlist = ref([]);
    const currentTrackIndex = ref(-1);
    
    // WebRTC
    const mixedStream = ref(null);
    const chatInput = ref('');
    const messages = ref([]);
    const peers = ref({}); 
    const listenerCount = computed(() => Object.keys(peers.value).length);

    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };
    const tenantSlug = (window.location.pathname.startsWith('/tenant/') ? window.location.pathname.split('/')[2] : null) || getCookie('tenant_slug') || 'master';
    const wsPath = `/api/ws/tenant/${tenantSlug}/radio`;

    const { ws } = useWS(wsPath, async (data) => {
      if (!data) return;
      if (data.sender === myPeerId) return;

      if (data.type === 'listener-join' && isBroadcasting.value) {
        const pc = createPeerConnection(data.peerId);
      }
      else if (data.type === 'answer' && data.target === myPeerId) {
        if (peers.value[data.sender]) {
          await peers.value[data.sender].pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      }
      else if (data.type === 'ice' && data.target === myPeerId) {
        if (peers.value[data.sender]) {
          peers.value[data.sender].pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
        }
      }
      else if (data.type === 'chat') {
        messages.value.push({ sender: data.senderName, text: data.text, isHost: false, ts: Date.now() });
      }
      else if (data.type === 'leave') {
        if (peers.value[data.peerId]) {
          peers.value[data.peerId].pc.close();
          delete peers.value[data.peerId];
        }
      }
    });

    const sendSignal = async (payload, keepalive = false) => {
      try {
        await fetch('/api/radio/signal', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-tenant-slug': tenantSlug
          },
          keepalive: keepalive,
          body: JSON.stringify({ ...payload, sender: myPeerId })
        });
      } catch (e) { console.error('Signal error', e); }
    };

    // Volume Watchers
    watch(micVolume, (val) => { if(micGain) micGain.gain.value = val; });
    watch(musicVolume, (val) => { if(audioGain) audioGain.gain.value = val; });

    const toggleMic = () => {
      micEnabled.value = !micEnabled.value;
      if (micStream) {
        micStream.getAudioTracks().forEach(t => t.enabled = micEnabled.value);
      }
    };

    const initAudioContext = async () => {
      if (audioCtx) return;
      audioCtx = new AudioContext();
      dest = audioCtx.createMediaStreamDestination();
      
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSource = audioCtx.createMediaStreamSource(micStream);
        micGain = audioCtx.createGain();
        micGain.gain.value = micVolume.value;
        micSource.connect(micGain);
        micGain.connect(dest);
      } catch (e) {
        console.error('Mikrofon erişim hatası:', e);
        alert('Mikrofona erişilemediği için sadece müzik yayını yapılabilecek.');
      }
      
      audioSource = audioCtx.createMediaElementSource(audioEl);
      audioGain = audioCtx.createGain();
      audioGain.gain.value = musicVolume.value;
      audioSource.connect(audioGain);
      audioGain.connect(dest);
      audioGain.connect(audioCtx.destination);
      
      audioEl.onended = () => { playNext(); };
      audioEl.onplay = () => { isMusicPlaying.value = true; };
      audioEl.onpause = () => { isMusicPlaying.value = false; };
      
      mixedStream.value = markRaw(dest.stream);
    };

    const toggleBroadcast = async () => {
      if (!isBroadcasting.value) {
        try {
          await initAudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();
          
          isBroadcasting.value = true;
          sendSignal({ type: 'broadcast-started' });
        } catch (e) {
          console.error('Yayın başlatılamadı:', e);
        }
      } else {
        Object.values(peers.value).forEach(p => p.pc.close());
        peers.value = {};
        isBroadcasting.value = false;
        sendSignal({ type: 'broadcast-stopped' });
      }
    };

    const onFilesAdded = () => {
      if (!playlistFiles.value || playlistFiles.value.length === 0) return;
      Array.from(playlistFiles.value).forEach(file => {
        playlist.value.push({ name: file.name, url: URL.createObjectURL(file) });
      });
      playlistFiles.value = [];
    };

    const removeTrack = (index) => {
       if (currentTrackIndex.value === index) {
          audioEl.pause();
          audioEl.src = '';
          currentTrackIndex.value = -1;
       }
       playlist.value.splice(index, 1);
       if (currentTrackIndex.value > index) currentTrackIndex.value--;
    };

    const loadTrack = (index) => {
      if (index >= 0 && index < playlist.value.length) {
        audioEl.src = playlist.value[index].url;
        audioEl.load();
      }
    };

    const playTrack = async (index) => {
      currentTrackIndex.value = index;
      loadTrack(index);
      if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
      audioEl.play().catch(e => console.error('Play hatası', e));
    };

    const toggleMusicPlay = async () => {
      if (playlist.value.length === 0) return;
      if (currentTrackIndex.value === -1) {
        currentTrackIndex.value = 0;
        loadTrack(0);
      }
      if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
      
      if (isMusicPlaying.value) { audioEl.pause(); } 
      else { audioEl.play().catch(e=>console.error(e)); }
    };

    const playNext = () => {
      if (playlist.value.length === 0) return;
      let nextIndex = currentTrackIndex.value + 1;
      if (nextIndex >= playlist.value.length) nextIndex = 0;
      playTrack(nextIndex);
    };

    const playPrev = () => {
      if (playlist.value.length === 0) return;
      let prevIndex = currentTrackIndex.value - 1;
      if (prevIndex < 0) prevIndex = playlist.value.length - 1;
      playTrack(prevIndex);
    };

    const createPeerConnection = (peerId) => {
      const pc = new RTCPeerConnection(iceServers);
      peers.value[peerId] = { pc: markRaw(pc) };
      
      if (mixedStream.value) {
        mixedStream.value.getTracks().forEach(track => pc.addTrack(track, mixedStream.value));
      }
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({ type: 'ice', candidate: event.candidate, target: peerId });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (peers.value[peerId]) { delete peers.value[peerId]; }
        }
      };
      
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', offer, target: peerId });
      });
      
      return pc;
    };

    const sendChat = () => {
      if (!chatInput.value.trim()) return;
      sendSignal({ type: 'chat', text: chatInput.value, senderName: userName.value });
      messages.value.push({ sender: userName.value, text: chatInput.value, isHost: true, ts: Date.now() });
      chatInput.value = '';
    };

    const handleUnload = () => {
      sendSignal({ type: 'leave', peerId: myPeerId }, true);
      if (isBroadcasting.value) sendSignal({ type: 'broadcast-stopped' }, true);
    };

    onMounted(() => {
      window.addEventListener('beforeunload', handleUnload);
      fetch('/api/radio/signal', { method: 'POST', body: JSON.stringify({ type: 'ping' }) }).catch(()=>{});
    });

    onUnmounted(() => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (audioEl) { audioEl.pause(); audioEl.src = ''; }
      if (audioCtx) audioCtx.close();
      Object.values(peers.value).forEach(p => p.pc.close());
    });

    return { 
      userName, isBroadcasting, toggleBroadcast, peers, listenerCount, 
      chatInput, messages, sendChat,
      micEnabled, micVolume, toggleMic,
      playlistFiles, playlist, currentTrackIndex, isMusicPlaying, musicVolume,
      onFilesAdded, removeTrack, playTrack, toggleMusicPlay, playNext, playPrev
    };