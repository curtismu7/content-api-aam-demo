const express = require('express');
const catalog = require('./sample-data.json');

function createApp() {
  const app = express();

  app.get('/aam/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/aam/content', (req, res) => {
    res.json(catalog);
  });

  app.get('/aam/content/:id', (req, res) => {
    const item = catalog.find((entry) => entry.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(item);
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = process.env.PORT || 8080;
  createApp().listen(port, () => {
    console.log(`content-api listening on ${port}`);
  });
}
