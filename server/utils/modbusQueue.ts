import ModbusRTU from 'modbus-serial';

interface ModbusTask {
  type: 'read' | 'write';
  ip: string;
  port: number;
  unitId: number;
  // Read params
  startAddress?: number;
  length?: number;
  registerType?: 'holding' | 'input' | 'coil' | 'discrete';
  // Write params
  address?: number;
  value?: number;
  
  dataType: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

class ModbusConnectionManager {
  private client: ModbusRTU | null = null;
  private queue: ModbusTask[] = [];
  private isProcessing = false;
  private ip: string;
  private port: number;
  private lastActive: number = Date.now();
  private idleTimeout: NodeJS.Timeout | null = null;

  constructor(ip: string, port: number) {
    this.ip = ip;
    this.port = port;
  }

  public addTask(task: ModbusTask) {
    if (this.queue.length > 50) {
      task.reject(new Error('error.modbusQueueFull'));
      return;
    }
    
    this.queue.push(task);
    this.lastActive = Date.now();
    this.processQueue();
    this.resetIdleTimeout();
  }

  private resetIdleTimeout() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    import('./globalsManager').then(async ({ globals }) => {
      const idleMs = parseInt(await globals.get('master', 'MODBUS_IDLE_TIMEOUT_MS', false, '10000')) || 10000;
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      this.idleTimeout = setTimeout(() => {
        this.closeConnection();
      }, idleMs);
    });
  }

  private closeConnection() {
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
    // RAM Sızıntısını önlemek için nesneyi havuzdan sil (Memory Leak Fix)
    connectionPool.delete(`${this.ip}:${this.port}`);
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    try {
      const { globals } = await import('./globalsManager');
      const timeoutMs = parseInt(await globals.get('master', 'MODBUS_RESPONSE_TIMEOUT_MS', false, '3000')) || 3000;
      const cooldownMs = parseInt(await globals.get('master', 'MODBUS_COOLDOWN_MS', false, '50')) || 50;

      if (!this.client) {
        this.client = new ModbusRTU();
        await this.client.connectTCP(this.ip, { port: this.port });
        this.client.setTimeout(timeoutMs);
      }

      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) continue;

        try {
          this.client.setID(task.unitId);
          
          if (task.type === 'read') {
            let data;
            if (task.registerType === 'input') {
              data = await this.client.readInputRegisters(task.startAddress!, task.length!);
            } else if (task.registerType === 'coil') {
              data = await this.client.readCoils(task.startAddress!, task.length!);
            } else if (task.registerType === 'discrete') {
              data = await this.client.readDiscreteInputs(task.startAddress!, task.length!);
            } else {
              data = await this.client.readHoldingRegisters(task.startAddress!, task.length!);
            }

            if (task.dataType === 'float32' && data.buffer && data.buffer.length >= 4) {
              task.resolve(data.buffer.readFloatBE(0));
            } else if (task.dataType === 'uint32' && data.buffer && data.buffer.length >= 4) {
              task.resolve(data.buffer.readUInt32BE(0));
            } else {
              task.resolve(data.data);
            }
          } 
          else if (task.type === 'write') {
            let res;
            if (task.dataType === 'coil') {
               res = await this.client.writeCoil(task.address!, !!task.value);
            } else if (task.dataType === 'uint16') {
               res = await this.client.writeRegister(task.address!, task.value!);
            } else if (task.dataType === 'uint32') {
               const buf = Buffer.alloc(4);
               buf.writeUInt32BE(task.value!, 0);
               res = await this.client.writeRegisters(task.address!, [buf.readUInt16BE(0), buf.readUInt16BE(2)]);
            } else if (task.dataType === 'float32') {
               const buf = Buffer.alloc(4);
               buf.writeFloatBE(task.value!, 0);
               res = await this.client.writeRegisters(task.address!, [buf.readUInt16BE(0), buf.readUInt16BE(2)]);
            } else {
               res = await this.client.writeRegister(task.address!, task.value!);
            }
            task.resolve(res);
          }
          
          // Küçük bir bekleme (cihazların nefes alması için)
          await new Promise(r => setTimeout(r, cooldownMs));
        } catch (taskErr) {
          task.reject(taskErr);
          // Hata durumunda bağlantıyı kapatıp döngüden çıkıyoruz
          this.closeConnection();
          // Kuyruğu kitlememek (DDoS etkisini önlemek) için asenkron bir zamanlayıcı (Backoff) ile süreci devrediyoruz
          this.isProcessing = false;
          setTimeout(() => {
            this.processQueue();
          }, 1000);
          return; // Mevcut döngüyü sonlandır
        }
      }
    } catch (connectionErr) {
      // Bağlantı hiç kurulamadıysa tüm kuyruğu reject et
      while (this.queue.length > 0) {
        const t = this.queue.shift();
        t?.reject(connectionErr);
      }
      this.closeConnection();
    } finally {
      this.isProcessing = false;
      this.resetIdleTimeout();
    }
  }
}

const connectionPool = new Map<string, ModbusConnectionManager>();

function getConnectionManager(ip: string, port: number) {
  const key = `${ip}:${port}`;
  if (!connectionPool.has(key)) {
    connectionPool.set(key, new ModbusConnectionManager(ip, port));
  }
  return connectionPool.get(key)!;
}

export function queueModbusRead(ip: string, port: number, unitId: number, startAddress: number, length: number, type: 'holding' | 'input' | 'coil' | 'discrete' = 'holding', dataType: string = 'uint16'): Promise<any> {
  return new Promise((resolve, reject) => {
    const manager = getConnectionManager(ip, port);
    manager.addTask({
      type: 'read',
      ip, port, unitId, startAddress, length, registerType: type, dataType, resolve, reject
    });
  });
}

export function queueModbusWrite(ip: string, port: number, unitId: number, address: number, value: number, dataType: string = 'uint16'): Promise<any> {
  return new Promise((resolve, reject) => {
    const manager = getConnectionManager(ip, port);
    manager.addTask({
      type: 'write',
      ip, port, unitId, address, value, dataType, resolve, reject
    });
  });
}
