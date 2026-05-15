const cloudinary = require("../middleware/cloudinaryconfig");
const multer = require("multer");
const streamifier = require("streamifier");

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

exports.uploadMiddleware = upload.single("image");

const buildUploadOptions = (file) => {
  const options = {
    resource_type: "auto",
    folder: "nbfc_finance",
  };

  if (!file) {
    return options;
  }

  const originalName = (file.originalname || "").toLowerCase();
  const isPdf =
    file.mimetype === "application/pdf" || originalName.endsWith(".pdf");

  if (isPdf) {
    return {
      ...options,
      resource_type: "raw",
      async: true, // Cloudinary requires async transformations for PDF outputs
    };
  }

  return options;
};

function streamUpload(req) {
  const uploadOptions = buildUploadOptions(req.file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: "nbfc_finance",
      },
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(req.file.buffer).pipe(stream);
  });
}

async function removeImage(publicId) {
  const result = await cloudinary.uploader.destroy(publicId);
  return result;
}

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const result = await streamUpload(req);

    res.json({
      status: 200,
      data: {
        secure_url: result.secure_url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        format: result.format,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed", message: err });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { public_id } = req.body;

    if (!public_id) {
      return res
        .status(400)
        .json({ error: "No public_id provided", status: 400 });
    }

    const result = await removeImage(public_id);

    if (result.result === "ok") {
      return res.json({ message: "File successfully removed", status: 200 });
    } else {
      return res
        .status(500)
        .json({ error: "Failed to remove file", status: 500 });
    }
  } catch (err) {
    console.error("Delete Error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong", status: 500, message: err });
  }
};
