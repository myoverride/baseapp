try {
  const globalsRecs = await sql`SELECT key, value FROM globals WHERE key IN ('ai_api_key', 'ai_provider', 'ai_system_prompt')`;
  let apiKey = '';
  let aiProvider = 'gemini';
  let systemPrompt = "Sen profesyonel, net ve kısa konuşan bir dijital asistansın.";
  
  globalsRecs.forEach(r => {
    if (r.key === 'ai_api_key') apiKey = r.value;
    if (r.key === 'ai_provider') aiProvider = r.value;
    if (r.key === 'ai_system_prompt') systemPrompt = r.value;
  });

  if (!apiKey) {
    return { respond: true, status: 200, body: { success: false, message: "Lütfen önce Global Değişkenler (Globals) sekmesinden 'ai_api_key' değerini tanımlayın." } };
  }

  const [weatherRes, btcRes, quoteRes, exRes, newsRes] = await Promise.all([
    fetch('https://api.open-meteo.com/v1/forecast?latitude=41.1592&longitude=27.8000&current_weather=true').catch(() => null),
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT').catch(() => null),
    fetch('https://dummyjson.com/quotes/random').catch(() => null),
    fetch('https://api.exchangerate-api.com/v4/latest/USD').catch(() => null),
    fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.trthaber.com/manset_articles.rss').catch(() => null)
  ]);

  const weather = weatherRes ? await weatherRes.json().catch(()=>({})) : {};
  const btc = btcRes ? await btcRes.json().catch(()=>({})) : {};
  const quote = quoteRes ? await quoteRes.json().catch(()=>({})) : {};
  const ex = exRes ? await exRes.json().catch(()=>({})) : {};
  const news = newsRes ? await newsRes.json().catch(()=>({})) : {};

  const todayStr = new Date().toLocaleDateString('tr-TR');
  
  const temp = weather?.current_weather?.temperature || 'bilinmeyen';
  const price = btc?.price ? Math.round(btc.price) : 'bilinmeyen';
  const usd = ex?.rates?.TRY ? ex.rates.TRY.toFixed(2) : 'bilinmeyen';
  const eur = (ex?.rates?.TRY && ex?.rates?.EUR) ? (ex.rates.TRY / ex.rates.EUR).toFixed(2) : 'bilinmeyen';
  const qText = quote?.quote || 'Güzel bir gün!';
  
  let newsText = "Haber alınamadı.";
  if (news?.items && news.items.length > 0) {
    newsText = news.items.slice(0, 4).map((n, i) => `${i+1}. ${n.title}`).join('. ');
  }

  const userPrompt = `Bugün ${todayStr}. Sana iletilen güncel veriler: Çorlu hava durumu: ${temp} derece. Kripto: Bitcoin ${price} USD. Döviz: Dolar ${usd} TL, Euro ${eur} TL. Türkiye Gündemi (Haberler): ${newsText}. Lütfen bu verileri kullanarak sistem komutundaki (system prompt) kurallara BİREBİR uyarak bana bir brifing hazırla.`;

  let aiResponseText = "";

  if (aiProvider === 'openai') {
    const aiReq = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    const aiRes = await aiReq.json();
    if(aiRes.error) throw new Error(aiRes.error.message || JSON.stringify(aiRes.error));
    aiResponseText = aiRes.choices[0].message.content;
  } else {
    // Gemini 1.5 Flash Endpoint
    const aiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }]
      })
    });
    
    let aiRes;
    try {
      aiRes = await aiReq.json();
    } catch(e) {
      throw new Error("API Yanıtı JSON değil. Status: " + aiReq.status);
    }
    
    if (aiRes.error) {
      const apiErr = aiRes.error.message || JSON.stringify(aiRes.error);
      throw new Error("Gemini API Hatası: " + apiErr);
    }
    if (!aiRes.candidates || !aiRes.candidates[0] || !aiRes.candidates[0].content || !aiRes.candidates[0].content.parts) {
      throw new Error("Gemini format hatası. Gelen veri: " + JSON.stringify(aiRes));
    }
    
    aiResponseText = aiRes.candidates[0].content.parts[0].text;
  }

  const entReport = await sql`SELECT id FROM entities WHERE slug = 'ai_reports'`;
  if (entReport.length === 0) throw new Error("Yapay Zeka Günlük Raporları (ai_reports) tablosu bulunamadı.");
  
  const insertRec = await sql`INSERT INTO records (entity_id) VALUES (${entReport[0].id}) RETURNING id`;
  const recId = insertRec[0].id;
  
  const dateKey = new Date().toISOString().split('T')[0];
  
  await Promise.all([
    sql`INSERT INTO record_fields (record_id, key, val_str) VALUES (${recId}, 'date', ${dateKey})`,
    sql`INSERT INTO record_fields (record_id, key, val_str) VALUES (${recId}, 'report_text', ${aiResponseText})`,
    sql`INSERT INTO record_fields (record_id, key, val_bool) VALUES (${recId}, 'is_read', false)`
  ]);

  return {
    respond: true,
    status: 200,
    body: { success: true, report: aiResponseText }
  };

} catch (error) {
  let errMsg = "Bilinmeyen Hata";
  if (error && error.message) errMsg = error.message;
  else if (typeof error === 'string') errMsg = error;
  else errMsg = JSON.stringify(error);
  return { respond: true, status: 200, body: { success: false, message: errMsg } };
}