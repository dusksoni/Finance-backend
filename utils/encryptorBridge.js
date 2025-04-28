const { exec } = require("child_process");
const path = require("path");

const JAVA_PATH = process.env.JAVA_PATH || "java";
const JAR_PATH = process.env.JAVA_ENCRYPTOR_JAR || path.join(__dirname, "../../java-encryption/EncryptionService.jar");

async function encryptWithJava(plainJson, secretKey) {
  return new Promise((resolve, reject) => {
    // const base64Data = Buffer.from(plainJson).toString("base64"); // ⬅️ Encode to base64
    const command = `${JAVA_PATH} -cp "${JAR_PATH}" EncryptionService encrypt ${plainJson} ${secretKey}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Java Encrypt Error:", stderr);
        return reject(error);
      }

      resolve(stdout.trim());
    });
  });
}

async function decryptWithJava(encData, secretKey) {
  return new Promise((resolve, reject) => {
    const command = `${JAVA_PATH} -cp "${JAR_PATH}" EncryptionService decrypt ${encData} ${secretKey}`;
    console.log("Decrypt Command:", command);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Java Decrypt Error:", stderr);
        return reject(error);
      }
      console.log("Decrypted Data:", stdout.trim());
      resolve(stdout.trim());
    });
  });
}

module.exports = { encryptWithJava, decryptWithJava };
