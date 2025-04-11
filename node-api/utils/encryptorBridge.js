// node-api/utils/encryptorBridge.js
const { exec } = require("child_process");
const path = require("path");

const JAVA_PATH = process.env.JAVA_PATH || "java";
const JAR_PATH = process.env.JAVA_JAR_PATH || path.join(__dirname, "../../java-encryption/encryptor.jar");
const SECRET_KEY = process.env.SECRET_KEY;

function encryptWithJava(plainJson) {
  return new Promise((resolve, reject) => {
    const command = `${JAVA_PATH} -jar "${JAR_PATH}" '${plainJson}' '${SECRET_KEY}'`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Java encryption failed:", stderr);
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

module.exports = { encryptWithJava };
