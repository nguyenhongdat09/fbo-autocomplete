const { PreviewFormCommand } = require('./PreviewFormCommand');

function registerPreviewForm(context) {
  const cmd = new PreviewFormCommand(context);
  cmd.register();
}

module.exports = { registerPreviewForm };
