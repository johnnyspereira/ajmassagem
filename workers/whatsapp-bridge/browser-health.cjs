function isBrowserSessionError(error) {
  return /detached frame|frame.*detached|execution context was destroyed|target closed|session closed|connection closed|browser.*disconnected/i.test(error?.message || String(error || ''));
}
module.exports = { isBrowserSessionError };
