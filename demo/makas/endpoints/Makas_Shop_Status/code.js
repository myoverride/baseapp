if (payload.method === 'GET') {
  try {
    const userId = context.userId;
    if (!userId) {
      return { respond: true, status: 200, body: { success: false, loggedIn: false, message: 'Yetkisiz erişim.' } };
    }

    // Kullanıcıya ait personnel kaydını bul (recordManager yerine doğrudan SQL ile eşleşmeyi arayalım)
    // Personnel entity_id'si 'personnel'
    // Sadece record_id'yi bulalım
    const personnelQuery = await db`
      SELECT r.id 
      FROM user_records ur 
      JOIN records r ON ur.record_id = r.id
      JOIN entities e ON r.entity_id = e.id
      WHERE ur.user_id = ${userId} AND e.slug = 'personnel'
      LIMIT 1
    `;

    if (!personnelQuery || personnelQuery.length === 0) {
      // Login başarılı ama personeli yok
      return { respond: true, status: 200, body: { success: true, hasPersonnel: false, message: 'Personel kaydı bulunamadı.' } };
    }

    const getRec = async (slug, id) => {
      if (context.tenantSlug === 'master') {
        return await recordManager.getRecord(context.tenantSlug, slug, id);
      }
      return await recordManager.getRecord(slug, id);
    };

    const personnelData = await getRec('personnel', personnelQuery[0].id);
    const companyId = personnelData?.company;

    if (!companyId) {
      return { respond: true, status: 200, body: { success: true, hasPersonnel: true, hasCompany: false, message: 'İşletme kaydı bulunamadı.', personnel: personnelData } };
    }



    const companyData = await getRec('company', companyId);

    return { 
      respond: true, 
      status: 200, 
      body: { 
        success: true, 
        personnel: { id: personnelQuery[0].id, ...personnelData },
        company: companyData 
      } 
    };

  } catch (error) {
    return { respond: true, status: 500, body: { success: false, message: error.message || 'Sunucu hatası' } };
  }
}

// Update (Yönetme) İşlemi İçin PUT Modu
if (payload.method === 'PUT') {
  try {
    const userId = context.userId;
    const updateData = payload.body;
    
    if (!userId) {
      return { respond: true, status: 200, body: { success: false, loggedIn: false, message: 'Yetkisiz erişim.' } };
    }

    // Önce yetkisini doğrula (şirket ID'sini bul)
    const personnelQuery = await db`
      SELECT r.id 
      FROM user_records ur 
      JOIN records r ON ur.record_id = r.id
      JOIN entities e ON r.entity_id = e.id
      WHERE ur.user_id = ${userId} AND e.slug = 'personnel'
      LIMIT 1
    `;
    
    if (!personnelQuery || personnelQuery.length === 0) {
      return { respond: true, status: 403, body: { success: false, message: 'Yetkiniz yok.' } };
    }
    
    const getRec = async (slug, id) => {
      if (context.tenantSlug === 'master') {
        return await recordManager.getRecord(context.tenantSlug, slug, id);
      }
      return await recordManager.getRecord(slug, id);
    };

    const personnelData = await getRec('personnel', personnelQuery[0].id);
    const companyId = personnelData?.company;
    
    // Şirket bilgisini güncelle (updateRecord kullanımı)
    const updateRec = async (slug, id, body) => {
      if (context.tenantSlug === 'master') {
        return await recordManager.updateRecord(context.tenantSlug, slug, id, body, userId);
      }
      return await recordManager.updateRecord(slug, id, body, userId);
    };

    const updatedCompany = await updateRec('company', companyId, { data: updateData });

    return { respond: true, status: 200, body: { success: true, message: 'İşletme bilgileri güncellendi.', company: updatedCompany } };
  } catch (error) {
    return { respond: true, status: 500, body: { success: false, message: error.message || 'Güncelleme hatası' } };
  }
}
