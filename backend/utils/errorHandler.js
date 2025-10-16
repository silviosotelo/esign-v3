// utils/errorHandler.js
exports.handleServiceError = (error, res) => {
    const status = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, error: message });
  };