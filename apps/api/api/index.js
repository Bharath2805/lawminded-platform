let cachedHandler = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const { createConfiguredNestApp } = require('../dist/app.factory');
  const app = await createConfiguredNestApp();
  await app.init();

  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();

  cachedHandler = (req, res) => instance(req, res);
  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
