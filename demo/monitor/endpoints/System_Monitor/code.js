try {
  if (payload.method !== 'POST') {
    return { respond: true, status: 405, body: { success: false, error: 'Sadece POST desteklenir' } };
  }

  if (!payload.user || !payload.user.is_admin) {
    return { respond: true, status: 403, body: { success: false, error: 'Yetkisiz erişim.' } };
  }

  const os = require('os');
  const cp = require('child_process');

  const nets = os.networkInterfaces();
  const networks = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!net.internal && net.family === 'IPv4') {
        networks.push({ name: name, address: net.address, mac: net.mac });
      }
    }
  }

  const platform = os.platform();
  const type = os.type();
  const release = os.release();
  const arch = os.arch();

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Bilinmiyor';
  const cpuSpeed = cpus.length > 0 ? cpus[0].speed : 0;
  
  // SADECE GÜNCEL ANLIK CPU KULLANIMI HESAPLAMA
  let cpuPercent = 0;
  if (platform === 'win32') {
    try {
      const winCpuCmd = "powershell -NoProfile -Command \"Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average\"";
      cpuPercent = parseInt(cp.execSync(winCpuCmd, { timeout: 2000 }).toString().trim(), 10) || 0;
    } catch(e) {
      cpuPercent = 0;
    }
  } else {
    // Linux/Mac için anlık yükün yüzdeye çevrilmiş hali
    const load = os.loadavg()[0];
    cpuPercent = Math.min(Math.round((load / cpus.length) * 100), 100);
  }
  
  const totalmem = os.totalmem();
  const freemem = os.freemem();
  const processMem = process.memoryUsage();

  const data = {
    os: { platform, type, release, arch, hostname: os.hostname(), uptime: os.uptime() },
    cpu: {
      model: cpuModel,
      speed: cpuSpeed,
      cores: cpus.length,
      usage_percent: cpuPercent // Artık gereksiz diziler yok, tek bir anlık yüzde var
    },
    memory: {
      total: totalmem,
      free: freemem,
      used: totalmem - freemem,
      process_rss: processMem.rss,
      process_heapTotal: processMem.heapTotal,
      process_heapUsed: processMem.heapUsed
    },
    network: networks,
    nodejs: { version: process.version, uptime: process.uptime() },
    disk: []
  };

  try {
    const isWin = platform === 'win32';
    if (isWin) {
      const diskCmd = "powershell -NoProfile -Command \"Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='Free';e={[math]::Round($_.Free/1GB,2)}}, @{n='Used';e={[math]::Round($_.Used/1GB,2)}}, @{n='Total';e={[math]::Round(($_.Used+$_.Free)/1GB,2)}} | ConvertTo-Json\"";
      const diskOutput = cp.execSync(diskCmd, { timeout: 5000 }).toString().trim();
      let parsed = [];
      if (diskOutput) {
         const jsonParsed = JSON.parse(diskOutput);
         parsed = Array.isArray(jsonParsed) ? jsonParsed : [jsonParsed];
      }
      data.disk = parsed.map(d => ({
        name: d.Name + ':\\',
        total: (d.Total || 0) + ' GB',
        used: (d.Used || 0) + ' GB',
        free: (d.Free || 0) + ' GB',
        usage_percent: d.Total ? Math.round((d.Used / d.Total) * 100) : 0
      }));
    } else {
      const diskCmd = "df -k";
      const diskOutput = cp.execSync(diskCmd, { timeout: 5000 }).toString().trim();
      const lines = diskOutput.split('\n');
      data.disk = lines.slice(1).map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6 && parts[0].startsWith('/dev/')) {
          const totalGb = (parseInt(parts[1]) / 1024 / 1024).toFixed(2);
          const usedGb = (parseInt(parts[2]) / 1024 / 1024).toFixed(2);
          const freeGb = (parseInt(parts[3]) / 1024 / 1024).toFixed(2);
          return {
            name: parts[5],
            fs: parts[0],
            total: totalGb + ' GB',
            used: usedGb + ' GB',
            free: freeGb + ' GB',
            usage_percent: parseInt(parts[4].replace('%', '')) || 0
          };
        }
        return null;
      }).filter(Boolean);
    }
  } catch(e) {
    data.disk = [{ name: 'Hata', error: 'Disk bilgisi okunamadı: ' + e.message }];
  }

  return { respond: true, status: 200, body: { success: true, data: data } };
} catch (error) {
  return { respond: true, status: 500, body: { success: false, error: error.message || String(error) } };
}