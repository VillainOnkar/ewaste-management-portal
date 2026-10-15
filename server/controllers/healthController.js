const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'E-Waste Management Portal API is running',
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  getHealth,
};
