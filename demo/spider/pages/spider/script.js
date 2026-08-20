const tableauAreaRef = ref(null);
    const tableauHeight = ref(600);
    const tableau = ref([]);
    const stock = ref([]);
    const hintState = ref(null);
    const completedSuits = ref(0);
    const moves = ref(0);
    const won = ref(false);
    
    const history = ref([]);
    const draggedInfo = ref(null);
    
    const showError = ref(false);
    const errorMessage = ref('');

    const SUITS = ['♠', '♥', '♣', '♦'];
    const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

    
    const updateTableauHeight = () => {
        if(tableauAreaRef.value) {
            tableauHeight.value = tableauAreaRef.value.clientHeight;
        }
    };

    const getCardTop = (colIdx, cardIdx) => {
        const col = tableau.value[colIdx];
        if(!col) return '0px';
        
        // Kart sayısına ve ekranda kalan yüksekliğe göre 30 piksellik varsayılan aralığı dinamik daralt (Squeeze logic)
        let availableHeight = tableauHeight.value - 150; // Kart yüksekliği + boşluk tahmini
        if(availableHeight < 200) availableHeight = 200;
        
        let offset = 30; // Maksimum aralık
        if (col.length > 1) {
            let requiredHeight = (col.length - 1) * 30;
            if (requiredHeight > availableHeight) {
                // Sığmıyorsa mecburen daha sıkışık diz
                offset = availableHeight / (col.length - 1);
            }
        }
        return (cardIdx * offset) + 'px';
    };

    const isRed = (suit) => suit === '♥' || suit === '♦';
    
    const getRankStr = (rank) => {
        if(rank === 1) return 'A';
        if(rank === 11) return 'J';
        if(rank === 12) return 'Q';
        if(rank === 13) return 'K';
        return rank.toString();
    };

    const saveState = () => {
        // Deep clone current state
        history.value.push({
            tableau: JSON.parse(JSON.stringify(tableau.value)),
            stock: JSON.parse(JSON.stringify(stock.value)),
            completedSuits: completedSuits.value,
            moves: moves.value
        });
    };

    const undo = () => {
        if(history.value.length === 0) return;
        const prevState = history.value.pop();
        tableau.value = prevState.tableau;
        stock.value = prevState.stock;
        completedSuits.value = prevState.completedSuits;
        moves.value = prevState.moves;
    };

    
    const clearHint = () => { hintState.value = null; };

    const showHint = () => {
        clearHint();
        // Sütunları tara
        for(let i=0; i<10; i++) {
            let col = tableau.value[i];
            if(col.length === 0) continue;
            
            let seqStartIdx = col.length - 1;
            while(seqStartIdx > 0 && isValidSequence(i, seqStartIdx - 1)) {
                seqStartIdx--;
            }
            
            // Alt seriler içinden hamle ara
            for(let j = seqStartIdx; j < col.length; j++) {
                let draggedCard = col[j];
                
                for(let t=0; t<10; t++) {
                    if(t === i) continue;
                    let targetCol = tableau.value[t];
                    
                    if(targetCol.length === 0) {
                        if(j > 0 && !col[j-1].faceUp) { // Sadece kapalı kart açacaksa boşluğa taşı!
                           hintState.value = { sourceCol: i, sourceCardIdx: j, targetCol: t };
                           setTimeout(clearHint, 2000);
                           return;
                        }
                    } else {
                        let targetBottom = targetCol[targetCol.length - 1];
                        if(draggedCard.rank === targetBottom.rank - 1) {
                            hintState.value = { sourceCol: i, sourceCardIdx: j, targetCol: t };
                            setTimeout(clearHint, 2000);
                            return;
                        }
                    }
                }
            }
        }
        
        // Hamle yoksa desteyi işaret et
        if(stock.value.length > 0) {
            if(tableau.value.some(col => col.length === 0)) {
                errorMessage.value = "Boş sütunlara kart koymadan hamle yapamazsınız ve kart dağıtamazsınız.";
                showError.value = true;
            } else {
                hintState.value = { isStock: true };
                setTimeout(clearHint, 2000);
            }
        } else {
            errorMessage.value = "Yapılabilecek hamle kalmadı!";
            showError.value = true;
        }
    };

    const handleKeyDown = (e) => {
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        } else if(e.key.toLowerCase() === 'h') {
            e.preventDefault();
            showHint();
        }
    };

    const createDeck = () => {
        let deck = [];
        // 2 decks, 4 suits, 13 ranks = 104 cards
        for(let d = 0; d < 2; d++) {
            for(let s of SUITS) {
                for(let r of RANKS) {
                    deck.push({
                        id: `card_${d}_${s}_${r}`,
                        suit: s,
                        rank: r,
                        faceUp: false
                    });
                }
            }
        }
        // Shuffle (Fisher-Yates)
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    };

    const startNewGame = () => {
        let deck = createDeck();
        let newTableau = Array.from({length: 10}, () => []);
        
        // Deal 54 cards to tableau (6 cards to first 4, 5 cards to last 6)
        for(let i=0; i<54; i++) {
            let col = i % 10;
            let card = deck.pop();
            // Make bottom card face up
            let isBottom = (col < 4 && newTableau[col].length === 5) || (col >= 4 && newTableau[col].length === 4);
            if(isBottom) {
                card.faceUp = true;
            }
            newTableau[col].push(card);
        }
        
        tableau.value = newTableau;
        stock.value = deck; // 50 cards remaining
        completedSuits.value = 0;
        moves.value = 0;
        won.value = false;
        history.value = [];
        draggedInfo.value = null;
    };

    const dealFromStock = () => {
        if(stock.value.length === 0) return; clearHint();
        
        // Spider Rule: Cannot deal if any column is empty
        if(tableau.value.some(col => col.length === 0)) {
            errorMessage.value = "Boş sütun varken desteden kart dağıtılamaz!";
            showError.value = true;
            return;
        }

        saveState();
        moves.value++;

        for(let i=0; i<10; i++) {
            if(stock.value.length > 0) {
                let card = stock.value.pop();
                card.faceUp = true;
                tableau.value[i].push(card);
            }
        }
        
        checkAllColumnsForCompletion();
    };

    const isValidSequence = (colIdx, startCardIdx) => {
        let col = tableau.value[colIdx];
        if(!col[startCardIdx].faceUp) return false;
        
        for(let i = startCardIdx; i < col.length - 1; i++) {
            let current = col[i];
            let next = col[i+1];
            // Sequence must be SAME SUIT and DESCENDING RANK
            if(current.suit !== next.suit || current.rank !== next.rank + 1) {
                return false;
            }
        }
        return true;
    };

    const canDrag = (colIdx, cardIdx) => {
        return isValidSequence(colIdx, cardIdx);
    };

    const onDragStart = (event, colIdx, cardIdx) => {
        if(!canDrag(colIdx, cardIdx)) {
            event.preventDefault();
            return;
        }
        draggedInfo.value = { colIdx, cardIdx }; clearHint();
        // HTML5 drag requires dataTransfer to be set
        event.dataTransfer.setData('text/plain', JSON.stringify({ colIdx, cardIdx }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const onDrop = (targetColIdx) => {
        if(!draggedInfo.value) return;
        const sourceColIdx = draggedInfo.value.colIdx;
        const sourceCardIdx = draggedInfo.value.cardIdx;
        
        if(sourceColIdx === targetColIdx) {
            draggedInfo.value = null;
            return; // Dropped on same column
        }

        const sourceCol = tableau.value[sourceColIdx];
        const draggedCard = sourceCol[sourceCardIdx];
        
        const targetCol = tableau.value[targetColIdx];
        
        let validDrop = false;
        if(targetCol.length === 0) {
            validDrop = true;
        } else {
            const targetBottomCard = targetCol[targetCol.length - 1];
            // Rank of dragged card must be exactly 1 less than target bottom card. Suit doesn't matter for dropping.
            if(draggedCard.rank === targetBottomCard.rank - 1) {
                validDrop = true;
            }
        }

        if(validDrop) {
            saveState();
            moves.value++;
            
            // Move cards
            const movingCards = sourceCol.splice(sourceCardIdx);
            targetCol.push(...movingCards);
            
            // Flip new bottom card of source column if face down
            if(sourceCol.length > 0) {
                const newBottom = sourceCol[sourceCol.length - 1];
                if(!newBottom.faceUp) {
                    newBottom.faceUp = true;
                }
            }
            
            checkAllColumnsForCompletion();
        }
        
        draggedInfo.value = null;
    };

    const checkAllColumnsForCompletion = () => {
        for(let c = 0; c < 10; c++) {
            let col = tableau.value[c];
            if(col.length >= 13) {
                // Check bottom 13 cards
                let isComplete = true;
                let bottomIdx = col.length - 13;
                
                // First card must be King (13)
                if(!col[bottomIdx].faceUp || col[bottomIdx].rank !== 13) continue;
                
                let targetSuit = col[bottomIdx].suit;
                for(let i = 0; i < 13; i++) {
                    let card = col[bottomIdx + i];
                    if(!card.faceUp || card.suit !== targetSuit || card.rank !== (13 - i)) {
                        isComplete = false;
                        break;
                    }
                }
                
                if(isComplete) {
                    // Remove the 13 cards
                    col.splice(bottomIdx, 13);
                    completedSuits.value++;
                    
                    // Flip new bottom card if exists
                    if(col.length > 0) {
                        const newBottom = col[col.length - 1];
                        if(!newBottom.faceUp) {
                            newBottom.faceUp = true;
                        }
                    }
                    
                    if(completedSuits.value === 8) {
                        won.value = true;
                    }
                }
            }
        }
    };

    const goHome = () => {
        window.location.href = '/';
    };

    onMounted(() => {
        startNewGame();
        updateTableauHeight();
        window.addEventListener('resize', updateTableauHeight);
        window.addEventListener('keydown', handleKeyDown);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', updateTableauHeight);
        window.removeEventListener('keydown', handleKeyDown);
    });

    return {
        tableau, stock, completedSuits, hintState, moves, won, history, draggedInfo,
        showError, errorMessage,
        tableauAreaRef, getCardTop, isRed, getRankStr, undo, startNewGame, dealFromStock,
        canDrag, onDragStart, onDrop, goHome
    };