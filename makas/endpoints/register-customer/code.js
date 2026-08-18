if (payload.method === 'POST') {
  try {
    const body = payload.body;
    
    // 1. Rolü bul
    let roleId = null;
    let roleRes = await db`SELECT id FROM roles WHERE name = 'Makas Müşteri'`;
    if (roleRes && roleRes.length > 0) {
      roleId = roleRes[0].id;
    } else {
      return { respond: true, status: 500, body: { success: false, message: 'Rol bulunamadı. Lütfen sistem yöneticisine başvurun.' } };
    }

    // 2. Yeni User oluştur (Auth için)
    const passwordHash = bcrypt.hashSync(body.password, 10);
    
    let userId;
    try {
      const userRes = await db`INSERT INTO users (username, password_hash, role_id, is_admin) VALUES (${body.username}, ${passwordHash}, ${roleId}, 0) RETURNING id`;
      if (userRes && userRes.length > 0) {
        userId = userRes[0].id;
      } else {
        return { respond: true, status: 400, body: { success: false, message: 'Kullanıcı oluşturulamadı.' } };
      }
    } catch (e) {
      return { respond: true, status: 400, body: { success: false, message: 'Kullanıcı Eklerken Hata: ' + e.message } };
    }

    // 3. Customer kaydını ekle
    const customerData = {
      full_name: body.full_name,
      contact: body.contact,
      gender: body.gender
    };
    
    // Master tenant için özel durum
    const createRec = async (slug, payloadBody) => {
      if (context.tenantSlug === 'master') {
        return await recordManager.createRecord(context.tenantSlug, slug, payloadBody, null);
      }
      return await recordManager.createRecord(slug, payloadBody, null);
    };

    const newCustomer = await createRec('customer', {
      data: customerData
    });
    
    // 4. User - Customer İlişkisi
    await db`INSERT INTO user_records (user_id, record_id) VALUES (${userId}, ${newCustomer.id})`;

    return { respond: true, status: 200, body: { success: true, message: 'Müşteri hesabınız başarıyla oluşturuldu.' } };

  } catch (error) {
    return { respond: true, status: 500, body: { success: false, message: error.message || 'Kayıt sırasında bir hata oluştu.' } };
  }
}
