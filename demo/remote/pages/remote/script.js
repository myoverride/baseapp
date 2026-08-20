const roomId = ref('');
    const connected = ref(false);
    const connecting = ref(false);
    const showKeyboard = ref(false);
    const showShortcuts = ref(false);
    const textInput = ref('');

    let ws = null;
    let pc = null;
    let candidatesQueue = [];
    let dataChannel = null;

    const sendAction = (action) => {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(action));
      }
    };

    const sendText = () => {
      if (textInput.value) {
        sendAction({ type: 'type-text', text: textInput.value });
        textInput.value = '';
      }
      showKeyboard.value = false;
    };

    const sendKey = (keyArr) => {
      sendAction({ type: 'keydown', key: keyArr });
      showShortcuts.value = false;
    };

    const triggerFileUpload = () => {
      const el = document.getElementById('fileInput');
      if(el) el.click();
    };

    const handleFileUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      sendAction({ type: 'file-start', name: file.name, size: file.size });
      
      const chunkSize = 16384;
      let offset = 0;
      const reader = new FileReader();
      
      reader.onload = (e) => {
         if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(e.target.result);
            offset += e.target.result.byteLength;
            if (offset < file.size) {
               readSlice(offset);
            } else {
               sendAction({ type: 'file-end', name: file.name });
               alert('Dosya gönderimi tamamlandı: ' + file.name);
            }
         }
      };
      
      const readSlice = (o) => {
         const slice = file.slice(offset, o + chunkSize);
         reader.readAsArrayBuffer(slice);
      };
      readSlice(0);
      event.target.value = null;
    };

    const setupControls = (videoEl) => {
      const getCoords = (e) => {
        const rect = videoEl.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
      };
      
      videoEl.onmousemove = (e) => {
        const coords = getCoords(e);
        sendAction({ type: 'mousemove', x: coords.x, y: coords.y });
      };
      // We do not send automatic clicks anymore. Only buttons are used for clicks.
      videoEl.oncontextmenu = (e) => e.preventDefault();
      
      videoEl.ontouchmove = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const coords = getCoords(touch);
        sendAction({ type: 'mousemove', x: coords.x, y: coords.y });
      };
      videoEl.ontouchstart = (e) => {
        e.preventDefault();
      };
      videoEl.ontouchend = (e) => {
        e.preventDefault();
      };
    };

    const connect = () => {
      if (!roomId.value) return;
      connecting.value = true;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws/tenant/master/remote`;
      
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', roomId: roomId.value }));
      };
      
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.roomId && msg.roomId !== roomId.value) return;
        
        if (msg.type === 'offer') {
          connected.value = true;
          connecting.value = false;
          
          pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          });
          candidatesQueue = [];
          
          pc.ondatachannel = (e) => {
            dataChannel = e.channel;
            dataChannel.binaryType = 'arraybuffer';
          };

          pc.ontrack = (event) => {
            setTimeout(() => {
              const videoEl = document.getElementById('remoteVideo');
              if (videoEl) {
                videoEl.srcObject = event.streams[0];
                setupControls(videoEl);
              }
            }, 100);
          };
          
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              ws.send(JSON.stringify({ type: 'candidate', roomId: roomId.value, candidate: e.candidate }));
            }
          };
          
          await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
          for (let c of candidatesQueue) await pc.addIceCandidate(c);
          candidatesQueue = [];
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          ws.send(JSON.stringify({ type: 'answer', roomId: roomId.value, answer }));
        }
        
        if (msg.type === 'candidate' && pc && msg.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } else {
            candidatesQueue.push(new RTCIceCandidate(msg.candidate));
          }
        }
        
        if (msg.type === 'peer-left') {
          disconnect();
          alert("Host bağlantıyı kopardı.");
        }
      };
      
      ws.onerror = () => {
        connecting.value = false;
        alert("Bağlantı hatası!");
      }
    };

    const disconnect = () => {
      if (pc) pc.close();
      if (ws) {
         ws.send(JSON.stringify({ type: 'peer-left', roomId: roomId.value }));
         ws.close();
      }
      connected.value = false;
      connecting.value = false;
      candidatesQueue = [];
      dataChannel = null;
      const videoEl = document.getElementById('remoteVideo');
      if (videoEl) videoEl.srcObject = null;
    };

    onUnmounted(() => {
      disconnect();
    });

    return { roomId, connected, connecting, connect, disconnect, showKeyboard, showShortcuts, textInput, sendText, sendKey, triggerFileUpload, handleFileUpload, sendAction };