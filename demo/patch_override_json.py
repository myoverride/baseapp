import json
import os

filepath = r'C:\Users\murat\Desktop\iiotplatform\demo\override_app.json'

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

endpoints = data.get('components', {}).get('endpoints', [])
for ep in endpoints:
    if ep.get('name') in ['override-contact-form', 'override-contact-api']:
        code = ep.get('code', '')
        if 'Talebinizi aldık' not in code:
            parts = code.split('const adminEmailRow =')
            if len(parts) == 2:
                auto_reply_logic = """
   // Send auto-reply to the user
   try {
       const userMailHtml = `<p>Merhaba ${body.name},</p><p>Talebinizi başarıyla aldık. En kısa sürede sizinle iletişime geçeceğiz.</p><p>Saygılarımızla,</p>`;
       if (typeof mail !== 'undefined') mail.send({ to: body.email, subject: 'İletişim Talebiniz Alındı', html: userMailHtml });
       else if (typeof email !== 'undefined') email.send({ to: body.email, subject: 'İletişim Talebiniz Alındı', html: userMailHtml });
   } catch(e) {}
   
   const adminEmailRow ="""
                new_code = parts[0] + auto_reply_logic + parts[1]
                ep['code'] = new_code
                print(f"Patched auto-reply in {ep['name']}")

pages = data.get('components', {}).get('pages', [])
for page in pages:
    if page.get('route_pattern') == '/admin/override/inbox':
        template = page.get('template_string', '')
        if '<v-tabs' not in template:
            card_start = template.find('<v-card class="rounded-xl')
            if card_start != -1:
                prefix = template[:card_start]
                card_html = template[card_start:template.rfind('</v-card>') + 9]
                suffix = template[template.rfind('</v-card>') + 9:]
                
                tabs_html = """
  <v-tabs v-model="tab" color="success" class="mb-4">
    <v-tab value="chat"><v-icon start>mdi-forum</v-icon>Canlı Destek</v-tab>
    <v-tab value="forms"><v-icon start>mdi-email</v-icon>İletişim Formları</v-tab>
  </v-tabs>
  <v-window v-model="tab" style="overflow: visible;">
    <v-window-item value="chat">
      """ + card_html + """
    </v-window-item>
    <v-window-item value="forms">
      <v-card class="rounded-xl elevation-3 border">
         <v-toolbar color="primary" elevation="0" density="compact" class="px-2">
            <v-icon class="mr-2">mdi-email-multiple</v-icon>
            <v-toolbar-title class="text-subtitle-1 font-weight-bold text-white">Gelen İletişim Formları</v-toolbar-title>
         </v-toolbar>
         <v-data-table
            :headers="headers"
            :items="contactForms"
            :items-per-page="10"
            class="bg-white"
            hover
         >
            <template v-slot:item.created_at="{ item }">
               {{ new Date(item.created_at).toLocaleString('tr-TR') }}
            </template>
            <template v-slot:item.status="{ item }">
               <v-chip :color="item.status === 'new' ? 'success' : 'grey'" size="small">
                  {{ item.status === 'new' ? 'Yeni' : item.status }}
               </v-chip>
            </template>
            <template v-slot:no-data>
               <div class="pa-4 text-center text-grey">Henüz iletişim mesajı yok.</div>
            </template>
         </v-data-table>
      </v-card>
    </v-window-item>
  </v-window>"""
                page['template_string'] = prefix + tabs_html + suffix
                print("Patched template_string for inbox")

        script = page.get('script_content', '')
        if 'const tab = ref' not in script:
            script = "const tab = ref('chat');\n" + script
            
            fetch_logic = """
const contactForms = ref([]);
const headers = [
  { title: 'Tarih', key: 'created_at', width: '15%' },
  { title: 'İsim', key: 'name', width: '20%' },
  { title: 'E-Posta', key: 'email', width: '20%' },
  { title: 'Mesaj', key: 'message', width: '35%' },
  { title: 'Durum', key: 'status', width: '10%' }
];
const fetchContacts = async () => {
   try {
      const res = await fetch('/api/custom/admin-contacts');
      const data = await res.json();
      if(data.data) {
         contactForms.value = data.data.map(item => {
            const fields = item.fields || {};
            let name='', email='', message='', status='new';
            if(Array.isArray(fields)) {
                fields.forEach(f => {
                   if(f.key==='name') name = f.val_str;
                   if(f.key==='email') email = f.val_str;
                   if(f.key==='message') message = f.val_str;
                   if(f.key==='status') status = f.val_str;
                });
            } else {
                name = fields.name || '';
                email = fields.email || '';
                message = fields.message || '';
                status = fields.status || 'new';
            }
            return {
               id: item.id,
               created_at: item.created_at,
               name, email, message, status
            };
         });
      }
   } catch(e) {}
};
"""
            script = script.replace('onMounted(() => {', fetch_logic + '\nonMounted(() => {')
            script = script.replace('connectNotify();', 'connectNotify();\n  fetchContacts();')
            script = script.replace('return {', 'return { tab, contactForms, headers, fetchContacts, ')
            
            page['script_content'] = script
            print("Patched script_content for inbox")

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done")
