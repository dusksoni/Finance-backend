const crypto = require("crypto");

function encrypt(plainText, password) {
  const iv = crypto.randomBytes(12); // IV_LENGTH_BYTE
  const salt = crypto.randomBytes(16); // SALT_LENGTH_BYTE

  const key = crypto.pbkdf2Sync(password, salt, 65536, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const resultBuffer = Buffer.concat([iv, salt, encrypted, authTag]);

  return resultBuffer.toString("base64");
}

function decrypt(base64CipherText, password) {
  const data = Buffer.from(base64CipherText, "base64");

  const iv = data.slice(0, 12);
  const salt = data.slice(12, 28);
  const ciphertext = data.slice(28, data.length - 16);
  const authTag = data.slice(data.length - 16);

  const key = crypto.pbkdf2Sync(password, salt, 65536, 32, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };
