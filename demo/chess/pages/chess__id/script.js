const route = useRoute();
    const roomId = route.path.split('/').filter(Boolean).pop();
    
    const userName = ref(localStorage.getItem('chess_username') || 'Oyuncu');
    const roomName = ref('Yükleniyor...');
    
    onMounted(() => {
      window.addEventListener('resize', resizeBoard);
      resizeBoard();
      connectWS();
      setTimeout(() => { fetchRoomInfo(); }, 500);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', resizeBoard);
      if(ws) ws.close();
    });

    const { Chess } = await import('https://esm.sh/chess.js@1.0.0-beta.6');
    const chess = new Chess();
    
    const displayBoard = ref([]);
    const myColor = ref('spectator'); 
    const boardOrientation = ref('w'); 
    const selectedSquare = ref(null);
    const legalMoves = ref([]);
    const gameStatusText = ref('Bekleniyor...');
    const gameStatusColor = ref('warning');
    
    const messages = ref([]);
    const chatInput = ref('');
    const squareSize = ref(40);

    const checkSquare = ref(null);
    const lastMoveSquares = ref([]);
    const capturedByWhite = ref([]);
    const capturedByBlack = ref([]);
    const showPromotionDialog = ref(false);
    const pendingPromotionMove = ref(null);

    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };
    const tenantSlug = (window.location.pathname.startsWith('/tenant/') ? window.location.pathname.split('/')[2] : null) || getCookie('tenant_slug') || 'master';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/tenant/${tenantSlug}/chess`;
    let ws = null;

    const addLog = (text, sender = 'Sistem') => {
      messages.value.push({ text, sender, ts: Date.now() });
    };

    const updateCapturedPieces = () => {
      const startCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
      const currentCounts = { w: { p:0, n:0, b:0, r:0, q:0 }, b: { p:0, n:0, b:0, r:0, q:0 } };

      chess.board().forEach(row => {
        row.forEach(sq => {
          if (sq) currentCounts[sq.color][sq.type]++;
        });
      });

      let capW = [];
      let capB = [];

      for (const [type, count] of Object.entries(startCounts)) {
        let missingBlack = count - currentCounts['b'][type];
        for(let i=0; i<missingBlack; i++) capW.push(type);

        let missingWhite = count - currentCounts['w'][type];
        for(let i=0; i<missingWhite; i++) capB.push(type);
      }

      capturedByWhite.value = capW;
      capturedByBlack.value = capB;
    };

    const updateStatus = () => {
      if (chess.isCheckmate()) {
        gameStatusText.value = 'Mat! ' + (chess.turn() === 'w' ? 'Siyah' : 'Beyaz') + ' Kazandı';
        gameStatusColor.value = 'error';
      } else if (chess.isDraw()) {
        gameStatusText.value = 'Berabere!';
        gameStatusColor.value = 'grey';
      } else if (chess.isCheck()) {
        gameStatusText.value = 'Şah! Sıra: ' + (chess.turn() === 'w' ? 'Beyaz' : 'Siyah');
        gameStatusColor.value = 'warning';
      } else {
        gameStatusText.value = 'Sıra: ' + (chess.turn() === 'w' ? 'Beyaz' : 'Siyah');
        gameStatusColor.value = 'success';
      }
      
      checkSquare.value = null;
      if (chess.isCheck() || chess.isCheckmate()) {
        const turn = chess.turn();
        const b = chess.board();
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (b[r][c] && b[r][c].type === 'k' && b[r][c].color === turn) {
              checkSquare.value = String.fromCharCode(97 + c) + (8 - r);
            }
          }
        }
      }

      const history = chess.history({ verbose: true });
      if (history.length > 0) {
        const last = history[history.length - 1];
        lastMoveSquares.value = [last.from, last.to];
      } else {
        lastMoveSquares.value = [];
      }

      updateCapturedPieces();

      let currentBoard = chess.board();
      if (boardOrientation.value === 'b') {
        let reversed = [];
        for(let i=7; i>=0; i--) {
          let row = [...currentBoard[i]].reverse();
          reversed.push(row);
        }
        displayBoard.value = reversed;
      } else {
        displayBoard.value = currentBoard;
      }
    };

    watch(myColor, (newColor) => {
      if (newColor === 'w' || newColor === 'b') {
        boardOrientation.value = newColor;
      }
      selectedSquare.value = null;
      legalMoves.value = [];
      updateStatus();
    });

    const flipBoard = () => {
      boardOrientation.value = boardOrientation.value === 'w' ? 'b' : 'w';
      updateStatus();
    };

    const connectWS = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
         ws.send(JSON.stringify({ type: 'join', roomId, userName: userName.value }));
      };
      ws.onmessage = (event) => {
         try {
           const data = JSON.parse(event.data);
           if (!data || data.roomId !== roomId) return;
           
           if (data.type === 'join') {
             addLog(data.userName + ' odaya katıldı.');
             if (chess && chess.fen() !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
                ws.send(JSON.stringify({ type: 'sync', roomId, fen: chess.fen() }));
             }
           }
           else if (data.type === 'sync') {
             try { 
               chess.load(data.fen); 
               updateStatus(); 
             } catch(e){}
           }
           else if (data.type === 'move') {
             try { chess.move(data.move); updateStatus(); } catch(e) {}
           }
           else if (data.type === 'chat') {
             addLog(data.text, data.senderName);
           }
         } catch(e) { console.error('WS parse error', e); }
      };
    };

    const fetchRoomInfo = async () => {
      try {
        const res = await fetch('/api/custom/chess/rooms/public?limit=100');
        const data = await res.json();
        const room = data.data?.find(r => String(r.id) === String(roomId));
        
        if (room && room.name) {
          roomName.value = room.name;
          if (room.fen && room.fen.length > 5) {
             try { chess.load(room.fen); } catch(e){}
          }
          
          if (!room.whitePlayer || room.whitePlayer === userName.value) {
             myColor.value = 'w';
             boardOrientation.value = 'w';
          } else if (!room.blackPlayer || room.blackPlayer === userName.value) {
             myColor.value = 'b';
             boardOrientation.value = 'b';
          } else {
             myColor.value = 'spectator';
          }
          
          updateStatus();
          if(ws && ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: 'join', roomId, userName: userName.value }));
          }
        } else {
          roomName.value = 'Oda bulunamadı veya silinmiş!';
        }
      } catch (e) { console.error('fetchRoomInfo error:', e); }
    };

    const getSquareCoords = (rIndex, cIndex) => {
      let rank = boardOrientation.value === 'b' ? rIndex + 1 : 8 - rIndex;
      let fileCode = boardOrientation.value === 'b' ? 104 - cIndex : 97 + cIndex;
      return String.fromCharCode(fileCode) + rank;
    };

    const executeMove = (from, to, promotion = undefined) => {
      try {
        const moveObj = { from, to };
        if (promotion) moveObj.promotion = promotion;

        const moveResult = chess.move(moveObj);
        if (!moveResult) return;

        selectedSquare.value = null;
        legalMoves.value = [];
        updateStatus();

        if(ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'move', roomId, move: moveResult.san }));
        }
        fetch('/api/custom/chess/rooms/private/' + roomId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
          body: JSON.stringify({ data: { fen: chess.fen() } })
        }).catch(e => false);
      } catch (e) {
        console.error(e);
      }
    };

    const onSquareClick = (rIndex, cIndex) => {
      if (myColor.value !== 'w' && myColor.value !== 'b') return; 
      if (chess.turn() !== myColor.value) return; 
      
      const sq = getSquareCoords(rIndex, cIndex);
      
      if (selectedSquare.value) {
        const moves = chess.moves({ square: selectedSquare.value, verbose: true });
        const move = moves.find(m => m.to === sq);
        
        if (move) {
          if (move.flags.includes('p') || move.promotion) {
            pendingPromotionMove.value = move;
            showPromotionDialog.value = true;
            return;
          }
          executeMove(move.from, move.to);
          return;
        }
      }
      
      const piece = chess.get(sq);
      if (piece && piece.color === myColor.value) {
        selectedSquare.value = sq;
        legalMoves.value = chess.moves({ square: sq, verbose: true }).map(m => m.to);
      } else {
        selectedSquare.value = null;
        legalMoves.value = [];
      }
    };

    const confirmPromotion = (piece) => {
      if (pendingPromotionMove.value) {
        executeMove(pendingPromotionMove.value.from, pendingPromotionMove.value.to, piece);
      }
      showPromotionDialog.value = false;
      pendingPromotionMove.value = null;
    };

    const getSquareColor = (rIndex, cIndex) => {
      const sq = getSquareCoords(rIndex, cIndex);
      let isDark = (rIndex + cIndex) % 2 !== 0;
      let baseColor = isDark ? '#769656' : '#eeeed2'; 
      
      if (sq === checkSquare.value) return '#ff4c4c';
      if (selectedSquare.value === sq) return '#baca44';
      if (lastMoveSquares.value.includes(sq)) return isDark ? '#bbc045' : '#f5f682';
      if (legalMoves.value.includes(sq)) return isDark ? '#a5b768' : '#d6d6a8';
      
      return baseColor;
    };

    const getPieceUnicode = (piece) => {
      if (!piece) return '';
      const map = {
        'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟',
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
      };
      return map[piece.type] || '';
    };

    const sendChat = () => {
      if (!chatInput.value.trim()) return;
      if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'chat', roomId, text: chatInput.value, senderName: userName.value }));
      }
      addLog(chatInput.value, userName.value);
      chatInput.value = '';
    };

    const resizeBoard = () => {
      const isMobile = window.innerWidth < 600;
      const maxWidth = isMobile ? window.innerWidth - 32 : 500;
      squareSize.value = Math.floor(maxWidth / 8);
    };
    
    const goLobby = () => {
      window.location.href = '/chess';
    };

    return { 
      roomName, userName, displayBoard, myColor, boardOrientation, gameStatusText, gameStatusColor, 
      onSquareClick, getSquareColor, getPieceUnicode, squareSize,
      chatInput, messages, sendChat, goLobby, flipBoard,
      capturedByWhite, capturedByBlack, showPromotionDialog, confirmPromotion
    };