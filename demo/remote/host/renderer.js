const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const serverUrlInput = document.getElementById('serverUrl');
const roomIdInput = document.getElementById('roomId');
const statusDiv = document.getElementById('status');
const logDiv = document.getElementById('log');

let ws = null;
let pc = null;
let dataChannel = null;
let localStream = null;

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML += `<div>[${time}] ${msg}</div>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

async function getScreenStream() {
  const sources = await window.electronAPI.getDesktopSources();
  // Simple heuristic: pick the first screen or entirely 'Screen 1'
  const source = sources.find(s => s.name === 'Entire Screen' || s.name === 'Screen 1' || s.name.toLowerCase().includes('screen')) || sources[0];
  
  if (!source) throw new Error("No screen source found");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id,
        minWidth: 1280,
        maxWidth: 1920,
        minHeight: 720,
        maxHeight: 1080
      }
    }
  });
  return stream;
}

startBtn.onclick = async () => {
  const url = serverUrlInput.value;
  const roomId = roomIdInput.value;

  if (!roomId) {
    alert("Please enter a Room ID");
    return;
  }

  try {
    localStream = await getScreenStream();
    log("Captured local screen stream.");
  } catch (e) {
    log("Error capturing screen: " + e.message);
    return;
  }

  ws = new WebSocket(url);
  ws.onopen = () => {
    log("Connected to Signaling Server");
    statusDiv.innerText = "Status: Waiting for Peer...";
    ws.send(JSON.stringify({ type: 'join', roomId }));
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  ws.onmessage = async (event) => {
    if (event.data === '__PING__') {
      ws.send('__PONG__');
      return;
    }

    try {
      const msg = JSON.parse(event.data);
      if (msg.roomId !== roomId) return;

      if (msg.type === 'join') {
        // Create Peer Connection and send Offer
        log("Peer joined. Creating WebRTC Offer...");
        createPeerConnection(roomId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', roomId, offer }));
      }

      if (msg.type === 'answer' && pc) {
        log("Received WebRTC Answer.");
        await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
        statusDiv.innerText = "Status: Connected & Streaming";
      }

      if (msg.type === 'candidate' && pc && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }

      if (msg.type === 'peer-left') {
        log("Peer left.");
        statusDiv.innerText = "Status: Waiting for Peer...";
        if (pc) pc.close();
        pc = null;
      }
    } catch(err) {
      // Ignore parse errors from non-json messages
    }
  };

  ws.onerror = (e) => {
    log("WebSocket error");
  };

  ws.onclose = () => {
    log("WebSocket closed");
    stopHost();
  };
};

function createPeerConnection(roomId) {
  if (pc) pc.close();

  pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'candidate', roomId, candidate: e.candidate }));
    }
  };

  // Create data channel for receiving commands
  dataChannel = pc.createDataChannel('control');
  dataChannel.binaryType = 'arraybuffer';
  
  dataChannel.onmessage = (e) => {
    // Check if binary (file chunks)
    if (e.data instanceof ArrayBuffer) {
      // File transfer logic (saving file chunk)
      log("Received binary chunk (" + e.data.byteLength + " bytes)");
      // Note: Full implementation would use Node.js fs module to save
      return;
    }

    try {
      const action = JSON.parse(e.data);
      handleAction(action);
    } catch(err) {
      log("Error parsing datachannel message");
    }
  };
}

function handleAction(action) {
  // Pass commands to main process via IPC
  if (action.type === 'mousemove') {
    window.electronAPI.mouseMove({ x: action.x, y: action.y });
  } else if (action.type === 'click') {
    window.electronAPI.mouseClick({ button: action.button || 'left' });
  } else if (action.type === 'type-text') {
    window.electronAPI.typeText({ text: action.text });
    log("Typed: " + action.text);
  } else if (action.type === 'keydown') {
    window.electronAPI.keyDown({ keys: action.key });
    log("Key shortcut: " + action.key.join('+'));
  } else if (action.type === 'file-start') {
    log(`Receiving file: ${action.name} (${action.size} bytes)`);
  } else if (action.type === 'file-end') {
    log(`File received: ${action.name}`);
  }
}

stopBtn.onclick = () => {
  stopHost();
};

function stopHost() {
  if (pc) pc.close();
  if (ws) ws.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  
  pc = null;
  ws = null;
  localStream = null;
  dataChannel = null;
  
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusDiv.innerText = "Status: Disconnected";
  log("Host stopped.");
}
