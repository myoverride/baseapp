if (payload.method === 'POST') {
  try {
    const body = payload.body;
    
    // 1. Rolü bul
    let roleId = null;
    let roleRes = await db`SELECT id FROM roles WHERE name = 'Makas Yönetici'`;
    if (roleRes && roleRes.length > 0) {
      roleId = roleRes[0].id;
    }

    // 2. Yeni User oluştur (Auth için)
    const passwordHash = bcrypt.hashSync(body.admin_password, 10);
    
    let userId;
    try {
      const userRes = await db`INSERT INTO users (username, password_hash, role_id, is_admin) VALUES (${body.admin_username}, ${passwordHash}, ${roleId}, 0) RETURNING id`;
      if (userRes && userRes.length > 0) {
        userId = userRes[0].id;
      } else {
        return { respond: true, status: 400, body: { success: false, message: 'Kullanıcı oluşturulamadı.' } };
      }
    } catch (e) {
      return { respond: true, status: 400, body: { success: false, message: 'Kullanıcı Eklerken Hata: ' + e.message } };
    }

    // 2. Company kaydını ekle (approved: false)
    const companyData = {
      title: body.company_title,
      contact: body.company_contact,
      address: body.company_address,
      target: body.company_target,
      dayoff: body.company_dayoff,
      location: { latitude: 0, longitude: 0 },
      approved: false
    };
    
    // Master tenant için özel durum: ilk parametre tenantSlug olmalıdır.
    const createRec = async (slug, payloadBody) => {
      if (context.tenantSlug === 'master') {
        return await recordManager.createRecord(context.tenantSlug, slug, payloadBody, null);
      }
      return await recordManager.createRecord(slug, payloadBody, null);
    };

    const newCompany = await createRec('company', {
      data: companyData
    });
    
    // 3. Personnel (Yönetici) kaydını ekle (authorized: true)
    const personnelData = {
      full_name: body.admin_full_name,
      company: newCompany.id,
      work_start: "09:00",
      work_end: "18:00",
      gender: body.admin_gender,
      authorized: true
    };

    const newPersonnel = await createRec('personnel', {
      data: personnelData
    });

    // 4. User - Personnel İlişkisi
    await db`INSERT INTO user_records (user_id, record_id) VALUES (${userId}, ${newPersonnel.id})`;

    return { respond: true, status: 200, body: { success: true, message: 'İşletme ve yönetici hesabınız başarıyla oluşturuldu.' } };

  } catch (error) {
    return { respond: true, status: 500, body: { success: false, message: error.message || 'Kayıt sırasında bir hata oluştu.' } };
  }
}


