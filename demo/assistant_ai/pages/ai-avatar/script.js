const todayReport = ref(null);
    const isSpeaking = ref(false);
    const loadingReport = ref(false);
    
    let synth = window.speechSynthesis;
    let utterance = null;

    const loadTodayReport = async () => {
       loadingReport.value = true;
       const today = new Date().toISOString().split('T')[0];
       try {
           const res = await $fetch(`/api/admin/records/ai_reports?limit=1&sort=-id`);
           const recs = res.records || [];
           if(recs.length > 0 && recs[0].date === today) {
              todayReport.value = recs[0];
           } else {
              todayReport.value = null;
           }
       } catch(e) {}
       loadingReport.value = false;
    };

    const generateReport = async () => {
       loadingReport.value = true;
       try {
           const res = await $fetch('/api/custom/ai-brain');
           if(res.success) {
              await loadTodayReport();
              if(todayReport.value) toggleSpeech();
           } else {
              alert("Yapay Zeka Hatası: " + res.message);
           }
       } catch(e) { alert("Hata: " + e.message); }
       loadingReport.value = false;
    };

    const cleanTextForSpeech = (text) => {
        // Emoji ve markdown temizliği
        return text.replace(/[*_#]/g, '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    };

    const toggleSpeech = () => {
       if(!todayReport.value) return;
       
       if(synth.speaking || isSpeaking.value) {
          synth.cancel();
          isSpeaking.value = false;
          return;
       }
       
       const textToRead = cleanTextForSpeech(todayReport.value.report_text);
       utterance = new SpeechSynthesisUtterance(textToRead);
       utterance.lang = 'tr-TR';
       
       utterance.onstart = () => isSpeaking.value = true;
       utterance.onend = () => {
           isSpeaking.value = false;
           if(!todayReport.value.is_read) {
              try {
                  $fetch(`/api/admin/records/ai_reports/${todayReport.value.id}`, {
                     method: 'PUT',
                     body: { data: { is_read: true, date: todayReport.value.date, report_text: todayReport.value.report_text } }
                  });
                  todayReport.value.is_read = true;
              } catch(e){}
           }
       };
       
       const voices = synth.getVoices();
       let trVoice = voices.find(v => v.lang.includes('tr') && v.name.toLowerCase().includes('natural'));
       if (!trVoice) trVoice = voices.find(v => v.lang.includes('tr') && v.name.includes('Emel'));
       if (!trVoice) trVoice = voices.find(v => v.lang.includes('tr') && v.name.includes('Tolga'));
       if (!trVoice) trVoice = voices.find(v => v.lang.includes('tr') && v.name.includes('Microsoft'));
       if (!trVoice) trVoice = voices.find(v => v.lang.includes('tr') && v.name.includes('Google'));
       if (!trVoice) trVoice = voices.find(v => v.lang.includes('tr'));
       
       if(trVoice) utterance.voice = trVoice;
       synth.speak(utterance);
    };

    onMounted(async () => {
       await loadTodayReport();
       
       if (speechSynthesis.onvoiceschanged !== undefined) {
          speechSynthesis.onvoiceschanged = () => {};
       }
    });

    onUnmounted(() => {
       if(synth.speaking) synth.cancel();
    });

    return { 
      todayReport, isSpeaking, loadingReport,
      generateReport, toggleSpeech
    };