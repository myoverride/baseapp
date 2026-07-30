import json

filepath = r'C:\Users\murat\Desktop\iiotplatform\demo\override_app.json'

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

pages = data.get('components', {}).get('pages', [])
for page in pages:
    if page.get('route_pattern') == '/admin/override/inbox':
        script = page.get('script_content', '')
        
        # We replace the mapping logic
        bad_logic = """         contactForms.value = data.data.map(item => {
            const fields = item.fields || {};
            // handle both array of fields and object fields depending on BaseApp RecordManager structure
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
         });"""
         
        good_logic = """         contactForms.value = data.data.map(item => {
            return {
               id: item.id,
               created_at: item.created_at,
               name: item.name || '',
               email: item.email || '',
               message: item.message || '',
               status: item.status || 'new'
            };
         });"""
         
        script = script.replace(bad_logic, good_logic)
        
        # Wait, the previous bad logic I generated had comments, I should just use replace on a smaller snippet or fallback if not found.
        if bad_logic not in script:
            print("Exact bad_logic string not found. Trying flexible replace...")
            start_marker = "contactForms.value = data.data.map(item => {"
            end_marker = "});\n      }"
            start_idx = script.find(start_marker)
            end_idx = script.find(end_marker, start_idx)
            if start_idx != -1 and end_idx != -1:
                script = script[:start_idx] + good_logic + script[end_idx + 3:]
                print("Replaced using flexible markers.")
            else:
                print("Could not find markers at all.")
        else:
            script = script.replace(bad_logic, good_logic)
            print("Replaced exact bad_logic.")

        page['script_content'] = script

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done")
