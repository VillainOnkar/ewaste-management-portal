const express = require('express');
const cors = require('cors');
const path = require('path');

const { port } = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const adminRoutes = require('./routes/adminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', healthRoutes);
app.use('/api', inviteRoutes);
app.use('/api', adminRoutes);
app.use('/api', customerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

module.exports = app;
