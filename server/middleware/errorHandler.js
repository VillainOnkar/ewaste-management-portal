const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
