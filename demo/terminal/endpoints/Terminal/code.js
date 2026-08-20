try {
  if (payload.method !== 'POST') {
    return { respond: true, status: 200, body: { success: false, error: 'Sadece POST desteklenir' } };
  }

  if (!payload.user || !payload.user.is_admin) {
    return { respond: true, status: 403, body: { error: 'Yetkisiz erişim. Terminali yalnızca adminler kullanabilir.' } };
  }
  
  const { command } = payload.body || {};
  if (!command) return { respond: true, status: 200, body: { success: false, error: 'Komut belirtilmedi.' } };

  let cp;
  try {
    cp = require('child_process');
  } catch (e) {
    return { respond: true, status: 200, body: { success: false, error: 'Sunucuda child_process modülüne erişim izni yok.' } };
  }

  if (!process.__term_procs) {
    process.__term_procs = {};
  }
  
  if (command === '^C' || command === 'kill') {
    const pids = Object.keys(process.__term_procs);
    let killedCount = 0;
    
    for (const pid of pids) {
      try {
        const isWin = typeof process !== 'undefined' && process.platform === 'win32';
        if (isWin) {
          cp.execSync(`taskkill /PID ${pid} /T /F`);
        } else {
          process.kill(pid, 'SIGKILL');
        }
        killedCount++;
      } catch (e) { } 
      delete process.__term_procs[pid];
    }
    
    return { respond: true, status: 200, body: { success: true, stdout: `^C Sinyali alındı. ${killedCount} arka plan işlemi başarıyla sonlandırıldı.` } };
  }
  
  return await new Promise((resolve) => {
    try {
      const execOpts = { 
        windowsHide: true,
        env: Object.assign({}, process.env, { FORCE_COLOR: '1' })
      };

      const child = cp.exec(command, execOpts, (error, stdout, stderr) => {
        if (child && child.pid && process.__term_procs[child.pid]) {
          delete process.__term_procs[child.pid];
        }
        
        if (error) {
          const errMsg = error.message || String(error);
          if (error.killed || error.signal === 'SIGKILL' || error.signal === 'SIGTERM' || errMsg.includes('taskkill')) {
             resolve({ respond: true, status: 200, body: { success: true, stdout: (stdout || '') + '\n[İşlem Kullanıcı Tarafından Durduruldu]', stderr: stderr || '' } });
          } else {
             resolve({ respond: true, status: 200, body: { success: false, error: errMsg, stdout: stdout || '', stderr: stderr || '' } });
          }
        } else {
          resolve({ respond: true, status: 200, body: { success: true, stdout: stdout || '', stderr: stderr || '' } });
        }
      });
      
      if (child && child.pid) {
        process.__term_procs[child.pid] = child;
      } else {
        resolve({ respond: true, status: 200, body: { success: false, error: 'Sistem bu işlem için bir PID atayamadı.' } });
      }
      
    } catch (err) {
      resolve({ respond: true, status: 200, body: { success: false, error: err.message || String(err) } });
    }
  });

} catch (globalError) {
  return { 
    respond: true, 
    status: 200, 
    body: { success: false, error: 'Sistemsel Hata: ' + (globalError.message || String(globalError)) } 
  };
}