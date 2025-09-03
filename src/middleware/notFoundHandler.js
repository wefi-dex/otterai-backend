/**
 * 404 Not Found handler middleware
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
};

module.exports = { notFoundHandler };
