const boards = ref([]);
    const newBoardName = ref('');
    const loading = ref(false);
    const currentBoard = ref(null);
    const activeTool = ref('select');
    const drawColor = ref('#000000');
    const hasSelection = ref(false);
    const wsConnected = ref(false);

    let canvas = null;
    let socket = null;
    let isReceiving = false;
    let isEditing = false;
    let saveTimeout = null;
    
    let isDrawingShape = false;
    let startPoint = null;
    let currentShape = null;

    // Load script dynamically
    onMounted(() => {
      if (!window.fabric) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
        script.onload = loadBoards;
        document.head.appendChild(script);
      } else {
        loadBoards();
      }
    });

    onUnmounted(() => {
      if (socket) socket.close();
      if (canvas) canvas.dispose();
    });

    const tenantSlug = (window.location.pathname.startsWith('/tenant/') ? window.location.pathname.split('/')[2] : null) || localStorage.getItem('tenant_slug') || 'master';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/whiteboard`;

    const loadBoards = async () => {
      try {
        const res = await $fetch('/api/admin/records/boards?limit=100&sort=-updated_at', { headers: { 'x-tenant-slug': tenantSlug } });
        boards.value = res.data || res.records || [];
      } catch (e) {
        console.error("Board load error", e);
      }
    };

    const createBoard = async () => {
      if (!newBoardName.value.trim()) return;
      loading.value = true;
      try {
        await $fetch('/api/admin/records/boards', { headers: { 'x-tenant-slug': tenantSlug },
          method: 'POST',
          body: { data: { name: newBoardName.value, canvas_data: {} } }
        });
        newBoardName.value = '';
        await loadBoards();
      } catch (e) {
        alert("Hata: " + e.message);
      }
      loading.value = false;
    };

    const deleteBoard = async (id) => {
      if (!confirm("Bu tahtayı silmek istediğinize emin misiniz?")) return;
      try {
        await $fetch(`/api/admin/records/boards/${id}`, { method: 'DELETE', headers: { 'x-tenant-slug': tenantSlug } });
        await loadBoards();
      } catch (e) {
        alert("Hata oluştu");
      }
    };

    const joinBoard = async (board) => {
      currentBoard.value = board;
      setTimeout(() => {
        initFabric();
        initWebSocket();
      }, 100);
    };

    const leaveBoard = () => {
      if (socket) socket.close();
      if (canvas) canvas.dispose();
      currentBoard.value = null;
      loadBoards();
    };

    const initFabric = () => {
      if (!window.fabric) return;
      const container = document.getElementById('canvasContainer');
      if (!container) return;

      canvas = new window.fabric.Canvas('fabricCanvas', {
        width: container.clientWidth,
        height: container.clientHeight,
        isDrawingMode: false,
        backgroundColor: '#ffffff',
        selection: true
      });

      if (currentBoard.value.canvas_data && Object.keys(currentBoard.value.canvas_data).length > 0) {
        isReceiving = true;
        canvas.loadFromJSON(currentBoard.value.canvas_data, () => {
          canvas.renderAll();
          isReceiving = false;
        });
      }

      window.addEventListener('resize', () => {
        if (canvas && document.getElementById('canvasContainer')) {
          canvas.setWidth(document.getElementById('canvasContainer').clientWidth);
          canvas.setHeight(document.getElementById('canvasContainer').clientHeight);
          canvas.renderAll();
        }
      });

      canvas.on('mouse:wheel', function(opt) {
        var delta = opt.e.deltaY;
        var zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      canvas.on('mouse:down', function(opt) {
        var evt = opt.e;
        let pointer = canvas.getPointer(opt.e);
        isEditing = true;

        if (activeTool.value === 'pan' || (activeTool.value === 'select' && evt.altKey)) {
          this.isDraggingPan = true;
          this.selection = false;
          this.lastPosX = evt.clientX || (evt.touches && evt.touches[0].clientX);
          this.lastPosY = evt.clientY || (evt.touches && evt.touches[0].clientY);
        }
        else if (['line', 'rect', 'circle', 'triangle'].includes(activeTool.value)) {
          isDrawingShape = true;
          startPoint = pointer;
          
          if (activeTool.value === 'line') {
            currentShape = new window.fabric.Line([startPoint.x, startPoint.y, startPoint.x, startPoint.y], {
              stroke: drawColor.value,
              strokeWidth: 4,
              originX: 'center', originY: 'center'
            });
          } else if (activeTool.value === 'rect') {
            currentShape = new window.fabric.Rect({
              left: startPoint.x, top: startPoint.y,
              fill: 'transparent', stroke: drawColor.value, strokeWidth: 4,
              width: 0, height: 0
            });
          } else if (activeTool.value === 'circle') {
            currentShape = new window.fabric.Circle({
              left: startPoint.x, top: startPoint.y,
              fill: 'transparent', stroke: drawColor.value, strokeWidth: 4,
              radius: 0
            });
          } else if (activeTool.value === 'triangle') {
            currentShape = new window.fabric.Triangle({
              left: startPoint.x, top: startPoint.y,
              fill: 'transparent', stroke: drawColor.value, strokeWidth: 4,
              width: 0, height: 0
            });
          }
          canvas.add(currentShape);
        }
        else if (activeTool.value === 'text') {
           const text = new window.fabric.IText('Yazı...', { 
             left: pointer.x, top: pointer.y, 
             fill: drawColor.value, fontFamily: 'sans-serif', fontSize: 24 
           });
           canvas.add(text);
           canvas.setActiveObject(text);
           activeTool.value = 'select';
        }
      });
      
      canvas.on('mouse:move', function(opt) {
        var evt = opt.e;
        let pointer = canvas.getPointer(opt.e);
        
        if (this.isDraggingPan) {
          var vpt = this.viewportTransform;
          let currentX = evt.clientX || (evt.touches && evt.touches[0].clientX);
          let currentY = evt.clientY || (evt.touches && evt.touches[0].clientY);
          vpt[4] += currentX - this.lastPosX;
          vpt[5] += currentY - this.lastPosY;
          this.requestRenderAll();
          this.lastPosX = currentX;
          this.lastPosY = currentY;
        }
        else if (isDrawingShape && currentShape) {
          if (activeTool.value === 'line') {
            currentShape.set({ x2: pointer.x, y2: pointer.y });
          } else if (activeTool.value === 'rect') {
             let w = Math.abs(pointer.x - startPoint.x);
             let h = Math.abs(pointer.y - startPoint.y);
             currentShape.set({
               left: Math.min(pointer.x, startPoint.x),
               top: Math.min(pointer.y, startPoint.y),
               width: w,
               height: h
             });
          } else if (activeTool.value === 'circle') {
             let radius = Math.abs(pointer.x - startPoint.x) / 2;
             currentShape.set({
               left: Math.min(pointer.x, startPoint.x),
               top: Math.min(pointer.y, startPoint.y),
               radius: radius
             });
          } else if (activeTool.value === 'triangle') {
             let w = Math.abs(pointer.x - startPoint.x);
             let h = Math.abs(pointer.y - startPoint.y);
             currentShape.set({
               left: Math.min(pointer.x, startPoint.x),
               top: Math.min(pointer.y, startPoint.y),
               width: w,
               height: h
             });
          }
          canvas.renderAll();
        }
      });

      canvas.on('mouse:up', function(opt) {
        this.setViewportTransform(this.viewportTransform);
        this.isDraggingPan = false;
        
        if (isDrawingShape) {
          isDrawingShape = false;
          if (currentShape) {
            currentShape.setCoords();
            canvas.setActiveObject(currentShape);
            currentShape = null;
            broadcastState();
          }
          activeTool.value = 'select';
        }
        
        this.selection = activeTool.value === 'select';
        isEditing = false;
      });

      // --- MOBILE TOUCH SUPPORT (Pinch Zoom & Two Finger Pan) ---
      let touchState = { type: null, distance: 0, lastPoint: null };
      const wrapper = document.getElementById('canvasContainer');
      
      wrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && activeTool.value !== 'draw') {
          e.preventDefault();
          isEditing = true;
          canvas.isDraggingPan = true;
          canvas.selection = false;
          
          let dx = e.touches[0].clientX - e.touches[1].clientX;
          let dy = e.touches[0].clientY - e.touches[1].clientY;
          touchState.distance = Math.sqrt(dx * dx + dy * dy);
          touchState.lastPoint = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };
          touchState.type = 'multitouch';
        }
      }, { passive: false });

      wrapper.addEventListener('touchmove', (e) => {
        if (touchState.type === 'multitouch' && e.touches.length === 2) {
          e.preventDefault();
          let dx = e.touches[0].clientX - e.touches[1].clientX;
          let dy = e.touches[0].clientY - e.touches[1].clientY;
          let currentDist = Math.sqrt(dx * dx + dy * dy);
          
          let currentCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };

          // Pan
          let panX = currentCenter.x - touchState.lastPoint.x;
          let panY = currentCenter.y - touchState.lastPoint.y;
          
          let vpt = canvas.viewportTransform;
          vpt[4] += panX;
          vpt[5] += panY;

          // Zoom
          let zoomChange = currentDist / touchState.distance;
          let currentZoom = canvas.getZoom();
          let targetZoom = currentZoom * zoomChange;
          if (targetZoom > 20) targetZoom = 20;
          if (targetZoom < 0.01) targetZoom = 0.01;
          
          canvas.zoomToPoint({ x: currentCenter.x, y: currentCenter.y }, targetZoom);
          
          touchState.distance = currentDist;
          touchState.lastPoint = currentCenter;
        }
      }, { passive: false });

      wrapper.addEventListener('touchend', (e) => {
        if (touchState.type === 'multitouch' && e.touches.length < 2) {
          touchState.type = null;
          canvas.isDraggingPan = false;
          canvas.selection = activeTool.value === 'select';
          isEditing = false;
          canvas.setViewportTransform(canvas.viewportTransform);
        }
      }, { passive: false });
      // ------------------------------------------------------------

      canvas.on('selection:created', () => hasSelection.value = true);
      canvas.on('selection:updated', () => hasSelection.value = true);
      canvas.on('selection:cleared', () => hasSelection.value = false);

      canvas.on('object:added', () => { if (!isReceiving && !isDrawingShape) broadcastState(); });
      canvas.on('object:modified', () => { if (!isReceiving) broadcastState(); });
      canvas.on('object:removed', () => { if (!isReceiving) broadcastState(); });
      canvas.on('path:created', () => { if (!isReceiving) broadcastState(); });

      updateToolSettings();
    };

    const updateToolSettings = () => {
      if (!canvas) return;
      
      canvas.isDrawingMode = (activeTool.value === 'draw');
      
      if (activeTool.value === 'draw') {
        canvas.freeDrawingBrush.color = drawColor.value;
        canvas.freeDrawingBrush.width = 4;
      }
      
      if (activeTool.value === 'select') {
         canvas.selection = true;
         canvas.defaultCursor = 'default';
      } else if (activeTool.value === 'pan') {
         canvas.selection = false;
         canvas.defaultCursor = 'grab';
      } else {
         canvas.selection = false;
         canvas.defaultCursor = 'crosshair';
      }
    };

    watch(activeTool, updateToolSettings);

    const updateColor = () => {
      if (!canvas) return;
      if (activeTool.value === 'draw') {
        canvas.freeDrawingBrush.color = drawColor.value;
      }
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        if (activeObj.type === 'i-text' || activeObj.type === 'text') {
          activeObj.set('fill', drawColor.value);
        } else if (activeObj.type === 'path') {
          activeObj.set('stroke', drawColor.value);
        } else {
          activeObj.set('fill', 'transparent');
          activeObj.set('stroke', drawColor.value);
        }
        canvas.renderAll();
        broadcastState();
      }
    };

    const zoomIn = () => {
       if(!canvas) return;
       let zoom = canvas.getZoom();
       zoom *= 1.2;
       if (zoom > 20) zoom = 20;
       canvas.zoomToPoint({ x: canvas.width/2, y: canvas.height/2 }, zoom);
    };

    const zoomOut = () => {
       if(!canvas) return;
       let zoom = canvas.getZoom();
       zoom *= 0.8;
       if (zoom < 0.01) zoom = 0.01;
       canvas.zoomToPoint({ x: canvas.width/2, y: canvas.height/2 }, zoom);
    };

    const zoomReset = () => {
       if(!canvas) return;
       canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    };

    const deleteSelected = () => {
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length) {
        canvas.discardActiveObject();
        activeObjects.forEach(obj => canvas.remove(obj));
      }
    };

    const clearBoard = () => {
      if (confirm("Tahtadaki her şey silinecek. Emin misiniz?")) {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        broadcastState();
      }
    };

    const initWebSocket = () => {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => { wsConnected.value = true; };
      socket.onmessage = (event) => {
        if (isEditing) return;
        try {
          let rawData = JSON.parse(event.data);
          let data = rawData.payload ? JSON.parse(rawData.payload) : rawData;
          if (data.type === 'sync' && data.boardId === currentBoard.value?.id) {
            isReceiving = true;
            canvas.loadFromJSON(data.canvasJSON, () => {
              canvas.renderAll();
              isReceiving = false;
            });
          }
        } catch (e) {}
      };
      socket.onclose = () => {
        wsConnected.value = false;
        if (currentBoard.value) setTimeout(initWebSocket, 2000);
      };
    };

    const broadcastState = () => {
      if (!canvas || isReceiving) return;
      const json = canvas.toJSON();
      if (wsConnected.value && socket) {
        socket.send(JSON.stringify({ type: 'sync', boardId: currentBoard.value.id, canvasJSON: json }));
      }
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          await $fetch(`/api/admin/records/boards/${currentBoard.value.id}`, { headers: { 'x-tenant-slug': tenantSlug },
            method: 'PUT',
            body: { data: { name: currentBoard.value.name, canvas_data: json } }
          });
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      }, 1000);
    };

    return {
      boards, newBoardName, loading, currentBoard, activeTool, drawColor, hasSelection, wsConnected,
      createBoard, deleteBoard, joinBoard, leaveBoard, updateColor, 
      deleteSelected, clearBoard, zoomIn, zoomOut, zoomReset
    };