const fs = require('fs');
const file = 'server/utils/seed/i18n.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const newTranslations = {
  "appStudio.importConfirmTitle": { "en": "Import Confirmation", "tr": "İçe Aktarım Onayı" },
  "appStudio.importConfirmDesc1": { "en": "You are about to import the {app} package.", "tr": "Dikkat, {app} paketini içeri aktarmak üzeresiniz." },
  "appStudio.importConfirmDesc2": { "en": "How would you like to handle existing (conflicting) records in the database?", "tr": "Veritabanında zaten var olan (çakışan) kayıtlar için nasıl bir yol izlenmesini istersiniz?" },
  "appStudio.strategy.skip.title": { "en": "Keep Existing (Skip)", "tr": "Mevcutları Koru (Atla)" },
  "appStudio.strategy.skip.desc": { "en": "If a record with the same name/id exists in the database, it skips it. Only adds new ones.", "tr": "Veritabanında aynı ada/id'ye sahip bir kayıt varsa ona dokunmaz, atlar. Sadece sistemde olmayan yenileri ekler." },
  "appStudio.strategy.overwrite.title": { "en": "Overwrite (Critical)", "tr": "Üzerine Yaz (Tehlikeli)" },
  "appStudio.strategy.overwrite.desc": { "en": "Unconditionally overwrites conflicting existing records with the data in the package.", "tr": "Çakışan mevcut kayıtların içeriğini paketteki veriyle koşulsuz ezer." },
  "appStudio.strategy.newer.title": { "en": "Overwrite if Newer", "tr": "Daha Yeniyse Ez" },
  "appStudio.strategy.newer.desc": { "en": "Overwrites if the package data's update date is newer than the server's, otherwise skips.", "tr": "Paketteki verinin güncellenme tarihi sunucudakinden daha yeniyse üzerine yazar, aksi halde atlar." },
  "appStudio.strategy.abort.title": { "en": "Abort on Conflict (Rollback)", "tr": "Çakışmada İptal Et (Rollback)" },
  "appStudio.strategy.abort.desc": { "en": "If there is a conflict with even a single existing record, the entire operation is aborted to maintain safety.", "tr": "Sistemde var olan tek bir kayıtla bile çakışma yaşanırsa, güvenliği korumak için işlemi tamamen iptal eder (Rollback)." },
  "appStudio.confirmAndStart": { "en": "Confirm and Start", "tr": "Onayla ve Başlat" },
  "appStudio.importWarning": { "en": "Operation completed but some errors occurred. Please review the details.", "tr": "İşlem tamamlandı ancak bazı hatalar oluştu. Lütfen detayları inceleyin." },
  "appStudio.criticalImportError": { "en": "A critical error occurred during import.", "tr": "İçe aktarım sırasında kritik bir hata oluştu." }
};

Object.assign(data, newTranslations);

const sortedKeys = Object.keys(data).sort();
const sortedData = {};
for (const k of sortedKeys) {
  sortedData[k] = data[k];
}

fs.writeFileSync(file, JSON.stringify(sortedData, null, 2), 'utf8');
console.log('i18n seeded successfully');
