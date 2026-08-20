try {
  const { roomId, password } = payload.body;
  if (!roomId) return { respond: true, status: 400, body: { error: 'roomId required' } };
  
  const pwdField = await sql`SELECT val_str FROM record_fields WHERE record_id = ${roomId} AND key = 'password'`;
  const hasPassword = pwdField.length > 0 && pwdField[0].val_str && pwdField[0].val_str !== '';

  if (!hasPassword) {
    return { respond: true, status: 200, body: { success: true } };
  }

  if (!password) {
    return { respond: true, status: 401, body: { error: 'Password required', requirePassword: true } };
  }

  const storedHash = pwdField[0].val_str;
  const isValid = bcrypt.compareSync(String(password), storedHash);

  if (!isValid) {
    return { respond: true, status: 401, body: { error: 'Invalid password', requirePassword: true } };
  }

  return { respond: true, status: 200, body: { success: true } };
} catch (e) {
  return { respond: true, status: 500, body: { error: e.message } };
}