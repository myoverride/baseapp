import json
import os

filepath = r'C:\Users\murat\Desktop\iiotplatform\demo\override_app.json'

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

endpoints = data.get('components', {}).get('endpoints', [])
for ep in endpoints:
    if ep.get('name') in ['override-contact-form', 'override-contact-api']:
        code = ep.get('code', '')
        
        # Replace mail.send and email.send with sendEmail
        # User auto-reply:
        code = code.replace("if (typeof mail !== 'undefined') mail.send", "try { sendEmail")
        code = code.replace("else if (typeof email !== 'undefined') email.send({ to: body.email, subject: 'İletişim Talebiniz Alındı', html: userMailHtml });", " } catch(ex) { console.error('Auto-reply mail error:', ex.message); }")
        
        # Admin notification:
        code = code.replace("try { if(typeof mail !== 'undefined') mail.send({ to: adminEmail, subject: 'Yeni İletişim Mesajı', html: mailHtml }); } catch(e){}", "try { sendEmail({ to: adminEmail, subject: 'Yeni İletişim Mesajı', html: mailHtml }); } catch(e){ console.error('Admin mail error:', e.message); }")
        code = code.replace("try { if(typeof email !== 'undefined') email.send({ to: adminEmail, subject: 'Yeni İletişim Mesajı', html: mailHtml }); } catch(e){}", "")
        
        # Replace admin_email with EMAIL_FROM (actually the user said they fixed it, but I will make sure it is EMAIL_FROM)
        code = code.replace("'admin_email'", "'EMAIL_FROM'")
        code = code.replace("'email_from'", "'EMAIL_FROM'")
        
        ep['code'] = code
        print(f"Patched {ep['name']}")

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done")
