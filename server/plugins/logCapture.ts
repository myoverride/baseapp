import fs from 'node:fs';

export default defineNitroPlugin((nitroApp) => {
  const originalLog = console.log;
  console.log = function(...args) {
    try {
      fs.appendFileSync('c:/Users/murat/Desktop/iiotplatform/scratch_console.log', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
    } catch(e) {}
    originalLog.apply(console, args);
  };
  
  const originalError = console.error;
  console.error = function(...args) {
    try {
      fs.appendFileSync('c:/Users/murat/Desktop/iiotplatform/scratch_console.log', '[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
    } catch(e) {}
    originalError.apply(console, args);
  };
});
