const cloudinary = require("../middleware/cloudinaryconfig");
const multer = require("multer");
const { Buffer } = require("buffer");

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary uploader
async function handleUpload(file) {
  const result = await cloudinary.uploader.upload(file, {
    resource_type: "auto", // supports images, videos, PDFs, etc.
    folder: "kushal_finance",
  });
  return result;
}

async function removeImage(publicId) {
  const result = await cloudinary.uploader.destroy(publicId);
  return result;
}

exports.uploadMiddleware = upload.single("image");

exports.uploadFile = async (req, res) => {
    try {
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
    
        const cldRes = await handleUpload(dataURI); // Cloudinary upload
    
        const fileType = cldRes.format; // Extract file format (e.g., 'pdf', 'jpg', etc.)
    
        console.log(cldRes)

        res.json({
          status: 200,
          data: {
            secure_url: cldRes.secure_url,
            public_id: cldRes.public_id,
            resource_type: cldRes.resource_type,
            format: fileType, // 👈 This is what you want
          },
        });
      } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Something went wrong", status: 500 });
      }
};

exports.deleteFile = async (req, res) => {
  try {
    const { public_id } = req.body;

    if (!public_id) {
      return res.status(400).json({ error: "No public_id provided", status: 400 });
    }

    const result = await removeImage(public_id);

    if (result.result === "ok") {
      return res.json({ message: "File successfully removed", status: 200 });
    } else {
      return res.status(500).json({ error: "Failed to remove file", status: 500 });
    }
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Something went wrong", status: 500 });
  }
};
