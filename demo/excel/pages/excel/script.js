const fileInput = ref(null);
        const loading = ref(true);
        
        const selectedCellName = ref('');
        const formulaValue = ref('');
        const fontSize = ref('12px');
        const dataType = ref('Genel');
        
        const sheets = ref([
            { name: 'Sayfa1', data: null, instance: null }
        ]);
        const activeTabIndex = ref(0);

        const editStartSheetIndex = ref(-1);
        const editStartCellName = ref('');

        const editingSheetIndex = ref(-1);
        let oldSheetName = '';

        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };
        const loadCss = (href) => {
            if (document.querySelector(`link[href="${href}"]`)) return;
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
            document.head.appendChild(link);
        };

        const getCellName = (x, y) => {
            let letter = '';
            let tempX = parseInt(x);
            while (tempX >= 0) {
                letter = String.fromCharCode(tempX % 26 + 65) + letter;
                tempX = Math.floor(tempX / 26) - 1;
            }
            return letter + (parseInt(y) + 1);
        };

        const getCellCoords = (cellName) => {
            const match = cellName.match(/^([a-zA-Z]+)(\d+)$/);
            if (!match) return null;
            let col = 0;
            const letters = match[1].toUpperCase();
            for (let i = 0; i < letters.length; i++) {
                col += (letters.charCodeAt(i) - 64) * Math.pow(26, letters.length - i - 1);
            }
            return [col - 1, parseInt(match[2]) - 1];
        };

        const applyFormat = (property, value) => {
            if (!selectedCellName.value || !sheets.value[activeTabIndex.value]) return;
            const activeInstance = sheets.value[activeTabIndex.value].instance;
            if (!activeInstance) return;
            activeInstance.setStyle(selectedCellName.value, property, value);
        };

        const applyDataType = (type) => {
            if (!selectedCellName.value || !sheets.value[activeTabIndex.value]) return;
            const activeInstance = sheets.value[activeTabIndex.value].instance;
            if (!activeInstance) return;
            
            const coords = getCellCoords(selectedCellName.value);
            if(!coords) return;
            const x = coords[0];
            const y = coords[1];
            let val = activeInstance.getValueFromCoords(x, y);
            if (!val && val !== 0) return;

            try {
                if (type === 'Sayı' && !isNaN(val)) {
                    val = Number(val).toFixed(2);
                } else if (type === 'Para Birimi' && !isNaN(val)) {
                    val = Number(val).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
                } else if (type === 'Yüzde' && !isNaN(val)) {
                    val = (Number(val) * 100).toFixed(0) + '%';
                } else if (type === 'Tarih' && !isNaN(Date.parse(val))) {
                    val = new Date(val).toLocaleDateString('tr-TR');
                }
                activeInstance.setValueFromCoords(x, y, val);
                formulaValue.value = val;
            } catch (e) {
                console.error("Veri tipi dönüşümü başarısız", e);
            }
        };

        const startEditingSheet = (index) => {
            editingSheetIndex.value = index;
            oldSheetName = sheets.value[index].name;
            // autofocus is handled via html attribute but slightly delayed might be needed
        };

        const stopEditingSheet = (index) => {
            if (editingSheetIndex.value === -1) return;
            
            let newName = sheets.value[index].name.replace(/[^a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ]/g, '');
            if (!newName) newName = oldSheetName;
            sheets.value[index].name = newName;
            editingSheetIndex.value = -1;
            
            if (oldSheetName !== newName) {
                sheets.value.forEach(s => {
                    if (s.instance) {
                        const data = s.instance.getData();
                        let changed = false;
                        for (let y = 0; y < data.length; y++) {
                            for (let x = 0; x < data[y].length; x++) {
                                let val = data[y][x];
                                if (typeof val === 'string' && val.startsWith('=')) {
                                    let regex = new RegExp(oldSheetName + '!', 'ig');
                                    let updated = val.replace(regex, newName + '!');
                                    if (updated !== val) {
                                        s.instance.setValueFromCoords(x, y, updated);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        };

        const onFormulaFocus = () => {
            editStartSheetIndex.value = activeTabIndex.value;
            editStartCellName.value = selectedCellName.value;
        };

        const onFormulaChange = (e) => {
            if (editStartSheetIndex.value !== -1 && editStartCellName.value) {
                const targetInstance = sheets.value[editStartSheetIndex.value].instance;
                const coords = getCellCoords(editStartCellName.value);
                if (coords) {
                    targetInstance.setValueFromCoords(coords[0], coords[1], e.target.value);
                }
            }
        };

        const applyFormula = () => {
            if (editStartSheetIndex.value !== -1 && editStartCellName.value) {
                const targetInstance = sheets.value[editStartSheetIndex.value].instance;
                const coords = getCellCoords(editStartCellName.value);
                if (coords) {
                    targetInstance.setValueFromCoords(coords[0], coords[1], formulaValue.value);
                    document.activeElement.blur();
                    editStartSheetIndex.value = -1;
                }
            }
        };

        const handleMousedown = (e) => {
            const editor = document.querySelector('.jexcel_editor');
            const isFormulaBarFocused = document.activeElement && document.activeElement.id === 'formula-input';
            const isNativeEditing = editor && editor.style.display !== 'none';
            
            if (!isFormulaBarFocused && !isNativeEditing) return;

            let currentValue = '';
            if (isFormulaBarFocused) {
                currentValue = formulaValue.value;
            } else if (isNativeEditing) {
                currentValue = editor.value;
            }

            if (currentValue && currentValue.match(/[=+\-*/(]$/)) {
                const td = e.target.closest('td[data-x]');
                if (td) {
                    e.stopPropagation();
                    e.preventDefault();

                    const x = td.getAttribute('data-x');
                    const y = td.getAttribute('data-y');
                    let cellRef = getCellName(x, y);

                    if (editStartSheetIndex.value !== -1 && editStartSheetIndex.value !== activeTabIndex.value) {
                        cellRef = sheets.value[activeTabIndex.value].name + '!' + cellRef;
                    }

                    if (isFormulaBarFocused) {
                        formulaValue.value += cellRef;
                        if (editStartSheetIndex.value !== -1) {
                            const targetInstance = sheets.value[editStartSheetIndex.value].instance;
                            const coords = getCellCoords(editStartCellName.value);
                            targetInstance.setValueFromCoords(coords[0], coords[1], formulaValue.value);
                        }
                    } else if (isNativeEditing) {
                        editor.value += cellRef;
                        formulaValue.value = editor.value;
                    }
                    return;
                }
                
                const tab = e.target.closest('.v-tab');
                if (tab) {
                    if (isNativeEditing) {
                        formulaValue.value = editor.value;
                        setTimeout(() => {
                            const fi = document.getElementById('formula-input');
                            if (fi) fi.focus();
                        }, 50);
                    }
                }
            }
        };

        const initSingleSheet = (sheetIndex, data = null) => {
            const el = document.getElementById('sheet-' + sheetIndex);
            if (!el) return;
            el.innerHTML = '';

            const options = {
                minDimensions: [26, 100],
                defaultColWidth: 100,
                tableOverflow: true,
                tableWidth: "100%",
                tableHeight: "100%",
                columnDrag: true,
                rowDrag: true,
                about: false,
                data: data,
                oneditionstart: (instance, cell, x, y) => {
                    editStartSheetIndex.value = activeTabIndex.value;
                    editStartCellName.value = getCellName(x, y);
                },
                onselection: (instance, x1, y1, x2, y2, origin) => {
                    const currentCellName = getCellName(x1, y1);
                    const activeInstance = instance.jexcel;
                    
                    const isFormulaBarFocused = document.activeElement && document.activeElement.id === 'formula-input';
                    const editor = document.querySelector('.jexcel_editor');
                    const isNativeEditing = editor && editor.style.display !== 'none';
                    
                    if (!isFormulaBarFocused && !isNativeEditing) {
                        selectedCellName.value = currentCellName;
                        editStartCellName.value = currentCellName;
                        editStartSheetIndex.value = activeTabIndex.value;
                        if(activeInstance) {
                            formulaValue.value = activeInstance.getValueFromCoords(x1, y1);
                            dataType.value = 'Genel';
                        }
                    }
                },
                onchange: (instance, cell, x, y, value) => {
                    const currentCellName = getCellName(x, y);
                    if (selectedCellName.value === currentCellName) {
                        const isFormulaBarFocused = document.activeElement && document.activeElement.id === 'formula-input';
                        if (!isFormulaBarFocused) {
                            formulaValue.value = value;
                        }
                    }
                    // Güncellemeler için diğer sekmeleri tazele
                    setTimeout(() => {
                        sheets.value.forEach(s => {
                            if (s.instance && s.instance !== instance.jexcel) {
                                if (typeof s.instance.refresh === 'function') s.instance.refresh();
                            }
                        });
                    }, 10);
                },
                updateTable: (instance, cell, col, row, val, label, cellName) => {
                    let rawData = null;
                    if (instance.jexcel.options && instance.jexcel.options.data && instance.jexcel.options.data[row]) {
                        rawData = instance.jexcel.options.data[row][col];
                    }
                    
                    if (typeof rawData === 'string' && rawData.startsWith('=')) {
                        if (rawData.includes('!')) {
                            let resolvedFormula = rawData.replace(/([a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ]+)!([A-Z]+[0-9]+)/ig, (match, sheetName, cellRef) => {
                                const targetSheet = sheets.value.find(s => s.name.toUpperCase() === sheetName.toUpperCase());
                                if (targetSheet && targetSheet.instance) {
                                    const coords = getCellCoords(cellRef);
                                    if (coords) {
                                        let targetVal = targetSheet.instance.getValueFromCoords(coords[0], coords[1]);
                                        if (targetVal !== '' && !isNaN(targetVal)) return Number(targetVal);
                                        if (!targetVal) return 0;
                                        return `"${targetVal}"`;
                                    }
                                }
                                return 0;
                            });
                            
                            try {
                                let computed;
                                if (typeof instance.jexcel.executeFormula === 'function') {
                                    computed = instance.jexcel.executeFormula(resolvedFormula, col, row);
                                } else {
                                    computed = eval(resolvedFormula.substring(1));
                                }
                                cell.innerHTML = computed;
                            } catch(e) {
                                cell.innerHTML = '#ERROR';
                            }
                        }
                    }
                }
            };

            sheets.value[sheetIndex].instance = window.jspreadsheet(el, options);
        };

        const initializeAllSheets = () => {
            setTimeout(() => {
                sheets.value.forEach((sheet, index) => {
                    initSingleSheet(index, sheet.data);
                });
            }, 100);
        };

        const addNewSheet = () => {
            const newIndex = sheets.value.length;
            sheets.value.push({ name: 'Sayfa' + (newIndex + 1), data: null, instance: null });
            setTimeout(() => {
                initSingleSheet(newIndex, null);
                activeTabIndex.value = newIndex;
            }, 100);
        };

        watch(activeTabIndex, (newVal) => {
            setTimeout(() => {
                if (sheets.value[newVal] && sheets.value[newVal].instance) {
                    if (typeof sheets.value[newVal].instance.refresh === 'function') {
                        sheets.value[newVal].instance.refresh();
                    }
                }
            }, 10);
        });

        onMounted(async () => {
            window.addEventListener('mousedown', handleMousedown, true);
            try {
                loadCss('https://jsuites.net/v4/jsuites.css');
                loadCss('https://bossanova.uk/jspreadsheet/v4/jexcel.css');
                
                await loadScript('https://jsuites.net/v4/jsuites.js');
                await loadScript('https://bossanova.uk/jspreadsheet/v4/jexcel.js');
                await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
                
                loading.value = false;
                initializeAllSheets();
            } catch (err) {
                console.error("Excel modülü yüklenemedi", err);
                loading.value = false;
            }
        });

        onUnmounted(() => {
            window.removeEventListener('mousedown', handleMousedown, true);
        });

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const data = evt.target.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });
                
                sheets.value = workbook.SheetNames.map(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    return { name: sheetName, data: jsonData, instance: null };
                });
                
                activeTabIndex.value = 0;
                initializeAllSheets();
            };
            reader.readAsBinaryString(file);
            e.target.value = '';
        };

        const exportExcel = () => {
            if (!window.XLSX) return;
            const wb = window.XLSX.utils.book_new();
            
            sheets.value.forEach(sheet => {
                if (sheet.instance) {
                    const data = sheet.instance.getData();
                    const ws = window.XLSX.utils.aoa_to_sheet(data);
                    window.XLSX.utils.book_append_sheet(wb, ws, sheet.name);
                }
            });
            window.XLSX.writeFile(wb, "Web_Excel_Export.xlsx");
        };

        return {
            fileInput, loading, selectedCellName, formulaValue, onFormulaChange, handleFileUpload, exportExcel,
            sheets, activeTabIndex, addNewSheet, applyFormat, applyDataType, fontSize, dataType, onFormulaFocus, applyFormula,
            editingSheetIndex, startEditingSheet, stopEditingSheet
        };